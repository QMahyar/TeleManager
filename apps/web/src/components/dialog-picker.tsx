import * as React from "react"

import { IconRefresh, IconSearch } from "@tabler/icons-react"

import { Button } from "../ui/button"
import { api } from "../lib/api"
import { dialogKind, dialogTarget } from "../lib/helpers"
import type { Account, TelegramDialog } from "../types"
import { Badge, EmptyState, Input, Select } from "./ui"

// Inline chat picker for the action builder. Self-contained: it fetches the
// chosen account's cached dialogs on open (live fetch on demand) and hands the
// chosen targets back, so the operator never leaves the Actions screen.
export function DialogPicker({
  accounts,
  defaultAccountId,
  onAdd,
  flash,
}: {
  accounts: Account[]
  defaultAccountId: string
  onAdd: (targets: string[]) => void
  flash: (message: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const readyAccounts = accounts.filter(
    (account) => account.authorized && !account.last_error
  )
  const [accountId, setAccountId] = React.useState(
    defaultAccountId || readyAccounts[0]?.id || ""
  )
  const [dialogs, setDialogs] = React.useState<TelegramDialog[]>([])
  const [search, setSearch] = React.useState("")
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState("")

  const loadCached = React.useCallback(async (id: string) => {
    if (!id) return
    setBusy(true)
    try {
      const payload = await api<{ dialogs: TelegramDialog[] }>(
        `/api/accounts/${id}/dialogs`
      )
      setDialogs(payload.dialogs || [])
      setStatus(
        payload.dialogs?.length
          ? ""
          : "No cached chats. Use Fetch Live to pull them from Telegram."
      )
    } catch (error) {
      setDialogs([])
      setStatus(error instanceof Error ? error.message : "Failed to load chats.")
    } finally {
      setBusy(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return undefined
    const task = window.setTimeout(() => loadCached(accountId), 0)
    return () => window.clearTimeout(task)
  }, [open, accountId, loadCached])

  async function fetchLive() {
    if (!accountId) return
    setBusy(true)
    setStatus("Fetching chats from Telegram…")
    try {
      const payload = await api<{ dialogs: TelegramDialog[] }>(
        `/api/accounts/${accountId}/dialogs/fetch?limit=500`,
        { method: "POST" }
      )
      setDialogs(payload.dialogs || [])
      setStatus(`Fetched ${payload.dialogs?.length || 0} chats.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Live fetch failed.")
    } finally {
      setBusy(false)
    }
  }

  const query = search.trim().toLowerCase()
  const filtered = query
    ? dialogs.filter((dialog) =>
        `${dialog.title} ${dialog.username || ""}`.toLowerCase().includes(query)
      )
    : dialogs

  function toggle(target: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(target)) next.delete(target)
      else next.add(target)
      return next
    })
  }

  function addPicked() {
    if (!picked.size) {
      flash("Tick one or more chats first.")
      return
    }
    onAdd([...picked])
    setPicked(new Set())
    setOpen(false)
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!readyAccounts.length}
      >
        <IconSearch /> Pick from chats
      </Button>
    )
  }

  return (
    <div className="space-y-2 border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="h-7 flex-1 text-xs"
          value={accountId}
          onChange={(event) => {
            setAccountId(event.target.value)
            setPicked(new Set())
          }}
        >
          {readyAccounts.length === 0 ? (
            <option value="">No ready accounts</option>
          ) : null}
          {readyAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label || account.session_name}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={busy}
          onClick={fetchLive}
          disabled={!accountId}
        >
          <IconRefresh /> Live
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <div className="relative">
        <IconSearch className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-7 pl-8 text-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats"
          autoComplete="off"
        />
      </div>

      <div className="max-h-56 space-y-1 overflow-auto">
        {filtered.length === 0 ? (
          <EmptyState
            title={dialogs.length ? "No chats match" : "No chats loaded"}
            detail={
              status ||
              "Pick an account and load its chats, then tick the ones to target."
            }
            className="px-4 py-6"
          />
        ) : (
          filtered.map((dialog) => {
            const target = dialogTarget(dialog)
            return (
              <label
                key={target}
                className="flex items-center gap-2 border border-border px-2 py-1.5 text-xs hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  checked={picked.has(target)}
                  onChange={() => toggle(target)}
                />
                <span className="min-w-0 flex-1 truncate">{dialog.title}</span>
                <Badge tone="border-border bg-muted/40 text-muted-foreground">
                  {dialogKind(dialog)}
                </Badge>
              </label>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">
          {picked.size} picked · {filtered.length} shown
        </span>
        <Button type="button" size="sm" onClick={addPicked} disabled={!picked.size}>
          Add {picked.size || ""} to targets
        </Button>
      </div>
    </div>
  )
}
