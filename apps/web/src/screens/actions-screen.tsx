import * as React from "react"

import { IconLoader2, IconTrash } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

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
  SectionTitle,
  Select,
  Textarea,
} from "../components/ui"
import { api } from "../lib/api"
import { actionMeta, categoryLabels, categoryOrder } from "../lib/constants"
import { accountStatus, statusTone } from "../lib/helpers"
import type { ActionType, QueueRun } from "../types"
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
  const queueRunner = useQueueRunPolling(
    props.loadRuns,
    props.refresh,
    props.flash
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <ActionAccountsPanel props={props} />
      <ActionQueuePanel
        props={props}
        activeRunId={queueRunner.activeRunId}
        pollQueueRun={queueRunner.pollQueueRun}
        preview={preview}
        setPreview={setPreview}
      />
    </div>
  )
}

function useQueueRunPolling(
  loadRuns: ActionsScreenProps["loadRuns"],
  refresh: ActionsScreenProps["refresh"],
  flash: ActionsScreenProps["flash"]
) {
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null)

  async function pollQueueRun(runId: string) {
    setActiveRunId(runId)
    try {
      for (;;) {
        const payload = await api<{ run: QueueRun }>(
          `/api/actions/queue/runs/${runId}`
        )
        const run = payload.run
        await loadRuns()
        if (TERMINAL_RUN_STATUSES.has(run.status)) {
          await refresh()
          flash(
            `Queue ${run.status}: ${run.completed_count || 0}/${run.operation_count || 0} succeeded.`
          )
          break
        }
        await wait(1200)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Queue polling failed.")
    } finally {
      setActiveRunId(null)
    }
  }

  return { activeRunId, pollQueueRun }
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

  return (
    <Panel className="space-y-4">
      <SectionTitle
        kicker="Per-page selection"
        title="Action Accounts"
        detail={`${actionAccountIds.size} selected`}
      />
      <div className="flex gap-2">
        <Button
          variant={OUTLINE_VARIANT}
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
          Select Ready
        </Button>
        <Button
          variant={OUTLINE_VARIANT}
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
        {accounts.map((account) => (
          <label
            key={account.id}
            className="flex items-center gap-3 border border-border p-3 text-sm"
          >
            <input
              type="checkbox"
              aria-label={`Use ${account.label || account.session_name} for queued actions`}
              checked={actionAccountIds.has(account.id)}
              onChange={() => toggleSelected(account.id, setActionAccountIds)}
            />
            <span className="min-w-0 flex-1 truncate">
              {account.label || account.session_name}
            </span>
            <Badge tone={statusTone(accountStatus(account))}>
              {accountStatus(account)}
            </Badge>
          </label>
        ))}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <SectionTitle kicker="Reusable queues" title="Presets" />
        <Button
          variant={OUTLINE_VARIANT}
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
                input: {
                  label: "Preset name",
                  placeholder: "Warmup queue",
                },
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
          Save Queue
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
    </Panel>
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
            await api(`/api/actions/presets/${preset.id}`, {
              method: "DELETE",
            })
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
  activeRunId,
  pollQueueRun,
  preview,
  setPreview,
}: {
  props: ActionsScreenProps
  activeRunId: string | null
  pollQueueRun: (runId: string) => Promise<void>
  preview: QueuePreview | null
  setPreview: React.Dispatch<React.SetStateAction<QueuePreview | null>>
}) {
  const currentMeta = actionMeta[props.actionDraft.action_type]

  return (
    <Panel className="space-y-5">
      <SectionTitle
        kicker="Build then run"
        title="Action Queue"
        detail="Select accounts, add one or more queued steps, preview, then run with conservative delays."
      />
      <QuickActionNotice quickActionContext={props.quickActionContext} />
      <QueueBuilderForm
        props={props}
        currentMeta={currentMeta}
        setPreview={setPreview}
      />
      <SafetyEditor safety={props.safety} setSafety={props.setSafety} />
      <QueueTable queue={props.queue} setQueue={props.setQueue} />
      <label className="flex gap-3 border border-border bg-muted/30 p-3 text-sm">
        <input
          type="checkbox"
          aria-label="Confirm reviewed queue"
          checked={props.confirmed}
          onChange={(event) => props.setConfirmed(event.target.checked)}
        />
        <span>
          I reviewed the queue and confirm it should run only on the selected
          sessions and targets.
        </span>
      </label>
      <QueueRunControls
        activeRunId={activeRunId}
        pollQueueRun={pollQueueRun}
        previewQueue={async () => {
          const payload = await api<QueuePreview>(
            "/api/actions/queue/preview",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...props.queuePayload,
                confirm: false,
              }),
            }
          )
          setPreview(payload)
          props.flash(`Preview ready: ${payload.operation_count} operations.`)
        }}
        props={props}
      />
      <QueuePreviewSummary preview={preview} />
      <RunHistory
        runs={props.runs}
        guarded={props.guarded}
        loadRuns={props.loadRuns}
        flash={props.flash}
        askDialog={props.askDialog}
        onRetryQueued={pollQueueRun}
      />
    </Panel>
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

function QueueBuilderForm({
  props,
  currentMeta,
  setPreview,
}: {
  props: ActionsScreenProps
  currentMeta: (typeof actionMeta)[ActionType]
  setPreview: React.Dispatch<React.SetStateAction<QueuePreview | null>>
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Field label="Action">
        <Select
          value={props.actionDraft.action_type}
          onChange={(event) => {
            props.setQuickActionContext(null)
            props.setActionDraft({
              ...props.actionDraft,
              action_type: event.target.value as ActionType,
              message: "",
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
        <Input
          value={props.actionDraft.target}
          maxLength={500}
          autoComplete="off"
          onChange={(event) =>
            props.setActionDraft({
              ...props.actionDraft,
              target: event.target.value,
            })
          }
          placeholder={currentMeta.targetHint}
        />
      </Field>
      <div className="col-span-full">
        <p className="mb-1 text-xs text-muted-foreground">
          {currentMeta.description}
        </p>
        <TargetPreview
          value={props.actionDraft.target}
          actionType={props.actionDraft.action_type}
        />
      </div>
      {currentMeta.needsMessage ? (
        <Field
          label={
            props.actionDraft.action_type === "forward_message"
              ? "Source (chat:message_id)"
              : "Message text"
          }
        >
          <Textarea
            value={props.actionDraft.message}
            maxLength={4000}
            autoComplete="off"
            onChange={(event) =>
              props.setActionDraft({
                ...props.actionDraft,
                message: event.target.value,
              })
            }
            placeholder={currentMeta.messagePlaceholder || "Message text"}
          />
        </Field>
      ) : null}
      <div className="grid content-end gap-2">
        <Button
          type="button"
          onClick={props.addQueueStep}
          disabled={props.loading}
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
    </div>
  )
}

function QueueRunControls({
  activeRunId,
  pollQueueRun,
  previewQueue,
  props,
}: {
  activeRunId: string | null
  pollQueueRun: (runId: string) => Promise<void>
  previewQueue: () => Promise<void>
  props: ActionsScreenProps
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={OUTLINE_VARIANT}
        onClick={() => props.guarded(previewQueue)}
      >
        Preview Queue
      </Button>
      <Button
        disabled={props.loading || Boolean(activeRunId)}
        onClick={() =>
          props.guarded(async () => {
            if (activeRunId) {
              return props.flash("A queue is already running.")
            }
            if (!props.confirmed) {
              return props.flash("Confirm the reviewed queue first.")
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
            props.flash(
              `Queue started: ${response.operation_count} operations.`
            )
            void pollQueueRun(response.run_id)
          })
        }
      >
        {props.loading ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : null}
        Run Queue
      </Button>
      <Button
        variant={OUTLINE_VARIANT}
        onClick={() => props.guarded(props.loadRuns)}
      >
        Refresh Runs
      </Button>
    </div>
  )
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function QueuePreviewSummary({ preview }: { preview: QueuePreview | null }) {
  if (!preview) {
    return null
  }

  return (
    <div className="space-y-2 border border-border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <strong>
          {preview.operation_count} operations · {preview.step_count} steps
        </strong>
        {preview.unauthorized_count ? (
          <Badge tone="bg-warning/15 text-warning border-warning/30">
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
