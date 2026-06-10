import { describe, it, expect } from "vitest"
import {
  compareVersions,
  checkExtensionVersion,
  MIN_EXTENSION_VERSION,
} from "../lib/api-v1/extension-version"

describe("compareVersions", () => {
  it("orders simple versions", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0)
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0)
  })
  it("handles differing segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0)
  })
})

describe("checkExtensionVersion", () => {
  const reqWith = (v?: string) =>
    new Request("https://x.test/api/v1/match-material", {
      headers: v ? { "X-Extension-Version": v } : {},
    })

  it("allows requests without the header (non-extension clients)", () => {
    expect(checkExtensionVersion(reqWith())).toBeNull()
  })
  it("allows the current minimum", () => {
    expect(checkExtensionVersion(reqWith(MIN_EXTENSION_VERSION))).toBeNull()
  })
  it("rejects below-minimum with 426 + upgrade info", async () => {
    const res = checkExtensionVersion(reqWith("0.0.1"))
    expect(res?.status).toBe(426)
    const body = await res!.json()
    expect(body.minSupportedVersion).toBe(MIN_EXTENSION_VERSION)
  })
})
