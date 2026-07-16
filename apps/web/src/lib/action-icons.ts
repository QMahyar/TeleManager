import {
  IconArchive,
  IconArchiveOff,
  IconArrowForwardUp,
  IconBan,
  IconBell,
  IconBellOff,
  IconChecks,
  IconClockPlus,
  IconDownload,
  IconEraser,
  IconFlag,
  IconLink,
  IconLogout,
  IconMessage,
  IconPencil,
  IconPhoto,
  IconPin,
  IconPinnedOff,
  IconPlus,
  IconRobot,
  IconTitle,
  IconTrash,
  IconTrashX,
  IconUserCheck,
  IconUserMinus,
} from "@tabler/icons-react"
import type * as React from "react"

import type { ActionType } from "../types"

// One glyph per action, so the action-picker cards read at a glance. Kept in its
// own module (not constants.ts) so the icon imports don't bloat every consumer of
// actionMeta. The mapping is exhaustive over ActionType — a new action won't
// typecheck until it's given an icon here.
export const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  join_chat: IconPlus,
  leave_chat: IconLogout,
  send_message: IconMessage,
  send_media: IconPhoto,
  schedule_message: IconClockPlus,
  forward_message: IconArrowForwardUp,
  edit_message: IconPencil,
  delete_messages: IconTrash,
  pin_message: IconPin,
  unpin_message: IconPinnedOff,
  download_media: IconDownload,
  start_bot: IconRobot,
  block_user: IconBan,
  unblock_user: IconUserCheck,
  archive_chat: IconArchive,
  unarchive_chat: IconArchiveOff,
  mute_chat: IconBellOff,
  unmute_chat: IconBell,
  read_chat: IconChecks,
  delete_chat: IconTrashX,
  clear_chat: IconEraser,
  report_spam: IconFlag,
  edit_chat_title: IconTitle,
  export_invite_link: IconLink,
  kick_or_ban_user: IconUserMinus,
}
