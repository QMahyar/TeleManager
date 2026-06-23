import { IconSearch, IconX } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Modal } from "../../ui/modal"
import { cn } from "../../ui/utils"
import { Input } from "../ui"
import type { PaletteCommand } from "./types"

export function CommandPalette({
  clampedIndex,
  filteredItems,
  open,
  paletteQuery,
  closePalette,
  setPaletteIndex,
  setPaletteQuery,
}: {
  clampedIndex: number
  filteredItems: PaletteCommand[]
  open: boolean
  paletteQuery: string
  closePalette: () => void
  setPaletteIndex: React.Dispatch<React.SetStateAction<number>>
  setPaletteQuery: React.Dispatch<React.SetStateAction<string>>
}) {
  const runCommand = (command: PaletteCommand) => {
    command.run()
    closePalette()
  }
  return (
    <Modal
      open={open}
      onClose={closePalette}
      align="start"
      className="mx-auto max-w-xl p-3"
      labelledBy="command-palette-title"
    >
      <div>
        <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
          <strong id="command-palette-title" className="text-sm">
            Command palette
          </strong>
          <Button variant="ghost" size="icon-sm" onClick={closePalette}>
            <IconX />
          </Button>
        </div>
        <div className="relative mb-3">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            value={paletteQuery}
            onChange={(event) => {
              setPaletteQuery(event.target.value)
              setPaletteIndex(0)
            }}
            placeholder="Search screens and actions"
            aria-label="Search command palette"
          />
        </div>
        <div className="space-y-1">
          {filteredItems.length ? (
            filteredItems.map((item, filteredIndex) => (
              <PaletteItem
                key={item.id}
                item={item}
                active={filteredIndex === clampedIndex}
                onRun={runCommand}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No commands match that search.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function PaletteItem({
  item,
  active,
  onRun,
}: {
  item: PaletteCommand
  active: boolean
  onRun: (command: PaletteCommand) => void
}) {
  const Icon = item.icon

  return (
    <button
      onClick={() => onRun(item)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm",
        active
          ? "border-border bg-muted/40"
          : "border-transparent hover:border-border hover:bg-muted/40"
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1">{item.label}</span>
      {item.shortcut ? (
        <kbd className="text-xs text-muted-foreground">Alt+{item.shortcut}</kbd>
      ) : null}
    </button>
  )
}
