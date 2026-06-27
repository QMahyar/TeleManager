import * as React from "react"
import { Popover } from "@base-ui/react/popover"
import { IconInfoCircle } from "@tabler/icons-react"

import { cn } from "./utils"

// An inline "ⓘ" help affordance. Built on Base UI Popover so it opens on hover
// AND on click/keyboard from one accessible, portal-rendered, collision-aware
// component — the same foundation as ui/menu.tsx and ui/dialog.tsx. Native HTML
// `title=` tooltips (what the app used before) are slow, unstyled, invisible on
// touch, and unreachable by keyboard; this replaces them for option help.
//
// Use for the *richer* explanation behind an option (what it does · why it
// matters · an example/safe range). Keep any short, always-on caption inline —
// the hint is the second layer, not a substitute for the essential one-liner.
export function InfoHint({
  label,
  className,
  children,
}: {
  // Accessible name for the trigger button, e.g. "About account delay". The
  // visible glyph carries no text, so screen readers rely on this.
  label: string
  className?: string
  // The help content — a string or rich nodes shown inside the popover.
  children: React.ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        // openOnHover gives the hover affordance; the trigger stays a real
        // button so click, Enter/Space, and touch all open it too. Short delays
        // keep it feeling responsive without flickering on incidental passes.
        openOnHover
        delay={120}
        closeDelay={80}
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground/70 outline-none transition-colors",
              "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              "data-[popup-open]:text-primary",
              className
            )}
          >
            <IconInfoCircle className="size-3.5" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={6} className="z-50">
          <Popover.Popup
            className={cn(
              "max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg outline-none",
              // Normal-case so it reads as prose even when the trigger sits next
              // to an uppercase `type-label`.
              "text-xs leading-5 font-normal normal-case tracking-normal"
            )}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
