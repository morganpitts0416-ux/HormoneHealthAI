"""Synthetic lost-workspace recovery checks. No test contacts GCP."""
import copy
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import recovery as rx
from sdk_compat import isolated_environment, probe_command


def fixture():
    data = {key: [] for key in rx.queries()}
    data.update({
        "account": [{"account": "synthetic@example.test", "status": "ACTIVE"}],
        "project": {"projectId": rx.PROJECT, "projectNumber": "123", "lifecycleState": "ACTIVE"},
        "instance": {
            "name": rx.NAME, "project": rx.PROJECT, "region": rx.REGION,
            "connectionName": rx.PROJECT + ":" + rx.REGION + ":" + rx.NAME,
            "state": "RUNNABLE", "databaseVersion": "POSTGRES_18",
            "createTime": "2026-10-11T12:00:00Z",
            "settings": {"tier": "db-custom-1-3840", "userLabels": dict(rx.LABELS)},
        },
        "databases": [{"name": "postgres"}], "users": [{"name": "postgres"}],
        "operations": [{"name": "synthetic-operation", "targetId": rx.NAME, "operationType": "CREATE",
                        "status": "DONE", "insertTime": "2026-10-11T12:00:01Z"}],
        "audit": [{
            "timestamp": "2026-10-11T12:00:02Z", "insertId": "synthetic-audit",
            "protoPayload": {"serviceName": "cloudsql.googleapis.com", "methodName": "cloudsql.instances.create",
                             "resourceName": "projects/" + rx.PROJECT + "/instances/" + rx.NAME},
        }],
        "assets": [{"name": "//sqladmin.googleapis.com/projects/" + rx.PROJECT + "/instances/" + rx.NAME,
                    "assetType": "sqladmin.googleapis.com/Instance", "location": rx.REGION}],
    })
    return data


class RecoverySafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.ledger = self.home / ".local/state/cliniq-rx-staging"
        self.ledger.mkdir(parents=True, mode=0o700)
        self.marker = self.ledger / (rx.NAME + ".json")
        self.marker.write_text(json.dumps(rx.EXPECTED_LEDGER))
        self.marker.chmod(0o600)
        self.lock = self.ledger / (rx.NAME + ".lock")
        self.lock.touch(mode=0o600)
        self.data = fixture()
        self.calls = []

    def fetch(self, key):
        self.calls.append(key)
        return copy.deepcopy(self.data[key])

    def assess(self):
        return rx.assess(self.home, self.fetch)

    def test_clean_assessment_preserves_ledger_and_never_authorizes_mutation(self):
        before = self.marker.read_bytes(), self.marker.stat().st_mtime_ns
        evidence, report = self.assess()
        self.assertEqual(before, (self.marker.read_bytes(), self.marker.stat().st_mtime_ns))
        self.assertEqual(report["status"], "AWAITING_EXPLICIT_APPROVAL")
        self.assertTrue(report["passwordResetRequiredToProceed"])
        self.assertFalse(report["passwordResetAuthorized"])
        self.assertIn("Separate explicitly approved", report["cloudMutationsImplemented"])
        self.assertEqual(report["originalLedgerSha256"], rx.digest(before[0]))
        self.assertEqual((evidence / "original-ledger.json").read_bytes(), before[0])
        for path in evidence.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(evidence.stat().st_mode & 0o777, 0o700)
        self.assertNotIn("synthetic@example.test", (evidence / "account.json").read_text())
        manifest = json.loads((evidence / "manifest.json").read_text())
        for name, expected in manifest.items():
            self.assertEqual(rx.digest((evidence / name).read_bytes()), expected)

    def test_restart_retry_retains_separate_evidence_and_original_ledger(self):
        first, _ = self.assess()
        # Reload the standalone module, modelling process loss; /tmp workspace is
        # not consulted. Protected persistent state alone is sufficient.
        spec = importlib.util.spec_from_file_location("recovery_restart", rx.__file__)
        restart = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(restart)
        second, _ = restart.assess(self.home, self.fetch)
        self.assertNotEqual(first, second)
        self.assertTrue((first / "approval-report.json").exists())
        self.assertEqual(json.loads(self.marker.read_text()), rx.EXPECTED_LEDGER)

    def test_wrong_original_ledger_stops_before_cloud_reads(self):
        self.marker.write_text("{}")
        with self.assertRaises(rx.Stop):
            self.assess()
        self.assertEqual(self.calls, [])

    def test_missing_lock_never_fabricates_original_ledger_state(self):
        self.lock.unlink()
        with self.assertRaises(rx.Stop):
            self.assess()
        self.assertFalse(self.lock.exists())
        self.assertEqual(self.calls, [])

    def test_concurrent_attempt_stops(self):
        with self.lock.open() as stream:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(rx.Stop, "locked"):
                self.assess()
        self.assertEqual(self.calls, [])

    def test_wrong_instance_fields_stop_before_later_inventory(self):
        for key, bad in (("name", "realign-app"), ("project", "wrong-project"),
                         ("region", "europe-west1"), ("databaseVersion", "POSTGRES_17"),
                         ("state", "FAILED"), ("connectionName", "other")):
            with self.subTest(key=key):
                self.data = fixture()
                self.data["instance"][key] = bad
                self.calls = []
                with self.assertRaises(rx.Stop):
                    self.assess()
                self.assertNotIn("operations", self.calls)

    def test_missing_synthetic_labels_stop(self):
        self.data["instance"]["settings"]["userLabels"] = {}
        with self.assertRaises(rx.Stop):
            self.assess()

    def test_missing_creation_time_stops(self):
        del self.data["instance"]["createTime"]
        with self.assertRaises(rx.Stop):
            self.assess()

    def test_nonempty_database_or_additional_user_stops(self):
        for key in ("databases", "users"):
            self.data = fixture()
            self.data[key].append({"name": "unexpected"})
            with self.assertRaises(rx.Stop):
                self.assess()

    def test_partial_resources_block_and_never_access_secret_payloads(self):
        for kind in ("secrets", "buckets", "accounts", "roles", "repositories", "services", "builds"):
            self.data = fixture()
            self.data[kind] = [{"name": rx.NAME + "-partial"}]
            _, report = self.assess()
            self.assertEqual(report["status"], "BLOCKED_REQUIRES_RECONCILIATION")
            self.assertTrue(any(kind in item for item in report["blockers"]))
        self.assertFalse(any("access" in part for command in rx.queries().values() for part in command))

    def test_unrelated_names_do_not_block(self):
        self.data["services"] = [{"metadata": {"name": "hormonehealthai"}}]
        self.data["secrets"] = [{"name": "projects/123/secrets/unrelated"}]
        _, report = self.assess()
        self.assertEqual(report["blockers"], [])

    def test_other_region_asset_blocks(self):
        self.data["assets"].append({"name": rx.NAME + "-other", "assetType": "run.googleapis.com/Service"})
        self.assertTrue(any("Cross-region" in b for b in rx.reconcile(self.data)))

    def test_unknown_failed_or_pending_operation_blocks(self):
        for changes in ({"operationType": "UPDATE_USER"}, {"status": "RUNNING"}, {"error": {"code": "x"}},
                        {"targetId": "realign-app-new"}):
            self.data = fixture()
            self.data["operations"].append({**self.data["operations"][0], **changes})
            self.assertTrue(rx.reconcile(self.data))

    def test_missing_or_truncated_audit_blocks(self):
        for audit in ([], [self.data["audit"][0]] * rx.AUDIT_LIMIT):
            self.data["audit"] = audit
            self.assertTrue(rx.reconcile(self.data))

    def test_update_metadata_cannot_be_misrepresented_as_labels_only(self):
        event = copy.deepcopy(self.data["audit"][0])
        event["protoPayload"]["methodName"] = "cloudsql.instances.update"
        self.data["audit"].append(event)
        self.assertTrue(any("labels-only" in b for b in rx.reconcile(self.data)))

    def test_wrong_audit_identity_or_old_creation_blocks(self):
        self.data["audit"][0]["protoPayload"]["resourceName"] = "projects/wrong/instances/" + rx.NAME
        self.assertTrue(rx.reconcile(self.data))
        self.data = fixture()
        self.data["audit"][0]["timestamp"] = "2025-01-01T00:00:00Z"
        self.assertTrue(rx.reconcile(self.data))

    def test_resource_drift_during_assessment_stops(self):
        count = 0
        def drifting(key):
            nonlocal count
            result = self.fetch(key)
            if key == "instance":
                count += 1
                if count == 2:
                    result["state"] = "FAILED"
            return result
        with self.assertRaisesRegex(rx.Stop, "changed"):
            rx.assess(self.home, drifting)

    def test_symlinks_and_unsafe_permissions_refused(self):
        self.marker.chmod(0o644)
        with self.assertRaises(rx.Stop):
            self.assess()
        self.marker.chmod(0o600)
        root = rx.persistent_root(self.home)
        root.chmod(0o755)
        with self.assertRaises(rx.Stop):
            self.assess()

    def test_failure_evidence_survives_and_no_approval_report_exists(self):
        def failing(key):
            if key == "audit":
                raise rx.Stop("Audit permission denied")
            return self.fetch(key)
        with self.assertRaises(rx.Stop):
            rx.assess(self.home, failing)
        directory = next(rx.persistent_root(self.home).glob("assessment-*"))
        self.assertTrue((directory / "STOPPED.txt").exists())
        self.assertFalse((directory / "approval-report.json").exists())

    def test_unknown_command_blocked_and_sdk_errors_never_echo_payloads(self):
        with self.assertRaises(rx.Stop):
            rx.cloud("reset")
        error = subprocess.CompletedProcess([], 1, "", "permission denied password=synthetic-secret")
        with patch("recovery.subprocess.run", return_value=error):
            with self.assertRaises(rx.Stop) as caught:
                rx.cloud("instance")
        self.assertNotIn("synthetic-secret", str(caught.exception))
        self.assertIn("permission", str(caught.exception))

    def test_no_mutating_command_or_production_sql_or_traffic_query(self):
        disallowed = {"create", "patch", "update", "delete", "reset", "set-password", "access", "deploy",
                      "add-iam-policy-binding", "update-traffic", "connect", "export", "import"}
        for key, command in rx.queries().items():
            self.assertFalse(disallowed.intersection(command), key)
            self.assertNotIn("realign-app", command)
            self.assertNotIn("realign-app-new", command)
            self.assertNotIn("hormonehealthai", command)
            if command[0] == "sql":
                self.assertTrue(rx.NAME in command or "--instance=" + rx.NAME in command)

    def rotation_fixture(self, approve_updates=False):
        if approve_updates:
            event = copy.deepcopy(self.data["audit"][0])
            event["protoPayload"]["methodName"] = "cloudsql.instances.update"
            self.data["audit"].append(event)
        evidence, _ = self.assess()
        report_hash = rx.digest((evidence / "approval-report.json").read_bytes())
        self.writes = []
        self.secret_name = "projects/123/secrets/" + rx.ESCROW
        def execute(key, directory):
            self.writes.append(key)
            return {
                "create-escrow": {"name": self.secret_name},
                "escrow": {"name": self.secret_name},
                "escrow-policy": {},
                "escrow-password": {"name": self.secret_name + "/versions/1"},
                "escrow-versions": [{"name": self.secret_name + "/versions/1", "state": "ENABLED"}],
                "rotate-postgres": {"targetId": rx.NAME, "status": "DONE", "operationType": "UPDATE_USER"},
            }[key]
        self.execute = execute
        self.evidence, self.report_hash = evidence, report_hash
        return evidence, report_hash

    def rotate(self, **kwargs):
        return rx.rotate(
            self.evidence, self.report_hash, home=self.home, fetch=self.fetch,
            execute=self.execute, preflight=lambda _: None, **kwargs)

    def test_rotation_requires_explicit_approval_and_exact_hash(self):
        self.rotation_fixture()
        with self.assertRaisesRegex(rx.Stop, "Explicit approval"):
            self.rotate()
        self.report_hash = "a" * 64
        with self.assertRaisesRegex(rx.Stop, "hash differs"):
            self.rotate(approve_reset=True)
        self.assertEqual(self.writes, [])

    def test_approved_rotation_escrows_first_preserves_credentials_and_stops_before_sql_init(self):
        self.rotation_fixture()
        original = self.marker.read_bytes()
        workspace = self.rotate(approve_reset=True)
        self.assertEqual(self.writes, ["create-escrow", "escrow", "escrow-policy", "escrow-password",
                                      "escrow-versions", "rotate-postgres"])
        password = (workspace / "postgres-password").read_text()
        self.assertGreater(len(password), 40)
        flags = json.loads((workspace / "password-flags.json").read_text())
        self.assertEqual(flags, {"--password": password})
        for path in workspace.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        journal = json.loads((workspace / "journal.json").read_text())
        self.assertEqual(journal["status"], "rotation-command-completed-authentication-not-yet-verified")
        self.assertEqual(journal["escrowVersion"], self.secret_name + "/versions/1")
        self.assertNotIn(password, (workspace / "journal.json").read_text())
        self.assertEqual(self.marker.read_bytes(), original)
        self.writes.clear()
        with self.assertRaisesRegex(rx.Stop, "previously started"):
            self.rotate(approve_reset=True)
        self.assertEqual(self.writes, [])

    def test_history_update_requires_its_own_explicit_review_approval(self):
        self.rotation_fixture(approve_updates=True)
        with self.assertRaisesRegex(rx.Stop, "unapproved historical"):
            self.rotate(approve_reset=True)
        self.assertEqual(self.writes, [])
        self.rotate(approve_reset=True, approve_updates=True)

    def test_unknown_resources_cannot_be_overridden_with_approval_flags(self):
        self.data["buckets"] = [{"name": rx.NAME + "-unknown"}]
        self.rotation_fixture()
        with self.assertRaisesRegex(rx.Stop, "Unresolved"):
            self.rotate(approve_reset=True, approve_updates=True)
        self.assertEqual(self.writes, [])

    def test_live_changes_invalidate_approval_before_any_mutation(self):
        self.rotation_fixture()
        self.data["secrets"] = [{"name": rx.NAME + "-new"}]
        with self.assertRaisesRegex(rx.Stop, "changed since assessment"):
            self.rotate(approve_reset=True)
        self.assertEqual(self.writes, [])

    def test_failed_escrow_does_not_rotate_and_pending_journal_never_replays(self):
        self.rotation_fixture()
        original_execute = self.execute
        def fail(key, directory):
            if key == "escrow-password":
                self.writes.append(key)
                raise rx.Stop("Simulated uncertain escrow write")
            return original_execute(key, directory)
        self.execute = fail
        with self.assertRaisesRegex(rx.Stop, "uncertain"):
            self.rotate(approve_reset=True)
        self.assertNotIn("rotate-postgres", self.writes)
        workspace = rx.persistent_root(self.home) / "credential-recovery"
        journal = json.loads((workspace / "journal.json").read_text())
        self.assertEqual(journal["actions"]["escrow-password"], "pending")
        self.writes.clear()
        with self.assertRaisesRegex(rx.Stop, "previously started"):
            self.rotate(approve_reset=True)
        self.assertEqual(self.writes, [])

    def test_unsafe_escrow_policy_stops_before_secret_version_and_reset(self):
        self.rotation_fixture()
        original_execute = self.execute
        def unsafe(key, directory):
            if key == "escrow-policy":
                self.writes.append(key)
                return {"bindings": [{"role": "roles/secretmanager.secretAccessor", "members": ["allUsers"]}]}
            return original_execute(key, directory)
        self.execute = unsafe
        with self.assertRaisesRegex(rx.Stop, "IAM is unexpected"):
            self.rotate(approve_reset=True)
        self.assertNotIn("rotate-postgres", self.writes)
        self.assertNotIn("escrow-password", self.writes)

    def test_password_only_in_secure_file_not_command_arguments(self):
        commands = rx.rotation_commands(Path("/synthetic/private"))
        reset = commands["rotate-postgres"]
        self.assertIn("--instance=" + rx.NAME, reset)
        self.assertIn("--flags-file=/synthetic/private/password-flags.json", reset)
        self.assertFalse(any(a.startswith("--password=") for a in reset))


@unittest.skipUnless(shutil.which("gcloud"), "Installed SDK unavailable")
class RecoveryNativeSdk(unittest.TestCase):
    def test_actual_read_only_catalog_against_installed_sdk_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = isolated_environment(
                {k: os.environ[k] for k in ("HOME", "PATH", "LANG") if k in os.environ},
                Path(directory))
            for key, args in rx.queries().items():
                with self.subTest(command=key):
                    # Deliberate parser rejection BEFORE dispatch, no credentials.
                    probe_command(args, environment)

    def test_actual_secure_rotation_commands_against_installed_sdk_offline(self):
        rx.rotation_preflight(None)


if __name__ == "__main__":
    unittest.main()
