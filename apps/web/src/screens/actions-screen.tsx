import * as React from "react"

import {
  IconArrowsLeftRight,
  IconClockHour4,
  IconHistory,
  IconRefresh,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
import { RunHistory } from "../components/run-history"
import { ScheduledInspector } from "../components/scheduled-inspector"
import { ScheduleCard, ScheduleModal } from "../components/schedule-parts"
import { EmptySchedulesArt } from "../components/empty-illustrations"
import {
  EmptyState,
  Panel,
  SectionTitle,
  Tabs,
} from "../components/ui"
import { useActionBusy } from "../hooks/use-action-busy"
import { buildDraftPayload } from "../hooks/use-queue-state"
import { defaultRecurrenceForm, type RecurrenceForm } from "../lib/schedules"
import type { ActionDraft, SchedulePreview } from "../types"
import { AccountsBar } from "./actions/accounts-bar"
import { ActionPicker } from "./actions/action-picker"
import { ActiveRunBanner } from "./actions/run-banner"
import { RunPanel } from "./actions/run-panel"
import { SyncPanel } from "./actions/sync"
import type { ActionsScreenProps } from "./screen-props"

type BottomTab = "history" | "schedules" | "inspector" | "sync"

export function ActionsScreen(props: ActionsScreenProps) {
  const actionBusy = useActionBusy(props.flash)
  // Run-polling state is owned by app state now (so the footer/rail can show it
  // too); the screen just reads it off props.
  const queueRunner = {
    activeRunId: props.activeRunId,
    activeRun: props.activeRun,
    pollQueueRun: props.pollQueueRun,
    cancelActiveRun: props.cancelActiveRun,
    pauseActiveRun: props.pauseActiveRun,
    resumeActiveRun: props.resumeActiveRun,
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
        pauseActiveRun={queueRunner.pauseActiveRun}
        resumeActiveRun={queueRunner.resumeActiveRun}
        guarded={props.guarded}
        safety={props.safety}
        actionsMeta={props.actionsMeta}
      />
      <AccountsBar props={props} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ActionPicker props={props} />
        <RunPanel
          props={props}
          actionBusy={actionBusy}
          activeRunId={queueRunner.activeRunId}
          pollQueueRun={queueRunner.pollQueueRun}
          onSchedule={() => composer.setScheduleOpen(true)}
        />
      </div>
      <ScheduleModal
        open={composer.scheduleOpen}
        onClose={() => composer.setScheduleOpen(false)}
        queuePayload={
          buildDraftPayload(
            props.actionDraft,
            props.actionAccountIds,
            props.safety
          ).payload
        }
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
            { id: "sync", label: "Sync", icon: IconArrowsLeftRight },
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
        {bottomTab === "sync" ? (
          <SyncPanel
            accounts={props.accounts}
            guarded={props.guarded}
            flash={props.flash}
            pollQueueRun={props.pollQueueRun}
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

function useScheduleComposer(props: ActionsScreenProps) {
  const [scheduleOpen, setScheduleOpen] = React.useState(
    () => props.scheduleSeed?.mode === "schedule"
  )
  const [name, setName] = React.useState("")
  const [form, setForm] = React.useState<RecurrenceForm>(defaultRecurrenceForm)
  // The preview is tagged with the draft it was computed for; it is shown only
  // while that exact draft is still current, so an edit to the action/targets
  // silently invalidates a stale preview with no effect or ref needed.
  const [previewState, setPreviewState] = React.useState<{
    data: SchedulePreview
    draft: ActionDraft
  } | null>(null)

  const setPreview = React.useCallback(
    (data: SchedulePreview | null) =>
      setPreviewState(data ? { data, draft: props.actionDraft } : null),
    [props.actionDraft]
  )
  const preview =
    previewState && previewState.draft === props.actionDraft
      ? previewState.data
      : null

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
