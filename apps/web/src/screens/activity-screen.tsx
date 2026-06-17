import type { ActivityEvent } from "../types"
import { humanTime } from "../lib/helpers"
import { Panel, SectionTitle } from "../components/ui"

export function ActivityScreen({ activity }: { activity: ActivityEvent[] }) {
  return (
    <Panel className="space-y-4">
      <SectionTitle
        kicker="Audit"
        title="Local Activity"
        detail="Persistent local audit trail plus current browser feedback."
      />
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
          <p className="text-sm text-muted-foreground">
            Waiting for operator action.
          </p>
        )}
      </div>
    </Panel>
  )
}
