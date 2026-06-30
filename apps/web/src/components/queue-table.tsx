import * as React from "react"

import { IconStack2 } from "@tabler/icons-react"

import { Button } from "../ui/button"

import { actionMeta, categoryLabels } from "../lib/constants"
import { describeCondition } from "../lib/conditions"
import type { QueueStep } from "../types"
import { Badge, EmptyState } from "./ui"

export function QueueTable({
  queue,
  setQueue,
  onEdit,
}: {
  queue: QueueStep[]
  setQueue: React.Dispatch<React.SetStateAction<QueueStep[]>>
  // When provided, each row gets an Edit button that hands the step back to the
  // builder. Omitted where there's no builder to load into.
  onEdit?: (step: QueueStep, index: number) => void
}) {
  if (!queue.length) {
    return (
      <EmptyState
        icon={IconStack2}
        title="Queue is empty"
        detail="Choose accounts and an action, add targets, then Add To Queue."
      />
    )
  }

  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
      {queue.map((step, index) => {
          const meta = actionMeta[step.action_type]
          const operationCount = step.account_ids.length * step.targets.length
          return (
            <div
              key={`${step.action_type}-${index}`}
              className="grid gap-2 p-3 text-sm md:grid-cols-[1fr_auto]"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{meta?.label || step.action_type}</strong>
                  <Badge tone="border-border bg-muted/40 text-muted-foreground">
                    {meta ? categoryLabels[meta.category] : "unknown"}
                  </Badge>
                  <Badge tone="border-border bg-background text-muted-foreground">
                    {operationCount} ops
                  </Badge>
                  {meta?.destructive ? (
                    <Badge tone="text-destructive border-destructive/30 bg-destructive/10">
                      destructive
                    </Badge>
                  ) : null}
                  {step.condition ? (
                    <Badge tone="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      if {describeCondition(step.condition)}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {step.account_ids.length} accounts × {step.targets.length}{" "}
                  targets
                </p>
                <div className="space-y-1">
                  {step.targets.slice(0, 4).map((target) => (
                    <p
                      key={target}
                      className="font-mono text-xs break-all text-muted-foreground"
                    >
                      {target}
                    </p>
                  ))}
                  {step.targets.length > 4 ? (
                    <p className="text-xs text-muted-foreground">
                      +{step.targets.length - 4} more target(s)
                    </p>
                  ) : null}
                </div>
                {step.message ? (
                  <p className="text-xs text-muted-foreground italic">
                    {step.message.length > 120
                      ? `${step.message.slice(0, 120)}…`
                      : step.message}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-1.5 md:flex-col md:items-stretch">
                {onEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(step, index)}
                  >
                    Edit
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setQueue((current) => [
                      ...current.slice(0, index + 1),
                      {
                        ...step,
                        targets: [...step.targets],
                        account_ids: [...step.account_ids],
                      },
                      ...current.slice(index + 1),
                    ])
                  }
                >
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    setQueue((current) =>
                      current.filter((_, stepIndex) => stepIndex !== index)
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          )
        })}
    </div>
  )
}
