# ClinIQ prescription release candidate

## Status and authority

This is a **local release candidate**, not a verified production release.
No production database migration, GCP operation, signing activation, traffic
change, GitHub push/merge, or application restart was performed.

The release branch is `release/prescription-readiness-20261011`, created from
`4c216fd22a21ac29b7e86158413167f0c328807a`. That parent is the Replit comparison
baseline **only**, not the production baseline. Use `git log -1` and
`git show --stat` on the final local release commit to identify its exact contents.
Do not deploy the branch wholesale: it includes earlier Replit work.

`bb01c55` is unavailable locally. `af13809aa17132041048473612d0c975888ac29f`
is the earlier prescription handoff integration, not proof of the current
production source. The historically recovered revision
`hormonehealthai-00567-gub` and its externally verified archive also do not prove
the current production revision. A precise production diff is blocked until the
actual approved baseline commit/source and its independent provenance are supplied.

## Code behavior

* Existing draft, fresh review hash, explicit electronic signature, saved
  account signature, private PDF upload/read-back/hash, committed immutable
  document, authenticated download and print paths remain the core workflow.
* Administrators/owners now have **Settings → Prescriber Verification**.
  Access requires current active, accepted, full clinic membership; staff and
  ordinary providers cannot use it. Authorization is checked in the transaction.
* Independent approval/revocation records server date, verifier, source, notes,
  and the reviewed NPI/license snapshot. Owner self-verification is prohibited.
  New approval requires current provider membership, license details/expiry,
  a ten-digit NPI, and an account PNG/JPEG signature. These are application
  validations, NOT automated licensing-board/NPI-registry verification.
* Approval is bound to the reviewed NPI. A changed account NPI cannot sign until
  independently reviewed again. The admin review token binds current license,
  NPI, signature and credential state; changed data yields 409, not blind approval.
  Credential edits invalidate authorization and leave an audit event.
* Prescription letterhead uses separately reviewed clinic business address and
  phone, never the prescriber's personal contact. Legacy account Clinic Information
  values are offered only for explicit review, for an owner whose default clinic
  matches the selected clinic. They are never automatically copied. Missing
  letterhead blocks signing before upload.
* PDF includes clinic name/address/phone, patient identifiers, signing date,
  medication/strength/form, dose/route/frequency, full SIG, quantity/refills,
  prescriber identity/NPI/license and the saved signature. Blank optional structured
  dose/route/frequency display **See SIG**, not inferred instructions.
* Medication/pharmacy directories, formulation-specific clinic-shared SIGs,
  optional save-new-SIG consent, archived-item filtering and legacy favorites are
  retained. A directory entry or shared SIG never establishes signing eligibility.
* Eligibility still requires an explicitly reviewed, unexpired, exact
  name/strength/form match in the separate noncontrolled JSON catalog.
  Controlled and unknown medications remain blocked. No automated controlled
  verification, fax, pharmacy transmission, or eRx is enabled by this release.
* Startup no longer invokes the broad `prod-migrate.sql` reconciliation or chart
  cleanup. Existing metadata drift reporting stays read-only. Operator migrations
  and cleanup require separate approval.
* The route-inventory update is static documentation of prescription authorization
  helpers only. It adds no team-access enforcement flags or middleware.

## Validation and limits

Commands:

```sh
npx vitest run tests/unit/prescription*.test.ts tests/unit/prescriber-verification.test.ts \
  tests/unit/transcript-source.test.ts tests/unit/soap-core-prompt.test.ts \
  tests/unit/*access*.test.ts tests/unit/team-access-*.test.ts
bash scripts/run-prescription-postgres-integration.sh
npm run build
npx tsc --pretty false
```

The PostgreSQL harness creates and removes a fresh private `/tmp` cluster with
only a local Unix socket, explicit test role/database and synthetic rows. It
never uses `DATABASE_URL` or a real patient datastore. It checks all eleven
prescription table column names/types/nullability against the ORM, repeatable
review SQL, actual row-lock concurrency, one document/audit, upload failure,
audit rollback/retry, PDF byte hashes and cross-clinic document/SIG constraints.
Its object store is an in-memory test double: **this is not a real GCS test**.
HTTP unit tests separately exercise actual Express handlers with synthetic
storage, authentication/roles/tenant checks and failure cases.

The browser test intercepts all API requests with synthetic fixtures. It proves
client behavior, not production authentication/database/GCS connectivity.
Physical printer output and external clinical/legal approval are not certified.
Production encounter/transcription/order/cancellation regression remains gated
on reconciling the actual baseline. Unit access/transcript/prompt regressions and
the existing Orders UI are checked, but that is not a production data test.
Existing project-wide TypeScript diagnostics and large Vite chunk warnings must
be reported separately from new diagnostics; a build is not a full type-check.

Local results: **209 tests / 18 files passed**, **six isolated PostgreSQL checks
passed**, **production build passed**, and the synthetic browser journey passed
(including stale-review rejection, failed approval/signing, download and PDF
viewer). Physical printing, actual private GCS, production authentication/data
and the reconciled production regression suite remain unverified.
The candidate and its Replit parent each have **249 TypeScript diagnostics**.
No new diagnostic categories were introduced; three existing missing-specialty
messages now show expanded clinic types because of the added contact fields.
The project-wide type-check still fails.

## Database release gate — SQL is unapplied

1. Independently verify the actual target database and take an approved backup.
2. Inspect `server/prescription-release-preflight.sql` against that target.
   Run aggregate checks only for tables that actually exist. Stop on duplicate
   documents, tenant mismatches, unexpected column types/defaults/constraints.
3. Review a **missing-only** subset of:
   * `server/prescription-schema.sql` — original nine prescription tables.
   * `server/prescription-directory-schema.sql` — medication/SIG directories.
   * `server/prescription-release-schema.sql` — clinic letterhead fields,
     verified NPI, immutable audit snapshot, tenant composite constraints/indexes.
4. Keep the single-document uniqueness invariant. Confirm the new composite
   parent keys and child foreign keys, with validated constraints, match the ORM.
   `IF NOT EXISTS` is not permission to ignore an incorrectly defined existing
   object. Existing objects need inspection, not broad reconciliation.
5. The release SQL does not backfill contacts or approve providers. Historical
   approvals without a verified NPI require independent re-verification.
   Existing audit records are preserved; their missing snapshots are not invented.
6. Obtain explicit approval before applying any SQL to an existing datastore.
   Apply only the inspected subset, with a documented transaction/lock plan.
   Recheck metadata/constraints before starting the candidate.

No patient cleanup, chart normalization, clinical source rewrite, global
`prod-migrate.sql`, or blanket schema push belongs in this release.

## GCS preparation — unverified and not executed

Required application configuration:

* `PRESCRIPTION_SIGNING_APPROVED=false` (or absent) until explicit activation.
* `PRESCRIPTION_PDF_BUCKET` = approved private bucket **name**, not a URL.
* `PRESCRIPTION_NONCONTROLLED_CATALOG_PATH` = immutable/read-only JSON file
  available inside the deployed container. A laptop/Cloud Shell path alone
  does not make the file available to Cloud Run.

Use workload identity/ADC for the Cloud Run service account; no downloaded keys.
Prepare a bucket-scoped custom role with only `storage.objects.create` and
`storage.objects.get`, as required by create-only upload and read-back/download.
Do not grant public access or broad Storage Admin. Confirm uniform bucket-level
access and public access prevention, no allUsers/allAuthenticatedUsers binding,
and organizational restrictions. Listing/deleting objects, changing IAM and
changing retention are not runtime application permissions.

Choose location, encryption/CMEK needs, retention period and any retention lock
with the clinic's compliance owner before creation/configuration. **Do not lock
retention provisionally.** Do not install a bucket-wide lifecycle delete rule:
signed medical records and rolled-back attempts can share a bucket.

Enable/confirm approved GCS Data Access logging and verify authenticated PDF
access appears in the application audit trail and storage logs, without PDF
contents, patient names, signatures, or signed public URLs in logs. Confirm log
retention/IAM and browser `private, no-store` behavior.

Orphan policy: unique attempt UUIDs can leave private objects after a database
rollback. A separately authorized maintenance identity may enumerate candidates,
but the application never exposes unreferenced objects. Any proposed deletion
must (a) meet an approved age/grace/retention/legal-hold policy; (b) compare exact
storage keys against **all committed prescription_documents references** in the
verified database; (c) recheck references immediately before deletion; (d) record
the maintenance action. Missing/inaccessible DB or uncertain references means
STOP, never delete. No cleanup worker or deletion was activated.

Before staging is called verified, independently confirm real GCS private
access, create-only overwrite rejection, exact read-back SHA-256, wrong-tenant
denial, corruption/unavailable-object handling, runtime IAM and access logs
using a separately approved isolated bucket and synthetic documents.
No real GCS operation occurred during local validation.

## Approved noncontrolled formulary

Each JSON array entry must include `medicationName`, `strength`, `dosageForm`,
`noncontrolled: true`, `sourceReference`, `reviewedBy`, ISO `reviewedAt` and
ISO `expiresAt`. The signing classifier exact-matches normalized formulation
identity and refuses unknown/expired/invalid evidence. Review actual products
with an authorized clinician; synthetic test entries are not a clinical catalog.

```sh
npx tsx scripts/validate-prescription-formulary.ts /approved/catalog.json
```

This read-only command verifies schema, per-entry eligibility/expiry, duplicate
formulations and reports the file SHA-256. It does not itself establish clinical
approval. Preserve the approved file/hash, review evidence and expiry owner.
Mount/package only the specifically approved catalog, without patient data,
secrets or account signature files.

## Production reconciliation and packaging

1. Obtain an approved bundle/commit for the missing baseline, or the independently
   verified source archive plus build/source metadata and expected digest.
   Verify those values before extraction. Do not infer the commit from a tarball
   or use Replit main as a substitute.
2. In a separate work area, compare the baseline with the release file manifest.
   Reconcile individual prescription hunks; do not replace shared/schema.ts,
   server/index.ts or account.tsx wholesale. Preserve newer production encounter
   transcription, cancellation, access and lab/order/template changes.
3. Review actual dependency differences: `@google-cloud/storage`, `jspdf`,
   Drizzle/pg and existing React/UI dependencies. No packages/toolchain versions
   were added/upgraded in this release. Carry only required application dependency
   and lockfile changes, not Replit-only test/toolchain/config history.
4. Use the existing approved Cloud Build configuration and standard Node/npm
   process: compatible Node 20/npm, `npm ci`, `npm run build`, and the established
   production start command. Confirm its exact runtime/container before build.
   Do not improvise a different production pipeline because local tooling works.
   If the established pipeline uses buildpacks rather than a Cloud Build config
   file, preserve that independently verified procedure instead; the template
   below is not evidence that a production config file exists.
5. Review the reconciled exact diff, new migration subset, catalog checksum,
   private storage plan and test evidence before any remote push/build/deployment.

## Zero-traffic staging and activation — operator templates only

The following commands are **NOT authorization** and were not executed. Fill all
placeholders only from independently verified GCP metadata after approval.
Never put secret values in these commands or chat.

```sh
# Read-only baseline capture after approved GCP access:
gcloud run services describe "$VERIFIED_SERVICE" --project="$VERIFIED_PROJECT" \
  --region="$VERIFIED_REGION" --format=json
# Preserve the complete current traffic map and exact revision/image digest.
# Confirm project, account, build source, database, service identity and bucket.

# After source reconciliation, package/test approval and verified dependency review:
gcloud builds submit "$APPROVED_RECONCILED_SOURCE_DIR" \
  --project="$VERIFIED_PROJECT" --config="$VERIFIED_EXISTING_BUILD_CONFIG"
# Verify resulting build metadata and immutable image digest; do not use a mutable tag.

# ONLY after staged DB/schema/storage approvals:
# Candidate must use an independently verified isolated database connection, via
# the exact app connection-variable precedence and approved Secret Manager refs.
# Prepare $APPROVED_STAGING_CONFIG_FLAGS with those refs and the reviewed bucket/
# catalog config. Inspect it before execution; do not inherit production DB access.
gcloud run deploy "$VERIFIED_SERVICE" --project="$VERIFIED_PROJECT" \
  --region="$VERIFIED_REGION" --image="$VERIFIED_CANDIDATE_IMAGE_DIGEST" \
  --revision-suffix="$APPROVED_STAGING_SUFFIX" --tag="$APPROVED_STAGING_TAG" \
  --no-traffic --update-env-vars=PRESCRIPTION_SIGNING_APPROVED=false \
  "${APPROVED_STAGING_CONFIG_FLAGS[@]}"
# Independently verify ZERO traffic to the candidate and unchanged production map.
```

Use a protected tagged URL, synthetic identities/patients and isolated storage/
DB only. Verify administrator review, drafts, directories/SIGs, patient/encounter
viewing, saved transcription loading, orders/templates, access and cancellation
against the reconciled baseline. Real GCS finalization tests need separately
approved isolated test configuration; a signing-disabled revision cannot prove
real HTTP signing by merely clicking its disabled button.

Only after staging evidence, independent clinical/legal PDF/formulary approval,
an approved production schema/storage plan and explicit user approval may an
operator prepare activation. Keep signing disabled during first production
rollout. Traffic promotion and signing enablement are separate approval gates.
Changing Cloud Run environment creates a new revision; it is not a hot switch.
Reverify that revision/digest, clinic letterhead, independently approved providers,
catalog availability and expiry, and complete traffic map before any activation.

Rollback: preserve and restore the **complete previously captured traffic map**,
not an assumed 100% split. Remove candidate traffic/tags only after approval.
Disable signing through an approved new revision if necessary. Keep additive
schema and signed documents intact; never drop tables, overwrite signed PDFs,
delete records or clean orphan objects as part of traffic rollback.

## Exact local release file manifest

Application/source:

```text
client/src/components/prescriber-verification-settings.tsx
client/src/pages/account.tsx
server/index.ts
server/prescriber-verification-policy.ts
server/prescriber-verification-routes.ts
server/prescription-pdf.ts
server/prescription-routes.ts
server/prescription-release-preflight.sql
server/prescription-release-schema.sql
server/startup-safety.ts
shared/schema.ts
```

Validation/release preparation:

```text
scripts/prescription-postgres-integration.ts
scripts/run-prescription-postgres-integration.sh
scripts/team-access-route-inventory.ts
scripts/validate-prescription-formulary.ts
tests/unit/prescriber-verification.test.ts
tests/unit/prescription-finalization.test.ts
tests/unit/prescription-routes.test.ts
tests/unit/prescription-startup-safety.test.ts
docs/prescription-release-readiness.md
```

Project memory (not production application changes):

```text
.agents/memory/MEMORY.md
.agents/memory/isolated-postgres-tests.md
.agents/memory/prescription-release-scope.md
```

The uploaded release brief is intentionally excluded from this commit and remains
untracked. Existing prescription core/storage, directories, shared SIGs and
clinical Orders components are already in parent history; this commit completes
their release prerequisites rather than replacing those modules.
