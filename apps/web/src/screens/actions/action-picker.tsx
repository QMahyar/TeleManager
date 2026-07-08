import * as React from "react"

import { IconSearch } from "@tabler/icons-react"

import { Input, Panel } from "../../components/ui"
import { ACTION_ICONS } from "../../lib/action-icons"
import { carryFieldValues } from "../../lib/action-schema"
import { actionMeta, categoryLabels } from "../../lib/constants"
import type { ActionCategory } from "../../lib/constants"
import type { ActionType } from "../../types"
import type { ActionsScreenProps } from "../screen-props"

// Grid display order + friendlier section labels than the raw category keys.
// Kept local so the shared `categoryOrder`/`categoryLabels` (used by other code)
// stay untouched; this only governs how the picker groups its cards.
const GRID_GROUPS: Array<{ category: ActionCategory; label: string }> = [
  { category: "management", label: "Chat state" },
  { category: "messaging", label: categoryLabels.messaging },
  { category: "message_tools", label: categoryLabels.message_tools },
  { category: "joining", label: "Membership" },
  { category: "cleanup", label: categoryLabels.cleanup },
  { category: "moderation", label: categoryLabels.moderation },
  { category: "downloads", label: "Media & files" },
]

const ALL_ACTIONS = Object.entries(actionMeta) as [
  ActionType,
  (typeof actionMeta)[ActionType],
][]

// The action picker — a searchable grid of action cards grouped by category, the
// batch-first replacement for the old `<select>`. Picking a card sets the draft's
// action type (carrying compatible field values forward) and clears any quick-
// action context, mirroring the old builder's onChange.
export function ActionPicker({ props }: { props: ActionsScreenProps }) {
  const [query, setQuery] = React.useState("")
  const selected = props.actionDraft.action_type

  function pick(next: ActionType) {
    if (next === selected) return
    props.setQuickActionContext(null)
    props.setActionDraft({
      ...props.actionDraft,
      action_type: next,
      fields: carryFieldValues(next, props.actionDraft.fields),
    })
  }

  const needle = query.trim().toLowerCase()
  const groups = GRID_GROUPS.map((group) => ({
    ...group,
    actions: ALL_ACTIONS.filter(
      ([, meta]) =>
        meta.category === group.category &&
        (!needle ||
          meta.label.toLowerCase().includes(needle) ||
          meta.description.toLowerCase().includes(needle))
    ),
  })).filter((group) => group.actions.length > 0)

  return (
    <Panel className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h2 className="type-heading text-foreground">Choose an action</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            One action runs on every chat and account in the batch.
          </p>
        </div>
        <div className="relative sm:w-56">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions"
            aria-label="Search actions"
          />
        </div>
      </div>

      {groups.length ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.category} className="space-y-2">
              <p className="type-label text-muted-foreground">{group.label}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.actions.map(([value, meta]) => (
                  <ActionCard
                    key={value}
                    actionType={value}
                    label={meta.label}
                    destructive={Boolean(meta.destructive)}
                    selected={value === selected}
                    onSelect={() => pick(value)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
          No actions match “{query}”.
        </p>
      )}
    </Panel>
  )
}

function ActionCard({
  actionType,
  label,
  destructive,
  selected,
  onSelect,
}: {
  actionType: ActionType
  label: string
  destructive: boolean
  selected: boolean
  onSelect: () => void
}) {
  const Icon = ACTION_ICONS[actionType]
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all",
        selected
          ? "border-primary/40 bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/40"
          : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
      ].filter(Boolean).join(" ")}
    >
      <span
        className={[
          "grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
          selected
            ? "bg-primary/15 text-primary"
            : destructive
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
        ].filter(Boolean).join(" ")}
      >
        <Icon />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}
