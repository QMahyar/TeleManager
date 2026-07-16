import * as React from "react"

import {
  IconAddressBook,
  IconBan,
  IconCheck,
  IconDeviceDesktop,
  IconLoader2,
  IconTrash,
  IconUser,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "../ui/button"
import { ModalShell } from "../ui/modal"

import { api, toForm } from "../lib/api"
import type { Account, Flash } from "../types"
import { Avatar } from "./avatar"
import {
  Callout,
  EmptyState,
  Field,
  Input,
  SectionLoader,
  Select,
  Tabs,
  Textarea,
  type TabItem,
} from "./ui"

type TabId = "profile" | "sessions" | "contacts" | "blocked"

type ProfileForm = { first_name: string; last_name: string; about: string; username: string }

type ContactUser = {
  id: number | null
  username: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  bot: boolean
}

type SessionInfo = {
  hash: string
  current: boolean
  device_model: string | null
  platform: string | null
  system_version: string | null
  app_name: string | null
  app_version: string | null
  ip: string | null
  country: string | null
  date_active: string | null
}

const TABS: TabItem<TabId>[] = [
  { id: "profile", label: "Profile", icon: IconUser },
  { id: "sessions", label: "Sessions", icon: IconDeviceDesktop },
  { id: "contacts", label: "Contacts", icon: IconAddressBook },
  { id: "blocked", label: "Blocked", icon: IconBan },
]

const msg = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function AccountSettingsModal({
  account,
  open,
  onClose,
  flash,
}: {
  account: Account
  open: boolean
  onClose: () => void
  flash: Flash
}) {
  const [tab, setTab] = React.useState<TabId>("profile")
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="lg"
      kicker="Account settings"
      title={account.label || account.session_name}
      description="Changes apply directly to this Telegram account."
    >
      <Tabs items={TABS} value={tab} onChange={setTab} className="mb-4" />
      {tab === "profile" ? <ProfileTab account={account} flash={flash} /> : null}
      {tab === "sessions" ? <SessionsTab account={account} flash={flash} /> : null}
      {tab === "contacts" ? <ContactsTab account={account} flash={flash} /> : null}
      {tab === "blocked" ? <BlockedTab account={account} flash={flash} /> : null}
    </ModalShell>
  )
}

// --- Profile -------------------------------------------------------------

function ProfileTab({ account, flash }: { account: Account; flash: Flash }) {
  const query = useQuery({
    queryKey: ["account-profile", account.id],
    queryFn: () => api<Record<keyof ProfileForm, string | null>>(`/api/accounts/${account.id}/profile`),
  })
  // Edits are an overlay on the fetched baseline, so we never seed form state
  // from an effect (avoids the set-state-in-effect / ref-in-render lint rules).
  const [edits, setEdits] = React.useState<Partial<ProfileForm>>({})
  const [saving, setSaving] = React.useState(false)

  if (query.isLoading) return <SectionLoader label="Loading profile…" />
  if (query.error) return <Callout tone="danger">{msg(query.error, "Could not load profile.")}</Callout>

  const saved: ProfileForm = {
    first_name: query.data?.first_name ?? "",
    last_name: query.data?.last_name ?? "",
    about: query.data?.about ?? "",
    username: query.data?.username ?? "",
  }
  const value = (key: keyof ProfileForm) => edits[key] ?? saved[key]
  const changed = (key: keyof ProfileForm) => edits[key] !== undefined && edits[key] !== saved[key]
  const dirty = (Object.keys(saved) as (keyof ProfileForm)[]).some(changed)

  async function save() {
    setSaving(true)
    try {
      if (changed("first_name") || changed("last_name") || changed("about")) {
        await api(`/api/accounts/${account.id}/profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: value("first_name"),
            last_name: value("last_name"),
            about: value("about"),
          }),
        })
      }
      if (changed("username")) {
        await api(`/api/accounts/${account.id}/username`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: value("username") }),
        })
      }
      await query.refetch()
      setEdits({})
      flash("Profile updated.", "success")
    } catch (err) {
      flash(msg(err, "Update failed."), "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <ProfilePhoto account={account} flash={flash} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="profile-first">
          <Input
            id="profile-first"
            value={value("first_name")}
            maxLength={64}
            onChange={(e) => setEdits((s) => ({ ...s, first_name: e.target.value }))}
          />
        </Field>
        <Field label="Last name" htmlFor="profile-last">
          <Input
            id="profile-last"
            value={value("last_name")}
            maxLength={64}
            onChange={(e) => setEdits((s) => ({ ...s, last_name: e.target.value }))}
          />
        </Field>
      </div>
      <Field label="Bio" htmlFor="profile-bio">
        <Textarea
          id="profile-bio"
          value={value("about")}
          maxLength={140}
          rows={2}
          onChange={(e) => setEdits((s) => ({ ...s, about: e.target.value }))}
        />
      </Field>
      <Field
        label="Username"
        htmlFor="profile-username"
        hint="Public @username. Leave empty to remove it. 5–32 characters, letters/digits/underscore, starting with a letter."
      >
        <Input
          id="profile-username"
          value={value("username")}
          placeholder="username"
          maxLength={32}
          onChange={(e) => setEdits((s) => ({ ...s, username: e.target.value }))}
        />
      </Field>
      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <div className="border-t border-border pt-4">
        <AccountTtl account={account} flash={flash} />
      </div>
      <div className="border-t border-border pt-4">
        <FleetApply account={account} saved={saved} flash={flash} />
      </div>
    </div>
  )
}

function ProfilePhoto({ account, flash }: { account: Account; flash: Flash }) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  async function run(work: () => Promise<unknown>, ok: string, fail: string) {
    setBusy(true)
    try {
      await work()
      flash(ok, "success")
    } catch (err) {
      flash(msg(err, fail), "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar name={account.label || account.session_name} size={48} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file)
            void run(
              () => api(`/api/accounts/${account.id}/photo`, { method: "POST", body: toForm({ file }) }),
              "Profile photo updated.",
              "Could not update photo."
            )
        }}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
        Change photo
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void run(
            () => api(`/api/accounts/${account.id}/photo`, { method: "DELETE" }),
            "Profile photo removed.",
            "Could not remove photo."
          )
        }
      >
        Remove
      </Button>
    </div>
  )
}

const TTL_OPTIONS: { days: number; label: string }[] = [
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
]

function AccountTtl({ account, flash }: { account: Account; flash: Flash }) {
  const query = useQuery({
    queryKey: ["account-ttl", account.id],
    queryFn: () => api<{ days: number | null }>(`/api/accounts/${account.id}/ttl`),
  })
  const [busy, setBusy] = React.useState(false)

  async function change(days: number) {
    setBusy(true)
    try {
      await api(`/api/accounts/${account.id}/ttl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      })
      flash("Self-destruct period updated.", "success")
      await query.refetch()
    } catch (err) {
      flash(msg(err, "Could not update self-destruct period."), "error")
    } finally {
      setBusy(false)
    }
  }

  const current = query.data?.days ?? 365
  // Telegram may hold a non-standard value set elsewhere; show it so we never
  // silently misrepresent the current setting.
  const options = TTL_OPTIONS.some((o) => o.days === current)
    ? TTL_OPTIONS
    : [{ days: current, label: `${current} days` }, ...TTL_OPTIONS]

  return (
    <Field
      label="Delete account if away for"
      htmlFor="account-ttl"
      hint="Telegram automatically deletes this account if you don’t come online within this period."
    >
      <Select
        id="account-ttl"
        value={String(current)}
        disabled={busy || query.isLoading}
        onChange={(e) => void change(Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o.days} value={o.days}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

// --- Fleet Apply ----------------------------------------------------------

type FleetField = "first_name" | "last_name" | "about"

const FLEET_FIELD_LABELS: Record<FleetField, string> = {
  first_name: "First name",
  last_name: "Last name",
  about: "Bio",
}

type FleetResult = { account_id: string; label: string; ok: boolean; error?: string }

function FleetApply({
  account,
  saved,
  flash,
}: {
  account: Account
  saved: ProfileForm
  flash: Flash
}) {
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ accounts: Account[] }>("/api/accounts"),
  })
  const [open, setOpen] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [selectedFields, setSelectedFields] = React.useState<Set<FleetField>>(new Set(["first_name", "last_name", "about"]))
  const [running, setRunning] = React.useState(false)
  const [results, setResults] = React.useState<FleetResult[] | null>(null)

  const otherAccounts = (accountsQuery.data?.accounts ?? []).filter(
    (a) => a.id !== account.id && a.authorized && !a.last_error,
  )

  function toggleAccount(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleField(field: FleetField) {
    setSelectedFields((prev) => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  async function apply() {
    if (selectedIds.size === 0 || selectedFields.size === 0) return
    setRunning(true)
    setResults(null)
    const fleetResults: FleetResult[] = []
    const payload: Record<string, string> = {}
    for (const field of selectedFields) {
      payload[field] = saved[field] ?? ""
    }
    for (const id of selectedIds) {
      const acct = otherAccounts.find((a) => a.id === id)
      const label = acct?.label || acct?.session_name || id
      try {
        await api(`/api/accounts/${id}/profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        fleetResults.push({ account_id: id, label, ok: true })
      } catch (err) {
        fleetResults.push({ account_id: id, label, ok: false, error: msg(err, "Failed") })
      }
    }
    setResults(fleetResults)
    setRunning(false)
    const okCount = fleetResults.filter((r) => r.ok).length
    const failCount = fleetResults.length - okCount
    if (failCount === 0) {
      flash(`Applied to ${okCount} account${okCount === 1 ? "" : "s"}.`, "success")
    } else {
      flash(`Applied: ${okCount} ok, ${failCount} failed.`, "error")
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Apply to fleet</p>
          <p className="text-xs text-muted-foreground">Copy safe profile fields to other accounts.</p>
        </div>
        <Button size="sm" variant="outline" disabled={otherAccounts.length === 0} onClick={() => setOpen(true)}>
          Apply to fleet
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Apply to fleet</p>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setResults(null) }}>
          Close
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Copy profile fields from this account to other ready accounts. Username and photo are excluded.
      </p>
      {accountsQuery.isLoading ? (
        <SectionLoader label="Loading accounts…" />
      ) : otherAccounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No other ready accounts available.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Target accounts</p>
            {otherAccounts.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-well/30 px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => toggleAccount(a.id)}
                  disabled={running}
                  className="size-3.5 rounded border-border accent-primary"
                />
                <span className="truncate font-medium text-foreground">{a.label || a.session_name}</span>
                {a.username ? <span className="text-muted-foreground">@{a.username}</span> : null}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Fields to apply</p>
            {(["first_name", "last_name", "about"] as FleetField[]).map((field) => (
              <label
                key={field}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-well/30 px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedFields.has(field)}
                  onChange={() => toggleField(field)}
                  disabled={running}
                  className="size-3.5 rounded border-border accent-primary"
                />
                <span className="font-medium text-foreground">{FLEET_FIELD_LABELS[field]}</span>
                <span className="text-muted-foreground">"{saved[field] || ""}"</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              size="comfortable"
              disabled={running || selectedIds.size === 0 || selectedFields.size === 0}
              onClick={() => void apply()}
            >
              {running ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
              {running ? "Applying…" : `Apply to ${selectedIds.size} account${selectedIds.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
      {results ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Results</p>
          {results.map((r) => (
            <div
              key={r.account_id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-well/30 px-3 py-1.5 text-xs"
            >
              {r.ok ? (
                <IconCheck className="size-3.5 shrink-0 text-primary-text" />
              ) : (
                <IconBan className="size-3.5 shrink-0 text-destructive" />
              )}
              <span className="truncate font-medium text-foreground">{r.label}</span>
              {r.error ? <span className="text-muted-foreground">{r.error}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// --- Sessions ------------------------------------------------------------

function SessionsTab({ account, flash }: { account: Account; flash: Flash }) {
  const query = useQuery({
    queryKey: ["account-sessions", account.id],
    queryFn: () => api<{ sessions: SessionInfo[] }>(`/api/accounts/${account.id}/sessions`),
  })
  const [busy, setBusy] = React.useState(false)

  async function act(work: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await work()
      flash(ok, "success")
      await query.refetch()
    } catch (err) {
      flash(msg(err, "Action failed."), "error")
    } finally {
      setBusy(false)
    }
  }

  if (query.isLoading) return <SectionLoader label="Loading sessions…" />
  if (query.error) return <Callout tone="danger">{msg(query.error, "Could not load sessions.")}</Callout>

  const sessions = query.data?.sessions ?? []
  const hasOthers = sessions.some((s) => !s.current)

  return (
    <div className="space-y-3">
      <Callout tone="warning" icon={IconDeviceDesktop} title="Active logins for this account">
        Ending a session signs that device out immediately. The current session
        can’t be ended here — use Logout on the account row.
      </Callout>
      {hasOthers ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() =>
              act(
                () => api(`/api/accounts/${account.id}/sessions/terminate-others`, { method: "POST" }),
                "All other sessions terminated."
              )
            }
          >
            Terminate all others
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        {sessions.map((s) => (
          <div
            key={s.hash}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-well/30 p-3"
          >
            <div className="min-w-0 space-y-0.5 text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                {s.device_model || s.app_name || "Unknown device"}
                {s.current ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-primary-text">
                    current
                  </span>
                ) : null}
              </div>
              <div className="text-muted-foreground">
                {[s.app_name, s.app_version].filter(Boolean).join(" ")} ·{" "}
                {[s.platform, s.system_version].filter(Boolean).join(" ")}
              </div>
              <div className="font-mono text-[0.65rem] text-muted-foreground">
                {[s.ip, s.country].filter(Boolean).join(" · ")}
                {s.date_active ? ` · active ${formatDate(s.date_active)}` : ""}
              </div>
            </div>
            {!s.current ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      api(`/api/accounts/${account.id}/sessions/terminate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ hash: s.hash }),
                      }),
                    "Session terminated."
                  )
                }
              >
                Terminate
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Contacts ------------------------------------------------------------

function ContactsTab({ account, flash }: { account: Account; flash: Flash }) {
  const query = useQuery({
    queryKey: ["account-contacts", account.id],
    queryFn: () => api<{ contacts: ContactUser[] }>(`/api/accounts/${account.id}/contacts`),
  })
  const [identifier, setIdentifier] = React.useState("")
  const [firstName, setFirstName] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function add() {
    setBusy(true)
    try {
      await api(`/api/accounts/${account.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, first_name: firstName }),
      })
      flash("Contact added.", "success")
      setIdentifier("")
      setFirstName("")
      await query.refetch()
    } catch (err) {
      flash(msg(err, "Could not add contact."), "error")
    } finally {
      setBusy(false)
    }
  }

  async function remove(user: ContactUser) {
    const target = user.username || (user.id != null ? String(user.id) : "")
    if (!target) return
    setBusy(true)
    try {
      await api(`/api/accounts/${account.id}/contacts?identifier=${encodeURIComponent(target)}`, {
        method: "DELETE",
      })
      flash("Contact removed.", "success")
      await query.refetch()
    } catch (err) {
      flash(msg(err, "Could not remove contact."), "error")
    } finally {
      setBusy(false)
    }
  }

  const contacts = query.data?.contacts ?? []

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Username / phone / ID" htmlFor="contact-id">
          <Input
            id="contact-id"
            value={identifier}
            placeholder="@username"
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </Field>
        <Field label="First name" htmlFor="contact-name">
          <Input id="contact-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Button onClick={add} disabled={busy || !identifier.trim() || !firstName.trim()}>
          Add
        </Button>
      </div>
      {query.isLoading ? (
        <SectionLoader label="Loading contacts…" />
      ) : query.error ? (
        <Callout tone="danger">{msg(query.error, "Could not load contacts.")}</Callout>
      ) : contacts.length === 0 ? (
        <EmptyState icon={IconAddressBook} title="No contacts" detail="This account has no saved contacts." />
      ) : (
        <div className="space-y-1.5">
          {contacts.map((u) => (
            <div
              key={u.id ?? u.username}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-well/30 px-3 py-2 text-xs"
            >
              <ContactIdentity user={u} />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label="Remove contact"
                onClick={() => remove(u)}
              >
                <IconTrash className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Blocked -------------------------------------------------------------

function BlockedTab({ account, flash }: { account: Account; flash: Flash }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ["account-blocked", account.id],
    queryFn: () => api<{ blocked: ContactUser[] }>(`/api/accounts/${account.id}/blocked`),
  })
  const unblockMutation = useMutation({
    mutationFn: (userId: number) =>
      api(`/api/accounts/${account.id}/blocked/unblock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account-blocked", account.id] })
      flash("User unblocked.", "success")
    },
    onError: (err: unknown) => flash(msg(err, "Could not unblock user."), "error"),
  })

  if (query.isLoading) return <SectionLoader label="Loading blocked users…" />
  if (query.error) return <Callout tone="danger">{msg(query.error, "Could not load blocked users.")}</Callout>

  const blocked = query.data?.blocked ?? []
  if (blocked.length === 0) {
    return <EmptyState icon={IconBan} title="No blocked users" detail="This account hasn't blocked anyone." />
  }
  return (
    <div className="space-y-1.5">
      {blocked.length >= 100 ? (
        <Callout tone="info">Showing the first 100 blocked users.</Callout>
      ) : null}
      {blocked.map((u) => (
        <div
          key={u.id ?? u.username}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-well/30 px-3 py-2 text-xs"
        >
          <ContactIdentity user={u} />
          <Button
            size="sm"
            variant="outline"
            disabled={unblockMutation.isPending || u.id == null}
            onClick={() => u.id != null && unblockMutation.mutate(u.id)}
          >
            Unblock
          </Button>
        </div>
      ))}
    </div>
  )
}

// --- shared --------------------------------------------------------------

function ContactIdentity({ user }: { user: ContactUser }) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Unknown"
  const sub = user.username ? `@${user.username}` : user.phone || (user.id != null ? `id ${user.id}` : "")
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">{name}</div>
      <div className="truncate font-mono text-[0.65rem] text-muted-foreground">{sub}</div>
    </div>
  )
}

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString()
}
