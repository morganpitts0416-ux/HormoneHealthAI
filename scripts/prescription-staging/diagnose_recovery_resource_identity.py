#!/usr/bin/env python3
"""Display only whitelisted identity metadata for the two blocked staging logs."""
import sys
sys.dont_write_bytecode = True

import argparse
from datetime import timedelta
import fcntl
import json
import os
from pathlib import Path
import tempfile

import recovery as rx
import diagnose_recovery_audit as diagnostic
import reconcile_recovery_audit as reconciliation

TARGET_IDS = ("-9z64loe3oqmy", "-9f8c59e3pdtd")
INPUT_FILES = {
    "fresh-metadata.json", "authoritative-operations.json", "original-snapshot-reference.json",
    "sanitized-progress.json", "sanitized-audit.json", "audit-read-coverage.json", "reconciliation-report.json",
}
LABELS = ("project_id", "database_id", "region", "zone", "location", "service", "method", "resource_container")
PROJECTION = ("timestamp,receiveTimestamp,insertId,operation,protoPayload.serviceName,"
              "protoPayload.methodName,protoPayload.resourceName,protoPayload.status.code,resource.type," +
              ",".join("resource.labels." + key for key in LABELS))


def query(saved):
    stamp = rx.audit_time(saved["timestamp"])
    args = rx.audit_query(stamp - timedelta(seconds=1), stamp + timedelta(seconds=1))
    args[2] += " AND insertId=" + json.dumps(saved["insertId"])
    args = ["--limit=3" if arg.startswith("--limit=") else arg for arg in args]
    args[-1] = "--format=json(" + PROJECTION + ")"
    return args


def identity_view(raw, project, operations):
    actual = diagnostic.safe_event(raw)
    resource = raw.get("resource") or {}
    labels = resource.get("labels") or {}
    def value(item):
        return "" if item == "" else diagnostic.identifier(item)
    actual["monitoredResource"] = {
        "type": value(resource.get("type")),
        "labels": {key: value(labels[key]) for key in LABELS if key in labels},
    }
    op = None
    try:
        op = reconciliation.operation_id(actual["operationId"])
    except rx.Stop:
        pass
    exact = op is not None and actual["methodName"] == reconciliation.METHODS[reconciliation.EXPECTED[op]]
    context = operations[reconciliation.CREATE] if exact and op == reconciliation.CREATE else None
    try:
        normalized = reconciliation.resource_identity(actual["resourceName"], project, context)
        resource_error = None
    except rx.Stop as error:
        normalized, resource_error = None, str(error)
    monitored = reconciliation.monitored_resource_consistent(raw, project)
    old_labels = (
        ("project_id" not in labels or labels["project_id"] in {rx.PROJECT, str(project["projectNumber"])}) and
        ("database_id" not in labels or labels["database_id"] in {
            rx.PROJECT + ":" + rx.NAME, str(project["projectNumber"]) + ":" + rx.NAME}) and
        ("region" not in labels or labels["region"] == rx.REGION))
    try:
        reconciliation.resource_identity(actual["resourceName"], project)
        old_resource = True
    except rx.Stop:
        old_resource = False
    return {
        "actual": actual,
        "expected": {
            "projectId": rx.PROJECT, "verifiedProjectNumber": str(project["projectNumber"]),
            "instance": rx.NAME, "region": rx.REGION,
            "databaseIdRepresentations": [rx.NAME, rx.PROJECT + ":" + rx.NAME,
                                          str(project["projectNumber"]) + ":" + rx.NAME],
            "bareDatabaseIdRequires": "type=cloudsql_database and independently matching project_id",
            "instanceResourceNames": [f"projects/{p}/instances/{rx.NAME}" for p in (rx.PROJECT, str(project["projectNumber"]))],
            "createParentResourceNames": [f"projects/{p}" for p in (rx.PROJECT, str(project["projectNumber"]))],
            "createParentRequires": "Exact CREATE ID/method plus independently verified DONE operation targeting this instance",
            "authoritativeOperationId": op, "authoritativeTargetInstance": operations[op]["targetId"] if op else None,
            "authoritativeTargetProject": operations[op]["targetProject"] if op else None,
        },
        "comparison": {
            "priorVerifierResourceNameAccepted": old_resource,
            "priorVerifierMonitoredLabelsAccepted": old_labels,
            "newResourceNormalization": normalized, "newResourceBlocker": resource_error,
            "newMonitoredLabelsConsistent": monitored,
            "exactKnownOperationIdAndMethod": exact,
            "status": ("IDENTITY_FIELDS_CONSISTENT_WITH_VERIFIED_STAGING_OPERATION"
                       if exact and normalized and monitored and
                       actual["serviceName"] == "cloudsql.googleapis.com" and actual["statusCode"] in {None, 0}
                       else "UNVERIFIED_OR_CONTRADICTORY_DO_NOT_PROCEED"),
        },
    }


def inspect(evidence, home=None, fetch=rx.cloud, describe=None, audit_read=reconciliation.private_audit_read):
    home = Path(home or Path.home()).absolute()
    evidence = rx.protected(evidence, True)
    root = home / ".local/state/cliniq-rx-recovery" / rx.ATTEMPT
    if evidence.parent != root or not evidence.name.startswith("reconciliation-"):
        raise rx.Stop("Input must be the protected completed reconciliation for this attempt.")
    fd = os.open(rx.protected(home / ".local/state/cliniq-rx-staging" / (rx.NAME + ".lock")),
                 os.O_RDONLY | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        def read(name):
            path = rx.protected(evidence / name)
            if path.stat().st_size > 16 * 1024 * 1024:
                raise rx.Stop("Identity diagnostic input exceeds the size bound.")
            return path.read_bytes()
        manifest_bytes = read("manifest.json")
        manifest = json.loads(manifest_bytes)
        if set(manifest) != INPUT_FILES:
            raise rx.Stop("Completed reconciliation manifest has an unexpected file set.")
        files = {}
        for name in INPUT_FILES:
            content = read(name)
            if rx.digest(content) != manifest[name]:
                raise rx.Stop("Completed reconciliation evidence checksum differs.")
            files[name] = json.loads(content)
        report = files["reconciliation-report.json"]
        if report.get("project") != rx.PROJECT or report.get("instance") != rx.NAME or report.get("recoveryAuthorized") is not False:
            raise rx.Stop("Saved reconciliation identity/authorization differs.")
        ledger_path = rx.protected(home / ".local/state/cliniq-rx-staging" / (rx.NAME + ".json"))
        ledger = ledger_path.read_bytes()
        if (json.loads(ledger) != rx.EXPECTED_LEDGER or
                files["original-snapshot-reference.json"].get("original-ledger.json") != rx.digest(ledger)):
            raise rx.Stop("Original ledger differs from the preserved evidence.")
        fresh = {key: fetch(key) for key in ("account", "project", "instance", "databases", "users", "operations")}
        rx.verify_identity(fresh)
        previous = files["fresh-metadata.json"]
        if (fresh["project"] != previous["project"] or
                rx.audit_time(fresh["instance"]["createTime"]) != rx.audit_time(previous["instance"]["createTime"])):
            raise rx.Stop("Fresh project or instance incarnation differs.")
        if (len(fresh["operations"]) != 2 or
                {reconciliation.operation_id(op["name"]) for op in fresh["operations"]} != set(reconciliation.EXPECTED)):
            raise rx.Stop("Fresh operation inventory differs from the two known staging operations.")
        operations = {}
        for identity in reconciliation.EXPECTED:
            data = describe(identity) if describe else rx.read_command("operation-describe", reconciliation.describe_query(identity), 30)
            operations[identity] = reconciliation.verified_operation(data, identity, fresh["project"], fresh["instance"])
            if data != files["authoritative-operations.json"][identity]:
                raise rx.Stop("Authoritative operation differs from the completed reconciliation.")
        saved = {event["insertId"]: event for event in files["sanitized-audit.json"]}
        results = []
        for identity in TARGET_IDS:
            if identity not in saved:
                raise rx.Stop("One of the two explicitly identified records is missing from saved evidence.")
            args = query(saved[identity])
            records = rx.rows(audit_read("audit", args, 25), "Audit")
            if len(records) != 1:
                raise rx.Stop("Exact bounded identity query is missing, ambiguous or incomplete.")
            raw = records[0]
            view = identity_view(raw, fresh["project"], operations)
            fields = ("timestamp", "insertId", "serviceName", "methodName", "resourceName",
                      "statusCode", "operationId", "producer", "first", "last")
            if any(view["actual"].get(key) != saved[identity].get(key) for key in fields):
                raise rx.Stop("Exact targeted event metadata differs from preserved evidence.")
            results.append(view)
        for key, value in fresh.items():
            if fetch(key) != value:
                raise rx.Stop("Fresh staging metadata changed during identity diagnosis.")
        if ledger_path.read_bytes() != ledger or read("manifest.json") != manifest_bytes:
            raise rx.Stop("Original ledger or completed evidence changed.")
        for name in INPUT_FILES:
            if rx.digest(read(name)) != manifest[name]:
                raise rx.Stop("Completed evidence changed during identity diagnosis.")
        output = Path(tempfile.mkdtemp(prefix="identity-diagnostic-", dir=rx.persistent_root(home)))
        result = {
            "diagnosticOnly": True, "recoveryAuthorized": False, "credentialResetAuthorized": False,
            "sourceManifestSha256": rx.digest(manifest_bytes), "auditQueries": 2,
            "records": results,
            "limitations": [
                "Identity-field consistency alone is not complete audit reconciliation or reset approval.",
                "No private request body, response body, principal email or patient database was queried.",
                "Original historical windows were not repeated. Original evidence and ledger were not modified.",
                "If any field is contradictory or unsupported, stop; do not reset credentials or initialize staging.",
            ],
        }
        rx.save(output / "identity-comparison.json", rx.encoded(result))
        rx.save(output / "tool-sha256.txt", (rx.digest(Path(__file__).read_bytes()) + "\n").encode())
        return output, result
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    try:
        output, report = inspect(args.evidence)
    except Exception as error:
        print("STOPPED: " + (str(error) if isinstance(error, rx.Stop) else "Identity diagnostic input/read is invalid; details suppressed."))
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    print("Protected identity-only evidence:", output)
    print("STOP: this diagnostic grants no mutation or credential approval.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
