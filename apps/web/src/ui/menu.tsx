import * as React from "react"

import { Button } from "./button"
import { cn } from "./utils"

// Controlled dropdown menu. Unlike a native <details>, it closes on outside
// click and Escape, and only one is open at a time within its own state. The
// panel closes after any click inside it, since every item is an action.
export function Menu({
  label,
  trigger,
  align = "end",
  panelClassName,
  children,
}: {
  label: string
  trigger?: React.ReactNode
  align?: "start" | "end"
  panelClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-20 mt-2 grid min-w-44 gap-1 rounded-lg border border-border bg-card p-2 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            panelClassName
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
