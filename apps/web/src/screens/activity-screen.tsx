import * as React from "react"

import { IconDownload, IconSearch, IconTimeline } from "@tabler/icons-react"

import { Button } from "../ui/button"

import {
  Badge,
  EmptyState,
  Input,
  Panel,
  Select,
  ShowMore,
  StepHeading,
} from "../components/ui"
import { humanTime } from "../lib/helpers"
import type { ActivityEvent } from "../types"

// Render the log in pages so a long audit trail (thousands of events) doesn't
// mount every row at once.
const ACTIVITY_PAGE = 50

export function ActivityScreen({ activity }: { activity: ActivityEvent[] }) {
  const [search, setSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState("all")
  const [visible, setVisible] = React.useState(ACTIVITY_PAGE)

  const eventTypes = React.useMemo(() => {
    const set = new Set<string>()
    for (const entry of activity) {
      if (entry.event_type) set.add(entry.event_type)
    }
    return [...set].sort()
  }, [activity])

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return activity.filter((entry) => {
      if (typeFilter !== "all" && entry.event_type !== typeFilter) return false
      if (!query) return true
      return [entry.title, entry.detail, entry.event_type, entry.account_label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    })
  }, [activity, search, typeFilter])

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={<IconTimeline />}
        title="Local activity"
        detail="Persistent local audit trail of logins, validations, queue runs, and session changes."
        trailing={
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
        }
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            type="search"
            autoComplete="off"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setVisible(ACTIVITY_PAGE)
            }}
            placeholder="Search title, detail, or account"
          />
        </div>
        <Select
          className="lg:w-56"
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value)
            setVisible(ACTIVITY_PAGE)
          }}
        >
          <option value="all">All event types</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {formatEventType(type)}
            </option>
          ))}
        </Select>
      </div>

      <div className="divide-y divide-border">
        {filtered.length ? (
          <>
            {filtered.slice(0, visible).map((entry, index) => (
              <ActivityRow key={entry.id || index} entry={entry} />
            ))}
            <ShowMore
              shown={Math.min(visible, filtered.length)}
              total={filtered.length}
              onMore={() => setVisible((current) => current + ACTIVITY_PAGE)}
            />
          </>
        ) : (
          <EmptyState
            icon={IconTimeline}
            title={activity.length ? "No matching events" : "No activity yet"}
            detail={
              activity.length
                ? "Adjust the search text or event type filter to see more events."
                : "Validated sessions, queue runs, dialog fetches, and other local events will appear here as you use TeleManager."
            }
            className="border-0 bg-transparent px-4 py-8"
          />
        )}
      </div>
    </Panel>
  )
}

function ActivityRow({ entry }: { entry: ActivityEvent }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <strong className="block text-sm">
          {entry.title || formatEventType(entry.event_type || "event")}
        </strong>
        <span className="text-xs text-muted-foreground">
          {humanTime(entry.created_at)}
          {entry.detail ? ` · ${entry.detail}` : ""}
          {entry.account_label ? ` · ${entry.account_label}` : ""}
        </span>
      </div>
      {entry.event_type ? (
        <Badge tone="border-border bg-muted/40 text-muted-foreground">
          {formatEventType(entry.event_type)}
        </Badge>
      ) : null}
    </div>
  )
}

function formatEventType(type: string) {
  return type.replace(/_/g, " ")
}
