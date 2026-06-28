import type * as React from "react"

// Panel header for the builder/queue columns: an accent icon-square + title,
// mirroring the operations-rail card header so the page's major surfaces share
// one identity. `hint` adds a one-line subtitle; `trailing` holds an action.
export function SectionLabel({
  icon: Icon,
  title,
  hint,
  trailing,
}: {
  icon?: React.ElementType
  title: string
  hint?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="type-heading text-foreground">{title}</h2>
          {hint ? (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  )
}
