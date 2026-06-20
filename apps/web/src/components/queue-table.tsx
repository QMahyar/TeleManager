import * as React from "react"

import { Button } from "../ui/button"

import { actionMeta, categoryLabels } from "../lib/constants"
import type { QueueStep } from "../types"
import { Badge, EmptyState } from "./ui"

export function QueueTable({
  queue,
  setQueue,
}: {
  queue: QueueStep[]
  setQueue: React.Dispatch<React.SetStateAction<QueueStep[]>>
}) {
  return (
    <div className="border border-border">
      <div className="grid grid-cols-[1fr_auto] border-b border-border p-3 text-xs tracking-[0.16em] text-muted-foreground uppercase">
        <span>Queued steps</span>
        <span>
          {queue.reduce(
            (total, step) =>
              total + step.targets.length * step.account_ids.length,
            0
          )}{" "}
          ops
        </span>
      </div>
      {queue.length ? (
        queue.map((step, index) => {
          const meta = actionMeta[step.action_type]
          const operationCount = step.account_ids.length * step.targets.length
          return (
            <div
              key={`${step.action_type}-${index}`}
              className="grid gap-2 border-b border-border/60 p-3 text-sm md:grid-cols-[1fr_auto]"
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
          )
        })
      ) : (
        <EmptyState
          title="Queue is empty"
          detail="Select action accounts above, choose an action type, add targets, then click Add To Queue."
          className="border-0 bg-transparent px-6 py-8"
        />
      )}
    </div>
  )
}
