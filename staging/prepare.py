#!/usr/bin/env python3
"""Prepare a private staging copy. Never edits the supplied integration source."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import tempfile
from urllib.parse import urlparse

PATCH_HASH = "085f13a010b77d0769e8b60d97f161ca5c59a2b7c87bef676ece355c4c45681b"
PROJECT = "realign-lab-app"
PRODUCTION_REVISION = "hormonehealthai-00597-guv"
SOURCE_ZIP_HASH = "71bcbb2de8fbb592d0a38eca4eb1cb339f405f24533400b5dd78301fe1f90c0b"
EXCLUDED = {
    ".git", ".agents", ".local", "attached_assets", "generated-artifacts",
    "node_modules", "dist", ".env", "__pycache__", "uploads", "recordings", "backups", ".npmrc",
}
FORBIDDEN = re.compile(
    rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    rb"(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^\s/:]+:[^\s/@]+@|"
    rb"https?://[^\s/]+@|"
    rb"\b(?:sk_live_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{40,}|ghp_[A-Za-z0-9]{20,}|"
    rb"github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[A-Za-z0-9_.-]{20,})|"
    rb'"(?:access_token|refresh_token|client_secret|private_key)"\s*:\s*"[^"]{10,}"'
)


def ignored(_directory, names):
    return [
        name for name in names if name in EXCLUDED or name.startswith(".env")
        or name.endswith((".tar", ".tar.gz", ".zip", ".dump", ".bak", ".pem", ".key"))
        or name.startswith("Pasted-")
    ]


def prepare(source, materials, destination=None):
    source, materials = pathlib.Path(source).resolve(), pathlib.Path(materials).resolve()
    patch = (materials / "prescription-production.patch").read_bytes()
    manifest = json.loads((materials / "manifest.json").read_text())
    if hashlib.sha256(patch).hexdigest() != PATCH_HASH or manifest["sha256"] != PATCH_HASH:
        raise ValueError("Approved prescription candidate checksum mismatch")
    if not source.is_dir():
        raise ValueError("Integrated Cloud Shell source directory is unavailable")
    for entry in manifest["files"]:
        path = source / entry["path"]
        if entry["path"] == ".gcloudignore":
            continue  # This section was explicitly omitted in Cloud Shell.
        if not path.is_file():
            raise ValueError("Integrated release file missing: " + entry["path"])
        if entry["kind"] == "new" and hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError("Reviewed standalone module differs: " + entry["path"])
        if entry["path"].endswith(".sql"):
            sql = materials / "migrations" / pathlib.Path(entry["path"]).name
            if hashlib.sha256(sql.read_bytes()).hexdigest() != entry["sha256"]:
                raise ValueError("Reviewed SQL material differs: " + entry["path"])
    index = (source / "server/index.ts").read_text()
    if re.search(r"await\s+(?:ensureSchema|cleanupObjectObjectChartEntries)\s*\(", index):
        raise ValueError("Automatic startup mutation is still present")
    schema = (source / "shared/schema.ts").read_text()
    clinic = schema.split('export const clinics = pgTable("clinics"', 1)[1].split("});", 1)[0]
    for field in ("phone", "address", "fax"):
        if not re.search(r'\b' + field + r'\s*:', clinic):
            raise ValueError("Canonical clinic field missing: " + field)
    parent = pathlib.Path(destination) if destination else pathlib.Path(tempfile.mkdtemp(prefix="cliniq-rx-stage-"))
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    parent.chmod(0o700)
    target = parent / "source"
    if target.exists():
        raise ValueError("Refusing to overwrite an existing staging copy")
    # Do not dereference arbitrary source symlinks into uploaded/private data.
    for path in source.rglob("*"):
        if path.is_symlink() and not any(part in EXCLUDED for part in path.relative_to(source).parts):
            raise ValueError("Review source symlink before uploading: " + str(path.relative_to(source)))
    shutil.copytree(source, target, ignore=ignored)
    for path in target.rglob("*"):
        if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".mjs", ".json", ".sql", ".md", ".yaml", ".yml"}:
            if FORBIDDEN.search(path.read_bytes()):
                raise ValueError("Potential sensitive literal in upload file: " + str(path.relative_to(target)))
    lock_path = target / "package-lock.json"
    lock = json.loads(lock_path.read_text())
    for package in lock.get("packages", {}).values():
        if "replit" in (urlparse(package.get("resolved", "")).hostname or "").lower():
            raise ValueError("Private registry URL remains; use the already-corrected Cloud Shell lockfile")
    additional = "\n".join([
        ".git/", ".agents/", ".local/", "attached_assets/", "generated-artifacts/",
        "node_modules/", ".env", ".env.*", "**/*.pem", "**/*.key",
        "**/*.zip", "**/*.tar", "**/*.tar.gz", "**/*.dump", "**/*.bak", "",
    ])
    for name in (".gcloudignore", ".dockerignore"):
        path = target / name
        existing = path.read_text() if path.exists() else ""
        path.write_text(existing.rstrip() + "\n" + additional)
    if not (target / "Dockerfile").is_file():
        raise ValueError("Actual integrated source needs its reviewed Dockerfile")
    plan = {
        "project": PROJECT, "expected_production_revision": PRODUCTION_REVISION,
        "user_verified_source_zip_sha256": SOURCE_ZIP_HASH,
        "approved_patch_sha256": PATCH_HASH, "integration_source": str(source),
        "private_copy": str(target), "production_database": "realdata",
        "production_instance": "realign-app", "production_service": "hormonehealthai",
        "existing_candidate_instance_reused": False,
        "production_source_independently_verified_here": False,
        "cloud_operations_executed": False,
    }
    (parent / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    return parent


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--materials", required=True)
    parser.add_argument("--destination")
    args = parser.parse_args()
    try:
        print(prepare(args.source, args.materials, args.destination))
    except (ValueError, OSError, KeyError, IndexError) as error:
        raise SystemExit(str(error))
