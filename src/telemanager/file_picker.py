"""Native OS file/folder picker for the local single-user app.

The UI runs in the operator's default browser, where a normal ``<input type=file>``
deliberately hides absolute paths (it reports ``C:\\fakepath\\name``). Because the
server and the browser are the same machine on ``127.0.0.1``, we can instead open a
real native dialog *server-side* and hand the chosen absolute path back to the page.

Design notes:
- Every backend is spawned as a subprocess via ``asyncio.create_subprocess_exec`` so
  the running uvicorn event loop is never blocked and no GUI toolkit is imported into
  the server process (tkinter in particular is excluded from the frozen build).
- Windows uses Windows PowerShell's WinForms dialogs, which are always present and
  survive PyInstaller packaging. macOS uses ``osascript``; Linux tries ``zenity`` then
  ``kdialog``; a ``tkinter`` subprocess is the last-resort fallback on dev machines.
- A module lock guarantees at most one dialog at a time; a second concurrent request
  is rejected with :class:`PickerBusy` instead of stacking dialogs.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import platform
import shutil
import subprocess
import sys
from typing import Literal

logger = logging.getLogger("telemanager.file_picker")

PathKind = Literal["file", "directory"]

# A forgotten-open dialog must not pin the lock forever; cancel the subprocess
# after this long and treat it as "no selection".
DIALOG_TIMEOUT_SECONDS = 300.0
# Windows: don't flash a console window when spawned from the windowed build.
_CREATE_NO_WINDOW = 0x08000000

_LOCK = asyncio.Lock()


class PickerUnavailable(RuntimeError):
    """No native picker is available on this platform/install."""


class PickerBusy(RuntimeError):
    """A picker dialog is already open for this session."""


async def pick_path(kind: PathKind = "file", title: str | None = None) -> str | None:
    """Open a native picker and return the chosen absolute path.

    Returns ``None`` when the user cancels (or the dialog times out). Raises
    :class:`PickerBusy` if a dialog is already open and :class:`PickerUnavailable`
    when the host has no usable picker.
    """
    if _LOCK.locked():
        raise PickerBusy("A file dialog is already open. Close it first.")
    async with _LOCK:
        system = platform.system()
        prompt = title or ("Select a folder" if kind == "directory" else "Select a file")
        if system == "Windows":
            return await _pick_windows(kind, prompt)
        if system == "Darwin":
            return await _pick_macos(kind, prompt)
        return await _pick_linux(kind, prompt)


async def _run(argv: list[str], *, no_window: bool = False) -> tuple[int, str, str]:
    """Spawn ``argv``, returning ``(returncode, stdout, stderr)`` stripped of trailing
    whitespace. Raises ``FileNotFoundError`` if the executable is missing and returns
    ``(-1, "", "")`` on timeout (after terminating the process).

    Prefers the non-blocking asyncio subprocess. Windows' ``SelectorEventLoop`` — which
    uvicorn selects whenever it forks (``--reload`` or ``workers > 1``) — cannot spawn
    subprocesses and raises ``NotImplementedError``; in that case the child runs on a
    worker thread instead, so the picker works under any event loop without blocking it.
    """
    try:
        return await _run_async(argv, no_window=no_window)
    except NotImplementedError:
        return await asyncio.to_thread(_run_blocking, argv, no_window)


async def _run_async(argv: list[str], *, no_window: bool) -> tuple[int, str, str]:
    kwargs: dict[str, object] = {
        "stdout": asyncio.subprocess.PIPE,
        "stderr": asyncio.subprocess.PIPE,
    }
    if no_window and sys.platform == "win32":
        kwargs["creationflags"] = _CREATE_NO_WINDOW
    process = await asyncio.create_subprocess_exec(*argv, **kwargs)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=DIALOG_TIMEOUT_SECONDS)
    except TimeoutError:
        logger.warning("File dialog timed out; cancelling.")
        try:
            process.terminate()
        except ProcessLookupError:
            pass
        return -1, "", ""
    return (
        process.returncode or 0,
        stdout.decode("utf-8", "replace").strip(),
        stderr.decode("utf-8", "replace").strip(),
    )


def _run_blocking(argv: list[str], no_window: bool) -> tuple[int, str, str]:
    """Blocking fallback for event loops without subprocess support (Windows
    ``SelectorEventLoop``). Invoked via :func:`asyncio.to_thread`, so the dialog wait
    happens on a worker thread and never blocks the server's event loop."""
    creationflags = _CREATE_NO_WINDOW if no_window and sys.platform == "win32" else 0
    try:
        completed = subprocess.run(
            argv,
            capture_output=True,
            timeout=DIALOG_TIMEOUT_SECONDS,
            creationflags=creationflags,
            check=False,
        )
    except subprocess.TimeoutExpired:
        logger.warning("File dialog timed out; cancelling.")
        return -1, "", ""
    return (
        completed.returncode or 0,
        completed.stdout.decode("utf-8", "replace").strip(),
        completed.stderr.decode("utf-8", "replace").strip(),
    )


# ---------------------------------------------------------------------------
# Windows — Windows PowerShell + System.Windows.Forms
# ---------------------------------------------------------------------------

# A topmost, hidden owner form pulls the dialog in front of the browser; without an
# owner the dialog can open behind the active window. The script writes only the
# selected path to stdout (nothing on cancel), so empty stdout == cancelled.
_WIN_SCRIPT = """
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$owner = New-Object System.Windows.Forms.Form -Property @{{
  TopMost = $true
  ShowInTaskbar = $false
  WindowState = 'Minimized'
}}
{dialog}
if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {{
  [Console]::Out.Write({result})
}}
$owner.Dispose()
"""

_WIN_FILE_DIALOG = """
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '{title}'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
"""

_WIN_DIR_DIALOG = """
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '{title}'
$dialog.ShowNewFolderButton = $true
"""


def _ps_quote(value: str) -> str:
    """Escape a string for a PowerShell single-quoted literal."""
    return value.replace("'", "''")


async def _pick_windows(kind: PathKind, title: str) -> str | None:
    safe_title = _ps_quote(title)
    if kind == "directory":
        dialog = _WIN_DIR_DIALOG.format(title=safe_title)
        result = "$dialog.SelectedPath"
    else:
        dialog = _WIN_FILE_DIALOG.format(title=safe_title)
        result = "$dialog.FileName"
    script = _WIN_SCRIPT.format(dialog=dialog, result=result)
    # -EncodedCommand (UTF-16LE + base64) sidesteps every shell-quoting pitfall.
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    code, stdout, _ = await _run(
        [
            "powershell.exe",
            "-NoProfile",
            "-STA",
            "-WindowStyle",
            "Hidden",
            "-EncodedCommand",
            encoded,
        ],
        no_window=True,
    )
    if code != 0:
        return None
    return stdout or None


# ---------------------------------------------------------------------------
# macOS — osascript
# ---------------------------------------------------------------------------


async def _pick_macos(kind: PathKind, title: str) -> str | None:
    chooser = "choose folder" if kind == "directory" else "choose file"
    # osascript exits non-zero on cancel; POSIX path yields an absolute path.
    script = f'POSIX path of ({chooser} with prompt {_osa_quote(title)})'
    code, stdout, _ = await _run(["osascript", "-e", script])
    if code != 0:
        return None
    return stdout or None


def _osa_quote(value: str) -> str:
    """Quote a string as an AppleScript string literal."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


# ---------------------------------------------------------------------------
# Linux — zenity, then kdialog, then a tkinter subprocess
# ---------------------------------------------------------------------------


async def _pick_linux(kind: PathKind, title: str) -> str | None:
    if shutil.which("zenity"):
        argv = ["zenity", "--file-selection", f"--title={title}"]
        if kind == "directory":
            argv.append("--directory")
        code, stdout, _ = await _run(argv)
        return stdout or None if code == 0 else None
    if shutil.which("kdialog"):
        flag = "--getexistingdirectory" if kind == "directory" else "--getopenfilename"
        code, stdout, _ = await _run(["kdialog", flag])
        return stdout or None if code == 0 else None
    return await _pick_tkinter(kind, title)


# Run tkinter in a *subprocess* (never in the server's event loop) so a missing or
# broken Tk install just fails this fallback instead of destabilising the server.
_TK_SCRIPT = """
import sys
try:
    import tkinter
    from tkinter import filedialog
except Exception:
    sys.exit(2)
root = tkinter.Tk()
root.withdraw()
root.attributes('-topmost', True)
kind = sys.argv[1]
title = sys.argv[2]
path = filedialog.askdirectory(title=title) if kind == 'directory' else filedialog.askopenfilename(title=title)
root.destroy()
if path:
    sys.stdout.write(path)
"""


async def _pick_tkinter(kind: PathKind, title: str) -> str | None:
    code, stdout, _ = await _run([sys.executable, "-c", _TK_SCRIPT, kind, title])
    if code == 2:
        raise PickerUnavailable(
            "No native file picker is available on this system. Install zenity or "
            "kdialog, or type the path manually."
        )
    if code != 0:
        return None
    return stdout or None
