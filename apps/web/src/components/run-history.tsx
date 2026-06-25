import * as React from "react"

import {
  IconAlertTriangle,
  IconPlayerPlay,
  IconProgressCheck,
} from "@tabler/icons-react"
import { Button } from "../ui/button"
import { Modal } from "../ui/modal"
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
import type { AskDialog, ActionType, Flash, QueueRun } from "../types"
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
  flash: Flash
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
                flash(`Cleared ${payload.removed} queue run(s).`, "success")
                await loadRuns()
              })
            }
          >
            Clear
          </Button>
        </div>
      </div>
      {runs.length ? (
        <RunHistoryList
          runs={runs}
          guarded={guarded}
          loadRuns={loadRuns}
          flash={flash}
          askDialog={askDialog}
          onRetryQueued={onRetryQueued}
          setSelectedRun={setSelectedRun}
        />
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

function RunHistoryList({
  runs,
  guarded,
  loadRuns,
  flash,
  askDialog,
  onRetryQueued,
  setSelectedRun,
}: {
  runs: QueueRun[]
  guarded: (work: () => Promise<void>) => Promise<void>
  loadRuns: () => Promise<void>
  flash: Flash
  askDialog: AskDialog
  onRetryQueued?: (runId: string) => Promise<void>
  setSelectedRun: React.Dispatch<React.SetStateAction<QueueRun | null>>
}) {
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <div className="grid min-w-[48rem] grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_9rem] gap-3 border-b border-border bg-muted/20 px-3 py-2 font-mono text-[0.62rem] tracking-[0.18em] text-muted-foreground uppercase">
        <span>Run</span>
        <span>Status</span>
        <span className="text-right">Done</span>
        <span className="text-right">Failed</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="max-h-[34rem] min-w-[48rem] overflow-auto">
        {runs.map((run) => (
          <RunHistoryRow
            key={run.id}
            run={run}
            guarded={guarded}
            loadRuns={loadRuns}
            flash={flash}
            askDialog={askDialog}
            onRetryQueued={onRetryQueued}
            setSelectedRun={setSelectedRun}
          />
        ))}
      </div>
    </div>
  )
}

function RunHistoryRow({
  run,
  guarded,
  loadRuns,
  flash,
  askDialog,
  onRetryQueued,
  setSelectedRun,
}: {
  run: QueueRun
  guarded: (work: () => Promise<void>) => Promise<void>
  loadRuns: () => Promise<void>
  flash: Flash
  askDialog: AskDialog
  onRetryQueued?: (runId: string) => Promise<void>
  setSelectedRun: React.Dispatch<React.SetStateAction<QueueRun | null>>
}) {
  const { operationCount, completedCount, failedCount, progress } =
    queueRunProgress(run)
  const canRetry = TERMINAL_RUN_STATUSES.has(run.status) && failedCount > 0
  const terminal = TERMINAL_RUN_STATUSES.has(run.status)

  async function openDetails() {
    const payload = await api<{ run: QueueRun }>(
      `/api/actions/queue/runs/${run.id}`
    )
    setSelectedRun(payload.run)
  }

  async function exportRun() {
    const response = await fetch(`/api/actions/queue/runs/${run.id}/export`)
    if (!response.ok) {
      // Parse the server's detail without a try whose catch would swallow the throw.
      const detail = await response
        .json()
        .then((payload: { detail?: string }) => payload?.detail)
        .catch(() => null)
      throw new Error(detail || "Export failed")
    }
    const blob = await response.blob()
    downloadBlob(blob, `queue-run-${run.id}.json`)
  }

  async function retryFailed() {
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
    }>(`/api/actions/queue/runs/${run.id}/retry-failed`, { method: "POST" })
    flash("Retry queued.", "success")
    await loadRuns()
    if (onRetryQueued) void onRetryQueued(payload.run_id)
  }

  async function cancelRun() {
    await api(`/api/actions/queue/runs/${run.id}/cancel`, { method: "POST" })
    flash("Cancel requested.")
    await loadRuns()
  }

  async function deleteRun() {
    const confirmed = await askDialog({
      title: "Delete queue run?",
      description: "This removes the local history record for this queue run.",
      confirmLabel: "Delete Run",
      danger: true,
    })
    if (!confirmed) return
    await api(`/api/actions/queue/runs/${run.id}`, { method: "DELETE" })
    flash("Queue run deleted.", "success")
    await loadRuns()
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_9rem] gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-0 hover:bg-muted/20">
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate font-mono text-xs">{run.id}</strong>
          {run.schedule_id ? (
            <Badge tone="border-primary/30 bg-primary/10 text-primary">
              scheduled
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{humanTime(run.created_at)}</p>
        <RunProgressBar
          completedCount={completedCount}
          operationCount={operationCount}
          progress={progress}
          compact
        />
      </div>
      <div>
        <Badge tone={statusTone(run.status)}>{run.status}</Badge>
      </div>
      <div className="text-right font-mono text-xs text-muted-foreground">
        {completedCount}/{operationCount || 0}
      </div>
      <div className="text-right font-mono text-xs">
        <span className={failedCount ? "text-destructive" : "text-muted-foreground"}>
          {failedCount}
        </span>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="xs" variant="outline" onClick={() => guarded(openDetails)}>
          View
        </Button>
        <Button size="xs" variant="outline" onClick={() => guarded(exportRun)}>
          Export
        </Button>
        {canRetry ? (
          <Button size="xs" variant="outline" onClick={() => guarded(retryFailed)}>
            Retry
          </Button>
        ) : null}
        {!terminal ? (
          <Button size="xs" variant="destructive" onClick={() => guarded(cancelRun)}>
            Cancel
          </Button>
        ) : (
          <Button size="xs" variant="destructive" onClick={() => guarded(deleteRun)}>
            Delete
          </Button>
        )}
      </div>
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
  const operations = run?.operations || []
  const results = run?.results || []
  const error = run?.error
  const current = run?.current
  const progress = run ? queueRunProgress(run) : null

  return (
    <Modal
      open={Boolean(run)}
      onClose={onClose}
      className="max-h-[90vh] max-w-5xl overflow-hidden"
      labelledBy="queue-run-title"
    >
      {run && progress ? (
        <>
        <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-primary uppercase">
              Queue run details
            </p>
            <h2
              id="queue-run-title"
              className="mt-2 font-mono text-xl break-all font-medium tracking-normal"
            >
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
        </>
      ) : null}
    </Modal>
  )
}

function CurrentOperationPanel({ current }: { current: QueueRun["current"] }) {
  if (!current) {
    return null
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
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
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
    <div className="rounded-lg border border-border bg-background p-3">
      <span className="text-[0.65rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </span>
      <strong className="mt-2 block font-mono text-2xl">{value}</strong>
    </div>
  )
}

function RunProgressBar({
  completedCount,
  operationCount,
  progress,
  compact = false,
}: {
  completedCount: number
  operationCount: number
  progress: number
  compact?: boolean
}) {
  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {!compact ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {completedCount}/{operationCount || 0} complete
          </span>
          <span>{progress}%</span>
        </div>
      ) : null}
      <div className={compact ? "h-1.5 overflow-hidden rounded-full bg-muted/50" : "h-2 overflow-hidden rounded-full border border-border bg-muted/40"}>
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
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
