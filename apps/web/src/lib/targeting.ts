import type { ActionType } from "../types"

import { actionMeta, type TargetKind } from "./constants"

export function classifyTargetKind(target: string): TargetKind {
  const clean = target.trim()

  try {
    const url = new URL(clean)
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
      if (url.searchParams.get("start")) {
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

export function classifyTarget(target: string, actionType?: ActionType) {
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
    const result = classifyTarget(target, actionType)
    if ("error" in result && result.error) {
      return result.error
    }
  }
  return null
}
