import {
  IconCommand,
  IconMenu2,
  IconPlayerPlay,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Badge, SignalDot } from "../ui"
import type { QueueStep } from "../../types"
import { countQueueOperations } from "./queue-metrics"
import type { NavItem } from "./types"

export function Header({
  activeItem,
  queue,
  selectedCount,
  showSelectedCount,
  onAddAccount,
  openActions,
  openSettings,
  openSidebar,
  openPalette,
}: {
  activeItem?: NavItem
  queue: QueueStep[]
  selectedCount: number
  showSelectedCount: boolean
  onAddAccount: () => void
  openActions: () => void
  openSettings: () => void
  openSidebar: () => void
  openPalette: () => void
}) {
  return (
    <header className="frosted sticky top-0 z-20 -mx-4 mb-6 flex flex-col gap-3 border-b border-sidebar-border px-4 py-3.5 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-7 lg:px-7 xl:-mx-8 xl:px-8">
      <div className="flex items-start gap-3">
        <Button
          variant="outline"
          size="icon"
          className="mt-0.5 lg:hidden"
          onClick={openSidebar}
          aria-label="Open navigation"
        >
          <IconMenu2 />
        </Button>
        {/* Instrument header: a live gauge line (signal dot + mono breadcrumb
            path) above the engraved nameplate title. The dot promotes the app's
            SignalDot status-light motif into the most-seen chrome, so the header
            reads as an instrument panel rather than a plain page title. */}
        <div className="min-w-0">
          <p className="type-eyebrow flex items-center gap-2 text-muted-foreground">
            <SignalDot tone={queue.length > 0 ? "live" : "ready"} />
            <span>{activeItem?.group || "Workspace"}</span>
            {activeItem?.label ? (
              <span className="text-muted-foreground/40" aria-hidden>
                /
              </span>
            ) : null}
            <span className="text-foreground/70">{activeItem?.label}</span>
          </p>
          <h1 className="type-title mt-1.5 text-foreground">
            {activeItem?.label}
          </h1>
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
            className="hidden items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary sm:flex"
          >
            <IconPlayerPlay className="size-3.5" />
            {countQueueOperations(queue)} operations staged
          </button>
        ) : null}
        <Button
          variant="outline"
          className="hidden sm:inline-flex"
          onClick={openPalette}
        >
          <IconCommand />
          <span className="font-mono">Ctrl K</span>
        </Button>
        <Button variant="outline" onClick={openSettings}>
          Settings
        </Button>
        <Button onClick={onAddAccount}>Add Account</Button>
      </div>
    </header>
  )
}
