# ClinIQ prescription release — artifact-only transfer

This branch is a **parentless, release-artifact-only commit**, not an application
checkout and not a replacement for production. Do not merge it into `main`.
Its purpose is to fetch the completed reviewed prescription candidate into
an isolated Cloud Shell workspace for selective production-source integration.

## Approved candidate

- Patch: `prescription-production.patch`
- SHA-256: `085f13a010b77d0769e8b60d97f161ca5c59a2b7c87bef676ece355c4c45681b`
- Size: 411,606 bytes; changes to 48 allowlisted code/test/documentation paths.
- `manifest.json`: comparison baseline, reviewed donor and target-file hashes.
- `verification.json`: completed local tests/builds and their limitations.
- `migrations/`: separate review-only SQL; do not execute automatically.
- `docs/`: original reviewed integration and security instructions.
- `prescription-release-report.html`: self-contained original release report.

The patch was produced against comparison baseline
`320a534de8d95265d535085ef0cf06cf95202577`, not independently verified current
production. The previously prepared report/manifest are intentionally unchanged.
Their statements that a remote push had not yet occurred describe that earlier
verification session; this README records the subsequently approved GitHub
artifact-transfer step.

## Current integration target

The user reports the verified live revision is `hormonehealthai-00597-guv`.
Its production source ZIP, retrieved and verified in Cloud Shell, has SHA-256:

`71bcbb2de8fbb592d0a38eca4eb1cb339f405f24533400b5dd78301fe1f90c0b`

These are user-provided provenance, not an independent GCP verification performed
by Replit. Verify the source ZIP again locally before extracting/copying it.
Do not substitute GitHub `main`, an earlier archive, or this artifact branch.

## Fetch and inspect safely in Cloud Shell

Use a fresh directory so neither the production checkout nor its Git references
are changed:

```sh
release_repo="$(mktemp -d "${TMPDIR:-/tmp}/cliniq-prescription-release.XXXXXX")"
git -C "$release_repo" init -q
git -C "$release_repo" fetch --no-tags \
  https://github.com/morganpitts0416-ux/HormoneHealthAI.git \
  refs/heads/release/cliniq-prescription-20261011

# Compare this SHA to the exact commit reported with the approved delivery.
git -C "$release_repo" rev-parse FETCH_HEAD
git -C "$release_repo" rev-list --count FETCH_HEAD
git -C "$release_repo" ls-tree -r --name-only FETCH_HEAD
git -C "$release_repo" show FETCH_HEAD:README.md

# After confirming the commit and manifest, extract only the release materials.
release_files="$release_repo/materials"
mkdir -m 700 "$release_files"
git -C "$release_repo" archive FETCH_HEAD | tar -x -C "$release_files"
printf '%s  %s\n' \
  085f13a010b77d0769e8b60d97f161ca5c59a2b7c87bef676ece355c4c45681b \
  "$release_files/prescription-production.patch" | sha256sum -c -
```

No password, credential, access token or service-account key should be pasted
into chat. Use the existing approved GitHub authentication flow if required.
The branch must have exactly one reachable commit and only these release files.

## Check conflicts before integrating

Set `PRODUCTION_ZIP` to the already retrieved archive's actual local filename:

```sh
printf '%s  %s\n' \
  71bcbb2de8fbb592d0a38eca4eb1cb339f405f24533400b5dd78301fe1f90c0b \
  "$PRODUCTION_ZIP" | sha256sum -c -
```

Inspect archive paths before extraction. Work only in a fresh private copy of
that verified source, without production credentials or patient data. Set
`ISOLATED_SOURCE` to that copy; do not point it at the running production source:

```sh
git -C "$ISOLATED_SOURCE" apply --check --whitespace=error \
  "$release_files/prescription-production.patch"
```

If any hunk fails, **stop and reconcile its selective prescription changes
against the current source**. Do not use force, `--3way`, `--reject`, replace
whole shared files, downgrade to the comparison baseline, or deploy partial
results. Preserve encounters/transcription, cancellation/subscriptions,
authentication/clinic isolation, clinical orders/PDFs, and canonical
`clinics.phone`/`clinics.address` APIs and consumers.

Only after conflict review and a clean check, apply to the isolated copy:

```sh
git -C "$ISOLATED_SOURCE" apply --whitespace=error \
  "$release_files/prescription-production.patch"
```

Review all resulting shared-file and dependency changes. Inspect the actual
target package/build scripts before running them; do not start the application
against production bindings. In an approved synthetic-only environment, run
the prescription/prescriber tests, legacy order-PDF and relevant clinical/access/
cancellation regressions available in that source, the explicit-private-socket
PostgreSQL harness, and production frontend/backend builds. Follow
`docs/prescription-production-integration.md` for precise isolation/configuration
requirements. The local verification results are not substitutes for tests of
the reconciled current source or real private GCS staging.

## Approval boundaries

This transfer does **not** authorize merging `main`, database migrations,
GCP resource changes/deployment, service restarts, traffic changes, or enabling
live prescription signing. SQL stays review-only. Signing remains disabled
until separately approved.

Retain saved provider signatures, independent credential approval, noncontrolled
eligibility, clinic-shared SIGs, private PDFs and authorization/duplicate/failure
safeguards. Do not expand into controlled-substance prescribing or Spruce faxing.
Complete the separate credential/access/privacy remediation and approved real
GCS staging verification before production activation. Never use personal
provider contacts as the prescription's clinic business letterhead.
