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
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
})
