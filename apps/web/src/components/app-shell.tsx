import * as React from "react"

import {
  IconCommand,
  IconMenu2,
  IconMoon,
  IconPower,
  IconRefresh,
  IconSearch,
  IconSun,
  IconX,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
import { cn } from "../ui/utils"

import { useTheme } from "../components/theme-provider"
import { navItems } from "../lib/constants"
import type { View } from "../types"
import { Badge, Input } from "./ui"

type AppShellProps = React.PropsWithChildren<{
  view: View
  selectedCount: number
  setView: (view: View) => void
  onRefresh: () => void
  onExit: () => void
}>

type NavItem = (typeof navItems)[number]

type CommandPaletteState = {
  clampedIndex: number
  filteredItems: NavItem[]
  paletteOpen: boolean
  paletteQuery: string
  closePalette: () => void
  openPalette: () => void
  movePalette: (direction: -1 | 1) => void
  submitPaletteSelection: () => void
  setPaletteIndex: React.Dispatch<React.SetStateAction<number>>
  setPaletteQuery: React.Dispatch<React.SetStateAction<string>>
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  )
}

function groupedNavItems(group: string) {
  return navItems.filter((item) => item.group === group)
}

function shortcutNavItem(key: string) {
  const index = Number(key)
  return navItems[index - 1]
}

function handlePaletteToggleKey(
  event: KeyboardEvent,
  options: {
    isOpen: boolean
    closePalette: () => void
    openPalette: () => void
  }
) {
  if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
    return false
  }
  event.preventDefault()
  if (options.isOpen) {
    options.closePalette()
  } else {
    options.openPalette()
  }
  return true
}

function handlePaletteNavigationKey(
  event: KeyboardEvent,
  options: {
    isOpen: boolean
    hasItems: boolean
    movePalette: (direction: -1 | 1) => void
    submitPaletteSelection: () => void
  }
) {
  if (!options.isOpen || !options.hasItems) {
    return false
  }

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault()
      options.movePalette(1)
      return true
    case "ArrowUp":
      event.preventDefault()
      options.movePalette(-1)
      return true
    case "Enter":
      event.preventDefault()
      options.submitPaletteSelection()
      return true
    default:
      return false
  }
}

function handleAltNavigationKey(
  event: KeyboardEvent,
  openView: (view: View) => void
) {
  if (!event.altKey) {
    return false
  }

  const item = shortcutNavItem(event.key)
  if (!item) {
    return false
  }

  event.preventDefault()
  openView(item.id)
  return true
}

function usePaletteState(openView: (view: View) => void): CommandPaletteState {
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteQuery, setPaletteQuery] = React.useState("")
  const [paletteIndex, setPaletteIndex] = React.useState(0)

  const closePalette = React.useCallback(() => {
    setPaletteOpen(false)
    setPaletteQuery("")
    setPaletteIndex(0)
  }, [])

  const openPalette = React.useCallback(() => {
    setPaletteOpen(true)
    setPaletteIndex(0)
  }, [])

  const filteredItems = React.useMemo(() => {
    const query = paletteQuery.trim().toLowerCase()
    if (!query) {
      return navItems
    }
    return navItems.filter((item) =>
      `${item.label} ${item.group}`.toLowerCase().includes(query)
    )
  }, [paletteQuery])

  const clampedIndex = Math.min(
    paletteIndex,
    Math.max(filteredItems.length - 1, 0)
  )

  const movePalette = React.useCallback(
    (direction: -1 | 1) => {
      setPaletteIndex((current) =>
        Math.max(0, Math.min(current + direction, filteredItems.length - 1))
      )
    },
    [filteredItems.length]
  )

  const submitPaletteSelection = React.useCallback(() => {
    const item = filteredItems[clampedIndex]
    if (item) {
      openView(item.id)
    }
  }, [clampedIndex, filteredItems, openView])

  return {
    clampedIndex,
    filteredItems,
    paletteOpen,
    paletteQuery,
    closePalette,
    openPalette,
    movePalette,
    submitPaletteSelection,
    setPaletteIndex,
    setPaletteQuery,
  }
}

function usePaletteHotkeys(
  palette: CommandPaletteState,
  openView: (view: View) => void
) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return
      }
      if (event.key === "Escape") {
        palette.closePalette()
        return
      }
      if (
        handlePaletteToggleKey(event, {
          isOpen: palette.paletteOpen,
          closePalette: palette.closePalette,
          openPalette: palette.openPalette,
        })
      ) {
        return
      }
      if (
        handlePaletteNavigationKey(event, {
          isOpen: palette.paletteOpen,
          hasItems: palette.filteredItems.length > 0,
          movePalette: palette.movePalette,
          submitPaletteSelection: palette.submitPaletteSelection,
        })
      ) {
        return
      }
      handleAltNavigationKey(event, openView)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openView, palette])
}

export function AppShell({
  view,
  selectedCount,
  setView,
  onRefresh,
  onExit,
  children,
}: AppShellProps) {
  const { theme, setTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const activeItem = navItems.find((item) => item.id === view)

  const openView = React.useCallback(
    (nextView: View) => {
      setView(nextView)
      setSidebarOpen(false)
    },
    [setView]
  )

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [setTheme, theme])

  const palette = usePaletteState(openView)
  usePaletteHotkeys(palette, openView)

  return (
    <div className="min-h-svh bg-background text-foreground">
      {sidebarOpen ? (
        <button
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="grid min-h-svh lg:grid-cols-[18rem_1fr]">
        <Sidebar
          onExit={onExit}
          onRefresh={onRefresh}
          onToggleTheme={toggleTheme}
          openView={openView}
          sidebarOpen={sidebarOpen}
          theme={theme}
          view={view}
          closeSidebar={() => setSidebarOpen(false)}
        />

        <main className="min-w-0 p-4 sm:p-6 xl:p-8">
          <Header
            activeItem={activeItem}
            selectedCount={selectedCount}
            openAccounts={() => openView("accounts")}
            openSettings={() => openView("settings")}
            openSidebar={() => setSidebarOpen(true)}
            openPalette={palette.openPalette}
          />
          {children}
        </main>
      </div>
      <CommandPalette
        clampedIndex={palette.clampedIndex}
        filteredItems={palette.filteredItems}
        open={palette.paletteOpen}
        openView={openView}
        paletteQuery={palette.paletteQuery}
        closePalette={palette.closePalette}
        setPaletteIndex={palette.setPaletteIndex}
        setPaletteQuery={palette.setPaletteQuery}
      />
    </div>
  )
}

function Sidebar({
  onExit,
  onRefresh,
  onToggleTheme,
  openView,
  sidebarOpen,
  theme,
  view,
  closeSidebar,
}: {
  onExit: () => void
  onRefresh: () => void
  onToggleTheme: () => void
  openView: (view: View) => void
  sidebarOpen: boolean
  theme: "dark" | "light" | "system"
  view: View
  closeSidebar: () => void
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-sidebar p-4 text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-auto lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <button
        onClick={closeSidebar}
        className="absolute top-4 right-4 grid size-8 place-items-center border border-sidebar-border lg:hidden"
        aria-label="Close navigation"
      >
        <IconX className="size-4" />
      </button>
      <button
        onClick={() => openView("command")}
        className="mb-8 flex items-center gap-3 text-left"
      >
        <span className="grid size-10 place-items-center border border-sidebar-border bg-sidebar-accent font-heading text-lg text-sidebar-accent-foreground">
          TM
        </span>
        <span>
          <strong className="block text-sm">TeleManager</strong>
          <small className="text-xs text-muted-foreground">
            Local session ops
          </small>
        </span>
      </button>
      <nav className="space-y-5">
        {["Workspace", "Management", "System"].map((group) => (
          <SidebarGroup
            key={group}
            group={group}
            openView={openView}
            view={view}
          />
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        <Badge tone="border-primary/30 bg-primary/10 text-primary">
          127.0.0.1 only
        </Badge>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button variant="outline" className="w-full" onClick={onRefresh}>
            <IconRefresh /> Refresh
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </Button>
        </div>
        <Button variant="destructive" className="w-full" onClick={onExit}>
          <IconPower /> Exit TeleManager
        </Button>
      </div>
    </aside>
  )
}

function SidebarGroup({
  group,
  openView,
  view,
}: {
  group: string
  openView: (view: View) => void
  view: View
}) {
  return (
    <div className="space-y-1">
      <p className="px-2 text-[0.62rem] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
        {group}
      </p>
      {groupedNavItems(group).map((item) => (
        <SidebarItem
          key={item.id}
          item={item}
          openView={openView}
          view={view}
        />
      ))}
    </div>
  )
}

function SidebarItem({
  item,
  openView,
  view,
}: {
  item: NavItem
  openView: (view: View) => void
  view: View
}) {
  const Icon = item.icon
  const shortcut = navItems.findIndex((nav) => nav.id === item.id) + 1

  return (
    <button
      onClick={() => openView(item.id)}
      className={cn(
        "flex w-full items-center gap-2 border px-3 py-2 text-left text-sm transition",
        view === item.id
          ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground"
          : "border-transparent hover:border-sidebar-border hover:bg-sidebar-accent"
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1">{item.label}</span>
      <kbd className="text-[0.6rem] opacity-60">Alt+{shortcut}</kbd>
    </button>
  )
}

function Header({
  activeItem,
  selectedCount,
  openAccounts,
  openSettings,
  openSidebar,
  openPalette,
}: {
  activeItem?: NavItem
  selectedCount: number
  openAccounts: () => void
  openSettings: () => void
  openSidebar: () => void
  openPalette: () => void
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 border border-border bg-card p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <Button
          variant="outline"
          size="icon"
          className="mt-1 lg:hidden"
          onClick={openSidebar}
          aria-label="Open navigation"
        >
          <IconMenu2 />
        </Button>
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-primary uppercase">
            {activeItem?.group || "Workspace"}
          </p>
          <h1 className="font-heading text-2xl tracking-tight sm:text-3xl xl:text-4xl">
            {activeItem?.label}
          </h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden sm:block">
          <Badge tone="border-border bg-muted/40 text-muted-foreground">
            {selectedCount} selected
          </Badge>
        </span>
        <Button
          variant="outline"
          className="hidden sm:inline-flex"
          onClick={openPalette}
        >
          <IconCommand /> Ctrl+K
        </Button>
        <Button variant="outline" onClick={openSettings}>
          Settings
        </Button>
        <Button onClick={openAccounts}>Add Account</Button>
      </div>
    </header>
  )
}

function CommandPalette({
  clampedIndex,
  filteredItems,
  open,
  openView,
  paletteQuery,
  closePalette,
  setPaletteIndex,
  setPaletteQuery,
}: {
  clampedIndex: number
  filteredItems: NavItem[]
  open: boolean
  openView: (view: View) => void
  paletteQuery: string
  closePalette: () => void
  setPaletteIndex: React.Dispatch<React.SetStateAction<number>>
  setPaletteQuery: React.Dispatch<React.SetStateAction<string>>
}) {
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start bg-background/80 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closePalette()
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="mx-auto w-full max-w-xl border border-border bg-card p-3 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
          <strong id="command-palette-title" className="text-sm">
            Command palette
          </strong>
          <Button variant="ghost" size="icon-sm" onClick={closePalette}>
            <IconX />
          </Button>
        </div>
        <div className="relative mb-3">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            value={paletteQuery}
            onChange={(event) => {
              setPaletteQuery(event.target.value)
              setPaletteIndex(0)
            }}
            placeholder="Search screens"
            aria-label="Search command palette"
          />
        </div>
        <div className="space-y-1">
          {filteredItems.length ? (
            filteredItems.map((item, filteredIndex) => (
              <PaletteItem
                key={item.id}
                item={item}
                active={filteredIndex === clampedIndex}
                openView={openView}
              />
            ))
          ) : (
            <div className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No screens match that search.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function PaletteItem({
  item,
  active,
  openView,
}: {
  item: NavItem
  active: boolean
  openView: (view: View) => void
}) {
  const Icon = item.icon
  const index = navItems.findIndex((nav) => nav.id === item.id)

  return (
    <button
      onClick={() => openView(item.id)}
      className={cn(
        "flex w-full items-center gap-3 border px-3 py-2 text-left text-sm",
        active
          ? "border-border bg-muted/40"
          : "border-transparent hover:border-border hover:bg-muted/40"
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1">{item.label}</span>
      <kbd className="text-xs text-muted-foreground">Alt+{index + 1}</kbd>
    </button>
  )
}
