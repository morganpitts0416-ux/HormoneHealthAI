#!/usr/bin/env python3
"""Approval-gated lost-workspace recovery for ONE synthetic SQL instance.

Standard library only. 'assess' is read-only; 'rotate' requires explicit approval
of an exact protected report and staging-only escrow/password reset. Neither
action connects to a database, initializes data, or accesses production traffic.
"""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time

PROJECT = "realign-lab-app"
ATTEMPT = "c73ac1bc32"
NAME = "cliniq-rx-stage-" + ATTEMPT
REGION = "us-central1"
EXPECTED_LEDGER = {
    "project": PROJECT, "instance": NAME,
    "status": "instance-created-and-labels-verified",
}
LABELS = {"purpose": "cliniq-prescription-staging", "synthetic-only": "true"}
AUDIT_LIMIT = 10000
AUDIT_WINDOW = timedelta(hours=6)
AUDIT_MIN_WINDOW = timedelta(seconds=1)
AUDIT_BATCH_LIMIT = 201
AUDIT_QUERY_TIMEOUT = 25
AUDIT_TOTAL_TIMEOUT = 240
AUDIT_MAX_CALLS = 96
ESCROW = NAME + "-recovery-postgres"
UPDATE_REVIEW = "Historical SQL UPDATE needs explicit review; projected audit metadata cannot prove labels-only changes."


class Stop(RuntimeError):
    pass


def digest(value):
    return hashlib.sha256(value).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()


def protected(path, directory=False):
    path = Path(path).absolute()
    if path.resolve() != path or not path.exists():
        raise Stop("Required protected path is missing or symlinked.")
    info = path.stat()
    right_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not right_type or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise Stop("Protected path has unsafe ownership, type or permissions.")
    return path


def persistent_root(home):
    home = Path(home).absolute()
    if home.resolve() != home:
        raise Stop("HOME must not be symlinked.")
    current = home
    for part in (".local", "state", "cliniq-rx-recovery", ATTEMPT):
        current /= part
        if not current.exists():
            current.mkdir(mode=0o700)
        if current.is_symlink() or not current.is_dir():
            raise Stop("Persistent state path contains a symlink or non-directory.")
        info = current.stat()
        if info.st_uid != os.getuid() or info.st_mode & 0o022:
            raise Stop("Persistent state parent is not owned and write-protected.")
    return protected(current, True)


def save(path, value):
    """Exclusive 0600 file creation, followed by file AND directory fsync."""
    path = Path(path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def queries():
    """Closed read-only command catalog. No caller-supplied project/resource."""
    return {
        "account": ["auth", "list", "--filter=status:ACTIVE", "--format=json(account,status)"],
        "project": ["projects", "describe", PROJECT, "--format=json(projectId,projectNumber,lifecycleState)"],
        "instance": ["sql", "instances", "describe", NAME,
                     "--format=json(name,project,region,connectionName,createTime,state,databaseVersion,settings.tier,settings.userLabels)"],
        "databases": ["sql", "databases", "list", "--instance=" + NAME, "--format=json(name)"],
        "users": ["sql", "users", "list", "--instance=" + NAME, "--format=json(name)"],
        "operations": ["sql", "operations", "list", "--instance=" + NAME,
                       "--limit=" + str(AUDIT_LIMIT),
                       "--format=json(name,targetId,operationType,status,error,insertTime,startTime,endTime)"],
        "secrets": ["secrets", "list", "--format=json(name)"],
        "buckets": ["storage", "buckets", "list", "--format=json(name)"],
        "accounts": ["iam", "service-accounts", "list", "--format=json(email)"],
        "roles": ["iam", "roles", "list", "--format=json(name)"],
        "repositories": ["artifacts", "repositories", "list", "--location=all", "--format=json(name)"],
        "services": ["run", "services", "list", "--region=" + REGION, "--format=json(metadata.name)"],
        # Cross-region inventory complements authoritative per-product lists.
        # Missing API/permission is a blocker, never treated as empty inventory.
        "assets": ["asset", "search-all-resources", "--scope=projects/" + PROJECT,
                   "--query=name:" + ATTEMPT, "--format=json(name,assetType,location)"],
        "builds": ["builds", "list", "--region=" + REGION,
                   "--filter=images~" + ATTEMPT, "--format=json(id,status,images,createTime)"],
    }


def cloud(key):
    catalog = queries()
    if key not in catalog:
        raise Stop("Command is outside the fixed read-only catalog.")
    return read_command(key, catalog[key], 180)


def read_command(key, arguments, timeout):
    environment = {k: os.environ[k] for k in ("HOME", "PATH", "LANG", "LC_ALL", "CLOUDSDK_CONFIG")
                   if k in os.environ}
    environment.update(CLOUDSDK_CORE_DISABLE_PROMPTS="1", CLOUDSDK_CORE_LOG_HTTP="false",
                       CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK="true")
    command = ["gcloud", "--quiet", "--project=" + PROJECT, "--verbosity=error", *arguments]
    try:
        result = subprocess.run(command, capture_output=True, text=True, env=environment, timeout=timeout)
    except subprocess.TimeoutExpired:
        if key == "audit":
            raise
        raise Stop("Read-only query " + key + " timed out; no mutation attempted.") from None
    except OSError:
        raise Stop("Read-only query " + key + " could not complete; no mutation attempted.") from None
    if result.returncode:
        text = result.stderr.lower()
        reason = ("permission/API access denied" if any(s in text for s in ("permission", "forbidden", "disabled"))
                  else "authentication required" if any(s in text for s in ("credential", "login", "authentication"))
                  else "SDK/API query failed")
        # Never persist or echo SDK response/error bodies.
        raise Stop("Read-only query " + key + ": " + reason + "; exit " + str(result.returncode) +
                   ". Check this command's read permissions and installed SDK; do not enable APIs or change IAM automatically.") from None
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise Stop("Read-only query " + key + " returned invalid JSON.") from None


def audit_time(value):
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            raise ValueError()
        return stamp.astimezone(timezone.utc)
    except (AttributeError, ValueError, TypeError):
        raise Stop("Audit provenance contains an invalid or timezone-free timestamp.") from None


def audit_stamp(value):
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def audit_query(start, end):
    """Each real query has explicit half-open timestamp bounds and a small cap."""
    if end <= start or end - start > AUDIT_WINDOW:
        raise Stop("Audit query interval is outside the bounded search policy.")
    expression = (
        'logName="projects/' + PROJECT + '/logs/cloudaudit.googleapis.com%2Factivity" '
        'AND protoPayload.serviceName="cloudsql.googleapis.com" AND ('
        'resource.labels.database_id="' + PROJECT + ':' + NAME + '" OR '
        'protoPayload.resourceName="projects/' + PROJECT + '/instances/' + NAME + '" OR '
        'protoPayload.resourceName="projects/' + PROJECT + '/regions/' + REGION + '/instances/' + NAME + '") '
        'AND timestamp>="' + audit_stamp(start) + '" AND timestamp<"' + audit_stamp(end) + '"'
    )
    # logging read has NO --page-size in GA. The SDK paginates internally up to
    # this sentinel cap; cap-sized windows are subdivided, never accepted.
    return ["logging", "read", expression, "--order=desc", "--limit=" + str(AUDIT_BATCH_LIMIT),
            "--format=json(timestamp,insertId,operation,protoPayload.serviceName,protoPayload.methodName,protoPayload.resourceName,protoPayload.status.code)"]


def audit_window(start, end, timeout):
    return read_command("audit", audit_query(start, end), timeout)


def audit_history(instance, operations, fetch=audit_window, end=None, clock=time.monotonic, progress=None):
    """Cover creation minus one hour through a frozen current cutoff; fail closed."""
    created = audit_time(instance.get("createTime"))
    end = end or datetime.now(timezone.utc)
    start = created - timedelta(hours=1)
    if created > end or end <= start:
        raise Stop("Instance creation time is later than the audit cutoff.")
    began = clock()
    calls = 0
    entries, coverage, by_id = [], [], {}

    def visit(left, right):
        nonlocal calls
        remaining = AUDIT_TOTAL_TIMEOUT - (clock() - began)
        if remaining <= 0 or calls >= AUDIT_MAX_CALLS:
            raise Stop("Audit coverage budget exhausted; incomplete history cannot authorize recovery.")
        calls += 1
        timeout = min(AUDIT_QUERY_TIMEOUT, remaining)
        if progress:
            progress({"from": audit_stamp(left), "until": audit_stamp(right), "attempt": calls, "status": "querying"})
        try:
            batch = rows(fetch(left, right, timeout), "Audit")
        except subprocess.TimeoutExpired:
            if progress:
                progress({"from": audit_stamp(left), "until": audit_stamp(right), "attempt": calls, "status": "timeout"})
            batch = None
        if clock() - began >= AUDIT_TOTAL_TIMEOUT:
            raise Stop("Audit total deadline exceeded; no incomplete result was accepted.")
        if batch is None or len(batch) >= AUDIT_BATCH_LIMIT:
            if right - left <= AUDIT_MIN_WINDOW:
                raise Stop("Audit window remains slow or capped at minimum interval; completeness cannot be verified.")
            midpoint = left + (right - left) / 2
            visit(left, midpoint)
            visit(midpoint, right)
            return
        for event in batch:
            stamp = audit_time(event.get("timestamp"))
            if not left <= stamp < right or not isinstance(event.get("insertId"), str) or not event["insertId"]:
                raise Stop("Audit result lacks identity or falls outside its requested interval.")
            # Duplicates could conceal a partial page; never silently deduplicate.
            if event["insertId"] in by_id:
                raise Stop("Duplicate audit identity detected; pagination completeness is ambiguous.")
            by_id[event["insertId"]] = True
            entries.append(event)
        if len(entries) >= AUDIT_LIMIT:
            raise Stop("Total audit evidence cap reached; history is incomplete.")
        coverage.append({"from": audit_stamp(left), "until": audit_stamp(right), "count": len(batch),
                         "sha256": digest(encoded(batch))})
        if progress:
            progress({**coverage[-1], "status": "complete", "entries": batch})

    cursor = start
    while cursor < end:
        right = min(cursor + AUDIT_WINDOW, end)
        visit(cursor, right)
        cursor = right
    entries.sort(key=lambda e: (audit_time(e["timestamp"]), e["insertId"]))
    proof = {"from": audit_stamp(start), "until": audit_stamp(end), "createdAt": audit_stamp(created),
             "complete": True, "calls": calls, "windows": coverage, "count": len(entries),
             "evidenceSha256": digest(encoded(entries))}
    # Persist retrieval completion BEFORE correlation can stop the assessment.
    # This marker does not authorize recovery or turn failed correlation into a pass.
    if progress:
        progress({"status": "retrieval-complete", "from": proof["from"], "until": proof["until"],
                  "count": len(entries), "sha256": proof["evidenceSha256"]})
    # Each control-plane operation must have terminal audit evidence. A valid
    # JSON response containing only the beginning of a paginated history is not
    # sufficient. Unknown audit methods remain blocked by reconcile().
    terminal_ids = {
        str(e.get("operation", {}).get("id", "")).rsplit("/", 1)[-1]
        for e in entries if e.get("operation", {}).get("last") is True
    }
    for operation in rows(operations, "SQL operations"):
        identity = str(operation.get("name", "")).rsplit("/", 1)[-1]
        if not identity or identity not in terminal_ids:
            safe_id = identity if re.fullmatch(r"[A-Za-z0-9_.-]{1,160}", identity) else "[invalid identifier]"
            raise Stop("SQL operation has no matching terminal audit evidence: " + safe_id +
                       ". Preserve saved windows; run the offline audit diagnostic before another assessment.")
    return entries, proof


def rows(value, kind):
    if not isinstance(value, list) or any(not isinstance(v, dict) for v in value):
        raise Stop(kind + " inventory is malformed.")
    return value


def verify_identity(data):
    account = rows(data["account"], "Account")
    if len(account) != 1 or account[0].get("status") != "ACTIVE" or not account[0].get("account"):
        raise Stop("Exactly one active authenticated account is required.")
    project = data["project"]
    if not isinstance(project, dict) or project.get("projectId") != PROJECT or project.get("lifecycleState") != "ACTIVE":
        raise Stop("Project identity or lifecycle state differs.")
    instance = data["instance"]
    expected = {"name": NAME, "project": PROJECT, "region": REGION, "state": "RUNNABLE",
                "connectionName": PROJECT + ":" + REGION + ":" + NAME, "databaseVersion": "POSTGRES_18"}
    if not isinstance(instance, dict) or any(instance.get(k) != v for k, v in expected.items()):
        raise Stop("Staging instance identity, region, version or state differs.")
    settings = instance.get("settings", {})
    if settings.get("tier") != "db-custom-1-3840" or any(
            settings.get("userLabels", {}).get(k) != v for k, v in LABELS.items()):
        raise Stop("Staging tier or synthetic-only labels differ.")
    if not instance.get("createTime"):
        raise Stop("Instance creation time is unavailable; audit provenance cannot be correlated.")
    for kind in ("databases", "users"):
        inventory = rows(data[kind], kind)
        if len(inventory) != 1 or inventory[0].get("name") != "postgres":
            raise Stop("Expected only built-in postgres in " + kind + "; unexplained initialization detected.")


def reconcile(data):
    verify_identity(data)
    blockers = []
    for kind in ("secrets", "buckets", "accounts", "roles", "repositories", "services", "builds"):
        inventory = rows(data[kind], kind)
        if any(ATTEMPT in json.dumps(row) for row in inventory):
            blockers.append("Attempt-specific " + kind + " exist; separate read-only reconciliation required.")
    assets = rows(data["assets"], "Assets")
    expected_suffix = "/instances/" + NAME
    if any(row.get("assetType") != "sqladmin.googleapis.com/Instance" or
           not str(row.get("name", "")).endswith(expected_suffix) for row in assets):
        blockers.append("Cross-region asset inventory includes unexpected attempt resources.")
    operations = rows(data["operations"], "SQL operations")
    if not operations or len(operations) >= AUDIT_LIMIT:
        blockers.append("SQL operation history is missing or potentially truncated.")
    for operation in operations:
        if (operation.get("targetId") != NAME or operation.get("status") != "DONE" or operation.get("error")
                or operation.get("operationType") not in {"CREATE", "UPDATE"}):
            blockers.append("SQL operation history contains an unexplained, incomplete or failed operation.")
    if sum(o.get("operationType") == "CREATE" for o in operations) != 1:
        blockers.append("Exactly one successful SQL CREATE operation could not be established.")
    # UPDATE audit records do NOT establish that a change was labels-only.
    # Their review remains mandatory; never infer safety merely from current labels.
    audit = rows(data["audit"], "Audit")
    if not audit or len(audit) >= AUDIT_LIMIT:
        blockers.append("Admin Activity audit history is missing or potentially truncated.")
    create_seen = False
    for event in audit:
        payload = event.get("protoPayload", {})
        method = payload.get("methodName")
        resource = payload.get("resourceName", "")
        if (payload.get("serviceName") != "cloudsql.googleapis.com" or
                resource not in {f"projects/{PROJECT}/instances/{NAME}",
                                 f"projects/{PROJECT}/regions/{REGION}/instances/{NAME}"} or
                payload.get("status", {}).get("code", 0) != 0):
            blockers.append("Audit event has an unexpected identity or failed operation.")
        if method == "cloudsql.instances.create":
            create_seen = True
        elif method == "cloudsql.instances.update":
            blockers.append(UPDATE_REVIEW)
        else:
            blockers.append("Unrecognized SQL audit method; review required before mutations.")
    if not create_seen:
        blockers.append("SQL creation audit evidence could not be established.")
    # Correlate CREATE operation and audit with independently described creation
    # time. Permit clock/operation completion skew, not an unrelated incarnation.
    try:
        parse = lambda v: datetime.fromisoformat(v.replace("Z", "+00:00"))
        created_at = parse(data["instance"]["createTime"])
        starts = [parse(o.get("insertTime", o.get("startTime", ""))) for o in operations
                  if o.get("operationType") == "CREATE"]
        events = [parse(e["timestamp"]) for e in audit
                  if e.get("protoPayload", {}).get("methodName") == "cloudsql.instances.create"]
        if not starts or not events or not all(abs((t - created_at).total_seconds()) <= 3600 for t in starts + events):
            blockers.append("Creation timestamps do not corroborate this instance incarnation.")
    except (ValueError, KeyError, TypeError):
        blockers.append("Creation provenance timestamps are missing or invalid.")
    return sorted(set(blockers))


def assess(home=None, fetch=cloud, audit_reader=audit_history):
    home = Path(home or Path.home()).absolute()
    ledger = protected(home / ".local/state/cliniq-rx-staging", True)
    marker = protected(ledger / (NAME + ".json"))
    original = marker.read_bytes()
    if json.loads(original) != EXPECTED_LEDGER:
        raise Stop("Original creation ledger does not match the approved attempt.")
    # Coordinate with the original creator/continuation without altering ledger.
    lock = protected(ledger / (NAME + ".lock"))
    fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
    evidence = None
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop("Attempt is already locked; no assessment was started.") from None
        root = persistent_root(home)
        evidence = Path(tempfile.mkdtemp(prefix="assessment-", dir=root))
        evidence.chmod(0o700)
        print("Persistent protected evidence:", evidence, flush=True)
        save(evidence / "original-ledger.json", original)
        save(evidence / "tool-sha256.txt", (digest(Path(__file__).read_bytes()) + "\n").encode())
        data = {}
        audit_progress = {"attempts": [], "entries": []}
        # Validate target before further inventory; no unknown SQL target allowed.
        for key in [*queries(), "audit"]:
            if key == "audit":
                def progress(event):
                    audit_progress["attempts"].append({k: v for k, v in event.items() if k != "entries"})
                    audit_progress["entries"].extend(event.get("entries", []))
                    checkpoint(evidence / "audit-progress.json", audit_progress)
                    print("Audit " + event["status"] + ": " + event["from"] + " to " + event["until"], flush=True)
                result, proof = audit_reader(data["instance"], data["operations"], progress=progress)
                save(evidence / "audit-coverage.json", encoded(proof))
            else:
                result = fetch(key)
            if key == "account":
                # Retain identity correlation without persisting account email.
                account = rows(result, "Account")
                if len(account) != 1 or account[0].get("status") != "ACTIVE" or not account[0].get("account"):
                    raise Stop("Exactly one active account is required.")
                result = [{"account": digest(account[0]["account"].encode()), "status": "ACTIVE"}]
            data[key] = result
            save(evidence / (key + ".json"), encoded(result))
            if key == "users":
                verify_identity(data)
        blockers = reconcile(data)
        # Detect concurrent identity or ledger changes before issuing any plan.
        if fetch("instance") != data["instance"] or marker.read_bytes() != original:
            raise Stop("Instance or original ledger changed during assessment.")
        if fetch("databases") != data["databases"] or fetch("users") != data["users"]:
            raise Stop("SQL inventory changed during assessment.")
        if fetch("operations") != data["operations"]:
            raise Stop("SQL operation history changed during audit verification; fresh assessment required.")
        report = {
            "project": PROJECT, "attempt": ATTEMPT, "instance": NAME,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "status": "BLOCKED_REQUIRES_RECONCILIATION" if blockers else "AWAITING_EXPLICIT_APPROVAL",
            "blockers": blockers, "originalLedgerSha256": digest(original),
            "auditEvidenceSha256": digest(encoded(data["audit"])),
            "auditCoverageSha256": digest((evidence / "audit-coverage.json").read_bytes()),
            "administratorCredential": "LOST_NO_ATTEMPT_SECRET_BACKUP_FOUND",
            "passwordResetRequiredToProceed": not any(ATTEMPT in json.dumps(r) for r in data["secrets"]),
            "passwordResetAuthorized": False, "cloudMutationsAuthorized": False,
            "cloudMutationsImplemented": "Separate explicitly approved rotate action only; assessment never mutates",
            "approvalRequiredFor": [
                "Review ambiguous historical operations, if any",
                "Create staging-only Secret Manager escrow with narrowly scoped IAM",
                "Rotate postgres password on the exact verified staging instance",
                "Initialize synthetic staging database and later deploy isolated validation service",
            ],
            "warning": "Evidence is not authorization. Revalidate immediately before any separately approved mutation.",
        }
        save(evidence / "approval-report.json", encoded(report))
        manifest = {p.name: digest(p.read_bytes()) for p in evidence.iterdir() if p.is_file()}
        save(evidence / "manifest.json", encoded(manifest))
        return evidence, report
    except Exception:
        if evidence:
            save(evidence / "STOPPED.txt", b"Assessment incomplete. No approval or cloud mutation is permitted.\n")
        raise
    finally:
        os.close(fd)


def rotation_reads():
    return {
        "escrow": ["secrets", "describe", ESCROW, "--format=json(name,replication)"],
        "escrow-policy": ["secrets", "get-iam-policy", ESCROW, "--format=json"],
        "escrow-versions": ["secrets", "versions", "list", ESCROW, "--format=json(name,state)"],
    }


def rotation_commands(private):
    return {
        "create-escrow": ["secrets", "create", ESCROW, "--replication-policy=automatic", "--format=json(name)"],
        "escrow-password": ["secrets", "versions", "add", ESCROW,
                            "--data-file=" + str(private / "postgres-password"), "--format=json(name)"],
        "rotate-postgres": ["sql", "users", "set-password", "postgres", "--instance=" + NAME,
                            "--flags-file=" + str(private / "password-flags.json"), "--format=json"],
    }


def rotation_call(key, private):
    """Only reachable from rotate after its approval and evidence fences."""
    catalog = {**rotation_reads(), **rotation_commands(private)}
    if key not in catalog:
        raise Stop("Command is outside the fixed staging credential recovery catalog.")
    environment = {k: os.environ[k] for k in ("HOME", "PATH", "LANG", "LC_ALL", "CLOUDSDK_CONFIG")
                   if k in os.environ}
    environment.update(CLOUDSDK_CORE_DISABLE_PROMPTS="1", CLOUDSDK_CORE_LOG_HTTP="false",
                       CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK="true")
    try:
        result = subprocess.run(
            ["gcloud", "--quiet", "--project=" + PROJECT, "--verbosity=error", *catalog[key]],
            capture_output=True, text=True, env=environment, timeout=300)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop("Staging credential action " + key + " is uncertain; retain journal, never replay blindly.") from None
    if result.returncode:
        raise Stop("Staging credential action " + key + " failed; exit " + str(result.returncode) +
                   ". No SDK response body was logged. Retain journal for reconciliation.") from None
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise Stop("Staging credential action " + key + " returned invalid metadata; outcome uncertain.") from None


def rotation_preflight(private):
    """Actual native parser validation with no credentials and forced rejection."""
    with tempfile.TemporaryDirectory(prefix="cliniq-recovery-sdk-") as directory:
        root = Path(directory)
        fake_private = root / "private"
        fake_private.mkdir(mode=0o700)
        save(fake_private / "postgres-password", b"synthetic-sdk-only")
        save(fake_private / "password-flags.json", encoded({"--password": "synthetic-sdk-only"}))
        environment = {k: os.environ[k] for k in ("PATH", "LANG") if k in os.environ}
        environment.update(HOME=str(root), CLOUDSDK_CONFIG=str(root / "sdk"),
                           CLOUDSDK_CORE_DISABLE_PROMPTS="1",
                           CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK="true")
        sentinel = "--cliniq-recovery-parser-only"
        for key, arguments in {**rotation_reads(), **rotation_commands(fake_private)}.items():
            result = subprocess.run(
                ["gcloud", "--quiet", "--project=synthetic-sdk-compatibility", *arguments, sentinel],
                capture_output=True, text=True, env=environment, timeout=90)
            match = re.search(r"unrecognized arguments:(.*?)(?:To search the help text|$)", result.stderr, re.S)
            rejected = set(re.findall(r"--[a-zA-Z][a-zA-Z0-9-]*", match.group(1))) if match else set()
            if result.returncode != 2 or rejected != {sentinel}:
                raise Stop("Installed SDK rejected secure recovery command " + key + "; no cloud mutation attempted.")


def approved_evidence(home, directory, approved_hash, approve_reset, approve_updates):
    if not approve_reset or not re.fullmatch(r"[a-f0-9]{64}", approved_hash or ""):
        raise Stop("Explicit approval of staging reset/secret escrow and exact report SHA-256 is required.")
    root = persistent_root(home)
    evidence = protected(directory, True)
    if evidence.parent != root or not evidence.name.startswith("assessment-"):
        raise Stop("Approval must reference a protected assessment from this attempt.")
    if (evidence / "STOPPED.txt").exists():
        raise Stop("An incomplete assessment cannot authorize recovery.")
    manifest = json.loads(protected(evidence / "manifest.json").read_text())
    expected_names = {key + ".json" for key in queries()} | {
        "original-ledger.json", "tool-sha256.txt", "approval-report.json",
        "audit.json", "audit-coverage.json", "audit-progress.json"}
    if not isinstance(manifest, dict) or set(manifest) != expected_names:
        raise Stop("Assessment manifest is incomplete or contains unexpected paths.")
    for name, expected_hash in manifest.items():
        if digest(protected(evidence / name).read_bytes()) != expected_hash:
            raise Stop("Approved evidence bytes changed.")
    report_bytes = (evidence / "approval-report.json").read_bytes()
    if digest(report_bytes) != approved_hash:
        raise Stop("Explicit approval hash differs from this assessment report.")
    report = json.loads(report_bytes)
    if (report.get("auditEvidenceSha256") != digest((evidence / "audit.json").read_bytes()) or
            report.get("auditCoverageSha256") != digest((evidence / "audit-coverage.json").read_bytes())):
        raise Stop("Approved report does not bind the exact complete audit evidence and coverage.")
    if (evidence / "tool-sha256.txt").read_text().strip() != digest(Path(__file__).read_bytes()):
        raise Stop("Recovery tool changed after assessment.")
    data = {key: json.loads((evidence / (key + ".json")).read_text()) for key in [*queries(), "audit"]}
    coverage = json.loads((evidence / "audit-coverage.json").read_text())
    if (coverage.get("complete") is not True or coverage.get("count") != len(data["audit"]) or
            coverage.get("evidenceSha256") != digest(encoded(data["audit"]))):
        raise Stop("Approved audit coverage is incomplete or differs from its evidence.")
    blockers = reconcile(data)
    if any(b != UPDATE_REVIEW for b in blockers) or (UPDATE_REVIEW in blockers and not approve_updates):
        raise Stop("Unresolved reconciliation blockers or unapproved historical UPDATE review.")
    return evidence, data


def checkpoint(path, data):
    """Atomically replace only the NEW recovery journal, never the old ledger."""
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        os.chmod(stream.name, 0o600)
        stream.write(encoded(data))
        stream.flush()
        os.fsync(stream.fileno())
        temporary = stream.name
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def rotate(directory, approved_hash, approve_reset=False, approve_updates=False,
           home=None, fetch=cloud, execute=rotation_call, preflight=rotation_preflight, audit_reader=audit_history):
    """Approved staging-only escrow + rotation. Stops BEFORE database initialization."""
    import secrets
    home = Path(home or Path.home()).absolute()
    evidence, approved = approved_evidence(home, directory, approved_hash, approve_reset, approve_updates)
    ledger = protected(home / ".local/state/cliniq-rx-staging", True)
    marker = protected(ledger / (NAME + ".json"))
    original = marker.read_bytes()
    if original != (evidence / "original-ledger.json").read_bytes():
        raise Stop("Original attempt ledger differs from approved evidence.")
    fd = os.open(protected(ledger / (NAME + ".lock")), os.O_RDONLY | os.O_NOFOLLOW)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop("Attempt is already locked; no credential mutation attempted.") from None
        root = persistent_root(home)
        workspace = root / "credential-recovery"
        if not workspace.exists():
            workspace.mkdir(mode=0o700)
        protected(workspace, True)
        journal_path = workspace / "journal.json"
        if journal_path.exists() or journal_path.is_symlink():
            journal = json.loads(protected(journal_path).read_text())
            if journal.get("approvalReportSha256") != approved_hash:
                raise Stop("Existing recovery journal references another approval; do not replace it.")
            # Do not replay EVEN a successful rotation: database auth verification
            # and partial-resource reconciliation are separate next steps.
            raise Stop("Credential recovery was previously started (" + journal.get("status", "unknown") +
                       "). No action replayed. Retain credentials and journal for read-only reconciliation.")
        if any(workspace.iterdir()):
            raise Stop("Unjournaled recovery files exist; do not regenerate or overwrite credentials.")
        # Repeat ALL assessment reads under the same attempt lock immediately
        # before writes. Any new resource or operation invalidates old approval.
        for key in queries():
            current = fetch(key)
            if key == "account":
                account = rows(current, "Account")
                if len(account) != 1 or account[0].get("status") != "ACTIVE":
                    raise Stop("Authenticated operator changed since approval.")
                current = [{"account": digest(account[0]["account"].encode()), "status": "ACTIVE"}]
            if current != approved[key]:
                raise Stop("Live " + key + " changed since assessment; fresh approval required.")
        current_audit, _proof = audit_reader(approved["instance"], approved["operations"])
        if current_audit != approved["audit"] or fetch("operations") != approved["operations"]:
            raise Stop("Live audit or SQL operations changed since assessment; fresh approval required.")
        if marker.read_bytes() != original:
            raise Stop("Original ledger changed during verification.")
        preflight(workspace)
        journal = {"approvalReportSha256": approved_hash, "originalLedgerSha256": digest(original),
                   "status": "prepared", "actions": {},
                   "approvedHistoricalUpdates": bool(approve_updates)}
        checkpoint(journal_path, journal)
        password = secrets.token_urlsafe(48)
        save(workspace / "postgres-password", password.encode())
        save(workspace / "password-flags.json", encoded({"--password": password}))
        journal["credentialSha256"] = digest(password.encode())
        checkpoint(journal_path, journal)
        for action in rotation_commands(workspace):
            if (fetch("instance") != approved["instance"] or fetch("databases") != approved["databases"] or
                    fetch("users") != approved["users"] or marker.read_bytes() != original):
                raise Stop("Staging identity/inventory or original ledger changed before a credential action.")
            journal["actions"][action] = "pending"
            journal["status"] = action + "-uncertain"
            checkpoint(journal_path, journal)
            result = execute(action, workspace)
            if action == "create-escrow":
                if not isinstance(result, dict) or not re.fullmatch(
                        r"projects/(?:realign-lab-app|[0-9]+)/secrets/" + re.escape(ESCROW), result.get("name", "")):
                    raise Stop("Escrow identity could not be independently correlated; no password rotation attempted.")
                secret_info = execute("escrow", workspace)
                policy = execute("escrow-policy", workspace)
                if secret_info.get("name") != result["name"] or policy.get("bindings"):
                    raise Stop("New escrow identity or direct IAM is unexpected; no password rotation attempted.")
                journal["escrowName"] = result["name"]
            elif action == "escrow-password":
                version = result.get("name", "")
                if not re.fullmatch(re.escape(journal["escrowName"]) + r"/versions/[1-9][0-9]*", version):
                    raise Stop("Escrow version could not be verified; no password rotation attempted.")
                versions = rows(execute("escrow-versions", workspace), "Escrow versions")
                if len(versions) != 1 or versions[0].get("name") != version or versions[0].get("state") != "ENABLED":
                    raise Stop("Escrow versions are unexpected; no password rotation attempted.")
                journal["escrowVersion"] = version
            else:
                # Verify operation result from synchronous set-password; no
                # connection is made to any database, including staging.
                if (not isinstance(result, dict) or result.get("targetId") != NAME or
                        result.get("status") != "DONE" or result.get("error")):
                    raise Stop("Password rotation outcome is uncertain; no reset replay or database initialization allowed.")
            journal["actions"][action] = "done"
            checkpoint(journal_path, journal)
        journal["status"] = "rotation-command-completed-authentication-not-yet-verified"
        checkpoint(journal_path, journal)
        return workspace
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["assess", "rotate"])
    parser.add_argument("--assessment", type=Path)
    parser.add_argument("--approve-report-sha256")
    parser.add_argument("--approve-staging-reset-and-secret-escrow", action="store_true")
    parser.add_argument("--approve-historical-updates", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.action == "rotate":
            if args.assessment is None:
                raise Stop("A protected assessment and explicit approval are required.")
            workspace = rotate(args.assessment, args.approve_report_sha256,
                               args.approve_staging_reset_and_secret_escrow, args.approve_historical_updates)
            print("Staging credential recovery evidence:", workspace)
            print("STOP: rotation command completed; staging authentication and initialization require separate verification/approval.")
            return 0
        if args.assessment or args.approve_report_sha256 or args.approve_staging_reset_and_secret_escrow or args.approve_historical_updates:
            raise Stop("Assessment cannot accept mutation approval flags.")
        evidence, report = assess()
    except (Stop, ValueError, TypeError, OSError):
        # Preserve actionable known errors, never arbitrary SDK/JSON/OS payloads.
        import sys
        error = sys.exc_info()[1]
        print("STOPPED: " + (str(error) if isinstance(error, Stop) else "Protected local state is invalid or inaccessible."))
        return 1
    print("Persistent protected evidence:", evidence)
    print("Assessment:", report["status"])
    print("Approval report SHA-256:", digest((evidence / "approval-report.json").read_bytes()))
    print("Administrator password reset required:", report["passwordResetRequiredToProceed"])
    print("No reset, database connection, cloud mutation, production access or credential retrieval was performed.")
    for blocker in report["blockers"]:
        print("BLOCKER:", blocker)
    print("STOP: review approval-report.json. Separate explicit approval is required before any mutation.")
    return 2 if report["blockers"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
