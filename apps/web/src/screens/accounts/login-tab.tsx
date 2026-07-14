import * as React from "react"

import {
  IconKey,
  IconLockPassword,
  IconMessage2Bolt,
  IconX,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import {
  Callout,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  StepHeading,
} from "../../components/ui"
import {
  useAccountLoginFlow,
  type FormSubmitEvent,
} from "../../hooks/use-account-login-flow"
import type { Account } from "../../types"
import type { AccountsScreenProps } from "../screen-props"

export function LoginTab({ props }: { props: AccountsScreenProps }) {
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
          error={
            loginFlow.loginError?.step === "request"
              ? loginFlow.loginError.message
              : null
          }
          onDismissError={loginFlow.clearLoginError}
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
          codeError={
            loginFlow.loginError?.step === "code"
              ? loginFlow.loginError.message
              : null
          }
          passwordError={
            loginFlow.loginError?.step === "2fa"
              ? loginFlow.loginError.message
              : null
          }
          onDismissError={loginFlow.clearLoginError}
        />
      </div>
    </div>
  )
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
          <p className="type-label text-primary-text">Login Readiness</p>
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
  error,
  onDismissError,
}: {
  apiConfigured: boolean
  loading: boolean
  onSubmit: (event: FormSubmitEvent) => Promise<void>
  error: string | null
  onDismissError: () => void
}) {
  return (
    <Panel className="space-y-4">
      <StepHeading
        step={1}
        title="Request login code"
        detail="Use the same international phone format you use in Telegram, for example +15551234567."
      />
      {error ? (
        <LoginErrorNote
          message={error}
          hint="Check the phone number, then send the code again."
          onDismiss={onDismissError}
        />
      ) : null}
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
          size="comfortable"
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
  codeError,
  passwordError,
  onDismissError,
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
  codeError: string | null
  passwordError: string | null
  onDismissError: () => void
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
              <IconMessage2Bolt className="size-4 text-primary-text" />
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
            {codeError ? (
              <LoginErrorNote
                message={codeError}
                hint="The code may be wrong or expired. Re-enter it, or request a fresh code on the left."
                onDismiss={onDismissError}
              />
            ) : null}
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
              <IconLockPassword className="size-4 text-primary-text" />
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
            {passwordError ? (
              <LoginErrorNote
                message={passwordError}
                hint="Re-enter the account's 2FA password and confirm again."
                onDismiss={onDismissError}
              />
            ) : null}
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
    <Callout
      tone="info"
      title={<span className="text-foreground">If no code arrives:</span>}
    >
      <div className="grid gap-2">
        <span>
          Open Telegram on this phone number and check the “Telegram” service chat
          — the login code is sent there, not by SMS.
        </span>
        <span>
          Re-check the number above: it must start with “+” and the country code,
          e.g. +15551234567.
        </span>
        <span>
          If Telegram says you’re requesting codes too often, wait a few minutes,
          then press “Send Login Code” again.
        </span>
      </div>
    </Callout>
  )
}

// Inline, dismissible failure note for a single login step. Sits in the form it
// belongs to so the operator sees what went wrong, gets a concrete next step,
// and can retry in place (the form keeps its value; the button re-runs it).
function LoginErrorNote({
  message,
  hint,
  onDismiss,
}: {
  message: string
  hint: string
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs leading-5"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium text-destructive">{message}</p>
        <p className="text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss error"
        className="shrink-0 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        onClick={onDismiss}
      >
        <IconX className="size-3.5" />
      </button>
    </div>
  )
}

function PendingAccountCard({ account }: { account?: Account }) {
  if (!account) return null

  return (
    <div className="rounded-lg border border-border bg-background/70 p-4 text-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <strong>{account.label || account.session_name}</strong>
        <span className="type-label text-muted-foreground">
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

function accountStatusText(account: Account) {
  if (account.last_error) return "Error"
  if (account.status === "password_pending") return "Needs 2FA"
  if (account.status === "login_pending") return "Code sent"
  if (account.authorized) return "Ready"
  return "Needs login"
}
