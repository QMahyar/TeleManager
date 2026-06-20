import {
  IconBolt,
  IconClockHour4,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "../ui/button"

import { api } from "../lib/api"
import { actionMeta } from "../lib/constants"
import { humanTime, statusTone } from "../lib/helpers"
import {
  describeRecurrence,
  engineLabel,
  engineTone,
} from "../lib/schedules"
import type { ActionType, Schedule } from "../types"
import { Badge, EmptyState, Panel, SectionTitle } from "../components/ui"
import type { SchedulesScreenProps } from "./screen-props"

const TERMINAL_STATUSES = new Set(["completed", "canceled"])

export function SchedulesScreen({
  schedules,
  loadSchedules,
  setView,
  guarded,
  flash,
  askDialog,
}: SchedulesScreenProps) {
  return (
    <Panel className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionTitle
          kicker="Automation"
          title="Schedules"
          detail="Recurring queues. Text-only schedules are delivered by Telegram and survive closing the app; others run only while TeleManager is open."
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => guarded(loadSchedules)}>
            Refresh
          </Button>
          <Button onClick={() => setView("actions")}>New Schedule</Button>
        </div>
      </div>

      {schedules.length ? (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              guarded={guarded}
              flash={flash}
              askDialog={askDialog}
              loadSchedules={loadSchedules}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={IconClockHour4}
          title="No schedules yet"
          detail="Build a queue on the Actions screen, then use “Schedule this queue” to repeat it on an interval."
        />
      )}
    </Panel>
  )
}

function ScheduleCard({
  schedule,
  guarded,
  flash,
  askDialog,
  loadSchedules,
}: {
  schedule: Schedule
  guarded: SchedulesScreenProps["guarded"]
  flash: SchedulesScreenProps["flash"]
  askDialog: SchedulesScreenProps["askDialog"]
  loadSchedules: SchedulesScreenProps["loadSchedules"]
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
    flash(status === "active" ? "Schedule resumed." : "Schedule paused.")
    await loadSchedules()
  }

  return (
    <div className="grid gap-3 border border-border p-3 text-sm md:grid-cols-[1fr_auto]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong>{schedule.name}</strong>
          <Badge tone={statusTone(schedule.status)}>{schedule.status}</Badge>
          <Badge tone={engineTone(schedule.engine)}>
            {engineLabel(schedule.engine)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">
            Offline coverage through {humanTime(schedule.coverage_until)} (reopen
            TeleManager to extend).
          </p>
        ) : null}
        {schedule.last_error ? (
          <p className="text-xs text-destructive">{schedule.last_error}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 md:justify-end md:self-start">
        {!terminal && schedule.status !== "paused" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => guarded(() => patchStatus("paused"))}
          >
            <IconPlayerPause /> Pause
          </Button>
        ) : null}
        {!terminal && schedule.status === "paused" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => guarded(() => patchStatus("active"))}
          >
            <IconPlayerPlay /> Resume
          </Button>
        ) : null}
        {!terminal ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              guarded(async () => {
                await api(`/api/schedules/${schedule.id}/run-now`, {
                  method: "POST",
                })
                flash("Immediate run started.")
                await loadSchedules()
              })
            }
          >
            <IconBolt /> Run Now
          </Button>
        ) : null}
        <Button
          size="sm"
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
              flash("Schedule deleted.")
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

function summarizeQueue(schedule: Schedule): string {
  const steps = schedule.queue.steps || []
  if (!steps.length) return "no steps"
  const first = steps[0]
  const label = actionMeta[first.action_type as ActionType]?.label || first.action_type
  const targetCount = steps.reduce((total, step) => total + step.targets.length, 0)
  const suffix = steps.length > 1 ? ` +${steps.length - 1} more step(s)` : ""
  return `${label} → ${targetCount} target(s)${suffix}`
}
