import { describe, expect, it } from "vitest"

import { buildSyncSteps, syncDiff, syncKey, syncOpCount } from "./sync"
import type { TelegramDialog } from "../types"

const d = (over: Partial<TelegramDialog>): TelegramDialog => ({
  id: 1,
  title: "Chat",
  ...over,
})

describe("syncKey", () => {
  it("prefers a lower-cased username, falls back to the id", () => {
    expect(syncKey(d({ username: "Ops" }))).toBe("@ops")
    expect(syncKey(d({ id: -100123, username: null }))).toBe("-100123")
  })
})

describe("syncDiff", () => {
  it("emits actions only where matched chats differ", () => {
    const source = [
      d({ username: "ops", archived: true, muted: true }),
      d({ username: "news", archived: false, muted: false }),
    ]
    const target = [
      d({ username: "ops", archived: false, muted: false }), // needs archive + mute
      d({ username: "news", archived: false, muted: false }), // already matches
    ]
    const ops = syncDiff(source, target, { archive: true, mute: true, pin: false })
    expect(ops.map((o) => o.action_type).sort()).toEqual([
      "archive_chat",
      "mute_chat",
    ])
    expect(ops.every((o) => o.target === "@ops")).toBe(true)
  })

  it("reverses state when the source is the unset one", () => {
    const source = [d({ username: "ops", archived: false, muted: false })]
    const target = [d({ username: "ops", archived: true, muted: true })]
    const ops = syncDiff(source, target, { archive: true, mute: true, pin: false })
    expect(ops.map((o) => o.action_type).sort()).toEqual([
      "unarchive_chat",
      "unmute_chat",
    ])
  })

  it("ignores chats not present in both accounts", () => {
    const source = [d({ username: "only-source", archived: true })]
    const target = [d({ username: "other", archived: false })]
    expect(syncDiff(source, target, { archive: true, mute: true, pin: false })).toEqual([])
  })

  it("respects which states are selected", () => {
    const source = [d({ username: "ops", archived: true, muted: true })]
    const target = [d({ username: "ops", archived: false, muted: false })]
    const ops = syncDiff(source, target, { archive: true, mute: false, pin: false })
    expect(ops).toHaveLength(1)
    expect(ops[0].action_type).toBe("archive_chat")
  })

  it("emits pin_chat when source is pinned and target is not", () => {
    const source = [d({ username: "ops", pinned: true })]
    const target = [d({ username: "ops", pinned: false })]
    const ops = syncDiff(source, target, { archive: false, mute: false, pin: true })
    expect(ops).toHaveLength(1)
    expect(ops[0].action_type).toBe("pin_chat")
    expect(ops[0].target).toBe("@ops")
  })

  it("emits unpin_chat when source is unpinned and target is pinned", () => {
    const source = [d({ username: "ops", pinned: false })]
    const target = [d({ username: "ops", pinned: true })]
    const ops = syncDiff(source, target, { archive: false, mute: false, pin: true })
    expect(ops).toHaveLength(1)
    expect(ops[0].action_type).toBe("unpin_chat")
  })

  it("combines pin with archive and mute", () => {
    const source = [d({ username: "ops", archived: true, muted: true, pinned: true })]
    const target = [d({ username: "ops", archived: false, muted: false, pinned: false })]
    const ops = syncDiff(source, target, { archive: true, mute: true, pin: true })
    expect(ops.map((o) => o.action_type).sort()).toEqual([
      "archive_chat",
      "mute_chat",
      "pin_chat",
    ])
  })

  it("skips pin when pin option is off", () => {
    const source = [d({ username: "ops", pinned: true })]
    const target = [d({ username: "ops", pinned: false })]
    const ops = syncDiff(source, target, { archive: false, mute: false, pin: false })
    expect(ops).toEqual([])
  })
})

describe("buildSyncSteps", () => {
  it("groups by action type per account and chunks to the step cap", () => {
    // 30 chats to archive on one account -> 2 steps (25 + 5), all same account.
    const source = Array.from({ length: 30 }, (_, i) =>
      d({ id: 1000 + i, username: `c${i}`, archived: true })
    )
    const target = source.map((s) => ({ ...s, archived: false }))
    const steps = buildSyncSteps(source, [{ accountId: "acc-2", dialogs: target }], {
      archive: true,
      mute: false,
      pin: false,
    })
    expect(steps).toHaveLength(2)
    expect(steps[0].targets).toHaveLength(25)
    expect(steps[1].targets).toHaveLength(5)
    expect(steps.every((s) => s.action_type === "archive_chat")).toBe(true)
    expect(steps.every((s) => s.account_ids[0] === "acc-2")).toBe(true)
    expect(syncOpCount(steps)).toBe(30)
  })
})
