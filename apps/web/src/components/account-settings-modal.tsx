import * as React from "react"

import {
  IconAddressBook,
  IconBan,
  IconDeviceDesktop,
  IconTrash,
  IconUser,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"

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
      {tab === "blocked" ? <BlockedTab account={account} /> : null}
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
      hint="Telegram automatically deletes this account if you don't come online within this period."
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
        can't be ended here — use Logout on the account row.
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
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-primary">
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

function BlockedTab({ account }: { account: Account }) {
  const query = useQuery({
    queryKey: ["account-blocked", account.id],
    queryFn: () => api<{ blocked: ContactUser[] }>(`/api/accounts/${account.id}/blocked`),
  })

  if (query.isLoading) return <SectionLoader label="Loading blocked users…" />
  if (query.error) return <Callout tone="danger">{msg(query.error, "Could not load blocked users.")}</Callout>

  const blocked = query.data?.blocked ?? []
  if (blocked.length === 0) {
    return <EmptyState icon={IconBan} title="No blocked users" detail="This account hasn't blocked anyone." />
  }
  return (
    <div className="space-y-1.5">
      <Callout tone="info">
        Unblock a user from the Actions screen (block / unblock action).
        {blocked.length >= 100 ? " Showing the first 100 blocked users." : ""}
      </Callout>
      {blocked.map((u) => (
        <div
          key={u.id ?? u.username}
          className="rounded-lg border border-border bg-surface-well/30 px-3 py-2 text-xs"
        >
          <ContactIdentity user={u} />
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
