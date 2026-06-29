import * as React from "react"

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={[
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  )
}
