import * as React from "react"

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

import { api, toForm } from "../lib/api"
import { accountStatus, statusTone } from "../lib/helpers"
import type { Account, AskDialog } from "../types"
import { Badge, EmptyState } from "./ui"

type AccountsTableProps = {
  accounts: Account[]
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  refresh: () => Promise<void>
  flash: (message: string) => void
  guarded: (work: () => Promise<void>) => Promise<void>
  askDialog: AskDialog
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
  const { accounts, selectedIds, setSelectedIds } = props
  const allSelected =
    accounts.length > 0 &&
    accounts.every((account) => selectedIds.has(account.id))

  return (
    <TableWrap>
      <Table className="min-w-[62rem]">
        <TableHeader>
          <TableRow>
            <TableHead>
              <input
                type="checkbox"
                aria-label={
                  allSelected ? "Deselect all accounts" : "Select all accounts"
                }
                checked={allSelected}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked
                      ? new Set(accounts.map((account) => account.id))
                      : new Set()
                  )
                }
              />
            </TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Dialogs</TableHead>
            <TableHead>Session</TableHead>
            <TableHead>Controls</TableHead>
          </TableRow>
        </TableHeader>
        <AccountsTableBody {...props} />
      </Table>
    </TableWrap>
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
    <TableRow className="align-top">
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
        <Badge tone={statusTone(accountStatus(account))}>
          {accountStatus(account)}
        </Badge>
      </TableCell>
      <TableCell>{account.dialog_count || 0}</TableCell>
      <TableCell className="font-mono text-xs">
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

  return (
    <>
      <strong>{label || account.session_name}</strong>
      {account.last_error ? (
        <p className="mt-1 text-xs text-destructive">{account.last_error}</p>
      ) : null}
    </>
  )
}

function AccountActions({
  account,
  guarded,
  refresh,
  flash,
  askDialog,
}: AccountActionProps) {
  return (
    <div className="flex flex-wrap gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => guarded(() => validateAccount(account, refresh, flash))}
      >
        Validate
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          guarded(() => fetchAccountDialogs(account, refresh, flash))
        }
      >
        Dialogs
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          guarded(() => renameAccount(account, refresh, flash, askDialog))
        }
      >
        Rename Label
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          guarded(() => renameSessionFile(account, refresh, flash, askDialog))
        }
      >
        Rename File
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() =>
          guarded(() => deleteLocalSession(account, refresh, flash, askDialog))
        }
      >
        Delete Local
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() =>
          guarded(() => logoutAccount(account, refresh, flash, askDialog))
        }
      >
        Logout
      </Button>
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
  flash: (message: string) => void
) {
  await api(`/api/accounts/${account.id}/validate`, { method: "POST" })
  flash("Session validated.")
  await refresh()
}

async function fetchAccountDialogs(
  account: Account,
  refresh: () => Promise<void>,
  flash: (message: string) => void
) {
  await api(`/api/accounts/${account.id}/dialogs/fetch?limit=500`, {
    method: "POST",
  })
  flash("Dialogs fetched.")
  await refresh()
}

async function renameAccount(
  account: Account,
  refresh: () => Promise<void>,
  flash: (message: string) => void,
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
  flash("Account renamed.")
  await refresh()
}

async function renameSessionFile(
  account: Account,
  refresh: () => Promise<void>,
  flash: (message: string) => void,
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
  flash("Session file renamed.")
  await refresh()
}

async function deleteLocalSession(
  account: Account,
  refresh: () => Promise<void>,
  flash: (message: string) => void,
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
  flash("Local session deleted.")
  await refresh()
}

async function logoutAccount(
  account: Account,
  refresh: () => Promise<void>,
  flash: (message: string) => void,
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
  flash("Account logged out.")
  await refresh()
}
