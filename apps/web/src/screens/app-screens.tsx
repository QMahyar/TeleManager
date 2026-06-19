import { AccountsScreen } from "./accounts-screen"
import { ActionsScreen } from "./actions-screen"
import { ActivityScreen } from "./activity-screen"
import { CommandScreen } from "./command-screen"
import { DialogsScreen } from "./dialogs-screen"
import { SessionsScreen } from "./sessions-screen"
import { SettingsScreen } from "./settings-screen"
import type { AppScreenProps } from "./screen-props"
import type { ActivityEvent, View } from "../types"

type AppScreensProps = {
  view: View
  screenProps: AppScreenProps
  activity: ActivityEvent[]
}

export function AppScreens({ view, screenProps, activity }: AppScreensProps) {
  if (view === "command") return <CommandScreen {...screenProps} />
  if (view === "accounts") return <AccountsScreen {...screenProps} />
  if (view === "actions") return <ActionsScreen {...screenProps} />
  if (view === "dialogs") return <DialogsScreen {...screenProps} />
  if (view === "sessions") return <SessionsScreen {...screenProps} />
  if (view === "activity") return <ActivityScreen activity={activity} />
  if (view === "settings") return <SettingsScreen {...screenProps} />
  return null
}
