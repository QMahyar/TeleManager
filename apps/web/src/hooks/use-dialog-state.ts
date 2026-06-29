import * as React from "react"

import { dialogKind, dialogTarget } from "../lib/dialog-resolver"
import type { TelegramDialog } from "../types"

// Persist dialog selection per account in sessionStorage
function loadDialogSelection(accountId: string | null): Set<string> {
  if (!accountId) return new Set()
  try {
    const key = `dialog_selection_${accountId}`
    const stored = sessionStorage.getItem(key)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function saveDialogSelection(accountId: string | null, targets: Set<string>): void {
  if (!accountId) return
  try {
    const key = `dialog_selection_${accountId}`
    sessionStorage.setItem(key, JSON.stringify([...targets]))
  } catch {
    // Ignore storage errors (quota, privacy mode, etc.)
  }
}

export function useDialogState() {
  const [dialogs, setDialogs] = React.useState<TelegramDialog[]>([])
  const [selectedDialogTargets, setSelectedDialogTargets] = React.useState<Set<string>>(new Set())
  const [dialogFilter, setDialogFilter] = React.useState("all")
  const [dialogSearch, setDialogSearch] = React.useState("")
  const [currentAccountId, setCurrentAccountId] = React.useState<string | null>(null)

  // Restore selection when account changes
  const setDialogsWithAccountId = React.useCallback((accountId: string | null, newDialogs: TelegramDialog[]) => {
    if (accountId !== currentAccountId) {
      // Account changed - restore persisted selection
      setCurrentAccountId(accountId)
      setSelectedDialogTargets(loadDialogSelection(accountId))
    }
    setDialogs(newDialogs)
  }, [currentAccountId])

  // Persist selection whenever it changes
  React.useEffect(() => {
    saveDialogSelection(currentAccountId, selectedDialogTargets)
  }, [currentAccountId, selectedDialogTargets])

  const filteredDialogs = React.useMemo(
    () => filterDialogs(dialogs, dialogFilter, dialogSearch),
    [dialogFilter, dialogSearch, dialogs]
  )

  const knownDialogTargets = React.useMemo(
    () => new Set(dialogs.map(dialogTarget)),
    [dialogs]
  )
  const visibleSelectedDialogTargets = React.useMemo(
    () =>
      new Set(
        [...selectedDialogTargets].filter((target) =>
          knownDialogTargets.has(target)
        )
      ),
    [knownDialogTargets, selectedDialogTargets]
  )

  return {
    dialogFilter,
    dialogSearch,
    dialogs,
    filteredDialogs,
    selectedDialogTargets: visibleSelectedDialogTargets,
    setDialogFilter,
    setDialogSearch,
    setDialogs,
    setDialogsWithAccountId,
    setSelectedDialogTargets,
  }
}

function filterDialogs(
  dialogs: TelegramDialog[],
  dialogFilter: string,
  dialogSearch: string
) {
  return dialogs.filter((dialog) => {
    const kind = dialogKind(dialog)
    const target = `${dialog.title} ${dialog.username || ""}`.toLowerCase()
    const matchesFilter =
      dialogFilter === "all" ||
      kind === dialogFilter ||
      (dialogFilter === "group" && kind === "supergroup")
    return matchesFilter && target.includes(dialogSearch.toLowerCase())
  })
}
