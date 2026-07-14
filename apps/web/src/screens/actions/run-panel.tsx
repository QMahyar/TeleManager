import * as React from "react"

import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconBookmarks,
  IconClockPlus,
  IconFilter,
  IconListDetails,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { ActionFields } from "../../components/action-fields"
import { TargetComposer } from "../../components/target-composer"
import { SafetyEditor } from "../../components/safety-editor"
import {
  Callout,
  Disclosure,
  Field,
  Input,
  Readout,
  ReadoutItem,
  Select,
  TimingBadge,
} from "../../components/ui"
import { api } from "../../lib/api"
import {
  deserializeFields,
  getActionSchema,
  isActionFormValid,
} from "../../lib/action-schema"
import {
  actionDelaySeconds,
  estimateQueueSeconds,
  formatDuration,
  tierForAction,
} from "../../lib/action-meta"
import { actionMeta } from "../../lib/constants"
import {
  conditionFieldOptions,
  conditionOpOptions,
  defaultCondition,
  describeCondition,
} from "../../lib/conditions"
import { rollupByAccount } from "../../components/shell/queue-metrics"
import { buildDraftPayload } from "../../hooks/use-queue-state"
import { startQueueRun } from "../../lib/queue-run"
import type {
  ActionType,
  ConditionField,
  ConditionOp,
  StepCondition,
} from "../../types"
import type { ActionBusy } from "../../hooks/use-action-busy"
import type { ActionsScreenProps } from "../screen-props"

// Actions whose message-id target is unique per chat, so fanning one step across
// several targets makes no sense — warn if more than one is staged.
const SINGLE_TARGET_ACTIONS = new Set<ActionType>([
  "forward_message",
  "edit_message",
  "pin_message",
  "unpin_message",
  "download_media",
])

// The RUN panel — configure the selected action for the batch, then commit. It
// owns everything about a single action (targets, fields, condition, pacing,
// presets) and the two commit paths: run now, or open the scheduler. A single
// action is assembled into a one-step payload via buildDraftPayload.
export function RunPanel({
  props,
  actionBusy,
  activeRunId,
  pollQueueRun,
  onSchedule,
}: {
  props: ActionsScreenProps
  actionBusy: ActionBusy
  activeRunId: string | null
  pollQueueRun: (runId: string) => Promise<void>
  onSchedule: () => void
}) {
  const [submitAttempted, setSubmitAttempted] = React.useState(false)

  const actionType = props.actionDraft.action_type
  const meta = actionMeta[actionType]
  const schema = getActionSchema(actionType)
  const firstAccountId = [...props.actionAccountIds][0] || ""

  const { payload, valid } = buildDraftPayload(
    props.actionDraft,
    props.actionAccountIds,
    props.safety
  )
  const accountCount = props.actionAccountIds.size
  const operationCount = valid.length * accountCount
  const destructiveCount = meta.destructive ? operationCount : 0
  const estimateSeconds = estimateQueueSeconds(
    payload.steps,
    props.safety,
    props.actionsMeta
  )

  const blocker = computeBlocker(props, valid)
  const runDisabled =
    actionBusy.busy || Boolean(activeRunId) || Boolean(blocker)

  const multiTargetWarning =
    SINGLE_TARGET_ACTIONS.has(actionType) && valid.length > 1
      ? "This action uses a message id that is unique per chat. Use one target per step."
      : null

  function runNow() {
    setSubmitAttempted(true)
    if (blocker) return props.flash(blocker)
    actionBusy.runAction("run", async () => {
      if (activeRunId) return props.flash("A run is already in progress.")
      if (!payload.steps.length) return props.flash("Add at least one target.")
      const confirmed = await props.askDialog({
        kicker: destructiveCount ? "Destructive run" : "Run action",
        title: `Run “${meta.label}” on ${valid.length} chat${valid.length === 1 ? "" : "s"}?`,
        description: runConfirmationDetail(
          operationCount,
          accountCount,
          destructiveCount,
          estimateSeconds
        ),
        confirmLabel: destructiveCount ? "Run Destructive Action" : "Run Action",
        danger: destructiveCount > 0,
      })
      if (!confirmed) return
      const response = await startQueueRun(payload)
      props.flash(
        `Run started: ${response.operation_count} operation(s).`,
        "success"
      )
      void pollQueueRun(response.run_id)
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-card p-4 shadow-md xl:sticky xl:top-4 xl:max-h-[calc(100svh-4.5rem)] xl:self-start xl:overflow-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-eyebrow flex items-center gap-2 text-primary-text">
            <IconPlayerPlay className="size-3.5" />
            Run
          </p>
          <h2 className="type-heading mt-1 text-foreground">{meta.label}</h2>
        </div>
        <TimingBadge
          tier={tierForAction(props.actionsMeta, actionType)}
          seconds={actionDelaySeconds(actionType, props.actionsMeta, props.safety)}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{meta.description}</p>

      <Callout
        tone={accountCount ? "primary" : "warning"}
        icon={accountCount ? undefined : IconAlertTriangle}
      >
        {accountCount
          ? `Runs as ${accountCount} selected account${accountCount === 1 ? "" : "s"}.`
          : "No accounts selected. Choose sessions in “Run as” above to run this."}
      </Callout>

      <Field label="Targets">
        <TargetComposer
          value={props.actionDraft.target}
          onChange={(next) =>
            props.setActionDraft((current) => ({ ...current, target: next }))
          }
          actionType={actionType}
          accounts={props.accounts}
          defaultAccountId={firstAccountId}
          flash={props.flash}
        />
      </Field>

      {multiTargetWarning ? (
        <Callout tone="warning" icon={IconAlertTriangle}>
          {multiTargetWarning}
        </Callout>
      ) : null}

      {schema ? (
        <ActionFields
          actionType={actionType}
          values={props.actionDraft.fields}
          setValues={(fields) =>
            props.setActionDraft({ ...props.actionDraft, fields })
          }
          showErrors={submitAttempted}
          flash={props.flash}
        />
      ) : null}

      <ConditionDisclosure
        condition={props.actionDraft.condition}
        setCondition={(condition) =>
          props.setActionDraft({ ...props.actionDraft, condition })
        }
      />

      <Readout>
        <ReadoutItem
          tone={operationCount ? "ready" : "idle"}
          value={operationCount}
          label="operations"
        />
        {operationCount ? (
          <ReadoutItem
            value={`~${formatDuration(estimateSeconds)}`}
            label="est. runtime"
          />
        ) : null}
        {destructiveCount ? (
          <ReadoutItem tone="error" value={destructiveCount} label="destructive" />
        ) : null}
      </Readout>

      {operationCount ? (
        <AccountPreview props={props} />
      ) : null}

      <Disclosure flush icon={IconAdjustmentsHorizontal} label="Pacing & safety">
        <SafetyEditor safety={props.safety} setSafety={props.setSafety} dense />
      </Disclosure>

      <Disclosure
        flush
        icon={IconBookmarks}
        label="Reusable actions"
        count={props.presets.length || undefined}
      >
        <PresetSection props={props} />
      </Disclosure>

      <div className="space-y-2 border-t border-border pt-3">
        {destructiveCount ? (
          <Callout tone="danger" icon={IconAlertTriangle} className="font-medium">
            {destructiveCount} destructive operation(s).
          </Callout>
        ) : null}
        <Button
          size="comfortable"
          className="w-full"
          loading={actionBusy.isPending("run")}
          disabled={runDisabled}
          title={blocker || undefined}
          onClick={runNow}
        >
          {activeRunId
            ? "Run in progress…"
            : `Run on ${valid.length} chat${valid.length === 1 ? "" : "s"}${
                operationCount ? ` · ~${formatDuration(estimateSeconds)}` : ""
              }`}
        </Button>
        <Button
          variant="outline"
          size="comfortable"
          className="w-full"
          disabled={Boolean(blocker)}
          title={blocker || undefined}
          onClick={onSchedule}
        >
          <IconClockPlus /> Schedule…
        </Button>
        {blocker ? (
          <p className="text-center text-xs text-muted-foreground">{blocker}</p>
        ) : null}
      </div>
    </div>
  )
}

// Mirrors the order of run-time checks so the inline hint matches what actually
// blocks the run. Receives already-valid targets, so greyed ones don't count.
function computeBlocker(
  props: ActionsScreenProps,
  validTargets: string[]
): string | null {
  if (!props.actionAccountIds.size) return "Select at least one account."
  if (!validTargets.length) return "Add at least one compatible target."
  if (!isActionFormValid(props.actionDraft.action_type, props.actionDraft.fields)) {
    return "Fill in the required fields."
  }
  return null
}

function runConfirmationDetail(
  operationCount: number,
  accountCount: number,
  destructiveCount: number,
  estimateSeconds: number
) {
  const destructive = destructiveCount
    ? ` This includes ${destructiveCount} destructive operation(s).`
    : ""
  const estimate = estimateSeconds
    ? ` Estimated runtime ~${formatDuration(estimateSeconds)}.`
    : ""
  return `${operationCount} operation(s) across ${accountCount} account(s) will run.${destructive}${estimate}`
}

// Compact per-account preview: the single action re-pivoted by account so you see
// what each session receives before running. Destructive accounts get a red edge.
function AccountPreview({ props }: { props: ActionsScreenProps }) {
  const { payload } = buildDraftPayload(
    props.actionDraft,
    props.actionAccountIds,
    props.safety
  )
  const rollups = rollupByAccount(payload.steps)
  if (!rollups.length) return null
  const labelFor = (id: string) =>
    props.accounts.find((account) => account.id === id)?.label ?? id
  const anyDestructive = rollups.some((rollup) => rollup.destructive > 0)

  return (
    <Disclosure
      flush
      icon={IconListDetails}
      label="Per-account preview"
      count={rollups.length}
      defaultOpen={anyDestructive}
    >
      <div className="space-y-2">
        {rollups.map((rollup) => (
          <div
            key={rollup.accountId}
            className={[
              "flex items-baseline justify-between gap-2 rounded-md border p-2.5 text-xs",
              rollup.destructive
                ? "border-destructive/30 bg-destructive/5"
                : "border-border bg-background/40",
            ].join(" ")}
          >
            <strong className="truncate">{labelFor(rollup.accountId)}</strong>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
              {rollup.ops} ops
              {rollup.destructive ? (
                <span className="text-destructive">
                  {" · "}
                  {rollup.destructive} destructive
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </Disclosure>
  )
}

// Optional per-target guard: each target is checked live at run time and skipped
// if the rule is false. A condition also forces a schedule to the "runner" engine.
function ConditionDisclosure({
  condition,
  setCondition,
}: {
  condition: StepCondition | null
  setCondition: (condition: StepCondition | null) => void
}) {
  const enabled = condition !== null
  const fieldHint = condition
    ? conditionFieldOptions.find((option) => option.value === condition.field)?.hint
    : undefined

  return (
    <Disclosure
      flush
      icon={IconFilter}
      label="Condition"
      hint={
        enabled
          ? `if ${describeCondition(condition)}`
          : "optional — skip targets that don’t match"
      }
      defaultOpen={enabled}
    >
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) =>
              setCondition(event.target.checked ? defaultCondition : null)
            }
          />
          Only run on targets that match a rule (checked live, per target).
        </label>

        {condition ? (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_5rem] gap-2">
              <Select
                aria-label="Condition field"
                value={condition.field}
                onChange={(event) =>
                  setCondition({
                    ...condition,
                    field: event.target.value as ConditionField,
                  })
                }
              >
                {conditionFieldOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Condition operator"
                value={condition.op}
                onChange={(event) =>
                  setCondition({
                    ...condition,
                    op: event.target.value as ConditionOp,
                  })
                }
              >
                {conditionOpOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Condition value"
                type="number"
                min={0}
                value={condition.value}
                onChange={(event) =>
                  setCondition({
                    ...condition,
                    value:
                      event.target.value === "" ? 0 : Number(event.target.value),
                  })
                }
              />
            </div>
            <Callout tone="info">
              {fieldHint} A step with a condition runs only while the app is open
              (it can&apos;t be pre-scheduled for offline delivery).
            </Callout>
          </>
        ) : null}
      </div>
    </Disclosure>
  )
}

// Reusable actions (formerly "reusable queues"): save the current action as a
// one-step preset, or load one back into the draft. Unchanged API (/api/actions/presets).
function PresetSection({ props }: { props: ActionsScreenProps }) {
  const {
    presets,
    actionDraft,
    actionAccountIds,
    safety,
    loadPresets,
    setActionDraft,
    setActionAccountIds,
    setSafety,
    guarded,
    flash,
    askDialog,
  } = props

  function saveCurrent() {
    guarded(async () => {
      const { payload, valid } = buildDraftPayload(
        actionDraft,
        actionAccountIds,
        safety
      )
      if (!valid.length || !actionAccountIds.size) {
        flash("Select accounts and add a target before saving.")
        return
      }
      const name = await askDialog({
        title: "Save action preset",
        description:
          "Name this action so it can be reused later without rebuilding it.",
        confirmLabel: "Save Preset",
        input: { label: "Preset name", placeholder: "Daily digest" },
      })
      if (typeof name !== "string") return
      if (!name) return flash("Preset name cannot be empty.")
      await api("/api/actions/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, queue: payload }),
      })
      flash("Preset saved.", "success")
      await loadPresets()
    })
  }

  function loadPreset(preset: ActionsScreenProps["presets"][number]) {
    const step = preset.queue.steps?.[0]
    if (!step) return flash("This preset has no action to load.")
    setActionDraft({
      action_type: step.action_type,
      target: step.targets.join("\n"),
      fields: deserializeFields(step.action_type, step.message ?? ""),
      condition: step.condition ?? null,
    })
    setActionAccountIds(new Set(step.account_ids))
    setSafety((current) => ({
      ...current,
      delay_between_accounts:
        preset.queue.delay_between_accounts ?? current.delay_between_accounts,
      delay_between_actions:
        preset.queue.delay_between_actions ?? current.delay_between_actions,
      delay_instant: preset.queue.delay_instant ?? current.delay_instant,
      delay_sensitive: preset.queue.delay_sensitive ?? current.delay_sensitive,
      max_operations: preset.queue.max_operations ?? current.max_operations,
    }))
    flash(`Loaded preset: ${preset.name}`)
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" className="w-full" onClick={saveCurrent}>
        Save current action
      </Button>
      {presets.map((preset) => (
        <div
          key={preset.id}
          className="flex items-center gap-2 rounded-md border border-border p-2 text-xs"
        >
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => loadPreset(preset)}
          >
            <span className="truncate">{preset.name}</span>
          </button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete preset ${preset.name}`}
            onClick={() =>
              guarded(async () => {
                const confirmed = await askDialog({
                  title: "Delete preset?",
                  description: `This removes the preset “${preset.name}” permanently.`,
                  confirmLabel: "Delete Preset",
                  danger: true,
                })
                if (!confirmed) return
                await api(`/api/actions/presets/${preset.id}`, {
                  method: "DELETE",
                })
                flash("Preset deleted.", "success")
                await loadPresets()
              })
            }
          >
            <IconTrash />
          </Button>
        </div>
      ))}
      {presets.length === 0 ? (
        <Callout tone="info">Saved actions appear here for one-click reuse.</Callout>
      ) : null}
    </div>
  )
}
