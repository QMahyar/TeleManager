import { actionMeta } from "../../lib/constants"
import type { ActionType, QueueStep } from "../../types"

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

export type AccountActionTally = {
  actionType: ActionType
  label: string
  ops: number
  destructive: boolean
}

export type AccountRollup = {
  accountId: string
  ops: number
  destructive: number
  actions: AccountActionTally[]
}

// Re-pivot the queue from steps (how it was built) to accounts (how it runs):
// for each account, how many ops of each action will fire and how many are
// destructive. A step fans out to ops = targets × accounts, so for one account
// in a step its op count is just that step's target count. Sorted most-impacted
// first (destructive, then total) so the riskiest account reads at the top.
export function rollupByAccount(queue: QueueStep[]): AccountRollup[] {
  const byAccount = new Map<string, Map<ActionType, number>>()
  for (const step of queue) {
    for (const accountId of step.account_ids) {
      const actions = byAccount.get(accountId) ?? new Map<ActionType, number>()
      actions.set(
        step.action_type,
        (actions.get(step.action_type) ?? 0) + step.targets.length
      )
      byAccount.set(accountId, actions)
    }
  }

  const rollups: AccountRollup[] = []
  for (const [accountId, actions] of byAccount) {
    let ops = 0
    let destructive = 0
    const tallies: AccountActionTally[] = []
    for (const [actionType, count] of actions) {
      const isDestructive = Boolean(actionMeta[actionType]?.destructive)
      tallies.push({
        actionType,
        label: actionMeta[actionType]?.label ?? actionType,
        ops: count,
        destructive: isDestructive,
      })
      ops += count
      if (isDestructive) destructive += count
    }
    tallies.sort(
      (a, b) => Number(b.destructive) - Number(a.destructive) || b.ops - a.ops
    )
    rollups.push({ accountId, ops, destructive, actions: tallies })
  }
  rollups.sort((a, b) => b.destructive - a.destructive || b.ops - a.ops)
  return rollups
}
