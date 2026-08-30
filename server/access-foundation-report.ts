import { sql } from "drizzle-orm";
import { db } from "./storage";
import * as schema from "@shared/schema";
import { AUTHORIZATION_FLAG_KEYS, listAuthorizationFlagStatus } from "./access-foundation";

function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : [];
}

export async function seedApprovedShadowFlags() {
  const shadow = new Set([
    "SHADOW_CLINIC_SUBSCRIPTION_AUTHZ",
    "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
    "SHADOW_PATIENT_CLINIC_RELATIONSHIP",
  ]);
  for (const flagKey of AUTHORIZATION_FLAG_KEYS) {
    const enabled = shadow.has(flagKey);
    await db.execute(sql`
      INSERT INTO authorization_feature_flags (flag_key, clinic_id, enabled, reason)
      SELECT ${flagKey}, NULL, ${enabled}, ${enabled ? "Explicit limited approval: shadow comparison only" : "Enforcement and production UX remain disabled"}
      WHERE NOT EXISTS (
        SELECT 1 FROM authorization_feature_flags
        WHERE flag_key = ${flagKey} AND clinic_id IS NULL
      )
    `);
  }
}

export async function prepareFoundationBackfill() {
  await db.execute(sql`
    INSERT INTO clinic_lifecycle_foundation (clinic_id, lifecycle_state, source, needs_review)
    SELECT c.id, 'operational', 'legacy_observation', true
    FROM clinics c
    ON CONFLICT (clinic_id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO clinic_billing_foundation
      (clinic_id, billing_status, stripe_customer_id, stripe_subscription_id, linkage_status, evidence, needs_review)
    SELECT
      c.id,
      COALESCE(c.subscription_status, u.subscription_status, 'unknown'),
      COALESCE(c.stripe_customer_id, u.stripe_customer_id),
      COALESCE(c.stripe_subscription_id, u.stripe_subscription_id),
      CASE
        WHEN c.owner_user_id IS NOT NULL
         AND u.id IS NOT NULL
         AND COALESCE(c.stripe_customer_id, u.stripe_customer_id) IS NOT NULL
         AND COALESCE(c.stripe_subscription_id, u.stripe_subscription_id) IS NOT NULL
        THEN 'candidate'
        ELSE 'unverified'
      END,
      jsonb_build_object('ownerUserId', c.owner_user_id, 'source', 'legacy_observation'),
      true
    FROM clinics c
    LEFT JOIN users u ON u.id = c.owner_user_id
    ON CONFLICT (clinic_id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO access_review_queue
      (category, entity_type, entity_id, clinic_id, reason_code, evidence, preserves_legacy_access)
    SELECT
      'patient_account_without_verified_relationship',
      'patient_portal_account',
      ppa.id::text,
      p.clinic_id,
      CASE WHEN p.clinic_id IS NULL THEN 'PATIENT_CLINIC_MISSING' ELSE 'RELATIONSHIP_NOT_VERIFIED' END,
      jsonb_build_object('legacyPatientId', ppa.patient_id, 'portalAccountActive', ppa.is_active),
      true
    FROM patient_portal_accounts ppa
    JOIN patients p ON p.id = ppa.patient_id
    LEFT JOIN patient_portal_identities ppi ON ppi.legacy_portal_account_id = ppa.id
    LEFT JOIN patient_clinic_relationships pcr
      ON pcr.portal_identity_id = ppi.id
     AND pcr.patient_id = ppa.patient_id
     AND pcr.clinic_id = p.clinic_id
     AND pcr.relationship_status IN ('verified', 'active', 'read_only_historical')
    WHERE pcr.id IS NULL
    ON CONFLICT (category, entity_type, entity_id)
    DO UPDATE SET last_seen_at = NOW(), evidence = EXCLUDED.evidence, preserves_legacy_access = true
  `);
}

export async function generateAccessFoundationReport() {
  const [
    totals,
    assignments,
    patientWithoutRelationship,
    owners,
    billing,
    duplicatePortal,
    shadow,
    reviewCategories,
    flags,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM clinician_staff) AS staff,
        (SELECT count(*)::int FROM patients) AS patients,
        (SELECT count(*)::int FROM clinics) AS clinics,
        (SELECT count(*)::int FROM clinic_memberships) AS memberships,
        (SELECT count(*)::int FROM patient_portal_accounts) AS portal_accounts
    `),
    db.execute(sql`
      SELECT u.id AS user_id, u.default_clinic_id,
             array_remove(array_agg(DISTINCT cm.clinic_id), NULL) AS active_membership_clinics
      FROM users u
      LEFT JOIN clinic_memberships cm ON cm.user_id = u.id AND cm.is_active = true
      GROUP BY u.id, u.default_clinic_id
      HAVING u.default_clinic_id IS NULL
          OR NOT (u.default_clinic_id = ANY(array_remove(array_agg(DISTINCT cm.clinic_id), NULL)))
    `),
    db.execute(sql`
      SELECT q.entity_id::int AS portal_account_id, q.clinic_id, q.reason_code
      FROM access_review_queue q
      WHERE q.category = 'patient_account_without_verified_relationship'
        AND q.status = 'needs_review'
      ORDER BY q.entity_id::int
    `),
    db.execute(sql`
      SELECT c.id AS clinic_id, c.owner_user_id,
             count(cm.id) FILTER (WHERE cm.admin_role = 'owner' AND cm.is_active = true)::int AS active_owner_memberships,
             CASE
               WHEN c.owner_user_id IS NULL THEN 'OWNER_USER_MISSING'
               WHEN u.id IS NULL THEN 'OWNER_USER_NOT_FOUND'
               WHEN count(cm.id) FILTER (WHERE cm.admin_role = 'owner' AND cm.is_active = true) <> 1 THEN 'OWNER_MEMBERSHIP_AMBIGUOUS'
               WHEN bool_or(cm.user_id = c.owner_user_id) IS NOT TRUE THEN 'OWNER_RECORD_MISMATCH'
               ELSE 'verified_candidate'
             END AS owner_status
      FROM clinics c
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN clinic_memberships cm ON cm.clinic_id = c.id
      GROUP BY c.id, c.owner_user_id, u.id
      HAVING c.owner_user_id IS NULL
          OR u.id IS NULL
          OR count(cm.id) FILTER (WHERE cm.admin_role = 'owner' AND cm.is_active = true) <> 1
          OR bool_or(cm.user_id = c.owner_user_id) IS NOT TRUE
      ORDER BY c.id
    `),
    db.execute(sql`
      SELECT clinic_id, billing_status, linkage_status, stripe_customer_id, stripe_subscription_id
      FROM clinic_billing_foundation
      WHERE linkage_status <> 'verified'
      ORDER BY clinic_id
    `),
    db.execute(sql`
      SELECT lower(trim(email)) AS normalized_email, count(*)::int AS account_count,
             array_agg(id ORDER BY id) AS portal_account_ids
      FROM patient_portal_accounts
      GROUP BY lower(trim(email))
      HAVING count(*) > 1
    `),
    db.execute(sql`
      SELECT difference_type, count(*)::int AS count
      FROM authorization_shadow_decisions
      GROUP BY difference_type
      ORDER BY difference_type
    `),
    db.execute(sql`
      SELECT category, reason_code, count(*)::int AS count
      FROM access_review_queue
      WHERE status = 'needs_review'
      GROUP BY category, reason_code
      ORDER BY category, reason_code
    `),
    listAuthorizationFlagStatus(null),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    compatibilityModeAuthoritative: true,
    enforcementApproved: false,
    totals: rows(totals)[0] ?? {},
    usersWhoseClinicAssignmentWouldChange: rows(assignments),
    patientAccountsWithoutVerifiedRelationship: rows(patientWithoutRelationship),
    clinicsWithoutVerifiedOwner: rows(owners),
    clinicsWithoutReliableBillingRelationship: rows(billing),
    duplicateOrAmbiguousPortalIdentities: rows(duplicatePortal),
    shadowDecisionCounts: rows(shadow),
    unresolvedReviewCategories: rows(reviewCategories),
    flags,
  };
  await db.insert(schema.accessBackfillRuns).values({ summary: report, createdBy: "limited-foundation-assessment" });
  return report;
}