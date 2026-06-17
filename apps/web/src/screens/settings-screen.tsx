import { IconLoader2, IconShieldLock } from "@tabler/icons-react"
import type * as React from "react"

import { Button } from "@workspace/ui/components/button"

import { SafetyEditor } from "../components/safety-editor"
import { Field, Input, Panel, SectionTitle } from "../components/ui"
import { api } from "../lib/api"
import type { SafetySettings } from "../types"

export function SettingsScreen({
  safety,
  setSafety,
  configStatus,
  guarded,
  loading,
  refresh,
  flash,
}: {
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  configStatus: string
  guarded: (work: () => Promise<void>) => Promise<void>
  loading: boolean
  refresh: () => Promise<void>
  flash: (message: string) => void
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Credentials"
          title="Telegram API"
          detail="Use your own API ID and API hash from my.telegram.org. The hash stays local and is not rendered back into the UI."
        />
        <form
          className="grid gap-3"
          onSubmit={(event) =>
            guarded(async () => {
              event.preventDefault()
              await api("/api/config", {
                method: "POST",
                body: new FormData(event.currentTarget),
              })
              flash("API settings saved.")
              await refresh()
            })
          }
        >
          <Field label="API ID">
            <Input
              name="api_id"
              type="number"
              min={1}
              required
              placeholder="123456"
            />
          </Field>
          <Field label="API Hash">
            <Input
              name="api_hash"
              type="password"
              required
              placeholder="Telegram API hash"
            />
          </Field>
          <Button disabled={loading}>
            {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
            Save API Settings
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">{configStatus}</p>
      </Panel>
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Guardrails"
          title="Safety Defaults"
          detail="These values prefill new queues and are enforced by the backend when a request omits values."
        />
        <SafetyEditor safety={safety} setSafety={setSafety} />
        <Button
          disabled={loading}
          onClick={() =>
            guarded(async () => {
              await api("/api/settings/safety", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(safety),
              })
              flash("Safety defaults saved.")
            })
          }
        >
          {loading ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconShieldLock />
          )}
          Save Safety Defaults
        </Button>
      </Panel>
    </div>
  )
}
