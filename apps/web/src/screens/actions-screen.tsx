import * as React from "react"

import {
  IconAlertTriangle,
  IconLoader2,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "../ui/button"

import { ActionFields } from "../components/action-fields"
import { QueueTable } from "../components/queue-table"
import { RunHistory } from "../components/run-history"
import { SafetyEditor } from "../components/safety-editor"
import { TargetComposer } from "../components/target-composer"
import { Badge, EmptyState, Field, Panel, Select } from "../components/ui"
import { api } from "../lib/api"
import {
  carryFieldValues,
  getActionSchema,
  isActionFormValid,
} from "../lib/action-schema"
import { actionMeta, categoryLabels, categoryOrder } from "../lib/constants"
import { accountStatus, splitTargets, statusTone } from "../lib/helpers"
import { partitionTargets } from "../lib/targeting"
import type { ActionType, QueueRun } from "../types"
import type { ActionsScreenProps } from "./screen-props"

const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "canceled",
  "interrupted",
  "flood_wait",
])
const SINGLE_TARGET_ACTIONS = new Set<ActionType>([
  "forward_message",
  "edit_message",
  "pin_message",
  "unpin_message",
  "download_media",
])

const groupedActions = categoryOrder.map((category) => ({
  category,
  label: categoryLabels[category],
  actions: (
    Object.entries(actionMeta) as [
      ActionType,
      (typeof actionMeta)[ActionType],
    ][]
  ).filter(([, meta]) => meta.category === category),
}))

export function ActionsScreen(props: ActionsScreenProps) {
  const actionBusy = useActionBusy(props.flash)
  const queueRunner = useQueueRunPolling(
    props.loadRuns,
    props.refresh,
    props.flash
  )

  return (
    <div className="space-y-4">
      <ActiveRunBanner
        activeRunId={queueRunner.activeRunId}
        activeRun={queueRunner.activeRun}
        cancelActiveRun={queueRunner.cancelActiveRun}
        guarded={props.guarded}
      />
      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <AccountsColumn props={props} />
        <BuilderColumn props={props} />
        <QueueColumn
          props={props}
          actionBusy={actionBusy}
          activeRunId={queueRunner.activeRunId}
          pollQueueRun={queueRunner.pollQueueRun}
        />
      </div>
      <Panel className="space-y-3">
        <RunHistory
          runs={props.runs}
          guarded={props.guarded}
          loadRuns={props.loadRuns}
          flash={props.flash}
          askDialog={props.askDialog}
          onRetryQueued={queueRunner.pollQueueRun}
        />
      </Panel>
    </div>
  )
}

function SectionLabel({
  title,
  trailing,
}: {
  title: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-heading text-sm tracking-tight text-foreground">
        {title}
      </h2>
      {trailing}
    </div>
  )
}

type ActionBusy = ReturnType<typeof useActionBusy>

function useActionBusy(flash: ActionsScreenProps["flash"]) {
  const [pendingAction, setPendingAction] = React.useState<string | null>(null)
  const pendingRef = React.useRef<string | null>(null)

  const runAction = React.useCallback(
    async (key: string, work: () => Promise<void>) => {
      if (pendingRef.current) {
        return
      }
      pendingRef.current = key
      setPendingAction(key)
      try {
        await work()
      } catch (error) {
        flash(error instanceof Error ? error.message : "Request failed")
      } finally {
        pendingRef.current = null
        setPendingAction(null)
      }
    },
    [flash]
  )

  const isPending = React.useCallback(
    (key: string) => pendingAction === key,
    [pendingAction]
  )

  return { busy: pendingAction !== null, isPending, runAction }
}

function useQueueRunPolling(
  loadRuns: ActionsScreenProps["loadRuns"],
  refresh: ActionsScreenProps["refresh"],
  flash: ActionsScreenProps["flash"]
) {
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null)
  const [activeRun, setActiveRun] = React.useState<QueueRun | null>(null)

  async function pollQueueRun(runId: string) {
    setActiveRunId(runId)
    try {
      for (;;) {
        const payload = await api<{ run: QueueRun }>(
          `/api/actions/queue/runs/${runId}`
        )
        const run = payload.run
        setActiveRun(run)
        await loadRuns()
        if (TERMINAL_RUN_STATUSES.has(run.status)) {
          await refresh()
          flash(
            `Queue ${run.status.replace("_", " ")}: ${run.completed_count || 0}/${run.operation_count || 0} succeeded.`
          )
          break
        }
        await wait(1200)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Queue polling failed.")
    } finally {
      setActiveRunId(null)
      setActiveRun(null)
    }
  }

  async function cancelActiveRun() {
    if (!activeRunId) {
      return
    }
    try {
      await api(`/api/actions/queue/runs/${activeRunId}/cancel`, {
        method: "POST",
      })
      flash("Cancel requested. The queue stops before the next operation.")
      await loadRuns()
    } catch (error) {
      flash(error instanceof Error ? error.message : "Cancel failed.")
    }
  }

  return { activeRunId, activeRun, pollQueueRun, cancelActiveRun }
}

// ---------------------------------------------------------------------------
// Column 1 — accounts + presets
// ---------------------------------------------------------------------------

function AccountsColumn({ props }: { props: ActionsScreenProps }) {
  const {
    accounts,
    actionAccountIds,
    setActionAccountIds,
    toggleSelected,
  } = props

  const readyCount = accounts.filter(
    (account) => account.authorized && !account.last_error
  ).length

  return (
    <Panel className="space-y-3 xl:sticky xl:top-6 xl:self-start">
      <SectionLabel
        title="Accounts"
        trailing={
          <Badge tone="border-border bg-muted/40 text-muted-foreground">
            {actionAccountIds.size}
          </Badge>
        }
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={!readyCount}
          onClick={() =>
            setActionAccountIds(
              new Set(
                accounts
                  .filter((account) => account.authorized && !account.last_error)
                  .map((account) => account.id)
              )
            )
          }
        >
          Ready ({readyCount})
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!actionAccountIds.size}
          onClick={() => setActionAccountIds(new Set())}
        >
          Clear
        </Button>
      </div>
      <div className="max-h-64 space-y-1.5 overflow-auto">
        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts"
            detail="Add or import accounts first, then choose which sessions run the queue."
            className="px-4 py-6"
          />
        ) : null}
        {accounts.map((account) => {
          const status = accountStatus(account)
          const selectable = account.authorized && !account.last_error
          const isSelected = actionAccountIds.has(account.id)
          return (
            <label
              key={account.id}
              className={`flex items-center gap-2 border p-2 text-xs transition-colors ${
                isSelected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:bg-muted/20"
              } ${selectable ? "" : "opacity-60"}`}
            >
              <input
                type="checkbox"
                aria-label={`Use ${account.label || account.session_name} for queued actions`}
                checked={isSelected}
                disabled={!selectable && !isSelected}
                onChange={() => toggleSelected(account.id, setActionAccountIds)}
              />
              <span className="min-w-0 flex-1 truncate">
                {account.label || account.session_name}
              </span>
              <Badge tone={statusTone(status)}>{status}</Badge>
            </label>
          )
        })}
      </div>
      <PresetSection props={props} />
    </Panel>
  )
}

function PresetSection({ props }: { props: ActionsScreenProps }) {
  const {
    presets,
    queue,
    queuePayload,
    loadPresets,
    setQueue,
    setSafety,
    guarded,
    flash,
    askDialog,
  } = props

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Reusable queues
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() =>
          guarded(async () => {
            if (!queue.length) {
              flash("Add at least one queued step first.")
              return
            }
            const name = await askDialog({
              title: "Save queue preset",
              description:
                "Name this queue so it can be reused later without rebuilding the steps.",
              confirmLabel: "Save Preset",
              input: { label: "Preset name", placeholder: "Warmup queue" },
            })
            if (typeof name !== "string") return
            if (!name) return flash("Preset name cannot be empty.")
            await api("/api/actions/presets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, queue: queuePayload }),
            })
            flash("Preset saved.")
            await loadPresets()
          })
        }
      >
        Save Current Queue
      </Button>
      {presets.map((preset) => (
        <PresetRow
          key={preset.id}
          preset={preset}
          loadPresets={loadPresets}
          setQueue={setQueue}
          setSafety={setSafety}
          guarded={guarded}
          flash={flash}
          askDialog={askDialog}
        />
      ))}
      {presets.length === 0 ? (
        <p className="border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          Saved queues appear here for one-click reuse.
        </p>
      ) : null}
    </div>
  )
}

function PresetRow({
  preset,
  loadPresets,
  setQueue,
  setSafety,
  guarded,
  flash,
  askDialog,
}: {
  preset: ActionsScreenProps["presets"][number]
  loadPresets: ActionsScreenProps["loadPresets"]
  setQueue: ActionsScreenProps["setQueue"]
  setSafety: ActionsScreenProps["setSafety"]
  guarded: ActionsScreenProps["guarded"]
  flash: ActionsScreenProps["flash"]
  askDialog: ActionsScreenProps["askDialog"]
}) {
  return (
    <div className="flex items-center gap-2 border border-border p-2 text-xs">
      <button
        className="flex-1 text-left"
        onClick={() => {
          setQueue(preset.queue.steps || [])
          const savedQueue = preset.queue
          setSafety((current) => ({
            delay_between_accounts:
              savedQueue.delay_between_accounts ?? current.delay_between_accounts,
            delay_between_actions:
              savedQueue.delay_between_actions ?? current.delay_between_actions,
            max_operations: savedQueue.max_operations ?? current.max_operations,
          }))
          flash(`Loaded preset: ${preset.name}`)
        }}
      >
        <span className="truncate">{preset.name}</span>
        <span className="ml-1 text-muted-foreground">
          {(preset.queue.steps || []).length} step(s)
        </span>
      </button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() =>
          guarded(async () => {
            const confirmed = await askDialog({
              title: "Delete preset?",
              description: `This removes the preset "${preset.name}" permanently.`,
              confirmLabel: "Delete Preset",
              danger: true,
            })
            if (!confirmed) return
            await api(`/api/actions/presets/${preset.id}`, { method: "DELETE" })
            flash("Preset deleted.")
            await loadPresets()
          })
        }
      >
        <IconTrash />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column 2 — build action
// ---------------------------------------------------------------------------

function BuilderColumn({ props }: { props: ActionsScreenProps }) {
  const [submitAttempted, setSubmitAttempted] = React.useState(false)

  const currentMeta = actionMeta[props.actionDraft.action_type]
  const schema = getActionSchema(props.actionDraft.action_type)
  const targets = splitTargets(props.actionDraft.target)
  const { valid } = partitionTargets(targets, props.actionDraft.action_type)
  const blocker = computeBuilderBlocker(props, valid)
  const firstAccountId = [...props.actionAccountIds][0] || ""

  function handleAdd() {
    setSubmitAttempted(true)
    if (blocker) return props.flash(blocker)
    props.addQueueStep()
    setSubmitAttempted(false)
  }

  const multiTargetWarning =
    SINGLE_TARGET_ACTIONS.has(props.actionDraft.action_type) && valid.length > 1
      ? "This action uses a message id that is unique per chat. Use one target per step."
      : null

  return (
    <Panel className="space-y-3">
      <SectionLabel title="Build action" />
      <QuickActionNotice quickActionContext={props.quickActionContext} />

      <Field label="Action">
        <Select
          value={props.actionDraft.action_type}
          onChange={(event) => {
            const next = event.target.value as ActionType
            props.setQuickActionContext(null)
            setSubmitAttempted(false)
            props.setActionDraft({
              ...props.actionDraft,
              action_type: next,
              fields: carryFieldValues(next, props.actionDraft.fields),
            })
          }}
        >
          {groupedActions.map((group) => (
            <optgroup key={group.category} label={group.label}>
              {group.actions.map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      <Field label="Targets">
        <TargetComposer
          value={props.actionDraft.target}
          onChange={(next) =>
            props.setActionDraft((current) => ({ ...current, target: next }))
          }
          actionType={props.actionDraft.action_type}
          accounts={props.accounts}
          defaultAccountId={firstAccountId}
          flash={props.flash}
        />
      </Field>

      <p className="text-xs text-muted-foreground">{currentMeta.description}</p>
      {multiTargetWarning ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <IconAlertTriangle className="size-3.5 shrink-0" />
          {multiTargetWarning}
        </p>
      ) : null}

      {schema ? (
        <div className="border-t border-border pt-3">
          <ActionFields
            actionType={props.actionDraft.action_type}
            values={props.actionDraft.fields}
            setValues={(fields) =>
              props.setActionDraft({ ...props.actionDraft, fields })
            }
            showErrors={submitAttempted}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button type="button" onClick={handleAdd} disabled={props.loading} title={blocker || undefined}>
          {props.loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
          Add To Queue
        </Button>
        <p className={`text-xs ${blocker ? "text-muted-foreground" : "text-primary"}`}>
          {blocker ||
            `Ready to add${valid.length ? ` · ${valid.length} target(s)` : ""}.`}
        </p>
      </div>
    </Panel>
  )
}

// Mirrors the order of checks in addQueueStep so the inline hint matches what
// will actually block the add. Receives the already-valid targets, so greyed
// (incompatible) targets simply don't count toward the requirement.
function computeBuilderBlocker(
  props: ActionsScreenProps,
  validTargets: string[]
): string | null {
  if (!props.actionAccountIds.size) return "Select at least one account."
  if (!validTargets.length) return "Add at least one compatible target."
  if (!isActionFormValid(props.actionDraft.action_type, props.actionDraft.fields)) {
    return "Fill in the required fields below."
  }
  return null
}

// ---------------------------------------------------------------------------
// Column 3 — queue + run
// ---------------------------------------------------------------------------

function QueueColumn({
  props,
  actionBusy,
  activeRunId,
  pollQueueRun,
}: {
  props: ActionsScreenProps
  actionBusy: ActionBusy
  activeRunId: string | null
  pollQueueRun: (runId: string) => Promise<void>
}) {
  const destructiveCount = countDestructiveOperations(props.queue)
  const operationCount = countOperations(props.queue)
  const runDisabled = actionBusy.busy || Boolean(activeRunId) || !props.queue.length

  async function clearQueue() {
    if (!props.queue.length) return props.flash("Queue is already empty.")
    const confirmed = await props.askDialog({
      title: "Clear action queue?",
      description:
        "This removes all queued steps from the builder. Running queue history is not affected.",
      confirmLabel: "Clear Queue",
      danger: true,
    })
    if (!confirmed) return
    props.setQueue([])
    props.flash("Queue cleared.")
  }

  return (
    <Panel className="space-y-3 xl:sticky xl:top-6 xl:self-start">
      <SectionLabel
        title="Queue & run"
        trailing={
          props.queue.length ? (
            <Button variant="ghost" size="sm" onClick={() => props.guarded(clearQueue)}>
              Clear
            </Button>
          ) : null
        }
      />
      <QueueTable queue={props.queue} setQueue={props.setQueue} />

      <details className="border border-border bg-muted/10 p-2 text-xs" open>
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Delays & limits
        </summary>
        <div className="pt-2">
          <SafetyEditor safety={props.safety} setSafety={props.setSafety} />
        </div>
      </details>

      {destructiveCount ? (
        <p className="flex items-center gap-1.5 border border-destructive/40 bg-destructive/10 p-2 text-xs font-medium text-destructive">
          <IconAlertTriangle className="size-3.5 shrink-0" />
          {destructiveCount} destructive operation(s) queued.
        </p>
      ) : null}

      <Button
        className="w-full"
        loading={actionBusy.isPending("run")}
        disabled={runDisabled}
        onClick={() =>
          actionBusy.runAction("run", async () => {
            if (activeRunId) return props.flash("A queue is already running.")
            if (!props.queue.length) return props.flash("Add at least one step.")
            const confirmed = await props.askDialog({
              kicker: destructiveCount ? "Destructive queue" : "Run queue",
              title: "Run this queue?",
              description: runConfirmationDetail(operationCount, props.queue.length, destructiveCount),
              confirmLabel: destructiveCount ? "Run Destructive Queue" : "Run Queue",
              danger: destructiveCount > 0,
            })
            if (!confirmed) return
            const response = await api<{
              run_id: string
              operation_count: number
            }>("/api/actions/queue/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...props.queuePayload, confirm: true }),
            })
            props.flash(`Queue started: ${response.operation_count} operations.`)
            void pollQueueRun(response.run_id)
          })
        }
      >
        {activeRunId ? "Queue running…" : `Run ${operationCount || ""} operation(s)`}
      </Button>
      {!props.queue.length ? (
        <p className="text-center text-xs text-muted-foreground">
          Add steps in the builder, then run.
        </p>
      ) : null}
    </Panel>
  )
}

function countDestructiveOperations(queue: ActionsScreenProps["queue"]) {
  return queue.reduce((total, step) => {
    const meta = actionMeta[step.action_type]
    if (!meta?.destructive) return total
    return total + step.account_ids.length * step.targets.length
  }, 0)
}

function countOperations(queue: ActionsScreenProps["queue"]) {
  return queue.reduce(
    (total, step) => total + step.account_ids.length * step.targets.length,
    0
  )
}

function runConfirmationDetail(
  operationCount: number,
  stepCount: number,
  destructiveCount: number
) {
  const destructive = destructiveCount
    ? ` This includes ${destructiveCount} destructive operation(s).`
    : ""
  return `${operationCount} operation(s) across ${stepCount} step(s) will run on the selected sessions.${destructive}`
}

// ---------------------------------------------------------------------------
// Shared banners
// ---------------------------------------------------------------------------

function ActiveRunBanner({
  activeRunId,
  activeRun,
  cancelActiveRun,
  guarded,
}: {
  activeRunId: string | null
  activeRun: QueueRun | null
  cancelActiveRun: () => Promise<void>
  guarded: ActionsScreenProps["guarded"]
}) {
  if (!activeRunId) return null

  const completed = activeRun?.completed_count || 0
  const total = activeRun?.operation_count || 0
  const failed = activeRun?.failed_count || 0
  const status = activeRun?.status || "running"
  const currentTarget =
    activeRun?.current && typeof activeRun.current === "object"
      ? String((activeRun.current as Record<string, unknown>).target || "")
      : ""

  return (
    <div className="flex flex-col gap-3 border border-sky-500/40 bg-sky-500/10 p-4 text-sm md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <IconLoader2 className="size-4 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong>Queue running</strong>
            <Badge tone={statusTone(status)}>{status.replace("_", " ")}</Badge>
            <span className="text-muted-foreground">
              {completed}/{total} done{failed ? ` · ${failed} failed` : ""}
            </span>
          </div>
          {currentTarget ? (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {currentTarget}
            </p>
          ) : null}
        </div>
      </div>
      <Button variant="destructive" onClick={() => guarded(cancelActiveRun)}>
        <IconPlayerStop />
        Cancel Run
      </Button>
    </div>
  )
}

function QuickActionNotice({
  quickActionContext,
}: {
  quickActionContext: ActionsScreenProps["quickActionContext"]
}) {
  if (!quickActionContext) return null

  return (
    <div className="border border-primary/30 bg-primary/10 p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{quickActionContext.title}</strong>
        <Badge tone="border-primary/30 bg-background text-primary">
          from dialogs
        </Badge>
        <Badge tone="border-border bg-background text-muted-foreground">
          {quickActionContext.count} target(s)
        </Badge>
      </div>
      <p className="mt-1 text-muted-foreground">
        Source: {quickActionContext.targetSummary}
      </p>
    </div>
  )
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
