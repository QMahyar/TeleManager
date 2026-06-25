import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"

import { cn } from "./utils"

type ModalAlign = "center" | "start" | "end"

// Vertical placement of the centred box. The box is always horizontally centred;
// `start`/`end` pin it near the top/bottom to preserve the previous behaviour.
const positionClass: Record<ModalAlign, string> = {
  center: "top-1/2 -translate-y-1/2",
  start: "top-[10vh]",
  end: "bottom-4",
}

// Shared modal overlay, built on Base UI Dialog: focus trap + focus restore,
// body scroll lock, Escape, and click-outside dismissal all come from the
// library (the hand-rolled focus-trap hook is gone). Callers keep the same API
// and style the panel via `className`.
export function Modal({
  open,
  onClose,
  align = "center",
  className,
  labelledBy,
  describedBy,
  children,
}: {
  open: boolean
  onClose: () => void
  align?: ModalAlign
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
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Popup
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className={cn(
            "fixed left-1/2 z-50 -translate-x-1/2",
            positionClass[align],
            "max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-border bg-card text-card-foreground shadow-lg outline-none",
            className
          )}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
