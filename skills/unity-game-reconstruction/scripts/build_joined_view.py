#!/usr/bin/env python3
"""Build a read-only Android view from base and split APKs and preserve provenance.

The output must be a new path. The view includes all base entries.
Split APKs contribute only entries that match configured path globs
(default: lib/** and assets/**). Relative path conflicts fail unless their
bytes are identical.
Supply an inventory from inspect_unity_package.py or explicit package and version identity.
"""

from __future__ import annotations

import argparse
import fnmatch
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


MANIFEST_NAME = "_joined_view_manifest.json"
INCOMPLETE_NAME = "_JOIN_INCOMPLETE"


def normalized_member(raw: str) -> str:
    if "\x00" in raw:
        raise ValueError("ZIP member contains NUL")
    normalized = raw.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts:
        raise ValueError(f"unsafe absolute or empty ZIP member: {raw!r}")
    if any(part in {"", ".", ".."} for part in path.parts) or path.parts[0].endswith(":"):
        raise ValueError(f"unsafe ZIP member path: {raw!r}")
    return path.as_posix()


def is_zip_symlink(info: zipfile.ZipInfo) -> bool:
    return stat.S_ISLNK((info.external_attr >> 16) & 0xFFFF)


def matches_split_globs(path: str, globs: Sequence[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in globs)


def digest_member(zf: zipfile.ZipFile, info: zipfile.ZipInfo, max_file_bytes: int) -> str:
    digest = hashlib.sha256()
    size = 0
    with zf.open(info, "r") as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_file_bytes:
                raise ValueError(f"member exceeds --max-file-bytes: {info.filename}")
            digest.update(chunk)
    if size != info.file_size:
        raise ValueError(f"member size changed while reading: {info.filename}")
    return digest.hexdigest()


def read_inventory(path: Path) -> Tuple[Dict[str, Any], str]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid inventory JSON: {exc}") from exc
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("inventory must use inspect_unity_package.py schema_version 1")
    if not isinstance(value.get("containers"), list):
        raise ValueError("inventory containers must be a list")
    if value.get("status") != "complete" or value.get("error_count") not in (None, 0):
        raise ValueError("inventory is partial or contains errors. Resolve these issues before joining splits.")
    return value, digest


def read_identity_report(path: Path) -> Tuple[Dict[str, Any], str]:
    if path.is_symlink() or not path.is_file():
        raise ValueError("identity report must be a regular non-symlink file")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid identity report JSON: {exc}") from exc
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("Use schema_version 1 for the identity report.")
    if value.get("status") != "complete" or value.get("identity_assurance") != "verified_package_version_and_signer":
        raise ValueError("Require a complete identity report with verified package, version and signer.")
    if not isinstance(value.get("files"), list) or not isinstance(value.get("package_identity"), dict):
        raise ValueError("identity report lacks files or package_identity")
    return value, digest


def inventory_identity(inventory: Dict[str, Any]) -> Dict[str, Any]:
    identity: Dict[str, Any] = {}
    for container in inventory.get("containers", []):
        manifest = container.get("container_manifest") if isinstance(container, dict) else None
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
            if source in manifest and target not in identity:
                identity[target] = str(manifest[source])
    return identity


def source_record(path: Path, role: str) -> Dict[str, Any]:
    stable = StableInput.open(path)
    return {
        "role": role,
        "path": str(stable.path),
        "sha256": stable.sha256,
        "size_bytes": stable.size,
        "_stable": stable,
    }


def collect_members(
    record: Dict[str, Any],
    split_globs: Sequence[str],
    max_entries: int,
    max_file_bytes: int,
    max_archive_uncompressed_bytes: int,
    max_expansion_ratio: float,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    selected: List[Dict[str, Any]] = []
    ignored: List[str] = []
    seen = set()
    zf = record["_zf"]
    infos = zf.infolist()
    validate_zip_members(
        infos,
        max_entries,
        max_file_bytes,
        max_archive_uncompressed_bytes,
        max_expansion_ratio,
    )
    for info in infos:
        if info.is_dir():
            continue
        normalized = normalized_member(info.filename)
        if normalized in seen:
            raise ValueError(f"duplicate normalized member in {record['path']}: {normalized}")
        seen.add(normalized)
        if is_zip_symlink(info):
            raise ValueError(f"ZIP symlink is not allowed: {record['path']}!/{info.filename}")
        if info.flag_bits & 0x1:
            raise ValueError(f"encrypted ZIP member is not supported: {record['path']}!/{info.filename}")
        include = record["role"] == "base" or matches_split_globs(normalized, split_globs)
        if not include:
            ignored.append(normalized)
            continue
        selected.append(
            {
                "normalized": normalized,
                "raw_name": info.filename,
                "info": info,
                "size_bytes": info.file_size,
                "compressed_bytes": info.compress_size,
                "crc32": f"{info.CRC:08x}",
                "package": record,
            }
        )
    stats = {
        "selected_member_count": len(selected),
        "ignored_member_count": len(ignored),
        "ignored_member_sample": ignored[:20],
        "ignored_member_sample_truncated": len(ignored) > 20,
    }
    return selected, stats


def preflight_members(
    packages: Sequence[Dict[str, Any]],
    split_globs: Sequence[str],
    max_entries: int,
    max_file_bytes: int,
    max_total_bytes: int,
    max_archive_uncompressed_bytes: int,
    max_expansion_ratio: float,
) -> Tuple[Dict[str, Dict[str, Any]], int]:
    by_path: Dict[str, Dict[str, Any]] = {}
    total_unique_bytes = 0
    for package in packages:
        members, stats = collect_members(
            package,
            split_globs,
            max_entries,
            max_file_bytes,
            max_archive_uncompressed_bytes,
            max_expansion_ratio,
        )
        package.update(stats)
        zf = package["_zf"]
        for member in members:
            path = member["normalized"]
            source = {
                "role": package["role"],
                "package_path": package["path"],
                "package_sha256": package["sha256"],
                "member": member["raw_name"],
                "size_bytes": member["size_bytes"],
                "crc32": member["crc32"],
            }
            existing = by_path.get(path)
            if existing is None:
                by_path[path] = {"primary": member, "sources": [source], "sha256": None}
                total_unique_bytes += member["size_bytes"]
                continue
            primary = existing["primary"]
            if (
                primary["size_bytes"] != member["size_bytes"]
                or primary["crc32"] != member["crc32"]
            ):
                raise ValueError(
                    f"relative-path collision with different size or CRC: {path} "
                    f"({primary['package']['path']} vs {package['path']})"
                )
            if existing["sha256"] is None:
                existing["sha256"] = digest_member(
                    primary["package"]["_zf"], primary["info"], max_file_bytes
                )
            candidate_hash = digest_member(zf, member["info"], max_file_bytes)
            if candidate_hash != existing["sha256"]:
                raise ValueError(f"relative-path collision with different bytes: {path}")
            existing["sources"].append(source)
    reserved_roots = {MANIFEST_NAME, INCOMPLETE_NAME}
    paths = set(by_path)
    for path in sorted(paths):
        parts = PurePosixPath(path).parts
        if parts[0] in reserved_roots:
            raise ValueError(f"source member collides with reserved joined-view path: {path}")
        for depth in range(1, len(parts)):
            prefix = PurePosixPath(*parts[:depth]).as_posix()
            if prefix in paths:
                raise ValueError(f"source members have a file/directory prefix collision: {prefix} vs {path}")
    if total_unique_bytes > max_total_bytes:
        raise ValueError(
            f"selected uncompressed bytes {total_unique_bytes} exceed --max-total-bytes={max_total_bytes}"
        )
    return by_path, total_unique_bytes


def extract_view(
    output: Path,
    by_path: Dict[str, Dict[str, Any]],
    packages: Sequence[Dict[str, Any]],
    metadata: Dict[str, Any],
) -> None:
    output = create_private_output_directory(output)
    (output / INCOMPLETE_NAME).write_text("joined view generation in progress\n", encoding="utf-8")

    opened = {package["sha256"]: package["_zf"] for package in packages}
    file_records: List[Dict[str, Any]] = []
    try:
        for relative in sorted(by_path):
            item = by_path[relative]
            member = item["primary"]
            target = output.joinpath(*PurePosixPath(relative).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            size = 0
            zf = opened[member["package"]["sha256"]]
            with zf.open(member["info"], "r") as source, target.open("xb") as destination:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    destination.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            if size != member["size_bytes"]:
                raise ValueError(f"extracted size mismatch: {relative}")
            actual_hash = digest.hexdigest()
            if item["sha256"] is not None and actual_hash != item["sha256"]:
                raise ValueError(f"collision hash changed during extraction: {relative}")
            file_records.append(
                {
                    "path": relative,
                    "size_bytes": size,
                    "sha256": actual_hash,
                    "sources": item["sources"],
                }
            )

        for package in packages:
            package["_stable"].verify_unchanged()

        manifest = dict(metadata)
        manifest.update(
            {
                "schema_version": 1,
                "status": "complete",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "selection": {
                    "base": "all regular ZIP members",
                    "split_include_globs": metadata["split_include_globs"],
                    "collision_policy": "fail unless bytes are identical",
                },
                "package_sources": [
                    {
                        key: value
                        for key, value in package.items()
                        if key not in {"role", "_stable", "_zf"}
                    }
                    | {"role": package["role"]}
                    for package in packages
                ],
                "file_count": len(file_records),
                "total_file_bytes": sum(item["size_bytes"] for item in file_records),
                "identical_collision_count": sum(1 for item in file_records if len(item["sources"]) > 1),
                "read_only_mode": "Files use 0444. Directories use 0555. Filesystem protection is advisory.",
                "files": file_records,
            }
        )
        manifest_path = output / MANIFEST_NAME
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        for path in output.rglob("*"):
            if path.is_file() and path.name != INCOMPLETE_NAME:
                path.chmod(0o444)
        for path in sorted((p for p in output.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            path.chmod(0o555)
        (output / INCOMPLETE_NAME).unlink()
        output.chmod(0o555)
    except Exception:
        try:
            shutil.rmtree(output)
        except OSError:
            pass
        raise


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True, help="Base APK")
    parser.add_argument("--split", type=Path, action="append", default=[], help="Split APK. Repeat as needed.")
    parser.add_argument("--output", type=Path, required=True, help="New joined-view directory")
    identity = parser.add_mutually_exclusive_group(required=True)
    identity.add_argument("--inventory", type=Path, help="Full JSON from inspect_unity_package.py")
    identity.add_argument("--package-id", help="Manual package identity. Also requires --version-code.")
    parser.add_argument("--version-code", help="Required with --package-id")
    parser.add_argument(
        "--confirm-manual-roles",
        action="store_true",
        help="Required with manual identity. Confirms external verification of base and split roles.",
    )
    parser.add_argument("--signing-cert-sha256", help="Optional apksigner certificate digest")
    parser.add_argument(
        "--identity-report",
        type=Path,
        help="Optional JSON from verify_apk_set_identity.py. Provides strong verification of the package, version, and signer.",
    )
    parser.add_argument(
        "--include-split",
        action="append",
        default=[],
        help="Split member glob. Defaults to lib/** and assets/**.",
    )
    parser.add_argument("--max-entries", type=int, default=250000)
    parser.add_argument("--max-container-bytes", type=int, default=16 * 1024**3)
    parser.add_argument("--max-central-directory-bytes", type=int, default=128 * 1024**2)
    parser.add_argument("--max-file-bytes", type=int, default=4 * 1024**3)
    parser.add_argument("--max-total-bytes", type=int, default=20 * 1024**3)
    parser.add_argument("--max-archive-uncompressed-bytes", type=int, default=32 * 1024**3)
    parser.add_argument("--max-expansion-ratio", type=float, default=200.0)
    args = parser.parse_args(argv)
    if args.package_id and not args.version_code:
        parser.error("Supply --version-code with --package-id.")
    if args.package_id and not args.confirm_manual_roles:
        parser.error("Supply --confirm-manual-roles when you supply no inspector inventory.")
    if args.signing_cert_sha256 and not (
        len(args.signing_cert_sha256) == 64
        and all(char in "0123456789abcdefABCDEF" for char in args.signing_cert_sha256)
    ):
        parser.error("--signing-cert-sha256 must be exactly 64 hexadecimal characters")
    if not args.split:
        parser.error("Supply at least one --split for a joined view.")
    if any(
        value < 1
        for value in (
            args.max_entries,
            args.max_container_bytes,
            args.max_central_directory_bytes,
            args.max_file_bytes,
            args.max_total_bytes,
            args.max_archive_uncompressed_bytes,
            args.max_expansion_ratio,
        )
    ):
        parser.error("limits must be positive")
    return args


def close_packages(packages: Sequence[Dict[str, Any]]) -> None:
    for package in packages:
        zf = package.get("_zf")
        if zf is not None:
            zf.close()
        stable = package.get("_stable")
        if stable is not None:
            stable.close()


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if args.output.exists() or args.output.is_symlink():
        print(f"error: output must be a new non-symlink path: {args.output}", file=sys.stderr)
        return 2
    packages: List[Dict[str, Any]] = []
    try:
        packages.append(source_record(args.base, "base"))
        packages.extend(source_record(path, "split") for path in args.split)
        if len({package["sha256"] for package in packages}) != len(packages):
            raise ValueError("base and split inputs contain duplicate package bytes")
        for package in packages:
            package["central_directory"] = preflight_central_directory(
                package["_stable"],
                args.max_container_bytes,
                args.max_entries,
                args.max_central_directory_bytes,
            )
            package["_zf"] = zipfile.ZipFile(package["_stable"].handle, "r")

        inventory_meta: Dict[str, Any]
        if args.inventory:
            if args.inventory.is_symlink() or not args.inventory.is_file():
                raise ValueError("inventory must be a regular non-symlink file")
            inventory, inventory_hash = read_inventory(args.inventory)
            inventory_hashes = {
                item.get("sha256")
                for item in inventory.get("containers", [])
                if isinstance(item, dict) and item.get("sha256")
            }
            missing = [package["path"] for package in packages if package["sha256"] not in inventory_hashes]
            if missing:
                raise ValueError("package hash not present in supplied inventory: " + ", ".join(missing))
            inventory_by_hash = {
                item.get("sha256"): item
                for item in inventory.get("containers", [])
                if isinstance(item, dict) and item.get("sha256")
            }
            base_leaf = inventory_by_hash[packages[0]["sha256"]]
            if not base_leaf.get("global_metadata", {}).get("count"):
                raise ValueError("--base does not map to the inventory leaf containing global-metadata.dat")
            split_leaves = [inventory_by_hash[package["sha256"]] for package in packages[1:]]
            if not any(leaf.get("libil2cpp", {}).get("count") for leaf in split_leaves):
                raise ValueError("no --split maps to an inventory leaf containing libil2cpp.so")
            identity = inventory_identity(inventory)
            if not identity.get("package_id") or not identity.get("version_code"):
                raise ValueError("inventory lacks package_id or version_code. Use manual identity instead.")
            inventory_meta = {
                "identity_source": "inspect_unity_package inventory",
                "inventory_path": str(args.inventory.resolve()),
                "inventory_sha256": inventory_hash,
                "package_identity": identity,
            }
        else:
            inventory_meta = {
                "identity_source": "manual",
                "package_identity": {
                    "package_id": args.package_id,
                    "version_code": str(args.version_code),
                },
            }
        inventory_meta["signing_cert_sha256"] = args.signing_cert_sha256

        if args.identity_report:
            identity_report, identity_report_hash = read_identity_report(args.identity_report)
            report_hashes = {
                item.get("sha256")
                for item in identity_report["files"]
                if isinstance(item, dict) and item.get("sha256")
            }
            package_hashes = {package["sha256"] for package in packages}
            if report_hashes != package_hashes:
                raise ValueError("identity report APK hashes do not exactly match base and split inputs")
            verified_identity = identity_report["package_identity"]
            if str(verified_identity.get("package_id")) != str(inventory_meta["package_identity"].get("package_id")):
                raise ValueError("identity report package ID conflicts with inventory or manual identity")
            if str(verified_identity.get("version_code")) != str(inventory_meta["package_identity"].get("version_code")):
                raise ValueError("identity report version code conflicts with inventory or manual identity")
            verified_certs = identity_report.get("signer_certificate_sha256")
            if not isinstance(verified_certs, list) or not verified_certs:
                raise ValueError("identity report lacks signer certificate digests")
            if args.signing_cert_sha256 and args.signing_cert_sha256.lower() not in {
                str(value).lower() for value in verified_certs
            }:
                raise ValueError("--signing-cert-sha256 conflicts with the verified identity report")
            inventory_meta.update(
                {
                    "identity_assurance": "verified_package_version_and_signer",
                    "identity_report_path": str(args.identity_report.absolute()),
                    "identity_report_sha256": identity_report_hash,
                    "verified_signer_certificate_sha256": verified_certs,
                }
            )
        else:
            assurance_base = (
                "inventory_hash_roles"
                if args.inventory
                else "manual_identity_and_roles"
            )
            inventory_meta["identity_assurance"] = assurance_base + (
                "_with_unverified_signer_attestation"
                if args.signing_cert_sha256
                else "_only"
            )

        split_globs = args.include_split or ["lib/**", "assets/**"]
        by_path, total_bytes = preflight_members(
            packages,
            split_globs,
            args.max_entries,
            args.max_file_bytes,
            args.max_total_bytes,
            args.max_archive_uncompressed_bytes,
            args.max_expansion_ratio,
        )
        output_paths = set(by_path)
        metadata_paths = sorted(path for path in output_paths if path.endswith("/global-metadata.dat") or path == "global-metadata.dat")
        il2cpp_paths = sorted(path for path in output_paths if path.endswith("/libil2cpp.so") or path == "libil2cpp.so")
        libunity_paths = sorted(path for path in output_paths if path.endswith("/libunity.so") or path == "libunity.so")
        if not metadata_paths or not il2cpp_paths:
            raise ValueError("joined view postcondition failed: metadata and libil2cpp.so must both be present")
        inventory_meta["split_include_globs"] = split_globs
        inventory_meta["joined_view_checks"] = {
            "global_metadata": metadata_paths,
            "libil2cpp": il2cpp_paths,
            "libunity": libunity_paths,
            "libunity_present": bool(libunity_paths),
        }
        extract_view(args.output, by_path, packages, inventory_meta)
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as exc:
        close_packages(packages)
        print(f"error: {exc}", file=sys.stderr)
        return 2

    close_packages(packages)

    print(
        json.dumps(
            {
                "status": "complete",
                "output": str(args.output),
                "package_id": inventory_meta["package_identity"]["package_id"],
                "version_code": inventory_meta["package_identity"]["version_code"],
                "source_package_count": len(packages),
                "file_count": len(by_path),
                "total_file_bytes": total_bytes,
                "manifest": str(args.output / MANIFEST_NAME),
                "read_only": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
