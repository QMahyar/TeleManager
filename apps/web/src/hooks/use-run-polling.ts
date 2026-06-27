import * as React from "react"

import { api } from "../lib/api"
import { awaitQueueRun } from "../lib/queue-run"
import type { Flash, QueueRun } from "../types"

// Polls an in-flight queue run to completion, exposing the live run so the
// shell (footer pulse, rail progress) and the Actions screen (banner, Run
// button) can all read the same state. Lifted out of ActionsScreen unchanged.
export function useRunPolling(
  loadRuns: () => Promise<void>,
  refresh: () => Promise<void>,
  flash: Flash
) {
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null)
  const [activeRun, setActiveRun] = React.useState<QueueRun | null>(null)

  const pollQueueRun = React.useCallback(
    async (runId: string) => {
      setActiveRunId(runId)
      try {
        const run = await awaitQueueRun(runId, async (current) => {
          setActiveRun(current)
          await loadRuns()
        })
        await refresh()
        flash(
          `Queue ${run.status.replace("_", " ")}: ${run.completed_count || 0}/${run.operation_count || 0} succeeded.`
        )
      } catch (error) {
        flash(error instanceof Error ? error.message : "Queue polling failed.")
      } finally {
        setActiveRunId(null)
        setActiveRun(null)
      }
    },
    [flash, loadRuns, refresh]
  )

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
