#!/usr/bin/env python3
"""Use Android SDK tools to verify the package, version, and signing identity of an APK split set."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from package_safety import StableInput, write_new_bytes_atomic


CERT_RE = re.compile(r"certificate SHA-256 digest:\s*([0-9A-Fa-f:]{64,95})", re.I)


def resolve_tool(value: str) -> str:
    candidate = shutil.which(value)
    if candidate:
        return candidate
    path = Path(value)
    if path.is_file() and os.access(path, os.X_OK):
        return str(path.absolute())
    raise ValueError(f"required executable was not found: {value}")


def run_tool(command: List[str], timeout: float) -> str:
    try:
        result = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError(f"tool timed out after {timeout}s: {command[0]}") from exc
    if result.returncode != 0:
        clipped = result.stdout[-2000:].strip()
        raise ValueError(f"tool failed ({result.returncode}): {' '.join(command[:3])}: {clipped}")
    return result.stdout.strip()


def one_line(tool: str, args: List[str], apk: Path, timeout: float) -> str:
    value = run_tool([tool, *args, str(apk)], timeout).strip()
    if not value or "\n" in value:
        raise ValueError(f"unexpected {' '.join(args)} output for {apk.name}: {value[:500]!r}")
    return value


def tool_version(tool: str, args: List[str], timeout: float) -> str:
    try:
        value = run_tool([tool, *args], timeout).strip().splitlines()
    except ValueError:
        return "unavailable"
    return value[0][:500] if value else "unavailable"


def write_json_new(path: Path, value: Dict[str, Any]) -> Path:
    payload = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return write_new_bytes_atomic(path, payload)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path, nargs="+", help="Original APK leaf or verified extracted APK leaf")
    parser.add_argument("--apksigner", default="apksigner", help="Android SDK apksigner executable")
    parser.add_argument("--apkanalyzer", default="apkanalyzer", help="Android SDK apkanalyzer executable")
    parser.add_argument("--output", type=Path, required=True, help="New JSON report path")
    parser.add_argument("--timeout-seconds", type=float, default=60.0, help="Timeout for each tool invocation")
    args = parser.parse_args(argv)
    if args.timeout_seconds <= 0 or args.timeout_seconds > 600:
        parser.error("--timeout-seconds must be in (0, 600]")
    if len(args.apk) > 1024:
        parser.error("at most 1024 APK leaves may be verified at once")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    inputs: List[StableInput] = []
    try:
        apksigner = resolve_tool(args.apksigner)
        apkanalyzer = resolve_tool(args.apkanalyzer)
        tool_versions = {
            "apksigner": tool_version(apksigner, ["version"], args.timeout_seconds),
            "apkanalyzer": tool_version(apkanalyzer, ["--version"], args.timeout_seconds),
        }
        inputs = [StableInput.open(path) for path in args.apk]
        if len({item.sha256 for item in inputs}) != len(inputs):
            raise ValueError("APK inputs contain duplicate bytes")

        records: List[Dict[str, Any]] = []
        with tempfile.TemporaryDirectory(prefix="recover-unity-identity-") as temp_root:
            temp = Path(temp_root)
            temp.chmod(0o700)
            for index, stable in enumerate(inputs):
                snapshot = temp / f"leaf-{index:04d}.apk"
                stable.handle.seek(0)
                digest = hashlib.sha256()
                with snapshot.open("xb") as destination:
                    while True:
                        chunk = stable.handle.read(1024 * 1024)
                        if not chunk:
                            break
                        destination.write(chunk)
                        digest.update(chunk)
                if digest.hexdigest() != stable.sha256:
                    raise ValueError(f"snapshot hash mismatch: {stable.path}")

                signer_output = run_tool(
                    [apksigner, "verify", "--print-certs", str(snapshot)],
                    args.timeout_seconds,
                )
                certs = sorted(
                    {
                        match.group(1).replace(":", "").lower()
                        for match in CERT_RE.finditer(signer_output)
                    }
                )
                if not certs:
                    raise ValueError(f"apksigner returned no certificate SHA-256 digest: {stable.path}")
                package_id = one_line(
                    apkanalyzer, ["manifest", "application-id"], snapshot, args.timeout_seconds
                )
                version_code = one_line(
                    apkanalyzer, ["manifest", "version-code"], snapshot, args.timeout_seconds
                )
                version_name = run_tool(
                    [apkanalyzer, "manifest", "version-name", str(snapshot)],
                    args.timeout_seconds,
                ).strip()
                if "\n" in version_name:
                    raise ValueError(f"unexpected version-name output for {stable.path}")
                stable.verify_unchanged()
                records.append(
                    {
                        "path": str(stable.path),
                        "sha256": stable.sha256,
                        "size_bytes": stable.size,
                        "package_id": package_id,
                        "version_code": version_code,
                        "version_name": version_name,
                        "signer_certificate_sha256": certs,
                    }
                )

        package_ids = {item["package_id"] for item in records}
        version_codes = {item["version_code"] for item in records}
        signer_sets = {tuple(item["signer_certificate_sha256"]) for item in records}
        if len(package_ids) != 1:
            raise ValueError("APK leaves do not share one package ID")
        if len(version_codes) != 1:
            raise ValueError("APK leaves do not share one version code")
        if len(signer_sets) != 1:
            raise ValueError("APK leaves do not share one signer certificate set")

        report = {
            "schema_version": 1,
            "status": "complete",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "identity_assurance": "verified_package_version_and_signer",
            "package_identity": {
                "package_id": next(iter(package_ids)),
                "version_code": next(iter(version_codes)),
                "version_name_values": sorted({item["version_name"] for item in records}),
            },
            "signer_certificate_sha256": list(next(iter(signer_sets))),
            "tools": {
                "apksigner": {"path": apksigner, "version": tool_versions["apksigner"]},
                "apkanalyzer": {"path": apkanalyzer, "version": tool_versions["apkanalyzer"]},
            },
            "files": records,
        }
        output = write_json_new(args.output, report)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    finally:
        for stable in inputs:
            stable.close()

    print(
        json.dumps(
            {
                "status": "complete",
                "output": str(output),
                "package_id": report["package_identity"]["package_id"],
                "version_code": report["package_identity"]["version_code"],
                "leaf_count": len(records),
                "signer_count": len(report["signer_certificate_sha256"]),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
