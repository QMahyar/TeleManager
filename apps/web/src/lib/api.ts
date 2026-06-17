export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, options)
  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : null
  if (!response.ok) {
    throw new Error(payload?.detail || "Request failed")
  }
  return (payload ?? response) as T
}

export function toForm(values: Record<string, string | number | Blob>) {
  const body = new FormData()
  Object.entries(values).forEach(([key, value]) =>
    body.set(key, value instanceof Blob ? value : String(value))
  )
  return body
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
