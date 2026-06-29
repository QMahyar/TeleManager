import * as React from "react"

import { QuickActionRunner } from "../components/quick-action-runner"
import { useCachedDialogs } from "../hooks/use-cached-dialogs"
import { useDialogsController } from "../hooks/use-dialogs-controller"
import { api } from "../lib/api"
import { dialogTarget } from "../lib/dialog-resolver"
import { resolvePhotosEnabled } from "../lib/helpers"
import type { TelegramDialog, TelegramMessage } from "../types"
import { DialogMessagesPanel, MESSAGES_PAGE } from "./dialogs/messages-panel"
import type { MessagePanelState } from "./dialogs/messages-panel"
import { DialogsSourcePanel } from "./dialogs/source-panel"
import { DialogsTablePanel } from "./dialogs/table-panel"
import type { DialogsScreenProps } from "./screen-props"

export function DialogsScreen(props: DialogsScreenProps) {
  const [messagePanel, setMessagePanel] =
    React.useState<MessagePanelState | null>(null)
  const fetchStatus = useCachedDialogs(
    props.dialogAccountId,
    props.setDialogs,
    props.setDialogsWithAccountId
  )
  const {
    allFilteredSelected,
    runRowQuickAction,
    bulkQuickAction,
    loadDialogs,
    scheduleSelected,
    runMessageQuickAction,
    stageTargetInActions,
    toggleSelectAll,
    useSelectedTargets,
    quickRun,
    closeQuickRun,
  } = useDialogsController(props, fetchStatus)

  // Load (or reload) a dialog's recent messages at the given limit. Drives the
  // panel's loading/error UI directly so a slow or failing fetch is never a
  // blank pane. The backend caps the limit at MESSAGES_MAX, so "Load more" just
  // re-requests with a higher ceiling. useCallback so the openMessages handler
  // it feeds stays stable for the memoized dialog rows.
  const { dialogAccountId, flash } = props
  const loadMessages = React.useCallback(
    async (dialog: TelegramDialog, limit: number) => {
      if (!dialogAccountId) {
        flash("Choose an account first.")
        return
      }
      const target = dialogTarget(dialog)
      setMessagePanel((current) => ({
        dialog,
        messages: current?.dialog === dialog ? current.messages : [],
        limit,
        loading: true,
        error: null,
      }))
      try {
        const payload = await api<{ messages: TelegramMessage[] }>(
          `/api/accounts/${dialogAccountId}/messages?target=${encodeURIComponent(target)}&limit=${limit}`
        )
        setMessagePanel({
          dialog,
          messages: payload.messages || [],
          limit,
          loading: false,
          error: null,
        })
      } catch (error) {
        setMessagePanel({
          dialog,
          messages: [],
          limit,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to load messages.",
        })
      }
    },
    [dialogAccountId, flash]
  )

  const { guarded } = props
  const openMessages = React.useCallback(
    (dialog: TelegramDialog) =>
      guarded(() => loadMessages(dialog, MESSAGES_PAGE)),
    [guarded, loadMessages]
  )

  // Whether to render real photos for the account currently in view — the global
  // setting combined with that account's per-account override. Drives the avatar
  // <img> vs gradient choice; flipping it hides photos without a re-fetch.
  const activeAccount = props.accounts.find(
    (account) => account.id === props.dialogAccountId
  )
  const showPhotos = resolvePhotosEnabled(
    props.appSettings.show_dialog_photos,
    activeAccount?.photos_mode
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[21rem_minmax(0,1fr)]">
      <DialogsSourcePanel
        accounts={props.accounts}
        dialogAccountId={props.dialogAccountId}
        fetchStatus={fetchStatus.value}
        fetchError={fetchStatus.error}
        fetchLoading={fetchStatus.loading}
        guarded={props.guarded}
        loading={props.loading}
        loadDialogs={loadDialogs}
        filteredDialogs={props.filteredDialogs}
        selectedDialogTargets={props.selectedDialogTargets}
        setDialogAccountId={props.setDialogAccountId}
        setSelectedDialogTargets={props.setSelectedDialogTargets}
        bulkQuickAction={bulkQuickAction}
        useSelectedTargets={useSelectedTargets}
        scheduleSelected={scheduleSelected}
      />
      <DialogsTablePanel
        allFilteredSelected={allFilteredSelected}
        onQuickAction={runRowQuickAction}
        dialogAccountId={props.dialogAccountId}
        showPhotos={showPhotos}
        dialogFilter={props.dialogFilter}
        dialogSearch={props.dialogSearch}
        dialogs={props.dialogs}
        filteredDialogs={props.filteredDialogs}
        fetchLoading={fetchStatus.loading}
        fetchError={fetchStatus.error}
        onRetry={fetchStatus.reload}
        loadDialogs={loadDialogs}
        guarded={props.guarded}
        selectedDialogTargets={props.selectedDialogTargets}
        setDialogFilter={props.setDialogFilter}
        setDialogSearch={props.setDialogSearch}
        setSelectedDialogTargets={props.setSelectedDialogTargets}
        toggleSelectAll={toggleSelectAll}
        toggleSelected={props.toggleSelected}
        stageTargetInActions={stageTargetInActions}
        openMessages={openMessages}
      />
      <DialogMessagesPanel
        panel={messagePanel}
        onStageMessage={runMessageQuickAction}
        onReload={loadMessages}
        onClose={() => setMessagePanel(null)}
      />
      {quickRun ? (
        <QuickActionRunner
          key={`${quickRun.actionType}:${quickRun.target}`}
          open
          actionType={quickRun.actionType}
          target={quickRun.target}
          dialogTitle={quickRun.dialogTitle}
          accountId={quickRun.accountId}
          accountLabel={accountLabelFor(props.accounts, quickRun.accountId)}
          initialFields={quickRun.initialFields}
          onClose={closeQuickRun}
          flash={props.flash}
          onRan={props.refresh}
        />
      ) : null}
    </div>
  )
}

function accountLabelFor(
  accounts: DialogsScreenProps["accounts"],
  accountId: string
): string {
  const account = accounts.find((item) => item.id === accountId)
  return account?.label || account?.session_name || "account"
}
