import type { ActionType } from "../types"

import { actionMeta, type TargetKind } from "./constants"

export function classifyTargetKind(target: string): TargetKind {
  const clean = target.trim()

  try {
    const url = new URL(clean)
    if (url.protocol === "tg:" && url.hostname === "resolve") {
      const params = url.searchParams
      if (params.get("start") || params.get("startapp") || params.get("appname")) {
        return "bot_link"
      }
      return params.get("domain") ? "public_link" : "unknown"
    }
    const isTme = [
      "t.me",
      "telegram.me",
      "www.t.me",
      "www.telegram.me",
    ].includes(url.hostname)
    if (isTme) {
      const path = url.pathname.replace(/^\/+|\/+$/g, "")
      if (path.startsWith("+") || path.startsWith("joinchat/")) {
        return "invite_link"
      }
      const segments = path.split("/").filter(Boolean)
      const isNamedApp = segments.length >= 2 && !/^\d+$/.test(segments[1])
      if (url.searchParams.get("start") || url.searchParams.get("startapp") || isNamedApp) {
        return "bot_link"
      }
      if (path) {
        return "public_link"
      }
      return "unknown"
    }
  } catch {
    // not a URL
  }

  if (/^@?[A-Za-z0-9_]{5,32}$/.test(clean)) {
    return "username"
  }
  if (/^-?\d+$/.test(clean)) {
    return "numeric_id"
  }
  return "unknown"
}

const kindLabels: Record<TargetKind, string> = {
  invite_link: "invite link",
  public_link: "t.me link",
  username: "username",
  numeric_id: "numeric ID",
  bot_link: "bot link",
  unknown: "unknown",
}

export type TargetAnalysis = {
  label: string
  kind: TargetKind
  error?: string
  warning?: string
}

// Single source of truth for target classification + per-action validity, used
// by the target composer chips and the queue-time partitioning.
export function analyzeTarget(
  target: string,
  actionType?: ActionType
): TargetAnalysis {
  const kind = classifyTargetKind(target)
  const label = kindLabels[kind]
  const meta = actionType ? actionMeta[actionType] : undefined

  if (kind === "unknown") {
    return {
      label,
      kind,
      warning: "Target format is unusual. Preview carefully before running.",
    }
  }
  if (meta && !meta.validTargets.has(kind)) {
    return {
      label,
      kind,
      error: `${label} is not valid for "${meta.label}". Expected: ${meta.targetHint}`,
    }
  }
  if (kind === "invite_link" && !actionType) {
    return {
      label,
      kind,
      warning: "Private invite link. Confirm the target before running.",
    }
  }
  if (kind === "numeric_id" && !actionType) {
    return {
      label,
      kind,
      warning: "Numeric IDs can be account-specific and may not resolve.",
    }
  }

  return { label, kind }
}

export function validateTargets(
  targets: string[],
  actionType: ActionType
): string | null {
  for (const target of targets) {
    const result = analyzeTarget(target, actionType)
    if (result.error) {
      return result.error
    }
  }
  return null
}

// Split a target list into those compatible with the action and those that are
// not, so the UI can grey incompatible targets and quietly skip them at queue
// time instead of blocking the whole step.
export function partitionTargets(
  targets: string[],
  actionType: ActionType
): { valid: string[]; invalid: Array<{ target: string; reason: string }> } {
  const valid: string[] = []
  const invalid: Array<{ target: string; reason: string }> = []
  for (const target of targets) {
    const result = analyzeTarget(target, actionType)
    if (result.error) invalid.push({ target, reason: result.error })
    else valid.push(target)
  }
  return { valid, invalid }
}
