import * as React from "react"

import { IconDownload, IconLoader2, IconUpload } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { EmptyState, Field, Input, Panel, SectionTitle } from "../components/ui"
import { api } from "../lib/api"
import { downloadBlob } from "../lib/helpers"
import type { SessionsScreenProps } from "./screen-props"

export function SessionsScreen(props: SessionsScreenProps) {
  const { accounts, selectedIds, guarded, refresh, flash, loading, askDialog } =
    props
  const importFormRef = React.useRef<HTMLFormElement>(null)
  const selectedAccounts = accounts.filter((account) =>
    selectedIds.has(account.id)
  )

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Import"
          title="Import .session File"
          detail="Copy an existing Telethon .session file into TeleManager and validate it locally."
        />
        <form
          ref={importFormRef}
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const formData = new FormData(event.currentTarget)
            guarded(async () => {
              await api("/api/sessions/import-file", {
                method: "POST",
                body: formData,
              })
              importFormRef.current?.reset()
              flash("Session imported.")
              await refresh()
            })
          }}
        >
          <Field label="Label">
            <Input
              name="label"
              required
              maxLength={120}
              autoComplete="nickname"
              placeholder="Imported account"
            />
          </Field>
          <Field label="Session file">
            <Input name="file" type="file" accept=".session" required />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconUpload />
            )}
            Import Session
          </Button>
        </form>
      </Panel>
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Export"
          title="Export Selected Sessions"
          detail="Exports selected .session files as a ZIP. Keep the export private."
        />
        {selectedAccounts.length ? (
          <div className="space-y-2 border border-border bg-background/60 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <strong>{selectedAccounts.length} session(s) selected</strong>
              <span className="text-xs text-muted-foreground">
                Ready to export
              </span>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {selectedAccounts.slice(0, 5).map((account) => (
                <p key={account.id}>
                  {account.label || account.session_name} ·{" "}
                  {account.session_name}.session
                </p>
              ))}
              {selectedAccounts.length > 5 ? (
                <p>+{selectedAccounts.length - 5} more selected session(s)</p>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No sessions selected"
            detail="Select one or more sessions from the dashboard or accounts inventory before exporting them here."
            className="border-0 bg-transparent px-4 py-8"
          />
        )}
        <Button
          disabled={loading}
          onClick={() =>
            guarded(async () => {
              if (!selectedIds.size) {
                flash("Select at least one session.")
                return
              }
              const confirmed = await askDialog({
                title: "Export session credentials?",
                description:
                  "Exported session files can access Telegram accounts. Keep the ZIP private and do not upload it anywhere.",
                confirmLabel: "Export ZIP",
                danger: true,
              })
              if (!confirmed) return
              const response = await fetch("/api/sessions/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  account_ids: [...selectedIds],
                  redact_phone: true,
                }),
              })
              if (!response.ok) {
                try {
                  const payload = (await response.json()) as { detail?: string }
                  throw new Error(payload.detail || "Export failed")
                } catch {
                  throw new Error("Export failed")
                }
              }
              const blob = await response.blob()
              downloadBlob(blob, "telemanager-sessions.zip")
              flash("Session export created.")
            })
          }
        >
          {loading ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconDownload />
          )}
          Export Selected Sessions
        </Button>
      </Panel>
    </div>
  )
}
