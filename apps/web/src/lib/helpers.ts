import type { Account } from "../types"

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
  if (["ready", "ok", "completed", "running"].includes(status)) {
    return "text-primary border-primary/30 bg-primary/10"
  }
  if (
    ["error", "failed", "canceled", "needs login", "needs 2FA"].includes(status)
  ) {
    return "text-destructive border-destructive/30 bg-destructive/10"
  }
  return "text-muted-foreground border-border bg-muted/40"
}

export function humanTime(value?: string) {
  if (!value) return "Now"
  return new Date(value).toLocaleString()
}
