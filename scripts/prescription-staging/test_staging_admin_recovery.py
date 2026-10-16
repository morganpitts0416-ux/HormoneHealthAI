"""Synthetic-only escrow/reset authorization and interruption safety tests."""
import copy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import recovery as rx
import recover_staging_admin as admin
import credential_recovery_evidence as evidence
import test_recovery_audit_reconciliation as fixtures


class FakeCloud:
    def __init__(self, fixture):
        self.fixture, self.actions = fixture, []
        self.secret = f"projects/123/secrets/{rx.ESCROW}"
        self.version = self.secret + "/versions/1"
        self.payload, self.failure, self.bad_readback, self.direct_iam = None, None, False, False
        self.policy = {"bindings": []}
        self.operation = None
        self.pending = False

    def iam(self):
        return copy.deepcopy(self.policy)

    def invoke(self, action, workspace, **kwargs):
        self.actions.append(action)
        journal = evidence.private_json(workspace / "journal.json")
        if action in {"create-escrow", "escrow-password", "reset-postgres"}:
            assert journal["actions"][action] == "PENDING_OUTCOME_UNCERTAIN"
        if action == self.failure:
            raise rx.Stop("Synthetic action failure; outcome uncertain; no replay.")
        if action == "create-escrow":
            self.fixture.data["secrets"].append({"name": self.secret})
            return {"name": self.secret}
        if action == "escrow":
            return {"name": self.secret, "replication": {"automatic": {}}}
        if action == "escrow-policy":
            return {"bindings": [{"role": "synthetic-unexpected"}]} if self.direct_iam else {"bindings": []}
        if action == "escrow-password":
            self.payload = (workspace / "postgres-password").read_bytes()
            return {"name": self.version}
        if action == "escrow-versions":
            return [{"name": self.version, "state": "ENABLED"}]
        if action == "verify-escrow-payload":
            assert kwargs["version"] == "1"
            (workspace / "escrow-readback").write_bytes(b"wrong-synthetic-value" if self.bad_readback else self.payload)
            return {}
        if action == "reset-postgres":
            assert self.payload == (workspace / "postgres-password").read_bytes()
            assert journal["escrowReadbackVerified"] is True
            assert journal["actions"]["escrow-password"] == "VERIFIED_DONE"
            now = rx.audit_stamp(datetime.now(timezone.utc))
            self.operation = {"name": "synthetic-new-reset-operation", "targetId": rx.NAME, "targetProject": rx.PROJECT,
                              "operationType": "UPDATE_USER", "status": "RUNNING" if self.pending else "DONE",
                              "insertTime": now, "endTime": now}
            self.fixture.data["operations"].append(copy.deepcopy(self.operation))
            return {**self.operation, "status": "PENDING"}
        if action == "reset-operation":
            assert kwargs["operation"] == self.operation["name"]
            return copy.deepcopy(self.operation)
        raise AssertionError("Unexpected action")


class AdministratorRecoverySafety(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ReconciliationSafety(methodName="runTest")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.cloud = FakeCloud(self.fixture)
        self.source, self.source_report = self.fixture.run_tool()
        self.original_files = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in self.source.iterdir()}
        self.directory = self.plan = self.checksum = None

    def prepare(self):
        self.directory, self.plan = admin.prepare(self.source, self.fixture.evidence, self.fixture.home,
                                                  self.fixture.fetch, self.cloud.iam, lambda: None)
        self.checksum = rx.digest((self.directory / "approval-plan.json").read_bytes())
        return self.directory, self.plan

    def fresh_reconcile(self, assessment, home=None):
        self.assertEqual(assessment, self.fixture.evidence)
        self.assertEqual(home, self.fixture.home)
        return self.fixture.run_tool()

    def execute(self, **extra):
        args = dict(approve_instance=rx.NAME, approve_reset=True, acknowledge_connections=True,
                    home=self.fixture.home, fetch=self.fixture.fetch, iam_read=self.cloud.iam,
                    invoke=self.cloud.invoke, preflight=lambda: None, reconcile_now=self.fresh_reconcile,
                    sleep=lambda _: None)
        args.update(extra)
        return admin.execute(self.directory, self.checksum, **args)

    def test_prepare_is_read_only_no_credential_and_binds_connection_limitation(self):
        with patch.object(admin.secrets, "token_urlsafe", side_effect=AssertionError("No generation during prepare")):
            self.prepare()
        self.assertEqual(self.cloud.actions, [])
        self.assertFalse((rx.persistent_root(self.fixture.home) / "credential-recovery").exists())
        self.assertFalse(self.plan["resetAuthorized"])
        self.assertFalse(self.plan["initializationAuthorized"])
        self.assertEqual(self.plan["instance"], rx.NAME)
        self.assertEqual(self.plan["user"], "postgres")
        self.assertEqual(self.plan["priorConnectionEventIds"], ["event-connect"])
        self.assertIn("do not establish what SQL", self.plan["connectionLimitation"])
        self.assertEqual(self.original_files, {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in self.source.iterdir()})

    def test_no_approval_or_wrong_instance_stops_before_cloud_actions(self):
        self.prepare()
        for changes in ({"approve_reset": False}, {"acknowledge_connections": False},
                        {"approve_instance": "realign-app"}, {"approve_instance": "realign-app-new"}):
            with self.assertRaisesRegex(rx.Stop, "Explicit"):
                self.execute(**changes)
        self.assertEqual(self.cloud.actions, [])

    def test_exact_enabled_secret_payload_is_verified_before_async_reset(self):
        self.prepare()
        workspace, journal = self.execute()
        self.assertLess(self.cloud.actions.index("verify-escrow-payload"), self.cloud.actions.index("reset-postgres"))
        self.assertEqual(journal["status"], "RESET_OPERATION_DONE_AUTHENTICATION_UNVERIFIED")
        self.assertFalse(journal["authenticationVerified"])
        self.assertFalse(journal["initializationAuthorized"])
        self.assertEqual(journal["escrowVersion"], self.cloud.version)
        self.assertEqual(journal["resetOperation"]["operationType"], "UPDATE_USER")
        self.assertEqual((workspace / "postgres-password").read_bytes(), self.cloud.payload)
        for name in ("postgres-password", "password-flags.json", "escrow-readback", "journal.json"):
            self.assertEqual((workspace / name).stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.original_files, {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in self.source.iterdir()})
        self.assertEqual((self.fixture.ledger / (rx.NAME + ".json")).read_bytes(), self.fixture.original)
        for path in workspace.iterdir():
            if path.name not in {"postgres-password", "password-flags.json", "escrow-readback"}:
                self.assertNotIn(self.cloud.payload.decode(), path.read_text())

    def test_success_and_uncertain_attempts_are_never_replayed(self):
        self.prepare()
        self.execute()
        actions = list(self.cloud.actions)
        with self.assertRaisesRegex(rx.Stop, "already started"):
            self.execute()
        self.assertEqual(actions, self.cloud.actions)

    def test_failed_secret_payload_readback_never_resets_and_preserves_credentials(self):
        self.prepare()
        self.cloud.bad_readback = True
        with self.assertRaisesRegex(rx.Stop, "read-back"):
            self.execute()
        self.assertNotIn("reset-postgres", self.cloud.actions)
        root = rx.persistent_root(self.fixture.home) / "credential-recovery"
        self.assertTrue((root / "postgres-password").exists())
        self.assertEqual(evidence.private_json(root / "journal.json")["escrowVersion"], self.cloud.version)
        with self.assertRaisesRegex(rx.Stop, "already started"):
            self.execute()

    def test_secret_upload_failure_stops_before_reset_and_fences_retry(self):
        self.prepare()
        self.cloud.failure = "escrow-password"
        with self.assertRaises(rx.Stop):
            self.execute()
        self.assertNotIn("reset-postgres", self.cloud.actions)
        journal = evidence.private_json(rx.persistent_root(self.fixture.home) / "credential-recovery/journal.json")
        self.assertEqual(journal["status"], "escrow-password-UNCERTAIN")
        self.assertIn("create-escrow", journal["actions"])
        with self.assertRaisesRegex(rx.Stop, "already started"):
            self.execute()

    def test_inventory_drift_after_escrow_is_caught_immediately_before_reset(self):
        self.prepare()
        original = self.cloud.invoke
        def invoke(action, workspace, **kwargs):
            result = original(action, workspace, **kwargs)
            if action == "escrow-password":
                self.fixture.data["users"].append({"name": "synthetic-unexpected", "type": "BUILT_IN"})
            return result
        with self.assertRaises(rx.Stop):
            self.execute(invoke=invoke)
        self.assertNotIn("reset-postgres", self.cloud.actions)
        self.assertIsNotNone(self.cloud.payload)

    def test_secret_disabled_after_readback_stops_before_reset(self):
        self.prepare()
        original = self.cloud.invoke
        accessed = [False]
        def invoke(action, workspace, **kwargs):
            result = original(action, workspace, **kwargs)
            if action == "verify-escrow-payload":
                accessed[0] = True
            if action == "escrow-versions" and accessed[0]:
                result[0]["state"] = "DISABLED"
            return result
        with self.assertRaisesRegex(rx.Stop, "Escrow state changed"):
            self.execute(invoke=invoke)
        self.assertNotIn("reset-postgres", self.cloud.actions)

    def test_uncertain_reset_never_replays_or_allows_handoff(self):
        self.prepare()
        self.cloud.failure = "reset-postgres"
        with self.assertRaises(rx.Stop):
            self.execute()
        with self.assertRaises(rx.Stop):
            admin.next_phase_plan(self.fixture.home)
        attempts = self.cloud.actions.count("reset-postgres")
        with self.assertRaisesRegex(rx.Stop, "already started"):
            self.execute()
        self.assertEqual(self.cloud.actions.count("reset-postgres"), attempts)
        self.assertIsNotNone(self.cloud.payload)

    def test_pending_operation_timeout_stops_without_initialization_or_second_reset(self):
        self.prepare()
        self.cloud.pending = True
        clock = iter((0, 121))
        with self.assertRaisesRegex(rx.Stop, "remains incomplete"):
            self.execute(clock=lambda: next(clock))
        self.assertEqual(self.cloud.actions.count("reset-postgres"), 1)
        with self.assertRaises(rx.Stop):
            admin.next_phase_plan(self.fixture.home)

    def test_plan_expiry_and_checksum_tamper_block_all_actions(self):
        self.prepare()
        plan_path = self.directory / "approval-plan.json"
        self.plan["expiresAt"] = rx.audit_stamp(datetime.now(timezone.utc) - timedelta(seconds=1))
        rx.checkpoint(plan_path, self.plan)
        with self.assertRaisesRegex(rx.Stop, "SHA-256"):
            self.execute()
        self.checksum = rx.digest(plan_path.read_bytes())
        with self.assertRaisesRegex(rx.Stop, "expired"):
            self.execute()
        self.assertEqual(self.cloud.actions, [])

    def test_evidence_tamper_is_not_approval_and_never_mutates(self):
        self.prepare()
        path = self.source / "reconciliation-report.json"
        modified = evidence.private_json(path)
        modified["blockers"] = ["synthetic-unreviewed"]
        rx.checkpoint(path, modified)
        with self.assertRaisesRegex(rx.Stop, "checksum"):
            self.execute()
        self.assertEqual(self.cloud.actions, [])

    def test_fresh_database_or_user_change_stops_before_escrow(self):
        self.prepare()
        self.fixture.data["databases"].append({"name": "unexpected"})
        with self.assertRaises(rx.Stop):
            self.execute()
        self.assertEqual(self.cloud.actions, [])

    def test_new_connection_event_requires_fresh_explicit_review(self):
        self.prepare()
        event = copy.deepcopy(self.fixture.raw_events[2])
        event["timestamp"] = rx.audit_stamp(datetime.now(timezone.utc) - timedelta(seconds=30))
        event["insertId"] = "new-unreviewed-connection"
        self.fixture.raw_events.append(event)
        with self.assertRaisesRegex(rx.Stop, "new connection"):
            self.execute()
        self.assertEqual(self.cloud.actions, [])

    def test_public_project_iam_or_existing_escrow_blocks_prepare(self):
        self.cloud.policy = {"bindings": [{"role": "roles/viewer", "members": ["allUsers"]}]}
        with self.assertRaisesRegex(rx.Stop, "Public"):
            self.prepare()
        self.cloud.policy = {"bindings": []}
        self.fixture.data["secrets"].append({"name": self.cloud.secret})
        with self.assertRaisesRegex(rx.Stop, "existing/ambiguous"):
            self.prepare()
        self.assertEqual(self.cloud.actions, [])

    def test_new_secret_direct_iam_stops_before_payload_or_reset(self):
        self.prepare()
        self.cloud.direct_iam = True
        with self.assertRaisesRegex(rx.Stop, "direct IAM"):
            self.execute()
        self.assertNotIn("escrow-password", self.cloud.actions)
        self.assertNotIn("reset-postgres", self.cloud.actions)

    def test_payload_never_in_argv_or_errors_and_sdk_logs_disabled(self):
        self.prepare()
        private = self.directory
        with patch.object(admin.subprocess, "run", return_value=SimpleNamespace(
                returncode=1, stdout=b"", stderr=b"synthetic-private-response")) as run:
            with self.assertRaises(rx.Stop) as error:
                admin.call("reset-postgres", private)
            self.assertNotIn("synthetic-private-response", str(error.exception))
            args = run.call_args.args[0]
            self.assertIn("--async", args)
            self.assertTrue(any(arg.startswith("--flags-file=") for arg in args))
            self.assertFalse(any(arg.startswith("--password=") for arg in args))
            environment = run.call_args.kwargs["env"]
            self.assertEqual(environment["CLOUDSDK_CORE_DISABLE_FILE_LOGGING"], "true")
            self.assertEqual(environment["CLOUDSDK_CORE_LOG_HTTP"], "false")
        query = admin.catalog(private, "1")["verify-escrow-payload"]
        self.assertTrue(any(arg.startswith("--out-file=") for arg in query))
        self.assertFalse(any("payload.data" in arg for arg in query))

    def test_handoff_is_local_only_and_requires_new_approval_not_auth_success(self):
        self.prepare()
        self.execute()
        before = list(self.cloud.actions)
        handoff = admin.next_phase_plan(self.fixture.home)
        self.assertEqual(before, self.cloud.actions)
        self.assertFalse(handoff["authenticationVerified"])
        self.assertFalse(handoff["initializationAuthorized"])
        self.assertTrue(any("fresh dedicated synthetic database" in step for step in handoff["requiredNextSteps"]))

    def test_wrong_reset_target_or_type_is_uncertain_not_accepted(self):
        self.prepare()
        original = self.cloud.invoke
        def invoke(action, workspace, **kwargs):
            result = original(action, workspace, **kwargs)
            if action == "reset-operation":
                result["targetId"] = "realign-app"
            return result
        with self.assertRaisesRegex(rx.Stop, "identity/type/status"):
            self.execute(invoke=invoke)
        journal = evidence.private_json(rx.persistent_root(self.fixture.home) / "credential-recovery/journal.json")
        self.assertEqual(journal["status"], "reset-postgres-UNCERTAIN")


@unittest.skipUnless(shutil.which("gcloud"), "Installed SDK unavailable")
class AdministratorRecoveryNativeSdk(unittest.TestCase):
    def test_all_secure_recovery_commands_parse_on_installed_sdk_offline(self):
        admin.native_preflight()


if __name__ == "__main__":
    unittest.main()
