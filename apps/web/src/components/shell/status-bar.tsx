import { IconMoon, IconSun } from "@tabler/icons-react"

import { Button } from "../../ui/button"

import { queueRunProgress } from "../../lib/helpers"
import { isHeldPhase, runPhase } from "../../lib/run-lifecycle"
import { countQueueOperations } from "./queue-metrics"
import type { QueueRun, QueueStep } from "../../types"

// The footer status bar — the device that makes a browser app read as a desktop
// application. It carries ambient *environment* state: the local address + app
// version, how many operations are staged, and how many sessions are ready. When
// a queue is executing it also shows a live pulse in the centre. Reads as one
// mono instrument line spanning the width of the window.
export function StatusBar({
  version,
  activeRun,
  queue,
  readyCount,
  theme,
  onToggleTheme,
}: {
  version?: string
  activeRun: QueueRun | null
  queue: QueueStep[]
  readyCount: number
  theme: "dark" | "light" | "system"
  onToggleTheme: () => void
}) {
  const stagedOps = countQueueOperations(queue)
  // The address the app is actually served from (dev proxy aside). Falls back to
  // the documented local bind when the host is empty (e.g. file://).
  const host = window.location.host || "127.0.0.1:8000"

  return (
    <footer className="frosted flex h-9 shrink-0 items-center justify-between gap-3 border-t border-sidebar-border px-3 font-mono text-[0.7rem] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
        <span className="truncate">
          local · {host}
          <span className="hidden text-muted-foreground/70 sm:inline">
            {" · "}v{version ?? "—"}
          </span>
          {stagedOps > 0 ? (
            <span className="hidden md:inline">
              {" · "}
              {stagedOps} operations staged
            </span>
          ) : null}
        </span>
      </div>

      <RunPulse activeRun={activeRun} />

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-1 text-muted-foreground/60 lg:inline-flex">
          <kbd className="rounded border border-border px-1">Ctrl K</kbd>
          <span>commands</span>
        </span>
        <span className="hidden sm:inline">
          {readyCount} sessions ready
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </Button>
      </div>
    </footer>
  )
}

// Only present while a queue is executing. A pulsing dot + live count turns the
// otherwise-quiet bar into the app's heartbeat, visible from any screen.
function RunPulse({ activeRun }: { activeRun: QueueRun | null }) {
  if (!activeRun) {
    return <span className="hidden flex-1 sm:block" aria-hidden />
  }

  const { completedCount, operationCount } = queueRunProgress(activeRun)
  const phase = runPhase(activeRun)
  const held = isHeldPhase(phase)

  return (
    <div
      className={[
        "flex min-w-0 flex-1 items-center justify-center gap-2",
        held ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400",
      ].join(" ")}
      role="status"
    >
      <span className="relative flex size-2 shrink-0">
        {/* The ping only reads right for genuine motion; a held run shows a steady
            dot so "paused" doesn't look like it's still working. */}
        {held ? null : (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        )}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      <span className="truncate">
        {PULSE_LABEL[phase]} {completedCount}/{operationCount}
      </span>
    </div>
  )
}

const PULSE_LABEL: Record<string, string> = {
  running: "running",
  canceling: "canceling",
  pausing: "pausing",
  paused: "paused",
  waiting: "flood wait",
  terminal: "done",
}
