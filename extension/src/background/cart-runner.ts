import type { CartPayload, RunItem } from "../shared/types"

/**
 * Cart-builder orchestration. One "run" = one project's materials list
 * being walked end-to-end on a Home Depot tab.
 *
 * Phase A (this file): boots the run — fetches the cart-payload via the
 * bridge, opens a HD tab, stashes run state in chrome.storage.session.
 * Phase B (Batch C): drives the actual search + match loop on the HD
 * tab, per-material, posting status updates that the side-panel reads.
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
  // Phase: where we are in the workflow.
  phase: "starting" | "store-select" | "running" | "done" | "error"
  error?: string
}

function newRunId(): string {
  // chrome.storage keys are strings; a short random hex is fine.
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

const RUN_KEY_PREFIX = "run:"

async function saveRun(state: RunState): Promise<void> {
  await chrome.storage.session.set({ [`${RUN_KEY_PREFIX}${state.meta.runId}`]: state })
}

export async function loadRun(runId: string): Promise<RunState | null> {
  const key = `${RUN_KEY_PREFIX}${runId}`
  const got = await chrome.storage.session.get(key)
  return (got[key] as RunState | undefined) ?? null
}

/**
 * Boot a new run. Returns the runId synchronously (well, via Promise) so
 * the caller can pass it back to the originating page as a handle. Heavy
 * lifting (fetch payload, open HD tab, drive search loop) happens
 * asynchronously after this returns.
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

  // Kick off the async pipeline. Don't await — the caller is the message
  // handler which needs to return immediately.
  void runPipeline(state).catch(async (err: unknown) => {
    state.phase = "error"
    state.error = err instanceof Error ? err.message : "Run failed"
    await saveRun(state)
    console.error("[cart-runner]", err)
  })

  return meta.runId
}

async function runPipeline(state: RunState): Promise<void> {
  // 1. Fetch the cart payload via the bridge tab (cookies travel there).
  const payload = await fetchPayloadViaBridge(
    state.meta.sourceTabId,
    state.meta.projectId,
  )
  state.payload = payload
  state.items = payload.materials.map((m) => ({
    material: m,
    status: { kind: "pending" },
  }))
  state.phase = "store-select"
  await saveRun(state)

  // 2. Open a HD tab. (Phase B: store selection logic — for now go to
  //    the homepage and let the driver script take over.)
  const hdTab = await chrome.tabs.create({
    url: "https://www.homedepot.com/",
    active: true,
  })
  state.meta.hdTabId = hdTab.id
  await saveRun(state)

  // 3. The driver script picks up from here on document_idle. Phase B
  //    will register a message channel for the worker to drive each
  //    material through search + match + add. For now we just hand off
  //    and the side panel surfaces a "ready" state.
}

async function fetchPayloadViaBridge(
  bridgeTabId: number,
  projectId: string,
): Promise<CartPayload> {
  const res = await chrome.tabs.sendMessage(bridgeTabId, {
    type: "fetch-on-app-domain",
    method: "GET",
    path: `/api/v1/projects/${encodeURIComponent(projectId)}/cart-payload`,
  })
  if (!res || typeof res !== "object" || !("ok" in res)) {
    throw new Error("Bridge fetch returned malformed response")
  }
  const r = res as { ok: boolean; status: number; body: string }
  if (!r.ok) {
    throw new Error(`cart-payload returned ${r.status}: ${r.body.slice(0, 200)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(r.body)
  } catch {
    throw new Error("cart-payload returned non-JSON")
  }
  return parsed as CartPayload
}
