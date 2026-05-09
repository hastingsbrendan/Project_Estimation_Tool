/**
 * Types duplicated from contractor-app intentionally — the project boundary
 * is the HTTP API contract, not shared TypeScript. If contractor-app
 * changes a payload shape, we'd ship a new /api/v2 endpoint and update
 * here, never share code across.
 */

export type Material = {
  description: string
  unit: string
  quantity: number
  estUnitPrice: number
  estSubtotal: number
  notes: string | null
}

export type CartPayload = {
  project: {
    id: string
    name: string
    address: string | null
    clientName: string | null
  }
  materials: Material[]
  generatedAt: string
}

export type Candidate = {
  title: string
  sku: string
  url: string
  price: number | null
  inStock: boolean
  brand: string | null
  pack: string | null
}

export type MatchResult = {
  bestIdx: number | null
  confidence: number
  reasoning: string
}

export type AlternativeRanking = {
  ranked: Array<{ idx: number; confidence: number; reasoning: string }>
}

/** Per-material progress entry for the side-panel checklist. */
export type RunItemStatus =
  | { kind: "pending" }
  | { kind: "searching" }
  | { kind: "matched"; candidate: Candidate; confidence: number; reasoning: string }
  | { kind: "review"; candidates: Candidate[]; reasoning: string }
  | { kind: "oos"; candidate: Candidate; alternatives: Candidate[] | null }
  | { kind: "added"; candidate: Candidate }
  | { kind: "no-match"; reasoning: string }
  | { kind: "error"; message: string }

export type RunItem = {
  material: Material
  status: RunItemStatus
}

/** Messages exchanged between the bridge content script (on contractor-app
 * pages) and the extension's service worker. */
export type BridgeRequest =
  | { type: "build-cart-request"; projectId: string }
  | { type: "ping" }

export type BridgeResponse =
  | { type: "build-cart-accepted"; runId: string }
  | { type: "pong"; version: string }
  | { type: "error"; message: string }
