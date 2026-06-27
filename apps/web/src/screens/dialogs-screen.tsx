import * as React from "react"

import {
  IconArrowRight,
  IconBolt,
  IconChevronDown,
  IconDotsVertical,
  IconMessageCircle,
  IconSearch,
} from "@tabler/icons-react"

import { Avatar } from "../components/avatar"

import { Button } from "../ui/button"
import { Menu, MenuItem, MenuSeparator } from "../ui/menu"
import { ModalShell } from "../ui/modal"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "../ui/table"

import {
  Badge,
  Callout,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  SectionLoader,
  Select,
  ShowMore,
  StepHeading,
} from "../components/ui"
import { QuickActionRunner } from "../components/quick-action-runner"
import { api } from "../lib/api"
import { defaultFieldValues, type FieldValues } from "../lib/action-schema"
import {
  bulkActionsForSelection,
  quickActionNeedsConfirm,
  quickActionNeedsInput,
  quickActionsForDialog,
  selectionKindCounts,
} from "../lib/dialog-actions"
import { actionMeta } from "../lib/constants"
import { dialogKind, dialogTarget } from "../lib/dialog-resolver"
import { humanTime, resolvePhotosEnabled } from "../lib/helpers"
import { awaitQueueRun, startQueueRun } from "../lib/queue-run"
import type {
  ActionType,
  Flash,
  QueueRun,
  TelegramDialog,
  TelegramMessage,
} from "../types"
import type { DialogsScreenProps } from "./screen-props"

// In-flight quick action awaiting input (message text, ids, schedule time, …).
// Parameterless actions never use this — they run/confirm directly.
type QuickRunState = {
  actionType: ActionType
  target: string
  dialogTitle: string
  accountId: string
  initialFields?: FieldValues
}

const FILTER_LABELS: Record<string, string> = {
  all: "All",
  personal: "Personal",
  bot: "Bot",
  group: "Group",
  channel: "Channel",
}

const OUTLINE_VARIANT = "outline"

// First page of the message inspector, and the hard ceiling the backend honours
// (it clamps the limit to 100), so "Load more" steps from one to the other.
const MESSAGES_PAGE = 50
const MESSAGES_MAX = 100

// Per-dialog message inspector state: the chat, its loaded messages, the limit
// last requested, and the in-flight / failure flags that drive the loader,
// retry, and "Load more" affordances.
type MessagePanelState = {
  dialog: TelegramDialog
  messages: TelegramMessage[]
  limit: number
  loading: boolean
  error: string | null
}

export function DialogsScreen(props: DialogsScreenProps) {
  const [messagePanel, setMessagePanel] =
    React.useState<MessagePanelState | null>(null)
  const fetchStatus = useCachedDialogs(props.dialogAccountId, props.setDialogs)
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
  // re-requests with a higher ceiling.
  async function loadMessages(dialog: TelegramDialog, limit: number) {
    const accountId = props.dialogAccountId
    if (!accountId) {
      props.flash("Choose an account first.")
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
        `/api/accounts/${accountId}/messages?target=${encodeURIComponent(target)}&limit=${limit}`
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
  }

  function openMessagePanel(dialog: TelegramDialog) {
    return loadMessages(dialog, MESSAGES_PAGE)
  }

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
        openMessages={(dialog) => props.guarded(() => openMessagePanel(dialog))}
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

type FetchStatus = {
  value: string
  setValue: (value: string) => void
  loading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  reload: () => void
}

function useCachedDialogs(
  dialogAccountId: string,
  setDialogs: DialogsScreenProps["setDialogs"]
): FetchStatus {
  const [value, setValue] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Bumping this re-runs the auto-load effect so the table's retry can re-fetch
  // cached dialogs without remounting or switching accounts.
  const [reloadKey, setReloadKey] = React.useState(0)
  // Monotonic token so out-of-order responses (rapid account switches) never
  // overwrite the latest request's result.
  const requestToken = React.useRef(0)

  const loadCached = React.useCallback(
    async (id: string) => {
      if (!id) return
      const token = ++requestToken.current
      setLoading(true)
      setError(null)
      try {
        const payload = await api<{
          dialogs: TelegramDialog[]
          fetched_at?: string | null
        }>(`/api/accounts/${id}/dialogs`)
        if (token !== requestToken.current) return
        setDialogs(payload.dialogs || [])
        setValue(
          payload.fetched_at
            ? `Cached dialogs from ${humanTime(payload.fetched_at)}.`
            : ""
        )
      } catch (err) {
        if (token !== requestToken.current) return
        setDialogs([])
        const message =
          err instanceof Error ? err.message : "Failed to load cached dialogs."
        setValue(message)
        setError(message)
      } finally {
        if (token === requestToken.current) setLoading(false)
      }
    },
    [setDialogs]
  )

  // Auto-load on account change / explicit reload. Deferred to a timeout (not
  // called synchronously in the effect body) so the loading flag is set off the
  // render path, matching the picker's pattern.
  React.useEffect(() => {
    if (!dialogAccountId) return undefined
    const task = window.setTimeout(() => loadCached(dialogAccountId), 0)
    return () => window.clearTimeout(task)
  }, [dialogAccountId, reloadKey, loadCached])

  return {
    value,
    setValue,
    loading,
    setLoading,
    error,
    setError,
    reload: () => setReloadKey((key) => key + 1),
  }
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

function useDialogsController(
  props: DialogsScreenProps,
  fetchStatus: FetchStatus
) {
  const selection = useDialogsSelection(
    props.filteredDialogs,
    props.selectedDialogTargets,
    props.setSelectedDialogTargets
  )
  const [quickRun, setQuickRun] = React.useState<QuickRunState | null>(null)

  // Run a parameterless (or bulk) quick action in-place as a one-shot queue on
  // the dialogs' source account, then toast a summary and refresh.
  async function executeQuick(
    actionType: ActionType,
    targets: string[],
    label: string
  ) {
    const { run_id } = await startQueueRun({
      steps: [
        { action_type: actionType, targets, account_ids: [props.dialogAccountId] },
      ],
    })
    const run = await awaitQueueRun(run_id)
    reportRunSummary(run, props.flash, label)
    await props.refresh()
  }

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
  // multi-account selection rather than replacing it — replacing was the
  // "queue/schedule only ran on one account" bug.
  function seedActionAccount() {
    if (props.dialogAccountId) {
      props.setActionAccountIds((current) =>
        new Set(current).add(props.dialogAccountId)
      )
    }
  }

  // Run a quick action in-place on one dialog. Input-needing actions open the
  // mini-prompt; parameterless ones run immediately (with a confirm step for
  // destructive / leave actions).
  function runRowQuickAction(actionType: ActionType, dialog: TelegramDialog) {
    if (!props.dialogAccountId) {
      props.flash("Choose an account first.")
      return
    }
    const target = dialogTarget(dialog)
    const title = dialog.title || target
    if (quickActionNeedsInput(actionType)) {
      setQuickRun({
        actionType,
        target,
        dialogTitle: title,
        accountId: props.dialogAccountId,
      })
      return
    }
    props.guarded(async () => {
      if (quickActionNeedsConfirm(actionType)) {
        const confirmed = await props.askDialog({
          title: `${actionMeta[actionType].label}?`,
          description: `Run "${actionMeta[actionType].label}" on ${title} as the selected account.`,
          confirmLabel: actionMeta[actionType].label,
          danger: Boolean(actionMeta[actionType].destructive),
        })
        if (!confirmed) return
      }
      await executeQuick(actionType, [target], actionMeta[actionType].label)
    })
  }

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
      if (quickActionNeedsConfirm(actionType)) {
        const confirmed = await props.askDialog({
          title: `${actionMeta[actionType].label} on ${targets.length} chat(s)?`,
          description: `Run "${actionMeta[actionType].label}" on ${targets.length} selected chat(s) as the selected account.`,
          confirmLabel: actionMeta[actionType].label,
          danger: Boolean(actionMeta[actionType].destructive),
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

  function stageTargetInActions(target: string) {
    props.setQuickActionContext(null)
    props.setActionDraft((current) => ({ ...current, target }))
    seedActionAccount()
    props.setView("actions")
    props.flash("Dialog target copied into Actions.")
  }

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

function DialogsSourcePanel({
  accounts,
  dialogAccountId,
  fetchStatus,
  fetchError,
  fetchLoading,
  guarded,
  loading,
  loadDialogs,
  filteredDialogs,
  selectedDialogTargets,
  setDialogAccountId,
  setSelectedDialogTargets,
  bulkQuickAction,
  useSelectedTargets,
  scheduleSelected,
}: {
  accounts: DialogsScreenProps["accounts"]
  dialogAccountId: string
  fetchStatus: string
  fetchError: string | null
  fetchLoading: boolean
  guarded: DialogsScreenProps["guarded"]
  loading: boolean
  loadDialogs: (mode: "cached" | "live") => Promise<void>
  filteredDialogs: TelegramDialog[]
  selectedDialogTargets: Set<string>
  setDialogAccountId: DialogsScreenProps["setDialogAccountId"]
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
  bulkQuickAction: (actionType: ActionType) => void
  useSelectedTargets: () => void
  scheduleSelected: () => void
}) {
  const selectedAccount = accounts.find(
    (account) => account.id === dialogAccountId
  )
  const selectedDialogs = filteredDialogs.filter((dialog) =>
    selectedDialogTargets.has(dialogTarget(dialog))
  )
  const hasSelection = selectedDialogTargets.size > 0
  const bulkActions = bulkActionsForSelection(selectedDialogs)
  const kindCounts = selectionKindCounts(selectedDialogs)

  return (
    <Panel className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100svh-4.5rem)] xl:self-start xl:overflow-auto">
      <StepHeading
        step={1}
        title="Find dialogs"
        detail="Pick one account, load cached or live dialogs, then stage selected chats into Actions."
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <span className="type-meta block text-muted-foreground">Selected</span>
          <strong className="block font-mono text-2xl">
            {selectedDialogTargets.size}
          </strong>
        </div>
        <div className="min-w-0 space-y-0.5">
          <span className="type-meta block text-muted-foreground">Source</span>
          <strong className="block truncate text-sm">
            {selectedAccount?.label || selectedAccount?.session_name || "None"}
          </strong>
        </div>
      </div>
      <Field label="Account">
        <Select
          value={dialogAccountId}
          onChange={(event) => setDialogAccountId(event.target.value)}
        >
          {accounts.length === 0 ? (
            <option value="">No accounts available</option>
          ) : null}
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label || account.session_name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="comfortable"
          className="w-full"
          disabled={loading || fetchLoading || !dialogAccountId}
          loading={loading || fetchLoading}
          onClick={() => guarded(() => loadDialogs("live"))}
        >
          Fetch Live
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          disabled={fetchLoading || !dialogAccountId}
          onClick={() => guarded(() => loadDialogs("cached"))}
        >
          Load Cache
        </Button>
      </div>
      {fetchStatus ? (
        <Callout tone={fetchError ? "danger" : "info"}>{fetchStatus}</Callout>
      ) : null}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="type-label text-muted-foreground">Selected workflow</p>
            <p className="text-xs text-muted-foreground">
              Bulk actions only show options valid for every selected chat.
            </p>
          </div>
          <IconBolt className="size-4 text-primary" />
        </div>
        <SelectionBreakdown counts={kindCounts} hasSelection={hasSelection} />
        <Button
          size="comfortable"
          className="w-full"
          disabled={!hasSelection}
          onClick={useSelectedTargets}
        >
          Use in Actions
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={OUTLINE_VARIANT}
            className="w-full"
            disabled={!hasSelection}
            onClick={scheduleSelected}
          >
            Schedule selected
          </Button>
          <BulkActionsMenu
            hasSelection={hasSelection}
            bulkActions={bulkActions}
            onPick={bulkQuickAction}
          />
        </div>
        <Button
          variant="ghost"
          className="w-full"
          disabled={!hasSelection}
          onClick={() => setSelectedDialogTargets(new Set())}
        >
          Clear selection
        </Button>
      </div>
    </Panel>
  )
}

const KIND_LABELS: Record<string, string> = {
  bot: "bot",
  personal: "personal",
  group: "group",
  supergroup: "supergroup",
  channel: "channel",
  unknown: "other",
}

function SelectionBreakdown({
  counts,
  hasSelection,
}: {
  counts: Record<string, number>
  hasSelection: boolean
}) {
  if (!hasSelection) return null
  const parts = Object.entries(counts).filter(([, count]) => count > 0)
  if (!parts.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {parts.map(([kind, count]) => (
        <Badge key={kind} tone="border-border bg-muted/40 text-muted-foreground">
          {count} {KIND_LABELS[kind] || kind}
        </Badge>
      ))}
    </div>
  )
}

// Bulk verbs vary with the selection (only actions valid for every selected
// chat appear), so they live behind one menu instead of a shifting grid of
// equal-weight buttons. Disabled with a hint when nothing applies.
function BulkActionsMenu({
  hasSelection,
  bulkActions,
  onPick,
}: {
  hasSelection: boolean
  bulkActions: ActionType[]
  onPick: (actionType: ActionType) => void
}) {
  return (
    <Menu
      label="Bulk actions for the selected chats"
      align="start"
      panelClassName="min-w-52"
      triggerProps={{
        variant: OUTLINE_VARIANT,
        className: "w-full justify-between",
        disabled: !hasSelection,
      }}
      trigger={
        <>
          Bulk actions
          <IconChevronDown className="size-3.5" />
        </>
      }
    >
      {bulkActions.length ? (
        bulkActions.map((actionType) => {
          const meta = actionMeta[actionType]
          return (
            <MenuItem
              key={actionType}
              variant={meta.destructive ? "destructive" : "default"}
              onClick={() => onPick(actionType)}
            >
              {meta.label}
            </MenuItem>
          )
        })
      ) : (
        <p className="px-2 py-1.5 text-xs leading-5 text-muted-foreground">
          No bulk action applies to all selected chat types. Narrow the
          selection to one kind for more options.
        </p>
      )}
    </Menu>
  )
}

function DialogsTablePanel({
  allFilteredSelected,
  onQuickAction,
  dialogAccountId,
  showPhotos,
  dialogFilter,
  dialogSearch,
  dialogs,
  filteredDialogs,
  fetchLoading,
  fetchError,
  onRetry,
  loadDialogs,
  guarded,
  selectedDialogTargets,
  setDialogFilter,
  setDialogSearch,
  setSelectedDialogTargets,
  toggleSelectAll,
  toggleSelected,
  stageTargetInActions,
  openMessages,
}: {
  allFilteredSelected: boolean
  onQuickAction: (actionType: ActionType, dialog: TelegramDialog) => void
  dialogAccountId: string
  showPhotos: boolean
  dialogFilter: string
  dialogSearch: string
  dialogs: TelegramDialog[]
  filteredDialogs: TelegramDialog[]
  fetchLoading: boolean
  fetchError: string | null
  onRetry: () => void
  loadDialogs: (mode: "cached" | "live") => Promise<void>
  guarded: DialogsScreenProps["guarded"]
  selectedDialogTargets: Set<string>
  setDialogFilter: DialogsScreenProps["setDialogFilter"]
  setDialogSearch: DialogsScreenProps["setDialogSearch"]
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
  toggleSelectAll: () => void
  toggleSelected: DialogsScreenProps["toggleSelected"]
  stageTargetInActions: (target: string) => void
  openMessages: (dialog: TelegramDialog) => Promise<void>
}) {
  const filterCounts = countDialogFilters(dialogs)
  // A search/filter is narrowing the list (so "nothing matches" is the right
  // message), versus the account simply having no dialogs cached at all.
  const isFiltering = Boolean(dialogSearch.trim()) || dialogFilter !== "all"

  return (
    <Panel tone="raised" className="space-y-4 overflow-hidden">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <StepHeading
          step={2}
          title="Review targets"
          detail={`${filteredDialogs.length} shown · ${selectedDialogTargets.size} selected · ${countUnreadDialogs(filteredDialogs)} unread`}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant={OUTLINE_VARIANT} onClick={toggleSelectAll}>
            {allFilteredSelected ? "Deselect shown" : "Select shown"}
          </Button>
          <Button
            variant={OUTLINE_VARIANT}
            disabled={!selectedDialogTargets.size}
            onClick={() => setSelectedDialogTargets(new Set())}
          >
            Clear selected
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            type="search"
            autoComplete="off"
            value={dialogSearch}
            onChange={(event) => setDialogSearch(event.target.value)}
            placeholder="Search title or username"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FILTER_LABELS).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={dialogFilter === value ? "default" : OUTLINE_VARIANT}
              onClick={() => setDialogFilter(value)}
            >
              {label} {filterCounts[value] || 0}
            </Button>
          ))}
        </div>
      </div>
      {fetchLoading && dialogs.length === 0 ? (
        <SectionLoader label="Loading dialogs…" />
      ) : fetchError && dialogs.length === 0 ? (
        <ErrorState
          title="Couldn't load dialogs"
          detail={fetchError}
          onRetry={onRetry}
        />
      ) : filteredDialogs.length === 0 ? (
        <DialogsEmptyState
          isFiltering={isFiltering}
          hasAccount={Boolean(dialogAccountId)}
          hasAnyDialogs={dialogs.length > 0}
          onClearFilters={() => {
            setDialogSearch("")
            setDialogFilter("all")
          }}
          onFetchLive={() => guarded(() => loadDialogs("live"))}
          fetchLoading={fetchLoading}
        />
      ) : (
        <>
          {/* Mobile: stacked cards instead of a sideways-scrolling table. */}
          <div className="space-y-2 lg:hidden">
            {filteredDialogs.map((dialog) => (
              <DialogCard
                key={String(dialog.id)}
                dialog={dialog}
                accountId={dialogAccountId}
                showPhotos={showPhotos}
                onQuickAction={onQuickAction}
                selectedDialogTargets={selectedDialogTargets}
                setSelectedDialogTargets={setSelectedDialogTargets}
                toggleSelected={toggleSelected}
                stageTargetInActions={stageTargetInActions}
                openMessages={openMessages}
              />
            ))}
          </div>

          {/* Desktop: full table. */}
          <div className="hidden lg:block">
            <TableWrap className="max-h-[calc(100svh-24rem)] min-h-[28rem]">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label={
                          allFilteredSelected
                            ? "Deselect filtered dialogs"
                            : "Select filtered dialogs"
                        }
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Dialog</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDialogs.map((dialog) => (
                    <DialogRow
                      key={String(dialog.id)}
                      dialog={dialog}
                      accountId={dialogAccountId}
                      showPhotos={showPhotos}
                      onQuickAction={onQuickAction}
                      selectedDialogTargets={selectedDialogTargets}
                      setSelectedDialogTargets={setSelectedDialogTargets}
                      toggleSelected={toggleSelected}
                      stageTargetInActions={stageTargetInActions}
                      openMessages={openMessages}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
          </div>
        </>
      )}
    </Panel>
  )
}

// The empty list means different things — no account picked, an account with no
// cached dialogs yet, or a search/filter that hides everything — so the copy and
// the offered action change to match.
function DialogsEmptyState({
  isFiltering,
  hasAccount,
  hasAnyDialogs,
  onClearFilters,
  onFetchLive,
  fetchLoading,
}: {
  isFiltering: boolean
  hasAccount: boolean
  hasAnyDialogs: boolean
  onClearFilters: () => void
  onFetchLive: () => void
  fetchLoading: boolean
}) {
  if (hasAnyDialogs && isFiltering) {
    return (
      <EmptyState
        icon={IconSearch}
        title="No dialogs match"
        detail="No loaded dialog matches the current search and type filter. Widen the search or switch the type filter."
        action={
          <Button variant={OUTLINE_VARIANT} size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    )
  }

  if (!hasAccount) {
    return (
      <EmptyState
        icon={IconMessageCircle}
        title="No account selected"
        detail="Pick an account on the left, then fetch live or load its cached dialogs."
      />
    )
  }

  return (
    <EmptyState
      icon={IconMessageCircle}
      title="No dialogs yet"
      detail="This account has no cached dialogs. Fetch them live from Telegram to start reviewing targets."
      action={
        <Button size="sm" loading={fetchLoading} onClick={onFetchLive}>
          Fetch live
        </Button>
      }
    />
  )
}

function countDialogFilters(dialogs: TelegramDialog[]) {
  const counts: Record<string, number> = {
    all: dialogs.length,
    personal: 0,
    bot: 0,
    group: 0,
    channel: 0,
  }
  for (const dialog of dialogs) {
    const kind = dialogKind(dialog)
    if (kind === "supergroup") {
      counts.group += 1
    } else if (kind in counts) {
      counts[kind] += 1
    }
  }
  return counts
}

function countUnreadDialogs(dialogs: TelegramDialog[]) {
  return dialogs.filter((dialog) => Number(dialog.unread_count || 0) > 0).length
}

// A username target (@name) is meaningful on its own; a bare numeric id isn't,
// so tag it with a muted "ID" marker and a tooltip rather than showing a raw
// 10-digit number as if the operator should recognise it.
function DialogTargetLabel({
  target,
  hasUsername,
}: {
  target: string
  hasUsername: boolean
}) {
  if (hasUsername) {
    return (
      <span className="block truncate font-mono text-xs text-muted-foreground">
        {target}
      </span>
    )
  }
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`Numeric chat ID ${target} (no public username)`}
    >
      <Badge tone="border-border bg-muted/40 text-muted-foreground">ID</Badge>
      <span className="truncate font-mono">{target}</span>
    </span>
  )
}

// The chat's avatar: its real Telegram photo when one was cached and photos are
// enabled for this account, otherwise a gradient disc seeded by the stable id (so
// the colour stays consistent per peer). The ?v=photoId busts the browser cache
// when a chat swaps its picture; a missing/restricted photo falls back to the disc.
function DialogAvatar({
  title,
  seed,
  accountId,
  hasPhoto,
  photoId,
  showPhotos,
}: {
  title: string
  seed: string | number
  accountId: string
  hasPhoto?: boolean
  photoId?: number | null
  showPhotos: boolean
}) {
  const src =
    showPhotos && hasPhoto && accountId
      ? `/api/accounts/${accountId}/dialogs/${seed}/photo${photoId ? `?v=${photoId}` : ""}`
      : undefined
  return (
    <Avatar name={title} seed={seed} src={src} size={36} className="text-sm" />
  )
}

function DialogRow({
  dialog,
  accountId,
  showPhotos,
  onQuickAction,
  selectedDialogTargets,
  setSelectedDialogTargets,
  toggleSelected,
  stageTargetInActions,
  openMessages,
}: {
  dialog: TelegramDialog
  accountId: string
  showPhotos: boolean
  onQuickAction: (actionType: ActionType, dialog: TelegramDialog) => void
  selectedDialogTargets: Set<string>
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
  toggleSelected: DialogsScreenProps["toggleSelected"]
  stageTargetInActions: (target: string) => void
  openMessages: (dialog: TelegramDialog) => Promise<void>
}) {
  const target = dialogTarget(dialog)
  const kind = dialogKind(dialog)
  const isSelected = selectedDialogTargets.has(target)
  const username = dialog.username ? `@${dialog.username}` : "No username"
  const unreadCount = Number(dialog.unread_count || 0)

  return (
    <TableRow className={isSelected ? "bg-primary/5" : "hover:bg-muted/20"}>
      <TableCell>
        <input
          type="checkbox"
          aria-label={`Select ${dialog.title}`}
          checked={isSelected}
          onChange={() => toggleSelected(target, setSelectedDialogTargets)}
        />
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <DialogAvatar
            title={dialog.title}
            seed={dialog.id}
            accountId={accountId}
            hasPhoto={dialog.has_photo}
            photoId={dialog.photo_id}
            showPhotos={showPhotos}
          />
          <div className="min-w-0">
            <strong className="block truncate text-sm">{dialog.title}</strong>
            <span className="block truncate text-xs text-muted-foreground">
              {username} · {kind} · {unreadCount ? `${unreadCount} unread` : "read"}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-64">
        <DialogTargetLabel target={target} hasUsername={Boolean(dialog.username)} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            size="xs"
            onClick={() => stageTargetInActions(target)}
          >
            <IconArrowRight className="size-3" />
            Use
          </Button>
          <Menu
            label={`More actions for ${dialog.title || target}`}
            trigger={<IconDotsVertical className="size-4" />}
            panelClassName="min-w-48"
          >
            <MenuItem onClick={() => openMessages(dialog)}>
              <IconMessageCircle className="size-3.5" />
              Messages
            </MenuItem>
            <MenuSeparator />
            <DialogQuickActionButtons
              dialog={dialog}
              onQuickAction={onQuickAction}
              className="justify-start"
            />
          </Menu>
        </div>
      </TableCell>
    </TableRow>
  )
}

function DialogCard({
  dialog,
  accountId,
  showPhotos,
  onQuickAction,
  selectedDialogTargets,
  setSelectedDialogTargets,
  toggleSelected,
  stageTargetInActions,
  openMessages,
}: {
  dialog: TelegramDialog
  accountId: string
  showPhotos: boolean
  onQuickAction: (actionType: ActionType, dialog: TelegramDialog) => void
  selectedDialogTargets: Set<string>
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
  toggleSelected: DialogsScreenProps["toggleSelected"]
  stageTargetInActions: (target: string) => void
  openMessages: (dialog: TelegramDialog) => Promise<void>
}) {
  const target = dialogTarget(dialog)
  const kind = dialogKind(dialog)
  const isSelected = selectedDialogTargets.has(target)
  const username = dialog.username ? `@${dialog.username}` : "No username"
  const unreadCount = Number(dialog.unread_count || 0)

  return (
    <div
      className={`space-y-3 rounded-lg border p-3 ${
        isSelected ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          aria-label={`Select ${dialog.title}`}
          checked={isSelected}
          onChange={() => toggleSelected(target, setSelectedDialogTargets)}
        />
        <DialogAvatar
          title={dialog.title}
          seed={dialog.id}
          accountId={accountId}
          hasPhoto={dialog.has_photo}
          photoId={dialog.photo_id}
          showPhotos={showPhotos}
        />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm">{dialog.title}</strong>
          <span className="block truncate text-xs text-muted-foreground">
            {username} · {kind}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{unreadCount ? `${unreadCount} unread` : "read"}</span>
        <DialogTargetLabel target={target} hasUsername={Boolean(dialog.username)} />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => stageTargetInActions(target)}
        >
          <IconArrowRight className="size-3" />
          Use
        </Button>
        <Menu
          label={`More actions for ${dialog.title || target}`}
          trigger={<IconDotsVertical className="size-4" />}
          panelClassName="min-w-48"
        >
          <MenuItem onClick={() => openMessages(dialog)}>
            <IconMessageCircle className="size-3.5" />
            Messages
          </MenuItem>
          <MenuSeparator />
          <DialogQuickActionButtons
            dialog={dialog}
            onQuickAction={onQuickAction}
            className="justify-start"
          />
        </Menu>
      </div>
    </div>
  )
}

function DialogQuickActionButtons({
  dialog,
  onQuickAction,
  className,
}: {
  dialog: TelegramDialog
  onQuickAction: (actionType: ActionType, dialog: TelegramDialog) => void
  className?: string
}) {
  return quickActionsForDialog(dialog).map((actionType) => {
    const meta = actionMeta[actionType]
    return (
      <MenuItem
        key={actionType}
        className={className}
        variant={meta.destructive ? "destructive" : "default"}
        onClick={() => onQuickAction(actionType, dialog)}
      >
        {meta.label}
      </MenuItem>
    )
  })
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

function DialogMessagesPanel({
  panel,
  onStageMessage,
  onReload,
  onClose,
}: {
  panel: MessagePanelState | null
  onStageMessage: (
    actionType: ActionType,
    dialog: TelegramDialog,
    message: TelegramMessage
  ) => void
  onReload: (dialog: TelegramDialog, limit: number) => Promise<void>
  onClose: () => void
}) {
  const dialog = panel?.dialog
  const messages = panel?.messages ?? []
  const target = dialog ? dialogTarget(dialog) : ""
  // The backend returns the most recent `limit` messages with no cursor, so a
  // full page implies there may be more — until we hit the server's hard cap.
  const reachedCap = (panel?.limit ?? 0) >= MESSAGES_MAX
  const maybeMore = messages.length >= (panel?.limit ?? 0) && !reachedCap

  function stageMessage(actionType: ActionType, message: TelegramMessage) {
    if (!dialog) return
    onStageMessage(actionType, dialog, message)
    onClose()
  }

  return (
    <ModalShell
      open={Boolean(panel)}
      onClose={onClose}
      size="xl"
      kicker="Message inspector"
      title={dialog?.title ?? "Messages"}
      description={
        target ? <span className="font-mono text-xs">{target}</span> : undefined
      }
      footer={
        <Button variant={OUTLINE_VARIANT} onClick={onClose}>
          Close
        </Button>
      }
    >
      {dialog && panel ? (
        <>
          {panel.loading && !messages.length ? (
            <SectionLoader label="Loading messages…" />
          ) : panel.error ? (
            <ErrorState
              title="Couldn't load messages"
              detail={panel.error}
              onRetry={() => onReload(dialog, panel.limit)}
            />
          ) : messages.length ? (
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="border-border bg-muted/40 text-muted-foreground">
                      #{message.id}
                    </Badge>
                    {message.out ? (
                      <Badge tone="border-primary/30 bg-primary/10 text-primary">
                        outgoing
                      </Badge>
                    ) : null}
                    {message.has_media ? (
                      <Badge tone="border-border bg-background text-muted-foreground">
                        media
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {message.sender_name || message.sender_id || "unknown"}
                    </span>
                  </div>
                  <p className="mt-2 max-h-24 overflow-auto text-sm whitespace-pre-wrap">
                    {message.text || "No text"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={OUTLINE_VARIANT}
                      onClick={() => stageMessage("forward_message", message)}
                    >
                      Forward
                    </Button>
                    <Button
                      size="sm"
                      variant={OUTLINE_VARIANT}
                      onClick={() => stageMessage("pin_message", message)}
                    >
                      Pin
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => stageMessage("delete_messages", message)}
                    >
                      Delete
                    </Button>
                    {message.has_media ? (
                      <Button
                        size="sm"
                        variant={OUTLINE_VARIANT}
                        onClick={() => stageMessage("download_media", message)}
                      >
                        Download media
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {maybeMore ? (
                <ShowMore
                  shown={messages.length}
                  total={MESSAGES_MAX}
                  onMore={() => {
                    if (panel.loading) return
                    onReload(dialog, MESSAGES_MAX)
                  }}
                  label={panel.loading ? "Loading…" : "Load more"}
                />
              ) : reachedCap ? (
                <p className="px-1 pt-2 text-xs text-muted-foreground">
                  Showing the {messages.length} most recent messages (inspector
                  cap).
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={IconMessageCircle}
              title="No messages loaded"
              detail="This dialog has no recent cached messages or Telegram did not return any for this session."
            />
          )}
        </>
      ) : null}
    </ModalShell>
  )
}
