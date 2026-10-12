# Prescription code-only integration and launch

## Scope and the single missing source artifact

Donor implementation: `ce7a5e06026429e22fa63f846024088aa3252dcb`, with the
local release hardening described below. The generated patch uses GitHub
`main` commit `320a534de8d95265d535085ef0cf06cf95202577` as its explicit
**comparison baseline, not a claim about the currently running Cloud Run source**.

The one source artifact needed to finish production reconciliation is the
**current verified Cloud Run production source snapshot**, with its package
lock, existing build/start configuration, source checksum, build identifier,
revision and image-digest provenance. Provide code only: no `.git`, `.env`,
uploaded briefs/archives/clinical records, service-account keys or credentials.
Do not infer production provenance from a GitHub branch or use an older
historical cancellation archive unless it is independently confirmed current.

Offline implementation, patch export and synthetic tests are authorized.
Remote push, production database operations, GCP resource/deployment changes,
production traffic and live signing remain separate approvals.

## Export and integrate without overwriting unrelated code

Run in the prepared Replit source:

```sh
python3 scripts/export-prescription-release.py
sha256sum generated-artifacts/prescription-release/prescription-production.patch
```

The exporter is deterministic and allowlisted. It omits uploaded assets,
agent memory, unrelated checkpoint changes, portal/access foundation changes,
and unrelated package scripts. It preserves all comparison-baseline schema
tables and clinic `phone`/`address`, existing clinical-order drawer code and
shared routes, adding only the prescription registration. Startup removes the
broad schema migration and chart-cleanup calls; migrations are operator-run only.

In an isolated working copy of the verified production source:

```sh
# No --3way, --reject, force, or whole-file overwrite.
git apply --check /approved/prescription-production.patch
# Only if the complete check passes and the diff has been approved:
git apply /approved/prescription-production.patch
git diff --check
git diff --stat
```

If the check fails, STOP automatic application—not development. Existing Cloud
Shell prescription files may already be newer than the comparison baseline.
Reconcile the specific files/hunks against the supplied production snapshot:

1. Compare each standalone prescription/prescriber module and test in
   `manifest.json`; retain verified production changes outside this scope.
2. `shared/schema.ts`: add only the prescription section/table definitions and
   required `check`/`foreignKey` imports. Preserve existing clinic `phone` and
   `address` and every encounter, cancellation, order and access definition.
3. `server/routes.ts`: import/register `registerPrescriptionRoutes(app)` once.
   Do not transfer the donor's unrelated authorization/clinical route changes.
4. `server/index.ts`: remove only automatic `ensureSchema()` and chart-cleanup
   startup calls, use `runReadOnlyStartupValidation(validateSchemaDrift)`, retain read-only drift
   checking and existing middleware/start architecture. Carry the prescription
   log policy: redact both response contents and patient/prescription path IDs,
   including case-insensitive route spellings, without changing other workflows.
5. Account settings: add PrescriberCredentialsSettings, independent admin
   verification and prescription directories, navigation/role visibility only.
   Preserve existing clinic contact fields/API, signatures and other settings.
6. Clinical orders: add the prescription tab/dialog/query/mutation wiring only.
   Keep existing orders, facilities, referring-provider display and encounters.
7. Package/lockfile: carry the GCS dependency and patched jsPDF/AutoTable,
   Express and proxy-addr versions. Resolve the lock against the actual target
   package declarations; never import unrelated scripts/toolchain changes.

Produce a new target-specific diff/checksum after reconciliation and test that
exact target. A successfully checked comparison patch is not proof of current
production integration. Do not push donor commits or their local ancestry.

## Reviewed migrations: no startup migration, no chart cleanup

Inspect the target schema first with `server/prescription-release-preflight.sql`.
Use a secure named libpq service configured by the database owner—not a URL
containing a password in a command, document, or chat.

After backup and explicit approval, apply these operations in order:

```sh
psql 'service=approved_prescription_target' -X -v ON_ERROR_STOP=1 \
  -f server/prescription-release-preflight.sql
# Each script contains its own BEGIN/COMMIT transaction.
psql 'service=approved_prescription_target' -X -v ON_ERROR_STOP=1 \
  -f server/prescription-schema.sql
psql 'service=approved_prescription_target' -X -v ON_ERROR_STOP=1 \
  -f server/prescription-directory-schema.sql
psql 'service=approved_prescription_target' -X -v ON_ERROR_STOP=1 \
  -f server/prescription-release-schema.sql
```

Core scripts use IF NOT EXISTS: that is not proof that pre-existing table
definitions match. Resolve preflight findings before application. Review the
release script's constraint changes with the database owner. These commands
are templates; none was executed against an application/production database.
Never run drizzle push, broad prod-migrate.sql, or cleanup automatically.

## Exact runtime configuration

| Configuration | Required value/behavior |
|---|---|
| `PRESCRIPTION_SIGNING_APPROVED` | `false` or absent until separate signing approval |
| `PRESCRIPTION_PDF_BUCKET` | Approved private bucket **name**, never a public URL |
| `PRESCRIPTION_NONCONTROLLED_CATALOG_PATH` | `/var/run/secrets/prescription/catalog.json` (read-only versioned mount) |
| `DATABASE_URL` | Required by this comparison release's storage and read-only startup validator; isolated staging database for staging |
| `SESSION_SECRET` | Approved secret reference, never a literal in source/commands |
| Runtime identity | Dedicated Cloud Run service account using ADC; no downloaded keys |

The approved medication catalog is JSON, not a code change per drug. Exact
normalized medication/strength/form matches are required. Each entry has:
`medicationName`, `strength`, `dosageForm`, `noncontrolled: true`,
`sourceReference`, `reviewedBy`, ISO `reviewedAt` and ISO `expiresAt`.
Unknown, controlled, malformed, duplicate, future-reviewed and expired
formulations fail closed. Directory entries and saved SIGs alone do not confer
signing eligibility. Validate a clinically approved catalog before versioning:

```sh
npx --no-install tsx scripts/validate-prescription-formulary.ts /approved/catalog.json
```

Store that approved, non-patient catalog as a pinned Secret Manager version,
mounted read-only at the path above. Changing a drug only requires a reviewed
catalog version and an approved configuration revision, not application code.
Do not use synthetic fixture medications as the clinical formulary.

Prescriber configuration: provider saves license details and their existing
account signature/NPI. A different active full-access clinic owner/admin
independently reviews and approves them in Account → Prescriber Verification.
Owner self-approval is denied. Approvals bind the reviewed license/NPI/signature
and current membership; changes require re-review. Clinical signing authority
is checked again under transaction-held locks at signing.

Clinic business address/phone are the existing `clinics.address/phone` used by
orders and the verification screen. Never default to provider personal contacts.
The admin must confirm business information before saving from verification.
Old prescription_address/phone columns, if present, are not dropped/backfilled.

Signed PDF retrieval is authenticated `/api/prescriptions/:id/pdf`. It validates
current clinic access, the committed document linkage and SHA-256 before returning
`application/pdf` with `private, no-store`. No public/signed GCS URLs are exposed.
Download and print use the same immutable PDF. An unsuccessful upload/read-back
or database/audit transaction leaves a draft unsigned; private orphans are not
downloadable. Retain orphans/documents; no cleanup/deletion is authorized.

## GCP preparation — operator commands only, not executed

Use values from approved infrastructure metadata, not guessed resource paths.
Use a dedicated **staging service** and isolated database/bucket/secret versions:
do not deploy synthetic configuration onto the production service.

```sh
: "${PROJECT:?}" "${REGION:?}" "${STAGING_SERVICE:?}" "${STAGING_SA:?}" "${BUCKET:?}"
gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT" \
  --location="$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud iam roles create prescriptionPdfRuntime --project="$PROJECT" \
  --title="Prescription PDF create/read" \
  --permissions=storage.objects.create,storage.objects.get --stage=GA
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$STAGING_SA" \
  --role="projects/$PROJECT/roles/prescriptionPdfRuntime"
```

If resources already exist, inspect/reuse the approved configuration rather than
recreating them. Deny public principals. Review location, encryption, retention,
Data Access logging and IAM; do not provision retention locks/lifecycle deletion.
Grant the runtime account Secret Accessor on **specific staging/catalog secrets**
only, and Run Invoker to only approved staging operators. It must have no
production database secret/bucket permissions.

Build the reconciled, allowlisted source with the existing approved Cloud Build
pipeline and Docker/buildpack architecture. Build locally with `npm ci` and
`npm run build`. If the verified pipeline uses the checked-in Dockerfile:

```sh
# Only after source/infrastructure approval. SOURCE_DIR excludes uploads,
# credentials, .git, generated artifacts and all unrelated source snapshots.
gcloud builds submit "$SOURCE_DIR" --project="$PROJECT" --tag="$APPROVED_IMAGE_TAG"
# Resolve CANDIDATE_IMAGE to the resulting verified immutable image digest.
```

Keep `ffmpeg`/transcription architecture and existing build/start behavior.
Confirm `.gcloudignore` and Docker build context exclusions before submission.
Use approved immutable images, not latest tags.

For a new isolated staging service (zero **production** traffic):

```sh
gcloud run deploy "$STAGING_SERVICE" --project="$PROJECT" --region="$REGION" \
  --image="$CANDIDATE_IMAGE" --service-account="$STAGING_SA" --no-allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,PRESCRIPTION_SIGNING_APPROVED=false,PRESCRIPTION_PDF_BUCKET=$BUCKET,PRESCRIPTION_NONCONTROLLED_CATALOG_PATH=/var/run/secrets/prescription/catalog.json" \
  --set-secrets="DATABASE_URL=$STAGING_DB_SECRET:$STAGING_DB_VERSION,SESSION_SECRET=$STAGING_SESSION_SECRET:$STAGING_SESSION_VERSION,/var/run/secrets/prescription/catalog.json=$CATALOG_SECRET:$CATALOG_VERSION"
```

This comparison release reads `DATABASE_URL` for both storage and startup
validation. Confirm that against the actual reconciled production source; if
that source introduces another variable's precedence, bind it to the same
approved isolated database and ensure no alternate production binding exists.
Populate only synthetic staging
accounts/patients after separately approved staging schema setup. Do not copy
production records, credentials, live Stripe/Spruce/email keys or provider
signatures. Existing staging services can deploy a candidate with `--no-traffic
--tag=prescription-review`; a brand-new service has no previous traffic revision,
so do not claim its first revision has zero staging traffic. Neither operation
changes production traffic.

Use `gcloud run services proxy "$STAGING_SERVICE" --project="$PROJECT"
--region="$REGION" --port=8081` for approved authenticated staging access.
No access/identity token needs to be pasted or printed into chat.

Verify real private GCS create-only storage, read-back hash, download/print,
duplicate signing, wrong-clinic denial and upload failure with synthetic data.
This requires separate permission to enable **isolated staging** signing; a
signing-disabled revision does not prove real signing. Confirm logging does not
record patient data, signatures or credentials.

## Production activation and rollback — separate approvals

Before activation: reconcile the current source, complete the urgent credential
rotation/access review, approve migrations and clinical/legal PDF/formulary,
verify real isolated GCS/staging results, record immutable candidate/baseline
digests and capture the **complete** production traffic map and tags.

Deploy an approved production candidate signing-disabled and zero-traffic:

```sh
gcloud run services describe "$PRODUCTION_SERVICE" --project="$PROJECT" \
  --region="$REGION" --format=json > /approved/production-before.json
gcloud run deploy "$PRODUCTION_SERVICE" --project="$PROJECT" --region="$REGION" \
  --image="$CANDIDATE_IMAGE" --no-traffic --tag=prescription-review \
  --update-env-vars=PRESCRIPTION_SIGNING_APPROVED=false
```

Do not inherit staging secrets/database bindings into production or assume the
production config has the bucket/catalog bindings. Review the explicit
production bindings before the candidate operation. Traffic promotion and
`PRESCRIPTION_SIGNING_APPROVED=true` are separate approvals; changing environment
creates another Cloud Run revision. Verify its digest/config/traffic separately.

Rollback: restore the complete captured revision-percent allocation, not an
assumed single 100% revision:

```sh
gcloud run services update-traffic "$PRODUCTION_SERVICE" --project="$PROJECT" \
  --region="$REGION" --to-revisions="$APPROVED_CAPTURED_REVISION_PERCENT_MAP"
```

Restore/remove tags to match the captured baseline after approval. If signing
needs disabling, prepare a separately approved signing-disabled revision.
Retain additive schema, signed PDFs, audit records and drafts. Never roll back
by dropping tables, deleting PDFs, overwriting documents or running chart cleanup.
