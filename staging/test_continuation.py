"""Offline continuation fencing tests. All cloud metadata is synthetic."""
import io
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from continuation import ATTEMPT, NAME, Continuation, protected, atomic_json
from diagnostics import CommandRunner, RunnerFailure
from prepare import PROJECT
from run import free_port

TOOLS = pathlib.Path(__file__).parent


class ContinuationSafety(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir(mode=0o700)
        (self.workspace / "source").mkdir()
        (self.workspace / "source/file.ts").write_text("// synthetic source")
        self.private = self.workspace / "private"
        self.private.mkdir(mode=0o700)
        self.ledger = self.root / "ledger"
        self.ledger.mkdir(mode=0o700)
        self.state = {
            "project": PROJECT, "region": "us-central1", "nonce": ATTEMPT, "instance": NAME,
            "service": NAME, "repository": NAME, "bucket": PROJECT + "-" + NAME,
            "database": "rx_stage_" + ATTEMPT, "app_role": "rx_stage_app_" + ATTEMPT,
            "service_account": NAME + "@" + PROJECT + ".iam.gserviceaccount.com",
            "synthetic_only": True, "production_writes_authorized": False,
            "sql_proxy_port": free_port(), "http_proxy_port": free_port(),
        }
        self.save_state()
        self.marker = self.ledger / (NAME + ".json")
        atomic_json(self.marker, {"project": PROJECT, "instance": NAME, "status": "instance-created-and-labels-verified"})
        for name in ("admin-password", "app-password", "pgtest-password", "session", "signature", "catalog.json"):
            path = self.private / name
            path.write_text("synthetic-fixture-" + name)
            path.chmod(0o600)
        self.preparation = patch("continuation.prepare")
        self.preparation.start()
        self.addCleanup(self.preparation.stop)
        self.addCleanup(self.temporary.cleanup)
        self.calls = []
        self.created = False
        self.fail = False
        self.c = None
        self.addCleanup(lambda: self.c and self.c.close())

    def save_state(self):
        atomic_json(self.workspace / "state.json", self.state)

    def open(self):
        self.c = Continuation(self.workspace, self.root / "materials", self.ledger)
        self.c.attach(CommandRunner(io.StringIO(), lambda: {}))
        self.c.raw = self.fake
        return self.c

    def fake(self, argv, **kwargs):
        self.calls.append(argv)
        if self.fail:
            raise RunnerFailure("simulated interrupted operation")
        args = argv[3:] if argv[0] == "gcloud" else argv
        if args[:3] == ["sql", "instances", "describe"]:
            return json.dumps({
                "name": NAME, "project": PROJECT, "region": self.state["region"], "databaseVersion": "POSTGRES_18",
                "connectionName": PROJECT + ":" + self.state["region"] + ":" + NAME, "state": "RUNNABLE",
                "settings": {"tier": "db-custom-1-3840", "userLabels": {"purpose": "cliniq-prescription-staging", "synthetic-only": "true"}},
            })
        if args[:3] == ["sql", "databases", "list"]:
            return json.dumps([{"name": name} for name in ["postgres"] + ([self.state["database"], "cliniq_synthetic"] if self.created else [])])
        if args[:3] == ["sql", "users", "list"]:
            return '[{"name":"postgres"}]'
        if args[:3] == ["run", "services", "list"]:
            return "[]"
        if "list" in args:
            return "[]"
        if argv[0] == "node":
            if pathlib.Path(argv[1]).name == "database.mjs" and argv[2] == "create":
                self.created = True
                for name in ("app-url", "migration-url"):
                    (self.private / name).write_text("synthetic-local-url")
                    (self.private / name).chmod(0o600)
            return ""
        return '{"bindings":[]}'

    def action(self, *args):
        c = self.c
        # Preserve CommandRunner's safe logging surface while replacing dispatch.
        original = c.raw
        class Fake:
            note = staticmethod(lambda text: None)
            redact = staticmethod(str)
            def __call__(self, argv, **kwargs):
                return original(argv, **kwargs)
        c.raw = Fake()
        return c(["node", str(TOOLS / "database.mjs"), *args, str(self.workspace)])

    def test_verified_instance_adoption_uses_only_read_operations(self):
        self.open().verify_cloud()
        self.assertTrue(self.calls)
        self.assertFalse(any("create" in call or "patch" in call or "delete" in call for call in self.calls))

    def test_wrong_workspace_project_instance_and_scope_are_rejected(self):
        for field, wrong in (("project", "other"), ("instance", "realign-app"), ("synthetic_only", False),
                             ("production_writes_authorized", True), ("nonce", "0000000000")):
            with self.subTest(field=field):
                old = self.state[field]
                self.state[field] = wrong
                self.save_state()
                with self.assertRaises(RunnerFailure):
                    self.open()
                self.state[field] = old
        self.save_state()

    def test_wrong_ledger_status_fails_before_cloud(self):
        atomic_json(self.marker, {"project": PROJECT, "instance": NAME, "status": "instance-created"})
        with self.assertRaises(RunnerFailure):
            self.open()
        self.assertEqual(self.calls, [])

    def test_live_identity_region_labels_and_state_mismatch_stop(self):
        c = self.open()
        response = json.loads(self.fake(["gcloud", "--quiet", "--project=" + PROJECT, "sql", "instances", "describe"]))
        for field in ("project", "region", "name", "connectionName", "state", "databaseVersion"):
            changed = {**response, field: "unexpected"}
            with patch.object(c, "query", return_value=changed), self.assertRaises(RunnerFailure):
                c.verify_cloud()
        response["settings"]["userLabels"] = {}
        with patch.object(c, "query", return_value=response), self.assertRaises(RunnerFailure):
            c.verify_cloud()

    def test_concurrent_attempt_is_locked(self):
        self.open()
        with self.assertRaises(BlockingIOError):
            Continuation(self.workspace, self.root / "materials", self.ledger)

    def test_pending_interrupted_write_is_never_replayed(self):
        c = self.open()
        self.fail = True
        with self.assertRaises(RunnerFailure):
            self.action("create")
        c.close()
        self.fail = False
        count = len(self.calls)
        with self.assertRaisesRegex(RunnerFailure, "uncertain"):
            self.open()
        self.assertEqual(len(self.calls), count)

    def test_completed_database_creation_is_skipped_on_retry(self):
        c = self.open()
        self.action("create")
        c.close()
        self.open().verify_cloud()
        count = len(self.calls)
        self.action("create")
        self.assertEqual(count, len(self.calls))
        self.assertTrue(self.c.done("database-create"))

    def test_existing_unjournaled_database_is_not_adopted(self):
        self.created = True
        with self.assertRaisesRegex(RunnerFailure, "inventory"):
            self.open().verify_cloud()

    def test_changed_source_credentials_and_missing_outputs_block_retry(self):
        c = self.open()
        self.action("create")
        c.close()
        (self.private / "app-url").unlink()
        with self.assertRaisesRegex(RunnerFailure, "evidence"):
            self.open()
        (self.private / "app-url").write_text("synthetic-local-url")
        (self.private / "session").write_text("changed-fixture")
        with self.assertRaisesRegex(RunnerFailure, "changed"):
            self.open()

    def test_symlink_and_insecure_workspace_fail(self):
        (self.private / "session").unlink()
        (self.private / "session").symlink_to(self.private / "admin-password")
        with self.assertRaises(RunnerFailure):
            self.open()
        self.workspace.chmod(0o755)
        with self.assertRaises(RunnerFailure):
            protected(self.workspace, True)

    def test_production_sql_reads_writes_and_run_writes_are_forbidden(self):
        c = self.open()
        for args in (["sql", "instances", "describe", "realign-app"],
                     ["sql", "instances", "delete", NAME],
                     ["sql", "instances", "create", NAME],
                     ["sql", "users", "list", "--instance=realign-app-new"],
                     ["run", "deploy", "hormonehealthai"],
                     ["run", "services", "update", "hormonehealthai"]):
            with self.subTest(args=args), self.assertRaises(RunnerFailure):
                c.action(["gcloud", "--quiet", "--project=" + PROJECT, *args])

    def test_stored_query_cannot_access_production_sql(self):
        c = self.open()
        with self.assertRaises(RunnerFailure):
            c.query(["sql", "instances", "describe", "realign-app", "--format=json"])

    def test_completed_cloud_evidence_mismatch_stops(self):
        c = self.open()
        c.data["evidence"]["test"] = {"queries": [["projects", "get-iam-policy", PROJECT, "--format=json"]], "digest": "wrong"}
        with self.assertRaisesRegex(RunnerFailure, "configuration"):
            c.verify_cloud()

    def test_preexisting_service_is_not_replaced(self):
        c = self.open()
        c.raw = CommandRunner(io.StringIO(), lambda: {})
        with patch.object(c, "query", return_value=[{"metadata": {"name": NAME}}]), self.assertRaisesRegex(RunnerFailure, "already exists"):
            c(["gcloud", "--quiet", "--project=" + PROJECT, "run", "deploy", NAME])

    def test_public_iam_is_rejected(self):
        with self.assertRaises(RunnerFailure):
            Continuation.reject_public({"bindings": [{"members": ["allUsers"]}]})

    def test_continuation_entrypoint_requires_explicit_workspace(self):
        result = subprocess.run(["python3", str(TOOLS / "continue.py")], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ORIGINAL", result.stderr)
