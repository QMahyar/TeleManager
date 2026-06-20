import type { ActionType } from "../types"

// Structured form schema for actions that need more than a target. Each action
// renders typed fields instead of a freeform key=value textarea, and serialize()
// produces exactly the message string the backend already parses. The backend
// parsing contract is intentionally left unchanged.

export type ActionFieldKind =
  | "text"
  | "textarea"
  | "datetime"
  | "select"
  | "checkbox"

export type ActionFieldOption = { value: string; label: string }

export type FieldValues = Record<string, string | boolean>

export type ActionField = {
  name: string
  label: string
  kind: ActionFieldKind
  required?: boolean
  placeholder?: string
  help?: string
  options?: ActionFieldOption[]
  default?: string | boolean
  validate?: (value: string, all: FieldValues) => string | null
}

export type ActionFormSchema = {
  fields: ActionField[]
  serialize: (values: FieldValues) => string
}

const TME_HOSTS = ["t.me", "telegram.me", "www.t.me", "www.telegram.me"]

function str(value: string | boolean | undefined): string {
  return typeof value === "string" ? value : ""
}

function isDigits(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

// ---------------------------------------------------------------------------
// Field validators (mirror the backend parse_* helpers)
// ---------------------------------------------------------------------------

function validateMessageId(value: string): string | null {
  return isDigits(value) ? null : "Enter a numeric message id (e.g. 12345)."
}

function validateOptionalMessageId(value: string): string | null {
  if (!value.trim()) return null
  return isDigits(value) ? null : "Message id must be numeric, or leave empty."
}

function validateMessageIds(value: string): string | null {
  const ids = value.split(/[\s,]+/).filter(Boolean)
  if (ids.length && ids.every(isDigits)) return null
  return "Enter one or more numeric message ids (e.g. 101, 102)."
}

function validateSchedule(value: string): string | null {
  const clean = value.trim()
  if (!clean) return "Pick a time, or use +15m, +2h, +1d."
  if (/^\+\d+[mhd]$/i.test(clean)) return null
  if (!Number.isNaN(new Date(clean).getTime())) return null
  return "Use a date/time, or a relative value like +15m, +2h, +1d."
}

function validateReferralValue(value: string, all: FieldValues): string | null {
  const clean = value.trim()
  if (!clean) return null
  const mode = str(all.referral_mode) || "start"
  if (mode === "start") {
    if (clean.length > 64) return "Classic referral param allows at most 64 characters."
    if (!/^[A-Za-z0-9_-]+$/.test(clean)) {
      return "Only letters, digits, '_' and '-' are allowed for a classic param."
    }
  } else if (clean.length > 512) {
    return "Mini app referral param is too long (max 512)."
  }
  return null
}

function validateForwardSource(value: string): string | null {
  const clean = value.trim()
  if (!clean) return "Enter @chat:message_id or a t.me message link."
  try {
    const url = new URL(clean)
    if (TME_HOSTS.includes(url.hostname)) {
      const segments = url.pathname.split("/").filter(Boolean)
      const privateLink =
        segments.length >= 3 &&
        segments[0] === "c" &&
        isDigits(segments[1]) &&
        isDigits(segments[2])
      const publicLink = segments.length >= 2 && isDigits(segments[1])
      if (privateLink || publicLink) return null
      return "Link must point to a specific message (e.g. t.me/channel/123)."
    }
  } catch {
    // not a URL, fall through to @chat:id parsing
  }
  const separator = clean.lastIndexOf(":")
  if (separator <= 0) return "Use @chat:message_id (e.g. @news:101) or a t.me link."
  const ids = clean.slice(separator + 1).split(/[\s,]+/).filter(Boolean)
  if (!ids.length || !ids.every(isDigits)) return "Message id(s) after ':' must be numeric."
  return null
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function normalizeSchedule(value: string): string {
  const clean = value.trim()
  if (/^\+\d+[mhd]$/i.test(clean)) return clean.toLowerCase()
  const date = new Date(clean)
  if (Number.isNaN(date.getTime())) return clean
  // datetime-local is local time; send UTC so the backend (which treats naive
  // ISO as UTC) schedules the moment the operator actually picked.
  return date.toISOString()
}

const PARSE_MODE_OPTIONS: ActionFieldOption[] = [
  { value: "none", label: "Plain text" },
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
]

const REFERRAL_MODE_OPTIONS: ActionFieldOption[] = [
  { value: "start", label: "Classic bot (?start=)" },
  { value: "startapp", label: "Mini app (?startapp=)" },
]

// ---------------------------------------------------------------------------
// Per-action schemas
// ---------------------------------------------------------------------------

const SCHEMAS: Partial<Record<ActionType, ActionFormSchema>> = {
  send_message: {
    fields: [
      {
        name: "text",
        label: "Message text",
        kind: "textarea",
        required: true,
        placeholder: "Type the message to send…",
      },
    ],
    serialize: (v) => str(v.text).trim(),
  },
  send_media: {
    fields: [
      {
        name: "file",
        label: "File path",
        kind: "text",
        required: true,
        placeholder: "E:/path/photo.jpg",
        help: "Absolute path to a local file on this machine.",
      },
      {
        name: "parse_mode",
        label: "Caption format",
        kind: "select",
        options: PARSE_MODE_OPTIONS,
        default: "none",
      },
      {
        name: "caption",
        label: "Caption (optional)",
        kind: "textarea",
        placeholder: "Optional caption shown under the media…",
      },
    ],
    serialize: (v) => {
      const lines = [`file=${str(v.file).trim()}`]
      const mode = str(v.parse_mode)
      if (mode && mode !== "none") lines.push(`parse_mode=${mode}`)
      const caption = str(v.caption).trim()
      if (caption) lines.push(caption)
      return lines.join("\n")
    },
  },
  schedule_message: {
    fields: [
      {
        name: "schedule",
        label: "Send at",
        kind: "datetime",
        required: true,
        validate: validateSchedule,
        help: "Pick a time or use a quick offset.",
      },
      {
        name: "text",
        label: "Message text",
        kind: "textarea",
        required: true,
        placeholder: "Type the message to schedule…",
      },
    ],
    serialize: (v) => `schedule=${normalizeSchedule(str(v.schedule))}\n${str(v.text).trim()}`,
  },
  forward_message: {
    fields: [
      {
        name: "source",
        label: "Source message",
        kind: "text",
        required: true,
        placeholder: "@channel:12345  ·  @channel:101,102  ·  https://t.me/channel/123",
        help: "Where to copy the message(s) from. Destination is the Target above.",
        validate: validateForwardSource,
      },
    ],
    serialize: (v) => str(v.source).trim(),
  },
  edit_message: {
    fields: [
      {
        name: "id",
        label: "Message id",
        kind: "text",
        required: true,
        placeholder: "12345",
        validate: validateMessageId,
        help: "Id of one of your own messages in the target chat.",
      },
      {
        name: "text",
        label: "New text",
        kind: "textarea",
        required: true,
        placeholder: "Updated message text…",
      },
    ],
    serialize: (v) => `id=${str(v.id).trim()}\n${str(v.text).trim()}`,
  },
  delete_messages: {
    fields: [
      {
        name: "ids",
        label: "Message ids",
        kind: "text",
        required: true,
        placeholder: "101, 102, 103",
        validate: validateMessageIds,
        help: "One or more numeric ids, separated by commas or spaces.",
      },
      {
        name: "revoke",
        label: "Delete for everyone (where allowed)",
        kind: "checkbox",
        default: true,
      },
    ],
    serialize: (v) => `ids=${str(v.ids).trim()}\nrevoke=${v.revoke === false ? "false" : "true"}`,
  },
  pin_message: {
    fields: [
      {
        name: "id",
        label: "Message id",
        kind: "text",
        required: true,
        placeholder: "12345",
        validate: validateMessageId,
      },
      {
        name: "notify",
        label: "Notify members",
        kind: "checkbox",
        default: false,
      },
    ],
    serialize: (v) => `id=${str(v.id).trim()}\nnotify=${v.notify === true ? "true" : "false"}`,
  },
  unpin_message: {
    fields: [
      {
        name: "id",
        label: "Message id (optional)",
        kind: "text",
        placeholder: "Leave empty to unpin all",
        validate: validateOptionalMessageId,
        help: "Leave empty to unpin every pinned message in the chat.",
      },
    ],
    // Always emit id= so the step has a non-empty message; an empty value tells
    // the backend to unpin all pins.
    serialize: (v) => `id=${str(v.id).trim()}`,
  },
  download_media: {
    fields: [
      {
        name: "id",
        label: "Message id",
        kind: "text",
        required: true,
        placeholder: "12345",
        validate: validateMessageId,
        help: "Id of the message that contains the media to download.",
      },
    ],
    serialize: (v) => `id=${str(v.id).trim()}`,
  },
  start_bot: {
    fields: [
      {
        name: "referral_mode",
        label: "Referral type",
        kind: "select",
        options: REFERRAL_MODE_OPTIONS,
        default: "start",
        help: "Mini app opens the bot web app so tap-to-earn / Stars referrals are credited.",
      },
      {
        name: "referral_value",
        label: "Referral parameter (optional)",
        kind: "text",
        placeholder: "ref123",
        validate: validateReferralValue,
        help: "Leave empty to just send /start, or if the parameter is already in the link.",
      },
    ],
    serialize: (v) => {
      const value = str(v.referral_value).trim()
      if (!value) return ""
      const mode = str(v.referral_mode) || "start"
      return `${mode}=${value}`
    },
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getActionSchema(actionType: ActionType): ActionFormSchema | null {
  return SCHEMAS[actionType] ?? null
}

export function defaultFieldValues(actionType: ActionType): FieldValues {
  const schema = getActionSchema(actionType)
  if (!schema) return {}
  const values: FieldValues = {}
  for (const field of schema.fields) {
    if (field.default !== undefined) values[field.name] = field.default
    else if (field.kind === "checkbox") values[field.name] = false
    else values[field.name] = ""
  }
  return values
}

// Defaults for the new action, but carry over any field the user already filled
// that the new action also has (e.g. switching send_message → schedule_message
// keeps the typed "text"). Stops the form wiping work on every action change.
export function carryFieldValues(
  actionType: ActionType,
  previous: FieldValues
): FieldValues {
  const next = defaultFieldValues(actionType)
  for (const name of Object.keys(next)) {
    if (name in previous) next[name] = previous[name]
  }
  return next
}

export function validateFields(
  actionType: ActionType,
  values: FieldValues
): Record<string, string> {
  const schema = getActionSchema(actionType)
  if (!schema) return {}
  const errors: Record<string, string> = {}
  for (const field of schema.fields) {
    if (field.kind === "checkbox") continue
    const value = str(values[field.name])
    if (!value.trim()) {
      if (field.required) errors[field.name] = `${field.label} is required.`
      continue
    }
    const error = field.validate?.(value, values)
    if (error) errors[field.name] = error
  }
  return errors
}

export function serializeFields(
  actionType: ActionType,
  values: FieldValues
): string | undefined {
  const schema = getActionSchema(actionType)
  if (!schema) return undefined
  const serialized = schema.serialize(values).trim()
  return serialized || undefined
}

export function isActionFormValid(
  actionType: ActionType,
  values: FieldValues
): boolean {
  return Object.keys(validateFields(actionType, values)).length === 0
}
