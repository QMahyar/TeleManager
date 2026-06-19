#!/usr/bin/env python3
"""Single source of truth for the TeleManager version.

`pyproject.toml` `[project] version` is canonical. This script propagates it to:
  - apps/web/package.json  (`version` field)
  - README.md              (`Current release: vX.Y.Z` line)

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
README = ROOT / "README.md"
# Matches: Current release: **`v1.2.3`**   (any semver, optional prerelease)
# Group 2 is the bare version (e.g. 1.2.3), group 1+3 are the surrounding markdown.
README_VERSION_RE = re.compile(r"(Current release:\s*\*\*`v)([^`]+)(`\*\*)")


def read_canonical_version() -> str:
    with PYPROJECT.open("rb") as fh:
        return tomllib.load(fh)["project"]["version"]


def package_json_version() -> str:
    return json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))["version"]


def write_package_json(version: str) -> bool:
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    if data.get("version") == version:
        return False
    data["version"] = version
    PACKAGE_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return True


def read_readme_version() -> str | None:
    m = README_VERSION_RE.search(README.read_text(encoding="utf-8"))
    return m.group(2) if m else None


def write_readme(version: str) -> bool:
    text = README.read_text(encoding="utf-8")
    new_text, n = README_VERSION_RE.subn(rf"\g<1>{version}\g<3>", text, count=1)
    if n == 0 or new_text == text:
        return False
    README.write_text(new_text, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if files are out of sync")
    args = parser.parse_args()

    version = read_canonical_version()

    if args.check:
        # Detect-only: never write. Compare what's on disk against canonical.
        pj_on_disk = package_json_version()
        readme_on_disk = read_readme_version()
        drift = pj_on_disk != version or readme_on_disk != version
        if drift:
            print(
                f"Version drift: pyproject={version} " f"package.json={pj_on_disk} readme={readme_on_disk}",
                file=sys.stderr,
            )
            print("Run: python scripts/sync_version.py", file=sys.stderr)
            return 1
        print(f"Versions in sync: {version}")
        return 0

    pj_changed = write_package_json(version)
    readme_changed = write_readme(version)
    print(
        f"Synced version {version} -> package.json{' (changed)' if pj_changed else ''}, "
        f"README{' (changed)' if readme_changed else ''}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
