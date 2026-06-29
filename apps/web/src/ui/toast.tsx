import * as React from "react"

import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
} from "@tabler/icons-react"

import type { ToastTone } from "../types"

const toneStyles: Record<
  ToastTone,
  { container: string; icon: React.ElementType; iconClass: string }
> = {
  info: {
    container: "border-border",
    icon: IconInfoCircle,
    iconClass: "text-muted-foreground",
  },
  success: {
    container: "border-primary/40",
    icon: IconCircleCheck,
    iconClass: "text-primary",
  },
  error: {
    container: "border-destructive/50",
    icon: IconAlertTriangle,
    iconClass: "text-destructive",
  },
}

function Toast({
  tone = "info",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { tone?: ToastTone }) {
  const { container, icon: Icon, iconClass } = toneStyles[tone]
  return (
    <div
      data-slot="toast"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={[
        "tm-toast-in fixed right-5 bottom-5 z-50 flex max-w-sm items-start gap-2.5 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg",
        container,
        className
      ].filter(Boolean).join(" ")}
      {...props}
    >
      <Icon className={["mt-0.5 size-4 shrink-0", iconClass].filter(Boolean).join(" ")} />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

export { Toast }
