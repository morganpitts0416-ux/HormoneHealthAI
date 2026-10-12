"""Local safety tests only; no Google Cloud resources or application test claims."""
import base64
import hashlib
import importlib.util
import json
import os
import pathlib
import struct
import tempfile
import unittest
import zlib
from unittest.mock import patch
import prepare
import run


class PreparationSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.source, self.materials = self.root / "integrated", self.root / "materials"
        self.source.mkdir()
        self.materials.mkdir()
        self.put("server/index.ts", "// reviewed readonly startup\n")
        self.put("server/prescription-routes.ts", "// reviewed module\n")
        self.put("shared/schema.ts", 'export const clinics = pgTable("clinics", { phone: x, address: x, fax: x });')
        self.put("package-lock.json", '{"packages":{"":{"version":"1.0.0"}}}')
        self.put("Dockerfile", "FROM node:20-alpine\nRUN apk add --no-cache ffmpeg\n")
        self.put(".dockerignore", "dist/\n")
        self.patch_bytes = b"synthetic fixture patch, NOT a prescription release\n"
        self.digest = hashlib.sha256(self.patch_bytes).hexdigest()
        (self.materials / "prescription-production.patch").write_bytes(self.patch_bytes)
        self.manifest = {"sha256": self.digest, "files": [
            {"path": "server/prescription-routes.ts", "kind": "new",
             "sha256": hashlib.sha256((self.source / "server/prescription-routes.ts").read_bytes()).hexdigest()},
            {"path": ".gcloudignore", "kind": "modified", "sha256": "unused"},
        ]}
        self.save_manifest()
        self.hash_patch = patch.object(prepare, "PATCH_HASH", self.digest)
        self.hash_patch.start()

    def tearDown(self):
        self.hash_patch.stop()
        self.temp.cleanup()

    def put(self, name, text):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def save_manifest(self):
        (self.materials / "manifest.json").write_text(json.dumps(self.manifest))

    def prepare(self):
        return prepare.prepare(self.source, self.materials, self.root / "output")

    def test_never_changes_original_source(self):
        before = {str(p.relative_to(self.source)): p.read_bytes() for p in self.source.rglob("*") if p.is_file()}
        workspace = self.prepare()
        after = {str(p.relative_to(self.source)): p.read_bytes() for p in self.source.rglob("*") if p.is_file()}
        self.assertEqual(before, after)
        self.assertTrue((workspace / "source/.gcloudignore").is_file())
        self.assertEqual((workspace / "source/server/index.ts").read_bytes(), before["server/index.ts"])
        self.assertEqual(workspace.stat().st_mode & 0o777, 0o700)

    def test_uploads_and_environment_excluded(self):
        for name in ("attached_assets/brief.txt", ".env.local", "handoff.tar.gz", "uploads/file.txt", ".npmrc"):
            self.put(name, "synthetic excluded fixture")
        destination = self.prepare() / "source"
        for name in ("attached_assets/brief.txt", ".env.local", "handoff.tar.gz", "uploads/file.txt", ".npmrc"):
            self.assertFalse((destination / name).exists())

    def test_wrong_patch_refused(self):
        (self.materials / "prescription-production.patch").write_text("changed")
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.prepare()

    def test_unreviewed_standalone_module_refused(self):
        self.put("server/prescription-routes.ts", "// unreviewed change")
        with self.assertRaisesRegex(ValueError, "differs"):
            self.prepare()

    def test_missing_canonical_contact_refused(self):
        self.put("shared/schema.ts", 'export const clinics = pgTable("clinics", { fax: x });')
        with self.assertRaisesRegex(ValueError, "Canonical"):
            self.prepare()

    def test_automatic_startup_mutation_refused(self):
        self.put("server/index.ts", "await ensureSchema();")
        with self.assertRaisesRegex(ValueError, "startup mutation"):
            self.prepare()

    def test_literal_sensitive_uri_refused_without_disclosing_it(self):
        value = "postgresql:" + "//" + "fixture-user" + ":" + "fixture-password" + "@example.test/db"
        self.put("server/unreviewed.ts", value)
        with self.assertRaisesRegex(ValueError, "^Potential sensitive literal in upload file: server/unreviewed.ts$"):
            self.prepare()

    def test_private_registry_refused_without_modifying_lock(self):
        original = json.dumps({"packages": {"x": {"resolved": "https://registry.replit.example/x.tgz"}}})
        self.put("package-lock.json", original)
        with self.assertRaisesRegex(ValueError, "Private registry"):
            self.prepare()
        self.assertEqual((self.source / "package-lock.json").read_text(), original)

    def test_public_registry_replit_package_is_allowed(self):
        self.put("package-lock.json", json.dumps({"packages": {
            "node_modules/@replit/test": {"resolved": "https://registry.npmjs.org/@replit/test/-/test-1.0.0.tgz"},
        }}))
        self.assertTrue((self.prepare() / "source/package-lock.json").is_file())

    def test_source_symlink_refused(self):
        (self.source / "outside").symlink_to(self.materials, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.prepare()

    def test_existing_destination_never_overwritten(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, "overwrite"):
            self.prepare()

    def test_material_migration_checksum_required(self):
        self.put("server/prescription-schema.sql", "-- reviewed\n")
        self.manifest["files"].append({"path": "server/prescription-schema.sql", "kind": "new",
                                      "sha256": hashlib.sha256(b"-- reviewed\n").hexdigest()})
        self.save_manifest()
        (self.materials / "migrations").mkdir()
        (self.materials / "migrations/prescription-schema.sql").write_text("-- not reviewed\n")
        with self.assertRaisesRegex(ValueError, "SQL material"):
            self.prepare()

    def test_inherited_credentials_not_forwarded_to_children(self):
        with patch.dict(os.environ, {"DATABASE_URL": "blocked-fixture", "NEON_DATABASE_URL": "blocked-fixture",
                                    "STRIPE_SECRET_KEY": "blocked-fixture", "CLOUDSDK_AUTH_ACCESS_TOKEN": "blocked-fixture",
                                    "PATH": "/example/bin"}):
            clean = run.clean_environment()
        for key in ("DATABASE_URL", "NEON_DATABASE_URL", "STRIPE_SECRET_KEY", "CLOUDSDK_AUTH_ACCESS_TOKEN"):
            self.assertNotIn(key, clean)
        self.assertEqual(clean["PATH"], "/example/bin")

    def test_signature_png_is_valid_synthetic_rgb(self):
        data = base64.b64decode(run.synthetic_signature().split(",")[1])
        self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
        offset, chunks = 8, {}
        while offset < len(data):
            length = struct.unpack(">I", data[offset:offset + 4])[0]
            kind, body = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
            crc = struct.unpack(">I", data[offset + 8 + length:offset + 12 + length])[0]
            self.assertEqual(crc, zlib.crc32(kind + body))
            chunks[kind] = body
            offset += 12 + length
        self.assertEqual(struct.unpack(">II", chunks[b"IHDR"][:8]), (2, 2))
        self.assertEqual(len(zlib.decompress(chunks[b"IDAT"])), 14)


if __name__ == "__main__":
    unittest.main()
