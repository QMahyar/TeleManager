import { z } from "zod"

// Runtime schemas for the API responses the data loaders consume. They're validated
// at the fetch boundary (lib/api.ts) so a backend/frontend shape drift surfaces as a
// clear, logged error instead of an undefined-access crash deep inside a render.
//
// These mirror the hand-written types in ../types. Because each is passed to
// api<T>(...) where T is the matching hand-written type, tsc fails the build if a
// schema drifts from its type — so the two can't silently diverge. (A generated
// contract from OpenAPI would remove the hand-maintenance; that's a later step.)

const actionTypeSchema = z.enum([
  "join_chat",
  "leave_chat",
  "send_message",
  "send_media",
  "schedule_message",
  "forward_message",
  "edit_message",
  "delete_messages",
  "pin_message",
  "unpin_message",
  "download_media",
  "start_bot",
  "delete_chat",
  "clear_chat",
  "block_user",
  "unblock_user",
  "archive_chat",
  "unarchive_chat",
  "mute_chat",
  "unmute_chat",
  "read_chat",
  "report_spam",
])

const photosModeSchema = z.enum(["default", "on", "off"])
const looseRecord = z.record(z.string(), z.unknown())

const accountSchema = z.object({
  id: z.string(),
  label: z.string(),
  session_name: z.string(),
  username: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  authorized: z.boolean().optional(),
  status: z.string().optional(),
  last_error: z.string().nullable().optional(),
  dialog_count: z.number().optional(),
  photos_mode: photosModeSchema.optional(),
})

const activityEventSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  detail: z.string().optional(),
  created_at: z.string().optional(),
  event_type: z.string().optional(),
  account_label: z.string().optional(),
})

const queueRunSchema = z.object({
  id: z.string(),
  status: z.string(),
  action_type: z.string().optional(),
  schedule_id: z.string().nullable().optional(),
  created_at: z.string().optional(),
  operation_count: z.number().optional(),
  completed_count: z.number().optional(),
  failed_count: z.number().optional(),
  skipped_count: z.number().optional(),
  operations: z.array(looseRecord).optional(),
  results: z.array(looseRecord).optional(),
  error: z.string().nullable().optional(),
  current: looseRecord.nullable().optional(),
  pause_requested: z.boolean().optional(),
  resume_at: z.string().nullable().optional(),
})

const queueStepSchema = z.object({
  action_type: actionTypeSchema,
  targets: z.array(z.string()),
  account_ids: z.array(z.string()),
  message: z.string().optional(),
})

const queueConfigSchema = z.object({
  steps: z.array(queueStepSchema),
  delay_between_accounts: z.number().optional(),
  delay_between_actions: z.number().optional(),
  delay_instant: z.number().optional(),
  delay_sensitive: z.number().optional(),
  max_operations: z.number().optional(),
})

const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  queue: queueConfigSchema,
})

const recurrenceConfigSchema = z.object({
  interval_value: z.number(),
  interval_unit: z.enum(["minutes", "hours", "days"]),
  start_at: z.string().nullable().optional(),
  end_mode: z.enum(["count", "until", "forever"]),
  end_count: z.number().nullable().optional(),
  end_until: z.string().nullable().optional(),
  stagger_seconds: z.number().optional(),
})

const scheduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "paused", "completed", "canceled", "error", "deleting"]),
  engine: z.enum(["native", "runner"]),
  engine_reason: z.string(),
  queue: queueConfigSchema,
  recurrence: recurrenceConfigSchema,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  next_fire_at: z.string().nullable().optional(),
  fires_done: z.number().optional(),
  fires_planned: z.number().nullable().optional(),
  last_fire_at: z.string().nullable().optional(),
  coverage_until: z.string().nullable().optional(),
  run_ids: z.array(z.string()).optional(),
  last_error: z.string().nullable().optional(),
})

const safetySettingsSchema = z.object({
  delay_between_accounts: z.number(),
  delay_between_actions: z.number(),
  delay_instant: z.number(),
  delay_sensitive: z.number(),
  max_operations: z.number(),
  flood_wait_resume_cap: z.number(),
})

const appSettingsSchema = z.object({
  show_dialog_photos: z.boolean(),
})

// Response envelopes the loaders actually receive.
export const accountsResponseSchema = z.object({ accounts: z.array(accountSchema) })
export const configResponseSchema = z.object({
  api_id: z.number().nullable().optional(),
  api_hash_configured: z.boolean(),
})
export const activityResponseSchema = z.object({ events: z.array(activityEventSchema) })
export const runsResponseSchema = z.object({ runs: z.array(queueRunSchema) })
export const presetsResponseSchema = z.object({ presets: z.array(presetSchema) })
export const schedulesResponseSchema = z.object({ schedules: z.array(scheduleSchema) })
export const safetyResponseSchema = z.object({ settings: safetySettingsSchema })
export const appSettingsResponseSchema = z.object({ settings: appSettingsSchema })
export const versionResponseSchema = z.object({ version: z.string() })
