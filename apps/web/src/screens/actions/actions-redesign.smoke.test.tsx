/** @jsxRuntime automatic */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { AccountsBar } from "./accounts-bar"
import { ActionPicker } from "./action-picker"
import { RunPanel } from "./run-panel"
import { defaultFieldValues } from "../../lib/action-schema"
import { emptySafety } from "../../lib/constants"
import type { Account } from "../../types"
import type { ActionsScreenProps } from "../screen-props"
import type { ActionBusy } from "../../hooks/use-action-busy"

const account: Account = {
  id: "acc-1",
  label: "Main",
  session_name: "main",
  username: "main",
  authorized: true,
  last_error: null,
}

// A representative props bag. Only the fields the three components read need to be
// real; the rest are stubbed. Cast through unknown so the test doesn't have to
// supply the full ~35-field ActionsScreenProps surface.
function props(overrides: Partial<ActionsScreenProps> = {}): ActionsScreenProps {
  return {
    accounts: [account],
    actionAccountIds: new Set(["acc-1"]),
    setActionAccountIds: vi.fn(),
    toggleSelected: vi.fn(),
    presets: [],
    loadPresets: vi.fn(),
    safety: emptySafety,
    setSafety: vi.fn(),
    actionsMeta: null,
    actionDraft: {
      action_type: "mute_chat",
      target: "@somechat",
      fields: defaultFieldValues("mute_chat"),
      condition: null,
    },
    quickActionContext: null,
    setActionDraft: vi.fn(),
    setQuickActionContext: vi.fn(),
    flash: vi.fn(),
    guarded: vi.fn(),
    askDialog: vi.fn(),
    ...overrides,
  } as unknown as ActionsScreenProps
}

const actionBusy: ActionBusy = {
  busy: false,
  isPending: () => false,
  runAction: vi.fn(),
} as unknown as ActionBusy

describe("Actions redesign smoke", () => {
  it("AccountsBar renders the run-as summary", () => {
    render(<AccountsBar props={props()} />)
    expect(screen.getByText("Run as")).toBeTruthy()
  })

  it("ActionPicker renders grouped, searchable action cards", () => {
    render(<ActionPicker props={props()} />)
    expect(screen.getByText("Choose an action")).toBeTruthy()
    expect(screen.getByText("Chat state")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Mute chat/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Send message/ })).toBeTruthy()
  })

  it("RunPanel renders the selected action and a run CTA", () => {
    render(
      <RunPanel
        props={props()}
        actionBusy={actionBusy}
        activeRunId={null}
        pollQueueRun={vi.fn()}
        onSchedule={vi.fn()}
      />
    )
    // Header names the selected action; CTA reflects the one valid target.
    expect(screen.getAllByText("Mute chat").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Run on 1 chat/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Schedule/ })).toBeTruthy()
    expect(screen.getByText(/Runs as 1 selected account/)).toBeTruthy()
  })

  it("RunPanel blocks the run when no account is selected", () => {
    render(
      <RunPanel
        props={props({ actionAccountIds: new Set() })}
        actionBusy={actionBusy}
        activeRunId={null}
        pollQueueRun={vi.fn()}
        onSchedule={vi.fn()}
      />
    )
    expect(screen.getByText("Select at least one account.")).toBeTruthy()
  })
})
