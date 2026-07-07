import * as React from "react"

import { SectionLoader } from "../components/ui"
import type { AppScreenProps } from "./screen-props"
import type { ActivityEvent, View } from "../types"

// Route screens are code-split: each is fetched on first navigation so the
// initial bundle carries only the shell, not every screen plus all of its
// modals. On localhost the chunk loads instantly, so the Suspense fallback is
// imperceptible; the win is a far smaller first-parse and per-route caching.
const OverviewScreen = React.lazy(() =>
  import("./overview-screen").then((m) => ({ default: m.OverviewScreen }))
)
const AccountsScreen = React.lazy(() =>
  import("./accounts-screen").then((m) => ({ default: m.AccountsScreen }))
)
const ActivityScreen = React.lazy(() =>
  import("./activity-screen").then((m) => ({ default: m.ActivityScreen }))
)
const DialogsScreen = React.lazy(() =>
  import("./dialogs-screen").then((m) => ({ default: m.DialogsScreen }))
)
const ActionsScreen = React.lazy(() =>
  import("./actions-screen").then((m) => ({ default: m.ActionsScreen }))
)
const SettingsScreen = React.lazy(() =>
  import("./settings-screen").then((m) => ({ default: m.SettingsScreen }))
)
const AboutScreen = React.lazy(() =>
  import("./about-screen").then((m) => ({ default: m.AboutScreen }))
)

type AppScreensProps = {
  view: View
  screenProps: AppScreenProps
  activity: ActivityEvent[]
}

function renderScreen({ view, screenProps, activity }: AppScreensProps) {
  if (view === "overview")
    return <OverviewScreen {...screenProps} activity={activity} />
  if (view === "accounts") return <AccountsScreen {...screenProps} />
  if (view === "dialogs") return <DialogsScreen {...screenProps} />
  if (view === "actions") return <ActionsScreen {...screenProps} />
  if (view === "activity") return <ActivityScreen activity={activity} />
  if (view === "settings")
    return <SettingsScreen {...screenProps} activity={activity} />
  if (view === "about") return <AboutScreen flash={screenProps.flash} />
  return null
}

export function AppScreens(props: AppScreensProps) {
  return (
    <React.Suspense fallback={<SectionLoader />}>
      {renderScreen(props)}
    </React.Suspense>
  )
}
