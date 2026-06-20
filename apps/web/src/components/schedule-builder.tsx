import * as React from "react"

import { IconClockPlus } from "@tabler/icons-react"

import { Button } from "../ui/button"
import { api } from "../lib/api"
import {
  carryFieldValues,
  defaultFieldValues,
  getActionSchema,
  isActionFormValid,
  serializeFields,
  type FieldValues,
} from "../lib/action-schema"
import { actionMeta, categoryLabels, categoryOrder } from "../lib/constants"
import { accountStatus, humanTime, splitTargets, statusTone } from "../lib/helpers"
import {
  buildRecurrence,
  defaultRecurrenceForm,
  describeRecurrence,
  endModeOptions,
  engineLabel,
  engineTone,
  intervalUnitOptions,
  startModeOptions,
  validateRecurrence,
  type RecurrenceForm,
} from "../lib/schedules"
import { partitionTargets } from "../lib/targeting"
import type {
  Account,
  ActionType,
  SchedulePreview,
  ScheduleSeed,
} from "../types"
import { ActionFields } from "./action-fields"
import { TargetComposer } from "./target-composer"
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  StepHeading,
} from "./ui"

const groupedActions = categoryOrder.map((category) => ({
  category,
  label: categoryLabels[category],
  actions: (
    Object.entries(actionMeta) as [ActionType, (typeof actionMeta)[ActionType]][]
  ).filter(([, meta]) => meta.category === category),
}))

// Keep only seed accounts that exist and are ready to act.
function seedAccountIds(
  seed: ScheduleSeed | null,
  accounts: Account[]
): Set<string> {
  if (!seed) return new Set()
  return new Set(
    seed.accountIds.filter((id) =>
      accounts.some(
        (account) =>
          account.id === id && account.authorized && !account.last_error
      )
    )
  )
}

export function ScheduleBuilder({
  accounts,
  guarded,
  flash,
  loadSchedules,
  scheduleSeed,
  setScheduleSeed,
}: {
  accounts: Account[]
  guarded: (work: () => Promise<void>) => Promise<void>
  flash: (message: string) => void
  loadSchedules: () => Promise<void>
  scheduleSeed: ScheduleSeed | null
  setScheduleSeed: React.Dispatch<React.SetStateAction<ScheduleSeed | null>>
}) {
  // The builder mounts fresh each time the Schedules screen opens, so a one-shot
  // prefill staged from another screen (e.g. Dialogs) is applied via lazy state
  // initializers here, then cleared by the effect below so it can't re-apply.
  const seedAction = scheduleSeed?.actionType ?? "send_message"
  const [accountIds, setAccountIds] = React.useState<Set<string>>(() =>
    seedAccountIds(scheduleSeed, accounts)
  )
  const [actionType, setActionType] = React.useState<ActionType>(seedAction)
  const [target, setTarget] = React.useState(scheduleSeed?.target ?? "")
  const [fields, setFields] = React.useState<FieldValues>(() =>
    defaultFieldValues(seedAction)
  )
  const [name, setName] = React.useState("")
  const [form, setForm] = React.useState<RecurrenceForm>(defaultRecurrenceForm)
  const [preview, setPreview] = React.useState<SchedulePreview | null>(null)
  const [submitAttempted, setSubmitAttempted] = React.useState(false)

  // Clear the consumed seed asynchronously (off the effect body) so it does not
  // re-prefill on a later visit.
  React.useEffect(() => {
    if (!scheduleSeed) return undefined
    const timer = window.setTimeout(() => setScheduleSeed(null), 0)
    return () => window.clearTimeout(timer)
  }, [scheduleSeed, setScheduleSeed])

  const meta = actionMeta[actionType]
  const schema = getActionSchema(actionType)
  const targets = splitTargets(target)
  const { valid: validTargets, invalid: invalidTargets } = partitionTargets(
    targets,
    actionType
  )
  const readyAccounts = accounts.filter(
    (account) => account.authorized && !account.last_error
  )
  const firstAccountId = [...accountIds][0] || readyAccounts[0]?.id || ""

  function clearPreview() {
    setPreview(null)
  }

  function changeAction(next: ActionType) {
    setActionType(next)
    setFields(carryFieldValues(next, fields))
    setSubmitAttempted(false)
    clearPreview()
  }

  function toggleAccount(id: string) {
    setAccountIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    clearPreview()
  }

  function blocker(): string | null {
    if (!accountIds.size) return "Select at least one account."
    if (!validTargets.length) {
      return invalidTargets.length
        ? "No compatible targets — every target is greyed out for this action."
        : "Add at least one target."
    }
    if (!isActionFormValid(actionType, fields)) return "Fill in the required fields."
    if (name.trim().length < 3) return "Name the schedule (3+ characters)."
    return validateRecurrence(form)
  }

  function payload() {
    return {
      name: name.trim(),
      queue: {
        steps: [
          {
            action_type: actionType,
            account_ids: [...accountIds],
            targets: validTargets,
            message: serializeFields(actionType, fields),
          },
        ],
      },
      recurrence: buildRecurrence(form),
    }
  }

  async function previewSchedule() {
    setSubmitAttempted(true)
    const error = blocker()
    if (error) return flash(error)
    const result = await api<SchedulePreview>("/api/schedules/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    })
    setPreview(result)
    flash(`Preview ready (${result.engine}).`)
  }

  async function createSchedule() {
    setSubmitAttempted(true)
    const error = blocker()
    if (error) return flash(error)
    await api("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    })
    flash("Schedule created.")
    setName("")
    setTarget("")
    setFields(defaultFieldValues(actionType))
    setForm(defaultRecurrenceForm)
    setSubmitAttempted(false)
    clearPreview()
    await loadSchedules()
  }

  const currentBlocker = blocker()

  return (
    <Panel className="space-y-5">
      <StepHeading
        step={<IconClockPlus />}
        title="Create a schedule"
        detail="Pick accounts, an action, targets, and how often to repeat — all here. Text-only schedules are delivered by Telegram and keep firing while the app is closed."
      />

      <AccountPicker
        accounts={accounts}
        readyAccounts={readyAccounts}
        accountIds={accountIds}
        toggleAccount={toggleAccount}
        setAccountIds={(ids) => {
          setAccountIds(ids)
          clearPreview()
        }}
      />

      <div className="grid gap-5 border-t border-border pt-4 lg:grid-cols-2">
        {/* Left: what gets sent */}
        <section className="space-y-3">
          <Subhead>Message</Subhead>
          <Field label="Action">
            <Select
              value={actionType}
              onChange={(event) => changeAction(event.target.value as ActionType)}
            >
              {groupedActions.map((group) => (
                <optgroup key={group.category} label={group.label}>
                  {group.actions.map(([value, actionMetaItem]) => (
                    <option key={value} value={value}>
                      {actionMetaItem.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Targets">
            <TargetComposer
              value={target}
              onChange={(next) => {
                setTarget(next)
                clearPreview()
              }}
              actionType={actionType}
              accounts={accounts}
              defaultAccountId={firstAccountId}
              flash={flash}
            />
          </Field>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
          {schema ? (
            <ActionFields
              actionType={actionType}
              values={fields}
              setValues={(next) => {
                setFields(next)
                clearPreview()
              }}
              showErrors={submitAttempted}
            />
          ) : null}
        </section>

        {/* Right: when + how often */}
        <section className="space-y-3 lg:border-l lg:border-border lg:pl-5">
          <Subhead>Cadence</Subhead>
          <RecurrenceFields
            form={form}
            setForm={(next) => {
              setForm(next)
              clearPreview()
            }}
          />
          <Field label="Schedule name">
            <Input
              value={name}
              maxLength={80}
              autoComplete="off"
              placeholder="Daily hello"
              onChange={(event) => {
                setName(event.target.value)
                clearPreview()
              }}
            />
          </Field>
          <p className="border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            {describeRecurrence(buildRecurrence(form))}
          </p>
          {preview ? <SchedulePreviewCard preview={preview} /> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => guarded(previewSchedule)}>
              Preview
            </Button>
            <Button onClick={() => guarded(createSchedule)}>
              <IconClockPlus /> Create Schedule
            </Button>
          </div>
          <p className={`text-xs ${currentBlocker ? "text-muted-foreground" : "text-primary"}`}>
            {currentBlocker || "Ready to schedule."}
          </p>
        </section>
      </div>
    </Panel>
  )
}

function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
      {children}
    </span>
  )
}

function AccountPicker({
  accounts,
  readyAccounts,
  accountIds,
  toggleAccount,
  setAccountIds,
}: {
  accounts: Account[]
  readyAccounts: Account[]
  accountIds: Set<string>
  toggleAccount: (id: string) => void
  setAccountIds: (ids: Set<string>) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Accounts ({accountIds.size} selected)
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!readyAccounts.length}
            onClick={() => setAccountIds(new Set(readyAccounts.map((a) => a.id)))}
          >
            Select Ready ({readyAccounts.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!accountIds.size}
            onClick={() => setAccountIds(new Set())}
          >
            Clear
          </Button>
        </div>
      </div>
      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts"
          detail="Add or import an account first, then it can run schedules."
          className="px-4 py-6"
        />
      ) : (
        <div className="grid max-h-48 gap-2 overflow-auto sm:grid-cols-2">
          {accounts.map((account) => {
            const status = accountStatus(account)
            const selectable = account.authorized && !account.last_error
            const selected = accountIds.has(account.id)
            return (
              <label
                key={account.id}
                className={`flex items-center gap-2 border p-2 text-sm transition-colors ${
                  selected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/20"
                } ${selectable ? "" : "opacity-60"}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selectable && !selected}
                  onChange={() => toggleAccount(account.id)}
                />
                <span className="min-w-0 flex-1 truncate">
                  {account.label || account.session_name}
                </span>
                <Badge tone={statusTone(status)}>{status}</Badge>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecurrenceFields({
  form,
  setForm,
}: {
  form: RecurrenceForm
  setForm: (next: RecurrenceForm) => void
}) {
  const update = (patch: Partial<RecurrenceForm>) =>
    setForm({ ...form, ...patch })

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Every">
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              autoComplete="off"
              value={form.intervalValue}
              onChange={(event) => update({ intervalValue: event.target.value })}
            />
            <Select
              value={form.intervalUnit}
              onChange={(event) =>
                update({ intervalUnit: event.target.value as RecurrenceForm["intervalUnit"] })
              }
            >
              {intervalUnitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </Field>

        <Field label="Ends">
          <Select
            value={form.endMode}
            onChange={(event) =>
              update({ endMode: event.target.value as RecurrenceForm["endMode"] })
            }
          >
            {endModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts">
          <Select
            value={form.startMode}
            onChange={(event) =>
              update({ startMode: event.target.value as RecurrenceForm["startMode"] })
            }
          >
            {startModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {form.startMode === "delay" ? (
            <div className="mt-2 flex gap-2">
              <Input
                type="number"
                min={1}
                autoComplete="off"
                value={form.startDelayValue}
                onChange={(event) => update({ startDelayValue: event.target.value })}
              />
              <Select
                value={form.startDelayUnit}
                onChange={(event) =>
                  update({ startDelayUnit: event.target.value as RecurrenceForm["startDelayUnit"] })
                }
              >
                {intervalUnitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {form.startMode === "at" ? (
            <Input
              type="datetime-local"
              className="mt-2"
              value={form.startAt}
              onChange={(event) => update({ startAt: event.target.value })}
            />
          ) : null}
        </Field>

        {form.endMode === "count" ? (
          <Field label="Number of times">
            <Input
              type="number"
              min={1}
              autoComplete="off"
              value={form.endCount}
              onChange={(event) => update({ endCount: event.target.value })}
            />
          </Field>
        ) : null}
        {form.endMode === "until" ? (
          <Field label="End date/time">
            <Input
              type="datetime-local"
              value={form.endUntil}
              onChange={(event) => update({ endUntil: event.target.value })}
            />
          </Field>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={form.stagger}
          onChange={(event) => update({ stagger: event.target.checked })}
        />
        Stagger sends across chats (offset each chat by ~30s so identical
        messages don't all fire at once)
      </label>
    </section>
  )
}

function SchedulePreviewCard({ preview }: { preview: SchedulePreview }) {
  return (
    <div className="space-y-2 border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={engineTone(preview.engine)}>
          {engineLabel(preview.engine)}
        </Badge>
        {preview.fully_offline ? (
          <Badge tone="text-primary border-primary/30 bg-primary/10">
            Fully offline · {preview.total_messages} message(s) pre-scheduled
          </Badge>
        ) : null}
        <span className="text-muted-foreground">
          {preview.operations_per_fire} per fire
          {preview.fires_planned ? ` · ${preview.fires_planned} fire(s)` : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{preview.engine_reason}</p>
      {preview.upcoming.length ? (
        <p className="text-xs text-muted-foreground">
          First fires: {preview.upcoming.map((time) => humanTime(time)).join(" · ")}
        </p>
      ) : null}
      {preview.coverage_until ? (
        <p className="text-xs text-muted-foreground">
          Offline coverage through {humanTime(preview.coverage_until)}
          {preview.fully_offline ? "." : " (reopen to extend)."}
        </p>
      ) : null}
      {preview.warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ))}
    </div>
  )
}
