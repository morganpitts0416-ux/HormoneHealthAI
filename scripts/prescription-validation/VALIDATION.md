# Focused prescription PDF / signing validation

Do not expand the recovery project, allocate another SQL instance, repeat the
completed eleven audit windows, reset credentials without approval, or enable
production signing. Use existing instance `cliniq-rx-stage-c73ac1bc32`.

## What the local check actually proves

From the application source root, run
`bash scripts/run-prescription-postgres-integration.sh /absolute/owned/private/evidence-directory`.
The directory must exist and be empty. Omit it for a new private `/tmp` evidence
directory. PostgreSQL binaries, project dependencies and `tsx` must already exist.
This starts a fresh local Unix-socket-only cluster, never uses DATABASE_URL, never
connects to GCP, and removes the local cluster afterward. It does not run schema
changes on development, staging or production databases.

The test uses the actual finalization engine and actual jsPDF generator with a
real PostgreSQL transaction, row lock, document rows and audit rows. It stores
real PDF bytes under an owner-only directory, reopens and hashes them, refuses
exclusive-create overwrite, tests concurrent finalization and PostgreSQL tenant
constraints, a real filesystem write failure, and audit transaction rollback.
All patient/provider/clinic information is synthetic. The signature is a generated
test image, NOT a real provider signature.

Evidence: `synthetic-signed.pdf`, `report.json`, and the referenced private object
files. Independent `pdftotext`, `pdfinfo` and `pdfimages -list` can inspect the
downloaded synthetic sample. Evidence must remain out of Git.

**Limits:** The filesystem adapter is NOT GCS. The synthetic signer adapter is NOT
an authenticated account/HTTP authorization test. This run cannot approve
staging signing, GCS privacy/immutability, actual saved-account signature retrieval,
browser download/print, or production readiness. It is real local integration
evidence, not end-to-end clinical signing validation.

## Shortest safe staging next step

`python3 scripts/prescription-validation/inspect_revision.py`

This makes exactly one read-only `gcloud run revisions describe` call for
`hormonehealthai-00578-7kl` in `realign-lab-app/us-central1`. It captures the reply
privately in memory and outputs only allowlisted identity facts and configuration
states. It never prints environment values, database URLs, secret references,
SDK error bodies or passwords; HTTP/file logging is disabled. Native SDK argument
syntax is tested offline with an unknown-argument sentinel.

The existing test revision belongs to the production-named `hormonehealthai`
service. A tag or revision name is not proof that its database is synthetic.
The tool authorizes no test writes, even when it sees the exact staging socket.
Secret-backed database targets remain unresolved; it does not retrieve payloads.
Absent, contradictory or external targets require review before application
login, seeding, signing, PDF creation or upload attempts.

## After the metadata result

1. If that revision points at production/unknown data, do NOT exercise it. Retain
   existing traffic and configuration. Use only the separately isolated staging
   application path and existing SQL instance.
2. If exact staging identity, existing credentials and synthetic application
   accounts are independently established, reuse them. Do not reset postgres
   merely because a former private workspace was lost.
3. If database initialization/access truly needs the lost administrator
   credential, use the already published approval-gated administrator recovery
   process. Passing reconciliation is NOT approval; do not bypass it.
4. Establish reviewed-source identity, synthetic database/account isolation,
   independently approved synthetic prescriber credentials, saved synthetic
   account signature, clinic contacts, trusted synthetic noncontrolled catalog,
   and private staging-only bucket/IAM. No automatic medication classification,
   faxing, production signing or production changes are authorized.
5. Run the existing `staging/probe.mjs` only with a verified staging state and
   private synthetic account fixtures. Do NOT fabricate its missing original
   workspace or aim it at the production-named service without isolation proof.
   Its existing workflow covers review, authorization, clinic boundaries,
   duplicate signing, failed upload and retrieval. Check the actual resulting
   PDF text/image, immutable object creation and read-back hash, database linkage,
   audit details, download authorization and browser print output.

The probe's former duplicate-signing expectation incorrectly demanded one HTTP 200
and one HTTP 409. The actual engine intentionally permits two HTTP 200 replies for
the same already-committed document. The corrected probe accepts that idempotency
only with the same valid prescription/document linkage; it still requires the
separate database check to prove a single document/audit and now explicitly checks
that an unsigned draft cannot download a signed PDF.

Only mark end-to-end signing PASS after an actual authenticated synthetic
prescription is signed, stored in the private staging bucket, retrieved through
the application, and its content/hash/audit linkage verified. Local filesystem
success and unit tests do not satisfy that gate.
