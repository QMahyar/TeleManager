import type { TelegramDialog } from "../types"

// Resolving a Telegram dialog's *kind* and its addressable *target* from a cached
// dialog record. Centralizing these here (rather than re-deriving them ad hoc at
// each call site) keeps every screen, picker, and action-availability check reading
// the same identity. The backend (dialogs_service.classify_dialog) writes exactly
// one category field, `dialog_type`; keep that name in sync if it ever changes there.

// The dialog's category (personal / group / supergroup / channel / bot / ...).
// "unknown" is the last resort so callers never get undefined.
export function dialogKind(dialog: TelegramDialog) {
  return dialog.dialog_type || "unknown"
}

// The canonical addressable target the backend accepts for an action: a public
// "@username" when one exists, otherwise the numeric id as a string. This is the
// single string used as both the selection key and the value sent to /api/actions.
export function dialogTarget(dialog: TelegramDialog) {
  return dialog.username ? `@${dialog.username}` : String(dialog.id)
}
