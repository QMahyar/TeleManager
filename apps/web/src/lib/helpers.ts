import type { Account, QueueRun, TelegramDialog } from "../types"

export function splitTargets(value: string) {
  return value
    .split(/[\n,]+/)
    .map((target) => target.trim())
    .filter(Boolean)
}

export function accountStatus(account: Account) {
  if (account.last_error) return "error"
  if (account.status === "password_pending") return "needs 2FA"
  if (account.status === "login_pending") return "code sent"
  if (!account.authorized) return "needs login"
  return "ready"
}

export function statusTone(status: string) {
  if (["ready", "ok", "completed", "active"].includes(status)) {
    return "text-primary border-primary/30 bg-primary/10"
  }
  if (["running", "queued", "canceling"].includes(status)) {
    return "text-sky-600 border-sky-500/30 bg-sky-500/10 dark:text-sky-400"
  }
  if (
    ["needs login", "needs 2FA", "code sent", "flood_wait", "paused"].includes(
      status
    )
  ) {
    return "text-amber-600 border-amber-500/30 bg-amber-500/10 dark:text-amber-400"
  }
  if (["error", "failed", "canceled", "interrupted"].includes(status)) {
    return "text-destructive border-destructive/30 bg-destructive/10"
  }
  return "text-muted-foreground border-border bg-muted/40"
}

export function humanTime(value?: string) {
  if (!value) return "Now"
  return new Date(value).toLocaleString()
}

// Compact relative time ("just now", "4m ago", "3h ago", "2d ago") for the
// activity rail and status bar, where an absolute timestamp is too heavy.
export function relTime(value?: string) {
  if (!value) return ""
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ""
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

export function dialogKind(dialog: TelegramDialog) {
  return (
    dialog.dialog_type ||
    dialog.kind ||
    dialog.type ||
    dialog.entity_type ||
    "unknown"
  )
}

export function dialogTarget(dialog: TelegramDialog) {
  return dialog.username ? `@${dialog.username}` : String(dialog.id)
}

export function queueRunProgress(run: QueueRun) {
  const operationCount = run.operation_count || 0
  const completedCount = run.completed_count || 0
  const failedCount = run.failed_count || 0
  const progress = operationCount
    ? Math.min(100, Math.round((completedCount / operationCount) * 100))
    : 0
  return { operationCount, completedCount, failedCount, progress }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
