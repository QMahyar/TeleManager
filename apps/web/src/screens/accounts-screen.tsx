import * as React from "react"

import {
  IconArrowRight,
  IconDownload,
  IconFileImport,
  IconKey,
  IconLoader2,
  IconLockPassword,
  IconLogin2,
  IconMessage2Bolt,
  IconUpload,
  IconUsers,
  IconX,
} from "@tabler/icons-react"
import { Button } from "../ui/button"

import { AccountsTable } from "../components/accounts-table"
import {
  Badge,
  EmptyState,
  Field,
  Input,
  PageGrid,
  Panel,
  PrimaryPane,
  Select,
  SidePane,
  StatCard,
  StepHeading,
  Tabs,
} from "../components/ui"
import { api, toForm } from "../lib/api"
import { accountStatus, downloadBlob, statusTone } from "../lib/helpers"
import type { Account, AccountsTab } from "../types"
import type { AccountsScreenProps } from "./screen-props"

type FormSubmitEvent = React.SyntheticEvent<HTMLFormElement>

export function AccountsScreen(props: AccountsScreenProps) {
  const tab = props.accountsTab
  const setTab = props.setAccountsTab
  const pendingCount = props.accounts.filter(
    (account) =>
      account.status === "login_pending" ||
      account.status === "password_pending"
  ).length

  return (
    <div className="space-y-4">
      <Tabs<AccountsTab>
        value={tab}
        onChange={setTab}
        items={[
          { id: "fleet", label: "Fleet", icon: IconUsers, badge: props.accounts.length || undefined },
          { id: "login", label: "Add / Login", icon: IconLogin2, badge: pendingCount || undefined },
          { id: "transfer", label: "Import / Export", icon: IconFileImport },
        ]}
      />
      {tab === "fleet" ? <FleetTab props={props} /> : null}
      {tab === "login" ? <LoginTab props={props} /> : null}
      {tab === "transfer" ? <TransferTab props={props} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fleet tab (was the Command Center) — metrics, quick handoff, inventory
// ---------------------------------------------------------------------------

function FleetTab({ props }: { props: AccountsScreenProps }) {
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

  return (
    <PageGrid>
      <PrimaryPane>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Total"
            value={props.accounts.length}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <StatCard
            label="Ready"
            value={props.metrics.ready}
            active={statusFilter === "ready"}
            onClick={() => filterBy("ready")}
          />
          <StatCard
            label="Needs attention"
            value={props.metrics.attention}
            active={statusFilter === "attention"}
            onClick={() => filterBy("attention")}
          />
          <StatCard label="Known dialogs" value={props.metrics.knownDialogs} />
        </div>
        <Panel className="space-y-3 overflow-hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <StepHeading
            step={<IconUsers />}
            title="Session fleet"
            detail={`${filteredAccounts.length} of ${props.accounts.length} shown. Select sessions, then run actions or fetch dialogs.`}
          />
          <div className="flex gap-2 lg:hidden">
            <Button variant="outline" size="sm" onClick={fetchDialogsForSelection}>
              Fetch Dialogs
            </Button>
            <Button size="sm" onClick={runActionWithSelection}>
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
        <AccountsTable
          accounts={filteredAccounts}
          loaded={props.accountsLoaded}
          selectedIds={props.selectedIds}
          setSelectedIds={props.setSelectedIds}
          refresh={props.refresh}
          flash={props.flash}
          guarded={props.guarded}
          askDialog={props.askDialog}
        />
      </Panel>
      </PrimaryPane>
      <SidePane>
        <Panel className="space-y-3">
          <StepHeading
            step={<IconArrowRight />}
            title="Next move"
            detail="Choose a session, then jump into dialogs or guarded actions without losing context."
          />
          <div className="grid gap-2">
            <Button variant="outline" onClick={fetchDialogsForSelection}>
              Fetch Dialogs
            </Button>
            <Button onClick={runActionWithSelection}>
              Run Action <IconArrowRight />
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            {readySelectedIds.length
              ? `${readySelectedIds.length} selected ready session(s) will be carried forward.`
              : "No ready sessions selected. Actions will ask you to choose accounts."}
          </div>
        </Panel>
      </SidePane>
    </PageGrid>
  )
}

// ---------------------------------------------------------------------------
// Login tab
// ---------------------------------------------------------------------------

function LoginTab({ props }: { props: AccountsScreenProps }) {
  const loginFlow = useAccountLoginFlow(props)

  return (
    <div className="space-y-4">
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transfer tab (was Import / Export)
// ---------------------------------------------------------------------------

function TransferTab({ props }: { props: AccountsScreenProps }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ImportPanel
        guarded={props.guarded}
        refresh={props.refresh}
        flash={props.flash}
        loading={props.loading}
      />
      <ExportPanel
        accounts={props.accounts}
        selectedIds={props.selectedIds}
        setSelectedIds={props.setSelectedIds}
        guarded={props.guarded}
        flash={props.flash}
        loading={props.loading}
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
      formElement.reset()
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
      props.flash("2FA confirmed. The local session is ready.", "success")
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
      <StepHeading
        step={1}
        title="Request login code"
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
            pattern="\+[0-9 ]{7,}"
            title="Use international format with country code, e.g. +15551234567"
            placeholder="+15551234567"
          />
          <span className="text-xs text-muted-foreground">
            International format with country code, e.g. +15551234567.
          </span>
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
  const pendingAccounts = accounts.filter(
    (account) =>
      account.status === "login_pending" ||
      account.status === "password_pending"
  )
  const needsPassword = pendingAccount?.status === "password_pending"

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={2}
        title="Finish login"
        detail="Select the pending session, enter the Telegram code, and only use the 2FA form when Telegram asks for the account password."
      />
      <Field label="Pending Account">
        <Select
          value={pendingAccountId}
          onChange={(event) => setPendingAccountId(event.target.value)}
        >
          <option value="">Choose pending account</option>
          {pendingAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label || account.session_name} ·{" "}
              {accountStatusText(account)}
            </option>
          ))}
        </Select>
      </Field>
      <PendingAccountCard account={pendingAccount} />
      {!pendingAccount ? (
        <EmptyState
          title="No login challenge selected"
          detail="Request a code first, or pick a pending session above to continue the Telegram login flow."
          className="px-4 py-8"
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <form
            className="grid gap-2 rounded-lg border border-border p-3"
            onSubmit={onCodeSubmit}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <IconMessage2Bolt className="size-4 text-primary" />
              Telegram code
            </div>
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
            <p className="text-xs text-muted-foreground">
              Use the login code Telegram sent to the official app for this
              account.
            </p>
            <Button
              type="submit"
              disabled={!pendingAccountId}
              loading={loading}
            >
              <IconKey className="size-4" />
              Confirm Code
            </Button>
          </form>
          <form
            className="grid gap-2 rounded-lg border border-border p-3"
            onSubmit={onPasswordSubmit}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <IconLockPassword className="size-4 text-primary" />
              Two-factor password
            </div>
            <Field label="2FA Password">
              <Input
                ref={passwordInputRef}
                name="password"
                type="password"
                required={needsPassword}
                autoComplete="current-password"
                placeholder={
                  needsPassword
                    ? "Telegram is asking for the 2FA password"
                    : "Only use this if Telegram asks"
                }
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Leave this alone unless the selected account says it needs 2FA.
            </p>
            <Button
              type="submit"
              disabled={!pendingAccountId}
              loading={loading}
            >
              <IconLockPassword className="size-4" />
              Confirm 2FA
            </Button>
          </form>
        </div>
      )}
    </Panel>
  )
}

function LoginChecklist() {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
      <strong className="text-foreground">If no code arrives:</strong>
      <span>Keep Telegram open on the phone or desktop account.</span>
      <span>Confirm the phone number includes the country code.</span>
      <span>Wait before retrying if Telegram rate-limits code requests.</span>
    </div>
  )
}

function PendingAccountCard({ account }: { account?: Account }) {
  if (!account) return null

  return (
    <div className="rounded-lg border border-border bg-background/70 p-4 text-sm">
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
  props.flash("Account login completed.", "success")
}

async function submitPassword(accountId: string, password: string) {
  await api("/api/accounts/confirm-password", {
    method: "POST",
    body: toForm({ account_id: accountId, password }),
  })
}

// ---------------------------------------------------------------------------
// Import / Export panels (the former Sessions screen)
// ---------------------------------------------------------------------------

type TransferPanelProps = Pick<
  AccountsScreenProps,
  "guarded" | "refresh" | "flash" | "loading"
>

function ImportPanel({ guarded, refresh, flash, loading }: TransferPanelProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [error, setError] = React.useState("")
  const [dragging, setDragging] = React.useState(false)

  // Accept only .session files; de-dupe by name+size so picking + dropping the
  // same file twice doesn't import it twice.
  function addFiles(incoming: FileList | null) {
    if (!incoming || !incoming.length) return
    const sessionFiles = [...incoming].filter((file) =>
      file.name.toLowerCase().endsWith(".session")
    )
    const rejected = incoming.length - sessionFiles.length
    setError(rejected > 0 ? `Skipped ${rejected} non-.session file(s).` : "")
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`))
      const merged = [...current]
      for (const file of sessionFiles) {
        const key = `${file.name}:${file.size}`
        if (!seen.has(key)) {
          merged.push(file)
          seen.add(key)
        }
      }
      return merged
    })
  }

  function clearFiles() {
    setFiles([])
    setError("")
    if (inputRef.current) inputRef.current.value = ""
  }

  function importAll() {
    if (!files.length) {
      setError("Choose one or more .session files to import.")
      return
    }
    guarded(async () => {
      const formData = new FormData()
      for (const file of files) formData.append("files", file)
      const result = await api<{
        imported: Account[]
        failed: Array<{ filename: string; error: string }>
      }>("/api/sessions/import-files", { method: "POST", body: formData })
      clearFiles()
      const okCount = result.imported.length
      const failCount = result.failed.length
      flash(
        failCount
          ? `Imported ${okCount} session(s); ${failCount} could not be read.`
          : `Imported ${okCount} session(s) — named from Telegram.`,
        failCount ? "error" : "success"
      )
      await refresh()
    })
  }

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={<IconFileImport />}
        title="Import .session files"
        detail="Drop or pick one or more Telethon .session files. Each is validated and auto-named to its Telegram account — no labels to type."
      />
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        <IconUpload className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="text-muted-foreground">Drag .session files here, or</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".session"
          multiple
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>
      {error ? (
        <p className="text-xs text-destructive normal-case">{error}</p>
      ) : null}
      {files.length ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{files.length} file(s) ready</span>
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={clearFiles}
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-auto">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-mono">
                  {file.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 opacity-60 hover:opacity-100"
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((_, i) => i !== index)
                    )
                  }
                >
                  <IconX className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <Button disabled={loading || !files.length} onClick={importAll}>
        {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconUpload />}
        Import {files.length || ""} Session{files.length === 1 ? "" : "s"}
      </Button>
    </Panel>
  )
}

function ExportPanel({
  accounts,
  selectedIds,
  setSelectedIds,
  guarded,
  flash,
  loading,
  askDialog,
}: Pick<
  AccountsScreenProps,
  | "accounts"
  | "selectedIds"
  | "setSelectedIds"
  | "guarded"
  | "flash"
  | "loading"
  | "askDialog"
>) {
  const selectedCount = accounts.filter((account) =>
    selectedIds.has(account.id)
  ).length
  const allSelected = accounts.length > 0 && selectedCount === accounts.length

  function toggle(accountId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={<IconDownload />}
        title="Export selected sessions"
        detail="Pick the sessions to export as a private ZIP. Session files can access Telegram accounts — keep the export private."
        trailing={
          <Badge tone="border-border bg-muted/40 text-muted-foreground">
            {selectedCount} selected
          </Badge>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts to export"
          detail="Add or import a Telegram session first, then choose which sessions to export here."
          className="px-4 py-8"
        />
      ) : (
        <>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!accounts.length}
              onClick={() =>
                setSelectedIds(
                  allSelected
                    ? new Set()
                    : new Set(accounts.map((account) => account.id))
                )
              }
            >
              {allSelected ? "Clear all" : "Select all"}
            </Button>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {accounts.map((account) => (
              <ExportAccountRow
                key={account.id}
                account={account}
                selected={selectedIds.has(account.id)}
                onToggle={() => toggle(account.id)}
              />
            ))}
          </div>
        </>
      )}

      <Button
        disabled={loading || !selectedCount}
        onClick={() => guarded(() => exportSessions(selectedIds, askDialog, flash))}
      >
        {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconDownload />}
        Export {selectedCount || ""} Session{selectedCount === 1 ? "" : "s"}
      </Button>
    </Panel>
  )
}

function ExportAccountRow({
  account,
  selected,
  onToggle,
}: {
  account: Account
  selected: boolean
  onToggle: () => void
}) {
  const status = accountStatus(account)
  return (
    <label
      className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:bg-muted/20"
      }`}
    >
      <input
        type="checkbox"
        aria-label={`Export ${account.label || account.session_name}`}
        checked={selected}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {account.label || account.session_name}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {account.session_name}.session
        </span>
      </span>
      <Badge tone={statusTone(status)}>{status}</Badge>
    </label>
  )
}

async function exportSessions(
  selectedIds: Set<string>,
  askDialog: AccountsScreenProps["askDialog"],
  flash: AccountsScreenProps["flash"]
) {
  if (!selectedIds.size) {
    flash("Select at least one session.")
    return
  }
  const confirmed = await askDialog({
    title: "Export session credentials?",
    description:
      "Exported session files can access Telegram accounts. Keep the ZIP private and do not upload it anywhere.",
    confirmLabel: "Export ZIP",
    danger: true,
  })
  if (!confirmed) return
  const response = await fetch("/api/sessions/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_ids: [...selectedIds], redact_phone: true }),
  })
  if (!response.ok) {
    try {
      const payload = (await response.json()) as { detail?: string }
      throw new Error(payload.detail || "Export failed")
    } catch {
      throw new Error("Export failed")
    }
  }
  const blob = await response.blob()
  downloadBlob(blob, "telemanager-sessions.zip")
  flash("Session export created.", "success")
}
