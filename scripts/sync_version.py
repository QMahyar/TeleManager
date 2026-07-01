#!/usr/bin/env python3
"""Single source of truth for the TeleManager version.

`pyproject.toml` `[project] version` is canonical. This script propagates it to:
  - apps/web/package.json          (`version` field)
  - src/telemanager/__init__.py    (`__version__` string)

(README.md shows the version via a dynamic shields.io release badge, so it needs
no propagation.)

It also keeps requirements.txt generated from pyproject's `[project] dependencies`
(the release builds — PyInstaller and the Termux package — pip-install from that
file), so the runtime pins live in exactly one place.

Usage:
  python scripts/sync_version.py          # write derived files
  python scripts/sync_version.py --check  # exit 1 if out of sync (CI gate)

Run before releases and from build-release.py so artifacts never ship a
mismatched version. tomllib is stdlib in 3.11+ (our min Python), no new dep.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYPROJECT = ROOT / "pyproject.toml"
PACKAGE_JSON = ROOT / "apps" / "web" / "package.json"
INIT_PY = ROOT / "src" / "telemanager" / "__init__.py"
REQUIREMENTS = ROOT / "requirements.txt"
# Matches: __version__ = "1.2.3"   (single or double quotes)
INIT_VERSION_RE = re.compile(r"(__version__\s*=\s*[\"'])([^\"']+)([\"'])")


def read_canonical_version() -> str:
    with PYPROJECT.open("rb") as fh:
        return tomllib.load(fh)["project"]["version"]


def read_canonical_deps() -> list[str]:
    """Runtime deps from pyproject `[project] dependencies` — the canonical pins."""
    with PYPROJECT.open("rb") as fh:
        return list(tomllib.load(fh)["project"]["dependencies"])


def read_requirements_deps() -> list[str]:
    """Deps as listed in requirements.txt (skipping blanks and comments)."""
    lines = REQUIREMENTS.read_text(encoding="utf-8").splitlines() if REQUIREMENTS.exists() else []
    return [s for s in (ln.strip() for ln in lines) if s and not s.startswith("#")]


def write_requirements(deps: list[str]) -> bool:
    new_text = "".join(f"{dep}\n" for dep in deps)
    if REQUIREMENTS.exists() and REQUIREMENTS.read_text(encoding="utf-8") == new_text:
        return False
    REQUIREMENTS.write_text(new_text, encoding="utf-8")
    return True


def package_json_version() -> str:
    return json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))["version"]


def write_package_json(version: str) -> bool:
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    if data.get("version") == version:
        return False
    data["version"] = version
    PACKAGE_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return True


def read_init_version() -> str | None:
    m = INIT_VERSION_RE.search(INIT_PY.read_text(encoding="utf-8"))
    return m.group(2) if m else None


def write_init(version: str) -> bool:
    text = INIT_PY.read_text(encoding="utf-8")
    new_text, n = INIT_VERSION_RE.subn(rf"\g<1>{version}\g<3>", text, count=1)
    if n == 0 or new_text == text:
        return False
    INIT_PY.write_text(new_text, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if files are out of sync")
    args = parser.parse_args()

    version = read_canonical_version()
    deps = read_canonical_deps()

    if args.check:
        # Detect-only: never write. Compare what's on disk against canonical.
        pj_on_disk = package_json_version()
        init_on_disk = read_init_version()
        deps_on_disk = read_requirements_deps()
        drift = pj_on_disk != version or init_on_disk != version
        if drift:
            print(
                f"Version drift: pyproject={version} "
                f"package.json={pj_on_disk} __init__={init_on_disk}",
                file=sys.stderr,
            )
            print("Run: python scripts/sync_version.py", file=sys.stderr)
            return 1
        if deps_on_disk != deps:
            print(
                f"requirements.txt drift: pyproject deps={deps} requirements.txt={deps_on_disk}",
                file=sys.stderr,
            )
            print("Run: python scripts/sync_version.py", file=sys.stderr)
            return 1
        print(f"Versions in sync: {version}")
        return 0

    pj_changed = write_package_json(version)
    init_changed = write_init(version)
    req_changed = write_requirements(deps)
    print(
        f"Synced version {version} -> package.json{' (changed)' if pj_changed else ''}, "
        f"__init__{' (changed)' if init_changed else ''}, "
        f"requirements.txt{' (changed)' if req_changed else ''}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
