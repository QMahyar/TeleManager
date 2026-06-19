from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
RELEASE = ROOT / "release"


def run(command: list[str], cwd: Path = ROOT) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def build_frontend(skip: bool) -> None:
    if skip:
        return
    npm = "npm.cmd" if os.name == "nt" else "npm"
    web = ROOT / "apps" / "web"
    install = "ci" if (web / "package-lock.json").exists() else "install"
    run([npm, "--prefix", "apps/web", install])
    run([npm, "--prefix", "apps/web", "run", "build"])


def build_pyinstaller(skip_install: bool) -> Path:
    if not skip_install:
        run([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])
        run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "pyinstaller==6.11.1"])
    shutil.rmtree(DIST / "telemanager", ignore_errors=True)
    shutil.rmtree(ROOT / "build", ignore_errors=True)
    run(["pyinstaller", "--noconfirm", "--clean", "telemanager.spec"])
    return DIST / "telemanager"


def add_readme(bundle: Path) -> None:
    (bundle / "README.txt").write_text(
        "TeleManager\n\n"
        "Run telemanager.exe on Windows, or ./telemanager on Linux/macOS.\n"
        "The app opens http://127.0.0.1:8000 in your default browser.\n"
        "Use the Exit TeleManager button to stop the local server.\n\n"
        "Local data is stored in data/ and sessions/ next to the executable.\n"
        "Keep sessions/ private; .session files are authentication material.\n",
        encoding="utf-8",
    )


def archive(bundle: Path, target: str) -> Path:
    RELEASE.mkdir(exist_ok=True)
    if sys.platform == "win32":
        output = RELEASE / f"telemanager-{target}.zip"
        if output.exists():
            output.unlink()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in bundle.rglob("*"):
                zf.write(path, Path("telemanager") / path.relative_to(bundle))
        return output

    output = RELEASE / f"telemanager-{target}.tar.gz"
    if output.exists():
        output.unlink()
    with tarfile.open(output, "w:gz") as tf:
        tf.add(bundle, arcname="telemanager")
    return output


def build_termux_package() -> Path:
    RELEASE.mkdir(exist_ok=True)
    staging = ROOT / "build" / "telemanager-termux" / "telemanager"
    shutil.rmtree(staging.parent, ignore_errors=True)
    staging.mkdir(parents=True)
    for name in ["src", "requirements.txt", "pyproject.toml"]:
        source = ROOT / name
        dest = staging / name
        if source.is_dir():
            shutil.copytree(source, dest)
        else:
            shutil.copy2(source, dest)
    shutil.copytree(ROOT / "apps" / "web" / "dist", staging / "web")
    bin_dir = staging / "bin"
    bin_dir.mkdir()
    (bin_dir / "telemanager").write_text(
        "#!/data/data/com.termux/files/usr/bin/bash\n"
        "set -euo pipefail\n"
        'APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"\n'
        'cd "$APP_DIR"\n'
        "if [ ! -d .venv ]; then\n"
        "  python -m venv .venv\n"
        "  . .venv/bin/activate\n"
        "  python -m pip install --upgrade pip\n"
        "  python -m pip install -r requirements.txt\n"
        "else\n"
        "  . .venv/bin/activate\n"
        "fi\n"
        'export TELEMANAGER_FRONTEND_DIST_DIR="$APP_DIR/web"\n'
        'export TELEMANAGER_DATA_DIR="$APP_DIR/data"\n'
        'export TELEMANAGER_SESSIONS_DIR="$APP_DIR/sessions"\n'
        "python -m telemanager.launcher\n",
        encoding="utf-8",
    )
    (bin_dir / "telemanager").chmod(0o755)
    (staging / "install-termux-alias.sh").write_text(
        "#!/data/data/com.termux/files/usr/bin/bash\n"
        "set -euo pipefail\n"
        'APP_DIR="$(cd "$(dirname "$0")" && pwd)"\n'
        'mkdir -p "$HOME/bin"\n'
        'ln -sf "$APP_DIR/bin/telemanager" "$HOME/bin/telemanager"\n'
        'if ! printf \'%s\' ":$PATH:" | grep -q ":$HOME/bin:"; then\n'
        '  echo \'export PATH="$HOME/bin:$PATH"\' >> "$HOME/.bashrc"\n'
        "fi\n"
        "echo 'Installed. Restart Termux or run: export PATH=\"$HOME/bin:$PATH\"'\n"
        "echo 'Then start with: telemanager'\n",
        encoding="utf-8",
    )
    (staging / "install-termux-alias.sh").chmod(0o755)
    output = RELEASE / "telemanager-termux-arm64.tar.gz"
    if output.exists():
        output.unlink()
    with tarfile.open(output, "w:gz") as tf:
        tf.add(staging, arcname="telemanager")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default=f"{sys.platform}-{platform.machine() or 'unknown'}")
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--termux", action="store_true")
    parser.add_argument("--skip-install", action="store_true")
    args = parser.parse_args()

    build_frontend(args.skip_frontend)
    if args.termux:
        output = build_termux_package()
    else:
        bundle = build_pyinstaller(args.skip_install)
        add_readme(bundle)
        output = archive(bundle, args.target)
    print(f"Built {output}")


if __name__ == "__main__":
    main()
