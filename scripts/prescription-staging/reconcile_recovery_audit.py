#!/usr/bin/env python3
"""Read-only reconciliation of one staging instance's saved and fresh audit evidence."""
import sys
sys.dont_write_bytecode = True

from datetime import datetime, timedelta, timezone
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlparse

import recovery as rx
import diagnose_recovery_audit as diagnostic

CREATE = "e78d1228-5bd1-42e4-b78c-ea4700000032"
UPDATE = "62a5b42d-91f2-43a9-b0f1-881b00000032"
EXPECTED = {CREATE: "CREATE", UPDATE: "UPDATE"}
METHODS = {"CREATE": "cloudsql.instances.create", "UPDATE": "cloudsql.instances.update"}
RESOURCE_NAMES = ("cloudsql.googleapis.com", "sqladmin.googleapis.com")
PROJECTION = ("timestamp,receiveTimestamp,insertId,logName,operation,resource,"
              "protoPayload.serviceName,protoPayload.methodName,protoPayload.resourceName,"
              "protoPayload.status.code,protoPayload.authenticationInfo.principalEmail")


def operation_id(value):
    value = diagnostic.identifier(value)
    if value in EXPECTED:
        return value
    for identity in EXPECTED:
        if value in {
            f"projects/{rx.PROJECT}/operations/{identity}",
            f"projects/{rx.PROJECT}/regions/{rx.REGION}/operations/{identity}",
        }:
            return identity
    raise rx.Stop("Operation ID is outside the two explicitly identified staging operations.")


def describe_query(identity):
    return ["sql", "operations", "describe", operation_id(identity),
            "--format=json(name,targetId,targetProject,targetLink,operationType,status,error,insertTime,startTime,endTime)"]


def resource_identity(resource, project, create_operation=None):
    """Accept only enumerated shapes and independently verified project aliases."""
    raw = diagnostic.identifier(resource)
    number = str(project.get("projectNumber", ""))
    if not number.isdigit():
        raise rx.Stop("Fresh project number cannot establish audit project aliases.")
    for service in RESOURCE_NAMES:
        prefix = "//" + service + "/"
        if raw and raw.startswith(prefix):
            raw = raw[len(prefix):]
            break
    for alias in (rx.PROJECT, number):
        if raw in {f"projects/{alias}/instances/{rx.NAME}",
                   f"projects/{alias}/regions/{rx.REGION}/instances/{rx.NAME}",
                   f"projects/{alias}/locations/{rx.REGION}/instances/{rx.NAME}"}:
            return "verified-project-id" if alias == rx.PROJECT else "verified-project-number-alias"
        # CREATE permission/audit resource can be the project parent. This name
        # alone proves NO instance identity: require the independently described,
        # exact successful CREATE operation to supply the missing target binding.
        if raw == f"projects/{alias}" and create_operation is not None:
            if (operation_id(create_operation.get("name")) == CREATE and
                    create_operation.get("targetProject") in {rx.PROJECT, number} and
                    create_operation.get("targetId") == rx.NAME and
                    create_operation.get("operationType") == "CREATE" and
                    create_operation.get("status") == "DONE" and not create_operation.get("error")):
                return "verified-create-parent-via-authoritative-operation"
    raise rx.Stop("Audit resource identity is not an enumerated form of the verified staging instance.")


def verified_operation(operation, identity, project, instance):
    if (not isinstance(operation, dict) or operation_id(operation.get("name")) != identity or
            operation.get("targetId") != rx.NAME or operation.get("operationType") != EXPECTED[identity] or
            operation.get("status") != "DONE" or operation.get("error")):
        raise rx.Stop("Authoritative staging operation identity/type/status/error differs.")
    aliases = {rx.PROJECT, str(project["projectNumber"])}
    if operation.get("targetProject") not in aliases:
        raise rx.Stop("Authoritative operation target project cannot be independently verified.")
    if operation.get("targetLink"):
        link = urlparse(operation["targetLink"])
        paths = {f"/sql/{v}/projects/{alias}/instances/{rx.NAME}"
                 for v in ("v1", "v1beta4") for alias in aliases}
        if link.scheme != "https" or link.netloc not in {"sqladmin.googleapis.com", "www.googleapis.com"} or link.path not in paths or link.query:
            raise rx.Stop("Authoritative operation target link differs from the staging instance.")
    start = rx.audit_time(operation.get("insertTime") or operation.get("startTime"))
    end = rx.audit_time(operation.get("endTime"))
    if end < start or end > datetime.now(timezone.utc) + timedelta(minutes=1):
        raise rx.Stop("Authoritative operation timing is invalid.")
    if identity == CREATE and abs((start - rx.audit_time(instance["createTime"])).total_seconds()) > 3600:
        raise rx.Stop("CREATE operation does not corroborate this instance incarnation.")
    return operation


def review_label_request(request, project):
    """Inspect raw request ONLY in memory. Return no values except known labels.

    Missing requests on terminal LRO records are allowed only when another exact
    operation-ID record independently supplies a strictly labels-only request.
    """
    if request is None or request == {}:
        return {"present": False, "labelsOnly": False}
    if not isinstance(request, dict):
        raise rx.Stop("UPDATE request has an unsupported representation.")
    allowed = {"@type", "project", "instance", "name", "body", "settings", "kind", "updateMask"}
    if set(request) - allowed:
        raise rx.Stop("UPDATE request has additional fields; labels-only cannot be established.")
    aliases = {rx.PROJECT, str(project["projectNumber"])}
    if "project" in request and request["project"] not in aliases:
        raise rx.Stop("UPDATE request routing project differs.")
    if "instance" in request and request["instance"] != rx.NAME:
        raise rx.Stop("UPDATE request routing instance differs.")
    if "name" in request and request["name"] != rx.NAME:
        resource_identity(request["name"], project)
    if set(request) <= {"@type", "project", "instance", "name"}:
        return {"present": False, "labelsOnly": False, "routingMetadataOnly": True}
    def check_mask(container):
        if "updateMask" in container:
            mask = container["updateMask"]
            paths = mask.get("paths") if isinstance(mask, dict) else mask.split(",") if isinstance(mask, str) else None
            if (not isinstance(paths, list) or not paths or
                    any(not isinstance(path, str) for path in paths) or
                    set(paths) - {"settings.userLabels", "settings.user_labels"}):
                raise rx.Stop("UPDATE mask includes unverified non-label changes.")
    check_mask(request)
    if "body" in request and "settings" in request:
        raise rx.Stop("UPDATE request has ambiguous body/settings wrappers.")
    body = request.get("body", request)
    if not isinstance(body, dict):
        raise rx.Stop("UPDATE body is not a supported object.")
    if set(body) - {"@type", "project", "instance", "name", "settings", "kind", "updateMask"}:
        raise rx.Stop("UPDATE body includes fields beyond labels and routing.")
    check_mask(body)
    for field, expected in (("project", aliases), ("instance", {rx.NAME})):
        if field in body and body[field] not in expected:
            raise rx.Stop("UPDATE body routing differs.")
    if "name" in body and body["name"] != rx.NAME:
        resource_identity(body["name"], project)
    if "kind" in body and body["kind"] != "sql#instance":
        raise rx.Stop("UPDATE body kind is not a Cloud SQL instance.")
    settings = body.get("settings")
    if not isinstance(settings, dict) or set(settings) - {"userLabels", "settingsVersion", "kind"}:
        raise rx.Stop("UPDATE settings include unverified changes beyond labels.")
    if settings.get("userLabels") != rx.LABELS:
        raise rx.Stop("UPDATE labels are not exactly the two expected synthetic staging labels.")
    if "kind" in settings and settings["kind"] != "sql#settings":
        raise rx.Stop("UPDATE settings kind differs.")
    if "settingsVersion" in settings and not re.fullmatch(r"[0-9]+", str(settings["settingsVersion"])):
        raise rx.Stop("UPDATE optimistic-concurrency version is invalid.")
    return {"present": True, "labelsOnly": True, "verifiedLabels": dict(rx.LABELS),
            "settingsVersionPresent": "settingsVersion" in settings}


def monitored_resource_consistent(raw, project):
    resource = raw.get("resource") or {}
    labels = resource.get("labels") or {}
    if not isinstance(labels, dict):
        raise rx.Stop("Monitored-resource labels are malformed.")
    aliases = {rx.PROJECT, str(project["projectNumber"])}
    allowed_database_ids = {alias + ":" + rx.NAME for alias in aliases}
    # Logging's cloudsql_database descriptor defines database_id as the instance
    # name. Bare names are safe ONLY with the correct type AND a verified project
    # label; never interpret a foreign/wildcard project as an alias.
    if resource.get("type") == "cloudsql_database" and labels.get("project_id") in aliases:
        allowed_database_ids.add(rx.NAME)
    return (
        ("project_id" not in labels or labels["project_id"] in aliases) and
        ("database_id" not in labels or labels["database_id"] in allowed_database_ids) and
        ("region" not in labels or labels["region"] == rx.REGION) and
        ("service" not in labels or labels["service"] == "cloudsql.googleapis.com") and
        ("method" not in labels or labels["method"] == (raw.get("protoPayload") or {}).get("methodName")))


def sanitize_event(raw, project, details=False):
    """Raw request/principal values are never persisted, printed or returned."""
    event = diagnostic.safe_event(raw)
    event["receiveTimestamp"] = diagnostic.timestamp(raw.get("receiveTimestamp"))
    payload = raw.get("protoPayload") or {}
    email = (payload.get("authenticationInfo") or {}).get("principalEmail")
    event["principalSha256"] = rx.digest(email.encode()) if isinstance(email, str) and email else None
    # Cross-check monitored-resource labels when supplied; never silently prefer
    # a matching payload name over contradictory project/instance/region labels.
    event["monitoredResourceConsistent"] = monitored_resource_consistent(raw, project)
    event["requestReview"] = None
    if details:
        try:
            event["requestReview"] = review_label_request(payload.get("request"), project)
        except rx.Stop as error:
            event["requestReview"] = {"present": True, "labelsOnly": False, "blocker": str(error)}
    return event


def private_audit_read(key, arguments, timeout):
    """Disable SDK file/HTTP logging before retrieving transient request bodies."""
    environment = {k: os.environ[k] for k in ("HOME", "PATH", "LANG", "LC_ALL", "CLOUDSDK_CONFIG") if k in os.environ}
    environment.update(CLOUDSDK_CORE_DISABLE_PROMPTS="1", CLOUDSDK_CORE_LOG_HTTP="false",
                       CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
                       CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK="true")
    try:
        result = subprocess.run(["gcloud", "--quiet", "--project=" + rx.PROJECT, "--verbosity=error", *arguments],
                                capture_output=True, text=True, env=environment, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise
    except OSError:
        raise rx.Stop("Read-only private audit query could not run; no mutation attempted.") from None
    if result.returncode:
        raise rx.Stop("Read-only private audit query failed (exit " + str(result.returncode) +
                      "); verify logging read access and installed SDK. Response bodies suppressed.") from None
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise rx.Stop("Read-only private audit query returned invalid JSON; body suppressed.") from None


class AuditReader:
    """One shared bounded budget for tail and exact operation/event re-reads."""
    def __init__(self, project, execute=None, clock=time.monotonic):
        self.project, self.execute, self.clock = project, execute or private_audit_read, clock
        self.began, self.calls, self.proof = clock(), 0, []
        self.total_rows, self.on_batch = 0, None

    def arguments(self, start, end, selector="", details=False):
        args = rx.audit_query(start, end)
        if selector:
            args[2] += " AND (" + selector + ")"
        args[-1] = "--format=json(" + PROJECTION + (",protoPayload.request" if details else "") + ")"
        return args

    def collect(self, start, end, selector="", details=False):
        result = []
        def visit(left, right):
            remaining = rx.AUDIT_TOTAL_TIMEOUT - (self.clock() - self.began)
            if remaining <= 0 or self.calls >= rx.AUDIT_MAX_CALLS:
                raise rx.Stop("Reconciliation audit budget exhausted; no incomplete result is accepted.")
            self.calls += 1
            print("Read-only audit window:", rx.audit_stamp(left), rx.audit_stamp(right), flush=True)
            try:
                raw = rx.rows(self.execute("audit", self.arguments(left, right, selector, details),
                                          min(rx.AUDIT_QUERY_TIMEOUT, remaining)), "Audit")
            except subprocess.TimeoutExpired:
                raw = None
            if self.clock() - self.began >= rx.AUDIT_TOTAL_TIMEOUT:
                raise rx.Stop("Reconciliation audit deadline exceeded.")
            if raw is None or len(raw) >= rx.AUDIT_BATCH_LIMIT:
                if right - left <= rx.AUDIT_MIN_WINDOW:
                    raise rx.Stop("Reconciliation audit interval remains slow/capped; completeness is unknown.")
                midpoint = left + (right - left) / 2
                visit(left, midpoint)
                visit(midpoint, right)
                return
            batch = []
            seen = set()
            for value in raw:
                event = sanitize_event(value, self.project, details)
                if not event["timestamp"] or not left <= rx.audit_time(event["timestamp"]) < right:
                    raise rx.Stop("Fresh audit event is outside requested bounds.")
                if not event["insertId"] or event["insertId"] in seen:
                    raise rx.Stop("Fresh audit page has missing/duplicate event identity.")
                seen.add(event["insertId"])
                batch.append(event)
            result.extend(batch)
            self.total_rows += len(batch)
            if self.total_rows >= rx.AUDIT_LIMIT:
                raise rx.Stop("Reconciliation audit evidence cap reached.")
            self.proof.append({"from": rx.audit_stamp(left), "until": rx.audit_stamp(right),
                               "selector": selector, "requestStructureInspected": details,
                               "count": len(batch), "sanitizedSha256": rx.digest(rx.encoded(batch))})
            if self.on_batch:
                self.on_batch(batch, self.proof[-1])
        cursor = start
        while cursor < end:
            right = min(cursor + rx.AUDIT_WINDOW, end)
            visit(cursor, right)
            cursor = right
        return result


def classify(events, descriptions, project, operator_hash):
    blockers, reviewed, matched, label_requests = [], [], {identity: [] for identity in EXPECTED}, []
    for event in events:
        identity = event["insertId"]
        try:
            method = event["methodName"]
            op = None
            if method != "cloudsql.instances.connect":
                op = operation_id(event["operationId"])
                if method != METHODS[EXPECTED[op]]:
                    raise rx.Stop("Audit method does not match the exact authoritative operation type.")
            normalization = resource_identity(event["resourceName"], project,
                                              descriptions[CREATE] if op == CREATE and method == METHODS["CREATE"] else None)
            if event["serviceName"] != "cloudsql.googleapis.com" or event["statusCode"] not in {None, 0}:
                raise rx.Stop("Audit service or status is unexpected.")
            if not event["monitoredResourceConsistent"]:
                raise rx.Stop("Monitored-resource labels contradict the staging project/instance/region.")
            if event["principalSha256"] != operator_hash:
                raise rx.Stop("Audit actor differs from the independently authenticated operator.")
            if method == "cloudsql.instances.connect":
                reviewed.append({"insertId": identity, "classification": "STAGING_CONNECTION_AUTHORIZATION_NOT_CONFIGURATION_MUTATION",
                                 "resourceNormalization": normalization,
                                 "limitation": "Does not establish what SQL, if any, was executed through a connection."})
                continue
            if event["producer"] not in {None, *RESOURCE_NAMES}:
                raise rx.Stop("Audit operation producer is unexpected.")
            operation = descriptions[op]
            left = rx.audit_time(operation.get("insertTime") or operation["startTime"]) - timedelta(hours=1)
            right = rx.audit_time(operation["endTime"]) + timedelta(hours=1)
            if not event["timestamp"] or not left <= rx.audit_time(event["timestamp"]) <= right:
                raise rx.Stop("Exact-ID audit timing contradicts the authoritative operation lifetime.")
            matched[op].append(event)
            if op == UPDATE:
                request = event["requestReview"]
                if request and request.get("present"):
                    if not request.get("labelsOnly"):
                        raise rx.Stop(request.get("blocker", "UPDATE request changes cannot be verified."))
                    label_requests.append(identity)
            reviewed.append({"insertId": identity, "classification": "EXACT_OPERATION_ID_AND_AUTHORITATIVE_DONE_STATUS",
                             "resourceNormalization": normalization,
                             "terminalFlagPresent": event["last"] is not None, "terminalFlagRequired": False})
        except rx.Stop as error:
            blockers.append({"insertId": identity, "reason": str(error)})
    for op in EXPECTED:
        if not matched[op]:
            blockers.append({"operationId": op, "reason": "No successful exact-ID/method/resource/actor audit evidence."})
    if not label_requests:
        blockers.append({"operationId": UPDATE, "reason": "No strictly labels-only UPDATE request was verified."})
    return {"blockers": blockers, "eventsReviewed": reviewed, "labelRequestEventIds": label_requests,
            "operationVerification": [{
                "operationId": op, "operationType": EXPECTED[op],
                "authoritativeStatus": descriptions[op]["status"],
                "matchingAuditEventIds": [event["insertId"] for event in matched[op]],
                "verifiedDoneViaCloudSqlNotOptionalLogLast": bool(matched[op]),
            } for op in EXPECTED]}


def reconcile(evidence, home=None, fetch=rx.cloud, describe=None, reader_factory=AuditReader):
    home = Path(home or Path.home()).absolute()
    # Diagnose proves original ledger, producer, snapshot hashes and completed
    # batches without changing the original evidence or invoking cloud commands.
    old = diagnostic.diagnose(evidence, home)
    evidence = rx.protected(evidence, True)
    fd = os.open(rx.protected(home / ".local/state/cliniq-rx-staging" / (rx.NAME + ".lock")),
                 os.O_RDONLY | os.O_NOFOLLOW)
    output = None
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        output = Path(tempfile.mkdtemp(prefix="reconciliation-", dir=rx.persistent_root(home)))
        print("New protected reconciliation evidence:", output, flush=True)
        original = (evidence / "original-ledger.json").read_bytes()
        ledger = rx.protected(home / ".local/state/cliniq-rx-staging" / (rx.NAME + ".json"))
        if ledger.read_bytes() != original:
            raise rx.Stop("Original ledger changed before fresh reconciliation.")
        for name, expected in old["snapshotFileSha256"].items():
            if rx.digest(rx.protected(evidence / name).read_bytes()) != expected:
                raise rx.Stop("Original snapshot changed before reconciliation.")
        fresh = {key: fetch(key) for key in ("account", "project", "instance", "databases", "users", "operations")}
        rx.verify_identity(fresh)
        saved_instance = json.loads(rx.protected(evidence / "instance.json").read_text())
        if rx.audit_time(fresh["instance"]["createTime"]) != rx.audit_time(saved_instance["createTime"]):
            raise rx.Stop("Instance incarnation changed.")
        if {operation_id(row.get("name")) for row in rx.rows(fresh["operations"], "Operations")} != set(EXPECTED):
            raise rx.Stop("Fresh SQL operation inventory is not precisely the two identified operations.")
        if len(fresh["operations"]) != len(EXPECTED):
            raise rx.Stop("Fresh operation inventory is duplicated or ambiguous.")
        for value in fresh["operations"]:
            if (value.get("targetId") != rx.NAME or value.get("operationType") != EXPECTED[operation_id(value["name"])] or
                    value.get("status") != "DONE" or value.get("error")):
                raise rx.Stop("Fresh SQL operation inventory contains an unexpected state/type/error.")
        descriptions = {}
        for op in EXPECTED:
            value = describe(op) if describe else rx.read_command("operation-describe", describe_query(op), 30)
            descriptions[op] = verified_operation(value, op, fresh["project"], fresh["instance"])
        actor = fresh["account"][0]["account"]
        operator_hash = rx.digest(actor.encode())
        fresh["account"] = [{"accountSha256": operator_hash, "status": "ACTIVE"}]
        rx.save(output / "fresh-metadata.json", rx.encoded(fresh))
        rx.save(output / "authoritative-operations.json", rx.encoded(descriptions))
        rx.save(output / "original-snapshot-reference.json", rx.encoded(old["snapshotFileSha256"]))
        reader = reader_factory(fresh["project"])
        partial = {"sanitizedBatches": [], "coverage": []}
        def preserve(batch, proof):
            partial["sanitizedBatches"].append(batch)
            partial["coverage"].append(proof)
            rx.checkpoint(output / "sanitized-progress.json", partial)
        reader.on_batch = preserve
        cutoff = datetime.now(timezone.utc)
        tail_start = rx.audit_time(old["coverage"]["until"])
        if tail_start > cutoff:
            raise rx.Stop("Saved historical prefix ends in the future.")
        events = reader.collect(tail_start, cutoff)
        # Re-read ONLY the two exact operations around their authoritative lifetime.
        # UPDATE includes request structure in memory, never in persisted raw form.
        for op, value in descriptions.items():
            left = rx.audit_time(value.get("insertTime") or value["startTime"]) - timedelta(hours=1)
            right = min(cutoff, rx.audit_time(value["endTime"]) + timedelta(hours=1))
            variants = [op, f"projects/{rx.PROJECT}/operations/{op}",
                        f"projects/{rx.PROJECT}/regions/{rx.REGION}/operations/{op}"]
            selector = " OR ".join("operation.id=" + json.dumps(item) for item in variants)
            events.extend(reader.collect(left, right, selector, details=op == UPDATE))
        # Resolve every old unusual event, including connect/resource aliases, by
        # its immutable insertId and original timestamp; never assume it was benign.
        old_by_id = {event["insertId"]: event for event in old["auditEvents"]}
        fetched = {event["insertId"] for event in events}
        for identity, saved in old_by_id.items():
            if identity not in fetched:
                stamp = rx.audit_time(saved["timestamp"])
                events.extend(reader.collect(stamp - timedelta(seconds=1), stamp + timedelta(seconds=1),
                                             "insertId=" + json.dumps(identity),
                                             details=saved["methodName"] == "cloudsql.instances.update"))
        by_id = {}
        for event in events:
            identity = event["insertId"]
            if identity in by_id:
                previous = by_id[identity]
                if {k: v for k, v in previous.items() if k != "requestReview"} != {
                        k: v for k, v in event.items() if k != "requestReview"}:
                    raise rx.Stop("Fresh audit duplicate metadata conflicts.")
                if previous["requestReview"] and event["requestReview"] and previous["requestReview"] != event["requestReview"]:
                    raise rx.Stop("Fresh UPDATE request reviews conflict.")
                if event["requestReview"]:
                    previous["requestReview"] = event["requestReview"]
            else:
                by_id[identity] = event
        for identity, saved in old_by_id.items():
            current = by_id.get(identity)
            keys = ("timestamp", "serviceName", "methodName", "resourceName", "statusCode",
                    "operationId", "producer", "first", "last")
            if current is None or any(saved.get(key) != current.get(key) for key in keys):
                raise rx.Stop("Historical event missing or changed on targeted read.")
        results = classify(list(by_id.values()), descriptions, fresh["project"], operator_hash)
        # Recheck authoritative state, not production; any intervening mutation
        # invalidates this report. Do not compare hashed account to raw account.
        for key in ("project", "instance", "databases", "users", "operations"):
            if fetch(key) != fresh[key]:
                raise rx.Stop("Fresh staging metadata/operations changed during reconciliation.")
        for op in EXPECTED:
            after = describe(op) if describe else rx.read_command("operation-describe", describe_query(op), 30)
            if after != descriptions[op]:
                raise rx.Stop("Authoritative operation changed during reconciliation.")
        if ledger.read_bytes() != original:
            raise rx.Stop("Original ledger changed during reconciliation.")
        final_account = fetch("account")
        if (len(final_account) != 1 or final_account[0].get("status") != "ACTIVE" or
                rx.digest(final_account[0].get("account", "").encode()) != operator_hash):
            raise rx.Stop("Authenticated operator changed during reconciliation.")
        for name, expected in old["snapshotFileSha256"].items():
            if rx.digest(rx.protected(evidence / name).read_bytes()) != expected:
                raise rx.Stop("Original evidence changed during reconciliation.")
        report = {
            "status": "BLOCKED" if results["blockers"] else "READ_ONLY_FACTS_RECONCILED_AWAITING_SEPARATE_APPROVAL",
            "project": rx.PROJECT, "instance": rx.NAME, "recoveryAuthorized": False,
            "credentialResetAuthorized": False, "stagingMutationsImplemented": False,
            "historicalWindowsReused": old["coverage"]["completedWindows"],
            "historicalPrefixUntil": old["coverage"]["until"], "freshAuditCutoff": rx.audit_stamp(cutoff),
            "readOnlyAuditCalls": reader.calls, **results,
            "limitations": ["Connection authorization logs do not prove absence of SQL statements or patient data.",
                            "This report is not input authorization to the old rotate/assess command.",
                            "No timestamp-only or method-only correlation is accepted."],
        }
        rx.save(output / "sanitized-audit.json", rx.encoded(list(by_id.values())))
        rx.save(output / "audit-read-coverage.json", rx.encoded(reader.proof))
        rx.save(output / "reconciliation-report.json", rx.encoded(report))
        rx.save(output / "manifest.json", rx.encoded({p.name: rx.digest(p.read_bytes()) for p in output.iterdir()}))
        return output, report
    except Exception:
        if output:
            rx.save(output / "STOPPED.txt", b"Read-only reconciliation incomplete; no mutation or approval permitted.\n")
        raise
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    try:
        output, report = reconcile(args.evidence)
    except (rx.Stop, OSError, ValueError, TypeError, AttributeError, KeyError):
        error = sys.exc_info()[1]
        print("STOPPED: " + (str(error) if isinstance(error, rx.Stop) else "Protected reconciliation input or read metadata is invalid."))
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    print("Protected sanitized evidence:", output)
    print("STOP: no credentials were reset and no mutation is authorized.")
    return 2 if report["blockers"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
