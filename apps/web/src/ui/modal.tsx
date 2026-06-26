import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { IconAlertTriangle, IconX } from "@tabler/icons-react"

import { cn } from "./utils"

type ModalAlign = "center" | "start" | "end"
export type ModalSize = "sm" | "md" | "lg" | "xl"

// Vertical placement of the centred box. The box is always horizontally centred;
// `start`/`end` pin it near the top/bottom to preserve the previous behaviour.
const positionClass: Record<ModalAlign, string> = {
  center: "top-1/2 -translate-y-1/2",
  start: "top-[8vh]",
  end: "bottom-4",
}

// One width scale for every modal so confirm dialogs, the schedule builder, and
// run details all share a coherent set of sizes instead of ad-hoc max-w-* values.
const sizeClass: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
}

// Shared modal overlay, built on Base UI Dialog: focus trap + focus restore,
// body scroll lock, Escape, and click-outside dismissal all come from the
// library. Entrance/exit motion is CSS-only via Base UI's data-[starting-style]/
// data-[ending-style] attributes (it keeps the node mounted through the exit),
// and is dropped under prefers-reduced-motion.
export function Modal({
  open,
  onClose,
  align = "center",
  size = "md",
  // When true (default) the popup itself scrolls — right for simple Modals whose
  // content has no internal scroll region. ModalShell sets this false because it
  // owns the scroll on its body so the header/footer can stay pinned.
  scroll = true,
  className,
  labelledBy,
  describedBy,
  children,
}: {
  open: boolean
  onClose: () => void
  align?: ModalAlign
  size?: ModalSize
  scroll?: boolean
  className?: string
  labelledBy?: string
  describedBy?: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-background/70 backdrop-blur-sm",
            "transition-opacity duration-200 ease-out motion-reduce:transition-none",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
          )}
        />
        <Dialog.Popup
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className={cn(
            "fixed left-1/2 z-50 -translate-x-1/2",
            positionClass[align],
            "w-[calc(100%-2rem)]",
            sizeClass[size],
            "max-h-[calc(100dvh-2rem)] rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none",
            scroll ? "overflow-y-auto" : "overflow-hidden",
            "transition-[opacity,transform,translate,scale] duration-200 ease-out motion-reduce:transition-none",
            "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0",
            className
          )}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Standard chrome for a content modal: an optional kicker, a title, an optional
// description, a persistent close button, an optional danger icon, a scrolling
// body, and an optional sticky footer for actions. Migrating every modal onto
// this gives them one consistent header/footer instead of hand-rolled markup,
// and wires aria-labelledby/aria-describedby automatically.
export function ModalShell({
  open,
  onClose,
  kicker,
  title,
  description,
  danger = false,
  size = "md",
  align = "center",
  footer,
  headerExtra,
  bodyClassName,
  children,
}: {
  open: boolean
  onClose: () => void
  kicker?: string
  title: React.ReactNode
  description?: React.ReactNode
  danger?: boolean
  size?: ModalSize
  align?: ModalAlign
  footer?: React.ReactNode
  headerExtra?: React.ReactNode
  bodyClassName?: string
  children?: React.ReactNode
}) {
  const titleId = React.useId()
  const descriptionId = React.useId()
  return (
    <Modal
      open={open}
      onClose={onClose}
      size={size}
      align={align}
      scroll={false}
      labelledBy={titleId}
      describedBy={description ? descriptionId : undefined}
      className="flex max-h-[calc(100dvh-2rem)] flex-col"
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        {danger ? (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
            <IconAlertTriangle className="size-4.5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          {kicker ? (
            <p
              className={cn(
                "type-eyebrow",
                danger ? "text-destructive" : "text-primary"
              )}
            >
              {kicker}
            </p>
          ) : null}
          <h2
            id={titleId}
            className="type-heading text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="text-sm leading-6 text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>
        {headerExtra}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <IconX className="size-4.5" />
        </button>
      </div>
      {children != null ? (
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>
          {children}
        </div>
      ) : null}
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-well/40 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </Modal>
  )
}
