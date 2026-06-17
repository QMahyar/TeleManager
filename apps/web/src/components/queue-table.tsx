import * as React from "react"

import { Button } from "@workspace/ui/components/button"

import { actionLabels } from "../lib/constants"
import type { QueueStep } from "../types"

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
        queue.map((step, index) => (
          <div
            key={`${step.action_type}-${index}`}
            className="grid gap-2 border-b border-border/60 p-3 text-sm md:grid-cols-[1fr_auto]"
          >
            <div>
              <strong>{actionLabels[step.action_type]}</strong>
              <p className="text-xs text-muted-foreground">
                {step.account_ids.length} accounts x {step.targets.length}{" "}
                targets
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {step.targets.join(", ")}
              </p>
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
        ))
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Queue is empty
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">
            Select action accounts above, choose an action type, add targets,
            then click Add To Queue.
          </p>
        </div>
      )}
    </div>
  )
}
