import { IconAlertTriangle, IconCircleCheck, IconX } from "@tabler/icons-react"

import { splitTargets } from "../lib/helpers"
import { analyzeTarget } from "../lib/targeting"
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

  const analyzedTargets = targets.map((target) => ({
    target,
    result: analyzeTarget(target, actionType),
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
        {analyzedTargets.map(({ target, result }) => (
          <div
            key={target}
            className="flex flex-wrap items-center gap-2 border border-border/60 bg-background/60 px-2 py-1.5"
          >
            {result.error ? (
              <IconX className="size-3.5 text-destructive" />
            ) : result.warning ? (
              <IconAlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
            ) : (
              <IconCircleCheck className="size-3.5 text-primary" />
            )}
            <code className="min-w-0 flex-1 truncate">{target}</code>
            <span className="text-muted-foreground">{result.label}</span>
            {result.error ? (
              <span className="basis-full pl-5 text-destructive">
                {result.error}
              </span>
            ) : result.warning ? (
              <span className="basis-full pl-5 text-amber-600 dark:text-amber-400">
                {result.warning}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
