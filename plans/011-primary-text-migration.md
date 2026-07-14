# Plan 011: Migrate accent-colored glyphs from `text-primary` to the text-safe `text-primary-text`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b79562e..HEAD -- apps/web/src`
> Expected drift: plans 008/009/010 (globals.css tokens; focus/motion classes;
> amber/sky → warning/info classes). None of those change `text-primary`
> occurrences. If the inventory greps in "Current state" don't match, STOP.

## Status

- **Priority**: P2
- **Effort**: M (mechanical but wide: ~50 occurrences across 31 files)
- **Risk**: MED (visual: light-mode coral text/icons become a darker coral everywhere at once)
- **Depends on**: plans/008-accessible-color-tokens.md (defines `--primary-text` + Tailwind `--color-primary-text`)
- **Category**: bug (a11y contrast on accent-colored words and icons)
- **Planned at**: commit `b79562e`, 2026-07-14

## Why this matters

A design audit (Hallmark, 2026-07-14) found coral `--primary` (#ff5f5f,
~2.97:1 on white) used as the *color of words and icons* in ~50 call sites —
badges, eyebrows, kickers, icon chips, links, stat values. Body-size text
needs 4.5:1 and icons need 3:1, so every light-mode occurrence fails or
borderline-fails. Plan 008 added `--primary-text` — a darker coral (#c73b3b,
≥4.5:1 on all light surfaces) that aliases to `var(--primary)` in dark mode
and under every non-coral accent (whose primaries are already dark enough).
This plan swaps the class at every *glyph* call site, leaving *fills and
decorative art* on `--primary` so the brand stays vivid where contrast rules
don't apply.

## Current state

The decision rule (already applied during planning — the executor only
executes it):

- **Migrate** `text-primary` → `text-primary-text` where the class colors a
  glyph: visible words, numbers, or meaningful icons (including icons inside
  `bg-primary/10` chips — the tint is near-white, so the same math applies).
- **Keep** `text-primary` where the class feeds decorative, `aria-hidden`
  art via `currentColor` fills: the empty-state illustrations and the
  SignalDot `ready` tone (a 8px dot whose adjacent word names the state).
- **Never touch** `text-primary-foreground` (a different token) or
  `fill-primary` / `stroke-primary` (SVG brand fills).

Inventory at `b79562e` — establish it still holds before editing:

```
grep -rn "text-primary" apps/web/src --include="*.tsx" | grep -v "text-primary-text\|text-primary-foreground" | wc -l
```
→ expected ~59 lines. All are migrated EXCEPT these 8 keep-lines:

- `apps/web/src/components/empty-illustrations.tsx` lines 32, 33, 43, 53, 54, 65, 66 — `className="text-primary"` on `aria-hidden` SVG shapes (file-level comment: "Line-art in `currentColor`").
- `apps/web/src/components/ui.tsx` line ~447 — `ready: "text-primary"` inside `signalToneClass` (the block whose comment says the dot is aria-hidden decorative).

Every other occurrence migrates. The 31 files that contain migrate-sites:

`components/`: account-settings-modal.tsx (383), action-fields.tsx (217),
app-password-gate.tsx (78), brand-mark.tsx (79), dialog-picker.tsx (261, 316),
run-history.tsx (247, 470, 487), schedule-parts.tsx (209, 352),
scheduled-inspector.tsx (308, 349, 574), shell/header.tsx (61, 70),
shell/operations-rail.tsx (34), shell/sidebar.tsx (192), ui.tsx (52, 145,
407 — NOT 447), welcome-modal.tsx (98)

`screens/`: about-screen.tsx (145, 329), accounts/login-tab.tsx (86, 237,
275), actions/accounts-bar.tsx (38, 132), actions/action-picker.tsx (143),
actions/run-panel.tsx (148), actions/section-label.tsx (21),
actions/sync.tsx (289, 294), dialogs/messages-panel.tsx (100),
dialogs/search-panel.tsx (111), dialogs/source-panel.tsx (145),
overview-screen.tsx (126, 139, 174, 186, 254, 382), settings-screen.tsx
(92, 375 — NOT the `text-primary-foreground` at 329)

`ui/`: badge.tsx (7), button.tsx (39, the `link` variant), info-hint.tsx
(42, inside `data-[popup-open]:text-primary` — the whole modifier becomes
`data-[popup-open]:text-primary-text`), modal.tsx (148), toast.tsx (23)

Representative excerpts (verify shape before the sweep):

```tsx
// ui/badge.tsx:7
primary: "border-primary/30 bg-primary/10 text-primary",
// → primary: "border-primary/30 bg-primary/10 text-primary-text",

// ui/button.tsx:39
link: "text-primary underline-offset-4 hover:underline",
// → link: "text-primary-text underline-offset-4 hover:underline",

// components/ui.tsx:52 (kicker) — migrate
<span className="text-primary">›</span> {kicker}

// components/ui.tsx:447 (SignalDot ready tone) — KEEP
ready: "text-primary",
```

Note the surrounding `bg-primary/10`, `border-primary/30`, `ring-primary/40`
fragments stay exactly as they are — only the bare `text-primary` fragment
changes.

## Commands you will need

| Purpose   | Command                               | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm --prefix apps/web run typecheck`  | exit 0              |
| Lint      | `npm --prefix apps/web run lint`       | exit 0              |
| Tests     | `npm --prefix apps/web run test`       | all pass            |
| Build     | `npm --prefix apps/web run build`      | exit 0              |

## Scope

**In scope** (modify only these — the 31 files listed in "Current state"):
all files listed above under `components/`, `screens/`, and `ui/`.

**Out of scope** (do NOT touch):
- `apps/web/src/components/empty-illustrations.tsx` — decorative art, keeps `text-primary`.
- `components/ui.tsx` line ~447 (`ready:` tone) — keep, while lines 52/145/407 in the same file DO migrate.
- `apps/web/src/components/brand-mark.tsx` `fill-primary` / `stroke-primary` (line 79's `text-primary` on the tagline DOES migrate; the SVG fills do not).
- `apps/web/src/ui/globals.css` — tokens are plan 008.
- Any `text-primary-foreground`, `bg-primary*`, `border-primary*`, `ring-primary*` fragment.

## Git workflow

- Branch: `advisor/011-primary-text-migration`
- Plain imperative commit messages. One commit for the sweep + one for any keep-line annotations is fine. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm the inventory

Run the inventory grep from "Current state". Confirm the count is ~59 and the
8 keep-lines exist at (or near) the cited locations. If the count is wildly
different (< 50 or > 70), STOP.

**Verify**: count within [50, 70]; keep-lines present.

### Step 2: Sweep the migrate-sites

For each of the 31 in-scope files, replace the exact fragment `text-primary`
with `text-primary-text` — including inside variant prefixes like
`data-[popup-open]:text-primary` — while leaving `text-primary-foreground`
and `text-primary-text` (already-migrated) untouched. In `components/ui.tsx`,
skip the `ready: "text-primary"` line.

A safe mechanical route (run from repo root; GNU sed via Git Bash):

```bash
cd apps/web/src
# word-boundary-safe: replace text-primary NOT followed by "-"
grep -rl "text-primary" --include="*.tsx" . \
  | grep -v "empty-illustrations" \
  | xargs sed -i 's/text-primary\([^-]\)/text-primary-text\1/g; s/text-primary$/text-primary-text/g'
```

Then restore the one intentional keep in `components/ui.tsx`: change
`ready: "text-primary-text",` back to `ready: "text-primary",`.

(If sed is unavailable, do it by editor find-replace per file — the rule is
identical.)

**Verify**:
```
grep -rn "text-primary" apps/web/src --include="*.tsx" | grep -v "text-primary-text\|text-primary-foreground"
```
→ exactly 8 lines: 7 in `empty-illustrations.tsx`, 1 in `components/ui.tsx` (`ready:` tone).

### Step 3: Annotate the keep-lines

So the next sweep doesn't "fix" them, add one short comment at each keep
location, matching the file's prose-comment voice:

- `empty-illustrations.tsx` already has the file-level comment explaining
  `currentColor` inheritance — extend its first paragraph with one sentence:
  `// Stays on text-primary (not -text): decorative aria-hidden art, no contrast requirement.`
- `components/ui.tsx` above the `ready:` line:
  `// ready stays text-primary (not -text): the dot is decorative fill, the adjacent word carries meaning.`

**Verify**: `grep -rn "not -text" apps/web/src --include="*.tsx" | wc -l` → 2.

### Step 4: Gates

**Verify**:
- `npm --prefix apps/web run typecheck && npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build` → all exit 0
- `grep -o "text-primary-text" apps/web/dist/assets/*.css | head -1` → match found (Tailwind emitted the utility; if not, plan 008's `@theme` mapping is missing — STOP)

## Test plan

No UI test suite exists for these components; the inventory greps ARE the
regression check. Existing `vitest` suites must stay green.

Optional visual spot check (`npm --prefix apps/web run dev`): light mode —
badges/eyebrows/icons read a deeper coral; dark mode — pixel-identical to
before (the token aliases to `--primary`); switch accent to Teal in Settings →
Appearance — accent-colored text unchanged (alias again).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Inventory grep (step 2 verify) returns exactly the 8 keep-lines
- [ ] `grep -rn "text-primary-text-text" apps/web/src` → no matches (no double-application)
- [ ] `npm --prefix apps/web run typecheck && npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build` all exit 0
- [ ] `git status` shows only the 31 in-scope files + the 2 keep-annotation files (+ `plans/README.md`) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -- "--primary-text" apps/web/src/ui/globals.css | wc -l` ≠ 12 (plan 008 not landed or landed differently).
- Step 1's inventory count is outside [50, 70].
- After the sweep, any `text-primary-text-text` exists (double-replace — revert the file and redo by hand).
- Tailwind does not emit `text-primary-text` into the dist CSS.

## Maintenance notes

- Rule for future PRs: **coral on glyphs = `text-primary-text`; coral as fill/decoration = `text-primary`.** A reviewer seeing a new bare `text-primary` on a word or icon should reject it.
- If a future accent is added to `globals.css` without a `--primary-text` alias, every migrated site silently falls back to the coral `#c73b3b` under that accent — plan 008's maintenance note covers this; re-check when accents change.
- Deferred (named in plan 009 too): `settings-screen.tsx:329`'s `bg-primary text-primary-foreground` segmented control — white-on-coral ~2.97:1 in light mode. Fixing it means changing light `--primary-foreground`, which also affects the sidebar-primary pairing; needs a considered token decision, not a sweep.
