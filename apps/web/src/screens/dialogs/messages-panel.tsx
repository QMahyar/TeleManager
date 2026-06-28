import { IconMessageCircle } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { ModalShell } from "../../ui/modal"
import {
  Badge,
  EmptyState,
  ErrorState,
  SectionLoader,
  ShowMore,
} from "../../components/ui"
import { dialogTarget } from "../../lib/dialog-resolver"
import type { ActionType, TelegramDialog, TelegramMessage } from "../../types"

const OUTLINE_VARIANT = "outline"

// First page of the message inspector, and the hard ceiling the backend honours
// (it clamps the limit to 100), so "Load more" steps from one to the other.
export const MESSAGES_PAGE = 50
export const MESSAGES_MAX = 100

// Per-dialog message inspector state: the chat, its loaded messages, the limit
// last requested, and the in-flight / failure flags that drive the loader,
// retry, and "Load more" affordances.
export type MessagePanelState = {
  dialog: TelegramDialog
  messages: TelegramMessage[]
  limit: number
  loading: boolean
  error: string | null
}

export function DialogMessagesPanel({
  panel,
  onStageMessage,
  onReload,
  onClose,
}: {
  panel: MessagePanelState | null
  onStageMessage: (
    actionType: ActionType,
    dialog: TelegramDialog,
    message: TelegramMessage
  ) => void
  onReload: (dialog: TelegramDialog, limit: number) => Promise<void>
  onClose: () => void
}) {
  const dialog = panel?.dialog
  const messages = panel?.messages ?? []
  const target = dialog ? dialogTarget(dialog) : ""
  // The backend returns the most recent `limit` messages with no cursor, so a
  // full page implies there may be more — until we hit the server's hard cap.
  const reachedCap = (panel?.limit ?? 0) >= MESSAGES_MAX
  const maybeMore = messages.length >= (panel?.limit ?? 0) && !reachedCap

  function stageMessage(actionType: ActionType, message: TelegramMessage) {
    if (!dialog) return
    onStageMessage(actionType, dialog, message)
    onClose()
  }

  return (
    <ModalShell
      open={Boolean(panel)}
      onClose={onClose}
      size="xl"
      kicker="Message inspector"
      title={dialog?.title ?? "Messages"}
      description={
        target ? <span className="font-mono text-xs">{target}</span> : undefined
      }
      footer={
        <Button variant={OUTLINE_VARIANT} onClick={onClose}>
          Close
        </Button>
      }
    >
      {dialog && panel ? (
        <>
          {panel.loading && !messages.length ? (
            <SectionLoader label="Loading messages…" />
          ) : panel.error ? (
            <ErrorState
              title="Couldn't load messages"
              detail={panel.error}
              onRetry={() => onReload(dialog, panel.limit)}
            />
          ) : messages.length ? (
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="border-border bg-muted/40 text-muted-foreground">
                      #{message.id}
                    </Badge>
                    {message.out ? (
                      <Badge tone="border-primary/30 bg-primary/10 text-primary">
                        outgoing
                      </Badge>
                    ) : null}
                    {message.has_media ? (
                      <Badge tone="border-border bg-background text-muted-foreground">
                        media
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {message.sender_name || message.sender_id || "unknown"}
                    </span>
                  </div>
                  <p className="mt-2 max-h-24 overflow-auto text-sm whitespace-pre-wrap">
                    {message.text || "No text"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={OUTLINE_VARIANT}
                      onClick={() => stageMessage("forward_message", message)}
                    >
                      Forward
                    </Button>
                    <Button
                      size="sm"
                      variant={OUTLINE_VARIANT}
                      onClick={() => stageMessage("pin_message", message)}
                    >
                      Pin
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => stageMessage("delete_messages", message)}
                    >
                      Delete
                    </Button>
                    {message.has_media ? (
                      <Button
                        size="sm"
                        variant={OUTLINE_VARIANT}
                        onClick={() => stageMessage("download_media", message)}
                      >
                        Download media
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {maybeMore ? (
                <ShowMore
                  shown={messages.length}
                  total={MESSAGES_MAX}
                  onMore={() => {
                    if (panel.loading) return
                    onReload(dialog, MESSAGES_MAX)
                  }}
                  label={panel.loading ? "Loading…" : "Load more"}
                />
              ) : reachedCap ? (
                <p className="px-1 pt-2 text-xs text-muted-foreground">
                  Showing the {messages.length} most recent messages (inspector
                  cap).
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={IconMessageCircle}
              title="No messages loaded"
              detail="This dialog has no recent cached messages or Telegram did not return any for this session."
            />
          )}
        </>
      ) : null}
    </ModalShell>
  )
}
