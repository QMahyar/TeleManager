import * as React from "react"
import { Menu as BaseMenu } from "@base-ui/react/menu"

import { Button } from "./button"
import { cn } from "./utils"

// Dropdown menu built on Base UI Menu: it brings keyboard navigation (arrow
// keys, Home/End, typeahead), focus management, collision-aware positioning
// (auto-flip), portal rendering (never clipped by a scrollable table), and
// Escape / outside-click dismissal — replacing the hand-rolled positioning and
// event wiring this used to do itself. The public API is unchanged; menu entries
// move from <Button> to <MenuItem> so Base UI can drive their keyboard nav.
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
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            {...triggerProps}
            aria-label={label}
          >
            {trigger}
          </Button>
        }
      />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          side="bottom"
          align={align}
          sideOffset={8}
          className="z-50"
        >
          <BaseMenu.Popup
            aria-label={label}
            className={cn(
              "grid min-w-44 gap-1 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-lg outline-none",
              panelClassName
            )}
          >
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

// A menu entry. `data-highlighted` is set by Base UI on the keyboard/pointer
// focused item, so hover and arrow-key focus share one visual state. Selecting
// an item closes the menu (Base UI default), matching the old behaviour where
// every entry was a one-shot action.
const menuItemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none select-none [&_svg]:size-3.5"

const menuItemVariant: Record<"default" | "destructive", string> = {
  default:
    "text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
  destructive:
    "text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive",
}

export function MenuItem({
  onClick,
  variant = "default",
  className,
  disabled,
  children,
}: {
  onClick?: () => void
  variant?: "default" | "destructive"
  className?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <BaseMenu.Item
      disabled={disabled}
      onClick={onClick}
      className={cn(menuItemClass, menuItemVariant[variant], className)}
    >
      {children}
    </BaseMenu.Item>
  )
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 h-px bg-border" />
}
