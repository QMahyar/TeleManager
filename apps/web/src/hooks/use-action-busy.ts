import * as React from "react"

import type { ActionsScreenProps } from "../screens/screen-props"

export type ActionBusy = ReturnType<typeof useActionBusy>

// Single-flight guard for the Actions screen's imperative buttons (Run, etc.):
// tracks which keyed action is in flight so its button can show a spinner and
// the rest stay disabled until it settles. A ref blocks re-entrancy within the
// same tick before the state update lands.
export function useActionBusy(flash: ActionsScreenProps["flash"]) {
  const [pendingAction, setPendingAction] = React.useState<string | null>(null)
  const pendingRef = React.useRef<string | null>(null)

  const runAction = React.useCallback(
    async (key: string, work: () => Promise<void>) => {
      if (pendingRef.current) {
        return
      }
      pendingRef.current = key
      setPendingAction(key)
      try {
        await work()
      } catch (error) {
        flash(error instanceof Error ? error.message : "Request failed")
      } finally {
        pendingRef.current = null
        setPendingAction(null)
      }
    },
    [flash]
  )

  const isPending = React.useCallback(
    (key: string) => pendingAction === key,
    [pendingAction]
  )

  return { busy: pendingAction !== null, isPending, runAction }
}
