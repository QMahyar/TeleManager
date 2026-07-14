# Plan 012: Copy punctuation and self-updating accent swatches (audit minors)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b79562e..HEAD -- apps/web/src/screens/settings-screen.tsx apps/web/src/screens/actions/run-panel.tsx apps/web/src/components/account-settings-modal.tsx apps/web/src/components/schedule-parts.tsx apps/web/src/components/scheduled-inspector.tsx`
> Plans 009–011 may have touched some of these files (class-name edits only).
> If the specific strings quoted below no longer exist, treat as STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of 008–011; can run any time)
- **Category**: dx (copy polish + drift-proofing duplicated color values)
- **Planned at**: commit `b79562e`, 2026-07-14

## Why this matters

Two minor findings from a design audit (Hallmark, 2026-07-14):

1. **Straight apostrophes in rendered copy** — five UI strings use `'` where
   typographic `’` belongs. Small, but it's user-facing text on a product
   that otherwise sweats typography (self-hosted Fraunces/Inter/Geist Mono,
   global tabular-nums).
2. **Accent swatch colors duplicated as hex** — the Appearance picker's six
   swatches restate each accent's `--primary` as a hardcoded hex in
   `ACCENT_META`. When an accent value changes in `globals.css`, the picker
   silently drifts. The accent override blocks in `globals.css` are attribute
   selectors (`[data-accent="teal"] { --primary: … }`), which match *any*
   element carrying the attribute — so a swatch `<span data-accent="teal">`
   with `background: var(--primary)` resolves the correct color straight from
   the stylesheet, deleting the duplication.

## Current state

**Apostrophe sites** (exact strings to find; line numbers as of `b79562e`):

| File | Line | String fragment |
|---|---|---|
| `apps/web/src/screens/actions/run-panel.tsx` | 381 | `"optional — skip targets that don't match"` |
| `apps/web/src/components/account-settings-modal.tsx` | 304 | `hint="Telegram automatically deletes this account if you don't come online within this period."` |
| `apps/web/src/components/account-settings-modal.tsx` | 354 | `can't be ended here — use Logout on the account row.` |
| `apps/web/src/components/schedule-parts.tsx` | 195 | `messages don't all fire at once)` |
| `apps/web/src/components/scheduled-inspector.tsx` | 439 | `Look up a specific chat that your schedules don't already target (Telegram` |

**Swatch duplication** — `apps/web/src/screens/settings-screen.tsx:215-246`:

```ts
const ACCENT_META: Record<Accent, { label: string; detail: string; swatch: string }> = {
  coral:     { label: "Coral",     detail: "Sunset coral",    swatch: "#ff5f5f" },
  teal:      { label: "Teal",      detail: "Dim teal signal", swatch: "#3FB8A6" },
  moonlight: { label: "Moonlight", detail: "Cool azure",      swatch: "#5B9DFF" },
  amber:     { label: "Amber",     detail: "Warm gold",       swatch: "#F5A524" },
  arctic:    { label: "Arctic",    detail: "Bright cyan",     swatch: "#38BDF8" },
  emerald:   { label: "Emerald",   detail: "Refined green",   swatch: "#34D399" },
}
```

Find where `swatch` is consumed in the same file (search `swatch` — it is
rendered as an inline `style={{ background: … }}` or similar on a small
circle/chip inside the accent picker button). The exact JSX shape at the
consumption site must be read before editing.

**Related but intentionally untouched**: `apps/web/src/components/theme-provider.tsx`
also contains literals `#ff5f5f` (line ~248, canvas-2d unavailable fallback)
and `#1b1d21`/`#eeede9` (line ~256, favicon tile). Those render in browser
chrome detached from the DOM/CSS (the file's own comment explains this) —
they cannot use CSS variables and stay as-is.

Repo conventions: TypeScript strict; UI strings are plain JSX text or string
props; comments are prose explaining why.

## Commands you will need

| Purpose   | Command                               | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm --prefix apps/web run typecheck`  | exit 0              |
| Lint      | `npm --prefix apps/web run lint`       | exit 0              |
| Tests     | `npm --prefix apps/web run test`       | all pass            |
| Build     | `npm --prefix apps/web run build`      | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/screens/settings-screen.tsx`
- `apps/web/src/screens/actions/run-panel.tsx`
- `apps/web/src/components/account-settings-modal.tsx`
- `apps/web/src/components/schedule-parts.tsx`
- `apps/web/src/components/scheduled-inspector.tsx`

**Out of scope** (do NOT touch):
- `apps/web/src/components/theme-provider.tsx` — its literals are correct (see above).
- `apps/web/src/ui/globals.css` — no token changes here.
- Apostrophes in code comments, test files, or non-rendered strings — only the five rendered-copy sites listed.
- The `Accent` type and the accent persistence logic in settings-screen.

## Git workflow

- Branch: `advisor/012-copy-and-swatches`
- Plain imperative commit messages. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Curly apostrophes

At each of the five sites, replace the straight `'` inside the rendered
string with `’` (U+2019): `don't` → `don’t`, `can't` → `can’t`. Do not change
any other character.

**Verify**: `grep -rn "don't\|can't" apps/web/src/screens/actions/run-panel.tsx apps/web/src/components/account-settings-modal.tsx apps/web/src/components/schedule-parts.tsx apps/web/src/components/scheduled-inspector.tsx` → no matches. `npm --prefix apps/web run typecheck` → exit 0.

### Step 2: Derive swatches from the stylesheet

In `settings-screen.tsx`:

1. Remove the `swatch` field from `ACCENT_META`'s type and all six entries.
2. At the JSX consumption site, replace the hex-driven style with an
   attribute-scoped CSS-variable read. Target shape (adapt to the existing
   element — keep its size/shape classes):

```tsx
<span
  data-accent={accentId}
  aria-hidden
  className="…existing size/rounding classes…"
  style={{ background: "var(--primary)" }}
/>
```

`[data-accent="…"]` blocks in `globals.css` match any element with the
attribute, so the span picks up that accent's light-mode `--primary` without
restating it. For `coral` there is no `[data-accent="coral"]` block (coral is
baked into `:root`), so the span inherits the page's `--primary` — correct
whenever coral is default; BUT if the user has selected another accent, the
`<html data-accent="teal">` value cascades and the coral swatch would show
teal. Guard: the coral span must still carry `data-accent="coral"`; since no
CSS block matches it, add one line to the style to pin it is NOT allowed
(out of scope for globals.css). Instead pin coral locally in the map — keep a
`swatch` override ONLY for coral:

```ts
coral: { label: "Coral", detail: "Sunset coral", swatch: "#ff5f5f" }, // :root default — no [data-accent] block to derive from
```

and render `style={{ background: meta.swatch ?? "var(--primary)" }}`. Five of
six hexes deleted; the one that remains is annotated with why.

**Verify**: `grep -c "#" apps/web/src/screens/settings-screen.tsx` counts only the coral swatch hex among the old six (i.e. `grep -n "3FB8A6\|5B9DFF\|F5A524\|38BDF8\|34D399" apps/web/src/screens/settings-screen.tsx` → no matches). `npm --prefix apps/web run build` → exit 0.

### Step 3: Gates

**Verify**: `npm --prefix apps/web run typecheck && npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build` → all exit 0.

## Test plan

No component tests exist for the settings screen; verification is the greps
plus a visual check if a browser is available: Settings → Appearance shows
six correctly-colored swatches, in BOTH light and dark mode, regardless of
which accent is active. Pay attention to the non-active swatches — each must
show its own accent color, not the page's.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "don't\|can't" apps/web/src --include="*.tsx" | grep -v "//"` → no matches in rendered strings (comment hits are fine — confirm any remaining hit is a comment)
- [ ] `grep -n "3FB8A6\|5B9DFF\|F5A524\|38BDF8\|34D399" apps/web/src/screens/settings-screen.tsx` → no matches
- [ ] All four npm gates exit 0
- [ ] `git status` shows only the five in-scope files (+ `plans/README.md`) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the five apostrophe strings can't be found (drift — check whether a copy edit already fixed it; if so, skip that site and note it).
- The swatch consumption site in settings-screen.tsx doesn't render from `meta.swatch` (structure drifted — report the actual shape).
- The attribute-scoped span renders the wrong color for any accent in a visual check (the cascade assumption failed) — revert step 2 and report rather than reintroducing all six hexes silently.

## Maintenance notes

- New accents added to `globals.css` now show up in the picker with the right swatch automatically (once added to `ACCENT_META` for label/detail) — no hex to keep in sync, except coral's annotated one.
- If coral ever moves out of `:root` into its own `[data-accent="coral"]` block, delete the remaining swatch override and the `?? "var(--primary)"` fallback logic simplifies to always-derive.
- The theme-provider literals were audited and deliberately kept — do not "fix" them in a future sweep (favicon renders outside the DOM).
