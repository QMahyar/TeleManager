import * as React from "react"

import { IconLoader2 } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { AccountsTable } from "../components/accounts-table"
import { Field, Input, Panel, SectionTitle, Select } from "../components/ui"
import { api, toForm } from "../lib/api"
import type { Account } from "../types"
import type { AccountsScreenProps } from "./screen-props"

export function AccountsScreen(props: AccountsScreenProps) {
  const {
    accounts,
    selectedIds,
    setSelectedIds,
    guarded,
    loading,
    refresh,
    flash,
    askDialog,
    pendingAccountId,
    setPendingAccountId,
  } = props
  const [accountSearch, setAccountSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const filteredAccounts = React.useMemo(() => {
    const query = accountSearch.trim().toLowerCase()
    return accounts.filter((account) => {
      const status = account.last_error
        ? "error"
        : account.authorized
          ? "ready"
          : "needs login"
      const matchesStatus = statusFilter === "all" || status === statusFilter
      const haystack = [
        account.label,
        account.session_name,
        account.username,
        account.phone,
        account.last_error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return matchesStatus && (!query || haystack.includes(query))
    })
  }, [accountSearch, accounts, statusFilter])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="space-y-4">
          <SectionTitle
            kicker="Enrollment"
            title="Add Account"
            detail="Log in once, create a local Telethon session, then disconnect immediately."
          />
          <form
            className="grid gap-3"
            onSubmit={(event) =>
              guarded(async () => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                const payload = await api<{ account: Account }>(
                  "/api/accounts/login",
                  { method: "POST", body: form }
                )
                setPendingAccountId(payload.account.id)
                flash("Login code requested.")
                await refresh()
              })
            }
          >
            <Field label="Label">
              <Input name="label" placeholder="Main account" />
            </Field>
            <Field label="Phone">
              <Input name="phone" required placeholder="+15551234567" />
            </Field>
            <Button className="w-full" disabled={loading}>
              {loading ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : null}
              Send Login Code
            </Button>
          </form>
        </Panel>
        <Panel className="space-y-4">
          <SectionTitle
            kicker="Authentication"
            title="Finish Login"
            detail="Enter the code Telegram sent to the selected account. Use the password form only when 2FA is requested."
          />
          <Field label="Pending account">
            <Select
              value={pendingAccountId}
              onChange={(e) => setPendingAccountId(e.target.value)}
            >
              <option value="">Choose account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label || account.session_name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-2 md:grid-cols-2">
            <form
              className="flex gap-2"
              onSubmit={(event) =>
                guarded(async () => {
                  event.preventDefault()
                  const form = new FormData(event.currentTarget)
                  await api("/api/accounts/confirm-code", {
                    method: "POST",
                    body: toForm({
                      account_id: pendingAccountId,
                      code: String(form.get("code") || ""),
                    }),
                  })
                  flash("Account login completed.")
                  await refresh()
                })
              }
            >
              <Input name="code" required placeholder="Login code" />
              <Button disabled={loading}>
                {loading ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : null}
                Confirm
              </Button>
            </form>
            <form
              className="flex gap-2"
              onSubmit={(event) =>
                guarded(async () => {
                  event.preventDefault()
                  const form = new FormData(event.currentTarget)
                  await api("/api/accounts/confirm-password", {
                    method: "POST",
                    body: toForm({
                      account_id: pendingAccountId,
                      password: String(form.get("password") || ""),
                    }),
                  })
                  flash("2FA confirmed.")
                  await refresh()
                })
              }
            >
              <Input
                name="password"
                type="password"
                required
                placeholder="2FA password"
              />
              <Button disabled={loading}>
                {loading ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : null}
                Confirm
              </Button>
            </form>
          </div>
        </Panel>
      </div>
      <Panel className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <SectionTitle
            kicker="Inventory"
            title="Accounts"
            detail={`${filteredAccounts.length} of ${accounts.length} shown. Rename, validate, fetch dialogs, logout, or delete local sessions.`}
          />
          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem]">
            <Input
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Search accounts"
            />
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="ready">Ready</option>
              <option value="needs login">Needs login</option>
              <option value="error">Error</option>
            </Select>
          </div>
        </div>
        <AccountsTable
          accounts={filteredAccounts}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          refresh={refresh}
          flash={flash}
          guarded={guarded}
          askDialog={askDialog}
        />
      </Panel>
    </div>
  )
}
