import * as React from "react"

import {
  IconCommand,
  IconMenu2,
  IconMoon,
  IconRefresh,
  IconSearch,
  IconSun,
  IconX,
} from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useTheme } from "../components/theme-provider"
import { navItems } from "../lib/constants"
import type { View } from "../types"
import { Badge, Input } from "./ui"

type AppShellProps = React.PropsWithChildren<{
  view: View
  selectedCount: number
  setView: (view: View) => void
  onRefresh: () => void
}>

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  )
}

export function AppShell({
  view,
  selectedCount,
  setView,
  onRefresh,
  children,
}: AppShellProps) {
  const { theme, setTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteQuery, setPaletteQuery] = React.useState("")
  const activeItem = navItems.find((item) => item.id === view)

  const openView = React.useCallback(
    (nextView: View) => {
      setView(nextView)
      setSidebarOpen(false)
      setPaletteOpen(false)
      setPaletteQuery("")
    },
    [setView]
  )

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [setTheme, theme])

  const filteredPaletteItems = React.useMemo(() => {
    const query = paletteQuery.trim().toLowerCase()
    if (!query) return navItems
    return navItems.filter((item) =>
      `${item.label} ${item.group}`.toLowerCase().includes(query)
    )
  }, [paletteQuery])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return
      if (event.key === "Escape") {
        setPaletteOpen(false)
        setPaletteQuery("")
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((current) => !current)
        if (paletteOpen) setPaletteQuery("")
        return
      }
      if (event.altKey) {
        const index = Number(event.key)
        const item = navItems[index - 1]
        if (item) {
          event.preventDefault()
          openView(item.id)
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openView, paletteOpen])

  const sidebar = (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-sidebar p-4 text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-auto lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <button
        onClick={() => setSidebarOpen(false)}
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
          <div key={group} className="space-y-1">
            <p className="px-2 text-[0.62rem] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
              {group}
            </p>
            {navItems
              .filter((item) => item.group === group)
              .map((item, index) => {
                const Icon = item.icon
                const shortcut =
                  navItems.findIndex((nav) => nav.id === item.id) + 1
                return (
                  <button
                    key={item.id}
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
                    <kbd className="text-[0.6rem] opacity-60">
                      Alt+{shortcut || index + 1}
                    </kbd>
                  </button>
                )
              })}
          </div>
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
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </Button>
        </div>
      </div>
    </aside>
  )

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
        {sidebar}

        <main className="min-w-0 p-4 sm:p-6 xl:p-8">
          <header className="mb-6 flex flex-col gap-4 border border-border bg-card p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <Button
                variant="outline"
                size="icon"
                className="mt-1 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
              >
                <IconMenu2 />
              </Button>
              <div>
                <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-primary uppercase">
                  {activeItem?.group || "Workspace"}
                </p>
                <h1 className="font-heading text-4xl tracking-tight">
                  {activeItem?.label}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="border-border bg-muted/40 text-muted-foreground">
                {selectedCount} selected
              </Badge>
              <Button variant="outline" onClick={() => setPaletteOpen(true)}>
                <IconCommand /> Ctrl+K
              </Button>
              <Button variant="outline" onClick={() => openView("settings")}>
                Settings
              </Button>
              <Button onClick={() => openView("accounts")}>Add Account</Button>
            </div>
          </header>

          {children}
        </main>
      </div>
      {paletteOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-start bg-background/80 p-4 pt-[10vh] backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false)
          }}
        >
          <section className="mx-auto w-full max-w-xl border border-border bg-card p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
              <strong className="text-sm">Command palette</strong>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setPaletteOpen(false)
                  setPaletteQuery("")
                }}
              >
                <IconX />
              </Button>
            </div>
            <div className="relative mb-3">
              <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Search screens"
                aria-label="Search command palette"
              />
            </div>
            <div className="space-y-1">
              {filteredPaletteItems.length ? (
                filteredPaletteItems.map((item) => {
                  const Icon = item.icon
                  const index = navItems.findIndex((nav) => nav.id === item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => openView(item.id)}
                      className="flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left text-sm hover:border-border hover:bg-muted/40"
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{item.label}</span>
                      <kbd className="text-xs text-muted-foreground">
                        Alt+{index + 1}
                      </kbd>
                    </button>
                  )
                })
              ) : (
                <div className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No screens match that search.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
