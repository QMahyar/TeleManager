import * as React from "react"

import { IconRefresh, IconTrash } from "@tabler/icons-react"

import { Button } from "../ui/button"
import { api } from "../lib/api"
import { humanTime } from "../lib/helpers"
import type { Account, AskDialog, Schedule, ScheduledInspect } from "../types"
import { Badge, EmptyState, Field, Input, Panel, Select, StepHeading } from "./ui"

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
  flash: (message: string) => void
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
    flash(`Cleared ${payload.cleared} scheduled message(s).`)
    await fetchScheduled()
  }

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={<IconRefresh />}
        title="Inspect Telegram's scheduled messages"
        detail="Telegram stores scheduled messages per chat. Pick an account and a chat to see what is actually queued on Telegram's servers, and clear any you don't want."
      />

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
          <IconRefresh /> Fetch
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
        <ScheduledResult
          result={result}
          selected={selected}
          toggle={toggle}
          guarded={guarded}
          clear={clear}
        />
      ) : null}
    </Panel>
  )
}

function ScheduledResult({
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
            className="flex items-center gap-3 border border-border p-2 text-sm"
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
