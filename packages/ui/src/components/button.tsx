import { IconLoader2 } from "@tabler/icons-react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { type VariantProps } from "class-variance-authority"

import { buttonVariants } from "@workspace/ui/components/button-variants"
import { cn } from "@workspace/ui/lib/utils"

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button }
