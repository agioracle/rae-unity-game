"""Apply directory limits before ZIP object allocation, using a reduced test budget."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

SCRIPT = Path(__file__).resolve().parents[2] / 'python/intake.py'
SPEC = importlib.util.spec_from_file_location('product_intake', SCRIPT)
intake = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(intake)

class DirectoryBudgetTests(unittest.TestCase):
    def test_preflight_rejects_before_constructing_zipfile(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / 'many.apk'
            with zipfile.ZipFile(source, 'w') as z:
                z.writestr('one', b'')
                z.writestr('two', b'')
            with mock.patch.object(intake, 'MAX_FILES', 1), mock.patch.object(intake.zipfile, 'ZipFile', side_effect=AssertionError('ZIP allocated before preflight')) as constructor:
                with self.assertRaisesRegex(ValueError, 'entries'):
                    intake.preflight(source)
                constructor.assert_not_called()

    def test_extraction_rejects_before_constructing_zipfile(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / 'many.apk'
            with zipfile.ZipFile(source, 'w') as z:
                z.writestr('one', b'')
                z.writestr('two', b'')
            with mock.patch.object(intake, 'MAX_FILES', 1), mock.patch.object(intake.zipfile, 'ZipFile', side_effect=AssertionError('ZIP allocated before preflight')) as constructor:
                with self.assertRaisesRegex(ValueError, 'entries'):
                    intake.extract_archive(source, Path(root)/'out', {'files':0,'bytes':0}, [], 'sourcehash')
                constructor.assert_not_called()
