import { defineConfig } from "vite"
import { crx } from "@crxjs/vite-plugin"
import manifest from "./src/manifest.json"

/**
 * Vite + CRXJS builds an MV3 extension into `dist/`. Loaded unpacked from
 * chrome://extensions during dev. See README.md for install instructions.
 *
 * Strict separation principle (per the W4 plan): this build produces
 * an artifact that talks to the contractor-app *only* through the
 * documented /api/v1/* endpoints. No imports across the project boundary.
 */
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Vite by default injects an inline <script> into built HTML files
    // to polyfill <link rel="modulepreload"> for older browsers. Chrome
    // extensions run in modern Chrome and never need this polyfill, AND
    // the inline script gets refused by the extension's default CSP
    // ("Executing inline script violates the following Content Security
    // Policy directive: script-src 'self' ..."). Turn it off so popup.html
    // loads with no inline script content at all.
    modulePreload: { polyfill: false },
    // Older Chromium baseline targets pull in more legacy helpers; pin
    // to a recent baseline so the popup stays slim.
    target: "chrome120",
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
})
