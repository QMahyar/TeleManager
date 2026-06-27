import type { TelegramDialog } from "../types"

// Resolving a Telegram dialog's *kind* and its addressable *target* from a cached
// dialog record. Both have to tolerate shape drift: a dialog can arrive from a
// fresh fetch, an older cached payload, or a few different backend code paths, and
// those don't all label the fields identically. Centralizing the fallback chains
// here (rather than re-deriving them ad hoc at each call site) keeps every screen,
// picker, and action-availability check reading the same identity.
//
// Keep in lockstep with the backend's dialog/target resolution (telegram_actions);
// if the canonical field names change there, change them here too.

// The dialog's category (user / group / supergroup / channel / bot / ...). Different
// payload versions store it under different keys, so fall through them in priority
// order; "unknown" is the last resort so callers never get undefined.
export function dialogKind(dialog: TelegramDialog) {
  return (
    dialog.dialog_type ||
    dialog.kind ||
    dialog.type ||
    dialog.entity_type ||
    "unknown"
  )
}

// The canonical addressable target the backend accepts for an action: a public
// "@username" when one exists, otherwise the numeric id as a string. This is the
// single string used as both the selection key and the value sent to /api/actions.
export function dialogTarget(dialog: TelegramDialog) {
  return dialog.username ? `@${dialog.username}` : String(dialog.id)
}
