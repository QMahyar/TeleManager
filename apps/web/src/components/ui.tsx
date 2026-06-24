import * as React from "react"

import {
  IconChevronDown,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconLoader2,
} from "@tabler/icons-react"

import { Badge as UiBadge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Menu } from "../ui/menu"
import {
  Input as UiInput,
  Select as UiSelect,
  Textarea as UiTextarea,
} from "../ui/form"
import { cn } from "../ui/utils"
import { api } from "../lib/api"
import type { Flash } from "../types"

// `kicker` is optional: the `› EYEBROW` motif was on every section and became
// noise. Pass it only where the category isn't already obvious from context.
// Title is mono (brand rule) at the unified panel-heading size (text-lg).
export function SectionTitle({
  kicker,
  title,
  detail,
}: {
  kicker?: string
  title: string
  detail?: string
}) {
  return (
    <div className="space-y-1">
      {kicker ? (
        <p className="font-mono text-[0.65rem] tracking-[0.22em] text-muted-foreground uppercase">
          <span className="text-primary">›</span> {kicker}
        </p>
      ) : null}
      <h2 className="font-heading text-lg tracking-tight text-foreground">
        {title}
      </h2>
      {detail ? (
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

// A panel is the base surface (Card + padding). `tone="raised"` lifts the one
// focal zone per screen with a stronger shadow + a hairline primary edge, so a
// screen has somewhere for the eye to land first. Everything else stays base.
export function Panel({
  children,
  className,
  tone = "base",
}: React.PropsWithChildren<{ className?: string; tone?: "base" | "raised" }>) {
  return (
    <Card
      className={cn(
        "p-4",
        tone === "raised" && "border-primary/20 shadow-md",
        className
      )}
    >
      {children}
    </Card>
  )
}

export function PageGrid({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]",
        className
      )}
    >
      {children}
    </div>
  )
}

export function PrimaryPane({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cn("min-w-0 space-y-4", className)}>{children}</div>
}

export function SidePane({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        // svh minus the sticky top offset, footer height, and a bottom gap, so
        // the pinned pane never runs under the footer status bar (~2.25rem).
        "min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100svh-4.5rem)] xl:overflow-auto",
        className
      )}
    >
      {children}
    </div>
  )
}

// `step` (the primary-tinted chip) is now optional. Keep it where the number/
// icon carries real sequence meaning (Login step 1→2, Dialogs 1→2); omit it on
// standalone panels so the chip stops being decoration on every heading.
export function StepHeading({
  step,
  title,
  detail,
  trailing,
}: {
  step?: React.ReactNode
  title: string
  detail?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {step != null ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm text-primary [&_svg]:size-4">
            {step}
          </span>
        ) : null}
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

// A labelled field. The label's uppercase/tracked styling is scoped to its own
// <span> so it never leaks into the children — earlier the whole wrapper was a
// `text-... uppercase` <label>, which shouted any rich content (e.g. the target
// composer's hint) and wrapped inputs/buttons inside a <label>. Children render
// as siblings; `htmlFor`/`id` still associate a single control when given.
export function Field({
  label,
  htmlFor,
  className,
  children,
}: React.PropsWithChildren<{
  label: string
  htmlFor?: string
  className?: string
}>) {
  return (
    <div data-slot="field" className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </span>
      {children}
    </div>
  )
}

export function Input(props: React.ComponentProps<typeof UiInput>) {
  return <UiInput {...props} />
}

export function Select(props: React.ComponentProps<typeof UiSelect>) {
  return <UiSelect {...props} />
}

// Free-text path field with a native "Browse ▾" control offering both a file and a
// folder picker. The backend opens a real OS dialog (the browser can't reveal
// absolute paths itself) and the chosen path is filled in. Typing stays fully
// available, and an unsupported host (no native picker) surfaces a toast and keeps
// the text box. `browse` only decides which option is listed first.
export function PathInput({
  value,
  onChange,
  flash,
  browse = "file",
  ...inputProps
}: {
  value: string
  onChange: (value: string) => void
  flash?: Flash
  browse?: "file" | "directory"
} & Omit<React.ComponentProps<typeof UiInput>, "value" | "onChange">) {
  const [picking, setPicking] = React.useState(false)

  async function openPicker(kind: "file" | "directory") {
    setPicking(true)
    try {
      const result = await api<{ path: string | null }>("/api/system/pick-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: kind === "directory" ? "Select a folder" : "Select a file",
        }),
      })
      if (result.path) onChange(result.path)
    } catch (error) {
      flash?.(
        error instanceof Error
          ? error.message
          : "Could not open the picker. Type the path manually."
      )
    } finally {
      setPicking(false)
    }
  }

  // List the field's natural target first, but always offer both.
  const order: Array<"file" | "directory"> =
    browse === "directory" ? ["directory", "file"] : ["file", "directory"]

  return (
    <div className="flex gap-2">
      <UiInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
        className={cn("min-w-0 flex-1", inputProps.className)}
      />
      <Menu
        label="Browse for a file or folder"
        triggerProps={{ variant: "outline", size: "default", disabled: picking }}
        trigger={
          <>
            {picking ? (
              <IconLoader2 className="animate-spin" />
            ) : (
              <IconFolderOpen />
            )}
            Browse
            <IconChevronDown />
          </>
        }
      >
        {order.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={() => openPicker(kind)}
          >
            {kind === "directory" ? <IconFolder /> : <IconFile />}
            {kind === "directory" ? "Pick folder" : "Pick file"}
          </Button>
        ))}
      </Menu>
    </div>
  )
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
  detail,
  primary,
  active,
  onClick,
}: {
  label: string
  value: React.ReactNode
  detail?: string
  primary?: boolean
  active?: boolean
  onClick?: () => void
}) {
  const className = cn(
    "rounded-lg border border-l-2 border-border bg-card p-3 text-left transition-colors",
    primary || active ? "border-l-primary" : "border-l-border",
    onClick && "hover:border-l-primary hover:bg-muted/30"
  )
  const body = (
    <>
      <span className="font-mono text-[0.62rem] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      <strong
        className={cn(
          "mt-1 block font-mono text-2xl",
          (primary || active) && "text-primary"
        )}
      >
        {value}
      </strong>
      {detail ? (
        <span className="mt-1 block text-xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
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

// ---------------------------------------------------------------------------
// Console readout — the app's signature instrument motif
//
// A `SignalDot` is a status light; a `Readout` is a hairline-ruled strip of
// `ReadoutItem`s. Together they state live machine state (fleet readiness,
// queued operations, safety interlocks) as one instrument line rather than a
// row of boxed KPI cards. The five signal tones mirror `statusTone()` so the
// dot speaks the same color language as the rest of the app.
// ---------------------------------------------------------------------------

export type SignalTone = "ready" | "attention" | "error" | "idle" | "live"

const signalToneClass: Record<SignalTone, string> = {
  ready: "text-primary",
  attention: "text-amber-500 dark:text-amber-400",
  error: "text-destructive",
  idle: "text-muted-foreground/50",
  live: "text-sky-500 dark:text-sky-400",
}

// Color comes from one `text-*` tone class; the center, halo, and (live) pulse
// all fill from `bg-current` so they can never disagree — the same trick the
// footer status bar uses. `live` adds a ping suppressed under reduced motion.
// Decorative: the adjacent word names the state, so the dot is aria-hidden.
export function SignalDot({
  tone = "idle",
  className,
}: {
  tone?: SignalTone
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-2 shrink-0 items-center justify-center",
        signalToneClass[tone],
        className
      )}
    >
      {tone === "live" ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
      ) : null}
      <span className="absolute inline-flex size-full rounded-full bg-current opacity-20" />
      <span className="relative inline-flex size-1 rounded-full bg-current" />
    </span>
  )
}

// The instrument strip. Ruled top and bottom only (no side borders, no fill, no
// radius) so it reads as a console readout line, not a card. Items supply their
// own left-hand hairline dividers.
export function Readout({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-stretch border-y border-border",
        className
      )}
    >
      {children}
    </div>
  )
}

// One segment: `[dot] value LABEL`, inline (not stacked) so it stays a readout
// rather than a KPI tile. Dividers are per-item `border-l` + `first:border-l-0`
// (not `divide-x`, which leaves phantom borders when the strip wraps). With
// `onClick` it becomes a real filter button; `active` highlights the current
// filter, mirroring how `StatCard` signalled an active filter.
export function ReadoutItem({
  label,
  value,
  tone,
  active,
  onClick,
  className,
}: {
  label: string
  value: React.ReactNode
  tone?: SignalTone
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const inner = (
    <>
      {tone ? <SignalDot tone={tone} /> : null}
      <span className="font-mono text-base leading-none tabular-nums text-foreground">
        {value}
      </span>
      <span className="font-mono text-[0.62rem] leading-none tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase">
        {label}
      </span>
    </>
  )
  const classes = cn(
    "flex flex-1 items-center gap-2 border-l border-border px-3 py-2.5 first:border-l-0",
    onClick &&
      "text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
    active && "bg-primary/10",
    className
  )
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={classes}
      >
        {inner}
      </button>
    )
  }
  return <div className={classes}>{inner}</div>
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
