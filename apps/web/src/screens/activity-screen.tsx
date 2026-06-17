import { IconDownload, IconTimeline } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { EmptyState, Panel, SectionTitle } from "../components/ui"
import { humanTime } from "../lib/helpers"
import type { ActivityEvent } from "../types"

export function ActivityScreen({ activity }: { activity: ActivityEvent[] }) {
  return (
    <Panel className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <SectionTitle
          kicker="Audit"
          title="Local Activity"
          detail="Persistent local audit trail plus current browser feedback."
        />
        <Button
          variant="outline"
          onClick={() => {
            const link = document.createElement("a")
            link.href = "/api/activity/export"
            link.download = "telemanager-activity.jsonl"
            link.click()
          }}
        >
          <IconDownload />
          Export JSONL
        </Button>
      </div>
      <div className="space-y-2">
        {activity.length ? (
          activity.map((entry, index) => (
            <div key={entry.id || index} className="border border-border p-3">
              <strong className="block text-sm">
                {entry.title || entry.event_type}
              </strong>
              <span className="text-xs text-muted-foreground">
                {humanTime(entry.created_at)}{" "}
                {entry.detail ? ` / ${entry.detail}` : ""}
              </span>
            </div>
          ))
        ) : (
          <EmptyState
            icon={IconTimeline}
            title="No activity yet"
            detail="Validated sessions, queue runs, dialog fetches, and other local events will appear here as you use TeleManager."
            className="border-0 bg-transparent px-4 py-8"
          />
        )}
      </div>
    </Panel>
  )
}
