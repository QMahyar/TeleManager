import type { ActionType, QueueStep, ScheduleEngine } from "../types"
import { actionMeta } from "./constants"

// Frontend mirror of the backend's `_step_is_native` / `classify_engine`
// (src/telemanager/schedules_service.py). It lets the Schedule modal tell the
// operator *up front* — before they Preview — whether a queue will be delivered
// by Telegram while the app is closed (native) or only runs while TeleManager is
// open (runner). Keep this in sync with NATIVE_MESSAGE_ACTIONS on the backend.

// Action types Telegram can pre-deliver server-side as a scheduled message
// (text via sendMessage, media via sendMedia).
const NATIVE_MESSAGE_ACTIONS = new Set<ActionType>(["send_message", "send_media"])

export function stepIsNativeSchedulable(step: QueueStep): boolean {
  if (NATIVE_MESSAGE_ACTIONS.has(step.action_type)) return true
  // A bare "/start" (no referral parameter) is just a text message Telegram can
  // pre-schedule; a referral start goes through StartBotRequest and cannot.
  if (step.action_type === "start_bot") return !(step.message ?? "").trim()
  return false
}

// Engine for a whole queue, plus the distinct action labels that force `runner`
// (so the modal can name exactly what blocks offline delivery).
export function classifyScheduleEngine(steps: QueueStep[]): {
  engine: ScheduleEngine
  blockers: string[]
} {
  const blocking = steps.filter((step) => !stepIsNativeSchedulable(step))
  if (blocking.length === 0) return { engine: "native", blockers: [] }
  const blockers = Array.from(
    new Set(blocking.map((step) => actionMeta[step.action_type]?.label ?? step.action_type))
  )
  return { engine: "runner", blockers }
}
