import * as React from "react"

// Bespoke domain glyphs for TeleManager — a few custom marks that give the app
// its own iconography for concepts a generic set doesn't capture (a *session*, a
// *dialog stream*, a *run queue*). Drawn to Tabler's spec (24×24, 2px centred
// stroke, round caps/joins, `currentColor`) so they sit in the same family as
// the Tabler icons used elsewhere and theme identically via `text-*`.
//
// They accept the same props as a Tabler icon (notably `className`), so they
// drop into existing call-sites unchanged: <IconRunQueue className="size-4" />.

type GlyphProps = React.SVGProps<SVGSVGElement>

function Glyph({ children, ...props }: React.PropsWithChildren<GlyphProps>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

// Accounts — a session tile stacked behind another, with a status dot: "a fleet
// of sessions, each with a live state." Reuses Tabler's stacked-card idiom.
export function IconSessionStack(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8 V6 a2 2 0 0 0 -2 -2 H6 a2 2 0 0 0 -2 2 v8 a2 2 0 0 0 2 2 h2" />
      <circle cx="11.5" cy="14" r="1.35" fill="currentColor" stroke="none" />
    </Glyph>
  )
}

// Dialogs — Tabler's message-bubble outline, but with two "nodes" instead of
// text lines, tying the chat list into the app's dot/signal language.
export function IconChatNodes(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" />
      <circle cx="9" cy="11" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="11" r="1.15" fill="currentColor" stroke="none" />
    </Glyph>
  )
}

// Actions — a short queue of steps feeding a play head: "queue, then run." The
// exact mental model of the Actions screen (build a guarded queue, execute it).
export function IconRunQueue(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7.5 h6.5" />
      <path d="M4 12 h6.5" />
      <path d="M4 16.5 h4" />
      <path d="M14 7.5 l6.5 4.5 l-6.5 4.5 z" />
    </Glyph>
  )
}
