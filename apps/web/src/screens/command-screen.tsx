import { Button } from "../ui/button"

import { AccountsTable } from "../components/accounts-table"
import { Metric, Panel, SectionTitle } from "../components/ui"
import type { CommandScreenProps } from "./screen-props"

export function CommandScreen(props: CommandScreenProps) {
  const {
    accounts,
    selectedIds,
    setSelectedIds,
    setActionAccountIds,
    setDialogAccountId,
    setView,
    metrics,
    guarded,
    refresh,
    flash,
    askDialog,
  } = props

  const readySelectedIds = accounts
    .filter(
      (account) =>
        selectedIds.has(account.id) &&
        account.authorized &&
        !account.last_error
    )
    .map((account) => account.id)

  function runActionWithSelection() {
    if (readySelectedIds.length) {
      setActionAccountIds(new Set(readySelectedIds))
      flash(`Carried ${readySelectedIds.length} selected session(s) into Actions.`)
    }
    setView("actions")
  }

  function fetchDialogsForSelection() {
    const target =
      readySelectedIds[0] ||
      accounts.find(
        (account) => account.authorized && !account.last_error
      )?.id
    if (target) setDialogAccountId(target)
    setView("dialogs")
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Total sessions" value={accounts.length} primary />
        <Metric label="Ready" value={metrics.ready} />
        <Metric label="Needs attention" value={metrics.attention} />
        <Metric label="Known dialogs" value={metrics.knownDialogs} />
      </div>
      <Panel className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <SectionTitle
            kicker="Daily workspace"
            title="Session Fleet"
            detail="Select stored sessions, then run one-off commands. Selected ready sessions carry into Actions and Dialogs. The app connects, executes, logs, and disconnects."
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchDialogsForSelection}>
              Fetch Dialogs
            </Button>
            <Button onClick={runActionWithSelection}>Run Action</Button>
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
    </div>
  )
}
