import { IconUsers } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import {
  Badge,
  Callout,
  Disclosure,
  EmptyState,
} from "../../components/ui"
import { accountStatus, statusTone } from "../../lib/helpers"
import type { ActionsScreenProps } from "../screen-props"

// The batch's accounts — the "Run as" half of "N chats × N accounts". A compact
// bar summarising how many sessions the action fans out to, expandable to the
// full session picker. Reworked from the old builder's RunAsSelector so the
// selection state (`actionAccountIds`) and behaviour are unchanged.
export function AccountsBar({ props }: { props: ActionsScreenProps }) {
  const { accounts, actionAccountIds, setActionAccountIds, toggleSelected } =
    props

  const readyCount = accounts.filter(
    (account) => account.authorized && !account.last_error
  ).length

  const summary =
    actionAccountIds.size === 0
      ? "No accounts selected"
      : `${actionAccountIds.size} account${actionAccountIds.size === 1 ? "" : "s"} selected`

  return (
    <div className="space-y-3">
      <QuickActionNotice quickActionContext={props.quickActionContext} />
      <Disclosure
        icon={IconUsers}
        label="Run as"
        defaultOpen={actionAccountIds.size === 0}
        hint={
          <span className={actionAccountIds.size ? "text-primary" : undefined}>
            {summary}
          </span>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={!readyCount}
              onClick={() =>
                setActionAccountIds(
                  new Set(
                    accounts
                      .filter(
                        (account) => account.authorized && !account.last_error
                      )
                      .map((account) => account.id)
                  )
                )
              }
            >
              Select ready ({readyCount})
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!actionAccountIds.size}
              onClick={() => setActionAccountIds(new Set())}
            >
              Clear
            </Button>
          </div>
          <div className="grid max-h-56 gap-1.5 overflow-auto sm:grid-cols-2">
            {accounts.length === 0 ? (
              <EmptyState
                title="No accounts"
                detail="Add or import accounts first, then choose which sessions run the batch."
                className="px-4 py-6 sm:col-span-2"
              />
            ) : null}
            {accounts.map((account) => {
              const status = accountStatus(account)
              const selectable = account.authorized && !account.last_error
              const isSelected = actionAccountIds.has(account.id)
              return (
                <label
                  key={account.id}
                  className={`flex items-center gap-2 rounded-md border p-2 text-xs transition-colors ${
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/20"
                  } ${selectable ? "" : "opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Use ${account.label || account.session_name} for this action`}
                    checked={isSelected}
                    disabled={!selectable && !isSelected}
                    onChange={() =>
                      toggleSelected(account.id, setActionAccountIds)
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {account.label || account.session_name}
                  </span>
                  <Badge tone={statusTone(status)}>{status}</Badge>
                </label>
              )
            })}
          </div>
        </div>
      </Disclosure>
    </div>
  )
}

// Shown when the batch arrived from the Dialogs screen ("Use in Actions"), so it
// is clear where the staged targets came from.
function QuickActionNotice({
  quickActionContext,
}: {
  quickActionContext: ActionsScreenProps["quickActionContext"]
}) {
  if (!quickActionContext) return null

  return (
    <Callout
      tone="primary"
      title={
        <>
          <strong>{quickActionContext.title}</strong>
          <Badge tone="border-primary/30 bg-background text-primary">
            from dialogs
          </Badge>
          <Badge tone="border-border bg-background text-muted-foreground">
            {quickActionContext.count} target(s)
          </Badge>
        </>
      }
    >
      <span className="text-muted-foreground">
        Source: {quickActionContext.targetSummary}
      </span>
    </Callout>
  )
}
