"use client"

import { useEffect, useState } from "react"

/**
 * Renders one of three states:
 *   - Extension installed → orange "Build cart at Home Depot" button that
 *     dispatches a window.postMessage. The extension's bridge content
 *     script listens and forwards to its service worker.
 *   - Extension not detected → grey "Install Chrome extension →" link.
 *   - Loading (initial mount, before the bridge has had a chance to
 *     announce) → a tiny spinner so we don't flicker between states.
 *
 * Detection is via window.postMessage handshake — NOT a window.* flag.
 * Vercel's CSP blocks the inline <script> we'd need to set window.* from
 * the extension's isolated content script. postMessage works under any
 * CSP because nothing is being injected into the page's main world.
 *
 * Protocol:
 *   - On mount: button posts `{source: "contractor-app", type: "ping"}`
 *   - Bridge listens, replies via
 *     `{source: "contractor-app-ext", type: "ready", version, ext}`
 *   - Button also listens for the `ready` message in case the bridge
 *     announced before the listener was attached.
 *
 * If no `ready` arrives within DEADLINE_MS, we conclude the extension
 * isn't installed and show the install link.
 */
type ExtensionInfo = { version: string; ext: string }

const DEADLINE_MS = 1500

type ExtMessage = {
  source: "contractor-app-ext"
  type: string
  version?: string
  ext?: string
  [k: string]: unknown
}

export function CartBuilderButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  const [extInfo, setExtInfo] = useState<ExtensionInfo | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    let resolved = false
    let deadline: ReturnType<typeof setTimeout> | null = null

    function onMessage(e: MessageEvent) {
      if (e.source !== window) return
      const data = e.data as ExtMessage | undefined
      if (!data || typeof data !== "object") return
      if (data.source !== "contractor-app-ext") return
      if (data.type !== "ready") return
      if (resolved) return
      resolved = true
      setExtInfo({
        version: String(data.version ?? "?"),
        ext: String(data.ext ?? ""),
      })
      setState("ready")
      window.removeEventListener("message", onMessage)
      if (deadline) clearTimeout(deadline)
    }
    window.addEventListener("message", onMessage)

    // Ping the bridge in case it already announced before we mounted.
    window.postMessage(
      { source: "contractor-app", type: "ping" },
      window.location.origin,
    )

    deadline = setTimeout(() => {
      if (resolved) return
      resolved = true
      setState("missing")
      window.removeEventListener("message", onMessage)
    }, DEADLINE_MS)

    return () => {
      window.removeEventListener("message", onMessage)
      if (deadline) clearTimeout(deadline)
    }
  }, [])

  function startBuild() {
    if (state !== "ready") return
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
