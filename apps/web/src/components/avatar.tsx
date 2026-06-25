import { cn } from "../ui/utils"
import { gradientFor, initialsFor } from "../lib/avatar"

// A deterministic Telegram-style avatar: a vertical gradient disc (indexed off
// `seed`) with mono initials. Pure CSS gradient — no <img>, no network, no deps.
// `seed` should be the stable peer id where available and falls back to `name`,
// so the same account/dialog always renders the same colour. Decorative: the
// peer name is always rendered as text beside it, so the disc is aria-hidden.
export function Avatar({
  name,
  seed,
  size = 36,
  className,
}: {
  name: string
  seed?: string | number
  size?: number
  className?: string
}) {
  const [from, to] = gradientFor(seed ?? name)
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-mono font-semibold tracking-tight text-white select-none",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(to bottom, ${from}, ${to})`,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initialsFor(name)}
    </span>
  )
}
