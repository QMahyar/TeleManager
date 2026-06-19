import * as React from "react"

import { cn } from "./utils"

type BadgeVariant = "default" | "primary" | "destructive" | "outline"

const variants: Record<BadgeVariant, string> = {
  default: "border-border bg-muted/40 text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  outline: "border-border bg-transparent text-foreground",
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-1 text-[0.65rem] font-semibold tracking-[0.16em] whitespace-nowrap uppercase",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
