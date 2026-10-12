// Runs only against a newly created staging instance through a local auth proxy.
// No application/storage import, environment .env loading, or production DSN.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";

const [mode, workspace] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path.join(workspace, "state.json")));
if (!/^cliniq-rx-stage-[a-z0-9-]+$/.test(state.instance) ||
    !/^rx_stage_[a-z0-9_]+$/.test(state.database) ||
    state.project !== "realign-lab-app") throw new Error("Non-staging target refused");
const require = createRequire(path.join(workspace, "source/package.json"));
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const privateFile = name => path.join(workspace, "private", name);
const read = name => fs.readFileSync(privateFile(name), "utf8").trim();
const write = (name, data) => fs.writeFileSync(privateFile(name), data, { mode: 0o600 });
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const ident = value => '"' + value.replaceAll('"', '""') + '"';
const connection = database => ({
  host: "127.0.0.1", port: state.sql_proxy_port, database,
  user: "postgres", password: read("admin-password"), ssl: false,
});
let client;
try {
  client = new Client(connection(mode === "create" ? "postgres" : state.database));
  await client.connect();
  if (mode === "create") {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [state.database]);
    if (existing.rowCount) throw new Error("Refusing to reuse any existing database");
    await client.query(`CREATE DATABASE ${ident(state.database)}`);
    await client.query(`CREATE ROLE ${ident(state.app_role)} LOGIN PASSWORD ${quote(read("app-password"))} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await client.query(`CREATE ROLE cliniq_synthetic_owner LOGIN PASSWORD ${quote(read("pgtest-password"))} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await client.query("GRANT cliniq_synthetic_owner TO postgres");
    await client.query("CREATE DATABASE cliniq_synthetic OWNER cliniq_synthetic_owner");
    const localUrl = new URL(`postgresql://postgres@127.0.0.1:${state.sql_proxy_port}/${state.database}`);
    localUrl.password = read("admin-password");
    write("migration-url", localUrl.toString());
    const appUrl = new URL(`postgresql://${state.app_role}@localhost/${state.database}`);
    appUrl.password = read("app-password");
    appUrl.searchParams.set("host", "/cloudsql/" + state.connection_name);
    write("app-url", appUrl.toString());
  } else if (mode === "seed") {
    const counts = await client.query("SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM patients) AS n");
    if (Number(counts.rows[0].n) !== 0) throw new Error("Refusing to seed a database containing accounts or patients");
    // connect-pg-simple uses "session" (singular), not the ORM's other session models.
    // Precreate as the migration owner; runtime role never gets schema CREATE.
    await client.query('CREATE TABLE IF NOT EXISTS session (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL)');
    await client.query('CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session(expire)');
    const insert = async (table, fields) => {
      const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
      const allowed = new Set(columns.rows.map(c => c.column_name));
      const entries = Object.entries(fields).filter(([key]) => allowed.has(key));
      const q = `INSERT INTO ${ident(table)} (${entries.map(([key]) => ident(key)).join(",")}) VALUES (${entries.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING id`;
      return (await client.query(q, entries.map(([, value]) => value))).rows[0].id;
    };
    await client.query("BEGIN");
    const accounts = {};
    for (const name of ["owner", "provider", "nurse", "outsider"]) {
      const password = randomBytes(32).toString("base64url");
      const username = "rx_synthetic_" + name;
      const id = await insert("users", {
        email: username + "@example.test", username, password_hash: await bcrypt.hash(password, 12),
        first_name: "Synthetic", last_name: name, title: name === "nurse" ? "RN" : "MD",
        clinic_name: "Synthetic staging only", role: name === "owner" ? "admin" : "clinician",
        subscription_status: "active", free_account: true, npi: "1234567893",
        signature_image: read("signature"), user_type: "clinic_admin",
        address: "Synthetic PERSONAL contact - never letterhead", phone: "555-0199",
      });
      accounts[name] = { id, username, password };
    }
    const clinic = await insert("clinics", {
      name: "SYNTHETIC STAGING CLINIC - NOT FOR CLINICAL USE", slug: "rx-synthetic-stage",
      owner_user_id: accounts.owner.id, is_active: true, subscription_status: "active",
      subscription_plan: "suite", max_providers: 4,
      address: "100 Synthetic Business Avenue", phone: "555-0100", fax: "555-0101",
    });
    const other = await insert("clinics", {
      name: "SYNTHETIC OTHER CLINIC", owner_user_id: accounts.outsider.id,
      is_active: true, subscription_status: "active", address: "200 Synthetic Business Avenue", phone: "555-0102",
    });
    for (const [name, actor] of Object.entries(accounts)) {
      const cid = name === "outsider" ? other : clinic;
      await client.query("UPDATE users SET default_clinic_id=$1 WHERE id=$2", [cid, actor.id]);
      await insert("clinic_memberships", {
        clinic_id: cid, user_id: actor.id, role: "provider",
        clinical_role: name === "nurse" ? "rn" : "provider",
        admin_role: name === "owner" || name === "outsider" ? "owner" : "standard",
        access_scope: "full", acceptance_status: "active", is_active: true, is_primary_clinic: true,
      });
    }
    const patient = await insert("patients", {
      first_name: "Synthetic", last_name: "StagingPatient", date_of_birth: "1990-01-01",
      clinic_id: clinic, user_id: accounts.provider.id, clinician_id: accounts.provider.id,
      gender: "female", symptoms: [],
    });
    await client.query("CREATE TABLE cliniq_staging_marker (nonce text PRIMARY KEY, synthetic_only boolean NOT NULL CHECK (synthetic_only))");
    await client.query("INSERT INTO cliniq_staging_marker VALUES ($1,true)", [state.nonce]);
    await client.query(`GRANT CONNECT ON DATABASE ${ident(state.database)} TO ${ident(state.app_role)}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${ident(state.app_role)}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${ident(state.app_role)}`);
    await client.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(state.app_role)}`);
    await client.query("COMMIT");
    write("accounts.json", JSON.stringify({ accounts, patient, clinic, other }));
  } else if (mode === "assert") {
    const marker = await client.query("SELECT synthetic_only FROM cliniq_staging_marker WHERE nonce=$1", [state.nonce]);
    if (marker.rowCount !== 1 || !marker.rows[0].synthetic_only) throw new Error("Staging marker mismatch");
    const sql = "SELECT id,status FROM prescriptions ORDER BY id";
    const rows = (await client.query(sql)).rows;
    const docs = (await client.query("SELECT prescription_id,clinic_id,storage_key,sha256_hash FROM prescription_documents")).rows;
    const download = JSON.parse(fs.readFileSync(path.join(workspace, "download-result.json")));
    const digest = createHash("sha256").update(fs.readFileSync(path.join(workspace, "synthetic-signed.pdf"))).digest("hex");
    if (docs.length !== 1 || rows.filter(r => r.status === "signed").length !== 1 ||
        docs[0].prescription_id !== download.prescriptionId || docs[0].sha256_hash !== digest ||
        download.downloadedSha256 !== digest) throw new Error("Stored document integrity or exactly-once assertion failed");
    if (!new RegExp(`^clinics/${docs[0].clinic_id}/prescriptions/${download.prescriptionId}/`).test(docs[0].storage_key)) throw new Error("Storage clinic namespace mismatch");
    fs.writeFileSync(path.join(workspace, "database-results.json"), JSON.stringify({
      prescriptions: rows, signed_documents: docs.length, storageKey: docs[0].storage_key,
      storedSha256: docs[0].sha256_hash, downloadedSha256: digest,
    }, null, 2));
  } else throw new Error("Unknown database operation");
} catch {
  console.error("Isolated staging database operation failed (" + mode + "); sensitive error details withheld.");
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
