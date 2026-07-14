import * as React from "react"

import { IconArrowsLeftRight } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import {
  Badge,
  Callout,
  EmptyState,
  Field,
  Panel,
  SectionTitle,
  Select,
} from "../../components/ui"
import { api } from "../../lib/api"
import { startQueueRun } from "../../lib/queue-run"
import {
  buildSyncSteps,
  syncDiff,
  syncOpCount,
  type SyncOptions,
} from "../../lib/sync"
import type { Account, Flash, QueueStep, TelegramDialog } from "../../types"

// Queue hard limits (mirrors ActionQueueRequest): at most 20 steps, 250 ops.
const MAX_STEPS = 20
const MAX_OPS = 250

type AccountSummary = {
  accountId: string
  label: string
  dialogCount: number
  archiveOps: number
  muteOps: number
  total: number
}

type SyncPlan = {
  steps: QueueStep[]
  perAccount: AccountSummary[]
  opCount: number
}

function accountLabel(account: Account): string {
  return account.label || account.session_name || account.id
}

async function fetchCachedDialogs(accountId: string): Promise<TelegramDialog[]> {
  const payload = await api<{ dialogs: TelegramDialog[] }>(
    `/api/accounts/${accountId}/dialogs`
  )
  return payload.dialogs || []
}

export function SyncPanel({
  accounts,
  guarded,
  flash,
  pollQueueRun,
}: {
  accounts: Account[]
  guarded: (work: () => Promise<void>) => Promise<void>
  flash: Flash
  pollQueueRun: (runId: string) => Promise<void>
}) {
  const authorized = accounts.filter((account) => account.authorized)
  const [sourceId, setSourceId] = React.useState("")
  const [targetIds, setTargetIds] = React.useState<Set<string>>(new Set())
  const [options, setOptions] = React.useState<SyncOptions>({
    archive: true,
    mute: true,
  })
  const [plan, setPlan] = React.useState<SyncPlan | null>(null)

  const targetAccounts = authorized.filter((account) => account.id !== sourceId)
  const overLimit = plan
    ? plan.steps.length > MAX_STEPS || plan.opCount > MAX_OPS
    : false

  function toggleTarget(id: string) {
    setTargetIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setPlan(null)
  }

  async function preview() {
    setPlan(null)
    if (!sourceId) return flash("Pick a source account.", "error")
    const targets = [...targetIds].filter((id) => id !== sourceId)
    if (!targets.length) return flash("Pick at least one target account.", "error")
    if (!options.archive && !options.mute) {
      return flash("Pick at least one state to sync.", "error")
    }
    await guarded(async () => {
      const [source, ...targetDialogs] = await Promise.all([
        fetchCachedDialogs(sourceId),
        ...targets.map(fetchCachedDialogs),
      ])
      const perAccount: AccountSummary[] = []
      const steps: QueueStep[] = []
      targets.forEach((accountId, index) => {
        const dialogs = targetDialogs[index]
        const ops = syncDiff(source, dialogs, options)
        steps.push(
          ...buildSyncSteps(source, [{ accountId, dialogs }], options)
        )
        const account = accounts.find((item) => item.id === accountId)
        perAccount.push({
          accountId,
          label: account ? accountLabel(account) : accountId,
          dialogCount: dialogs.length,
          archiveOps: ops.filter((op) => op.action_type.includes("archive")).length,
          muteOps: ops.filter((op) => op.action_type.includes("mute")).length,
          total: ops.length,
        })
      })
      setPlan({ steps, perAccount, opCount: syncOpCount(steps) })
    })
  }

  async function run() {
    if (!plan || !plan.steps.length || overLimit) return
    await guarded(async () => {
      const { run_id } = await startQueueRun({ steps: plan.steps })
      flash(`Sync queued: ${plan.opCount} operations.`, "success")
      setPlan(null)
      await pollQueueRun(run_id)
    })
  }

  if (authorized.length < 2) {
    return (
      <div className="border-t border-border pt-4">
        <EmptyState
          icon={IconArrowsLeftRight}
          title="Need two logged-in accounts"
          detail="Sync copies archive and mute state from one account's chats onto another's. Log in at least two accounts to use it."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <SectionTitle
        kicker="Multi-account"
        title="Sync chat state"
        detail="Copy archive and mute state from a source account onto the matching chats (same @username or id) of one or more targets. Only chats both accounts share are touched; it runs through the guarded action queue."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Source account" hint="The account whose archive/mute state is copied FROM. Targets are changed to match it.">
          <Select
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value)
              setTargetIds((current) => {
                const next = new Set(current)
                next.delete(event.target.value)
                return next
              })
              setPlan(null)
            }}
          >
            <option value="">Choose source…</option>
            {authorized.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-2">
          <p className="type-label text-muted-foreground">States to sync</p>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background/70 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.archive}
                onChange={(event) => {
                  setOptions((o) => ({ ...o, archive: event.target.checked }))
                  setPlan(null)
                }}
              />
              Archive / unarchive
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.mute}
                onChange={(event) => {
                  setOptions((o) => ({ ...o, mute: event.target.checked }))
                  setPlan(null)
                }}
              />
              Mute / unmute
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="type-label text-muted-foreground">Target accounts</p>
        {sourceId ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {targetAccounts.map((account) => (
              <label
                key={account.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background/70 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={targetIds.has(account.id)}
                  onChange={() => toggleTarget(account.id)}
                />
                <span className="truncate">{accountLabel(account)}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pick a source account first.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={preview} disabled={!sourceId}>
          Preview sync
        </Button>
        <Button onClick={run} disabled={!plan || !plan.steps.length || overLimit}>
          Run sync{plan?.steps.length ? ` · ${plan.opCount} ops` : ""}
        </Button>
      </div>

      {plan ? <SyncPreview plan={plan} overLimit={overLimit} /> : null}
    </div>
  )
}

function SyncPreview({ plan, overLimit }: { plan: SyncPlan; overLimit: boolean }) {
  if (!plan.steps.length) {
    return (
      <Callout tone="info">
        Everything already matches — no changes needed. (Fetch fresh dialogs on
        both accounts first if you expected differences.)
      </Callout>
    )
  }
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {plan.opCount} operation{plan.opCount === 1 ? "" : "s"} across{" "}
          {plan.perAccount.filter((account) => account.total > 0).length} account(s)
        </p>
        <Badge tone="border-border bg-muted/40 text-muted-foreground">
          {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"}
        </Badge>
      </div>
      {overLimit ? (
        <Callout tone="danger">
          This sync is too large for one run (max {MAX_STEPS} steps / {MAX_OPS}{" "}
          operations). Sync fewer accounts or states at once.
        </Callout>
      ) : null}
      <ul className="space-y-1.5">
        {plan.perAccount.map((account) => (
          <li
            key={account.accountId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="truncate font-medium text-foreground">
              {account.label}
            </span>
            <span className="flex gap-1.5">
              {account.dialogCount === 0 ? (
                <Badge tone="border-destructive/30 bg-destructive/10 text-destructive">
                  no cached dialogs
                </Badge>
              ) : account.total === 0 ? (
                <Badge tone="border-border bg-muted/40 text-muted-foreground">
                  in sync
                </Badge>
              ) : (
                <>
                  {account.archiveOps ? (
                    <Badge tone="border-primary/30 bg-primary/10 text-primary-text">
                      {account.archiveOps} archive
                    </Badge>
                  ) : null}
                  {account.muteOps ? (
                    <Badge tone="border-primary/30 bg-primary/10 text-primary-text">
                      {account.muteOps} mute
                    </Badge>
                  ) : null}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
