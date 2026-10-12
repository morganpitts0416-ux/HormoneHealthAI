#!/usr/bin/env python3
"""Operator-run Cloud Shell staging automation. No production writes or deletes."""
import argparse
import base64
import hashlib
import json
import os
import pathlib
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
import zlib
import struct
from datetime import datetime, timedelta, timezone
from prepare import prepare, PROJECT, PRODUCTION_REVISION
from diagnostics import CommandRunner, RunnerFailure, metadata_json, discover_region, validate_production_metadata, REGION, sanitize

TOOLS = pathlib.Path(__file__).resolve().parent


def clean_environment():
    """Keep operator SDK config, not inherited production data/payment credentials."""
    blocked = {
        "DATABASE_URL", "NEON_DATABASE_URL", "SESSION_SECRET", "STRIPE_SECRET_KEY",
        "STRIPE_PUBLISHABLE_KEY", "RESEND_API_KEY", "SPRUCE_WEBHOOK_SECRET",
        "SPRUCE_API_KEY", "ELEVENLABS_API_KEY", "OPENAI_API_KEY",
        "AI_INTEGRATIONS_OPENAI_API_KEY", "AI_INTEGRATIONS_OPENAI_BASE_URL",
        "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_OAUTH_ACCESS_TOKEN",
        "NPM_TOKEN", "NODE_AUTH_TOKEN", "PGHOST", "PGPORT", "PGUSER",
        "PGPASSWORD", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGSSLMODE",
    }
    return {k: v for k, v in os.environ.items() if k not in blocked and not k.startswith("CLOUDSDK_AUTH_")}


def private_write(path, text):
    path.write_text(text)
    path.chmod(0o600)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def synthetic_signature():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    # Each scanline is one filter byte followed by six RGB bytes.
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress((b"\0" + b"\x12\x34\x56" * 2) * 2)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode()


def wait_port(port, process):
    for _ in range(90):
        if process.poll() is not None:
            raise RuntimeError("Private staging proxy exited")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(1)
    raise RuntimeError("Private staging proxy did not open its port")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=str(pathlib.Path.home() / "cliniq-prescription-staging"))
    parser.add_argument("--materials", default=str(pathlib.Path.home() / "cliniq-prescription-release/materials"))
    parser.add_argument("--region")
    parser.add_argument("--execute", action="store_true", help="Create billable isolated staging resources; never production")
    args = parser.parse_args()
    workspace = prepare(args.source, args.materials)
    print("Prepared private source copy:", workspace, flush=True)
    if not args.execute:
        print("Prepare-only: no Google Cloud operations, database writes, builds or deployment executed.")
        return
    private = workspace / "private"
    private.mkdir(mode=0o700)
    log = open(private / "operator.log", "w")
    (private / "operator.log").chmod(0o600)
    processes = []
    state = {}
    broken_bucket = False
    phase = "authentication"

    command = CommandRunner(log, clean_environment)

    def cloud(*args, capture=False):
        return command(["gcloud", "--quiet", "--project=" + PROJECT, *args], capture=capture)

    def step(name):
        nonlocal phase
        phase = name
        print("Staging:", name, flush=True)

    def secret(name, file, runtime=True):
        cloud("secrets", "create", name, "--replication-policy=automatic", "--data-file=" + str(file))
        if runtime:
            cloud("secrets", "add-iam-policy-binding", name, "--member=serviceAccount:" + state["service_account"],
                  "--role=roles/secretmanager.secretAccessor")
        return name + ":1"

    try:
        account = cloud("auth", "list", "--filter=status:ACTIVE", "--format=value(account)", capture=True)
        if not account or "\n" in account:
            raise RuntimeError("Exactly one active authenticated Google account is required")
        if cloud("projects", "describe", PROJECT, "--format=value(projectId)", capture=True) != PROJECT:
            raise RuntimeError("Wrong Google project")
        step("verify production metadata read-only")
        if args.region:
            if not REGION.fullmatch(args.region):
                raise RunnerFailure("--region is not a valid Cloud Run region name; provide an independently verified region, not a URL or resource name.")
            region = args.region
        else:
            # gcloud's global list exposes computed id/region fields; a location
            # label is not guaranteed. Never guess a default region.
            services = metadata_json(cloud("run", "services", "list", "--platform=managed",
                                           "--format=json(id,name,region,location,metadata.name,metadata.labels)",
                                           capture=True), "Production region discovery")
            region = discover_region(services)
        command.note("VERIFIED production region: " + region)
        before = metadata_json(cloud("run", "services", "describe", "hormonehealthai", "--region=" + region,
                                     "--format=json(id,name,region,location,metadata.name,metadata.labels,status.traffic,status.latestReadyRevisionName)",
                                     capture=True), "Production service verification")
        validate_production_metadata(before, region, PRODUCTION_REVISION)
        command.note("VERIFIED production ready revision and 100% traffic: " + PRODUCTION_REVISION)
        (workspace / "production-before.json").write_text(json.dumps(before, indent=2))
        previous_image = cloud("run", "revisions", "describe", PRODUCTION_REVISION, "--region=" + region,
                               "--format=value(status.imageDigest)", capture=True)
        if not re.search(r"sha256:[a-f0-9]{64}$", previous_image):
            raise RuntimeError("Could not independently capture immutable production rollback image")
        (workspace / "rollback-evidence.json").write_text(json.dumps({
            "service": "hormonehealthai", "region": region, "project": PROJECT,
            "priorRevision": PRODUCTION_REVISION, "priorImage": previous_image,
            "traffic": before["status"]["traffic"], "rollbackApproved": False,
            "databaseBackupRestoreEvidence": "NOT verified; requires separate production review",
            "productionSigningActivationApproved": False,
        }, indent=2))
        nonce = uuid.uuid4().hex[:10]
        name = "cliniq-rx-stage-" + nonce
        state = {
            "project": PROJECT, "region": region, "nonce": nonce, "service": name, "instance": name,
            "database": "rx_stage_" + nonce, "app_role": "rx_stage_app_" + nonce,
            "bucket": PROJECT + "-" + name, "repository": name,
            "service_account": name + "@" + PROJECT + ".iam.gserviceaccount.com",
            "sql_proxy_port": free_port(), "http_proxy_port": free_port(),
            "synthetic_only": True, "production_writes_authorized": False,
        }
        assert state["instance"] not in {"realign-app", "realign-app-new"}
        for filename in ("admin-password", "app-password", "pgtest-password", "session"):
            private_write(private / filename, secrets.token_urlsafe(48))
        private_write(private / "signature", synthetic_signature())
        now = datetime.now(timezone.utc)
        catalog = [{
            "medicationName": "SYNTHETIC STAGING MEDICATION", "strength": strength, "dosageForm": "tablet",
            "noncontrolled": True, "sourceReference": "Fictional synthetic test fixture; NOT a clinical formulary",
            "reviewedBy": "Synthetic staging test", "reviewedAt": now.isoformat().replace("+00:00", "Z"),
            "expiresAt": (now + timedelta(days=30)).isoformat().replace("+00:00", "Z"),
        } for strength in ("10 mg", "20 mg")]
        private_write(private / "catalog.json", json.dumps(catalog))
        private_write(workspace / "state.json", json.dumps(state, indent=2))
        source = workspace / "source"
        step("install and validate actual integrated source")
        build_env = clean_environment()
        build_env["NODE_ENV"] = "development"
        command(["npm", "ci"], cwd=source, env=build_env)
        tests = sorted(set(str(p.relative_to(source)) for glob in ("*prescription*.test.ts", "*prescriber*.test.ts",
                                                                  "*billing-cancellation*.test.ts", "*access*.test.ts")
                           for p in (source / "tests/unit").glob(glob)))
        if not any("prescription" in name for name in tests):
            raise RuntimeError("Actual integrated prescription tests missing")
        command(["npx", "--no-install", "vitest", "run", *tests], cwd=source, env=build_env)
        command(["npm", "run", "build"], cwd=source, env=build_env)
        step("create fresh isolated Cloud SQL instance (billable)")
        private_write(private / "instance-flags.json", json.dumps({
            "database-version": "POSTGRES_18", "edition": "ENTERPRISE", "tier": "db-custom-1-3840",
            "region": region, "storage-size": "10", "root-password": (private / "admin-password").read_text(),
            "labels": "purpose=cliniq-prescription-staging,synthetic-only=true",
        }))
        cloud("sql", "instances", "create", name, "--flags-file=" + str(private / "instance-flags.json"))
        (private / "instance-flags.json").unlink()
        state["connection_name"] = cloud("sql", "instances", "describe", name, "--format=value(connectionName)", capture=True)
        if state["connection_name"] != PROJECT + ":" + region + ":" + name:
            raise RuntimeError("Unexpected staging SQL connection name")
        private_write(workspace / "state.json", json.dumps(state, indent=2))
        step("start private local Cloud SQL auth proxy")
        proxy = shutil.which("cloud-sql-proxy")
        if not proxy:
            release = json.load(urllib.request.urlopen("https://api.github.com/repos/GoogleCloudPlatform/cloud-sql-proxy/releases/latest"))
            asset = next(a for a in release["assets"] if a["name"].endswith(".linux.amd64"))
            digest = asset.get("digest", "")
            if not digest.startswith("sha256:"):
                raise RuntimeError("Official proxy download has no verifiable SHA-256 digest")
            binary = urllib.request.urlopen(asset["browser_download_url"]).read()
            if hashlib.sha256(binary).hexdigest() != digest.removeprefix("sha256:"):
                raise RuntimeError("Official proxy binary digest mismatch")
            proxy = str(workspace / "cloud-sql-proxy")
            pathlib.Path(proxy).write_bytes(binary)
            pathlib.Path(proxy).chmod(0o700)
        sql_proxy = subprocess.Popen([proxy, "--gcloud-auth", "--address=127.0.0.1",
                                      "--port=" + str(state["sql_proxy_port"]), state["connection_name"]],
                                     stdout=log, stderr=log, env=clean_environment())
        processes.append(sql_proxy)
        wait_port(state["sql_proxy_port"], sql_proxy)
        step("initialize empty synthetic staging database")
        command(["node", str(TOOLS / "database.mjs"), "create", str(workspace)])
        step("run existing isolated PostgreSQL tests against PostgreSQL 18")
        import tempfile
        socket_root = pathlib.Path(tempfile.mkdtemp(prefix="cliniq-rx-pg."))
        socket_root.chmod(0o700)
        socket_proxy = subprocess.Popen([proxy, "--gcloud-auth", "--unix-socket=" + str(socket_root),
                                        state["connection_name"]], stdout=log, stderr=log, env=clean_environment())
        processes.append(socket_proxy)
        socket_dir = socket_root / state["connection_name"]
        for _ in range(90):
            if (socket_dir / ".s.PGSQL.5432").exists():
                break
            if socket_proxy.poll() is not None:
                raise RuntimeError("Isolated PostgreSQL socket proxy exited")
            time.sleep(1)
        else:
            raise RuntimeError("Isolated PostgreSQL socket did not become ready")
        pgtest_env = clean_environment()
        pgtest_env["PGPASSWORD"] = (private / "pgtest-password").read_text()
        pgtest_env.pop("DATABASE_URL", None)
        pgtest_env.pop("NEON_DATABASE_URL", None)
        command(["npx", "--no-install", "tsx", "scripts/prescription-postgres-integration.ts", str(socket_dir)],
                cwd=source, env=pgtest_env)
        migration_env = clean_environment()
        migration_env["DATABASE_URL"] = (private / "migration-url").read_text()
        # Brand-new database on a brand-new instance only. Never a production migration.
        command(["npx", "--no-install", "drizzle-kit", "push", "--force"], cwd=source, env=migration_env)
        # Execute reviewed Rx scripts sequentially; each script owns its BEGIN/COMMIT.
        migrations = [
            "prescription-schema.sql", "prescription-directory-schema.sql",
            "prescription-release-schema.sql", "prescription-release-preflight.sql",
        ]
        for filename in migrations:
            command(["node", str(TOOLS / "migrate.mjs"), str(workspace), str(pathlib.Path(args.materials).resolve() / "migrations" / filename)])
        command(["node", str(TOOLS / "database.mjs"), "seed", str(workspace)])
        step("configure new staging identity, private bucket and secrets")
        cloud("iam", "service-accounts", "create", name, "--display-name=Synthetic prescription staging")
        cloud("projects", "add-iam-policy-binding", PROJECT, "--member=serviceAccount:" + state["service_account"],
              "--role=roles/cloudsql.client", "--condition=None")
        cloud("storage", "buckets", "create", "gs://" + state["bucket"], "--location=" + region,
              "--uniform-bucket-level-access", "--public-access-prevention")
        role = "cliniq_rx_pdf_" + nonce
        cloud("iam", "roles", "create", role, "--title=Synthetic prescription PDF create and read",
              "--permissions=storage.objects.create,storage.objects.get", "--stage=GA")
        cloud("storage", "buckets", "add-iam-policy-binding", "gs://" + state["bucket"],
              "--member=serviceAccount:" + state["service_account"], "--role=projects/" + PROJECT + "/roles/" + role)
        db_binding = secret(name + "-database", private / "app-url")
        session_binding = secret(name + "-session", private / "session")
        catalog_binding = secret(name + "-catalog", private / "catalog.json")
        secret(name + "-admin", private / "admin-password", runtime=False)
        secret(name + "-accounts", private / "accounts.json", runtime=False)
        state["accounts_secret"] = name + "-accounts"
        step("build immutable staging image")
        cloud("artifacts", "repositories", "create", name, "--repository-format=docker", "--location=" + region)
        tag = region + "-docker.pkg.dev/" + PROJECT + "/" + name + "/app:synthetic"
        cloud("builds", "submit", str(source), "--tag=" + tag, "--region=" + region)
        digest = cloud("artifacts", "docker", "images", "describe", tag, "--format=value(image_summary.digest)", capture=True)
        if not digest.startswith("sha256:"):
            raise RuntimeError("Could not verify staging image digest")
        state["image"] = tag.split(":")[0] + "@" + digest
        private_write(workspace / "state.json", json.dumps(state, indent=2))
        step("deploy separate private staging service; synthetic signing only")
        cloud("run", "deploy", name, "--region=" + region, "--image=" + state["image"],
              "--service-account=" + state["service_account"], "--add-cloudsql-instances=" + state["connection_name"],
              "--no-allow-unauthenticated", "--port=8080", "--memory=1Gi", "--cpu=1", "--max-instances=1", "--timeout=300",
              "--set-env-vars=NODE_ENV=production,PRESCRIPTION_SIGNING_APPROVED=true,PRESCRIPTION_PDF_BUCKET=" +
              state["bucket"] + ",PRESCRIPTION_NONCONTROLLED_CATALOG_PATH=/var/run/secrets/prescription/catalog.json",
              "--set-secrets=DATABASE_URL=" + db_binding + ",SESSION_SECRET=" + session_binding +
              ",/var/run/secrets/prescription/catalog.json=" + catalog_binding,
              "--labels=purpose=cliniq-prescription-staging,synthetic-only=true")
        member_type = "serviceAccount:" if account.endswith(".gserviceaccount.com") else "user:"
        cloud("run", "services", "add-iam-policy-binding", name, "--region=" + region,
              "--member=" + member_type + account, "--role=roles/run.invoker")
        state["staging_url"] = cloud("run", "services", "describe", name, "--region=" + region, "--format=value(status.url)", capture=True)
        private_write(workspace / "state.json", json.dumps(state, indent=2))
        http_proxy = subprocess.Popen(["gcloud", "--project=" + PROJECT, "run", "services", "proxy", name,
                                       "--region=" + region, "--port=" + str(state["http_proxy_port"])],
                                      stdout=log, stderr=log, env=clean_environment())
        processes.append(http_proxy)
        wait_port(state["http_proxy_port"], http_proxy)
        step("test actual HTTP signing and private GCS PDFs")
        command(["node", str(TOOLS / "probe.mjs"), str(workspace)])
        command(["node", str(TOOLS / "database.mjs"), "assert", str(workspace)])
        doc = json.loads((workspace / "database-results.json").read_text())
        key = doc["storageKey"]
        if not key.startswith("clinics/") or ".." in key:
            raise RuntimeError("Unexpected staging storage namespace")
        cloud("storage", "cp", "gs://" + state["bucket"] + "/" + key, str(workspace / "object-readback.pdf"))
        if hashlib.sha256((workspace / "object-readback.pdf").read_bytes()).hexdigest() != doc["storedSha256"]:
            raise RuntimeError("Independent actual GCS read-back digest mismatch")
        step("test actual upload failure without modifying any stored PDF")
        broken_bucket = True
        cloud("run", "services", "update", name, "--region=" + region,
              "--update-env-vars=PRESCRIPTION_PDF_BUCKET=" + state["bucket"] + "-intentionally-missing")
        command(["node", str(TOOLS / "probe.mjs"), str(workspace), "upload-failure"])
        cloud("run", "services", "update", name, "--region=" + region,
              "--update-env-vars=PRESCRIPTION_PDF_BUCKET=" + state["bucket"])
        broken_bucket = False
        command(["node", str(TOOLS / "database.mjs"), "assert", str(workspace)])
        after = metadata_json(cloud("run", "services", "describe", "hormonehealthai", "--region=" + region,
                                    "--format=json(id,name,region,location,metadata.name,metadata.labels,status.traffic,status.latestReadyRevisionName)",
                                    capture=True), "Production post-staging verification")
        validate_production_metadata(after, region, PRODUCTION_REVISION)
        if after != before:
            raise RuntimeError("Production metadata changed during staging; investigate without changing production")
        state["actual_http_storage_tests_passed"] = True
        state["browser_journey_tested"] = False
        private_write(workspace / "state.json", json.dumps(state, indent=2))
        print("ACTUAL STAGING HTTP/STORAGE CHECKS PASSED. Browser journey still needs verification.")
        print("Private staging URL:", state["staging_url"])
        print("Staging login credentials: Secret Manager", state["accounts_secret"], "(do not print or paste).")
        print("Results and production traffic snapshot:", workspace)
        # Keep the evidence and protected operator log, not unnecessary local secret copies.
        for filename in ("admin-password", "app-password", "pgtest-password", "session",
                         "migration-url", "app-url", "accounts.json", "catalog.json", "signature"):
            (private / filename).unlink(missing_ok=True)
    except Exception as error:
        detail = sanitize(f"{type(error).__name__}: {error}")
        command.note("STOPPED phase: " + phase)
        command.note("FAILURE: " + detail)
        print("STOPPED at:", phase, file=sys.stderr)
        print("Command/context:", command.last_command or "Python staging preparation", file=sys.stderr)
        print("Reason:", detail, file=sys.stderr)
        print("No production write or destructive cleanup was attempted. Keep created staging resources for diagnosis.", file=sys.stderr)
        print("Private workspace:", workspace, file=sys.stderr)
        raise SystemExit(1)
    finally:
        if broken_bucket and state.get("service"):
            try:
                cloud("run", "services", "update", state["service"], "--region=" + state["region"],
                      "--update-env-vars=PRESCRIPTION_PDF_BUCKET=" + state["bucket"])
            except Exception:
                print("Staging bucket binding restoration failed; restore using state.json, never production.", file=sys.stderr)
        for process in reversed(processes):
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        log.close()


if __name__ == "__main__":
    main()
