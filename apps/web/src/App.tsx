import * as React from "react"

import { Toast } from "@workspace/ui/components/toast"
import { useAppDialog } from "./components/app-dialog"
import { AppShell } from "./components/app-shell"
import { useAppState } from "./hooks/use-app-state"
import { useLoading } from "./hooks/use-loading"
import { AppScreens } from "./screens/app-screens"

export function App() {
  const [toast, setToast] = React.useState("")
  const { loading, run } = useLoading()
  const { askDialog, dialogElement } = useAppDialog()

  const flash = React.useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 3800)
  }, [])

  const appState = useAppState(flash)

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
      >
        <AppScreens
          view={appState.view}
          screenProps={screenProps}
          activity={appState.activity}
          safety={appState.safety}
          configStatus={appState.configStatus}
        />
      </AppShell>
      {toast ? <Toast>{toast}</Toast> : null}
      {dialogElement}
    </>
  )
}
