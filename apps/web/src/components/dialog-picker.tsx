import * as React from "react"

import { IconRefresh, IconSearch } from "@tabler/icons-react"

import { Button } from "../ui/button"
import { api } from "../lib/api"
import {
  dialogCompatibility,
  normalizeKind,
  type DialogKind,
} from "../lib/dialog-actions"
import { dialogKind, dialogTarget } from "../lib/dialog-resolver"
import { actionMeta } from "../lib/constants"
import type { Account, ActionType, Flash, TelegramDialog } from "../types"
import {
  Badge,
  EmptyState,
  ErrorState,
  Input,
  SectionLoader,
  Select,
} from "./ui"

// Filter buttons map a friendly label to the kinds they include.
const KIND_FILTERS: Array<{ id: string; label: string; kinds: Set<DialogKind> }> = [
  { id: "all", label: "All", kinds: new Set() },
  { id: "user", label: "Users", kinds: new Set(["personal"]) },
  { id: "group", label: "Groups", kinds: new Set(["group", "supergroup"]) },
  { id: "channel", label: "Channels", kinds: new Set(["channel"]) },
  { id: "bot", label: "Bots", kinds: new Set(["bot"]) },
]

// Inline chat picker for the action builder. Self-contained: it fetches the
// chosen account's cached dialogs on open (live fetch on demand) and hands the
// chosen targets back, so the operator never leaves the Actions screen. Chats
// that can't take the current action — or are already in the target list — are
// greyed and can't be ticked, so only valid targets are ever added.
export function DialogPicker({
  accounts,
  defaultAccountId,
  actionType,
  existingTargets,
  onAdd,
  flash,
}: {
  accounts: Account[]
  defaultAccountId: string
  actionType: ActionType
  existingTargets: Set<string>
  onAdd: (targets: string[]) => void
  flash: Flash
}) {
  const [open, setOpen] = React.useState(false)
  const readyAccounts = accounts.filter(
    (account) => account.authorized && !account.last_error
  )
  const firstReadyId = readyAccounts[0]?.id
  // Only explicit user picks live in state; the effective account falls back to
  // the action's account, then the first ready one. Deriving (instead of syncing
  // state in an effect) avoids cascading renders.
  const [accountId, setAccountId] = React.useState("")
  const effectiveId = accountId || defaultAccountId || firstReadyId || ""
  const [dialogs, setDialogs] = React.useState<TelegramDialog[]>([])
  const [search, setSearch] = React.useState("")
  const [kindFilter, setKindFilter] = React.useState("all")
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState("")
  const [error, setError] = React.useState("")
  // Monotonic token so out-of-order responses (rapid account switches, or a Live
  // fetch overlapping a cached load) never overwrite the latest request's result.
  const requestToken = React.useRef(0)

  const loadCached = React.useCallback(async (id: string) => {
    if (!id) return
    const token = ++requestToken.current
    setBusy(true)
    setError("")
    try {
      const payload = await api<{ dialogs: TelegramDialog[] }>(
        `/api/accounts/${id}/dialogs`
      )
      if (token !== requestToken.current) return
      setDialogs(payload.dialogs || [])
      setStatus(
        payload.dialogs?.length
          ? ""
          : "No cached chats. Use Fetch Live to pull them from Telegram."
      )
    } catch (err) {
      if (token !== requestToken.current) return
      setDialogs([])
      setError(err instanceof Error ? err.message : "Failed to load chats.")
    } finally {
      if (token === requestToken.current) setBusy(false)
    }
  }, [])

  // Load the effective account's cached dialogs when the picker opens (or when
  // the effective account changes). Accounts load asynchronously and the action's
  // account may be chosen after this component first renders, so this reacts to
  // effectiveId rather than reading it once at mount.
  React.useEffect(() => {
    if (!open) return undefined
    const task = window.setTimeout(() => loadCached(effectiveId), 0)
    return () => window.clearTimeout(task)
  }, [open, effectiveId, loadCached])

  async function fetchLive() {
    if (!effectiveId) return
    const token = ++requestToken.current
    setBusy(true)
    setError("")
    setStatus("Fetching chats from Telegram…")
    try {
      const payload = await api<{ dialogs: TelegramDialog[] }>(
        `/api/accounts/${effectiveId}/dialogs/fetch?limit=500`,
        { method: "POST" }
      )
      if (token !== requestToken.current) return
      setDialogs(payload.dialogs || [])
      setStatus(`Fetched ${payload.dialogs?.length || 0} chats.`)
    } catch (err) {
      if (token !== requestToken.current) return
      setError(err instanceof Error ? err.message : "Live fetch failed.")
      setStatus("")
    } finally {
      if (token === requestToken.current) setBusy(false)
    }
  }

  const query = search.trim().toLowerCase()
  const activeKinds = KIND_FILTERS.find((item) => item.id === kindFilter)?.kinds
  // Annotate every visible dialog once: its target, whether the current action
  // can use it, and whether it is already in the target list.
  const rows = dialogs
    .filter((dialog) =>
      query
        ? `${dialog.title} ${dialog.username || ""}`.toLowerCase().includes(query)
        : true
    )
    .filter((dialog) =>
      activeKinds && activeKinds.size
        ? activeKinds.has(normalizeKind(dialog))
        : true
    )
    .map((dialog) => {
      const target = dialogTarget(dialog)
      const { compatible, reason } = dialogCompatibility(dialog, actionType)
      return {
        dialog,
        target,
        compatible,
        reason,
        added: existingTargets.has(target),
      }
    })

  const compatibleCount = rows.filter((row) => row.compatible && !row.added).length
  const addedCount = rows.filter((row) => row.added).length
  const incompatibleCount = rows.filter((row) => !row.compatible).length

  function toggle(target: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(target)) next.delete(target)
      else next.add(target)
      return next
    })
  }

  function selectCompatible() {
    const targets = rows
      .filter((row) => row.compatible && !row.added)
      .map((row) => row.target)
    if (!targets.length) {
      flash("No compatible chats to select here.")
      return
    }
    setPicked((current) => new Set([...current, ...targets]))
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
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="h-7 flex-1 text-xs"
          value={effectiveId}
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
          disabled={!effectiveId}
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

      <div className="flex flex-wrap gap-1">
        {KIND_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setKindFilter(item.id)}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
              kindFilter === item.id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-border bg-muted/10 p-1">
        {busy && rows.length === 0 ? (
          <SectionLoader label="Loading chats…" className="px-4 py-6" />
        ) : error ? (
          <ErrorState
            title="Couldn't load chats"
            detail={error}
            onRetry={() => loadCached(effectiveId)}
            retryLabel="Retry"
            className="px-4 py-6"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={dialogs.length ? "No chats match" : "No chats loaded"}
            detail={
              dialogs.length
                ? "No loaded chat matches the current search and type filter."
                : status ||
                  "Pick an account and load its chats, then tick the ones to target."
            }
            className="px-4 py-6"
          />
        ) : (
          rows.map(({ dialog, target, compatible, reason, added }) => {
            const disabled = !compatible || added
            return (
              <label
                key={target}
                title={added ? "Already in the target list" : reason}
                className={`flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs ${
                  disabled ? "opacity-50" : "hover:border-border hover:bg-muted/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={added || picked.has(target)}
                  disabled={disabled}
                  onChange={() => toggle(target)}
                />
                <span className="min-w-0 flex-1 truncate">{dialog.title}</span>
                {!compatible && !added ? (
                  <Badge tone="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    skipped
                  </Badge>
                ) : null}
                {added ? (
                  <Badge tone="text-primary border-primary/30 bg-primary/10">
                    added
                  </Badge>
                ) : null}
                <Badge tone="border-border bg-muted/40 text-muted-foreground">
                  {dialogKind(dialog)}
                </Badge>
              </label>
            )
          })
        )}
      </div>

      {incompatibleCount && !busy && !error ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {incompatibleCount} greyed chat(s) can&apos;t take “
          {actionMeta[actionType].label}” and can&apos;t be ticked. Hover one to
          see why.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">
          {compatibleCount} compatible
          {addedCount ? ` · ${addedCount} added` : ""} · {rows.length} shown
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectCompatible}
            disabled={!compatibleCount}
          >
            Select compatible
          </Button>
          <Button type="button" size="sm" onClick={addPicked} disabled={!picked.size}>
            Add {picked.size || ""} to targets
          </Button>
        </div>
      </div>
    </div>
  )
}
