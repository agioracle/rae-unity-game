"""Regression checks for installing updated guidance without changing local rules."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "skills/unity-game-reconstruction/scripts/bootstrap_project_guidance.py"


class ProjectGuidanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "Project"
        (self.root / "Assets").mkdir(parents=True)
        (self.root / "ProjectSettings").mkdir()
        (self.root / "ProjectSettings/ProjectVersion.txt").write_text(
            "m_EditorVersion: fixture-only\n", encoding="utf-8"
        )

    def run_bootstrap(self, *args):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--project-root", str(self.root), *args],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode, json.loads(result.stdout or result.stderr)

    def test_check_reports_missing_guidance_without_writing(self):
        code, report = self.run_bootstrap("--check")
        self.assertEqual(code, 1)
        self.assertEqual(report["changed_count"], 1)
        self.assertFalse((self.root / "AGENTS.md").exists())
        self.assertFalse((self.root / "RULES.md").exists())

    def test_install_then_repeat_is_byte_idempotent(self):
        code, _ = self.run_bootstrap()
        self.assertEqual(code, 0)
        before = {"AGENTS.md": (self.root / "AGENTS.md").read_bytes()}
        code, report = self.run_bootstrap()
        self.assertEqual(code, 0)
        self.assertEqual(report["changed_count"], 0)
        self.assertEqual(before, {name: (self.root / name).read_bytes() for name in before})
        self.assertFalse((self.root / "RULES.md").exists())

    def test_update_managed_block_preserves_prefix_and_local_rules(self):
        self.assertEqual(self.run_bootstrap()[0], 0)
        path = self.root / "AGENTS.md"
        original = path.read_text(encoding="utf-8")
        name = "AGENTS.md"
        begin = f"<!-- UNITY_GAME_RECONSTRUCTION:MANAGED:{name}:BEGIN -->"
        end = f"<!-- UNITY_GAME_RECONSTRUCTION:MANAGED:{name}:END -->"
        _, suffix = original.split(end, 1)
        prefix = "Local owner note.\n"
        local = "\nPreserve local authoring choices.\n"
        path.write_text(prefix + begin + "\nOld managed content.\n" + end + suffix + local, encoding="utf-8")
        before = path.read_bytes()
        code, report = self.run_bootstrap("--check")
        self.assertEqual(code, 1)
        self.assertEqual(report["changed_count"], 1)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(self.run_bootstrap()[0], 0)
        actual = path.read_text(encoding="utf-8")
        self.assertTrue(actual.startswith(prefix + begin))
        self.assertEqual(actual.split(end, 1)[1], suffix + local)

    def test_unmarked_guidance_is_not_implicitly_adopted(self):
        path = self.root / "AGENTS.md"
        content = b"Keep user-owned unmarked guidance.\n"
        path.write_bytes(content)
        code, report = self.run_bootstrap()
        self.assertEqual(code, 3)
        self.assertEqual(report["status"], "conflict")
        self.assertEqual(path.read_bytes(), content)
        self.assertFalse((self.root / "RULES.md").exists())

    def test_symlink_guidance_is_rejected_without_changing_target(self):
        target = Path(self.temp.name) / "external.md"
        content = b"Unrelated guidance.\n"
        target.write_bytes(content)
        (self.root / "AGENTS.md").symlink_to(target)
        code, report = self.run_bootstrap()
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "error")
        self.assertEqual(target.read_bytes(), content)
        self.assertFalse((self.root / "RULES.md").exists())

    def test_legacy_rules_require_review_before_any_write(self):
        self.assertEqual(self.run_bootstrap()[0], 0)
        path = self.root / "AGENTS.md"
        agents = path.read_bytes()
        rules = b"Keep a local constraint.\n"
        (self.root / "RULES.md").write_bytes(rules)
        for args in ((), ("--check",)):
            code, report = self.run_bootstrap(*args)
            self.assertEqual(code, 3)
            self.assertEqual(report["status"], "legacy_rules_review_required")
            self.assertEqual(path.read_bytes(), agents)
            self.assertEqual((self.root / "RULES.md").read_bytes(), rules)

    def test_reviewed_legacy_file_and_local_guidance_remain_unchanged(self):
        self.assertEqual(self.run_bootstrap()[0], 0)
        path = self.root / "AGENTS.md"
        local = b"\nKeep a reviewed local constraint.\n"
        with path.open("ab") as output:
            output.write(local)
        rules = b"Keep a reviewed local constraint.\n"
        (self.root / "RULES.md").write_bytes(rules)
        before = path.read_bytes()
        code, report = self.run_bootstrap("--legacy-rules-reviewed")
        self.assertEqual(code, 0)
        self.assertEqual(report["changed_count"], 0)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual((self.root / "RULES.md").read_bytes(), rules)

    def test_legacy_rules_symlink_is_rejected(self):
        target = Path(self.temp.name) / "external-rules.md"
        target.write_text("Keep local constraints.\n", encoding="utf-8")
        (self.root / "RULES.md").symlink_to(target)
        code, report = self.run_bootstrap("--legacy-rules-reviewed")
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "error")
        self.assertFalse((self.root / "AGENTS.md").exists())


if __name__ == "__main__":
    unittest.main()
