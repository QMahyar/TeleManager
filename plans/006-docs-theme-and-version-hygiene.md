# Plan 006: Docs/theme single source of truth + root version hygiene

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 471cc28..HEAD -- AGENTS.md docs/DEVELOPMENT.md docs/SECURITY.md docs/ROADMAP.md package.json scripts/sync_version.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `471cc28`, 2026-07-13

## Why this matters

Three small documentation/tooling lies waste agent and human time:

1. **Theme conflict**: `AGENTS.md` describes the live **Arc** light-first
   system (Fraunces + Inter + Geist Mono, coral). `docs/DEVELOPMENT.md` still
   says **Console** dark-first Geist + dim-teal. `apps/web/src/ui/globals.css`
   header comments confirm Arc is source of truth.
2. **SECURITY.md** lists `AGENTS.md` under "Never commit or share" but
   `AGENTS.md` is tracked and is the agent operating guide — the sensitive
   list meant local secrets / operator notes, not this file.
3. **Root `package.json`** still shows `"version": "1.8.0"` while
   `pyproject.toml` / `apps/web/package.json` / `__init__.py` are `1.15.0`.
   `scripts/sync_version.py` intentionally only syncs web + init; root is a
   thin npm script wrapper and is easy to misread.

## Current state

### AGENTS.md (authoritative theme blurb)

```text
- **Frontend theme** ("Arc"): light-first — a warm peach-cream canvas ...
  Fraunces (serif) leads titles, Inter carries prose, Geist Mono is machine
  data only ... Coral is the default accent; ...
```

### docs/DEVELOPMENT.md (stale)

```markdown
## Frontend theme

**Console** — dark-first, warm-charcoal neutrals, dim-teal accent. Geist + Geist Mono (self-hosted). All design tokens live in `apps/web/src/ui/globals.css`; shared primitives in `apps/web/src/components/ui.tsx`. Restyle at the token/primitive layer, not per-screen.
```

### docs/ROADMAP.md

Mentions "UI overhaul" / Geist scale historically — do not rewrite history,
but do not contradict Arc if you touch a "current theme" sentence.

### docs/SECURITY.md sensitive list

Includes:

```text
- `AGENTS.md`
```

among session files and `data/*`.

### Version tooling

- Canonical: `pyproject.toml` `[project] version`
- `scripts/sync_version.py` propagates to `apps/web/package.json` and
  `src/telemanager/__init__.py` + regenerates `requirements.txt`
- Root `package.json` is **not** in the sync list:

```json
{
  "name": "TeleManager",
  "version": "1.8.0",
  "private": true,
  "scripts": {
    "build": "npm --prefix apps/web run build",
    ...
  }
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Version check | `python scripts/sync_version.py --check` | `Versions in sync: …` exit 0 |
| (If you extend sync) apply | `python scripts/sync_version.py` | exit 0 |
| Lint markdown optional | n/a — no markdown CI gate required |

## Scope

**In scope**:

- `docs/DEVELOPMENT.md` — theme section rewrite
- `docs/SECURITY.md` — remove or reword `AGENTS.md` bullet
- `package.json` (repo root) — version field
- Optionally `scripts/sync_version.py` — include root package.json in sync
  **or** set root version once and document that root is not versioned
  (pick one approach in step 3)
- Optionally one line in `docs/ROADMAP.md` only if it currently claims
  Console as current (historical Phase 7 text can stay)

**Out of scope**:

- Restyling the app
- Changing `apps/web/package.json` version except via sync script
- Rewriting AGENTS.md theme (it is already correct)

## Git workflow

- Branch: `advisor/006-docs-theme-version`
- Commit: `docs: align theme docs with Arc; fix version/security nits`
- Do NOT push unless asked.

## Steps

### Step 1: Fix DEVELOPMENT theme section

Replace the **Frontend theme** section in `docs/DEVELOPMENT.md` with Arc
language consistent with AGENTS.md + `globals.css`:

- Name: **Arc**
- Light-first peach-cream canvas, coral accent, dark warm-charcoal variant
- Fonts: Fraunces (titles), Inter (prose), Geist Mono (machine data),
  self-hosted
- Tokens: `apps/web/src/ui/globals.css`; primitives:
  `apps/web/src/components/ui.tsx`
- Restyle at token/primitive layer, not per-screen

Keep the section short (similar length to today). Point to AGENTS.md for the
full agent-oriented blurb if useful.

**Verify**: open the file; no remaining "Console" / "dark-first" as the
**current** theme description. `rg -n "Console|dark-first" docs/DEVELOPMENT.md`
→ no matches (or only in a "historical" note you intentionally left — prefer
zero matches).

### Step 2: Fix SECURITY.md AGENTS.md bullet

In the "Never commit or share" list:

- **Remove** the `- AGENTS.md` line, **or** replace with a clearer bullet
  such as local operator notes / untracked agent scratch (do **not** tell
  people to untrack the real `AGENTS.md`).

Add nothing secret. Do not list vault paths.

**Verify**: `rg -n "AGENTS.md" docs/SECURITY.md` → either no match or a
sentence that does not say "never commit AGENTS.md".

### Step 3: Root package.json version

**Preferred (YAGNI)**: set root `"version"` to match
`pyproject.toml` (currently `1.15.0`) in one edit. Do **not** expand
`sync_version.py` unless you want root to stay forever-synced — if you do
extend the script, also update its docstring and
`python scripts/sync_version.py --check` logic, then run apply + check.

If you only bump the field once, add a one-line comment in
`scripts/sync_version.py` docstring: "Root package.json is a script shim;
bump manually or ignore — web package version is the UI source."

**Verify**:
`python -c "import json,tomllib; from pathlib import Path; v=tomllib.loads(Path('pyproject.toml').read_text(encoding='utf-8'))['project']['version']; r=json.loads(Path('package.json').read_text(encoding='utf-8'))['version']; assert r==v, (r,v)"`
→ exit 0.

`python scripts/sync_version.py --check` → still exit 0.

### Step 4: Grep for other stale "Console" current-theme claims

```bash
rg -n "Console|dark-first|dim-teal" docs AGENTS.md README.md
```

Fix only claims that present Console as **current**. Leave changelog /
historical roadmap sentences unless they are clearly wrong for operators
today.

## Test plan

- Docs-only; no code tests required.
- Runnable check: version assert command in step 3 + sync `--check`.

## Done criteria

- [ ] `docs/DEVELOPMENT.md` describes Arc light-first, not Console dark-first
- [ ] `docs/SECURITY.md` does not forbid committing `AGENTS.md`
- [ ] Root `package.json` version equals `pyproject.toml` version
- [ ] `python scripts/sync_version.py --check` exit 0
- [ ] No application source changes
- [ ] `plans/README.md` row 006 → DONE

## STOP conditions

- Operator has intentionally rebranded away from Arc since this plan — stop
  and report.
- Extending `sync_version.py` breaks CI `--check` and a second fix attempt
  fails.

## Maintenance notes

- Theme truth order: `globals.css` header → AGENTS.md → DEVELOPMENT.md.
- Reviewer: reject PRs that reintroduce "Console" as current without
  updating tokens.
