/**
 * Client-side image compression. Phone cameras produce 4-20MB photos, and
 * Vercel's serverActions.bodySizeLimit caps requests at 25MB — anything
 * larger silently 500s with the dreaded "This page couldn't load" page.
 * For receipts and project photos, we never need full-res; resize to
 * 2400px on the long edge with JPEG quality 0.85 and you get a 0.5-2 MB
 * image that Claude vision can still read perfectly.
 *
 * Falls through unchanged for:
 *  - PDFs (we can't resize PDFs in the browser)
 *  - HEIC/HEIF (browsers can't decode these into a canvas without a
 *    decoder library — Safari does it, Chrome doesn't, so we play safe)
 *  - Files already under the soft target
 *  - Anything that throws (decoder errors, out-of-memory, etc.)
 */

const SOFT_LIMIT_BYTES = 4 * 1024 * 1024 // skip compression for files < 4 MB

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file
  if (file.type === "image/heic" || file.type === "image/heif") return file
  if (file.size < SOFT_LIMIT_BYTES) return file
  if (typeof window === "undefined") return file

  try {
    const bitmap = await createImageBitmap(file)
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const TARGET = 2400
    const ratio = longEdge > TARGET ? TARGET / longEdge : 1
    const w = Math.round(bitmap.width * ratio)
    const h = Math.round(bitmap.height * ratio)

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h })
    const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) return file
    // The cast is needed because TS unions on the two ctx types here are
    // overly strict; both have drawImage with the same signature.
    ;(ctx as CanvasRenderingContext2D).drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob: Blob | null = await new Promise((resolve) => {
      if (canvas instanceof OffscreenCanvas) {
        canvas
          .convertToBlob({ type: "image/jpeg", quality: 0.85 })
          .then(resolve)
          .catch(() => resolve(null))
      } else {
        ;(canvas as HTMLCanvasElement).toBlob(
          (b) => resolve(b),
          "image/jpeg",
          0.85,
        )
      }
    })
    if (!blob) return file
    // If compression somehow made it bigger, return the original.
    if (blob.size >= file.size) return file

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() })
  } catch {
    // Decoder error, OOM, etc. — fall through with the original file.
    return file
  }
}
