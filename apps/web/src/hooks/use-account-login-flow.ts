import * as React from "react"

import { api, toForm } from "../lib/api"
import type { Account } from "../types"
import type { AccountsScreenProps } from "../screens/screen-props"

export type FormSubmitEvent = React.SyntheticEvent<HTMLFormElement>

// Which step of the Telegram login a failure belongs to, so each form shows
// only its own inline error instead of a single shared (and stale) message.
type LoginStep = "request" | "code" | "2fa"
type LoginError = { step: LoginStep; message: string }

export function useAccountLoginFlow(props: AccountsScreenProps) {
  const codeInputRef = React.useRef<HTMLInputElement>(null)
  const passwordInputRef = React.useRef<HTMLInputElement>(null)
  const [loginError, setLoginError] = React.useState<LoginError | null>(null)
  const pendingAccount = props.accounts.find(
    (account) => account.id === props.pendingAccountId
  )

  // Run the step's work, but pin its failure to an inline, dismissible message
  // (and re-throw so `guarded` still flashes the toast). The form is left
  // untouched on error so the operator can fix the value and resubmit without
  // re-typing — the retry is just pressing the button again.
  function runStep(step: LoginStep, work: () => Promise<void>) {
    return props.guarded(async () => {
      try {
        await work()
        setLoginError((current) => (current?.step === step ? null : current))
      } catch (error) {
        setLoginError({
          step,
          message: error instanceof Error ? error.message : "Request failed",
        })
        throw error
      }
    })
  }

  async function startLogin(event: FormSubmitEvent) {
    event.preventDefault()
    const formElement = event.currentTarget
    await runStep("request", async () => {
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
    await runStep("code", async () => {
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
    await runStep("2fa", async () => {
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
    clearLoginError: () => setLoginError(null),
    codeInputRef,
    confirmCode,
    confirmPassword,
    loginError,
    passwordInputRef,
    pendingAccount,
    startLogin,
  }
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
