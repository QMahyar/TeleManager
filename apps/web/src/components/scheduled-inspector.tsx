import * as React from "react"

import {
  IconChevronDown,
  IconChevronRight,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
import { api } from "../lib/api"
import { humanTime } from "../lib/helpers"
import type {
  Account,
  AskDialog,
  Flash,
  Schedule,
  ScheduledAccountOverview,
  ScheduledChat,
  ScheduledInspect,
  ScheduledOverview,
} from "../types"
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  Skeleton,
  StepHeading,
} from "./ui"

type OwnerFilter = "all" | "owned" | "manual"

export function ScheduledInspector({
  accounts,
  schedules,
  guarded,
  flash,
  askDialog,
}: {
  accounts: Account[]
  schedules: Schedule[]
  guarded: (work: () => Promise<void>) => Promise<void>
  flash: Flash
  askDialog: AskDialog
}) {
  const [overview, setOverview] = React.useState<ScheduledOverview | null>(null)
  const [scanning, setScanning] = React.useState(false)
  const [filter, setFilter] = React.useState<OwnerFilter>("all")

  // Auto-scan when the inspector first mounts (i.e. the tab is opened). Uses a
  // local busy flag rather than `guarded` so a background scan never gets dropped
  // by an unrelated in-flight action and never blocks one.
  const scan = React.useCallback(async () => {
    setScanning(true)
    try {
      const payload = await api<ScheduledOverview>("/api/scheduled/overview")
      setOverview(payload)
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Could not scan scheduled messages.",
        "error"
      )
    } finally {
      setScanning(false)
    }
  }, [flash])

  // Defer the initial scan a tick so the first paint shows the panel shell, then
  // the skeleton — calling it synchronously here would setState mid-effect.
  React.useEffect(() => {
    const task = window.setTimeout(() => void scan(), 0)
    return () => window.clearTimeout(task)
  }, [scan])

  async function clearChat(accountId: string, target: string, ids: number[] | null) {
    const account = overview?.accounts.find((item) => item.account_id === accountId)
    const chat = account?.chats.find((item) => item.target === target)
    const count = ids ? ids.length : chat?.count || 0
    const confirmed = await askDialog({
      title: ids ? "Delete selected scheduled messages?" : "Clear scheduled messages?",
      description: `This permanently removes ${count} scheduled message(s) from ${target} on Telegram's servers. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return
    const payload = await api<{ cleared: number }>(
      `/api/accounts/${accountId}/scheduled/clear`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, ids }),
      }
    )
    flash(`Cleared ${payload.cleared} scheduled message(s).`, "success")
    await scan()
  }

  const accountsWithChats =
    overview?.accounts.filter(
      (account) => account.chats.length > 0 || account.error
    ) || []
  const totalScheduled = accountsWithChats.reduce(
    (sum, account) =>
      sum + account.chats.reduce((chatSum, chat) => chatSum + chat.count, 0),
    0
  )

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={<IconRefresh />}
        title="Scheduled messages across your accounts"
        detail="Automatically scans every chat your schedules target and shows what Telegram actually has queued there. No need to type an account or chat."
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void scan()}
            disabled={scanning}
          >
            <IconRefresh className={scanning ? "animate-spin" : undefined} />
            Rescan
          </Button>
        }
      />

      {overview && accountsWithChats.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {totalScheduled} scheduled message(s) across {accountsWithChats.length}{" "}
            account(s) · scanned {humanTime(overview.generated_at)}
          </span>
          <div className="w-40">
            <Select
              value={filter}
              onChange={(event) => setFilter(event.target.value as OwnerFilter)}
              aria-label="Filter scheduled messages"
            >
              <option value="all">All messages</option>
              <option value="owned">TeleManager only</option>
              <option value="manual">Manual only</option>
            </Select>
          </div>
        </div>
      ) : null}

      {scanning && !overview ? (
        <ScanSkeleton />
      ) : accountsWithChats.length ? (
        <div className="space-y-2">
          {accountsWithChats.map((account) => (
            <AccountOverviewCard
              key={account.account_id}
              account={account}
              filter={filter}
              guarded={guarded}
              clearChat={clearChat}
            />
          ))}
        </div>
      ) : overview ? (
        <EmptyState
          icon={IconRefresh}
          title="Nothing scheduled"
          detail={
            overview.accounts.length
              ? `No scheduled messages found across ${overview.accounts.length} account(s) with schedules. Create a text schedule, or check another chat below.`
              : "No active schedules reference any chats yet. Build a schedule on the Actions page, or check a specific chat below."
          }
        />
      ) : null}

      <ManualInspect
        accounts={accounts}
        schedules={schedules}
        guarded={guarded}
        flash={flash}
        askDialog={askDialog}
      />
    </Panel>
  )
}

function ScanSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Scanning scheduled messages">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}

function AccountOverviewCard({
  account,
  filter,
  guarded,
  clearChat,
}: {
  account: ScheduledAccountOverview
  filter: OwnerFilter
  guarded: (work: () => Promise<void>) => Promise<void>
  clearChat: (accountId: string, target: string, ids: number[] | null) => Promise<void>
}) {
  const [open, setOpen] = React.useState(true)
  const totalForAccount = account.chats.reduce((sum, chat) => sum + chat.count, 0)

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-t-lg px-3 py-2 text-left hover:bg-muted/30"
      >
        {open ? (
          <IconChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <IconChevronRight className="size-4 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {account.label}
        </span>
        {account.error ? (
          <Badge tone="border-destructive/30 bg-destructive/10 text-destructive">
            unreachable
          </Badge>
        ) : (
          <Badge tone="border-border bg-muted/40 text-muted-foreground">
            {totalForAccount} scheduled · {account.chats.length} chat(s)
          </Badge>
        )}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border p-2">
          {account.error ? (
            <p className="px-1 py-2 text-xs text-destructive">{account.error}</p>
          ) : (
            account.chats.map((chat) => (
              <ChatScheduleCard
                key={chat.target}
                accountId={account.account_id}
                chat={chat}
                filter={filter}
                guarded={guarded}
                clearChat={clearChat}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function ChatScheduleCard({
  accountId,
  chat,
  filter,
  guarded,
  clearChat,
}: {
  accountId: string
  chat: ScheduledChat
  filter: OwnerFilter
  guarded: (work: () => Promise<void>) => Promise<void>
  clearChat: (accountId: string, target: string, ids: number[] | null) => Promise<void>
}) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  const visibleMessages = chat.messages.filter((message) => {
    if (filter === "owned") return message.owned
    if (filter === "manual") return !message.owned
    return true
  })

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!visibleMessages.length) return null

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/10 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs">{chat.target}</span>
          <Badge tone="border-border bg-muted/40 text-muted-foreground">
            {chat.count}
          </Badge>
          {chat.owned_count > 0 ? (
            <Badge tone="text-primary border-primary/30 bg-primary/10">
              {chat.owned_count} ours
            </Badge>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.size}
            onClick={() => guarded(() => clearChat(accountId, chat.target, [...selected]))}
          >
            <IconTrash /> Delete ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => guarded(() => clearChat(accountId, chat.target, null))}
          >
            <IconTrash /> Clear all
          </Button>
        </div>
      </div>
      <div className="max-h-64 space-y-1 overflow-auto">
        {visibleMessages.map((message) => (
          <label
            key={message.id}
            className="flex items-center gap-3 rounded-md border border-border bg-background p-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(message.id)}
              onChange={() => toggle(message.id)}
            />
            <span className="w-36 shrink-0 text-xs text-muted-foreground">
              {humanTime(message.date || undefined)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {message.text || <em className="text-muted-foreground">(no text)</em>}
            </span>
            {message.owned ? (
              <Badge tone="text-primary border-primary/30 bg-primary/10">
                TeleManager
              </Badge>
            ) : (
              <Badge tone="border-border bg-muted/40 text-muted-foreground">
                manual
              </Badge>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

// Advanced fallback: Telegram has no global "all scheduled" API, so a chat that no
// active schedule references won't appear in the auto scan. This collapsible block
// keeps the original "pick an account + chat" lookup for those one-off checks.
function ManualInspect({
  accounts,
  schedules,
  guarded,
  flash,
  askDialog,
}: {
  accounts: Account[]
  schedules: Schedule[]
  guarded: (work: () => Promise<void>) => Promise<void>
  flash: Flash
  askDialog: AskDialog
}) {
  const readyAccounts = accounts.filter(
    (account) => account.authorized && !account.last_error
  )
  const [accountId, setAccountId] = React.useState("")
  const [target, setTarget] = React.useState("")
  const [result, setResult] = React.useState<ScheduledInspect | null>(null)
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  const suggestions = React.useMemo(
    () => suggestedChats(schedules, accountId),
    [schedules, accountId]
  )

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function fetchScheduled() {
    if (!accountId) return flash("Select an account first.")
    if (!target.trim()) return flash("Enter a chat (username, link, or numeric id).")
    const payload = await api<ScheduledInspect>(
      `/api/accounts/${accountId}/scheduled?target=${encodeURIComponent(target.trim())}`
    )
    setResult(payload)
    setSelected(new Set())
    flash(`Found ${payload.count} scheduled message(s).`)
  }

  async function clear(ids: number[] | null) {
    if (!result) return
    const count = ids ? ids.length : result.count
    const confirmed = await askDialog({
      title: ids ? "Delete selected scheduled messages?" : "Clear all scheduled messages?",
      description: `This permanently removes ${count} scheduled message(s) from ${result.target} on Telegram's servers. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return
    const payload = await api<{ cleared: number }>(
      `/api/accounts/${accountId}/scheduled/clear`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: result.target, ids }),
      }
    )
    flash(`Cleared ${payload.cleared} scheduled message(s).`, "success")
    await fetchScheduled()
  }

  return (
    <details className="rounded-lg border border-border bg-muted/10">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground">
        Check another chat
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          Look up a specific chat that your schedules don't already target (Telegram
          has no way to list every scheduled chat automatically).
        </p>
        <div className="grid gap-3 lg:grid-cols-[16rem_1fr_auto] lg:items-end">
          <Field label="Account">
            <Select
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value)
                setResult(null)
              }}
            >
              <option value="">Select account…</option>
              {readyAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label || account.session_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chat">
            <Input
              value={target}
              maxLength={500}
              autoComplete="off"
              placeholder="@chat, t.me link, or numeric id"
              list="scheduled-chat-suggestions"
              onChange={(event) => setTarget(event.target.value)}
            />
            <datalist id="scheduled-chat-suggestions">
              {suggestions.map((chat) => (
                <option key={chat} value={chat} />
              ))}
            </datalist>
          </Field>
          <Button onClick={() => guarded(fetchScheduled)}>
            <IconSearch /> Check
          </Button>
        </div>

        {suggestions.length ? (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">From your schedules:</span>
            {suggestions.map((chat) => (
              <button
                key={chat}
                type="button"
                className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/40"
                onClick={() => setTarget(chat)}
              >
                {chat}
              </button>
            ))}
          </div>
        ) : null}

        {result ? (
          <ManualResult
            result={result}
            selected={selected}
            toggle={toggle}
            guarded={guarded}
            clear={clear}
          />
        ) : null}
      </div>
    </details>
  )
}

function ManualResult({
  result,
  selected,
  toggle,
  guarded,
  clear,
}: {
  result: ScheduledInspect
  selected: Set<number>
  toggle: (id: number) => void
  guarded: (work: () => Promise<void>) => Promise<void>
  clear: (ids: number[] | null) => Promise<void>
}) {
  if (!result.count) {
    return (
      <EmptyState
        title="Nothing scheduled here"
        detail={`Telegram has no scheduled messages in ${result.target} for this account.`}
        className="px-4 py-8"
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {result.count} scheduled in <span className="font-mono">{result.target}</span>
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.size}
            onClick={() => guarded(() => clear([...selected]))}
          >
            <IconTrash /> Delete Selected ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => guarded(() => clear(null))}
          >
            <IconTrash /> Clear All
          </Button>
        </div>
      </div>
      <div className="max-h-80 space-y-1 overflow-auto">
        {result.messages.map((message) => (
          <label
            key={message.id}
            className="flex items-center gap-3 rounded-md border border-border p-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(message.id)}
              onChange={() => toggle(message.id)}
            />
            <span className="w-40 shrink-0 text-xs text-muted-foreground">
              {humanTime(message.date || undefined)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {message.text || <em className="text-muted-foreground">(no text)</em>}
            </span>
            {message.owned ? (
              <Badge tone="text-primary border-primary/30 bg-primary/10">
                TeleManager
              </Badge>
            ) : (
              <Badge tone="border-border bg-muted/40 text-muted-foreground">
                manual
              </Badge>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

// Chats referenced by this account's native schedules, for quick selection.
function suggestedChats(schedules: Schedule[], accountId: string): string[] {
  if (!accountId) return []
  const chats = new Set<string>()
  for (const schedule of schedules) {
    for (const step of schedule.queue.steps || []) {
      if (!step.account_ids.includes(accountId)) continue
      for (const chatTarget of step.targets) chats.add(chatTarget)
    }
  }
  return [...chats].slice(0, 20)
}
