import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "unity-game-reconstruction" / "scripts" / "hash_manifest.py"
SPEC = importlib.util.spec_from_file_location("hash_manifest", SCRIPT)
assert SPEC and SPEC.loader
hash_manifest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hash_manifest)


class HashManifestStabilityTests(unittest.TestCase):
    def test_rejects_file_metadata_change_during_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.bin"
            path.write_bytes(b"original")
            real_fstat = os.fstat
            calls = 0

            def changing_fstat(fd):
                nonlocal calls
                calls += 1
                value = real_fstat(fd)
                if calls >= 2:
                    fields = list(value)
                    fields[8] = value.st_mtime + 1
                    return os.stat_result(fields)
                return value

            with mock.patch.object(hash_manifest.os, "fstat", side_effect=changing_fstat):
                with self.assertRaisesRegex(hash_manifest.ManifestError, "changed while hashing"):
                    hash_manifest.hash_regular_file(path)

    def test_rejects_byte_count_different_from_opened_size(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.bin"
            path.write_bytes(b"short")
            real_fstat = os.fstat
            calls = 0

            def inconsistent_fstat(fd):
                nonlocal calls
                calls += 1
                value = real_fstat(fd)
                if calls == 1:
                    fields = list(value)
                    fields[6] = value.st_size + 1
                    return os.stat_result(fields)
                return value

            with mock.patch.object(hash_manifest.os, "fstat", side_effect=inconsistent_fstat):
                with self.assertRaisesRegex(hash_manifest.ManifestError, "changed while hashing"):
                    hash_manifest.hash_regular_file(path)


if __name__ == "__main__":
    unittest.main()
