import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { getTableColumns } from "drizzle-orm";
import { finalizePrescription, prescriptionReviewHash, type SigningDependencies, type SigningTransaction } from "../server/prescription-finalization";
import { generatePrescriptionPdf } from "../server/prescription-pdf";
import { syntheticSignature } from "../tests/unit/prescription-fixtures";

const socket = process.argv[2];
assert(socket?.startsWith("/tmp/cliniq-rx-pg.") && !socket.includes(".."), "Fresh isolated socket required");
const pool = new pg.Pool({ host: socket, port: 5432, user: "cliniq_synthetic_owner", database: "cliniq_synthetic", ssl: false, max: 6 });
const db = drizzle(pool, { schema });
let passed = 0;
const check = async (name: string, run: () => Promise<void>) => {
  await run(); passed++; console.log(`PASS ${name}`);
};
try {
  const identity = await pool.query("select current_database() as name");
  assert.equal(identity.rows[0].name, "cliniq_synthetic");
  await pool.query("CREATE TABLE users(id integer PRIMARY KEY); CREATE TABLE clinics(id integer PRIMARY KEY, name text)");
  for (const script of ["prescription-schema.sql", "prescription-directory-schema.sql", "prescription-release-schema.sql"]) {
    await pool.query(readFileSync(`server/${script}`, "utf8"));
    await pool.query(readFileSync(`server/${script}`, "utf8")); // Idempotent on an isolated known schema.
  }
  const stored = new Map<string, Buffer>();
  let failUpload = false, failAudit = false, uploads = 0;
  const signer = { userId: 7, clinicId: 10, name: "Synthetic Provider", title: "MD", npi: "1234567890",
    license: "SYNTHETIC-ONLY", licenseState: "MS", signatureImage: syntheticSignature };
  const deps: SigningDependencies = {
    transaction: run => db.transaction(async tx => {
      const adapter: SigningTransaction = {
        async lockPrescription(id, clinicId) {
          const [rx] = await tx.select().from(schema.prescriptions)
            .where(and(eq(schema.prescriptions.id, id), eq(schema.prescriptions.clinicId, clinicId)))
            .limit(1).for("update");
          return rx ?? null;
        },
        async authorizeSigner() { return signer; },
        async getDocument(id) {
          const [doc] = await tx.select().from(schema.prescriptionDocuments)
            .where(eq(schema.prescriptionDocuments.prescriptionId, id)).limit(1);
          return doc;
        },
        async getPdfContext() { return { clinicName: "Synthetic Clinic", clinicAddress: "100 Example Clinic Avenue",
          clinicPhone: "555-0100", patientName: "Synthetic Patient", patientDob: "1990-01-01" }; },
        async commitDocument(rx, actor, signedAt, object) {
          const [doc] = await tx.insert(schema.prescriptionDocuments).values({
            prescriptionId: rx.id, clinicId: rx.clinicId, ...object, signedByUserId: actor.userId, signedAt,
          }).returning();
          await tx.update(schema.prescriptions).set({ status: "signed", signedAt, signedByUserId: actor.userId })
            .where(eq(schema.prescriptions.id, rx.id));
          if (failAudit) throw new Error("Synthetic audit failure");
          await tx.insert(schema.prescriptionAuditEvents).values({
            prescriptionId: rx.id, clinicId: rx.clinicId, actorUserId: actor.userId, action: "signed",
          });
          return doc;
        },
      };
      return run(adapter);
    }),
    classify: () => ({ noncontrolled: true, sourceReference: "SYNTHETIC TEST ONLY" }),
    generatePdf: generatePrescriptionPdf,
    async storePdf(clinicId, id, pdf) {
      if (failUpload) throw new Error("Synthetic upload failure");
      await new Promise(resolve => setTimeout(resolve, 50)); // Overlap concurrent transactions.
      const key = `clinics/${clinicId}/prescriptions/${id}/${randomUUID()}/signed.pdf`;
      uploads++; stored.set(key, Buffer.from(pdf));
      const hash = createHash("sha256").update(pdf).digest("hex");
      assert.equal(createHash("sha256").update(stored.get(key)!).digest("hex"), hash);
      return { storageKey: key, sha256Hash: hash };
    },
    now: () => new Date(),
  };
  const draft = async () => {
    const [rx] = await db.insert(schema.prescriptions).values({
      clinicId: 10, patientId: 20, prescriberUserId: 7, createdByUserId: 7,
      medicationName: "Synthetic Medication", strength: "10 mg", dosageForm: "tablet",
      sig: "Synthetic directions only", quantity: "30", refills: 0, status: "draft",
    }).returning();
    return rx;
  };
  await check("review SQL matches ORM column names and types for all prescription tables", async () => {
    const tables = [schema.prescriberCredentials, schema.prescriptionBatches, schema.prescriptionPharmacies,
      schema.prescriptions, schema.prescriptionDocuments, schema.prescriptionTransmissions,
      schema.prescriptionAuditEvents, schema.prescriberCredentialAuditEvents,
      schema.prescriptionMedicationTemplates, schema.prescriptionMedications, schema.prescriptionSigs];
    const normalize = (type: string) => type.toLowerCase().replace(/^serial$/, "integer")
      .replace(/^varchar\(\d+\)$/, "character varying").replace(/^timestamp$/, "timestamp without time zone");
    for (const table of tables) {
      const { getTableName } = await import("drizzle-orm");
      const columns = await pool.query("select column_name,data_type,character_maximum_length,is_nullable from information_schema.columns where table_schema='public' and table_name=$1", [getTableName(table)]);
      for (const column of Object.values(getTableColumns(table))) {
        const actual = columns.rows.find(row => row.column_name === column.name);
        assert(actual, `${getTableName(table)}.${column.name} missing`);
        assert.equal(normalize(column.getSQLType()), actual.data_type, `${getTableName(table)}.${column.name} type`);
        const length = /^varchar\((\d+)\)$/.exec(column.getSQLType())?.[1];
        if (length) assert.equal(Number(length), actual.character_maximum_length, column.name);
        assert.equal(column.notNull ? "NO" : "YES", actual.is_nullable, `${getTableName(table)}.${column.name} nullability`);
      }
    }
  });
  await check("review scripts are repeatable on a fresh isolated PostgreSQL schema", async () => {
    const constraints = await pool.query("select indexdef from pg_indexes where tablename='prescription_documents'");
    assert(constraints.rows.some(row => /UNIQUE.*\bprescription_id\b/.test(row.indexdef)));
  });
  await check("real row locks serialize concurrent signing into one upload/document/audit", async () => {
    const rx = await draft(); const hash = prescriptionReviewHash(rx);
    const results = await Promise.all([finalizePrescription(rx.id, 10, hash, deps), finalizePrescription(rx.id, 10, hash, deps)]);
    assert.equal(results[0].documentId, results[1].documentId); assert.equal(uploads, 1);
    const docs = await db.select().from(schema.prescriptionDocuments);
    assert.equal(docs.length, 1);
    assert.equal(createHash("sha256").update(stored.get(docs[0].storageKey)!).digest("hex"), docs[0].sha256Hash);
    assert.equal((await db.select().from(schema.prescriptionAuditEvents)).length, 1);
  });
  await check("failed upload leaves a draft without a document", async () => {
    const rx = await draft(); failUpload = true;
    await assert.rejects(finalizePrescription(rx.id, 10, prescriptionReviewHash(rx), deps));
    failUpload = false;
    const [row] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, rx.id));
    assert.equal(row.status, "draft");
    assert.equal((await db.select().from(schema.prescriptionDocuments).where(eq(schema.prescriptionDocuments.prescriptionId, rx.id))).length, 0);
  });
  await check("audit failure rolls back signed state and document; retry is safe", async () => {
    const rx = await draft(); failAudit = true;
    await assert.rejects(finalizePrescription(rx.id, 10, prescriptionReviewHash(rx), deps));
    failAudit = false;
    const [row] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, rx.id));
    assert.equal(row.status, "draft");
    assert.equal((await db.select().from(schema.prescriptionDocuments).where(eq(schema.prescriptionDocuments.prescriptionId, rx.id))).length, 0);
    const result = await finalizePrescription(rx.id, 10, prescriptionReviewHash(rx), deps);
    assert.equal(result.status, "signed"); // Unreferenced synthetic object remains inaccessible.
  });
  await check("cross-clinic document and SIG references are rejected by PostgreSQL", async () => {
    const rx = await draft();
    await assert.rejects(db.insert(schema.prescriptionDocuments).values({
      prescriptionId: rx.id, clinicId: 11, storageKey: "SYNTHETIC", sha256Hash: "a".repeat(64), signedAt: new Date(), signedByUserId: 7,
    }));
    const [med] = await db.insert(schema.prescriptionMedications).values({
      clinicId: 10, medicationName: "Synthetic Medication", strength: "10 mg", dosageForm: "tablet", identityKey: "b".repeat(64),
    }).returning();
    await assert.rejects(db.insert(schema.prescriptionSigs).values({
      clinicId: 11, medicationId: med.id, sig: "Synthetic SIG", identityKey: "c".repeat(64), createdByUserId: 7,
    }));
  });
  console.log(`${passed} isolated PostgreSQL checks passed. Storage was an in-memory test double, NOT GCS.`);
} finally { await pool.end(); }
