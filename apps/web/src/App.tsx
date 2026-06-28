import * as React from "react"

import { Toast } from "./ui/toast"
import { useAppDialog } from "./components/app-dialog"
import { AppShell } from "./components/app-shell"
import { useAppState } from "./hooks/use-app-state"
import { useLoading } from "./hooks/use-loading"
import { api } from "./lib/api"
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

  const shellProps = {
    view: appState.view,
    accounts: appState.accounts,
    metrics: appState.metrics,
    queue: appState.queue,
    runs: appState.runs,
    schedules: appState.schedules,
    telemetry: {
      accounts: appState.accounts,
      metrics: appState.metrics,
      queue: appState.queue,
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
    </>
  )
}
