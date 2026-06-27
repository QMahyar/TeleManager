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
  Flash,
  QueueStep,
  QuickActionContext,
  SafetySettings,
  ScheduleSeed,
} from "../types"

export function useQueueState(
  actionAccountIds: Set<string>,
  flash: Flash,
  safety: SafetySettings
) {
  const [queue, setQueue] = React.useState<QueueStep[]>([])
  const [pendingAccountId, setPendingAccountId] = React.useState("")
  const [actionDraft, setActionDraft] = React.useState<ActionDraft>({
    action_type: "join_chat",
    target: "",
    fields: defaultFieldValues("join_chat"),
  })
  const [quickActionContext, setQuickActionContext] =
    React.useState<QuickActionContext | null>(null)
  const [scheduleSeed, setScheduleSeed] = React.useState<ScheduleSeed | null>(
    null
  )

  function addQueueStep() {
    const account_ids = [...actionAccountIds]
    if (!account_ids.length) return flash("Select action accounts first.")
    const { valid, invalid } = partitionTargets(
      splitTargets(actionDraft.target),
      actionDraft.action_type
    )
    if (!valid.length) {
      return flash(
        invalid.length
          ? "No compatible targets for this action — every target was greyed out."
          : "Add at least one target."
      )
    }
    const blocker = actionDraftBlocker(actionDraft)
    if (blocker) return flash(blocker)

    setQueue((current) => [
      ...current,
      queueStepFromDraft(actionDraft, valid, account_ids),
    ])
    // Keep the action + filled fields so "same message, next batch" is one edit;
    // only clear the targets that were just queued.
    setActionDraft((current) => ({ ...current, target: "" }))
    setQuickActionContext(null)
    flash(
      invalid.length
        ? `Queued ${valid.length} target(s); skipped ${invalid.length} incompatible.`
        : "Action step added to queue."
    )
  }

  return {
    actionDraft,
    addQueueStep,
    pendingAccountId,
    queue,
    // confirm is set at run time by the Run dialog, the backend requires it true.
    queuePayload: { steps: queue, ...safety },
    quickActionContext,
    scheduleSeed,
    setActionDraft,
    setPendingAccountId,
    setQueue,
    setQuickActionContext,
    setScheduleSeed,
  }
}

// Returns a user-facing reason the draft cannot be queued yet, or null if valid.
export function actionDraftBlocker(actionDraft: ActionDraft): string | null {
  const errors = validateFields(actionDraft.action_type, actionDraft.fields)
  const firstError = Object.values(errors)[0]
  return firstError || null
}

function queueStepFromDraft(
  actionDraft: ActionDraft,
  targets: string[],
  account_ids: string[]
): QueueStep {
  return {
    action_type: actionDraft.action_type,
    targets,
    account_ids,
    message: serializeFields(actionDraft.action_type, actionDraft.fields),
  }
}
