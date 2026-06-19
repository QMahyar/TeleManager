import * as React from "react"

import {
  IconBrandDiscord,
  IconBrandGithub,
  IconBrandTelegram,
  IconBrandYoutube,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconHeartHandshake,
  IconInfoCircle,
  IconRefresh,
  IconUserCircle,
} from "@tabler/icons-react"

import { Button } from "../ui/button"

import { Badge, Panel, StepHeading } from "../components/ui"
import { api } from "../lib/api"

type VersionInfo = {
  version: string
  repo: string
  releases_url: string
}

type UpdateInfo = {
  current: string
  latest: string | null
  update_available: boolean
  html_url: string
  published_at?: string | null
  releases_url: string
}

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "result"; info: UpdateInfo }
  | { status: "error"; message: string }

const SOCIAL_LINKS: Array<{
  label: string
  value: string
  href: string
  icon: React.ElementType
}> = [
  {
    label: "GitHub",
    value: "QMahyar",
    href: "https://github.com/QMahyar",
    icon: IconBrandGithub,
  },
  {
    label: "Telegram",
    value: "@qmahyar",
    href: "https://t.me/qmahyar",
    icon: IconBrandTelegram,
  },
  {
    label: "YouTube",
    value: "@qmahyar",
    href: "https://www.youtube.com/@qmahyar",
    icon: IconBrandYoutube,
  },
  {
    label: "Discord",
    value: "qmahyar",
    href: "",
    icon: IconBrandDiscord,
  },
]

const CRYPTO_WALLETS: Array<{
  chain: string
  note: string
  address: string
  recommended?: boolean
}> = [
  {
    chain: "TRON (TRC-20)",
    note: "Recommended — lowest fees. Send TRX or any TRC-20 token. USDT (TRC-20) is the cheapest and most widely used, usually about $1 in fees.",
    address: "TD2QrQFpW9QkUzhhH6X8QQEg12uH8wcQGg",
    recommended: true,
  },
  {
    chain: "TON",
    note: "Send Toncoin (TON) or TON Jettons, including native USDT on TON. Fees are a fraction of a cent.",
    address: "UQCOVixrzJdJ1pGus4zY7oTRpXs8D8mFv-8L6r0kYP5AQi68",
  },
  {
    chain: "EVM (Ethereum · BSC · Polygon · L2s)",
    note: "One address for all EVM chains. Send ETH / BNB / MATIC, or tokens like USDT / USDC. Use BSC, Polygon, or an L2 for low fees. EVM networks only.",
    address: "0x6b5FC86D71C47b225785BFC6C8b329D180678B1e",
  },
  {
    chain: "Bitcoin (BTC)",
    note: "Bitcoin only — send BTC on the Bitcoin network (native SegWit). Don't send tokens here.",
    address: "bc1qyuj82t3tlnxv7j7hq5ks98kmx9cmm72vx3jwta",
  },
]

export function AboutScreen({ flash }: { flash: (message: string) => void }) {
  const [versionInfo, setVersionInfo] = React.useState<VersionInfo | null>(null)
  const [update, setUpdate] = React.useState<UpdateState>({ status: "idle" })

  React.useEffect(() => {
    let active = true
    api<VersionInfo>("/api/version")
      .then((info) => {
        if (active) setVersionInfo(info)
      })
      .catch(() => {
        if (active) setVersionInfo(null)
      })
    return () => {
      active = false
    }
  }, [])

  const checkForUpdates = React.useCallback(async () => {
    setUpdate({ status: "checking" })
    try {
      const info = await api<UpdateInfo>("/api/updates/check")
      setUpdate({ status: "result", info })
    } catch (error) {
      setUpdate({
        status: "error",
        message:
          error instanceof Error ? error.message : "Update check failed.",
      })
    }
  }, [])

  const releasesUrl =
    versionInfo?.releases_url || "https://github.com/QMahyar/TeleManager/releases"
  const version = versionInfo?.version

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="space-y-4 xl:col-span-2">
        <StepHeading
          step={<IconInfoCircle />}
          title="TeleManager"
          detail="Local Telegram session manager for managing Telethon .session files. Everything runs on 127.0.0.1 — nothing leaves your machine."
          trailing={
            <Badge tone="border-primary/30 bg-primary/10 text-primary">
              {version ? `v${version}` : "version unavailable"}
            </Badge>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={checkForUpdates}
            loading={update.status === "checking"}
          >
            <IconRefresh /> Check for updates
          </Button>
          <Button variant="outline" onClick={() => openExternal(releasesUrl)}>
            <IconBrandGithub /> GitHub releases
          </Button>
        </div>
        <UpdateStatus state={update} />
      </Panel>

      <Panel className="space-y-4">
        <StepHeading
          step={<IconUserCircle />}
          title="Author"
          detail="Built and maintained by Mahyar. Reach out or follow for updates."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_LINKS.map((social) => (
            <SocialRow key={social.label} social={social} flash={flash} />
          ))}
        </div>
      </Panel>

      <Panel className="space-y-4">
        <StepHeading
          step={<IconHeartHandshake />}
          title="Support development"
          detail="If this tool saved you time, a small crypto tip helps keep it maintained. USDT on TRON (TRC-20) has the lowest fees and is the easiest to send."
        />
        <div className="space-y-2">
          {CRYPTO_WALLETS.map((wallet) => (
            <WalletRow key={wallet.chain} wallet={wallet} flash={flash} />
          ))}
        </div>
      </Panel>
    </div>
  )
}

function UpdateStatus({ state }: { state: UpdateState }) {
  if (state.status === "idle" || state.status === "checking") {
    return null
  }

  if (state.status === "error") {
    return (
      <div className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {state.message}
      </div>
    )
  }

  const { info } = state
  if (info.update_available) {
    return (
      <div className="flex flex-col gap-3 border border-primary/40 bg-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <strong className="block text-sm text-foreground">
            Update available — v{info.latest}
          </strong>
          <span className="text-xs text-muted-foreground">
            You are running v{info.current}. Download the latest release from
            GitHub.
          </span>
        </div>
        <Button onClick={() => openExternal(info.html_url)}>
          <IconExternalLink /> Get v{info.latest}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
      <IconCheck className="size-4 text-primary" />
      You are on the latest version (v{info.current}).
    </div>
  )
}

function SocialRow({
  social,
  flash,
}: {
  social: (typeof SOCIAL_LINKS)[number]
  flash: (message: string) => void
}) {
  const Icon = social.icon
  const inner = (
    <>
      <Icon className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">
          {social.label}
        </span>
        <span className="block truncate text-sm text-foreground">
          {social.value}
        </span>
      </span>
      {social.href ? (
        <IconExternalLink className="size-4 text-muted-foreground" />
      ) : (
        <IconCopy className="size-4 text-muted-foreground" />
      )}
    </>
  )

  const className =
    "flex items-center gap-3 border border-border px-3 py-2 text-left transition hover:border-primary/40 hover:bg-muted/40"

  if (social.href) {
    return (
      <a
        className={className}
        href={social.href}
        target="_blank"
        rel="noreferrer noopener"
      >
        {inner}
      </a>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void copyToClipboard(social.value, flash, `${social.label} copied`)
      }}
    >
      {inner}
    </button>
  )
}

function WalletRow({
  wallet,
  flash,
}: {
  wallet: (typeof CRYPTO_WALLETS)[number]
  flash: (message: string) => void
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(async () => {
    const ok = await copyToClipboard(
      wallet.address,
      flash,
      `${wallet.chain} address copied`
    )
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }, [flash, wallet.address, wallet.chain])

  return (
    <div className="space-y-2 border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm text-foreground">{wallet.chain}</strong>
        {wallet.recommended ? (
          <Badge tone="border-primary/30 bg-primary/10 text-primary">
            recommended
          </Badge>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{wallet.note}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs text-foreground">
          {wallet.address}
        </code>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  )
}

function openExternal(url: string) {
  window.open(url, "_blank", "noreferrer,noopener")
}

async function copyToClipboard(
  value: string,
  flash: (message: string) => void,
  message: string
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    flash(message)
    return true
  } catch {
    flash("Copy failed — copy the value manually.")
    return false
  }
}
