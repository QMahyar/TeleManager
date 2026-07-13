import * as React from "react"

import type { Flash } from "../types"

import { useAccountState } from "./use-account-state"
import { useDialogState } from "./use-dialog-state"
import { useQueueState } from "./use-queue-state"
import { useResourceState } from "./use-resource-state"
import { useRunPolling } from "./use-run-polling"
import { useVersion } from "./use-version"
import { useViewState } from "./use-view-state"

// Thin aggregator: each slice of app state lives in its own use-*-state hook
// (view, accounts, dialogs, resources/polling, queue builder, run polling,
// version). useAppState just wires them together and flattens the result into the
// single object App.tsx spreads to the screens, so the screens' surface is
// unchanged by the split.
export function useAppState(
  flash: (message: string) => void,
  // When false (app-password gate still locked), skip the bootstrap fetch so we
  // don't 401-spam every resource endpoint before the operator unlocks.
  enabled = true
) {
  const viewState = useViewState()
  const accountState = useAccountState()
  const dialogState = useDialogState()
  const resourceState = useResourceState(viewState.view)
  const queueState = useQueueState()
  // Run-polling lives at app scope (not on the Actions screen) so the footer +
  // rail can show a live "running…" pulse no matter which screen is open.
  const runState = useRunPolling(
    resourceState.loadRuns,
    accountState.refresh,
    flash
  )
  const version = useVersion()

  useInitialLoad({
    enabled,
    flash,
    loadActionsMeta: resourceState.loadActionsMeta,
    loadAppSettings: resourceState.loadAppSettings,
    loadPresets: resourceState.loadPresets,
    loadRuns: resourceState.loadRuns,
    refresh: accountState.refresh,
  })

  return {
    ...viewState,
    ...accountState,
    ...dialogState,
    ...resourceState,
    ...queueState,
    ...runState,
    version,
    toggleSelected,
  }
}

function useInitialLoad({
  enabled,
  flash,
  loadActionsMeta,
  loadAppSettings,
  loadPresets,
  loadRuns,
  refresh,
}: {
  enabled: boolean
  flash: Flash
  loadActionsMeta: () => Promise<void>
  loadAppSettings: () => Promise<void>
  loadPresets: () => Promise<void>
  loadRuns: () => Promise<void>
  refresh: () => Promise<void>
}) {
  React.useEffect(() => {
    if (!enabled) return
    const task = window.setTimeout(() => {
      Promise.all([
        refresh(),
        loadRuns(),
        loadPresets(),
        loadActionsMeta(),
        loadAppSettings(),
      ]).catch((error) => flash(error.message))
    }, 0)

    return () => window.clearTimeout(task)
  }, [enabled, flash, loadActionsMeta, loadAppSettings, loadPresets, loadRuns, refresh])
}

function toggleSelected(
  value: string,
  setter: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  setter((current) => {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  })
}
