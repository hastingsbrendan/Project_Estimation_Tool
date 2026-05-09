"use client"

import { useEffect, useState } from "react"

/**
 * Renders one of three states:
 *   - Extension installed → green "Build cart at Home Depot" button that
 *     dispatches a window.postMessage. The extension's bridge content
 *     script listens and forwards to its service worker.
 *   - Extension not detected → grey "Install the extension first" link.
 *   - Loading (initial mount, before the bridge has had a chance to inject) →
 *     a tiny spinner so we don't flicker between states.
 *
 * The bridge content script (`extension/src/content/contractor-app-bridge.ts`)
 * sets `window.__contractorAppExt = { version, ext: <chrome runtime id> }`
 * at document_idle. We poll for ~1 second after mount before deciding the
 * extension isn't there.
 */
type ExtensionFlag = { version: string; ext: string }

declare global {
  interface Window {
    __contractorAppExt?: ExtensionFlag
  }
}

const POLL_INTERVAL_MS = 100
const POLL_DEADLINE_MS = 1000

export function CartBuilderButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  const [extInfo, setExtInfo] = useState<ExtensionFlag | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    // Fast path: if the bridge already ran (document was idle before mount).
    if (window.__contractorAppExt) {
      setExtInfo(window.__contractorAppExt)
      setState("ready")
      return
    }
    // Otherwise poll for up to POLL_DEADLINE_MS.
    let elapsed = 0
    const interval = setInterval(() => {
      if (window.__contractorAppExt) {
        setExtInfo(window.__contractorAppExt)
        setState("ready")
        clearInterval(interval)
        return
      }
      elapsed += POLL_INTERVAL_MS
      if (elapsed >= POLL_DEADLINE_MS) {
        setState("missing")
        clearInterval(interval)
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  function startBuild() {
    if (state !== "ready") return
    // The bridge script listens on window.postMessage with this exact type
    // and forwards { projectId } to the extension's background worker.
    window.postMessage(
      {
        source: "contractor-app",
        type: "build-cart-request",
        projectId,
      },
      window.location.origin,
    )
  }

  if (state === "loading") {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-foreground-soft">
        <span className="inline-block w-2 h-2 rounded-full bg-foreground-soft animate-pulse" />
        Checking for extension…
      </div>
    )
  }

  if (state === "ready") {
    return (
      <button
        type="button"
        onClick={startBuild}
        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
        title={`Extension v${extInfo?.version ?? "?"}`}
      >
        🛒 Build cart at Home Depot
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="text-foreground-soft">Cart builder:</span>
      <a
        href="https://github.com/hastingsbrendan/Project-Estimation-Tool/blob/main/extension/README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:underline"
        title="Install the Chrome extension to build a HD cart from this material list"
      >
        Install Chrome extension →
      </a>
    </div>
  )
}
