import {
  IconBolt,
  IconClockPlus,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
import { ModalShell } from "../ui/modal"

import { api } from "../lib/api"
import { actionMeta } from "../lib/constants"
import { humanTime, statusTone } from "../lib/helpers"
import { classifyScheduleEngine } from "../lib/scheduling"
import {
  buildRecurrence,
  defaultRecurrenceForm,
  describeRecurrence,
  endModeOptions,
  engineLabel,
  engineTone,
  intervalUnitOptions,
  recurrencePresets,
  startModeOptions,
  validateRecurrence,
  type RecurrenceForm,
} from "../lib/schedules"
import type {
  ActionType,
  AskDialog,
  Flash,
  QueueStep,
  SafetySettings,
  Schedule,
  SchedulePreview,
} from "../types"
import { Badge, Field, Input, Select } from "./ui"

// Reusable, presentation-only schedule pieces shared by the merged Actions page.
// Extracted (verbatim) from the former schedule-builder.tsx and schedules-screen.tsx
// so scheduling can fold into the Actions workflow without duplicating UI.

const TERMINAL_STATUSES = new Set(["completed", "canceled"])

export function RecurrenceFields({
  form,
  setForm,
}: {
  form: RecurrenceForm
  setForm: (next: RecurrenceForm) => void
}) {
  const update = (patch: Partial<RecurrenceForm>) =>
    setForm({ ...form, ...patch })

  return (
    <section className="space-y-3">
      {/* One-click cadences fill the form below, then stay editable — most
          schedules are a common pattern ("hourly", "daily at 9am") plus a tweak,
          so the preset is the starting point, not a separate mode. */}
      <div className="space-y-1.5">
        <span className="type-label text-muted-foreground">Quick presets</span>
        <div className="flex flex-wrap gap-1.5">
          {recurrencePresets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setForm(preset.build())}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Every">
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              autoComplete="off"
              value={form.intervalValue}
              onChange={(event) => update({ intervalValue: event.target.value })}
            />
            <Select
              value={form.intervalUnit}
              onChange={(event) =>
                update({ intervalUnit: event.target.value as RecurrenceForm["intervalUnit"] })
              }
            >
              {intervalUnitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </Field>

        <Field label="Ends">
          <Select
            value={form.endMode}
            onChange={(event) =>
              update({ endMode: event.target.value as RecurrenceForm["endMode"] })
            }
          >
            {endModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts">
          <Select
            value={form.startMode}
            onChange={(event) =>
              update({ startMode: event.target.value as RecurrenceForm["startMode"] })
            }
          >
            {startModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {form.startMode === "delay" ? (
            <div className="mt-2 flex gap-2">
              <Input
                type="number"
                min={1}
                autoComplete="off"
                value={form.startDelayValue}
                onChange={(event) => update({ startDelayValue: event.target.value })}
              />
              <Select
                value={form.startDelayUnit}
                onChange={(event) =>
                  update({ startDelayUnit: event.target.value as RecurrenceForm["startDelayUnit"] })
                }
              >
                {intervalUnitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {form.startMode === "at" ? (
            <Input
              type="datetime-local"
              className="mt-2"
              value={form.startAt}
              onChange={(event) => update({ startAt: event.target.value })}
            />
          ) : null}
        </Field>

        {form.endMode === "count" ? (
          <Field label="Number of times">
            <Input
              type="number"
              min={1}
              autoComplete="off"
              value={form.endCount}
              onChange={(event) => update({ endCount: event.target.value })}
            />
          </Field>
        ) : null}
        {form.endMode === "until" ? (
          <Field label="End date/time">
            <Input
              type="datetime-local"
              value={form.endUntil}
              onChange={(event) => update({ endUntil: event.target.value })}
            />
          </Field>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={form.stagger}
          onChange={(event) => update({ stagger: event.target.checked })}
        />
        Stagger sends across chats (offset each chat by ~30s so identical
        messages don’t all fire at once)
      </label>
    </section>
  )
}

export function SchedulePreviewCard({ preview }: { preview: SchedulePreview }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={engineTone(preview.engine)}>
          {engineLabel(preview.engine)}
        </Badge>
        {preview.fully_offline ? (
          <Badge tone="text-primary-text border-primary/30 bg-primary/10">
            Fully offline · {preview.total_messages} message(s) pre-scheduled
          </Badge>
        ) : null}
        <span className="text-muted-foreground">
          {preview.operations_per_fire} per fire
          {preview.fires_planned ? ` · ${preview.fires_planned} fire(s)` : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{preview.engine_reason}</p>
      {preview.upcoming.length ? (
        <p className="text-xs text-muted-foreground">
          First fires: {preview.upcoming.map((time) => humanTime(time)).join(" · ")}
        </p>
      ) : null}
      {preview.coverage_until ? (
        <p className="text-xs text-muted-foreground">
          Offline coverage through {humanTime(preview.coverage_until)}
          {preview.fully_offline ? "." : " (reopen to extend)."}
        </p>
      ) : null}
      {preview.warnings.map((warning) => (
        <p key={warning} className="text-xs text-warning">
          {warning}
        </p>
      ))}
    </div>
  )
}

// `queuePayload.steps` is the same array the builder edits (`{ steps: queue, ...safety }`),
// so the modal derives its header summary and empty-guard straight from it.
type QueuePayload = { steps: QueueStep[] } & SafetySettings

function queueStepsSummary(steps: QueueStep[]): string {
  const ops = steps.reduce(
    (total, step) => total + step.account_ids.length * step.targets.length,
    0
  )
  const first = steps[0]
  const firstLabel = first
    ? actionMeta[first.action_type as ActionType]?.label || first.action_type
    : ""
  return `${ops} op${ops === 1 ? "" : "s"} · ${steps.length} step${
    steps.length === 1 ? "" : "s"
  }${firstLabel ? ` · ${firstLabel}` : ""}`
}

// The scheduler, lifted out of the cramped Actions rail into a focused modal so the
// recurrence form gets room to lay out two-up. It builds a schedule from the SAME
// queue the run-now path uses — a schedule is just "this queue, on a cadence", so the
// create/preview payload (ScheduleRequest.queue = ActionQueueRequest) matches directly.
export function ScheduleModal({
  open,
  onClose,
  queuePayload,
  form,
  setForm,
  name,
  setName,
  preview,
  setPreview,
  guarded,
  flash,
  loadSchedules,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  queuePayload: QueuePayload
  form: RecurrenceForm
  setForm: (next: RecurrenceForm) => void
  name: string
  setName: (next: string) => void
  preview: SchedulePreview | null
  setPreview: (preview: SchedulePreview | null) => void
  guarded: (work: () => Promise<void>) => Promise<void>
  flash: Flash
  loadSchedules: () => Promise<void>
  onCreated: () => void
}) {
  const steps = queuePayload.steps
  const { engine, blockers } = classifyScheduleEngine(steps)

  function scheduleBlocker(): string | null {
    if (!steps.length) return "Add at least one step to the queue first."
    if (name.trim().length < 3) return "Name the schedule (3+ characters)."
    return validateRecurrence(form)
  }

  function schedulePayload() {
    return {
      name: name.trim(),
      queue: queuePayload,
      recurrence: buildRecurrence(form),
    }
  }

  async function previewSchedule() {
    const blocker = scheduleBlocker()
    if (blocker) return flash(blocker)
    const result = await api<SchedulePreview>("/api/schedules/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedulePayload()),
    })
    setPreview(result)
    flash(`Preview ready (${result.engine}).`)
  }

  async function createSchedule() {
    const blocker = scheduleBlocker()
    if (blocker) return flash(blocker)
    await api("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedulePayload()),
    })
    flash("Schedule created.", "success")
    setName("")
    setForm(defaultRecurrenceForm)
    setPreview(null)
    await loadSchedules()
    onCreated()
  }

  const blocker = scheduleBlocker()

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="lg"
      kicker="Automation"
      title="Schedule this queue"
      description={
        <span className="font-mono text-xs">
          {steps.length ? queueStepsSummary(steps) : "Queue is empty"}
        </span>
      }
      footer={
        <>
          <p
            className={`mr-auto text-xs ${blocker ? "text-muted-foreground" : "text-primary-text"}`}
          >
            {blocker || "Ready to schedule."}
          </p>
          <Button variant="outline" onClick={() => guarded(previewSchedule)}>
            Preview
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => guarded(createSchedule)}>
            <IconClockPlus /> Create Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Action-aware engine signal, shown up front (not just after Preview) so
            the operator knows whether this queue is delivered by Telegram offline
            or only runs while the app is open — and exactly which steps decide it. */}
        {steps.length ? (
          <div
            className={`rounded-md border p-2.5 text-xs leading-5 ${engineTone(engine)}`}
          >
            {engine === "native" ? (
              <>
                <strong>Delivered by Telegram.</strong> Every step is pre-scheduled
                server-side, so this runs even while TeleManager is closed.
              </>
            ) : (
              <>
                <strong>Runs only while TeleManager is open.</strong> Telegram can&apos;t
                pre-schedule: {blockers.join(", ")}. Keep the app running for these to
                fire on time.
              </>
            )}
          </div>
        ) : null}
        <RecurrenceFields
          form={form}
          setForm={(next) => {
            setForm(next)
            setPreview(null)
          }}
        />
        <Field label="Schedule name">
          <Input
            value={name}
            maxLength={80}
            autoComplete="off"
            placeholder="Daily hello"
            onChange={(event) => {
              setName(event.target.value)
              setPreview(null)
            }}
          />
        </Field>
        <p className="rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
          {describeRecurrence(buildRecurrence(form))}
        </p>
        {preview ? <SchedulePreviewCard preview={preview} /> : null}
      </div>
    </ModalShell>
  )
}

function summarizeQueue(schedule: Schedule): string {
  const steps = schedule.queue.steps || []
  if (!steps.length) return "no steps"
  const first = steps[0]
  const label = actionMeta[first.action_type as ActionType]?.label || first.action_type
  const targetCount = steps.reduce((total, step) => total + step.targets.length, 0)
  const suffix = steps.length > 1 ? ` +${steps.length - 1} more step(s)` : ""
  return `${label} → ${targetCount} target(s)${suffix}`
}

export function ScheduleCard({
  schedule,
  guarded,
  flash,
  askDialog,
  loadSchedules,
}: {
  schedule: Schedule
  guarded: (work: () => Promise<void>) => Promise<void>
  flash: Flash
  askDialog: AskDialog
  loadSchedules: () => Promise<void>
}) {
  const terminal = TERMINAL_STATUSES.has(schedule.status)
  const planned = schedule.fires_planned
  const progress =
    planned != null
      ? `${schedule.fires_done || 0}/${planned} fired`
      : `${schedule.fires_done || 0} fired`

  async function patchStatus(status: "active" | "paused") {
    await api(`/api/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    flash(
      status === "active" ? "Schedule resumed." : "Schedule paused.",
      "success"
    )
    await loadSchedules()
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border px-3 py-2 text-sm md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="truncate">{schedule.name}</strong>
          <Badge tone={statusTone(schedule.status)}>{schedule.status}</Badge>
          <Badge tone={engineTone(schedule.engine)}>
            {engineLabel(schedule.engine)}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {describeRecurrence(schedule.recurrence)} · {summarizeQueue(schedule)}
        </p>
        <p className="text-xs text-muted-foreground">
          {progress}
          {schedule.next_fire_at && !terminal
            ? ` · next ${humanTime(schedule.next_fire_at)}`
            : ""}
          {schedule.last_fire_at
            ? ` · last ${humanTime(schedule.last_fire_at)}`
            : ""}
        </p>
        {schedule.engine === "native" && schedule.coverage_until ? (
          <p className="truncate text-xs text-muted-foreground">
            Offline through {humanTime(schedule.coverage_until)}. Reopen TeleManager to extend.
          </p>
        ) : null}
        {schedule.last_error ? (
          <p className="text-xs text-destructive">{schedule.last_error}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 md:justify-end md:self-start">
        {!terminal && schedule.status !== "paused" ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => guarded(() => patchStatus("paused"))}
          >
            <IconPlayerPause /> Pause
          </Button>
        ) : null}
        {!terminal && schedule.status === "paused" ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => guarded(() => patchStatus("active"))}
          >
            <IconPlayerPlay /> Resume
          </Button>
        ) : null}
        {!terminal ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              guarded(async () => {
                await api(`/api/schedules/${schedule.id}/run-now`, {
                  method: "POST",
                })
                flash("Immediate run started.", "success")
                await loadSchedules()
              })
            }
          >
            <IconBolt /> Run Now
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="destructive"
          onClick={() =>
            guarded(async () => {
              const confirmed = await askDialog({
                title: "Delete schedule?",
                description:
                  schedule.engine === "native"
                    ? "This removes the schedule and deletes any messages it pre-scheduled in Telegram."
                    : "This removes the schedule. It will stop firing.",
                confirmLabel: "Delete Schedule",
                danger: true,
              })
              if (!confirmed) return
              await api(`/api/schedules/${schedule.id}`, { method: "DELETE" })
              flash("Schedule deleted.", "success")
              await loadSchedules()
            })
          }
        >
          <IconTrash /> Delete
        </Button>
      </div>
    </div>
  )
}
