import { IconLoader2, IconPlayerStop } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Badge } from "../../components/ui"
import { statusTone } from "../../lib/helpers"
import type { QueueRun } from "../../types"
import type { ActionsScreenProps } from "../screen-props"

export function ActiveRunBanner({
  activeRunId,
  activeRun,
  cancelActiveRun,
  guarded,
}: {
  activeRunId: string | null
  activeRun: QueueRun | null
  cancelActiveRun: () => Promise<void>
  guarded: ActionsScreenProps["guarded"]
}) {
  if (!activeRunId) return null

  const completed = activeRun?.completed_count || 0
  const total = activeRun?.operation_count || 0
  const failed = activeRun?.failed_count || 0
  const status = activeRun?.status || "running"
  const currentTarget =
    activeRun?.current && typeof activeRun.current === "object"
      ? String((activeRun.current as Record<string, unknown>).target || "")
      : ""

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 text-sm md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <IconLoader2 className="size-4 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong>Queue running</strong>
            <Badge tone={statusTone(status)}>{status.replace("_", " ")}</Badge>
            <span className="text-muted-foreground">
              {completed}/{total} done{failed ? ` · ${failed} failed` : ""}
            </span>
          </div>
          {currentTarget ? (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {currentTarget}
            </p>
          ) : null}
        </div>
      </div>
      <Button variant="destructive" onClick={() => guarded(cancelActiveRun)}>
        <IconPlayerStop />
        Cancel Run
      </Button>
    </div>
  )
}
