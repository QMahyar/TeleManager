import type * as React from "react"

export type View =
  | "command"
  | "actions"
  | "dialogs"
  | "accounts"
  | "sessions"
  | "activity"
  | "settings"
  | "about"

export type ActionType =
  | "join_chat"
  | "leave_chat"
  | "send_message"
  | "send_media"
  | "schedule_message"
  | "forward_message"
  | "edit_message"
  | "delete_messages"
  | "pin_message"
  | "unpin_message"
  | "download_media"
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

export type TelegramMessage = {
  id: number
  date?: string | null
  text: string
  sender_id?: string | number | null
  sender_name?: string | null
  out?: boolean
  has_media?: boolean
}

export type ResolvedTarget = {
  account_id: string
  target: string
  id?: string | number | null
  title?: string | null
  username?: string | null
  type: string
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

export type ActionFieldValues = Record<string, string | boolean>

export type ActionDraft = {
  action_type: ActionType
  target: string
  fields: ActionFieldValues
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
  results?: Array<Record<string, unknown>>
  error?: string | null
  current?: Record<string, unknown> | null
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
