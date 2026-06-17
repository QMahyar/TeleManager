import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react"

import { splitTargets } from "../lib/helpers"

function classifyTarget(target: string) {
  if (/^https?:\/\/(t\.me|telegram\.me)\/(\+|joinchat\/)/i.test(target)) {
    return {
      label: "invite link",
      warning: "Private invite link. Confirm the target before running.",
    }
  }
  if (/^https?:\/\/(t\.me|telegram\.me)\/[A-Za-z0-9_]+/i.test(target)) {
    return { label: "t.me link" }
  }
  if (/^@[A-Za-z0-9_]{5,32}$/.test(target)) {
    return { label: "username" }
  }
  if (/^[A-Za-z0-9_]{5,32}$/.test(target)) {
    return {
      label: "plain username",
      warning: "Plain username has no @ prefix. Make sure it is intentional.",
    }
  }
  if (/^-?\d+$/.test(target)) {
    return {
      label: "numeric id",
      warning: "Numeric IDs can be account-specific and may not resolve.",
    }
  }
  return {
    label: "unknown",
    warning: "Target format is unusual. Preview carefully before running.",
  }
}

export function TargetPreview({ value }: { value: string }) {
  const targets = splitTargets(value)
  if (!targets.length) return null

  return (
    <div className="space-y-2 border border-border bg-muted/20 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">Target preview</span>
        <span className="text-muted-foreground">{targets.length} parsed</span>
      </div>
      <div className="space-y-1">
        {targets.map((target) => {
          const result = classifyTarget(target)
          return (
            <div
              key={target}
              className="flex flex-wrap items-center gap-2 border border-border/60 bg-background/60 px-2 py-1.5"
            >
              {result.warning ? (
                <IconAlertTriangle className="size-3.5 text-destructive" />
              ) : (
                <IconCircleCheck className="size-3.5 text-primary" />
              )}
              <code className="min-w-0 flex-1 truncate">{target}</code>
              <span className="text-muted-foreground">{result.label}</span>
              {result.warning ? (
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
