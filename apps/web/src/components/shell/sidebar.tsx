import {
  IconInfoCircle,
  IconMoon,
  IconPower,
  IconRefresh,
  IconSun,
  IconX,
} from "@tabler/icons-react"

import { Button } from "../../ui/button"
import { cn } from "../../ui/utils"
import { BrandMark } from "../brand-mark"
import { Badge } from "../ui"
import { navItems } from "../../lib/constants"
import type { View } from "../../types"
import type { NavItem, ShellMetrics } from "./types"

function groupedNavItems(group: string) {
  return navItems.filter((item) => item.group === group)
}

export function Sidebar({
  accounts,
  metrics,
  onExit,
  onRefresh,
  onToggleTheme,
  openView,
  sidebarOpen,
  theme,
  view,
  closeSidebar,
}: {
  accounts: unknown[]
  metrics: ShellMetrics
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
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-sidebar p-4 text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-auto lg:translate-x-0 lg:overflow-auto",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <button
        onClick={closeSidebar}
        className="absolute top-4 right-4 grid size-8 place-items-center rounded-md border border-sidebar-border lg:hidden"
        aria-label="Close navigation"
      >
        <IconX className="size-4" />
      </button>
      <button
        onClick={() => openView("accounts")}
        className="mb-6 flex items-center gap-3 text-left"
      >
        <BrandMark size={40} />
        <span className="font-mono">
          <strong className="block text-sm font-semibold tracking-tight lowercase">
            telemanager
          </strong>
          <small className="text-[0.7rem] tracking-wide text-muted-foreground">
            local session ops
          </small>
        </span>
      </button>
      <nav className="space-y-5">
        {["Workspace", "System"].map((group) => (
          <SidebarGroup
            key={group}
            group={group}
            openView={openView}
            view={view}
          />
        ))}
      </nav>
      <SidebarFleetSummary accounts={accounts} metrics={metrics} />
      <div className="mt-auto space-y-3 pt-5">
        <button
          onClick={() => openView("about")}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
            view === "about"
              ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground"
              : "border-transparent hover:border-sidebar-border hover:bg-sidebar-accent"
          )}
        >
          <IconInfoCircle className="size-4" />
          <span className="flex-1">About</span>
        </button>
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-2.5 py-1.5 font-mono text-[0.7rem] text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          <span>local · 127.0.0.1</span>
        </div>
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
        "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
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

function SidebarFleetSummary({
  accounts,
  metrics,
}: {
  accounts: unknown[]
  metrics: ShellMetrics
}) {
  return (
    <div className="mt-5 space-y-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.62rem] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
          Accounts
        </span>
        <Badge tone="border-sidebar-border bg-sidebar text-muted-foreground">
          {accounts.length}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <StatusPill label="Ready" value={metrics.ready} good />
        <StatusPill label="Attention" value={metrics.attention} />
      </div>
      <div className="rounded-md border border-sidebar-border bg-sidebar/70 px-2.5 py-2 text-xs text-muted-foreground">
        <span className="font-mono text-sidebar-foreground">
          {metrics.knownDialogs}
        </span>{" "}
        known dialogs cached locally
      </div>
    </div>
  )
}

function StatusPill({
  label,
  value,
  good,
}: {
  label: string
  value: number
  good?: boolean
}) {
  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar px-2.5 py-2">
      <span className="block text-[0.62rem] text-muted-foreground">{label}</span>
      <strong className={cn("font-mono text-lg", good && "text-primary")}>
        {value}
      </strong>
    </div>
  )
}
