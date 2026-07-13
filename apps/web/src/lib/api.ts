import type { ZodType } from "zod"

export async function api<T>(
  path: string,
  options: RequestInit = {},
  // Optional runtime schema (see lib/schemas.ts). When passed, the response is
  // validated at this boundary instead of being trusted via an unchecked cast — a
  // backend/frontend shape drift then fails loudly here rather than crashing later.
  schema?: ZodType<T>
): Promise<T> {
  try {
    const response = await fetch(path, options)
    const contentType = response.headers.get("content-type") || ""
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : null
    if (!response.ok) {
      const error = new Error(payload?.detail || "Request failed")
      if (response.status === 401) {
        error.name = "AuthRequiredError"
      }
      throw error
    }
    const data = payload ?? response
    if (schema) {
      const result = schema.safeParse(data)
      if (!result.success) {
        // Log the field-level detail for debugging; surface a short message to the UI.
        console.error(`Response validation failed for ${path}:`, result.error)
        throw new Error(`Unexpected response shape from ${path}.`)
      }
      return result.data
    }
    return data as T
  } catch (error) {
    throw error instanceof Error ? error : new Error("Request failed")
  }
}

export function toForm(values: Record<string, string | number | Blob>) {
  const body = new FormData()
  Object.entries(values).forEach(([key, value]) =>
    body.set(key, value instanceof Blob ? value : String(value))
  )
  return body
}
