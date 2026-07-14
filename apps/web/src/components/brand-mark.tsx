import { BEACON_VIEWBOX } from "../lib/beacon"

// Brand mark — "signal beacon": a solid core with concentric signal rings (the
// outer one broken at the bottom so it reads as a live, emanating beacon rather
// than a bullseye). This is the app's SignalDot status-light motif promoted to a
// logo, so the mark and every in-UI status light read as one system. Drawn in
// the active accent (`fill-primary`/`stroke-primary`) inside a rounded tile that
// uses sidebar surface tokens. Pure vector — crisp from a 16px favicon up.
// The beacon geometry lives in `lib/beacon.ts` so the favicon generator can
// reuse it without this component file exporting non-components.
export function BrandMark({
  size = 40,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={[
        "grid shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar-accent",
        className
      ].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox={BEACON_VIEWBOX}
        fill="none"
        role="img"
        aria-label="TeleManager"
      >
        {/* solid core */}
        <circle cx="12" cy="12" r="2.6" className="fill-primary" />
        {/* inner signal ring */}
        <circle
          cx="12"
          cy="12"
          r="5.3"
          className="stroke-primary"
          strokeWidth="2"
          fill="none"
        />
        {/* outer ring, broken at the bottom -> emanating beacon */}
        <path
          d="M5.15 17.2 A 8.6 8.6 0 1 1 18.85 17.2"
          className="stroke-primary"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  )
}

// The full identity lockup: the beacon mark + the "telemanager" wordmark in mono
// (the brand's machine-data voice), with an optional tagline. Used on the About
// hero and anywhere the product needs to introduce itself by name.
export function BrandLockup({
  size = 40,
  tagline,
  className,
}: {
  size?: number
  tagline?: string
  className?: string
}) {
  return (
    <div className={["flex items-center gap-3", className].filter(Boolean).join(" ")}>
      <BrandMark size={size} />
      <div className="leading-tight">
        <span className="block font-mono text-lg font-semibold tracking-tight text-foreground lowercase">
          telemanager
        </span>
        {tagline ? (
          <span className="type-eyebrow block text-primary-text">{tagline}</span>
        ) : null}
      </div>
    </div>
  )
}
