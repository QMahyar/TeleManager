import * as React from "react"

import {
  IconDownload,
  IconLoader2,
  IconUpload,
  IconX,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { Badge, EmptyState, Panel, StepHeading } from "../../components/ui"
import { api } from "../../lib/api"
import { accountStatus, downloadBlob, statusTone } from "../../lib/helpers"
import type { Account } from "../../types"
import type { AccountsScreenProps } from "../screen-props"

export function TransferTab({ props }: { props: AccountsScreenProps }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ImportPanel
        guarded={props.guarded}
        refresh={props.refresh}
        flash={props.flash}
        loading={props.loading}
      />
      <ExportPanel
        accounts={props.accounts}
        selectedIds={props.selectedIds}
        setSelectedIds={props.setSelectedIds}
        guarded={props.guarded}
        flash={props.flash}
        loading={props.loading}
        askDialog={props.askDialog}
      />
    </div>
  )
}

type TransferPanelProps = Pick<
  AccountsScreenProps,
  "guarded" | "refresh" | "flash" | "loading"
>

// Build a specific "X is not a .session file" message, naming up to three files
// so the operator can see exactly which drops were ignored (the rest roll up
// into "and N more").
function describeRejectedFiles(rejected: File[]) {
  const names = rejected.map((file) => file.name)
  if (names.length === 1) {
    return `${names[0]} is not a .session file — skipped.`
  }
  const shown = names.slice(0, 3).join(", ")
  const extra = names.length > 3 ? ` and ${names.length - 3} more` : ""
  return `Skipped ${names.length} non-.session files: ${shown}${extra}.`
}

function ImportPanel({ guarded, refresh, flash, loading }: TransferPanelProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [error, setError] = React.useState("")
  const [dragging, setDragging] = React.useState(false)

  // Accept only .session files; de-dupe by name+size so picking + dropping the
  // same file twice doesn't import it twice.
  function addFiles(incoming: FileList | null) {
    if (!incoming || !incoming.length) return
    const all = [...incoming]
    const sessionFiles = all.filter((file) =>
      file.name.toLowerCase().endsWith(".session")
    )
    // Name the skipped file(s) and why, so the operator knows exactly what was
    // dropped by mistake rather than a faceless "Skipped N files".
    const rejected = all.filter(
      (file) => !file.name.toLowerCase().endsWith(".session")
    )
    setError(rejected.length ? describeRejectedFiles(rejected) : "")
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`))
      const merged = [...current]
      for (const file of sessionFiles) {
        const key = `${file.name}:${file.size}`
        if (!seen.has(key)) {
          merged.push(file)
          seen.add(key)
        }
      }
      return merged
    })
  }

  function clearFiles() {
    setFiles([])
    setError("")
    if (inputRef.current) inputRef.current.value = ""
  }

  function importAll() {
    if (!files.length) {
      setError("Choose one or more .session files to import.")
      return
    }
    guarded(async () => {
      const formData = new FormData()
      for (const file of files) formData.append("files", file)
      const result = await api<{
        imported: Account[]
        failed: Array<{ filename: string; error: string }>
      }>("/api/sessions/import-files", { method: "POST", body: formData })
      clearFiles()
      const okCount = result.imported.length
      const failCount = result.failed.length
      flash(
        failCount
          ? `Imported ${okCount} session(s); ${failCount} could not be read.`
          : `Imported ${okCount} session(s) — named from Telegram.`,
        failCount ? "error" : "success"
      )
      await refresh()
    })
  }

  return (
    <Panel className="space-y-4">
      <StepHeading
        title="Import .session files"
        detail="Drop or pick one or more Telethon .session files. Each is validated and auto-named to its Telegram account — no labels to type."
      />
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        <IconUpload className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="text-muted-foreground">Drag .session files here, or</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".session"
          multiple
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>
      {error ? (
        <p className="text-xs text-destructive normal-case">{error}</p>
      ) : null}
      {files.length ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{files.length} file(s) ready</span>
            <button
              type="button"
              className="rounded-sm underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              onClick={clearFiles}
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-auto">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-xs"
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono"
                  title={file.name}
                >
                  {file.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 rounded-sm opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((_, i) => i !== index)
                    )
                  }
                >
                  <IconX className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <Button
        size="comfortable"
        disabled={loading || !files.length}
        onClick={importAll}
      >
        {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconUpload />}
        Import {files.length || ""} Session{files.length === 1 ? "" : "s"}
      </Button>
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
}: Pick<
  AccountsScreenProps,
  | "accounts"
  | "selectedIds"
  | "setSelectedIds"
  | "guarded"
  | "flash"
  | "loading"
  | "askDialog"
>) {
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
        size="comfortable"
        disabled={loading || !selectedCount}
        onClick={() => guarded(() => exportSessions(selectedIds, askDialog, flash))}
      >
        {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconDownload />}
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
      className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
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
  askDialog: AccountsScreenProps["askDialog"],
  flash: AccountsScreenProps["flash"]
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
    body: JSON.stringify({ account_ids: [...selectedIds], redact_phone: true }),
  })
  if (!response.ok) {
    // Parse the server's detail without a try whose catch would swallow the throw
    // (the old shape always lost the real message and showed a generic error).
    const detail = await response
      .json()
      .then((payload: { detail?: string }) => payload?.detail)
      .catch(() => null)
    throw new Error(detail || "Export failed")
  }
  const blob = await response.blob()
  downloadBlob(blob, "telemanager-sessions.zip")
  flash("Session export created.", "success")
}
