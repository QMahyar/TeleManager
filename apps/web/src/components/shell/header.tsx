import {
  IconMenu2,
  IconPlus,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Badge } from "../ui"
import type { QueueStep } from "../../types"
import { countQueueOperations } from "./queue-metrics"
import type { NavItem } from "./types"

// The page header. A title + one-line subtitle on the left (both sourced from the
// active nav item), and the app's global controls on the right: a click-to-open
// command search, a refresh, and the one coral "Add account" commit action. It's
// a dumb renderer — every screen's framing copy lives in `navItems`.
export function Header({
  activeItem,
  queue,
  selectedCount,
  showSelectedCount,
  onAddAccount,
  onRefresh,
  openActions,
  openSidebar,
  openPalette,
}: {
  activeItem?: NavItem
  queue: QueueStep[]
  selectedCount: number
  showSelectedCount: boolean
  onAddAccount: () => void
  onRefresh: () => void
  openActions: () => void
  openSidebar: () => void
  openPalette: () => void
}) {
  return (
    <header className="frosted sticky top-0 z-20 -mx-4 mb-6 flex flex-col gap-3 border-b border-sidebar-border px-4 py-4 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-7 lg:px-7 xl:-mx-8 xl:px-8">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          onClick={openSidebar}
          aria-label="Open navigation"
        >
          <IconMenu2 />
        </Button>
        <div className="min-w-0">
          <h1 className="type-title text-foreground">{activeItem?.label}</h1>
          {activeItem?.description ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {activeItem.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showSelectedCount && selectedCount > 0 ? (
          <span className="hidden sm:block">
            <Badge tone="border-primary/30 bg-primary/10 text-primary">
              {selectedCount} selected
            </Badge>
          </span>
        ) : null}
        {queue.length > 0 ? (
          <button
            type="button"
            onClick={openActions}
            className="hidden items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary sm:flex"
          >
            {countQueueOperations(queue)} operations staged
          </button>
        ) : null}
        {/* Click-to-open search that reads like a real field but delegates to the
            command palette (Ctrl K), so there's one search surface, not two. */}
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search (Ctrl K)"
          className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:text-foreground md:flex xl:w-64"
        >
          <IconSearch className="size-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border px-1 font-mono text-[0.65rem]">
            Ctrl K
          </kbd>
        </button>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          aria-label="Refresh data"
        >
          <IconRefresh />
        </Button>
        <Button size="comfortable" onClick={onAddAccount}>
          <IconPlus />
          Add account
        </Button>
      </div>
    </header>
  )
}
