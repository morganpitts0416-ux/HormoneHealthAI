"""No cloud calls: SDK-shaped fixtures and simulated command/runner failures."""
import contextlib
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import diagnostics as d
import run
from prepare import PRODUCTION_REVISION


def service():
    return {"metadata": {"name": "hormonehealthai"}, "region": "us-central1",
            "status": {"latestReadyRevisionName": PRODUCTION_REVISION,
                       "traffic": [{"revisionName": PRODUCTION_REVISION, "percent": 100}]}}


class MetadataSafety(unittest.TestCase):
    def test_computed_sdk_region_without_label(self):
        self.assertEqual(d.discover_region([{"id": "hormonehealthai", "region": "us-central1"}]), "us-central1")

    def test_v1_location_label(self):
        self.assertEqual(d.discover_region([{"metadata": {"name": "hormonehealthai",
                          "labels": {"cloud.googleapis.com/location": "us-central1"}}}]), "us-central1")

    def test_qualified_v2_resource(self):
        self.assertEqual(d.discover_region([{"name": "projects/realign-lab-app/locations/us-central1/services/hormonehealthai"}]), "us-central1")

    def test_region_missing_stops_not_keyerror(self):
        with self.assertRaisesRegex(d.RunnerFailure, "no region metadata"):
            d.discover_region([{"metadata": {"name": "hormonehealthai"}}])

    def test_conflicting_regions_stop(self):
        row = service()
        row["metadata"]["labels"] = {"cloud.googleapis.com/location": "us-east1"}
        with self.assertRaisesRegex(d.RunnerFailure, "disagree"):
            d.discover_region([row])

    def test_duplicate_production_services_stop(self):
        with self.assertRaisesRegex(d.RunnerFailure, "2 matches"):
            d.discover_region([service(), service()])

    def test_absent_service_stops(self):
        with self.assertRaisesRegex(d.RunnerFailure, "0 matches"):
            d.discover_region([{"id": "other", "region": "us-central1"}])

    def test_malformed_response_stops_without_echoing_payload(self):
        with self.assertRaisesRegex(d.RunnerFailure, "valid JSON") as error:
            d.metadata_json("sensitive malformed response", "Service discovery")
        self.assertNotIn("sensitive malformed", str(error.exception))

    def test_expected_revision_and_full_traffic_pass(self):
        d.validate_production_metadata(service(), "us-central1", PRODUCTION_REVISION)

    def test_latest_ready_mismatch_stops_with_observed_revision(self):
        row = service()
        row["status"]["latestReadyRevisionName"] = "hormonehealthai-00598-test"
        with self.assertRaisesRegex(d.RunnerFailure, "observed hormonehealthai-00598-test"):
            d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_split_live_traffic_stops_even_with_expected_latest_ready(self):
        row = service()
        row["status"]["traffic"] = [{"revisionName": PRODUCTION_REVISION, "percent": 90},
                                    {"revisionName": "hormonehealthai-00598-test", "percent": 10}]
        with self.assertRaisesRegex(d.RunnerFailure, "traffic mismatch"):
            d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_missing_status_and_traffic_stop(self):
        for row in ({"metadata": {"name": "hormonehealthai"}}, {**service(), "status": {"latestReadyRevisionName": PRODUCTION_REVISION}}):
            with self.assertRaises(d.RunnerFailure):
                d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_explicit_region_does_not_allow_wrong_describe_region(self):
        with self.assertRaisesRegex(d.RunnerFailure, "region differs"):
            d.validate_production_metadata(service(), "us-east1", PRODUCTION_REVISION)

    def test_live_traffic_total_must_be_100(self):
        row = service()
        row["status"]["traffic"][0]["percent"] = 90
        with self.assertRaisesRegex(d.RunnerFailure, "100%"):
            d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_latest_revision_pointer_resolves_verified_ready(self):
        row = service()
        row["status"]["traffic"] = [{"latestRevision": True, "percent": 100}]
        d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_zero_percent_tag_is_not_a_live_traffic_split(self):
        row = service()
        row["status"]["traffic"].append({"revisionName": "hormonehealthai-00598-test", "tag": "review"})
        d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_successful_empty_stderr_command_still_writes_flushed_log(self):
        log = io.StringIO()
        with patch("diagnostics.subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout="[]", stderr="")):
            self.assertEqual(d.CommandRunner(log, lambda: {}) (["gcloud", "run", "services", "list"], capture=True), "[]")
        self.assertIn("COMMAND: gcloud run services list", log.getvalue())
        self.assertIn("EXIT: 0", log.getvalue())

    def test_command_failure_actionable_and_redacted(self):
        secret = "sensitive-fixture-value"
        stderr = "PERMISSION_DENIED password=" + secret + " Authorization: Bearer " + secret
        log = io.StringIO()
        with patch("diagnostics.subprocess.run", return_value=subprocess.CompletedProcess([], 1, stdout="", stderr=stderr)):
            with self.assertRaisesRegex(d.RunnerFailure, "needs read access") as error:
                d.CommandRunner(log, lambda: {})(["gcloud", "run", "services", "describe", "--password=" + secret], capture=True)
        self.assertNotIn(secret, log.getvalue() + str(error.exception))
        self.assertIn("--password=", log.getvalue())

    def test_sanitizes_private_key_tokens_urls_email_and_json_credentials(self):
        token = "ya29." + "synthetic" * 5
        url = "postgresql:" + "//" + "fake:fixture@" + "example.test/db"
        fixture_secret = "sensitive-fixture-value"
        text = token + " " + url + " " + json.dumps({"refresh_token": fixture_secret}) + " owner@example.test"
        text += "\n-----BEGIN " + "PRIVATE KEY-----\nsynthetic-content\n-----END " + "PRIVATE KEY-----"
        safe = d.sanitize(text)
        for value in (token, url, "sensitive-fixture-value", "owner@example.test", "synthetic-content"):
            self.assertNotIn(value, safe)

    def test_missing_executable_actionable(self):
        with patch("diagnostics.subprocess.run", side_effect=FileNotFoundError("gcloud missing")):
            with self.assertRaisesRegex(d.RunnerFailure, "installed"):
                d.CommandRunner(io.StringIO(), lambda: {})(["gcloud"])

    def test_main_reports_validation_failure_before_any_cloud_write(self):
        with tempfile.TemporaryDirectory() as temp:
            workspace = pathlib.Path(temp)
            calls = []
            def simulated(argv, **kwargs):
                calls.append(argv)
                if "auth" in argv:
                    stdout = "synthetic@example.test"
                elif "projects" in argv:
                    stdout = "realign-lab-app"
                else:
                    stdout = json.dumps([{"id": "hormonehealthai"}])
                return subprocess.CompletedProcess(argv, 0, stdout=stdout, stderr="")
            console = io.StringIO()
            with patch("run.prepare", return_value=workspace), patch("sys.argv", ["run.py", "--execute"]), \
                 patch("diagnostics.subprocess.run", side_effect=simulated), \
                 contextlib.redirect_stdout(console), contextlib.redirect_stderr(console):
                with self.assertRaises(SystemExit) as exit:
                    run.main()
            self.assertEqual(exit.exception.code, 1)
            self.assertIn("no region metadata", console.getvalue())
            self.assertIn("gcloud", console.getvalue())
            log = (workspace / "private/operator.log").read_text()
            self.assertIn("FAILURE:", log)
            self.assertTrue(all("list" in argv or "describe" in argv for argv in calls))
            self.assertFalse((workspace / "state.json").exists())


if __name__ == "__main__":
    unittest.main()
