import { IconLoader2 } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

function LoadingIndicator({ className }: { className?: string }) {
  return (
    <div
      data-slot="loading-indicator"
      className={cn(
        "fixed top-5 right-5 z-50 flex items-center gap-2 border border-border bg-card px-3 py-2 text-xs tracking-[0.16em] text-card-foreground uppercase",
        className
      )}
    >
      <IconLoader2 className="size-4 animate-spin" /> Working
    </div>
  )
}

export { LoadingIndicator }
