import * as React from "react"

import {
  defaultFieldValues,
  serializeFields,
  validateFields,
} from "../lib/action-schema"
import { splitTargets } from "../lib/helpers"
import { partitionTargets } from "../lib/targeting"
import type {
  ActionDraft,
  QueueStep,
  QuickActionContext,
  SafetySettings,
  ScheduleSeed,
} from "../types"

export function useQueueState() {
  const [pendingAccountId, setPendingAccountId] = React.useState("")
  const [actionDraft, setActionDraft] = React.useState<ActionDraft>({
    action_type: "join_chat",
    target: "",
    fields: defaultFieldValues("join_chat"),
    condition: null,
  })
  const [quickActionContext, setQuickActionContext] =
    React.useState<QuickActionContext | null>(null)
  const [scheduleSeed, setScheduleSeed] = React.useState<ScheduleSeed | null>(
    null
  )

  return {
    actionDraft,
    pendingAccountId,
    quickActionContext,
    scheduleSeed,
    setActionDraft,
    setPendingAccountId,
    setQuickActionContext,
    setScheduleSeed,
  }
}

// Assemble the one-step run/schedule payload the single-action Actions screen
// commits. `valid`/`invalid` are the target partition (so the UI can show the
// "N compatible" count and warnings); `steps` is empty until there's at least one
// account and one compatible target, so an incomplete draft can't be run.
export function buildDraftPayload(
  actionDraft: ActionDraft,
  actionAccountIds: Set<string>,
  safety: SafetySettings
): {
  payload: { steps: QueueStep[] } & SafetySettings
  valid: string[]
  invalidCount: number
  accountIds: string[]
} {
  const { valid, invalid } = partitionTargets(
    splitTargets(actionDraft.target),
    actionDraft.action_type
  )
  const accountIds = [...actionAccountIds]
  const steps =
    valid.length && accountIds.length
      ? [queueStepFromDraft(actionDraft, valid, accountIds)]
      : []
  return { payload: { steps, ...safety }, valid, invalidCount: invalid.length, accountIds }
}

// Returns a user-facing reason the draft cannot be queued yet, or null if valid.
export function actionDraftBlocker(actionDraft: ActionDraft): string | null {
  const errors = validateFields(actionDraft.action_type, actionDraft.fields)
  const firstError = Object.values(errors)[0]
  return firstError || null
}

// Build one QueueStep from the current draft. Exported so the single-action
// Actions screen can assemble a one-step run/schedule payload directly from the
// draft without going through the (now dormant) multi-step `queue` array.
export function queueStepFromDraft(
  actionDraft: ActionDraft,
  targets: string[],
  account_ids: string[]
): QueueStep {
  return {
    action_type: actionDraft.action_type,
    targets,
    account_ids,
    message: serializeFields(actionDraft.action_type, actionDraft.fields),
    condition: actionDraft.condition ?? undefined,
  }
}
