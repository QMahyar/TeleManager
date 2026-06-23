import { IconAlertTriangle, IconInfoCircle, IconPlayerPlay } from "@tabler/icons-react"

import { cn } from "../../ui/utils"
import { Badge } from "../ui"
import type { QueueRun, QueueStep, View } from "../../types"
import {
  countDestructiveOperations,
  countQueueOperations,
} from "./queue-metrics"

// The right rail carries only what genuinely benefits from staying visible while
// you move between screens: the live queue and the last run. Fleet and schedule
// counts live on their own screens (sidebar + Accounts + Actions) and were
// duplicated here before — showing the same number three places just makes a
// normal user wonder which one to trust.
export function OperationsRail({
  queue,
  runs,
  openView,
}: {
  queue: QueueStep[]
  runs: QueueRun[]
  openView: (view: View) => void
}) {
  const operationCount = countQueueOperations(queue)
  const destructiveCount = countDestructiveOperations(queue)
  const lastRun = runs[0]

  return (
    <aside className="hidden border-l border-border bg-card/30 px-4 py-4 2xl:sticky 2xl:top-0 2xl:block 2xl:h-svh 2xl:overflow-auto">
      <div className="space-y-4">
        <div>
          <p className="font-mono text-[0.62rem] font-semibold tracking-[0.24em] text-muted-foreground uppercase">
            Activity
          </p>
          <h2 className="mt-1 font-heading text-lg tracking-tight">Queue</h2>
        </div>

        <RailCard
          title="Queue"
          icon={IconPlayerPlay}
          action="Open Actions"
          onAction={() => openView("actions")}
        >
          <div className="grid grid-cols-2 gap-2">
            <RailMetric label="Steps" value={queue.length} />
            <RailMetric label="Operations" value={operationCount} tone="primary" />
          </div>
          {destructiveCount ? (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <IconAlertTriangle className="size-3.5 shrink-0" />
              {destructiveCount} destructive queued
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Queue state stays visible while you move between screens.
            </p>
          )}
        </RailCard>

        <RailCard title="Last run" icon={IconInfoCircle}>
          {lastRun ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <Badge tone="border-border bg-muted/40 text-muted-foreground">
                  {lastRun.status}
                </Badge>
              </div>
              <p className="font-mono text-muted-foreground break-all">{lastRun.id}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Run history appears after the first queued execution.
            </p>
          )}
        </RailCard>
      </div>
    </aside>
  )
}

function RailCard({
  title,
  icon: Icon,
  action,
  onAction,
  children,
}: React.PropsWithChildren<{
  title: string
  icon: React.ElementType
  action?: string
  onAction?: () => void
}>) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-3.5" />
          </span>
          <h3 className="font-heading text-sm">{title}</h3>
        </div>
        {action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function RailMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone?: "primary" | "danger"
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <span className="block text-[0.62rem] text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "font-mono text-lg",
          tone === "primary" && "text-primary",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </strong>
    </div>
  )
}
