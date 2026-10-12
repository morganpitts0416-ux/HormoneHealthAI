"""Offline installed-SDK regression checks: deliberately invalid sentinel prevents dispatch."""
import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from diagnostics import RunnerFailure
from run import clean_environment
from sdk_compat import SENTINEL, isolated_environment, probe_command, runner_probes, validate_sdk

TOOLS = pathlib.Path(__file__).resolve().parent


class CompatibilitySafety(unittest.TestCase):
    def test_all_actual_calls_are_derived_with_synthetic_resources_and_password_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            probes = runner_probes(TOOLS, root)
            self.assertGreaterEqual(len(probes), 24)
            create = next(probe for probe in probes if probe[:3] == ["sql", "instances", "create"])
            self.assertFalse(any(arg.startswith("--labels") for arg in create))
            flag_file = pathlib.Path(next(arg.split("=", 1)[1] for arg in create if arg.startswith("--flags-file=")))
            self.assertEqual(set(json.loads(flag_file.read_text())), {"--root-password"})
            self.assertTrue(any(probe[:4] == ["beta", "sql", "instances", "patch"] for probe in probes))
            self.assertTrue(any(probe[:3] == ["run", "services", "proxy"] for probe in probes))

    def test_help_cannot_be_used_as_parser_validation(self):
        with self.assertRaisesRegex(RunnerFailure, "bypass"):
            probe_command(["sql", "instances", "create", "--help"], {})

    def test_only_sentinel_rejection_counts_as_success(self):
        good = subprocess.CompletedProcess([], 2, "", "unrecognized arguments: " + SENTINEL)
        with patch("sdk_compat.subprocess.run", return_value=good) as mocked:
            probe_command(["sql", "instances", "list"], {})
            self.assertIn(SENTINEL, mocked.call_args.args[0])
        bad = subprocess.CompletedProcess([], 2, "", "unrecognized arguments: --labels " + SENTINEL)
        with patch("sdk_compat.subprocess.run", return_value=bad):
            with self.assertRaisesRegex(RunnerFailure, "--labels"):
                probe_command(["sql", "instances", "create"], {})
        unexpected_success = subprocess.CompletedProcess([], 0, "", "")
        with patch("sdk_compat.subprocess.run", return_value=unexpected_success):
            with self.assertRaises(RunnerFailure):
                probe_command(["sql", "instances", "create"], {})

    def test_sdk_config_and_auth_are_isolated(self):
        env = isolated_environment({"CLOUDSDK_CONFIG": "/operator/config", "CLOUDSDK_AUTH_ACCESS_TOKEN": "synthetic",
                                    "GOOGLE_APPLICATION_CREDENTIALS": "/operator/key", "PATH": "/bin"}, pathlib.Path("/tmp/fixture"))
        self.assertNotEqual(env["CLOUDSDK_CONFIG"], "/operator/config")
        self.assertNotIn("CLOUDSDK_AUTH_ACCESS_TOKEN", env)
        self.assertNotIn("GOOGLE_APPLICATION_CREDENTIALS", env)

    @unittest.skipUnless(shutil.which("gcloud"), "Installed SDK unavailable; operator must run native compatibility preflight")
    def test_actual_installed_sdk_accepts_all_remaining_runner_shapes_by_parser_only_rejection(self):
        report = validate_sdk(TOOLS, clean_environment())
        self.assertTrue(report["parserOnly"])
        self.assertTrue(report["credentialsIsolated"])
        self.assertGreaterEqual(report["checkedCommandShapes"], 24)
        print(f"\nInstalled SDK {report['sdkVersion']}: {report['checkedCommandShapes']} real command shapes checked offline.")

    @unittest.skipUnless(shutil.which("gcloud"), "Installed SDK unavailable")
    def test_actual_installed_sdk_rejects_legacy_ga_create_labels_with_complete_password_command(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            probes = runner_probes(TOOLS, root)
            create = next(probe for probe in probes if probe[:3] == ["sql", "instances", "create"])
            create.append("--labels=purpose=cliniq-prescription-staging,synthetic-only=true")
            with self.assertRaisesRegex(RunnerFailure, "--labels"):
                probe_command(create, isolated_environment(clean_environment(), root))
