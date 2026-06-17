import * as React from "react"

import { api } from "../lib/api"
import { actionMeta, emptySafety } from "../lib/constants"
import { validateTargets } from "../components/target-preview"
import { splitTargets } from "../lib/helpers"
import type {
  Account,
  ActionType,
  ActivityEvent,
  Preset,
  QueueRun,
  QueueStep,
  SafetySettings,
  TelegramDialog,
  View,
} from "../types"

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

  useInitialLoad({
    flash,
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
    toggleSelected,
  }
}

function useViewState() {
  const [view, setView] = React.useState<View>(
    () => (window.location.hash.replace("#", "") as View) || "command"
  )

  React.useEffect(() => {
    window.location.hash = view
  }, [view])

  return { setView, view }
}

function useAccountState() {
  const [accounts, setAccounts] = React.useState<Account[]>([])
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
    setDialogAccountId((current) => current || nextAccounts[0]?.id || "")
    setConfigStatus(configStatusLabel(config))
    setApiConfigured(Boolean(config.api_hash_configured))
    setConfigApiId(config.api_id || null)
  }, [])

  const metrics = React.useMemo(() => sessionMetrics(accounts), [accounts])

  return {
    accounts,
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

  return {
    dialogFilter,
    dialogSearch,
    dialogs,
    filteredDialogs,
    selectedDialogTargets,
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
  const [safety, setSafety] = React.useState<SafetySettings>(emptySafety)
  const safetyLoaded = React.useRef(false)

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

  const loadSafety = React.useCallback(async () => {
    const payload = await api<{ settings: SafetySettings }>(
      "/api/settings/safety"
    )
    setSafety(payload.settings || emptySafety)
    safetyLoaded.current = true
  }, [])

  React.useEffect(() => {
    if (view !== "activity") return undefined

    const initialTask = window.setTimeout(() => {
      loadActivity().catch((error) => flash(error.message))
    }, 0)
    const pollTask = window.setInterval(() => {
      loadActivity().catch((error) => flash(error.message))
    }, 10000)

    return () => {
      window.clearTimeout(initialTask)
      window.clearInterval(pollTask)
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

  return {
    activity,
    loadActivity,
    loadPresets,
    loadRuns,
    loadSafety,
    presets,
    runs,
    safety,
    setPresets,
    setSafety,
  }
}

function useQueueState(
  actionAccountIds: Set<string>,
  flash: (message: string) => void,
  safety: SafetySettings
) {
  const [queue, setQueue] = React.useState<QueueStep[]>([])
  const [pendingAccountId, setPendingAccountId] = React.useState("")
  const [actionDraft, setActionDraft] = React.useState<{
    action_type: ActionType
    target: string
    message: string
  }>({ action_type: "join_chat", target: "", message: "" })
  const [confirmed, setConfirmed] = React.useState(false)

  function addQueueStep() {
    const targets = splitTargets(actionDraft.target)
    const account_ids = [...actionAccountIds]
    if (!account_ids.length) return flash("Select action accounts first.")
    if (!targets.length) return flash("Add at least one target.")
    if (messageIsMissing(actionDraft)) return flash("Message text is required.")
    const targetError = validateTargets(targets, actionDraft.action_type)
    if (targetError) return flash(targetError)

    setQueue((current) => [
      ...current,
      queueStepFromDraft(actionDraft, targets, account_ids),
    ])
    setActionDraft((current) => ({ ...current, target: "", message: "" }))
    setConfirmed(false)
  }

  return {
    actionDraft,
    addQueueStep,
    confirmed,
    pendingAccountId,
    queue,
    queuePayload: { steps: queue, confirm: confirmed, ...safety },
    setActionDraft,
    setConfirmed,
    setPendingAccountId,
    setQueue,
  }
}

function useInitialLoad({
  flash,
  loadPresets,
  loadRuns,
  refresh,
}: {
  flash: (message: string) => void
  loadPresets: () => Promise<void>
  loadRuns: () => Promise<void>
  refresh: () => Promise<void>
}) {
  React.useEffect(() => {
    const task = window.setTimeout(() => {
      Promise.all([refresh(), loadRuns(), loadPresets()]).catch((error) =>
        flash(error.message)
      )
    }, 0)

    return () => window.clearTimeout(task)
  }, [flash, loadPresets, loadRuns, refresh])
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

function dialogKind(dialog: TelegramDialog) {
  return (
    dialog.dialog_type ||
    dialog.kind ||
    dialog.type ||
    dialog.entity_type ||
    "unknown"
  )
}

function messageIsMissing(actionDraft: {
  action_type: ActionType
  message: string
}) {
  const meta = actionMeta[actionDraft.action_type]
  return meta.needsMessage && !actionDraft.message.trim()
}

function queueStepFromDraft(
  actionDraft: {
    action_type: ActionType
    message: string
  },
  targets: string[],
  account_ids: string[]
): QueueStep {
  return {
    action_type: actionDraft.action_type,
    targets,
    account_ids,
    message: actionDraft.message.trim() || undefined,
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
