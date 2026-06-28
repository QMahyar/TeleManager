import * as React from "react"

import {
  IconArrowRight,
  IconDotsVertical,
  IconMessageCircle,
  IconSearch,
} from "@tabler/icons-react"

import { Avatar } from "../../components/avatar"
import { Button } from "../../ui/button"
import { Menu, MenuItem, MenuSeparator } from "../../ui/menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "../../ui/table"
import {
  Badge,
  EmptyState,
  ErrorState,
  Input,
  Panel,
  SectionLoader,
  StepHeading,
} from "../../components/ui"
import { actionMeta } from "../../lib/constants"
import { quickActionsForDialog } from "../../lib/dialog-actions"
import { dialogKind, dialogTarget } from "../../lib/dialog-resolver"
import type { ActionType, TelegramDialog } from "../../types"
import type { DialogsScreenProps } from "../screen-props"

const OUTLINE_VARIANT = "outline"

const FILTER_LABELS: Record<string, string> = {
  all: "All",
  personal: "Personal",
  bot: "Bot",
  group: "Group",
  channel: "Channel",
}

export function DialogsTablePanel({
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

  // Stable per-row toggle so memoized rows aren't invalidated every render.
  // `toggleSelected` is a module-level fn and the setter is stable, so this
  // closure stays referentially constant across unrelated re-renders.
  const onToggle = React.useCallback(
    (target: string) => toggleSelected(target, setSelectedDialogTargets),
    [toggleSelected, setSelectedDialogTargets]
  )

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
                isSelected={selectedDialogTargets.has(dialogTarget(dialog))}
                onToggle={onToggle}
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
                      isSelected={selectedDialogTargets.has(dialogTarget(dialog))}
                      onToggle={onToggle}
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

type DialogRowProps = {
  dialog: TelegramDialog
  accountId: string
  showPhotos: boolean
  onQuickAction: (actionType: ActionType, dialog: TelegramDialog) => void
  isSelected: boolean
  onToggle: (target: string) => void
  stageTargetInActions: (target: string) => void
  openMessages: (dialog: TelegramDialog) => Promise<void>
}

// Memoized: a search keystroke or a single-row selection toggle re-renders the
// table panel, but each row's props (stable handlers + a boolean isSelected)
// stay equal, so only rows whose own data changed actually re-render.
const DialogRow = React.memo(function DialogRow({
  dialog,
  accountId,
  showPhotos,
  onQuickAction,
  isSelected,
  onToggle,
  stageTargetInActions,
  openMessages,
}: DialogRowProps) {
  const target = dialogTarget(dialog)
  const kind = dialogKind(dialog)
  const username = dialog.username ? `@${dialog.username}` : "No username"
  const unreadCount = Number(dialog.unread_count || 0)

  return (
    <TableRow className={isSelected ? "bg-primary/5" : "hover:bg-muted/20"}>
      <TableCell>
        <input
          type="checkbox"
          aria-label={`Select ${dialog.title}`}
          checked={isSelected}
          onChange={() => onToggle(target)}
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
          <Button size="xs" onClick={() => stageTargetInActions(target)}>
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
})

const DialogCard = React.memo(function DialogCard({
  dialog,
  accountId,
  showPhotos,
  onQuickAction,
  isSelected,
  onToggle,
  stageTargetInActions,
  openMessages,
}: DialogRowProps) {
  const target = dialogTarget(dialog)
  const kind = dialogKind(dialog)
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
          onChange={() => onToggle(target)}
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
})

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
