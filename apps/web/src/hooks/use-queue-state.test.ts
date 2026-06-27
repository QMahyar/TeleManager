import { describe, expect, it } from "vitest"

import { actionDraftBlocker } from "./use-queue-state"
import { defaultFieldValues } from "../lib/action-schema"
import type { ActionDraft, ActionType } from "../types"

function draft(action_type: ActionType, fields?: Record<string, unknown>): ActionDraft {
  return {
    action_type,
    target: "",
    fields: { ...defaultFieldValues(action_type), ...fields },
  }
}

describe("actionDraftBlocker", () => {
  it("blocks a send_message draft with an empty message", () => {
    const blocker = actionDraftBlocker(draft("send_message"))
    expect(blocker).toBeTruthy()
    expect(blocker).toMatch(/required/i)
  })

  it("passes a send_message draft once the text is filled", () => {
    expect(actionDraftBlocker(draft("send_message", { text: "hello" }))).toBeNull()
  })

  it("passes an action whose fields have no unmet requirements", () => {
    // join_chat carries no required free-text fields, so a default draft is queue-ready
    // (target validity is checked separately by partitionTargets).
    expect(actionDraftBlocker(draft("join_chat"))).toBeNull()
  })
})
