import { defineConfig } from "vitest/config"

/**
 * Vitest is the unit-test layer for pure helpers. The Playwright specs
 * live in tests/e2e/ and are excluded here — they run via `npm run
 * test:e2e` against a real production build.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules", "dist", ".next"],
  },
})
