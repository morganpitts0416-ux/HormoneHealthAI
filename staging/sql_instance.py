"""Cloud SQL argument construction and fail-closed, persistent attempt fencing."""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import tempfile
from diagnostics import RunnerFailure, REGION, metadata_json
from prepare import PROJECT


def attempt_id(source, explicit=None):
    if explicit is not None:
        if not re.fullmatch(r"[a-f0-9]{10}", explicit):
            raise RunnerFailure("Attempt ID must be exactly ten lowercase hexadecimal characters.")
        return explicit
    # Stable across fresh private workspaces and new tooling clones.
    return hashlib.sha256(str(pathlib.Path(source).expanduser().resolve()).encode()).hexdigest()[:10]


def instance_arguments(name, region, password_file):
    if not re.fullmatch(r"cliniq-rx-stage-[a-f0-9]{10}", name) or not REGION.fullmatch(region):
        raise RunnerFailure("Invalid isolated staging instance identity or region; refusing Cloud SQL creation.")
    return [
        "sql", "instances", "create", name, "--database-version=POSTGRES_18",
        "--edition=ENTERPRISE", "--tier=db-custom-1-3840", "--region=" + region,
        "--storage-size=10",
        "--flags-file=" + str(password_file),
    ]


SQL_DESCRIPTION = "--format=json(name,project,region,databaseVersion,connectionName,state,settings.tier,settings.userLabels)"
LABELS = {"purpose": "cliniq-prescription-staging", "synthetic-only": "true"}


def verify_new_instance(description, name, region, require_labels=False):
    if not isinstance(description, dict):
        raise RunnerFailure("New staging SQL instance description is not independently verifiable.")
    expected = {"name": name, "project": PROJECT, "region": region, "databaseVersion": "POSTGRES_18",
                "connectionName": PROJECT + ":" + region + ":" + name, "state": "RUNNABLE"}
    if any(description.get(key) != value for key, value in expected.items()):
        raise RunnerFailure("New staging SQL instance identity, version or readiness differs from the isolated creation plan; stopped before labels or database work.")
    settings = description.get("settings")
    if not isinstance(settings, dict) or settings.get("tier") != "db-custom-1-3840":
        raise RunnerFailure("New staging SQL instance tier could not be independently verified.")
    labels = settings.get("userLabels") or {}
    if not isinstance(labels, dict) or (require_labels and any(labels.get(key) != value for key, value in LABELS.items())):
        raise RunnerFailure("Synthetic-only staging SQL labels could not be independently verified; no database initialization is allowed.")


def create_instance(cloud, state, private, ledger_directory=None):
    name, region = state["instance"], state["region"]
    password_file = private / "instance-flags.json"
    argv = instance_arguments(name, region, password_file)
    if state["project"] != PROJECT or state.get("synthetic_only") is not True or state.get("production_writes_authorized") is not False:
        raise RunnerFailure("Staging attempt does not explicitly preserve synthetic-only and production protections.")
    ledger = pathlib.Path(ledger_directory) if ledger_directory is not None else pathlib.Path.home() / ".local/state/cliniq-rx-staging"
    if ledger.is_symlink():
        raise RunnerFailure("Staging attempt ledger must not be a symlink.")
    ledger.mkdir(mode=0o700, parents=True, exist_ok=True)
    if ledger.stat().st_uid != os.getuid():
        raise RunnerFailure("Staging attempt ledger is not owned by the current operator.")
    ledger.chmod(0o700)
    marker = ledger / (name + ".json")
    lock_path = ledger / (name + ".lock")
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RunnerFailure("This staging attempt is already running; no duplicate Cloud SQL create was issued.") from None
        if marker.is_symlink():
            raise RunnerFailure("Staging attempt marker must not be a symlink.")
        if marker.exists():
            previous = metadata_json(marker.read_text(), "Staging attempt ledger")
            if not isinstance(previous, dict) or previous.get("project") != PROJECT or previous.get("instance") != name:
                raise RunnerFailure("Staging attempt ledger identity is invalid; no create was issued.")
            if previous.get("status") != "rejected-before-submit":
                raise RunnerFailure("This attempt previously submitted Cloud SQL creation or has an uncertain outcome. "
                                    "Stopped without creating or adopting resources. Retain the workspace/ledger for read-only reconciliation; "
                                    "do not change attempt IDs or delete the ledger to bypass this protection.")
        instances = metadata_json(cloud("sql", "instances", "list", "--format=json(name)", capture=True),
                                  "Existing staging SQL instance check")
        if not isinstance(instances, list) or any(not isinstance(row, dict) or not isinstance(row.get("name"), str) for row in instances):
            raise RunnerFailure("Cannot independently verify absence of the staging SQL instance; no create was issued.")
        if any(row["name"] == name for row in instances):
            raise RunnerFailure("The staging SQL instance already exists. Stopped without duplicate creation or reuse; reconcile it read-only.")

        def record(status):
            with tempfile.NamedTemporaryFile(mode="w", dir=ledger, delete=False) as temporary:
                temporary.write(json.dumps({"project": PROJECT, "instance": name, "status": status}) + "\n")
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary_path = pathlib.Path(temporary.name)
            os.replace(temporary_path, marker)
            directory_fd = os.open(ledger, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)

        # Keys must be CLI flags, including their leading "--". Never put the
        # password into argv, shell history, the persistent ledger or raw stdout.
        with open(password_file, "w") as flags:
            os.chmod(password_file, 0o600)
            json.dump({"--root-password": (private / "admin-password").read_text()}, flags)
        record("submission-uncertain")
        try:
            cloud(*argv, capture=True)
        except RunnerFailure as error:
            # SDK usage rejection happens before API submission. All other
            # failures (including timeouts) remain fenced until reconciliation.
            if error.validation_rejected:
                record("rejected-before-submit")
            raise
        else:
            record("instance-created")
        finally:
            password_file.unlink(missing_ok=True)
        # Only the just-created, independently identified instance can be patched.
        # This SDK exposes SQL labels only on beta; all creation stays on GA.
        description = metadata_json(cloud("sql", "instances", "describe", name, SQL_DESCRIPTION, capture=True),
                                    "New staging SQL identity verification")
        verify_new_instance(description, name, region)
        cloud("beta", "sql", "instances", "patch", name,
              "--update-labels=purpose=cliniq-prescription-staging,synthetic-only=true", capture=True)
        description = metadata_json(cloud("sql", "instances", "describe", name, SQL_DESCRIPTION, capture=True),
                                    "New staging SQL label verification")
        verify_new_instance(description, name, region, require_labels=True)
        record("instance-created-and-labels-verified")
    finally:
        os.close(lock_fd)
