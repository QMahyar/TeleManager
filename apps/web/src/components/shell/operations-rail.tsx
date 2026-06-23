import { IconAlertTriangle, IconInfoCircle, IconPlayerPlay } from "@tabler/icons-react"

import { cn } from "../../ui/utils"
import { queueRunProgress, relTime, statusTone } from "../../lib/helpers"
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
  activeRun,
  openView,
}: {
  queue: QueueStep[]
  runs: QueueRun[]
  activeRun: QueueRun | null
  openView: (view: View) => void
}) {
  const operationCount = countQueueOperations(queue)
  const destructiveCount = countDestructiveOperations(queue)
  const lastRun = runs[0]

  return (
    <aside className="hidden border-l border-border bg-card/30 px-4 py-4 2xl:sticky 2xl:top-0 2xl:block 2xl:h-full 2xl:overflow-auto">
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
          {activeRun ? (
            <ActiveRunProgress activeRun={activeRun} />
          ) : destructiveCount ? (
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
            <LastRunSummary lastRun={lastRun} />
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

// The live run, shown in the Queue card while something is executing. Mirrors
// the footer pulse but with a progress bar (the rail has room; the footer
// doesn't), so the two read as one system rather than duplicates.
function ActiveRunProgress({ activeRun }: { activeRun: QueueRun }) {
  const { completedCount, operationCount, failedCount, progress } =
    queueRunProgress(activeRun)
  const status = activeRun.status || "running"

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-xs text-sky-600 dark:text-sky-400">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {status === "canceling" ? "Canceling" : "Running"}
        </span>
        <span className="font-mono">
          {completedCount}/{operationCount}
          {failedCount ? ` · ${failedCount} failed` : ""}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-sky-500/20">
        <div
          className="h-full rounded-full bg-current transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

// A human last-run line: outcome + relative time, instead of the raw UUID the
// rail used to print (which told an operator nothing).
function LastRunSummary({ lastRun }: { lastRun: QueueRun }) {
  const { completedCount, operationCount, failedCount } =
    queueRunProgress(lastRun)
  const when = relTime(lastRun.created_at)

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={statusTone(lastRun.status)}>
          {lastRun.status.replace("_", " ")}
        </Badge>
        {when ? <span className="text-muted-foreground">{when}</span> : null}
      </div>
      <p className="font-mono text-muted-foreground">
        {failedCount ? (
          <span className="text-destructive">✗ {failedCount} failed · </span>
        ) : null}
        {completedCount}/{operationCount} operations
      </p>
    </div>
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
