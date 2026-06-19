import type { ActionType, TelegramDialog } from "../types"

import { dialogKind } from "./helpers"

export type DialogKind =
  | "bot"
  | "personal"
  | "group"
  | "supergroup"
  | "channel"
  | "unknown"

function normalizeKind(dialog: TelegramDialog): DialogKind {
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
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "block_user",
  ],
  personal: [
    "send_message",
    "send_media",
    "schedule_message",
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "block_user",
  ],
  group: [
    "send_message",
    "send_media",
    "schedule_message",
    "leave_chat",
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "read_chat",
    "report_spam",
  ],
  supergroup: [
    "send_message",
    "send_media",
    "schedule_message",
    "leave_chat",
    "delete_chat",
    "clear_chat",
    "mute_chat",
    "archive_chat",
    "read_chat",
    "report_spam",
  ],
  channel: [
    "send_message",
    "send_media",
    "schedule_message",
    "leave_chat",
    "delete_chat",
    "mute_chat",
    "archive_chat",
    "read_chat",
    "report_spam",
  ],
  unknown: ["send_message", "delete_chat", "clear_chat", "mute_chat", "archive_chat"],
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
  "read_chat",
  "leave_chat",
  "clear_chat",
  "delete_chat",
  "block_user",
  "report_spam",
]

// Which bulk-eligible actions are valid for each dialog kind.
const BULK_VALID_BY_KIND: Record<DialogKind, Set<ActionType>> = {
  bot: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "read_chat",
    "clear_chat",
    "delete_chat",
    "block_user",
  ]),
  personal: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "read_chat",
    "clear_chat",
    "delete_chat",
    "block_user",
  ]),
  group: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "read_chat",
    "leave_chat",
    "clear_chat",
    "delete_chat",
    "report_spam",
  ]),
  supergroup: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "read_chat",
    "leave_chat",
    "clear_chat",
    "delete_chat",
    "report_spam",
  ]),
  channel: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "read_chat",
    "leave_chat",
    "delete_chat",
    "report_spam",
  ]),
  unknown: new Set([
    "mute_chat",
    "unmute_chat",
    "archive_chat",
    "unarchive_chat",
    "read_chat",
    "clear_chat",
    "delete_chat",
  ]),
}

export function quickActionsForDialog(dialog: TelegramDialog): ActionType[] {
  return ROW_ACTIONS[normalizeKind(dialog)]
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
