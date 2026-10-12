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

    def test_user_reported_tagged_latest_ready_does_not_override_100_percent_traffic(self):
        row = service()
        row["status"]["latestReadyRevisionName"] = "hormonehealthai-00578-7kl"
        row["status"]["traffic"].insert(0, {"revisionName": "hormonehealthai-00578-7kl",
                                          "tag": "prescription-test",
                                          "url": "https://tagged.example.test"})
        self.assertEqual(d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION), PRODUCTION_REVISION)

    def test_other_revision_receiving_100_percent_fails_even_when_latest_ready_expected(self):
        row = service()
        row["status"]["traffic"][0]["revisionName"] = "hormonehealthai-00578-7kl"
        with self.assertRaisesRegex(d.RunnerFailure, "traffic mismatch"):
            d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_missing_latest_ready_is_not_missing_serving_provenance(self):
        row = service()
        del row["status"]["latestReadyRevisionName"]
        d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_duplicate_positive_entries_are_split_even_for_same_revision(self):
        row = service()
        row["status"]["traffic"] = [{"revisionName": PRODUCTION_REVISION, "percent": 50}] * 2
        with self.assertRaisesRegex(d.RunnerFailure, "split"):
            d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_split_live_traffic_stops_even_with_expected_latest_ready(self):
        row = service()
        row["status"]["traffic"] = [{"revisionName": PRODUCTION_REVISION, "percent": 90},
                                    {"revisionName": "hormonehealthai-00598-test", "percent": 10}]
        with self.assertRaisesRegex(d.RunnerFailure, "traffic mismatch"):
            d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_tag_with_positive_percent_is_not_ignored(self):
        row = service()
        row["status"]["traffic"] = [{"revisionName": PRODUCTION_REVISION, "percent": 90},
                                    {"revisionName": "hormonehealthai-00578-7kl", "tag": "review", "percent": 10}]
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

    def test_latest_revision_pointer_without_resolved_traffic_revision_stops(self):
        row = service()
        row["status"]["traffic"] = [{"latestRevision": True, "percent": 100}]
        with self.assertRaisesRegex(d.RunnerFailure, "resolved revisionName"):
            d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_latest_revision_flag_with_resolved_revision_is_verified_by_traffic(self):
        row = service()
        row["status"]["traffic"][0]["latestRevision"] = True
        row["status"]["latestReadyRevisionName"] = "hormonehealthai-00578-7kl"
        d.validate_production_metadata(row, "us-central1", PRODUCTION_REVISION)

    def test_invalid_image_stops(self):
        for image in ("", "mutable:latest", "sha256:short", "untrusted\nsha256:" + "a" * 64):
            with self.assertRaisesRegex(d.RunnerFailure, "immutable image"):
                d.validate_production_image(image)

    def test_final_check_preserves_tagged_revision_and_ignores_ready_pointer_and_order(self):
        before = service()
        before["status"]["latestReadyRevisionName"] = "hormonehealthai-00578-7kl"
        before["status"]["traffic"].append({"revisionName": "hormonehealthai-00578-7kl",
                                           "tag": "prescription-test", "url": "https://tagged.example.test"})
        after = json.loads(json.dumps(before))
        after["status"]["traffic"].reverse()
        after["status"]["latestReadyRevisionName"] = "hormonehealthai-00579-test"
        image = "example.test/project/image@sha256:" + "a" * 64
        d.verify_production_unchanged(before, after, "us-central1", PRODUCTION_REVISION, image, image)

    def test_final_check_detects_tag_binding_change(self):
        before = service()
        before["status"]["traffic"].append({"revisionName": "hormonehealthai-00578-7kl", "tag": "review"})
        after = json.loads(json.dumps(before))
        after["status"]["traffic"][1]["revisionName"] = "hormonehealthai-00579-test"
        image = "sha256:" + "a" * 64
        with self.assertRaisesRegex(d.RunnerFailure, "configuration"):
            d.verify_production_unchanged(before, after, "us-central1", PRODUCTION_REVISION, image, image)

    def test_final_check_detects_metadata_and_image_change(self):
        before = service()
        after = json.loads(json.dumps(before))
        after["metadata"]["labels"] = {"changed": "true"}
        image = "sha256:" + "a" * 64
        with self.assertRaisesRegex(d.RunnerFailure, "metadata changed"):
            d.verify_production_unchanged(before, after, "us-central1", PRODUCTION_REVISION, image, image)
        with self.assertRaisesRegex(d.RunnerFailure, "image changed"):
            d.verify_production_unchanged(before, before, "us-central1", PRODUCTION_REVISION, image, "sha256:" + "b" * 64)

    def test_final_check_detects_serving_revision_change(self):
        after = service()
        after["status"]["traffic"][0]["revisionName"] = "hormonehealthai-00578-7kl"
        image = "sha256:" + "a" * 64
        with self.assertRaisesRegex(d.RunnerFailure, "traffic mismatch"):
            d.verify_production_unchanged(service(), after, "us-central1", PRODUCTION_REVISION, image, image)

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

    def test_main_split_traffic_or_unverified_image_stops_before_any_cloud_write(self):
        for failure in ("split", "image"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                workspace = pathlib.Path(temp)
                calls = []
                row = service()
                row["status"]["latestReadyRevisionName"] = "hormonehealthai-00578-7kl"
                row["status"]["traffic"].append({"revisionName": "hormonehealthai-00578-7kl",
                                                "tag": "prescription-test", "url": "https://tagged.example.test"})
                if failure == "split":
                    row["status"]["traffic"][0]["percent"] = 90
                    row["status"]["traffic"][1]["percent"] = 10
                def simulated(argv, **kwargs):
                    calls.append(argv)
                    if "auth" in argv:
                        stdout = "synthetic@example.test"
                    elif "projects" in argv:
                        stdout = "realign-lab-app"
                    elif "list" in argv:
                        stdout = json.dumps([row])
                    elif "revisions" in argv:
                        stdout = "not-an-immutable-image"
                    else:
                        stdout = json.dumps(row)
                    return subprocess.CompletedProcess(argv, 0, stdout=stdout, stderr="")
                console = io.StringIO()
                with patch("run.prepare", return_value=workspace), patch("sys.argv", ["run.py", "--execute"]), \
                     patch("diagnostics.subprocess.run", side_effect=simulated), \
                     contextlib.redirect_stdout(console), contextlib.redirect_stderr(console):
                    with self.assertRaises(SystemExit) as exit:
                        run.main()
                self.assertEqual(exit.exception.code, 1)
                self.assertTrue(all("list" in argv or "describe" in argv for argv in calls))
                self.assertIn("traffic mismatch" if failure == "split" else "immutable image", console.getvalue())
                self.assertFalse((workspace / "state.json").exists())


if __name__ == "__main__":
    unittest.main()
