import * as React from "react"

import { IconBolt, IconSearch, IconShieldCheck } from "@tabler/icons-react"

import { AccountsTable } from "../../components/accounts-table"
import { api } from "../../lib/api"
import { Button } from "../../ui/button"
import {
  EmptyState,
  Input,
  Panel,
  Select,
  StatCard,
  StepHeading,
} from "../../components/ui"
import type { Account } from "../../types"
import type { AccountsScreenProps } from "../screen-props"

export function FleetTab({ props }: { props: AccountsScreenProps }) {
  const [accountSearch, setAccountSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const filteredAccounts = useFilteredAccounts(
    props.accounts,
    accountSearch,
    statusFilter
  )

  const readySelectedIds = props.accounts
    .filter(
      (account) =>
        props.selectedIds.has(account.id) &&
        account.authorized &&
        !account.last_error
    )
    .map((account) => account.id)

  function runActionWithSelection() {
    if (readySelectedIds.length) {
      props.setActionAccountIds(new Set(readySelectedIds))
      props.flash(`Carried ${readySelectedIds.length} session(s) into Actions.`)
    }
    props.setView("actions")
  }

  function fetchDialogsForSelection() {
    const target =
      readySelectedIds[0] ||
      props.accounts.find((a) => a.authorized && !a.last_error)?.id
    if (target) props.setDialogAccountId(target)
    props.setView("dialogs")
  }

  // Clicking a metric drives the table's status filter, so the stats double as
  // one-tap filters. "Total" clears any filter; "Known dialogs" isn't a status
  // so it stays non-interactive.
  function filterBy(next: string) {
    setStatusFilter((current) => (current === next ? "all" : next))
  }

  function clearFilters() {
    setAccountSearch("")
    setStatusFilter("all")
  }

  async function validateAllAccounts() {
    await props.guarded(async () => {
      const response = await api<{ ok_count: number; failed_count: number }>(
        "/api/accounts/validate-all",
        { method: "POST" }
      )
      await props.refresh()
      const { ok_count, failed_count } = response
      if (failed_count === 0) {
        props.flash(`✓ All ${ok_count} session(s) validated successfully.`)
      } else {
        props.flash(`Validated: ${ok_count} ok, ${failed_count} failed. Check session details.`)
      }
    })
  }

  // Distinguish "search/filter hid everything" from "there are genuinely no
  // accounts" — the table owns the zero-accounts empty state (with its Add CTA);
  // this only fires when accounts exist but the active filter excludes them.
  const filtersActive = accountSearch.trim() !== "" || statusFilter !== "all"
  const noMatches =
    props.accountsLoaded &&
    props.accounts.length > 0 &&
    filteredAccounts.length === 0

  return (
    <div className="space-y-4">
      {/* Fleet stat cards — the row of KPI tiles from the dashboard language.
          Ready / Needs-attention double as one-tap table filters; a coral ring
          marks the active filter. Total clears any filter. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total"
          value={props.accounts.length}
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          label="Ready"
          value={props.metrics.ready}
          primary
          active={statusFilter === "ready"}
          onClick={() => filterBy("ready")}
        />
        <StatCard
          label="Needs attention"
          value={props.metrics.attention}
          active={statusFilter === "attention"}
          onClick={() => filterBy("attention")}
        />
        <StatCard
          label="Known dialogs"
          value={props.metrics.knownDialogs.toLocaleString()}
        />
      </div>

      <Panel tone="raised" className="space-y-3 overflow-hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <StepHeading
            title="Session fleet"
            detail={`${filteredAccounts.length} of ${props.accounts.length} shown. Select sessions, then run actions or fetch dialogs.`}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Search accounts"
              autoComplete="off"
              className="w-full sm:w-56"
            />
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="sm:w-40"
            >
              <option value="all">All statuses</option>
              <option value="ready">Ready</option>
              <option value="attention">Needs attention</option>
              <option value="pending">Pending login</option>
              <option value="needs login">Needs login</option>
              <option value="error">Error</option>
            </Select>
            <Button variant="outline" size="lg" onClick={validateAllAccounts}>
              <IconShieldCheck className="size-3.5" />
              Validate all
            </Button>
          </div>
        </div>
        {noMatches ? (
          <EmptyState
            icon={IconSearch}
            title="No accounts match"
            detail="No sessions match the current search and status filter. Adjust them or clear the filters to see the whole fleet."
            action={
              filtersActive ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
            className="px-4 py-8"
          />
        ) : (
          <AccountsTable
            accounts={filteredAccounts}
            loaded={props.accountsLoaded}
            selectedIds={props.selectedIds}
            setSelectedIds={props.setSelectedIds}
            refresh={props.refresh}
            flash={props.flash}
            guarded={props.guarded}
            askDialog={props.askDialog}
            onAddAccount={() => props.setAccountsTab("login")}
          />
        )}

        {/* Footer action row: the running selection summary on the left, the two
            forward moves on the right — Fetch dialogs (secondary) and the one
            coral commit that carries the ready selection into Actions. */}
        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {readySelectedIds.length ? (
              <>
                <span className="font-mono text-foreground">
                  {readySelectedIds.length}
                </span>{" "}
                ready session{readySelectedIds.length === 1 ? "" : "s"} selected
              </>
            ) : (
              "No ready sessions selected · actions will ask you to choose accounts"
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={fetchDialogsForSelection}>
              Fetch dialogs
            </Button>
            <Button size="comfortable" onClick={runActionWithSelection}>
              <IconBolt />
              {readySelectedIds.length
                ? `Add ${readySelectedIds.length} account${readySelectedIds.length === 1 ? "" : "s"} to batch`
                : "Run action"}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function useFilteredAccounts(
  accounts: Account[],
  accountSearch: string,
  statusFilter: string
) {
  return React.useMemo(() => {
    const query = accountSearch.trim().toLowerCase()
    return accounts.filter((account) => {
      const status = accountFilterStatus(account)
      return (
        accountMatchesStatus(status, statusFilter) &&
        accountMatchesSearch(account, query)
      )
    })
  }, [accountSearch, accounts, statusFilter])
}

function accountMatchesStatus(status: string, statusFilter: string) {
  if (statusFilter === "all") return true
  // "attention" is a roll-up pseudo-status: everything that isn't ready needs
  // some action (pending, needs login, or error). Mirrors the metric count.
  if (statusFilter === "attention") return status !== "ready"
  return status === statusFilter
}

function accountMatchesSearch(account: Account, query: string) {
  if (!query) return true
  return [
    account.label,
    account.session_name,
    account.username,
    account.phone,
    account.last_error,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query)
}

function accountFilterStatus(account: Account) {
  if (account.last_error) return "error"
  if (account.authorized) return "ready"
  if (
    account.status === "login_pending" ||
    account.status === "password_pending"
  ) {
    return "pending"
  }
  return "needs login"
}
