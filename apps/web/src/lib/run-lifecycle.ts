import {
  estimateOperationsSeconds,
} from "./action-meta"
import { TERMINAL_RUN_STATUSES } from "./queue-run"
import type {
  ActionsMeta,
  ActionType,
  QueueRun,
  SafetySettings,
} from "../types"

// Single source of truth for how a run's status reads across the shell (banner,
// operations rail, footer pulse). Before this, each surface re-derived "is it
// paused / waiting / running" with its own string checks and they drifted; now
// they all call runPhase() and share one label/tone vocabulary.

export type RunPhase =
  | "running"
  | "canceling"
  | "pausing"
  | "paused"
  | "waiting" // flood-wait auto-resume in progress
  | "terminal"

export function runPhase(run: Pick<QueueRun, "status">): RunPhase {
  const status = run.status
  if (TERMINAL_RUN_STATUSES.has(status)) return "terminal"
  if (status === "flood_waiting") return "waiting"
  if (status === "paused") return "paused"
  if (status === "pausing") return "pausing"
  if (status === "canceling") return "canceling"
  return "running"
}

// Short present-tense label for the phase (footer/rail). Terminal runs fall back
// to the raw status elsewhere, so this only names the live phases.
export const RUN_PHASE_LABEL: Record<RunPhase, string> = {
  running: "running",
  canceling: "canceling",
  pausing: "pausing",
  paused: "paused",
  waiting: "flood wait",
  terminal: "done",
}

// Whether the live phase is one the accent (sky) pulse suits (something is moving)
// vs an amber "held" state (paused / waiting on Telegram).
export function isHeldPhase(phase: RunPhase): boolean {
  return phase === "paused" || phase === "waiting"
}

// Control affordances. A pause can be requested while the run is genuinely
// progressing (including mid flood-wait, where it parks after the wait clears); a
// resume applies whenever a pause is pending or already held.
export function canPauseRun(run: QueueRun): boolean {
  return (
    !run.pause_requested &&
    ["queued", "running", "flood_waiting"].includes(run.status)
  )
}

export function canResumeRun(run: QueueRun): boolean {
  return Boolean(run.pause_requested) || ["pausing", "paused"].includes(run.status)
}

// Seconds until an ISO instant, floored at 0. Used for the flood-wait countdown.
export function secondsUntil(iso?: string | null): number {
  if (!iso) return 0
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, Math.round((target - Date.now()) / 1000))
}

// Estimated seconds left in a running queue: the not-yet-finished operations
// (pending/running) re-costed with the same inter-op model the pre-run estimate
// uses. Returns 0 when the run has no operation detail (older runs) or nothing
// remains, so callers can hide the readout.
export function estimateRemainingSeconds(
  run: QueueRun,
  safety: SafetySettings,
  meta: ActionsMeta | null
): number {
  const operations = run.operations || []
  const remaining = operations
    .filter((op) => {
      const status = String(op.status || "")
      return status === "pending" || status === "running"
    })
    .map((op) => ({
      type: String(op.action_type || "") as ActionType,
      account: String(op.account_id || ""),
    }))
  return estimateOperationsSeconds(remaining, safety, meta)
}
