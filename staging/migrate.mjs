// Review scripts run only on the fresh isolated database guarded by run.py.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const [workspace, file] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path.join(workspace, "state.json")));
if (state.project !== "realign-lab-app" || !/^cliniq-rx-stage-[a-z0-9-]+$/.test(state.instance) ||
    !/^rx_stage_[a-z0-9_]+$/.test(state.database)) throw new Error("Production migration refused");
const names = new Set(["prescription-schema.sql", "prescription-directory-schema.sql", "prescription-release-schema.sql", "prescription-release-preflight.sql"]);
if (!names.has(path.basename(file))) throw new Error("Unreviewed migration refused");
const require = createRequire(path.join(workspace, "source/package.json"));
const { Client } = require("pg");
const connectionString = fs.readFileSync(path.join(workspace, "private/migration-url"), "utf8");
const url = new URL(connectionString);
if (url.hostname !== "127.0.0.1" || Number(url.port) !== state.sql_proxy_port ||
    url.pathname !== "/" + state.database || url.username !== "postgres") throw new Error("Non-staging migration DSN refused");
const client = new Client({ connectionString, ssl: false });
try {
  await client.connect();
  if ((await client.query("SELECT current_database() AS name")).rows[0].name !== state.database) throw new Error("Database mismatch");
  await client.query(fs.readFileSync(file, "utf8"));
} catch {
  console.error("Review-approved isolated staging SQL failed; credentials and SQL error details withheld.");
  process.exitCode = 1;
} finally { await client.end(); }
