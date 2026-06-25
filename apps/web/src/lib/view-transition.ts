import { flushSync } from "react-dom"

// Run a state update inside a View Transition so the screen crossfades. The API
// snapshots the whole page before/after and crossfades them, so regions that are
// unchanged (sidebar, header) show no motion — only the changed main content
// animates, with zero scoping work. Falls back to an instant update where the
// API is unavailable or the user prefers reduced motion.
//
// The update must run synchronously (flushSync) so React commits the new DOM
// inside the transition's capture window.
export function withViewTransition(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => unknown
  }
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches

  if (prefersReduced || typeof doc.startViewTransition !== "function") {
    update()
    return
  }

  doc.startViewTransition(() => {
    flushSync(update)
  })
}
