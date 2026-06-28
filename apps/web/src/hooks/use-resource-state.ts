import * as React from "react"

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import { api } from "../lib/api"
import {
  activityResponseSchema,
  appSettingsResponseSchema,
  presetsResponseSchema,
  runsResponseSchema,
  safetyResponseSchema,
  schedulesResponseSchema,
} from "../lib/schemas"
import { emptySafety } from "../lib/constants"
import type {
  ActionsMeta,
  AppSettings,
  Preset,
  SafetySettings,
  Schedule,
  View,
} from "../types"

// Photos default to on until the backend setting loads, matching the backend
// default so dialogs don't flicker gradient→photo on first paint.
const defaultAppSettings: AppSettings = { show_dialog_photos: true }

// One query key per backend resource. Centralised so the queries, the imperative
// reloads, and the cache-writing setters can't drift onto different keys.
const KEYS = {
  actionsMeta: ["actions-meta"],
  activity: ["activity"],
  runs: ["runs"],
  presets: ["presets"],
  schedules: ["schedules"],
  safety: ["safety"],
  appSettings: ["app-settings"],
} as const

const fetchActionsMeta = () => api<ActionsMeta>("/api/actions/meta")
const fetchActivity = async () =>
  (await api("/api/activity?limit=100", {}, activityResponseSchema)).events || []
const fetchRuns = async () =>
  (await api("/api/actions/queue/runs?limit=10", {}, runsResponseSchema)).runs ||
  []
const fetchPresets = async () =>
  (await api("/api/actions/presets", {}, presetsResponseSchema)).presets || []
const fetchSchedules = async () =>
  (await api("/api/schedules", {}, schedulesResponseSchema)).schedules || []
const fetchSafety = async () =>
  (await api("/api/settings/safety", {}, safetyResponseSchema)).settings ||
  emptySafety
const fetchAppSettings = async () =>
  (await api("/api/settings/app", {}, appSettingsResponseSchema)).settings ||
  defaultAppSettings

// Server-state for the app's standing resources, now backed by react-query.
// The view-gated polls (activity, schedules) and the load-once fetch (safety)
// that used to be hand-rolled visibility effects are expressed declaratively as
// enabled + refetchInterval; refetchIntervalInBackground defaults false so a
// hidden tab pauses, and refetchOnWindowFocus (default) re-syncs on return.
//
// Public shape is unchanged from the useState version: data fields, `loadX`
// reloaders, and `setX` cache-writers, so the aggregator and screens are
// untouched. (Background poll failures now retry silently instead of toasting;
// mutation-triggered reloads still throw, so their guarded() wrappers flash.)
export function useResourceState(view: View) {
  const queryClient = useQueryClient()

  const actionsMetaQuery = useQuery({
    queryKey: KEYS.actionsMeta,
    queryFn: fetchActionsMeta,
    staleTime: Infinity,
  })
  const activityQuery = useQuery({
    queryKey: KEYS.activity,
    queryFn: fetchActivity,
    enabled: view === "settings",
    refetchInterval: 10000,
  })
  const runsQuery = useQuery({ queryKey: KEYS.runs, queryFn: fetchRuns })
  const presetsQuery = useQuery({
    queryKey: KEYS.presets,
    queryFn: fetchPresets,
    staleTime: Infinity,
  })
  const schedulesQuery = useQuery({
    queryKey: KEYS.schedules,
    queryFn: fetchSchedules,
    enabled: view === "actions",
    refetchInterval: 5000,
  })
  const safetyQuery = useQuery({
    queryKey: KEYS.safety,
    queryFn: fetchSafety,
    enabled: view === "actions" || view === "settings",
    staleTime: Infinity,
  })
  const appSettingsQuery = useQuery({
    queryKey: KEYS.appSettings,
    queryFn: fetchAppSettings,
    staleTime: Infinity,
  })

  // Imperative reloads (after a preset save, schedule edit, run tick, …).
  // fetchQuery with staleTime 0 forces a fresh fetch and re-throws on failure,
  // so callers that wrap these in guarded() still surface the error.
  const loadActionsMeta = React.useCallback(async () => {
    await reload(queryClient, KEYS.actionsMeta, fetchActionsMeta)
  }, [queryClient])
  const loadActivity = React.useCallback(async () => {
    await reload(queryClient, KEYS.activity, fetchActivity)
  }, [queryClient])
  const loadRuns = React.useCallback(async () => {
    await reload(queryClient, KEYS.runs, fetchRuns)
  }, [queryClient])
  const loadPresets = React.useCallback(async () => {
    await reload(queryClient, KEYS.presets, fetchPresets)
  }, [queryClient])
  const loadSchedules = React.useCallback(async () => {
    await reload(queryClient, KEYS.schedules, fetchSchedules)
  }, [queryClient])
  const loadAppSettings = React.useCallback(async () => {
    await reload(queryClient, KEYS.appSettings, fetchAppSettings)
  }, [queryClient])

  // Cache-writing setters with React setState semantics (value or updater), so
  // existing optimistic-update call sites (settings screen, safety editor) work
  // verbatim against the query cache.
  const setPresets = React.useMemo(
    () => makeSetter<Preset[]>(queryClient, KEYS.presets, []),
    [queryClient]
  )
  const setSchedules = React.useMemo(
    () => makeSetter<Schedule[]>(queryClient, KEYS.schedules, []),
    [queryClient]
  )
  const setSafety = React.useMemo(
    () => makeSetter<SafetySettings>(queryClient, KEYS.safety, emptySafety),
    [queryClient]
  )
  const setAppSettings = React.useMemo(
    () =>
      makeSetter<AppSettings>(queryClient, KEYS.appSettings, defaultAppSettings),
    [queryClient]
  )

  return {
    actionsMeta: actionsMetaQuery.data ?? null,
    activity: activityQuery.data ?? [],
    appSettings: appSettingsQuery.data ?? defaultAppSettings,
    safety: safetyQuery.data ?? emptySafety,
    presets: presetsQuery.data ?? [],
    runs: runsQuery.data ?? [],
    schedules: schedulesQuery.data ?? [],
    loadActionsMeta,
    loadActivity,
    loadAppSettings,
    loadPresets,
    loadRuns,
    loadSchedules,
    setAppSettings,
    setPresets,
    setSafety,
    setSchedules,
  }
}

function reload<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>
) {
  return queryClient.fetchQuery({ queryKey, queryFn, staleTime: 0 })
}

function makeSetter<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  fallback: T
): React.Dispatch<React.SetStateAction<T>> {
  return (action) => {
    queryClient.setQueryData<T>(queryKey, (current) => {
      const base = current ?? fallback
      return typeof action === "function"
        ? (action as (prev: T) => T)(base)
        : action
    })
  }
}
