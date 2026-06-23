import * as React from "react"

import { navItems } from "../../lib/constants"
import type { View } from "../../types"
import type { CommandPaletteState, PaletteCommand } from "./types"

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  )
}

function shortcutNavItem(key: string) {
  const index = Number(key)
  return navItems[index - 1]
}

function handlePaletteToggleKey(
  event: KeyboardEvent,
  options: {
    isOpen: boolean
    closePalette: () => void
    openPalette: () => void
  }
) {
  if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
    return false
  }
  event.preventDefault()
  if (options.isOpen) {
    options.closePalette()
  } else {
    options.openPalette()
  }
  return true
}

function handlePaletteNavigationKey(
  event: KeyboardEvent,
  options: {
    isOpen: boolean
    hasItems: boolean
    movePalette: (direction: -1 | 1) => void
    submitPaletteSelection: () => void
  }
) {
  if (!options.isOpen || !options.hasItems) {
    return false
  }

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault()
      options.movePalette(1)
      return true
    case "ArrowUp":
      event.preventDefault()
      options.movePalette(-1)
      return true
    case "Enter":
      event.preventDefault()
      options.submitPaletteSelection()
      return true
    default:
      return false
  }
}

function handleAltNavigationKey(
  event: KeyboardEvent,
  openView: (view: View) => void
) {
  if (!event.altKey) {
    return false
  }

  const item = shortcutNavItem(event.key)
  if (!item) {
    return false
  }

  event.preventDefault()
  openView(item.id)
  return true
}

export function usePaletteState(commands: PaletteCommand[]): CommandPaletteState {
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteQuery, setPaletteQuery] = React.useState("")
  const [paletteIndex, setPaletteIndex] = React.useState(0)

  const closePalette = React.useCallback(() => {
    setPaletteOpen(false)
    setPaletteQuery("")
    setPaletteIndex(0)
  }, [])

  const openPalette = React.useCallback(() => {
    setPaletteOpen(true)
    setPaletteIndex(0)
  }, [])

  const filteredItems = React.useMemo(() => {
    const query = paletteQuery.trim().toLowerCase()
    if (!query) {
      return commands
    }
    return commands.filter((item) =>
      `${item.label} ${item.group}`.toLowerCase().includes(query)
    )
  }, [commands, paletteQuery])

  const clampedIndex = Math.min(
    paletteIndex,
    Math.max(filteredItems.length - 1, 0)
  )

  const movePalette = React.useCallback(
    (direction: -1 | 1) => {
      setPaletteIndex((current) =>
        Math.max(0, Math.min(current + direction, filteredItems.length - 1))
      )
    },
    [filteredItems.length]
  )

  const submitPaletteSelection = React.useCallback(() => {
    const item = filteredItems[clampedIndex]
    if (item) {
      item.run()
      closePalette()
    }
  }, [clampedIndex, closePalette, filteredItems])

  return {
    clampedIndex,
    filteredItems,
    paletteOpen,
    paletteQuery,
    closePalette,
    openPalette,
    movePalette,
    submitPaletteSelection,
    setPaletteIndex,
    setPaletteQuery,
  }
}

export function usePaletteHotkeys(
  palette: CommandPaletteState,
  openView: (view: View) => void
) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return
      }
      if (event.key === "Escape") {
        palette.closePalette()
        return
      }
      if (
        handlePaletteToggleKey(event, {
          isOpen: palette.paletteOpen,
          closePalette: palette.closePalette,
          openPalette: palette.openPalette,
        })
      ) {
        return
      }
      if (
        handlePaletteNavigationKey(event, {
          isOpen: palette.paletteOpen,
          hasItems: palette.filteredItems.length > 0,
          movePalette: palette.movePalette,
          submitPaletteSelection: palette.submitPaletteSelection,
        })
      ) {
        return
      }
      handleAltNavigationKey(event, openView)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openView, palette])
}
