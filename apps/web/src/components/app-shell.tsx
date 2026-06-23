import * as React from "react"

import {
  IconMoon,
  IconRefresh,
  IconSun,
  IconUserPlus,
} from "@tabler/icons-react"

import { Button } from "../ui/button"
import { useTheme } from "./theme-provider"
import { navItems } from "../lib/constants"
import type { View } from "../types"
import { CommandPalette } from "./shell/command-palette"
import { Header } from "./shell/header"
import { OperationsRail } from "./shell/operations-rail"
import { Sidebar } from "./shell/sidebar"
import { StatusBar } from "./shell/status-bar"
import { usePaletteHotkeys, usePaletteState } from "./shell/use-command-palette"
import type { AppShellProps, PaletteCommand } from "./shell/types"

export function AppShell({
  view,
  accounts,
  metrics,
  queue,
  runs,
  schedules,
  telemetry,
  selectedCount,
  version,
  activeRun,
  setView,
  onRefresh,
  onExit,
  onAddAccount,
  children,
}: AppShellProps) {
  const shellData = telemetry || { accounts, metrics, queue, runs, schedules }
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

  const commands = React.useMemo<PaletteCommand[]>(() => {
    const navCommands: PaletteCommand[] = navItems.map((item, index) => ({
      id: item.id,
      label: item.label,
      group: item.group,
      icon: item.icon,
      shortcut: index + 1,
      run: () => openView(item.id),
    }))
    const actionCommands: PaletteCommand[] = [
      {
        id: "action:add-account",
        label: "Add account",
        group: "Actions",
        icon: IconUserPlus,
        run: onAddAccount,
      },
      {
        id: "action:refresh",
        label: "Refresh data",
        group: "Actions",
        icon: IconRefresh,
        run: onRefresh,
      },
      {
        id: "action:theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Actions",
        icon: theme === "dark" ? IconSun : IconMoon,
        run: toggleTheme,
      },
    ]
    return [...navCommands, ...actionCommands]
  }, [onAddAccount, onRefresh, openView, theme, toggleTheme])

  const palette = usePaletteState(commands)
  usePaletteHotkeys(palette, openView)

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      {sidebarOpen ? (
        <button
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      {/* Grid region fills the space above the footer. min-h-0 is essential:
          without it the grid refuses to shrink and pushes the footer off-screen. */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <Sidebar
          accounts={shellData.accounts}
          metrics={shellData.metrics}
          onExit={onExit}
          openView={openView}
          sidebarOpen={sidebarOpen}
          view={view}
          closeSidebar={() => setSidebarOpen(false)}
        />

        {/* <main> is now the scroll container (the page no longer scrolls as a
            whole). w-full keeps the centered content from collapsing as a flex
            child. */}
        <main className="flex min-h-0 min-w-0 flex-col overflow-y-auto bg-surface-well px-4 py-4 sm:px-6 lg:px-7 xl:px-8">
          <Header
            activeItem={activeItem}
            queue={shellData.queue}
            selectedCount={selectedCount}
            showSelectedCount={view === "accounts"}
            onAddAccount={onAddAccount}
            openActions={() => openView("actions")}
            openSettings={() => openView("settings")}
            openSidebar={() => setSidebarOpen(true)}
            openPalette={palette.openPalette}
          />
          <div className="mx-auto w-full max-w-[92rem]">{children}</div>
        </main>

        <OperationsRail
          queue={shellData.queue}
          runs={shellData.runs}
          activeRun={activeRun}
          openView={openView}
        />
      </div>

      <StatusBar
        version={version}
        activeRun={activeRun}
        theme={theme}
        onRefresh={onRefresh}
        onToggleTheme={toggleTheme}
      />
      <CommandPalette
        clampedIndex={palette.clampedIndex}
        filteredItems={palette.filteredItems}
        open={palette.paletteOpen}
        paletteQuery={palette.paletteQuery}
        closePalette={palette.closePalette}
        setPaletteIndex={palette.setPaletteIndex}
        setPaletteQuery={palette.setPaletteQuery}
      />
    </div>
  )
}

export { Button }
