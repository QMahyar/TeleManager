import { IconDownload, IconUpload } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { Field, Input, Panel, SectionTitle } from "../components/ui"
import { api } from "../lib/api"
import type { SessionsScreenProps } from "./screen-props"

export function SessionsScreen(props: SessionsScreenProps) {
  const { selectedIds, guarded, refresh, flash } = props

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Import"
          title="Import .session File"
          detail="Copy an existing Telethon .session file into TeleManager and validate it locally."
        />
        <form
          className="grid gap-3"
          onSubmit={(event) =>
            guarded(async () => {
              event.preventDefault()
              await api("/api/sessions/import-file", {
                method: "POST",
                body: new FormData(event.currentTarget),
              })
              flash("Session imported.")
              await refresh()
            })
          }
        >
          <Field label="Label">
            <Input name="label" required placeholder="Imported account" />
          </Field>
          <Field label="Session file">
            <Input name="file" type="file" accept=".session" required />
          </Field>
          <Button>
            <IconUpload /> Import Session
          </Button>
        </form>
      </Panel>
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Export"
          title="Export Selected Sessions"
          detail="Exports selected .session files as a ZIP. Keep the export private."
        />
        <Button
          onClick={() =>
            guarded(async () => {
              const response = await fetch("/api/sessions/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  account_ids: [...selectedIds],
                  redact_phone: true,
                }),
              })
              if (!response.ok) throw new Error("Export failed")
              const blob = await response.blob()
              const url = URL.createObjectURL(blob)
              const link = document.createElement("a")
              link.href = url
              link.download = "telemanager-sessions.zip"
              link.click()
              URL.revokeObjectURL(url)
            })
          }
        >
          <IconDownload /> Export Selected Sessions
        </Button>
      </Panel>
    </div>
  )
}
