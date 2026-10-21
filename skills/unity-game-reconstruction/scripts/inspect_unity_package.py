#!/usr/bin/env python3
"""Create a read-only inventory for APK, XAPK, APKS, AAB, or directories of split packages.

The script never extracts or modifies package contents. It reports the following
as JSON:
- Unity markers
- Placement of IL2CPP metadata and native binaries across splits
- ABIs
- Managed assemblies
- DEX counts
- Hashes
- Bounded path samples
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from package_safety import (
    StableInput,
    bounded_test_zip,
    preflight_central_directory,
    secure_output_path,
    validate_zip_members,
)


PACKAGE_SUFFIXES = {".apk", ".xapk", ".apks", ".aab", ".zip", ".apkm"}
ABI_RE = re.compile(r"(?:^|/)lib/(arm64-v8a|armeabi-v7a|x86_64|x86)/([^/]+)$", re.I)
UNITY_VERSION_RE = re.compile(rb"(?<![0-9])((?:20\d{2}|6000)\.\d+\.\d+[abcfp]\d+)(?![0-9])")
UNITY_VERSION_CANDIDATES = {
    "globalgamemanagers",
    "globalgamemanagers.assets",
    "data.unity3d",
}


def clipped(values: Iterable[str], limit: int) -> Dict[str, Any]:
    ordered = sorted(set(values))
    return {
        "count": len(ordered),
        "items": ordered[:limit],
        "truncated": len(ordered) > limit,
    }


def safe_read_member(zf: zipfile.ZipFile, info: zipfile.ZipInfo, limit: int) -> bytes:
    if info.file_size > limit:
        return b""
    with zf.open(info, "r") as handle:
        return handle.read(limit + 1)[:limit]


def xapk_manifest(
    zf: zipfile.ZipFile,
    entries: Sequence[Tuple[zipfile.ZipInfo, str]],
) -> Optional[Dict[str, Any]]:
    candidates = [(info, name) for info, name in entries if name.lower() in {"manifest.json", "info.json"}]
    for info, _ in candidates:
        raw = safe_read_member(zf, info, 2 * 1024 * 1024)
        if not raw:
            continue
        try:
            value = json.loads(raw.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        if not isinstance(value, dict):
            continue
        keep = {}
        for key in (
            "package_name",
            "packageName",
            "name",
            "version_name",
            "versionName",
            "version_code",
            "versionCode",
            "min_sdk_version",
            "target_sdk_version",
        ):
            if key in value:
                keep[key] = value[key]
        splits = value.get("split_apks") or value.get("splitApks")
        if isinstance(splits, list):
            keep["declared_split_count"] = len(splits)
        return keep or {"manifest_present": True}
    return None


def detect_unity_versions(
    zf: zipfile.ZipFile,
    entries: Sequence[Tuple[zipfile.ZipInfo, str]],
    max_candidates: int,
) -> Tuple[List[str], bool]:
    versions = set()
    candidates = [(info, name) for info, name in entries if Path(name).name.lower() in UNITY_VERSION_CANDIDATES]
    for info, name in candidates[:max_candidates]:
        if Path(name).name.lower() not in UNITY_VERSION_CANDIDATES:
            continue
        if info.file_size <= 0:
            continue
        with zf.open(info, "r") as handle:
            sample = handle.read(min(info.file_size, 4 * 1024 * 1024))
        for match in UNITY_VERSION_RE.finditer(sample):
            versions.add(match.group(1).decode("ascii", "replace"))
    return sorted(versions), len(candidates) > max_candidates


def write_new_text_atomic(path: Path, text: str) -> None:
    """Atomically create a new regular file without following or replacing links."""
    path = secure_output_path(path)
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
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        # Hard-link creation is atomic. It fails if another process creates
        # the path after the preflight check. It does not replace that path.
        os.link(temporary_name, path)
    finally:
        if temporary_name:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass


def analyze_zip(
    zf: zipfile.ZipFile,
    label: str,
    source_kind: str,
    max_items: int,
    max_version_candidates: int,
    max_entries: int,
    max_member_bytes: int,
    max_total_uncompressed_bytes: int,
    max_expansion_ratio: float,
    max_test_bytes: int,
    max_test_seconds: float,
    test_zip: bool,
    central_directory: Optional[Dict[str, int]] = None,
    supplied_sha256: Optional[str] = None,
    supplied_size: Optional[int] = None,
) -> Dict[str, Any]:
    infos = zf.infolist()
    member_stats = validate_zip_members(
        infos,
        max_entries,
        max_member_bytes,
        max_total_uncompressed_bytes,
        max_expansion_ratio,
    )
    entries = [(info, info.filename.replace("\\", "/")) for info in infos if not info.is_dir()]
    names = [name for _, name in entries]
    lowered = [(name, name.lower()) for name in names]

    metadata = [name for name, low in lowered if low.endswith("/global-metadata.dat") or low == "global-metadata.dat"]
    il2cpp = [name for name, low in lowered if low.endswith("/libil2cpp.so") or low == "libil2cpp.so"]
    unity_libs = [name for name, low in lowered if low.endswith("/libunity.so") or low == "libunity.so"]
    managed_dlls = [
        name
        for name, low in lowered
        if (low.startswith("managed/") or "/managed/" in low) and low.endswith(".dll")
    ]
    dex = [name for name, low in lowered if re.search(r"(?:^|/)classes(?:\d+)?\.dex$", low)]
    nested_apks = [name for name, low in lowered if low.endswith(".apk")]
    expansion_files = [name for name, low in lowered if low.endswith(".obb")]
    asset_packs = [name for name, low in lowered if "assetpack" in low or "/assetpacks/" in low]
    unity_data = [
        name
        for name, low in lowered
        if "assets/bin/data/" in low
        or low.endswith("/globalgamemanagers")
        or low == "globalgamemanagers"
        or low.endswith("/data.unity3d")
        or low == "data.unity3d"
    ]

    abi_files: Dict[str, List[str]] = {}
    for name in names:
        match = ABI_RE.search(name)
        if match:
            abi_files.setdefault(match.group(1).lower(), []).append(name)

    total_uncompressed = member_stats["uncompressed_bytes"]
    total_compressed = member_stats["compressed_bytes"]
    ratio = round(total_uncompressed / max(total_compressed, 1), 2)
    integrity = (
        bounded_test_zip(zf, infos, max_test_bytes, max_test_seconds)
        if test_zip
        else {"first_bad_member": None, "tested_bytes": 0}
    )
    bad_member = integrity["first_bad_member"]

    versions, version_candidates_truncated = detect_unity_versions(zf, entries, max_version_candidates)
    markers = bool(metadata or il2cpp or unity_libs or managed_dlls or unity_data)
    report: Dict[str, Any] = {
        "label": label,
        "source_kind": source_kind,
        "sha256": supplied_sha256,
        "size_bytes": supplied_size,
        "entry_count": len(names),
        "central_directory": central_directory,
        "compressed_bytes": total_compressed,
        "uncompressed_bytes": total_uncompressed,
        "expansion_ratio": ratio,
        "zip_integrity": {
            "mode": "bounded_full_test" if test_zip else "central_directory_only",
            "first_bad_member": bad_member,
            "tested_bytes": integrity["tested_bytes"],
        },
        "unity_detected": markers,
        "backend_evidence": {
            "il2cpp": bool(il2cpp or metadata),
            "mono_candidate": bool(managed_dlls) and not bool(il2cpp),
        },
        "unity_versions_found": versions,
        "unity_version_candidates_truncated": version_candidates_truncated,
        "global_metadata": clipped(metadata, max_items),
        "libil2cpp": clipped(il2cpp, max_items),
        "libunity": clipped(unity_libs, max_items),
        "managed_dlls": clipped(managed_dlls, max_items),
        "dex_files": clipped(dex, max_items),
        "unity_data_paths": clipped(unity_data, max_items),
        "nested_apks": clipped(nested_apks, max_items),
        "expansion_files": clipped(expansion_files, max_items),
        "asset_pack_hints": clipped(asset_packs, max_items),
        "native_abis": {abi: clipped(paths, max_items) for abi, paths in sorted(abi_files.items())},
        "container_manifest": xapk_manifest(zf, entries),
        "warnings": [],
    }
    if ratio > 100:
        report["warnings"].append("The archive expansion ratio is high. Keep extraction bounded. Check available disk space.")
    if metadata and not il2cpp:
        report["warnings"].append("Metadata exists without libil2cpp.so in this leaf. Inspect ABI splits before IL2CPP analysis.")
    if il2cpp and not metadata:
        report["warnings"].append("libil2cpp.so exists without metadata in this leaf. Inspect the base package.")
    if markers and not (metadata or il2cpp or managed_dlls):
        report["warnings"].append("The script found Unity markers. The backend remains unresolved.")
    if bad_member:
        report["warnings"].append("Full ZIP integrity test failed.")
    if version_candidates_truncated:
        report["warnings"].append("The safety limit truncated the scan of Unity version candidates.")
    if expansion_files:
        report["warnings"].append("The script lists OBB expansion files. It did not analyze their nested payloads.")
    return report


def analyze_path(
    path: Path,
    max_items: int,
    max_nested_apks: int,
    max_nested_apk_bytes: int,
    max_total_nested_bytes: int,
    max_expansion_ratio: float,
    max_version_candidates: int,
    max_container_bytes: int,
    max_entries: int,
    max_central_directory_bytes: int,
    max_member_bytes: int,
    max_total_uncompressed_bytes: int,
    max_test_bytes: int,
    max_test_seconds: float,
    test_zip: bool,
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    stable = StableInput.open(path)
    try:
        central = preflight_central_directory(
            stable, max_container_bytes, max_entries, max_central_directory_bytes
        )
        with zipfile.ZipFile(stable.handle, "r") as zf:
            outer = analyze_zip(
                zf,
                label=str(path),
                source_kind=path.suffix.lower().lstrip(".") or "zip",
                max_items=max_items,
                max_version_candidates=max_version_candidates,
                max_entries=max_entries,
                max_member_bytes=max_member_bytes,
                max_total_uncompressed_bytes=max_total_uncompressed_bytes,
                max_expansion_ratio=max_expansion_ratio,
                max_test_bytes=max_test_bytes,
                max_test_seconds=max_test_seconds,
                test_zip=test_zip,
                central_directory=central,
                supplied_sha256=stable.sha256,
                supplied_size=stable.size,
            )
            results.append(outer)

            nested = [info for info in zf.infolist() if not info.is_dir() and info.filename.lower().endswith(".apk")]
            if len(nested) > max_nested_apks:
                results.append(
                    {
                        "label": str(path),
                        "source_kind": "nested_apk_set",
                        "error": (
                            f"Nested APK count {len(nested)} exceeds safety limit {max_nested_apks}. "
                            "narrow the container or raise --max-nested-apks deliberately."
                        ),
                    }
                )
                return results
            total_nested_bytes = sum(info.file_size for info in nested)
            if total_nested_bytes > max_total_nested_bytes:
                results.append(
                    {
                        "label": str(path),
                        "source_kind": "nested_apk_set",
                        "error": (
                            f"Nested APK bytes {total_nested_bytes} exceed safety limit {max_total_nested_bytes}."
                        ),
                    }
                )
                return results
            for info in nested:
                nested_label = f"{path}!/{info.filename.replace(chr(92), '/')}"
                ratio = info.file_size / max(info.compress_size, 1)
                if info.file_size > max_nested_apk_bytes or ratio > max_expansion_ratio:
                    results.append(
                        {
                            "label": nested_label,
                            "source_kind": "nested_apk",
                            "size_bytes": info.file_size,
                            "compressed_bytes": info.compress_size,
                            "error": "The nested APK exceeds the byte or expansion-ratio safety limit. The script did not decompress it.",
                        }
                    )
                    continue
                digest = hashlib.sha256()
                nested_size = 0
                with tempfile.TemporaryFile() as spool:
                    with zf.open(info, "r") as source:
                        while True:
                            chunk = source.read(1024 * 1024)
                            if not chunk:
                                break
                            digest.update(chunk)
                            nested_size += len(chunk)
                            if nested_size > max_nested_apk_bytes:
                                raise ValueError("Nested APK exceeded --max-nested-apk-bytes while reading.")
                            spool.write(chunk)
                    spool.flush()
                    spool.seek(0)
                    current = os.fstat(spool.fileno())
                    nested_stable = StableInput(
                        Path(nested_label),
                        spool,
                        digest.hexdigest(),
                        nested_size,
                        (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns, current.st_ctime_ns),
                    )
                    try:
                        nested_central = preflight_central_directory(
                            nested_stable,
                            max_nested_apk_bytes,
                            max_entries,
                            max_central_directory_bytes,
                        )
                        with zipfile.ZipFile(spool, "r") as nested_zf:
                            results.append(
                                analyze_zip(
                                    nested_zf,
                                    label=nested_label,
                                    source_kind="nested_apk",
                                    max_items=max_items,
                                    max_version_candidates=max_version_candidates,
                                    max_entries=max_entries,
                                    max_member_bytes=max_member_bytes,
                                    max_total_uncompressed_bytes=max_total_uncompressed_bytes,
                                    max_expansion_ratio=max_expansion_ratio,
                                    max_test_bytes=max_test_bytes,
                                    max_test_seconds=max_test_seconds,
                                    test_zip=test_zip,
                                    central_directory=nested_central,
                                    supplied_sha256=digest.hexdigest(),
                                    supplied_size=nested_size,
                                )
                            )
                    except (zipfile.BadZipFile, KeyError, OSError, RuntimeError, TimeoutError, ValueError) as exc:
                        results.append(
                            {
                                "label": nested_label,
                                "source_kind": "nested_apk",
                                "sha256": digest.hexdigest(),
                                "size_bytes": nested_size,
                                "error": f"Nested member could not be analyzed: {exc}",
                            }
                        )
    finally:
        try:
            stable.verify_unchanged()
        finally:
            stable.close()
    return results


def collect_sources(target: Path, max_containers: int) -> List[Path]:
    if target.is_file():
        return [target]
    if not target.is_dir():
        raise FileNotFoundError(str(target))
    found = sorted(
        p for p in target.rglob("*") if p.is_file() and p.suffix.lower() in PACKAGE_SUFFIXES
    )
    if len(found) > max_containers:
        raise ValueError(
            f"Found {len(found)} package containers, above --max-containers={max_containers}. Narrow the input root."
        )
    return found


def aggregate(target: Path, leaves: List[Dict[str, Any]]) -> Dict[str, Any]:
    valid = [leaf for leaf in leaves if "error" not in leaf]
    errors = [
        {"label": leaf.get("label", "<unknown>"), "error": leaf.get("error", "unknown error")}
        for leaf in leaves
        if "error" in leaf
    ]
    metadata_leaves = [leaf["label"] for leaf in valid if leaf["global_metadata"]["count"]]
    binary_leaves = [leaf["label"] for leaf in valid if leaf["libil2cpp"]["count"]]
    managed_leaves = [leaf["label"] for leaf in valid if leaf["managed_dlls"]["count"]]
    unity_leaves = [leaf["label"] for leaf in valid if leaf["unity_detected"]]
    abis = sorted({abi for leaf in valid for abi in leaf["native_abis"].keys()})
    versions = sorted({version for leaf in valid for version in leaf["unity_versions_found"]})

    if metadata_leaves and binary_leaves:
        backend = "IL2CPP"
    elif managed_leaves:
        backend = "Mono_candidate"
    elif unity_leaves:
        backend = "Unity_backend_unknown"
    else:
        backend = "Unity_not_detected"

    warnings = []
    if metadata_leaves and binary_leaves and not set(metadata_leaves).intersection(binary_leaves):
        warnings.append(
            "global-metadata.dat and libil2cpp.so are in different leaves. Use a read-only joined view that preserves provenance."
        )
    if metadata_leaves and not binary_leaves:
        warnings.append("The script found no libil2cpp.so across all inspected leaves. An ABI split may be missing.")
    if binary_leaves and not metadata_leaves:
        warnings.append("The script found no global-metadata.dat in the inspected leaves. Inspect packages that contain base files or data.")
    if len(versions) > 1:
        warnings.append("The script found multiple Unity version strings. Check whether the input combines different package versions.")

    return {
        "schema_version": 1,
        "status": "partial" if errors else "complete",
        "target": str(target),
        "container_count": len(leaves),
        "error_count": len(errors),
        "errors": errors,
        "unity_leaf_count": len(unity_leaves),
        "backend_assessment": backend,
        "metadata_leaves": metadata_leaves,
        "libil2cpp_leaves": binary_leaves,
        "managed_assembly_leaves": managed_leaves,
        "abis": abis,
        "unity_versions_found": versions,
        "warnings": warnings,
        "containers": leaves,
    }


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="APK, XAPK, APKS, AAB, or ZIP file, or directory of split packages")
    parser.add_argument("--output", type=Path, help="Write full JSON here. Print only a compact summary to stdout.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    parser.add_argument("--test-zip", action="store_true", help="Test every member by streaming within byte and time budgets")
    parser.add_argument("--max-items", type=int, default=20, help="Maximum sampled paths per category (default: 20)")
    parser.add_argument("--max-containers", type=int, default=100, help="Maximum number of package files to scan from a directory")
    parser.add_argument("--max-nested-apks", type=int, default=64, help="Maximum nested APKs per container")
    parser.add_argument("--max-nested-apk-bytes", type=int, default=2 * 1024**3)
    parser.add_argument("--max-total-nested-bytes", type=int, default=8 * 1024**3)
    parser.add_argument("--max-expansion-ratio", type=float, default=200.0)
    parser.add_argument("--max-container-bytes", type=int, default=16 * 1024**3)
    parser.add_argument("--max-entries", type=int, default=100000)
    parser.add_argument("--max-central-directory-bytes", type=int, default=128 * 1024**2)
    parser.add_argument("--max-member-bytes", type=int, default=8 * 1024**3)
    parser.add_argument("--max-total-uncompressed-bytes", type=int, default=32 * 1024**3)
    parser.add_argument("--max-test-bytes", type=int, default=32 * 1024**3)
    parser.add_argument("--max-test-seconds", type=float, default=300.0)
    parser.add_argument("--max-version-candidates", type=int, default=16)
    parser.add_argument("--max-leaves", type=int, default=256, help="Maximum number of leaves in the whole report")
    parser.add_argument("--max-stdout-chars", type=int, default=32768, help="Omit full stdout above this size")
    args = parser.parse_args(argv)
    positive = (
        args.max_items,
        args.max_containers,
        args.max_nested_apks,
        args.max_nested_apk_bytes,
        args.max_total_nested_bytes,
        args.max_expansion_ratio,
        args.max_container_bytes,
        args.max_entries,
        args.max_central_directory_bytes,
        args.max_member_bytes,
        args.max_total_uncompressed_bytes,
        args.max_test_bytes,
        args.max_test_seconds,
        args.max_version_candidates,
        args.max_leaves,
        args.max_stdout_chars,
    )
    if any(value < 1 for value in positive):
        parser.error("limits must be positive")
    if args.max_items > 500 or args.max_nested_apks > 1024 or args.max_leaves > 4096 or args.max_entries > 1000000:
        parser.error("sampling or report limits are unreasonably high. Narrow the target.")
    if args.max_stdout_chars > 1024 * 1024:
        parser.error("--max-stdout-chars may not exceed 1048576")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if args.output and (args.output.exists() or args.output.is_symlink()):
        print(f"error: output must be a new non-symlink path: {args.output}", file=sys.stderr)
        return 2
    try:
        sources = collect_sources(args.target, args.max_containers)
        if not sources:
            raise ValueError("No supported package containers found.")
        leaves: List[Dict[str, Any]] = []
        for source in sources:
            remaining = args.max_leaves - len(leaves)
            if remaining < 1:
                leaves.append(
                    {
                        "label": str(args.target),
                        "source_kind": "global_limit",
                        "error": f"The scan reached the global leaf limit {args.max_leaves}. Narrow the target.",
                    }
                )
                break
            try:
                leaves.extend(
                    analyze_path(
                        source,
                        args.max_items,
                        min(args.max_nested_apks, max(remaining - 1, 0)),
                        args.max_nested_apk_bytes,
                        args.max_total_nested_bytes,
                        args.max_expansion_ratio,
                        args.max_version_candidates,
                        args.max_container_bytes,
                        args.max_entries,
                        args.max_central_directory_bytes,
                        args.max_member_bytes,
                        args.max_total_uncompressed_bytes,
                        args.max_test_bytes,
                        args.max_test_seconds,
                        args.test_zip,
                    )
                )
            except (OSError, zipfile.BadZipFile, RuntimeError, TimeoutError, KeyError, ValueError) as exc:
                leaves.append({"label": str(source), "source_kind": source.suffix.lower(), "error": str(exc)})
            if len(leaves) > args.max_leaves:
                leaves = leaves[: args.max_leaves]
                leaves.append(
                    {
                        "label": str(args.target),
                        "source_kind": "global_limit",
                        "error": f"The scan reached the global leaf limit {args.max_leaves}. The script clipped the report.",
                    }
                )
                break
        report = aggregate(args.target, leaves)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    payload = json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None, sort_keys=False)
    summary = {
        "status": "partial" if report["error_count"] else "complete",
        "backend_assessment": report["backend_assessment"],
        "container_count": report["container_count"],
        "error_count": report["error_count"],
        "error_labels": [item["label"] for item in report["errors"][:10]],
        "abis": report["abis"],
        "unity_versions_found": report["unity_versions_found"],
        "metadata_leaves": report["metadata_leaves"][:10],
        "libil2cpp_leaves": report["libil2cpp_leaves"][:10],
        "warnings": report["warnings"],
    }
    if args.output:
        try:
            write_new_text_atomic(args.output, payload + "\n")
        except (OSError, ValueError) as exc:
            print(f"error: could not create output safely: {exc}", file=sys.stderr)
            return 2
        summary["output"] = str(args.output)
        print(json.dumps(summary, ensure_ascii=False))
    elif len(payload) > args.max_stdout_chars:
        summary["full_report_omitted"] = True
        summary["rerun_with_output"] = "Use --output with a new path to save the bounded full report."
        print(json.dumps(summary, ensure_ascii=False))
    else:
        print(payload)
    return 1 if any("error" in leaf for leaf in leaves) else 0


if __name__ == "__main__":
    raise SystemExit(main())
