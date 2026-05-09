import type {
  AlternativeRanking,
  Candidate,
  CartPayload,
  MatchResult,
} from "./types"

/**
 * Typed wrappers for the contractor-app /api/v1/* endpoints.
 *
 * Auth model: session cookie. The bridge content script runs on
 * contractor-app pages, so a fetch from there carries the user's
 * existing session automatically. The service worker, by contrast, is
 * cross-origin to contractor-app and would need explicit CORS + token
 * handling — so the worker delegates fetches back to the bridge via
 * chrome.tabs.sendMessage.
 *
 * For now, this module is callable from EITHER side; it's the caller's
 * responsibility to invoke from the right context.
 */

export type AppOrigin = string // e.g. "https://contractor-app.vercel.app"

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function jsonFetch<T>(
  origin: AppOrigin,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${origin}${path}`
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    let body = ""
    try {
      body = await response.text()
    } catch {
      // ignore
    }
    throw new ApiError(
      response.status,
      `${path} returned ${response.status}`,
      body.slice(0, 500),
    )
  }
  return (await response.json()) as T
}

export async function fetchCartPayload(
  origin: AppOrigin,
  projectId: string,
): Promise<CartPayload> {
  return jsonFetch<CartPayload>(
    origin,
    `/api/v1/projects/${encodeURIComponent(projectId)}/cart-payload`,
  )
}

export async function postMatchMaterial(
  origin: AppOrigin,
  body: {
    material: { description: string; unit: string; quantity: number; notes?: string | null }
    candidates: Candidate[]
  },
): Promise<MatchResult> {
  return jsonFetch<MatchResult>(origin, "/api/v1/match-material", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function postFindAlternative(
  origin: AppOrigin,
  body: {
    material: { description: string; unit: string; quantity: number; notes?: string | null }
    oosCandidate: Candidate
    alternatives: Candidate[]
  },
): Promise<AlternativeRanking> {
  return jsonFetch<AlternativeRanking>(origin, "/api/v1/find-alternative", {
    method: "POST",
    body: JSON.stringify(body),
  })
}
