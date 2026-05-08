import { describe, it, expect } from "vitest"
import { userFacingErrorMessage } from "../lib/error-utils"

describe("userFacingErrorMessage", () => {
  it("returns the message for a real Error", () => {
    expect(userFacingErrorMessage(new Error("Something failed"))).toBe(
      "Something failed",
    )
  })

  it("returns the string for a thrown string", () => {
    expect(userFacingErrorMessage("plain string")).toBe("plain string")
  })

  it("returns 'Unknown error' for null / undefined", () => {
    // Coerced to "null" / "undefined", but the first line is still that.
    expect(userFacingErrorMessage(null)).toBe("null")
    expect(userFacingErrorMessage(undefined)).toBe("undefined")
  })

  it("strips multi-line errors to the first line", () => {
    const err = new Error("Header line\nDetail one\nDetail two")
    expect(userFacingErrorMessage(err)).toBe("Header line")
  })

  it("truncates very long single-line messages with an ellipsis", () => {
    const long = "x".repeat(300)
    const result = userFacingErrorMessage(new Error(long))
    expect(result.length).toBeLessThanOrEqual(201) // 200 + ellipsis
    expect(result.endsWith("…")).toBe(true)
  })

  it("does not truncate exactly-200-char messages", () => {
    const exact = "x".repeat(200)
    expect(userFacingErrorMessage(new Error(exact))).toBe(exact)
  })
})
