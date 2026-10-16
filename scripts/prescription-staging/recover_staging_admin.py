#!/usr/bin/env python3
"""Prepare, explicitly approve, and escrow-before-reset ONE staging postgres account."""
import sys
sys.dont_write_bytecode = True

import argparse
from datetime import datetime, timedelta, timezone
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time

import recovery as rx
import reconcile_recovery_audit as reconciliation
import credential_recovery_evidence as evidence


def read_iam():
    return rx.read_command("project-iam", ["projects", "get-iam-policy", rx.PROJECT, "--format=json(bindings)"], 30)


def catalog(workspace, version=None, operation=None):
    commands = {
        **rx.rotation_reads(),
        "create-escrow": rx.rotation_commands(workspace)["create-escrow"],
        "escrow-password": rx.rotation_commands(workspace)["escrow-password"],
        "reset-postgres": ["sql", "users", "set-password", "postgres", "--instance=" + rx.NAME,
                           "--flags-file=" + str(workspace / "password-flags.json"), "--async",
                           "--format=json(name,targetId,targetProject,operationType,status,error)"],
    }
    if version is not None:
        if not re.fullmatch(r"[1-9][0-9]*", str(version)):
            raise rx.Stop("Exact numeric escrow version is required.")
        commands["verify-escrow-payload"] = ["secrets", "versions", "access", str(version), "--secret=" + rx.ESCROW,
                                            "--out-file=" + str(workspace / "escrow-readback")]
    if operation is not None:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", operation) or operation in reconciliation.EXPECTED:
            raise rx.Stop("Reset operation ID is missing, unsafe or an old operation.")
        commands["reset-operation"] = [
            "sql", "operations", "describe", operation,
            "--format=json(name,targetId,targetProject,operationType,status,error,insertTime,startTime,endTime)",
        ]
    return commands


def call(action, workspace, version=None, operation=None):
    commands = catalog(workspace, version, operation)
    if action not in commands:
        raise rx.Stop("Action is outside the fixed staging recovery catalog.")
    environment = {key: os.environ[key] for key in ("HOME", "PATH", "LANG", "LC_ALL", "CLOUDSDK_CONFIG") if key in os.environ}
    environment.update(CLOUDSDK_CORE_DISABLE_PROMPTS="1", CLOUDSDK_CORE_LOG_HTTP="false",
                       CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
                       CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK="true")
    try:
        result = subprocess.run(["gcloud", "--quiet", "--project=" + rx.PROJECT, "--verbosity=error", *commands[action]],
                                capture_output=True, env=environment, timeout=120)
    except (subprocess.TimeoutExpired, OSError):
        raise rx.Stop("Staging credential action " + action + " could not complete; outcome uncertain. Do not replay.") from None
    if result.returncode:
        raise rx.Stop("Staging credential action " + action + " failed; outcome uncertain. SDK bodies suppressed; do not replay.")
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except (ValueError, UnicodeError):
        raise rx.Stop("Credential action returned invalid metadata; outcome uncertain. Do not replay.") from None


def native_preflight():
    """Exercise actual installed parser, synthetic flags file, isolated auth, no API."""
    with tempfile.TemporaryDirectory(prefix="cliniq-admin-sdk-") as directory:
        root = Path(directory)
        rx.save(root / "postgres-password", b"synthetic-sdk-only")
        rx.save(root / "password-flags.json", rx.encoded({"--password": "synthetic-sdk-only"}))
        rx.save(root / "escrow-readback", b"")
        environment = {key: os.environ[key] for key in ("PATH", "LANG") if key in os.environ}
        environment.update(HOME=str(root), CLOUDSDK_CONFIG=str(root / "sdk"), CLOUDSDK_CORE_DISABLE_PROMPTS="1",
                           CLOUDSDK_CORE_LOG_HTTP="false", CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
                           CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK="true")
        sentinel = "--cliniq-admin-parser-only"
        commands = catalog(root, version="1", operation="synthetic-new-operation")
        commands["project-iam"] = ["projects", "get-iam-policy", "synthetic-sdk-project", "--format=json(bindings)"]
        for action, args in commands.items():
            result = subprocess.run(["gcloud", "--quiet", "--project=synthetic-sdk-project", *args, sentinel],
                                    capture_output=True, text=True, env=environment, timeout=90)
            match = re.search(r"unrecognized arguments:(.*?)(?:To search the help text|$)", result.stderr, re.S)
            rejected = set(re.findall(r"--[a-zA-Z][a-zA-Z0-9-]*", match.group(1))) if match else set()
            if result.returncode != 2 or rejected != {sentinel}:
                raise rx.Stop("Installed SDK rejected secure administrator recovery action " + action + "; no mutation attempted.")


def prepare(source, assessment, home=None, fetch=rx.cloud, iam_read=read_iam, preflight=native_preflight):
    home = Path(home or Path.home()).absolute()
    proven = evidence.load_reconciliation(source, home)
    binding = evidence.source_binding(proven, assessment, home)
    preflight()
    with evidence.attempt_lock(home):
        evidence.no_previous_recovery(home)
        current = evidence.snapshot(home, fetch, iam_read)
        # Recheck all source bytes under the fence before writing the plan.
        if evidence.load_reconciliation(source, home)["manifestSha256"] != proven["manifestSha256"]:
            raise rx.Stop("Source reconciliation changed during plan preparation.")
        payload = evidence.plan_payload(proven, assessment, binding, current)
        directory = evidence.write_plan(payload, home)
        return directory, payload


def verify_reset_operation(data, identity, project, started):
    if (not isinstance(data, dict) or data.get("name") != identity or data.get("targetId") != rx.NAME or
            data.get("targetProject") not in {rx.PROJECT, str(project["projectNumber"])} or
            data.get("operationType") != "UPDATE_USER" or data.get("error") or
            data.get("status") not in {"PENDING", "RUNNING", "DONE"}):
        raise rx.Stop("Reset operation identity/type/status is uncertain; do not replay.")
    if data.get("insertTime") and rx.audit_time(data["insertTime"]) < started - timedelta(minutes=1):
        raise rx.Stop("Reset operation predates this explicitly approved action.")
    if data["status"] == "DONE" and (not data.get("endTime") or rx.audit_time(data["endTime"]) < started - timedelta(minutes=1)):
        raise rx.Stop("Reset completion timing cannot be verified.")
    return data


def execute(directory, checksum, approve_instance=None, approve_reset=False, acknowledge_connections=False,
            home=None, fetch=rx.cloud, iam_read=read_iam, invoke=call, preflight=native_preflight,
            reconcile_now=reconciliation.reconcile, clock=time.monotonic, sleep=time.sleep):
    if approve_instance != rx.NAME or not approve_reset or not acknowledge_connections:
        raise rx.Stop("Explicit exact-instance postgres reset/escrow approval and historical-connection acknowledgment are required.")
    home = Path(home or Path.home()).absolute()
    plan = evidence.load_plan(directory, checksum, home)
    evidence.no_previous_recovery(home)
    preflight()
    # Original reconciler owns its own lock. Refresh full audit/label-request
    # proof first; after it releases, immediately acquire the same attempt fence.
    fresh_path, fresh_report = reconcile_now(Path(plan["assessment"]), home=home)
    fresh_source = evidence.load_reconciliation(fresh_path, home)
    if (fresh_report.get("blockers") != [] or
            sorted(event["insertId"] for event in fresh_source["connections"]) != plan["priorConnectionEventIds"]):
        raise rx.Stop("Fresh reconciliation has blockers or new connection events; fresh explicit review is required.")
    with evidence.attempt_lock(home):
        workspace = evidence.no_previous_recovery(home)
        # Expiry/source/dependency revalidation is performed before this lock via
        # load_plan; recheck expiry and source manifest again without nested locks.
        if datetime.now(timezone.utc) >= rx.audit_time(plan["expiresAt"]):
            raise rx.Stop("Approval expired during fresh checks; no mutation permitted.")
        if evidence.load_reconciliation(plan["sourceReconciliation"], home)["manifestSha256"] != plan["sourceManifestSha256"]:
            raise rx.Stop("Original successful evidence changed.")
        current = evidence.snapshot(home, fetch, iam_read)
        evidence.matches_snapshot(current, plan["snapshot"])
        if current["sql"] != fresh_source["data"]["fresh-metadata.json"]:
            raise rx.Stop("Immediate staging inventory differs from fresh audited reconciliation.")
        if not workspace.exists():
            workspace.mkdir(mode=0o700)
        rx.protected(workspace, True)
        journal_path = workspace / "journal.json"
        journal = {
            "status": "RESERVED_NO_CLOUD_MUTATION_YET", "actions": {},
            "project": rx.PROJECT, "instance": rx.NAME, "user": "postgres",
            "approvalPlanDirectory": str(Path(directory).absolute()), "approvalPlanSha256": checksum,
            "originalLedgerSha256": plan["snapshot"]["originalLedgerSha256"],
            "sourceManifestSha256": plan["sourceManifestSha256"],
            "freshReconciliation": str(fresh_path), "freshManifestSha256": fresh_source["manifestSha256"],
            "historicalConnectionsExplicitlyAcknowledged": True,
            "initializationAuthorized": False, "authenticationVerified": False,
        }
        rx.checkpoint(journal_path, journal)
        password = secrets.token_urlsafe(48)
        rx.save(workspace / "postgres-password", password.encode())
        rx.save(workspace / "password-flags.json", rx.encoded({"--password": password}))
        rx.save(workspace / "escrow-readback", b"")
        journal["credentialSha256"] = rx.digest(password.encode())
        journal["flagsSha256"] = rx.digest((workspace / "password-flags.json").read_bytes())
        rx.checkpoint(journal_path, journal)

        def fence(allow_secret=False):
            if datetime.now(timezone.utc) >= rx.audit_time(plan["expiresAt"]):
                raise rx.Stop("Approval expired; preserve journal/escrow and do not replay.")
            evidence.matches_snapshot(evidence.snapshot(home, fetch, iam_read, allow_secret), plan["snapshot"])
            if rx.digest(rx.protected(Path(directory) / "approval-plan.json").read_bytes()) != checksum:
                raise rx.Stop("Approved plan bytes changed before a credential action.")
            evidence.recheck_assessment(plan, home)
            if (evidence.load_reconciliation(plan["sourceReconciliation"], home)["manifestSha256"] != plan["sourceManifestSha256"] or
                    evidence.load_reconciliation(fresh_path, home)["manifestSha256"] != fresh_source["manifestSha256"]):
                raise rx.Stop("Preserved reconciliation evidence changed before a credential action.")
            if evidence.tool_hashes() != plan["runtimeSha256"]:
                raise rx.Stop("Reviewed recovery runtime changed.")
            if (rx.digest(rx.protected(workspace / "postgres-password").read_bytes()) != journal["credentialSha256"] or
                    rx.digest(rx.protected(workspace / "password-flags.json").read_bytes()) != journal["flagsSha256"]):
                raise rx.Stop("Protected credential files changed; no reset permitted.")
        def action(name, **kwargs):
            if datetime.now(timezone.utc) >= rx.audit_time(plan["expiresAt"]):
                raise rx.Stop("Approval expired immediately before credential action; no replay permitted.")
            journal["actions"][name] = "PENDING_OUTCOME_UNCERTAIN"
            journal["status"] = name + "-UNCERTAIN"
            rx.checkpoint(journal_path, journal)
            return invoke(name, workspace, **kwargs)
        def done(name):
            journal["actions"][name] = "VERIFIED_DONE"
            journal["status"] = name + "-VERIFIED_DONE"
            rx.checkpoint(journal_path, journal)

        fence()
        info = action("create-escrow")
        aliases = {rx.PROJECT, str(current["sql"]["project"]["projectNumber"])}
        allowed_names = {f"projects/{project}/secrets/{rx.ESCROW}" for project in aliases}
        if info.get("name") not in allowed_names:
            raise rx.Stop("New escrow identity is uncertain; password reset not attempted.")
        journal["escrowName"] = info["name"]
        rx.checkpoint(journal_path, journal)
        described = invoke("escrow", workspace)
        policy = invoke("escrow-policy", workspace)
        if (described.get("name") != info["name"] or
                set(described.get("replication", {})) != {"automatic"} or policy.get("bindings", []) != []):
            raise rx.Stop("New escrow identity/direct IAM is unexpected; reset not attempted.")
        done("create-escrow")
        fence(True)
        version = action("escrow-password").get("name", "")
        if not re.fullmatch(re.escape(info["name"]) + r"/versions/[1-9][0-9]*", version):
            raise rx.Stop("Persisted secret version identity is uncertain; reset not attempted.")
        journal["escrowVersion"] = version
        rx.checkpoint(journal_path, journal)
        versions = rx.rows(invoke("escrow-versions", workspace), "Escrow versions")
        if len(versions) != 1 or versions[0].get("name") != version or versions[0].get("state") != "ENABLED":
            raise rx.Stop("Exact enabled secret version is not verified; reset not attempted.")
        invoke("verify-escrow-payload", workspace, version=version.rsplit("/", 1)[-1])
        readback = rx.protected(workspace / "escrow-readback").read_bytes()
        if not hmac.compare_digest(rx.digest(readback), journal["credentialSha256"]):
            raise rx.Stop("Secret Manager read-back differs from generated credential; reset not attempted.")
        journal["escrowReadbackVerified"] = True
        done("escrow-password")
        fence(True)
        # Escrow must remain independently enabled and protected immediately
        # before reset; never generate a second credential on partial failure.
        if invoke("escrow-versions", workspace) != versions or invoke("escrow-policy", workspace).get("bindings", []) != []:
            raise rx.Stop("Escrow state changed before reset.")
        started = datetime.now(timezone.utc)
        journal["resetAttemptedAt"] = rx.audit_stamp(started)
        response = action("reset-postgres")
        identity = response.get("name", "")
        catalog(workspace, operation=identity)  # strict new operation-ID validation
        if response.get("targetId") != rx.NAME or response.get("operationType") != "UPDATE_USER" or response.get("error"):
            raise rx.Stop("Reset submission correlation is uncertain; do not replay.")
        journal["resetOperationId"] = identity
        rx.checkpoint(journal_path, journal)
        deadline = clock() + 120
        while True:
            op = verify_reset_operation(invoke("reset-operation", workspace, operation=identity), identity,
                                        current["sql"]["project"], started)
            if op["status"] == "DONE":
                break
            if clock() >= deadline:
                raise rx.Stop("Reset operation remains incomplete; outcome uncertain. Preserve escrow; do not replay.")
            sleep(2)
        for key in ("instance", "databases", "users"):
            if fetch(key) != current["sql"][key]:
                raise rx.Stop("Post-reset staging identity/inventory changed; authentication remains unverified.")
        operations = rx.rows(fetch("operations"), "Post-reset SQL operations")
        if {row.get("name") for row in operations} != {identity, *reconciliation.EXPECTED} or len(operations) != 3:
            raise rx.Stop("Post-reset operation inventory is ambiguous; no further action permitted.")
        for row in operations:
            kind = "UPDATE_USER" if row["name"] == identity else reconciliation.EXPECTED[row["name"]]
            if (row.get("targetId") != rx.NAME or row.get("operationType") != kind or row.get("status") != "DONE" or row.get("error")):
                raise rx.Stop("Post-reset operation history has unexpected status/type/target.")
        if rx.digest(evidence.original_ledger(home)) != journal["originalLedgerSha256"]:
            raise rx.Stop("Original ledger changed during reset verification.")
        journal["resetOperation"] = {key: op.get(key) for key in ("name", "targetId", "targetProject", "operationType", "status", "insertTime", "endTime")}
        done("reset-postgres")
        journal["status"] = "RESET_OPERATION_DONE_AUTHENTICATION_UNVERIFIED"
        rx.checkpoint(journal_path, journal)
        return workspace, journal


def next_phase_plan(home=None):
    """Local-only handoff, not authentication, SQL initialization or deployment."""
    home = Path(home or Path.home()).absolute()
    with evidence.attempt_lock(home):
        workspace = rx.protected(rx.persistent_root(home) / "credential-recovery", True)
        journal = evidence.private_json(workspace / "journal.json")
        if (journal.get("status") != "RESET_OPERATION_DONE_AUTHENTICATION_UNVERIFIED" or
                journal.get("instance") != rx.NAME or journal.get("project") != rx.PROJECT or
                journal.get("escrowReadbackVerified") is not True or
                rx.digest(evidence.original_ledger(home)) != journal.get("originalLedgerSha256")):
            raise rx.Stop("Completed escrow/reset-operation evidence is required; uncertain actions cannot initialize staging.")
        return {
            "status": "SEPARATE_INITIALIZATION_REVIEW_REQUIRED", "project": rx.PROJECT, "instance": rx.NAME,
            "escrowVersion": journal["escrowVersion"], "authenticationVerified": False, "initializationAuthorized": False,
            "requiredNextSteps": [
                "Read-only reconciliation of the exact reset operation and secret version; no reset replay.",
                "Separately approve bounded staging authentication and metadata-only verification; never read existing patient/application rows.",
                "Treat existing postgres contents as unverified because historical connections do not prove executed SQL.",
                "Separately approve a fresh dedicated synthetic database/app role, not initialization or cleanup of postgres.",
                "Review pinned prescription source, private storage and isolated staging service plan before any provisioning.",
                "Validate synthetic signing authorization, clinic isolation, duplicate signing, PDF integrity, failed uploads and download/print.",
            ],
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "execute", "next-phase-plan"))
    parser.add_argument("--reconciliation", type=Path)
    parser.add_argument("--assessment", type=Path)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--approve-plan-sha256")
    parser.add_argument("--approve-instance")
    parser.add_argument("--approve-postgres-reset-and-secret-escrow", action="store_true")
    parser.add_argument("--acknowledge-historical-connections-unverified-sql", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    approvals = (args.approve_plan_sha256 or args.approve_instance or args.approve_postgres_reset_and_secret_escrow or
                 args.acknowledge_historical_connections_unverified_sql)
    try:
        if args.action == "prepare":
            if not args.reconciliation or not args.assessment or args.plan or approvals:
                raise rx.Stop("Prepare needs exact reconciliation and assessment only; approval flags are prohibited.")
            directory, plan = prepare(args.reconciliation, args.assessment)
            print(json.dumps(plan, indent=2, sort_keys=True))
            print("Protected approval plan:", directory)
            print("Approval-plan SHA-256:", rx.digest((directory / "approval-plan.json").read_bytes()))
            print("STOP: no credential generated, no escrow created, no reset or initialization authorized.")
        elif args.action == "execute":
            if not args.plan or not args.approve_plan_sha256 or args.reconciliation or args.assessment:
                raise rx.Stop("Execute requires the exact separately approved plan/hash.")
            directory, journal = execute(args.plan, args.approve_plan_sha256, args.approve_instance,
                                         args.approve_postgres_reset_and_secret_escrow,
                                         args.acknowledge_historical_connections_unverified_sql)
            print("Protected recovery journal:", directory / "journal.json")
            print("Status:", journal["status"])
            print("STOP: authentication and initialization remain unverified/unapproved. Do not replay.")
        else:
            if approvals or args.plan or args.reconciliation or args.assessment:
                raise rx.Stop("Next-phase plan accepts no mutation approval or source overrides.")
            print(json.dumps(next_phase_plan(), indent=2, sort_keys=True))
        return 0
    except Exception as error:
        print("STOPPED: " + (str(error) if isinstance(error, rx.Stop) else
                            "Protected recovery input/action failed; details suppressed. Preserve journal; do not replay."))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
