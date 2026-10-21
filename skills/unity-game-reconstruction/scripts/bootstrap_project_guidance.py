#!/usr/bin/env python3
"""Install or update the managed AGENTS.md in a Unity project."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple


MANAGED_BEGIN = "<!-- UNITY_GAME_RECONSTRUCTION:MANAGED:{name}:BEGIN -->"
MANAGED_END = "<!-- UNITY_GAME_RECONSTRUCTION:MANAGED:{name}:END -->"
LEGACY_MANAGED_MARKERS = (
    (
        "<!-- GAME_RESTORATION_WORKFLOW:MANAGED:{name}:BEGIN -->",
        "<!-- GAME_RESTORATION_WORKFLOW:MANAGED:{name}:END -->",
    ),
)
LOCAL_SECTION = """\

## Project-specific additions

Record project paths, evidence and authorized local decisions below this heading.
Do not edit the managed region above.
"""
GUIDANCE_FILES = ("AGENTS.md",)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_regular_file(path: Path, label: str) -> bytes:
    if path.is_symlink():
        raise ValueError(f"Do not use a symlink for {label}: {path}")
    try:
        mode = path.stat().st_mode
    except FileNotFoundError:
        raise ValueError(f"Cannot find {label}: {path}") from None
    if not stat.S_ISREG(mode):
        raise ValueError(f"Use a regular file for {label}: {path}")
    return path.read_bytes()


def validate_unity_root(root: Path) -> Path:
    root = Path(os.path.abspath(os.fspath(root)))
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"project root must be a real directory: {root}")
    required = (root / "Assets", root / "ProjectSettings" / "ProjectVersion.txt")
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise ValueError(
            "The project lacks required Unity paths: " + ", ".join(missing)
        )
    return root


def managed_block(name: str, template: str) -> str:
    return (
        MANAGED_BEGIN.format(name=name)
        + "\n"
        + template.rstrip()
        + "\n"
        + MANAGED_END.format(name=name)
    )


def split_managed(name: str, existing: str) -> Optional[Tuple[str, str, str]]:
    marker_pairs = [(MANAGED_BEGIN, MANAGED_END), *LEGACY_MANAGED_MARKERS]
    detected: List[Tuple[str, str]] = []
    for begin_template, end_template in marker_pairs:
        begin = begin_template.format(name=name)
        end = end_template.format(name=name)
        if begin in existing or end in existing:
            detected.append((begin, end))

    if not detected:
        return None
    if len(detected) > 1:
        raise ValueError(f"{name} has multiple workflow managed marker families")

    begin, end = detected[0]
    begin_index = existing.find(begin)
    end_index = existing.find(end)
    if begin_index < 0 or end_index < 0 or end_index < begin_index:
        raise ValueError(f"Invalid managed markers in {name}")
    if existing.find(begin, begin_index + len(begin)) >= 0 or existing.find(
        end, end_index + len(end)
    ) >= 0:
        raise ValueError(f"{name} has duplicate workflow managed markers")
    end_after = end_index + len(end)
    return existing[:begin_index], existing[begin_index:end_after], existing[end_after:]


def render_new(name: str, template: str) -> str:
    return managed_block(name, template) + LOCAL_SECTION


def render_adopted(name: str, template: str, existing: str) -> str:
    preserved = existing.rstrip()
    suffix = LOCAL_SECTION
    if preserved:
        suffix += "\n### Preserved pre-existing guidance\n\n" + preserved + "\n"
    return managed_block(name, template) + suffix


def atomic_replace(path: Path, content: str, previous_mode: Optional[int]) -> None:
    temporary_name: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(path.parent),
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_name = handle.name
            handle.write(content)
            if not content.endswith("\n"):
                handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_name, previous_mode if previous_mode is not None else 0o644)
        os.replace(temporary_name, path)
        temporary_name = None
    finally:
        if temporary_name:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass


def plan_one(
    name: str,
    template_path: Path,
    target_path: Path,
    adopt_existing: bool,
) -> Tuple[Dict[str, Any], Optional[str], Optional[int]]:
    template_bytes = read_regular_file(template_path, "guidance template")
    try:
        template = template_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"guidance template is not UTF-8: {template_path}") from exc
    result: Dict[str, Any] = {
        "name": name,
        "target": str(target_path),
        "template": str(template_path),
        "template_sha256": sha256_bytes(template_bytes),
    }

    if not target_path.exists() and not target_path.is_symlink():
        result.update({"action": "create", "previous_sha256": None})
        return result, render_new(name, template), None

    existing_bytes = read_regular_file(target_path, "project guidance")
    try:
        existing = existing_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"project guidance is not UTF-8: {target_path}") from exc
    previous_mode = stat.S_IMODE(target_path.stat().st_mode)
    previous_hash = sha256_bytes(existing_bytes)
    result["previous_sha256"] = previous_hash

    parts = split_managed(name, existing)
    if parts is None:
        if not adopt_existing:
            result["action"] = "conflict_unmanaged"
            return result, None, previous_mode
        desired = render_adopted(name, template, existing)
        result["action"] = "adopt_existing"
        return result, desired, previous_mode

    prefix, current_block, suffix = parts
    desired = prefix + managed_block(name, template) + suffix
    if desired.rstrip("\n") == existing.rstrip("\n"):
        result["action"] = "unchanged"
        return result, None, previous_mode
    result["action"] = "update_managed_region"
    result["managed_region_previous_sha256"] = sha256_bytes(current_block.encode("utf-8"))
    return result, desired, previous_mode


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True, help="Unity project root")
    parser.add_argument(
        "--adopt-existing",
        action="store_true",
        help="Preserve unmarked local guidance. Add the managed instructions.",
    )
    parser.add_argument("--check", action="store_true", help="Report drift without writing")
    parser.add_argument(
        "--legacy-rules-reviewed",
        action="store_true",
        help="Confirm manual review and merge of legacy RULES.md. Preserve that file.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        project_root = validate_unity_root(args.project_root)
        legacy_path = project_root / "RULES.md"
        legacy = None
        if legacy_path.exists() or legacy_path.is_symlink():
            legacy = {
                "path": str(legacy_path),
                "sha256": sha256_bytes(read_regular_file(legacy_path, "legacy rules")),
                "reviewed": args.legacy_rules_reviewed,
            }
            if not args.legacy_rules_reviewed:
                print(json.dumps({
                    "status": "legacy_rules_review_required",
                    "project_root": str(project_root),
                    "legacy_rules": legacy,
                    "message": (
                        "Review legacy RULES.md. Merge applicable instructions into AGENTS.md. "
                        "Then use --legacy-rules-reviewed. This tool does not delete the legacy file."
                    ),
                }, ensure_ascii=False, indent=2))
                return 3
        template_root = Path(__file__).resolve().parent.parent / "assets" / "project-guidance"
        plans: List[Tuple[Dict[str, Any], Optional[str], Optional[int]]] = []
        for name in GUIDANCE_FILES:
            plans.append(
                plan_one(
                    name,
                    template_root / name,
                    project_root / name,
                    args.adopt_existing,
                )
            )

        conflicts = [item[0] for item in plans if item[0]["action"] == "conflict_unmanaged"]
        if conflicts:
            report = {
                "status": "conflict",
                "project_root": str(project_root),
                "message": (
                    "The tool preserved unmarked guidance. Inspect it before using --adopt-existing."
                ),
                "files": [item[0] for item in plans],
            }
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 3

        changed = [item for item in plans if item[1] is not None]
        if not args.check:
            for result, desired, previous_mode in changed:
                assert desired is not None
                atomic_replace(Path(result["target"]), desired, previous_mode)
                result["result_sha256"] = sha256_bytes(
                    Path(result["target"]).read_bytes()
                )

        report = {
            "status": "drift" if args.check and changed else "complete",
            "mode": "check" if args.check else "write",
            "project_root": str(project_root),
            "changed_count": len(changed),
            "files": [item[0] for item in plans],
            "legacy_rules": legacy,
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1 if args.check and changed else 0
    except (OSError, ValueError) as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
