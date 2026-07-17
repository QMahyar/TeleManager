from __future__ import annotations

import asyncio
import json
import re
import shutil
import uuid
import zipfile
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from fastapi import UploadFile

from .accounts import AccountManager, AccountRecord
from .config import AVATARS_DIR, EXPORTS_DIR, SESSIONS_DIR, ensure_dirs, now_iso

PHOTOS_MODES = frozenset({"default", "on", "off"})
MAX_SESSION_IMPORT_FILES = 25
MAX_SESSION_IMPORT_BYTES = 32 * 1024 * 1024
SESSION_IMPORT_CHUNK_BYTES = 1024 * 1024

SESSION_SLUG_RE = re.compile(r"^[a-zA-Z0-9_-]{3,64}$")


def safe_session_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-")
    if not slug:
        slug = f"session-{uuid.uuid4().hex[:8]}"
    return slug[:64]


def session_file_path(session_name: str) -> Path:
    return SESSIONS_DIR / f"{session_name}.session"


def validate_session_slug(session_name: str) -> None:
    if not SESSION_SLUG_RE.fullmatch(session_name):
        raise ValueError("Session filename must be 3-64 characters using letters, numbers, hyphen, or underscore.")


def display_name_from_account(account: AccountRecord, fallback: str) -> str:
    """Human label for an imported account: Telegram @username, else first+last
    name, else the provided fallback (the uploaded filename stem)."""
    full_name = " ".join(part for part in [account.first_name, account.last_name] if part).strip()
    return account.username or full_name or fallback


def _copy_session_upload(upload: UploadFile, output) -> None:
    total = 0
    while True:
        chunk = upload.file.read(min(SESSION_IMPORT_CHUNK_BYTES, MAX_SESSION_IMPORT_BYTES - total + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_SESSION_IMPORT_BYTES:
            raise ValueError(f"Session file exceeds the {MAX_SESSION_IMPORT_BYTES // (1024 * 1024)} MiB limit.")
        output.write(chunk)
    if total == 0:
        raise ValueError("Session file cannot be empty.")


async def import_session_file(manager: AccountManager, upload: UploadFile, label: str | None = None) -> AccountRecord:
    ensure_dirs()
    original_name = Path(upload.filename or "imported.session").name
    if not original_name.endswith(".session"):
        raise ValueError("Only .session files can be imported.")

    explicit_label = (label or "").strip()
    original_stem = original_name.removesuffix(".session")
    account_id = str(uuid.uuid4())
    session_name = safe_session_slug(f"{explicit_label or original_stem}-{account_id[:8]}")
    destination = session_file_path(session_name)
    if destination.exists():
        raise ValueError("A session with this generated name already exists.")

    try:
        with destination.open("wb") as output:
            _copy_session_upload(upload, output)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    account = AccountRecord(
        id=account_id,
        label=explicit_label or original_stem,
        phone="",
        session_name=session_name,
        authorized=False,
        status="stopped",
        source="import",
        created_at=now_iso(),
    )
    manager.accounts[account.id] = account
    manager._save_accounts()

    try:
        await manager.validate_account(account.id)
        # Auto-name from the real Telegram identity unless an explicit label was
        # given. validate_account has already fetched username/first/last name.
        if not explicit_label:
            account.label = display_name_from_account(account, original_stem)
            manager._save_accounts()
    except Exception as exc:
        account.last_error = str(exc)
        manager._save_accounts()
    return account


async def import_session_files(manager: AccountManager, uploads: list[UploadFile]) -> dict:
    """Batch-import .session files. Each is copied, validated, and auto-named to
    its real Telegram name. Returns imported records (some may carry last_error
    if validation failed) plus files that could not be imported at all."""
    imported: list[AccountRecord] = []
    failed: list[dict] = []
    for upload in uploads:
        result = (await asyncio.gather(import_session_file(manager, upload, None), return_exceptions=True))[0]
        if isinstance(result, ValueError):
            failed.append({"filename": upload.filename or "unknown", "error": str(result)})
        elif isinstance(result, BaseException):
            raise result
        else:
            imported.append(result)
    return {"imported": imported, "failed": failed}


def export_sessions(manager: AccountManager, account_ids: list[str], redact_phone: bool = True) -> Path:
    ensure_dirs()
    if not account_ids:
        raise ValueError("Select at least one account to export.")
    if len(set(account_ids)) != len(account_ids):
        raise ValueError("Each account may be exported only once.")

    selected = []
    metadata = []
    for account_id in account_ids:
        account = manager._get_account(account_id)
        source = session_file_path(account.session_name)
        if not source.is_file():
            raise ValueError(f"Session file missing for {account.label}.")
        selected.append((account, source))
        record = asdict(account)
        if redact_phone:
            record["phone"] = ""
        metadata.append(record)

    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    suffix = uuid.uuid4().hex[:8]
    export_path = EXPORTS_DIR / f"telemanager-export-{timestamp}-{suffix}.zip"
    temp_path = EXPORTS_DIR / f".{export_path.name}.tmp-{uuid.uuid4().hex[:8]}"
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for _account, source in selected:
                archive.write(source, f"sessions/{source.name}")
            archive.writestr("accounts-export.json", json.dumps(metadata, indent=2, sort_keys=True))
            archive.writestr(
                "README-SECURITY.txt",
                "TeleManager session exports contain Telegram authentication material. Keep this ZIP private.\n",
            )
        temp_path.replace(export_path)
        return export_path
    finally:
        temp_path.unlink(missing_ok=True)


def rename_account(manager: AccountManager, account_id: str, label: str) -> AccountRecord:
    account = manager._get_account(account_id)
    clean_label = label.strip()
    if not clean_label:
        raise ValueError("Label cannot be empty.")
    account.label = clean_label
    manager._save_accounts()
    return account


def set_account_photos_mode(manager: AccountManager, account_id: str, photos_mode: str) -> AccountRecord:
    """Set a per-account dialog-photo override ("default" | "on" | "off")."""
    if photos_mode not in PHOTOS_MODES:
        raise ValueError("photos_mode must be one of: default, on, off.")
    account = manager._get_account(account_id)
    account.photos_mode = photos_mode
    manager._save_accounts()
    return account


def rename_session_file(manager: AccountManager, account_id: str, session_name: str) -> AccountRecord:
    validate_session_slug(session_name)
    account = manager._get_account(account_id)
    if manager.is_account_busy(account.id):
        raise ValueError("This account is busy with a running queue or schedule. Stop it before renaming the session.")
    old_path = session_file_path(account.session_name)
    new_path = session_file_path(session_name)
    if new_path.exists():
        raise ValueError("A session file with that name already exists.")
    if not old_path.exists():
        raise ValueError("Current session file was not found.")

    old_path.rename(new_path)
    old_journal = old_path.with_name(f"{old_path.name}-journal")
    if old_journal.exists():
        old_journal.rename(new_path.with_name(f"{new_path.name}-journal"))
    account.session_name = session_name
    manager._save_accounts()
    return account


def delete_local_session(manager: AccountManager, account_id: str) -> None:
    account = manager._get_account(account_id)
    if manager.is_account_busy(account.id):
        raise ValueError("This account is busy with a running queue or schedule. Stop it before deleting the session.")
    path = session_file_path(account.session_name)
    journal = path.with_name(f"{path.name}-journal")
    if path.exists():
        path.unlink()
    if journal.exists():
        journal.unlink()
    # Drop the cached dialog avatars for this account so a deleted session leaves
    # no orphaned local image cache behind.
    avatar_cache = AVATARS_DIR / account.id
    if avatar_cache.is_dir():
        try:
            shutil.rmtree(avatar_cache)
        except OSError:
            pass
    manager.accounts.pop(account.id, None)
    manager._save_accounts()
