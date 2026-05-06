/**
 * Pure room measurement helpers. Length × width × ceiling height in feet,
 * derived metrics in feet / square feet.
 */

export type RoomDimensions = {
  lengthFt: number | null | undefined
  widthFt: number | null | undefined
  heightFt: number | null | undefined
}

export type RoomMetrics = {
  /** Floor area in sqft (length × width). Null if either dim is missing. */
  floorAreaSqft: number | null
  /** Perimeter in linear feet (2 × (length + width)). */
  perimeterFt: number | null
  /** Gross wall area in sqft (perimeter × height); does NOT subtract openings. */
  wallAreaSqft: number | null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function roomMetrics(dims: RoomDimensions): RoomMetrics {
  const l = dims.lengthFt
  const w = dims.widthFt
  const h = dims.heightFt
  const haveLW = typeof l === "number" && typeof w === "number" && l > 0 && w > 0
  const heightOK = typeof h === "number" && h > 0

  const floorAreaSqft = haveLW ? round2(l! * w!) : null
  const perimeterFt = haveLW ? round2(2 * (l! + w!)) : null
  const wallAreaSqft = haveLW && heightOK ? round2(perimeterFt! * h!) : null

  return { floorAreaSqft, perimeterFt, wallAreaSqft }
}
