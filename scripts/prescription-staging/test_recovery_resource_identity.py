"""Synthetic identity formats; no real credentials, database or cloud calls."""
import copy
from datetime import timedelta
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import recovery as rx
import reconcile_recovery_audit as reconciliation
import diagnose_recovery_resource_identity as identity
import test_recovery_audit_reconciliation as fixtures
from sdk_compat import isolated_environment, probe_command


class IdentityFormatSafety(unittest.TestCase):
    def setUp(self):
        self.helper = fixtures.ReconciliationSafety(methodName="runTest")
        self.helper.setUp()
        self.addCleanup(self.helper.doCleanups)
        self.project = self.helper.data["project"]

    def test_project_parent_is_rejected_without_exact_authoritative_create_binding(self):
        parent = "projects/" + rx.PROJECT
        with self.assertRaises(rx.Stop):
            reconciliation.resource_identity(parent, self.project)
        op = self.helper.descriptions[reconciliation.CREATE]
        self.assertEqual(reconciliation.resource_identity(parent, self.project, op),
                         "verified-create-parent-via-authoritative-operation")
        for changes in ({"name": reconciliation.UPDATE}, {"operationType": "UPDATE"}, {"status": "RUNNING"},
                        {"targetId": "realign-app"}, {"targetId": "realign-app-new"},
                        {"targetProject": "different-project"}, {"error": {"code": "synthetic"}}):
            with self.assertRaises(rx.Stop):
                reconciliation.resource_identity(parent, self.project, {**op, **changes})
        with self.assertRaises(rx.Stop):
            reconciliation.resource_identity("projects/456", self.project, op)

    def test_bare_instance_label_requires_exact_type_and_independent_project_label(self):
        raw = {"resource": {"type": "cloudsql_database",
                            "labels": {"project_id": rx.PROJECT, "database_id": rx.NAME, "region": rx.REGION}}}
        self.assertTrue(reconciliation.monitored_resource_consistent(raw, self.project))
        raw["resource"]["labels"]["project_id"] = "123"
        self.assertTrue(reconciliation.monitored_resource_consistent(raw, self.project))
        for changes in ({"project_id": "wrong"}, {"database_id": "realign-app"}, {"database_id": "realign-app-new"},
                        {"database_id": "wrong:" + rx.NAME}, {"region": "us-east1"}):
            changed = copy.deepcopy(raw)
            changed["resource"]["labels"].update(changes)
            self.assertFalse(reconciliation.monitored_resource_consistent(changed, self.project))
        for kind in (None, "audited_resource", "unknown"):
            raw["resource"]["type"] = kind
            self.assertFalse(reconciliation.monitored_resource_consistent(raw, self.project))
        raw["resource"]["type"] = "cloudsql_database"
        raw["resource"]["labels"].pop("project_id")
        self.assertFalse(reconciliation.monitored_resource_consistent(raw, self.project))

    def test_parent_not_accepted_for_update_connect_or_wrong_audit_operation(self):
        op = self.helper.descriptions[reconciliation.CREATE]
        raw = copy.deepcopy(self.helper.raw_events[0])
        raw["protoPayload"]["resourceName"] = "projects/" + rx.PROJECT
        for method, op_id in (("cloudsql.instances.update", reconciliation.CREATE),
                              ("cloudsql.instances.update", reconciliation.UPDATE),
                              ("cloudsql.instances.connect", None)):
            raw["protoPayload"]["methodName"] = method
            raw["operation"]["id"] = op_id
            view = identity.identity_view(raw, self.project, self.helper.descriptions)
            self.assertIsNone(view["comparison"]["newResourceNormalization"])
            self.assertEqual(view["comparison"]["status"], "UNVERIFIED_OR_CONTRADICTORY_DO_NOT_PROCEED")

    def prepared_legacy_reconciliation(self):
        helper = self.helper
        progress_path = helper.evidence / "audit-progress.json"
        progress = json.loads(progress_path.read_text())
        renames = {"event-create": identity.TARGET_IDS[0], "event-update": identity.TARGET_IDS[1]}
        for event in helper.raw_events:
            event["insertId"] = renames.get(event["insertId"], event["insertId"])
            if (event.get("operation") or {}).get("id") == reconciliation.CREATE:
                event["protoPayload"]["resourceName"] = "projects/" + rx.PROJECT
        for event in progress["entries"]:
            event["insertId"] = renames.get(event["insertId"], event["insertId"])
            if (event.get("operation") or {}).get("id") == reconciliation.CREATE:
                event["protoPayload"]["resourceName"] = "projects/" + rx.PROJECT
        for complete in progress["attempts"]:
            if complete["status"] == "complete":
                batch = [event for event in progress["entries"]
                         if rx.audit_time(complete["from"]) <= rx.audit_time(event["timestamp"]) < rx.audit_time(complete["until"])]
                complete["sha256"] = rx.digest(rx.encoded(batch))
        rx.checkpoint(progress_path, progress)
        helper.raw_events[0]["resource"] = {"type": "cloudsql_database", "labels": {
            "project_id": rx.PROJECT, "database_id": rx.PROJECT + ":" + rx.NAME, "region": rx.REGION}}
        helper.raw_events[1]["resource"] = {"type": "cloudsql_database", "labels": {
            "project_id": rx.PROJECT, "database_id": rx.NAME, "region": rx.REGION}}
        duplicate = copy.deepcopy(helper.raw_events[1])
        duplicate["insertId"] = "synthetic-update-start"
        duplicate["resource"]["labels"]["database_id"] = rx.PROJECT + ":" + rx.NAME
        duplicate["operation"]["last"] = False
        helper.raw_events.append(duplicate)
        original_resource = reconciliation.resource_identity
        original_monitored = reconciliation.monitored_resource_consistent
        def legacy_resource(value, project, create_operation=None):
            return original_resource(value, project)
        def legacy_monitored(raw, project):
            if (raw.get("resource") or {}).get("labels", {}).get("database_id") == rx.NAME:
                return False
            return original_monitored(raw, project)
        with patch.object(reconciliation, "resource_identity", legacy_resource), \
                patch.object(reconciliation, "monitored_resource_consistent", legacy_monitored):
            output, report = helper.run_tool()
        self.assertEqual(report["status"], "BLOCKED")
        return output

    def test_two_record_diagnostic_preserves_legacy_evidence_and_displays_actual_expected(self):
        evidence = self.prepared_legacy_reconciliation()
        before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in evidence.iterdir()}
        output, report = identity.inspect(evidence, self.helper.home, self.helper.fetch, self.helper.describe, self.helper.execute)
        self.assertEqual(report["auditQueries"], 2)
        self.assertFalse(report["recoveryAuthorized"])
        self.assertEqual(len(report["records"]), 2)
        create, update = report["records"]
        self.assertFalse(create["comparison"]["priorVerifierResourceNameAccepted"])
        self.assertEqual(create["comparison"]["newResourceNormalization"], "verified-create-parent-via-authoritative-operation")
        self.assertFalse(update["comparison"]["priorVerifierMonitoredLabelsAccepted"])
        self.assertTrue(update["comparison"]["newMonitoredLabelsConsistent"])
        self.assertEqual(update["actual"]["monitoredResource"]["labels"]["database_id"], rx.NAME)
        self.assertTrue(all(record["comparison"]["status"] == "IDENTITY_FIELDS_CONSISTENT_WITH_VERIFIED_STAGING_OPERATION"
                            for record in report["records"]))
        self.assertEqual(before, {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in evidence.iterdir()})
        self.assertNotIn(self.helper.actor, (output / "identity-comparison.json").read_text())
        self.assertEqual((self.helper.ledger / (rx.NAME + ".json")).read_bytes(), self.helper.original)

    def test_projection_never_requests_principal_request_response_or_all_labels(self):
        args = identity.query({"timestamp": rx.audit_stamp(self.helper.created), "insertId": identity.TARGET_IDS[0]})
        self.assertIn("--limit=3", args)
        self.assertIn("insertId=", args[2])
        self.assertIn("timestamp>=", args[2])
        for field in ("protoPayload.request", "protoPayload.response", "authenticationInfo"):
            self.assertNotIn(field, args[-1])
        self.assertNotIn("resource.labels,", args[-1])

    def test_private_payload_and_unrequested_label_values_never_enter_identity_output(self):
        raw = copy.deepcopy(self.helper.raw_events[0])
        raw["protoPayload"]["request"] = {"rootPassword": "synthetic-private-password"}
        raw["protoPayload"]["response"] = {"privateField": "synthetic-private-response"}
        raw["resource"] = {"labels": {"unrequested_field": "synthetic-private-label"}}
        output = json.dumps(identity.identity_view(raw, self.project, self.helper.descriptions))
        for secret in ("synthetic-private-password", "synthetic-private-response", "synthetic-private-label", self.helper.actor):
            self.assertNotIn(secret, output)

    def test_ambiguous_or_missing_log_results_stop_not_silently_accept(self):
        evidence = self.prepared_legacy_reconciliation()
        for records in ([], [{}, {}], [{}, {}, {}]):
            with self.assertRaisesRegex(rx.Stop, "missing, ambiguous"):
                identity.inspect(evidence, self.helper.home, self.helper.fetch, self.helper.describe,
                                 lambda *args: records)

    def test_corrupt_manifest_stops_before_any_fresh_cloud_read(self):
        evidence = self.prepared_legacy_reconciliation()
        rx.checkpoint(evidence / "sanitized-audit.json", [])
        self.helper.calls.clear()
        with self.assertRaisesRegex(rx.Stop, "checksum"):
            identity.inspect(evidence, self.helper.home, self.helper.fetch, self.helper.describe, self.helper.execute)
        self.assertEqual(self.helper.calls, [])

    def test_tampered_or_changed_log_is_not_replaced_by_proximity(self):
        evidence = self.prepared_legacy_reconciliation()
        self.helper.raw_events[0]["protoPayload"]["resourceName"] = "projects/different-project"
        with self.assertRaisesRegex(rx.Stop, "differs from preserved"):
            identity.inspect(evidence, self.helper.home, self.helper.fetch, self.helper.describe, self.helper.execute)

    def test_corrected_full_reconciliation_passes_known_formats_but_still_no_authorization(self):
        self.prepared_legacy_reconciliation()
        _, report = self.helper.run_tool()
        self.assertEqual(report["blockers"], [])
        self.assertFalse(report["credentialResetAuthorized"])
        self.assertFalse(report["recoveryAuthorized"])


@unittest.skipUnless(shutil.which("gcloud"), "Installed SDK unavailable")
class IdentityNativeSdk(unittest.TestCase):
    def test_exact_metadata_only_query_parses_on_installed_sdk_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            env = isolated_environment({k: os.environ[k] for k in ("HOME", "PATH", "LANG") if k in os.environ}, Path(directory))
            probe_command(identity.query({"timestamp": "2026-10-11T12:00:00Z", "insertId": identity.TARGET_IDS[0]}), env)


if __name__ == "__main__":
    unittest.main()
