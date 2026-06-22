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
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] font-medium tracking-[0.08em] whitespace-nowrap uppercase",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
