import * as React from "react"

import { IconArrowRight, IconSearch, IconShieldCheck } from "@tabler/icons-react"

import { AccountsTable } from "../../components/accounts-table"
import { api } from "../../lib/api"
import { Button } from "../../ui/button"
import {
  Callout,
  EmptyState,
  Input,
  PageGrid,
  Panel,
  PrimaryPane,
  Readout,
  ReadoutItem,
  Select,
  SidePane,
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
    <PageGrid>
      <PrimaryPane>
        {/* Fleet readout — the screen's hero. One instrument line instead of a
            row of KPI tiles, and the only place these counts live now (the
            sidebar summary is the at-a-glance copy; this is the interactive
            one). Ready/Needs-attention double as table filters; their signal
            lights stay dark until there's actually something in that state. */}
        <Readout className="flex-nowrap overflow-x-auto">
          <ReadoutItem
            label="Total"
            value={props.accounts.length}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <ReadoutItem
            label="Ready"
            value={props.metrics.ready}
            tone={props.metrics.ready ? "ready" : "idle"}
            active={statusFilter === "ready"}
            onClick={() => filterBy("ready")}
          />
          <ReadoutItem
            label="Needs attention"
            value={props.metrics.attention}
            tone={props.metrics.attention ? "attention" : "idle"}
            active={statusFilter === "attention"}
            onClick={() => filterBy("attention")}
          />
          <ReadoutItem
            label="Known dialogs"
            value={props.metrics.knownDialogs}
          />
        </Readout>
        <Panel tone="raised" className="space-y-3 overflow-hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <StepHeading
            title="Session fleet"
            detail={`${filteredAccounts.length} of ${props.accounts.length} shown. Select sessions, then run actions or fetch dialogs.`}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={validateAllAccounts}>
              <IconShieldCheck className="size-3.5" />
              Validate All
            </Button>
            <Button variant="outline" size="sm" onClick={fetchDialogsForSelection} className="lg:hidden">
              Fetch Dialogs
            </Button>
            <Button size="sm" onClick={runActionWithSelection} className="lg:hidden">
              Run Action <IconArrowRight />
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem]">
          <Input
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="Search accounts"
            autoComplete="off"
          />
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="attention">Needs attention</option>
            <option value="pending">Pending login</option>
            <option value="needs login">Needs login</option>
            <option value="error">Error</option>
          </Select>
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
      </Panel>
      </PrimaryPane>
      <SidePane>
        <Panel className="space-y-3">
          <StepHeading
            title="Next move"
            detail="Choose a session, then jump into dialogs or guarded actions without losing context."
          />
          <div className="grid gap-2">
            <Button variant="outline" onClick={fetchDialogsForSelection}>
              Fetch Dialogs
            </Button>
            <Button size="comfortable" onClick={runActionWithSelection}>
              Run Action <IconArrowRight />
            </Button>
          </div>
          <Callout tone="info">
            {readySelectedIds.length
              ? `${readySelectedIds.length} selected ready session(s) will be carried forward.`
              : "No ready sessions selected. Actions will ask you to choose accounts."}
          </Callout>
        </Panel>
      </SidePane>
    </PageGrid>
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
