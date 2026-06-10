import { describe, it, expect } from "vitest"
import { parsePaymentSchedule } from "../lib/milestones"

describe("parsePaymentSchedule", () => {
  it("splits percentages of the project total", () => {
    const out = parsePaymentSchedule("30% deposit, 40% rough-in, 30% final", 10000)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ label: "deposit", amount: 3000 })
    expect(out[1]).toEqual({ label: "rough-in", amount: 4000 })
    expect(out[2]).toEqual({ label: "final", amount: 3000 })
  })

  it("parses dollar amounts with commas", () => {
    const out = parsePaymentSchedule("$2,500 deposit, $1,000 on completion", 0)
    expect(out[0]).toEqual({ label: "deposit", amount: 2500 })
    expect(out[1]).toEqual({ label: "completion", amount: 1000 })
  })

  it("resolves 'balance' as total minus allocated", () => {
    const out = parsePaymentSchedule("$2,000 deposit, balance on completion", 7500)
    expect(out[1]).toEqual({ label: "balance on completion", amount: 5500 })
  })

  it("handles semicolons, newlines, and 'due at' filler", () => {
    const out = parsePaymentSchedule("50% due at start;\n50% due on completion.", 8000)
    expect(out).toHaveLength(2)
    expect(out[0]!.amount).toBe(4000)
    expect(out[0]!.label.toLowerCase()).toContain("start")
    expect(out[1]!.amount).toBe(4000)
  })

  it("folds cent-rounding drift into the last milestone", () => {
    // 3 × 33.33% of $100 = 99.99 → last gets the missing cent... but only
    // when totals are within $1.
    const out = parsePaymentSchedule("33.33% a, 33.33% b, 33.34% c", 100)
    const sum = out.reduce((s, m) => s + m.amount, 0)
    expect(sum).toBe(100)
  })

  it("skips unparseable chunks instead of guessing", () => {
    const out = parsePaymentSchedule(
      "We'll figure it out, 50% deposit, friendly handshake",
      1000,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ label: "deposit", amount: 500 })
  })

  it("returns [] for empty / null / fully-freeform text", () => {
    expect(parsePaymentSchedule(null, 1000)).toEqual([])
    expect(parsePaymentSchedule("", 1000)).toEqual([])
    expect(parsePaymentSchedule("payment plan to be discussed", 1000)).toEqual([])
  })

  it("does not force-balance when chunks intentionally undershoot", () => {
    // $500 of a $10k project — drift is way past $1, leave it alone.
    const out = parsePaymentSchedule("$500 deposit", 10000)
    expect(out).toEqual([{ label: "deposit", amount: 500 }])
  })
})
