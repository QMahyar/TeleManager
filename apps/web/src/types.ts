import type * as React from "react"

export type ToastTone = "info" | "success" | "error"

// Surface a transient toast. Tone is optional and defaults to "info" so existing
// call sites keep working; pass "success"/"error" to colour the feedback.
export type Flash = (message: string, tone?: ToastTone) => void

export type View =
  | "overview"
  | "accounts"
  | "dialogs"
  | "actions"
  | "activity"
  | "schedules"
  | "settings"
  | "about"

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
  | "edit_chat_title"
  | "export_invite_link"
  | "kick_or_ban_user"
  | "export_chat"

// Per-account override for showing real dialog photos. "default" defers to the
// global app setting; "on"/"off" force it for this account.
export type PhotosMode = "default" | "on" | "off"

// Computed session-health status (backend session_health.compute_health_status,
// surfaced via AccountRecord.to_public_dict). Drives the badge in accounts-table.
export type HealthStatus = "healthy" | "stale" | "revoked" | "unknown"

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
  photos_mode?: PhotosMode
  health_status?: HealthStatus
}

export type TelegramDialog = {
  id: string | number
  title: string
  username?: string | null
  dialog_type?: string
  unread_count?: number
  // Cached folder/notify state (from the last fetch). Drives the multi-account
  // Sync diff, which copies archive/mute state from one account's chats to another.
  archived?: boolean
  muted?: boolean
  pinned?: boolean
  // Whether a profile-photo thumbnail was cached for this dialog on the last
  // fetch, and the Telegram photo id (used to cache-bust the served image).
  has_photo?: boolean
  photo_id?: number | null
}

// A global message-search hit: the message plus which chat it came from.
export type MessageSearchHit = TelegramMessage & {
  chat_id?: number | null
  chat_title?: string
  chat_username?: string | null
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

export type ActivityEvent = {
  id?: string
  title: string
  detail?: string
  created_at?: string
  event_type?: string
  account_label?: string
}

// A per-step "smart queue" guard. Structured (not a free-text DSL) and mirrored by
// the backend StepCondition — when present, each target is checked at run time and
// the operation is skipped if the condition is false. A condition also forces a
// schedule to the "runner" engine (it can't be evaluated for offline delivery).
export type ConditionField = "member_count" | "days_since_last_message" | "unread_count"
export type ConditionOp = "<" | "<=" | "==" | "!=" | ">" | ">="
export type StepCondition = {
  field: ConditionField
  op: ConditionOp
  value: number
}

export type QueueStep = {
  action_type: ActionType
  targets: string[]
  account_ids: string[]
  message?: string
  condition?: StepCondition | null
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
  condition: StepCondition | null
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
  skipped_count?: number
  operations?: Array<Record<string, unknown>>
  results?: Array<Record<string, unknown>>
  error?: string | null
  current?: Record<string, unknown> | null
  // Run lifecycle control (backend action_queue_service). pause_requested is set
  // while a pause is pending/held; resume_at is an ISO target for a flood-wait
  // auto-resume so the UI can show a live countdown.
  pause_requested?: boolean
  resume_at?: string | null
}

export type Preset = {
  id: string
  name: string
  queue: {
    steps: QueueStep[]
    delay_between_accounts?: number
    delay_between_actions?: number
    delay_instant?: number
    delay_sensitive?: number
    max_operations?: number
  }
}

export type SafetySettings = {
  delay_between_accounts: number
  // Standard-tier action delay (historical field name kept for back-compat).
  delay_between_actions: number
  delay_instant: number
  delay_sensitive: number
  max_operations: number
  // A flood wait at/below this cap (seconds) is auto-waited and retried in-place
  // instead of stopping the run; 0 disables auto-resume. Mirrors the backend.
  flood_wait_resume_cap: number
}

// Backend-persisted display/runtime preferences (global). Distinct from the
// browser-local theme/accent — `show_dialog_photos` gates a server-side download.
export type AppSettings = {
  show_dialog_photos: boolean
}

// Risk tier an action falls into — drives the inter-operation cooldown and the
// timing badge. Mirrors the backend ACTION_META tiers.
export type ActionTier = "instant" | "standard" | "sensitive"

// Per-action metadata served by GET /api/actions/meta (backend ACTION_META). The
// frontend reads this as the source of truth for tier/timing instead of guessing.
export type ActionMetaInfo = {
  tier: ActionTier
  category: string
  valid_targets: string[]
  needs_message: boolean
  message_optional: boolean
  destructive: boolean
  natively_schedulable: boolean
  creates_content: boolean
}

export type ActionsMeta = {
  actions: Record<string, ActionMetaInfo>
  tier_delays: Record<ActionTier, number>
  delay_between_accounts: number
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
  delay_instant?: number
  delay_sensitive?: number
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

export type ScheduledChat = {
  target: string
  count: number
  owned_count: number
  messages: ScheduledMessage[]
}

export type ScheduledAccountOverview = {
  account_id: string
  label: string
  chats: ScheduledChat[]
  error?: string
}

export type ScheduledOverview = {
  generated_at: string
  accounts: ScheduledAccountOverview[]
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
