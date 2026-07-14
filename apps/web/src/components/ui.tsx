import * as React from "react"
import { Tabs as BaseTabs } from "@base-ui/react/tabs"

import {
  IconAlertTriangle,
  IconBolt,
  IconChevronDown,
  IconClock,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconHourglassHigh,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"

import { Badge as UiBadge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { InfoHint } from "../ui/info-hint"
import { Menu } from "../ui/menu"
import {
  Input as UiInput,
  Select as UiSelect,
  Textarea as UiTextarea,
} from "../ui/form"
import { api } from "../lib/api"
import {
  TIER_BADGE_CLASS,
  TIER_BLURB,
  TIER_LABEL,
  formatDuration,
} from "../lib/action-meta"
import type { ActionTier, Flash } from "../types"

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
        <p className="type-eyebrow text-muted-foreground">
          <span className="text-primary-text">›</span> {kicker}
        </p>
      ) : null}
      <h2 className="type-heading text-foreground">{title}</h2>
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
      className={[
        "p-4",
        tone === "raised" && "border-primary/20 shadow-md",
        className
      ].filter(Boolean).join(" ")}
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
      className={[
        "grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]",
        className
      ].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  )
}

export function PrimaryPane({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return <div className={["min-w-0 space-y-4", className].filter(Boolean).join(" ")}>{children}</div>
}

export function SidePane({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={[
        // svh minus the sticky top offset, footer height, and a bottom gap, so
        // the pinned pane never runs under the footer status bar (~2.25rem).
        "min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100svh-4.5rem)] xl:overflow-auto",
        className
      ].filter(Boolean).join(" ")}
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
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm text-primary-text [&_svg]:size-4">
            {step}
          </span>
        ) : null}
        <div className="space-y-0.5">
          <h2 className="type-heading text-foreground">{title}</h2>
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
  hint,
  className,
  children,
}: React.PropsWithChildren<{
  label: string
  htmlFor?: string
  // Optional richer explanation, surfaced behind an "ⓘ" next to the label (on
  // hover or click). Keep any short, always-on caption as a sibling under the
  // control — the hint is the second layer, not a substitute for it.
  hint?: React.ReactNode
  className?: string
}>) {
  return (
    <div data-slot="field" className={["grid gap-1.5", className].filter(Boolean).join(" ")}>
      <span className="type-label flex items-center gap-1.5 text-muted-foreground">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
        {hint ? <InfoHint label={`About ${label}`}>{hint}</InfoHint> : null}
      </span>
      {children}
    </div>
  )
}

// Re-exported so screens pull the help affordance from the same `ui` module as
// Field/Input rather than reaching into ../ui/* directly.
export { InfoHint }

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
        className={["min-w-0 flex-1", inputProps.className].filter(Boolean).join(" ")}
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

// Segmented tab strip. Built on Base UI Tabs so it gets roving tabindex, arrow-
// key navigation, and Home/End for free; the props (items/value/onChange) and
// the styling are unchanged, so every call site stays the same. Renders only the
// tab list — panels are rendered by the parent off `value`, as before.
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
    <BaseTabs.Root value={value} onValueChange={(next) => onChange(next as T)}>
      {/* Arc segmented pill strip: a warm track holds the tabs; the active tab
          lifts as a raised white chip rather than an underline. */}
      <BaseTabs.List
        className={[
          "inline-flex flex-wrap gap-1 rounded-lg border border-border bg-secondary p-1",
          className
        ].filter(Boolean).join(" ")}
      >
        {items.map((item) => {
          const Icon = item.icon
          return (
            <BaseTabs.Tab
              key={item.id}
              value={item.id}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors outline-none [&_svg]:size-3.5",
                "text-muted-foreground hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring/40",
                "data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-sm"
              ].filter(Boolean).join(" ")}
            >
              {Icon ? <Icon /> : null}
              {item.label}
              {item.badge != null ? (
                <span className="ml-1 text-[0.65rem] opacity-70">
                  {item.badge}
                </span>
              ) : null}
            </BaseTabs.Tab>
          )
        })}
      </BaseTabs.List>
    </BaseTabs.Root>
  )
}

// Pulsing placeholder block for async-loading content. Compose several to mimic
// the shape of the data that will replace them.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={["animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none", className].filter(Boolean).join(" ")}
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
  const className = [
    // Arc stat tile: an elevated white tile that lifts on hover when it doubles
    // as a filter control; a coral ring marks the active filter. `primary` is the
    // one highlighted metric (coral number); `active` is the filter indicator
    // (ring only) — kept separate so a filterable tile isn't forced coral just by
    // being the current filter.
    "rounded-xl border border-border bg-card p-4 text-left shadow-md transition-transform",
    (primary || active) && "ring-1 ring-primary/40",
    onClick && "hover:-translate-y-0.5"
  ].filter(Boolean).join(" ")
  const body = (
    <>
      <span className="type-meta text-muted-foreground">{label}</span>
      <strong
        className={[
          "mt-1 block type-stat",
          primary && "text-primary-text"
        ].filter(Boolean).join(" ")}
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
  // ready stays text-primary (not -text): the dot is decorative fill, the adjacent word carries meaning.
  ready: "text-primary",
  attention: "text-warning",
  error: "text-destructive",
  idle: "text-muted-foreground/50",
  live: "text-info",
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
      className={[
        "relative flex size-2 shrink-0 items-center justify-center",
        signalToneClass[tone],
        className
      ].filter(Boolean).join(" ")}
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
      className={[
        "flex w-full flex-wrap items-stretch border-y border-border",
        className
      ].filter(Boolean).join(" ")}
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
      <span className="type-meta whitespace-nowrap text-muted-foreground">
        {label}
      </span>
    </>
  )
  const classes = [
    "flex flex-1 items-center gap-2 border-l border-border px-3 py-2.5 first:border-l-0",
    onClick &&
      "text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
    active && "bg-primary/10",
    className
  ].filter(Boolean).join(" ")
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

// Empty placeholder for a zero-state list/panel. Pass `illustration` (a themed
// SVG) for hero empties, or `icon` for compact ones; `action` renders a CTA
// (e.g. "Add account") beneath the copy.
export function EmptyState({
  icon: Icon,
  illustration,
  title,
  detail,
  action,
  className,
}: {
  icon?: React.ElementType
  illustration?: React.ReactNode
  title: string
  detail: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center",
        className
      ].filter(Boolean).join(" ")}
    >
      {illustration ? (
        <div className="text-muted-foreground/70">{illustration}</div>
      ) : Icon ? (
        <Icon className="size-8 text-muted-foreground/50" />
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

// Failure placeholder with an optional retry. Use where a fetch can fail and the
// operator should be able to try again without reloading the app.
export function ErrorState({
  title = "Something went wrong",
  detail,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string
  detail: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-6 py-10 text-center",
        className
      ].filter(Boolean).join(" ")}
    >
      <IconAlertTriangle className="size-7 text-destructive" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <IconRefresh />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}

// Centered spinner for an in-flight section fetch. Keeps loading feedback
// consistent instead of each screen rolling its own.
export function SectionLoader({
  label = "Loading…",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted-foreground",
        className
      ].filter(Boolean).join(" ")}
    >
      <IconLoader2 className="size-6 animate-spin" />
      <p className="text-xs">{label}</p>
    </div>
  )
}

// "Showing N of M · Load more" footer for paginated/capped lists (activity,
// chat messages). Hides the button when everything is already shown.
export function ShowMore({
  shown,
  total,
  onMore,
  label = "Load more",
  className,
}: {
  shown: number
  total: number
  onMore: () => void
  label?: string
  className?: string
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-3 px-1 pt-2 text-xs text-muted-foreground",
        className
      ].filter(Boolean).join(" ")}
    >
      <span className="font-mono tabular-nums">
        Showing {shown} of {total}
      </span>
      {shown < total ? (
        <Button variant="ghost" size="xs" onClick={onMore}>
          {label}
        </Button>
      ) : null}
    </div>
  )
}

const TIER_ICON: Record<ActionTier, React.ElementType> = {
  instant: IconBolt,
  standard: IconClock,
  sensitive: IconHourglassHigh,
}

// Compact pill stating an action's risk tier (and optionally an estimated time).
// Reads from the backend-served tier so it never contradicts how the queue will
// actually pace the action. Colour rises with risk: calm primary → amber.
export function TimingBadge({
  tier,
  seconds,
  className,
}: {
  tier: ActionTier
  seconds?: number
  className?: string
}) {
  const Icon = TIER_ICON[tier]
  return (
    <span
      title={TIER_BLURB[tier]}
      className={[
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 type-meta whitespace-nowrap [&_svg]:size-3",
        TIER_BADGE_CLASS[tier],
        className
      ].filter(Boolean).join(" ")}
    >
      <Icon />
      {TIER_LABEL[tier]}
      {seconds != null ? <span className="opacity-80">· ~{formatDuration(seconds)}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Disclosure — the one collapsible
//
// Replaces the grab-bag of hand-rolled toggles and native <details> the app had
// grown (each with its own "Hide"/"Change"/"Show" microcopy and no affordance).
// One header row: optional icon · label · muted hint · count · a chevron that
// rotates on open. Works uncontrolled (`defaultOpen`) or controlled (`open` +
// `onOpenChange`) so a parent can force it open — e.g. revealing the field
// section when a submit fails validation.
// ---------------------------------------------------------------------------
export function Disclosure({
  label,
  hint,
  count,
  icon: Icon,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  flush = false,
  children,
  className,
}: React.PropsWithChildren<{
  label: React.ReactNode
  hint?: React.ReactNode
  count?: React.ReactNode
  icon?: React.ElementType
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  flush?: boolean
  className?: string
}>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const open = controlledOpen ?? internalOpen

  function toggle() {
    const next = !open
    if (controlledOpen === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }

  return (
    <div
      className={[
        flush
          ? "border-t border-border"
          : "overflow-hidden rounded-lg border border-border bg-background/40",
        className
      ].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={[
          "flex w-full items-center gap-2 text-left text-xs transition-colors",
          flush
            ? "py-2.5 text-muted-foreground hover:text-foreground"
            : "px-3 py-2 hover:bg-muted/40"
        ].filter(Boolean).join(" ")}
      >
        {Icon ? (
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
        <span className="font-medium text-foreground">{label}</span>
        {hint ? (
          <span className="min-w-0 truncate text-muted-foreground">{hint}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-2 pl-2">
          {count != null ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
          <IconChevronDown
            className={[
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            ].filter(Boolean).join(" ")}
          />
        </span>
      </button>
      {open ? (
        <div className={[flush ? "pb-3" : "border-t border-border p-3"].filter(Boolean).join(" ")}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Callout — the one inline notice
//
// A bordered tinted box for inline warnings/notices. `tone` carries the colour
// language (info/primary/warning/danger), an optional leading icon, an optional
// emphasised `title` row (which may hold badges), and body children. Danger and
// warning announce themselves to assistive tech via role="alert"; info/primary
// are passive context.
// ---------------------------------------------------------------------------
export type CalloutTone = "info" | "primary" | "warning" | "danger"

const calloutToneClass: Record<CalloutTone, string> = {
  info: "border-border bg-muted/30 text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-foreground",
  warning:
    "border-warning/40 bg-warning/10 text-warning",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
}

export function Callout({
  tone = "info",
  icon: Icon,
  title,
  trailing,
  children,
  className,
}: React.PropsWithChildren<{
  tone?: CalloutTone
  icon?: React.ElementType
  title?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}>) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : undefined}
      className={[
        "flex gap-2 rounded-lg border p-2.5 text-xs",
        calloutToneClass[tone],
        className
      ].filter(Boolean).join(" ")}
    >
      {Icon ? <Icon className="mt-px size-3.5 shrink-0" /> : null}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? (
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {title}
          </div>
        ) : null}
        {children ? <div className="leading-5">{children}</div> : null}
      </div>
      {trailing}
    </div>
  )
}
