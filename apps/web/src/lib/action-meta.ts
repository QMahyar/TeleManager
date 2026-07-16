import type {
  ActionsMeta,
  ActionTier,
  ActionType,
  QueueStep,
  SafetySettings,
} from "../types"
import { actionMeta, type ActionCategory, type TargetKind } from "./constants"

// Merged action metadata: presentation fields (label, category, description,
// placeholder, targetHint) from the client constants merged with enforcement
// fields (validTargets, needsMessage, messageOptional, destructive) from the
// backend API. This is the single resolved type consumers should use when they
// need the full picture.
export type ResolvedActionMeta = {
  label: string
  category: ActionCategory
  description: string
  needsMessage: boolean
  messageOptional?: boolean
  messagePlaceholder?: string
  targetHint: string
  validTargets: Set<TargetKind>
  destructive?: boolean
}

// Merge presentation-only data (from constants) with enforcement data (from
// API). When API meta is available its valid_targets/flags take precedence;
// when it is not (pre-load or offline fallback) the constants map provides
// safe defaults so target validation UI degrades gracefully.
export function resolveActionMeta(
  actionType: ActionType,
  apiMeta: ActionsMeta | null
): ResolvedActionMeta {
  const presentation = actionMeta[actionType]
  const api = apiMeta?.actions[actionType]

  return {
    label: presentation.label,
    category: presentation.category,
    description: presentation.description,
    messagePlaceholder: presentation.messagePlaceholder,
    targetHint: presentation.targetHint,
    // Enforcement fields: prefer API, fall back to safe defaults
    needsMessage: api?.needs_message ?? false,
    messageOptional: api?.message_optional ?? false,
    validTargets: api?.valid_targets
      ? new Set(api.valid_targets as TargetKind[])
      : defaultValidTargets(),
    destructive: api?.destructive ?? presentation.destructive,
  }
}

// Fallback valid targets used when API meta is not yet loaded. Covers the
// broadest common set so target validation doesn't false-block before the
// real data arrives.
function defaultValidTargets(): Set<TargetKind> {
  return new Set<TargetKind>(["username", "numeric_id", "public_link"])
}

// Presentation + estimation for the action risk tiers served by the backend.
// The backend's ACTION_META is the source of truth for which tier an action is
// in; this module only turns that into labels, colours, and time estimates the
// operator can read. Delay numbers always come from the live SafetySettings so
// the UI stays in lockstep with whatever the operator has configured.

export const TIER_LABEL: Record<ActionTier, string> = {
  instant: "Fast",
  standard: "Standard",
  sensitive: "Careful",
}

export const TIER_BLURB: Record<ActionTier, string> = {
  instant:
    "Read-only or local action Telegram barely rate-limits (mark read, mute, archive). Runs back-to-back with almost no pause.",
  standard:
    "Moderate account-visible change (leave, block, edit). Paced at the standard cooldown.",
  sensitive:
    "Content-creating or spam-prone action Telegram limits hardest (send, forward, join). Spaced the longest, with jitter.",
}

// Badge colour per tier. Fast = calm primary, standard = neutral, careful =
// warning — so the operator reads relative risk at a glance.
export const TIER_BADGE_CLASS: Record<ActionTier, string> = {
  instant: "border-primary/30 bg-primary/10 text-primary-text",
  standard: "border-border bg-muted text-muted-foreground",
  sensitive: "border-warning/40 bg-warning/10 text-warning",
}

export function tierForAction(
  meta: ActionsMeta | null,
  actionType: ActionType
): ActionTier {
  return meta?.actions[actionType]?.tier ?? "standard"
}

// The configured delay (seconds) for a tier. delay_between_actions is the
// standard tier by design (its historical name), so it maps here.
export function tierDelaySeconds(
  tier: ActionTier,
  safety: SafetySettings
): number {
  if (tier === "instant") return safety.delay_instant
  if (tier === "sensitive") return safety.delay_sensitive
  return safety.delay_between_actions
}

export function actionDelaySeconds(
  actionType: ActionType,
  meta: ActionsMeta | null,
  safety: SafetySettings
): number {
  return tierDelaySeconds(tierForAction(meta, actionType), safety)
}

// Rough per-operation execution time (network round-trip + Telethon call). The
// real cost is dominated by the inter-op cooldowns; this just stops a 1-op run
// from estimating to 0s.
const PER_OP_EXEC_SECONDS = 1.2

// Estimate how long a built queue will take to run end-to-end, mirroring the
// backend's inter_operation_delay: an account switch waits max(account, tier)
// delay, same-account ops wait the upcoming action's tier delay. Sensitive
// jitter is ignored here (estimate uses the base) so the number is stable.
export function estimateQueueSeconds(
  steps: QueueStep[],
  safety: SafetySettings,
  meta: ActionsMeta | null
): number {
  const ops: Array<{ type: ActionType; account: string }> = []
  for (const step of steps) {
    for (const account of step.account_ids) {
      for (let i = 0; i < step.targets.length; i++) {
        ops.push({ type: step.action_type, account })
      }
    }
  }
  return estimateOperationsSeconds(ops, safety, meta)
}

// Shared estimator core: the wall-clock cost of a flat list of operations under
// the backend's inter_operation_delay rule. Used by both the pre-run queue
// estimate (above) and the live "remaining" estimate on a running banner.
export function estimateOperationsSeconds(
  ops: Array<{ type: ActionType; account: string }>,
  safety: SafetySettings,
  meta: ActionsMeta | null
): number {
  if (ops.length === 0) return 0
  let total = PER_OP_EXEC_SECONDS * ops.length
  for (let i = 1; i < ops.length; i++) {
    const prev = ops[i - 1]
    const cur = ops[i]
    const tierDelay = tierDelaySeconds(tierForAction(meta, cur.type), safety)
    total +=
      prev.account !== cur.account
        ? Math.max(safety.delay_between_accounts, tierDelay)
        : tierDelay
  }
  return total
}

// Human-friendly duration: "8s", "1m 30s", "2h 5m".
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `${whole}s`
  const minutes = Math.floor(whole / 60)
  const secs = whole % 60
  if (minutes < 60) return secs ? `${minutes}m ${secs}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins ? `${hours}h ${mins}m` : `${hours}h`
}
