import * as React from "react"

import { api } from "../lib/api"
import type { Account } from "../types"

export function useAccountState() {
  const [accounts, setAccounts] = React.useState<Account[]>([])
  // Distinguishes "still loading the first time" from "loaded, genuinely empty"
  // so the UI can show skeletons rather than a premature empty state.
  const [accountsLoaded, setAccountsLoaded] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [actionAccountIds, setActionAccountIds] = React.useState<Set<string>>(
    new Set()
  )
  const [dialogAccountId, setDialogAccountId] = React.useState("")
  const [configStatus, setConfigStatus] = React.useState(
    "Checking API settings..."
  )
  const [apiConfigured, setApiConfigured] = React.useState(false)
  const [configApiId, setConfigApiId] = React.useState<number | null>(null)

  const refresh = React.useCallback(async () => {
    const [config, accountPayload] = await Promise.all([
      api<{ api_id?: number; api_hash_configured: boolean }>("/api/config"),
      api<{ accounts: Account[] }>("/api/accounts"),
    ])
    const nextAccounts = accountPayload.accounts || []
    const known = new Set(nextAccounts.map((account) => account.id))

    setAccounts(nextAccounts)
    setSelectedIds((current) => filterKnownIds(current, known))
    setActionAccountIds((current) => filterKnownIds(current, known))
    setDialogAccountId((current) =>
      current && known.has(current) ? current : nextAccounts[0]?.id || ""
    )
    setConfigStatus(configStatusLabel(config))
    setApiConfigured(Boolean(config.api_hash_configured))
    setConfigApiId(config.api_id || null)
    setAccountsLoaded(true)
  }, [])

  const metrics = React.useMemo(() => sessionMetrics(accounts), [accounts])

  return {
    accounts,
    accountsLoaded,
    actionAccountIds,
    apiConfigured,
    configApiId,
    configStatus,
    dialogAccountId,
    metrics,
    refresh,
    selectedIds,
    setActionAccountIds,
    setDialogAccountId,
    setSelectedIds,
  }
}

function filterKnownIds(current: Set<string>, known: Set<string>) {
  return new Set([...current].filter((id) => known.has(id)))
}

function configStatusLabel(config: {
  api_id?: number
  api_hash_configured: boolean
}) {
  return config.api_hash_configured
    ? `Configured with API ID ${config.api_id}.`
    : "API settings are not configured yet."
}

function sessionMetrics(accounts: Account[]) {
  const ready = accounts.filter(
    (account) => account.authorized && !account.last_error
  ).length
  const attention = accounts.filter(
    (account) => !account.authorized || account.last_error
  ).length
  const knownDialogs = accounts.reduce(
    (total, account) => total + Number(account.dialog_count || 0),
    0
  )
  return { ready, attention, knownDialogs }
}
