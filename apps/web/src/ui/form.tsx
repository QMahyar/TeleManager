import * as React from "react"

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={[
        "h-9 rounded-lg border border-input bg-card px-3 text-base text-foreground transition-[color,box-shadow,border-color] outline-none file:border-0 file:bg-transparent file:text-sm file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={[
        "h-9 rounded-lg border border-input bg-card px-3 text-base text-foreground transition-[color,box-shadow,border-color] outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={[
        "min-h-24 rounded-lg border border-input bg-card p-3 text-base text-foreground transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

export { Input, Select, Textarea }
