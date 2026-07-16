import {
  IconInfoCircle,
  IconLayoutGrid,
  IconSettings,
  IconTimeline,
} from "@tabler/icons-react"
import type * as React from "react"

import {
  IconChatNodes,
  IconRunQueue,
  IconSessionStack,
} from "../components/icons"

import type { ActionType, SafetySettings, View } from "../types"

// `description` is the one-line subtitle the page header renders under the title
// (e.g. "API credentials, safety defaults and app security"), so the header can
// stay a dumb renderer and every screen's framing lives in one table.
export const navItems: Array<{
  id: View
  label: string
  group: string
  icon: React.ElementType
  description: string
}> = [
  {
    id: "overview",
    label: "Overview",
    group: "Workspace",
    icon: IconLayoutGrid,
    description: "Local session ops · everything stays on 127.0.0.1",
  },
  {
    id: "accounts",
    label: "Accounts",
    group: "Workspace",
    icon: IconSessionStack,
    description: "Every owned Telegram session, in one place",
  },
  {
    id: "dialogs",
    label: "Dialogs",
    group: "Workspace",
    icon: IconChatNodes,
    description: "Find chats, then stage them into actions",
  },
  {
    id: "actions",
    label: "Actions",
    group: "Workspace",
    icon: IconRunQueue,
    description: "Build, queue and run operations across selected sessions",
  },
  {
    id: "activity",
    label: "Activity",
    group: "System",
    icon: IconTimeline,
    description: "Persistent local audit trail of everything TeleManager does",
  },
  {
    id: "settings",
    label: "Settings",
    group: "System",
    icon: IconSettings,
    description: "API credentials, safety defaults and app security",
  },
  // Group "About" is intentionally not one of the rendered sidebar groups
  // ("Workspace"/"System"); About is pinned separately at the sidebar bottom.
  // Listing it here still lets the Header title and command palette resolve it.
  {
    id: "about",
    label: "About",
    group: "About",
    icon: IconInfoCircle,
    description: "What TeleManager is, and the principles it runs by",
  },
]

export type ActionCategory =
  | "joining"
  | "messaging"
  | "message_tools"
  | "management"
  | "cleanup"
  | "moderation"
  | "downloads"

export type TargetKind =
  | "invite_link"
  | "public_link"
  | "username"
  | "numeric_id"
  | "bot_link"
  | "unknown"

// Presentation metadata for each action. Target rules / needsMessage still come
// from GET /api/actions/meta when available (see resolveActionMeta). Keep a
// local `destructive` flag so offline UI (queue risk rollups) stays correct
// before meta loads.
export type ActionMeta = {
  label: string
  category: ActionCategory
  description: string
  targetHint: string
  messagePlaceholder?: string
  destructive?: boolean
}

const HINT_CHAT_TARGET = "@username, numeric ID, or t.me link"

export const actionMeta: Record<ActionType, ActionMeta> = {
  join_chat: {
    label: "Join group or channel",
    category: "joining",
    description:
      "Join a public channel/group by username or a private one via invite link.",
    targetHint: "@username, t.me/username, or invite link",
  },
  leave_chat: {
    label: "Leave group or channel",
    category: "joining",
    description: "Leave a channel, supergroup, or basic group.",
    targetHint: "@username, numeric chat ID, or t.me link",
  },
  send_message: {
    label: "Send message",
    category: "messaging",
    description: "Send a text message to a user, group, or channel.",
    messagePlaceholder: "Message text to send",
    targetHint: "@username, numeric ID, or t.me link (no invite links)",
  },
  send_media: {
    label: "Send media/file",
    category: "messaging",
    description:
      "Send a local file with an optional caption. Use file=PATH and caption=... options.",
    messagePlaceholder:
      "file=E:/path/photo.jpg\ncaption=Optional caption\nparse_mode=markdown",
    targetHint: HINT_CHAT_TARGET,
  },
  schedule_message: {
    label: "Schedule message (one-off)",
    category: "messaging",
    description:
      "Send a single message at one specific time, delivered by Telegram even while TeleManager is closed. For a repeating send, add a Send message step and use Schedule… instead.",
    messagePlaceholder: "text=Message to send later\nschedule=+15m",
    targetHint: HINT_CHAT_TARGET,
  },
  forward_message: {
    label: "Forward message",
    category: "message_tools",
    description:
      "Forward one or more messages from a source chat to the destination. Source can be @chat:id, @chat:101,102, or a t.me message link.",
    messagePlaceholder:
      "@source_chat:12345\n(or) @source_chat:101,102,103\n(or) https://t.me/source_chat/12345",
    targetHint: "Destination: @username, numeric ID, or t.me link",
  },
  edit_message: {
    label: "Edit message",
    category: "message_tools",
    description: "Edit one of your messages by ID.",
    messagePlaceholder: "id=12345\ntext=Updated message text",
    targetHint: "Chat containing the message",
  },
  delete_messages: {
    label: "Delete messages",
    category: "message_tools",
    description:
      "Delete selected message IDs, optionally for everyone where Telegram permits.",
    messagePlaceholder: "ids=12345,12346\nrevoke=true",
    targetHint: "Chat containing the messages",
    destructive: true,
  },
  pin_message: {
    label: "Pin message",
    category: "message_tools",
    description: "Pin a message by ID in a chat or channel you can manage.",
    messagePlaceholder: "id=12345\nnotify=false",
    targetHint: "Chat containing the message",
  },
  unpin_message: {
    label: "Unpin message",
    category: "message_tools",
    description: "Unpin one message by ID, or all pins when id is omitted.",
    messagePlaceholder: "id=12345",
    targetHint: "Chat containing the pinned message",
  },
  download_media: {
    label: "Download media",
    category: "downloads",
    description: "Download media from a message ID into local data/downloads.",
    messagePlaceholder: "id=12345",
    targetHint: "Chat containing the media message",
  },
  start_bot: {
    label: "Start bot (referral link)",
    category: "messaging",
    description:
      "Start a bot via a referral/deep link. The parameter can come from the link (?start= or ?startapp=) or the options field below. startapp opens the bot mini app so tap-to-earn/Stars referrals are credited.",
    messagePlaceholder:
      "start=ref123\n(or) startapp=ref123\nLeave empty to just send /start",
    targetHint: "@botname, t.me/botname?start=param, or t.me/botname?startapp=param",
  },
  block_user: {
    label: "Block user",
    category: "moderation",
    description: "Block a user so they can no longer contact you.",
    targetHint: "@username or numeric user ID",
    destructive: true,
  },
  unblock_user: {
    label: "Unblock user",
    category: "moderation",
    description: "Unblock a previously blocked user.",
    targetHint: "@username or numeric user ID",
  },
  archive_chat: {
    label: "Archive chat",
    category: "management",
    description: "Move a chat to the Archive folder.",
    targetHint: HINT_CHAT_TARGET,
  },
  unarchive_chat: {
    label: "Unarchive chat",
    category: "management",
    description: "Move a chat out of the Archive folder.",
    targetHint: HINT_CHAT_TARGET,
  },
  mute_chat: {
    label: "Mute chat",
    category: "management",
    description: "Mute notifications for a chat indefinitely.",
    targetHint: HINT_CHAT_TARGET,
  },
  unmute_chat: {
    label: "Unmute chat",
    category: "management",
    description: "Restore notifications for a muted chat.",
    targetHint: HINT_CHAT_TARGET,
  },
  read_chat: {
    label: "Mark as read",
    category: "management",
    description: "Mark all messages in a chat as read.",
    targetHint: HINT_CHAT_TARGET,
  },
  delete_chat: {
    label: "Delete dialog",
    category: "cleanup",
    description: "Delete a dialog from your chat list (local side only).",
    targetHint: HINT_CHAT_TARGET,
    destructive: true,
  },
  clear_chat: {
    label: "Clear chat history",
    category: "cleanup",
    description: "Clear message history locally where Telegram permits.",
    targetHint: HINT_CHAT_TARGET,
    destructive: true,
  },
  report_spam: {
    label: "Report spam",
    category: "moderation",
    description: "Report a chat or user as spam to Telegram.",
    targetHint: HINT_CHAT_TARGET,
    destructive: true,
  },
  export_chat: {
    label: "Export chat history",
    category: "downloads",
    description:
      "Export chat messages to a JSON file under data/exports/. Media off by default.",
    targetHint: HINT_CHAT_TARGET,
  },
}
export const categoryLabels: Record<ActionCategory, string> = {
  joining: "Joining",
  messaging: "Messaging",
  message_tools: "Message Tools",
  management: "Management",
  cleanup: "Cleanup",
  moderation: "Moderation",
  downloads: "Downloads",
}

export const categoryOrder: ActionCategory[] = [
  "joining",
  "messaging",
  "message_tools",
  "management",
  "cleanup",
  "moderation",
  "downloads",
]

export const emptySafety: SafetySettings = {
  delay_between_accounts: 4,
  delay_between_actions: 8,
  delay_instant: 1,
  delay_sensitive: 12,
  max_operations: 100,
  flood_wait_resume_cap: 900,
}
