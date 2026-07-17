#!/usr/bin/env python3
"""Sync canonical pyproject version/dependencies to runtime and npm metadata."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYPROJECT = ROOT / "pyproject.toml"
ROOT_PACKAGE_JSON = ROOT / "package.json"
ROOT_PACKAGE_LOCK = ROOT / "package-lock.json"
PACKAGE_JSON = ROOT / "apps" / "web" / "package.json"
PACKAGE_LOCK = ROOT / "apps" / "web" / "package-lock.json"
INIT_PY = ROOT / "src" / "telemanager" / "__init__.py"
REQUIREMENTS = ROOT / "requirements.txt"
INIT_VERSION_RE = re.compile(r"(__version__\s*=\s*[\"'])([^\"']+)([\"'])")


def _project() -> dict:
    with PYPROJECT.open("rb") as fh:
        return tomllib.load(fh)["project"]


def read_canonical_version() -> str:
    return _project()["version"]


def read_canonical_deps() -> list[str]:
    return list(_project()["dependencies"])


def read_requirements_deps() -> list[str]:
    lines = REQUIREMENTS.read_text(encoding="utf-8").splitlines() if REQUIREMENTS.exists() else []
    return [line.strip() for line in lines if line.strip() and not line.lstrip().startswith("#")]


def write_requirements(deps: list[str]) -> bool:
    return _write_text(REQUIREMENTS, "".join(f"{dep}\n" for dep in deps))


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read JSON metadata from {path.name}.") from exc


def _write_text(path: Path, text: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def _versions(path: Path, lockfile: bool = False) -> list[str | None]:
    data = _read_json(path)
    values = [data.get("version")]
    if lockfile and "" in data.get("packages", {}):
        values.append(data["packages"][""].get("version"))
    return values


def _write_json_version(path: Path, version: str, lockfile: bool = False) -> bool:
    data = _read_json(path)
    data["version"] = version
    if lockfile and "" in data.get("packages", {}):
        data["packages"][""]["version"] = version
    return _write_text(path, json.dumps(data, indent=2) + "\n")


def package_json_version() -> str | None:
    return _versions(PACKAGE_JSON)[0]


def write_package_json(version: str) -> bool:
    return _write_json_version(PACKAGE_JSON, version)


def read_init_version() -> str | None:
    match = INIT_VERSION_RE.search(INIT_PY.read_text(encoding="utf-8"))
    return match.group(2) if match else None


def write_init(version: str) -> bool:
    text = INIT_PY.read_text(encoding="utf-8")
    new_text, count = INIT_VERSION_RE.subn(rf"\g<1>{version}\g<3>", text, count=1)
    return count > 0 and _write_text(INIT_PY, new_text)


def _tracked_versions() -> dict[str, list[str | None]]:
    return {
        "root package.json": _versions(ROOT_PACKAGE_JSON),
        "root package-lock.json": _versions(ROOT_PACKAGE_LOCK, True),
        "web package.json": _versions(PACKAGE_JSON),
        "web package-lock.json": _versions(PACKAGE_LOCK, True),
        "__init__.py": [read_init_version()],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if files are out of sync")
    args = parser.parse_args()
    version = read_canonical_version()
    deps = read_canonical_deps()

    if args.check:
        drift = {name: values for name, values in _tracked_versions().items() if any(v != version for v in values)}
        if drift or read_requirements_deps() != deps:
            print(f"Version/dependency drift from pyproject {version}: {drift}", file=sys.stderr)
            print("Run: python scripts/sync_version.py", file=sys.stderr)
            return 1
        print(f"Versions in sync: {version}")
        return 0

    changed = [
        _write_json_version(ROOT_PACKAGE_JSON, version),
        _write_json_version(ROOT_PACKAGE_LOCK, version, True),
        write_package_json(version),
        _write_json_version(PACKAGE_LOCK, version, True),
        write_init(version),
        write_requirements(deps),
    ]
    print(f"Synced version {version} and requirements ({sum(changed)} file(s) changed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
