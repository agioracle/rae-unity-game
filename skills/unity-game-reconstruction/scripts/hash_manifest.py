#!/usr/bin/env python3
"""Create or verify a strict SHA-256 manifest for explicitly specified recovery artifacts."""

from __future__ import annotations

import argparse
import errno
import fnmatch
import hashlib
import json
import os
import stat
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple


SCHEMA_VERSION = 1
HASH_ALGORITHM = "sha256"
HASH_LENGTH = 64
TOP_LEVEL_FIELDS = {
    "schema_version",
    "algorithm",
    "generated_at",
    "root",
    "scopes",
    "exclude_globs",
    "entry_count",
    "total_file_bytes",
    "entries",
}
PATH_FIELDS = {"path", "external"}
FILE_ENTRY_FIELDS = {"path", "external", "kind", "size_bytes", "sha256"}
SYMLINK_ENTRY_FIELDS = {"path", "external", "kind", "target", "sha256"}


class ManifestError(Exception):
    """Represent an anticipated input or manifest error for structured output."""

    def __init__(self, code: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def emit_error(error: ManifestError) -> None:
    payload: Dict[str, Any] = {
        "status": "error",
        "error": {"code": error.code, "message": error.message},
    }
    if error.details:
        payload["error"]["details"] = error.details
    print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)


def lexical_absolute(path: Path) -> Path:
    """Return a normalized absolute path without resolving the final symlink."""

    return Path(os.path.abspath(os.fspath(path)))


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def manifest_key(path: Path, root: Path) -> Tuple[str, bool]:
    absolute = lexical_absolute(path)
    if is_within(absolute, root):
        return absolute.relative_to(root).as_posix(), False
    return str(absolute), True


def validate_stored_path(path_value: Any, external: Any, field: str) -> Tuple[str, bool]:
    if not isinstance(path_value, str) or not path_value:
        raise ManifestError(
            "invalid_path",
            f"{field}.path must be a non-empty string",
            field=field,
        )
    if not isinstance(external, bool):
        raise ManifestError(
            "invalid_external_flag",
            f"{field}.external must be a boolean",
            field=field,
        )

    stored = Path(path_value)
    if external:
        if not stored.is_absolute():
            raise ManifestError(
                "invalid_external_path",
                f"{field}.path must be absolute when external is true",
                field=field,
                path=path_value,
            )
    else:
        if stored.is_absolute() or ".." in stored.parts:
            raise ManifestError(
                "invalid_internal_path",
                f"{field}.path must be relative and must not contain '..'",
                field=field,
                path=path_value,
            )
    return path_value, external


def resolve_key(key: str, external: bool, root: Path) -> Path:
    if external:
        return lexical_absolute(Path(key))
    candidate = lexical_absolute(root / Path(key))
    if not is_within(candidate, root):
        raise ManifestError(
            "internal_path_escape",
            "internal manifest path escapes the selected root",
            path=key,
            root=str(root),
        )
    return candidate


def excluded(path: Path, scope_root: Path, patterns: Sequence[str], manifest_path: Path) -> bool:
    absolute = lexical_absolute(path)
    if absolute == manifest_path:
        return True
    try:
        rel = absolute.relative_to(scope_root).as_posix()
    except ValueError:
        rel = absolute.name
    return any(fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(absolute.name, pattern) for pattern in patterns)


def lstat_mode(path: Path) -> int:
    try:
        return path.lstat().st_mode
    except FileNotFoundError:
        raise
    except OSError as exc:
        raise ManifestError(
            "lstat_failed",
            "could not inspect filesystem entry",
            path=str(path),
            os_error=str(exc),
        ) from exc


def ensure_supported_mode(path: Path, mode: int, allow_directory: bool) -> str:
    if stat.S_ISREG(mode):
        return "file"
    if stat.S_ISLNK(mode):
        return "symlink"
    if allow_directory and stat.S_ISDIR(mode):
        return "directory"
    raise ManifestError(
        "unsupported_file_type",
        "the manifest may record only regular files and symbolic links",
        path=str(path),
        mode=oct(stat.S_IMODE(mode)),
    )


def iter_scope(
    scope: Path,
    patterns: Sequence[str],
    manifest_path: Path,
    scope_root: Optional[Path] = None,
) -> Iterator[Path]:
    scope_root = scope if scope_root is None else scope_root
    if excluded(scope, scope_root, patterns, manifest_path):
        return

    mode = lstat_mode(scope)
    kind = ensure_supported_mode(scope, mode, allow_directory=True)
    if kind != "directory":
        yield scope
        return

    try:
        children = sorted(scope.iterdir(), key=lambda item: item.name)
    except OSError as exc:
        raise ManifestError(
            "directory_read_failed",
            "could not enumerate directory",
            path=str(scope),
            os_error=str(exc),
        ) from exc
    for child in children:
        yield from iter_scope(child, patterns, manifest_path, scope_root)


def hash_regular_file(path: Path) -> Tuple[int, str]:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(os.fspath(path), flags)
    except OSError as exc:
        raise ManifestError(
            "file_open_failed",
            "could not open regular file without following symlinks",
            path=str(path),
            os_error=str(exc),
        ) from exc

    digest = hashlib.sha256()
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ManifestError(
                "file_type_changed",
                "filesystem entry was no longer a regular file during hashing",
                path=str(path),
            )
        bytes_read = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            bytes_read += len(chunk)
        after = os.fstat(descriptor)
        before_key = (
            before.st_dev,
            before.st_ino,
            before.st_size,
            getattr(before, "st_mtime_ns", int(before.st_mtime * 1_000_000_000)),
            getattr(before, "st_ctime_ns", int(before.st_ctime * 1_000_000_000)),
        )
        after_key = (
            after.st_dev,
            after.st_ino,
            after.st_size,
            getattr(after, "st_mtime_ns", int(after.st_mtime * 1_000_000_000)),
            getattr(after, "st_ctime_ns", int(after.st_ctime * 1_000_000_000)),
        )
        if before_key != after_key or bytes_read != before.st_size:
            raise ManifestError(
                "input_changed_during_hash",
                "input changed while hashing",
                path=str(path),
                opened_size=before.st_size,
                bytes_read=bytes_read,
            )
        return before.st_size, digest.hexdigest()
    finally:
        os.close(descriptor)


def make_record(path: Path, root: Path) -> Dict[str, Any]:
    key, external = manifest_key(path, root)
    mode = lstat_mode(path)
    kind = ensure_supported_mode(path, mode, allow_directory=False)
    if kind == "symlink":
        try:
            target = os.readlink(path)
        except OSError as exc:
            raise ManifestError(
                "readlink_failed",
                "could not read symbolic-link target",
                path=str(path),
                os_error=str(exc),
            ) from exc
        digest = hashlib.sha256(target.encode("utf-8", "surrogateescape")).hexdigest()
        return {
            "path": key,
            "external": external,
            "kind": "symlink",
            "target": target,
            "sha256": digest,
        }

    size, digest = hash_regular_file(path)
    return {
        "path": key,
        "external": external,
        "kind": "file",
        "size_bytes": size,
        "sha256": digest,
    }


def build_entries(
    scopes: Sequence[Path],
    root: Path,
    patterns: Sequence[str],
    manifest_path: Path,
    skip_missing_scopes: bool = False,
) -> List[Dict[str, Any]]:
    entries: Dict[Tuple[str, bool], Dict[str, Any]] = {}
    for scope in scopes:
        try:
            paths = iter_scope(scope, patterns, manifest_path)
            for path in paths:
                record = make_record(path, root)
                identity = (record["path"], record["external"])
                if identity in entries:
                    raise ManifestError(
                        "duplicate_entry",
                        "input scopes produce a duplicate manifest key",
                        path=record["path"],
                        external=record["external"],
                    )
                entries[identity] = record
        except FileNotFoundError:
            if skip_missing_scopes:
                continue
            raise ManifestError(
                "missing_input",
                "input path does not exist",
                path=str(scope),
            )
    return [entries[key] for key in sorted(entries, key=lambda item: (item[1], item[0]))]


def encode_scope(path: Path, root: Path) -> Dict[str, Any]:
    key, external = manifest_key(path, root)
    return {"path": key, "external": external}


def atomic_create_text(output: Path, content: str) -> None:
    """Publish a file after writing it fully. Never replace an existing path."""

    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=str(output.parent),
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content.encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(str(temporary), str(output), follow_symlinks=False)
        except FileExistsError as exc:
            raise ManifestError(
                "output_exists",
                "manifest output path already exists",
                path=str(output),
            ) from exc
        except OSError as exc:
            if exc.errno == errno.EEXIST:
                raise ManifestError(
                    "output_exists",
                    "manifest output path already exists",
                    path=str(output),
                ) from exc
            raise ManifestError(
                "atomic_create_failed",
                "could not atomically publish manifest",
                path=str(output),
                os_error=str(exc),
            ) from exc
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def create_manifest(args: argparse.Namespace) -> int:
    try:
        root = lexical_absolute(args.root)
        inputs = [lexical_absolute(path) for path in args.inputs]
        output = lexical_absolute(args.manifest)

        matching_inputs = [str(path) for path in inputs if path == output]
        if matching_inputs:
            raise ManifestError(
                "output_matches_input",
                "manifest output path must differ from every input path",
                path=str(output),
            )
        if os.path.lexists(str(output)):
            raise ManifestError(
                "output_exists",
                "manifest output path must not already exist or be a symlink",
                path=str(output),
            )

        scope_records = [encode_scope(path, root) for path in inputs]
        scope_identities = [(item["path"], item["external"]) for item in scope_records]
        if len(scope_identities) != len(set(scope_identities)):
            raise ManifestError(
                "duplicate_scope",
                "input paths contain duplicate manifest keys",
            )

        entries = build_entries(inputs, root, args.exclude, output)
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "algorithm": HASH_ALGORITHM,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "root": str(root),
            "scopes": scope_records,
            "exclude_globs": list(args.exclude),
            "entry_count": len(entries),
            "total_file_bytes": sum(item.get("size_bytes", 0) for item in entries),
            "entries": entries,
        }
        atomic_create_text(
            output,
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        )
    except ManifestError as exc:
        emit_error(exc)
        return 2
    except OSError as exc:
        emit_error(
            ManifestError(
                "filesystem_error",
                "filesystem operation failed while creating manifest",
                os_error=str(exc),
            )
        )
        return 2

    print(
        json.dumps(
            {
                "status": "created",
                "manifest": str(output),
                "entries": len(entries),
                "total_file_bytes": manifest["total_file_bytes"],
            },
            ensure_ascii=False,
        )
    )
    return 0


def reject_duplicate_members(pairs: Sequence[Tuple[str, Any]]) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ManifestError(
                "duplicate_json_field",
                "JSON object contains a duplicate field",
                field=key,
            )
        result[key] = value
    return result


def require_exact_fields(value: Dict[str, Any], expected: set, field: str) -> None:
    missing = sorted(expected - set(value))
    unknown = sorted(set(value) - expected)
    if missing or unknown:
        raise ManifestError(
            "invalid_fields",
            f"{field} has missing or unknown fields",
            field=field,
            missing=missing,
            unknown=unknown,
        )


def is_nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def validate_hash(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != HASH_LENGTH
        or value.lower() != value
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ManifestError(
            "invalid_hash",
            f"{field} must be a lowercase SHA-256 hex digest",
            field=field,
        )
    return value


def validate_path_record(value: Any, field: str) -> Tuple[str, bool]:
    if not isinstance(value, dict):
        raise ManifestError(
            "invalid_record",
            f"{field} must be an object",
            field=field,
        )
    require_exact_fields(value, PATH_FIELDS, field)
    return validate_stored_path(value["path"], value["external"], field)


def validate_entry(value: Any, index: int) -> Tuple[Tuple[str, bool], Dict[str, Any]]:
    field = f"entries[{index}]"
    if not isinstance(value, dict):
        raise ManifestError("invalid_entry", f"{field} must be an object", field=field)
    if "kind" not in value:
        raise ManifestError(
            "invalid_fields",
            f"{field} has missing or unknown fields",
            field=field,
            missing=["kind"],
            unknown=[],
        )

    kind = value["kind"]
    if kind == "file":
        require_exact_fields(value, FILE_ENTRY_FIELDS, field)
    elif kind == "symlink":
        require_exact_fields(value, SYMLINK_ENTRY_FIELDS, field)
    else:
        raise ManifestError(
            "invalid_kind",
            f"{field}.kind must be 'file' or 'symlink'",
            field=field,
            kind=kind,
        )

    key, external = validate_stored_path(value["path"], value["external"], field)
    validate_hash(value["sha256"], f"{field}.sha256")
    if kind == "file":
        if not is_nonnegative_int(value["size_bytes"]):
            raise ManifestError(
                "invalid_size",
                f"{field}.size_bytes must be a non-negative integer",
                field=field,
            )
    else:
        target = value["target"]
        if not isinstance(target, str):
            raise ManifestError(
                "invalid_target",
                f"{field}.target must be a string",
                field=field,
            )
        expected_hash = hashlib.sha256(target.encode("utf-8", "surrogateescape")).hexdigest()
        if value["sha256"] != expected_hash:
            raise ManifestError(
                "invalid_symlink_hash",
                f"{field}.sha256 does not match the symbolic-link target text",
                field=field,
            )
    return (key, external), value


def load_manifest(path: Path) -> Dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ManifestError(
            "manifest_read_failed",
            "could not read manifest",
            path=str(path),
            os_error=str(exc),
        ) from exc
    try:
        value = json.loads(text, object_pairs_hook=reject_duplicate_members)
    except json.JSONDecodeError as exc:
        raise ManifestError(
            "invalid_json",
            "manifest is not valid JSON",
            line=exc.lineno,
            column=exc.colno,
        ) from exc

    if not isinstance(value, dict):
        raise ManifestError("invalid_manifest", "manifest root must be an object")
    require_exact_fields(value, TOP_LEVEL_FIELDS, "manifest")
    if (
        not isinstance(value["schema_version"], int)
        or isinstance(value["schema_version"], bool)
        or value["schema_version"] != SCHEMA_VERSION
        or value["algorithm"] != HASH_ALGORITHM
    ):
        raise ManifestError(
            "unsupported_schema",
            "unsupported manifest schema version or hash algorithm",
        )
    if not isinstance(value["generated_at"], str) or not value["generated_at"]:
        raise ManifestError("invalid_generated_at", "generated_at must be a non-empty string")
    if not isinstance(value["root"], str) or not Path(value["root"]).is_absolute():
        raise ManifestError("invalid_root", "manifest root must be an absolute path string")
    if not isinstance(value["exclude_globs"], list) or not all(
        isinstance(pattern, str) for pattern in value["exclude_globs"]
    ):
        raise ManifestError("invalid_excludes", "exclude_globs must be an array of strings")
    if not isinstance(value["scopes"], list):
        raise ManifestError("invalid_scopes", "scopes must be an array")
    if not isinstance(value["entries"], list):
        raise ManifestError("invalid_entries", "entries must be an array")
    if not is_nonnegative_int(value["entry_count"]):
        raise ManifestError("invalid_entry_count", "entry_count must be a non-negative integer")
    if not is_nonnegative_int(value["total_file_bytes"]):
        raise ManifestError("invalid_total_size", "total_file_bytes must be a non-negative integer")

    scope_keys: List[Tuple[str, bool]] = []
    for index, scope in enumerate(value["scopes"]):
        scope_keys.append(validate_path_record(scope, f"scopes[{index}]"))
    if len(scope_keys) != len(set(scope_keys)):
        raise ManifestError("duplicate_scope", "manifest contains duplicate scope keys")

    entry_keys = set()
    total_file_bytes = 0
    for index, entry in enumerate(value["entries"]):
        identity, checked = validate_entry(entry, index)
        if identity in entry_keys:
            raise ManifestError(
                "duplicate_entry",
                "manifest contains duplicate entry keys",
                path=identity[0],
                external=identity[1],
            )
        entry_keys.add(identity)
        if checked["kind"] == "file":
            total_file_bytes += checked["size_bytes"]

    if value["entry_count"] != len(value["entries"]):
        raise ManifestError(
            "entry_count_mismatch",
            "entry_count does not match the length of entries",
            declared=value["entry_count"],
            actual=len(value["entries"]),
        )
    if value["total_file_bytes"] != total_file_bytes:
        raise ManifestError(
            "total_size_mismatch",
            "total_file_bytes does not match file entries",
            declared=value["total_file_bytes"],
            actual=total_file_bytes,
        )
    return value


def limited_report(items: Sequence[Dict[str, Any]], limit: int) -> Dict[str, Any]:
    return {
        "count": len(items),
        "items": list(items[:limit]),
        "truncated": len(items) > limit,
    }


def verify_manifest(args: argparse.Namespace) -> int:
    manifest_path = lexical_absolute(args.manifest)
    try:
        manifest = load_manifest(manifest_path)
        root = (
            lexical_absolute(args.root_override)
            if args.root_override
            else lexical_absolute(Path(manifest["root"]))
        )
        expected: Dict[Tuple[str, bool], Dict[str, Any]] = {
            (item["path"], item["external"]): item for item in manifest["entries"]
        }

        missing_while_building: List[Tuple[str, bool]] = []
        if args.listed_only:
            actual_entries: List[Dict[str, Any]] = []
            for key, external in expected:
                path = resolve_key(key, external, root)
                try:
                    actual_entries.append(make_record(path, root))
                except FileNotFoundError:
                    missing_while_building.append((key, external))
            actual = {(item["path"], item["external"]): item for item in actual_entries}
        else:
            scopes = [
                resolve_key(item["path"], item["external"], root)
                for item in manifest["scopes"]
            ]
            rebuilt = build_entries(
                scopes,
                root,
                manifest["exclude_globs"],
                manifest_path,
                skip_missing_scopes=True,
            )
            actual = {(item["path"], item["external"]): item for item in rebuilt}
    except ManifestError as exc:
        emit_error(exc)
        return 2
    except OSError as exc:
        emit_error(
            ManifestError(
                "filesystem_error",
                "filesystem operation failed while verifying manifest",
                os_error=str(exc),
            )
        )
        return 2

    missing_keys = sorted(set(expected) - set(actual))
    missing_keys = sorted(set(missing_keys).union(missing_while_building))
    extra_keys = [] if args.listed_only else sorted(set(actual) - set(expected))
    changed_items: List[Dict[str, Any]] = []
    for key in sorted(set(expected).intersection(actual)):
        before = expected[key]
        after = actual[key]
        if (
            before["kind"] != after["kind"]
            or before["sha256"] != after["sha256"]
            or before.get("size_bytes") != after.get("size_bytes")
            or before.get("target") != after.get("target")
        ):
            changed_items.append(
                {
                    "path": key[0],
                    "external": key[1],
                    "expected_kind": before["kind"],
                    "actual_kind": after["kind"],
                    "expected_sha256": before["sha256"],
                    "actual_sha256": after["sha256"],
                    "expected_size": before.get("size_bytes"),
                    "actual_size": after.get("size_bytes"),
                    "expected_target": before.get("target"),
                    "actual_target": after.get("target"),
                }
            )

    missing_items = [{"path": key[0], "external": key[1]} for key in missing_keys]
    extra_items = [{"path": key[0], "external": key[1]} for key in extra_keys]
    ok = not missing_items and not extra_items and not changed_items
    report = {
        "status": "ok" if ok else "mismatch",
        "manifest": str(manifest_path),
        "root": str(root),
        "listed_only": args.listed_only,
        "expected_entries": len(expected),
        "actual_entries": len(actual),
        "missing": limited_report(missing_items, args.max_report_items),
        "extra": limited_report(extra_items, args.max_report_items),
        "changed": limited_report(changed_items, args.max_report_items),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if ok else 1


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="Create a new manifest without overwriting an existing path")
    create.add_argument("manifest", type=Path)
    create.add_argument("inputs", type=Path, nargs="+")
    create.add_argument("--root", type=Path, default=Path.cwd(), help="Base directory for stored relative paths")
    create.add_argument("--exclude", action="append", default=[], help="Glob to exclude paths relative to each input scope")

    verify = subparsers.add_parser("verify", help="Verify a manifest")
    verify.add_argument("manifest", type=Path)
    verify.add_argument("--root-override", type=Path, help="Use when the workspace moved")
    verify.add_argument("--listed-only", action="store_true", help="Do not report newly added files in directory scopes")
    verify.add_argument(
        "--max-report-items",
        type=int,
        default=50,
        help="Maximum number of items to show per mismatch category (default: 50)",
    )

    args = parser.parse_args(argv)
    if getattr(args, "max_report_items", 0) < 0:
        parser.error("--max-report-items must be non-negative")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if args.command == "create":
        return create_manifest(args)
    return verify_manifest(args)


if __name__ == "__main__":
    raise SystemExit(main())
