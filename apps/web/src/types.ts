import type * as React from "react"

export type ToastTone = "info" | "success" | "error"

// Surface a transient toast. Tone is optional and defaults to "info" so existing
// call sites keep working; pass "success"/"error" to colour the feedback.
export type Flash = (message: string, tone?: ToastTone) => void

export type View =
  | "accounts"
  | "dialogs"
  | "actions"
  | "schedules"
  | "settings"

export type AccountsTab = "fleet" | "login" | "transfer"

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

// One-shot prefill handed to the merged Actions page when staging chats from
// another screen (e.g. Dialogs). Consumed and cleared on arrival. `mode` flips
// the Actions Col-3 composer to "schedule" when the handoff was "Schedule
// Selected"; absent/"run" leaves it on the default run-now mode.
export type ScheduleSeed = {
  accountIds: string[]
  actionType: ActionType
  target: string
  mode?: "run" | "schedule"
}

export type QueueRun = {
  id: string
  status: string
  action_type?: string
  schedule_id?: string | null
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

export type ScheduleEngine = "native" | "runner"

export type IntervalUnit = "minutes" | "hours" | "days"

export type EndMode = "count" | "until" | "forever"

export type RecurrenceConfig = {
  interval_value: number
  interval_unit: IntervalUnit
  start_at?: string | null
  end_mode: EndMode
  end_count?: number | null
  end_until?: string | null
  stagger_seconds?: number
}

export type ScheduleQueue = {
  steps: QueueStep[]
  delay_between_accounts?: number
  delay_between_actions?: number
  max_operations?: number
}

export type Schedule = {
  id: string
  name: string
  status: "active" | "paused" | "completed" | "canceled" | "error"
  engine: ScheduleEngine
  engine_reason: string
  queue: ScheduleQueue
  recurrence: RecurrenceConfig
  created_at?: string
  updated_at?: string
  next_fire_at?: string | null
  fires_done?: number
  fires_planned?: number | null
  last_fire_at?: string | null
  coverage_until?: string | null
  run_ids?: string[]
  last_error?: string | null
}

export type SchedulePreview = {
  engine: ScheduleEngine
  engine_reason: string
  fires_planned?: number | null
  operations_per_fire: number
  total_messages?: number | null
  fully_offline?: boolean
  next_fire_at?: string | null
  upcoming: string[]
  coverage_until?: string | null
  warnings: string[]
}

export type ScheduledMessage = {
  id: number
  date?: string | null
  text: string
  owned?: boolean
}

export type ScheduledInspect = {
  account_id: string
  target: string
  messages: ScheduledMessage[]
  count: number
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
