import type { ActionsMeta, ActionType, TelegramDialog } from "../types"

import { getActionSchema } from "./action-schema"
import { resolveActionMeta } from "./action-meta"
import { dialogKind, dialogTarget } from "./dialog-resolver"
import { analyzeTarget } from "./targeting"

// A quick action needs an inline mini-prompt when it has a structured form
// (message text, ids, schedule time, …); otherwise it runs with one click.
export function quickActionNeedsInput(actionType: ActionType): boolean {
  return Boolean(getActionSchema(actionType))
}

// One-click actions still confirm first when they are destructive, or when they
// leave a chat (an easy-to-regret state change even though it's reversible).
export function quickActionNeedsConfirm(
  actionType: ActionType,
  apiMeta?: ActionsMeta | null
): boolean {
  return (
    Boolean(resolveActionMeta(actionType, apiMeta ?? null).destructive) ||
    actionType === "leave_chat"
  )
}

export type DialogKind =
  | "bot"
  | "personal"
  | "group"
  | "supergroup"
  | "channel"
  | "unknown"

export function normalizeKind(dialog: TelegramDialog): DialogKind {
  const kind = dialogKind(dialog)
  if (
    kind === "bot" ||
    kind === "personal" ||
    kind === "group" ||
    kind === "supergroup" ||
    kind === "channel"
  ) {
    return kind
  }
  return "unknown"
}

// Per-kind action menus shown on a single dialog row. Ordered most-common first.
const ROW_ACTIONS: Record<DialogKind, ActionType[]> = {
  bot: [
    "start_bot",
    "send_message",
    "schedule_message",
    "export_chat",
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "pin_chat",
    "block_user",
  ],
  personal: [
    "send_message",
    "send_media",
    "schedule_message",
    "export_chat",
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "pin_chat",
    "block_user",
  ],
  group: [
    "send_message",
    "send_media",
    "schedule_message",
    "export_chat",
    "leave_chat",
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "pin_chat",
    "read_chat",
    "report_spam",
  ],
  supergroup: [
    "send_message",
    "send_media",
    "schedule_message",
    "export_chat",
    "leave_chat",
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "pin_chat",
    "read_chat",
    "report_spam",
  ],
  channel: [
    "send_message",
    "send_media",
    "schedule_message",
    "export_chat",
    "leave_chat",
    "delete_chat",
    "mute_chat",
    "archive_chat",
    "pin_chat",
    "read_chat",
    "report_spam",
  ],
  unknown: ["send_message", "export_chat", "delete_chat", "clear_chat", "mute_chat", "archive_chat"],
  unknown: ["send_message", "delete_chat", "clear_chat", "mute_chat", "archive_chat", "pin_chat"],
}

// Bulk actions are limited to ones that make sense applied to many chats at once
// (no message composition, no per-message ids). The list a user actually sees is
// the intersection of these across every selected dialog's kind, so an option is
// never offered for a chat type it cannot apply to.
const BULK_ELIGIBLE: ActionType[] = [
  "mute_chat",
  "unmute_chat",
  "archive_chat",
  "unarchive_chat",
  "pin_chat",
  "unpin_chat",
  "read_chat",
  "leave_chat",
  "clear_chat",
  "delete_chat",
  "block_user",
  "report_spam",
  "export_chat",
]

// Which bulk-eligible actions are valid for each dialog kind.
const BULK_VALID_BY_KIND: Record<DialogKind, Set<ActionType>> = {
  bot: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "pin_chat",
    "unpin_chat",
    "read_chat",
    "clear_chat",
    "delete_chat",
    "block_user",
    "export_chat",
  ]),
  personal: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "pin_chat",
    "unpin_chat",
    "read_chat",
    "clear_chat",
    "delete_chat",
    "block_user",
    "export_chat",
  ]),
  group: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "pin_chat",
    "unpin_chat",
    "read_chat",
    "leave_chat",
    "clear_chat",
    "delete_chat",
    "report_spam",
    "export_chat",
  ]),
  supergroup: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "pin_chat",
    "unpin_chat",
    "read_chat",
    "leave_chat",
    "clear_chat",
    "delete_chat",
    "report_spam",
    "export_chat",
  ]),
  channel: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "pin_chat",
    "unpin_chat",
    "read_chat",
    "leave_chat",
    "delete_chat",
    "report_spam",
    "export_chat",
  ]),
  unknown: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "pin_chat",
    "unpin_chat",
    "read_chat",
    "clear_chat",
    "delete_chat",
    "export_chat",
  ]),
}

export function quickActionsForDialog(dialog: TelegramDialog): ActionType[] {
  return ROW_ACTIONS[normalizeKind(dialog)]
}

// Actions that only make sense for certain chat kinds. Everything not listed
// here is kind-unrestricted (messaging, management, cleanup, message tools apply
// to any chat) and is judged purely on target format below.
const KIND_RESTRICTED: Partial<Record<ActionType, Set<DialogKind>>> = {
  start_bot: new Set<DialogKind>(["bot"]),
  block_user: new Set<DialogKind>(["personal", "bot"]),
  unblock_user: new Set<DialogKind>(["personal", "bot"]),
  leave_chat: new Set<DialogKind>(["group", "supergroup", "channel"]),
}

// Can this chat be a target for this action? Semantic (chat kind) check first,
// then the existing format check so the picker greys exactly what the chip list
// would. Unknown kinds skip the semantic check to avoid false-greying.
export function dialogCompatibility(
  dialog: TelegramDialog,
  actionType: ActionType,
  apiMeta?: ActionsMeta | null
): { compatible: boolean; reason?: string } {
  const kind = normalizeKind(dialog)
  const allowed = KIND_RESTRICTED[actionType]
  if (allowed && kind !== "unknown" && !allowed.has(kind)) {
    return {
      compatible: false,
      reason: `${resolveActionMeta(actionType, apiMeta ?? null).label} doesn't apply to a ${kind}.`,
    }
  }
  const analysis = analyzeTarget(dialogTarget(dialog), actionType, apiMeta)
  if (analysis.error) return { compatible: false, reason: analysis.error }
  return { compatible: true }
}

export function selectionKindCounts(
  dialogs: TelegramDialog[]
): Record<DialogKind, number> {
  const counts: Record<DialogKind, number> = {
    bot: 0,
    personal: 0,
    group: 0,
    supergroup: 0,
    channel: 0,
    unknown: 0,
  }
  for (const dialog of dialogs) {
    counts[normalizeKind(dialog)] += 1
  }
  return counts
}

// Actions valid for EVERY selected dialog (kind intersection), preserving the
// canonical order in BULK_ELIGIBLE.
export function bulkActionsForSelection(
  dialogs: TelegramDialog[]
): ActionType[] {
  if (!dialogs.length) return []
  const kinds = new Set(dialogs.map(normalizeKind))
  return BULK_ELIGIBLE.filter((action) =>
    [...kinds].every((kind) => BULK_VALID_BY_KIND[kind].has(action))
  )
}
