import * as React from "react"

import {
  IconArrowRight,
  IconLoader2,
  IconMessageCircle,
  IconSearch,
} from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@workspace/ui/components/table"

import {
  Badge,
  Field,
  Input,
  Panel,
  SectionTitle,
  Select,
} from "../components/ui"
import { api } from "../lib/api"
import { humanTime } from "../lib/helpers"
import type { TelegramDialog } from "../types"
import type { DialogsScreenProps } from "./screen-props"

const FILTER_LABELS: Record<string, string> = {
  all: "All",
  personal: "Personal",
  bot: "Bot",
  group: "Group",
  channel: "Channel",
}

export function DialogsScreen(props: DialogsScreenProps) {
  const {
    accounts,
    setView,
    guarded,
    loading,
    refresh,
    flash,
    dialogAccountId,
    setDialogAccountId,
    setDialogs,
    dialogFilter,
    setDialogFilter,
    dialogSearch,
    setDialogSearch,
    selectedDialogTargets,
    setSelectedDialogTargets,
    filteredDialogs,
    setActionDraft,
    toggleSelected,
  } = props

  const [fetchStatus, setFetchStatus] = React.useState("")

  React.useEffect(() => {
    if (!dialogAccountId) return
    api<{ dialogs: TelegramDialog[]; fetched_at?: string | null }>(
      `/api/accounts/${dialogAccountId}/dialogs`
    )
      .then((payload) => {
        setDialogs(payload.dialogs || [])
        setFetchStatus(
          payload.fetched_at
            ? `Cached dialogs from ${humanTime(payload.fetched_at)}.`
            : ""
        )
      })
      .catch(() => {
        setDialogs([])
        setFetchStatus("")
      })
  }, [dialogAccountId, setDialogs])

  const allFilteredSelected =
    filteredDialogs.length > 0 &&
    filteredDialogs.every((dialog) => {
      const target = dialogTarget(dialog)
      return selectedDialogTargets.has(target)
    })

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedDialogTargets((current) => {
        const next = new Set(current)
        for (const dialog of filteredDialogs) {
          next.delete(dialogTarget(dialog))
        }
        return next
      })
    } else {
      setSelectedDialogTargets((current) => {
        const next = new Set(current)
        for (const dialog of filteredDialogs) {
          next.add(dialogTarget(dialog))
        }
        return next
      })
    }
  }

  function useTarget(target: string) {
    setActionDraft((current) => ({ ...current, target }))
    setView("actions")
    flash("Dialog target copied into Actions.")
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Panel className="space-y-4">
        <SectionTitle
          kicker="Discovery"
          title="Dialog Source"
          detail={`${selectedDialogTargets.size} selected`}
        />
        <Field label="Account">
          <Select
            value={dialogAccountId}
            onChange={(e) => setDialogAccountId(e.target.value)}
          >
            {accounts.length === 0 ? (
              <option value="">No accounts available</option>
            ) : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label || account.session_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-2">
          <Button
            className="w-full"
            disabled={loading || !dialogAccountId}
            onClick={() =>
              guarded(async () => {
                if (!dialogAccountId) {
                  flash("Choose an account first.")
                  return
                }
                const payload = await api<{
                  dialogs: TelegramDialog[]
                  fetched_at?: string
                }>(`/api/accounts/${dialogAccountId}/dialogs/fetch?limit=500`, {
                  method: "POST",
                })
                setDialogs(payload.dialogs || [])
                setFetchStatus(
                  payload.fetched_at
                    ? `Fetched ${(payload.dialogs || []).length} dialogs at ${humanTime(payload.fetched_at)}.`
                    : `Fetched ${(payload.dialogs || []).length} dialogs.`
                )
                flash(`Fetched ${(payload.dialogs || []).length} dialogs.`)
                await refresh()
              })
            }
          >
            {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
            Fetch Dialogs
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={!dialogAccountId}
            onClick={() =>
              guarded(async () => {
                if (!dialogAccountId) {
                  flash("Choose an account first.")
                  return
                }
                const payload = await api<{
                  dialogs: TelegramDialog[]
                  fetched_at?: string | null
                }>(`/api/accounts/${dialogAccountId}/dialogs`)
                setDialogs(payload.dialogs || [])
                const statusMessage = payload.fetched_at
                  ? `Cached dialogs from ${humanTime(payload.fetched_at)}.`
                  : "No cached dialogs for this account yet."
                setFetchStatus(payload.fetched_at ? statusMessage : "")
                flash(
                  payload.dialogs?.length
                    ? `Loaded ${payload.dialogs.length} cached dialogs.`
                    : "No cached dialogs for this account yet."
                )
              })
            }
          >
            Load Cached Dialogs
          </Button>
        </div>
        {fetchStatus ? (
          <p className="text-xs text-muted-foreground">{fetchStatus}</p>
        ) : null}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            if (!selectedDialogTargets.size) {
              flash("Select one or more dialogs first.")
              return
            }
            setActionDraft((current) => ({
              ...current,
              target: [...selectedDialogTargets].join("\n"),
            }))
            setView("actions")
          }}
        >
          Use Selected In Actions
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setSelectedDialogTargets(new Set())}
        >
          Clear Selection
        </Button>
      </Panel>
      <Panel className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <SectionTitle
            kicker="Targets"
            title="Dialogs"
            detail={`${filteredDialogs.length} shown · ${selectedDialogTargets.size} selected`}
          />
          <div className="flex flex-wrap gap-2">
            {Object.entries(FILTER_LABELS).map(([value, label]) => (
              <Button
                key={value}
                variant={dialogFilter === value ? "default" : "outline"}
                onClick={() => setDialogFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            type="search"
            autoComplete="off"
            value={dialogSearch}
            onChange={(e) => setDialogSearch(e.target.value)}
            placeholder="Search dialogs"
          />
        </div>
        <TableWrap>
          <Table className="min-w-[58rem]">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Dialog</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Unread</TableHead>
                <TableHead>Target</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDialogs.map((dialog) => {
                const target = dialogTarget(dialog)
                return (
                  <TableRow key={String(dialog.id)}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedDialogTargets.has(target)}
                        onChange={() =>
                          toggleSelected(target, setSelectedDialogTargets)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {dialog.title}
                    </TableCell>
                    <TableCell>
                      <Badge tone="border-border bg-muted/40 text-muted-foreground">
                        {dialog.dialog_type ||
                          dialog.kind ||
                          dialog.type ||
                          "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {dialog.username ? `@${dialog.username}` : ""}
                    </TableCell>
                    <TableCell>{dialog.unread_count || 0}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {target}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => useTarget(target)}
                      >
                        <IconArrowRight className="size-3" />
                        Use
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredDialogs.length === 0 ? (
                <TableRow>
                  <TableCell className="p-0" colSpan={7}>
                    <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
                      <IconMessageCircle className="size-8 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          No dialogs
                        </p>
                        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                          Select an account above and click Fetch Dialogs to
                          load your chats, groups, and channels.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableWrap>
      </Panel>
    </div>
  )
}

function dialogTarget(dialog: TelegramDialog) {
  return dialog.username ? `@${dialog.username}` : String(dialog.id)
}
