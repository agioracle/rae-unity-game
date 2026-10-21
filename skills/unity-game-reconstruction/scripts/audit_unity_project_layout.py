#!/usr/bin/env python3
"""Audit a Unity project against the reconstruction workspace and layout boundary."""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from pathlib import Path, PurePosixPath
from typing import Optional, Sequence


REQUIRED_DIRS = ("Assets/_Project",)
ALLOWED_ASSETS_ROOT = {"_Project", "Plugins", "ThirdParty", "StreamingAssets"}
EVIDENCE_NAMES = {
    "recovered",
    "00_original",
    "01_inventory",
    "02_container_leaves",
    "03_android_raw",
    "04_unity_raw",
    "05_indexes",
    "06_compat",
    "analysis_tools",
    "replication_kit",
    "validation",
    "08_validation",
}


def real_directory(path: Path, label: str) -> Path:
    path = Path(os.path.abspath(os.fspath(path)))
    if path.is_symlink() or not path.is_dir():
        raise ValueError(f"{label} must be a real directory: {path}")
    return path


def validate_project(root: Path) -> Path:
    root = real_directory(root, "project root")
    required = (root / "Assets", root / "ProjectSettings" / "ProjectVersion.txt")
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise ValueError("not a Unity project. Missing: " + ", ".join(missing))
    return root


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument(
        "--require-dir",
        action="append",
        default=[],
        help="Require an Assets ownership directory supported by evidence or agreement. Repeat as needed.",
    )
    parser.add_argument(
        "--create-missing",
        action="store_true",
        help="Create required directories only. Never move or delete assets.",
    )
    return parser.parse_args(argv)


def required_directories(values: Sequence[str]) -> Sequence[str]:
    required = list(REQUIRED_DIRS)
    for value in values:
        path = PurePosixPath(value)
        parts = path.parts
        if (
            path.is_absolute()
            or ".." in parts
            or "\\" in value
            or len(parts) < 2
            or parts[0] != "Assets"
            or parts[1] not in ALLOWED_ASSETS_ROOT
        ):
            raise ValueError(f"required directory must be within an allowed Assets owner: {value}")
        required.append(path.as_posix())
    return list(dict.fromkeys(required))


def check_directory_chain(root: Path, relative: str) -> None:
    path = root
    for part in PurePosixPath(relative).parts:
        path = path / part
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError(f"required directory path is not a real directory: {path}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        root = validate_project(args.project_root)
        required = required_directories(args.require_dir)
        for relative in required:
            check_directory_chain(root, relative)
        assets = root / "Assets"
        evidence_candidates = []
        for base in (root, assets, root / "Packages", assets / "StreamingAssets"):
            if not base.is_dir() or base.is_symlink():
                continue
            evidence_candidates.extend(base / name for name in EVIDENCE_NAMES)
        evidence_inside_project = sorted(
            str(path.relative_to(root))
            for path in evidence_candidates
            if path.is_dir() and not path.is_symlink()
        )
        created = []
        if args.create_missing:
            for relative in required:
                path = root / relative
                if path.exists() and (path.is_symlink() or not stat.S_ISDIR(path.stat().st_mode)):
                    raise ValueError(f"required directory path is not a real directory: {path}")
                if not path.exists():
                    path.mkdir(parents=True)
                    created.append(relative)

        missing = [relative for relative in required if not (root / relative).is_dir()]
        unexpected = sorted(
            child.name
            for child in assets.iterdir()
            if child.is_dir()
            and not child.is_symlink()
            and child.name not in ALLOWED_ASSETS_ROOT
        )
        report = {
            "status": "pass" if not missing and not unexpected and not evidence_inside_project else "issues",
            "project_root": str(root),
            "created": created,
            "required_directories": required,
            "missing_required_directories": missing,
            "unexpected_assets_root_directories": unexpected,
            "evidence_directories_inside_project": evidence_inside_project,
            "notes": [
                "Unexpected directories require review. This tool never moves or deletes assets.",
                "Record justified exceptions in the restoration ledger.",
                "The tool requires feature directories only when you specify them with --require-dir.",
            ],
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["status"] == "pass" else 1
    except (OSError, ValueError) as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
