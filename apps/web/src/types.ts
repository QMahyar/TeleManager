import type * as React from "react"

export type View =
  | "command"
  | "actions"
  | "dialogs"
  | "accounts"
  | "sessions"
  | "activity"
  | "settings"

export type ActionType =
  | "join_chat"
  | "leave_chat"
  | "send_message"
  | "forward_message"
  | "start_bot"
  | "delete_chat"
  | "clear_chat"
  | "block_user"
  | "unblock_user"
  | "archive_chat"
  | "unarchive_chat"
  | "mute_chat"
  | "unmute_chat"
  | "read_chat"
  | "report_spam"

export type Account = {
  id: string
  label: string
  session_name: string
  username?: string | null
  phone?: string | null
  authorized?: boolean
  status?: string
  last_error?: string | null
  dialog_count?: number
}

export type TelegramDialog = {
  id: string | number
  title: string
  username?: string | null
  dialog_type?: string
  kind?: string
  type?: string
  entity_type?: string
  unread_count?: number
}

export type ActivityEvent = {
  id?: string
  title: string
  detail?: string
  created_at?: string
  event_type?: string
  account_label?: string
}

export type QueueStep = {
  action_type: ActionType
  targets: string[]
  account_ids: string[]
  message?: string
}

export type QuickActionContext = {
  source: "dialog"
  actionType: ActionType
  title: string
  targetSummary: string
  count: number
  dialogKinds: string[]
}

export type QueueRun = {
  id: string
  status: string
  action_type?: string
  created_at?: string
  operation_count?: number
  completed_count?: number
  failed_count?: number
  operations?: Array<Record<string, unknown>>
}

export type Preset = {
  id: string
  name: string
  queue: {
    steps: QueueStep[]
    delay_between_accounts?: number
    delay_between_actions?: number
    max_operations?: number
  }
}

export type SafetySettings = {
  delay_between_accounts: number
  delay_between_actions: number
  max_operations: number
}

export type AppDialogState = {
  kicker?: string
  title: string
  description?: string
  danger?: boolean
  confirmLabel?: string
  input?: {
    label: string
    value?: string
    placeholder?: string
    type?: React.HTMLInputTypeAttribute
  }
  resolve: (value: string | boolean | null) => void
}

export type AskDialog = (
  options: Omit<AppDialogState, "resolve">
) => Promise<string | boolean | null>
