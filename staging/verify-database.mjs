// Read-only attestation through the already-verified staging instance proxy.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const [workspace, stage] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path.join(workspace, "state.json")));
if (state.project !== "realign-lab-app" || state.instance !== "cliniq-rx-stage-c73ac1bc32" ||
    state.database !== "rx_stage_c73ac1bc32" || state.nonce !== "c73ac1bc32" ||
    state.connection_name !== `${state.project}:${state.region}:${state.instance}` ||
    state.synthetic_only !== true || state.production_writes_authorized !== false ||
    !["empty", "created", "seeded"].includes(stage)) throw new Error("Unapproved database attestation target");
const require = createRequire(path.join(workspace, "source/package.json"));
const { Client } = require("pg");
const config = {
  host: "127.0.0.1", port: state.sql_proxy_port, user: "postgres", ssl: false,
  password: fs.readFileSync(path.join(workspace, "private/admin-password"), "utf8").trim(),
};
let client;
try {
  client = new Client({ ...config, database: "postgres" });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const databases = (await client.query("SELECT datname FROM pg_database WHERE NOT datistemplate")).rows.map(r => r.datname);
  const allowed = new Set(["postgres", "cloudsqladmin", ...(stage === "empty" ? [] : [state.database, "cliniq_synthetic"])]);
  if (databases.some(name => !allowed.has(name)) ||
      (stage !== "empty" && ![state.database, "cliniq_synthetic"].every(name => databases.includes(name)))) {
    throw new Error("Database inventory mismatch");
  }
  if (stage !== "empty") {
    const role = (await client.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolcanlogin FROM pg_roles WHERE rolname=$1", [state.app_role])).rows;
    if (role.length !== 1 || !role[0].rolcanlogin ||
        role[0].rolsuper || role[0].rolcreatedb || role[0].rolcreaterole || role[0].rolreplication) {
      throw new Error("App role permissions mismatch");
    }
  }
  await client.query("COMMIT");
  await client.end();
  client = null;
  if (stage !== "empty") {
    client = new Client({ ...config, database: state.database });
    await client.connect();
    await client.query("BEGIN READ ONLY");
    if (stage === "seeded") {
      const accounts = JSON.parse(fs.readFileSync(path.join(workspace, "private/accounts.json")));
      const marker = (await client.query("SELECT nonce,synthetic_only FROM cliniq_staging_marker")).rows;
      const users = (await client.query("SELECT id,username,email FROM users ORDER BY id")).rows;
      const patients = (await client.query("SELECT id,first_name,last_name FROM patients")).rows;
      const clinics = (await client.query("SELECT id,name FROM clinics")).rows;
      if (marker.length !== 1 || marker[0].nonce !== state.nonce || marker[0].synthetic_only !== true ||
          users.length !== 4 || !users.every(user => Object.entries(accounts.accounts).some(([name, a]) =>
            a.id === user.id && user.username === "rx_synthetic_" + name && user.email === user.username + "@example.test")) ||
          patients.length !== 1 || patients[0].id !== accounts.patient || patients[0].first_name !== "Synthetic" ||
          patients[0].last_name !== "StagingPatient" || clinics.length !== 2 ||
          !clinics.every(clinic => [accounts.clinic, accounts.other].includes(clinic.id) && clinic.name.startsWith("SYNTHETIC"))) {
        throw new Error("Synthetic-only fixture attestation failed");
      }
    } else {
      for (const table of ["users", "patients", "clinics"]) {
        const exists = (await client.query("SELECT to_regclass($1) AS name", ["public." + table])).rows[0].name;
        if (exists && (await client.query(`SELECT 1 FROM "${table}" LIMIT 1`)).rowCount) throw new Error("Unjournaled existing data");
      }
    }
    await client.query("COMMIT");
  }
  console.log("Read-only synthetic database attestation passed (" + stage + ").");
} catch {
  console.error("Read-only staging database attestation failed; credentials were not reset. Stop for reconciliation.");
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
