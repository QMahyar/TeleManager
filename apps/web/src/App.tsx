import * as React from "react"

import { Toast } from "./ui/toast"
import { useAppDialog } from "./components/app-dialog"
import { AppShell } from "./components/app-shell"
import { useAppState } from "./hooks/use-app-state"
import { useLoading } from "./hooks/use-loading"
import { api } from "./lib/api"
import { AppScreens } from "./screens/app-screens"

export function App() {
  const [toast, setToast] = React.useState("")
  const toastTimer = React.useRef<number | null>(null)
  const { loading, run } = useLoading()
  const { askDialog, dialogElement } = useAppDialog()

  const flash = React.useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(""), 3800)
  }, [])

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
      flash(error instanceof Error ? error.message : "Exit failed")
    }
  }, [flash])

  async function guarded(work: () => Promise<void>) {
    await run(async () => {
      try {
        await work()
      } catch (error) {
        flash(error instanceof Error ? error.message : "Request failed")
      }
    })
  }

  const screenProps = {
    ...appState,
    askDialog,
    flash,
    guarded,
    loading,
  }

  return (
    <>
      <AppShell
        view={appState.view}
        selectedCount={appState.selectedIds.size}
        setView={appState.setView}
        onRefresh={() => guarded(appState.refresh)}
        onExit={exitApp}
      >
        <AppScreens
          view={appState.view}
          screenProps={screenProps}
          activity={appState.activity}
        />
      </AppShell>
      {toast ? <Toast>{toast}</Toast> : null}
      {dialogElement}
    </>
  )
}
