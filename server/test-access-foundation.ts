import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db } from "./storage";
import {
  AUTHORIZATION_FLAG_KEYS,
  listAuthorizationFlagStatus,
  permitsPatientClinicRelationship,
} from "./access-foundation";
import {
  generateAccessFoundationReport,
  prepareFoundationBackfill,
  seedApprovedShadowFlags,
} from "./access-foundation-report";

async function main() {
  assert.equal(
    permitsPatientClinicRelationship(
      { patientId: 10, clinicId: 2, relationshipStatus: "verified" },
      10,
      2,
    ),
    true,
    "verified relationship should authorize only its own patient and clinic",
  );
  assert.equal(
    permitsPatientClinicRelationship(
      { patientId: 10, clinicId: 2, relationshipStatus: "verified" },
      10,
      3,
    ),
    false,
    "a relationship must never authorize another clinic",
  );
  assert.equal(
    permitsPatientClinicRelationship(
      { patientId: 10, clinicId: 2, relationshipStatus: "verified" },
      11,
      2,
    ),
    false,
    "a relationship must never authorize another patient chart",
  );
  assert.equal(
    permitsPatientClinicRelationship(
      { patientId: 10, clinicId: 2, relationshipStatus: "revoked" },
      10,
      2,
    ),
    false,
    "revoked relationships must deny",
  );

  await seedApprovedShadowFlags();
  await prepareFoundationBackfill();
  await prepareFoundationBackfill();

  const tableCheck = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'clinic_lifecycle_foundation',
        'clinic_billing_foundation',
        'authorization_feature_flags',
        'authorization_shadow_decisions',
        'access_backfill_runs',
        'access_review_queue',
        'patient_portal_identities',
        'patient_clinic_relationships'
      )
  `);
  assert.equal((tableCheck.rows[0] as any).count, 8, "all eight additive tables must exist");

  const flags = await listAuthorizationFlagStatus(null);
  assert.equal(flags.length, AUTHORIZATION_FLAG_KEYS.length);
  assert.ok(
    flags.filter((flag) => flag.enforcement).every((flag) => !flag.enabled),
    "all enforcement/production behavior flags must remain disabled",
  );

  const identityCounts = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM patient_portal_identities) AS identities,
      (SELECT count(*)::int FROM patient_clinic_relationships) AS relationships
  `);
  assert.deepEqual(identityCounts.rows[0], { identities: 0, relationships: 0 });

  const idempotence = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM clinic_lifecycle_foundation) AS lifecycle_rows,
      (SELECT count(*)::int FROM clinics) AS clinics,
      (SELECT count(*)::int FROM access_review_queue
       WHERE category = 'patient_account_without_verified_relationship') AS review_rows,
      (SELECT count(*)::int FROM patient_portal_accounts ppa
       JOIN patients p ON p.id = ppa.patient_id) AS eligible_portal_rows
  `);
  const counts = idempotence.rows[0] as any;
  assert.equal(counts.lifecycle_rows, counts.clinics, "lifecycle preparation must be one row per clinic");
  assert.equal(counts.review_rows, counts.eligible_portal_rows, "assessment reruns must not duplicate review items");

  const report = await generateAccessFoundationReport();
  assert.equal(report.compatibilityModeAuthoritative, true);
  assert.equal(report.enforcementApproved, false);

  console.log(JSON.stringify({
    passed: 10,
    crossClinicIsolation: "passed",
    enforcementFlagsDisabled: true,
    identityRowsCreated: 0,
    relationshipRowsCreated: 0,
    additiveTables: 8,
    assessmentIdempotent: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});