import * as React from "react"

import { Badge as UiBadge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import {
  Field as UiField,
  Input as UiInput,
  Select as UiSelect,
  Textarea as UiTextarea,
} from "@workspace/ui/components/form"
import { cn } from "@workspace/ui/lib/utils"

export function SectionTitle({
  kicker,
  title,
  detail,
}: {
  kicker: string
  title: string
  detail?: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-primary uppercase">
        {kicker}
      </p>
      <h2 className="font-heading text-2xl text-foreground">{title}</h2>
      {detail ? (
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

export function Panel({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return <Card className={cn("p-5", className)}>{children}</Card>
}

export function Field({
  label,
  children,
}: React.PropsWithChildren<{ label: string }>) {
  return (
    <UiField>
      {label}
      {children}
    </UiField>
  )
}

export function Input(props: React.ComponentProps<typeof UiInput>) {
  return <UiInput {...props} />
}

export function Select(props: React.ComponentProps<typeof UiSelect>) {
  return <UiSelect {...props} />
}

export function Textarea(props: React.ComponentProps<typeof UiTextarea>) {
  return <UiTextarea {...props} />
}

export function Badge({
  children,
  tone,
}: React.PropsWithChildren<{ tone?: string }>) {
  return <UiBadge className={tone}>{children}</UiBadge>
}

export function Metric({
  label,
  value,
  primary,
}: {
  label: string
  value: number
  primary?: boolean
}) {
  return (
    <div
      className={cn(
        "border border-border bg-card p-5",
        primary && "border-primary/40 bg-primary/10"
      )}
    >
      <span className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </span>
      <strong className="mt-3 block font-heading text-4xl">{value}</strong>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  detail,
  className,
}: {
  icon?: React.ElementType
  title: string
  detail: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-muted/20 px-6 py-10 text-center",
        className
      )}
    >
      {Icon ? <Icon className="size-8 text-muted-foreground/50" /> : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  )
}
