import type { EndMode, IntervalUnit, RecurrenceConfig, Schedule } from "../types"

// Local form shape for the recurrence builder. Values are kept as strings so the
// inputs stay controlled; buildRecurrence() converts them to the API payload.
export type RecurrenceForm = {
  intervalValue: string
  intervalUnit: IntervalUnit
  startMode: "now" | "at"
  startAt: string
  endMode: EndMode
  endCount: string
  endUntil: string
}

export const defaultRecurrenceForm: RecurrenceForm = {
  intervalValue: "5",
  intervalUnit: "minutes",
  startMode: "now",
  startAt: "",
  endMode: "forever",
  endCount: "10",
  endUntil: "",
}

export const intervalUnitOptions: Array<{ value: IntervalUnit; label: string }> =
  [
    { value: "minutes", label: "minutes" },
    { value: "hours", label: "hours" },
    { value: "days", label: "days" },
  ]

export const endModeOptions: Array<{ value: EndMode; label: string }> = [
  { value: "forever", label: "Run forever" },
  { value: "count", label: "After N times" },
  { value: "until", label: "Until a date" },
]

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
  if (form.startMode === "at") {
    const iso = toIso(form.startAt)
    if (!iso) return "Pick a valid start date/time, or start now."
  }
  if (form.endMode === "count" && !isPositiveInt(form.endCount)) {
    return "Repeat count must be a whole number of 1 or more."
  }
  if (form.endMode === "until") {
    const iso = toIso(form.endUntil)
    if (!iso) return "Pick a valid end date/time."
    if (new Date(form.endUntil).getTime() <= Date.now()) {
      return "The end date/time must be in the future."
    }
  }
  return null
}

export function buildRecurrence(form: RecurrenceForm): RecurrenceConfig {
  return {
    interval_value: Number(form.intervalValue),
    interval_unit: form.intervalUnit,
    start_at: form.startMode === "at" ? toIso(form.startAt) : null,
    end_mode: form.endMode,
    end_count: form.endMode === "count" ? Number(form.endCount) : null,
    end_until: form.endMode === "until" ? toIso(form.endUntil) : null,
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
