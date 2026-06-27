import * as React from "react"

import { api } from "../lib/api"
import { emptySafety } from "../lib/constants"
import {
  defaultFieldValues,
  serializeFields,
  validateFields,
} from "../lib/action-schema"
import { partitionTargets } from "../lib/targeting"
import { dialogKind, dialogTarget, splitTargets } from "../lib/helpers"
import { awaitQueueRun } from "../lib/queue-run"
import { withViewTransition } from "../lib/view-transition"
import type {
  Account,
  AccountsTab,
  ActionDraft,
  ActionsMeta,
  ActivityEvent,
  AppSettings,
  Flash,
  Preset,
  QueueRun,
  QueueStep,
  QuickActionContext,
  SafetySettings,
  Schedule,
  ScheduleSeed,
  TelegramDialog,
  View,
} from "../types"

// Photos default to on until the backend setting loads, matching the backend
// default so dialogs don't flicker gradient→photo on first paint.
const defaultAppSettings: AppSettings = { show_dialog_photos: true }

export function useAppState(flash: (message: string) => void) {
  const viewState = useViewState()
  const accountState = useAccountState()
  const dialogState = useDialogState()
  const resourceState = useResourceState(flash, viewState.view)
  const queueState = useQueueState(
    accountState.actionAccountIds,
    flash,
    resourceState.safety
  )
  // Run-polling lives at app scope (not on the Actions screen) so the footer +
  // rail can show a live "running…" pulse no matter which screen is open.
  const runState = useRunPolling(
    resourceState.loadRuns,
    accountState.refresh,
    flash
  )
  const version = useVersion()

  useInitialLoad({
    flash,
    loadActionsMeta: resourceState.loadActionsMeta,
    loadAppSettings: resourceState.loadAppSettings,
    loadPresets: resourceState.loadPresets,
    loadRuns: resourceState.loadRuns,
    refresh: accountState.refresh,
  })

  return {
    ...viewState,
    ...accountState,
    ...dialogState,
    ...resourceState,
    ...queueState,
    ...runState,
    version,
    toggleSelected,
  }
}

// One-shot fetch of the backend version for the status bar. Stays in lockstep
// with the backend (same source the About screen reads), so no build-time
// constant to keep synced. Renders as undefined until it resolves.
function useVersion() {
  const [version, setVersion] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    let active = true
    api<{ version: string }>("/api/version")
      .then((info) => {
        if (active) setVersion(info.version)
      })
      .catch(() => {
        // Version is decorative in the status bar; a failed fetch just leaves
        // it blank rather than surfacing an error.
      })
    return () => {
      active = false
    }
  }, [])

  return version
}

// Polls an in-flight queue run to completion, exposing the live run so the
// shell (footer pulse, rail progress) and the Actions screen (banner, Run
// button) can all read the same state. Lifted out of ActionsScreen unchanged.
function useRunPolling(
  loadRuns: () => Promise<void>,
  refresh: () => Promise<void>,
  flash: Flash
) {
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null)
  const [activeRun, setActiveRun] = React.useState<QueueRun | null>(null)

  const pollQueueRun = React.useCallback(
    async (runId: string) => {
      setActiveRunId(runId)
      try {
        const run = await awaitQueueRun(runId, async (current) => {
          setActiveRun(current)
          await loadRuns()
        })
        await refresh()
        flash(
          `Queue ${run.status.replace("_", " ")}: ${run.completed_count || 0}/${run.operation_count || 0} succeeded.`
        )
      } catch (error) {
        flash(error instanceof Error ? error.message : "Queue polling failed.")
      } finally {
        setActiveRunId(null)
        setActiveRun(null)
      }
    },
    [flash, loadRuns, refresh]
  )

  const cancelActiveRun = React.useCallback(async () => {
    if (!activeRunId) return
    try {
      await api(`/api/actions/queue/runs/${activeRunId}/cancel`, {
        method: "POST",
      })
      flash("Cancel requested. The queue stops before the next operation.")
      await loadRuns()
    } catch (error) {
      flash(error instanceof Error ? error.message : "Cancel failed.")
    }
  }, [activeRunId, flash, loadRuns])

  return { activeRunId, activeRun, pollQueueRun, cancelActiveRun }
}

const KNOWN_VIEWS: ReadonlySet<View> = new Set<View>([
  "accounts",
  "dialogs",
  "actions",
  "settings",
])

function useViewState() {
  const [view, setView] = React.useState<View>(() => {
    const hash = window.location.hash.replace("#", "")
    // Schedules merged into Actions; keep old #schedules deep-links working.
    if (hash === "schedules") return "actions"
    return KNOWN_VIEWS.has(hash as View) ? (hash as View) : "accounts"
  })
  // Which Accounts sub-tab is active. Lifted to app state so other surfaces (the
  // header "Add Account" button) can deep-link straight to the login form.
  const [accountsTab, setAccountsTab] = React.useState<AccountsTab>("fleet")

  React.useEffect(() => {
    window.location.hash = view
  }, [view])

  // Crossfade screen changes via the View Transitions API. Wrapping the raw
  // setter here means every nav surface (sidebar, header, command palette)
  // animates for free; it degrades to an instant swap when unsupported or under
  // reduced-motion.
  const setViewAnimated = React.useCallback(
    (next: React.SetStateAction<View>) => {
      withViewTransition(() => setView(next))
    },
    []
  )

  return { accountsTab, setAccountsTab, setView: setViewAnimated, view }
}

function useAccountState() {
  const [accounts, setAccounts] = React.useState<Account[]>([])
  // Distinguishes "still loading the first time" from "loaded, genuinely empty"
  // so the UI can show skeletons rather than a premature empty state.
  const [accountsLoaded, setAccountsLoaded] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [actionAccountIds, setActionAccountIds] = React.useState<Set<string>>(
    new Set()
  )
  const [dialogAccountId, setDialogAccountId] = React.useState("")
  const [configStatus, setConfigStatus] = React.useState(
    "Checking API settings..."
  )
  const [apiConfigured, setApiConfigured] = React.useState(false)
  const [configApiId, setConfigApiId] = React.useState<number | null>(null)

  const refresh = React.useCallback(async () => {
    const [config, accountPayload] = await Promise.all([
      api<{ api_id?: number; api_hash_configured: boolean }>("/api/config"),
      api<{ accounts: Account[] }>("/api/accounts"),
    ])
    const nextAccounts = accountPayload.accounts || []
    const known = new Set(nextAccounts.map((account) => account.id))

    setAccounts(nextAccounts)
    setSelectedIds((current) => filterKnownIds(current, known))
    setActionAccountIds((current) => filterKnownIds(current, known))
    setDialogAccountId((current) =>
      current && known.has(current) ? current : nextAccounts[0]?.id || ""
    )
    setConfigStatus(configStatusLabel(config))
    setApiConfigured(Boolean(config.api_hash_configured))
    setConfigApiId(config.api_id || null)
    setAccountsLoaded(true)
  }, [])

  const metrics = React.useMemo(() => sessionMetrics(accounts), [accounts])

  return {
    accounts,
    accountsLoaded,
    actionAccountIds,
    apiConfigured,
    configApiId,
    configStatus,
    dialogAccountId,
    metrics,
    refresh,
    selectedIds,
    setActionAccountIds,
    setDialogAccountId,
    setSelectedIds,
  }
}

function useDialogState() {
  const [dialogs, setDialogs] = React.useState<TelegramDialog[]>([])
  const [selectedDialogTargets, setSelectedDialogTargets] = React.useState<
    Set<string>
  >(new Set())
  const [dialogFilter, setDialogFilter] = React.useState("all")
  const [dialogSearch, setDialogSearch] = React.useState("")

  const filteredDialogs = React.useMemo(
    () => filterDialogs(dialogs, dialogFilter, dialogSearch),
    [dialogFilter, dialogSearch, dialogs]
  )

  const knownDialogTargets = React.useMemo(
    () => new Set(dialogs.map(dialogTarget)),
    [dialogs]
  )
  const visibleSelectedDialogTargets = React.useMemo(
    () =>
      new Set(
        [...selectedDialogTargets].filter((target) =>
          knownDialogTargets.has(target)
        )
      ),
    [knownDialogTargets, selectedDialogTargets]
  )

  return {
    dialogFilter,
    dialogSearch,
    dialogs,
    filteredDialogs,
    selectedDialogTargets: visibleSelectedDialogTargets,
    setDialogFilter,
    setDialogSearch,
    setDialogs,
    setSelectedDialogTargets,
  }
}

function useResourceState(flash: (message: string) => void, view: View) {
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

function useQueueState(
  actionAccountIds: Set<string>,
  flash: Flash,
  safety: SafetySettings
) {
  const [queue, setQueue] = React.useState<QueueStep[]>([])
  const [pendingAccountId, setPendingAccountId] = React.useState("")
  const [actionDraft, setActionDraft] = React.useState<ActionDraft>({
    action_type: "join_chat",
    target: "",
    fields: defaultFieldValues("join_chat"),
  })
  const [quickActionContext, setQuickActionContext] =
    React.useState<QuickActionContext | null>(null)
  const [scheduleSeed, setScheduleSeed] = React.useState<ScheduleSeed | null>(
    null
  )

  function addQueueStep() {
    const account_ids = [...actionAccountIds]
    if (!account_ids.length) return flash("Select action accounts first.")
    const { valid, invalid } = partitionTargets(
      splitTargets(actionDraft.target),
      actionDraft.action_type
    )
    if (!valid.length) {
      return flash(
        invalid.length
          ? "No compatible targets for this action — every target was greyed out."
          : "Add at least one target."
      )
    }
    const blocker = actionDraftBlocker(actionDraft)
    if (blocker) return flash(blocker)

    setQueue((current) => [
      ...current,
      queueStepFromDraft(actionDraft, valid, account_ids),
    ])
    // Keep the action + filled fields so "same message, next batch" is one edit;
    // only clear the targets that were just queued.
    setActionDraft((current) => ({ ...current, target: "" }))
    setQuickActionContext(null)
    flash(
      invalid.length
        ? `Queued ${valid.length} target(s); skipped ${invalid.length} incompatible.`
        : "Action step added to queue."
    )
  }

  return {
    actionDraft,
    addQueueStep,
    pendingAccountId,
    queue,
    // confirm is set at run time by the Run dialog, the backend requires it true.
    queuePayload: { steps: queue, ...safety },
    quickActionContext,
    scheduleSeed,
    setActionDraft,
    setPendingAccountId,
    setQueue,
    setQuickActionContext,
    setScheduleSeed,
  }
}

function useInitialLoad({
  flash,
  loadActionsMeta,
  loadAppSettings,
  loadPresets,
  loadRuns,
  refresh,
}: {
  flash: Flash
  loadActionsMeta: () => Promise<void>
  loadAppSettings: () => Promise<void>
  loadPresets: () => Promise<void>
  loadRuns: () => Promise<void>
  refresh: () => Promise<void>
}) {
  React.useEffect(() => {
    const task = window.setTimeout(() => {
      Promise.all([
        refresh(),
        loadRuns(),
        loadPresets(),
        loadActionsMeta(),
        loadAppSettings(),
      ]).catch((error) => flash(error.message))
    }, 0)

    return () => window.clearTimeout(task)
  }, [flash, loadActionsMeta, loadAppSettings, loadPresets, loadRuns, refresh])
}

function filterKnownIds(current: Set<string>, known: Set<string>) {
  return new Set([...current].filter((id) => known.has(id)))
}

function configStatusLabel(config: {
  api_id?: number
  api_hash_configured: boolean
}) {
  return config.api_hash_configured
    ? `Configured with API ID ${config.api_id}.`
    : "API settings are not configured yet."
}

function sessionMetrics(accounts: Account[]) {
  const ready = accounts.filter(
    (account) => account.authorized && !account.last_error
  ).length
  const attention = accounts.filter(
    (account) => !account.authorized || account.last_error
  ).length
  const knownDialogs = accounts.reduce(
    (total, account) => total + Number(account.dialog_count || 0),
    0
  )
  return { ready, attention, knownDialogs }
}

function filterDialogs(
  dialogs: TelegramDialog[],
  dialogFilter: string,
  dialogSearch: string
) {
  return dialogs.filter((dialog) => {
    const kind = dialogKind(dialog)
    const target = `${dialog.title} ${dialog.username || ""}`.toLowerCase()
    const matchesFilter =
      dialogFilter === "all" ||
      kind === dialogFilter ||
      (dialogFilter === "group" && kind === "supergroup")
    return matchesFilter && target.includes(dialogSearch.toLowerCase())
  })
}

// Returns a user-facing reason the draft cannot be queued yet, or null if valid.
export function actionDraftBlocker(actionDraft: ActionDraft): string | null {
  const errors = validateFields(actionDraft.action_type, actionDraft.fields)
  const firstError = Object.values(errors)[0]
  return firstError || null
}

function queueStepFromDraft(
  actionDraft: ActionDraft,
  targets: string[],
  account_ids: string[]
): QueueStep {
  return {
    action_type: actionDraft.action_type,
    targets,
    account_ids,
    message: serializeFields(actionDraft.action_type, actionDraft.fields),
  }
}

function toggleSelected(
  value: string,
  setter: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  setter((current) => {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  })
}
