import * as React from "react"

import { useQuery } from "@tanstack/react-query"

import { api } from "../lib/api"
import { TERMINAL_RUN_STATUSES } from "../lib/queue-run"
import type { Flash, QueueRun } from "../types"

// Polls an in-flight queue run to completion, exposing the live run so the
// shell (footer pulse, rail progress) and the Actions screen (banner, Run
// button) can all read the same state. The poll loop is now a react-query query
// whose refetchInterval stops itself at a terminal status; the completion
// side-effects (summary toast, fleet refresh, clear) live in effects. Public
// shape is unchanged from the awaitQueueRun version.
export function useRunPolling(
  loadRuns: () => Promise<void>,
  refresh: () => Promise<void>,
  flash: Flash
) {
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null)
  // Guards the one-shot completion side-effects so a re-render between the
  // terminal tick and the clear can't fire the toast / refresh twice.
  const settledRef = React.useRef(false)

  const runQuery = useQuery({
    queryKey: ["active-run", activeRunId],
    queryFn: () =>
      api<{ run: QueueRun }>(`/api/actions/queue/runs/${activeRunId}`).then(
        (payload) => payload.run
      ),
    enabled: activeRunId !== null,
    // Poll every 1.2s until the run reaches a terminal status, then stop.
    refetchInterval: (query) => {
      const run = query.state.data
      return run && TERMINAL_RUN_STATUSES.has(run.status) ? false : 1200
    },
  })

  const activeRun = activeRunId ? (runQuery.data ?? null) : null

  // Mirror each successful poll into the runs list so history updates live while
  // the queue runs (the old loop refreshed the list on every tick).
  const runData = runQuery.data
  React.useEffect(() => {
    if (activeRunId && runData) loadRuns().catch(() => {})
  }, [activeRunId, runData, loadRuns])

  // On a terminal run: summarise, refresh the fleet, and clear — once.
  React.useEffect(() => {
    if (!activeRunId) return
    const run = runQuery.data
    if (run && TERMINAL_RUN_STATUSES.has(run.status) && !settledRef.current) {
      settledRef.current = true
      flash(
        `Queue ${run.status.replace("_", " ")}: ${run.completed_count || 0}/${run.operation_count || 0} succeeded.`
      )
      refresh().catch(() => {})
      setActiveRunId(null)
    }
  }, [activeRunId, runQuery.data, flash, refresh])

  // If polling fails outright (after retries), surface it and clear so the
  // banner doesn't hang on "running" forever.
  React.useEffect(() => {
    if (activeRunId && runQuery.isError && !settledRef.current) {
      settledRef.current = true
      flash(
        runQuery.error instanceof Error
          ? runQuery.error.message
          : "Queue polling failed."
      )
      setActiveRunId(null)
    }
  }, [activeRunId, runQuery.isError, runQuery.error, flash])

  const pollQueueRun = React.useCallback(async (runId: string) => {
    settledRef.current = false
    setActiveRunId(runId)
  }, [])

  const cancelActiveRun = React.useCallback(async () => {
    if (!activeRunId) return
    try {
      await api(`/api/actions/queue/runs/${activeRunId}/cancel`, {
        method: "POST",
      })
      flash("Cancel requested. The queue stops before the next operation.")
      await loadRuns()
    } catch (error) {
      flash(error instanceof Error ? error.message : "Cancel failed.")
    }
  }, [activeRunId, flash, loadRuns])

  return { activeRunId, activeRun, pollQueueRun, cancelActiveRun }
}
