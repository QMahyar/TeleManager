import * as React from "react"

import { IconLoader2, IconTrash } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { QueueTable } from "../components/queue-table"
import { RunHistory } from "../components/run-history"
import { SafetyEditor } from "../components/safety-editor"
import { TargetPreview } from "../components/target-preview"
import {
  Badge,
  Field,
  Input,
  Panel,
  SectionTitle,
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
  const {
    accounts,
    actionAccountIds,
    setActionAccountIds,
    toggleSelected,
    presets,
    queue,
    setQueue,
    queuePayload,
    loadPresets,
    safety,
    setSafety,
    actionDraft,
    setActionDraft,
    confirmed,
    setConfirmed,
    addQueueStep,
    runs,
    loadRuns,
    refresh,
    guarded,
    flash,
    askDialog,
    loading,
  } = props
  const [preview, setPreview] = React.useState<QueuePreview | null>(null)
  const activeRunIdRef = React.useRef<string | null>(null)

  const currentMeta = actionMeta[actionDraft.action_type]

  async function pollQueueRun(runId: string) {
    activeRunIdRef.current = runId
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const payload = await api<{ run: QueueRun }>(
          `/api/actions/queue/runs/${runId}`
        )
        const run = payload.run
        await loadRuns()
        if (
          ["completed", "failed", "canceled", "interrupted"].includes(
            run.status
          )
        ) {
          await refresh()
          flash(
            `Queue ${run.status}: ${run.completed_count || 0}/${run.operation_count || 0} succeeded.`
          )
          break
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200))
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Queue polling failed.")
    } finally {
      activeRunIdRef.current = null
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Per-page selection"
          title="Action Accounts"
          detail={`${actionAccountIds.size} selected`}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
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
            variant="outline"
            onClick={() => setActionAccountIds(new Set())}
          >
            Clear
          </Button>
        </div>
        <div className="max-h-72 space-y-2 overflow-auto">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add accounts first.</p>
          ) : null}
          {accounts.map((account) => (
            <label
              key={account.id}
              className="flex items-center gap-3 border border-border p-3 text-sm"
            >
              <input
                type="checkbox"
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
            variant="outline"
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
            Save Queue
          </Button>
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-2 border border-border p-2 text-sm"
            >
              <button
                className="flex-1 text-left"
                onClick={() => {
                  setQueue(preset.queue.steps || [])
                  const pq = preset.queue
                  setSafety((s) => ({
                    delay_between_accounts:
                      pq.delay_between_accounts ?? s.delay_between_accounts,
                    delay_between_actions:
                      pq.delay_between_actions ?? s.delay_between_actions,
                    max_operations: pq.max_operations ?? s.max_operations,
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
                      description: `This removes the preset \"${preset.name}\" permanently.`,
                      confirmLabel: "Delete Preset",
                      danger: true,
                    })
                    if (!confirmed) return
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
          ))}
          {presets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved presets yet.
            </p>
          ) : null}
        </div>
      </Panel>
      <Panel className="space-y-5">
        <SectionTitle
          kicker="Build then run"
          title="Action Queue"
          detail="Select accounts, add one or more queued steps, preview, then run with conservative delays."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Action">
            <select
              className="w-full border border-border bg-background px-3 py-2 text-sm"
              value={actionDraft.action_type}
              onChange={(e) =>
                setActionDraft({
                  ...actionDraft,
                  action_type: e.target.value as ActionType,
                  message: "",
                })
              }
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
            </select>
          </Field>
          <Field label="Targets">
            <Input
              value={actionDraft.target}
              maxLength={500}
              autoComplete="off"
              onChange={(e) =>
                setActionDraft({
                  ...actionDraft,
                  target: e.target.value,
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
              value={actionDraft.target}
              actionType={actionDraft.action_type}
            />
          </div>
          {currentMeta.needsMessage ? (
            <Field
              label={
                actionDraft.action_type === "forward_message"
                  ? "Source (chat:message_id)"
                  : "Message text"
              }
            >
              <Textarea
                value={actionDraft.message}
                maxLength={4000}
                autoComplete="off"
                onChange={(e) =>
                  setActionDraft({
                    ...actionDraft,
                    message: e.target.value,
                  })
                }
                placeholder={currentMeta.messagePlaceholder || "Message text"}
              />
            </Field>
          ) : null}
          <div className="grid content-end gap-2">
            <Button type="button" onClick={addQueueStep} disabled={loading}>
              {loading ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : null}
              Add To Queue
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                guarded(async () => {
                  if (!queue.length) return flash("Queue is already empty.")
                  const confirmedClear = await askDialog({
                    title: "Clear action queue?",
                    description:
                      "This removes all queued steps from the builder. Running queue history is not affected.",
                    confirmLabel: "Clear Queue",
                    danger: true,
                  })
                  if (!confirmedClear) return
                  setQueue([])
                  setPreview(null)
                  flash("Queue cleared.")
                })
              }
            >
              Clear Queue
            </Button>
          </div>
        </div>
        <SafetyEditor safety={safety} setSafety={setSafety} />
        <QueueTable queue={queue} setQueue={setQueue} />
        <label className="flex gap-3 border border-border bg-muted/30 p-3 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I reviewed the queue and confirm it should run only on the selected
            sessions and targets.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              guarded(async () => {
                const payload = await api<QueuePreview>(
                  "/api/actions/queue/preview",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ...queuePayload,
                      confirm: false,
                    }),
                  }
                )
                setPreview(payload)
                flash(`Preview ready: ${payload.operation_count} operations.`)
              })
            }
          >
            Preview Queue
          </Button>
          <Button
            disabled={loading}
            onClick={() =>
              guarded(async () => {
                if (activeRunIdRef.current) {
                  return flash("A queue is already running.")
                }
                if (!confirmed)
                  return flash("Confirm the reviewed queue first.")
                const response = await api<{
                  run_id: string
                  status: string
                  operation_count: number
                }>("/api/actions/queue/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(queuePayload),
                })
                flash(`Queue started: ${response.operation_count} operations.`)
                await pollQueueRun(response.run_id)
              })
            }
          >
            {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
            Run Queue
          </Button>
          <Button variant="outline" onClick={() => guarded(loadRuns)}>
            Refresh Runs
          </Button>
        </div>
        <QueuePreviewSummary preview={preview} />
        <RunHistory
          runs={runs}
          guarded={guarded}
          loadRuns={loadRuns}
          flash={flash}
          askDialog={askDialog}
          onRetryQueued={pollQueueRun}
        />
      </Panel>
    </div>
  )
}

function QueuePreviewSummary({ preview }: { preview: QueuePreview | null }) {
  if (!preview) return null

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
