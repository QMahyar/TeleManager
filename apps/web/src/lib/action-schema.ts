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
  // `help` is the short, always-visible caption under the field. `hint` is the
  // richer explanation surfaced behind the label's "ⓘ" (what it does · why it
  // matters · an example) — kept separate so the form stays uncluttered.
  help?: string
  hint?: string
  options?: ActionFieldOption[]
  default?: string | boolean
  validate?: (value: string, all: FieldValues) => string | null
  // When set on a "text" field, renders a native OS "Browse…" button beside the
  // input that fills in an absolute file/folder path on this machine.
  browse?: "file" | "directory"
}

export type ActionFormSchema = {
  fields: ActionField[]
  serialize: (values: FieldValues) => string
  // Inverse of serialize: rebuild field values from a stored message string so a
  // queued/preset step can be loaded back into the form. Omit when the action
  // has no fields. Returns only the keys it can recover; callers merge over
  // defaults.
  deserialize?: (message: string) => FieldValues
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

// Pull `key=value` lines out of a message, returning the map plus the remaining
// lines (everything that wasn't a recognized key=value pair). Used to invert the
// serialize() forms back into field values.
function splitKeyedLines(
  message: string,
  keys: string[]
): { keyed: Record<string, string>; rest: string } {
  const keyed: Record<string, string> = {}
  const leftover: string[] = []
  for (const line of message.split("\n")) {
    const match = /^([a-z_]+)=(.*)$/i.exec(line)
    if (match && keys.includes(match[1])) keyed[match[1]] = match[2]
    else leftover.push(line)
  }
  return { keyed, rest: leftover.join("\n").trim() }
}

// ISO timestamp -> the value a <input type="datetime-local"> expects.
// ponytail: drops seconds + renders in local tz; the picker only has minute precision.
function isoToLocalInput(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function deserializeSchedule(value: string): string {
  const clean = value.trim()
  if (/^\+\d+[mhd]$/i.test(clean)) return clean.toLowerCase()
  return isoToLocalInput(clean)
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
    deserialize: (m) => ({ text: m }),
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
        hint: "TeleManager uploads this file from your computer to the target chat. Give the full path (e.g. E:/media/clip.mp4) or click Browse to pick it. Telegram caps a single upload at 2 GB.",
        browse: "file",
      },
      {
        name: "parse_mode",
        label: "Caption format",
        kind: "select",
        options: PARSE_MODE_OPTIONS,
        default: "none",
        hint: "How the caption text is interpreted. Markdown or HTML let you add bold, italics, and links; Plain text sends the caption exactly as typed.",
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
    deserialize: (m) => {
      const { keyed, rest } = splitKeyedLines(m, ["file", "parse_mode"])
      return {
        file: keyed.file ?? "",
        parse_mode: keyed.parse_mode || "none",
        caption: rest,
      }
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
        hint: "When Telegram delivers the message. Choose an exact date/time, or type a relative offset like +15m, +2h, or +1d from now. Exact times use this computer's local timezone.",
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
    deserialize: (m) => {
      const { keyed, rest } = splitKeyedLines(m, ["schedule"])
      return { schedule: deserializeSchedule(keyed.schedule ?? ""), text: rest }
    },
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
        hint: "Identifies the original message(s) to forward. Use @chat:id for a public chat, a full t.me message link, or several ids at once like @news:101,102. The destination is the Target set above this form.",
        validate: validateForwardSource,
      },
    ],
    serialize: (v) => str(v.source).trim(),
    deserialize: (m) => ({ source: m }),
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
        hint: "Telegram's numeric id for the message to rewrite — find it in the message's t.me link or the dialog inspector. You can only edit messages your own account sent.",
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
    deserialize: (m) => {
      const { keyed, rest } = splitKeyedLines(m, ["id"])
      return { id: keyed.id ?? "", text: rest }
    },
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
        hint: "The messages to delete, by numeric id (e.g. 101, 102) — find each id in its t.me link. Deletion is permanent and cannot be undone.",
      },
      {
        name: "revoke",
        label: "Delete for everyone (where allowed)",
        kind: "checkbox",
        default: true,
        hint: "On removes the message for everyone in the chat, where Telegram permits it. Off deletes it only from your side. Telegram limits how far back you can revoke for others.",
      },
    ],
    serialize: (v) => `ids=${str(v.ids).trim()}\nrevoke=${v.revoke === false ? "false" : "true"}`,
    deserialize: (m) => {
      const { keyed } = splitKeyedLines(m, ["ids", "revoke"])
      return { ids: keyed.ids ?? "", revoke: keyed.revoke !== "false" }
    },
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
        help: "Numeric id of the message to pin.",
        hint: "Pins a message to the top of the target chat. Use its numeric id, found in the message's t.me link.",
      },
      {
        name: "notify",
        label: "Notify members",
        kind: "checkbox",
        default: false,
        hint: "On sends every member a “pinned a message” notification. Off pins quietly without alerting anyone.",
      },
    ],
    serialize: (v) => `id=${str(v.id).trim()}\nnotify=${v.notify === true ? "true" : "false"}`,
    deserialize: (m) => {
      const { keyed } = splitKeyedLines(m, ["id", "notify"])
      return { id: keyed.id ?? "", notify: keyed.notify === "true" }
    },
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
        hint: "Unpins one pinned message by its numeric id. Leave the field empty to clear every pinned message in the chat at once.",
      },
    ],
    // Always emit id= so the step has a non-empty message; an empty value tells
    // the backend to unpin all pins.
    serialize: (v) => `id=${str(v.id).trim()}`,
    deserialize: (m) => ({ id: splitKeyedLines(m, ["id"]).keyed.id ?? "" }),
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
        hint: "Saves the photo or file attached to this message onto your computer. Use the numeric id of a message that actually carries media.",
      },
    ],
    serialize: (v) => `id=${str(v.id).trim()}`,
    deserialize: (m) => ({ id: splitKeyedLines(m, ["id"]).keyed.id ?? "" }),
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
        hint: "Classic sends /start?ref=… to the bot chat. Mini app opens the bot's web app instead (?startapp=…), which some bots require before a tap-to-earn or Stars referral is credited.",
      },
      {
        name: "referral_value",
        label: "Referral parameter (optional)",
        kind: "text",
        placeholder: "ref123",
        validate: validateReferralValue,
        help: "Leave empty to just send /start, or if the parameter is already in the link.",
        hint: "The deep-link parameter after a bot's start link — e.g. ref123 from t.me/somebot?start=ref123. Leave empty to send a plain /start, or when the link you used already carries the code.",
      },
    ],
    serialize: (v) => {
      const value = str(v.referral_value).trim()
      if (!value) return ""
      const mode = str(v.referral_mode) || "start"
      return `${mode}=${value}`
    },
    deserialize: (m) => {
      const { keyed } = splitKeyedLines(m, ["start", "startapp"])
      const result: FieldValues = {}
      if ("startapp" in keyed) {
        result.referral_mode = "startapp"
        result.referral_value = keyed.startapp
      } else if ("start" in keyed) {
        result.referral_mode = "start"
        result.referral_value = keyed.start
      }
      return result
    },
  },
  export_chat: {
    fields: [
      {
        name: "limit",
        label: "Max messages",
        kind: "text",
        placeholder: "10000",
        help: "Hard cap: 10 000. Smaller values export faster.",
        hint: "Maximum number of messages to export. The export is capped at 10 000 to stay within the queue timeout. For very large histories, export in batches by adjusting this number.",
      },
      {
        name: "media",
        label: "Include media info",
        kind: "checkbox",
        default: false,
        hint: "On includes a has_media flag per message. Actual media files are not downloaded — use the Download media action for that.",
      },
    ],
    serialize: (v) => {
      const lines: string[] = []
      const limit = str(v.limit).trim()
      if (limit && limit !== "10000") lines.push(`limit=${limit}`)
      if (v.media === true) lines.push("media=true")
      return lines.join("\n")
    },
    deserialize: (m) => {
      const { keyed } = splitKeyedLines(m, ["limit", "media"])
      return {
        limit: keyed.limit ?? "10000",
        media: keyed.media === "true",
      }
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

// Inverse of serializeFields: rebuild form values from a stored message string,
// starting from defaults so any field the schema can't recover stays valid.
export function deserializeFields(
  actionType: ActionType,
  message: string
): FieldValues {
  const defaults = defaultFieldValues(actionType)
  const schema = getActionSchema(actionType)
  if (!schema?.deserialize) return defaults
  const recovered = schema.deserialize(message.trim())
  return { ...defaults, ...recovered }
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
