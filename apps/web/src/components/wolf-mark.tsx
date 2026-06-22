import { cn } from "../ui/utils"

// Geometric, front-facing wolf head built from flat facets so it stays crisp from
// a 16px favicon up to the sidebar. The silhouette is drawn in the current text
// colour (so it works in light and dark); the eyes use the active accent
// (`fill-primary`) and, when `animated`, pulse with a soft glow that respects
// prefers-reduced-motion via Tailwind's motion-safe variant.
export function WolfMark({
  size = 40,
  animated = false,
  className,
}: {
  size?: number
  animated?: boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="TeleManager wolf logo"
      className={cn("shrink-0", className)}
    >
      {/* Ears */}
      <path d="M12 6 L25 18 L16 30 L9 16 Z" className="fill-foreground" />
      <path d="M52 6 L39 18 L48 30 L55 16 Z" className="fill-foreground" />
      <path d="M12 6 L18 17 L16 24 L13 15 Z" className="fill-muted-foreground/40" />
      <path d="M52 6 L46 17 L48 24 L51 15 Z" className="fill-muted-foreground/40" />

      {/* Head / cheeks */}
      <path
        d="M16 18 L32 14 L48 18 L50 34 L43 44 L32 50 L21 44 L14 34 Z"
        className="fill-foreground"
      />
      {/* Facet shading down the muzzle for a faceted, 2D-geometric look */}
      <path d="M32 14 L48 18 L50 34 L40 36 L32 26 Z" className="fill-muted-foreground/25" />
      <path d="M32 26 L40 36 L32 50 L21 44 L24 32 Z" className="fill-muted-foreground/15" />

      {/* Snout + nose */}
      <path d="M26 36 L32 34 L38 36 L36 44 L32 47 L28 44 Z" className="fill-background" />
      <path d="M29 44 L32 42 L35 44 L32 47 Z" className="fill-foreground" />

      {/* Eyes — accent-coloured, optionally glowing */}
      <path
        d="M22 28 L28 26 L27 32 L22 32 Z"
        className={cn(
          "fill-primary",
          animated &&
            "motion-safe:[animation:wolf-eye_3s_ease-in-out_infinite] [transform-box:fill-box] [transform-origin:center]"
        )}
      />
      <path
        d="M42 28 L36 26 L37 32 L42 32 Z"
        className={cn(
          "fill-primary",
          animated &&
            "motion-safe:[animation:wolf-eye_3s_ease-in-out_infinite] [transform-box:fill-box] [transform-origin:center]"
        )}
      />
    </svg>
  )
}
