import { IconMoon, IconRefresh, IconSun } from "@tabler/icons-react"

import { Button } from "../../ui/button"

import { queueRunProgress } from "../../lib/helpers"
import type { QueueRun } from "../../types"

// The footer status bar — the device that makes a browser app read as a desktop
// application. It carries only ambient *environment* state that nothing else
// owns: the local connection, the app version, and whether a queue is executing
// right now. It deliberately does NOT repeat the rail (queue/last-run counts) or
// the sidebar fleet summary (ready/attention) — each chrome zone has one job.
export function StatusBar({
  version,
  activeRun,
  theme,
  onRefresh,
  onToggleTheme,
}: {
  version?: string
  activeRun: QueueRun | null
  theme: "dark" | "light" | "system"
  onRefresh: () => void
  onToggleTheme: () => void
}) {
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border bg-sidebar px-3 font-mono text-[0.7rem] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
        <span className="truncate">
          local · 127.0.0.1
          <span className="hidden text-muted-foreground/70 sm:inline">
            {" · "}v{version ?? "—"}
          </span>
        </span>
      </div>

      <RunPulse activeRun={activeRun} />

      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden items-center gap-1 pr-1 text-muted-foreground/60 lg:inline-flex">
          <kbd className="rounded border border-border px-1">Ctrl K</kbd>
          <span>commands</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          aria-label="Refresh data"
        >
          <IconRefresh />
        </Button>
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
  const status = activeRun.status || "running"

  return (
    <div
      className={[
        "flex min-w-0 flex-1 items-center justify-center gap-2",
        "text-sky-600 dark:text-sky-400"
      ].filter(Boolean).join(" ")}
      role="status"
    >
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      <span className="truncate">
        {status === "canceling" ? "canceling" : "running"} {completedCount}/
        {operationCount}
      </span>
    </div>
  )
}
