import * as React from "react"

import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconBookmarks,
  IconClockHour4,
  IconClockPlus,
  IconForms,
  IconHistory,
  IconListDetails,
  IconLoader2,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"

import { Button } from "../ui/button"

import { ActionFields } from "../components/action-fields"
import { QueueTable } from "../components/queue-table"
import { RunHistory } from "../components/run-history"
import { SafetyEditor } from "../components/safety-editor"
import { ScheduledInspector } from "../components/scheduled-inspector"
import { ScheduleCard, ScheduleModal } from "../components/schedule-parts"
import { TargetComposer } from "../components/target-composer"
import { EmptySchedulesArt } from "../components/empty-illustrations"
import {
  Badge,
  Callout,
  Disclosure,
  EmptyState,
  Field,
  Panel,
  Readout,
  ReadoutItem,
  SectionTitle,
  Select,
  Tabs,
  TimingBadge,
} from "../components/ui"
import { api } from "../lib/api"
import {
  carryFieldValues,
  deserializeFields,
  getActionSchema,
  isActionFormValid,
} from "../lib/action-schema"
import {
  actionDelaySeconds,
  estimateQueueSeconds,
  formatDuration,
  tierForAction,
} from "../lib/action-meta"
import { actionMeta, categoryLabels, categoryOrder } from "../lib/constants"
import { accountStatus, splitTargets, statusTone } from "../lib/helpers"
import { startQueueRun } from "../lib/queue-run"
import { defaultRecurrenceForm, type RecurrenceForm } from "../lib/schedules"
import { partitionTargets } from "../lib/targeting"
import type {
  ActionType,
  QueueRun,
  QueueStep,
  SchedulePreview,
} from "../types"
import type { ActionsScreenProps } from "./screen-props"

type BottomTab = "history" | "schedules" | "inspector"

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
  // Run-polling state is owned by app state now (so the footer/rail can show it
  // too); the screen just reads it off props.
  const queueRunner = {
    activeRunId: props.activeRunId,
    activeRun: props.activeRun,
    pollQueueRun: props.pollQueueRun,
    cancelActiveRun: props.cancelActiveRun,
  }
  const composer = useScheduleComposer(props)
  const { scheduleSeed, setScheduleSeed } = props
  const [bottomTab, setBottomTab] = React.useState<BottomTab>(() =>
    scheduleSeed?.mode === "schedule" ? "schedules" : "history"
  )

  // The seed is a one-shot prefill staged from another screen (e.g. Dialogs
  // "Schedule Selected"). Clear it after mount so a later visit doesn't re-flip
  // the composer into schedule mode.
  React.useEffect(() => {
    if (!scheduleSeed) return undefined
    const timer = window.setTimeout(() => setScheduleSeed(null), 0)
    return () => window.clearTimeout(timer)
  }, [scheduleSeed, setScheduleSeed])

  return (
    <div className="space-y-4">
      <ActiveRunBanner
        activeRunId={queueRunner.activeRunId}
        activeRun={queueRunner.activeRun}
        cancelActiveRun={queueRunner.cancelActiveRun}
        guarded={props.guarded}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <BuilderColumn props={props} />
        <QueueColumn
          props={props}
          actionBusy={actionBusy}
          activeRunId={queueRunner.activeRunId}
          pollQueueRun={queueRunner.pollQueueRun}
          composer={composer}
        />
      </div>
      <ScheduleModal
        open={composer.scheduleOpen}
        onClose={() => composer.setScheduleOpen(false)}
        queuePayload={props.queuePayload}
        form={composer.form}
        setForm={composer.setForm}
        name={composer.name}
        setName={composer.setName}
        preview={composer.preview}
        setPreview={composer.setPreview}
        guarded={props.guarded}
        flash={props.flash}
        loadSchedules={props.loadSchedules}
        onCreated={() => {
          composer.setScheduleOpen(false)
          setBottomTab("schedules")
        }}
      />
      <Panel className="space-y-3 overflow-hidden">
        <Tabs<BottomTab>
          value={bottomTab}
          onChange={setBottomTab}
          items={[
            { id: "history", label: "Run history", icon: IconHistory },
            {
              id: "schedules",
              label: "Schedules",
              icon: IconClockHour4,
              badge: props.schedules.length || undefined,
            },
            { id: "inspector", label: "Scheduled inspector", icon: IconRefresh },
          ]}
        />
        {bottomTab === "history" ? (
          <RunHistory
            runs={props.runs}
            guarded={props.guarded}
            loadRuns={props.loadRuns}
            flash={props.flash}
            askDialog={props.askDialog}
            onRetryQueued={queueRunner.pollQueueRun}
          />
        ) : null}
        {bottomTab === "schedules" ? <SchedulesList props={props} /> : null}
        {bottomTab === "inspector" ? (
          <ScheduledInspector
            accounts={props.accounts}
            schedules={props.schedules}
            guarded={props.guarded}
            flash={props.flash}
            askDialog={props.askDialog}
          />
        ) : null}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schedule composer — local state for the Schedule modal. The schedule is built
// from the SAME shared queue/queuePayload the run-now path uses; `scheduleOpen`
// just controls the modal's visibility (seeded open when arriving from Dialogs
// "Schedule selected").
// ---------------------------------------------------------------------------

type ScheduleComposer = ReturnType<typeof useScheduleComposer>

function useScheduleComposer(props: ActionsScreenProps) {
  const [scheduleOpen, setScheduleOpen] = React.useState(
    () => props.scheduleSeed?.mode === "schedule"
  )
  const [name, setName] = React.useState("")
  const [form, setForm] = React.useState<RecurrenceForm>(defaultRecurrenceForm)
  // The preview is tagged with the queue it was computed for; it is shown only
  // while that exact queue is still current, so a queue edit silently
  // invalidates a stale preview with no effect or ref needed.
  const [previewState, setPreviewState] = React.useState<{
    data: SchedulePreview
    queue: QueueStep[]
  } | null>(null)

  const setPreview = React.useCallback(
    (data: SchedulePreview | null) =>
      setPreviewState(data ? { data, queue: props.queue } : null),
    [props.queue]
  )
  const preview =
    previewState && previewState.queue === props.queue ? previewState.data : null

  return {
    scheduleOpen,
    setScheduleOpen,
    name,
    setName,
    form,
    setForm,
    preview,
    setPreview,
  }
}

function SchedulesList({ props }: { props: ActionsScreenProps }) {
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionTitle
          kicker="Automation"
          title="Active schedules"
          detail="Scheduled queues are compact here so history does not dominate the page."
        />
        <Button variant="outline" onClick={() => props.guarded(props.loadSchedules)}>
          Refresh
        </Button>
      </div>
      {props.schedules.length ? (
        <div className="max-h-[34rem] space-y-2 overflow-auto pr-1">
          {props.schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              guarded={props.guarded}
              flash={props.flash}
              askDialog={props.askDialog}
              loadSchedules={props.loadSchedules}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          illustration={<EmptySchedulesArt />}
          title="No schedules yet"
          detail="Build a queue above, switch to Schedule mode, and create your first recurring schedule."
        />
      )}
    </div>
  )
}

// Panel header for the builder/queue columns: an accent icon-square + title,
// mirroring the operations-rail card header so the page's major surfaces share
// one identity. `hint` adds a one-line subtitle; `trailing` holds an action.
function SectionLabel({
  icon: Icon,
  title,
  hint,
  trailing,
}: {
  icon?: React.ElementType
  title: string
  hint?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="type-heading text-foreground">{title}</h2>
          {hint ? (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
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

// ---------------------------------------------------------------------------
// Column 1 — accounts + presets
// ---------------------------------------------------------------------------

// The "run as" account picker. Folded into the builder as a disclosure rather
// than its own column: it's expanded until a session is chosen, then collapses
// to a one-line summary so the builder isn't dominated by the account list on
// every visit. Same selection state as before (props.actionAccountIds).
function RunAsSelector({ props }: { props: ActionsScreenProps }) {
  const { accounts, actionAccountIds, setActionAccountIds, toggleSelected } =
    props

  const readyCount = accounts.filter(
    (account) => account.authorized && !account.last_error
  ).length

  const summary =
    actionAccountIds.size === 0
      ? "No accounts selected"
      : `${actionAccountIds.size} account${actionAccountIds.size === 1 ? "" : "s"} selected`

  return (
    <Disclosure
      icon={IconUsers}
      label="Run as"
      defaultOpen={actionAccountIds.size === 0}
      hint={
        <span className={actionAccountIds.size ? "text-primary" : undefined}>
          {summary}
        </span>
      }
    >
      <div className="space-y-3">
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
                      .filter(
                        (account) => account.authorized && !account.last_error
                      )
                      .map((account) => account.id)
                  )
                )
              }
            >
              Select ready ({readyCount})
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
          <div className="max-h-56 space-y-1.5 overflow-auto">
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
                  className={`flex items-center gap-2 rounded-md border p-2 text-xs transition-colors ${
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
                    onChange={() =>
                      toggleSelected(account.id, setActionAccountIds)
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {account.label || account.session_name}
                  </span>
                  <Badge tone={statusTone(status)}>{status}</Badge>
                </label>
              )
            })}
          </div>
      </div>
    </Disclosure>
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
    <div className="space-y-2">
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
            flash("Preset saved.", "success")
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
        <Callout tone="info">Saved queues appear here for one-click reuse.</Callout>
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
    <div className="flex items-center gap-2 rounded-md border border-border p-2 text-xs">
      <button
        className="flex-1 text-left"
        onClick={() => {
          setQueue(preset.queue.steps || [])
          const savedQueue = preset.queue
          setSafety((current) => ({
            ...current,
            delay_between_accounts:
              savedQueue.delay_between_accounts ?? current.delay_between_accounts,
            delay_between_actions:
              savedQueue.delay_between_actions ?? current.delay_between_actions,
            delay_instant: savedQueue.delay_instant ?? current.delay_instant,
            delay_sensitive:
              savedQueue.delay_sensitive ?? current.delay_sensitive,
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
            flash("Preset deleted.", "success")
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
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const currentMeta = actionMeta[props.actionDraft.action_type]
  const schema = getActionSchema(props.actionDraft.action_type)
  const targets = splitTargets(props.actionDraft.target)
  const { valid } = partitionTargets(targets, props.actionDraft.action_type)
  const blocker = computeBuilderBlocker(props, valid)
  const firstAccountId = [...props.actionAccountIds][0] || ""

  function handleAdd() {
    setSubmitAttempted(true)
    if (blocker) {
      if (schema) setShowAdvanced(true)
      return props.flash(blocker)
    }
    props.addQueueStep()
    setSubmitAttempted(false)
  }

  const multiTargetWarning =
    SINGLE_TARGET_ACTIONS.has(props.actionDraft.action_type) && valid.length > 1
      ? "This action uses a message id that is unique per chat. Use one target per step."
      : null

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <SectionLabel
          icon={IconForms}
          title="Build action"
          hint="Compose a step, then add it to the queue."
        />
      </div>

      <div className="space-y-4 p-4">
        <RunAsSelector props={props} />
        <QuickActionNotice quickActionContext={props.quickActionContext} />

        <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <Field label="Action">
              <Select
                value={props.actionDraft.action_type}
                onChange={(event) => {
                  const next = event.target.value as ActionType
                  props.setQuickActionContext(null)
                  setSubmitAttempted(false)
                  setShowAdvanced(false)
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
            <div className="space-y-1.5 px-0.5 text-xs leading-5 text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {currentMeta.label}
                </span>
                <TimingBadge
                  tier={tierForAction(
                    props.actionsMeta,
                    props.actionDraft.action_type
                  )}
                  seconds={actionDelaySeconds(
                    props.actionDraft.action_type,
                    props.actionsMeta,
                    props.safety
                  )}
                />
              </div>
              <p>{currentMeta.description}</p>
            </div>
          </div>

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
        </div>

        {multiTargetWarning ? (
          <Callout tone="warning" icon={IconAlertTriangle}>
            {multiTargetWarning}
          </Callout>
        ) : null}

        {schema ? (
          <Disclosure
            flush
            icon={IconListDetails}
            label="Action details"
            hint="fields for this action"
            count={schema.fields.length}
            open={showAdvanced || submitAttempted}
            onOpenChange={setShowAdvanced}
          >
            <ActionFields
              actionType={props.actionDraft.action_type}
              values={props.actionDraft.fields}
              setValues={(fields) =>
                props.setActionDraft({ ...props.actionDraft, fields })
              }
              showErrors={submitAttempted}
              flash={props.flash}
              bare
            />
          </Disclosure>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Button
          type="button"
          size="comfortable"
          onClick={handleAdd}
          disabled={props.loading}
          title={blocker || undefined}
        >
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
  composer,
}: {
  props: ActionsScreenProps
  actionBusy: ActionBusy
  activeRunId: string | null
  pollQueueRun: (runId: string) => Promise<void>
  composer: ScheduleComposer
}) {
  const destructiveCount = countDestructiveOperations(props.queue)
  const operationCount = countOperations(props.queue)
  const estimateSeconds = estimateQueueSeconds(
    props.queue,
    props.safety,
    props.actionsMeta
  )
  const runDisabled = actionBusy.busy || Boolean(activeRunId) || !props.queue.length

  // Pop a step back into the builder fully populated so a mistake is a tweak,
  // not a rebuild. Removing it here avoids a duplicate when it's re-added.
  function editStep(step: QueueStep, index: number) {
    props.setActionDraft({
      action_type: step.action_type,
      target: step.targets.join("\n"),
      fields: deserializeFields(step.action_type, step.message ?? ""),
    })
    props.setActionAccountIds(new Set(step.account_ids))
    props.setQueue((current) => current.filter((_, i) => i !== index))
    props.flash("Step loaded into the builder. Edit it, then Add To Queue.")
  }

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
    <Panel tone="raised" className="space-y-3 xl:sticky xl:top-4 xl:max-h-[calc(100svh-4.5rem)] xl:self-start xl:overflow-auto">
      <SectionLabel
        icon={IconPlayerPlay}
        title="Queue & run"
        trailing={
          props.queue.length ? (
            <Button variant="ghost" size="sm" onClick={() => props.guarded(clearQueue)}>
              Clear
            </Button>
          ) : null
        }
      />
      {/* Armed readout — the queue's live state. The light is dark until the
          queue is actually runnable (steps queued AND accounts selected), then
          goes teal; a red segment surfaces destructive ops at a glance. */}
      <Readout>
        <ReadoutItem
          tone={
            props.queue.length && props.actionAccountIds.size ? "ready" : "idle"
          }
          value={operationCount}
          label={`operations · ${props.queue.length} ${
            props.queue.length === 1 ? "step" : "steps"
          }`}
        />
        {props.queue.length ? (
          <ReadoutItem
            value={`~${formatDuration(estimateSeconds)}`}
            label="est. runtime"
          />
        ) : null}
        {destructiveCount ? (
          <ReadoutItem
            tone="error"
            value={destructiveCount}
            label="destructive"
          />
        ) : null}
      </Readout>

      <QueueTable queue={props.queue} setQueue={props.setQueue} onEdit={editStep} />

      <Disclosure
        flush
        icon={IconBookmarks}
        label="Reusable queues"
        count={props.presets.length || undefined}
      >
        <PresetSection props={props} />
      </Disclosure>

      {/* Safety interlocks stay on as a gauge — they are the personality of a
          guarded console, not config to bury. The dividers render the "·"
          between values; the full editor is one click away under "Adjust". */}
      <div className="space-y-2">
        <Readout>
          <ReadoutItem
            value={`${props.safety.delay_between_accounts}s`}
            label="accounts"
          />
          <ReadoutItem
            value={`${props.safety.delay_between_actions}s`}
            label="actions"
          />
          <ReadoutItem value={props.safety.max_operations} label="cap" />
        </Readout>
        <Disclosure
          flush
          icon={IconAdjustmentsHorizontal}
          label="Adjust delays & limits"
        >
          <SafetyEditor safety={props.safety} setSafety={props.setSafety} dense />
        </Disclosure>
      </div>

      {/* Commit zone — fenced off from the queue above by a hairline so the two
          actions you take ON the queue (run / schedule) read as one group. Run
          is the single filled-teal primary; Schedule… is a quiet outline that
          opens the focused scheduler modal. */}
      <div className="mt-1 space-y-2 border-t border-border pt-4">
      {destructiveCount ? (
        <Callout tone="danger" icon={IconAlertTriangle} className="font-medium">
          {destructiveCount} destructive operation(s) queued.
        </Callout>
      ) : null}

      <Button
        size="comfortable"
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
              description: runConfirmationDetail(
                operationCount,
                props.queue.length,
                destructiveCount,
                estimateSeconds
              ),
              confirmLabel: destructiveCount ? "Run Destructive Queue" : "Run Queue",
              danger: destructiveCount > 0,
            })
            if (!confirmed) return
            const response = await startQueueRun(props.queuePayload)
            props.flash(
              `Queue started: ${response.operation_count} operations.`,
              "success"
            )
            void pollQueueRun(response.run_id)
          })
        }
      >
        {activeRunId
          ? "Queue running…"
          : `Run ${operationCount || ""} operation(s)${
              props.queue.length ? ` · ~${formatDuration(estimateSeconds)}` : ""
            }`}
      </Button>
      <Button
        variant="outline"
        size="comfortable"
        className="w-full"
        disabled={!props.queue.length}
        title={
          props.queue.length
            ? undefined
            : "Add at least one step to the queue first."
        }
        onClick={() => composer.setScheduleOpen(true)}
      >
        <IconClockPlus /> Schedule…
      </Button>
      {!props.queue.length ? (
        <p className="text-center text-xs text-muted-foreground">
          Add steps in the builder, then run or schedule.
        </p>
      ) : null}
      </div>
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
  destructiveCount: number,
  estimateSeconds: number
) {
  const destructive = destructiveCount
    ? ` This includes ${destructiveCount} destructive operation(s).`
    : ""
  const estimate = estimateSeconds
    ? ` Estimated runtime ~${formatDuration(estimateSeconds)}.`
    : ""
  return `${operationCount} operation(s) across ${stepCount} step(s) will run on the selected sessions.${destructive}${estimate}`
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
    <div className="flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 text-sm md:flex-row md:items-center md:justify-between">
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
    <Callout
      tone="primary"
      title={
        <>
          <strong>{quickActionContext.title}</strong>
          <Badge tone="border-primary/30 bg-background text-primary">
            from dialogs
          </Badge>
          <Badge tone="border-border bg-background text-muted-foreground">
            {quickActionContext.count} target(s)
          </Badge>
        </>
      }
    >
      <span className="text-muted-foreground">
        Source: {quickActionContext.targetSummary}
      </span>
    </Callout>
  )
}
