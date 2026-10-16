# Immutable prescription snapshot release

## Implemented boundary

The existing prescription finalizer now commits a versioned signing-time snapshot
and the existing prescription audit event in the same row-locked transaction.
The server requires signing intent, the current reviewed-content hash, an
independently verified authenticated provider, current clinic authority and an
eligible formulation from the reviewed noncontrolled catalog. Saved signature
and clinic logo bytes are validated before persistence. No PDF upload or cloud
storage bucket is required to sign a new snapshot.

The frozen record includes patient, medication, pharmacy, clinic letterhead and
business contacts, prescriber identity/credentials/signature, actual actor ID,
timestamp, authentication statement, classification and review evidence.
Canonical JSON hashing tolerates PostgreSQL JSONB key ordering. A prepared
database trigger prevents signed facts being edited, reopened as drafts or
deleted; cancellations may update only cancellation/status metadata.

The existing Encounters list interleaves prescription batches with SOAP notes.
Each medication opens separately. New batch creation supports an optional
authorized same-patient encounter link or a standalone session. Unsigned drafts
remain in the existing Orders review/edit workflow. SOAP signing, transcription,
medications/refills and automatic transmission are not changed.

## HTML, PDF and historical evidence

Authenticated clinic-scoped HTML and PDF routes use only the verified signed
snapshot. HTML escapes text, allows only embedded PNG/JPEG images and sends a
restrictive CSP and private/no-store headers. No platform letterhead or footer
appears in the formal document. New on-demand PDFs have a snapshot-derived
document ID, signing-time creation date and snapshot hash.

If an existing prescription document is linked, download its original bytes
through the existing tenant/linkage/hash-verified storage path. Never delete
historical documents, hashes or transmissions, and never fabricate a snapshot
for an old signed record using today's account/demographics. Legacy records
without a snapshot offer their preserved PDF, not reconstructed HTML. Original
storage is still required to retrieve historical stored artifacts.

## Prepared migration — not applied to any existing database

`scripts/prescription-snapshot-schema.sql` adds only:

- nullable `prescription_batches.encounter_id`;
- nullable `prescriptions.signed_snapshot`;
- the signed-facts immutability trigger.

Equivalent preparation is in `server/prod-migrate.sql`. No historical data
backfill is performed. Apply the focused script only after separate approval
in an independently verified synthetic staging database. This release does not
authorize startup migrations or change any production approval flag.

## Local verification

```sh
npx vitest run tests/unit/prescription-*.test.ts tests/unit/prescriber-*.test.ts tests/unit/prescription-timeline.test.tsx
bash scripts/run-prescription-postgres-integration.sh
npm run build
```

The PostgreSQL wrapper creates and removes a fresh private Unix-socket cluster;
it never resolves an inherited application database URL. The HTTP integration
suite uses real PostgreSQL, the actual prescription handlers/finalizer/adapter,
and cookie-backed Passport authentication in a synthetic-only login harness.
It does not certify the full application's deployed authentication, browser
printing, cloud networking, or production compliance.

An optional second argument to the shell wrapper is an existing owner-only,
canonical absolute evidence directory for synthetic HTML/PDF files.

## Shortest separately approved staging path

1. Apply the code-only transfer patch to an isolated copy of the independently
   verified current production source. Run `git apply --check` first; resolve
   divergent shared-file hunks selectively, never overwrite newer functionality.
   The package comparison baseline is Replit HEAD, not a production attestation.
2. Independently verify the recovered synthetic-only staging environment and
   approved access. Apply the focused additive SQL there only.
3. Deploy a separate staging service with staging-only resources and enable
   signing only in that synthetic environment. Use a synthetic provider,
   independent credential approver, saved synthetic signature and test catalog.
4. Execute authenticated Create Draft → Review → Sign → HTML → PDF →
   Download/Print in a real browser, including a second clinic, concurrent retry,
   legacy-document retrieval and changed demographics. Keep protected evidence.

No actual deployed staging signing is claimed by the local tests. Production
traffic, databases, signing activation, controlled prescribing and automatic
faxing remain outside this release's authorization.

## Publication

The dedicated parentless patch-transfer branch excludes inherited uploads,
archives, briefs, environment files and private evidence/history. It contains the
implementation patch, hashes/manifest and this runbook, not a complete runnable
application. Do not merge the transfer branch into `main`; selectively integrate
the patch into the authoritative source. Full-project type checking currently
has pre-existing failures; the production build is a separate check.
