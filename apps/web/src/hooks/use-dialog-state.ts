import * as React from "react"

import { dialogKind, dialogTarget } from "../lib/helpers"
import type { TelegramDialog } from "../types"

export function useDialogState() {
  const [dialogs, setDialogs] = React.useState<TelegramDialog[]>([])
  const [selectedDialogTargets, setSelectedDialogTargets] = React.useState<
    Set<string>
  >(new Set())
  const [dialogFilter, setDialogFilter] = React.useState("all")
  const [dialogSearch, setDialogSearch] = React.useState("")

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
