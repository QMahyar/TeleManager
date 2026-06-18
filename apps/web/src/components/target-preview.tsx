import { IconAlertTriangle, IconCircleCheck, IconX } from "@tabler/icons-react"

import { actionMeta, type TargetKind } from "../lib/constants"
import { splitTargets } from "../lib/helpers"
import { classifyTargetKind } from "../lib/targeting"
import type { ActionType } from "../types"

const kindLabels: Record<TargetKind, string> = {
  invite_link: "invite link",
  public_link: "t.me link",
  username: "username",
  numeric_id: "numeric ID",
  bot_link: "bot link",
  unknown: "unknown",
}

function classifyPreviewTarget(target: string, actionType?: ActionType) {
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

export function TargetPreview({
  value,
  actionType,
}: {
  value: string
  actionType?: ActionType
}) {
  const targets = splitTargets(value)
  if (!targets.length) return null

  const analyzedTargets = targets.map((target) => ({
    target,
    result: classifyPreviewTarget(target, actionType),
  }))
  const errorCount = analyzedTargets.filter(({ result }) => result.error).length

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
        {analyzedTargets.map(({ target, result }) => {
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
