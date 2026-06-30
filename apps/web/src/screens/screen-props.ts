import type * as React from "react"

import type {
  Account,
  AccountsTab,
  ActionDraft,
  ActionsMeta,
  AppSettings,
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
  queuePayload: { steps: QueueStep[] } & SafetySettings
  loadPresets: () => Promise<void>
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  appSettings: AppSettings
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  actionsMeta: ActionsMeta | null
  actionDraft: ActionDraft
  quickActionContext: import("../types").QuickActionContext | null
  setActionDraft: React.Dispatch<React.SetStateAction<ActionDraft>>
  setQuickActionContext: React.Dispatch<
    React.SetStateAction<import("../types").QuickActionContext | null>
  >
  addQueueStep: () => void
  runs: QueueRun[]
  loadRuns: () => Promise<void>
  activeRunId: string | null
  activeRun: QueueRun | null
  pollQueueRun: (runId: string) => Promise<void>
  cancelActiveRun: () => Promise<void>
  schedules: Schedule[]
  loadSchedules: () => Promise<void>
  scheduleSeed: ScheduleSeed | null
  setScheduleSeed: React.Dispatch<React.SetStateAction<ScheduleSeed | null>>
  dialogAccountId: string
  setDialogAccountId: React.Dispatch<React.SetStateAction<string>>
  dialogs: TelegramDialog[]
  setDialogs: React.Dispatch<React.SetStateAction<TelegramDialog[]>>
  // Persistence-aware setter (from useDialogState): sets the dialog list and, on an
  // account change, restores that account's saved selection. Spread into app state via
  // `...dialogState`, so it's always present at runtime — declared here so it's typed.
  setDialogsWithAccountId: (
    accountId: string | null,
    dialogs: TelegramDialog[]
  ) => void
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
  | "actionsMeta"
  | "actionDraft"
  | "quickActionContext"
  | "setActionDraft"
  | "setQuickActionContext"
  | "addQueueStep"
  | "runs"
  | "loadRuns"
  | "activeRunId"
  | "activeRun"
  | "pollQueueRun"
  | "cancelActiveRun"
  | "refresh"
  | "guarded"
  | "loading"
  | "flash"
  | "askDialog"
  | "schedules"
  | "loadSchedules"
  | "scheduleSeed"
  | "setScheduleSeed"
>

export type DialogsScreenProps = Pick<
  AppScreenProps,
  | "accounts"
  | "setView"
  | "guarded"
  | "loading"
  | "refresh"
  | "flash"
  | "askDialog"
  | "dialogs"
  | "dialogAccountId"
  | "setDialogAccountId"
  | "setDialogs"
  | "setDialogsWithAccountId"
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
  | "actionsMeta"
  | "safety"
  | "appSettings"
>

