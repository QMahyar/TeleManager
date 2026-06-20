import { AccountsScreen } from "./accounts-screen"
import { ActionsScreen } from "./actions-screen"
import { DialogsScreen } from "./dialogs-screen"
import { SchedulesScreen } from "./schedules-screen"
import { SettingsScreen } from "./settings-screen"
import type { AppScreenProps } from "./screen-props"
import type { ActivityEvent, View } from "../types"

type AppScreensProps = {
  view: View
  screenProps: AppScreenProps
  activity: ActivityEvent[]
}

export function AppScreens({ view, screenProps, activity }: AppScreensProps) {
  if (view === "accounts") return <AccountsScreen {...screenProps} />
  if (view === "dialogs") return <DialogsScreen {...screenProps} />
  if (view === "actions") return <ActionsScreen {...screenProps} />
  if (view === "schedules") return <SchedulesScreen {...screenProps} />
  if (view === "settings")
    return <SettingsScreen {...screenProps} activity={activity} />
  return null
}
