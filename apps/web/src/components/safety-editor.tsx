import * as React from "react"

import { cn } from "../ui/utils"

import type { SafetySettings } from "../types"
import { Field, Input } from "./ui"

export function SafetyEditor({
  safety,
  setSafety,
  dense = false,
}: {
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  // `dense` stacks the three fields into one column for narrow containers (the
  // Actions right rail). Default keeps the 3-up grid used on the Settings page.
  dense?: boolean
}) {
  return (
    <div className={cn("grid gap-3", dense ? "grid-cols-1" : "md:grid-cols-3")}>
      <Field label="Account delay (s)">
        <Input
          type="number"
          min={1}
          max={60}
          autoComplete="off"
          value={safety.delay_between_accounts}
          onChange={(e) =>
            setSafety({
              ...safety,
              delay_between_accounts: Number(e.target.value),
            })
          }
        />
        <span className="text-xs text-muted-foreground">
          Wait between switching accounts (1–60).
        </span>
      </Field>
      <Field label="Action delay (s)">
        <Input
          type="number"
          min={1}
          max={120}
          autoComplete="off"
          value={safety.delay_between_actions}
          onChange={(e) =>
            setSafety({
              ...safety,
              delay_between_actions: Number(e.target.value),
            })
          }
        />
        <span className="text-xs text-muted-foreground">
          Wait between actions on one account (1–120).
        </span>
      </Field>
      <Field label="Max operations">
        <Input
          type="number"
          min={1}
          max={250}
          autoComplete="off"
          value={safety.max_operations}
          onChange={(e) =>
            setSafety({ ...safety, max_operations: Number(e.target.value) })
          }
        />
        <span className="text-xs text-muted-foreground">
          Hard cap on total queued operations (1–250).
        </span>
      </Field>
    </div>
  )
}
