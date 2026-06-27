import { describe, expect, it } from "vitest"

import { analyzeTarget, classifyTargetKind } from "./targeting"

describe("classifyTargetKind", () => {
  it("classifies usernames (with or without @, 5-32 chars)", () => {
    expect(classifyTargetKind("@durov")).toBe("username")
    expect(classifyTargetKind("durov")).toBe("username")
  })

  it("classifies negative/short numeric ids that aren't username-shaped", () => {
    // 5+ digit positives match the username charset first; a leading '-' or a
    // short run forces the numeric branch.
    expect(classifyTargetKind("-1001234567890")).toBe("numeric_id")
    expect(classifyTargetKind("123")).toBe("numeric_id")
  })

  it("classifies t.me links by shape", () => {
    expect(classifyTargetKind("https://t.me/durov")).toBe("public_link")
    expect(classifyTargetKind("https://t.me/+AbCdEf123")).toBe("invite_link")
    expect(classifyTargetKind("https://t.me/joinchat/AAAA")).toBe("invite_link")
    expect(classifyTargetKind("https://t.me/mybot?start=ref")).toBe("bot_link")
    // A named second segment (mini-app) is a bot link; a numeric one is a message link.
    expect(classifyTargetKind("https://t.me/someapp/launch")).toBe("bot_link")
    expect(classifyTargetKind("https://t.me/channel/123")).toBe("public_link")
  })

  it("classifies tg://resolve deep links", () => {
    expect(classifyTargetKind("tg://resolve?domain=durov")).toBe("public_link")
    expect(classifyTargetKind("tg://resolve?domain=bot&start=ref")).toBe("bot_link")
  })

  it("returns unknown for empty or malformed targets", () => {
    expect(classifyTargetKind("")).toBe("unknown")
    expect(classifyTargetKind("ab")).toBe("unknown")
    expect(classifyTargetKind("hello world!")).toBe("unknown")
  })
})

describe("analyzeTarget (no action context)", () => {
  it("returns a clean result for a plain username", () => {
    const result = analyzeTarget("@durov")
    expect(result.kind).toBe("username")
    expect(result.error).toBeUndefined()
    expect(result.warning).toBeUndefined()
  })

  it("warns on unusual formats", () => {
    expect(analyzeTarget("hello world!").warning).toBeTruthy()
  })

  it("warns (not errors) on invite links and bare numeric ids without an action", () => {
    expect(analyzeTarget("https://t.me/+AbCdEf123").warning).toContain("invite link")
    expect(analyzeTarget("-1001234567890").warning).toContain("Numeric")
  })
})
