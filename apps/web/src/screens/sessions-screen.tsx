import * as React from "react"

import {
  IconDownload,
  IconFileImport,
  IconLoader2,
  IconUpload,
} from "@tabler/icons-react"

import { Button } from "../ui/button"

import {
  Badge,
  EmptyState,
  Field,
  Input,
  Panel,
  StepHeading,
} from "../components/ui"
import { api } from "../lib/api"
import { accountStatus, downloadBlob, statusTone } from "../lib/helpers"
import type { Account } from "../types"
import type { SessionsScreenProps } from "./screen-props"

export function SessionsScreen(props: SessionsScreenProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ImportPanel {...props} />
      <ExportPanel {...props} />
    </div>
  )
}

function ImportPanel({ guarded, refresh, flash, loading }: SessionsScreenProps) {
  const importFormRef = React.useRef<HTMLFormElement>(null)
  const [fileError, setFileError] = React.useState("")

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const formData = new FormData(formElement)
    const file = formData.get("file")
    if (!(file instanceof File) || !file.name) {
      setFileError("Choose a .session file to import.")
      return
    }
    if (!file.name.toLowerCase().endsWith(".session")) {
      setFileError("Only Telethon .session files can be imported.")
      return
    }
    setFileError("")
    guarded(async () => {
      await api("/api/sessions/import-file", { method: "POST", body: formData })
      importFormRef.current?.reset()
      flash("Session imported.")
      await refresh()
    })
  }

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={<IconFileImport />}
        title="Import .session file"
        detail="Copy an existing Telethon .session file into TeleManager and validate it locally."
      />
      <form ref={importFormRef} className="grid gap-3" onSubmit={handleSubmit}>
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
          <Input
            name="file"
            type="file"
            accept=".session"
            required
            aria-invalid={Boolean(fileError)}
            onChange={() => setFileError("")}
          />
          {fileError ? (
            <span className="text-xs text-destructive normal-case">
              {fileError}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground normal-case">
              Must be a Telethon .session file from this or another machine.
            </span>
          )}
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
  )
}

function ExportPanel({
  accounts,
  selectedIds,
  setSelectedIds,
  guarded,
  flash,
  loading,
  askDialog,
}: SessionsScreenProps) {
  const selectedCount = accounts.filter((account) =>
    selectedIds.has(account.id)
  ).length
  const allSelected = accounts.length > 0 && selectedCount === accounts.length

  function toggle(accountId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  return (
    <Panel className="space-y-4">
      <StepHeading
        step={<IconDownload />}
        title="Export selected sessions"
        detail="Pick the sessions to export as a private ZIP. Session files can access Telegram accounts — keep the export private."
        trailing={
          <Badge tone="border-border bg-muted/40 text-muted-foreground">
            {selectedCount} selected
          </Badge>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts to export"
          detail="Add or import a Telegram session first, then choose which sessions to export here."
          className="px-4 py-8"
        />
      ) : (
        <>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!accounts.length}
              onClick={() =>
                setSelectedIds(
                  allSelected
                    ? new Set()
                    : new Set(accounts.map((account) => account.id))
                )
              }
            >
              {allSelected ? "Clear all" : "Select all"}
            </Button>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {accounts.map((account) => (
              <ExportAccountRow
                key={account.id}
                account={account}
                selected={selectedIds.has(account.id)}
                onToggle={() => toggle(account.id)}
              />
            ))}
          </div>
        </>
      )}

      <Button
        disabled={loading || !selectedCount}
        onClick={() =>
          guarded(() => exportSessions(selectedIds, askDialog, flash))
        }
      >
        {loading ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : (
          <IconDownload />
        )}
        Export {selectedCount || ""} Session{selectedCount === 1 ? "" : "s"}
      </Button>
    </Panel>
  )
}

function ExportAccountRow({
  account,
  selected,
  onToggle,
}: {
  account: Account
  selected: boolean
  onToggle: () => void
}) {
  const status = accountStatus(account)
  return (
    <label
      className={`flex items-center gap-3 border p-3 text-sm transition-colors ${
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:bg-muted/20"
      }`}
    >
      <input
        type="checkbox"
        aria-label={`Export ${account.label || account.session_name}`}
        checked={selected}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {account.label || account.session_name}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {account.session_name}.session
        </span>
      </span>
      <Badge tone={statusTone(status)}>{status}</Badge>
    </label>
  )
}

async function exportSessions(
  selectedIds: Set<string>,
  askDialog: SessionsScreenProps["askDialog"],
  flash: SessionsScreenProps["flash"]
) {
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
}
