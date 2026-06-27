import { describe, expect, it } from "vitest"

import { dialogKind, dialogTarget } from "./dialog-resolver"
import type { TelegramDialog } from "../types"

function dialog(partial: Partial<TelegramDialog>): TelegramDialog {
  return { id: 1, title: "Chat", ...partial }
}

describe("dialogTarget", () => {
  it("prefers @username when present", () => {
    expect(dialogTarget(dialog({ username: "durov" }))).toBe("@durov")
  })

  it("falls back to the numeric id as a string", () => {
    expect(dialogTarget(dialog({ id: 12345 }))).toBe("12345")
    expect(dialogTarget(dialog({ id: 67890, username: null }))).toBe("67890")
  })
})

describe("dialogKind", () => {
  it("walks the field-priority fallback chain", () => {
    expect(dialogKind(dialog({ dialog_type: "channel" }))).toBe("channel")
    expect(dialogKind(dialog({ kind: "group" }))).toBe("group")
    expect(dialogKind(dialog({ type: "supergroup" }))).toBe("supergroup")
    expect(dialogKind(dialog({ entity_type: "bot" }))).toBe("bot")
  })

  it("prefers dialog_type over later fallbacks", () => {
    expect(
      dialogKind(dialog({ dialog_type: "channel", kind: "group", type: "user" }))
    ).toBe("channel")
  })

  it("returns 'unknown' when no kind field is present", () => {
    expect(dialogKind(dialog({}))).toBe("unknown")
  })
})
