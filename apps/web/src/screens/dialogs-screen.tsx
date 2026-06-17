import { IconLoader2, IconMessageCircle, IconSearch } from "@tabler/icons-react"

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
import type { TelegramDialog } from "../types"
import type { DialogsScreenProps } from "./screen-props"

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
            disabled={loading}
            onClick={() =>
              guarded(async () => {
                const payload = await api<{
                  dialogs: TelegramDialog[]
                }>(`/api/accounts/${dialogAccountId}/dialogs/fetch?limit=500`, {
                  method: "POST",
                })
                setDialogs(payload.dialogs || [])
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
            onClick={() =>
              guarded(async () => {
                const payload = await api<{
                  dialogs: TelegramDialog[]
                }>(`/api/accounts/${dialogAccountId}/dialogs`)
                setDialogs(payload.dialogs || [])
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
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
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
            detail="Fetch, search, filter, and copy targets into Actions."
          />
          <div className="flex flex-wrap gap-2">
            {["all", "personal", "bot", "group", "channel"].map((filter) => (
              <Button
                key={filter}
                variant={dialogFilter === filter ? "default" : "outline"}
                onClick={() => setDialogFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            value={dialogSearch}
            onChange={(e) => setDialogSearch(e.target.value)}
            placeholder="Search dialogs"
          />
        </div>
        <TableWrap>
          <Table className="min-w-[46rem]">
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Dialog</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDialogs.map((dialog) => {
                const target = dialog.username
                  ? `@${dialog.username}`
                  : String(dialog.id)
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
                    <TableCell className="font-mono text-xs">
                      {target}
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredDialogs.length === 0 ? (
                <TableRow>
                  <TableCell className="p-0" colSpan={4}>
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
