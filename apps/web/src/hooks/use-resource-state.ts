import * as React from "react"

import { api } from "../lib/api"
import { emptySafety } from "../lib/constants"
import type {
  ActionsMeta,
  ActivityEvent,
  AppSettings,
  Preset,
  QueueRun,
  SafetySettings,
  Schedule,
  View,
} from "../types"

// Photos default to on until the backend setting loads, matching the backend
// default so dialogs don't flicker gradient→photo on first paint.
const defaultAppSettings: AppSettings = { show_dialog_photos: true }

export function useResourceState(flash: (message: string) => void, view: View) {
  const [activity, setActivity] = React.useState<ActivityEvent[]>([])
  const [runs, setRuns] = React.useState<QueueRun[]>([])
  const [presets, setPresets] = React.useState<Preset[]>([])
  const [schedules, setSchedules] = React.useState<Schedule[]>([])
  const [safety, setSafety] = React.useState<SafetySettings>(emptySafety)
  const [appSettings, setAppSettings] =
    React.useState<AppSettings>(defaultAppSettings)
  const [actionsMeta, setActionsMeta] = React.useState<ActionsMeta | null>(null)
  const safetyLoaded = React.useRef(false)

  // Per-action metadata (risk tiers, validity, flags) — the canonical source the
  // timing badges and run-duration estimates read. Fetched once at startup since
  // it's small and rarely changes (only when safety delays are re-saved).
  const loadActionsMeta = React.useCallback(async () => {
    const payload = await api<ActionsMeta>("/api/actions/meta")
    setActionsMeta(payload)
  }, [])

  const loadActivity = React.useCallback(async () => {
    const payload = await api<{ events: ActivityEvent[] }>(
      "/api/activity?limit=100"
    )
    setActivity(payload.events || [])
  }, [])

  const loadRuns = React.useCallback(async () => {
    const payload = await api<{ runs: QueueRun[] }>(
      "/api/actions/queue/runs?limit=10"
    )
    setRuns(payload.runs || [])
  }, [])

  const loadPresets = React.useCallback(async () => {
    const payload = await api<{ presets: Preset[] }>("/api/actions/presets")
    setPresets(payload.presets || [])
  }, [])

  const loadSchedules = React.useCallback(async () => {
    const payload = await api<{ schedules: Schedule[] }>("/api/schedules")
    setSchedules(payload.schedules || [])
  }, [])

  const loadSafety = React.useCallback(async () => {
    const payload = await api<{ settings: SafetySettings }>(
      "/api/settings/safety"
    )
    setSafety(payload.settings || emptySafety)
    safetyLoaded.current = true
  }, [])

  const loadAppSettings = React.useCallback(async () => {
    const payload = await api<{ settings: AppSettings }>("/api/settings/app")
    setAppSettings(payload.settings || defaultAppSettings)
  }, [])

  React.useEffect(() => {
    // Activity now lives as a tab inside Settings, so load it there.
    if (view !== "settings") return undefined

    const load = () => loadActivity().catch((error) => flash(error.message))
    const initialTask = window.setTimeout(load, 0)
    // Skip polling while the tab is backgrounded — a hidden tab shouldn't keep
    // doing backend work — and refetch immediately when it becomes visible so
    // returning to the tab shows fresh data rather than a stale interval gap.
    const pollTask = window.setInterval(() => {
      if (!document.hidden) load()
    }, 10000)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearTimeout(initialTask)
      window.clearInterval(pollTask)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [flash, loadActivity, view])

  React.useEffect(() => {
    if (view !== "actions" && view !== "settings") return undefined
    if (safetyLoaded.current) return undefined

    const task = window.setTimeout(() => {
      loadSafety().catch((error) => flash(error.message))
    }, 0)

    return () => window.clearTimeout(task)
  }, [flash, loadSafety, view])

  React.useEffect(() => {
    // Schedules now live on the Actions page (Schedules tab + inspector).
    if (view !== "actions") return undefined

    const load = () => loadSchedules().catch((error) => flash(error.message))
    const initialTask = window.setTimeout(load, 0)
    // Pause the 5s poll while the tab is hidden so a backgrounded console stops
    // hitting the scheduler; resync the moment it's foregrounded again.
    const pollTask = window.setInterval(() => {
      if (!document.hidden) load()
    }, 5000)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearTimeout(initialTask)
      window.clearInterval(pollTask)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [flash, loadSchedules, view])

  return {
    actionsMeta,
    activity,
    appSettings,
    loadActionsMeta,
    loadActivity,
    loadAppSettings,
    loadPresets,
    loadRuns,
    loadSchedules,
    presets,
    runs,
    safety,
    schedules,
    setAppSettings,
    setPresets,
    setSafety,
    setSchedules,
  }
}
