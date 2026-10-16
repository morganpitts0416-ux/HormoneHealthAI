"""Offline synthetic diagnostics of legacy/current protected audit snapshots."""
import copy
import fcntl
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from datetime import timedelta

import recovery as rx
import diagnose_recovery_audit as diagnostic
from test_recovery import fixture


class DiagnosticSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.ledger = self.home / ".local/state/cliniq-rx-staging"
        self.ledger.mkdir(parents=True, mode=0o700)
        self.original = rx.encoded(rx.EXPECTED_LEDGER)
        self.marker = self.ledger / (rx.NAME + ".json")
        rx.save(self.marker, self.original)
        rx.save(self.ledger / (rx.NAME + ".lock"), b"")
        root = rx.persistent_root(self.home)
        self.evidence = root / "assessment-synthetic"
        self.evidence.mkdir(mode=0o700)
        self.data = fixture()
        self.data["operations"][0]["name"] = "sql-create-001"
        self.data["audit"][0]["operation"]["id"] = "sql-create-001"
        self.progress = {"attempts": [], "entries": []}
        created = rx.audit_time(self.data["instance"]["createTime"])
        def record(event):
            self.progress["attempts"].append({k: v for k, v in event.items() if k != "entries"})
            self.progress["entries"].extend(event.get("entries", []))
        rx.audit_history(self.data["instance"], self.data["operations"],
                         fetch=lambda *args: copy.deepcopy(self.data["audit"]),
                         end=created + timedelta(hours=2), progress=record)
        # Reproduce legacy producer: all reads finished, but no final cutoff
        # marker/approval manifest was saved before correlation failed.
        self.progress["attempts"] = [a for a in self.progress["attempts"] if a["status"] != "retrieval-complete"]
        rx.save(self.evidence / "original-ledger.json", self.original)
        rx.save(self.evidence / "tool-sha256.txt", (diagnostic.LEGACY_TOOL_SHA256 + "\n").encode())
        rx.save(self.evidence / "STOPPED.txt", b"Assessment incomplete; no recovery authorized.\n")
        for key in rx.queries():
            rx.save(self.evidence / (key + ".json"), rx.encoded(self.data[key]))
        self.persist_progress()

    def persist_progress(self):
        # Recompute synthetic batch hash to model different genuine producer
        # metadata, not alter real evidence. Corruption tests omit this on purpose.
        offset = 0
        for attempt in self.progress["attempts"]:
            if attempt["status"] == "complete":
                count = attempt["count"]
                attempt["sha256"] = rx.digest(rx.encoded(self.progress["entries"][offset:offset + count]))
                offset += count
        path = self.evidence / "audit-progress.json"
        if path.exists():
            path.write_bytes(rx.encoded(self.progress))
        else:
            rx.save(path, rx.encoded(self.progress))

    def diagnose(self):
        with patch("subprocess.run", side_effect=AssertionError("No subprocess/cloud call permitted")):
            return diagnostic.diagnose(self.evidence, self.home)

    def test_legacy_completed_windows_can_be_inspected_without_requery_or_writes(self):
        before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in self.home.rglob("*") if p.is_file()}
        report = self.diagnose()
        self.assertEqual(before, {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in before})
        self.assertTrue(report["coverage"]["validatedHistoricalPrefix"])
        self.assertFalse(report["coverage"]["originalFinalCutoffProven"])
        self.assertFalse(report["recoveryAuthorized"])
        self.assertEqual(report["cloudCalls"], 0)
        self.assertEqual(report["filesModified"], 0)
        self.assertEqual(report["sqlOperations"][0]["classification"], "MATCHES_ORIGINAL_TERMINAL_ID_RULE")
        self.assertFalse((self.evidence / "approval-report.json").exists())

    def test_exact_unmatched_operation_and_different_audit_id_are_reported(self):
        self.progress["entries"][0]["operation"]["id"] = "audit-create-different-002"
        self.persist_progress()
        report = self.diagnose()
        operation = report["sqlOperations"][0]
        self.assertEqual(operation["normalizedId"], "sql-create-001")
        self.assertFalse(operation["matchesOriginalRule"])
        self.assertEqual(operation["classification"], "NO_ID_MATCH_WITH_METHOD_TIME_CANDIDATES")
        self.assertEqual(operation["methodTimeCandidateIndexes"], [0])
        self.assertEqual(report["auditEvents"][0]["operationId"], "audit-create-different-002")
        self.assertTrue(operation["candidatesAreNotProof"])

    def test_same_id_missing_or_false_last_flag_is_not_approved(self):
        for flag in (None, False):
            self.progress["entries"][0]["operation"]["last"] = flag
            self.persist_progress()
            report = self.diagnose()
            operation = report["sqlOperations"][0]
            self.assertEqual(operation["classification"], "SAME_ID_WITHOUT_TERMINAL_FLAG")
            self.assertFalse(operation["matchesOriginalRule"])
            self.assertFalse(report["recoveryAuthorized"])

    def test_full_resource_operation_names_show_the_original_suffix_matching(self):
        self.progress["entries"][0]["operation"]["id"] = "projects/example/operations/sql-create-001"
        self.persist_progress()
        report = self.diagnose()
        self.assertTrue(report["sqlOperations"][0]["matchesOriginalRule"])
        self.assertEqual(report["auditEvents"][0]["operationId"], "projects/example/operations/sql-create-001")

    def test_unknown_operation_types_remain_unexplained_despite_matching_ids(self):
        self.data["operations"][0]["operationType"] = "UNKNOWN_ADMIN_OPERATION"
        (self.evidence / "operations.json").write_bytes(rx.encoded(self.data["operations"]))
        report = self.diagnose()
        self.assertEqual(report["sqlOperations"][0]["classification"], "UNEXPECTED_OR_FAILED_SQL_OPERATION")
        self.assertTrue(report["snapshotSemanticBlockers"])
        self.assertFalse(report["recoveryAuthorized"])

    def test_request_response_errors_principals_and_credential_fields_never_printed(self):
        event = self.progress["entries"][0]
        event["protoPayload"]["request"] = {"password": "synthetic-private-password"}
        event["protoPayload"]["response"] = {"patient": "synthetic-private-patient"}
        event["protoPayload"]["authenticationInfo"] = {"principalEmail": "synthetic-private@example.test"}
        event["protoPayload"]["status"] = {"code": 7, "message": "synthetic-private-error"}
        self.persist_progress()
        text = json.dumps(self.diagnose())
        for secret in ("synthetic-private-password", "synthetic-private-patient", "synthetic-private@example.test",
                       "synthetic-private-error", "authenticationInfo", "request", "response"):
            self.assertNotIn(secret, text)

    def test_corrupted_batch_hash_stops_without_reusing_evidence(self):
        self.progress["entries"][0]["insertId"] = "changed-after-save"
        (self.evidence / "audit-progress.json").write_bytes(rx.encoded(self.progress))
        with self.assertRaisesRegex(rx.Stop, "hash/count"):
            self.diagnose()

    def test_unsupported_producer_tool_is_rejected(self):
        (self.evidence / "tool-sha256.txt").write_text("0" * 64)
        with self.assertRaisesRegex(rx.Stop, "producer tool"):
            self.diagnose()

    def test_original_ledger_change_is_rejected(self):
        self.marker.write_text("{}")
        with self.assertRaisesRegex(rx.Stop, "ledger differs"):
            self.diagnose()

    def test_partial_later_query_does_not_invalidate_prefix_or_claim_full_coverage(self):
        final = rx.audit_time(self.progress["attempts"][-1]["until"])
        self.progress["attempts"].append({"status": "querying", "from": rx.audit_stamp(final),
                                          "until": rx.audit_stamp(final + timedelta(hours=1))})
        self.persist_progress()
        report = self.diagnose()
        self.assertTrue(report["coverage"]["validatedHistoricalPrefix"])
        self.assertFalse(report["coverage"]["allRequestedIntervalsCovered"])
        self.assertFalse(report["coverage"]["originalFinalCutoffProven"])

    def test_current_producer_marker_proves_retrieval_but_never_approves_correlation(self):
        (self.evidence / "tool-sha256.txt").write_text(rx.digest(Path(rx.__file__).read_bytes()) + "\n")
        completed = self.progress["attempts"][-1]
        ordered = sorted(self.progress["entries"], key=lambda e: (rx.audit_time(e["timestamp"]), e["insertId"]))
        self.progress["attempts"].append({
            "status": "retrieval-complete", "from": self.progress["attempts"][0]["from"],
            "until": completed["until"], "count": len(ordered), "sha256": rx.digest(rx.encoded(ordered))})
        self.persist_progress()
        report = self.diagnose()
        self.assertTrue(report["coverage"]["originalFinalCutoffProven"])
        self.assertFalse(report["recoveryAuthorized"])

    def test_missing_metadata_and_insecure_paths_stop_without_repair(self):
        path = self.evidence / "operations.json"
        path.chmod(0o644)
        with self.assertRaises(rx.Stop):
            self.diagnose()
        self.assertEqual(path.stat().st_mode & 0o777, 0o644)

    def test_attempt_lock_is_respected(self):
        with (self.ledger / (rx.NAME + ".lock")).open() as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(rx.Stop, "running"):
                self.diagnose()

    def test_corrupt_contiguous_coverage_or_duplicate_events_stop(self):
        self.progress["attempts"][-1]["from"] = self.progress["attempts"][-1]["until"]
        (self.evidence / "audit-progress.json").write_bytes(rx.encoded(self.progress))
        with self.assertRaisesRegex(rx.Stop, "interval"):
            self.diagnose()

    def test_all_eleven_saved_windows_are_checked_without_repeating_queries(self):
        first = rx.audit_time(self.data["instance"]["createTime"]) - timedelta(hours=1)
        entries = copy.deepcopy(self.progress["entries"])
        attempts = []
        for index in range(11):
            left = first + timedelta(hours=6 * index)
            right = left + timedelta(hours=6)
            batch = entries if index == 0 else []
            bounds = {"from": rx.audit_stamp(left), "until": rx.audit_stamp(right)}
            attempts.extend([{**bounds, "status": "querying", "attempt": index + 1},
                             {**bounds, "status": "complete", "count": len(batch),
                              "sha256": rx.digest(rx.encoded(batch))}])
        self.progress = {"entries": entries, "attempts": attempts}
        self.persist_progress()
        report = self.diagnose()
        self.assertEqual(report["coverage"]["completedWindows"], 11)
        self.assertTrue(report["coverage"]["allRequestedIntervalsCovered"])
        self.assertFalse(report["coverage"]["originalFinalCutoffProven"])
        self.assertEqual(report["cloudCalls"], 0)

    def test_retrieval_marker_and_identifier_survive_failed_terminal_gate(self):
        events = []
        data = fixture()
        data["audit"][0]["operation"]["last"] = False
        created = rx.audit_time(data["instance"]["createTime"])
        with self.assertRaisesRegex(rx.Stop, "synthetic-operation"):
            rx.audit_history(data["instance"], data["operations"],
                             fetch=lambda *args: data["audit"], end=created + timedelta(hours=1),
                             progress=events.append)
        self.assertEqual(events[-1]["status"], "retrieval-complete")
        self.assertEqual(events[-1]["count"], 1)
        self.assertEqual(events[-1]["sha256"], rx.digest(rx.encoded(data["audit"])))


if __name__ == "__main__":
    unittest.main()
