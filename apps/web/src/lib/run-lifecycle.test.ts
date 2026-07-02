import { describe, expect, it } from "vitest"

import {
  canPauseRun,
  canResumeRun,
  estimateRemainingSeconds,
  runPhase,
  secondsUntil,
} from "./run-lifecycle"
import { emptySafety } from "./constants"
import type { QueueRun } from "../types"

function run(overrides: Partial<QueueRun>): QueueRun {
  return { id: "r1", status: "running", ...overrides }
}

describe("runPhase", () => {
  it("maps statuses to phases", () => {
    expect(runPhase(run({ status: "running" }))).toBe("running")
    expect(runPhase(run({ status: "flood_waiting" }))).toBe("waiting")
    expect(runPhase(run({ status: "paused" }))).toBe("paused")
    expect(runPhase(run({ status: "pausing" }))).toBe("pausing")
    expect(runPhase(run({ status: "canceling" }))).toBe("canceling")
    expect(runPhase(run({ status: "completed" }))).toBe("terminal")
    expect(runPhase(run({ status: "flood_wait" }))).toBe("terminal")
  })
})

describe("pause/resume affordances", () => {
  it("offers pause while progressing (incl. flood wait), not when already pausing", () => {
    expect(canPauseRun(run({ status: "running" }))).toBe(true)
    expect(canPauseRun(run({ status: "flood_waiting" }))).toBe(true)
    expect(canPauseRun(run({ status: "running", pause_requested: true }))).toBe(false)
    expect(canPauseRun(run({ status: "completed" }))).toBe(false)
  })

  it("offers resume whenever a pause is pending or held", () => {
    expect(canResumeRun(run({ status: "paused" }))).toBe(true)
    expect(canResumeRun(run({ status: "pausing" }))).toBe(true)
    expect(canResumeRun(run({ status: "flood_waiting", pause_requested: true }))).toBe(true)
    expect(canResumeRun(run({ status: "running" }))).toBe(false)
  })
})

describe("secondsUntil", () => {
  it("floors at 0 and handles missing/invalid input", () => {
    expect(secondsUntil(null)).toBe(0)
    expect(secondsUntil(new Date(Date.now() - 5000).toISOString())).toBe(0)
    const future = secondsUntil(new Date(Date.now() + 30_000).toISOString())
    expect(future).toBeGreaterThan(25)
    expect(future).toBeLessThanOrEqual(30)
  })
})

describe("estimateRemainingSeconds", () => {
  it("costs only pending/running operations, ignoring finished ones", () => {
    const withRemaining = run({
      operations: [
        { status: "ok", action_type: "send_message", account_id: "a" },
        { status: "pending", action_type: "send_message", account_id: "a" },
        { status: "pending", action_type: "send_message", account_id: "a" },
      ],
    })
    const done = run({
      operations: [
        { status: "ok", action_type: "send_message", account_id: "a" },
        { status: "failed", action_type: "send_message", account_id: "a" },
      ],
    })
    expect(estimateRemainingSeconds(withRemaining, emptySafety, null)).toBeGreaterThan(0)
    expect(estimateRemainingSeconds(done, emptySafety, null)).toBe(0)
  })
})
