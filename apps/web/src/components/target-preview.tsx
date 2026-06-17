import { IconAlertTriangle, IconCircleCheck, IconX } from "@tabler/icons-react"

import { actionMeta, type TargetKind } from "../lib/constants"
import { splitTargets } from "../lib/helpers"
import type { ActionType } from "../types"

export function classifyTargetKind(target: string): TargetKind {
  const clean = target.trim()

  try {
    const url = new URL(clean)
    const isTme = [
      "t.me",
      "telegram.me",
      "www.t.me",
      "www.telegram.me",
    ].includes(url.hostname)
    if (isTme) {
      const path = url.pathname.replace(/^\/+|\/+$/g, "")
      if (path.startsWith("+") || path.startsWith("joinchat/"))
        return "invite_link"
      if (url.searchParams.get("start")) return "bot_link"
      if (path) return "public_link"
      return "unknown"
    }
  } catch {
    // not a URL
  }

  if (/^@?[A-Za-z0-9_]{5,32}$/.test(clean)) return "username"
  if (/^-?\d+$/.test(clean)) return "numeric_id"
  return "unknown"
}

const kindLabels: Record<TargetKind, string> = {
  invite_link: "invite link",
  public_link: "t.me link",
  username: "username",
  numeric_id: "numeric ID",
  bot_link: "bot link",
  unknown: "unknown",
}

function classifyTarget(target: string, actionType?: ActionType) {
  const kind = classifyTargetKind(target)
  const label = kindLabels[kind]
  const meta = actionType ? actionMeta[actionType] : undefined

  if (kind === "unknown") {
    return {
      label,
      kind,
      warning: "Target format is unusual. Preview carefully before running.",
    }
  }
  if (meta && !meta.validTargets.has(kind)) {
    return {
      label,
      kind,
      error: `${label} is not valid for "${meta.label}". Expected: ${meta.targetHint}`,
    }
  }
  if (kind === "invite_link" && !actionType) {
    return {
      label,
      kind,
      warning: "Private invite link. Confirm the target before running.",
    }
  }
  if (kind === "numeric_id" && !actionType) {
    return {
      label,
      kind,
      warning: "Numeric IDs can be account-specific and may not resolve.",
    }
  }

  return { label, kind }
}

export function validateTargets(
  targets: string[],
  actionType: ActionType
): string | null {
  for (const target of targets) {
    const result = classifyTarget(target, actionType)
    if ("error" in result && result.error) return result.error
  }
  return null
}

export function TargetPreview({
  value,
  actionType,
}: {
  value: string
  actionType?: ActionType
}) {
  const targets = splitTargets(value)
  if (!targets.length) return null

  const errorCount = targets.filter(
    (t) => classifyTarget(t, actionType).error
  ).length

  return (
    <div className="space-y-2 border border-border bg-muted/20 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">Target preview</span>
        <span className="text-muted-foreground">
          {targets.length} parsed
          {errorCount > 0 ? (
            <span className="ml-2 text-destructive">{errorCount} invalid</span>
          ) : null}
        </span>
      </div>
      <div className="space-y-1">
        {targets.map((target) => {
          const result = classifyTarget(target, actionType)
          const hasError = "error" in result && result.error
          const hasWarning = "warning" in result && result.warning
          return (
            <div
              key={target}
              className="flex flex-wrap items-center gap-2 border border-border/60 bg-background/60 px-2 py-1.5"
            >
              {hasError ? (
                <IconX className="size-3.5 text-destructive" />
              ) : hasWarning ? (
                <IconAlertTriangle className="size-3.5 text-destructive" />
              ) : (
                <IconCircleCheck className="size-3.5 text-primary" />
              )}
              <code className="min-w-0 flex-1 truncate">{target}</code>
              <span className="text-muted-foreground">{result.label}</span>
              {hasError ? (
                <span className="basis-full pl-5 text-destructive">
                  {result.error}
                </span>
              ) : hasWarning ? (
                <span className="basis-full pl-5 text-destructive">
                  {result.warning}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
