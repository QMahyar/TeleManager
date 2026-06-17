import {
  IconActivity,
  IconArchive,
  IconDatabase,
  IconMessageCircle,
  IconPlayerPlay,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react"
import type * as React from "react"

import type { ActionType, SafetySettings, View } from "../types"

export const navItems: Array<{
  id: View
  label: string
  group: string
  icon: React.ElementType
}> = [
  {
    id: "command",
    label: "Command Center",
    group: "Workspace",
    icon: IconDatabase,
  },
  { id: "actions", label: "Actions", group: "Workspace", icon: IconPlayerPlay },
  {
    id: "dialogs",
    label: "Dialogs",
    group: "Workspace",
    icon: IconMessageCircle,
  },
  { id: "accounts", label: "Accounts", group: "Management", icon: IconUsers },
  {
    id: "sessions",
    label: "Import / Export",
    group: "Management",
    icon: IconArchive,
  },
  {
    id: "activity",
    label: "Activity",
    group: "Management",
    icon: IconActivity,
  },
  { id: "settings", label: "Settings", group: "System", icon: IconSettings },
]

export const actionLabels: Record<ActionType, string> = {
  join_chat: "Join group or channel",
  leave_chat: "Leave group or channel",
  send_message: "Send message",
  start_bot: "Start bot referral link",
  delete_chat: "Delete dialog locally",
  clear_chat: "Clear chat history locally",
}

export const emptySafety: SafetySettings = {
  delay_between_accounts: 4,
  delay_between_actions: 8,
  max_operations: 100,
}
