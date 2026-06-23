import { actionMeta } from "../../lib/constants"
import type { QueueStep } from "../../types"

export function countQueueOperations(queue: QueueStep[]) {
  return queue.reduce(
    (total, step) => total + step.targets.length * step.account_ids.length,
    0
  )
}

export function countDestructiveOperations(queue: QueueStep[]) {
  return queue.reduce((total, step) => {
    const meta = actionMeta[step.action_type]
    if (!meta?.destructive) return total
    return total + step.targets.length * step.account_ids.length
  }, 0)
}
