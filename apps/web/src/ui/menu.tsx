import * as React from "react"
import { createPortal } from "react-dom"

import { Button } from "./button"
import { cn } from "./utils"

const GAP = 8 // px between trigger and panel, and from the viewport edge

type PanelStyle = { top: number; left: number }

// Controlled dropdown menu. Unlike a native <details>, it closes on outside
// click and Escape, and only one is open at a time within its own state. The
// panel closes after any click inside it, since every item is an action.
//
// The panel renders through a portal with `position: fixed`, so it is never
// clipped by an `overflow` ancestor (e.g. a horizontally scrollable table) and
// flips above the trigger when there isn't room below.
export function Menu({
  label,
  trigger,
  align = "end",
  panelClassName,
  triggerProps,
  children,
}: {
  label: string
  trigger?: React.ReactNode
  align?: "start" | "end"
  panelClassName?: string
  // Customise the trigger button (size/variant/disabled/className). Defaults to a
  // square icon-sm outline button so existing call sites are unchanged.
  triggerProps?: Pick<
    React.ComponentProps<typeof Button>,
    "variant" | "size" | "className" | "disabled"
  >
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [style, setStyle] = React.useState<PanelStyle | null>(null)
  // The wrapper sizes to the trigger (relative + single child), so its rect is
  // the trigger's rect — no ref forwarding through <Button> required.
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Close and drop the measured position together, so the next open re-measures
  // from the hidden fallback coords (no flash) without resetting state inside the
  // layout effect.
  const close = React.useCallback(() => {
    setOpen(false)
    setStyle(null)
  }, [])

  // Position the panel from the trigger's viewport rect. Runs in a layout
  // effect so the panel is measured (for the upward flip and edge clamping)
  // before the browser paints — no first-frame jump.
  React.useLayoutEffect(() => {
    if (!open) return
    const triggerEl = triggerRef.current
    const panel = panelRef.current
    if (!triggerEl || !panel) return

    const rect = triggerEl.getBoundingClientRect()
    const { offsetWidth: panelWidth, offsetHeight: panelHeight } = panel

    const left = align === "end" ? rect.right - panelWidth : rect.left
    const clampedLeft = Math.max(
      GAP,
      Math.min(left, window.innerWidth - panelWidth - GAP)
    )

    const flipUp = rect.bottom + GAP + panelHeight > window.innerHeight
    const top = flipUp ? rect.top - panelHeight - GAP : rect.bottom + GAP

    setStyle({ top, left: clampedLeft })
  }, [open, align])

  React.useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const insideTrigger = triggerRef.current?.contains(target)
      const insidePanel = panelRef.current?.contains(target)
      if (!insideTrigger && !insidePanel) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    // A fixed panel detaches from the trigger on scroll, so dismiss instead of
    // chasing the trigger. `true` catches scrolls on nested containers too.
    const onScroll = () => close()
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open, close])

  return (
    <div ref={triggerRef} className="relative inline-flex">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        {...triggerProps}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </Button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={label}
              style={{
                position: "fixed",
                top: style?.top ?? -9999,
                left: style?.left ?? -9999,
                // Hidden until measured to avoid a flash at the fallback coords.
                visibility: style ? "visible" : "hidden",
              }}
              className={cn(
                "z-50 grid min-w-44 gap-1 rounded-lg border border-border bg-card p-2 shadow-lg",
                panelClassName
              )}
              onClick={close}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
