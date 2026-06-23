import {
  IconCommand,
  IconMenu2,
  IconPlayerPlay,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Badge } from "../ui"
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
    <header className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="min-w-0">
          <p className="font-mono text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
            <span className="text-primary">›</span>{" "}
            {activeItem?.group || "Workspace"}
          </p>
          <h1 className="font-heading text-xl tracking-tight sm:text-2xl">
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
