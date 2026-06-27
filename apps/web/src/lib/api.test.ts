import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { api } from "./api"

const schema = z.object({ value: z.number() })

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      headers: { get: () => "application/json" },
      json: async () => body,
    })
  )
}

afterEach(() => vi.unstubAllGlobals())

describe("api() boundary validation", () => {
  it("returns parsed data when the response matches the schema", async () => {
    mockFetch({ value: 42 })
    await expect(api("/x", {}, schema)).resolves.toEqual({ value: 42 })
  })

  it("throws on shape drift instead of passing bad data through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch({ value: "not-a-number" })
    await expect(api("/x", {}, schema)).rejects.toThrow(/Unexpected response shape/)
  })

  it("surfaces the backend detail on a non-ok response", async () => {
    mockFetch({ detail: "nope" }, false)
    await expect(api("/x", {}, schema)).rejects.toThrow("nope")
  })
})
