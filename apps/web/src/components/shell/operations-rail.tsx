import { IconBolt, IconChevronRight } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import type { View } from "../../types"

// The floating batch dock — a corner pill that stays visible on every screen
// whenever a batch is staged, so the action is always one click from running.
// It replaces the old right-rail column: the ambient batch state now lives here
// (and the live run pulse lives in the footer), freeing the full content width.
//
// "Run batch" / "Choose action" both jump to the Actions screen, where the real,
// fully-guarded commit lives — the dock never runs an action behind the guards.
export function OperationsRail({
  stagedChats,
  stagedAccounts,
  view,
  onClear,
  openView,
}: {
  stagedChats: number
  stagedAccounts: number
  view: View
  onClear: () => void
  openView: (view: View) => void
}) {
  // The batch is "staged" once there's at least one chat to act on.
  if (stagedChats === 0) return null

  const onActions = view === "actions"

  return (
    <div className="tm-toast-in fixed right-4 bottom-12 z-30 sm:right-6">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 py-2 pr-2 pl-3 shadow-lg backdrop-blur-sm">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-text">
          <IconBolt className="size-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-foreground">Batch ready</p>
          <p className="font-mono text-[0.7rem] text-muted-foreground">
            {stagedChats} chats · {stagedAccounts} accounts
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="ml-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
        <Button size="comfortable" onClick={() => openView("actions")}>
          {onActions ? "Choose action" : "Run batch"}
          <IconChevronRight />
        </Button>
      </div>
    </div>
  )
}
