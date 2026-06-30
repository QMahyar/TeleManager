import * as React from "react"

import {
  IconCheck,
  IconChevronDown,
  IconFileText,
  IconLogout,
  IconMessageCircle,
  IconPencil,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
import { Menu, MenuItem, MenuSeparator } from "../ui/menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "../ui/table"

import { api, toForm } from "../lib/api"
import { accountStatus } from "../lib/helpers"
import type { Account, AskDialog, Flash, PhotosMode } from "../types"
import { Avatar } from "./avatar"
import { EmptyState, SignalDot, Skeleton, type SignalTone } from "./ui"

function getHealthBadge(account: Account): string {
  const status = account.health_status || 'unknown'
  switch (status) {
    case 'healthy': return '🟢'
    case 'stale': return '🟡'
    case 'revoked': return '🔴'
    default: return '⚪'
  }
}

function getHealthTooltip(account: Account): string {
  const status = account.health_status || 'unknown'
  switch (status) {
    case 'healthy': return 'Session healthy (validated recently)'
    case 'stale': return 'Session stale (not validated in 7+ days)'
    case 'revoked': return 'Session revoked or expired'
    default: return 'Session health unknown (never validated)'
  }
}


// The per-account dialog-photo override, surfaced in the row's Manage menu.
// "default" defers to the global Settings → Appearance toggle.
const PHOTOS_MODE_OPTIONS: { mode: PhotosMode; label: string }[] = [
  { mode: "default", label: "Use global default" },
  { mode: "on", label: "Always show photos" },
  { mode: "off", label: "Never show photos" },
]

type AccountsTableProps = {
  accounts: Account[]
  loaded?: boolean
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  refresh: () => Promise<void>
  flash: Flash
  guarded: (work: () => Promise<void>) => Promise<void>
  askDialog: AskDialog
  // Sends the operator to the add-account flow from the zero-state CTA; the
  // Fleet tab wires this to its Login tab.
  onAddAccount?: () => void
}

type AccountRowProps = AccountsTableProps & {
  account: Account
}

type AccountActionProps = Pick<
  AccountsTableProps,
  "guarded" | "refresh" | "flash" | "askDialog"
> & {
  account: Account
}

export function AccountsTable(props: AccountsTableProps) {
  const { accounts, loaded = true, selectedIds, setSelectedIds, onAddAccount } =
    props

  // First load in flight: show skeleton rows so the panel keeps its shape
  // instead of flashing the empty state before data arrives.
  if (!loaded && !accounts.length) {
    return <AccountsTableSkeleton />
  }

  if (!accounts.length) {
    return (
      <EmptyState
        icon={IconUsers}
        title="No accounts yet"
        detail="Add or import a Telegram session to start managing accounts, dialogs, and action queues."
        action={
          onAddAccount ? (
            <Button size="sm" onClick={onAddAccount}>
              <IconPlus className="size-3.5" />
              Add account
            </Button>
          ) : null
        }
      />
    )
  }

  const allSelected = accounts.every((account) => selectedIds.has(account.id))
  const selectedCount = accounts.filter((account) =>
    selectedIds.has(account.id)
  ).length

  function toggleAll(checked: boolean) {
    setSelectedIds(
      checked ? new Set(accounts.map((account) => account.id)) : new Set()
    )
  }

  return (
    <>
      {/* Mobile: stacked cards (the wide table scrolls awkwardly on phones). */}
      <div className="space-y-3 lg:hidden">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
          <input
            type="checkbox"
            aria-label={allSelected ? "Deselect all accounts" : "Select all accounts"}
            checked={allSelected}
            onChange={(event) => toggleAll(event.target.checked)}
          />
          <span className="text-muted-foreground">
            {selectedCount} of {accounts.length} selected
          </span>
        </div>
        {accounts.map((account) => (
          <AccountCard key={account.id} {...props} account={account} />
        ))}
      </div>

      {/* Desktop: full table. */}
      <div className="hidden lg:block">
        <TableWrap>
          <Table className="min-w-[40rem]">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    aria-label={
                      allSelected
                        ? "Deselect all accounts"
                        : "Select all accounts"
                    }
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                  />
                </TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dialogs</TableHead>
                <TableHead>Session</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <AccountsTableBody {...props} />
          </Table>
        </TableWrap>
      </div>
    </>
  )
}

function AccountsTableSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading accounts">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-border p-3"
        >
          <Skeleton className="size-4" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  )
}

function AccountCard({
  account,
  selectedIds,
  setSelectedIds,
  ...actions
}: AccountRowProps) {
  const status = accountStatus(account)
  const isSelected = selectedIds.has(account.id)

  return (
    <div
      className={`space-y-2 rounded-lg border p-2.5 ${
        isSelected ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5"
          aria-label={`Select ${account.label || account.session_name}`}
          checked={isSelected}
          onChange={() => toggleAccountSelection(account.id, setSelectedIds)}
        />
        <div className="min-w-0 flex-1">
          <AccountIdentity account={account} />
        </div>
        <StatusSignal status={status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {account.dialog_count || 0} dialogs ·{" "}
        <span className="font-mono break-all" title={`${account.session_name}.session`}>
          {account.session_name}.session
        </span>
      </p>
      <AccountActions account={account} {...actions} />
    </div>
  )
}

function AccountsTableBody(props: AccountsTableProps) {
  if (!props.accounts.length) {
    return (
      <TableBody>
        <TableRow>
          <TableCell className="p-0" colSpan={6}>
            <EmptyState
              title="No accounts yet"
              detail="Add or import a Telegram session to start managing accounts, dialogs, and action queues."
              className="border-0 bg-transparent"
            />
          </TableCell>
        </TableRow>
      </TableBody>
    )
  }

  return (
    <TableBody>
      {props.accounts.map((account) => (
        <AccountRow key={account.id} {...props} account={account} />
      ))}
    </TableBody>
  )
}

function AccountRow({
  account,
  selectedIds,
  setSelectedIds,
  ...actions
}: AccountRowProps) {
  return (
    <TableRow>
      <TableCell>
        <input
          type="checkbox"
          aria-label={`Select ${account.label || account.session_name}`}
          checked={selectedIds.has(account.id)}
          onChange={() => toggleAccountSelection(account.id, setSelectedIds)}
        />
      </TableCell>
      <TableCell>
        <AccountIdentity account={account} />
      </TableCell>
      <TableCell>
        <StatusSignal status={accountStatus(account)} />
      </TableCell>
      <TableCell>{account.dialog_count || 0}</TableCell>
      <TableCell
        className="max-w-[14rem] truncate font-mono text-xs"
        title={`${account.session_name}.session`}
      >
        {account.session_name}.session
      </TableCell>
      <TableCell>
        <AccountActions account={account} {...actions} />
      </TableCell>
    </TableRow>
  )
}

function AccountIdentity({ account }: { account: Account }) {
  const label = [
    account.label,
    account.username ? `@${account.username}` : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ")

  const display = account.label || account.session_name
  const healthBadge = getHealthBadge(account)
  const healthTooltip = getHealthTooltip(account)

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={display} seed={account.id} size={32} />
      <div className="min-w-0">
        <strong className="block truncate leading-tight">
          {healthBadge && (
            <span title={healthTooltip} className="mr-1.5">
              {healthBadge}
            </span>
          )}
          {label || account.session_name}
        </strong>
        {account.last_error ? (
          <p
            className="truncate text-xs text-destructive"
            title={account.last_error}
          >
            {account.last_error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// The fleet table reads as a status board: a calm signal light + the status
// word, instead of a loud filled pill on every row. Maps the five account
// status words to distinct signal tones so they never collapse visually:
// ready (teal), an active login challenge that needs a code/2FA now (amber),
// error (red), and the otherwise-idle "needs login" session (muted).
function statusSignal(status: string): SignalTone {
  if (status === "ready") return "ready"
  if (status === "error") return "error"
  if (status === "code sent" || status === "needs 2FA") return "attention"
  return "idle" // needs login — no live challenge, just not signed in yet
}

function StatusSignal({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
      <SignalDot tone={statusSignal(status)} />
      {status}
    </span>
  )
}

function AccountActions({
  account,
  guarded,
  refresh,
  flash,
  askDialog,
}: AccountActionProps) {
  // One labelled menu instead of a row of competing buttons: the per-row table
  // previously needed min-w-[62rem], which pushed this whole column off-screen
  // behind a horizontal scrollbar. Validate + Dialogs (the common verbs) lead;
  // the rest follow.
  return (
    <div className="flex justify-end">
      <Menu
        label={`Manage ${account.label || account.session_name}`}
        panelClassName="min-w-48"
        triggerProps={{ size: "sm", className: "gap-1" }}
        trigger={
          <>
            Manage
            <IconChevronDown className="size-3.5" />
          </>
        }
      >
        <MenuItem
          onClick={() => guarded(() => validateAccount(account, refresh, flash))}
        >
          <IconShieldCheck className="size-3.5" />
          Validate
        </MenuItem>
        <MenuItem
          onClick={() =>
            guarded(() => fetchAccountDialogs(account, refresh, flash))
          }
        >
          <IconMessageCircle className="size-3.5" />
          Fetch dialogs
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onClick={() =>
            guarded(() => renameAccount(account, refresh, flash, askDialog))
          }
        >
          <IconPencil className="size-3.5" />
          Rename label
        </MenuItem>
        <MenuItem
          onClick={() =>
            guarded(() => renameSessionFile(account, refresh, flash, askDialog))
          }
        >
          <IconFileText className="size-3.5" />
          Rename file
        </MenuItem>
        <MenuSeparator />
        <div className="px-2 pt-0.5 pb-1 font-mono text-[0.65rem] tracking-wider text-muted-foreground uppercase">
          Dialog photos
        </div>
        {PHOTOS_MODE_OPTIONS.map(({ mode, label }) => {
          const active = (account.photos_mode || "default") === mode
          return (
            <MenuItem
              key={mode}
              onClick={() =>
                guarded(() =>
                  setAccountPhotosMode(account, mode, refresh, flash)
                )
              }
            >
              <IconCheck
                className={active ? "size-3.5 opacity-100" : "size-3.5 opacity-0"}
              />
              {label}
            </MenuItem>
          )
        })}
        <MenuSeparator />
        <MenuItem
          variant="destructive"
          onClick={() =>
            guarded(() => logoutAccount(account, refresh, flash, askDialog))
          }
        >
          <IconLogout className="size-3.5" />
          Logout
        </MenuItem>
        <MenuItem
          variant="destructive"
          onClick={() =>
            guarded(() => deleteLocalSession(account, refresh, flash, askDialog))
          }
        >
          <IconTrash className="size-3.5" />
          Delete local
        </MenuItem>
      </Menu>
    </div>
  )
}

function toggleAccountSelection(
  accountId: string,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(accountId)) next.delete(accountId)
    else next.add(accountId)
    return next
  })
}

async function validateAccount(
  account: Account,
  refresh: () => Promise<void>,
  flash: Flash
) {
  await api(`/api/accounts/${account.id}/validate`, { method: "POST" })
  flash("Session validated.", "success")
  await refresh()
}

async function fetchAccountDialogs(
  account: Account,
  refresh: () => Promise<void>,
  flash: Flash
) {
  await api(`/api/accounts/${account.id}/dialogs/fetch?limit=500`, {
    method: "POST",
  })
  flash("Dialogs fetched.", "success")
  await refresh()
}

async function setAccountPhotosMode(
  account: Account,
  mode: PhotosMode,
  refresh: () => Promise<void>,
  flash: Flash
) {
  // No-op when already on this mode, so re-selecting it doesn't churn a save.
  if ((account.photos_mode || "default") === mode) return
  await api(`/api/accounts/${account.id}/photos-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photos_mode: mode }),
  })
  const name = account.label || account.session_name
  flash(
    mode === "default"
      ? `Photos for ${name} now follow the global default.`
      : `Photos ${mode === "on" ? "always shown" : "hidden"} for ${name}. Re-fetch dialogs to apply.`,
    "success"
  )
  await refresh()
}

async function renameAccount(
  account: Account,
  refresh: () => Promise<void>,
  flash: Flash,
  askDialog: AskDialog
) {
  const label = await askDialog({
    title: "Rename account",
    description: "Update the local display label for this Telegram session.",
    confirmLabel: "Save Label",
    input: {
      label: "Account label",
      value: account.label || account.session_name,
      placeholder: "Main account",
    },
  })
  if (typeof label !== "string") return
  if (!label) return flash("Account label cannot be empty.")
  if (label === account.label) return
  await api(`/api/accounts/${account.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  })
  flash("Account renamed.", "success")
  await refresh()
}

async function renameSessionFile(
  account: Account,
  refresh: () => Promise<void>,
  flash: Flash,
  askDialog: AskDialog
) {
  const sessionName = await askDialog({
    title: "Rename session file",
    description:
      "Use only the filename stem. TeleManager keeps the .session extension.",
    confirmLabel: "Rename File",
    input: {
      label: "Session filename",
      value: account.session_name,
      placeholder: "main_account",
    },
  })
  if (typeof sessionName !== "string") return
  if (!sessionName) return flash("Session filename cannot be empty.")
  if (sessionName === account.session_name) return
  await api(`/api/sessions/${account.id}/rename-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_name: sessionName }),
  })
  flash("Session file renamed.", "success")
  await refresh()
}

async function deleteLocalSession(
  account: Account,
  refresh: () => Promise<void>,
  flash: Flash,
  askDialog: AskDialog
) {
  const confirmed = await askDialog({
    title: "Delete local session?",
    description: `This removes ${account.label || account.session_name} from this machine. It does not delete your Telegram account.`,
    confirmLabel: "Delete Local",
    danger: true,
  })
  if (!confirmed) return
  await api(`/api/accounts/${account.id}`, { method: "DELETE" })
  flash("Local session deleted.", "success")
  await refresh()
}

async function logoutAccount(
  account: Account,
  refresh: () => Promise<void>,
  flash: Flash,
  askDialog: AskDialog
) {
  const confirmed = await askDialog({
    title: "Log out session?",
    description:
      "Telegram will invalidate this local session. You will need to log in again to recreate it.",
    confirmLabel: "Log Out",
    danger: true,
  })
  if (!confirmed) return
  await api("/api/accounts/logout", {
    method: "POST",
    body: toForm({ account_id: account.id }),
  })
  flash("Account logged out.", "success")
  await refresh()
}
