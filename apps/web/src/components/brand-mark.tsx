import { cn } from "../ui/utils"

// Console brand mark: a terminal prompt ("›_") in a small rounded tile. The
// chevron + cursor are drawn in the active accent (`stroke-primary`), the tile
// uses sidebar surface tokens so it sits cleanly in the sidebar lockup. Stays
// crisp from a 16px favicon up to the lockup because it's pure vector strokes.
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
      className={cn(
        "grid shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar-accent",
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.58}
        height={size * 0.58}
        viewBox="0 0 24 24"
        fill="none"
        role="img"
        aria-label="TeleManager"
      >
        <path
          d="M7 6.5 L12.5 12 L7 17.5"
          className="stroke-primary"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.5 17.5 H18.5"
          className="stroke-primary"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
