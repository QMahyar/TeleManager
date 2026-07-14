import * as React from "react"

import { IconSearch } from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { ModalShell } from "../../ui/modal"
import {
  Badge,
  EmptyState,
  ErrorState,
  Input,
  SectionLoader,
} from "../../components/ui"
import { humanTime } from "../../lib/helpers"
import { api } from "../../lib/api"
import type { MessageSearchHit } from "../../types"

// Global message search for one account: a thin wrapper over Telegram's
// searchGlobal (backend GET …/messages/search). Each hit is labelled with the
// chat it came from, since the search spans every dialog.
export function DialogSearchModal({
  open,
  accountId,
  accountLabel,
  onClose,
}: {
  open: boolean
  accountId: string
  accountLabel: string
  onClose: () => void
}) {
  const [query, setQuery] = React.useState("")
  const [hits, setHits] = React.useState<MessageSearchHit[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault()
    const q = query.trim()
    if (!q || !accountId) return
    setLoading(true)
    setError(null)
    try {
      const payload = await api<{ messages: MessageSearchHit[] }>(
        `/api/accounts/${accountId}/messages/search?q=${encodeURIComponent(q)}&limit=50`
      )
      setHits(payload.messages || [])
    } catch (err) {
      setHits(null)
      setError(err instanceof Error ? err.message : "Search failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="xl"
      kicker="Message search"
      title={`Search ${accountLabel}`}
      description="Searches this account's message history across every dialog (Telegram global search)."
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <form className="flex gap-2" onSubmit={runSearch}>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search message text…"
        />
        <Button type="submit" loading={loading} disabled={!query.trim()}>
          Search
        </Button>
      </form>

      <div className="mt-4">
        {loading ? (
          <SectionLoader label="Searching…" />
        ) : error ? (
          <ErrorState
            title="Search failed"
            detail={error}
            onRetry={() => runSearch()}
          />
        ) : hits === null ? (
          <EmptyState
            icon={IconSearch}
            title="Search message history"
            detail="Type a phrase and search. Results show the chat each message came from."
          />
        ) : hits.length === 0 ? (
          <EmptyState
            icon={IconSearch}
            title="No matches"
            detail="No messages matched that search in this account's history."
          />
        ) : (
          <div className="space-y-2">
            {hits.map((hit) => (
              <div
                key={`${hit.chat_id}:${hit.id}`}
                className="rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="border-primary/30 bg-primary/10 text-primary-text">
                    {hit.chat_username ? `@${hit.chat_username}` : hit.chat_title}
                  </Badge>
                  {hit.out ? (
                    <Badge tone="border-border bg-muted/40 text-muted-foreground">
                      outgoing
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {hit.date ? humanTime(hit.date) : ""}
                  </span>
                </div>
                <p className="mt-2 max-h-24 overflow-auto text-sm whitespace-pre-wrap">
                  {hit.text || (hit.has_media ? "[media]" : "No text")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
