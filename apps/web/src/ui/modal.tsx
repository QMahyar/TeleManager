import * as React from "react"

import { useFocusTrap } from "./use-focus-trap"
import { cn } from "./utils"

type ModalAlign = "center" | "start" | "end"

const alignClass: Record<ModalAlign, string> = {
  center: "place-items-center",
  start: "place-items-start pt-[10vh]",
  end: "place-items-end",
}

// Shared overlay: backdrop, Escape to close, click-outside to close, body scroll
// lock, and a focus trap on the panel. Callers style the panel via `className`.
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
  const trapRef = useFocusTrap<HTMLElement>(open)

  React.useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 grid bg-background/80 p-4 backdrop-blur-sm",
        alignClass[align]
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={trapRef as React.RefObject<HTMLElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={cn(
          "w-full rounded-lg border border-border bg-card text-card-foreground shadow-lg",
          className
        )}
      >
        {children}
      </section>
    </div>
  )
}
