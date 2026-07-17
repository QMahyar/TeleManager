from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


def _module():
    path = Path(__file__).parents[1] / "scripts" / "sync_version.py"
    spec = importlib.util.spec_from_file_location("sync_version_test", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _setup(module, tmp_path: Path, monkeypatch, *, root="0", root_lock="0", web_lock="0"):
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text('[project]\nversion = "1.2.3"\ndependencies = ["dep==1"]\n', encoding="utf-8")
    paths = {
        "ROOT_PACKAGE_JSON": tmp_path / "package.json",
        "ROOT_PACKAGE_LOCK": tmp_path / "package-lock.json",
        "PACKAGE_JSON": tmp_path / "web-package.json",
        "PACKAGE_LOCK": tmp_path / "web-package-lock.json",
        "INIT_PY": tmp_path / "__init__.py",
        "REQUIREMENTS": tmp_path / "requirements.txt",
    }
    paths["ROOT_PACKAGE_JSON"].write_text(json.dumps({"name": "root", "version": root}), encoding="utf-8")
    paths["ROOT_PACKAGE_LOCK"].write_text(
        json.dumps({"version": root_lock, "packages": {"": {"version": root_lock}}, "kept": 1}), encoding="utf-8"
    )
    paths["PACKAGE_JSON"].write_text(json.dumps({"name": "web", "version": "1.2.3"}), encoding="utf-8")
    paths["PACKAGE_LOCK"].write_text(
        json.dumps({"version": web_lock, "packages": {"": {"version": web_lock}}, "kept": 2}), encoding="utf-8"
    )
    paths["INIT_PY"].write_text('__version__ = "0"\n', encoding="utf-8")
    paths["REQUIREMENTS"].write_text("old==1\n", encoding="utf-8")
    monkeypatch.setattr(module, "PYPROJECT", pyproject)
    for name, path in paths.items():
        monkeypatch.setattr(module, name, path)
    return paths


def test_check_detects_web_lock_drift(tmp_path, monkeypatch):
    module = _module()
    _setup(module, tmp_path, monkeypatch, root="1.2.3", root_lock="1.2.3", web_lock="0")
    monkeypatch.setattr(sys, "argv", ["sync_version.py", "--check"])
    assert module.main() == 1


def test_check_detects_root_metadata_drift(tmp_path, monkeypatch):
    module = _module()
    _setup(module, tmp_path, monkeypatch, root="0", root_lock="0", web_lock="1.2.3")
    monkeypatch.setattr(sys, "argv", ["sync_version.py", "--check"])
    assert module.main() == 1


def test_apply_updates_every_target_then_check_passes(tmp_path, monkeypatch):
    module = _module()
    paths = _setup(module, tmp_path, monkeypatch)
    monkeypatch.setattr(sys, "argv", ["sync_version.py"])
    assert module.main() == 0

    for name in ("ROOT_PACKAGE_JSON", "ROOT_PACKAGE_LOCK", "PACKAGE_JSON", "PACKAGE_LOCK"):
        data = json.loads(paths[name].read_text(encoding="utf-8"))
        assert data["version"] == "1.2.3"
        if "packages" in data:
            assert data["packages"][""]["version"] == "1.2.3"
    assert json.loads(paths["ROOT_PACKAGE_LOCK"].read_text(encoding="utf-8"))["kept"] == 1
    assert json.loads(paths["PACKAGE_LOCK"].read_text(encoding="utf-8"))["kept"] == 2
    assert paths["INIT_PY"].read_text(encoding="utf-8") == '__version__ = "1.2.3"\n'
    assert paths["REQUIREMENTS"].read_text(encoding="utf-8") == "dep==1\n"

    monkeypatch.setattr(sys, "argv", ["sync_version.py", "--check"])
    assert module.main() == 0
