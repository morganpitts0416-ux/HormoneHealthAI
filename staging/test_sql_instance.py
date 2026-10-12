"""Synthetic-only regression tests; no Google Cloud API calls."""
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from diagnostics import CommandRunner, RunnerFailure
from sql_instance import attempt_id, create_instance, instance_arguments


class CloudSqlSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.private = self.root / "private"
        self.private.mkdir(mode=0o700)
        self.password = "synthetic-" + "test-password-only"
        (self.private / "admin-password").write_text(self.password)
        self.state = {"project": "realign-lab-app", "instance": "cliniq-rx-stage-c73ac1bc32",
                      "region": "us-central1", "synthetic_only": True, "production_writes_authorized": False}
        self.ledger = self.root / "ledger"
        self.calls = []

    def cloud(self, *argv, capture=False):
        self.calls.append(argv)
        if "list" in argv:
            return "[]"
        flags = json.loads((self.private / "instance-flags.json").read_text())
        self.assertEqual(flags, {"--root-password": self.password})
        self.assertEqual((self.private / "instance-flags.json").stat().st_mode & 0o777, 0o600)
        self.assertTrue(capture)
        return ""

    def create(self, cloud=None):
        create_instance(cloud or self.cloud, self.state, self.private, self.ledger)

    def test_exact_failed_command_is_replaced_with_supported_flags(self):
        self.create()
        args = self.calls[-1]
        for flag in ("--database-version=POSTGRES_18", "--edition=ENTERPRISE", "--tier=db-custom-1-3840",
                     "--region=us-central1", "--storage-size=10",
                     "--labels=purpose=cliniq-prescription-staging,synthetic-only=true"):
            self.assertIn(flag, args)
        self.assertNotIn(self.password, " ".join(args))
        self.assertFalse((self.private / "instance-flags.json").exists())

    def test_success_is_fenced_on_retry_even_if_resource_later_disappears(self):
        self.create()
        self.calls.clear()
        with self.assertRaisesRegex(RunnerFailure, "previously submitted"):
            self.create()
        self.assertEqual(self.calls, [])

    def test_existing_instance_is_never_adopted_or_duplicated(self):
        def cloud(*argv, **kwargs):
            self.calls.append(argv)
            return json.dumps([{"name": self.state["instance"]}])
        with self.assertRaisesRegex(RunnerFailure, "already exists"):
            self.create(cloud)
        self.assertEqual(len(self.calls), 1)
        self.assertIn("list", self.calls[0])

    def test_ambiguous_create_failure_blocks_retry(self):
        def cloud(*argv, **kwargs):
            if "create" in argv:
                raise RunnerFailure("API timeout", exit_code=1)
            return self.cloud(*argv, **kwargs)
        with self.assertRaisesRegex(RunnerFailure, "timeout"):
            self.create(cloud)
        self.calls.clear()
        with self.assertRaisesRegex(RunnerFailure, "uncertain outcome"):
            self.create()
        self.assertEqual(self.calls, [])
        self.assertFalse((self.private / "instance-flags.json").exists())

    def test_exact_sdk_usage_rejection_allows_same_identity_retry(self):
        def cloud(*argv, **kwargs):
            if "create" in argv:
                raise RunnerFailure("unrecognized arguments: database-version edition tier region storage-size root-password labels",
                                    exit_code=2, validation_rejected=True)
            return self.cloud(*argv, **kwargs)
        with self.assertRaises(RunnerFailure):
            self.create(cloud)
        self.create()
        self.assertEqual(self.calls[-1][3], self.state["instance"])

    def test_password_is_redacted_even_from_unlabelled_sdk_errors(self):
        log = io.StringIO()
        runner = CommandRunner(log, lambda: {})
        runner.redactions.append(self.password)
        def cloud(*argv, **kwargs):
            if "list" in argv:
                return "[]"
            return runner(["gcloud", "--quiet", "--project=realign-lab-app", *argv], **kwargs)
        result = subprocess.CompletedProcess([], 2, stdout=self.password,
                                             stderr="unrecognized arguments: " + self.password)
        with patch("diagnostics.subprocess.run", return_value=result):
            with self.assertRaises(RunnerFailure) as error:
                self.create(cloud)
        self.assertNotIn(self.password, log.getvalue() + runner.redact(error.exception))
        self.assertTrue(error.exception.validation_rejected)
        self.assertFalse((self.private / "instance-flags.json").exists())

    def test_default_identity_is_stable_and_explicit_retry_retains_original(self):
        self.assertEqual(attempt_id(self.root), attempt_id(self.root))
        self.assertEqual(attempt_id(self.root, "c73ac1bc32"), "c73ac1bc32")
        with self.assertRaises(RunnerFailure):
            attempt_id(self.root, "unsafe")

    def test_production_names_and_permissions_are_rejected(self):
        with self.assertRaises(RunnerFailure):
            instance_arguments("realign-app", "us-central1", self.private / "flags")
        self.state["production_writes_authorized"] = True
        with self.assertRaises(RunnerFailure):
            self.create()
        self.assertEqual(self.calls, [])

    def test_invalid_existing_resource_response_cannot_trigger_create(self):
        with self.assertRaisesRegex(RunnerFailure, "verify absence"):
            self.create(lambda *argv, **kwargs: '{"unexpected":true}')

    def test_ledger_contains_no_password_and_has_private_permissions(self):
        self.create()
        marker = self.ledger / (self.state["instance"] + ".json")
        self.assertNotIn(self.password, marker.read_text())
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.ledger.stat().st_mode & 0o777, 0o700)

    def test_concurrent_attempt_is_fenced(self):
        def cloud(*argv, **kwargs):
            with self.assertRaisesRegex(RunnerFailure, "already running"):
                self.create()
            return self.cloud(*argv, **kwargs)
        self.create(cloud)
