import * as React from "react"

import type { navItems } from "../../lib/constants"
import type { Account, QueueRun, QueueStep, Schedule, View } from "../../types"

export type ShellMetrics = {
  ready: number
  attention: number
  knownDialogs: number
}

export type ShellTelemetry = {
  accounts: Account[]
  metrics: ShellMetrics
  queue: QueueStep[]
  runs: QueueRun[]
  schedules: Schedule[]
}

export type AppShellProps = React.PropsWithChildren<
  ShellTelemetry & {
    view: View
    telemetry?: ShellTelemetry
    selectedCount: number
    setView: (view: View) => void
    onRefresh: () => void
    onExit: () => void
    onAddAccount: () => void
  }
>

export type NavItem = (typeof navItems)[number]

export type PaletteCommand = {
  id: string
  label: string
  group: string
  icon: React.ElementType
  shortcut?: number
  run: () => void
}

export type CommandPaletteState = {
  clampedIndex: number
  filteredItems: PaletteCommand[]
  paletteOpen: boolean
  paletteQuery: string
  closePalette: () => void
  openPalette: () => void
  movePalette: (direction: -1 | 1) => void
  submitPaletteSelection: () => void
  setPaletteIndex: React.Dispatch<React.SetStateAction<number>>
  setPaletteQuery: React.Dispatch<React.SetStateAction<string>>
}
