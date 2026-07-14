import {
  IconKey,
  IconLock,
  IconMoon,
  IconPalette,
  IconShieldLock,
  IconSun,
  IconSunMoon,
} from "@tabler/icons-react"
import * as React from "react"

import { Button } from "../ui/button"

import { SafetyEditor } from "../components/safety-editor"
import {
  ACCENTS,
  useTheme,
  type Accent,
} from "../components/theme-provider"
import { Field, InfoHint, Input, Panel, StepHeading } from "../components/ui"
import { api } from "../lib/api"
import {
  ensureNotifyPermission,
  queueNotifyEnabled,
  setQueueNotifyEnabled,
} from "../lib/notify"
import type {
  ActivityEvent,
  AppSettings,
  Flash,
  SafetySettings,
} from "../types"

type SettingsTab = "api" | "appearance" | "safety" | "security"

type SettingsScreenProps = {
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  appSettings: AppSettings
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  apiConfigured: boolean
  configApiId: number | null
  configStatus: string
  guarded: (work: () => Promise<void>) => Promise<void>
  loading: boolean
  refresh: () => Promise<void>
  flash: Flash
  activity: ActivityEvent[]
}

const SETTINGS_NAV: Array<{
  id: SettingsTab
  label: string
  detail: string
  icon: React.ElementType
}> = [
  { id: "api", label: "API credentials", detail: "Telegram app ID & hash", icon: IconKey },
  { id: "appearance", label: "Appearance", detail: "Theme, accent, dialogs", icon: IconPalette },
  { id: "safety", label: "Safety defaults", detail: "Pacing & run bounds", icon: IconShieldLock },
  { id: "security", label: "Security", detail: "Optional app password", icon: IconLock },
]

// Settings is a two-column preferences surface: a left sub-nav card lists the
// sections, the right column renders the active one. Activity got promoted to a
// top-level screen, so it's no longer a tab here.
export function SettingsScreen(props: SettingsScreenProps) {
  const [tab, setTab] = React.useState<SettingsTab>("api")

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav className="lg:sticky lg:top-4 lg:self-start">
        <ul className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2 shadow-md lg:flex-col lg:overflow-visible">
          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <li key={item.id} className="min-w-max lg:min-w-0">
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                  className={[
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  ].filter(Boolean).join(" ")}
                >
                  <span
                    className={[
                      "grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-4",
                      active ? "bg-primary/10 text-primary-text" : "text-muted-foreground"
                    ].filter(Boolean).join(" ")}
                  >
                    <Icon />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    <span className="hidden truncate text-xs text-muted-foreground lg:block">
                      {item.detail}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="min-w-0">
        {tab === "api" ? <ApiPanel {...props} /> : null}
        {tab === "appearance" ? <AppearancePanel {...props} /> : null}
        {tab === "safety" ? <SafetyPanel {...props} /> : null}
        {tab === "security" ? <SecurityPanel {...props} /> : null}
      </div>
    </div>
  )
}

function ApiPanel({
  apiConfigured,
  configApiId,
  configStatus,
  guarded,
  loading,
  refresh,
  flash,
}: SettingsScreenProps) {
  const [showApiHash, setShowApiHash] = React.useState(false)

  async function saveApiSettings(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    await guarded(async () => {
      const form = new FormData(formElement)
      const apiId = String(form.get("api_id") || "").trim()
      const apiHash = String(form.get("api_hash") || "").trim()
      if (!apiId) return flash("API ID is required.")
      if (!apiConfigured && !apiHash) return flash("API hash is required.")
      await api("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_id: apiId, api_hash: apiHash }),
      })
      const hashInput = formElement.elements.namedItem("api_hash")
      if (hashInput instanceof HTMLInputElement) hashInput.value = ""
      setShowApiHash(false)
      flash("API settings saved locally.", "success")
      await refresh()
    })
  }

  return (
    <Panel className="max-w-2xl space-y-4">
      <StepHeading
        title="Telegram API"
        detail="Use your own API ID and API hash from my.telegram.org. The hash stays local and is not rendered back into the UI."
      />
      <form className="grid gap-3" onSubmit={saveApiSettings}>
        <Field
          label="API ID"
          hint="Your app's numeric API ID from my.telegram.org → API development tools. Paired with the API hash, it authorizes Telethon; the same ID is reused for every session on this machine."
        >
          <Input
            name="api_id"
            type="number"
            min={1}
            required
            autoComplete="off"
            placeholder="123456"
            defaultValue={configApiId || ""}
            key={configApiId || "empty"}
          />
        </Field>
        <Field
          label="API Hash"
          hint="The secret string paired with your API ID, also from my.telegram.org. It's stored locally and never rendered back into this screen. To rotate it, paste a new hash and save; leave it blank to keep the saved one."
        >
          <div className="flex gap-2">
            <Input
              name="api_hash"
              type={showApiHash ? "text" : "password"}
              required={!apiConfigured}
              maxLength={120}
              autoComplete="off"
              placeholder={
                apiConfigured
                  ? "Leave blank to keep saved hash"
                  : "Telegram API hash"
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowApiHash((current) => !current)}
            >
              {showApiHash ? "Hide" : "Show"}
            </Button>
          </div>
        </Field>
        <Button type="submit" size="comfortable" loading={loading}>
          Save API Settings
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">{configStatus}</p>
      {apiConfigured ? (
        <p className="text-xs leading-5 text-muted-foreground">
          To rotate the API hash, paste a new hash and save. Leaving it blank
          keeps the existing saved hash.
        </p>
      ) : null}
    </Panel>
  )
}

const ACCENT_META: Record<Accent, { label: string; detail: string; swatch: string }> = {
  coral: {
    label: "Coral",
    detail: "Sunset coral",
    swatch: "#ff5f5f",
  },
  teal: {
    label: "Teal",
    detail: "Dim teal signal",
    swatch: "#3FB8A6",
  },
  moonlight: {
    label: "Moonlight",
    detail: "Cool azure",
    swatch: "#5B9DFF",
  },
  amber: {
    label: "Amber",
    detail: "Warm gold",
    swatch: "#F5A524",
  },
  arctic: {
    label: "Arctic",
    detail: "Bright cyan",
    swatch: "#38BDF8",
  },
  emerald: {
    label: "Emerald",
    detail: "Refined green",
    swatch: "#34D399",
  },
}

const THEME_MODES: Array<{ id: "system" | "light" | "dark"; label: string; icon: React.ElementType }> = [
  { id: "system", label: "System", icon: IconSunMoon },
  { id: "light", label: "Light", icon: IconSun },
  { id: "dark", label: "Dark", icon: IconMoon },
]

function AppearancePanel({
  appSettings,
  setAppSettings,
  guarded,
  flash,
}: SettingsScreenProps) {
  const { theme, setTheme, accent, setAccent } = useTheme()

  // Persist the show-dialog-photos preference to the backend (it gates a server-
  // side download, unlike theme/accent which are browser-local). Optimistic: flip
  // the UI immediately, revert if the save fails.
  function setDialogPhotos(next: boolean) {
    const previous = appSettings
    const updated: AppSettings = { ...appSettings, show_dialog_photos: next }
    setAppSettings(updated)
    guarded(async () => {
      try {
        await api("/api/settings/app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        })
        flash(
          next
            ? "Dialog photos enabled. Re-fetch dialogs to download them."
            : "Dialog photos hidden.",
          "success"
        )
      } catch (error) {
        setAppSettings(previous)
        throw error
      }
    })
  }

  return (
    <Panel className="max-w-2xl space-y-5">
      <StepHeading
        title="Appearance"
        detail="Pick a light/dark mode and an accent palette. Your choice is saved in this browser and applies instantly."
      />

      <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-4">
        <span
          className="size-12 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: ACCENT_META[accent].swatch }}
        />
        <div className="space-y-0.5">
          <p className="font-mono text-sm font-medium text-foreground">
            {ACCENT_META[accent].label}
          </p>
          <p className="text-xs text-muted-foreground">
            {ACCENT_META[accent].detail} · accents every action, status, and focus
            ring.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="type-label text-muted-foreground">
          Mode
        </p>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {THEME_MODES.map((mode) => {
            const Icon = mode.icon
            const active = theme === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTheme(mode.id)}
                className={[
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors [&_svg]:size-4",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                ].filter(Boolean).join(" ")}
              >
                <Icon />
                {mode.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="type-label text-muted-foreground">
          Accent
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCENTS.map((option) => {
            const meta = ACCENT_META[option]
            const active = accent === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setAccent(option)}
                className={[
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted/30"
                ].filter(Boolean).join(" ")}
              >
                <span
                  className="size-6 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: meta.swatch }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {meta.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {meta.detail}
                  </span>
                </span>
                {active ? (
                  <span className="type-label text-primary-text">Active</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="type-label text-muted-foreground">Dialogs</p>
        <div className="flex items-start gap-3 rounded-md border border-border bg-background/70 p-3 text-sm">
          <label className="flex min-w-0 flex-1 items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={appSettings.show_dialog_photos}
              onChange={(event) => setDialogPhotos(event.target.checked)}
            />
            <span className="min-w-0 space-y-1">
              <span className="block font-medium text-foreground">
                Show dialog photos
              </span>
              <span className="block text-xs text-muted-foreground">
                Download each chat's real Telegram icon when fetching dialogs,
                instead of the generated initials disc.
              </span>
            </span>
          </label>
          <InfoHint label="About dialog photos" className="mt-0.5">
            When on, fetching an account's dialogs also downloads each chat's
            profile-photo thumbnail and caches it locally (under{" "}
            <code>data/avatars/</code>), so the first fetch takes a little longer.
            This is the global default — override it per account from the Accounts
            screen (Manage → Photos). Chats with no photo, or restricted ones, keep
            the generated initials disc.
          </InfoHint>
        </div>
      </div>

      <NotificationsToggle flash={flash} />
    </Panel>
  )
}

// Desktop-notification opt-in for queue completion. Browser-local (localStorage +
// the Notification API), so it isn't part of the server-side app settings.
function NotificationsToggle({ flash }: { flash: Flash }) {
  const [enabled, setEnabled] = React.useState(() => queueNotifyEnabled())

  async function toggle(next: boolean) {
    if (next) {
      const permission = await ensureNotifyPermission()
      if (permission !== "granted") {
        flash("Browser blocked notifications. Allow them, then try again.", "error")
        return
      }
    }
    setQueueNotifyEnabled(next)
    setEnabled(next)
    flash(next ? "Queue notifications on." : "Queue notifications off.", "success")
  }

  return (
    <div className="space-y-2">
      <p className="type-label text-muted-foreground">Notifications</p>
      <div className="flex items-start gap-3 rounded-md border border-border bg-background/70 p-3 text-sm">
        <label className="flex min-w-0 flex-1 items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={enabled}
            onChange={(event) => toggle(event.target.checked)}
          />
          <span className="min-w-0 space-y-1">
            <span className="block font-medium text-foreground">
              Notify when a queue finishes
            </span>
            <span className="block text-xs text-muted-foreground">
              Show a desktop notification on queue completion when this tab is in
              the background. Asks for browser permission the first time.
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}

function SafetyPanel({
  safety,
  setSafety,
  guarded,
  loading,
  flash,
}: SettingsScreenProps) {
  return (
    <Panel className="max-w-2xl space-y-4">
      <StepHeading
        title="Safety defaults"
        detail="Prefill new queues and bound every run. Cooldowns are action-aware — each action waits the delay for its risk tier, so benign reads run fast while spam-prone sends stay spaced."
      />
      <SafetyEditor safety={safety} setSafety={setSafety} />
      <Button
        size="comfortable"
        loading={loading}
        onClick={() =>
          guarded(async () => {
            await api("/api/settings/safety", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(safety),
            })
            flash("Safety defaults saved.", "success")
          })
        }
      >
        <IconShieldLock />
        Save Safety Defaults
      </Button>
    </Panel>
  )
}

function SecurityPanel({
  guarded,
  loading,
  flash,
}: SettingsScreenProps) {
  const [passwordEnabled, setPasswordEnabled] = React.useState(false)
  const [statusLoaded, setStatusLoaded] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [currentPassword, setCurrentPassword] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await api<{ password_enabled: boolean }>("/api/auth/status")
        if (!cancelled) {
          setPasswordEnabled(status.password_enabled)
          setStatusLoaded(true)
        }
      } catch (error) {
        if (!cancelled) {
          flash(error instanceof Error ? error.message : "Could not load auth status.", "error")
          setStatusLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [flash])

  async function savePassword(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    await guarded(async () => {
      if (!passwordEnabled) {
        if (!password.trim()) return flash("Enter a password to enable protection.")
        if (password !== confirm) return flash("Password and confirmation do not match.")
        await api("/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        })
        setPasswordEnabled(true)
        setPassword("")
        setConfirm("")
        flash("App password enabled. You will need it next time you open TeleManager.", "success")
        return
      }

      if (!currentPassword.trim()) return flash("Current password is required.")
      if (password && password !== confirm) {
        return flash("New password and confirmation do not match.")
      }
      await api("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          current_password: currentPassword,
        }),
      })
      const disabled = !password.trim()
      setPasswordEnabled(!disabled)
      setPassword("")
      setConfirm("")
      setCurrentPassword("")
      flash(
        disabled ? "App password disabled." : "App password updated.",
        "success"
      )
    })
  }

  async function logout() {
    await guarded(async () => {
      await api("/api/auth/logout", { method: "POST" })
      flash("Logged out. Unlock with the app password to continue.", "success")
      // Full reload so AppPasswordGate remounts and shows the lock screen.
      window.location.reload()
    })
  }

  return (
    <Panel className="max-w-2xl space-y-4">
      <StepHeading
        title="App password"
        detail="Optional protection for shared machines. When enabled, TeleManager asks for this password before loading the console. It is local-only — not a remote multi-user login."
      />
      <p className="text-sm text-muted-foreground">
        Status:{" "}
        <span className="font-medium text-foreground">
          {!statusLoaded ? "…" : passwordEnabled ? "Enabled" : "Disabled"}
        </span>
      </p>
      <form className="grid gap-3" onSubmit={savePassword}>
        {passwordEnabled ? (
          <Field
            label="Current password"
            hint="Required to change or disable the app password."
          >
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current app password"
            />
          </Field>
        ) : null}
        <Field
          label={passwordEnabled ? "New password" : "Password"}
          hint={
            passwordEnabled
              ? "Leave blank and save to disable password protection."
              : "Choose a password for this machine."
          }
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={passwordEnabled ? "Leave blank to disable" : "App password"}
          />
        </Field>
        <Field label="Confirm password">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Repeat password"
          />
        </Field>
        <Button type="submit" size="comfortable" loading={loading}>
          {passwordEnabled ? "Update password" : "Enable app password"}
        </Button>
      </form>
      {passwordEnabled ? (
        <Button type="button" variant="outline" loading={loading} onClick={logout}>
          Log out this browser
        </Button>
      ) : null}
    </Panel>
  )
}
