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

export type ActionCategory =
  | "joining"
  | "messaging"
  | "management"
  | "cleanup"
  | "moderation"

export type TargetKind =
  | "invite_link"
  | "public_link"
  | "username"
  | "numeric_id"
  | "bot_link"
  | "unknown"

export type ActionMeta = {
  label: string
  category: ActionCategory
  description: string
  needsMessage: boolean
  messagePlaceholder?: string
  targetHint: string
  validTargets: Set<TargetKind>
  destructive?: boolean
}

export const actionMeta: Record<ActionType, ActionMeta> = {
  join_chat: {
    label: "Join group or channel",
    category: "joining",
    description:
      "Join a public channel/group by username or a private one via invite link.",
    needsMessage: false,
    targetHint: "@username, t.me/username, or invite link",
    validTargets: new Set(["invite_link", "public_link", "username"]),
  },
  leave_chat: {
    label: "Leave group or channel",
    category: "joining",
    description: "Leave a channel, supergroup, or basic group.",
    needsMessage: false,
    targetHint: "@username, numeric chat ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  send_message: {
    label: "Send message",
    category: "messaging",
    description: "Send a text message to a user, group, or channel.",
    needsMessage: true,
    messagePlaceholder: "Message text to send",
    targetHint: "@username, numeric ID, or t.me link (no invite links)",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  forward_message: {
    label: "Forward message",
    category: "messaging",
    description: "Forward a message from one chat to another.",
    needsMessage: true,
    messagePlaceholder: "@source_chat:message_id (e.g. @channel:12345)",
    targetHint: "Destination: @username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  start_bot: {
    label: "Start bot",
    category: "messaging",
    description: "Send /start to a bot, optionally with a referral parameter.",
    needsMessage: false,
    targetHint: "@botname or t.me/botname?start=param",
    validTargets: new Set(["username", "bot_link"]),
  },
  block_user: {
    label: "Block user",
    category: "moderation",
    description: "Block a user so they can no longer contact you.",
    needsMessage: false,
    targetHint: "@username or numeric user ID",
    validTargets: new Set(["username", "numeric_id"]),
    destructive: true,
  },
  unblock_user: {
    label: "Unblock user",
    category: "moderation",
    description: "Unblock a previously blocked user.",
    needsMessage: false,
    targetHint: "@username or numeric user ID",
    validTargets: new Set(["username", "numeric_id"]),
  },
  archive_chat: {
    label: "Archive chat",
    category: "management",
    description: "Move a chat to the Archive folder.",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  unarchive_chat: {
    label: "Unarchive chat",
    category: "management",
    description: "Move a chat out of the Archive folder.",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  mute_chat: {
    label: "Mute chat",
    category: "management",
    description: "Mute notifications for a chat indefinitely.",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  unmute_chat: {
    label: "Unmute chat",
    category: "management",
    description: "Restore notifications for a muted chat.",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  read_chat: {
    label: "Mark as read",
    category: "management",
    description: "Mark all messages in a chat as read.",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
  },
  delete_chat: {
    label: "Delete dialog",
    category: "cleanup",
    description: "Delete a dialog from your chat list (local side only).",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
    destructive: true,
  },
  clear_chat: {
    label: "Clear chat history",
    category: "cleanup",
    description: "Clear message history locally where Telegram permits.",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
    destructive: true,
  },
  report_spam: {
    label: "Report spam",
    category: "moderation",
    description: "Report a chat or user as spam to Telegram.",
    needsMessage: false,
    targetHint: "@username, numeric ID, or t.me link",
    validTargets: new Set(["username", "numeric_id", "public_link"]),
    destructive: true,
  },
}
export const categoryLabels: Record<ActionCategory, string> = {
  joining: "Joining",
  messaging: "Messaging",
  management: "Management",
  cleanup: "Cleanup",
  moderation: "Moderation",
}

export const categoryOrder: ActionCategory[] = [
  "joining",
  "messaging",
  "management",
  "cleanup",
  "moderation",
]

export const emptySafety: SafetySettings = {
  delay_between_accounts: 4,
  delay_between_actions: 8,
  max_operations: 100,
}
