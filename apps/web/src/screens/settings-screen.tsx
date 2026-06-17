import { IconShieldLock } from "@tabler/icons-react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"

import { SafetyEditor } from "../components/safety-editor"
import { Field, Input, Panel, SectionTitle } from "../components/ui"
import { api } from "../lib/api"
import type { SafetySettings } from "../types"

export function SettingsScreen({
  safety,
  setSafety,
  apiConfigured,
  configApiId,
  configStatus,
  guarded,
  loading,
  refresh,
  flash,
}: {
  safety: SafetySettings
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>
  apiConfigured: boolean
  configApiId: number | null
  configStatus: string
  guarded: (work: () => Promise<void>) => Promise<void>
  loading: boolean
  refresh: () => Promise<void>
  flash: (message: string) => void
}) {
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
      flash("API settings saved locally.")
      await refresh()
    })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Credentials"
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
          <Button type="submit" loading={loading}>
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
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Guardrails"
          title="Safety Defaults"
          detail="These values prefill new queues and are enforced by the backend when a request omits values."
        />
        <SafetyEditor safety={safety} setSafety={setSafety} />
        <Button
          loading={loading}
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
          <IconShieldLock />
          Save Safety Defaults
        </Button>
      </Panel>
    </div>
  )
}
