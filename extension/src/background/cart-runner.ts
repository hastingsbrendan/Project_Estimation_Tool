import type {
  Candidate,
  CartPayload,
  Material,
  MatchResult,
  AlternativeRanking,
  RunItem,
  RunItemStatus,
} from "../shared/types"

/**
 * Cart-builder orchestration.
 *
 *   1. Fetch the cart-payload via the bridge tab (cookies travel there).
 *   2. Open a HD tab.
 *   3. For each material: tell the driver to drive it. The driver returns
 *      a final RunItemStatus per material; on navigation the driver
 *      returns "searching" and the worker re-issues "drive-material"
 *      after the new page settles.
 *
 *   The orchestration also relays the driver's match-material /
 *   find-alternative requests back through the bridge tab so the
 *   contractor-app's session cookie travels with the fetch.
 */

type RunMeta = {
  runId: string
  projectId: string
  appOrigin: string
  sourceTabId: number
  hdTabId?: number
  startedAt: number
}

type RunState = {
  meta: RunMeta
  payload: CartPayload | null
  items: RunItem[]
  phase: "starting" | "store-select" | "running" | "done" | "error"
  error?: string
}

function newRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

const RUN_KEY_PREFIX = "run:"

async function saveRun(state: RunState): Promise<void> {
  await chrome.storage.session.set({
    [`${RUN_KEY_PREFIX}${state.meta.runId}`]: state,
  })
}

export async function loadRun(runId: string): Promise<RunState | null> {
  const key = `${RUN_KEY_PREFIX}${runId}`
  const got = await chrome.storage.session.get(key)
  return (got[key] as RunState | undefined) ?? null
}

/**
 * Boot a new run and return the runId. The async pipeline runs in the
 * background; the caller (message handler) returns immediately.
 */
export async function startCartRun(args: {
  projectId: string
  appOrigin: string
  sourceTabId: number
}): Promise<string> {
  const meta: RunMeta = {
    runId: newRunId(),
    projectId: args.projectId,
    appOrigin: args.appOrigin,
    sourceTabId: args.sourceTabId,
    startedAt: Date.now(),
  }
  const state: RunState = {
    meta,
    payload: null,
    items: [],
    phase: "starting",
  }
  await saveRun(state)

  void runPipeline(state).catch(async (err: unknown) => {
    state.phase = "error"
    state.error = err instanceof Error ? err.message : "Run failed"
    await saveRun(state)
    if (state.meta.hdTabId) {
      try {
        await chrome.tabs.sendMessage(state.meta.hdTabId, {
          type: "set-phase",
          phase: "error",
          errorMessage: state.error,
        })
      } catch {
        // tab may have closed
      }
    }
    console.error("[cart-runner]", err)
  })

  return meta.runId
}

async function runPipeline(state: RunState): Promise<void> {
  const payload = await fetchPayloadViaBridge(
    state.meta.sourceTabId,
    state.meta.projectId,
  )
  state.payload = payload
  state.items = payload.materials.map((m) => ({
    material: m,
    status: { kind: "pending" } as RunItemStatus,
  }))
  state.phase = "running"
  await saveRun(state)

  const hdTab = await chrome.tabs.create({
    url: "https://www.homedepot.com/",
    active: true,
  })
  state.meta.hdTabId = hdTab.id
  await saveRun(state)

  await waitForHdDriverReady(hdTab.id ?? -1)

  try {
    await chrome.tabs.sendMessage(hdTab.id ?? -1, {
      type: "init-side-panel",
      projectName: payload.project.name,
      items: state.items,
    })
  } catch (e) {
    console.warn("[cart-runner] init-side-panel send failed", e)
  }

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i]!
    try {
      const status = await driveOneMaterial(state, hdTab.id ?? -1, i, item)
      state.items[i]!.status = status
    } catch (e) {
      state.items[i]!.status = {
        kind: "error",
        message: e instanceof Error ? e.message : "Driver call failed",
      }
    }
    await saveRun(state)
    // Re-push the updated checklist so the side panel reflects per-item
    // progress as we go. (The driver's local copy is also updated, but
    // navigations between materials wipe its in-memory state.)
    await pushPanelState(state, hdTab.id ?? -1)
  }

  state.phase = "done"
  await saveRun(state)
  try {
    await chrome.tabs.sendMessage(hdTab.id ?? -1, {
      type: "set-phase",
      phase: "done",
    })
  } catch {
    // no-op
  }
}

async function waitForHdDriverReady(
  tabId: number,
  deadlineMs = 12_000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "hd-driver-ping" })
      if (res && (res as { ok?: boolean }).ok) return
    } catch {
      // tab not ready yet
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`HD driver did not become ready in ${deadlineMs}ms`)
}

/**
 * Wait for `chrome.tabs.onUpdated` to report status: "complete" for a
 * given tab. Used after we tell the worker to navigate the HD tab — the
 * driver's content script is reinjected on the new page, but we still
 * need to wait for it to actually be ready before sending more messages.
 */
async function waitForTabComplete(
  tabId: number,
  deadlineMs = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handler)
      reject(new Error(`Tab ${tabId} didn't reach 'complete' in ${deadlineMs}ms`))
    }, deadlineMs)
    function handler(updatedTabId: number, info: chrome.tabs.TabChangeInfo) {
      if (updatedTabId !== tabId) return
      if (info.status === "complete") {
        clearTimeout(t)
        chrome.tabs.onUpdated.removeListener(handler)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(handler)
  })
}

/**
 * Drive a single material end to end, handling navigations the driver
 * requests (search page, then optionally PDP for matched candidates).
 * Returns the final RunItemStatus.
 *
 * The driver content script CANNOT navigate itself — doing so kills the
 * message channel mid-response. So instead, when work requires a
 * different page, the driver responds synchronously with `navigateTo`
 * and this function does the navigation here, then re-issues the
 * appropriate message after the new page settles.
 */
/**
 * Re-push the side-panel state to the driver. The driver's in-memory
 * panelState is wiped on every navigation, so after we navigate the HD
 * tab we have to repaint it.
 */
async function pushPanelState(state: RunState, tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "init-side-panel",
      projectName: state.payload?.project.name ?? null,
      items: state.items,
    })
  } catch {
    // tab may have navigated again; next ready tick will re-push
  }
}

async function driveOneMaterial(
  state: RunState,
  tabId: number,
  idx: number,
  item: RunItem,
): Promise<RunItemStatus> {
  // Up to 3 navigation cycles per material (search → maybe PDP → add).
  for (let cycle = 0; cycle < 4; cycle++) {
    await waitForHdDriverReady(tabId)
    await pushPanelState(state, tabId)
    const res = await chrome.tabs.sendMessage(tabId, {
      type: "drive-material",
      idx,
      material: item.material,
      appOrigin: state.meta.appOrigin,
    })
    if (!res || typeof res !== "object" || !("ok" in res) || !res.ok) {
      return { kind: "error", message: "Driver returned no response" }
    }
    const r = res as { navigateTo?: string; status?: RunItemStatus }
    if (r.navigateTo) {
      await chrome.tabs.update(tabId, { url: r.navigateTo })
      await waitForTabComplete(tabId)
      continue
    }
    const status = r.status
    if (!status) {
      return { kind: "error", message: "Driver returned no status" }
    }
    if (status.kind === "matched") {
      // Stash the matched state on the item so the panel can show it
      // while we navigate to the PDP.
      state.items[idx]!.status = status
      const finalStatus = await navigateAndAddToCart(state, tabId, idx, status.candidate)
      return finalStatus
    }
    return status
  }
  return { kind: "error", message: "Exhausted navigation cycles" }
}

/**
 * Given a matched candidate, navigate the HD tab to the PDP and tell the
 * driver to click "Add to Cart". One nav cycle (driver may itself
 * request the PDP URL if the worker raced).
 */
async function navigateAndAddToCart(
  state: RunState,
  tabId: number,
  idx: number,
  candidate: Candidate,
): Promise<RunItemStatus> {
  for (let cycle = 0; cycle < 3; cycle++) {
    await waitForHdDriverReady(tabId)
    await pushPanelState(state, tabId)
    const res = await chrome.tabs.sendMessage(tabId, {
      type: "add-to-cart-on-pdp",
      idx,
      candidate,
    })
    if (!res || typeof res !== "object" || !("ok" in res) || !res.ok) {
      return { kind: "error", message: "Driver returned no PDP response" }
    }
    const r = res as { navigateTo?: string; status?: RunItemStatus }
    if (r.navigateTo) {
      await chrome.tabs.update(tabId, { url: r.navigateTo })
      await waitForTabComplete(tabId)
      continue
    }
    return r.status ?? { kind: "error", message: "PDP driver returned no status" }
  }
  return { kind: "error", message: "Exhausted PDP cycles" }
}

async function fetchPayloadViaBridge(
  bridgeTabId: number,
  projectId: string,
): Promise<CartPayload> {
  const res = await fetchOnAppDomain(bridgeTabId, {
    method: "GET",
    path: `/api/v1/projects/${encodeURIComponent(projectId)}/cart-payload`,
  })
  if (!res.ok) {
    throw new Error(`cart-payload returned ${res.status}: ${res.body.slice(0, 200)}`)
  }
  return JSON.parse(res.body) as CartPayload
}

type BridgeFetchRes = { ok: boolean; status: number; body: string }

async function fetchOnAppDomain(
  bridgeTabId: number,
  args: { method: "GET" | "POST"; path: string; body?: unknown },
): Promise<BridgeFetchRes> {
  const res = await chrome.tabs.sendMessage(bridgeTabId, {
    type: "fetch-on-app-domain",
    method: args.method,
    path: args.path,
    body: args.body,
  })
  if (!res || typeof res !== "object" || !("ok" in res)) {
    throw new Error("Bridge fetch returned malformed response")
  }
  return res as BridgeFetchRes
}

// ─────────────────────────────────────────────────────────────────────────
// Driver→worker proxies for match-material / find-alternative.
// The driver sends these requests; the worker forwards through the bridge
// (cookies travel) and returns the parsed result.
// ─────────────────────────────────────────────────────────────────────────

export async function relayMatchMaterial(args: {
  bridgeTabId: number
  material: Material
  candidates: Candidate[]
}): Promise<MatchResult> {
  const res = await fetchOnAppDomain(args.bridgeTabId, {
    method: "POST",
    path: "/api/v1/match-material",
    body: { material: args.material, candidates: args.candidates },
  })
  if (!res.ok) {
    throw new Error(`match-material ${res.status}: ${res.body.slice(0, 200)}`)
  }
  return JSON.parse(res.body) as MatchResult
}

export async function relayFindAlternative(args: {
  bridgeTabId: number
  material: Material
  oosCandidate: Candidate
  alternatives: Candidate[]
}): Promise<AlternativeRanking> {
  const res = await fetchOnAppDomain(args.bridgeTabId, {
    method: "POST",
    path: "/api/v1/find-alternative",
    body: {
      material: args.material,
      oosCandidate: args.oosCandidate,
      alternatives: args.alternatives,
    },
  })
  if (!res.ok) {
    throw new Error(`find-alternative ${res.status}: ${res.body.slice(0, 200)}`)
  }
  return JSON.parse(res.body) as AlternativeRanking
}

/**
 * Find a bridge tab id for a given app origin among the user's open tabs.
 * Driver-originated relay requests use this; if the user closed the
 * contractor-app tab mid-run, returns null and the worker surfaces an
 * error to the side panel.
 */
export async function findBridgeTabId(
  appOrigin: string,
): Promise<number | null> {
  const tabs = await chrome.tabs.query({ url: `${appOrigin}/*` })
  return tabs[0]?.id ?? null
}
