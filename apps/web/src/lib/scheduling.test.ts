import { describe, expect, it } from "vitest"

import { classifyScheduleEngine, stepIsNativeSchedulable } from "./scheduling"
import type { ActionType, QueueStep } from "../types"

function step(action_type: ActionType, message?: string): QueueStep {
  return { action_type, targets: ["@chat"], account_ids: ["acc-1"], message }
}

describe("stepIsNativeSchedulable", () => {
  it("treats plain messages/media as natively schedulable", () => {
    expect(stepIsNativeSchedulable(step("send_message", "hi"))).toBe(true)
    expect(stepIsNativeSchedulable(step("send_media", "file=x.png"))).toBe(true)
  })

  it("treats a bare /start (no referral) as native but a referral start as runner", () => {
    expect(stepIsNativeSchedulable(step("start_bot"))).toBe(true)
    expect(stepIsNativeSchedulable(step("start_bot", "   "))).toBe(true)
    expect(stepIsNativeSchedulable(step("start_bot", "ref123"))).toBe(false)
  })

  it("treats non-message actions as not natively schedulable", () => {
    expect(stepIsNativeSchedulable(step("join_chat"))).toBe(false)
  })
})

describe("classifyScheduleEngine", () => {
  it("is native when every step can be pre-delivered", () => {
    const result = classifyScheduleEngine([step("send_message", "a"), step("start_bot")])
    expect(result.engine).toBe("native")
    expect(result.blockers).toEqual([])
  })

  it("is runner when any step blocks offline delivery, naming the blockers", () => {
    const result = classifyScheduleEngine([step("send_message", "a"), step("join_chat")])
    expect(result.engine).toBe("runner")
    expect(result.blockers.length).toBeGreaterThan(0)
  })

  it("dedupes repeated blockers", () => {
    const result = classifyScheduleEngine([step("join_chat"), step("join_chat")])
    expect(result.engine).toBe("runner")
    expect(result.blockers.length).toBe(1)
  })

  it("treats an empty queue as native (no blocking steps)", () => {
    expect(classifyScheduleEngine([]).engine).toBe("native")
  })
})
