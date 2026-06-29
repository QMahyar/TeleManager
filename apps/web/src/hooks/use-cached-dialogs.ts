import * as React from "react"

import { api } from "../lib/api"
import { humanTime } from "../lib/helpers"
import type { DialogsScreenProps } from "../screens/screen-props"
import type { TelegramDialog } from "../types"

export type FetchStatus = {
  value: string
  setValue: (value: string) => void
  loading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  reload: () => void
}

// Auto-loads an account's cached dialogs on selection/reload, exposing the
// fetch status the source + table panels render. Owns its own loading/error so
// a slow or failing cache read is never a blank pane.
export function useCachedDialogs(
  dialogAccountId: string,
  setDialogs: DialogsScreenProps["setDialogs"],
  setDialogsWithAccountId?: (accountId: string | null, dialogs: TelegramDialog[]) => void
): FetchStatus {
  const [value, setValue] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Bumping this re-runs the auto-load effect so the table's retry can re-fetch
  // cached dialogs without remounting or switching accounts.
  const [reloadKey, setReloadKey] = React.useState(0)
  // Monotonic token so out-of-order responses (rapid account switches) never
  // overwrite the latest request's result.
  const requestToken = React.useRef(0)

  const loadCached = React.useCallback(
    async (id: string) => {
      if (!id) return
      const token = ++requestToken.current
      setLoading(true)
      setError(null)
      try {
        const payload = await api<{
          dialogs: TelegramDialog[]
          fetched_at?: string | null
        }>(`/api/accounts/${id}/dialogs`)
        if (token !== requestToken.current) return
        const dialogs = payload.dialogs || []
        // Use the persistence-aware setter if available
        if (setDialogsWithAccountId) {
          setDialogsWithAccountId(id, dialogs)
        } else {
          setDialogs(dialogs)
        }
        setValue(
          payload.fetched_at
            ? `Cached dialogs from ${humanTime(payload.fetched_at)}.`
            : ""
        )
      } catch (err) {
        if (token !== requestToken.current) return
        if (setDialogsWithAccountId) {
          setDialogsWithAccountId(id, [])
        } else {
          setDialogs([])
        }
        const message =
          err instanceof Error ? err.message : "Failed to load cached dialogs."
        setValue(message)
        setError(message)
      } finally {
        if (token === requestToken.current) setLoading(false)
      }
    },
    [setDialogs, setDialogsWithAccountId]
  )

  // Auto-load on account change / explicit reload. Deferred to a timeout (not
  // called synchronously in the effect body) so the loading flag is set off the
  // render path, matching the picker's pattern.
  React.useEffect(() => {
    if (!dialogAccountId) return undefined
    const task = window.setTimeout(() => loadCached(dialogAccountId), 0)
    return () => window.clearTimeout(task)
  }, [dialogAccountId, reloadKey, loadCached])

  return {
    value,
    setValue,
    loading,
    setLoading,
    error,
    setError,
    reload: () => setReloadKey((key) => key + 1),
  }
}
