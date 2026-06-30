import { describe, expect, it } from "vitest"

import { defaultCondition, describeCondition, validateCondition } from "./conditions"

describe("describeCondition", () => {
  it("renders field op value the same way the backend records it", () => {
    expect(describeCondition({ field: "member_count", op: "<", value: 10 })).toBe(
      "member_count < 10"
    )
    expect(
      describeCondition({ field: "days_since_last_message", op: ">", value: 90 })
    ).toBe("days_since_last_message > 90")
  })
})

describe("validateCondition", () => {
  it("accepts null (no condition) and valid values", () => {
    expect(validateCondition(null)).toBeNull()
    expect(validateCondition(defaultCondition)).toBeNull()
    expect(validateCondition({ field: "unread_count", op: "==", value: 0 })).toBeNull()
  })

  it("rejects negative or non-finite values", () => {
    expect(
      validateCondition({ field: "unread_count", op: "==", value: -1 })
    ).not.toBeNull()
    expect(
      validateCondition({ field: "unread_count", op: "==", value: Number.NaN })
    ).not.toBeNull()
  })
})
