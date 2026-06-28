import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconBookmarks,
  IconClockPlus,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { QueueTable } from "../../components/queue-table"
import { SafetyEditor } from "../../components/safety-editor"
import {
  Callout,
  Disclosure,
  Panel,
  Readout,
  ReadoutItem,
} from "../../components/ui"
import { api } from "../../lib/api"
import { deserializeFields } from "../../lib/action-schema"
import { estimateQueueSeconds, formatDuration } from "../../lib/action-meta"
import { actionMeta } from "../../lib/constants"
import { startQueueRun } from "../../lib/queue-run"
import type { QueueStep } from "../../types"
import type { ActionsScreenProps } from "../screen-props"
import type { ActionBusy } from "../../hooks/use-action-busy"
import { SectionLabel } from "./section-label"

export function QueueColumn({
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
  composer: { setScheduleOpen: (open: boolean) => void }
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
