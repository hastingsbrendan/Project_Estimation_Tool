/**
 * Version-skew guard for the Chrome extension.
 *
 * The extension is sideloaded (no Web Store auto-update), so old
 * versions linger on users' machines indefinitely. When a /api/v1
 * contract changes incompatibly, bump MIN_EXTENSION_VERSION — requests
 * from older extensions then get a clean 426 + upgrade message instead
 * of failing mid-cart-run on a shape mismatch.
 *
 * Requests WITHOUT the X-Extension-Version header are allowed through:
 * the /api/v1 layer is for any external client (future CLI / mobile),
 * not just the extension, and those clients version differently.
 */

export const MIN_EXTENSION_VERSION = "0.1.0"

function parse(v: string): number[] {
  return v.split(".").map((n) => Number.parseInt(n, 10) || 0)
}

/** semver-ish compare, returns negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Returns a 426 Response when the request carries an extension version
 * below the supported floor; null when the request is fine.
 */
export function checkExtensionVersion(req: Request): Response | null {
  const version = req.headers.get("x-extension-version")
  if (!version) return null
  if (compareVersions(version, MIN_EXTENSION_VERSION) >= 0) return null
  return Response.json(
    {
      error: "Extension out of date",
      minSupportedVersion: MIN_EXTENSION_VERSION,
      yourVersion: version,
      upgrade:
        "Pull the latest extension build and reload it at chrome://extensions.",
    },
    { status: 426 },
  )
}
