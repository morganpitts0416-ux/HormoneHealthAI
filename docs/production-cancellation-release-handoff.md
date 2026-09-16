# Production cancellation release handoff

## Scope and preserved provenance

This handoff is for the owner-scheduled-cancellation release candidate only.
Do not include team-access, patient-identity, schema, migration, environment,
deployment-script, or unrelated development changes.

Preserved cancellation source:

- Branch: `emergency/owner-scheduled-cancellation`
- Initial cancellation commit: `c26e03a` (`Secure owner subscription cancellation`)
- Reconciliation commit: `1aeef94` (`Reconcile confirmed Stripe cancellation outcomes`)
- Expected changed files:
  - `client/src/pages/billing.tsx`
  - `server/audit.ts`
  - `server/routes.ts`
  - `tests/billing-cancellation.test.ts`
  - `tests/unit/billing-cancellation.test.ts`

Production baseline provenance supplied by the release owner:

- Cloud Run service: `hormonehealthai`
- Production revision: `hormonehealthai-00567-gub`
- Production traffic at capture: 100%
- Cloud Build ID: `900afa28-7597-440f-9e5f-f176874dd7cd`
- Baseline image digest:
  `sha256:198655e0d8a3c6e363f81ebb643db59a64f8a3ee515641b9b651befc9dd5779c`
- Expected source archive SHA-256:
  `f68695b50a572cd266f2643029a7a38df2fe2ac9b85b0168fa58b542a47c6742`

Run all commands from an authenticated developer workstation. Set these values
from the existing GCP service rather than guessing:

```sh
export PROJECT_ID='...'
export REGION='...'
export SERVICE='hormonehealthai'
export BUILD_ID='900afa28-7597-440f-9e5f-f176874dd7cd'
export BASELINE_REVISION='hormonehealthai-00567-gub'
export EXPECTED_SOURCE_SHA='f68695b50a572cd266f2643029a7a38df2fe2ac9b85b0168fa58b542a47c6742'
export EXPECTED_IMAGE_DIGEST='sha256:198655e0d8a3c6e363f81ebb643db59a64f8a3ee515641b9b651befc9dd5779c'
gcloud config set project "$PROJECT_ID"
```

## 1. Verify production provenance

Confirm the revision still references the expected digest before using the
baseline:

```sh
gcloud run revisions describe "$BASELINE_REVISION" \
  --region "$REGION" \
  --format='yaml(metadata.name,status.imageDigest,status.conditions,status.observedGeneration)'

test "$(gcloud run revisions describe "$BASELINE_REVISION" \
  --region "$REGION" \
  --format='value(status.imageDigest)')" = "$EXPECTED_IMAGE_DIGEST"

gcloud builds describe "$BUILD_ID" \
  --format='yaml(id,status,source,images,results.images,createTime,finishTime)'
```

Stop if the revision digest, build ID, or build source does not match the
recorded provenance.

## 2. Retrieve the production source archive from Cloud Build

Inspect the build source first:

```sh
gcloud builds describe "$BUILD_ID" --format='yaml(source)'
```

For the normal Cloud Build `storageSource` case:

```sh
export SOURCE_BUCKET="$(gcloud builds describe "$BUILD_ID" \
  --format='value(source.storageSource.bucket)')"
export SOURCE_OBJECT="$(gcloud builds describe "$BUILD_ID" \
  --format='value(source.storageSource.object)')"
export SOURCE_GENERATION="$(gcloud builds describe "$BUILD_ID" \
  --format='value(source.storageSource.generation)')"

test -n "$SOURCE_BUCKET"
test -n "$SOURCE_OBJECT"

WORKDIR="$(mktemp -d)"
BASELINE_ARCHIVE="$WORKDIR/hormonehealthai-production-source.zip"

if test -n "$SOURCE_GENERATION"; then
  gcloud storage cp \
    "gs://${SOURCE_BUCKET}/${SOURCE_OBJECT}#${SOURCE_GENERATION}" \
    "$BASELINE_ARCHIVE"
else
  gcloud storage cp "gs://${SOURCE_BUCKET}/${SOURCE_OBJECT}" "$BASELINE_ARCHIVE"
fi

test "$(sha256sum "$BASELINE_ARCHIVE" | awk '{print $1}')" = "$EXPECTED_SOURCE_SHA"
```

If `source.storageSource` is empty, stop. Use the exact `repoSource` or
`gitSource` revision shown by `gcloud builds describe`; do not substitute the
current development branch.

The archive should remain unchanged. Extract into a separate directory:

```sh
mkdir "$WORKDIR/baseline" "$WORKDIR/patched"
unzip -q "$BASELINE_ARCHIVE" -d "$WORKDIR/baseline"
cp -a "$WORKDIR/baseline/." "$WORKDIR/patched/"
```

## 3. Export the preserved five-file patch

From a trusted clone containing the preserved branch:

```sh
git fetch --all --prune
git merge-base --is-ancestor c26e03a 1aeef94

git diff --binary c26e03a^..1aeef94 -- \
  client/src/pages/billing.tsx \
  server/audit.ts \
  server/routes.ts \
  tests/billing-cancellation.test.ts \
  tests/unit/billing-cancellation.test.ts \
  > "$WORKDIR/emergency-cancellation-release-candidate.patch"

test -s "$WORKDIR/emergency-cancellation-release-candidate.patch"
```

Check that the patch names exactly five files:

```sh
git apply --numstat "$WORKDIR/emergency-cancellation-release-candidate.patch"
git apply --numstat "$WORKDIR/emergency-cancellation-release-candidate.patch" \
  | awk '{print $3}' | sort -u > "$WORKDIR/patch-files.txt"

cat > "$WORKDIR/expected-files.txt" <<'EOF'
client/src/pages/billing.tsx
server/audit.ts
server/routes.ts
tests/billing-cancellation.test.ts
tests/unit/billing-cancellation.test.ts
EOF

diff -u "$WORKDIR/expected-files.txt" "$WORKDIR/patch-files.txt"
```

Stop on any difference.

## 4. Capture the unpatched baseline

Run in the extracted baseline with no production credentials in the test
environment:

```sh
cd "$WORKDIR/baseline"
npm ci
npm run build > "$WORKDIR/baseline-build.log" 2>&1
npm run check > "$WORKDIR/baseline-tsc.log" 2>&1 || true
```

Record the TypeScript diagnostic set in a stable form:

```sh
grep -E 'error TS[0-9]+' "$WORKDIR/baseline-tsc.log" \
  | sed 's#^\./##' | sort -u > "$WORKDIR/baseline-tsc-errors.txt"
```

## 5. Apply only the cancellation patch

```sh
cd "$WORKDIR/patched"
git init -q
git add -A
git commit -qm baseline

git apply --check "$WORKDIR/emergency-cancellation-release-candidate.patch"
git apply "$WORKDIR/emergency-cancellation-release-candidate.patch"

git diff --name-only | sort -u > "$WORKDIR/patched-files.txt"
diff -u "$WORKDIR/expected-files.txt" "$WORKDIR/patched-files.txt"
```

If `git apply --check`, `git apply`, or the five-file comparison fails, stop
and report the conflict. Do not import development commits to make it apply.

Explicitly reject forbidden changes:

```sh
if git diff --name-only | grep -E \
  '(^|/)(schema|migrations?|patient.portal|identity|relationship|team.access|deploy|cloudbuild|Dockerfile|\.env)'; then
  echo 'Forbidden release-candidate change detected' >&2
  exit 1
fi
```

## 6. Build, diagnostics, and focused tests

Use a disposable nonproduction database and mocked Stripe. Do not export a
production database URL or live Stripe key into this shell.

```sh
cd "$WORKDIR/patched"
npm ci

export NODE_ENV='test'
export DATABASE_URL='postgresql://...isolated-nonproduction-database...'
export STRIPE_TEST_MODE='mock'
unset STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY

npm run build > "$WORKDIR/patched-build.log" 2>&1
npm run check > "$WORKDIR/patched-tsc.log" 2>&1 || true

grep -E 'error TS[0-9]+' "$WORKDIR/patched-tsc.log" \
  | sed 's#^\./##' | sort -u > "$WORKDIR/patched-tsc-errors.txt"
comm -13 "$WORKDIR/baseline-tsc-errors.txt" "$WORKDIR/patched-tsc-errors.txt" \
  > "$WORKDIR/new-tsc-errors.txt"
test ! -s "$WORKDIR/new-tsc-errors.txt"

npx vitest run \
  tests/billing-cancellation.test.ts \
  tests/unit/billing-cancellation.test.ts \
  > "$WORKDIR/cancellation-tests.log" 2>&1
```

Also run the repository's legacy clinician, staff, and patient authentication
compatibility suites against the same disposable database. Select their exact
test paths from the production baseline; do not run migration or deployment
scripts. The cancellation suite must use its mocked Stripe client and must
cover cancellation, undo/reactivation, confirmed webhook outcomes, duplicate
webhooks, invalid signatures, and actor authorization.

## 7. Sensitive-log scan

Scan generated logs before retaining or sharing them:

```sh
grep -Ein \
  'password|password_hash|stripe_[a-z]*_[a-z0-9]+|sub_[a-zA-Z0-9]+|cus_[a-zA-Z0-9]+|sig(nature)?|token|session.?id|payment.?method|authorization:|cookie:|patient|date.of.birth|diagnos' \
  "$WORKDIR"/*.log > "$WORKDIR/sensitive-log-findings.txt" || true
```

Review every finding. Release evidence must contain only sanitized test
fixtures and reason codes—never passwords, hashes, bearer material, Stripe
identifiers/signatures, session IDs, payment data, or PHI.

## 8. Build a new image without changing production traffic

Use the service's existing Artifact Registry repository and build
configuration. Obtain the current image repository without guessing:

```sh
export CURRENT_IMAGE="$(gcloud run revisions describe "$BASELINE_REVISION" \
  --region "$REGION" --format='value(spec.containers[0].image)')"
export IMAGE_REPOSITORY="${CURRENT_IMAGE%@*}"
export RC_TAG="cancellation-rc-$(date -u +%Y%m%d%H%M%S)"
export RC_IMAGE="${IMAGE_REPOSITORY}:${RC_TAG}"
```

From the patched isolated source:

```sh
cd "$WORKDIR/patched"
gcloud builds submit --tag "$RC_IMAGE" .
export RC_DIGEST="$(gcloud artifacts docker images describe "$RC_IMAGE" \
  --format='value(image_summary.digest)')"
test -n "$RC_DIGEST"
export RC_IMAGE_BY_DIGEST="${IMAGE_REPOSITORY}@${RC_DIGEST}"
```

If the production build used an explicit Cloud Build config, substitutions,
service account, worker pool, or build directory, reproduce those settings
from build `900afa28-7597-440f-9e5f-f176874dd7cd` instead of using the generic
submit command above.

## 9. Create a zero-traffic Cloud Run revision

Deploy the immutable digest and explicitly assign zero traffic:

```sh
export RC_REVISION_SUFFIX="cancel-rc-$(date -u +%Y%m%d%H%M)"

gcloud run deploy "$SERVICE" \
  --region "$REGION" \
  --image "$RC_IMAGE_BY_DIGEST" \
  --revision-suffix "$RC_REVISION_SUFFIX" \
  --no-traffic
```

Verify that production traffic remains unchanged:

```sh
gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format='yaml(status.latestCreatedRevisionName,status.traffic)'

test "$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format=\"value(status.traffic[revisionName='$BASELINE_REVISION'].percent)\")" = '100'
```

Do not use `--to-latest`, do not migrate the database, and do not send a real
Stripe request. Any smoke test of the zero-traffic revision must use approved
internal access and mocked/nonproduction dependencies.

## 10. Rollback

Because the candidate receives zero traffic, normal rollback is deletion of
the candidate revision:

```sh
export RC_REVISION="${SERVICE}-${RC_REVISION_SUFFIX}"
gcloud run revisions delete "$RC_REVISION" \
  --region "$REGION" \
  --quiet
```

If traffic was changed accidentally, restore the recorded baseline first:

```sh
gcloud run services update-traffic "$SERVICE" \
  --region "$REGION" \
  --to-revisions="${BASELINE_REVISION}=100"
```

Then confirm the baseline revision has 100% traffic before deleting the
candidate.

## Release gate

Proceed no further unless all of the following are true:

1. Build source and image provenance match the recorded build/revision.
2. The retrieved archive hash matches exactly.
3. The patch applies without conflicts.
4. Exactly the five approved files differ.
5. Baseline and patched builds pass.
6. The patched tree adds zero TypeScript diagnostics.
7. Cancellation, undo, webhook, and legacy authentication tests pass with
   mocked Stripe and an isolated nonproduction database.
8. Logs contain no credentials, payment data, session material, or PHI.
9. The candidate is deployed by immutable digest with zero traffic.
10. Production remains on `hormonehealthai-00567-gub` at 100% until a separate
    approval changes traffic.