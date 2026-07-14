import * as React from "react"

import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconX,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
import { actionMeta } from "../lib/constants"
import { splitTargets } from "../lib/helpers"
import { analyzeTarget } from "../lib/targeting"
import type { Account, ActionType, Flash } from "../types"
import { DialogPicker } from "./dialog-picker"
import { Callout, Input } from "./ui"

// The canonical target store stays a newline-joined string (what the backend
// already parses); this component just presents it as an editable chip list.
// Type-and-Add or Pick-from-chats both append; chips incompatible with the
// current action grey out and are skipped at queue time.
export function TargetComposer({
  value,
  onChange,
  actionType,
  accounts,
  defaultAccountId,
  flash,
}: {
  value: string
  onChange: (next: string) => void
  actionType: ActionType
  accounts: Account[]
  defaultAccountId: string
  flash: Flash
}) {
  const [draft, setDraft] = React.useState("")
  const [expanded, setExpanded] = React.useState(false)
  const targets = splitTargets(value)
  const meta = actionMeta[actionType]

  function addTargets(extra: string[]) {
    const merged = [...new Set([...targets, ...extra])]
    if (merged.length === targets.length) {
      flash("Those targets are already in the list.")
      return
    }
    onChange(merged.join("\n"))
  }

  function commitDraft() {
    const parts = splitTargets(draft)
    if (!parts.length) return
    addTargets(parts)
    setDraft("")
  }

  function removeTarget(target: string) {
    onChange(targets.filter((item) => item !== target).join("\n"))
  }

  const analyzed = targets.map((target) => ({
    target,
    result: analyzeTarget(target, actionType),
  }))
  const invalidCount = analyzed.filter(({ result }) => result.error).length
  const visibleTargets = expanded ? analyzed : analyzed.slice(0, 8)
  const hiddenCount = Math.max(analyzed.length - visibleTargets.length, 0)

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          maxLength={500}
          autoComplete="off"
          placeholder={meta.targetHint}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commitDraft()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={commitDraft}
          disabled={!draft.trim()}
        >
          <IconPlus /> Add
        </Button>
      </div>

      <DialogPicker
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        actionType={actionType}
        existingTargets={new Set(targets)}
        onAdd={addTargets}
        flash={flash}
      />

      {targets.length ? (
        <div className="rounded-lg border border-border bg-muted/10 p-2">
          <div className="max-h-40 overflow-auto pr-1">
            <div className="flex flex-wrap gap-1.5">
              {visibleTargets.map(({ target, result }) => (
                <TargetChip
                  key={target}
                  target={target}
                  invalid={Boolean(result.error)}
                  warning={Boolean(result.warning)}
                  reason={result.error || result.warning}
                  onRemove={() => removeTarget(target)}
                />
              ))}
            </div>
          </div>
          {invalidCount ? (
            <Callout tone="warning" icon={IconAlertTriangle} className="mt-2">
              Struck-through targets aren&apos;t compatible with “{meta.label}”
              and will be skipped when this runs. Remove them or switch the
              action. Hover a target to see why.
            </Callout>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span>
              {targets.length} target(s)
              {invalidCount ? (
                <span className="ml-1 text-warning">
                  · {invalidCount} greyed, skipped
                </span>
              ) : null}
            </span>
            <div className="flex items-center gap-3">
              {hiddenCount || expanded ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  onClick={() => setExpanded((current) => !current)}
                >
                  {expanded ? (
                    <>
                      Less <IconChevronUp className="size-3" />
                    </>
                  ) : (
                    <>
                      +{hiddenCount} more <IconChevronDown className="size-3" />
                    </>
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={() => onChange("")}
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-muted/10 p-3 text-xs text-muted-foreground">
          Type a target and press Enter, or pick from chats. Separate several with commas or new lines.
        </p>
      )}
    </div>
  )
}

function TargetChip({
  target,
  invalid,
  warning,
  reason,
  onRemove,
}: {
  target: string
  invalid: boolean
  warning: boolean
  reason?: string
  onRemove: () => void
}) {
  return (
    <span
      title={reason}
      className={[
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
        invalid
          ? "border-border/60 bg-muted/40 text-muted-foreground line-through opacity-60"
          : warning
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-primary/30 bg-primary/5 text-foreground"
      ].filter(Boolean).join(" ")}
    >
      {invalid || warning ? (
        <IconAlertTriangle className="size-3 shrink-0 no-underline" />
      ) : null}
      <code className="max-w-[11rem] truncate">{target}</code>
      <button
        type="button"
        aria-label={`Remove ${target}`}
        onClick={onRemove}
        className="shrink-0 no-underline opacity-60 hover:opacity-100"
      >
        <IconX className="size-3" />
      </button>
    </span>
  )
}
