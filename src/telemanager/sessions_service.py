from __future__ import annotations

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
from .config import EXPORTS_DIR, SESSIONS_DIR, ensure_dirs

SESSION_SLUG_RE = re.compile(r"^[a-zA-Z0-9_-]{3,64}$")


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


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


async def import_session_file(manager: AccountManager, upload: UploadFile, label: str) -> AccountRecord:
    ensure_dirs()
    original_name = Path(upload.filename or "imported.session").name
    if not original_name.endswith(".session"):
        raise ValueError("Only .session files can be imported.")

    account_id = str(uuid.uuid4())
    session_name = safe_session_slug(f"{label or original_name.removesuffix('.session')}-{account_id[:8]}")
    destination = session_file_path(session_name)
    if destination.exists():
        raise ValueError("A session with this generated name already exists.")

    with destination.open("wb") as output:
        shutil.copyfileobj(upload.file, output)

    account = AccountRecord(
        id=account_id,
        label=label.strip() or original_name.removesuffix(".session"),
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
    except Exception as exc:
        account.last_error = str(exc)
        manager._save_accounts()
    return account


def export_sessions(manager: AccountManager, account_ids: list[str], redact_phone: bool = True) -> Path:
    ensure_dirs()
    if not account_ids:
        raise ValueError("Select at least one account to export.")

    export_path = EXPORTS_DIR / f"telemanager-export-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.zip"
    metadata = []
    with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for account_id in account_ids:
            account = manager._get_account(account_id)
            source = session_file_path(account.session_name)
            if not source.exists():
                raise ValueError(f"Session file missing for {account.label}.")
            archive.write(source, f"sessions/{source.name}")
            record = asdict(account)
            if redact_phone:
                record["phone"] = ""
            metadata.append(record)
        archive.writestr("accounts-export.json", json.dumps(metadata, indent=2, sort_keys=True))
        archive.writestr(
            "README-SECURITY.txt",
            "TeleManager session exports contain Telegram authentication material. Keep this ZIP private.\n",
        )
    return export_path


def rename_account(manager: AccountManager, account_id: str, label: str) -> AccountRecord:
    account = manager._get_account(account_id)
    clean_label = label.strip()
    if not clean_label:
        raise ValueError("Label cannot be empty.")
    account.label = clean_label
    manager._save_accounts()
    return account


def rename_session_file(manager: AccountManager, account_id: str, session_name: str) -> AccountRecord:
    validate_session_slug(session_name)
    account = manager._get_account(account_id)
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
    path = session_file_path(account.session_name)
    journal = path.with_name(f"{path.name}-journal")
    if path.exists():
        path.unlink()
    if journal.exists():
        journal.unlink()
    manager.accounts.pop(account.id, None)
    manager._save_accounts()
