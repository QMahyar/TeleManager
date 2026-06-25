// Themed empty-state illustrations. Line-art in `currentColor` so they inherit
// the muted tone of the EmptyState wrapper and the active accent where used.
// Each leans on the beacon/signal motif so empties feel part of the same system
// rather than generic clip-art.

const BASE = "size-14"

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={BASE}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

// Empty queue — stacked rows with a faint signal core, nothing armed yet.
export function EmptyQueueArt() {
  return (
    <Frame>
      <rect x="12" y="16" width="40" height="8" rx="2" opacity="0.5" />
      <rect x="12" y="30" width="40" height="8" rx="2" opacity="0.3" />
      <rect x="12" y="44" width="26" height="8" rx="2" opacity="0.2" />
      <circle cx="46" cy="48" r="6" className="text-primary" />
      <circle cx="46" cy="48" r="2" className="text-primary" fill="currentColor" stroke="none" />
    </Frame>
  )
}

// No runs yet — a play token over a quiet timeline.
export function EmptyHistoryArt() {
  return (
    <Frame>
      <circle cx="32" cy="32" r="18" opacity="0.4" />
      <path d="M27 24 L42 32 L27 40 Z" className="text-primary" fill="currentColor" stroke="none" />
      <path d="M8 32 H14 M50 32 H56" opacity="0.3" />
    </Frame>
  )
}

// No schedules — concentric signal rings around a clock hand.
export function EmptySchedulesArt() {
  return (
    <Frame>
      <circle cx="32" cy="34" r="14" className="text-primary" />
      <path d="M32 27 V34 L37 38" className="text-primary" />
      <path d="M18 18 A 20 20 0 0 1 46 18" opacity="0.3" />
    </Frame>
  )
}

// No dialogs — overlapping chat bubbles with a signal dot.
export function EmptyDialogsArt() {
  return (
    <Frame>
      <path d="M14 18 H40 A4 4 0 0 1 44 22 V34 A4 4 0 0 1 40 38 H24 L16 45 V38 H14 A4 4 0 0 1 10 34 V22 A4 4 0 0 1 14 18 Z" opacity="0.45" />
      <circle cx="46" cy="44" r="7" className="text-primary" />
      <circle cx="46" cy="44" r="2.5" className="text-primary" fill="currentColor" stroke="none" />
    </Frame>
  )
}
