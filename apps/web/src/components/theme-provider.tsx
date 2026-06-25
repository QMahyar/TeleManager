/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import { BEACON_VIEWBOX, beaconMarkup } from "../lib/beacon"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"
type Accent = "teal" | "moonlight" | "amber" | "arctic" | "emerald"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  defaultAccent?: Accent
  storageKey?: string
  accentStorageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  accent: Accent
  setAccent: (accent: Accent) => void
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: Theme[] = ["dark", "light", "system"]
const ACCENT_VALUES: Accent[] = ["teal", "moonlight", "amber", "arctic", "emerald"]
export const ACCENTS: Accent[] = ACCENT_VALUES
export type { Accent }

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false
  }

  return THEME_VALUES.includes(value as Theme)
}

function isAccent(value: string | null): value is Accent {
  if (value === null) {
    return false
  }

  return ACCENT_VALUES.includes(value as Accent)
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light"
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']")
  )
}

function applyDocumentTheme(
  theme: Theme,
  options: { disableTransitions: boolean }
) {
  const root = document.documentElement
  const resolvedTheme = theme === "system" ? getSystemTheme() : theme
  const restoreTransitions = options.disableTransitions
    ? disableTransitionsTemporarily()
    : null

  root.classList.remove("light", "dark")
  root.classList.add(resolvedTheme)

  restoreTransitions?.()
}

function applyDocumentAccent(accent: Accent) {
  document.documentElement.setAttribute("data-accent", accent)
}

function rotateTheme(currentTheme: Theme): Theme {
  if (currentTheme === "dark") {
    return "light"
  }
  if (currentTheme === "light") {
    return "dark"
  }
  return getSystemTheme() === "dark" ? "light" : "dark"
}

function useStoredTheme(defaultTheme: Theme, storageKey: string) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey)
    return isTheme(storedTheme) ? storedTheme : defaultTheme
  })

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  return { setTheme, setThemeState, theme }
}

function useStoredAccent(defaultAccent: Accent, storageKey: string) {
  const [accent, setAccentState] = React.useState<Accent>(() => {
    const storedAccent = localStorage.getItem(storageKey)
    return isAccent(storedAccent) ? storedAccent : defaultAccent
  })

  const setAccent = React.useCallback(
    (nextAccent: Accent) => {
      localStorage.setItem(storageKey, nextAccent)
      setAccentState(nextAccent)
    },
    [storageKey]
  )

  return { accent, setAccent }
}

function useAppliedAccent(accent: Accent) {
  React.useEffect(() => {
    applyDocumentAccent(accent)
  }, [accent])
}

function useAppliedTheme(
  theme: Theme,
  options: { disableTransitions: boolean }
) {
  React.useEffect(() => {
    applyDocumentTheme(theme, options)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyDocumentTheme("system", options)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [options, theme])
}

function useThemeHotkey(
  setThemeState: React.Dispatch<React.SetStateAction<Theme>>,
  storageKey: string
) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const hasModifier = event.metaKey || event.ctrlKey || event.altKey
      const shouldIgnoreKey =
        event.repeat ||
        hasModifier ||
        isEditableTarget(event.target) ||
        event.key.toLowerCase() !== "d"

      if (shouldIgnoreKey) {
        return
      }

      setThemeState((currentTheme) => {
        const nextTheme = rotateTheme(currentTheme)
        localStorage.setItem(storageKey, nextTheme)
        return nextTheme
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [setThemeState, storageKey])
}

function useThemeStorageSync(
  defaultTheme: Theme,
  setThemeState: React.Dispatch<React.SetStateAction<Theme>>,
  storageKey: string
) {
  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== storageKey) {
        return
      }

      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [defaultTheme, setThemeState, storageKey])
}

// --- Accent-aware favicon ---------------------------------------------------
// A favicon renders in the browser chrome, detached from our DOM/CSS, so it
// can't see `data-accent` or read `--primary` (and `currentColor` is black
// there). To track the active accent we resolve `--primary` to a concrete sRGB
// colour at runtime, redraw the beacon with it, and swap <link rel="icon"> to an
// inline data: SVG. <meta name="theme-color"> is kept in step for mobile chrome.

function resolvePrimaryColor(): string {
  // Read the resolved --primary off a probe element. Current Chrome preserves
  // the authored `oklch()` through getComputedStyle *and* a canvas fillStyle
  // round-trip, and embedding raw oklch() in an SVG favicon is Safari-only — so
  // rasterise a single pixel to force a concrete sRGB value the favicon can use.
  const probe = document.createElement("span")
  probe.style.cssText = "position:absolute;opacity:0;pointer-events:none"
  probe.style.color = "var(--primary)"
  document.body.appendChild(probe)
  const computed = window.getComputedStyle(probe).color
  probe.remove()

  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) return "#5fc6bb"
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

function applyFavicon(resolvedTheme: ResolvedTheme, primary: string) {
  const tile = resolvedTheme === "dark" ? "#1b1d21" : "#eeede9"
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BEACON_VIEWBOX}">` +
    `<rect width="24" height="24" rx="5.5" fill="${tile}"/>` +
    beaconMarkup(primary) +
    `</svg>`
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement("link")
    link.rel = "icon"
    document.head.appendChild(link)
  }
  link.type = "image/svg+xml"
  link.href = href

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement("meta")
    meta.name = "theme-color"
    document.head.appendChild(meta)
  }
  meta.content = tile
}

// Re-render the favicon whenever the theme or accent changes. Called after
// useAppliedTheme/useAppliedAccent so the .dark class + data-accent are already
// on <html> when we read --primary.
function useFaviconSync(theme: Theme, accent: Accent) {
  React.useEffect(() => {
    void accent // colour comes from the applied --primary, not used directly
    const resolved: ResolvedTheme =
      theme === "system" ? getSystemTheme() : theme
    applyFavicon(resolved, resolvePrimaryColor())
  }, [theme, accent])
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  defaultAccent = "teal",
  storageKey = "theme",
  accentStorageKey = "accent",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const { setTheme, setThemeState, theme } = useStoredTheme(
    defaultTheme,
    storageKey
  )
  const { accent, setAccent } = useStoredAccent(defaultAccent, accentStorageKey)

  useAppliedTheme(theme, {
    disableTransitions: disableTransitionOnChange,
  })
  useAppliedAccent(accent)
  useFaviconSync(theme, accent)
  useThemeHotkey(setThemeState, storageKey)
  useThemeStorageSync(defaultTheme, setThemeState, storageKey)

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
      accent,
      setAccent,
    }),
    [theme, setTheme, accent, setAccent]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
