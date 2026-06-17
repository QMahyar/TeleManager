import * as React from "react"

import { Button } from "@workspace/ui/components/button"

import { AccountsTable } from "../components/accounts-table"
import { Field, Input, Panel, SectionTitle, Select } from "../components/ui"
import { api, toForm } from "../lib/api"
import type { Account } from "../types"
import type { AccountsScreenProps } from "./screen-props"

type FormSubmitEvent = React.SyntheticEvent<HTMLFormElement>

export function AccountsScreen(props: AccountsScreenProps) {
  const [accountSearch, setAccountSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const filteredAccounts = useFilteredAccounts(
    props.accounts,
    accountSearch,
    statusFilter
  )
  const loginFlow = useAccountLoginFlow(props)

  return (
    <div className="space-y-6">
      <LoginReadinessPanel
        configStatus={props.configStatus}
        openSettings={() => props.setView("settings")}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <RequestLoginPanel
          apiConfigured={props.apiConfigured}
          loading={props.loading}
          onSubmit={loginFlow.startLogin}
        />
        <FinishLoginPanel
          accounts={props.accounts}
          loading={props.loading}
          pendingAccount={loginFlow.pendingAccount}
          pendingAccountId={props.pendingAccountId}
          setPendingAccountId={props.setPendingAccountId}
          codeInputRef={loginFlow.codeInputRef}
          passwordInputRef={loginFlow.passwordInputRef}
          onCodeSubmit={loginFlow.confirmCode}
          onPasswordSubmit={loginFlow.confirmPassword}
        />
      </div>
      <AccountsInventoryPanel
        accounts={filteredAccounts}
        totalAccounts={props.accounts.length}
        accountSearch={accountSearch}
        statusFilter={statusFilter}
        selectedIds={props.selectedIds}
        setAccountSearch={setAccountSearch}
        setStatusFilter={setStatusFilter}
        setSelectedIds={props.setSelectedIds}
        refresh={props.refresh}
        flash={props.flash}
        guarded={props.guarded}
        askDialog={props.askDialog}
      />
    </div>
  )
}

function useAccountLoginFlow(props: AccountsScreenProps) {
  const codeInputRef = React.useRef<HTMLInputElement>(null)
  const passwordInputRef = React.useRef<HTMLInputElement>(null)
  const pendingAccount = props.accounts.find(
    (account) => account.id === props.pendingAccountId
  )

  async function startLogin(event: FormSubmitEvent) {
    event.preventDefault()
    const formElement = event.currentTarget
    await props.guarded(async () => {
      if (!ensureApiConfigured(props)) return
      const form = loginFormData(formElement)
      if (!form)
        return props.flash("Enter the phone number in international format.")
      const payload = await requestLoginCode(form)
      await props.refresh()
      handleLoginStartResponse(payload.account, props, codeInputRef)
    })
  }

  async function confirmCode(event: FormSubmitEvent) {
    event.preventDefault()
    const formElement = event.currentTarget
    await props.guarded(async () => {
      const accountId = requirePendingAccount(props, "code")
      if (!accountId) return
      const code = String(new FormData(formElement).get("code") || "").trim()
      if (!code) return props.flash("Enter the Telegram login code.")
      const payload = await submitLoginCode(accountId, code)
      formElement.reset()
      await props.refresh()
      handleCodeResponse(payload.account, props, passwordInputRef)
    })
  }

  async function confirmPassword(event: FormSubmitEvent) {
    event.preventDefault()
    const formElement = event.currentTarget
    await props.guarded(async () => {
      const accountId = requirePendingAccount(props, "2FA")
      if (!accountId) return
      const password = String(new FormData(formElement).get("password") || "")
      if (!password) return props.flash("Enter the Telegram 2FA password.")
      await submitPassword(accountId, password)
      formElement.reset()
      props.setPendingAccountId("")
      await props.refresh()
      props.flash("2FA confirmed. The local session is ready.")
    })
  }

  return {
    codeInputRef,
    confirmCode,
    confirmPassword,
    passwordInputRef,
    pendingAccount,
    startLogin,
  }
}

function LoginReadinessPanel({
  configStatus,
  openSettings,
}: {
  configStatus: string
  openSettings: () => void
}) {
  return (
    <Panel className="border-primary/20 bg-primary/5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-primary uppercase">
            Login Readiness
          </p>
          <p className="text-sm text-foreground">{configStatus}</p>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Codes are sent by Telegram to the official Telegram app for this
            phone number. TeleManager opens the login request and saves the
            local session after you enter the received code.
          </p>
        </div>
        <Button variant="outline" onClick={openSettings}>
          Open API Settings
        </Button>
      </div>
    </Panel>
  )
}

function RequestLoginPanel({
  apiConfigured,
  loading,
  onSubmit,
}: {
  apiConfigured: boolean
  loading: boolean
  onSubmit: (event: FormSubmitEvent) => Promise<void>
}) {
  return (
    <Panel className="space-y-4">
      <SectionTitle
        kicker="Step 1"
        title="Request Login Code"
        detail="Use the same international phone format you use in Telegram, for example +15551234567."
      />
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="Local Label">
          <Input
            name="label"
            maxLength={120}
            autoComplete="nickname"
            placeholder="Main account"
          />
        </Field>
        <Field label="Telegram Phone">
          <Input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+15551234567"
          />
        </Field>
        <Button
          type="submit"
          className="w-full"
          disabled={!apiConfigured}
          loading={loading}
        >
          {apiConfigured ? "Send Login Code" : "Configure API First"}
        </Button>
      </form>
      <LoginChecklist />
    </Panel>
  )
}

function FinishLoginPanel({
  accounts,
  loading,
  pendingAccount,
  pendingAccountId,
  setPendingAccountId,
  codeInputRef,
  passwordInputRef,
  onCodeSubmit,
  onPasswordSubmit,
}: {
  accounts: Account[]
  loading: boolean
  pendingAccount?: Account
  pendingAccountId: string
  setPendingAccountId: React.Dispatch<React.SetStateAction<string>>
  codeInputRef: React.RefObject<HTMLInputElement | null>
  passwordInputRef: React.RefObject<HTMLInputElement | null>
  onCodeSubmit: (event: FormSubmitEvent) => Promise<void>
  onPasswordSubmit: (event: FormSubmitEvent) => Promise<void>
}) {
  return (
    <Panel className="space-y-4">
      <SectionTitle
        kicker="Step 2"
        title="Finish Login"
        detail="Select the pending session, enter the login code, then only enter a 2FA password if Telegram asks for it."
      />
      <Field label="Pending Account">
        <Select
          value={pendingAccountId}
          onChange={(event) => setPendingAccountId(event.target.value)}
        >
          <option value="">Choose pending account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label || account.session_name} ·{" "}
              {accountStatusText(account)}
            </option>
          ))}
        </Select>
      </Field>
      <PendingAccountCard account={pendingAccount} />
      <div className="grid gap-3 lg:grid-cols-2">
        <form className="grid gap-2" onSubmit={onCodeSubmit}>
          <Field label="Telegram Code">
            <Input
              ref={codeInputRef}
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="12345"
            />
          </Field>
          <Button type="submit" disabled={!pendingAccountId} loading={loading}>
            Confirm Code
          </Button>
        </form>
        <form className="grid gap-2" onSubmit={onPasswordSubmit}>
          <Field label="2FA Password">
            <Input
              ref={passwordInputRef}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Only if Telegram asks"
            />
          </Field>
          <Button type="submit" disabled={!pendingAccountId} loading={loading}>
            Confirm 2FA
          </Button>
        </form>
      </div>
    </Panel>
  )
}

function LoginChecklist() {
  return (
    <div className="grid gap-2 border border-border bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
      <strong className="text-foreground">If no code arrives:</strong>
      <span>Keep Telegram open on the phone or desktop account.</span>
      <span>Confirm the phone number includes the country code.</span>
      <span>Wait before retrying if Telegram rate-limits code requests.</span>
    </div>
  )
}

function PendingAccountCard({ account }: { account?: Account }) {
  if (!account) {
    return (
      <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
        Request a code or choose an account that is waiting for login.
      </div>
    )
  }

  return (
    <div className="border border-border bg-background/70 p-4 text-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <strong>{account.label || account.session_name}</strong>
        <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          {accountStatusText(account)}
        </span>
      </div>
      <p className="mt-2 text-muted-foreground">
        {account.phone || "Phone not recorded"} · {account.session_name}.session
      </p>
      {account.last_error ? (
        <p className="mt-2 text-destructive">{account.last_error}</p>
      ) : null}
    </div>
  )
}

function AccountsInventoryPanel({
  accounts,
  totalAccounts,
  accountSearch,
  statusFilter,
  selectedIds,
  setAccountSearch,
  setStatusFilter,
  setSelectedIds,
  refresh,
  flash,
  guarded,
  askDialog,
}: Pick<
  AccountsScreenProps,
  | "selectedIds"
  | "setSelectedIds"
  | "refresh"
  | "flash"
  | "guarded"
  | "askDialog"
> & {
  accounts: Account[]
  totalAccounts: number
  accountSearch: string
  statusFilter: string
  setAccountSearch: React.Dispatch<React.SetStateAction<string>>
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>
}) {
  return (
    <Panel className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle
          kicker="Inventory"
          title="Accounts"
          detail={`${accounts.length} of ${totalAccounts} shown. Rename, validate, fetch dialogs, logout, or delete local sessions.`}
        />
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
            <option value="needs login">Needs login</option>
            <option value="error">Error</option>
          </Select>
        </div>
      </div>
      <AccountsTable
        accounts={accounts}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        refresh={refresh}
        flash={flash}
        guarded={guarded}
        askDialog={askDialog}
      />
    </Panel>
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
  return statusFilter === "all" || status === statusFilter
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
  return "needs login"
}

function accountStatusText(account: Account) {
  if (account.last_error) return "Error"
  if (account.status === "password_pending") return "Needs 2FA"
  if (account.status === "login_pending") return "Code sent"
  if (account.authorized) return "Ready"
  return "Needs login"
}

function ensureApiConfigured(props: AccountsScreenProps) {
  if (props.apiConfigured) return true
  props.flash("Save Telegram API settings before requesting a login code.")
  props.setView("settings")
  return false
}

function loginFormData(formElement: HTMLFormElement) {
  const form = new FormData(formElement)
  const phone = String(form.get("phone") || "").trim()
  const label = String(form.get("label") || "").trim()
  if (!phone) return null
  form.set("phone", phone)
  form.set("label", label)
  return form
}

async function requestLoginCode(form: FormData) {
  return api<{ account: Account }>("/api/accounts/login", {
    method: "POST",
    body: form,
  })
}

function handleLoginStartResponse(
  account: Account,
  props: AccountsScreenProps,
  codeInputRef: React.RefObject<HTMLInputElement | null>
) {
  if (account.authorized) {
    props.setPendingAccountId("")
    props.flash("This account already has a ready local session.")
    return
  }
  props.setPendingAccountId(account.id)
  props.flash("Login code requested. Check Telegram on that phone number.")
  window.setTimeout(() => codeInputRef.current?.focus(), 0)
}

function requirePendingAccount(props: AccountsScreenProps, label: string) {
  if (props.pendingAccountId) return props.pendingAccountId
  props.flash(`Choose the account waiting for ${label}.`)
  return ""
}

async function submitLoginCode(accountId: string, code: string) {
  return api<{ account: Account }>("/api/accounts/confirm-code", {
    method: "POST",
    body: toForm({ account_id: accountId, code }),
  })
}

function handleCodeResponse(
  account: Account,
  props: AccountsScreenProps,
  passwordInputRef: React.RefObject<HTMLInputElement | null>
) {
  if (account.status === "password_pending") {
    props.flash("Telegram accepted the code. Enter the 2FA password to finish.")
    window.setTimeout(() => passwordInputRef.current?.focus(), 0)
    return
  }
  props.setPendingAccountId("")
  props.flash("Account login completed.")
}

async function submitPassword(accountId: string, password: string) {
  await api("/api/accounts/confirm-password", {
    method: "POST",
    body: toForm({ account_id: accountId, password }),
  })
}
