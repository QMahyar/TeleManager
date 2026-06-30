import { describe, expect, it } from "vitest"

import { rollupByAccount } from "./queue-metrics"
import type { ActionType, QueueStep } from "../../types"

const step = (
  action_type: ActionType,
  targets: string[],
  account_ids: string[]
): QueueStep => ({ action_type, targets, account_ids })

describe("rollupByAccount", () => {
  it("pivots steps into per-account op + destructive counts", () => {
    const rollups = rollupByAccount([
      step("send_message", ["@a", "@b"], ["acc-1", "acc-2"]),
      step("leave_chat", ["@a"], ["acc-1"]), // not destructive
      step("delete_chat", ["@a", "@b", "@c"], ["acc-1"]), // destructive
    ])
    const acc1 = rollups.find((r) => r.accountId === "acc-1")!
    expect(acc1.ops).toBe(6) // 2 + 1 + 3
    expect(acc1.destructive).toBe(3) // delete_chat ×3
    const acc2 = rollups.find((r) => r.accountId === "acc-2")!
    expect(acc2.ops).toBe(2)
    expect(acc2.destructive).toBe(0)
  })

  it("sorts the most-impacted account first (destructive, then ops)", () => {
    const rollups = rollupByAccount([
      step("send_message", ["@a"], ["safe"]),
      step("delete_chat", ["@a"], ["risky"]),
    ])
    expect(rollups[0].accountId).toBe("risky")
  })

  it("merges the same action across steps into one tally", () => {
    const [acc] = rollupByAccount([
      step("send_message", ["@a"], ["acc-1"]),
      step("send_message", ["@b", "@c"], ["acc-1"]),
    ])
    expect(acc.actions).toHaveLength(1)
    expect(acc.actions[0].ops).toBe(3)
  })

  it("returns nothing for an empty queue", () => {
    expect(rollupByAccount([])).toEqual([])
  })
})
