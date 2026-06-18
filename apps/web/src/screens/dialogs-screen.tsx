import * as React from "react"

import {
  IconArrowRight,
  IconDotsVertical,
  IconLoader2,
  IconMessageCircle,
  IconSearch,
} from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@workspace/ui/components/table"

import {
  Badge,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionTitle,
  Select,
} from "../components/ui"
import { api } from "../lib/api"
import { actionMeta } from "../lib/constants"
import { dialogKind, dialogTarget, humanTime } from "../lib/helpers"
import type { ActionType, TelegramDialog } from "../types"
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
  const fetchStatus = useCachedDialogs(props.dialogAccountId, props.setDialogs)
  const {
    allFilteredSelected,
    applyQuickAction,
    bulkQuickAction,
    loadDialogs,
    toggleSelectAll,
    useSelectedTargets,
  } = useDialogsController(props)

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <DialogsSourcePanel
        accounts={props.accounts}
        dialogAccountId={props.dialogAccountId}
        fetchStatus={fetchStatus.value}
        guarded={props.guarded}
        loading={props.loading}
        loadDialogs={loadDialogs}
        selectedDialogTargets={props.selectedDialogTargets}
        setDialogAccountId={props.setDialogAccountId}
        setSelectedDialogTargets={props.setSelectedDialogTargets}
        bulkQuickAction={bulkQuickAction}
        useSelectedTargets={useSelectedTargets}
      />
      <DialogsTablePanel
        allFilteredSelected={allFilteredSelected}
        applyQuickAction={applyQuickAction}
        dialogFilter={props.dialogFilter}
        dialogSearch={props.dialogSearch}
        filteredDialogs={props.filteredDialogs}
        flash={props.flash}
        selectedDialogTargets={props.selectedDialogTargets}
        setActionDraft={props.setActionDraft}
        setDialogFilter={props.setDialogFilter}
        setDialogSearch={props.setDialogSearch}
        setQuickActionContext={props.setQuickActionContext}
        setView={props.setView}
        setSelectedDialogTargets={props.setSelectedDialogTargets}
        toggleSelectAll={toggleSelectAll}
        toggleSelected={props.toggleSelected}
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

function useDialogsController(props: DialogsScreenProps) {
  const fetchStatus = useCachedDialogs(props.dialogAccountId, props.setDialogs)
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

  function applyQuickAction(
    actionType: ActionType,
    dialogs: TelegramDialog[],
    sourceLabel: string
  ) {
    const targets = dialogs.map(dialogTarget)
    props.setActionDraft({
      action_type: actionType,
      target: targets.join("\n"),
      message: "",
    })
    props.setQuickActionContext({
      source: "dialog",
      actionType,
      title: actionMeta[actionType].label,
      targetSummary: sourceLabel,
      count: targets.length,
      dialogKinds: [...new Set(dialogs.map(dialogKind))],
    })
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
    props.setView("actions")
    props.flash("Selected dialogs copied into Actions.")
  }

  return {
    allFilteredSelected: selection.allFilteredSelected,
    applyQuickAction,
    bulkQuickAction,
    loadDialogs,
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
  selectedDialogTargets,
  setDialogAccountId,
  setSelectedDialogTargets,
  bulkQuickAction,
  useSelectedTargets,
}: {
  accounts: DialogsScreenProps["accounts"]
  dialogAccountId: string
  fetchStatus: string
  guarded: DialogsScreenProps["guarded"]
  loading: boolean
  loadDialogs: (mode: "cached" | "live") => Promise<void>
  selectedDialogTargets: Set<string>
  setDialogAccountId: DialogsScreenProps["setDialogAccountId"]
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
  bulkQuickAction: (actionType: ActionType) => void
  useSelectedTargets: () => void
}) {
  return (
    <Panel className="space-y-4">
      <SectionTitle
        kicker="Discovery"
        title="Dialog Source"
        detail={`${selectedDialogTargets.size} selected`}
      />
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
      <div className="grid gap-2">
        <Button
          className="w-full"
          disabled={loading || !dialogAccountId}
          onClick={() => guarded(() => loadDialogs("live"))}
        >
          {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
          Fetch Dialogs
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          disabled={!dialogAccountId}
          onClick={() => guarded(() => loadDialogs("cached"))}
        >
          Load Cached Dialogs
        </Button>
      </div>
      {fetchStatus ? (
        <p className="text-xs text-muted-foreground">{fetchStatus}</p>
      ) : null}
      <Button
        variant={OUTLINE_VARIANT}
        className="w-full"
        onClick={useSelectedTargets}
      >
        Use Selected In Actions
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          onClick={() => bulkQuickAction("delete_chat")}
        >
          Delete Selected
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          onClick={() => bulkQuickAction("leave_chat")}
        >
          Leave Selected
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          onClick={() => bulkQuickAction("clear_chat")}
        >
          Clear Selected
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          className="w-full"
          onClick={() => bulkQuickAction("mute_chat")}
        >
          Mute Selected
        </Button>
      </div>
      <Button
        variant={OUTLINE_VARIANT}
        className="w-full"
        onClick={() => setSelectedDialogTargets(new Set())}
      >
        Clear Selection
      </Button>
    </Panel>
  )
}

function DialogsTablePanel({
  allFilteredSelected,
  applyQuickAction,
  dialogFilter,
  dialogSearch,
  filteredDialogs,
  flash,
  selectedDialogTargets,
  setActionDraft,
  setDialogFilter,
  setDialogSearch,
  setQuickActionContext,
  setView,
  setSelectedDialogTargets,
  toggleSelectAll,
  toggleSelected,
}: {
  allFilteredSelected: boolean
  applyQuickAction: (
    actionType: ActionType,
    dialogs: TelegramDialog[],
    sourceLabel: string
  ) => void
  dialogFilter: string
  dialogSearch: string
  filteredDialogs: TelegramDialog[]
  flash: DialogsScreenProps["flash"]
  selectedDialogTargets: Set<string>
  setActionDraft: DialogsScreenProps["setActionDraft"]
  setDialogFilter: DialogsScreenProps["setDialogFilter"]
  setDialogSearch: DialogsScreenProps["setDialogSearch"]
  setQuickActionContext: DialogsScreenProps["setQuickActionContext"]
  setView: DialogsScreenProps["setView"]
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
  toggleSelectAll: () => void
  toggleSelected: DialogsScreenProps["toggleSelected"]
}) {
  return (
    <Panel className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle
          kicker="Targets"
          title="Dialogs"
          detail={`${filteredDialogs.length} shown · ${selectedDialogTargets.size} selected`}
        />
        <div className="flex flex-wrap gap-2">
          {Object.entries(FILTER_LABELS).map(([value, label]) => (
            <Button
              key={value}
              variant={dialogFilter === value ? "default" : OUTLINE_VARIANT}
              onClick={() => setDialogFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="relative">
        <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="w-full pl-9"
          type="search"
          autoComplete="off"
          value={dialogSearch}
          onChange={(event) => setDialogSearch(event.target.value)}
          placeholder="Search dialogs"
        />
      </div>
      <TableWrap>
        <Table className="min-w-[58rem]">
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
              <TableHead>Kind</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Unread</TableHead>
              <TableHead>Target</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDialogs.map((dialog) => (
              <DialogRow
                key={String(dialog.id)}
                dialog={dialog}
                applyQuickAction={applyQuickAction}
                flash={flash}
                selectedDialogTargets={selectedDialogTargets}
                setActionDraft={setActionDraft}
                setQuickActionContext={setQuickActionContext}
                setView={setView}
                setSelectedDialogTargets={setSelectedDialogTargets}
                toggleSelected={toggleSelected}
              />
            ))}
            {filteredDialogs.length === 0 ? (
              <TableRow>
                <TableCell className="p-0" colSpan={7}>
                  <EmptyState
                    icon={IconMessageCircle}
                    title="No dialogs"
                    detail="Select an account above and click Fetch Dialogs to load your chats, groups, and channels."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableWrap>
    </Panel>
  )
}

function DialogRow({
  dialog,
  applyQuickAction,
  flash,
  selectedDialogTargets,
  setActionDraft,
  setQuickActionContext,
  setView,
  setSelectedDialogTargets,
  toggleSelected,
}: {
  dialog: TelegramDialog
  applyQuickAction: (
    actionType: ActionType,
    dialogs: TelegramDialog[],
    sourceLabel: string
  ) => void
  flash: DialogsScreenProps["flash"]
  selectedDialogTargets: Set<string>
  setActionDraft: DialogsScreenProps["setActionDraft"]
  setQuickActionContext: DialogsScreenProps["setQuickActionContext"]
  setView: DialogsScreenProps["setView"]
  setSelectedDialogTargets: DialogsScreenProps["setSelectedDialogTargets"]
  toggleSelected: DialogsScreenProps["toggleSelected"]
}) {
  const target = dialogTarget(dialog)

  return (
    <TableRow>
      <TableCell>
        <input
          type="checkbox"
          aria-label={`Select ${dialog.title}`}
          checked={selectedDialogTargets.has(target)}
          onChange={() => toggleSelected(target, setSelectedDialogTargets)}
        />
      </TableCell>
      <TableCell className="font-medium">{dialog.title}</TableCell>
      <TableCell>
        <Badge tone="border-border bg-muted/40 text-muted-foreground">
          {dialog.dialog_type || dialog.kind || dialog.type || "unknown"}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {dialog.username ? `@${dialog.username}` : ""}
      </TableCell>
      <TableCell>{dialog.unread_count || 0}</TableCell>
      <TableCell className="font-mono text-xs">{target}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={OUTLINE_VARIANT}
            onClick={() =>
              openTargetAction(
                target,
                setQuickActionContext,
                setActionDraft,
                setView,
                flash
              )
            }
          >
            <IconArrowRight className="size-3" />
            Use
          </Button>
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center justify-center border border-border bg-background px-2 text-sm text-foreground hover:bg-muted/40">
              <IconDotsVertical className="size-4" />
            </summary>
            <div className="absolute right-0 z-10 mt-2 grid min-w-44 gap-1 border border-border bg-card p-2 shadow-xl">
              {quickActionsForDialog(dialog).map((actionType) => (
                <Button
                  key={actionType}
                  size="sm"
                  variant={OUTLINE_VARIANT}
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

function openTargetAction(
  target: string,
  setQuickActionContext: DialogsScreenProps["setQuickActionContext"],
  setActionDraft: DialogsScreenProps["setActionDraft"],
  setView: DialogsScreenProps["setView"],
  flash: DialogsScreenProps["flash"]
) {
  setQuickActionContext(null)
  setActionDraft((current) => ({ ...current, target }))
  setView("actions")
  flash("Dialog target copied into Actions.")
}

function quickActionsForDialog(dialog: TelegramDialog): ActionType[] {
  const kind = dialogKind(dialog)
  if (kind === "bot") {
    return [
      "start_bot",
      "delete_chat",
      "clear_chat",
      "mute_chat",
      "archive_chat",
      "block_user",
    ]
  }
  if (kind === "personal") {
    return [
      "send_message",
      "delete_chat",
      "clear_chat",
      "mute_chat",
      "archive_chat",
      "block_user",
    ]
  }
  if (kind === "group" || kind === "supergroup") {
    return [
      "leave_chat",
      "delete_chat",
      "clear_chat",
      "mute_chat",
      "archive_chat",
      "read_chat",
      "report_spam",
    ]
  }
  if (kind === "channel") {
    return [
      "leave_chat",
      "delete_chat",
      "mute_chat",
      "archive_chat",
      "read_chat",
      "report_spam",
    ]
  }
  return ["delete_chat", "clear_chat", "mute_chat", "archive_chat"]
}
