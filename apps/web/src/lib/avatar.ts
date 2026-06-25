// Telegram-style deterministic avatars, zero-dependency.
//
// Telegram assigns every peer one of 7 fixed vertical gradients, indexed by
// `abs(peer_id) % 7` (https://core.telegram.org/api/colors). Mirroring that
// scheme makes an account/dialog avatar look native to the platform and stay
// stable across reloads, with no <img>, no network, and no library.

// The 7 documented Telegram gradient pairs, top → bottom.
const GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ["#FF845E", "#D45246"], // red
  ["#FEBB5B", "#F68136"], // orange
  ["#B694F9", "#6C61DF"], // violet
  ["#9AD164", "#46BA43"], // green
  ["#5BCBE3", "#359AD4"], // cyan
  ["#5CAFFA", "#408ACF"], // blue
  ["#FF8AAC", "#D95574"], // pink
]

// djb2 — a tiny, stable hash so non-numeric seeds (usernames, chat titles)
// still spread evenly across the palette.
function hashString(value: string): number {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i)
  }
  return hash >>> 0
}

// Pick a gradient pair for a seed. Numeric Telegram ids use the native
// `abs(id) % 7`; everything else falls back to a hash of the string.
export function gradientFor(seed: string | number): readonly [string, string] {
  const index =
    typeof seed === "number" && Number.isFinite(seed)
      ? Math.abs(Math.trunc(seed))
      : hashString(String(seed))
  return GRADIENTS[index % GRADIENTS.length]
}

// Up to two letters: initials of the first two words, or the first two chars of
// a single token (so "QONE" → "QO", "telegram" → "TE"). Strips a leading "@".
export function initialsFor(name: string): string {
  const cleaned = name.replace(/^@+/, "").trim()
  if (!cleaned) return "?"
  const words = cleaned.split(/[\s_·•|/-]+/).filter(Boolean)
  if (words.length === 0) return cleaned.slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
