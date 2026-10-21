#!/usr/bin/env python3
"""Safely extract APK leaves verified by the inventory from XAPK, APKS, APKM, or ZIP containers."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Sequence, Tuple

from package_safety import (
    StableInput,
    create_private_output_directory,
    preflight_central_directory,
    validate_zip_members,
)


MANIFEST_NAME = "_container_leaves_manifest.json"
INCOMPLETE_NAME = "_EXTRACT_INCOMPLETE"


def normalize_member(raw: str) -> str:
    if "\x00" in raw:
        raise ValueError("ZIP member contains NUL")
    path = PurePosixPath(raw.replace("\\", "/"))
    if path.is_absolute() or not path.parts or path.parts[0].endswith(":"):
        raise ValueError(f"unsafe ZIP member path: {raw!r}")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"unsafe ZIP member path: {raw!r}")
    return path.as_posix()


def is_zip_symlink(info: zipfile.ZipInfo) -> bool:
    return stat.S_ISLNK((info.external_attr >> 16) & 0xFFFF)


def load_inventory(path: Path) -> Tuple[Dict[str, Any], str]:
    if path.is_symlink() or not path.is_file():
        raise ValueError("inventory must be a regular non-symlink file")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid inventory JSON: {exc}") from exc
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("Use schema_version 1 for the inventory.")
    if value.get("status") != "complete" or value.get("error_count") not in (None, 0):
        raise ValueError("inventory is partial or contains errors")
    if not isinstance(value.get("containers"), list):
        raise ValueError("inventory containers must be a list")
    return value, digest


def nested_inventory_map(inventory: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    for item in inventory["containers"]:
        if not isinstance(item, dict) or item.get("source_kind") != "nested_apk":
            continue
        label = item.get("label")
        digest = item.get("sha256")
        if not isinstance(label, str) or "!/" not in label or not isinstance(digest, str):
            raise ValueError("invalid nested APK inventory record")
        member = normalize_member(label.rsplit("!/", 1)[1])
        if member in result:
            raise ValueError(f"duplicate nested member in inventory: {member}")
        result[member] = item
    return result


def package_identity(inventory: Dict[str, Any]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for item in inventory["containers"]:
        manifest = item.get("container_manifest") if isinstance(item, dict) else None
        if not isinstance(manifest, dict):
            continue
        for source, target in (
            ("package_name", "package_id"),
            ("packageName", "package_id"),
            ("version_code", "version_code"),
            ("versionCode", "version_code"),
            ("version_name", "version_name"),
            ("versionName", "version_name"),
        ):
            if source in manifest and target not in result:
                result[target] = str(manifest[source])
    return result


def cleanup_generated(path: Path) -> None:
    def make_writable_and_retry(function: Any, name: str, _: Any) -> None:
        os.chmod(name, 0o700)
        function(name)

    if path.exists() and not path.is_symlink():
        shutil.rmtree(path, onerror=make_writable_and_retry)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", type=Path, required=True, help="Original XAPK, APKS, APKM, or ZIP container")
    parser.add_argument("--inventory", type=Path, required=True, help="Full inspector JSON for this container")
    parser.add_argument("--output", type=Path, required=True, help="New directory for extracted leaf APKs")
    parser.add_argument("--member", action="append", default=[], help="Exact normalized APK member. Repeat as needed.")
    parser.add_argument("--max-apks", type=int, default=64)
    parser.add_argument("--max-container-bytes", type=int, default=16 * 1024**3)
    parser.add_argument("--max-entries", type=int, default=100000)
    parser.add_argument("--max-central-directory-bytes", type=int, default=128 * 1024**2)
    parser.add_argument("--max-archive-member-bytes", type=int, default=8 * 1024**3)
    parser.add_argument("--max-archive-uncompressed-bytes", type=int, default=32 * 1024**3)
    parser.add_argument("--max-member-bytes", type=int, default=2 * 1024**3)
    parser.add_argument("--max-total-bytes", type=int, default=8 * 1024**3)
    parser.add_argument("--max-expansion-ratio", type=float, default=200.0)
    args = parser.parse_args(argv)
    if any(
        value < 1
        for value in (
            args.max_apks,
            args.max_container_bytes,
            args.max_entries,
            args.max_central_directory_bytes,
            args.max_archive_member_bytes,
            args.max_archive_uncompressed_bytes,
            args.max_member_bytes,
            args.max_total_bytes,
            args.max_expansion_ratio,
        )
    ):
        parser.error("limits must be positive")
    if args.max_apks > 1024:
        parser.error("--max-apks may not exceed 1024")
    if args.max_entries > 1000000:
        parser.error("--max-entries may not exceed 1000000")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if args.container.is_symlink() or not args.container.is_file():
        print("error: container must be a regular non-symlink file", file=sys.stderr)
        return 2
    if args.output.exists() or args.output.is_symlink():
        print(f"error: output must be a new non-symlink path: {args.output}", file=sys.stderr)
        return 2

    stable: Optional[StableInput] = None
    zf: Optional[zipfile.ZipFile] = None
    try:
        stable = StableInput.open(args.container)
        container_hash, container_size = stable.sha256, stable.size
        central_directory = preflight_central_directory(
            stable,
            args.max_container_bytes,
            args.max_entries,
            args.max_central_directory_bytes,
        )
        inventory, inventory_hash = load_inventory(args.inventory)
        inventory_hashes = {
            item.get("sha256")
            for item in inventory["containers"]
            if isinstance(item, dict) and item.get("sha256")
        }
        if container_hash not in inventory_hashes:
            raise ValueError("container SHA-256 is not present in the supplied inventory")
        expected = nested_inventory_map(inventory)
        requested = {normalize_member(name) for name in args.member}

        zf = zipfile.ZipFile(stable.handle, "r")
        validate_zip_members(
            zf.infolist(),
            args.max_entries,
            args.max_archive_member_bytes,
            args.max_archive_uncompressed_bytes,
            args.max_expansion_ratio,
        )
        with zf:
            candidates: Dict[str, zipfile.ZipInfo] = {}
            for info in zf.infolist():
                if info.is_dir():
                    continue
                normalized = normalize_member(info.filename)
                if not normalized.lower().endswith(".apk"):
                    continue
                if normalized in candidates:
                    raise ValueError(f"duplicate normalized APK member: {normalized}")
                candidates[normalized] = info
            selected_names = sorted(requested if requested else candidates.keys())
            if not selected_names:
                raise ValueError("container has no nested APK members")
            if len(selected_names) > args.max_apks:
                raise ValueError(f"selected APK count exceeds --max-apks={args.max_apks}")
            unknown = [name for name in selected_names if name not in candidates]
            if unknown:
                raise ValueError("requested APK member not found: " + ", ".join(unknown))
            unverified = [name for name in selected_names if name not in expected]
            if unverified:
                raise ValueError("APK member is absent from inspector inventory: " + ", ".join(unverified))
            total_bytes = sum(candidates[name].file_size for name in selected_names)
            if total_bytes > args.max_total_bytes:
                raise ValueError(f"selected bytes exceed --max-total-bytes={args.max_total_bytes}")
            for name in selected_names:
                info = candidates[name]
                if is_zip_symlink(info) or info.flag_bits & 0x1:
                    raise ValueError(f"symlink or encrypted APK member is not allowed: {name}")
                ratio = info.file_size / max(info.compress_size, 1)
                if info.file_size > args.max_member_bytes or ratio > args.max_expansion_ratio:
                    raise ValueError(f"APK member exceeds the byte or ratio safety limit: {name}")

            args.output = create_private_output_directory(args.output)
            (args.output / INCOMPLETE_NAME).write_text("container leaf extraction in progress\n", encoding="utf-8")
            files: List[Dict[str, Any]] = []
            try:
                for name in selected_names:
                    info = candidates[name]
                    target = args.output.joinpath(*PurePosixPath(name).parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    digest = hashlib.sha256()
                    size = 0
                    with zf.open(info, "r") as source, target.open("xb") as destination:
                        while True:
                            chunk = source.read(1024 * 1024)
                            if not chunk:
                                break
                            destination.write(chunk)
                            digest.update(chunk)
                            size += len(chunk)
                            if size > args.max_member_bytes:
                                raise ValueError(f"APK member exceeded limit while reading: {name}")
                    actual_hash = digest.hexdigest()
                    if size != info.file_size or size != expected[name].get("size_bytes"):
                        raise ValueError(f"APK member size mismatch: {name}")
                    if actual_hash != expected[name].get("sha256"):
                        raise ValueError(f"APK member SHA-256 mismatch: {name}")
                    files.append(
                        {
                            "path": name,
                            "size_bytes": size,
                            "sha256": actual_hash,
                            "container_member": info.filename,
                            "crc32": f"{info.CRC:08x}",
                            "inventory_label": expected[name].get("label"),
                        }
                    )

                stable.verify_unchanged()
                manifest = {
                    "schema_version": 1,
                    "status": "complete",
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "source_container": {
                        "path": str(args.container.resolve()),
                        "size_bytes": container_size,
                        "sha256": container_hash,
                        "central_directory": central_directory,
                    },
                    "source_inventory": {
                        "path": str(args.inventory.resolve()),
                        "sha256": inventory_hash,
                    },
                    "package_identity": package_identity(inventory),
                    "file_count": len(files),
                    "total_file_bytes": sum(item["size_bytes"] for item in files),
                    "read_only_mode": "Files use 0444. Directories use 0555. Filesystem protection is advisory.",
                    "files": files,
                }
                (args.output / MANIFEST_NAME).write_text(
                    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                )
                for path in args.output.rglob("*"):
                    if path.is_file() and path.name != INCOMPLETE_NAME:
                        path.chmod(0o444)
                for path in sorted(
                    (path for path in args.output.rglob("*") if path.is_dir()),
                    key=lambda path: len(path.parts),
                    reverse=True,
                ):
                    path.chmod(0o555)
                (args.output / INCOMPLETE_NAME).unlink()
                args.output.chmod(0o555)
            except Exception:
                cleanup_generated(args.output)
                raise
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    finally:
        if zf is not None:
            zf.close()
        if stable is not None:
            stable.close()

    print(
        json.dumps(
            {
                "status": "complete",
                "output": str(args.output),
                "container_sha256": container_hash,
                "package_identity": package_identity(inventory),
                "file_count": len(files),
                "total_file_bytes": sum(item["size_bytes"] for item in files),
                "manifest": str(args.output / MANIFEST_NAME),
                "read_only": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
