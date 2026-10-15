"""Explicit adoption of one verified staging attempt; never general resource reuse."""
import fcntl
import hashlib
import json
import os
import pathlib
import socket
import tempfile
from diagnostics import RunnerFailure, metadata_json, safe_command
from prepare import PROJECT, EXCLUDED, prepare
from sql_instance import SQL_DESCRIPTION, verify_new_instance

ATTEMPT = "c73ac1bc32"
NAME = "cliniq-rx-stage-" + ATTEMPT


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def protected(path, directory=False):
    path = pathlib.Path(path).absolute()
    if path.resolve() != path or not path.exists():
        raise RunnerFailure("Required original protected workspace/ledger file is missing or symlinked; never reset credentials.")
    stat = path.stat()
    if stat.st_uid != os.getuid() or stat.st_mode & 0o077 or path.is_dir() != directory:
        raise RunnerFailure("Workspace/ledger ownership, type or private permissions differ; stopped.")
    return path


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        os.chmod(stream.name, 0o600)
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
        temporary = stream.name
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def source_digest(source):
    entries = {}
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if any(part in EXCLUDED or part in {".cache", ".vite"} for part in relative.parts):
            continue
        if path.is_symlink():
            raise RunnerFailure("Source symlink refused.")
        if path.is_file():
            entries[str(relative)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest(entries)


def inspection_queries(state, name, kind):
    """The same real argument shapes are used by runtime and native SDK preflight."""
    region, service, project = state["region"], state["service"], state.get("project", PROJECT)
    queries = {
        "account": [["iam", "service-accounts", "describe", state["service_account"], "--format=json(name,email,uniqueId,disabled)"]],
        "project": [["projects", "get-iam-policy", project, "--format=json"]],
        "bucket": [["storage", "buckets", "describe", "gs://" + state["bucket"], "--format=json"],
                   ["storage", "buckets", "get-iam-policy", "gs://" + state["bucket"], "--format=json"]],
        "role": [["iam", "roles", "describe", "cliniq_rx_pdf_" + ATTEMPT, "--format=json"]],
        "secret": [["secrets", "describe", name, "--format=json(name,replication,createTime)"],
                   ["secrets", "versions", "list", name, "--format=json(name,state)"],
                   ["secrets", "get-iam-policy", name, "--format=json"]],
        "repository": [["artifacts", "repositories", "describe", service, "--location=" + region, "--format=json(name,format,createTime)"]],
        "image": [["artifacts", "docker", "images", "describe",
                   region + "-docker.pkg.dev/" + project + "/" + service + "/app:synthetic",
                   "--format=json(image_summary.digest)"]],
        "image-inventory": [["artifacts", "docker", "images", "list",
                             region + "-docker.pkg.dev/" + project + "/" + service, "--include-tags", "--format=json"]],
        "service": [["run", "services", "describe", service, "--region=" + region,
                     "--format=json(metadata.name,metadata.labels,metadata.annotations,spec,status.traffic,status.latestReadyRevisionName,status.url)"],
                    ["run", "services", "get-iam-policy", service, "--region=" + region, "--format=json"]],
    }
    return queries[kind]


def inventory_queries(state):
    return [
        ("account", ["iam", "service-accounts", "list", "--format=json(email)"]),
        ("bucket", ["storage", "buckets", "list", "--format=json(name)"]),
        ("role", ["iam", "roles", "list", "--format=json(name)"]),
        ("secret", ["secrets", "list", "--format=json(name)"]),
        ("repository", ["artifacts", "repositories", "list", "--location=" + state["region"], "--format=json(name)"]),
        ("service", ["run", "services", "list", "--region=" + state["region"], "--format=json(metadata.name)"]),
    ]


class Continuation:
    def __init__(self, workspace, materials, ledger_directory=None):
        self.lock = None
        self.workspace = protected(workspace, True)
        self.private = protected(self.workspace / "private", True)
        self.state = json.loads(protected(self.workspace / "state.json").read_text())
        state = self.state
        expected = {"project": PROJECT, "nonce": ATTEMPT, "instance": NAME, "service": NAME,
                    "repository": NAME, "database": "rx_stage_" + ATTEMPT, "app_role": "rx_stage_app_" + ATTEMPT,
                    "bucket": PROJECT + "-" + NAME, "service_account": NAME + "@" + PROJECT + ".iam.gserviceaccount.com",
                    "synthetic_only": True, "production_writes_authorized": False}
        if any(state.get(key) != value for key, value in expected.items()):
            raise RunnerFailure("Original workspace is not the explicitly approved synthetic staging attempt.")
        ledger = protected(ledger_directory or pathlib.Path.home() / ".local/state/cliniq-rx-staging", True)
        marker = json.loads(protected(ledger / (NAME + ".json")).read_text())
        if marker != {"project": PROJECT, "instance": NAME, "status": "instance-created-and-labels-verified"}:
            raise RunnerFailure("Original creation ledger does not prove completed and labeled creation.")
        lock_path = ledger / (NAME + ".lock")
        self.lock = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            protected(lock_path)
            self._initialize(materials, expected)
        except BaseException:
            self.close()
            raise

    def _initialize(self, materials, expected):
        for path in list(self.private.iterdir()) + [p for p in self.workspace.iterdir() if p.name != "source"]:
            if path.is_symlink():
                raise RunnerFailure("Symlink in protected workspace refused.")
        for filename in ("admin-password", "app-password", "pgtest-password", "session", "signature", "catalog.json"):
            if not protected(self.private / filename).read_text().strip():
                raise RunnerFailure("An original credential/fixture file is empty; never replace or reset it.")
        for key in ("sql_proxy_port", "http_proxy_port"):
            port = self.state.get(key)
            if not isinstance(port, int) or not 1024 < port < 65536:
                raise RunnerFailure("Original proxy port is invalid.")
            with socket.socket() as sock:
                try:
                    sock.bind(("127.0.0.1", port))
                except OSError:
                    raise RunnerFailure("Original proxy port is occupied. Stop and reconcile the original proxy; no process was killed.") from None
        if self.state["sql_proxy_port"] == self.state["http_proxy_port"]:
            raise RunnerFailure("Original proxy ports collide.")
        # Reuse original source, never development main. prepare rechecks the approved
        # patch, standalone modules, migrations, startup safeguards and upload hygiene.
        with tempfile.TemporaryDirectory(prefix="cliniq-rx-resume-validate-") as temporary:
            prepare(self.workspace / "source", materials, pathlib.Path(temporary) / "validation")
        tools = pathlib.Path(__file__).parent
        identity = {
            "attempt": expected, "region": self.state["region"],
            "ports": [self.state["sql_proxy_port"], self.state["http_proxy_port"]],
            "workspace": str(self.workspace), "source": source_digest(self.workspace / "source"),
            "tools": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in tools.iterdir() if p.suffix in {".py", ".mjs"} and not p.name.startswith("test_")},
            "credentials": {name: hashlib.sha256((self.private / name).read_bytes()).hexdigest()
                            for name in ("admin-password", "app-password", "pgtest-password", "session", "signature", "catalog.json")},
        }
        self.path = self.private / "continuation.json"
        if self.path.exists() or self.path.is_symlink():
            self.data = json.loads(protected(self.path).read_text())
            if self.data.get("identity") != identity:
                raise RunnerFailure("Continuation source, tools, workspace or credentials changed; read-only reconciliation required.")
            if any(entry.get("status") != "done" for entry in self.data["actions"].values()):
                raise RunnerFailure("A prior write has an uncertain outcome. No writes will be retried; retain the journal for read-only reconciliation.")
            for name, expected_hash in self.data.get("files", {}).items():
                if name not in {"private/app-url", "private/migration-url", "private/accounts.json",
                                "download-result.json", "synthetic-signed.pdf"}:
                    raise RunnerFailure("Unexpected local evidence path in continuation journal.")
                path = self.workspace / name
                if not path.is_file() or path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
                    raise RunnerFailure("Completed step's local credential/PDF evidence is missing or changed; no replay allowed.")
        else:
            self.data = {"identity": identity, "actions": {}, "evidence": {}, "files": {}}
            atomic_json(self.path, self.data)

    def close(self):
        if self.lock is not None:
            os.close(self.lock)
            self.lock = None

    def done(self, label):
        return any(a["label"] == label and a["status"] == "done" for a in self.data["actions"].values())

    def query(self, argv):
        allowed = [
            ["sql", "instances", "describe", NAME, SQL_DESCRIPTION],
            ["sql", "databases", "list", "--instance=" + NAME, "--format=json(name)"],
            ["sql", "users", "list", "--instance=" + NAME, "--format=json(name)"],
            ["run", "services", "list", "--region=" + self.state["region"], "--format=json(metadata.name)"],
        ]
        allowed.extend(query for _kind, query in inventory_queries(self.state))
        for kind in ("account", "project", "bucket", "role", "repository", "image", "image-inventory", "service"):
            allowed.extend(inspection_queries(self.state, NAME, kind))
        for suffix in ("database", "session", "catalog", "admin", "accounts"):
            allowed.extend(inspection_queries(self.state, NAME + "-" + suffix, "secret"))
        if argv not in allowed:
            raise RunnerFailure("Stored verification command is outside the exact staging inspection allowlist.")
        return metadata_json(self.raw(["gcloud", "--quiet", "--project=" + PROJECT, *argv], capture=True),
                             "Continuation resource verification")

    def verify_cloud(self):
        description = self.query(["sql", "instances", "describe", NAME, SQL_DESCRIPTION])
        verify_new_instance(description, NAME, self.state["region"], require_labels=True)
        databases = self.query(["sql", "databases", "list", "--instance=" + NAME, "--format=json(name)"])
        users = self.query(["sql", "users", "list", "--instance=" + NAME, "--format=json(name)"])
        created = self.done("database-create")
        names = {row["name"] for row in databases}
        expected = {"rx_stage_" + ATTEMPT, "cliniq_synthetic"} if created else set()
        if names - {"postgres", "cloudsqladmin", "template0", "template1"} != expected:
            raise RunnerFailure("SQL database inventory differs from the journal; no existing database will be adopted or reset.")
        allowed_users = {"postgres", "cloudsqladmin", "cloudsqlagent", "cloudsqlsuperuser"}
        if created:
            allowed_users |= {"rx_stage_app_" + ATTEMPT, "cliniq_synthetic_owner"}
        if not isinstance(users, list) or any(row.get("name") not in allowed_users for row in users):
            raise RunnerFailure("SQL user inventory contains an unapproved account.")
        for evidence in self.data["evidence"].values():
            current = [self.query(argv) for argv in evidence["queries"]]
            if digest(current) != evidence["digest"]:
                raise RunnerFailure("A previously completed staging resource differs from its recorded configuration/IAM; stopped before replay.")
        for kind, query in inventory_queries(self.state):
            rows = self.query(query)
            if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                raise RunnerFailure("Staging resource inventory cannot be independently verified.")
            for row in rows:
                name = row.get("email") if kind == "account" else row.get("metadata", {}).get("name") if kind == "service" else row.get("name")
                if not isinstance(name, str):
                    raise RunnerFailure("Staging resource inventory identity is malformed.")
                identities = {self.state["service_account"]: NAME} if kind == "account" else \
                    {self.state["bucket"]: NAME, "gs://" + self.state["bucket"] + "/": NAME} if kind == "bucket" else \
                    {"cliniq_rx_pdf_" + ATTEMPT: NAME} if kind == "role" else \
                    {NAME + "-" + suffix: NAME + "-" + suffix for suffix in ("database", "session", "catalog", "admin", "accounts")} if kind == "secret" else {NAME: NAME}
                tail = name.rstrip("/").split("/")[-1]
                match = identities.get(name, identities.get(tail))
                if match and kind + ":" + match not in self.data["evidence"]:
                    raise RunnerFailure("An expected staging resource already exists without continuation provenance; no adoption or replacement is allowed.")
        policy = self.query(inspection_queries(self.state, NAME, "project")[0])
        self.reject_public(policy)

    @staticmethod
    def reject_public(value):
        if isinstance(value, dict):
            if any(member in {"allUsers", "allAuthenticatedUsers"} for member in value.get("members", [])):
                raise RunnerFailure("Public IAM membership is not permitted in continuation evidence.")
            for child in value.values():
                Continuation.reject_public(child)
        elif isinstance(value, list):
            for child in value:
                Continuation.reject_public(child)

    def attach(self, raw):
        self.raw = raw
        return self

    def __getattr__(self, key):
        return getattr(self.__dict__["raw"], key)

    def action(self, argv):
        """Return mutation identity and its read-only verification group, or None."""
        if argv[0] == "gcloud":
            args = argv[3:]
            if argv[1:3] != ["--quiet", "--project=" + PROJECT]:
                raise RunnerFailure("Unexpected cloud project/options refused.")
            if any(word in {"realign-app", "realign-app-new"} for word in args):
                raise RunnerFailure("Production SQL access is forbidden.")
            if args[:1] == ["sql"]:
                if args[:3] not in (["sql", "instances", "describe"], ["sql", "databases", "list"], ["sql", "users", "list"]):
                    raise RunnerFailure("All SQL instance mutations are forbidden in continuation.")
                if args[:3] == ["sql", "instances", "describe"]:
                    valid = args[3] == NAME
                else:
                    valid = "--instance=" + NAME in args
                if not valid:
                    raise RunnerFailure("SQL read does not target the adopted staging instance.")
                return None
            kinds = {
                ("iam", "service-accounts", "create"): "account", ("projects", "add-iam-policy-binding"): "project",
                ("storage", "buckets", "create"): "bucket", ("storage", "buckets", "add-iam-policy-binding"): "bucket",
                ("iam", "roles", "create"): "role", ("secrets", "create"): "secret",
                ("secrets", "add-iam-policy-binding"): "secret", ("artifacts", "repositories", "create"): "repository",
                ("builds", "submit"): "image", ("run", "deploy"): "service",
                ("run", "services", "update"): "service", ("run", "services", "add-iam-policy-binding"): "service",
            }
            kind = next((value for prefix, value in kinds.items() if tuple(args[:len(prefix)]) == prefix), None)
            if not kind:
                # Only the existing runner's read-only commands are allowed.
                if args[:2] == ["storage", "cp"]:
                    if not args[2].startswith("gs://" + self.state["bucket"] + "/clinics/") or \
                       args[3] != str(self.workspace / "object-readback.pdf"):
                        raise RunnerFailure("Object copy is outside the isolated bucket/evidence path.")
                    return None
                if tuple(args[:3]) in {("run", "services", "describe"), ("run", "services", "list"),
                                      ("run", "revisions", "describe"), ("artifacts", "docker", "images")} or \
                   tuple(args[:2]) in {("auth", "list"), ("projects", "describe")}:
                    return None
                raise RunnerFailure("Cloud operation is not on the continuation allowlist.")
            if kind == "service" and args[3 if args[1] == "services" else 2] != NAME:
                raise RunnerFailure("Cloud Run write does not target the dedicated staging service.")
            if kind == "account" and args[3] != NAME or kind == "project" and args[2] != PROJECT or \
               kind == "bucket" and args[3] != "gs://" + self.state["bucket"] or \
               kind == "role" and args[3] != "cliniq_rx_pdf_" + ATTEMPT or \
               kind == "repository" and args[3] != NAME or \
               kind == "image" and args[2] != str(self.workspace / "source"):
                raise RunnerFailure("Cloud write does not target the exact staging resource.")
            if kind == "secret":
                name = args[2]
                if name not in {NAME + "-" + suffix for suffix in ("database", "session", "catalog", "admin", "accounts")}:
                    raise RunnerFailure("Unexpected staging secret identity.")
            else:
                name = NAME
            return "cloud-" + digest(args), kind + ":" + name, inspection_queries(self.state, name, kind)
        if argv[0] == "node":
            filename = pathlib.Path(argv[1]).name
            if pathlib.Path(argv[1]).resolve().parent != pathlib.Path(__file__).resolve().parent:
                raise RunnerFailure("Unreviewed local executable refused.")
            if filename == "verify-database.mjs":
                return None
            if filename == "database.mjs":
                return None if argv[2] == "assert" else ("database-" + argv[2], None, [])
            if filename in {"migrate.mjs", "probe.mjs"}:
                suffix = pathlib.Path(argv[-1]).name if filename == "migrate.mjs" else ("upload-failure" if argv[-1] == "upload-failure" else "signing")
                return filename + "-" + suffix, None, []
        if argv[:3] == ["npx", "--no-install", "drizzle-kit"] or "scripts/prescription-postgres-integration.ts" in argv:
            return "database-tool-" + ("schema" if "drizzle-kit" in argv else "postgres-tests"), None, []
        if argv[:2] in (["npm", "ci"], ["npm", "run"]) or argv[:3] == ["npx", "--no-install", "vitest"]:
            return None
        raise RunnerFailure("Local command is not on the continuation allowlist.")

    def __call__(self, argv, **kwargs):
        action = self.action(argv)
        if action is None:
            return self.raw(argv, **kwargs)
        label, group, queries = action
        key = digest(label)
        previous = self.data["actions"].get(key)
        if previous:
            if previous["status"] != "done":
                raise RunnerFailure("Uncertain prior write; automatic retry is forbidden.")
            self.note("RESUME: skip verified completed action " + label)
            return ""
        # Durable intent precedes EVERY non-idempotent write. A crash, error or
        # failed post-write verification remains uncertain, never replayable.
        if group and group in self.data["evidence"]:
            evidence = self.data["evidence"][group]
            if digest([self.query(q) for q in evidence["queries"]]) != evidence["digest"]:
                raise RunnerFailure("Staging resource changed before write; no update was issued.")
        if group == "service:" + NAME and group not in self.data["evidence"]:
            services = self.query(["run", "services", "list", "--region=" + self.state["region"], "--format=json(metadata.name)"])
            if not isinstance(services, list) or any(row.get("metadata", {}).get("name") == NAME for row in services):
                raise RunnerFailure("A staging service already exists without continuation provenance; no deployment was issued.")
        if group == "image:" + NAME and group not in self.data["evidence"]:
            images = self.query(inspection_queries(self.state, NAME, "image-inventory")[0])
            if not isinstance(images, list) or images:
                raise RunnerFailure("Staging repository is not empty before the first recorded build; no image was replaced.")
        self.data["actions"][key] = {"label": label, "command": self.raw.redact(safe_command(argv)), "status": "pending"}
        atomic_json(self.path, self.data)
        result = self.raw(argv, **kwargs)
        outputs = {"database-create": ["private/app-url", "private/migration-url"],
                   "database-seed": ["private/accounts.json"],
                   "probe.mjs-signing": ["download-result.json", "synthetic-signed.pdf"]}.get(label, [])
        for name in outputs:
            path = self.workspace / name
            if not path.is_file() or path.is_symlink():
                raise RunnerFailure("Completed command did not produce required protected evidence; write remains uncertain.")
            with open(path, "rb") as stream:
                os.fsync(stream.fileno())
            self.data["files"][name] = hashlib.sha256(path.read_bytes()).hexdigest()
        if queries:
            values = [self.query(query) for query in queries]
            self.reject_public(values)
            if group == "bucket:" + NAME:
                metadata = values[0]
                if metadata.get("public_access_prevention") != "enforced" or metadata.get("uniform_bucket_level_access") is not True:
                    raise RunnerFailure("Private GCS policy could not be independently verified; write remains fenced.")
            self.data["evidence"][group] = {"queries": queries, "digest": digest(values)}
        self.data["actions"][key]["status"] = "done"
        atomic_json(self.path, self.data)
        return result

    def verify_database(self):
        stage = "seeded" if self.done("database-seed") else "created" if self.done("database-create") else "empty"
        self.raw(["node", str(pathlib.Path(__file__).parent / "verify-database.mjs"), str(self.workspace), stage])
