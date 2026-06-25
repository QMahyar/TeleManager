import * as React from "react"

import { IconAlertTriangle } from "@tabler/icons-react"

import { Button } from "../ui/button"
import { ModalShell } from "../ui/modal"
import { ActionFields } from "./action-fields"
import {
  defaultFieldValues,
  isActionFormValid,
  serializeFields,
  type FieldValues,
} from "../lib/action-schema"
import { actionMeta } from "../lib/constants"
import { awaitQueueRun, startQueueRun } from "../lib/queue-run"
import type { ActionType, Flash, QueueRun } from "../types"

// Inline mini-prompt for a quick action that needs input (message text, ids,
// schedule time, etc.). Runs the action in-place on a single account+chat by
// reusing the queue engine as a 1-op run. Parameterless actions never reach this
// component — the Dialogs screen runs/confirms those directly.
export function QuickActionRunner({
  open,
  actionType,
  target,
  dialogTitle,
  accountId,
  accountLabel,
  initialFields,
  onClose,
  flash,
  onRan,
}: {
  open: boolean
  actionType: ActionType
  target: string
  dialogTitle: string
  accountId: string
  accountLabel: string
  initialFields?: FieldValues
  onClose: () => void
  flash: Flash
  onRan?: () => void | Promise<void>
}) {
  const meta = actionMeta[actionType]
  // The parent remounts this component (key per action+chat), so the useState
  // initializers always reflect the current quick action — no effect needed to
  // re-seed when the target/action changes.
  const [fields, setFields] = React.useState<FieldValues>(
    () => initialFields ?? defaultFieldValues(actionType)
  )
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [running, setRunning] = React.useState(false)

  async function run() {
    setSubmitAttempted(true)
    if (!isActionFormValid(actionType, fields)) {
      flash("Fill in the required fields.")
      return
    }
    setRunning(true)
    try {
      const { run_id } = await startQueueRun({
        steps: [
          {
            action_type: actionType,
            targets: [target],
            account_ids: [accountId],
            message: serializeFields(actionType, fields),
          },
        ],
      })
      const result = await awaitQueueRun(run_id)
      reportRun(result, flash)
      await onRan?.()
      onClose()
    } catch (error) {
      flash(error instanceof Error ? error.message : "Action failed.")
    } finally {
      setRunning(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      kicker="Quick action"
      title={meta.label}
      danger={meta.destructive}
      description={
        <>
          {dialogTitle} · <span className="font-mono">{target}</span> · as{" "}
          {accountLabel}
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            variant={meta.destructive ? "destructive" : "default"}
            loading={running}
            onClick={run}
          >
            Run on {accountLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {meta.destructive ? (
          <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs font-medium text-destructive">
            <IconAlertTriangle className="size-3.5 shrink-0" />
            This is a destructive action and cannot be undone.
          </p>
        ) : null}
        <ActionFields
          actionType={actionType}
          values={fields}
          setValues={setFields}
          showErrors={submitAttempted}
          flash={flash}
        />
      </div>
    </ModalShell>
  )
}

// Toast the outcome of a single-op quick-action run.
function reportRun(run: QueueRun, flash: Flash) {
  if (run.status === "flood_wait") {
    flash(run.error || "Telegram rate-limited this action.", "error")
    return
  }
  const result = (run.results || [])[0] as
    | { ok?: boolean; detail?: string }
    | undefined
  if (result?.ok) {
    flash(result.detail || "Action completed.", "success")
  } else {
    flash(result?.detail || run.error || "Action failed.", "error")
  }
}
