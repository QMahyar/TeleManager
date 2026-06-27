import * as React from "react"

import { cn } from "../ui/utils"

import type { ActionTier, SafetySettings } from "../types"
import { Field, InfoHint, Input, TimingBadge } from "./ui"

// One numeric safety knob. Kept local so the rows stay terse and consistent.
function SafetyNumber({
  label,
  value,
  min,
  max,
  onChange,
  help,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  help: string
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        max={max}
        step="0.5"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-xs leading-5 text-muted-foreground">{help}</span>
    </Field>
  )
}

// A tier delay knob with its tier badge, so the colour language matches the
// timing badges shown on action cards and the Run button.
function TierField({
  tier,
  label,
  value,
  min,
  onChange,
  help,
  hint,
}: {
  tier: ActionTier
  label: string
  value: number
  min: number
  onChange: (value: number) => void
  help: string
  hint?: string
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="type-label flex items-center gap-1.5 text-muted-foreground">
          {label}
          {hint ? <InfoHint label={`About ${label} cooldown`}>{hint}</InfoHint> : null}
        </span>
        <TimingBadge tier={tier} />
      </div>
      <Input
        type="number"
        min={min}
        max={120}
        step="0.5"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-xs leading-5 text-muted-foreground">{help}</span>
    </div>
  )
}

export function SafetyEditor({
  safety,
  setSafety,
  dense = false,
}: {
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  // `dense` stacks fields into one column for narrow containers (the Actions
  // right rail). Default uses a responsive multi-column grid (Settings page).
  dense?: boolean
}) {
  const patch = (next: Partial<SafetySettings>) =>
    setSafety({ ...safety, ...next })

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid gap-3",
          dense ? "grid-cols-1" : "sm:grid-cols-2"
        )}
      >
        <SafetyNumber
          label="Account delay (s)"
          value={safety.delay_between_accounts}
          min={1}
          max={60}
          onChange={(value) => patch({ delay_between_accounts: value })}
          help="Wait when switching to a different account (1–60)."
          hint="Pause inserted whenever a run moves from one account to the next. Spacing accounts apart avoids hammering Telegram from several sessions at once and makes the fleet look less coordinated."
        />
        <SafetyNumber
          label="Max operations"
          value={safety.max_operations}
          min={1}
          max={250}
          onChange={(value) => patch({ max_operations: value })}
          help="Hard cap on total queued operations per run (1–250)."
          hint="A safety stop: a single run never executes more than this many steps, however large the queue. Keep it low to make runs small and reviewable; raise it only when you trust the queue."
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs leading-5 text-muted-foreground">
          Per-action cooldowns. TeleManager paces each action by how hard Telegram
          rate-limits it, so harmless reads fly and spam-prone sends stay spaced.
        </p>
        <div
          className={cn(
            "grid gap-3",
            dense ? "grid-cols-1" : "sm:grid-cols-3"
          )}
        >
          <TierField
            tier="instant"
            label="Fast (s)"
            value={safety.delay_instant}
            min={0}
            onChange={(value) => patch({ delay_instant: value })}
            help="Mark read, mute, archive, local delete (0–120)."
            hint="Cooldown between low-risk actions Telegram barely rate-limits — marking read, muting, archiving, deleting on your side. Safe to keep short so reads fly through."
          />
          <TierField
            tier="standard"
            label="Standard (s)"
            value={safety.delay_between_actions}
            min={1}
            onChange={(value) => patch({ delay_between_actions: value })}
            help="Leave, block, edit, pin, report (1–120)."
            hint="Cooldown between everyday actions that change state but aren't spam-prone — leaving chats, blocking, editing, pinning, reporting. A few seconds keeps them from looking automated."
          />
          <TierField
            tier="sensitive"
            label="Careful (s)"
            value={safety.delay_sensitive}
            min={1}
            onChange={(value) => patch({ delay_sensitive: value })}
            help="Send, media, forward, join, start bot — plus jitter (1–120)."
            hint="Cooldown before the spam-prone actions Telegram watches hardest — sending, media, forwarding, joining, starting bots. A small random jitter is added on top so the timing isn't robotic. Keep this the longest of the three."
          />
        </div>
      </div>
    </div>
  )
}
