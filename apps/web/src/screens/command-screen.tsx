import { Button } from "@workspace/ui/components/button"

import { AccountsTable } from "../components/accounts-table"
import { Metric, Panel, SectionTitle } from "../components/ui"
import type { CommandScreenProps } from "./screen-props"

export function CommandScreen(props: CommandScreenProps) {
  const {
    accounts,
    selectedIds,
    setSelectedIds,
    setView,
    metrics,
    guarded,
    refresh,
    flash,
    askDialog,
  } = props

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
            detail="Select stored sessions, then run one-off commands. The app connects, executes, logs, and disconnects."
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setView("dialogs")}>
              Fetch Dialogs
            </Button>
            <Button onClick={() => setView("actions")}>Run Action</Button>
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
