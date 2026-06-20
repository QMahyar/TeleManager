import * as React from "react"

import {
  IconArrowRight,
  IconBolt,
  IconDotsVertical,
  IconMessageCircle,
  IconSearch,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
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
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  StepHeading,
} from "../components/ui"
import { api } from "../lib/api"
import { defaultFieldValues } from "../lib/action-schema"
import {
  bulkActionsForSelection,
  quickActionsForDialog,
  selectionKindCounts,
} from "../lib/dialog-actions"
import { actionMeta } from "../lib/constants"
import { dialogKind, dialogTarget, humanTime } from "../lib/helpers"
import type { ActionType, TelegramDialog, TelegramMessage } from "../types"
import type { DialogsScreenProps } from "./screen-props"

const FILTER_LABELS: Record<string, string> = {
  all: "All",
  personal: "Personal",
  bot: "Bot",
  group: "Group",
  channel: "Channel",
}

const OUTLINE_VARIANT = "outline"

export function DialogsScreen(props: DialogsScreenProps) {
  const [messagePanel, setMessagePanel] = React.useState<{
    dialog: TelegramDialog
    messages: TelegramMessage[]
  } | null>(null)
  const fetchStatus = useCachedDialogs(props.dialogAccountId, props.setDialogs)
  const {
    allFilteredSelected,
    applyQuickAction,
    bulkQuickAction,
    loadDialogs,
    scheduleSelected,
    stageMessageInActions,
    stageTargetInActions,
    toggleSelectAll,
    useSelectedTargets,
  } = useDialogsController(props, fetchStatus)

  async function openMessagePanel(dialog: TelegramDialog) {
    if (!props.dialogAccountId) {
      props.flash("Choose an account first.")
      return
    }
    const target = dialogTarget(dialog)
    const payload = await api<{ messages: TelegramMessage[] }>(
      `/api/accounts/${props.dialogAccountId}/messages?target=${encodeURIComponent(target)}&limit=50`
    )
    setMessagePanel({ dialog, messages: payload.messages || [] })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <DialogsSourcePanel
        accounts={props.accounts}
        dialogAccountId={props.dialogAccountId}
        fetchStatus={fetchStatus.value}
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
        applyQuickAction={applyQuickAction}
        dialogFilter={props.dialogFilter}
        dialogSearch={props.dialogSearch}
        dialogs={props.dialogs}
        filteredDialogs={props.filteredDialogs}
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
        onStageMessage={stageMessageInActions}
        onClose={() => setMessagePanel(null)}
      />
    </div>
  )
}

function useCachedDialogs(
  dialogAccountId: string,
  setDialogs: DialogsScreenProps["setDialogs"]
) {
  const [value, setValue] = React.useState("")

  React.useEffect(() => {
    if (!dialogAccountId) {
      return
    }
    api<{ dialogs: TelegramDialog[]; fetched_at?: string | null }>(
      `/api/accounts/${dialogAccountId}/dialogs`
    )
      .then((payload) => {
        setDialogs(payload.dialogs || [])
        setValue(
          payload.fetched_at
            ? `Cached dialogs from ${humanTime(payload.fetched_at)}.`
            : ""
        )
      })
      .catch((error) => {
        setDialogs([])
        setValue(
          error instanceof Error
            ? error.message
            : "Failed to load cached dialogs."
        )
      })
  }, [dialogAccountId, setDialogs])

  return { setValue, value }
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
  fetchStatus: { value: string; setValue: (value: string) => void }
) {
  const selection = useDialogsSelection(
    props.filteredDialogs,
    props.selectedDialogTargets,
    props.setSelectedDialogTargets
  )

  async function loadDialogs(mode: "cached" | "live") {
    if (!props.dialogAccountId) {
      props.flash("Choose an account first.")
      return
    }
    if (mode === "live") {
      fetchStatus.setValue("Fetching dialogs from Telegram...")
    }

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
  }

  // The account used to fetch these dialogs is the one that can act on them, so
  // every handoff into Actions pre-selects it (otherwise the builder blocks on
  // "select an account").
  function seedActionAccount() {
    if (props.dialogAccountId) {
      props.setActionAccountIds(new Set([props.dialogAccountId]))
    }
  }

  function applyQuickAction(
    actionType: ActionType,
    dialogs: TelegramDialog[],
    sourceLabel: string
  ) {
    const targets = dialogs.map(dialogTarget)
    props.setActionDraft({
      action_type: actionType,
      target: targets.join("\n"),
      fields: defaultFieldValues(actionType),
    })
    props.setQuickActionContext({
      source: "dialog",
      actionType,
      title: actionMeta[actionType].label,
      targetSummary: sourceLabel,
      count: targets.length,
      dialogKinds: [...new Set(dialogs.map(dialogKind))],
    })
    seedActionAccount()
    props.setView("actions")
    props.flash(`${actionMeta[actionType].label} preset prepared in Actions.`)
  }

  function bulkQuickAction(actionType: ActionType) {
    const dialogs = props.filteredDialogs.filter((dialog) =>
      props.selectedDialogTargets.has(dialogTarget(dialog))
    )
    if (!dialogs.length) {
      props.flash("Select one or more dialogs first.")
      return
    }
    applyQuickAction(
      actionType,
      dialogs,
      `${dialogs.length} selected dialog(s)`
    )
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

  function stageMessageInActions(
    actionType: ActionType,
    dialog: TelegramDialog,
    message: TelegramMessage
  ) {
    props.setQuickActionContext({
      source: "dialog",
      actionType,
      title: actionMeta[actionType].label,
      targetSummary: `${dialog.title} / message ${message.id}`,
      count: 1,
      dialogKinds: [dialogKind(dialog)],
    })
    const target = dialogTarget(dialog)
    props.setActionDraft({
      action_type: actionType,
      target,
      fields: fieldsForStagedMessage(actionType, target, message.id),
    })
    seedActionAccount()
    props.setView("actions")
  }

  function scheduleSelected() {
    if (!props.selectedDialogTargets.size) {
      props.flash("Select one or more dialogs first.")
      return
    }
    props.setScheduleSeed({
      accountIds: props.dialogAccountId ? [props.dialogAccountId] : [],
      actionType: "send_message",
      target: [...props.selectedDialogTargets].join("\n"),
    })
    props.setView("schedules")
    props.flash("Selected dialogs staged into a new schedule.")
  }

  return {
    allFilteredSelected: selection.allFilteredSelected,
    applyQuickAction,
    bulkQuickAction,
    loadDialogs,
    scheduleSelected,
    stageMessageInActions,
    stageTargetInActions,
    toggleSelectAll: selection.toggleSelectAll,
    useSelectedTargets,
  }
}

function DialogsSourcePanel({
  accounts,
  dialogAccountId,
  fetchStatus,
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
    <Panel className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <StepHeading
        step={1}
        title="Find dialogs"
        detail="Pick one account, load cached or live dialogs, then stage selected chats into Actions."
      />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-border bg-muted/20 p-3">
          <span className="text-muted-foreground">Selected</span>
          <strong className="mt-1 block font-heading text-2xl">
            {selectedDialogTargets.size}
          </strong>
        </div>
        <div className="border border-border bg-muted/20 p-3">
          <span className="text-muted-foreground">Source</span>
          <strong className="mt-1 block truncate text-sm">
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
          className="w-full"
          disabled={loading || !dialogAccountId}
          loading={loading}
          onClick={() => guarded(() => loadDialogs("live"))}
        >
          Fetch Live
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          disabled={!dialogAccountId}
          onClick={() => guarded(() => loadDialogs("cached"))}
        >
          Load Cache
        </Button>
      </div>
      {fetchStatus ? (
        <div className="border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
          {fetchStatus}
        </div>
      ) : null}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Selected workflow
            </p>
            <p className="text-xs text-muted-foreground">
              Bulk actions only show options valid for every selected chat.
            </p>
          </div>
          <IconBolt className="size-4 text-primary" />
        </div>
        <SelectionBreakdown counts={kindCounts} hasSelection={hasSelection} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="w-full"
            disabled={!hasSelection}
            onClick={useSelectedTargets}
          >
            Use In Actions
          </Button>
          <Button
            variant={OUTLINE_VARIANT}
            className="w-full"
            disabled={!hasSelection}
            onClick={scheduleSelected}
          >
            Schedule Selected
          </Button>
        </div>
        {hasSelection ? (
          bulkActions.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {bulkActions.map((actionType) => (
                <BulkActionButton
                  key={actionType}
                  actionType={actionType}
                  onClick={bulkQuickAction}
                  disabled={false}
                  danger={Boolean(actionMeta[actionType].destructive)}
                />
              ))}
            </div>
          ) : (
            <p className="border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
              No bulk action applies to all selected chat types. Narrow the
              selection to one kind for more options.
            </p>
          )
        ) : (
          <p className="border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
            Select one or more dialogs to see bulk actions.
          </p>
        )}
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          disabled={!hasSelection}
          onClick={() => setSelectedDialogTargets(new Set())}
        >
          Clear Selection
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

function BulkActionButton({
  actionType,
  onClick,
  disabled,
  danger = false,
}: {
  actionType: ActionType
  onClick: (actionType: ActionType) => void
  disabled: boolean
  danger?: boolean
}) {
  return (
    <Button
      variant={danger ? "destructive" : OUTLINE_VARIANT}
      className="w-full justify-start"
      disabled={disabled}
      onClick={() => onClick(actionType)}
    >
      {actionMeta[actionType].label}
    </Button>
  )
}

function DialogsTablePanel({
  allFilteredSelected,
  applyQuickAction,
  dialogFilter,
  dialogSearch,
  dialogs,
  filteredDialogs,
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
  applyQuickAction: (
    actionType: ActionType,
    dialogs: TelegramDialog[],
    sourceLabel: string
  ) => void
  dialogFilter: string
  dialogSearch: string
  dialogs: TelegramDialog[]
  filteredDialogs: TelegramDialog[]
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

  return (
    <Panel className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <StepHeading
          step={2}
          title="Review targets"
          detail={`${filteredDialogs.length} shown · ${selectedDialogTargets.size} selected`}
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
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <DialogMetric label="Loaded" value={dialogs.length} />
        <DialogMetric label="Shown" value={filteredDialogs.length} />
        <DialogMetric label="Selected" value={selectedDialogTargets.size} />
        <DialogMetric
          label="Unread"
          value={countUnreadDialogs(filteredDialogs)}
        />
        <DialogMetric label="Groups" value={filterCounts.group} />
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
      {filteredDialogs.length === 0 ? (
        <EmptyState
          icon={IconMessageCircle}
          title="No dialogs"
          detail="Select an account and fetch dialogs, or adjust search and type filters."
        />
      ) : (
        <>
          {/* Mobile: stacked cards instead of a sideways-scrolling table. */}
          <div className="space-y-2 lg:hidden">
            {filteredDialogs.map((dialog) => (
              <DialogCard
                key={String(dialog.id)}
                dialog={dialog}
                applyQuickAction={applyQuickAction}
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
            <TableWrap>
              <Table className="min-w-[50rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>
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
                    <TableHead>Type</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDialogs.map((dialog) => (
                    <DialogRow
                      key={String(dialog.id)}
                      dialog={dialog}
                      applyQuickAction={applyQuickAction}
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

function DialogMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-muted/20 p-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <strong className="mt-1 block font-heading text-2xl">{value}</strong>
    </div>
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

function DialogRow({
  dialog,
  applyQuickAction,
  selectedDialogTargets,
  setSelectedDialogTargets,
  toggleSelected,
  stageTargetInActions,
  openMessages,
}: {
  dialog: TelegramDialog
  applyQuickAction: (
    actionType: ActionType,
    dialogs: TelegramDialog[],
    sourceLabel: string
  ) => void
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
        <div className="min-w-0">
          <strong className="block truncate text-sm">{dialog.title}</strong>
          <span className="block truncate text-xs text-muted-foreground">
            {username}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge tone="border-border bg-muted/40 text-muted-foreground">
          {kind}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {unreadCount ? `${unreadCount} unread` : "read"}
      </TableCell>
      <TableCell className="max-w-56 truncate font-mono text-xs">
        {target}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant={OUTLINE_VARIANT}
            onClick={() => openMessages(dialog)}
          >
            Messages
          </Button>
          <Button
            size="sm"
            variant={OUTLINE_VARIANT}
            onClick={() => stageTargetInActions(target)}
          >
            <IconArrowRight className="size-3" />
            Use
          </Button>
          <details className="relative">
            <summary className="flex h-6 cursor-pointer list-none items-center justify-center border border-border bg-background px-2 text-sm text-foreground hover:bg-muted/40">
              <IconDotsVertical className="size-4" />
            </summary>
            <div className="absolute right-0 z-10 mt-2 grid min-w-48 gap-1 border border-border bg-card p-2 shadow-xl">
              {quickActionsForDialog(dialog).map((actionType) => (
                <Button
                  key={actionType}
                  size="sm"
                  variant={
                    actionMeta[actionType].destructive
                      ? "destructive"
                      : OUTLINE_VARIANT
                  }
                  onClick={() =>
                    applyQuickAction(
                      actionType,
                      [dialog],
                      dialog.title || target
                    )
                  }
                >
                  {actionMeta[actionType].label}
                </Button>
              ))}
            </div>
          </details>
        </div>
      </TableCell>
    </TableRow>
  )
}

function DialogCard({
  dialog,
  applyQuickAction,
  selectedDialogTargets,
  setSelectedDialogTargets,
  toggleSelected,
  stageTargetInActions,
  openMessages,
}: {
  dialog: TelegramDialog
  applyQuickAction: (
    actionType: ActionType,
    dialogs: TelegramDialog[],
    sourceLabel: string
  ) => void
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
      className={`space-y-3 border p-3 ${
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
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm">{dialog.title}</strong>
          <span className="block truncate text-xs text-muted-foreground">
            {username}
          </span>
        </div>
        <Badge tone="border-border bg-muted/40 text-muted-foreground">
          {kind}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{unreadCount ? `${unreadCount} unread` : "read"}</span>
        <span className="font-mono break-all">{target}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={OUTLINE_VARIANT}
          onClick={() => openMessages(dialog)}
        >
          Messages
        </Button>
        <Button
          size="sm"
          variant={OUTLINE_VARIANT}
          onClick={() => stageTargetInActions(target)}
        >
          <IconArrowRight className="size-3" />
          Use
        </Button>
        {quickActionsForDialog(dialog).map((actionType) => (
          <Button
            key={actionType}
            size="sm"
            variant={
              actionMeta[actionType].destructive
                ? "destructive"
                : OUTLINE_VARIANT
            }
            onClick={() =>
              applyQuickAction(actionType, [dialog], dialog.title || target)
            }
          >
            {actionMeta[actionType].label}
          </Button>
        ))}
      </div>
    </div>
  )
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
  onClose,
}: {
  panel: { dialog: TelegramDialog; messages: TelegramMessage[] } | null
  onStageMessage: (
    actionType: ActionType,
    dialog: TelegramDialog,
    message: TelegramMessage
  ) => void
  onClose: () => void
}) {
  if (!panel) {
    return null
  }
  const dialog = panel.dialog
  const messages = panel.messages
  const target = dialogTarget(dialog)

  function stageMessage(actionType: ActionType, message: TelegramMessage) {
    onStageMessage(actionType, dialog, message)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/80 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-4xl overflow-hidden border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.24em] text-primary uppercase">
              Message inspector
            </p>
            <h2 className="font-heading text-2xl">{dialog.title}</h2>
            <p className="font-mono text-xs text-muted-foreground">{target}</p>
          </div>
          <Button variant={OUTLINE_VARIANT} onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="max-h-[calc(90vh-6rem)] overflow-auto p-4">
          {messages.length ? (
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="border border-border p-3 text-sm"
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
            </div>
          ) : (
            <EmptyState
              icon={IconMessageCircle}
              title="No messages loaded"
              detail="This dialog has no recent cached messages or Telegram did not return any for this session."
            />
          )}
        </div>
      </section>
    </div>
  )
}
