import * as React from "react"

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={[
        "rounded-xl border border-border bg-card text-card-foreground shadow-md",
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  )
}
