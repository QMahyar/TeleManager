# Plan 009: Fix primary-button legibility, focus-ring visibility, and motion discipline in the UI primitives

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b79562e..HEAD -- apps/web/src/ui/button.tsx apps/web/src/ui/form.tsx apps/web/src/components/ui.tsx apps/web/src/screens/overview-screen.tsx apps/web/src/screens/actions/action-picker.tsx apps/web/src/components/shell/status-bar.tsx apps/web/src/screens/actions/run-banner.tsx`
> Plan 008 does not touch these files, so any diff besides plan 008's
> `globals.css` work means drift — compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (visual change to the primary button on every screen)
- **Depends on**: plans/008-accessible-color-tokens.md (needs `--sunset-ink`, the strengthened `--ring`, and the `--color-*` Tailwind mappings)
- **Category**: bug (a11y contrast + motion discipline)
- **Planned at**: commit `b79562e`, 2026-07-14

## Why this matters

A design audit (Hallmark, 2026-07-14) found four defects in the interaction
primitives:

1. **The primary commit button is the least readable element on every screen**
   — 12px white text on the peach end of the sunset gradient is ~1.75:1
   (needs 4.5:1). It also hardcodes `text-white`, bypassing the token system,
   so dark mode's correct dark-ink-on-coral pairing never applies.
2. **Focus rings animate in and are too faint** — the shared Button class uses
   `transition-all`, which transitions the `ring-*` box-shadow, so keyboard
   users get a delayed focus indicator; and the ring itself is the accent at
   20% alpha, far below the 3:1 focus-indicator minimum.
3. **`transition-all` and triple-stacked hover effects** (translate + border
   + shadow simultaneously) on stat tiles and picker tiles.
4. **Reduced-motion gaps** — one `animate-ping` and one `animate-pulse` are
   not gated behind `prefers-reduced-motion`, and the queue progress bar
   animates `width` (a layout property) on every poll tick.

## Current state

Files and their roles:

- `apps/web/src/ui/button.tsx` — the shared Button; `baseClass` (line 23) and the `default` variant (line 29)
- `apps/web/src/ui/form.tsx` — Input / Select / Textarea primitives (whole file, ~44 lines)
- `apps/web/src/ui/dialog.tsx` — confirm dialog; has its own inline input (~line 50)
- `apps/web/src/components/ui.tsx` — shared composites; `StatCard` (lines ~376–402), `SignalDot` (lines ~444–478)
- `apps/web/src/screens/overview-screen.tsx` — progress bar (lines 152–158), quick-action tiles (line 380)
- `apps/web/src/screens/actions/action-picker.tsx` — action tiles (lines 128–138)
- `apps/web/src/components/shell/status-bar.tsx` — live-run pulse dot (line 97)
- `apps/web/src/screens/actions/run-banner.tsx` — phase icons (lines 144–154)

Excerpts as of `b79562e` (JSX className strings; confirm before editing):

`ui/button.tsx:23` — baseClass contains (single line, abridged to the relevant parts):
```
... whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 active:not-aria-[haspopup]:translate-y-px ...
```

`ui/button.tsx:29` — default variant:
```
"bg-sunset text-white shadow-[0_6px_18px_-4px_color-mix(in_oklab,var(--primary),transparent_50%)] hover:-translate-y-px hover:shadow-[0_10px_26px_-6px_color-mix(in_oklab,var(--primary),transparent_38%)]",
```

`ui/form.tsx` — all three controls share this focus pattern:
```
transition-[color,box-shadow,border-color] outline-none ... focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20
```

`components/ui.tsx:397-400` — StatCard:
```
"rounded-xl border border-border bg-card p-4 text-left shadow-md transition-all",
(primary || active) && "ring-1 ring-primary/40",
onClick && "hover:-translate-y-0.5 hover:shadow-lg"
```

`screens/overview-screen.tsx:152-158` — progress bar:
```tsx
<div className="h-2 overflow-hidden rounded-full bg-primary/15">
  <div
    className="h-full rounded-full bg-sunset transition-all"
    style={{ width: `${progress}%` }}
  />
</div>
```

`screens/overview-screen.tsx:380` — quick-action tile:
```
"flex items-center gap-2.5 rounded-xl border border-border bg-background/40 px-3.5 py-3 text-left text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
```

`screens/actions/action-picker.tsx:133-137` — action tile:
```
"flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all",
selected
  ? "border-primary/40 bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/40"
  : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
```

`components/shell/status-bar.tsx:97` — ungated ping (contrast with the
correctly-gated twin at `components/ui.tsx:475`, which ends in
`motion-reduce:hidden`):
```tsx
<span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
```

`screens/actions/run-banner.tsx:150` — ungated pulse:
```tsx
return <IconClockPause className="size-4 shrink-0 animate-pulse text-sky-600 dark:text-sky-400" />
```

Conventions: Tailwind v4 utility classes composed via string arrays +
`.filter(Boolean).join(" ")`; comments are prose explaining intent. Plan 008
added `--sunset-ink` (Tailwind: `text-sunset-ink`) and repointed `--ring` to a
≥3:1 value — this plan assumes both exist (verify:
`grep -- "--sunset-ink" apps/web/src/ui/globals.css` → 2 matches; if 0, plan
008 has not landed — STOP).

## Commands you will need

| Purpose   | Command                               | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm --prefix apps/web run typecheck`  | exit 0              |
| Lint      | `npm --prefix apps/web run lint`       | exit 0              |
| Tests     | `npm --prefix apps/web run test`       | all pass            |
| Build     | `npm --prefix apps/web run build`      | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/ui/button.tsx`
- `apps/web/src/ui/form.tsx`
- `apps/web/src/ui/dialog.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/screens/overview-screen.tsx`
- `apps/web/src/screens/actions/action-picker.tsx`
- `apps/web/src/components/shell/status-bar.tsx`
- `apps/web/src/screens/actions/run-banner.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/ui/globals.css` — token work is plan 008.
- The amber/sky → warning/info color migration in status-bar/run-banner — plan 010. This plan only adds `motion-reduce:` gates there; leave colors alone.
- `text-primary` → `text-primary-text` migration — plan 011.
- Spinners (`animate-spin`) — loading spinners legitimately keep spinning under reduced motion; do not gate them.
- The dark:-variant classes anywhere.
- Button sizes, variants other than `default`, and the `active:` translate.

## Git workflow

- Branch: `advisor/009-primitives-focus-motion`
- Plain imperative commit messages (repo convention, see `git log`). Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Button — instant, visible focus ring; enumerated transitions

In `ui/button.tsx` `baseClass` (line 23), make exactly these three
replacements inside the string:

1. `transition-all` → `transition-[background-color,border-color,color,box-shadow,transform,opacity]`
2. `focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20` → `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`

Rationale the code can't show (add as a short comment above `baseClass`):
the ring must be `outline` (not `ring-*`/box-shadow) because box-shadow is in
the transition list for the hover lift — outline is excluded, so the focus
indicator appears instantly, and at full `--ring` strength it meets 3:1.

Leave `outline-none` in place — `focus-visible:outline-2` overrides it on
focus; the `aria-invalid:ring-*` classes stay (they're state, not focus).

**Verify**: `grep -n "transition-all" apps/web/src/ui/button.tsx` → no matches; `grep -n "focus-visible:outline-2" apps/web/src/ui/button.tsx` → 1 match. `npm --prefix apps/web run build` → exit 0.

### Step 2: Button — ink on the sunset

In `ui/button.tsx` line 29 (`default` variant), replace `text-white` with
`text-sunset-ink`.

This is the audited fix for the ~1.75:1 white-on-peach primary button: warm
near-black ink on the gradient in light mode, and in dark mode the token
carries dark mode's existing ink-on-coral value, so both modes read ≥4.5:1.

**Verify**: `grep -n "text-white" apps/web/src/ui/button.tsx` → no matches. Then `npm --prefix apps/web run dev` is NOT required; static check suffices: `grep -n "text-sunset-ink" apps/web/src/ui/button.tsx` → 1 match.

### Step 3: Inputs — instant, visible focus ring

In `ui/form.tsx`, in all three components (Input, Select, Textarea), replace:

`focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20` → `focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring`

Keep each `transition-[color,box-shadow,border-color]` as is (outline is not
in the list, so the ring is instant; border-color may still ease — that's the
1px border, not the indicator).

In `ui/dialog.tsx`, the inline `<input>` (~line 50) uses
`focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30`.
Replace that fragment with the same outline pattern as form.tsx above.

**Verify**: `grep -rn "ring-ring/20\|ring-ring/30" apps/web/src/ui/` → no matches. `npm --prefix apps/web run typecheck` → exit 0.

### Step 4: StatCard — one hover signal, enumerated transition

In `components/ui.tsx` StatCard (~lines 397–400):

- `"rounded-xl border border-border bg-card p-4 text-left shadow-md transition-all"` → `"rounded-xl border border-border bg-card p-4 text-left shadow-md transition-transform"`
- `onClick && "hover:-translate-y-0.5 hover:shadow-lg"` → `onClick && "hover:-translate-y-0.5"`

The lift is the one retained hover signal (the audit: "keep the lift *or* the
border tint, drop the rest").

**Verify**: `grep -n "hover:shadow-lg" apps/web/src/components/ui.tsx` → no matches in the StatCard region (check any other match is a different component before touching it — if StatCard was the only user, expect zero).

### Step 5: Quick-action and action-picker tiles — same discipline

`screens/overview-screen.tsx:380`: in the tile className, replace
`transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md` → `transition-transform hover:-translate-y-0.5`

`screens/actions/action-picker.tsx`: line 133 `transition-all` → `transition-transform`; line 137 (unselected branch) `hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md` → `hover:-translate-y-0.5`.

**Verify**: `grep -rn "transition-all" apps/web/src/` → exactly 1 match remaining (`screens/overview-screen.tsx` progress bar — removed next step).

### Step 6: Progress bar — transform, not width

In `screens/overview-screen.tsx` (~lines 152–158), replace the inner bar:

```tsx
<div className="h-2 overflow-hidden rounded-full bg-primary/15">
  <div
    className="h-full w-full origin-left rounded-full bg-sunset transition-transform"
    style={{ transform: `scaleX(${progress / 100})` }}
  />
</div>
```

(`progress` is already a 0–100 number in this component — confirm by reading
its computation a few lines above; if it is a string or can exceed 100, STOP.)

**Verify**: `grep -rn "transition-all" apps/web/src/` → no matches anywhere.

### Step 7: Gate the remaining ping and pulse behind reduced-motion

- `components/shell/status-bar.tsx:97`: append `motion-reduce:hidden` to the
  `animate-ping` span's className (exactly like the gated twin at
  `components/ui.tsx:475`). The solid dot sibling remains, so no information
  is lost.
- `screens/actions/run-banner.tsx:150`: append `motion-reduce:animate-none` to
  the `IconClockPause` className. (`animate-none`, not `hidden` — this icon
  *is* the phase indicator; hiding it would remove information.)

**Verify**:
`grep -rn "animate-ping\|animate-pulse" apps/web/src/ --include="*.tsx" | grep -v "motion-reduce"` → only `components/ui.tsx:369` (the Skeleton `animate-pulse`) may remain; gate it too with `motion-reduce:animate-none` if present, then the grep returns no matches.

## Test plan

No component test suite exists for these primitives (`vitest` covers lib/ and
hooks/). Do not add UI snapshot tests — repo has no testing-library setup.
Verification is static:

- `npm --prefix apps/web run typecheck` → exit 0
- `npm --prefix apps/web run lint` → exit 0
- `npm --prefix apps/web run test` → all existing tests pass (they don't touch these files; a failure means an accidental edit — investigate)
- `npm --prefix apps/web run build` → exit 0
- The greps in each step (they are the regression checks: no `transition-all`, no faint rings, no ungated ping/pulse)

If a browser is available, optional spot check with `npm --prefix apps/web run dev`: tab through a form (ring appears instantly, clearly visible), check the primary button reads dark-on-sunset, and hover a stat card (single lift, no shadow bloom).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "transition-all" apps/web/src/` → no matches
- [ ] `grep -rn "ring-ring/20\|ring-ring/30" apps/web/src/` → no matches
- [ ] `grep -n "text-white" apps/web/src/ui/button.tsx` → no matches
- [ ] `grep -rn "animate-ping\|animate-pulse" apps/web/src --include="*.tsx" | grep -v motion-reduce | grep -v animate-spin` → no matches
- [ ] `npm --prefix apps/web run typecheck && npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build` all exit 0
- [ ] `git status` shows only the eight in-scope files (+ `plans/README.md`) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -- "--sunset-ink" apps/web/src/ui/globals.css` returns nothing (plan 008 not landed — this plan's classes would silently resolve to nothing).
- Any "Current state" excerpt doesn't match the live code at the cited location.
- After step 1, the build fails or Tailwind does not emit the `transition-[…]` arbitrary property class (inspect `apps/web/dist/assets/*.css` for `transition-property:background-color` if unsure).
- `progress` in overview-screen.tsx is not a clamped 0–100 number.
- You find the focus ring invisible in a spot check — do not invent new colors; report, since ring strength comes from plan 008's token.

## Maintenance notes

- Reviewers should scrutinize the primary button in BOTH light and dark modes and under each of the six accents (Settings → Appearance) — `text-sunset-ink` must read on every accent's `--sunset`.
- Any new interactive primitive must copy the outline-based focus pattern from button.tsx, not the old `ring-ring/20` pattern.
- Deferred deliberately: the segmented control at `screens/settings-screen.tsx:329` (`bg-primary text-primary-foreground`) is white-on-coral ~2.97:1; it was not in the audit's critical list but a follow-up could repoint `--primary-foreground` usage similarly. Do not do it in this plan.
