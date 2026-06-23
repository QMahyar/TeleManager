import {
  IconKey,
  IconMoon,
  IconPalette,
  IconShieldLock,
  IconSun,
  IconSunMoon,
  IconTimeline,
} from "@tabler/icons-react"
import * as React from "react"

import { Button } from "../ui/button"
import { cn } from "../ui/utils"

import { SafetyEditor } from "../components/safety-editor"
import {
  ACCENTS,
  useTheme,
  type Accent,
} from "../components/theme-provider"
import { Field, Input, Panel, StepHeading, Tabs } from "../components/ui"
import { api } from "../lib/api"
import type { ActivityEvent, Flash, SafetySettings } from "../types"
import { ActivityScreen } from "./activity-screen"

type SettingsTab = "api" | "appearance" | "safety" | "activity"

type SettingsScreenProps = {
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  apiConfigured: boolean
  configApiId: number | null
  configStatus: string
  guarded: (work: () => Promise<void>) => Promise<void>
  loading: boolean
  refresh: () => Promise<void>
  flash: Flash
  activity: ActivityEvent[]
}

export function SettingsScreen(props: SettingsScreenProps) {
  const [tab, setTab] = React.useState<SettingsTab>("api")

  return (
    <div className="space-y-4">
      <Tabs<SettingsTab>
        value={tab}
        onChange={setTab}
        items={[
          { id: "api", label: "API", icon: IconKey },
          { id: "appearance", label: "Appearance", icon: IconPalette },
          { id: "safety", label: "Safety", icon: IconShieldLock },
          {
            id: "activity",
            label: "Activity",
            icon: IconTimeline,
            badge: props.activity.length || undefined,
          },
        ]}
      />
      {tab === "api" ? <ApiPanel {...props} /> : null}
      {tab === "appearance" ? <AppearancePanel /> : null}
      {tab === "safety" ? <SafetyPanel {...props} /> : null}
      {tab === "activity" ? <ActivityScreen activity={props.activity} /> : null}
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
        <Field label="API ID">
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
        <Field label="API Hash">
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

function AppearancePanel() {
  const { theme, setTheme, accent, setAccent } = useTheme()

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
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
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
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors [&_svg]:size-4",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <Icon />
                {mode.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
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
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted/30"
                )}
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
                  <span className="text-[0.65rem] font-semibold tracking-[0.16em] text-primary uppercase">
                    Active
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </Panel>
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
        detail="These values prefill new queues and are enforced by the backend when a request omits values."
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
