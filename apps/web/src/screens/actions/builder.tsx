import * as React from "react"

import {
  IconAlertTriangle,
  IconForms,
  IconListDetails,
  IconLoader2,
  IconUsers,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { ActionFields } from "../../components/action-fields"
import { TargetComposer } from "../../components/target-composer"
import {
  Badge,
  Callout,
  Disclosure,
  EmptyState,
  Field,
  Panel,
  Select,
  TimingBadge,
} from "../../components/ui"
import {
  carryFieldValues,
  getActionSchema,
  isActionFormValid,
} from "../../lib/action-schema"
import { actionDelaySeconds, tierForAction } from "../../lib/action-meta"
import { actionMeta, categoryLabels, categoryOrder } from "../../lib/constants"
import { accountStatus, splitTargets, statusTone } from "../../lib/helpers"
import { partitionTargets } from "../../lib/targeting"
import type { ActionType } from "../../types"
import type { ActionsScreenProps } from "../screen-props"
import { SectionLabel } from "./section-label"

const SINGLE_TARGET_ACTIONS = new Set<ActionType>([
  "forward_message",
  "edit_message",
  "pin_message",
  "unpin_message",
  "download_media",
])

const groupedActions = categoryOrder.map((category) => ({
  category,
  label: categoryLabels[category],
  actions: (
    Object.entries(actionMeta) as [
      ActionType,
      (typeof actionMeta)[ActionType],
    ][]
  ).filter(([, meta]) => meta.category === category),
}))

export function BuilderColumn({ props }: { props: ActionsScreenProps }) {
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const currentMeta = actionMeta[props.actionDraft.action_type]
  const schema = getActionSchema(props.actionDraft.action_type)
  const targets = splitTargets(props.actionDraft.target)
  const { valid } = partitionTargets(targets, props.actionDraft.action_type)
  const blocker = computeBuilderBlocker(props, valid)
  const firstAccountId = [...props.actionAccountIds][0] || ""

  function handleAdd() {
    setSubmitAttempted(true)
    if (blocker) {
      if (schema) setShowAdvanced(true)
      return props.flash(blocker)
    }
    props.addQueueStep()
    setSubmitAttempted(false)
  }

  const multiTargetWarning =
    SINGLE_TARGET_ACTIONS.has(props.actionDraft.action_type) && valid.length > 1
      ? "This action uses a message id that is unique per chat. Use one target per step."
      : null

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <SectionLabel
          icon={IconForms}
          title="Build action"
          hint="Compose a step, then add it to the queue."
        />
      </div>

      <div className="space-y-4 p-4">
        <RunAsSelector props={props} />
        <QuickActionNotice quickActionContext={props.quickActionContext} />

        <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <Field label="Action">
              <Select
                value={props.actionDraft.action_type}
                onChange={(event) => {
                  const next = event.target.value as ActionType
                  props.setQuickActionContext(null)
                  setSubmitAttempted(false)
                  setShowAdvanced(false)
                  props.setActionDraft({
                    ...props.actionDraft,
                    action_type: next,
                    fields: carryFieldValues(next, props.actionDraft.fields),
                  })
                }}
              >
                {groupedActions.map((group) => (
                  <optgroup key={group.category} label={group.label}>
                    {group.actions.map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <div className="space-y-1.5 px-0.5 text-xs leading-5 text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {currentMeta.label}
                </span>
                <TimingBadge
                  tier={tierForAction(
                    props.actionsMeta,
                    props.actionDraft.action_type
                  )}
                  seconds={actionDelaySeconds(
                    props.actionDraft.action_type,
                    props.actionsMeta,
                    props.safety
                  )}
                />
              </div>
              <p>{currentMeta.description}</p>
            </div>
          </div>

          <Field label="Targets">
            <TargetComposer
              value={props.actionDraft.target}
              onChange={(next) =>
                props.setActionDraft((current) => ({ ...current, target: next }))
              }
              actionType={props.actionDraft.action_type}
              accounts={props.accounts}
              defaultAccountId={firstAccountId}
              flash={props.flash}
            />
          </Field>
        </div>

        {multiTargetWarning ? (
          <Callout tone="warning" icon={IconAlertTriangle}>
            {multiTargetWarning}
          </Callout>
        ) : null}

        {schema ? (
          <Disclosure
            flush
            icon={IconListDetails}
            label="Action details"
            hint="fields for this action"
            count={schema.fields.length}
            open={showAdvanced || submitAttempted}
            onOpenChange={setShowAdvanced}
          >
            <ActionFields
              actionType={props.actionDraft.action_type}
              values={props.actionDraft.fields}
              setValues={(fields) =>
                props.setActionDraft({ ...props.actionDraft, fields })
              }
              showErrors={submitAttempted}
              flash={props.flash}
              bare
            />
          </Disclosure>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Button
          type="button"
          size="comfortable"
          onClick={handleAdd}
          disabled={props.loading}
          title={blocker || undefined}
        >
          {props.loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
          Add To Queue
        </Button>
        <p className={`text-xs ${blocker ? "text-muted-foreground" : "text-primary"}`}>
          {blocker ||
            `Ready to add${valid.length ? ` · ${valid.length} target(s)` : ""}.`}
        </p>
      </div>
    </Panel>
  )
}

// Mirrors the order of checks in addQueueStep so the inline hint matches what
// will actually block the add. Receives the already-valid targets, so greyed
// (incompatible) targets simply don't count toward the requirement.
function computeBuilderBlocker(
  props: ActionsScreenProps,
  validTargets: string[]
): string | null {
  if (!props.actionAccountIds.size) return "Select at least one account."
  if (!validTargets.length) return "Add at least one compatible target."
  if (!isActionFormValid(props.actionDraft.action_type, props.actionDraft.fields)) {
    return "Fill in the required fields below."
  }
  return null
}

// The "run as" account picker. Folded into the builder as a disclosure rather
// than its own column: it's expanded until a session is chosen, then collapses
// to a one-line summary so the builder isn't dominated by the account list on
// every visit. Same selection state as before (props.actionAccountIds).
function RunAsSelector({ props }: { props: ActionsScreenProps }) {
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
          <div className="max-h-56 space-y-1.5 overflow-auto">
            {accounts.length === 0 ? (
              <EmptyState
                title="No accounts"
                detail="Add or import accounts first, then choose which sessions run the queue."
                className="px-4 py-6"
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
                    aria-label={`Use ${account.label || account.session_name} for queued actions`}
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
  )
}

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
