"""Real read-only SQL attestation on a disposable local Unix-socket cluster."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from continuation import ATTEMPT, NAME, atomic_json
from prepare import PROJECT
from run import clean_environment

TOOLS = pathlib.Path(__file__).parent.resolve()
PG = TOOLS.parents[1] / "node_modules/pg"


@unittest.skipUnless(shutil.which("initdb") and shutil.which("pg_ctl") and PG.exists(),
                     "Local PostgreSQL/pg unavailable; no external datastore may be substituted")
class DatabaseVerifier(unittest.TestCase):
    def test_actual_sql_empty_created_seeded_and_contamination_refusal(self):
        with tempfile.TemporaryDirectory(prefix="rxverify-") as temporary:
            root = pathlib.Path(temporary)
            data, socket = root / "data", root / "socket"
            socket.mkdir(mode=0o700)
            env = clean_environment()
            def command(argv, **kwargs):
                return subprocess.run(argv, env=env, check=True, capture_output=True, text=True, **kwargs)
            command(["initdb", "-D", str(data), "-U", "postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"])
            command(["pg_ctl", "-D", str(data), "-l", str(root / "postgres.log"),
                     "-o", "-k " + str(socket) + " -h '' -p 5432 -F", "-w", "start"])
            try:
                def sql(database, text):
                    return command(["psql", "-X", "-h", str(socket), "-p", "5432", "-U", "postgres",
                                    "-d", database, "-v", "ON_ERROR_STOP=1", "-c", text])
                state = {"project": PROJECT, "region": "us-central1", "instance": NAME,
                         "database": "rx_stage_" + ATTEMPT, "nonce": ATTEMPT, "app_role": "rx_stage_app_" + ATTEMPT,
                         "connection_name": PROJECT + ":us-central1:" + NAME, "sql_proxy_port": 15432,
                         "synthetic_only": True, "production_writes_authorized": False}
                atomic_json(root / "state.json", state)
                private = root / "private"
                private.mkdir(mode=0o700)
                (private / "admin-password").write_text("synthetic-fixture-only")
                source = root / "source"
                module = source / "node_modules/pg"
                module.mkdir(parents=True)
                (source / "package.json").write_text("{}")
                # Only transport is injected. The actual pg driver and every SQL
                # query execute against this new socket-only cluster, never a DSN.
                wrapper = "const pg=require(" + json.dumps(str(PG)) + "); module.exports={Client:class extends pg.Client{" \
                    "constructor(c){if(c.host!=='127.0.0.1'||c.port!==15432)throw Error('unexpected transport');" \
                    "super({...c,host:" + json.dumps(str(socket)) + ",port:5432});}}};"
                (module / "index.js").write_text(wrapper)
                def verify(stage, ok=True):
                    result = subprocess.run(["node", str(TOOLS / "verify-database.mjs"), str(root), stage],
                                            env=env, capture_output=True, text=True)
                    self.assertEqual(result.returncode == 0, ok, result.stderr)
                    self.assertNotIn("synthetic-fixture-only", result.stderr)
                verify("empty")
                sql("postgres", 'CREATE DATABASE "' + state["database"] + '"')
                sql("postgres", "CREATE DATABASE cliniq_synthetic")
                sql("postgres", 'CREATE ROLE "' + state["app_role"] + '" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION')
                verify("created")
                fixture = {"accounts": {name: {"id": i + 1} for i, name in enumerate(("owner", "provider", "nurse", "outsider"))},
                           "patient": 1, "clinic": 1, "other": 2}
                (private / "accounts.json").write_text(json.dumps(fixture))
                sql(state["database"], """
                    CREATE TABLE users(id int,username text,email text);
                    INSERT INTO users VALUES
                    (1,'rx_synthetic_owner','rx_synthetic_owner@example.test'),
                    (2,'rx_synthetic_provider','rx_synthetic_provider@example.test'),
                    (3,'rx_synthetic_nurse','rx_synthetic_nurse@example.test'),
                    (4,'rx_synthetic_outsider','rx_synthetic_outsider@example.test');
                    CREATE TABLE patients(id int,first_name text,last_name text);
                    INSERT INTO patients VALUES(1,'Synthetic','StagingPatient');
                    CREATE TABLE clinics(id int,name text);
                    INSERT INTO clinics VALUES(1,'SYNTHETIC CLINIC'),(2,'SYNTHETIC OTHER');
                    CREATE TABLE cliniq_staging_marker(nonce text,synthetic_only boolean);
                    INSERT INTO cliniq_staging_marker VALUES('c73ac1bc32',true);
                """)
                verify("seeded")
                verify("created", False)
                sql(state["database"], "INSERT INTO patients VALUES(2,'Unexpected','Fixture')")
                verify("seeded", False)
                sql("postgres", 'ALTER ROLE "' + state["app_role"] + '" CREATEDB')
                verify("seeded", False)
                state["instance"] = "realign-app"
                atomic_json(root / "state.json", state)
                verify("seeded", False)
            finally:
                command(["pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"])
