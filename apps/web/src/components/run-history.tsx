import * as React from "react"

import {
  IconAlertTriangle,
  IconPlayerPlay,
  IconProgressCheck,
} from "@tabler/icons-react"
import { Button } from "../ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "../ui/table"

import { api } from "../lib/api"
import { actionMeta } from "../lib/constants"
import {
  downloadBlob,
  humanTime,
  queueRunProgress,
  statusTone,
} from "../lib/helpers"
import type { AskDialog, ActionType, QueueRun } from "../types"
import { Badge, EmptyState, SectionTitle } from "./ui"

const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "canceled",
  "interrupted",
  "flood_wait",
])

export function RunHistory({
  runs,
  guarded,
  loadRuns,
  flash,
  askDialog,
  onRetryQueued,
}: {
  runs: QueueRun[]
  guarded: (work: () => Promise<void>) => Promise<void>
  loadRuns: () => Promise<void>
  flash: (message: string) => void
  askDialog: AskDialog
  onRetryQueued?: (runId: string) => Promise<void>
}) {
  const [selectedRun, setSelectedRun] = React.useState<QueueRun | null>(null)

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionTitle kicker="History" title="Recent Queue Runs" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => guarded(loadRuns)}>
            Refresh
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              guarded(async () => {
                const confirmed = await askDialog({
                  title: "Clear queue history?",
                  description:
                    "This removes all local queue run history. Active runs should finish or be canceled first.",
                  confirmLabel: "Clear History",
                  danger: true,
                })
                if (!confirmed) return
                const payload = await api<{ removed: number }>(
                  "/api/actions/queue/runs",
                  { method: "DELETE" }
                )
                flash(`Cleared ${payload.removed} queue run(s).`)
                await loadRuns()
              })
            }
          >
            Clear
          </Button>
        </div>
      </div>
      {runs.length ? (
        runs.map((run) => {
          const { operationCount, completedCount, failedCount, progress } =
            queueRunProgress(run)
          const canRetry =
            TERMINAL_RUN_STATUSES.has(run.status) && failedCount > 0

          return (
            <div
              key={run.id}
              className="grid gap-3 border border-border p-3 text-sm md:grid-cols-[1fr_auto]"
            >
              <div className="space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{run.id}</strong>
                    <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                    {run.schedule_id ? (
                      <Badge tone="border-primary/30 bg-primary/10 text-primary">
                        scheduled
                      </Badge>
                    ) : null}
                    {failedCount > 0 ? (
                      <Badge tone="text-destructive border-destructive/30 bg-destructive/10">
                        {failedCount} failed
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {humanTime(run.created_at)} / {completedCount} done /{" "}
                    {failedCount} failed / {operationCount} total
                  </p>
                </div>
                <RunProgressBar
                  completedCount={completedCount}
                  operationCount={operationCount}
                  progress={progress}
                />
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    guarded(async () => {
                      const payload = await api<{ run: QueueRun }>(
                        `/api/actions/queue/runs/${run.id}`
                      )
                      setSelectedRun(payload.run)
                    })
                  }
                >
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    guarded(async () => {
                      const response = await fetch(
                        `/api/actions/queue/runs/${run.id}/export`
                      )
                      if (!response.ok) {
                        try {
                          const payload = (await response.json()) as {
                            detail?: string
                          }
                          throw new Error(payload.detail || "Export failed")
                        } catch {
                          throw new Error("Export failed")
                        }
                      }
                      const blob = await response.blob()
                      downloadBlob(blob, `queue-run-${run.id}.json`)
                    })
                  }
                >
                  Export
                </Button>
                {canRetry ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      guarded(async () => {
                        const confirmed = await askDialog({
                          title: "Retry failed operations?",
                          description:
                            "This creates a new queue run containing only the failed operations from this run.",
                          confirmLabel: "Retry Failed",
                        })
                        if (!confirmed) return
                        const payload = await api<{
                          run_id: string
                          status: string
                          operation_count: number
                        }>(`/api/actions/queue/runs/${run.id}/retry-failed`, {
                          method: "POST",
                        })
                        flash("Retry queued.")
                        await loadRuns()
                        if (onRetryQueued) void onRetryQueued(payload.run_id)
                      })
                    }
                  >
                    Retry Failed
                  </Button>
                ) : null}
                {!TERMINAL_RUN_STATUSES.has(run.status) ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      guarded(async () => {
                        await api(`/api/actions/queue/runs/${run.id}/cancel`, {
                          method: "POST",
                        })
                        flash("Cancel requested.")
                        await loadRuns()
                      })
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
                {TERMINAL_RUN_STATUSES.has(run.status) ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      guarded(async () => {
                        const confirmed = await askDialog({
                          title: "Delete queue run?",
                          description:
                            "This removes the local history record for this queue run.",
                          confirmLabel: "Delete Run",
                          danger: true,
                        })
                        if (!confirmed) return
                        await api(`/api/actions/queue/runs/${run.id}`, {
                          method: "DELETE",
                        })
                        flash("Queue run deleted.")
                        await loadRuns()
                      })
                    }
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })
      ) : (
        <EmptyState
          icon={IconPlayerPlay}
          title="No queue runs yet"
          detail="Build a queue in the Action Queue panel and run it. Completed, failed, and canceled runs appear here."
        />
      )}
      <RunDetailsDialog
        run={selectedRun}
        onClose={() => setSelectedRun(null)}
      />
    </div>
  )
}

function RunDetailsDialog({
  run,
  onClose,
}: {
  run: QueueRun | null
  onClose: () => void
}) {
  React.useEffect(() => {
    if (!run) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [run, onClose])

  if (!run) return null

  const operations = run.operations || []
  const results = run.results || []
  const error = run.error
  const current = run.current
  const progress = queueRunProgress(run)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="queue-run-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden border border-border bg-card text-card-foreground shadow-2xl"
      >
        <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-primary uppercase">
              Queue run details
            </p>
            <h2 id="queue-run-title" className="mt-2 font-heading text-2xl">
              {run.id}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {humanTime(run.created_at)} /{" "}
              {progress.operationCount || operations.length} operation(s)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Badge tone={statusTone(run.status)}>{run.status}</Badge>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="max-h-[calc(90vh-7rem)] space-y-4 overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <RunStat label="Completed" value={progress.completedCount} />
            <RunStat label="Failed" value={progress.failedCount} />
            <RunStat label="Results" value={results.length} />
            <RunStat
              label="Total"
              value={progress.operationCount || operations.length}
            />
          </div>
          <RunProgressBar
            completedCount={progress.completedCount}
            operationCount={progress.operationCount || operations.length}
            progress={progress.progress}
          />
          <CurrentOperationPanel current={current} />
          <RunErrorPanel error={error} />
          <RunOperationsTable operations={operations} />
        </div>
      </section>
    </div>
  )
}

function CurrentOperationPanel({ current }: { current: QueueRun["current"] }) {
  if (!current) {
    return null
  }

  return (
    <div className="border border-primary/30 bg-primary/10 p-3 text-sm">
      <div className="flex items-center gap-2">
        <IconProgressCheck className="size-4 text-primary" />
        <strong>Current operation</strong>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {actionLabel(String(current.action_type || ""))}
      </p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {String(current.target || "target")}
      </p>
    </div>
  )
}

function RunErrorPanel({ error }: { error: QueueRun["error"] }) {
  if (!error) {
    return null
  }

  return (
    <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <div className="flex items-center gap-2">
        <IconAlertTriangle className="size-4" />
        <strong>Run error</strong>
      </div>
      <p className="mt-1">{error}</p>
    </div>
  )
}

function RunOperationsTable({
  operations,
}: {
  operations: NonNullable<QueueRun["operations"]>
}) {
  return (
    <TableWrap>
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {operations.length ? (
            operations.map((operation, index) => {
              const result = operation.result as
                | Record<string, unknown>
                | undefined
              const ok = result?.ok
              const detail =
                result?.error || result?.message || operation.error || "—"
              return (
                <TableRow
                  key={`${operation.account_id || "account"}-${operation.target || index}-${index}`}
                >
                  <TableCell>
                    <Badge
                      tone={statusTone(String(operation.status || "queued"))}
                    >
                      {String(operation.status || "queued")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {actionLabel(String(operation.action_type || ""))}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {String(operation.target || "—")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {String(
                      operation.account_label || operation.account_id || "—"
                    )}
                  </TableCell>
                  <TableCell
                    className={
                      ok === false
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {String(detail)}
                  </TableCell>
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="p-6 text-muted-foreground">
                No operation details were stored for this run.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableWrap>
  )
}

function RunStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background p-3">
      <span className="text-[0.65rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </span>
      <strong className="mt-2 block font-heading text-2xl">{value}</strong>
    </div>
  )
}

function RunProgressBar({
  completedCount,
  operationCount,
  progress,
}: {
  completedCount: number
  operationCount: number
  progress: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {completedCount}/{operationCount || 0} complete
        </span>
        <span>{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden border border-border bg-muted/40">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function actionLabel(actionType: string) {
  const meta = actionMeta[actionType as ActionType]
  return meta?.label || actionType || "—"
}
