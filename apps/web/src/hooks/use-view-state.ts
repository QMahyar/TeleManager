import * as React from "react"

import { withViewTransition } from "../lib/view-transition"
import type { AccountsTab, View } from "../types"

const KNOWN_VIEWS: ReadonlySet<View> = new Set<View>([
  "accounts",
  "dialogs",
  "actions",
  "settings",
])

export function useViewState() {
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
