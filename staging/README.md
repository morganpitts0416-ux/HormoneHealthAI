# Isolated prescription staging runner

**Not deployed or cloud-tested from Replit.** Replit has no authenticated Google
account, and the integrated production source is in Cloud Shell, not Replit.
The runner consumes that actual integrated source; it never substitutes GitHub
main or Replit main. Existing implementation/candidate patch bytes are unchanged.

## One execution in the authenticated Cloud Shell

Place this directory beside the existing release materials, then run:

```bash
python3 staging/run.py --execute \
  --source "$HOME/cliniq-prescription-staging" \
  --materials "$HOME/cliniq-prescription-release/materials"
```

Without `--execute`, preparation is offline: it copies and checks source only.
No account login, project configuration change, resource creation or deployment
is performed in prepare-only mode.

### Cloud SQL compatibility and retry fencing

Cloud SQL creation uses explicit supported `--database-version`, `--edition`,
`--tier`, `--region` and `--storage-size` GA flags. Only the password
is passed in a protected flags file, with the required `--root-password` key.
Its value is not placed in argv and is explicitly redacted from SDK errors;
captured creation stdout is never written to logs.

This SDK does not expose SQL labels on GA create or GA patch. After GA creation,
the runner independently verifies the exact new instance's project, name, region,
connection name, PostgreSQL 18 version, tier and readiness, then uses only
`gcloud beta sql instances patch <that-instance> --update-labels=...`.
Labels are independently read back before proxy startup or database initialization.
Any patch/verification failure leaves the creation fence in place; it cannot
be misclassified as an argument rejection permitting another create.

Before billable work, an offline preflight derives every `gcloud` command shape
from the actual runner source and checks it against the **operator's installed SDK**.
It includes the complete GA SQL command and properly prefixed password file.
Each probe uses synthetic resources, an isolated credential-free SDK config,
and an intentionally invalid sentinel flag. It must exit 2 rejecting **only**
that flag before command dispatch. Extra unsupported flags, invalid types,
unavailable tracks or unexpected success stop execution. `--help` is not used
for validation because it can short-circuit unsupported argument checks.
The report is saved as `sdk-compatibility.json` in the private workspace.
This verifies CLI/parser compatibility, not runtime IAM, quotas, API availability
or a successful staging deployment.

Use the **same `--attempt-id` on every retry**. For the previously rejected
`cliniq-rx-stage-c73ac1bc32` creation, use `--attempt-id c73ac1bc32`.
Otherwise an ID derived from the source path remains stable across tooling clones.
A protected, locked local ledger under `~/.local/state/cliniq-rx-staging` records
creation submission before the command executes. Only a recognized SDK
argument rejection before submission permits retry, with an independent
instance-absence check. Existing instances, successful submissions, uncertain
failures and concurrent executions stop without creating or adopting resources.
There is no automatic resume after a potentially successful creation; retain
the workspace and ledger for read-only reconciliation. Do not delete the ledger
or change attempt IDs merely to bypass this safeguard.

This creates **billable** resources in `realign-lab-app`: a fresh PostgreSQL 18
instance, two synthetic databases, private GCS bucket, staging service account,
secrets, artifact repository, image and separate IAM-protected Cloud Run service.
It does not reuse `realign-app-new`; its dependencies remain unverified.
Resources have a random `cliniq-rx-stage-…` namespace. No resource is deleted by
the runner, including after failure. Resource cleanup needs a separate approval.

Required operator permissions: read production Cloud Run metadata; create/configure
only staging SQL/IAM/GCS/Secret Manager/Artifact Registry/Cloud Build/Cloud Run
resources; invoke the private staging service. Required APIs must already be
enabled; the runner does not change project-wide API enablement.
Google authentication must already be available through the normal SDK OAuth flow.
It never asks for a password, key, token or credential in chat.

## Actionable failures and production metadata

Every subprocess records its sanitized command and exit status immediately,
even when successful stderr is empty. Captured response bodies are not logged.
On failure, the console and protected log identify the command/context and
specific validation error or sanitized CLI stderr with an action to take.
Python metadata errors no longer disappear behind a generic phase message.

Region discovery includes the Google Cloud SDK's computed `id` and `region`
fields as well as v1 location labels and qualified v2 resource names. Missing,
conflicting or ambiguous regions fail closed; no default region is guessed.
An explicit `--region` still requires describing and verifying the exact
production service and its live traffic. The authoritative production baseline
is the resolved `status.traffic[].revisionName` receiving 100% of traffic, not
`status.latestReadyRevisionName`. Tagged revisions with missing/zero percent
do not establish the baseline. Split traffic, unresolved revision pointers,
missing status or a different serving revision stops before resource creation.
The expected production revision's immutable image is independently read before
staging and re-read at completion. The final check compares service metadata and
all actual traffic bindings (including tag/URL bindings, ignoring list ordering),
plus that image; an informational latest-ready pointer is not a serving change.
Do not change the expected revision just to get past a provenance failure.

## Guardrails

- Verify the existing patch checksum and all reviewed standalone module hashes.
- SQL material hashes must match the reviewed manifest.
- Refuse changed canonical clinic address/phone/fax schema or known automatic
  startup mutation.
- Copy to a private scratch directory; preserve the integrated source and its
  uncommitted work. Add upload/container exclusions only to the scratch copy.
- Exclude uploaded briefs/archives, `.env`, npm credentials, runtime uploads,
  recordings, backups, Git history, agent data and generated artifacts.
- Detect common literal credential formats before uploading; this is not a
  comprehensive PHI detector or a security certification.
- Require the user-reported production revision `hormonehealthai-00597-guv`.
  Capture production revision/traffic metadata before and after, read-only.
- The source ZIP checksum in the plan is **user-verified evidence**, not a new
  independent archive verification. This runner does not retrieve/extract it.
- Never target the production service `hormonehealthai`, instance `realign-app`,
  database `realdata`, or the unverified candidate instance `realign-app-new`
  for a write. Every writable target is newly generated.
- Strip inherited production database/payment/communications credentials from
  subprocess environments. No production secret is copied into staging.
- Use a database role without superuser/role-creation/database-creation rights.
  Bootstrap the empty database as its separate migration owner; precreate the
  session table so the runtime needs no schema-creation permission.
- Staging signing is enabled only on the fresh service with a fictional,
  expiring synthetic catalog. No controlled prescriptions or real transmission.
- Keep the bucket private with public access prevention and uniform access.
  Runtime service identity has object-create and object-read only, no deletion,
  overwrite, list or signed-URL permission.
- Temporary upload-failure configuration affects the new staging service only;
  restoration is attempted even after a test failure. Never corrupt a stored PDF.

## Evidence produced on successful execution

The runner installs/builds the actual integrated source, runs its Rx/prescriber
and available cancellation/access unit tests, then runs the **existing isolated
PostgreSQL integration harness** against a separate empty synthetic database on
the fresh PostgreSQL 18 instance through a private Unix-socket auth proxy.

Real HTTP calls through the IAM-authenticated staging proxy cover:
medication formulations, retained strength/form, shared SIG access, pharmacy
directory, draft/review, independent prescriber approval, saved account signature
(no signature accepted in sign request), anonymous/nurse/wrong-clinic denial,
explicit intent, stale review, controlled and unreviewed medication rejection,
concurrent duplicate signing, chart data, actual PDF download and wrong-clinic
PDF denial.

The downloaded PDF is compared to the stored database SHA-256, and the exact GCS
object is independently downloaded and compared again. Exactly one document and
one signed prescription must exist. A missing staging bucket then exercises a
real upload failure; the prescription must stay unsigned and document count
must remain unchanged. The proper staging bucket setting is restored.

Results: `state.json`, `production-before.json`, `http-results-*.json`,
`rollback-evidence.json`, `database-results.json`, `download-result.json`, synthetic PDFs and private
`operator.log` in the reported 0700 scratch directory. Secret files/logs are
0600. Synthetic login credentials are also saved in the **new staging** Secret
Manager secret whose name is reported; do not print or paste its values.
Keep the private directory out of Git, artifact uploads and deployment contexts.
On success, redundant local secret files are removed; the fresh Secret Manager
versions remain. On failure, protected files remain for operator diagnosis.

**Browser interaction is not covered by the HTTP probe.** A successful run must
not be reported as passing browser autofill/SIG-prompt/print-dialog testing.
The private staging URL and preserved service resources make that remaining
browser review possible. Use Google-authorized Cloud Shell Web Preview with
`gcloud run services proxy <staging-service> --region=<verified-region> --port=8081`
and the synthetic account stored in Secret Manager; never make the service public.

## Production readiness remains separate

Production signing remains unapproved and unchanged. Historical credential
containment/rotation, dependency advisories, non-Rx HTTP response logging,
actual browser acceptance, production migration/preflight review, backup/restore
evidence and an approved promotion/rollback procedure remain production gates.
The captured old revision/image/traffic metadata is evidence, not permission to
change production. Do not promote staging synthetic data, credentials or catalog.
No push, merge, production migration, production deployment or traffic change
is performed by these scripts.
