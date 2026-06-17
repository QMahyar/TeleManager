import type * as React from "react"

import type {
  Account,
  ActionType,
  AskDialog,
  Preset,
  QueueRun,
  QueueStep,
  SafetySettings,
  TelegramDialog,
  View,
} from "../types"

export type AppScreenProps = {
  accounts: Account[]
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setView: React.Dispatch<React.SetStateAction<View>>
  metrics: {
    ready: number
    attention: number
    knownDialogs: number
  }
  guarded: (work: () => Promise<void>) => Promise<void>
  loading: boolean
  refresh: () => Promise<void>
  flash: (message: string) => void
  askDialog: AskDialog
  pendingAccountId: string
  setPendingAccountId: React.Dispatch<React.SetStateAction<string>>
  actionAccountIds: Set<string>
  setActionAccountIds: React.Dispatch<React.SetStateAction<Set<string>>>
  toggleSelected: (
    value: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => void
  presets: Preset[]
  queue: QueueStep[]
  setQueue: React.Dispatch<React.SetStateAction<QueueStep[]>>
  queuePayload: {
    steps: QueueStep[]
    confirm: boolean
    delay_between_accounts: number
    delay_between_actions: number
    max_operations: number
  }
  loadPresets: () => Promise<void>
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  actionDraft: {
    action_type: ActionType
    target: string
    message: string
  }
  setActionDraft: React.Dispatch<
    React.SetStateAction<{
      action_type: ActionType
      target: string
      message: string
    }>
  >
  confirmed: boolean
  setConfirmed: React.Dispatch<React.SetStateAction<boolean>>
  addQueueStep: () => void
  runs: QueueRun[]
  loadRuns: () => Promise<void>
  dialogAccountId: string
  setDialogAccountId: React.Dispatch<React.SetStateAction<string>>
  dialogs: TelegramDialog[]
  setDialogs: React.Dispatch<React.SetStateAction<TelegramDialog[]>>
  dialogFilter: string
  setDialogFilter: React.Dispatch<React.SetStateAction<string>>
  dialogSearch: string
  setDialogSearch: React.Dispatch<React.SetStateAction<string>>
  selectedDialogTargets: Set<string>
  setSelectedDialogTargets: React.Dispatch<React.SetStateAction<Set<string>>>
  filteredDialogs: TelegramDialog[]
}

export type CommandScreenProps = Pick<
  AppScreenProps,
  | "accounts"
  | "selectedIds"
  | "setSelectedIds"
  | "setView"
  | "metrics"
  | "guarded"
  | "refresh"
  | "flash"
  | "askDialog"
>

export type AccountsScreenProps = Pick<
  AppScreenProps,
  | "accounts"
  | "selectedIds"
  | "setSelectedIds"
  | "guarded"
  | "loading"
  | "refresh"
  | "flash"
  | "askDialog"
  | "pendingAccountId"
  | "setPendingAccountId"
>

export type ActionsScreenProps = Pick<
  AppScreenProps,
  | "accounts"
  | "actionAccountIds"
  | "setActionAccountIds"
  | "toggleSelected"
  | "presets"
  | "queue"
  | "setQueue"
  | "queuePayload"
  | "loadPresets"
  | "safety"
  | "setSafety"
  | "actionDraft"
  | "setActionDraft"
  | "confirmed"
  | "setConfirmed"
  | "addQueueStep"
  | "runs"
  | "loadRuns"
  | "guarded"
  | "loading"
  | "flash"
  | "askDialog"
>

export type DialogsScreenProps = Pick<
  AppScreenProps,
  | "accounts"
  | "setView"
  | "guarded"
  | "loading"
  | "refresh"
  | "flash"
  | "dialogAccountId"
  | "setDialogAccountId"
  | "setDialogs"
  | "dialogFilter"
  | "setDialogFilter"
  | "dialogSearch"
  | "setDialogSearch"
  | "selectedDialogTargets"
  | "setSelectedDialogTargets"
  | "filteredDialogs"
  | "setActionDraft"
  | "toggleSelected"
>

export type SessionsScreenProps = Pick<
  AppScreenProps,
  "selectedIds" | "guarded" | "refresh" | "flash"
>
