import { describe, expect, it } from "vitest"

import { shouldNotify } from "./notify"

describe("shouldNotify", () => {
  it("fires only when enabled, hidden, and permission granted", () => {
    expect(shouldNotify(true, true, "granted")).toBe(true)
  })

  it("stays silent when the tab is visible (the in-app banner covers it)", () => {
    expect(shouldNotify(true, false, "granted")).toBe(false)
  })

  it("stays silent when disabled or permission not granted", () => {
    expect(shouldNotify(false, true, "granted")).toBe(false)
    expect(shouldNotify(true, true, "denied")).toBe(false)
    expect(shouldNotify(true, true, "default")).toBe(false)
  })
})
