#!/usr/bin/env python3
"""Retrieve text within limits from large decompiler and Unity evidence trees."""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, List, Optional, Sequence, Set, Tuple


DEFAULT_GLOBS = [
    "*.md", "*.txt", "*.json", "*.yaml", "*.yml", "*.xml", "*.csv", "*.tsv",
    "*.cs", "*.java", "*.kt", "*.smali", "*.il", "*.py", "*.js", "*.mjs", "*.sh",
    "*.prefab", "*.unity", "*.asset", "*.anim", "*.controller", "*.overrideController",
    "*.meta", "*.shader", "*.log",
]
DEFAULT_EXCLUDED_DIRS = {
    ".git", ".svn", "Library", "Temp", "Obj", "obj", "Build", "Builds",
    "node_modules", ".gradle", ".idea", ".vs", "__pycache__",
}
DEFAULT_MAX_OUTPUT_CHARS = 32 * 1024
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_FILES = 5_000
DEFAULT_MAX_TOTAL_SCAN_BYTES = 256 * 1024 * 1024
READ_CHUNK_BYTES = 64 * 1024
MAX_CONTEXT_LINES = 20
MIN_OUTPUT_CHARS = 1024


def strip_line_ending(value: str) -> str:
    return value.rstrip("\r\n")


def clip_context_text(value: str, limit: int) -> Tuple[str, bool]:
    text = strip_line_ending(value)
    if len(text) <= limit:
        return text, False
    return text[: max(1, limit - 1)] + "…", True


def snippet_from_span(value: str, start: int, end: int, limit: int) -> Tuple[str, bool]:
    """Clip a line around its first match. Preserve explicit omission marks."""
    text = strip_line_ending(value)
    length = len(text)
    if length <= limit:
        return text, False

    start = max(0, min(start, length))
    end = max(start, min(end, length))
    content_limit = max(1, limit - 2)
    match_length = end - start

    if match_length <= content_limit:
        spare = content_limit - match_length
        left = min(start, spare // 2)
        right = min(length - end, spare - left)
        if left + right < spare:
            left += min(start - left, spare - left - right)
        window_start = start - left
        window_end = end + right
    else:
        midpoint = (start + end) // 2
        window_start = max(0, midpoint - content_limit // 2)
        window_end = min(length, window_start + content_limit)
        window_start = max(0, window_end - content_limit)

    # If the match is near one edge, use the unused ellipsis character for content.
    prefix = window_start > 0
    suffix = window_end < length
    spare = limit - (window_end - window_start) - int(prefix) - int(suffix)
    if spare > 0:
        add_left = min(window_start, spare // 2)
        window_start -= add_left
        spare -= add_left
        add_right = min(length - window_end, spare)
        window_end += add_right
        spare -= add_right
        window_start -= min(window_start, spare)

    prefix = window_start > 0
    suffix = window_end < length
    snippet = ("…" if prefix else "") + text[window_start:window_end] + ("…" if suffix else "")
    return snippet[:limit], True


def utf8_byte_offset_to_char(text: str, offset: int) -> int:
    """Convert ripgrep's UTF-8 byte offsets to Python character offsets."""
    if offset <= 0:
        return 0
    encoded = text.encode("utf-8")
    prefix = encoded[: min(offset, len(encoded))]
    return len(prefix.decode("utf-8", errors="ignore"))


def rg_match_span(data: Dict[str, Any], text: str) -> Tuple[int, int]:
    submatches = data.get("submatches") or []
    if not submatches:
        return 0, 0
    first = submatches[0]
    return (
        utf8_byte_offset_to_char(text, int(first.get("start", 0))),
        utf8_byte_offset_to_char(text, int(first.get("end", 0))),
    )


def matches_any_glob(path: Path, root: Path, globs: Sequence[str]) -> bool:
    try:
        rel = path.relative_to(root).as_posix()
    except ValueError:
        return False
    return any(fnmatch.fnmatch(path.name, pattern) or fnmatch.fnmatch(rel, pattern) for pattern in globs)


def record_cost(record: Dict[str, Any]) -> int:
    return len(json.dumps(record, ensure_ascii=False, separators=(",", ":"))) + 1


def append_bounded(
    records: List[Dict[str, Any]],
    record: Dict[str, Any],
    used: int,
    limit: int,
) -> Tuple[int, bool]:
    cost = record_cost(record)
    if used + cost > limit:
        return used, False
    records.append(record)
    return used + cost, True


def compact_json(value: Dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def refresh_report_counts(report: Dict[str, Any]) -> None:
    report["result_count"] = len(report.get("matches", []))
    report["context_line_count"] = len(report.get("context_lines", []))
    report["clipped_line_count"] = sum(
        int(item.get("clipped", False))
        for key in ("matches", "context_lines")
        for item in report.get(key, [])
    )
    accepted = int(report.get("accepted_result_count", report["result_count"]))
    report["omitted_match_count"] = max(0, accepted - report["result_count"])


def finalize_report(report: Dict[str, Any], limit: int) -> Dict[str, Any]:
    """Fit metadata and all records within the requested character budget."""
    report.setdefault("max_output_chars", limit + 1)
    report.setdefault("output_budget_exhausted", False)
    report.setdefault("metadata_clipped", False)
    report.setdefault("omitted_context_line_count", 0)

    original_context_count = len(report.get("context_lines", [])) + int(
        report.get("omitted_context_line_count", 0)
    )
    refresh_report_counts(report)

    # Limit user-controlled metadata before removing records.
    for key in ("root", "pattern"):
        value = str(report.get(key, ""))
        clipped, was_clipped = clip_context_text(value, 1024)
        report[key] = clipped
        if was_clipped:
            report["metadata_clipped"] = True
            report["output_budget_exhausted"] = True
    globs = list(report.get("globs", []))
    if len(globs) > 64:
        report["globs"] = globs[:64]
        report["omitted_glob_count"] = len(globs) - 64
        report["metadata_clipped"] = True
        report["output_budget_exhausted"] = True

    refresh_report_counts(report)
    while len(compact_json(report)) > limit and report.get("context_lines"):
        report["context_lines"].pop()
        report["output_budget_exhausted"] = True
        refresh_report_counts(report)
    report["omitted_context_line_count"] = max(
        int(report.get("omitted_context_line_count", 0)),
        original_context_count - len(report.get("context_lines", [])),
    )

    while len(compact_json(report)) > limit and report.get("matches"):
        report["matches"].pop()
        report["output_budget_exhausted"] = True
        refresh_report_counts(report)

    if len(compact_json(report)) > limit and report.get("globs"):
        report["omitted_glob_count"] = int(report.get("omitted_glob_count", 0)) + len(report["globs"])
        report["globs"] = []
        report["metadata_clipped"] = True
        report["output_budget_exhausted"] = True

    # The parser enforces a 1 KiB minimum. Clipping metadata to short lengths
    # is enough even for hostile command-line strings. This preserves the report contract.
    for metadata_limit in (256, 128, 64, 24):
        if len(compact_json(report)) <= limit:
            break
        for key in ("root", "pattern"):
            report[key], _ = clip_context_text(str(report.get(key, "")), metadata_limit)
        report["metadata_clipped"] = True
        report["output_budget_exhausted"] = True

    if len(compact_json(report)) > limit:
        for key in (
            "glob_policy", "skipped_large_files", "skipped_binary_files",
            "max_line_chars", "max_file_bytes", "omitted_glob_count",
        ):
            report.pop(key, None)
            if len(compact_json(report)) <= limit:
                break
        report["metadata_clipped"] = True
        report["output_budget_exhausted"] = True

    refresh_report_counts(report)
    report["omitted_context_line_count"] = max(
        int(report.get("omitted_context_line_count", 0)),
        original_context_count - len(report.get("context_lines", [])),
    )
    return report


def base_report(
    args: argparse.Namespace,
    engine: str,
    matches: List[Dict[str, Any]],
    contexts: List[Dict[str, Any]],
    observed: int,
    truncated: bool,
    output_budget_exhausted: bool,
) -> Dict[str, Any]:
    accepted = min(observed, args.max_results)
    return {
        "engine": engine,
        "root": str(args.root),
        "pattern": args.pattern,
        "fixed": args.fixed,
        "ignore_case": args.ignore_case,
        "hidden": args.hidden,
        "follow_symlinks": False,
        "glob_policy": "custom" if args.glob else "default_text_and_unity",
        "globs": list(args.glob),
        "max_results": args.max_results,
        "max_line_chars": args.max_line_chars,
        "max_file_bytes": args.max_file_bytes,
        "max_output_chars": args.max_output_chars,
        "timeout_seconds": getattr(args, "timeout_seconds", None),
        "max_files": getattr(args, "max_files", None),
        "max_total_scan_bytes": getattr(args, "max_total_scan_bytes", None),
        "context": args.context,
        "stop_reason": "completed",
        "scanned_files": 0,
        "scanned_bytes": 0,
        "unscanned_scope_exists": False,
        "observed_result_count": observed,
        "accepted_result_count": accepted,
        "truncated": truncated,
        "output_budget_exhausted": output_budget_exhausted or len(matches) < accepted,
        "omitted_context_line_count": 0,
        "matches": matches,
        "context_lines": contexts,
    }


def path_text(data: Dict[str, Any]) -> str:
    return str(data.get("path", {}).get("text", ""))


def event_record(data: Dict[str, Any], args: argparse.Namespace, is_match: bool) -> Dict[str, Any]:
    raw_text = data.get("lines", {}).get("text", "")
    if is_match:
        start, end = rg_match_span(data, raw_text)
        text, was_clipped = snippet_from_span(raw_text, start, end, args.max_line_chars)
    else:
        text, was_clipped = clip_context_text(raw_text, args.max_line_chars)
    return {
        "path": path_text(data),
        "line": data.get("line_number"),
        "text": text,
        "clipped": was_clipped,
    }


def context_is_near_match(
    record: Dict[str, Any],
    match_lines: Dict[str, List[int]],
    radius: int,
) -> bool:
    line = record.get("line")
    if not isinstance(line, int):
        return False
    return any(abs(line - match_line) <= radius for match_line in match_lines.get(record["path"], []))


def terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is None:
        process.terminate()


def query_with_rg(args: argparse.Namespace, globs: Sequence[str]) -> Dict[str, Any]:
    # Ripgrep does not report files that contain no matches.
    # Thus, it cannot enforce or account for global file and byte budgets.
    # Parsed CLI requests use the fallback scanner, which applies all three budgets to actual reads.
    if all(
        hasattr(args, name)
        for name in ("timeout_seconds", "max_files", "max_total_scan_bytes")
    ):
        return query_with_python(args, globs)

    command = [
        shutil.which("rg") or "rg",
        "--json",
        "--no-messages",
        "--no-ignore",
        "--line-number",
        "--color",
        "never",
        "--sort",
        "path",
        "--max-filesize",
        str(args.max_file_bytes),
    ]
    if args.fixed:
        command.append("--fixed-strings")
    if args.ignore_case:
        command.append("--ignore-case")
    if args.hidden:
        command.append("--hidden")
    if args.context:
        command.extend(["--context", str(args.context)])
    for pattern in globs:
        command.extend(["--glob", pattern])
    if not args.no_default_excludes:
        for directory in sorted(DEFAULT_EXCLUDED_DIRS):
            command.extend(["--glob", "!%s/**" % directory])
            command.extend(["--glob", "!**/%s/**" % directory])
    # Positive --glob filters can allow dot paths in ripgrep.
    # Restore the default policy for hidden paths that the Python walker implements.
    if not args.hidden:
        command.extend(["--glob", "!.*"])
        command.extend(["--glob", "!**/.*"])
        command.extend(["--glob", "!**/.*/**"])
    command.extend(["--", args.pattern, str(args.root)])

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert process.stdout is not None
    matches: List[Dict[str, Any]] = []
    raw_contexts: List[Dict[str, Any]] = []
    observed = 0
    truncated = False
    draining = False
    terminated = False
    last_path: Optional[str] = None
    last_line: Optional[int] = None
    context_target: Optional[int] = None
    storage_limit = max(args.max_output_chars * 2, 4096)
    match_storage = 0
    context_storage = 0
    storage_exhausted = False

    for raw in process.stdout:
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            continue
        kind = event.get("type")
        data = event.get("data", {})

        if kind == "end" and draining:
            terminate_process(process)
            terminated = True
            break
        if kind not in {"match", "context"}:
            continue

        current_path = path_text(data)
        current_line = data.get("line_number")
        if draining:
            if (
                current_path != last_path
                or not isinstance(current_line, int)
                or context_target is None
                or current_line > context_target
            ):
                terminate_process(process)
                terminated = True
                break

        if kind == "match":
            observed += 1
            if observed <= args.max_results:
                record = event_record(data, args, True)
                match_storage, stored = append_bounded(matches, record, match_storage, storage_limit)
                storage_exhausted = storage_exhausted or not stored
                last_path = current_path
                last_line = current_line if isinstance(current_line, int) else None
                context_target = (last_line + args.context) if last_line is not None else None
            else:
                truncated = True
                draining = bool(
                    args.context
                    and last_path == current_path
                    and isinstance(current_line, int)
                    and context_target is not None
                    and current_line <= context_target
                )
                if draining:
                    record = event_record(data, args, True)
                    context_storage, stored = append_bounded(
                        raw_contexts, record, context_storage, storage_limit
                    )
                    storage_exhausted = storage_exhausted or not stored
                else:
                    terminate_process(process)
                    terminated = True
                    break
        elif args.context:
            record = event_record(data, args, False)
            context_storage, stored = append_bounded(raw_contexts, record, context_storage, storage_limit)
            storage_exhausted = storage_exhausted or not stored

        if draining and isinstance(current_line, int) and current_line >= int(context_target or 0):
            terminate_process(process)
            terminated = True
            break

    try:
        _, stderr = process.communicate(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        _, stderr = process.communicate()
    return_code = process.returncode
    if return_code not in (0, 1, -15) and not (terminated and truncated):
        raise RuntimeError(stderr.strip() or "ripgrep exited with %s" % return_code)

    match_lines: Dict[str, List[int]] = {}
    match_keys: Set[Tuple[str, int]] = set()
    for record in matches:
        line = record.get("line")
        if isinstance(line, int):
            match_lines.setdefault(record["path"], []).append(line)
            match_keys.add((record["path"], line))
    contexts_by_key: Dict[Tuple[str, int], Dict[str, Any]] = {}
    if args.context:
        for record in raw_contexts:
            line = record.get("line")
            if not isinstance(line, int):
                continue
            key = (record["path"], line)
            if key in match_keys or not context_is_near_match(record, match_lines, args.context):
                continue
            contexts_by_key.setdefault(key, record)
    contexts = [contexts_by_key[key] for key in sorted(contexts_by_key)]

    report = base_report(
        args, "ripgrep", matches, contexts, observed, truncated, storage_exhausted
    )
    return finalize_report(report, args.max_output_chars - 1)


def safe_child(path: Path, root: Path) -> bool:
    """Reject symlinks, missing nodes, and resolved paths outside the scan root."""
    try:
        if path.is_symlink():
            return False
        resolved = path.resolve(strict=True)
        resolved.relative_to(root)
        return True
    except (OSError, RuntimeError, ValueError):
        return False


def first_python_match(
    line: str,
    args: argparse.Namespace,
    regex: Optional[re.Pattern[str]],
) -> Optional[Tuple[int, int]]:
    if args.fixed and not args.ignore_case:
        start = line.find(args.pattern)
        return None if start < 0 else (start, start + len(args.pattern))
    assert regex is not None
    match = regex.search(line)
    return None if match is None else match.span()


def add_context_record(
    contexts: Dict[Tuple[str, int], Dict[str, Any]],
    path: Path,
    line_number: int,
    line: str,
    args: argparse.Namespace,
    match_keys: Set[Tuple[str, int]],
    storage: List[int],
    storage_limit: int,
) -> bool:
    key = (str(path), line_number)
    if key in match_keys or key in contexts:
        return True
    text, was_clipped = clip_context_text(line, args.max_line_chars)
    record = {"path": str(path), "line": line_number, "text": text, "clipped": was_clipped}
    cost = record_cost(record)
    if storage[0] + cost > storage_limit:
        return False
    contexts[key] = record
    storage[0] += cost
    return True


def regular_text_file(path: Path, root: Path, args: argparse.Namespace) -> Tuple[bool, str]:
    if not safe_child(path, root):
        return False, "special"
    try:
        info = path.stat()
        if not stat.S_ISREG(info.st_mode):
            return False, "special"
        if info.st_size > args.max_file_bytes:
            return False, "large"
        with path.open("rb") as handle:
            if b"\x00" in handle.read(8192):
                return False, "binary"
    except OSError:
        return False, "special"
    return True, ""


def walk_files(args: argparse.Namespace, globs: Sequence[str]) -> Iterable[Path]:
    root = args.root
    for current, dirnames, filenames in os.walk(
        str(root), topdown=True, onerror=lambda _error: None, followlinks=False
    ):
        current_path = Path(current)
        kept_dirs = []
        for name in sorted(dirnames):
            if not args.hidden and name.startswith("."):
                continue
            if not args.no_default_excludes and name in DEFAULT_EXCLUDED_DIRS:
                continue
            candidate = current_path / name
            if safe_child(candidate, root):
                kept_dirs.append(name)
        dirnames[:] = kept_dirs

        for filename in sorted(filenames):
            if not args.hidden and filename.startswith("."):
                continue
            path = current_path / filename
            if matches_any_glob(path, root, globs):
                yield path


def query_with_python(args: argparse.Namespace, globs: Sequence[str]) -> Dict[str, Any]:
    flags = re.IGNORECASE if args.ignore_case else 0
    if args.fixed:
        regex = re.compile(re.escape(args.pattern), flags) if args.ignore_case else None
    else:
        regex = re.compile(args.pattern, flags)

    matches: List[Dict[str, Any]] = []
    contexts: Dict[Tuple[str, int], Dict[str, Any]] = {}
    match_keys: Set[Tuple[str, int]] = set()
    observed = 0
    truncated = False
    scanned_files = 0
    skipped_large = 0
    skipped_binary = 0
    scanned_bytes = 0
    storage_limit = max(args.max_output_chars * 2, 4096)
    match_storage = 0
    context_storage = [0]
    storage_exhausted = False
    stop_scan = False
    stop_reason = "completed"
    unscanned_scope_exists = False
    deadline = time.monotonic() + args.timeout_seconds

    for path in walk_files(args, globs):
        if time.monotonic() >= deadline:
            stop_reason = "timeout"
            unscanned_scope_exists = True
            break
        if scanned_files >= args.max_files:
            stop_reason = "max_files"
            unscanned_scope_exists = True
            break
        if scanned_bytes >= args.max_total_scan_bytes:
            stop_reason = "max_total_scan_bytes"
            unscanned_scope_exists = True
            break
        if not safe_child(path, args.root):
            continue
        try:
            info = path.stat()
        except OSError:
            continue
        if not stat.S_ISREG(info.st_mode):
            continue
        if info.st_size > args.max_file_bytes:
            skipped_large += 1
            continue

        remaining_bytes = args.max_total_scan_bytes - scanned_bytes
        content = bytearray()
        timed_out = False
        try:
            with path.open("rb") as handle:
                scanned_files += 1
                while True:
                    if time.monotonic() >= deadline:
                        timed_out = True
                        stop_reason = "timeout"
                        unscanned_scope_exists = True
                        break
                    remaining_bytes = args.max_total_scan_bytes - scanned_bytes
                    if remaining_bytes <= 0:
                        stop_reason = "max_total_scan_bytes"
                        unscanned_scope_exists = True
                        break
                    chunk = handle.read(min(READ_CHUNK_BYTES, remaining_bytes))
                    if not chunk:
                        break
                    content.extend(chunk)
                    scanned_bytes += len(chunk)
        except OSError:
            continue

        if timed_out:
            break
        if b"\x00" in content[:8192]:
            skipped_binary += 1
            if len(content) < info.st_size:
                stop_reason = "max_total_scan_bytes"
                unscanned_scope_exists = True
                break
            continue

        file_was_clipped = len(content) < info.st_size
        previous: Deque[Tuple[int, str]] = deque(maxlen=args.context)
        after_until = 0
        draining = False

        decoded = content.decode("utf-8", errors="replace")
        for line_number, line in enumerate(decoded.splitlines(keepends=True), 1):
            if time.monotonic() >= deadline:
                stop_reason = "timeout"
                unscanned_scope_exists = True
                stop_scan = True
                break
            if draining:
                stored = add_context_record(
                    contexts, path, line_number, line, args, match_keys,
                    context_storage, storage_limit,
                )
                storage_exhausted = storage_exhausted or not stored
                if line_number >= after_until:
                    stop_reason = "max_results"
                    unscanned_scope_exists = True
                    stop_scan = True
                    break
                continue

            span = first_python_match(line, args, regex)
            if span is not None:
                observed += 1
                if observed <= args.max_results:
                    for prior_number, prior_line in previous:
                        stored = add_context_record(
                            contexts, path, prior_number, prior_line, args, match_keys,
                            context_storage, storage_limit,
                        )
                        storage_exhausted = storage_exhausted or not stored
                    key = (str(path), line_number)
                    removed = contexts.pop(key, None)
                    if removed is not None:
                        context_storage[0] -= record_cost(removed)
                    match_keys.add(key)
                    text, was_clipped = snippet_from_span(
                        line, span[0], span[1], args.max_line_chars
                    )
                    record = {
                        "path": str(path),
                        "line": line_number,
                        "text": text,
                        "clipped": was_clipped,
                    }
                    match_storage, stored = append_bounded(
                        matches, record, match_storage, storage_limit
                    )
                    storage_exhausted = storage_exhausted or not stored
                    after_until = max(after_until, line_number + args.context)
                else:
                    truncated = True
                    if args.context and line_number <= after_until:
                        stored = add_context_record(
                            contexts, path, line_number, line, args, match_keys,
                            context_storage, storage_limit,
                        )
                        storage_exhausted = storage_exhausted or not stored
                        if line_number < after_until:
                            draining = True
                        else:
                            stop_reason = "max_results"
                            unscanned_scope_exists = True
                            stop_scan = True
                            break
                    else:
                        stop_reason = "max_results"
                        unscanned_scope_exists = True
                        stop_scan = True
                        break
            elif args.context and line_number <= after_until:
                stored = add_context_record(
                    contexts, path, line_number, line, args, match_keys,
                    context_storage, storage_limit,
                )
                storage_exhausted = storage_exhausted or not stored

            if args.context:
                previous.append((line_number, line))

        if stop_scan:
            break
        if file_was_clipped:
            stop_reason = "max_total_scan_bytes"
            unscanned_scope_exists = True
            break

    ordered_contexts = [contexts[key] for key in sorted(contexts)]
    report = base_report(
        args, "python_fallback", matches, ordered_contexts, observed, truncated,
        storage_exhausted,
    )
    report.update(
        {
            "scanned_files": scanned_files,
            "scanned_bytes": scanned_bytes,
            "skipped_large_files": skipped_large,
            "skipped_binary_files": skipped_binary,
            "stop_reason": stop_reason,
            "unscanned_scope_exists": unscanned_scope_exists,
        }
    )
    return finalize_report(report, args.max_output_chars - 1)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Evidence workspace or subtree")
    parser.add_argument("pattern", help="Regex pattern, or literal text with --fixed")
    parser.add_argument("--fixed", action="store_true", help="Treat the pattern as literal text")
    parser.add_argument("--ignore-case", action="store_true")
    parser.add_argument("--glob", action="append", default=[], help="Glob for included paths. Repeat as needed.")
    parser.add_argument("--max-results", type=int, default=40, help="Global result limit (default: 40)")
    parser.add_argument("--max-line-chars", type=int, default=400, help="Clip each returned line")
    parser.add_argument("--max-file-bytes", type=int, default=8 * 1024 * 1024)
    parser.add_argument(
        "--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS,
        help="Stop scanning after this many seconds (default: 30)",
    )
    parser.add_argument(
        "--max-files", type=int, default=DEFAULT_MAX_FILES,
        help="Stop after scanning this many files (default: 5000)",
    )
    parser.add_argument(
        "--max-total-scan-bytes", type=int, default=DEFAULT_MAX_TOTAL_SCAN_BYTES,
        help="Stop after reading this many bytes across files (default: 268435456)",
    )
    parser.add_argument(
        "--max-output-chars", type=int, default=DEFAULT_MAX_OUTPUT_CHARS,
        help="Hard character limit for the complete report (default: 32768)",
    )
    parser.add_argument(
        "--context", type=int, default=0,
        help="Number of context lines for either engine, from 0 through 20",
    )
    parser.add_argument("--json", action="store_true", help="Emit one compact JSON report")
    parser.add_argument("--hidden", action="store_true", help="Include hidden files and directories")
    parser.add_argument("--no-default-excludes", action="store_true")
    parser.add_argument("--python-only", action="store_true", help="Skip ripgrep. Use the fallback scanner.")
    args = parser.parse_args(argv)
    try:
        args.root = args.root.resolve(strict=True)
    except OSError:
        parser.error("root must be an existing directory")
    if not args.root.is_dir():
        parser.error("root must be an existing directory")
    if (
        args.max_results < 1
        or args.max_line_chars < 40
        or args.max_file_bytes < 1
        or args.timeout_seconds <= 0
        or args.max_files < 1
        or args.max_total_scan_bytes < 1
        or args.max_output_chars < MIN_OUTPUT_CHARS
        or not 0 <= args.context <= MAX_CONTEXT_LINES
    ):
        parser.error("limits are invalid")
    return args


def emit_json(report: Dict[str, Any], limit: int) -> None:
    report = finalize_report(report, limit - 1)
    payload = compact_json(report)
    sys.stdout.write(payload + "\n")


def emit_text(report: Dict[str, Any], limit: int) -> None:
    summary = (
        "# engine=%s results=%s truncated=%s clipped_lines=%s output_budget_exhausted=%s "
        "stop_reason=%s scanned_files=%s scanned_bytes=%s unscanned_scope_exists=%s\n"
        % (
            report["engine"], report["result_count"],
            str(report["truncated"]).lower(), report["clipped_line_count"],
            str(report["output_budget_exhausted"]).lower(),
            report["stop_reason"], report["scanned_files"], report["scanned_bytes"],
            str(report["unscanned_scope_exists"]).lower(),
        )
    )
    available = max(0, limit - len(summary))
    pieces: List[str] = []
    used = 0
    clipped = False
    for item in report["matches"]:
        suffix = " [clipped]" if item["clipped"] else ""
        line = "%s:%s:%s%s\n" % (item["path"], item["line"], item["text"], suffix)
        if used + len(line) > available:
            clipped = True
            break
        pieces.append(line)
        used += len(line)
    if clipped and used < available:
        marker = "…\n"
        pieces.append(marker[: available - used])
    sys.stdout.write("".join(pieces))
    sys.stderr.write(summary)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    globs = args.glob or DEFAULT_GLOBS
    try:
        if shutil.which("rg") and not args.python_only:
            report = query_with_rg(args, globs)
        else:
            report = query_with_python(args, globs)
    except (OSError, re.error, RuntimeError) as exc:
        message = "error: %s" % exc
        message, _ = clip_context_text(message, args.max_output_chars - 1)
        sys.stderr.write(message + "\n")
        return 2

    if args.json:
        emit_json(report, args.max_output_chars)
    else:
        emit_text(report, args.max_output_chars)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
