import { IconAlertTriangle, IconCircleCheck, IconX } from "@tabler/icons-react"

import { splitTargets } from "../lib/helpers"
import { classifyTarget } from "../lib/targeting"
import type { ActionType } from "../types"

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
