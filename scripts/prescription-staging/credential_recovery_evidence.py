"""Evidence and approval-plan fences for staging-only administrator recovery."""
import sys
sys.dont_write_bytecode = True

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import tempfile

import recovery as rx
import diagnose_recovery_audit as diagnostic
import reconcile_recovery_audit as reconciliation

SQL_KEYS = ("account", "project", "instance", "databases", "users", "operations")
RESOURCE_KEYS = ("secrets", "buckets", "accounts", "roles", "repositories", "services", "builds")
RECON_FILES = {
    "fresh-metadata.json", "authoritative-operations.json", "original-snapshot-reference.json",
    "sanitized-progress.json", "sanitized-audit.json", "audit-read-coverage.json", "reconciliation-report.json",
}
RUNTIME_FILES = ("recovery.py", "diagnose_recovery_audit.py", "reconcile_recovery_audit.py",
                 "credential_recovery_evidence.py", "recover_staging_admin.py")


def tool_hashes():
    return {name: rx.digest((Path(__file__).parent / name).read_bytes()) for name in RUNTIME_FILES}


def private_json(path):
    path = rx.protected(path)
    if path.stat().st_size > 16 * 1024 * 1024:
        raise rx.Stop("Protected recovery metadata exceeds its size bound.")
    return json.loads(path.read_bytes())


@contextmanager
def attempt_lock(home):
    path = rx.protected(Path(home) / ".local/state/cliniq-rx-staging" / (rx.NAME + ".lock"))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise rx.Stop("Attempt is already running; no credential action permitted.") from None
        yield
    finally:
        os.close(fd)


def original_ledger(home):
    path = rx.protected(Path(home) / ".local/state/cliniq-rx-staging" / (rx.NAME + ".json"))
    value = path.read_bytes()
    if json.loads(value) != rx.EXPECTED_LEDGER:
        raise rx.Stop("Original staging ledger identity/status differs.")
    return value


def load_reconciliation(path, home):
    path = rx.protected(path, True)
    if path.parent != rx.persistent_root(home) or not path.name.startswith("reconciliation-"):
        raise rx.Stop("Expected a protected completed staging reconciliation.")
    manifest = private_json(path / "manifest.json")
    if set(manifest) != RECON_FILES or (path / "STOPPED.txt").exists():
        raise rx.Stop("Incomplete or unexpected reconciliation manifest.")
    data = {}
    for name, checksum in manifest.items():
        content = rx.protected(path / name).read_bytes()
        if len(content) > 16 * 1024 * 1024 or rx.digest(content) != checksum:
            raise rx.Stop("Preserved reconciliation checksum differs.")
        data[name] = json.loads(content)
    report = data["reconciliation-report.json"]
    region = report.get("independentRegionVerification", {})
    if (report.get("status") != "READ_ONLY_FACTS_RECONCILED_AWAITING_SEPARATE_APPROVAL" or
            report.get("blockers") != [] or report.get("project") != rx.PROJECT or report.get("instance") != rx.NAME or
            report.get("recoveryAuthorized") is not False or report.get("credentialResetAuthorized") is not False or
            region.get("verifiedBeforeAndAfter") is not True or region.get("region") != rx.REGION or
            region.get("project") != rx.PROJECT or region.get("instance") != rx.NAME):
        raise rx.Stop("Successful independently region-verified reconciliation is required; it is not reset approval.")
    operations = data["authoritative-operations.json"]
    if set(operations) != set(reconciliation.EXPECTED):
        raise rx.Stop("Reconciliation operation identity set differs.")
    metadata = data["fresh-metadata.json"]
    for identity, operation in operations.items():
        reconciliation.verified_operation(operation, identity, metadata["project"], metadata["instance"])
    events = {event["insertId"]: event for event in data["sanitized-audit.json"]}
    reviewed = report.get("operationVerification", [])
    if {item.get("operationId") for item in reviewed} != set(reconciliation.EXPECTED):
        raise rx.Stop("Successful report does not bind both authoritative operations.")
    for item in reviewed:
        if (item.get("authoritativeStatus") != "DONE" or
                item.get("verifiedDoneViaCloudSqlNotOptionalLogLast") is not True or
                not item.get("matchingAuditEventIds") or any(event not in events for event in item["matchingAuditEventIds"])):
            raise rx.Stop("Successful operation/audit binding is incomplete.")
    label_ids = report.get("labelRequestEventIds", [])
    if not label_ids:
        raise rx.Stop("Independent historical labels-only UPDATE request proof is required.")
    for identity in label_ids:
        event = events.get(identity, {})
        request = event.get("requestReview") or {}
        if (event.get("methodName") != "cloudsql.instances.update" or
                reconciliation.operation_id(event.get("operationId")) != reconciliation.UPDATE or
                request.get("labelsOnly") is not True or request.get("verifiedLabels") != rx.LABELS):
            raise rx.Stop("Historical UPDATE request proof differs.")
    ledger = original_ledger(home)
    if data["original-snapshot-reference.json"].get("original-ledger.json") != rx.digest(ledger):
        raise rx.Stop("Successful reconciliation does not bind the unchanged original ledger.")
    connections = [event for event in events.values() if event.get("methodName") == "cloudsql.instances.connect"]
    return {
        "directory": str(path), "manifestSha256": rx.digest((path / "manifest.json").read_bytes()),
        "data": data, "connections": connections, "ledgerSha256": rx.digest(ledger),
    }


def source_binding(source, assessment, home):
    old = diagnostic.diagnose(assessment, home)
    if old["snapshotFileSha256"] != source["data"]["original-snapshot-reference.json"]:
        raise rx.Stop("Original assessment is not the exact preserved input to this reconciliation.")
    return old["snapshotFileSha256"]


def snapshot(home, fetch, iam_read, allow_secret=False):
    current = {key: fetch(key) for key in SQL_KEYS}
    rx.verify_identity(current)
    operations = rx.rows(current["operations"], "SQL operations")
    if (len(operations) != 2 or
            {reconciliation.operation_id(row.get("name")) for row in operations} != set(reconciliation.EXPECTED)):
        raise rx.Stop("Fresh pre-reset staging operation history differs.")
    for row in operations:
        if (row.get("targetId") != rx.NAME or row.get("status") != "DONE" or row.get("error") or
                row.get("operationType") != reconciliation.EXPECTED[reconciliation.operation_id(row["name"])]):
            raise rx.Stop("Fresh pre-reset staging operation status/type differs.")
    for key in RESOURCE_KEYS:
        for row in rx.rows(fetch(key), "Attempt resources"):
            if rx.ATTEMPT in json.dumps(row):
                allowed = {f"projects/{alias}/secrets/{rx.ESCROW}"
                           for alias in (rx.PROJECT, str(current["project"]["projectNumber"]))}
                if key == "secrets" and allow_secret and row.get("name") in allowed:
                    continue
                raise rx.Stop("An existing/ambiguous attempt resource requires separate reconciliation: " + key)
    policy = iam_read()
    bindings = policy.get("bindings")
    if not isinstance(bindings, list):
        raise rx.Stop("Project IAM policy could not be verified.")
    if any(member in {"allUsers", "allAuthenticatedUsers"} for row in bindings for member in row.get("members", [])):
        raise rx.Stop("Public project IAM binding requires separate security review; no IAM changes attempted.")
    current["account"] = [{"accountSha256": rx.digest(current["account"][0]["account"].encode()), "status": "ACTIVE"}]
    return {"sql": current, "projectIamSha256": rx.digest(rx.encoded(policy)),
            "originalLedgerSha256": rx.digest(original_ledger(home))}


def matches_snapshot(current, expected):
    if current != expected:
        raise rx.Stop("Fresh identity/inventories/operations/IAM/ledger differ from the approved plan.")


def recheck_assessment(plan, home):
    directory = rx.protected(plan["assessment"], True)
    if directory.parent != rx.persistent_root(home) or not directory.name.startswith("assessment-"):
        raise rx.Stop("Original protected assessment path differs.")
    for name, checksum in plan["originalAssessmentHashes"].items():
        if "/" in name or name in {".", ".."}:
            raise rx.Stop("Unexpected assessment evidence path.")
        if rx.digest(rx.protected(directory / name).read_bytes()) != checksum:
            raise rx.Stop("Original assessment evidence changed before a credential action.")


def plan_payload(source, assessment, binding, current):
    old_metadata = source["data"]["fresh-metadata.json"]
    if current["sql"] != old_metadata:
        raise rx.Stop("Fresh staging identity/inventories/operations/account differ from successful reconciliation.")
    now = datetime.now(timezone.utc)
    return {
        "status": "AWAITING_EXPLICIT_POSTGRES_RESET_AND_ESCROW_APPROVAL",
        "project": rx.PROJECT, "instance": rx.NAME, "region": rx.REGION, "user": "postgres",
        "secretName": rx.ESCROW, "createdAt": rx.audit_stamp(now),
        "expiresAt": rx.audit_stamp(now + timedelta(minutes=30)),
        "sourceReconciliation": source["directory"], "sourceManifestSha256": source["manifestSha256"],
        "assessment": str(Path(assessment).absolute()), "originalAssessmentHashes": binding,
        "snapshot": current, "runtimeSha256": tool_hashes(),
        "priorConnectionEventIds": sorted(event["insertId"] for event in source["connections"]),
        "connectionLimitation": "Connection authorization logs do not establish what SQL was executed or prove database contents.",
        "dataBoundary": "Do not query, initialize, overwrite or delete existing postgres data; synthetic labels are not proof of contents.",
        "intendedMutations": [
            "Create only Secret Manager " + rx.ESCROW + " with no direct IAM bindings",
            "Generate a new credential; add and read-back-verify its exact enabled secret version",
            "Reset ONLY postgres on " + rx.PROJECT + "/" + rx.NAME + " after durable escrow verification",
        ],
        "initializationAuthorized": False, "resetAuthorized": False,
        "requiredApproval": [
            "Exact approval-plan SHA-256", "Exact staging instance name",
            "Explicit staging postgres password reset and Secret Manager escrow approval",
            "Acknowledgment that historical connections do not prove what SQL was executed",
        ],
    }


def load_plan(directory, checksum, home):
    directory = rx.protected(directory, True)
    if directory.parent != rx.persistent_root(home) or not directory.name.startswith("admin-recovery-plan-"):
        raise rx.Stop("Expected a protected staging administrator recovery plan.")
    content = rx.protected(directory / "approval-plan.json").read_bytes()
    if rx.digest(content) != checksum:
        raise rx.Stop("Exact approval-plan SHA-256 differs.")
    plan = json.loads(content)
    if (plan.get("status") != "AWAITING_EXPLICIT_POSTGRES_RESET_AND_ESCROW_APPROVAL" or
            (plan.get("project"), plan.get("instance"), plan.get("region"), plan.get("user"), plan.get("secretName")) !=
            (rx.PROJECT, rx.NAME, rx.REGION, "postgres", rx.ESCROW) or
            plan.get("resetAuthorized") is not False or plan.get("initializationAuthorized") is not False or
            plan.get("runtimeSha256") != tool_hashes()):
        raise rx.Stop("Plan identity, approval boundary or reviewed runtime differs.")
    if datetime.now(timezone.utc) >= rx.audit_time(plan["expiresAt"]):
        raise rx.Stop("Approval plan expired; prepare and review a fresh read-only plan.")
    source = load_reconciliation(plan["sourceReconciliation"], home)
    if source["manifestSha256"] != plan["sourceManifestSha256"]:
        raise rx.Stop("Approved source reconciliation changed.")
    if source_binding(source, plan["assessment"], home) != plan["originalAssessmentHashes"]:
        raise rx.Stop("Original source assessment changed.")
    return plan


def no_previous_recovery(home):
    directory = rx.persistent_root(home) / "credential-recovery"
    if directory.is_symlink() or directory.exists() and any(rx.protected(directory, True).iterdir()):
        raise rx.Stop("Credential recovery was already started; never replay or replace it. Reconcile its journal separately.")
    return directory


def write_plan(payload, home):
    directory = Path(tempfile.mkdtemp(prefix="admin-recovery-plan-", dir=rx.persistent_root(home)))
    rx.save(directory / "approval-plan.json", rx.encoded(payload))
    return directory
