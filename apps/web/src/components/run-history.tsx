import * as React from "react"

import { IconPlayerPlay } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@workspace/ui/components/table"

import { api } from "../lib/api"
import { actionMeta } from "../lib/constants"
import { humanTime, statusTone } from "../lib/helpers"
import type { AskDialog, ActionType, QueueRun } from "../types"
import { Badge, SectionTitle } from "./ui"

function isTerminal(status: string) {
  return ["completed", "failed", "canceled", "interrupted"].includes(status)
}

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
        runs.map((run) => (
          <div
            key={run.id}
            className="grid gap-3 border border-border p-3 text-sm md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{run.id}</strong>
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {humanTime(run.created_at)} / {run.completed_count || 0} done /{" "}
                {run.failed_count || 0} failed
              </p>
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
                    if (!response.ok) throw new Error("Export failed")
                    const blob = await response.blob()
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement("a")
                    link.href = url
                    link.download = `queue-run-${run.id}.json`
                    link.click()
                    URL.revokeObjectURL(url)
                  })
                }
              >
                Export
              </Button>
              {isTerminal(run.status) ? (
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
                      if (onRetryQueued) await onRetryQueued(payload.run_id)
                    })
                  }
                >
                  Retry Failed
                </Button>
              ) : (
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
              )}
              {isTerminal(run.status) ? (
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
        ))
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <IconPlayerPlay className="size-8 text-muted-foreground/50" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              No queue runs yet
            </p>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              Build a queue in the Action Queue panel and run it. Completed and
              canceled runs appear here.
            </p>
          </div>
        </div>
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
  const results = Array.isArray(
    (run as QueueRun & { results?: unknown[] }).results
  )
    ? ((run as QueueRun & { results?: unknown[] }).results as Array<
        Record<string, unknown>
      >)
    : []
  const error = (run as QueueRun & { error?: string | null }).error
  const current = (
    run as QueueRun & { current?: Record<string, unknown> | null }
  ).current

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
              {run.operation_count || operations.length} operation(s)
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
            <RunStat label="Completed" value={run.completed_count || 0} />
            <RunStat label="Failed" value={run.failed_count || 0} />
            <RunStat label="Results" value={results.length} />
            <RunStat
              label="Total"
              value={run.operation_count || operations.length}
            />
          </div>
          {current ? (
            <div className="border border-primary/30 bg-primary/10 p-3 text-sm">
              <strong>Current operation</strong>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {String(current.action_type || "operation")} →{" "}
                {String(current.target || "target")}
              </p>
            </div>
          ) : null}
          {error ? (
            <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
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
                            tone={statusTone(
                              String(operation.status || "queued")
                            )}
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
                            operation.account_label ||
                              operation.account_id ||
                              "—"
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
                    <TableCell
                      colSpan={5}
                      className="p-6 text-muted-foreground"
                    >
                      No operation details were stored for this run.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </div>
      </section>
    </div>
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

function actionLabel(actionType: string) {
  const meta = actionMeta[actionType as ActionType]
  return meta?.label || actionType || "—"
}
