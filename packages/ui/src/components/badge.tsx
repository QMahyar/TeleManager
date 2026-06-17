import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-1 text-[0.65rem] font-semibold tracking-[0.16em] whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/40 text-muted-foreground",
        primary: "border-primary/30 bg-primary/10 text-primary",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  )
}

export { Badge }
