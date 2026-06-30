import { dialogTarget } from "./dialog-resolver"
import type { ActionType, QueueStep, TelegramDialog } from "../types"

// Multi-account sync: copy archive/mute state from one account's chats onto the
// matching chats of other accounts. This is purely a *queue builder* — the diff
// becomes ordinary archive/mute steps that run through the existing guarded,
// rate-limited, audited action queue. No new backend action type is involved.

// Queue validation caps a step at 25 targets; chunk wider diffs across steps.
export const MAX_TARGETS_PER_STEP = 25

export type SyncOptions = { archive: boolean; mute: boolean }
export type SyncTargetAccount = { accountId: string; dialogs: TelegramDialog[] }
export type SyncOp = { action_type: ActionType; target: string; title: string }

// Identity used to match the "same" chat across two accounts. Username (lower-cased)
// when present — it's stable and human-meaningful; otherwise the marked id, which is
// global for channels/supergroups and identical for a shared user/bot. Titles are
// deliberately NOT used: the same chat can be renamed differently per account.
export function syncKey(dialog: TelegramDialog): string {
  return dialog.username
    ? `@${String(dialog.username).toLowerCase()}`
    : String(dialog.id)
}

// The per-target operations needed to make `target`'s chats match `source`'s
// archive/mute state. Only chats present in BOTH accounts are touched — we never
// archive or mute a chat the target account isn't in.
export function syncDiff(
  source: TelegramDialog[],
  target: TelegramDialog[],
  options: SyncOptions
): SyncOp[] {
  const targetByKey = new Map(target.map((dialog) => [syncKey(dialog), dialog]))
  const ops: SyncOp[] = []
  for (const src of source) {
    const dst = targetByKey.get(syncKey(src))
    if (!dst) continue
    if (options.archive && Boolean(src.archived) !== Boolean(dst.archived)) {
      ops.push({
        action_type: src.archived ? "archive_chat" : "unarchive_chat",
        target: dialogTarget(dst),
        title: dst.title,
      })
    }
    if (options.mute && Boolean(src.muted) !== Boolean(dst.muted)) {
      ops.push({
        action_type: src.muted ? "mute_chat" : "unmute_chat",
        target: dialogTarget(dst),
        title: dst.title,
      })
    }
  }
  return ops
}

// Build a runnable queue from the diff across every selected target account:
// group each account's ops by action type and chunk to the per-step target cap.
export function buildSyncSteps(
  source: TelegramDialog[],
  targets: SyncTargetAccount[],
  options: SyncOptions
): QueueStep[] {
  const steps: QueueStep[] = []
  for (const { accountId, dialogs } of targets) {
    const byAction = new Map<ActionType, string[]>()
    for (const op of syncDiff(source, dialogs, options)) {
      const list = byAction.get(op.action_type) ?? []
      list.push(op.target)
      byAction.set(op.action_type, list)
    }
    for (const [action_type, allTargets] of byAction) {
      for (let i = 0; i < allTargets.length; i += MAX_TARGETS_PER_STEP) {
        steps.push({
          action_type,
          targets: allTargets.slice(i, i + MAX_TARGETS_PER_STEP),
          account_ids: [accountId],
        })
      }
    }
  }
  return steps
}

// Total operations a step list will run (one per target). Used to show the
// operator the size of the change and to keep it under the queue's hard limit.
export function syncOpCount(steps: QueueStep[]): number {
  return steps.reduce((sum, step) => sum + step.targets.length, 0)
}
