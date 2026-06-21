import type * as React from "react"

import type {
  Account,
  AccountsTab,
  ActionDraft,
  AskDialog,
  Flash,
  Preset,
  QueueRun,
  QueueStep,
  SafetySettings,
  Schedule,
  ScheduleSeed,
  TelegramDialog,
  View,
} from "../types"

export type AppScreenProps = {
  accounts: Account[]
  accountsLoaded: boolean
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setView: React.Dispatch<React.SetStateAction<View>>
  accountsTab: AccountsTab
  setAccountsTab: React.Dispatch<React.SetStateAction<AccountsTab>>
  metrics: {
    ready: number
    attention: number
    knownDialogs: number
  }
  apiConfigured: boolean
  configApiId: number | null
  configStatus: string
  guarded: (work: () => Promise<void>) => Promise<void>
  loading: boolean
  refresh: () => Promise<void>
  flash: Flash
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
    delay_between_accounts: number
    delay_between_actions: number
    max_operations: number
  }
  loadPresets: () => Promise<void>
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  actionDraft: ActionDraft
  quickActionContext: import("../types").QuickActionContext | null
  setActionDraft: React.Dispatch<React.SetStateAction<ActionDraft>>
  setQuickActionContext: React.Dispatch<
    React.SetStateAction<import("../types").QuickActionContext | null>
  >
  addQueueStep: () => void
  runs: QueueRun[]
  loadRuns: () => Promise<void>
  schedules: Schedule[]
  loadSchedules: () => Promise<void>
  scheduleSeed: ScheduleSeed | null
  setScheduleSeed: React.Dispatch<React.SetStateAction<ScheduleSeed | null>>
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

export type AccountsScreenProps = Pick<
  AppScreenProps,
  | "accounts"
  | "accountsLoaded"
  | "selectedIds"
  | "setSelectedIds"
  | "setView"
  | "accountsTab"
  | "setAccountsTab"
  | "metrics"
  | "setActionAccountIds"
  | "setDialogAccountId"
  | "apiConfigured"
  | "configApiId"
  | "configStatus"
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
  | "quickActionContext"
  | "setActionDraft"
  | "setQuickActionContext"
  | "addQueueStep"
  | "runs"
  | "loadRuns"
  | "refresh"
  | "guarded"
  | "loading"
  | "flash"
  | "askDialog"
>

export type SchedulesScreenProps = Pick<
  AppScreenProps,
  | "accounts"
  | "schedules"
  | "loadSchedules"
  | "scheduleSeed"
  | "setScheduleSeed"
  | "presets"
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
  | "dialogs"
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
  | "setActionAccountIds"
  | "setQuickActionContext"
  | "setScheduleSeed"
  | "toggleSelected"
>

