import * as React from "react"

import { Toast } from "./ui/toast"
import { useAppDialog } from "./components/app-dialog"
import { AppShell } from "./components/app-shell"
import { WelcomeModal } from "./components/welcome-modal"
import { useAppState } from "./hooks/use-app-state"
import { useLoading } from "./hooks/use-loading"
import { api } from "./lib/api"
import { splitTargets } from "./lib/helpers"
import { AppScreens } from "./screens/app-screens"
import type { ToastTone } from "./types"

type ToastState = { message: string; tone: ToastTone } | null

export function App() {
  const [toast, setToast] = React.useState<ToastState>(null)
  const toastTimer = React.useRef<number | null>(null)
  const { loading, run } = useLoading()
  const { askDialog, dialogElement } = useAppDialog()

  const flash = React.useCallback(
    (message: string, tone: ToastTone = "info") => {
      setToast({ message, tone })
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      // Errors linger a little longer so they aren't missed.
      const duration = tone === "error" ? 5200 : 3800
      toastTimer.current = window.setTimeout(() => setToast(null), duration)
    },
    []
  )

  React.useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    []
  )

  const appState = useAppState(flash)

  const exitApp = React.useCallback(async () => {
    try {
      await api("/api/app/shutdown", { method: "POST" })
      document.body.replaceChildren(document.createTextNode("TeleManager closed. You can close this tab."))
    } catch (error) {
      flash(error instanceof Error ? error.message : "Exit failed", "error")
    }
  }, [flash])

  // Stable identity so memoized children (e.g. DialogRow) whose handlers close
  // over `guarded` aren't forced to re-render every time App re-renders.
  const guarded = React.useCallback(
    async (work: () => Promise<void>) => {
      await run(async () => {
        try {
          await work()
        } catch (error) {
          flash(
            error instanceof Error ? error.message : "Request failed",
            "error"
          )
        }
      })
    },
    [run, flash]
  )

  const screenProps = {
    ...appState,
    askDialog,
    flash,
    guarded,
    loading,
  }

  // The staged "batch" = the chats (targets) and accounts the next action fans
  // out to. It's the single draft (not a multi-step queue), surfaced across the
  // shell (footer, dock) so it's visible from any screen.
  const stagedChats = splitTargets(appState.actionDraft.target).length
  const stagedAccounts = appState.actionAccountIds.size

  const shellProps = {
    view: appState.view,
    accounts: appState.accounts,
    metrics: appState.metrics,
    stagedChats,
    stagedAccounts,
    runs: appState.runs,
    schedules: appState.schedules,
    telemetry: {
      accounts: appState.accounts,
      metrics: appState.metrics,
      runs: appState.runs,
      schedules: appState.schedules,
    },
    selectedCount: appState.selectedIds.size,
    version: appState.version,
    activeRun: appState.activeRun,
    setView: appState.setView,
    onRefresh: () => guarded(appState.refresh),
    onExit: exitApp,
    onAddAccount: () => {
      appState.setAccountsTab("login")
      appState.setView("accounts")
    },
    onClearBatch: () => {
      appState.setActionDraft((current) => ({ ...current, target: "" }))
      appState.setActionAccountIds(new Set())
    },
  }

  return (
    <>
      <AppShell {...shellProps}>
        <AppScreens
          view={appState.view}
          screenProps={screenProps}
          activity={appState.activity}
        />
      </AppShell>
      {toast ? <Toast tone={toast.tone}>{toast.message}</Toast> : null}
      {dialogElement}
      <WelcomeModal
        accounts={appState.accounts}
        accountsLoaded={appState.accountsLoaded}
        apiConfigured={appState.apiConfigured}
        onConfigureApi={() => appState.setView("settings")}
        onAddAccount={() => {
          appState.setAccountsTab("login")
          appState.setView("accounts")
        }}
      />
    </>
  )
}
