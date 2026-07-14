import * as React from "react"

import {
  IconClockPause,
  IconHourglassHigh,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Badge } from "../../components/ui"
import { formatDuration } from "../../lib/action-meta"
import { queueRunProgress, statusTone } from "../../lib/helpers"
import {
  canPauseRun,
  canResumeRun,
  estimateRemainingSeconds,
  isHeldPhase,
  runPhase,
  secondsUntil,
} from "../../lib/run-lifecycle"
import type { ActionsMeta, QueueRun, SafetySettings } from "../../types"
import type { ActionsScreenProps } from "../screen-props"

// Re-render once a second while a run is live so the flood-wait countdown and the
// "~time left" estimate tick down smoothly between the 1.2s data polls.
function useSecondTick(active: boolean) {
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    if (!active) return undefined
    const id = window.setInterval(force, 1000)
    return () => window.clearInterval(id)
  }, [active])
}

export function ActiveRunBanner({
  activeRunId,
  activeRun,
  cancelActiveRun,
  pauseActiveRun,
  resumeActiveRun,
  guarded,
  safety,
  actionsMeta,
}: {
  activeRunId: string | null
  activeRun: QueueRun | null
  cancelActiveRun: () => Promise<void>
  pauseActiveRun: () => Promise<void>
  resumeActiveRun: () => Promise<void>
  guarded: ActionsScreenProps["guarded"]
  safety: SafetySettings
  actionsMeta: ActionsMeta | null
}) {
  useSecondTick(Boolean(activeRunId))
  if (!activeRunId) return null

  const phase = activeRun ? runPhase(activeRun) : "running"
  const held = isHeldPhase(phase)
  const { completedCount, operationCount, failedCount, progress } = activeRun
    ? queueRunProgress(activeRun)
    : { completedCount: 0, operationCount: 0, failedCount: 0, progress: 0 }
  const status = activeRun?.status || "running"
  const currentTarget =
    activeRun?.current && typeof activeRun.current === "object"
      ? String((activeRun.current as Record<string, unknown>).target || "")
      : ""

  const floodRemaining =
    phase === "waiting" ? secondsUntil(activeRun?.resume_at) : 0
  const etaRemaining =
    activeRun && phase === "running"
      ? estimateRemainingSeconds(activeRun, safety, actionsMeta)
      : 0

  // Accent: amber while held (paused / waiting on Telegram), sky while moving.
  const accent = held
    ? "border-warning/40 bg-warning/10"
    : "border-info/40 bg-info/10"

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border ${accent} p-4 text-sm`}
      role="status"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <PhaseIcon phase={phase} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{PHASE_HEADING[phase]}</strong>
              <Badge tone={statusTone(status)}>{status.replace("_", " ")}</Badge>
              <span className="text-muted-foreground">
                {completedCount}/{operationCount} done
                {failedCount ? ` · ${failedCount} failed` : ""}
              </span>
              {etaRemaining > 0 ? (
                <span className="text-muted-foreground">
                  · ~{formatDuration(etaRemaining)} left
                </span>
              ) : null}
            </div>
            <BannerSubline
              phase={phase}
              floodRemaining={floodRemaining}
              currentTarget={currentTarget}
            />
          </div>
        </div>
        <RunControls
          activeRun={activeRun}
          guarded={guarded}
          pauseActiveRun={pauseActiveRun}
          resumeActiveRun={resumeActiveRun}
          cancelActiveRun={cancelActiveRun}
        />
      </div>

      {/* Determinate progress bar; amber while held so the whole banner reads as
          one state. */}
      <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            held ? "bg-warning" : "bg-info"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

const PHASE_HEADING: Record<string, string> = {
  running: "Queue running",
  canceling: "Canceling queue",
  pausing: "Pausing queue",
  paused: "Queue paused",
  waiting: "Waiting out a flood limit",
  terminal: "Queue finished",
}

function PhaseIcon({ phase }: { phase: string }) {
  if (phase === "paused")
    return <IconPlayerPause className="size-4 shrink-0 text-warning" />
  if (phase === "waiting")
    return <IconHourglassHigh className="size-4 shrink-0 text-warning" />
  if (phase === "pausing")
    return <IconClockPause className="size-4 shrink-0 animate-pulse motion-reduce:animate-none text-info" />
  return (
    <IconLoader2 className="size-4 shrink-0 animate-spin text-info" />
  )
}

function BannerSubline({
  phase,
  floodRemaining,
  currentTarget,
}: {
  phase: string
  floodRemaining: number
  currentTarget: string
}) {
  if (phase === "waiting") {
    return (
      <p className="text-xs text-warning">
        {floodRemaining > 0
          ? `Telegram rate-limited this account — auto-resuming in ${formatDuration(floodRemaining)}.`
          : "Rate limit cleared — resuming…"}
      </p>
    )
  }
  if (phase === "paused") {
    return (
      <p className="text-xs text-muted-foreground">
        Parked between operations. Sessions stay reserved until you resume or cancel.
      </p>
    )
  }
  if (phase === "pausing") {
    return (
      <p className="text-xs text-muted-foreground">
        Finishing the current operation, then holding.
      </p>
    )
  }
  if (currentTarget) {
    return (
      <p className="truncate font-mono text-xs text-muted-foreground">
        {currentTarget}
      </p>
    )
  }
  return null
}

function RunControls({
  activeRun,
  guarded,
  pauseActiveRun,
  resumeActiveRun,
  cancelActiveRun,
}: {
  activeRun: QueueRun | null
  guarded: ActionsScreenProps["guarded"]
  pauseActiveRun: () => Promise<void>
  resumeActiveRun: () => Promise<void>
  cancelActiveRun: () => Promise<void>
}) {
  const showResume = activeRun ? canResumeRun(activeRun) : false
  const showPause = activeRun ? canPauseRun(activeRun) : false

  return (
    <div className="flex shrink-0 items-center gap-2">
      {showResume ? (
        <Button variant="outline" onClick={() => guarded(resumeActiveRun)}>
          <IconPlayerPlay className="size-4" />
          Resume
        </Button>
      ) : showPause ? (
        <Button variant="outline" onClick={() => guarded(pauseActiveRun)}>
          <IconPlayerPause className="size-4" />
          Pause
        </Button>
      ) : null}
      <Button variant="destructive" onClick={() => guarded(cancelActiveRun)}>
        <IconPlayerStop className="size-4" />
        Cancel
      </Button>
    </div>
  )
}
