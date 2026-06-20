import * as React from "react"

import { IconClockPlus } from "@tabler/icons-react"

import { Button } from "../ui/button"
import { api } from "../lib/api"
import {
  buildRecurrence,
  defaultRecurrenceForm,
  describeRecurrence,
  endModeOptions,
  engineLabel,
  engineTone,
  intervalUnitOptions,
  validateRecurrence,
  type RecurrenceForm,
} from "../lib/schedules"
import { humanTime } from "../lib/helpers"
import type { Schedule, SchedulePreview, View } from "../types"
import { Badge, Field, Input, Select } from "./ui"

type QueuePayload = {
  steps: Schedule["queue"]["steps"]
  confirm: boolean
  delay_between_accounts: number
  delay_between_actions: number
  max_operations: number
}

export function ScheduleCreator({
  queuePayload,
  queueLength,
  guarded,
  flash,
  loadSchedules,
  setView,
}: {
  queuePayload: QueuePayload
  queueLength: number
  guarded: (work: () => Promise<void>) => Promise<void>
  flash: (message: string) => void
  loadSchedules: () => Promise<void>
  setView: React.Dispatch<React.SetStateAction<View>>
}) {
  const [form, setForm] = React.useState<RecurrenceForm>(defaultRecurrenceForm)
  const [name, setName] = React.useState("")
  const [preview, setPreview] = React.useState<SchedulePreview | null>(null)

  const update = (patch: Partial<RecurrenceForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    setPreview(null)
  }

  function payload() {
    return {
      name: name.trim() || "Untitled schedule",
      queue: { ...queuePayload, confirm: false },
      recurrence: buildRecurrence(form),
    }
  }

  function precheck(): string | null {
    if (!queueLength) return "Add at least one step to the queue first."
    if (name.trim().length < 3) return "Give the schedule a name (3+ characters)."
    return validateRecurrence(form)
  }

  async function previewSchedule() {
    const error = precheck()
    if (error) return flash(error)
    const result = await api<SchedulePreview>("/api/schedules/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    })
    setPreview(result)
    flash(`Schedule preview ready (${result.engine}).`)
  }

  async function createSchedule() {
    const error = precheck()
    if (error) return flash(error)
    await api("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    })
    flash("Schedule created.")
    setName("")
    setForm(defaultRecurrenceForm)
    setPreview(null)
    await loadSchedules()
    setView("schedules")
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <IconClockPlus className="size-4 text-primary" />
        <strong className="text-sm">Schedule this queue instead</strong>
      </div>
      <p className="text-xs text-muted-foreground">
        Repeat the queue above on an interval. Text-only queues are delivered by
        Telegram and keep firing even when TeleManager is closed; anything else
        runs only while the app is open.
      </p>

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

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Repeat every">
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
                update({
                  intervalUnit: event.target
                    .value as RecurrenceForm["intervalUnit"],
                })
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
              update({
                startMode: event.target.value as RecurrenceForm["startMode"],
              })
            }
          >
            <option value="now">After the first interval</option>
            <option value="at">At a specific time</option>
          </Select>
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

      <p className="text-xs text-muted-foreground">
        {describeRecurrence(buildRecurrence(form))}
      </p>

      {preview ? <SchedulePreviewCard preview={preview} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!queueLength}
          onClick={() => guarded(previewSchedule)}
        >
          Preview Schedule
        </Button>
        <Button disabled={!queueLength} onClick={() => guarded(createSchedule)}>
          <IconClockPlus /> Create Schedule
        </Button>
      </div>
    </div>
  )
}

function SchedulePreviewCard({ preview }: { preview: SchedulePreview }) {
  return (
    <div className="space-y-2 border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={engineTone(preview.engine)}>
          {engineLabel(preview.engine)}
        </Badge>
        <span className="text-muted-foreground">
          {preview.operations_per_fire} operation(s) per fire
          {preview.fires_planned ? ` · ${preview.fires_planned} fire(s)` : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{preview.engine_reason}</p>
      {preview.upcoming.length ? (
        <p className="text-xs text-muted-foreground">
          Next: {preview.upcoming.map((time) => humanTime(time)).join(" · ")}
        </p>
      ) : null}
      {preview.coverage_until ? (
        <p className="text-xs text-muted-foreground">
          Offline coverage through {humanTime(preview.coverage_until)} (reopen to
          extend).
        </p>
      ) : null}
      {preview.warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ))}
    </div>
  )
}
