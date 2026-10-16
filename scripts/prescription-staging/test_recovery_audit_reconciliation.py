"""Synthetic-only read-only reconciliation, actor/request and SDK safety tests."""
import copy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import recovery as rx
import diagnose_recovery_audit as diagnostic
import reconcile_recovery_audit as reconcile
from test_recovery import fixture
from sdk_compat import isolated_environment, probe_command


class ReconciliationSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.ledger = self.home / ".local/state/cliniq-rx-staging"
        self.ledger.mkdir(mode=0o700, parents=True)
        self.original = rx.encoded(rx.EXPECTED_LEDGER)
        rx.save(self.ledger / (rx.NAME + ".json"), self.original)
        rx.save(self.ledger / (rx.NAME + ".lock"), b"")
        self.evidence = rx.persistent_root(self.home) / "assessment-synthetic-reconcile"
        self.evidence.mkdir(mode=0o700)
        self.data = fixture()
        created = datetime.now(timezone.utc) - timedelta(hours=67)
        self.created = created
        self.data["instance"]["createTime"] = rx.audit_stamp(created)
        self.descriptions = {}
        for identity, kind in reconcile.EXPECTED.items():
            start = created + (timedelta(seconds=1) if kind == "CREATE" else timedelta(minutes=5))
            self.descriptions[identity] = {
                "name": identity, "targetId": rx.NAME, "targetProject": rx.PROJECT,
                "operationType": kind, "status": "DONE",
                "insertTime": rx.audit_stamp(start), "startTime": rx.audit_stamp(start),
                "endTime": rx.audit_stamp(start + timedelta(minutes=1)),
            }
        self.data["operations"] = [{key: value for key, value in operation.items() if key != "targetProject"}
                                   for operation in self.descriptions.values()]
        self.actor = "synthetic@example.test"
        self.raw_events = []
        for identity, kind in reconcile.EXPECTED.items():
            self.raw_events.append({
                "timestamp": self.descriptions[identity]["insertTime"], "insertId": "event-" + kind.lower(),
                "operation": {"id": identity, "producer": "cloudsql.googleapis.com",
                              **({"last": True} if kind == "UPDATE" else {})},
                "protoPayload": {
                    "serviceName": "cloudsql.googleapis.com", "methodName": reconcile.METHODS[kind],
                    "resourceName": "projects/123/instances/" + rx.NAME,
                    "authenticationInfo": {"principalEmail": self.actor},
                    **({"request": {"project": rx.PROJECT, "instance": rx.NAME,
                                     "body": {"settings": {"userLabels": dict(rx.LABELS), "settingsVersion": "1"}}}}
                       if kind == "UPDATE" else {}),
                },
            })
        self.raw_events.append({
            "timestamp": rx.audit_stamp(created + timedelta(minutes=20)), "insertId": "event-connect",
            "protoPayload": {"serviceName": "cloudsql.googleapis.com", "methodName": "cloudsql.instances.connect",
                             "resourceName": "projects/123/instances/" + rx.NAME,
                             "authenticationInfo": {"principalEmail": self.actor}},
        })
        historical = copy.deepcopy(self.raw_events)
        for event in historical:
            event["protoPayload"].pop("authenticationInfo", None)
            event["protoPayload"].pop("request", None)
        attempts, entries = [], []
        first = created - timedelta(hours=1)
        for i in range(11):
            left, right = first + timedelta(hours=6 * i), first + timedelta(hours=6 * (i + 1))
            batch = sorted([e for e in historical if left <= rx.audit_time(e["timestamp"]) < right],
                           key=lambda e: e["timestamp"], reverse=True)
            entries.extend(batch)
            bounds = {"from": rx.audit_stamp(left), "until": rx.audit_stamp(right)}
            attempts.extend([{**bounds, "status": "querying", "attempt": i + 1},
                             {**bounds, "status": "complete", "count": len(batch), "sha256": rx.digest(rx.encoded(batch))}])
        for key in rx.queries():
            rx.save(self.evidence / (key + ".json"), rx.encoded(self.data[key]))
        rx.save(self.evidence / "audit-progress.json", rx.encoded({"attempts": attempts, "entries": entries}))
        rx.save(self.evidence / "original-ledger.json", self.original)
        rx.save(self.evidence / "tool-sha256.txt", (diagnostic.LEGACY_TOOL_SHA256 + "\n").encode())
        rx.save(self.evidence / "STOPPED.txt", b"Failed terminal audit gate; no approval.\n")
        self.calls = []
        self.reader = None

    def fetch(self, key):
        self.calls.append(("metadata", key))
        return copy.deepcopy(self.data[key])

    def describe(self, identity):
        self.calls.append(("operation", identity))
        return copy.deepcopy(self.descriptions[identity])

    def execute(self, key, args, timeout):
        self.calls.append(("audit", args, timeout))
        start = rx.audit_time(re.search(r'timestamp>="([^"]+)"', args[2]).group(1))
        end = rx.audit_time(re.search(r'timestamp<"([^"]+)"', args[2]).group(1))
        identifiers = re.findall(r'operation.id="([^"]+)"', args[2])
        inserts = re.findall(r'insertId="([^"]+)"', args[2])
        return copy.deepcopy([e for e in self.raw_events if start <= rx.audit_time(e["timestamp"]) < end and
                              (not identifiers or (e.get("operation") or {}).get("id") in identifiers) and
                              (not inserts or e["insertId"] in inserts)])

    def factory(self, project):
        self.reader = reconcile.AuditReader(project, execute=self.execute)
        return self.reader

    def run_tool(self):
        return reconcile.reconcile(self.evidence, self.home, self.fetch, self.describe, self.factory)

    def test_missing_create_last_is_verified_by_exact_id_and_authoritative_done(self):
        before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in self.evidence.iterdir()}
        output, report = self.run_tool()
        self.assertEqual(report["status"], "READ_ONLY_FACTS_RECONCILED_AWAITING_SEPARATE_APPROVAL")
        self.assertFalse(report["recoveryAuthorized"])
        self.assertFalse(report["credentialResetAuthorized"])
        self.assertEqual(report["historicalWindowsReused"], 11)
        self.assertEqual(report["blockers"], [])
        self.assertEqual(before, {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in self.evidence.iterdir()})
        self.assertTrue(all(item["verifiedDoneViaCloudSqlNotOptionalLogLast"] for item in report["operationVerification"]))
        self.assertTrue((output / "manifest.json").exists())
        self.assertEqual((self.ledger / (rx.NAME + ".json")).read_bytes(), self.original)

    def test_label_update_and_connect_are_explained_without_authorizing_sql_or_mutations(self):
        _, report = self.run_tool()
        self.assertEqual(report["labelRequestEventIds"], ["event-update"])
        connect = next(e for e in report["eventsReviewed"] if e["insertId"] == "event-connect")
        self.assertEqual(connect["classification"], "STAGING_CONNECTION_AUTHORIZATION_NOT_CONFIGURATION_MUTATION")
        self.assertEqual(connect["resourceNormalization"], "verified-project-number-alias")
        self.assertIn("SQL", connect["limitation"])

    def test_historical_windows_not_repeated_only_targeted_reads_and_tail(self):
        _, report = self.run_tool()
        self.assertEqual(report["historicalWindowsReused"], 11)
        tail_start = rx.audit_time(report["historicalPrefixUntil"])
        for kind, *values in self.calls:
            if kind != "audit":
                continue
            expression = values[0][2]
            start = rx.audit_time(re.search(r'timestamp>="([^"]+)"', expression).group(1))
            self.assertTrue(start >= tail_start or "operation.id=" in expression or "insertId=" in expression)

    def test_update_with_other_changes_is_blocked_and_sensitive_values_never_saved(self):
        self.raw_events[1]["protoPayload"]["request"]["body"]["rootPassword"] = "synthetic-sensitive-password"
        output, report = self.run_tool()
        self.assertEqual(report["status"], "BLOCKED")
        text = "\n".join(p.read_text() for p in output.iterdir())
        self.assertNotIn("synthetic-sensitive-password", text)
        self.assertNotIn(self.actor, text)
        self.assertTrue(report["blockers"])

    def test_missing_update_request_cannot_be_inferred_from_current_labels(self):
        self.raw_events[1]["protoPayload"].pop("request")
        _, report = self.run_tool()
        self.assertEqual(report["status"], "BLOCKED")
        self.assertTrue(any("labels-only" in b["reason"] for b in report["blockers"]))

    def test_same_method_time_but_wrong_operation_id_fails(self):
        self.raw_events[0]["operation"]["id"] = "not-the-sql-operation"
        with self.assertRaisesRegex(rx.Stop, "Historical event missing or changed"):
            self.run_tool()

    def test_new_unexplained_sql_operation_fails_before_audit_reads(self):
        self.data["operations"].append({**self.data["operations"][0], "name": "unknown-operation"})
        with self.assertRaises(rx.Stop):
            self.run_tool()
        self.assertFalse(any(call[0] == "audit" for call in self.calls))

    def test_authoritative_operation_wrong_project_pending_or_error_fails(self):
        for changes in ({"targetProject": "wrong-project"}, {"status": "RUNNING"},
                        {"error": {"message": "synthetic-sensitive-error"}}):
            original = copy.deepcopy(self.descriptions[reconcile.CREATE])
            self.descriptions[reconcile.CREATE].update(changes)
            with self.assertRaises(rx.Stop):
                self.run_tool()
            self.descriptions[reconcile.CREATE] = original

    def test_unknown_audit_method_and_other_actor_remain_blockers(self):
        other = copy.deepcopy(self.raw_events[0])
        other["insertId"] = "unexpected-method"
        other["protoPayload"]["methodName"] = "cloudsql.instances.delete"
        self.raw_events.append(other)
        self.raw_events[2]["protoPayload"]["authenticationInfo"]["principalEmail"] = "different-synthetic@example.test"
        _, report = self.run_tool()
        self.assertEqual(report["status"], "BLOCKED")
        self.assertTrue(any("actor" in item["reason"] for item in report["blockers"]))
        self.assertTrue(any("method" in item["reason"] for item in report["blockers"]))

    def test_nested_mask_cannot_hide_non_label_change(self):
        request = self.raw_events[1]["protoPayload"]["request"]
        request["body"]["updateMask"] = "settings.tier"
        result = reconcile.sanitize_event(self.raw_events[1], self.data["project"], details=True)
        self.assertFalse(result["requestReview"]["labelsOnly"])

    def test_contradictory_monitored_resource_cannot_be_hidden_by_payload_name(self):
        self.raw_events[2]["resource"] = {"labels": {"database_id": rx.PROJECT + ":realign-app"}}
        _, report = self.run_tool()
        self.assertEqual(report["status"], "BLOCKED")
        self.assertTrue(any("Monitored-resource" in b["reason"] for b in report["blockers"]))

    def test_private_query_disables_sdk_file_http_logs_and_suppresses_sdk_bodies(self):
        with patch.object(reconcile.subprocess, "run", return_value=SimpleNamespace(
                returncode=1, stdout="", stderr="synthetic-secret-must-not-be-printed")) as run:
            with self.assertRaises(rx.Stop) as error:
                reconcile.private_audit_read("audit", ["logging", "read", "synthetic-filter"], 25)
            self.assertNotIn("synthetic-secret", str(error.exception))
            env = run.call_args.kwargs["env"]
            self.assertEqual(env["CLOUDSDK_CORE_DISABLE_FILE_LOGGING"], "true")
            self.assertEqual(env["CLOUDSDK_CORE_LOG_HTTP"], "false")
            self.assertTrue(run.call_args.kwargs["capture_output"])

    def test_terminal_routing_metadata_is_not_fabricated_into_label_evidence(self):
        request = {"@type": "synthetic.request", "project": rx.PROJECT, "instance": rx.NAME}
        review = reconcile.review_label_request(request, self.data["project"])
        self.assertFalse(review["present"])
        self.assertFalse(review["labelsOnly"])
        self.raw_events[1]["protoPayload"]["request"] = request
        _, report = self.run_tool()
        self.assertEqual(report["status"], "BLOCKED")

    def test_authoritative_done_is_not_replaced_by_an_audit_last_flag(self):
        self.descriptions[reconcile.CREATE]["status"] = "RUNNING"
        self.raw_events[0]["operation"]["last"] = True
        with self.assertRaises(rx.Stop):
            self.run_tool()

    def test_capped_targeted_window_is_split_without_accepting_truncation(self):
        calls = []
        def capped(key, args, timeout):
            calls.append(args)
            left = rx.audit_time(re.search(r'timestamp>="([^"]+)"', args[2]).group(1))
            right = rx.audit_time(re.search(r'timestamp<"([^"]+)"', args[2]).group(1))
            return [{}] * rx.AUDIT_BATCH_LIMIT if right - left > timedelta(minutes=1) else []
        reader = reconcile.AuditReader(self.data["project"], execute=capped)
        self.assertEqual(reader.collect(self.created, self.created + timedelta(minutes=2)), [])
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(reader.proof), 2)

    def test_numeric_alias_must_be_independently_verified_not_any_project_number(self):
        self.assertEqual(reconcile.resource_identity("projects/123/instances/" + rx.NAME, self.data["project"]),
                         "verified-project-number-alias")
        for value in ("projects/456/instances/" + rx.NAME, "projects/123/instances/realign-app",
                      "projects/123/instances/realign-app-new"):
            with self.assertRaises(rx.Stop):
                reconcile.resource_identity(value, self.data["project"])

    def test_mid_reconciliation_sql_drift_fails_and_keeps_partial_sanitized_evidence(self):
        calls = [0]
        old_fetch = self.fetch
        def fetch(key):
            result = old_fetch(key)
            if key == "operations":
                calls[0] += 1
                if calls[0] > 1:
                    result.append({"name": "changed"})
            return result
        with self.assertRaisesRegex(rx.Stop, "changed during"):
            reconcile.reconcile(self.evidence, self.home, fetch, self.describe, self.factory)
        stopped = list(rx.persistent_root(self.home).glob("reconciliation-*/STOPPED.txt"))
        self.assertTrue(stopped)
        self.assertTrue((stopped[0].parent / "sanitized-progress.json").exists())
        self.assertFalse((stopped[0].parent / "reconciliation-report.json").exists())

    def test_reader_timeout_and_capped_batches_fail_closed_with_small_intervals(self):
        def timeout(*args):
            raise subprocess.TimeoutExpired(["synthetic"], 25)
        reader = reconcile.AuditReader(self.data["project"], execute=timeout)
        with unittest.mock.patch.object(rx, "AUDIT_MIN_WINDOW", timedelta(minutes=1)):
            with self.assertRaisesRegex(rx.Stop, "slow/capped"):
                reader.collect(self.created, self.created + timedelta(minutes=2))


@unittest.skipUnless(shutil.which("gcloud"), "Installed SDK unavailable")
class ReconciliationNativeSdk(unittest.TestCase):
    def test_actual_staging_describe_and_targeted_audit_commands_parse_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = isolated_environment({k: os.environ[k] for k in ("HOME", "PATH", "LANG") if k in os.environ},
                                               Path(directory))
            start = rx.audit_time("2026-10-11T12:00:00Z")
            reader = reconcile.AuditReader({"projectNumber": "123"})
            queries = [reconcile.describe_query(op) for op in reconcile.EXPECTED]
            queries.extend([
                reader.arguments(start, start + timedelta(hours=1)),
                reader.arguments(start, start + timedelta(hours=1), "operation.id=" + json.dumps(reconcile.UPDATE), True),
                reader.arguments(start, start + timedelta(seconds=2), 'insertId="synthetic-connect"'),
            ])
            for query in queries:
                probe_command(query, environment)


if __name__ == "__main__":
    unittest.main()
