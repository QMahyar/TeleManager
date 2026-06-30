import type { ConditionField, ConditionOp, StepCondition } from "../types"

// Presentation + validation for the #12 step condition. The backend's StepCondition
// (action_conditions.py / action_queue_service.StepCondition) is the source of truth
// for what each field means and how it's evaluated; this module only turns the
// structured {field, op, value} into labels the operator reads and a value guard.

export const conditionFieldOptions: Array<{
  value: ConditionField
  label: string
  hint: string
}> = [
  {
    value: "member_count",
    label: "Member count",
    hint: "Participants in the group/channel. Read live from Telegram per target.",
  },
  {
    value: "days_since_last_message",
    label: "Days since last message",
    hint: "Age of the newest message in the chat. Read live from Telegram per target.",
  },
  {
    value: "unread_count",
    label: "Unread count",
    hint: "Unread messages, from the last dialog fetch (cached — re-fetch to refresh).",
  },
]

export const conditionOpOptions: Array<{ value: ConditionOp; label: string }> = [
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "==", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
]

export const defaultCondition: StepCondition = {
  field: "unread_count",
  op: "==",
  value: 0,
}

// "member_count < 10" — the raw field name, matching how the backend records it in
// the run detail, so the queue badge and the run log read the same.
export function describeCondition(condition: StepCondition): string {
  return `${condition.field} ${condition.op} ${condition.value}`
}

export function validateCondition(condition: StepCondition | null): string | null {
  if (!condition) return null
  if (!Number.isFinite(condition.value) || condition.value < 0) {
    return "Condition value must be a number of 0 or more."
  }
  return null
}
