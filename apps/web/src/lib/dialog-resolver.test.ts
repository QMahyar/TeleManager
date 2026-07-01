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
  it("returns the backend's dialog_type", () => {
    expect(dialogKind(dialog({ dialog_type: "channel" }))).toBe("channel")
    expect(dialogKind(dialog({ dialog_type: "supergroup" }))).toBe("supergroup")
    expect(dialogKind(dialog({ dialog_type: "bot" }))).toBe("bot")
  })

  it("returns 'unknown' when dialog_type is absent", () => {
    expect(dialogKind(dialog({}))).toBe("unknown")
  })
})
