import * as React from "react"

import { cn } from "../ui/utils"

import type { ActionTier, SafetySettings } from "../types"
import { Field, Input, TimingBadge } from "./ui"

// One numeric safety knob. Kept local so the rows stay terse and consistent.
function SafetyNumber({
  label,
  value,
  min,
  max,
  onChange,
  help,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  help: string
}) {
  return (
    <Field label={label}>
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
}: {
  tier: ActionTier
  label: string
  value: number
  min: number
  onChange: (value: number) => void
  help: string
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
          {label}
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
        />
        <SafetyNumber
          label="Max operations"
          value={safety.max_operations}
          min={1}
          max={250}
          onChange={(value) => patch({ max_operations: value })}
          help="Hard cap on total queued operations per run (1–250)."
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
          />
          <TierField
            tier="standard"
            label="Standard (s)"
            value={safety.delay_between_actions}
            min={1}
            onChange={(value) => patch({ delay_between_actions: value })}
            help="Leave, block, edit, pin, report (1–120)."
          />
          <TierField
            tier="sensitive"
            label="Careful (s)"
            value={safety.delay_sensitive}
            min={1}
            onChange={(value) => patch({ delay_sensitive: value })}
            help="Send, media, forward, join, start bot — plus jitter (1–120)."
          />
        </div>
      </div>
    </div>
  )
}
