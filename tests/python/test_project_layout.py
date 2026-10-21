"""Test layout ownership without requiring a particular content family."""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "skills/unity-game-reconstruction/scripts/audit_unity_project_layout.py"
SPEC = importlib.util.spec_from_file_location("layout_audit", SCRIPT)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class ProjectLayoutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "Project"
        for directory in AUDIT.REQUIRED_DIRS:
            if not directory.startswith("Assets/_Project/Prefabs/"):
                (self.root / directory).mkdir(parents=True, exist_ok=True)
        (self.root / "Assets/_Project/Prefabs").mkdir(parents=True, exist_ok=True)
        (self.root / "ProjectSettings").mkdir()
        (self.root / "ProjectSettings/ProjectVersion.txt").write_text(
            "m_EditorVersion: fixture-only\n", encoding="utf-8"
        )

    def run_audit(self, *args):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--project-root", str(self.root), *args],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode, json.loads(result.stdout or result.stderr)

    def test_generic_prefab_root_needs_no_content_subfolders(self):
        code, report = self.run_audit()
        self.assertEqual(code, 0, report)
        self.assertEqual(report["missing_required_directories"], [])
        self.assertEqual(list((self.root / "Assets/_Project/Prefabs").iterdir()), [])

    def test_check_does_not_create_content_subfolders(self):
        self.run_audit()
        self.assertEqual(list((self.root / "Assets/_Project/Prefabs").iterdir()), [])

    def test_create_missing_adds_only_generic_prefab_root(self):
        (self.root / "Assets/_Project/Prefabs").rmdir()
        code, report = self.run_audit("--create-missing", "--require-dir", "Assets/_Project/Prefabs")
        self.assertEqual(code, 0, report)
        self.assertEqual(report["created"], ["Assets/_Project/Prefabs"])
        self.assertEqual(list((self.root / "Assets/_Project/Prefabs").iterdir()), [])

    def test_namespace_only_project_needs_no_feature_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Assets/_Project").mkdir(parents=True)
            (root / "ProjectSettings").mkdir()
            (root / "ProjectSettings/ProjectVersion.txt").write_text("fixture-only\n", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--project-root", str(root)],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout or result.stderr)
            self.assertEqual(list((root / "Assets/_Project").iterdir()), [])

    def test_explicit_feature_directory_is_required_without_creation(self):
        code, report = self.run_audit("--require-dir", "Assets/_Project/OptionalFeature")
        self.assertEqual(code, 1)
        self.assertEqual(report["missing_required_directories"], ["Assets/_Project/OptionalFeature"])
        self.assertFalse((self.root / "Assets/_Project/OptionalFeature").exists())

    def test_explicit_directory_cannot_escape_assets_ownership(self):
        for relative in ("../outside", "/outside", "Assets/_Project/../../outside", "Assets/UnexpectedOwner"):
            code, report = self.run_audit("--create-missing", "--require-dir", relative)
            self.assertEqual(code, 2, report)
            self.assertEqual(report["status"], "error")

    def test_explicit_directory_cannot_follow_a_symlink(self):
        target = Path(self.temp.name) / "outside"
        target.mkdir()
        (self.root / "Assets/_Project/Alias").symlink_to(target, target_is_directory=True)
        code, report = self.run_audit("--create-missing", "--require-dir", "Assets/_Project/Alias/New")
        self.assertEqual(code, 2, report)
        self.assertEqual(list(target.iterdir()), [])

    def test_unknown_assets_owner_remains_an_issue(self):
        (self.root / "Assets/UnexpectedOwner").mkdir()
        code, report = self.run_audit()
        self.assertEqual(code, 1)
        self.assertEqual(report["unexpected_assets_root_directories"], ["UnexpectedOwner"])


if __name__ == "__main__":
    unittest.main()
