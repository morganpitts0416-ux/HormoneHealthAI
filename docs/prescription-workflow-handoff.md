# Prescription workflow integration — approval required before activation

## Source and merge

The Cloud Shell handoff was extracted into an isolated temporary directory and
compared with this repository before editing. Uploaded archive SHA-256:
`4490afc28cb9f5875b22c14d2320ce6623b2be0b1f114f825d15dd8ac1a7ea22`.
This identifies the supplied handoff, not a production deployment or production
source baseline.

Whole-file replacement was deliberately rejected: the handoff's core routes,
schema, dependency manifests, and encounter screen differed from this branch.
Only prescription schema definitions, new prescription modules, the account
credential form, and the patient Orders-tab prescription UI were integrated.
Existing encounter, recording, transcription, SOAP, identity/access foundation,
and cancellation implementations were not replaced.

## Implemented behavior

- Active, full-scope clinic providers/RNs and authorized active nursing staff
  can prepare drafts, batches, saved pharmacies, and medication templates.
- Staff and RN preparation rights do not grant electronic signing authority.
  External reviewers, inactive/removed memberships, and canceled/unpaid/inactive
  clinics are denied. Selected clinic and current user default are verified
  server-side; an invalid explicit selection never falls back.
- Review fetches the current prescription. Signing requires a separate explicit
  confirmation and a SHA-256 review fingerprint. Changing medication,
  directions, quantity, refills, indication, substitution, or pharmacy requires
  another review.
- The current provider must have an active provider membership, independently
  verified and authorized clinic-scoped credentials, an unexpired license,
  a saved PNG/JPEG account signature, and a ten-digit NPI. Signature and provider
  identity are read server-side, never supplied in the signing request.
  Providers cannot self-verify or set their own authorization via credential edits.
- Signing rechecks authority inside a transaction, locks the prescription, and
  creates one document record plus an audit event. Concurrent/retried requests
  from the same signer are idempotent. A signed prescription is not editable.
- PDF generation includes patient identity/DOB/address, medication, directions,
  quantity/refills/substitution, pharmacy details, provider credentials,
  signature, and server signing timestamp. This integration uses existing clinic
  name data; it does not add unrelated clinic address/phone columns.
- PDFs are uploaded create-only to private GCS keys unique to each attempt.
  The exact durable bytes are read back and SHA-256 checked before the transaction
  marks the prescription signed. Upload or DB failure leaves the prescription
  draft. A successful upload followed by DB rollback can leave an unreferenced
  object; a retry uses a different key.
- Download and Print both retrieve the same persisted PDF through authenticated,
  clinic/patient-scoped endpoints. They verify the saved object hash and PDF
  header. There are no public URLs and no regenerated substitute PDF.
- Prescription response bodies and caught error objects are excluded from new
  module logging; the shared request logger redacts prescription/credential
  endpoints.

No pharmacy transmission, automatic Spruce faxing, controlled-substance
verification service, or EPCS workflow was added. The handoff's transmission
table is retained as a dormant definition; there is no sending endpoint.

## Noncontrolled-only policy

An editable `isControlledSubstance: false` field is **not** eligibility evidence.
Signing requires an exact name + strength + dosage-form match in a server-owned,
human-reviewed noncontrolled formulary file. Unknown medications, unreviewed
brands/combinations/compounds, mismatches, and expired/malformed evidence fail
closed. This is a deliberately limited first-release allowlist, not automated
controlled-substance verification.

Each JSON-array entry has this shape (illustration only, **not** a usable catalog):

```json
[
  {
    "medicationName": "<exact reviewed medication name>",
    "strength": "<exact reviewed strength>",
    "dosageForm": "<exact reviewed dosage form>",
    "noncontrolled": true,
    "sourceReference": "<authoritative reference reviewed for applicable jurisdiction>",
    "reviewedBy": "<authorized clinical/formulary reviewer>",
    "reviewedAt": "<ISO-8601 UTC timestamp>",
    "expiresAt": "<ISO-8601 UTC timestamp>"
  }
]
```

Clinical owners must approve the actual catalog and review expiry/jurisdiction
before activation. No usable live medication catalog was supplied or enabled.
The verified license/authorization records also need real independent clinical
review; database flags do not establish legal prescribing authority.

## Pending database changes — not executed

`server/prescription-schema.sql` is an **unapplied, review-only** initial SQL
script generated offline from the newly appended Drizzle definitions. It creates
only these nine prescription tables and their indexes/foreign keys:

1. `prescriber_credentials`
2. `prescription_pharmacies`
3. `prescription_medication_templates`
4. `prescription_batches`
5. `prescriptions`
6. `prescription_documents`
7. `prescription_transmissions` (dormant)
8. `prescription_audit_events`
9. `prescriber_credential_audit_events`

It does not alter existing users, patients, clinics, encounters, or access tables.
The unique document-per-prescription index is essential to duplicate-signing
protection. `CREATE TABLE IF NOT EXISTS` does **not** reconcile an existing table
with different columns: inspect the target database/schema and index definitions
before approving/applying this script. Do not use a broad `db:push` as a substitute.

No script was applied, no database was seeded, and the pending SQL was not added
to normal startup migration execution. Draft APIs require these tables before
they can work against a real database.

**Existing startup hazard:** `server/index.ts` normally executes broad schema
reconciliation and chart cleanup at startup, including development startup.
The running backend was therefore not restarted during this integration.
Any future restart/deployment must account for that existing behavior and obtain
approval first. No unrelated startup refactor was made here.

## Pending storage/environment setup — not configured

Dependency added: `@google-cloud/storage` 7.16.x (Node 20 compatible), locked by
`package-lock.json`. Existing jsPDF is reused.

Required runtime configuration, to be provisioned only after approval:

| Setting | Requirement |
| --- | --- |
| `PRESCRIPTION_PDF_BUCKET` | Name of a verified, private GCS bucket in an approved project/location |
| `PRESCRIPTION_NONCONTROLLED_CATALOG_PATH` | Absolute readable path of the approved, mounted formulary JSON |
| `PRESCRIPTION_SIGNING_APPROVED` | Must remain unset/false until explicit approval; only literal `true` enables the gate |

The GCS client uses application-default credentials. For Cloud Run, use the
verified runtime service account; do not introduce service-account keys into
source or chat. Configure least-privilege object creation and read access to the
designated bucket, uniform bucket access and public-access prevention. The app
does not require delete/overwrite permissions. Confirm organization-approved
PHI handling, retention, encryption, audit logging, and applicable provider/cloud
agreements. Immutable retention policies can be irreversible and require their
own approval.

No GCP authentication, project switch, bucket creation, IAM edit, Cloud Build,
Cloud Run deployment/traffic change, Stripe operation, Git push, or publishing
was performed. No signing environment variable was enabled.

## Verification and limitations

Run the synthetic prescription tests with:

```sh
npx vitest run tests/unit/prescription*.test.ts
```

They exercise the actual HTTP route registration, strict draft/sign inputs,
clinic/user/staff authorization, review hashing, duplicate and concurrent
signing, row-lock use, upload/audit failure rollback, retries, missing signatures,
noncontrolled eligibility, actual PDF generation, stored-byte integrity, and
cross-tenant document rejection.

The route tests use a predicate-evaluating in-memory Drizzle double; concurrency
is serialized by its transaction double. Storage tests mock GCS. Consequently
they do not establish real PostgreSQL lock/timeout behavior, target schema
compatibility, GCS permissions, retention, or real cloud network durability.
Browser verification uses entirely intercepted synthetic API responses, not
real accounts, prescription tables, or live signing.

Before production deployment:

1. Review/approve the narrow schema script against the actual target database.
2. Approve/provision private GCS, runtime identity, retention and formulary file.
3. Apply approved schema changes in isolated staging and exercise real
   PostgreSQL concurrency/rollback plus GCS upload/readback failure behavior
   using synthetic records; verify actual runtime IAM cannot expose objects.
4. Validate clinical PDF content, provider authorization, applicable prescribing
   requirements, and Download/Print on supported browsers.
5. Address pre-existing TypeScript diagnostics or explicitly accept the baseline
   separately; the production bundler passing is not a clean type check.
6. Review an exact release diff preserving transcription/access/cancellation
   changes. Deploy only with approval and keep signing disabled initially.
7. Enable signing only after a separate explicit activation approval.

Unreferenced objects from rolled-back transactions require an approved,
reference-aware reconciliation policy. Never delete signed documents by an
unqualified blanket cleanup rule.

## Verification results

- All **56 synthetic prescription tests** passed across four test files.
- `npm run build` passed, with no undefined-schema-import warnings. The existing
  large-client-bundle warning remains.
- TypeScript still has **249 existing diagnostics**. Comparison with an isolated
  untouched HEAD baseline found no additional diagnostics by file/error code,
  and none in the new prescription modules/tests. This is not a clean type check.
- Synthetic browser verification passed for fresh review, separate explicit
  confirmation, exact sign request, provider-only signing, staff/RN denial,
  disabled signing, signing errors, stored-PDF download and PDF errors.
  Print fetched the same endpoint and opened a PDF blob popup; physical print
  output/native print dialog was not verifiable in automation.
- The public login page still renders. Browser tests opened the draft composer;
  backend route tests verified draft creation without any real database writes.
- Browser verification noticed nonblocking existing/nonspecific nested-button,
  CSP inline-style, and dialog-description warnings. They are not reported as a
  verified clean browser console or a general UI/accessibility audit.

## Exact file ledger

Existing application/configuration files changed:

- `client/src/components/clinical-orders-panel.tsx` — prescription list,
  fresh review, explicit signing, saved PDF download/print, role/configuration
  gates, and clearing review context when the selected patient changes.
- `client/src/pages/account.tsx` — mount the prescriber credential form.
- `server/routes.ts` — import and register the separate prescription router.
- `server/index.ts` — redact prescription/credential response-body logs only;
  startup and transcription behavior were not changed.
- `shared/schema.ts` — append the nine prescription table definitions only.
- `package.json` and `package-lock.json` — add the Node-20-compatible GCS client.

New prescription application files:

- `client/src/components/prescription-dialog.tsx`
- `client/src/components/prescriber-credentials-settings.tsx`
- `server/prescription-routes.ts`
- `server/prescription-finalization.ts`
- `server/prescription-medication-policy.ts`
- `server/prescription-pdf.ts`
- `server/prescription-storage.ts`
- `server/prescription-signing-policy.ts`

New review-only schema script, tests, and documentation:

- `server/prescription-schema.sql` — **not executed**.
- `tests/unit/prescription-finalization.test.ts`
- `tests/unit/prescription-routes.test.ts`
- `tests/unit/prescription-storage.test.ts`
- `tests/unit/prescription-signing-policy.test.ts`
- `tests/unit/prescription-fixtures.ts`
- `tests/unit/prescription-memory-db.ts`
- `docs/prescription-workflow-handoff.md`

Project approval/scope guidance was recorded in
`.agents/memory/prescription-release-scope.md` and linked from
`.agents/memory/MEMORY.md`. The uploaded archive remains an attachment, not an
application source edit. Build/test outputs and temporary comparison/extraction
files were kept outside tracked application source.

## Clinic-shared directory extension

Account Settings now has a **Prescription Directory** for manually creating,
editing, deactivating, and reactivating medication formulations, their shared
SIG directions, and pharmacy contacts. The pharmacy directory reuses the existing
`prescription_pharmacies` table. Search is tenant-filtered in SQL before the
bounded result limit.

Typing a medication searches exact stored name/strength/form entries. Choosing
one fills those identity fields, not a presumed prescribed dose, quantity, or
refill count. Saved SIG selection supplies only the directions and any explicitly
saved structured dose/route/frequency. Editing the full directions clears old
structured defaults to prevent conflicting instructions. Changing medication
identity clears incompatible direction defaults.

After a successful draft save/update, new directions are offered for optional
clinic-shared saving. Declining does not save a SIG. SIG save failure offers
retry/skip while preserving the already saved draft; the draft is not submitted
again. Manually entered medications require explicit consent before catalog
creation, with all three identity fields supplied. Existing catalog formulations
are resolved only by exact normalized name + strength + form, never by name alone.
Duplicate SIG retries return the existing active record.

Shared SIGs are formulation-specific, not interchangeable across different
strengths, salts, or release forms. Changing a catalog formulation's identity
archives its SIGs atomically. Deactivation hides records from normal prescribing
search without deleting historical prescription snapshots. Reactivation of a
medication does not silently reactivate its old directions.

Legacy full-prescription medication templates and their data/endpoints are
retained, but the composer no longer uses a single favorite to fill medication,
SIG, quantity, and refills together. No legacy templates were deleted or
automatically migrated into shared directions.

### Additional unapplied schema

`server/prescription-directory-schema.sql` creates only:

- `prescription_medications` (unique clinic + normalized formulation identity)
- `prescription_sigs` (unique clinic + formulation + normalized SIG identity)

It must be reviewed against the target schema and explicitly approved before
execution. If the original prescription tables are absent, the original
review-only `prescription-schema.sql` is also required. Neither script has been
executed or incorporated into automatic startup migrations. Directories are not
available against a real datastore until the schema is provisioned and the
backend is safely restarted with approval.

Adding a medication to this searchable catalog does **not** approve it for
signing. The separate reviewed noncontrolled catalog and signing gate remain
unchanged. No real medication classifications or pharmacies were seeded.

### Extension files

- `client/src/components/prescription-directory-section.tsx` — new directory UI.
- `client/src/pages/account.tsx` — Settings navigation/integration.
- `client/src/components/prescription-dialog.tsx` — independent medication/SIG
  lookup, explicit post-save SIG prompts, snapshot-safe retry behavior.
- `client/src/lib/prescription-directory.ts` — exact formulation matching.
- `server/prescription-directory-routes.ts` — tenant-scoped directory CRUD,
  deduplication, archival and shared SIG access.
- `server/prescription-routes.ts` — directory registration, pharmacy handler
  delegation, and shared-lock authorization reads.
- `shared/schema.ts` and `server/prescription-directory-schema.sql` — two new
  definitions and unapplied review SQL.
- `tests/unit/prescription-directory.test.ts`,
  `tests/unit/prescription-directory-matching.test.ts`, and
  `tests/unit/prescription-memory-db.ts` — synthetic directory authorization,
  exact identity, shared access, concurrent duplicates, lifecycle and rollback.
- `.agents/memory/prescription-release-scope.md` — user's clinic-shared SIG choice.

The extension's backend/helper checks passed as part of **90 prescription tests
across six test files**. The production build passed. An isolated untouched HEAD
type-check baseline and the candidate each reported the same 249 diagnostics by
file/error code, with no new errors in the directory files. Real database/cloud
integration remains approval-gated, as described above.

The signed-in browser journey also passed with **every API request intercepted
before navigation and fulfilled using synthetic in-memory fixtures**. It covered
directory creation/edit forms, pharmacy and SIG deactivation/reactivation,
keyboard medication selection, formulation and saved-SIG selection, pharmacy
autofill, explicit post-draft SIG consent, formulation isolation, stale SIG editor
clearing, failed SIG saves with safe skip, failed draft saves without a SIG prompt,
and exact formulation resolution for an existing draft without creating a
duplicate catalog entry. No real authentication, records, uploads, signing,
printing, or database writes were used.

Browser caveats: the newly created draft was verified through its response-driven
prompt/toast, not a refreshed prescription list (that fixture initially returned
an empty list). Existing-draft editing used a separate synthetic fixture. The SIG
failure's skip path was exercised; its retry button was not exercised in-browser,
although backend repeated SIG requests were covered by idempotency tests.
