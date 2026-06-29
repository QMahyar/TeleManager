import * as React from "react"

import { gradientFor, initialsFor } from "../lib/avatar"

// A Telegram-style avatar. When `src` is given (a cached profile photo) it renders
// that image; otherwise — or if the image fails to load — it falls back to a
// deterministic gradient disc (indexed off `seed`) with mono initials. The
// gradient is the universal fallback, so callers that pass no `src` (e.g. account
// rows) are unaffected. `seed` should be the stable peer id where available and
// falls back to `name`, so the same account/dialog always renders the same colour.
// Decorative: the peer name is always rendered as text beside it, so it's aria-hidden.
export function Avatar({
  name,
  seed,
  size = 36,
  src,
  className,
}: {
  name: string
  seed?: string | number
  size?: number
  src?: string
  className?: string
}) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)

  // Render the photo unless this exact URL has already errored. Tracking the
  // failed src (instead of a boolean reset via an effect) means a *new* src — e.g.
  // the cache-busting ?v= changed — is retried automatically on the next render.
  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={["shrink-0 rounded-full object-cover select-none", className].filter(Boolean).join(" ")}
        style={{ width: size, height: size }}
      />
    )
  }

  const [from, to] = gradientFor(seed ?? name)
  return (
    <span
      aria-hidden
      className={[
        "grid shrink-0 place-items-center rounded-full font-mono font-semibold tracking-tight text-white select-none",
        className
      ].filter(Boolean).join(" ")}
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
