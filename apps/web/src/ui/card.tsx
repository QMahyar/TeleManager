import * as React from "react"

import { cn } from "./utils"

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn("border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  )
}
