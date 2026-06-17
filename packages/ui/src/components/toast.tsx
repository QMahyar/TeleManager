import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Toast({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toast"
      role="status"
      className={cn(
        "fixed right-5 bottom-5 z-50 border border-primary/30 bg-card px-4 py-3 text-sm text-card-foreground shadow-lg",
        className
      )}
      {...props}
    />
  )
}

export { Toast }
