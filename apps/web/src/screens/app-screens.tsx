import { AccountsScreen } from "./accounts-screen"
import { ActionsScreen } from "./actions-screen"
import { ActivityScreen } from "./activity-screen"
import { CommandScreen } from "./command-screen"
import { DialogsScreen } from "./dialogs-screen"
import { SessionsScreen } from "./sessions-screen"
import { SettingsScreen } from "./settings-screen"
import type { AppScreenProps } from "./screen-props"
import type { ActivityEvent, SafetySettings, View } from "../types"

type AppScreensProps = {
  view: View
  screenProps: AppScreenProps
  activity: ActivityEvent[]
  safety: SafetySettings
  configStatus: string
}

export function AppScreens({
  view,
  screenProps,
  activity,
  safety,
  configStatus,
}: AppScreensProps) {
  if (view === "command") return <CommandScreen {...screenProps} />
  if (view === "accounts") return <AccountsScreen {...screenProps} />
  if (view === "actions") return <ActionsScreen {...screenProps} />
  if (view === "dialogs") return <DialogsScreen {...screenProps} />
  if (view === "sessions") return <SessionsScreen {...screenProps} />
  if (view === "activity") return <ActivityScreen activity={activity} />
  if (view === "settings") {
    return (
      <SettingsScreen
        safety={safety}
        setSafety={screenProps.setSafety}
        configStatus={configStatus}
        guarded={screenProps.guarded}
        loading={screenProps.loading}
        refresh={screenProps.refresh}
        flash={screenProps.flash}
      />
    )
  }
  return null
}
