import * as React from "react"

import { Badge as UiBadge } from "../ui/badge"
import { Card } from "../ui/card"
import {
  Field as UiField,
  Input as UiInput,
  Select as UiSelect,
  Textarea as UiTextarea,
} from "../ui/form"
import { cn } from "../ui/utils"

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

export function StepHeading({
  step,
  title,
  detail,
  trailing,
}: {
  step: React.ReactNode
  title: string
  detail?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm text-primary [&_svg]:size-4">
          {step}
        </span>
        <div className="space-y-0.5">
          <h2 className="font-heading text-lg text-foreground">{title}</h2>
          {detail ? (
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  )
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
        "rounded-lg border border-border bg-card p-5",
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

export type TabItem<T extends string> = {
  id: T
  label: string
  icon?: React.ElementType
  badge?: React.ReactNode
}

// Dependency-free segmented tab strip. Used by the Accounts and Settings hubs
// to keep several related tools on one screen instead of separate nav routes.
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: ReadonlyArray<TabItem<T>>
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap gap-1 border-b border-border pb-2",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === value
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors [&_svg]:size-3.5",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
            )}
          >
            {Icon ? <Icon /> : null}
            {item.label}
            {item.badge != null ? (
              <span className="ml-1 text-[0.65rem] opacity-70">
                {item.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

// Pulsing placeholder block for async-loading content. Compose several to mimic
// the shape of the data that will replace them.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
    />
  )
}

// Compact metric tile. When `onClick` is provided it renders as a button so a
// stat can double as a filter control; `active` highlights the current filter.
export function StatCard({
  label,
  value,
  primary,
  active,
  onClick,
}: {
  label: string
  value: React.ReactNode
  primary?: boolean
  active?: boolean
  onClick?: () => void
}) {
  const className = cn(
    "rounded-lg border p-3 text-left transition-colors",
    primary
      ? "border-primary/40 bg-primary/10"
      : active
        ? "border-primary/40 bg-primary/5"
        : "border-border bg-card",
    onClick && "hover:border-primary/40 hover:bg-primary/5"
  )
  const body = (
    <>
      <span className="text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
      <strong className="mt-1 block font-heading text-2xl">{value}</strong>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={className}
      >
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
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
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center",
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
