import * as React from "react"

import { IconKey, IconMessages, IconUserPlus } from "@tabler/icons-react"

import { Button } from "../ui/button"
import { ModalShell } from "../ui/modal"
import type { Account } from "../types"

// First-launch nudge. Shown once when no accounts exist yet; dismissal is sticky
// (localStorage) so it never reappears once the operator has seen it. The three
// steps mirror the real first-run path: API credentials → log in → fetch dialogs.
const STORAGE_KEY = "tm_welcomed"

const STEPS = [
  {
    icon: IconKey,
    title: "1 · Add API credentials",
    detail: "Paste your API ID and hash from my.telegram.org in Settings → API.",
  },
  {
    icon: IconUserPlus,
    title: "2 · Log in an account",
    detail: "Add an owned account by phone login, or import an existing .session file.",
  },
  {
    icon: IconMessages,
    title: "3 · Fetch dialogs",
    detail: "Load an account's chats, then stage guarded, rate-limited actions.",
  },
]

export function WelcomeModal({
  accounts,
  accountsLoaded,
  apiConfigured,
  onConfigureApi,
  onAddAccount,
}: {
  accounts: Account[]
  accountsLoaded: boolean
  apiConfigured: boolean
  onConfigureApi: () => void
  onAddAccount: () => void
}) {
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })

  const open = accountsLoaded && accounts.length === 0 && !dismissed

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // Private mode: just hide it for this session.
    }
    setDismissed(true)
  }

  // The primary action sends the operator to the first unfinished step.
  const primary = apiConfigured
    ? { label: "Add an account", run: onAddAccount }
    : { label: "Add API credentials", run: onConfigureApi }

  return (
    <ModalShell
      open={open}
      onClose={dismiss}
      size="md"
      kicker="Welcome to TeleManager"
      title="Three steps to your first run"
      description="A local-first console for owned Telegram accounts. Nothing leaves this machine."
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            Skip
          </Button>
          <Button
            onClick={() => {
              dismiss()
              primary.run()
            }}
          >
            {primary.label}
          </Button>
        </>
      }
    >
      <ul className="space-y-3">
        {STEPS.map((step) => {
          const Icon = step.icon
          return (
            <li key={step.title} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary [&_svg]:size-4.5">
                <Icon />
              </span>
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">{step.title}</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </ModalShell>
  )
}
