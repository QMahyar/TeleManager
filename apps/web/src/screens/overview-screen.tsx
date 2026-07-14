import type * as React from "react"

import {
  IconArrowRight,
  IconBolt,
  IconPlayerPause,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react"

import { Avatar } from "../components/avatar"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Badge, SignalDot, StatCard, type SignalTone } from "../components/ui"
import { accountStatus, queueRunProgress, relTime, splitTargets } from "../lib/helpers"
import { canPauseRun, runPhase } from "../lib/run-lifecycle"
import type {
  Account,
  ActivityEvent,
  QueueRun,
  View,
} from "../types"
import type { AppScreenProps } from "./screen-props"

type OverviewScreenProps = AppScreenProps & { activity: ActivityEvent[] }

// The Overview dashboard — the default landing surface. It's an at-a-glance
// read-only assembly of state the other screens own: fleet totals, the live
// run, the audit tail, and one-tap jumps into the real workflows. It never
// mutates Telegram state itself; every commit lives behind its own screen.
export function OverviewScreen(props: OverviewScreenProps) {
  const { accounts, metrics, activeRun, activity, setView } = props
  const readyCount = metrics.ready
  // The staged batch: chats (targets) × accounts the next action fans out to.
  const stagedChats = splitTargets(props.actionDraft.target).length
  const stagedAccounts = props.actionAccountIds.size

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Accounts"
          value={accounts.length}
          detail={`${readyCount} ready · ${metrics.attention} needs attention`}
        />
        <StatCard
          label="Sessions ready"
          value={readyCount}
          detail="authorized & healthy"
          primary
        />
        <StatCard
          label="Known dialogs"
          value={metrics.knownDialogs.toLocaleString()}
          detail="cached locally across accounts"
        />
        <StatCard
          label="Staged chats"
          value={stagedChats}
          detail={
            stagedChats
              ? `across ${stagedAccounts} account${stagedAccounts === 1 ? "" : "s"}`
              : "nothing staged"
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <QueuePanel
          activeRun={activeRun}
          stagedChats={stagedChats}
          stagedAccounts={stagedAccounts}
          setView={setView}
          onPause={props.pauseActiveRun}
          onCancel={props.cancelActiveRun}
        />
        <RecentActivity activity={activity} setView={setView} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FleetPanel accounts={accounts} setView={setView} />
        <QuickActions
          onBuildAction={() => setView("actions")}
          onFetchDialogs={() => setView("dialogs")}
          onAddAccount={() => {
            props.setAccountsTab("login")
            setView("accounts")
          }}
          onValidate={() => setView("accounts")}
        />
      </div>
    </div>
  )
}

// The one saturated focal panel: the live queue if something is running,
// otherwise the staged-but-idle queue, otherwise an empty prompt. Mirrors the
// footer pulse but with the room to show progress + lifecycle controls.
function QueuePanel({
  activeRun,
  stagedChats,
  stagedAccounts,
  setView,
  onPause,
  onCancel,
}: {
  activeRun: QueueRun | null
  stagedChats: number
  stagedAccounts: number
  setView: (view: View) => void
  onPause: () => Promise<void>
  onCancel: () => Promise<void>
}) {
  if (activeRun) {
    const { completedCount, operationCount, failedCount, progress } =
      queueRunProgress(activeRun)
    const phase = runPhase(activeRun)
    const running = phase === "running"

    return (
      <Card className="hero-run space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="type-eyebrow flex items-center gap-2 text-primary">
              <SignalDot tone={running ? "live" : "attention"} />
              Live
            </p>
            <h2 className="type-heading mt-1.5 text-foreground">
              Queue {running ? "running" : phase}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {activeRun.action_type
                ? `Running ${activeRun.action_type.replace(/_/g, " ")}`
                : "Processing staged operations"}
            </p>
          </div>
          <Badge tone="border-primary/30 bg-primary/10 text-primary">
            {running ? "Moving" : phase}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
            <span>
              {completedCount}/{operationCount} done
              {failedCount ? ` · ${failedCount} failed` : " · 0 failed"}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full w-full origin-left rounded-full bg-sunset transition-transform"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPauseRun(activeRun) ? (
            <Button variant="outline" size="sm" onClick={() => void onPause()}>
              <IconPlayerPause />
              Pause
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void onCancel()}>
            <IconX />
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => setView("actions")}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open Actions <IconArrowRight className="size-3.5" />
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <IconBolt className="size-4" />
        </span>
        <h2 className="type-heading text-foreground">Batch</h2>
      </div>
      {stagedChats ? (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{stagedChats}</span> chat
            {stagedChats === 1 ? "" : "s"} staged across{" "}
            <span className="font-mono text-foreground">{stagedAccounts}</span>{" "}
            account{stagedAccounts === 1 ? "" : "s"}, ready to run under the safety
            guards.
          </p>
          <Button
            size="comfortable"
            className="w-full"
            onClick={() => setView("actions")}
          >
            Review &amp; run batch <IconArrowRight />
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Nothing staged right now. Stage chats from Dialogs or build an action
            to get started.
          </p>
          <Button
            variant="outline"
            size="comfortable"
            className="w-full"
            onClick={() => setView("actions")}
          >
            Build an action <IconArrowRight />
          </Button>
        </>
      )}
    </Card>
  )
}

function RecentActivity({
  activity,
  setView,
}: {
  activity: ActivityEvent[]
  setView: (view: View) => void
}) {
  const recent = activity.slice(0, 5)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-heading text-foreground">Recent activity</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Logged locally to events.jsonl
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setView("activity")}>
          View all
        </Button>
      </div>
      {recent.length ? (
        <ul className="space-y-3">
          {recent.map((entry, index) => (
            <li key={entry.id || index} className="flex items-start gap-3">
              <Badge tone="border-primary/20 bg-primary/10 text-primary">
                {(entry.event_type || "event").replace(/_/g, " ")}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {entry.title ||
                    (entry.event_type || "event").replace(/_/g, " ")}
                </p>
                <p className="font-mono text-[0.7rem] text-muted-foreground">
                  {relTime(entry.created_at) || "just now"}
                  {entry.account_label ? ` · ${entry.account_label}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No activity yet. Validations, queue runs and dialog fetches will show
          up here.
        </p>
      )}
    </Card>
  )
}

function FleetPanel({
  accounts,
  setView,
}: {
  accounts: Account[]
  setView: (view: View) => void
}) {
  const shown = accounts.slice(0, 5)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-heading text-foreground">Fleet</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your logged-in accounts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setView("accounts")}>
          Manage
        </Button>
      </div>
      {shown.length ? (
        <ul className="space-y-2.5">
          {shown.map((account) => (
            <FleetRow key={account.id} account={account} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No sessions yet. Add or import a Telegram session to begin.
        </p>
      )}
    </Card>
  )
}

function fleetTone(status: string): SignalTone {
  if (status === "ready") return "ready"
  if (status === "error") return "error"
  if (status === "code sent" || status === "needs 2FA") return "attention"
  return "idle"
}

function FleetRow({ account }: { account: Account }) {
  const status = accountStatus(account)
  const display = account.label || account.session_name

  return (
    <li className="flex items-center gap-3">
      <Avatar name={display} seed={account.id} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{display}</p>
        <p className="truncate font-mono text-[0.7rem] text-muted-foreground">
          {account.username ? `@${account.username} · ` : ""}
          {account.session_name}.session
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
        <SignalDot tone={fleetTone(status)} />
        {status}
      </span>
    </li>
  )
}

function QuickActions({
  onBuildAction,
  onFetchDialogs,
  onAddAccount,
  onValidate,
}: {
  onBuildAction: () => void
  onFetchDialogs: () => void
  onAddAccount: () => void
  onValidate: () => void
}) {
  const tiles: Array<{ label: string; icon: React.ElementType; onClick: () => void }> = [
    { label: "Build an action", icon: IconBolt, onClick: onBuildAction },
    { label: "Fetch dialogs", icon: IconSearch, onClick: onFetchDialogs },
    { label: "Add account", icon: IconPlus, onClick: onAddAccount },
    { label: "Validate fleet", icon: IconRefresh, onClick: onValidate },
  ]

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="type-heading text-foreground">Quick actions</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Build, fetch, add or validate
        </p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <button
              key={tile.label}
              type="button"
              onClick={tile.onClick}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-background/40 px-3.5 py-3 text-left text-sm font-medium text-foreground transition-transform hover:-translate-y-0.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              {tile.label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
