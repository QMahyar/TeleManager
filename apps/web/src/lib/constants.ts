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

export type ActionMeta = {
  label: string
  category: ActionCategory
  description: string
  needsMessage: boolean
  messageOptional?: boolean
  messagePlaceholder?: string
  targetHint: string
  validTargets: Set<TargetKind>
  destructive?: boolean
}

const TARGET_PUBLIC_LINK: TargetKind = "public_link"
const TARGET_USERNAME: TargetKind = "username"
const TARGET_NUMERIC_ID: TargetKind = "numeric_id"

const HINT_CHAT_TARGET = "@username, numeric ID, or t.me link"

export const actionMeta: Record<ActionType, ActionMeta> = {
  join_chat: {
    label: "Join group or channel",
    category: "joining",
    description:
      "Join a public channel/group by username or a private one via invite link.",
    needsMessage: false,
    targetHint: "@username, t.me/username, or invite link",
    validTargets: new Set(["invite_link", TARGET_PUBLIC_LINK, TARGET_USERNAME]),
  },
  leave_chat: {
    label: "Leave group or channel",
    category: "joining",
    description: "Leave a channel, supergroup, or basic group.",
    needsMessage: false,
    targetHint: "@username, numeric chat ID, or t.me link",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  send_message: {
    label: "Send message",
    category: "messaging",
    description: "Send a text message to a user, group, or channel.",
    needsMessage: true,
    messagePlaceholder: "Message text to send",
    targetHint: "@username, numeric ID, or t.me link (no invite links)",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  send_media: {
    label: "Send media/file",
    category: "messaging",
    description:
      "Send a local file with an optional caption. Use file=PATH and caption=... options.",
    needsMessage: true,
    messagePlaceholder:
      "file=E:/path/photo.jpg\ncaption=Optional caption\nparse_mode=markdown",
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  schedule_message: {
    label: "Schedule message (one-off)",
    category: "messaging",
    description:
      "Send a single message at one specific time, delivered by Telegram even while TeleManager is closed. For a repeating send, add a Send message step and use Schedule… instead.",
    needsMessage: true,
    messagePlaceholder: "text=Message to send later\nschedule=+15m",
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  forward_message: {
    label: "Forward message",
    category: "message_tools",
    description:
      "Forward one or more messages from a source chat to the destination. Source can be @chat:id, @chat:101,102, or a t.me message link.",
    needsMessage: true,
    messagePlaceholder:
      "@source_chat:12345\n(or) @source_chat:101,102,103\n(or) https://t.me/source_chat/12345",
    targetHint: "Destination: @username, numeric ID, or t.me link",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  edit_message: {
    label: "Edit message",
    category: "message_tools",
    description: "Edit one of your messages by ID.",
    needsMessage: true,
    messagePlaceholder: "id=12345\ntext=Updated message text",
    targetHint: "Chat containing the message",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  delete_messages: {
    label: "Delete messages",
    category: "message_tools",
    description:
      "Delete selected message IDs, optionally for everyone where Telegram permits.",
    needsMessage: true,
    messagePlaceholder: "ids=12345,12346\nrevoke=true",
    targetHint: "Chat containing the messages",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
    destructive: true,
  },
  pin_message: {
    label: "Pin message",
    category: "message_tools",
    description: "Pin a message by ID in a chat or channel you can manage.",
    needsMessage: true,
    messagePlaceholder: "id=12345\nnotify=false",
    targetHint: "Chat containing the message",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  unpin_message: {
    label: "Unpin message",
    category: "message_tools",
    description: "Unpin one message by ID, or all pins when id is omitted.",
    needsMessage: true,
    messagePlaceholder: "id=12345",
    targetHint: "Chat containing the pinned message",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  download_media: {
    label: "Download media",
    category: "downloads",
    description: "Download media from a message ID into local data/downloads.",
    needsMessage: true,
    messagePlaceholder: "id=12345",
    targetHint: "Chat containing the media message",
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  start_bot: {
    label: "Start bot (referral link)",
    category: "messaging",
    description:
      "Start a bot via a referral/deep link. The parameter can come from the link (?start= or ?startapp=) or the options field below. startapp opens the bot mini app so tap-to-earn/Stars referrals are credited.",
    needsMessage: true,
    messageOptional: true,
    messagePlaceholder:
      "start=ref123\n(or) startapp=ref123\nLeave empty to just send /start",
    targetHint: "@botname, t.me/botname?start=param, or t.me/botname?startapp=param",
    validTargets: new Set([TARGET_USERNAME, "bot_link"]),
  },
  block_user: {
    label: "Block user",
    category: "moderation",
    description: "Block a user so they can no longer contact you.",
    needsMessage: false,
    targetHint: "@username or numeric user ID",
    validTargets: new Set([TARGET_USERNAME, TARGET_NUMERIC_ID]),
    destructive: true,
  },
  unblock_user: {
    label: "Unblock user",
    category: "moderation",
    description: "Unblock a previously blocked user.",
    needsMessage: false,
    targetHint: "@username or numeric user ID",
    validTargets: new Set([TARGET_USERNAME, TARGET_NUMERIC_ID]),
  },
  archive_chat: {
    label: "Archive chat",
    category: "management",
    description: "Move a chat to the Archive folder.",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  unarchive_chat: {
    label: "Unarchive chat",
    category: "management",
    description: "Move a chat out of the Archive folder.",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  mute_chat: {
    label: "Mute chat",
    category: "management",
    description: "Mute notifications for a chat indefinitely.",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  unmute_chat: {
    label: "Unmute chat",
    category: "management",
    description: "Restore notifications for a muted chat.",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  read_chat: {
    label: "Mark as read",
    category: "management",
    description: "Mark all messages in a chat as read.",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
  },
  delete_chat: {
    label: "Delete dialog",
    category: "cleanup",
    description: "Delete a dialog from your chat list (local side only).",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
    destructive: true,
  },
  clear_chat: {
    label: "Clear chat history",
    category: "cleanup",
    description: "Clear message history locally where Telegram permits.",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
    destructive: true,
  },
  report_spam: {
    label: "Report spam",
    category: "moderation",
    description: "Report a chat or user as spam to Telegram.",
    needsMessage: false,
    targetHint: HINT_CHAT_TARGET,
    validTargets: new Set([
      TARGET_USERNAME,
      TARGET_NUMERIC_ID,
      TARGET_PUBLIC_LINK,
    ]),
    destructive: true,
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
