# Plan 010: Migrate improvised amber/sky status colors to the semantic warning/info tokens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b79562e..HEAD -- apps/web/src/components apps/web/src/screens`
> Expected drift: plan 009's edits to `ui.tsx`, `overview-screen.tsx`,
> `action-picker.tsx`, `status-bar.tsx`, `run-banner.tsx` (focus/motion
> classes only). If the *amber/sky color classes* listed below differ from the
> excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (mechanical class substitution; dark-mode values chosen to be visually identical)
- **Depends on**: plans/008-accessible-color-tokens.md (needs `--warning`/`--info` + Tailwind `--color-warning`/`--color-info`)
- **Category**: tech-debt (token discipline; fixes AA contrast of light-mode amber/sky text as a side effect)
- **Planned at**: commit `b79562e`, 2026-07-14

## Why this matters

A design audit (Hallmark, 2026-07-14) flagged ~17 call sites that color
"needs attention / held / flood-wait" and "live / in-flight" states from
Tailwind's raw `amber-*` / `sky-*` palette, because the Arc token layer
defined no semantic warning/info colors. Consequences: the hues ignore the
user's accent choice, several light-mode pairings fail AA
(`text-amber-600` ≈ 3.2:1 on white), and the palette drifts per-screen —
exactly what `AGENTS.md`'s "design lives in the token layer" rule exists to
prevent. Plan 008 added `--warning` / `--info` tokens (light values are
AA-checked darker hues; dark values equal today's `amber-400` / `sky-400`, so
dark mode is visually unchanged). This plan swaps every call site onto them.

## Current state

Plan 008 defined (in `apps/web/src/ui/globals.css`):
- `:root`: `--warning: #b45309` (≈amber-700, ≥4.5:1 on card/canvas), `--info: #0369a1` (≈sky-700)
- `.dark`: `--warning: oklch(0.83 0.16 84)` (≈amber-400), `--info: oklch(0.746 0.15 233)` (≈sky-400)
- `@theme inline`: `--color-warning`, `--color-info` → utilities `text-warning`, `bg-warning`, `border-warning`, alpha forms like `bg-warning/10`.

Because the token itself flips value between light and dark, the paired
`dark:` variant classes at call sites become redundant and must be removed as
part of the swap.

Complete call-site inventory at `b79562e` (verify each before editing — line
numbers may shift a few lines due to plan 009):

| File | Line | Current classes |
|---|---|---|
| `components/dialog-picker.tsx` | 311 | `border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400` |
| `components/schedule-parts.tsx` | 231 | `text-amber-600 dark:text-amber-400` |
| `components/shell/status-bar.tsx` | 89 | `held ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"` |
| `components/target-composer.tsx` | 133 | `text-amber-600 dark:text-amber-400` |
| `components/target-composer.tsx` | 196 | `border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300` |
| `components/ui.tsx` | 448 | `attention: "text-amber-500 dark:text-amber-400"` |
| `components/ui.tsx` | 451 | `live: "text-sky-500 dark:text-sky-400"` |
| `components/ui.tsx` | 831 | `warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"` |
| `screens/actions/run-banner.tsx` | 80 | `"border-amber-500/40 bg-amber-500/10"` |
| `screens/actions/run-banner.tsx` | 81 | `"border-sky-500/40 bg-sky-500/10"` |
| `screens/actions/run-banner.tsx` | 126 | `held ? "bg-amber-500" : "bg-sky-500"` |
| `screens/actions/run-banner.tsx` | 146 | `text-amber-600 dark:text-amber-400` |
| `screens/actions/run-banner.tsx` | 148 | `text-amber-600 dark:text-amber-400` |
| `screens/actions/run-banner.tsx` | 150 | `text-sky-600 dark:text-sky-400` (may also carry `motion-reduce:animate-none` from plan 009 — keep it) |
| `screens/actions/run-banner.tsx` | 152 | `text-sky-600 dark:text-sky-400` |
| `screens/actions/run-banner.tsx` | 167 | `text-amber-600 dark:text-amber-400` |

Substitution table (apply mechanically):

| Old | New |
|---|---|
| `text-amber-600 dark:text-amber-400` | `text-warning` |
| `text-amber-700 dark:text-amber-300` | `text-warning` |
| `text-amber-500 dark:text-amber-400` | `text-warning` |
| `text-sky-600 dark:text-sky-400` | `text-info` |
| `text-sky-500 dark:text-sky-400` | `text-info` |
| `border-amber-500/30` / `border-amber-500/40` | `border-warning/40` |
| `bg-amber-500/10` | `bg-warning/10` |
| `border-sky-500/40` | `border-info/40` |
| `bg-sky-500/10` | `bg-info/10` |
| `bg-amber-500` (solid dot, run-banner:126) | `bg-warning` |
| `bg-sky-500` (solid dot, run-banner:126) | `bg-info` |

Conventions: Tailwind v4 classes in string arrays; the `Badge`/`Callout`
`tone` props take whole class strings — change the string values, not the
component API.

## Commands you will need

| Purpose   | Command                               | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm --prefix apps/web run typecheck`  | exit 0              |
| Lint      | `npm --prefix apps/web run lint`       | exit 0              |
| Tests     | `npm --prefix apps/web run test`       | all pass            |
| Build     | `npm --prefix apps/web run build`      | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/components/dialog-picker.tsx`
- `apps/web/src/components/schedule-parts.tsx`
- `apps/web/src/components/shell/status-bar.tsx`
- `apps/web/src/components/target-composer.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/screens/actions/run-banner.tsx`

**Out of scope** (do NOT touch):
- `apps/web/src/ui/globals.css` — tokens already defined by plan 008; if they're missing, STOP (don't define them here).
- Any `text-primary` / `bg-primary` classes (plan 011's territory).
- `motion-reduce:` / `animate-*` classes added by plan 009 — preserve them verbatim while editing shared lines.
- Component APIs (`SignalTone`, `CalloutTone`, `Badge` props) — values change, types don't.

## Git workflow

- Branch: `advisor/010-warning-info-tokens`
- Plain imperative commit messages. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Shared primitives (`components/ui.tsx`)

Apply the substitution table to `signalToneClass.attention` (line ~448),
`signalToneClass.live` (line ~451), and `calloutToneClass.warning`
(line ~831). Result:

```ts
attention: "text-warning",
live: "text-info",
...
warning: "border-warning/40 bg-warning/10 text-warning",
```

**Verify**: `grep -n "amber\|sky" apps/web/src/components/ui.tsx` → no matches.

### Step 2: Remaining components

Apply the table in `dialog-picker.tsx:311`, `schedule-parts.tsx:231`,
`status-bar.tsx:89`, `target-composer.tsx:133,196`.

**Verify**: `grep -rn "amber\|sky" apps/web/src/components/ --include="*.tsx"` → no matches.

### Step 3: Run banner

Apply the table to all seven `run-banner.tsx` sites (lines ~80, 81, 126, 146,
148, 150, 152, 167). Keep any `motion-reduce:` fragments plan 009 added.

**Verify**: `grep -rn "amber\|sky" apps/web/src/screens/ --include="*.tsx"` → no matches.

### Step 4: Full sweep + build

**Verify**:
- `grep -rn -E "(text|bg|border|ring)-(amber|sky)-[0-9]+" apps/web/src/ --include="*.tsx"` → no matches
- `npm --prefix apps/web run typecheck && npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build` → all exit 0
- `grep -c "text-warning\|text-info" apps/web/dist/assets/*.css` → ≥ 1 (Tailwind emitted the new utilities; if 0, the `@theme` mapping from plan 008 is missing — STOP)

## Test plan

No UI test suite covers these components; verification is the greps + build
above. Existing `vitest` suites (`npm --prefix apps/web run test`) must stay
green — they don't reference these classes, so any failure signals an
accidental edit.

Optional visual spot check (`npm --prefix apps/web run dev`): a held queue run
shows the warning color in the status bar (darker amber in light mode,
same amber-400 as before in dark mode); a live run shows the info blue.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn -E "(text|bg|border|ring)-(amber|sky)-[0-9]+" apps/web/src/ --include="*.tsx"` → no matches
- [ ] No remaining `dark:text-amber-*` / `dark:text-sky-*` classes: `grep -rn "dark:text-amber\|dark:text-sky" apps/web/src/` → no matches
- [ ] `npm --prefix apps/web run typecheck && npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build` all exit 0
- [ ] `git status` shows only the six in-scope files (+ `plans/README.md`) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -- "--color-warning" apps/web/src/ui/globals.css` returns nothing (plan 008 not landed).
- You find amber/sky call sites NOT in the inventory table (the inventory was exhaustive at `b79562e`; new sites mean the codebase moved — report them rather than guessing their semantic role).
- A call site's surrounding code doesn't match its excerpt (drift).
- Tailwind fails to emit a `warning`/`info` utility (build error or missing from dist CSS).

## Maintenance notes

- From now on, any "attention/held/warning" UI must use `text-warning` etc., and any "live/in-flight" UI `text-info` — never raw `amber-*`/`sky-*`. A reviewer seeing a raw palette color in a PR should reject it.
- If a future design pass wants accent-aware status hues (e.g. warning that harmonizes with the teal accent), change the token values in `globals.css` — zero call-site edits needed after this plan.
- Deferred: `components/ui.tsx` `statusTone()` (string → tone mapping) is untouched; only the class strings changed.
