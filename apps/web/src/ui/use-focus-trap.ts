import * as React from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Keeps keyboard focus inside `ref` while `active`, focuses the first control on
// open, and restores focus to wherever it was when the trap releases. Returns a
// ref to spread onto the dialog container.
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    if (!active) return undefined
    const node = ref.current
    if (!node) return undefined

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Only steal focus if it isn't already inside (e.g. an autoFocus input).
    if (!node.contains(document.activeElement)) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE)
      window.setTimeout(() => (first ?? node).focus(), 0)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const focusables = [
        ...node.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!focusables.length) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeEl = document.activeElement
      if (event.shiftKey && activeEl === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    }

    node.addEventListener("keydown", onKeyDown)
    return () => {
      node.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [active])

  return ref
}
