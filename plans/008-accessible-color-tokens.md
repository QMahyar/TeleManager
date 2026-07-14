# Plan 008: Add accessible color tokens (warning/info, text-safe accent, sunset ink) to the Arc token layer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b79562e..HEAD -- apps/web/src/ui/globals.css`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (design-token foundation for a11y contrast fixes)
- **Planned at**: commit `b79562e`, 2026-07-14

## Why this matters

A design audit (Hallmark, 2026-07-14) found the frontend's worst failures are
contrast failures concentrated in the token layer: `--muted-foreground`
(#83838b) lands ~3.5–3.9:1 on light surfaces yet carries 10–12px captions
everywhere; coral `--primary` (#ff5f5f, ~2.97:1 on white) is used as *text*
color in ~60 call sites; warning/amber and info/sky colors are improvised from
Tailwind's raw palette because the token layer defines no semantic
warning/info family; and the focus-ring token `--ring` (#ff7a6b, ~2.55:1)
fails the 3:1 minimum for focus indicators. This plan adds/corrects the tokens
only. Plans 009 and 010 then consume them at call sites. Per
`AGENTS.md` ("Design lives in the token layer (`src/ui/globals.css`) …
restyle there, not per-screen"), the token layer is the sanctioned place for
this work.

All target values below were contrast-checked during planning (WCAG 2.1
ratios). The executor does not need to re-derive them — only install them and
run the verification script provided.

## Current state

- `apps/web/src/ui/globals.css` — the entire Arc token layer. One file.
  - Light tokens in `:root` (lines 30–84, hex values)
  - Dark tokens in `.dark` (lines 86–123, oklch values)
  - Five alternate-accent override blocks `[data-accent="teal"|"moonlight"|"amber"|"arctic"|"emerald"]` + their `.dark[...]` twins (lines 132–249)
  - Tailwind `@theme inline` mapping block (lines 251–296)
  - Coarse-pointer touch-target block (lines 335–347)

Key excerpts as of `b79562e`:

```css
/* globals.css:52 */
    --primary: #ff5f5f;
/* globals.css:57 */
    --muted-foreground: #83838b;
/* globals.css:63 */
    --ring: #ff7a6b;
/* globals.css:80-83 */
    --sunset: linear-gradient(135deg, #ff7e5f, #feb47b);
    /* Radial canvas washes (light only; dark zeroes them out). */
    --wash-1: rgb(255 126 95 / 16%);
    --wash-2: rgb(183 148 244 / 12%);
```

```css
/* globals.css:97-98 (dark block — note: dark already pairs DARK ink on coral) */
    --primary: oklch(0.72 0.165 26);
    --primary-foreground: oklch(0.20 0.03 25);
```

```css
/* globals.css:335-346 (coarse-pointer block) */
@media (pointer: coarse) {
  [data-slot="button"] {
    min-height: 2.5rem;
    min-width: 2.5rem;
    }
  [data-slot="input"], [data-slot="select"] {
    min-height: 2.75rem;
    }
```

Convention to match: light-mode tokens in this file are plain hex; dark-mode
tokens are `oklch()`. Keep that split. Comments in this file are prose
explaining *why* a token exists — match that voice for the new tokens.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `npm --prefix apps/web run typecheck` | exit 0              |
| Lint      | `npm --prefix apps/web run lint`      | exit 0              |
| Tests     | `npm --prefix apps/web run test`      | all pass            |
| Build     | `npm --prefix apps/web run build`     | exit 0              |

## Scope

**In scope** (the only file you should modify):
- `apps/web/src/ui/globals.css`

**Out of scope** (do NOT touch, even though they look related):
- Every `.tsx` file. Call-site migration to these tokens is plans 009/010/011.
- The `@fontsource` imports and the type-scale `@utility` blocks at the foot of `globals.css`.
- `apps/web/src/components/theme-provider.tsx` (favicon color resolution) — plan 012.
- Dark-mode `--primary` / `--primary-foreground` — already correct.

## Git workflow

- Branch: `advisor/008-accessible-color-tokens` (repo convention: `advisor/NNN-<slug>`, see `git log`)
- One commit per step is fine; message style is plain imperative summary (e.g. "Add warning/info semantic tokens to Arc token layer"). Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add semantic warning/info tokens

In `:root` (immediately after the `--destructive: #ef5350;` line, globals.css:60), add:

```css
    /* Semantic status hues. Warning covers "needs attention / held / flood-wait",
       info covers "live / in-flight". Defined here so screens stop improvising
       from Tailwind's raw amber/sky palette; both are dark enough to carry
       small text on the light surfaces (≥4.5:1 on card white and canvas). */
    --warning: #b45309;
    --info: #0369a1;
```

In `.dark` (immediately after its `--destructive` line, globals.css:105), add:

```css
    --warning: oklch(0.83 0.16 84);
    --info: oklch(0.746 0.15 233);
```

(These are ≈ Tailwind `amber-400` / `sky-400` — the values the dark: variants
at call sites use today, so plan 010's migration is visually neutral in dark
mode.)

**Verify**: `grep -c -- "--warning:" apps/web/src/ui/globals.css` → `2`; same for `--info:` → `2`.

### Step 2: Add the text-safe accent token `--primary-text`

Coral `--primary` (#ff5f5f) fails as text on light surfaces; every *other*
accent's light `--primary` is dark enough to pass. So: define a darkened coral
in `:root`, and alias `--primary-text` to `var(--primary)` in every accent
override block and in `.dark` (dark values are light-on-dark and pass).

In `:root` (after the `--accent-foreground` line):

```css
    /* Coral that can carry GLYPHS (words and icons). --primary (#ff5f5f) is a
       fill/brand color at ~2.97:1 on white; this darker coral clears 4.5:1 on
       every light surface. Non-coral accents alias this to their --primary,
       which is already dark enough. Use text-primary-text wherever coral
       colors a glyph; text-primary stays for fills (bg-*, ring-*, solid dots)
       and decorative aria-hidden art. */
    --primary-text: #c73b3b;
```

In `.dark`, and in ALL TEN accent blocks (`[data-accent="teal"]`,
`.dark[data-accent="teal"]`, and likewise for moonlight, amber, arctic,
emerald), add one line each:

```css
    --primary-text: var(--primary);
```

This must be in every one of those 11 blocks — if an accent block misses it,
that accent inherits the coral `#c73b3b` from `:root`, which is wrong.

**Verify**: `grep -c -- "--primary-text:" apps/web/src/ui/globals.css` → `12` (1 root + 1 dark + 10 accent blocks).

### Step 3: Fix the focus-ring token strength

The light `--ring: #ff7a6b` is ~2.55:1 on white — under the 3:1 focus-indicator
minimum. Point light rings at the text-safe accent instead:

- `:root`: change `--ring: #ff7a6b;` → `--ring: var(--primary-text);` and
  `--sidebar-ring: #ff7a6b;` → `--sidebar-ring: var(--primary-text);`
- In each of the five **light** accent blocks (`[data-accent="…"]`, not the
  `.dark[…]` ones): change `--ring: oklch(…)` → `--ring: var(--primary);` and
  `--sidebar-ring: oklch(…)` → `--sidebar-ring: var(--primary);`
  (their light primaries are L 0.54–0.58 — ≥3:1 on white).
- Leave every `.dark` ring untouched.

**Verify**: `grep -n -- "--ring: #ff7a6b" apps/web/src/ui/globals.css` → no matches; `grep -c -- "--ring: var(" apps/web/src/ui/globals.css` → `6`.

### Step 4: Add the sunset-ink token

The primary button today hardcodes white text on the `#ff7e5f → #feb47b`
gradient (~1.75:1 at the light stop). Dark mode already pairs *dark* ink on
coral (`--primary-foreground: oklch(0.20 0.03 25)`), so the system-consistent
fix is dark ink on the sunset in light mode too.

In `:root` (directly under the `--sunset:` line):

```css
    /* Ink that sits ON the sunset gradient (primary button, hero panels).
       White fails at the peach stop (~1.75:1); a warm near-black clears 4.5:1
       against both stops and matches dark mode's ink-on-coral pairing. */
    --sunset-ink: #2b1a14;
```

In `.dark` (under its `--sunset:` line):

```css
    --sunset-ink: oklch(0.20 0.03 25);
```

Do NOT add per-accent overrides — the warm near-black passes on every accent's
`--sunset` (all accent sunsets are mid-lightness fills).

**Verify**: `grep -c -- "--sunset-ink:" apps/web/src/ui/globals.css` → `2`.

### Step 5: Darken and warm `--muted-foreground`

Change in `:root` only (dark value `oklch(0.71 0.014 60)` is fine):

```css
    --muted-foreground: #6f6b66;
```

(#83838b was ~3.5–3.9:1 and cool-violet on the warm canvas; #6f6b66 is a
warm gray at ≥4.5:1 on card white, canvas `#fdf3ec`, and muted `#f4ece3`.)

**Verify**: `grep -n "#83838b" apps/web/src/ui/globals.css` → no matches.

### Step 6: Warm the second canvas wash

`--wash-2` is violet (`rgb(183 148 244 / 12%)`) — a second chromatic voice
against the coral/peach system. Replace with a warm gold so the wash stays
one-family:

```css
    --wash-2: rgb(255 178 102 / 10%);
```

**Verify**: `grep -n "183 148 244" apps/web/src/ui/globals.css` → no matches.

### Step 7: Unify coarse-pointer touch heights

In the `@media (pointer: coarse)` block, buttons get 2.5rem (40px) while
inputs get 2.75rem (44px), so touch forms pair mismatched heights and buttons
sit under the 44px touch floor. Change the button rule:

```css
  [data-slot="button"] {
    min-height: 2.75rem;
    min-width: 2.75rem;
    }
```

**Verify**: `grep -A3 'pointer: coarse' apps/web/src/ui/globals.css | grep "2.5rem"` → no matches.

### Step 8: Map new tokens into Tailwind

In the `@theme inline` block (after `--color-destructive:`), add:

```css
    --color-warning: var(--warning);
    --color-info: var(--info);
    --color-primary-text: var(--primary-text);
    --color-sunset-ink: var(--sunset-ink);
```

This makes utilities like `text-warning`, `bg-warning/10`, `text-primary-text`,
`text-sunset-ink` available to plans 009/010.

**Verify**: `npm --prefix apps/web run build` → exit 0 (Tailwind v4 resolves the new theme keys).

### Step 9: Contrast regression check (script provided)

Run this from the repo root. It hardcodes the surface hexes from `:root` and
the new token values; every pair must print `PASS`:

```bash
node -e '
const lum = h => { const c = h.replace("#","");
  const [r,g,b] = [0,2,4].map(i => parseInt(c.slice(i,i+2),16)/255)
    .map(v => v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4);
  return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p);
  return (x+0.05)/(y+0.05); };
const checks = [
  ["muted-fg on card",      "#6f6b66", "#ffffff", 4.5],
  ["muted-fg on canvas",    "#6f6b66", "#fdf3ec", 4.5],
  ["muted-fg on muted",     "#6f6b66", "#f4ece3", 4.5],
  ["primary-text on card",  "#c73b3b", "#ffffff", 4.5],
  ["primary-text on canvas","#c73b3b", "#fdf3ec", 4.5],
  ["warning on card",       "#b45309", "#ffffff", 4.5],
  ["info on card",          "#0369a1", "#ffffff", 4.5],
  ["ring on card",          "#c73b3b", "#ffffff", 3.0],
  ["sunset-ink on stop A",  "#2b1a14", "#ff7e5f", 4.5],
  ["sunset-ink on stop B",  "#2b1a14", "#feb47b", 4.5],
];
let fail = 0;
for (const [name, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${r.toFixed(2)}:1 (need ${min}:1)`);
}
process.exit(fail ? 1 : 0);
'
```

**Verify**: script exits 0, all lines `PASS`.

## Test plan

No unit tests exist for CSS tokens and none are required. Verification is the
grep gates per step, the contrast script (step 9), plus:

- `npm --prefix apps/web run typecheck` → exit 0
- `npm --prefix apps/web run test` → all existing tests pass (none touch tokens)
- `npm --prefix apps/web run build` → exit 0

Visual spot check (optional but recommended if a browser is available): run
`npm --prefix apps/web run dev`, confirm the app renders with slightly darker
captions, no violet tint in the top-right canvas wash, and unchanged dark mode.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Step 9 contrast script exits 0
- [ ] `grep -c -- "--primary-text:" apps/web/src/ui/globals.css` → 12
- [ ] `grep -c -- "--warning:" apps/web/src/ui/globals.css` → 2 and `--info:` → 2 and `--sunset-ink:` → 2
- [ ] `grep -n "#83838b\|#ff7a6b\|183 148 244" apps/web/src/ui/globals.css` → no matches
- [ ] `@theme inline` maps `--color-warning`, `--color-info`, `--color-primary-text`, `--color-sunset-ink`
- [ ] `npm --prefix apps/web run typecheck && npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build` all exit 0
- [ ] `git status` shows only `apps/web/src/ui/globals.css` (and `plans/README.md`) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `:root` / `.dark` / accent-block structure in `globals.css` doesn't match the "Current state" excerpts (file drifted).
- The build fails after step 8 with a Tailwind theme-resolution error you cannot fix by correcting the `@theme` syntax to match the existing lines in that block.
- The contrast script reports FAIL for any pair — the planned values were pre-verified, so a FAIL means a typo in what you wrote; re-check, and if it persists, stop.
- You find additional accent blocks beyond the five named (teal, moonlight, amber, arctic, emerald) — the alias count in step 2 would be wrong; stop and report.

## Maintenance notes

- Any future accent added to `globals.css` MUST define `--primary-text` and set light `--ring` to a ≥3:1 value; add that to the comment above the accent blocks if you touch them again.
- Plans 009–011 consume these tokens; if a reviewer wants different hues (e.g. a different warning orange), change the token value here — call sites won't need edits after plan 010 lands.
- Deliberately NOT changed: pure-white `--card` (intentional Arc surface language), dark-mode tokens (already pass), `--foreground`.
