#!/usr/bin/env python3
"""Test how evidence_query.py applies scan budgets."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "unity-game-reconstruction" / "scripts" / "evidence_query.py"
SPEC = importlib.util.spec_from_file_location("evidence_query", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
evidence_query = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evidence_query)


class EvidenceQueryBudgetTests(unittest.TestCase):
    def run_query(self, root: Path, *arguments: str) -> dict:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), str(root), "needle", "--json", *arguments],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return json.loads(completed.stdout)

    def test_default_budgets_are_enabled_and_completion_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = b"needle\n"
            (root / "evidence.txt").write_bytes(payload)

            report = self.run_query(root)

        self.assertGreater(report["timeout_seconds"], 0)
        self.assertGreater(report["max_files"], 0)
        self.assertGreater(report["max_total_scan_bytes"], 0)
        self.assertEqual(report["stop_reason"], "completed")
        self.assertEqual(report["scanned_files"], 1)
        self.assertEqual(report["scanned_bytes"], len(payload))
        self.assertEqual(report["result_count"], 1)
        self.assertEqual(report["matches"][0]["line"], 1)
        self.assertFalse(report["unscanned_scope_exists"])

    def test_unity_package_bin_data_is_searchable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "assets" / "bin" / "Data"
            data.mkdir(parents=True)
            (data / "config.json").write_text('{"value": "needle"}\n', encoding="utf-8")
            report = self.run_query(root)

        self.assertEqual(report["result_count"], 1)
        self.assertEqual(report["scanned_files"], 1)
        self.assertFalse(report["unscanned_scope_exists"])

    def test_max_files_stops_before_scanning_the_next_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = b"no match here\n"
            (root / "00-first.txt").write_bytes(first)
            (root / "01-second.txt").write_bytes(b"needle\n")

            report = self.run_query(root, "--max-files", "1")

        self.assertEqual(report["stop_reason"], "max_files")
        self.assertEqual(report["scanned_files"], 1)
        self.assertEqual(report["scanned_bytes"], len(first))
        self.assertEqual(report["result_count"], 0)
        self.assertTrue(report["unscanned_scope_exists"])

    def test_max_total_scan_bytes_stops_at_the_byte_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "evidence.txt").write_bytes(b"12345678needle\n")

            report = self.run_query(root, "--max-total-scan-bytes", "8")

        self.assertEqual(report["stop_reason"], "max_total_scan_bytes")
        self.assertEqual(report["scanned_files"], 1)
        self.assertEqual(report["scanned_bytes"], 8)
        self.assertEqual(report["result_count"], 0)
        self.assertTrue(report["unscanned_scope_exists"])

    def test_timeout_stops_the_real_scanner_before_the_next_file(self) -> None:
        class FakeClock:
            def __init__(self) -> None:
                self.calls = 0

            def monotonic(self) -> float:
                self.calls += 1
                return 0.0 if self.calls == 1 else 2.0

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "evidence.txt").write_bytes(b"needle\n")
            args = evidence_query.parse_args([str(root), "needle", "--python-only"])
            args.timeout_seconds = 1.0
            args.max_files = 10
            args.max_total_scan_bytes = 1024
            original_time = getattr(evidence_query, "time", None)
            evidence_query.time = FakeClock()
            try:
                report = evidence_query.query_with_python(args, evidence_query.DEFAULT_GLOBS)
            finally:
                if original_time is None:
                    delattr(evidence_query, "time")
                else:
                    evidence_query.time = original_time

        self.assertEqual(report["stop_reason"], "timeout")
        self.assertEqual(report["scanned_files"], 0)
        self.assertEqual(report["scanned_bytes"], 0)
        self.assertEqual(report["result_count"], 0)
        self.assertTrue(report["unscanned_scope_exists"])


if __name__ == "__main__":
    unittest.main()
