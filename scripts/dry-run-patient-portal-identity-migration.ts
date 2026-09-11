import pg from "pg";

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== "--dry-run") {
  console.error("Usage: dry-run-patient-portal-identity-migration.ts --dry-run");
  process.exit(2);
}
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
  console.error("Dry-run migration is restricted to local development.");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  const rows = await client.query(`
    SELECT a.id AS legacy_account_id, lower(trim(a.email)) AS normalized_email,
           a.password_hash, a.is_active, a.patient_id, p.clinic_id, p.user_id,
           m.migration_state, m.credential_compatibility_status,
           (a.patient_id IS NOT NULL AND p.id IS NOT NULL AND p.clinic_id IS NOT NULL) AS owned
    FROM patient_portal_accounts a
    LEFT JOIN patients p ON p.id = a.patient_id
    LEFT JOIN patient_portal_identity_legacy_accounts m ON m.legacy_account_id = a.id
  `);
  const identityRows = await client.query(`
    SELECT lower(trim(i.normalized_email)) AS normalized_email,
           count(DISTINCT i.id)::int AS identity_count,
           count(DISTINCT m.id)::int AS mapping_count,
           max(i.account_status) AS account_status,
           max(i.verification_status) AS verification_status,
           bool_and(v.patient_matches AND v.clinic_matches) AS linkage_valid,
           bool_or(m.migration_state IN ('conflicting','rollback_legacy')) AS has_conflict
    FROM patient_portal_identities i
    LEFT JOIN patient_portal_identity_legacy_accounts m ON m.identity_id = i.id
    LEFT JOIN patient_portal_identity_legacy_linkage_validation v ON v.mapping_id = m.id
    GROUP BY lower(trim(i.normalized_email))
  `);
  const identities = new Map(identityRows.rows.map((r) => [r.normalized_email, r]));
  const groups = new Map<string, any[]>();
  for (const row of rows.rows) {
    const group = groups.get(row.normalized_email) ?? [];
    group.push(row);
    groups.set(row.normalized_email, group);
  }
  const required = [
    "clearly_eligible_single_legacy_account", "same_email_separate_patients_different_clinics",
    "multiple_legacy_accounts_potential_one_person", "shared_family_email", "same_clinic_duplicates",
    "missing_patient_or_clinic", "identity_or_linkage_conflict", "credential_compatibility_unknown",
    "must_remain_legacy_only",
  ];
  const counts: Record<string, number> = Object.fromEntries(required.map((key) => [key, 0]));
  const reasons: Record<string, number> = Object.fromEntries(required.map((key) => [key, 0]));
  const identityEvidence: Array<{ identityCount: number; accountStatus: string | null; verificationStatus: string | null; linkageValid: boolean | null; count: number }> = [];
  for (const group of groups.values()) {
    const first = group[0];
    const identity = identities.get(first.normalized_email);
    if (identity) {
      const evidence = identityEvidence.find((item) =>
        item.identityCount === Number(identity.identity_count)
        && item.accountStatus === (identity.account_status ?? null)
        && item.verificationStatus === (identity.verification_status ?? null)
        && item.linkageValid === (identity.linkage_valid ?? null));
      if (evidence) evidence.count++;
      else identityEvidence.push({
        identityCount: Number(identity.identity_count),
        accountStatus: identity.account_status ?? null,
        verificationStatus: identity.verification_status ?? null,
        linkageValid: identity.linkage_valid ?? null,
        count: 1,
      });
    }
    const clinics = new Set(group.filter((r) => r.clinic_id != null).map((r) => r.clinic_id));
    const clinicCounts = new Map<any, number>();
    for (const row of group) if (row.clinic_id != null) clinicCounts.set(row.clinic_id, (clinicCounts.get(row.clinic_id) ?? 0) + 1);
    const owners = new Set(group.filter((r) => r.user_id != null).map((r) => r.user_id));
    const hashes = new Set(group.filter((r) => r.password_hash).map((r) => r.password_hash));
    const duplicate = group.length > 1;
    const missing = group.some((r) => !r.owned);
    const hasIdentity = !!identity;
    const identityCount = Number(identity?.identity_count ?? 0);
    const mappingCount = Number(identity?.mapping_count ?? 0);
    const identityStateValid = hasIdentity
      && identityCount === 1
      && identity.account_status === "active"
      && identity.verification_status === "verified";
    const linkageCoherent = hasIdentity
      && mappingCount === group.length
      && identity.linkage_valid === true
      && !identity.has_conflict;
    const conflict = hasIdentity && (!identityStateValid || !linkageCoherent);
    const unknownCredential = group.some((r) => !r.password_hash || !r.is_active)
      || hashes.size > 1
      || group.some((r) => r.credential_compatibility_status === "unknown");
    const legacyOnly = missing || conflict || unknownCredential || duplicate || hasIdentity;
    const add = (key: string, condition: boolean) => {
      if (condition) { counts[key]++; reasons[key]++; }
    };
    add("clearly_eligible_single_legacy_account", group.length === 1 && !!first.owned && !!first.password_hash && !!first.is_active && !hasIdentity && !unknownCredential);
    add("same_email_separate_patients_different_clinics", duplicate && clinics.size > 1);
    add("multiple_legacy_accounts_potential_one_person", duplicate);
    add("shared_family_email", duplicate && owners.size === 1);
    add("same_clinic_duplicates", duplicate && [...clinicCounts.values()].some((count) => count > 1));
    add("missing_patient_or_clinic", missing);
    add("identity_or_linkage_conflict", conflict);
    add("credential_compatibility_unknown", unknownCredential);
    add("must_remain_legacy_only", legacyOnly);
  }
  const total = rows.rowCount ?? 0;
  await client.query("ROLLBACK");
  console.log(JSON.stringify({
    mode: "dry-run",
    mutatesDatabase: false,
    sourceRows: total,
    classifications: counts,
    evidence: { reasonCounts: reasons, identityRows: identityRows.rowCount ?? 0, identityEvidence },
  }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error instanceof Error ? error.message : "dry-run failed");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}