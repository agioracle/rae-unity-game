#!/usr/bin/env python3
"""Provide shared functions for snapshots, ZIP budgets, and private output."""

from __future__ import annotations

import errno
import hashlib
import os
import stat
import struct
import tempfile
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Dict, Iterable, Tuple


CHUNK_SIZE = 1024 * 1024


def hash_stream(stream: BinaryIO) -> Tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    while True:
        chunk = stream.read(CHUNK_SIZE)
        if not chunk:
            break
        digest.update(chunk)
        size += len(chunk)
    return digest.hexdigest(), size


@dataclass
class StableInput:
    path: Path
    handle: BinaryIO
    sha256: str
    size: int
    stat_key: Tuple[int, int, int, int, int]

    @classmethod
    def open(cls, path: Path) -> "StableInput":
        absolute = Path(os.path.abspath(os.fspath(path)))
        if absolute.is_symlink():
            raise ValueError(f"input must not be a symlink: {absolute}")
        flags = os.O_RDONLY
        flags |= getattr(os, "O_CLOEXEC", 0)
        flags |= getattr(os, "O_NOFOLLOW", 0)
        try:
            fd = os.open(absolute, flags)
        except OSError as exc:
            raise ValueError(f"input must be a readable regular file, not a symlink: {absolute}: {exc}") from exc
        handle = os.fdopen(fd, "rb")
        try:
            current = os.fstat(handle.fileno())
            if not stat.S_ISREG(current.st_mode):
                raise ValueError(f"input must be a regular file: {absolute}")
            digest, size = hash_stream(handle)
            handle.seek(0)
            key = (
                current.st_dev,
                current.st_ino,
                current.st_size,
                current.st_mtime_ns,
                current.st_ctime_ns,
            )
            return cls(absolute, handle, digest, size, key)
        except Exception:
            handle.close()
            raise

    def verify_unchanged(self) -> None:
        current = os.fstat(self.handle.fileno())
        current_key = (
            current.st_dev,
            current.st_ino,
            current.st_size,
            current.st_mtime_ns,
            current.st_ctime_ns,
        )
        self.handle.seek(0)
        digest, size = hash_stream(self.handle)
        self.handle.seek(0)
        if current_key != self.stat_key or size != self.size or digest != self.sha256:
            raise ValueError(f"input changed during processing: {self.path}")

    def close(self) -> None:
        self.handle.close()


def _zip64_directory(handle: BinaryIO, eocd_offset: int) -> Tuple[int, int]:
    if eocd_offset < 20:
        raise ValueError("ZIP64 locator is missing")
    handle.seek(eocd_offset - 20)
    locator = handle.read(20)
    if len(locator) != 20:
        raise ValueError("truncated ZIP64 locator")
    signature, disk, record_offset, disks = struct.unpack("<4sLQL", locator)
    if signature != b"PK\x06\x07" or disk != 0 or disks != 1:
        raise ValueError("multi-disk or malformed ZIP64 archives are not supported")
    handle.seek(record_offset)
    record = handle.read(56)
    if len(record) < 56:
        raise ValueError("truncated ZIP64 end record")
    values = struct.unpack("<4sQ2H2L4Q", record[:56])
    if values[0] != b"PK\x06\x06" or values[4] != 0 or values[5] != 0:
        raise ValueError("multi-disk or malformed ZIP64 archives are not supported")
    entries_total = values[7]
    central_directory_bytes = values[8]
    return int(entries_total), int(central_directory_bytes)


def preflight_central_directory(
    stable: StableInput,
    max_container_bytes: int,
    max_entries: int,
    max_central_directory_bytes: int,
) -> Dict[str, int]:
    if stable.size > max_container_bytes:
        raise ValueError(
            f"container bytes {stable.size} exceed --max-container-bytes={max_container_bytes}"
        )
    handle = stable.handle
    tail_size = min(stable.size, 65557)
    if tail_size < 22:
        raise zipfile.BadZipFile("file is too small to contain a ZIP end record")
    handle.seek(stable.size - tail_size)
    tail = handle.read(tail_size)
    marker = tail.rfind(b"PK\x05\x06")
    if marker < 0 or marker + 22 > len(tail):
        raise zipfile.BadZipFile("ZIP end record was not found")
    eocd = tail[marker : marker + 22]
    values = struct.unpack("<4s4H2LH", eocd)
    disk, central_disk = values[1], values[2]
    entries_disk, entries_total = values[3], values[4]
    central_directory_bytes = values[5]
    comment_bytes = values[7]
    eocd_offset = stable.size - tail_size + marker
    if marker + 22 + comment_bytes != len(tail):
        raise zipfile.BadZipFile("malformed ZIP comment or trailing bytes")
    if disk != 0 or central_disk != 0 or entries_disk != entries_total:
        raise ValueError("multi-disk ZIP archives are not supported")
    if entries_total == 0xFFFF or central_directory_bytes == 0xFFFFFFFF:
        entries_total, central_directory_bytes = _zip64_directory(handle, eocd_offset)
    if entries_total > max_entries:
        raise ValueError(f"ZIP entries {entries_total} exceed --max-entries={max_entries}")
    if central_directory_bytes > max_central_directory_bytes:
        raise ValueError(
            "ZIP central-directory bytes "
            f"{central_directory_bytes} exceed --max-central-directory-bytes={max_central_directory_bytes}"
        )
    handle.seek(0)
    return {
        "declared_entry_count": int(entries_total),
        "central_directory_bytes": int(central_directory_bytes),
    }


def validate_zip_members(
    infos: Iterable[zipfile.ZipInfo],
    max_entries: int,
    max_member_bytes: int,
    max_total_uncompressed_bytes: int,
    max_expansion_ratio: float,
) -> Dict[str, int]:
    items = list(infos)
    if len(items) > max_entries:
        raise ValueError(f"ZIP entries {len(items)} exceed --max-entries={max_entries}")
    total_uncompressed = 0
    total_compressed = 0
    for info in items:
        if info.file_size < 0 or info.compress_size < 0:
            raise ValueError(f"negative ZIP member size: {info.filename}")
        total_uncompressed += info.file_size
        total_compressed += info.compress_size
        ratio = info.file_size / max(info.compress_size, 1)
        if info.file_size > max_member_bytes:
            raise ValueError(
                f"ZIP member exceeds --max-member-bytes={max_member_bytes}: {info.filename}"
            )
        if ratio > max_expansion_ratio:
            raise ValueError(
                f"ZIP member exceeds --max-expansion-ratio={max_expansion_ratio}: {info.filename}"
            )
        if total_uncompressed > max_total_uncompressed_bytes:
            raise ValueError(
                "ZIP uncompressed bytes exceed "
                f"--max-total-uncompressed-bytes={max_total_uncompressed_bytes}"
            )
    return {
        "entry_count": len(items),
        "compressed_bytes": total_compressed,
        "uncompressed_bytes": total_uncompressed,
    }


def bounded_test_zip(
    zf: zipfile.ZipFile,
    infos: Iterable[zipfile.ZipInfo],
    max_test_bytes: int,
    max_test_seconds: float,
) -> Dict[str, Any]:
    deadline = time.monotonic() + max_test_seconds
    tested = 0
    for info in infos:
        if info.is_dir():
            continue
        if tested + info.file_size > max_test_bytes:
            raise ValueError(f"ZIP integrity test exceeds --max-test-bytes={max_test_bytes}")
        try:
            with zf.open(info, "r") as source:
                while True:
                    chunk = source.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    tested += len(chunk)
                    if tested > max_test_bytes:
                        raise ValueError(f"ZIP integrity test exceeds --max-test-bytes={max_test_bytes}")
                    if time.monotonic() > deadline:
                        raise TimeoutError(
                            f"ZIP integrity test exceeds --max-test-seconds={max_test_seconds}"
                        )
        except zipfile.BadZipFile:
            return {"first_bad_member": info.filename, "tested_bytes": tested}
    return {"first_bad_member": None, "tested_bytes": tested}


def _secure_walk_parent(parent: Path) -> None:
    if os.name != "posix" or not hasattr(os, "O_DIRECTORY"):
        parent.mkdir(parents=True, exist_ok=True)
        current = parent
        while True:
            if current.is_symlink():
                raise ValueError(f"output parent contains a symlink: {current}")
            if current.parent == current:
                break
            current = current.parent
        return

    parts = parent.parts
    fd = os.open(parts[0] or os.sep, os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[1:]:
            flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
            try:
                next_fd = os.open(part, flags, dir_fd=fd)
            except FileNotFoundError:
                os.mkdir(part, mode=0o700, dir_fd=fd)
                next_fd = os.open(part, flags, dir_fd=fd)
            except OSError as exc:
                if exc.errno in {errno.ELOOP, errno.ENOTDIR}:
                    raise ValueError(f"output parent contains a symlink or non-directory component: {parent}") from exc
                raise
            os.close(fd)
            fd = next_fd
        mode = os.fstat(fd).st_mode
        if mode & 0o022:
            raise ValueError(
                f"output parent must not allow group or world write access: {parent}. Use a private workspace directory."
            )
    finally:
        os.close(fd)


def secure_output_path(path: Path) -> Path:
    absolute = Path(os.path.abspath(os.fspath(path)))
    _secure_walk_parent(absolute.parent)
    if absolute.exists() or absolute.is_symlink():
        raise FileExistsError(f"output must be a new non-symlink path: {absolute}")
    return absolute


def create_private_output_directory(path: Path) -> Path:
    absolute = secure_output_path(path)
    os.mkdir(absolute, mode=0o700)
    return absolute


def write_new_bytes_atomic(path: Path, payload: bytes, mode: int = 0o600) -> Path:
    absolute = secure_output_path(path)
    temporary_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=str(absolute.parent),
            prefix=f".{absolute.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_name = handle.name
            os.chmod(temporary_name, mode)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temporary_name, absolute)
        return absolute
    finally:
        if temporary_name:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
