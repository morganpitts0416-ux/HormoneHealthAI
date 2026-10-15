"""Entire operator flow against synthetic command/proxy models, never GCP."""
import contextlib
import hashlib
import io
import json
import pathlib
import unittest
from unittest.mock import patch
import run
from continuation import ATTEMPT, NAME, atomic_json
from prepare import PROJECT, PRODUCTION_REVISION
import test_continuation as fixtures
from test_metadata import service


class ContinuationFlow(unittest.TestCase):
    setUp = fixtures.ContinuationSafety.setUp
    save_state = fixtures.ContinuationSafety.save_state

    def test_entire_flow_then_retry_skips_all_completed_mutations(self):
        tests = self.workspace / "source/tests/unit"
        tests.mkdir(parents=True)
        (tests / "prescription-fixture.test.ts").write_text("// synthetic test discovery")
        atomic_json(self.workspace / "production-before.json", service())
        atomic_json(self.workspace / "rollback-evidence.json", {"priorImage": "sha256:" + "a" * 64})
        owner = self
        cloud_writes, local_writes = [], []
        resources = set()
        pdf = b"%PDF-1.4 synthetic test fixture"
        sha = hashlib.sha256(pdf).hexdigest()
        key = "clinics/1/prescriptions/1/synthetic.pdf"
        deployed = {"image": "synthetic"}

        class Commands:
            redactions = []
            last_command = None
            note = staticmethod(lambda text: None)
            redact = staticmethod(str)
            def __call__(self, argv, **kwargs):
                self.last_command = "synthetic operator command"
                if argv[0] != "gcloud":
                    if argv[0] == "node":
                        filename = pathlib.Path(argv[1]).name
                        if filename == "database.mjs" and argv[2] == "create":
                            local_writes.append("create-db")
                            owner.created = True
                            for name in ("migration-url", "app-url"):
                                path = owner.private / name
                                path.write_text("synthetic-url")
                                path.chmod(0o600)
                        elif filename == "database.mjs" and argv[2] == "seed":
                            local_writes.append("seed")
                            (owner.private / "accounts.json").write_text('{"synthetic":true}')
                        elif filename == "probe.mjs":
                            local_writes.append("probe-" + argv[-1])
                            (owner.workspace / "synthetic-signed.pdf").write_bytes(pdf)
                            (owner.workspace / "download-result.json").write_text('{"synthetic":true}')
                        elif filename == "database.mjs" and argv[2] == "assert":
                            (owner.workspace / "database-results.json").write_text(json.dumps({"storageKey": key, "storedSha256": sha}))
                        elif filename == "migrate.mjs":
                            local_writes.append(pathlib.Path(argv[-1]).name)
                    elif "drizzle-kit" in argv or "scripts/prescription-postgres-integration.ts" in argv:
                        local_writes.append("schema-or-pg")
                    return ""
                args = argv[3:]
                if args[:2] == ["auth", "list"]:
                    return "synthetic@example.test"
                if args[:2] == ["projects", "describe"]:
                    return PROJECT
                if args[:3] == ["run", "revisions", "describe"]:
                    return "sha256:" + "a" * 64
                if args[:3] == ["run", "services", "describe"]:
                    if args[3] == "hormonehealthai":
                        return json.dumps(service())
                    if args[-1] == "--format=value(status.url)":
                        return "https://synthetic.example.test"
                    return json.dumps({"metadata": {"name": NAME}, "spec": deployed})
                if args[:3] == ["sql", "instances", "describe"] and args[-1].startswith("--format=value"):
                    return PROJECT + ":us-central1:" + NAME
                if args[:1] == ["sql"]:
                    return fixtures.ContinuationSafety.fake(owner, argv, **kwargs)
                if args[:3] == ["run", "services", "list"]:
                    return json.dumps([{"metadata": {"name": NAME}}] if "service" in resources else [])
                if args[:3] == ["iam", "service-accounts", "list"]:
                    return json.dumps([{"email": owner.state["service_account"]}] if "account" in resources else [])
                if args[:3] == ["storage", "buckets", "list"]:
                    return json.dumps([{"name": owner.state["bucket"]}] if "bucket" in resources else [])
                if args[:3] == ["iam", "roles", "list"]:
                    return json.dumps([{"name": "projects/" + PROJECT + "/roles/cliniq_rx_pdf_" + ATTEMPT}] if "role" in resources else [])
                if args[:2] == ["secrets", "list"]:
                    return json.dumps([{"name": "projects/" + PROJECT + "/secrets/" + item} for item in resources if item.startswith(NAME + "-")])
                if args[:3] == ["artifacts", "repositories", "list"]:
                    return json.dumps([{"name": "projects/" + PROJECT + "/locations/us-central1/repositories/" + NAME}] if "repository" in resources else [])
                if args[:3] == ["artifacts", "docker", "images"]:
                    if args[3] == "list":
                        return "[]"
                    return "sha256:" + "b" * 64 if args[-1].startswith("--format=value") else json.dumps({"image_summary": {"digest": "sha256:" + "b" * 64}})
                if args[:3] == ["storage", "buckets", "describe"]:
                    return '{"public_access_prevention":"enforced","uniform_bucket_level_access":true}'
                if "get-iam-policy" in args:
                    return '{"bindings":[]}'
                if "describe" in args or args[:3] == ["secrets", "versions", "list"]:
                    return '{"synthetic":"stable-resource-metadata"}'
                if args[:2] == ["storage", "cp"]:
                    (owner.workspace / "object-readback.pdf").write_bytes(pdf)
                    return ""
                cloud_writes.append(args)
                if args[:3] == ["iam", "service-accounts", "create"]:
                    resources.add("account")
                elif args[:3] == ["storage", "buckets", "create"]:
                    resources.add("bucket")
                elif args[:3] == ["iam", "roles", "create"]:
                    resources.add("role")
                elif args[:2] == ["secrets", "create"]:
                    resources.add(args[2])
                elif args[:3] == ["artifacts", "repositories", "create"]:
                    resources.add("repository")
                elif args[:2] == ["run", "deploy"]:
                    resources.add("service")
                elif args[:3] == ["run", "services", "update"]:
                    deployed["bucket"] = args[-1]
                return ""

        class Process:
            def __init__(self, argv, **kwargs):
                for arg in argv:
                    if arg.startswith("--unix-socket="):
                        path = pathlib.Path(arg.split("=", 1)[1]) / (PROJECT + ":us-central1:" + NAME)
                        path.mkdir()
                        (path / ".s.PGSQL.5432").touch()
            poll = staticmethod(lambda: None)
            terminate = staticmethod(lambda: None)
            wait = staticmethod(lambda **kwargs: None)

        args = ["continue.py", "--execute", "--continue-workspace", str(self.workspace),
                "--attempt-id", ATTEMPT, "--materials", str(self.root / "materials"), "--region=us-central1"]
        import continuation
        original = continuation.Continuation.__init__
        def initialize(c, workspace, materials):
            original(c, workspace, materials, owner.ledger)
        with patch.object(continuation.Continuation, "__init__", initialize), \
             patch("sys.argv", args), patch("run.CommandRunner", side_effect=lambda *args: Commands()), \
             patch("run.validate_sdk", return_value={"checkedCommandShapes": 48}), \
             patch("run.shutil.which", return_value="/synthetic/proxy"), \
             patch("run.subprocess.Popen", side_effect=Process), patch("run.wait_port"), \
             contextlib.redirect_stdout(io.StringIO()):
            run.main()
            first = (len(cloud_writes), len(local_writes))
            run.main()
        self.assertEqual(first, (len(cloud_writes), len(local_writes)))
        self.assertGreater(first[0], 15)
        self.assertEqual(local_writes.count("create-db"), 1)
        self.assertTrue(json.loads((self.workspace / "state.json").read_text())["actual_http_storage_tests_passed"])
        self.assertFalse(any(args[:1] == ["sql"] for args in cloud_writes))
        self.assertTrue(all("hormonehealthai" not in args for args in cloud_writes))
