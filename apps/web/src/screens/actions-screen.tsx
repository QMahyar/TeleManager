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
import { TargetPreview } from "../components/target-preview"
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  StepHeading,
} from "../components/ui"
import { api } from "../lib/api"
import {
  defaultFieldValues,
  getActionSchema,
  isActionFormValid,
} from "../lib/action-schema"
import { actionMeta, categoryLabels, categoryOrder } from "../lib/constants"
import { accountStatus, splitTargets, statusTone } from "../lib/helpers"
import { validateTargets } from "../lib/targeting"
import type { ActionType, QueueRun, ResolvedTarget } from "../types"
import type { ActionsScreenProps } from "./screen-props"

type QueuePreview = {
  step_count: number
  operation_count: number
  authorized_count?: number
  unauthorized_count?: number
  estimated_seconds: number
  warnings?: string[]
}

const OUTLINE_VARIANT = "outline"
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
  const [preview, setPreview] = React.useState<QueuePreview | null>(null)
  const actionBusy = useActionBusy(props.flash)
  const queueRunner = useQueueRunPolling(
    props.loadRuns,
    props.refresh,
    props.flash
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
      <ActionAccountsPanel props={props} />
      <ActionQueuePanel
        props={props}
        actionBusy={actionBusy}
        activeRunId={queueRunner.activeRunId}
        activeRun={queueRunner.activeRun}
        cancelActiveRun={queueRunner.cancelActiveRun}
        pollQueueRun={queueRunner.pollQueueRun}
        preview={preview}
        setPreview={setPreview}
      />
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

function ActionAccountsPanel({ props }: { props: ActionsScreenProps }) {
  const {
    accounts,
    actionAccountIds,
    setActionAccountIds,
    toggleSelected,
    presets,
    queue,
    queuePayload,
    loadPresets,
    setQueue,
    setSafety,
    setConfirmed,
    guarded,
    flash,
    askDialog,
  } = props

  const readyCount = accounts.filter(
    (account) => account.authorized && !account.last_error
  ).length

  return (
    <Panel className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <StepHeading
        step={1}
        title="Accounts"
        detail="Choose which logged-in sessions run the queue."
        trailing={
          <Badge tone="border-border bg-muted/40 text-muted-foreground">
            {actionAccountIds.size} selected
          </Badge>
        }
      />
      <div className="flex gap-2">
        <Button
          variant={OUTLINE_VARIANT}
          disabled={!readyCount}
          onClick={() =>
            setActionAccountIds(
              new Set(
                accounts
                  .filter(
                    (account) => account.authorized && !account.last_error
                  )
                  .map((account) => account.id)
              )
            )
          }
        >
          Select Ready ({readyCount})
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          disabled={!actionAccountIds.size}
          onClick={() => setActionAccountIds(new Set())}
        >
          Clear
        </Button>
      </div>
      <div className="max-h-72 space-y-2 overflow-auto">
        {accounts.length === 0 ? (
          <EmptyState
            title="No action accounts"
            detail="Add or import accounts first, then select the sessions that should run the queue."
            className="px-4 py-8"
          />
        ) : null}
        {accounts.map((account) => {
          const status = accountStatus(account)
          const selectable = account.authorized && !account.last_error
          const isSelected = actionAccountIds.has(account.id)
          return (
            <label
              key={account.id}
              className={`flex items-center gap-3 border p-3 text-sm transition-colors ${
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
      <PresetSection
        presets={presets}
        queue={queue}
        queuePayload={queuePayload}
        loadPresets={loadPresets}
        setQueue={setQueue}
        setSafety={setSafety}
        setConfirmed={setConfirmed}
        guarded={guarded}
        flash={flash}
        askDialog={askDialog}
      />
    </Panel>
  )
}

function PresetSection({
  presets,
  queue,
  queuePayload,
  loadPresets,
  setQueue,
  setSafety,
  setConfirmed,
  guarded,
  flash,
  askDialog,
}: Pick<
  ActionsScreenProps,
  | "presets"
  | "queue"
  | "queuePayload"
  | "loadPresets"
  | "setQueue"
  | "setSafety"
  | "setConfirmed"
  | "guarded"
  | "flash"
  | "askDialog"
>) {
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Reusable queues
      </p>
      <Button
        variant={OUTLINE_VARIANT}
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
            if (typeof name !== "string") {
              return
            }
            if (!name) {
              return flash("Preset name cannot be empty.")
            }
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
          loadPresets={loadPresets}
          preset={preset}
          guarded={guarded}
          flash={flash}
          askDialog={askDialog}
          setQueue={setQueue}
          setSafety={setSafety}
          setConfirmed={setConfirmed}
        />
      ))}
      {presets.length === 0 ? (
        <EmptyState
          title="No saved presets"
          detail="Build a queue and save it here so repeated Telegram workflows can be reused quickly."
          className="px-4 py-8"
        />
      ) : null}
    </div>
  )
}

function PresetRow({
  loadPresets,
  preset,
  guarded,
  flash,
  askDialog,
  setQueue,
  setSafety,
  setConfirmed,
}: {
  loadPresets: ActionsScreenProps["loadPresets"]
  preset: ActionsScreenProps["presets"][number]
  guarded: ActionsScreenProps["guarded"]
  flash: ActionsScreenProps["flash"]
  askDialog: ActionsScreenProps["askDialog"]
  setQueue: ActionsScreenProps["setQueue"]
  setSafety: ActionsScreenProps["setSafety"]
  setConfirmed: ActionsScreenProps["setConfirmed"]
}) {
  return (
    <div className="flex items-center gap-2 border border-border p-2 text-sm">
      <button
        className="flex-1 text-left"
        onClick={() => {
          setQueue(preset.queue.steps || [])
          const savedQueue = preset.queue
          setSafety((current) => ({
            delay_between_accounts:
              savedQueue.delay_between_accounts ??
              current.delay_between_accounts,
            delay_between_actions:
              savedQueue.delay_between_actions ?? current.delay_between_actions,
            max_operations: savedQueue.max_operations ?? current.max_operations,
          }))
          setConfirmed(false)
          flash(`Loaded preset: ${preset.name}`)
        }}
      >
        <span className="truncate">{preset.name}</span>
        <span className="ml-1 text-xs text-muted-foreground">
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
            if (!confirmed) {
              return
            }
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

function ActionQueuePanel({
  props,
  actionBusy,
  activeRunId,
  activeRun,
  cancelActiveRun,
  pollQueueRun,
  preview,
  setPreview,
}: {
  props: ActionsScreenProps
  actionBusy: ActionBusy
  activeRunId: string | null
  activeRun: QueueRun | null
  cancelActiveRun: () => Promise<void>
  pollQueueRun: (runId: string) => Promise<void>
  preview: QueuePreview | null
  setPreview: React.Dispatch<React.SetStateAction<QueuePreview | null>>
}) {
  const destructiveCount = countDestructiveOperations(props.queue)

  async function previewQueue() {
    const payload = await api<QueuePreview>("/api/actions/queue/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...props.queuePayload, confirm: false }),
    })
    setPreview(payload)
    props.flash(`Preview ready: ${payload.operation_count} operations.`)
  }

  return (
    <div className="space-y-4">
      <ActiveRunBanner
        activeRunId={activeRunId}
        activeRun={activeRun}
        cancelActiveRun={cancelActiveRun}
        guarded={props.guarded}
      />
      <Panel className="space-y-4">
        <StepHeading
          step={2}
          title="Build action"
          detail="Pick an action, add targets, and fill in only the fields it needs."
        />
        <QuickActionNotice quickActionContext={props.quickActionContext} />
        <QueueBuilderForm props={props} setPreview={setPreview} />
      </Panel>

      <Panel className="space-y-4">
        <StepHeading
          step={3}
          title="Queue"
          detail="Review the steps that will run. Remove anything you did not intend."
        />
        <QueueTable queue={props.queue} setQueue={props.setQueue} />
      </Panel>

      <Panel className="space-y-4">
        <StepHeading
          step={4}
          title="Review & run"
          detail="Apply delays, preview the operations, confirm, then run."
        />
        <SafetyEditor safety={props.safety} setSafety={props.setSafety} />
        <QueueRunControls
          activeRunId={activeRunId}
          actionBusy={actionBusy}
          previewQueue={previewQueue}
          props={props}
          showPreviewOnly
        />
        <QueuePreviewSummary preview={preview} />
        <DestructiveGate
          destructiveCount={destructiveCount}
          confirmed={props.confirmed}
          setConfirmed={props.setConfirmed}
        />
        <QueueRunControls
          activeRunId={activeRunId}
          actionBusy={actionBusy}
          pollQueueRun={pollQueueRun}
          preview={preview}
          previewQueue={previewQueue}
          destructiveCount={destructiveCount}
          props={props}
        />
      </Panel>

      <Panel className="space-y-4">
        <RunHistory
          runs={props.runs}
          guarded={props.guarded}
          loadRuns={props.loadRuns}
          flash={props.flash}
          askDialog={props.askDialog}
          onRetryQueued={pollQueueRun}
        />
      </Panel>
    </div>
  )
}

function countDestructiveOperations(queue: ActionsScreenProps["queue"]) {
  return queue.reduce((total, step) => {
    const meta = actionMeta[step.action_type]
    if (!meta?.destructive) {
      return total
    }
    return total + step.account_ids.length * step.targets.length
  }, 0)
}

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
  if (!activeRunId) {
    return null
  }

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
              {completed}/{total} done
              {failed ? ` · ${failed} failed` : ""}
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

function DestructiveGate({
  destructiveCount,
  confirmed,
  setConfirmed,
}: {
  destructiveCount: number
  confirmed: boolean
  setConfirmed: ActionsScreenProps["setConfirmed"]
}) {
  const tone = destructiveCount
    ? "border-destructive/40 bg-destructive/10"
    : "border-border bg-muted/30"

  return (
    <label className={`flex gap-3 border p-3 text-sm ${tone}`}>
      <input
        type="checkbox"
        aria-label="Confirm reviewed queue"
        checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)}
      />
      <span>
        {destructiveCount ? (
          <span className="flex items-center gap-2 font-medium text-destructive">
            <IconAlertTriangle className="size-4" />
            {destructiveCount} destructive operation(s) in this queue.
          </span>
        ) : null}
        <span className={destructiveCount ? "mt-1 block" : ""}>
          I reviewed the queue and confirm it should run only on the selected
          sessions and targets.
        </span>
      </span>
    </label>
  )
}

function QuickActionNotice({
  quickActionContext,
}: {
  quickActionContext: ActionsScreenProps["quickActionContext"]
}) {
  if (!quickActionContext) {
    return null
  }

  return (
    <div className="border border-primary/30 bg-primary/10 p-3 text-sm">
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
      <p className="mt-1 text-xs text-muted-foreground">
        Dialog kinds: {quickActionContext.dialogKinds.join(", ")}
      </p>
    </div>
  )
}

function ResolvedTargetBanner({
  resolvedTarget,
}: {
  resolvedTarget: ResolvedTarget | null
}) {
  if (!resolvedTarget) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border border-primary/30 bg-primary/10 p-2 text-xs">
      <Badge tone="border-primary/30 bg-background text-primary">
        {resolvedTarget.type}
      </Badge>
      <span className="text-foreground">
        {resolvedTarget.title ||
          resolvedTarget.username ||
          resolvedTarget.target}
      </span>
      {resolvedTarget.id ? (
        <span className="font-mono text-muted-foreground">
          {resolvedTarget.id}
        </span>
      ) : null}
    </div>
  )
}

function QueueBuilderForm({
  props,
  setPreview,
}: {
  props: ActionsScreenProps
  setPreview: React.Dispatch<React.SetStateAction<QueuePreview | null>>
}) {
  const [resolvedTarget, setResolvedTarget] =
    React.useState<ResolvedTarget | null>(null)
  const [submitAttempted, setSubmitAttempted] = React.useState(false)

  const currentMeta = actionMeta[props.actionDraft.action_type]
  const schema = getActionSchema(props.actionDraft.action_type)
  const targets = splitTargets(props.actionDraft.target)
  const blocker = computeBuilderBlocker(props, targets)

  async function resolveDraftTarget() {
    const target = props.actionDraft.target.split(/[\n,]+/)[0]?.trim()
    const accountId = [...props.actionAccountIds][0]
    if (!target) {
      props.flash("Add a target first.")
      return
    }
    if (!accountId) {
      props.flash("Select at least one action account first.")
      return
    }
    const payload = await api<ResolvedTarget>(
      `/api/accounts/${accountId}/resolve-target?target=${encodeURIComponent(target)}`
    )
    setResolvedTarget(payload)
    props.flash(
      `Resolved ${payload.title || payload.username || payload.id || target}.`
    )
  }

  function handleAdd() {
    setSubmitAttempted(true)
    if (blocker) {
      props.flash(blocker)
      return
    }
    props.addQueueStep()
    setSubmitAttempted(false)
    setResolvedTarget(null)
  }

  const multiTargetWarning =
    SINGLE_TARGET_ACTIONS.has(props.actionDraft.action_type) &&
    targets.length > 1
      ? "This action uses a specific message id, which is unique per chat. Use one target per step."
      : null

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Action">
          <Select
            value={props.actionDraft.action_type}
            onChange={(event) => {
              const next = event.target.value as ActionType
              props.setQuickActionContext(null)
              setSubmitAttempted(false)
              setResolvedTarget(null)
              props.setActionDraft({
                ...props.actionDraft,
                action_type: next,
                fields: defaultFieldValues(next),
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
          <div className="flex gap-2">
            <Input
              value={props.actionDraft.target}
              maxLength={500}
              autoComplete="off"
              onChange={(event) => {
                setResolvedTarget(null)
                props.setActionDraft({
                  ...props.actionDraft,
                  target: event.target.value,
                })
              }}
              placeholder={currentMeta.targetHint}
            />
            <Button
              type="button"
              variant={OUTLINE_VARIANT}
              onClick={() => props.guarded(resolveDraftTarget)}
            >
              Resolve
            </Button>
          </div>
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">{currentMeta.description}</p>
      <ResolvedTargetBanner resolvedTarget={resolvedTarget} />
      <TargetPreview
        value={props.actionDraft.target}
        actionType={props.actionDraft.action_type}
      />
      {multiTargetWarning ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <IconAlertTriangle className="size-3.5 shrink-0" />
          {multiTargetWarning}
        </p>
      ) : null}

      {schema ? (
        <div className="border-t border-border pt-4">
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

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleAdd}
            disabled={props.loading}
            title={blocker || undefined}
          >
            {props.loading ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : null}
            Add To Queue
          </Button>
          <Button
            type="button"
            variant={OUTLINE_VARIANT}
            onClick={() =>
              props.guarded(async () => {
                if (!props.queue.length) {
                  return props.flash("Queue is already empty.")
                }
                const confirmed = await props.askDialog({
                  title: "Clear action queue?",
                  description:
                    "This removes all queued steps from the builder. Running queue history is not affected.",
                  confirmLabel: "Clear Queue",
                  danger: true,
                })
                if (!confirmed) {
                  return
                }
                props.setQueue([])
                setPreview(null)
                props.flash("Queue cleared.")
              })
            }
          >
            Clear Queue
          </Button>
        </div>
        {blocker ? (
          <p className="text-xs text-muted-foreground">{blocker}</p>
        ) : (
          <p className="text-xs text-primary">
            Ready to add{targets.length ? ` · ${targets.length} target(s)` : ""}.
          </p>
        )}
      </div>
    </div>
  )
}

// Mirrors the order of checks in addQueueStep so the inline hint matches what
// will actually block the add.
function computeBuilderBlocker(
  props: ActionsScreenProps,
  targets: string[]
): string | null {
  if (!props.actionAccountIds.size) return "Select at least one account in Step 1."
  if (!targets.length) return "Add at least one target."
  if (!isActionFormValid(props.actionDraft.action_type, props.actionDraft.fields)) {
    return "Fill in the required fields below."
  }
  return validateTargets(targets, props.actionDraft.action_type)
}

function QueueRunControls({
  activeRunId,
  actionBusy,
  pollQueueRun,
  preview,
  previewQueue,
  destructiveCount = 0,
  props,
  showPreviewOnly = false,
}: {
  activeRunId: string | null
  actionBusy: ActionBusy
  pollQueueRun?: (runId: string) => Promise<void>
  preview?: QueuePreview | null
  previewQueue: () => Promise<void>
  destructiveCount?: number
  props: ActionsScreenProps
  showPreviewOnly?: boolean
}) {
  if (showPreviewOnly) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant={OUTLINE_VARIANT}
          loading={actionBusy.isPending("preview")}
          disabled={actionBusy.busy || !props.queue.length}
          onClick={() => actionBusy.runAction("preview", previewQueue)}
        >
          Preview Queue
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
          loading={actionBusy.isPending("runs")}
          disabled={actionBusy.busy}
          onClick={() => actionBusy.runAction("runs", props.loadRuns)}
        >
          Refresh Runs
        </Button>
      </div>
    )
  }

  const runDisabled =
    actionBusy.busy ||
    Boolean(activeRunId) ||
    !props.confirmed ||
    !preview ||
    !props.queue.length

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        className="min-w-40"
        loading={actionBusy.isPending("run")}
        disabled={runDisabled}
        onClick={() =>
          actionBusy.runAction("run", async () => {
            if (activeRunId) {
              return props.flash("A queue is already running.")
            }
            if (!props.confirmed) {
              return props.flash("Confirm the reviewed queue first.")
            }
            if (!preview) {
              return props.flash("Preview the queue before running it.")
            }
            const confirmed = await props.askDialog({
              kicker: destructiveCount ? "Destructive queue" : "Run queue",
              title: "Run reviewed queue?",
              description: queueRunConfirmationDetail(preview, destructiveCount),
              confirmLabel: destructiveCount
                ? "Run Destructive Queue"
                : "Run Queue",
              danger: destructiveCount > 0,
            })
            if (!confirmed) {
              return
            }
            const response = await api<{
              run_id: string
              status: string
              operation_count: number
            }>("/api/actions/queue/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(props.queuePayload),
            })
            props.flash(`Queue started: ${response.operation_count} operations.`)
            if (pollQueueRun) {
              void pollQueueRun(response.run_id)
            }
          })
        }
      >
        Run Queue
      </Button>
      {runDisabled && !activeRunId ? (
        <p className="text-xs text-muted-foreground">{runBlockerHint(props, preview)}</p>
      ) : null}
    </div>
  )
}

function runBlockerHint(
  props: ActionsScreenProps,
  preview?: QueuePreview | null
): string {
  if (!props.queue.length) return "Add at least one step to the queue."
  if (!preview) return "Preview the queue first."
  if (!props.confirmed) return "Tick the confirmation checkbox to enable Run."
  return ""
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function queueRunConfirmationDetail(
  preview: QueuePreview,
  destructiveCount: number
) {
  const skipped = preview.unauthorized_count
    ? ` ${preview.unauthorized_count} operation(s) will be skipped because the account is not logged in.`
    : ""
  const destructive = destructiveCount
    ? ` This includes ${destructiveCount} destructive operation(s).`
    : ""
  const warnings = preview.warnings?.length
    ? ` Warnings: ${preview.warnings.join(" ")}`
    : ""

  return `${preview.operation_count} operation(s) across ${preview.step_count} step(s), estimated ${preview.estimated_seconds}s.${skipped}${destructive}${warnings}`
}

function QueuePreviewSummary({ preview }: { preview: QueuePreview | null }) {
  if (!preview) {
    return (
      <p className="text-xs text-muted-foreground">
        Run Preview Queue to see operation count, estimated time, and warnings
        before running.
      </p>
    )
  }

  return (
    <div className="space-y-2 border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <strong>
          {preview.operation_count} operations · {preview.step_count} steps
        </strong>
        {preview.unauthorized_count ? (
          <Badge tone="text-amber-600 border-amber-500/30 bg-amber-500/10 dark:text-amber-400">
            {preview.authorized_count || 0} ready · {preview.unauthorized_count}{" "}
            skipped
          </Badge>
        ) : null}
        <span className="text-muted-foreground">
          Estimated {preview.estimated_seconds}s
        </span>
      </div>
      {(preview.warnings || []).map((warning) => (
        <p key={warning} className="text-muted-foreground">
          {warning}
        </p>
      ))}
    </div>
  )
}
