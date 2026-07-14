import { IconBolt, IconChevronDown, IconSearch } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Menu, MenuItem } from "../../ui/menu"
import {
  Badge,
  Callout,
  Field,
  Panel,
  Select,
  StepHeading,
} from "../../components/ui"
import { actionMeta } from "../../lib/constants"
import {
  bulkActionsForSelection,
  selectionKindCounts,
} from "../../lib/dialog-actions"
import { dialogTarget } from "../../lib/dialog-resolver"
import type { ActionType, TelegramDialog } from "../../types"
import type { DialogsScreenProps } from "../screen-props"

const OUTLINE_VARIANT = "outline"

export function DialogsSourcePanel({
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
  onOpenSearch,
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
  onOpenSearch: () => void
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
      <Button
        variant={OUTLINE_VARIANT}
        className="w-full"
        disabled={!dialogAccountId}
        onClick={onOpenSearch}
      >
        <IconSearch className="size-4" />
        Search messages
      </Button>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="type-label text-muted-foreground">Selected workflow</p>
            <p className="text-xs text-muted-foreground">
              Bulk actions only show options valid for every selected chat.
            </p>
          </div>
          <IconBolt className="size-4 text-primary-text" />
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
