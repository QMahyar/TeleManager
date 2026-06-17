import * as React from "react"

import type { SafetySettings } from "../types"
import { Field, Input } from "./ui"

export function SafetyEditor({
  safety,
  setSafety,
}: {
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Account delay">
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
      </Field>
      <Field label="Action delay">
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
      </Field>
    </div>
  )
}
