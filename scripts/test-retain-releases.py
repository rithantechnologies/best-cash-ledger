#!/usr/bin/env python3
"""Regression tests for conservative Cash Ledger retention."""
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "retain_releases", Path(__file__).with_name("retain-releases.py")
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ReleaseRetentionTests(unittest.TestCase):
    def test_runtime_name_and_source_protection(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            runtime = root / "cashledger-abcd123-runtime"
            (runtime / "web").mkdir(parents=True)
            self.assertEqual(mod.release_kind(runtime), "web")
            both = root / "0e04b8b"
            (both / "api").mkdir(parents=True)
            (both / "web").mkdir()
            self.assertEqual(mod.release_kind(both), "combined")
            source = root / "cashledger-pending-source-abcd123"
            (source / "web").mkdir(parents=True)
            self.assertIsNone(mod.release_kind(source))
            (runtime / ".git").write_text("gitdir: foo")
            self.assertIsNone(mod.release_kind(runtime))
            link = root / "cashledger-test-runtime"
            link.symlink_to(both, target_is_directory=True)
            self.assertIsNone(mod.release_kind(link))

    def test_env_and_upload_protection(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            runtime = root / "cashledger-test-runtime"
            api = runtime / "api"
            api.mkdir(parents=True)
            env = api / ".env"
            ref = root / "retained.env"
            env.write_text("ONE=1\n")
            ref.write_text("ONE=1\n")
            self.assertIsNone(mod.unique_data_guard(runtime, ref))
            ref.write_text("TWO=2\n")
            self.assertIn("nonmatching", mod.unique_data_guard(runtime, ref))
            ref.write_text("ONE=1\n")
            (api / "uploads").mkdir()
            self.assertIn("protected data", mod.unique_data_guard(runtime, ref))

    def test_dry_run_and_guarded_apply(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "releases"
            root.mkdir()
            pins = root.parent / ".cashledger-release-pins"
            pins.write_text("# existing rollback\n")
            for idx, age in enumerate([10, 20, 30, 40]):
                folder = root / f"cashledger-test{idx}-runtime"
                (folder / "web").mkdir(parents=True)
                (folder / "web" / "server.js").write_text("test")
                old = time.time() - 86400 * age
                os.utime(folder, (old, old))
            source = root / "cashledger-my-source-runtime"
            (source / "web").mkdir(parents=True)
            (source / ".git").write_text("gitdir: test")
            common = ["--root", str(root), "--min-age-days", "1", "--keep-latest", "2"]
            with patch.object(mod, "DEFAULT_SCAN", ()), patch.object(mod, "process_references", return_value=set()):
                with redirect_stdout(io.StringIO()) as f:
                    self.assertEqual(mod.main(common), 0)
                self.assertIn("2 candidates", f.getvalue())
                self.assertEqual(sum(1 for p in root.iterdir() if mod.release_kind(p)), 4)
                with redirect_stdout(io.StringIO()) as f:
                    self.assertEqual(mod.main(common + [
                        "--apply", "--confirm-root", str(root), "--max-delete", "1"
                    ]), 0)
                self.assertIn("deleted 1", f.getvalue())
                self.assertFalse((root / "cashledger-test3-runtime").exists())
                self.assertTrue(source.exists())
                self.assertTrue((root / "cashledger-test0-runtime").exists())


    def test_recent_stage_cleanup_requires_explicit_protected_rollback_opt_in(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "releases"
            root.mkdir()
            pins = root.parent / ".cashledger-release-pins"
            pins.write_text("# No pins for this isolated test\n")
            for idx, age_days in enumerate([20, 15, 10, 0.001]):
                release = root / f"cashledger-recenttest{idx}-runtime"
                (release / "web").mkdir(parents=True)
                (release / "web" / "server.js").write_text("test")
                stamp = time.time() - age_days * 86400
                os.utime(release, (stamp, stamp))
            common = ["--root", str(root), "--keep-latest", "2", "--min-age-days", "7",
                      "--apply", "--confirm-root", str(root), "--max-delete", "1"]
            with patch.object(mod, "DEFAULT_SCAN", ()), patch.object(mod, "process_references", return_value=set()):
                with redirect_stdout(io.StringIO()):
                    self.assertEqual(mod.main(common), 4)
                self.assertTrue((root / "cashledger-recenttest0-runtime").exists())
                with redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(mod.main(common + ["--allow-recent-retained"]), 0)
                self.assertIn("deleted 1", output.getvalue())
                self.assertFalse((root / "cashledger-recenttest0-runtime").exists())
                self.assertTrue((root / "cashledger-recenttest3-runtime").exists())

    def test_unprotected_recent_stage_blocks_even_opted_in_cleanup(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "releases"
            root.mkdir()
            (root.parent / ".cashledger-release-pins").write_text("# test\n")
            for idx, age_days in enumerate([20, 0.003, 0.002, 0.001]):
                release = root / f"cashledger-recenttest{idx}-runtime"
                (release / "web").mkdir(parents=True)
                (release / "web" / "server.js").write_text("test")
                stamp = time.time() - age_days * 86400
                os.utime(release, (stamp, stamp))
            with patch.object(mod, "DEFAULT_SCAN", ()), patch.object(mod, "process_references", return_value=set()):
                with redirect_stdout(io.StringIO()):
                    status = mod.main(["--root", str(root), "--keep-latest", "2",
                                       "--min-age-days", "7", "--apply", "--confirm-root", str(root),
                                       "--allow-recent-retained"])
                self.assertEqual(status, 4)
                self.assertTrue((root / "cashledger-recenttest0-runtime").exists())


if __name__ == "__main__":
    unittest.main()
