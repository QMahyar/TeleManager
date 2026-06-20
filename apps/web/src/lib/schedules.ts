import type { EndMode, IntervalUnit, RecurrenceConfig, Schedule } from "../types"

// Local form shape for the recurrence builder. Values are kept as strings so the
// inputs stay controlled; buildRecurrence() converts them to the API payload.
export type StartMode = "interval" | "delay" | "at"

export type RecurrenceForm = {
  intervalValue: string
  intervalUnit: IntervalUnit
  startMode: StartMode
  startDelayValue: string
  startDelayUnit: IntervalUnit
  startAt: string
  endMode: EndMode
  endCount: string
  endUntil: string
  stagger: boolean
}

export const defaultRecurrenceForm: RecurrenceForm = {
  intervalValue: "20",
  intervalUnit: "minutes",
  startMode: "interval",
  startDelayValue: "1",
  startDelayUnit: "hours",
  startAt: "",
  endMode: "count",
  endCount: "20",
  endUntil: "",
  stagger: false,
}

export const intervalUnitOptions: Array<{ value: IntervalUnit; label: string }> =
  [
    { value: "minutes", label: "minutes" },
    { value: "hours", label: "hours" },
    { value: "days", label: "days" },
  ]

export const endModeOptions: Array<{ value: EndMode; label: string }> = [
  { value: "count", label: "After N times" },
  { value: "until", label: "Until a date" },
  { value: "forever", label: "Run forever" },
]

export const startModeOptions: Array<{ value: StartMode; label: string }> = [
  { value: "interval", label: "After one interval" },
  { value: "delay", label: "After a delay" },
  { value: "at", label: "At a specific time" },
]

const UNIT_SECONDS: Record<IntervalUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
}

// Stagger applied between chats when the toggle is on (seconds).
const STAGGER_SECONDS = 30

function isPositiveInt(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) >= 1
}

// datetime-local values are local wall-clock time; the backend treats naive ISO
// as UTC, so convert to a real UTC instant the operator actually picked.
function toIso(localValue: string): string | null {
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function validateRecurrence(form: RecurrenceForm): string | null {
  if (!isPositiveInt(form.intervalValue)) {
    return "Interval must be a whole number of 1 or more."
  }
  if (form.startMode === "delay" && !isPositiveInt(form.startDelayValue)) {
    return "Start delay must be a whole number of 1 or more."
  }
  if (form.startMode === "at") {
    if (!toIso(form.startAt)) return "Pick a valid start date/time."
    if (new Date(form.startAt).getTime() <= Date.now()) {
      return "The start time must be in the future."
    }
  }
  if (form.endMode === "count" && !isPositiveInt(form.endCount)) {
    return "Repeat count must be a whole number of 1 or more."
  }
  if (form.endMode === "until") {
    if (!toIso(form.endUntil)) return "Pick a valid end date/time."
    if (new Date(form.endUntil).getTime() <= Date.now()) {
      return "The end date/time must be in the future."
    }
  }
  return null
}

function startAtIso(form: RecurrenceForm): string | null {
  if (form.startMode === "at") return toIso(form.startAt)
  if (form.startMode === "delay") {
    const seconds = Number(form.startDelayValue) * UNIT_SECONDS[form.startDelayUnit]
    return new Date(Date.now() + seconds * 1000).toISOString()
  }
  return null // "interval" => backend anchors at now + one interval
}

export function buildRecurrence(form: RecurrenceForm): RecurrenceConfig {
  return {
    interval_value: Number(form.intervalValue),
    interval_unit: form.intervalUnit,
    start_at: startAtIso(form),
    end_mode: form.endMode,
    end_count: form.endMode === "count" ? Number(form.endCount) : null,
    end_until: form.endMode === "until" ? toIso(form.endUntil) : null,
    stagger_seconds: form.stagger ? STAGGER_SECONDS : 0,
  }
}

export function describeRecurrence(recurrence: RecurrenceConfig): string {
  const { interval_value, interval_unit } = recurrence
  const unit =
    interval_value === 1 ? interval_unit.replace(/s$/, "") : interval_unit
  let phrase = `Every ${interval_value} ${unit}`
  if (recurrence.end_mode === "count") {
    phrase += `, ${recurrence.end_count} time(s)`
  } else if (recurrence.end_mode === "until" && recurrence.end_until) {
    phrase += `, until ${new Date(recurrence.end_until).toLocaleString()}`
  } else {
    phrase += ", until stopped"
  }
  if (recurrence.start_at) {
    phrase += `, starting ${new Date(recurrence.start_at).toLocaleString()}`
  }
  return phrase
}

export function engineLabel(engine: Schedule["engine"]): string {
  return engine === "native"
    ? "Telegram-delivered · works offline"
    : "Runs while app is open"
}

export function engineTone(engine: Schedule["engine"]): string {
  return engine === "native"
    ? "text-primary border-primary/30 bg-primary/10"
    : "text-amber-600 border-amber-500/30 bg-amber-500/10 dark:text-amber-400"
}
