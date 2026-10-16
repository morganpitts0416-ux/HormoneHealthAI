import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import inspect_revision as tool


class RevisionInspection(unittest.TestCase):
    def fixture(self):
        return {"metadata": {"name": tool.REVISION, "labels": {
            "serving.knative.dev/service": "hormonehealthai", "cloud.googleapis.com/location": tool.REGION},
            "annotations": {"run.googleapis.com/cloudsql-instances": tool.CONNECTION}},
            "spec": {"containers": [{"env": [
                {"name": "DATABASE_URL", "value": "postgres://synthetic:DO_NOT_PRINT@localhost/postgres?host=/cloudsql/" + tool.CONNECTION},
                {"name": "SESSION_SECRET", "value": "DO_NOT_PRINT"},
                {"name": "PRESCRIPTION_SIGNING_APPROVED", "value": "false"},
            ]}]}}

    def test_redacts_all_credentials_and_never_authorizes_test_writes(self):
        out = tool.summarize(self.fixture())
        self.assertNotIn("DO_NOT_PRINT", json.dumps(out))
        self.assertTrue(out["cloudSqlBindingOnlyExactStaging"])
        self.assertEqual(out["databaseTargets"]["DATABASE_URL"], "EXACT_STAGING_SOCKET")
        self.assertEqual(out["signingSetting"], "DISABLED_OR_UNSET")
        self.assertIn("NO_TEST_WRITES_AUTHORIZED", out["status"])

    def test_secret_reference_is_unresolved_never_retrieved(self):
        data = self.fixture()
        data["spec"]["containers"][0]["env"][0] = {"name": "DATABASE_URL", "valueFrom": {"secretKeyRef": {"name": "DO_NOT_PRINT", "key": "1"}}}
        out = tool.summarize(data)
        self.assertEqual(out["databaseTargets"]["DATABASE_URL"], "SECRET_REFERENCE_UNRESOLVED")
        self.assertNotIn("DO_NOT_PRINT", json.dumps(out))

    def test_image_digest_is_safe_and_contradictory_digest_is_not_verified(self):
        data = self.fixture()
        data["spec"]["containers"][0]["image"] = "registry.invalid/synthetic@sha256:" + "a" * 64
        self.assertEqual(tool.summarize(data)["sourceImageDigest"], "sha256:" + "a" * 64)
        data["status"] = {"imageDigest": "registry.invalid/synthetic@sha256:" + "b" * 64}
        self.assertEqual(tool.summarize(data)["sourceImageDigest"], "UNVERIFIED_OR_CONTRADICTORY")

    def test_wrong_identity_region_or_duplicate_env_stops(self):
        for mutate in (
            lambda d: d["metadata"].update(name="other"),
            lambda d: d["metadata"]["labels"].update({"cloud.googleapis.com/location": "wrong"}),
            lambda d: d["metadata"]["labels"].update({"serving.knative.dev/service": "other"}),
            lambda d: d["spec"]["containers"][0]["env"].append(d["spec"]["containers"][0]["env"][0]),
        ):
            data = self.fixture()
            mutate(data)
            with self.assertRaises(ValueError):
                tool.summarize(data)

    def test_production_binding_and_arbitrary_database_url_never_pass_isolation(self):
        data = self.fixture()
        data["metadata"]["annotations"]["run.googleapis.com/cloudsql-instances"] = tool.PROJECT + ":" + tool.REGION + ":realign-app"
        data["spec"]["containers"][0]["env"][0]["value"] = "postgres://synthetic:DO_NOT_PRINT@external.invalid/postgres"
        out = tool.summarize(data)
        self.assertFalse(out["cloudSqlBindingOnlyExactStaging"])
        self.assertTrue(out["productionSqlBindingPresent"])
        self.assertEqual(out["databaseTargets"]["DATABASE_URL"], "TARGET_NOT_INDEPENDENTLY_VERIFIED")

    def test_only_fixed_read_only_command_no_error_body_or_http_logging(self):
        with patch.object(tool.subprocess, "run", side_effect=subprocess.TimeoutExpired(tool.COMMAND, 90)) as run:
            with patch("builtins.print") as output:
                self.assertEqual(tool.main(), 1)
            self.assertEqual(run.call_args.args[0], tool.COMMAND)
            self.assertEqual(run.call_args.kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
            self.assertNotIn("DO_NOT_PRINT", str(output.call_args_list))

    @unittest.skipUnless(shutil.which("gcloud"), "SDK unavailable")
    def test_actual_installed_sdk_parser_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"PATH": os.environ["PATH"], "HOME": directory, "CLOUDSDK_CONFIG": directory,
                           "CLOUDSDK_CORE_DISABLE_PROMPTS": "1", "CLOUDSDK_CORE_DISABLE_FILE_LOGGING": "true"}
            result = subprocess.run(tool.COMMAND + ["--cliniq-revision-parser-only"],
                                    capture_output=True, timeout=90, env=environment)
            self.assertEqual(result.returncode, 2)
            message = result.stderr.decode()
            self.assertIn("unrecognized arguments: --cliniq-revision-parser-only", message)


if __name__ == "__main__":
    unittest.main()
