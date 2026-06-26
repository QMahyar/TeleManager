import {
  IconAlertTriangle,
  IconInfoCircle,
  IconPlayerPlay,
} from "@tabler/icons-react"

import { queueRunProgress, relTime, statusTone } from "../../lib/helpers"
import { Badge, Callout, Readout, ReadoutItem } from "../ui"
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
//
// Flat by design: two divider-separated sections (no nested cards), and the
// queue metrics use the same Readout instrument as the Actions screen so the
// "steps · operations" reading is the one shape the operator learns once.
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
      <p className="type-eyebrow mb-4 text-muted-foreground">Activity</p>
      <div className="space-y-5">
        <section className="space-y-3">
          <RailHeader
            icon={IconPlayerPlay}
            title="Queue"
            action="Open Actions"
            onAction={() => openView("actions")}
          />
          <Readout>
            <ReadoutItem
              tone={queue.length ? "ready" : "idle"}
              value={queue.length}
              label="steps"
            />
            <ReadoutItem value={operationCount} label="operations" />
          </Readout>
          {activeRun ? (
            <ActiveRunProgress activeRun={activeRun} />
          ) : destructiveCount ? (
            <Callout tone="danger" icon={IconAlertTriangle}>
              {destructiveCount} destructive queued
            </Callout>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              Queue state stays visible while you move between screens.
            </p>
          )}
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <RailHeader icon={IconInfoCircle} title="Last run" />
          {lastRun ? (
            <LastRunSummary lastRun={lastRun} />
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              Run history appears after the first queued execution.
            </p>
          )}
        </section>
      </div>
    </aside>
  )
}

// Section header for the rail: accent icon-square + title, with an optional
// trailing text action. No card chrome — the section is grouped by spacing and
// (for the second one) a hairline divider.
function RailHeader({
  icon: Icon,
  title,
  action,
  onAction,
}: {
  icon: React.ElementType
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </span>
        <h3 className="type-subheading text-foreground">{title}</h3>
      </div>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}

// The live run, shown in the Queue section while something is executing. Mirrors
// the footer pulse but with a progress bar (the rail has room; the footer
// doesn't), so the two read as one system rather than duplicates.
function ActiveRunProgress({ activeRun }: { activeRun: QueueRun }) {
  const { completedCount, operationCount, failedCount, progress } =
    queueRunProgress(activeRun)
  const status = activeRun.status || "running"

  return (
    <div className="space-y-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-xs text-sky-600 dark:text-sky-400">
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
