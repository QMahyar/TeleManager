import { IconLock } from "@tabler/icons-react"
import * as React from "react"

import { Button } from "../ui/button"
import { Field, Input, Panel, StepHeading } from "./ui"
import { api, toForm } from "../lib/api"

type AuthStatus = { password_enabled: boolean }

/**
 * Optional shared-machine gate. When the backend has no app password, children
 * render immediately. When enabled, only the login card mounts until a session
 * cookie is established — so useAppState / initial API loads never 401-spam.
 */
export function AppPasswordGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = React.useState<"loading" | "open" | "locked">("loading")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await api<AuthStatus>("/api/auth/status")
        if (cancelled) return
        setPhase(status.password_enabled ? "locked" : "open")
      } catch (err) {
        if (cancelled) return
        // Status is middleware-exempt; a failure is network/server, not "locked".
        setError(err instanceof Error ? err.message : "Could not check auth status.")
        setPhase("locked")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!password.trim()) {
      setError("Enter the app password.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: toForm({ password }),
      })
      setPassword("")
      setPhase("open")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.")
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Checking session…</p>
      </div>
    )
  }

  if (phase === "open") {
    return <>{children}</>
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <Panel className="w-full max-w-sm space-y-4 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <IconLock className="size-4.5" />
          </span>
          <StepHeading
            title="App password"
            detail="This machine has optional password protection enabled. Unlock to open TeleManager."
          />
        </div>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter app password"
            />
          </Field>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="comfortable" loading={submitting}>
            Unlock
          </Button>
        </form>
      </Panel>
    </div>
  )
}
