#!/usr/bin/env python3
"""Offline, read-only examination of protected staging recovery audit snapshots."""
import sys
sys.dont_write_bytecode = True

import argparse
from datetime import timedelta
import fcntl
import json
import os
from pathlib import Path
import re

import recovery as rx

LEGACY_TOOL_SHA256 = "34f7d4fa4bceea6194b0b8ba0522b8c7a6aa3e4b0ef9c92a9799324f4733ed31"


def identifier(value):
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_./:@%-]{1,1024}", value):
        raise rx.Stop("Saved metadata has an invalid identifier; no raw value was printed.")
    return value


def timestamp(value):
    return None if value is None else rx.audit_stamp(rx.audit_time(value))


def optional_bool(value):
    if value is not None and not isinstance(value, bool):
        raise rx.Stop("Audit first/last flag has an invalid type.")
    return value


def safe_event(event):
    """Only explicitly allowed metadata; NEVER emit raw request/response/status bodies."""
    payload = event.get("protoPayload") or {}
    operation = event.get("operation") or {}
    if not isinstance(payload, dict) or not isinstance(operation, dict):
        raise rx.Stop("Audit operation/payload metadata is malformed.")
    code = (payload.get("status") or {}).get("code")
    if code is not None and (not isinstance(code, int) or isinstance(code, bool)):
        raise rx.Stop("Audit status code is malformed.")
    return {
        "timestamp": timestamp(event.get("timestamp")), "insertId": identifier(event.get("insertId")),
        "serviceName": identifier(payload.get("serviceName")), "methodName": identifier(payload.get("methodName")),
        "resourceName": identifier(payload.get("resourceName")), "statusCode": code,
        "operationId": identifier(operation.get("id")), "producer": identifier(operation.get("producer")),
        "first": optional_bool(operation.get("first")), "last": optional_bool(operation.get("last")),
    }


def window_evidence(progress, instance):
    """Validate completed batches, not the mere presence of a 'complete' string."""
    attempts = rx.rows(progress.get("attempts"), "Saved audit attempts")
    entries = rx.rows(progress.get("entries"), "Saved audit entries")
    if len(entries) >= rx.AUDIT_LIMIT or len(attempts) > rx.AUDIT_MAX_CALLS * 3 + 1:
        raise rx.Stop("Saved audit evidence exceeds its bounded policy.")
    cursor = rx.audit_time(instance["createTime"]) - timedelta(hours=1)
    first = cursor
    offset = 0
    completed = []
    queried = set()
    markers = []
    seen = set()
    for attempt in attempts:
        status = attempt.get("status")
        left, right = rx.audit_time(attempt.get("from")), rx.audit_time(attempt.get("until"))
        if right <= left:
            raise rx.Stop("Saved audit interval is invalid.")
        pair = (left, right)
        if status == "querying":
            if right - left > rx.AUDIT_WINDOW or pair in queried:
                raise rx.Stop("Saved audit query bounds are invalid or duplicated.")
            queried.add(pair)
            if len(queried) > rx.AUDIT_MAX_CALLS:
                raise rx.Stop("Saved audit query count exceeds its bounded policy.")
        elif status == "complete":
            count = attempt.get("count")
            if (pair not in queried or left != cursor or isinstance(count, bool) or
                    not isinstance(count, int) or not 0 <= count < rx.AUDIT_BATCH_LIMIT):
                raise rx.Stop("Saved completed windows are capped, out of order or noncontiguous.")
            batch = entries[offset:offset + count]
            if len(batch) != count or rx.digest(rx.encoded(batch)) != attempt.get("sha256"):
                raise rx.Stop("Saved audit batch hash/count differs; no evidence may be reused.")
            for entry in batch:
                if not left <= rx.audit_time(entry.get("timestamp")) < right:
                    raise rx.Stop("Saved audit event is outside its completed window.")
                event_id = identifier(entry.get("insertId"))
                if not event_id or event_id in seen:
                    raise rx.Stop("Saved audit identity is missing or duplicated.")
                seen.add(event_id)
            completed.append({"from": rx.audit_stamp(left), "until": rx.audit_stamp(right), "count": count})
            offset += count
            cursor = right
        elif status == "timeout":
            if pair not in queried:
                raise rx.Stop("Saved timeout lacks its query record.")
        elif status == "retrieval-complete":
            markers.append(attempt)
        else:
            raise rx.Stop("Saved audit attempt status is not recognized.")
    if not completed or offset != len(entries):
        raise rx.Stop("Saved audit entries do not correspond to completed windows.")
    all_requested = all(first <= left < right <= cursor for left, right in queried)
    complete_marker = False
    if markers:
        ordered = sorted(entries, key=lambda e: (rx.audit_time(e["timestamp"]), e["insertId"]))
        if (len(markers) != 1 or not all_requested or markers[0].get("from") != rx.audit_stamp(first) or
                markers[0].get("until") != rx.audit_stamp(cursor) or markers[0].get("count") != len(entries) or
                markers[0].get("sha256") != rx.digest(rx.encoded(ordered))):
            raise rx.Stop("Saved retrieval-completion marker is inconsistent.")
        complete_marker = True
    return entries, {
        "completedWindows": len(completed), "from": rx.audit_stamp(first), "until": rx.audit_stamp(cursor),
        "allRequestedIntervalsCovered": all_requested, "originalFinalCutoffProven": complete_marker,
        "validatedHistoricalPrefix": True, "completedWindowMetadata": completed,
        "automaticReuseOrApprovalAuthorized": False, "freshLiveVerificationRequired": True,
        "note": ("Complete saved retrieval, but correlation and fresh verification remain mandatory." if complete_marker else
                 "Legacy progress proves only these completed windows, not the original planned final cutoff. "
                 "Preserve this prefix; any future reuse needs fresh identity/operation checks and uncovered/tail queries."),
    }


def correlation_report(operations, entries, until):
    events = [safe_event(event) for event in entries]
    reports = []
    for operation in rx.rows(operations, "Saved SQL operations"):
        name = identifier(operation.get("name"))
        op_id = name.rsplit("/", 1)[-1] if name else None
        target = identifier(operation.get("targetId"))
        kind = identifier(operation.get("operationType"))
        matches = [i for i, event in enumerate(events)
                   if event["operationId"] and event["operationId"].rsplit("/", 1)[-1] == op_id]
        terminal = [i for i in matches if events[i]["last"] is True]
        expected_method = {"CREATE": "cloudsql.instances.create", "UPDATE": "cloudsql.instances.update"}.get(kind)
        anchor = operation.get("startTime") or operation.get("insertTime")
        end = operation.get("endTime") or anchor
        candidates = []
        if anchor and end and expected_method:
            left = rx.audit_time(anchor) - timedelta(hours=1)
            right = rx.audit_time(end) + timedelta(hours=1)
            candidates = [i for i, event in enumerate(events) if event["methodName"] == expected_method and
                          event["timestamp"] and left <= rx.audit_time(event["timestamp"]) <= right]
        status = identifier(operation.get("status"))
        unexpected = target != rx.NAME or kind not in {"CREATE", "UPDATE"} or status != "DONE" or bool(operation.get("error"))
        classification = ("UNEXPECTED_OR_FAILED_SQL_OPERATION" if unexpected else
                          "MATCHES_ORIGINAL_TERMINAL_ID_RULE" if terminal else
                          "SAME_ID_WITHOUT_TERMINAL_FLAG" if matches else
                          "NO_ID_MATCH_WITH_METHOD_TIME_CANDIDATES" if candidates else "NO_SAVED_AUDIT_MATCH")
        reports.append({
            "name": name, "normalizedId": op_id, "targetId": target, "operationType": kind, "status": status,
            "hasError": bool(operation.get("error")), "insertTime": timestamp(operation.get("insertTime")),
            "startTime": timestamp(operation.get("startTime")), "endTime": timestamp(operation.get("endTime")),
            "classification": classification, "matchesOriginalRule": bool(terminal),
            "sameIdEventIndexes": matches, "terminalSameIdEventIndexes": terminal,
            "methodTimeCandidateIndexes": candidates, "candidatesAreNotProof": True,
            "operationEndAfterSavedCutoff": bool(end and rx.audit_time(end) >= rx.audit_time(until)),
        })
    return reports, events


def diagnose(evidence, home=None):
    home = Path(home or Path.home()).absolute()
    evidence = rx.protected(evidence, True)
    expected_parent = home / ".local/state/cliniq-rx-recovery" / rx.ATTEMPT
    if evidence.parent != expected_parent or not evidence.name.startswith("assessment-"):
        raise rx.Stop("Diagnostic input is outside the original protected attempt evidence directory.")
    rx.protected(expected_parent, True)
    ledger = rx.protected(home / ".local/state/cliniq-rx-staging", True)
    lock = rx.protected(ledger / (rx.NAME + ".lock"))
    fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            raise rx.Stop("Attempt is running; diagnostic refused concurrent inspection.") from None
        used = {}
        def read(name):
            path = rx.protected(evidence / name)
            if path.stat().st_size > 16 * 1024 * 1024:
                raise rx.Stop("Protected evidence file exceeds diagnostic size bound.")
            content = path.read_bytes()
            used[name] = rx.digest(content)
            return content
        original = read("original-ledger.json")
        current = rx.protected(ledger / (rx.NAME + ".json")).read_bytes()
        if original != current or json.loads(original) != rx.EXPECTED_LEDGER:
            raise rx.Stop("Original ledger differs from the saved attempt; no evidence reuse is permitted.")
        tool = read("tool-sha256.txt").decode().strip()
        accepted = {LEGACY_TOOL_SHA256, rx.digest(Path(rx.__file__).read_bytes())}
        if tool not in accepted:
            raise rx.Stop("Saved producer tool checksum is not a verified diagnostic input.")
        data = {key: json.loads(read(key + ".json")) for key in rx.queries()}
        rx.verify_identity(data)
        progress = json.loads(read("audit-progress.json"))
        entries, coverage = window_evidence(progress, data["instance"])
        ops, events = correlation_report(data["operations"], entries, coverage["until"])
        # Apply the existing semantic safety checks without claiming the
        # diagnostic can fill missing terminal evidence.
        blockers = rx.reconcile({**data, "audit": entries})
        for name, expected in used.items():
            if rx.digest(rx.protected(evidence / name).read_bytes()) != expected:
                raise rx.Stop("Saved evidence changed during inspection.")
        if rx.protected(ledger / (rx.NAME + ".json")).read_bytes() != original:
            raise rx.Stop("Ledger changed during inspection.")
        return {
            "diagnosticOnly": True, "cloudCalls": 0, "filesModified": 0, "recoveryAuthorized": False,
            "liveMismatchCause": "UNDETERMINED_UNTIL_SNAPSHOT_IS_INSPECTED_AND_IF_NEEDED_TARGETED_LIVE_READ",
            "project": rx.PROJECT, "instance": rx.NAME, "snapshotFileSha256": used,
            "coverage": coverage, "sqlOperations": ops, "auditEvents": events,
            "snapshotSemanticBlockers": blockers,
            "limitations": [
                "This is a local snapshot, not a live identity or audit freshness verification.",
                "The legacy projection omitted receiveTimestamp, so ingestion delay cannot be measured from these files.",
                "Optional logging operation IDs/last flags are not universally guaranteed to match Cloud SQL API names.",
                "Method/time candidates are diagnostic hints, never accepted correlation evidence.",
                "Absence of a saved match does not distinguish log latency, a logging schema/type mismatch, or an unexplained mutation.",
                "A later targeted read may be necessary; do not rerun every historical window merely to identify the mismatch.",
            ],
        }
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = diagnose(args.evidence)
    except (rx.Stop, OSError, ValueError, TypeError, AttributeError, KeyError):
        error = sys.exc_info()[1]
        print("STOPPED: " + (str(error) if isinstance(error, rx.Stop) else "Protected snapshot metadata is invalid."))
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
