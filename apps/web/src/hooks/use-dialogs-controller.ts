import * as React from "react"

import { api } from "../lib/api"
import { actionMeta } from "../lib/constants"
import { resolveActionMeta } from "../lib/action-meta"
import { defaultFieldValues, type FieldValues } from "../lib/action-schema"
import {
  quickActionNeedsConfirm,
  quickActionNeedsInput,
} from "../lib/dialog-actions"
import { dialogTarget } from "../lib/dialog-resolver"
import { humanTime } from "../lib/helpers"
import { awaitQueueRun, startQueueRun } from "../lib/queue-run"
import type { ActionType, Flash, QueueRun, TelegramDialog, TelegramMessage } from "../types"
import type { DialogsScreenProps } from "../screens/screen-props"
import type { FetchStatus } from "./use-cached-dialogs"

// In-flight quick action awaiting input (message text, ids, schedule time, …).
// Parameterless actions never use this — they run/confirm directly.
export type QuickRunState = {
  actionType: ActionType
  target: string
  dialogTitle: string
  accountId: string
  initialFields?: FieldValues
}

function useDialogsSelection(
  filteredDialogs: TelegramDialog[],
  selectedDialogTargets: Set<string>,
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
) {
  const allFilteredSelected =
    filteredDialogs.length > 0 &&
    filteredDialogs.every((dialog) =>
      selectedDialogTargets.has(dialogTarget(dialog))
    )

  function toggleSelectAll() {
    setSelectedDialogTargets((current) => {
      const next = new Set(current)
      for (const dialog of filteredDialogs) {
        const target = dialogTarget(dialog)
        if (allFilteredSelected) {
          next.delete(target)
        } else {
          next.add(target)
        }
      }
      return next
    })
  }

  return { allFilteredSelected, toggleSelectAll }
}

export function useDialogsController(
  props: DialogsScreenProps,
  fetchStatus: FetchStatus
) {
  const selection = useDialogsSelection(
    props.filteredDialogs,
    props.selectedDialogTargets,
    props.setSelectedDialogTargets
  )
  const [quickRun, setQuickRun] = React.useState<QuickRunState | null>(null)

  // Destructured so the memoized handlers below depend on the individual stable
  // props rather than the whole `props` object (which App recreates each render).
  const {
    dialogAccountId,
    flash,
    refresh,
    guarded,
    askDialog,
    setActionAccountIds,
    setActionDraft,
    setQuickActionContext,
    setView,
  } = props

  // Run a parameterless (or bulk) quick action in-place as a one-shot queue on
  // the dialogs' source account, then toast a summary and refresh.
  const executeQuick = React.useCallback(
    async (actionType: ActionType, targets: string[], label: string) => {
      const { run_id } = await startQueueRun({
        steps: [
          {
            action_type: actionType,
            targets,
            account_ids: [dialogAccountId],
          },
        ],
      })
      const run = await awaitQueueRun(run_id)
      reportRunSummary(run, flash, label)
      await refresh()
    },
    [dialogAccountId, flash, refresh]
  )

  async function loadDialogs(mode: "cached" | "live") {
    if (!props.dialogAccountId) {
      props.flash("Choose an account first.")
      return
    }
    fetchStatus.setError(null)
    fetchStatus.setLoading(true)
    if (mode === "live") {
      fetchStatus.setValue("Fetching dialogs from Telegram…")
    }

    try {
      const payload =
        mode === "live"
          ? await api<{ dialogs: TelegramDialog[]; fetched_at?: string }>(
              `/api/accounts/${props.dialogAccountId}/dialogs/fetch?limit=500`,
              { method: "POST" }
            )
          : await api<{ dialogs: TelegramDialog[]; fetched_at?: string | null }>(
              `/api/accounts/${props.dialogAccountId}/dialogs`
            )

      const dialogs = payload.dialogs || []
      props.setDialogs(dialogs)

      if (mode === "live") {
        fetchStatus.setValue(
          payload.fetched_at
            ? `Fetched ${dialogs.length} dialogs at ${humanTime(payload.fetched_at)}.`
            : `Fetched ${dialogs.length} dialogs.`
        )
        props.flash(`Fetched ${dialogs.length} dialogs.`)
        await props.refresh()
        return
      }

      const statusMessage = payload.fetched_at
        ? `Cached dialogs from ${humanTime(payload.fetched_at)}.`
        : "No cached dialogs for this account yet."
      fetchStatus.setValue(payload.fetched_at ? statusMessage : "")
      props.flash(
        dialogs.length
          ? `Loaded ${dialogs.length} cached dialogs.`
          : statusMessage
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : mode === "live"
            ? "Live fetch failed."
            : "Failed to load cached dialogs."
      fetchStatus.setValue(message)
      fetchStatus.setError(message)
      props.flash(message, "error")
    } finally {
      fetchStatus.setLoading(false)
    }
  }

  // The account used to fetch these dialogs can always act on them, so every
  // handoff into Actions ensures it's selected. UNION it into any existing
  // multi-account selection rather than replacing it.
  const seedActionAccount = React.useCallback(() => {
    if (dialogAccountId) {
      setActionAccountIds((current) => new Set(current).add(dialogAccountId))
    }
  }, [dialogAccountId, setActionAccountIds])

  // Run a quick action in-place on one dialog. Input-needing actions open the
  // mini-prompt; parameterless ones run immediately (with a confirm step for
  // destructive / leave actions). useCallback so memoized rows stay stable.
  const runRowQuickAction = React.useCallback(
    (actionType: ActionType, dialog: TelegramDialog) => {
      if (!dialogAccountId) {
        flash("Choose an account first.")
        return
      }
      const target = dialogTarget(dialog)
      const title = dialog.title || target
      if (quickActionNeedsInput(actionType)) {
        setQuickRun({
          actionType,
          target,
          dialogTitle: title,
          accountId: dialogAccountId,
        })
        return
      }
      guarded(async () => {
        if (quickActionNeedsConfirm(actionType, props.actionsMeta)) {
          const confirmed = await askDialog({
            title: `${actionMeta[actionType].label}?`,
            description: `Run "${actionMeta[actionType].label}" on ${title} as the selected account.`,
            confirmLabel: actionMeta[actionType].label,
            danger: Boolean(resolveActionMeta(actionType, props.actionsMeta).destructive),
          })
          if (!confirmed) return
        }
        await executeQuick(actionType, [target], actionMeta[actionType].label)
      })
    },
    [dialogAccountId, flash, guarded, askDialog, executeQuick, props.actionsMeta]
  )

  function bulkQuickAction(actionType: ActionType) {
    const dialogs = props.filteredDialogs.filter((dialog) =>
      props.selectedDialogTargets.has(dialogTarget(dialog))
    )
    if (!dialogs.length) {
      props.flash("Select one or more dialogs first.")
      return
    }
    if (!props.dialogAccountId) {
      props.flash("Choose an account first.")
      return
    }
    const targets = dialogs.map(dialogTarget)
    const label = `${actionMeta[actionType].label} ×${targets.length}`
    props.guarded(async () => {
      if (quickActionNeedsConfirm(actionType, props.actionsMeta)) {
        const confirmed = await props.askDialog({
          title: `${actionMeta[actionType].label} on ${targets.length} chat(s)?`,
          description: `Run "${actionMeta[actionType].label}" on ${targets.length} selected chat(s) as the selected account.`,
          confirmLabel: actionMeta[actionType].label,
          danger: Boolean(resolveActionMeta(actionType, props.actionsMeta).destructive),
        })
        if (!confirmed) return
      }
      await executeQuick(actionType, targets, label)
    })
  }

  function useSelectedTargets() {
    if (!props.selectedDialogTargets.size) {
      props.flash("Select one or more dialogs first.")
      return
    }
    props.setQuickActionContext(null)
    props.setActionDraft((current) => ({
      ...current,
      target: [...props.selectedDialogTargets].join("\n"),
    }))
    seedActionAccount()
    props.setView("actions")
    props.flash("Selected dialogs copied into Actions.")
  }

  // Copy a single dialog target into Actions. useCallback so memoized rows that
  // receive it as a handler stay stable across unrelated re-renders.
  const stageTargetInActions = React.useCallback(
    (target: string) => {
      setQuickActionContext(null)
      setActionDraft((current) => ({ ...current, target }))
      seedActionAccount()
      setView("actions")
      flash("Dialog target copied into Actions.")
    },
    [setQuickActionContext, setActionDraft, setView, flash, seedActionAccount]
  )

  // Forward/pin/delete/download from the message inspector: open the in-place
  // runner with the message id/source pre-filled.
  function runMessageQuickAction(
    actionType: ActionType,
    dialog: TelegramDialog,
    message: TelegramMessage
  ) {
    if (!props.dialogAccountId) {
      props.flash("Choose an account first.")
      return
    }
    const target = dialogTarget(dialog)
    setQuickRun({
      actionType,
      target,
      dialogTitle: dialog.title || target,
      accountId: props.dialogAccountId,
      initialFields: fieldsForStagedMessage(actionType, target, message.id),
    })
  }

  function scheduleSelected() {
    if (!props.selectedDialogTargets.size) {
      props.flash("Select one or more dialogs first.")
      return
    }
    const target = [...props.selectedDialogTargets].join("\n")
    // Stage into the shared Actions builder, then flag the composer to open in
    // Schedule mode (Schedules now live on the Actions page).
    props.setQuickActionContext(null)
    props.setActionDraft({
      action_type: "send_message",
      target,
      fields: defaultFieldValues("send_message"),
      condition: null,
    })
    seedActionAccount()
    props.setScheduleSeed({
      accountIds: props.dialogAccountId ? [props.dialogAccountId] : [],
      actionType: "send_message",
      target,
      mode: "schedule",
    })
    props.setView("actions")
    props.flash("Selected dialogs staged into a new schedule.")
  }

  return {
    allFilteredSelected: selection.allFilteredSelected,
    runRowQuickAction,
    bulkQuickAction,
    loadDialogs,
    scheduleSelected,
    runMessageQuickAction,
    stageTargetInActions,
    toggleSelectAll: selection.toggleSelectAll,
    useSelectedTargets,
    quickRun,
    closeQuickRun: () => setQuickRun(null),
  }
}

// Toast a one-line summary of an in-place quick-action run (1+ ops).
function reportRunSummary(run: QueueRun, flash: Flash, label: string) {
  if (run.status === "flood_wait") {
    flash(run.error || "Telegram rate-limited this run.", "error")
    return
  }
  const results = run.results || []
  const okCount = results.filter((item) => (item as { ok?: boolean }).ok).length
  const failCount = results.length - okCount
  if (failCount === 0 && okCount > 0) {
    flash(`${label}: done.`, "success")
  } else if (okCount > 0) {
    flash(`${label}: ${okCount} ok, ${failCount} failed.`, "error")
  } else {
    const detail = (results[0] as { detail?: string } | undefined)?.detail
    flash(detail || run.error || `${label}: failed.`, "error")
  }
}

// Prefills the structured action form when staging a specific message from the
// inspector, so the user lands on Actions with the id/source already filled.
function fieldsForStagedMessage(
  actionType: ActionType,
  target: string,
  messageId: number
) {
  const fields = defaultFieldValues(actionType)
  if (actionType === "forward_message") {
    return { ...fields, source: `${target}:${messageId}` }
  }
  if (actionType === "delete_messages") {
    return { ...fields, ids: String(messageId) }
  }
  if ("id" in fields) {
    return { ...fields, id: String(messageId) }
  }
  return fields
}
