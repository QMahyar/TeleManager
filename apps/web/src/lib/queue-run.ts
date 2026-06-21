import { api } from "./api"
import type { QueueRun } from "../types"

// Statuses a run can no longer move out of. Shared by the Actions banner poller
// and the Dialogs in-place quick-action runner so both agree on "done".
export const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "canceled",
  "interrupted",
  "flood_wait",
])

// Kick off a queue run. The backend requires confirm:true, so we always set it
// here — callers pass the queue payload (steps + optional safety fields).
export async function startQueueRun(
  payload: object
): Promise<{ run_id: string; operation_count: number }> {
  return api<{ run_id: string; operation_count: number }>(
    "/api/actions/queue/run",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, confirm: true }),
    }
  )
}

// Poll a run until it reaches a terminal status, returning the final run.
// `onTick` fires on every poll (including the terminal one) so callers can keep
// live UI (progress banner, run-history list) in sync.
export async function awaitQueueRun(
  runId: string,
  onTick?: (run: QueueRun) => void | Promise<void>,
  intervalMs = 1200
): Promise<QueueRun> {
  for (;;) {
    const payload = await api<{ run: QueueRun }>(
      `/api/actions/queue/runs/${runId}`
    )
    const run = payload.run
    if (onTick) await onTick(run)
    if (TERMINAL_RUN_STATUSES.has(run.status)) return run
    await wait(intervalMs)
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
