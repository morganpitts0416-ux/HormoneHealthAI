# Lost-workspace recovery: c73ac1bc32

## Scope and approval boundary

`recovery.py` is a standalone, standard-library-only recovery tool
for `realign-lab-app:us-central1:cliniq-rx-stage-c73ac1bc32`.
Its default `assess` command does not connect to PostgreSQL, retrieve secret
payloads, inspect patient data, read production Cloud Run configuration/traffic,
deploy, change IAM, reset a password, create a cloud resource, or delete anything.
The separate `rotate` command implements staging-only secret escrow and one
postgres password rotation, requiring explicit approval of a report SHA-256,
staging reset/escrow approval, and separate historical UPDATE review if needed.
Neither command initializes a database, deploys, deletes or accesses production.

The original creator/continuation must remain stopped. Do not delete or edit
their ledger, reconstruct a fake original workspace, run the original creator,
or use another attempt ID to bypass the existing instance fence.

## First operator step: one command

Download this repository's `scripts/prescription-staging/recovery.py` using the
file browser and upload the standalone file to Cloud Shell's persistent home
directory as `cliniq-rx-recovery.py`. No other module or handoff archive is needed.
The tool is not automatically published to GitHub.

Run only:

```sh
python3 "$HOME/cliniq-rx-recovery.py" assess
```

Authentication must already be present through normal Cloud Shell OAuth.
Never paste credentials or private evidence bundles into chat.

## Automatic reconciliation

The tool checks the existing protected ledger and takes its existing exclusive
attempt lock without changing either file. It verifies the active SDK account
(stores only an identity hash), project, exact instance identity/connection name,
creation time, region, PostgreSQL 18, tier, RUNNABLE status and synthetic labels.
It requires precisely the reported `postgres` database and `postgres` user.

It inventories attempt-named secrets, buckets, service accounts, custom roles,
all-region Artifact Registry repositories, regional services/builds, and
cross-region Cloud Asset resources. Missing API/permissions stop the assessment,
not treat the inventory as empty. No API or IAM is automatically changed.
These inventories are name-based reconciliation, not proof that an operator
never created differently named resources.

SQL operation and Admin Activity histories must corroborate a single creation
around the instance creation time. Nonterminal/failed/unknown operations, missing
history, cap-sized results and mismatches stop progression. UPDATE audit metadata
cannot prove labels-only changes, so it is explicitly reported for approval review,
not silently accepted. The tool projects metadata only, never raw audit request or
response bodies that could contain a password. Final instance and SQL inventories
are rechecked for drift. Remote state can still change later: every eventual
mutation must have fresh verification.

### Bounded audit retrieval

The old unbounded, ascending, 10,000-entry audit request has been removed.
Audit searches now have explicit half-open timestamp bounds covering **verified
instance creation minus one hour through a frozen current assessment cutoff**.
This includes the whole instance incarnation/recovery period, not just a recent
lookback that could hide earlier writes. Identity/resource filters are unchanged.

Each request covers at most six hours, returns at most 201 entries and has a
25-second subprocess timeout. GA `gcloud logging read` internally paginates but
does not expose `--page-size`; no unsupported pagination flag is used. A response
with 201 entries is NEVER accepted as complete. That interval is split in half
and re-read until each result is below the cap. Timeouts also split the interval.
Permission/API/JSON failures are not treated as empty results or retried blindly.

The complete retrieval has a 240-second total budget, at most 96 calls, a
one-second minimum interval, and fewer than 10,000 total accepted records.
Persistent slowness, dense minimum intervals or exhausted budgets fail closed.
There is no truncated-history fallback. Each query/completion/timeout prints
its interval. `audit-progress.json` saves attempted intervals and accepted
partial metadata batches even on later failure; it never authorizes recovery.

A successful assessment saves `audit.json` plus `audit-coverage.json`, documenting
contiguous windows, counts, hashes and the exact cutoff. Duplicate audit IDs,
out-of-window entries, missing terminal audit operation IDs, missing SQL operation
matches or SQL operations changing during retrieval stop the assessment.
Every listed SQL operation must have matching terminal audit evidence. Missing
or delayed log ingestion is a blocker, not permission to proceed. Unrecognized
mutation methods remain blockers even when creation evidence is present.
The approval report SHA binds BOTH audit data and the complete coverage proof.
Old assessments must not be reused with this version: perform a fresh assessment.

Before an explicitly approved rotation, the complete bounded audit retrieval is
repeated through a fresh cutoff. Any changed audit/SQL history invalidates the
approval; the credential/reset safety boundaries are otherwise unchanged.

## Persistent evidence and retries

Each invocation saves a separate 0700 directory under:

`$HOME/.local/state/cliniq-rx-recovery/c73ac1bc32/assessment-*`

Evidence files are exclusively created as 0600, fsynced with their directory,
and include the unchanged ledger copy, tool checksum, inventory/audit metadata,
approval report, and SHA-256 manifest. Account email is replaced with a hash.
Symlinked or insecure local state is refused, not repaired without approval.
Incomplete runs get a STOPPED marker, never an approval report.
Rerunning performs fresh reads, preserves older evidence and never replays cloud
writes. Cloud Shell `/tmp` is not used for durable evidence. Persistent HOME
survives ordinary VM restarts, but is not an independent disaster-recovery backup.

For `assess`, exit 0 means assessment completed and STILL awaits separate explicit approval.
Exit 2 means evidence includes reconciliation blockers. Exit 1 means an incomplete
assessment; no permission to proceed. Review `approval-report.json` privately.
Do not upload the complete evidence directory publicly.

## Administrator credential conclusion

If the original password is lost and no attempt secret backup exists, the
existing runner cannot log in as postgres. The staging administrator password
must be rotated to proceed via that password-based workflow. The tool does NOT
claim that a password can be recovered from Cloud SQL or the creation ledger.
An unexpected secret blocks progression rather than attempting to read/adopt it.

## Separately approved credential recovery (implemented, NOT executed here)

The next command is deliberately not provided until the assessment is reviewed
and the operator explicitly approves the reset/escrow boundary. `rotate` accepts
the protected assessment directory, `--approve-report-sha256`, and
`--approve-staging-reset-and-secret-escrow`; if the only audit blocker is known
SQL UPDATE metadata, it additionally requires `--approve-historical-updates`.
Other resource/history blockers cannot be overridden with those flags.

The implemented action:

- Verifies every evidence hash, the current tool hash, the original ledger bytes,
  the report approval hash and the existing exclusive attempt lock.
- Repeats all read-only queries and requires equality with approved evidence.
- Validates all six secure mutation/readback command shapes against the installed
  SDK offline, with isolated credentials and intentional parser rejection.
- Generates a strong password only under persistent 0700 `credential-recovery/`,
  stores password and flags as 0600 files, and creates a separate durable journal.
- Creates exactly `cliniq-rx-stage-c73ac1bc32-recovery-postgres`, rejects unexpected
  direct secret IAM bindings, and escrows one ENABLED secret version BEFORE reset.
  No new IAM grants are added; normal inherited project IAM still applies.
- Rotates only `postgres` on `cliniq-rx-stage-c73ac1bc32`, passing the password via
  a protected `--flags-file`, not argv, console, logs or chat.
- Rechecks staging instance/DB/user inventories and original ledger before every
  mutation. Journals each action as pending before submission and done only after
  command/readback verification.
- Stops after the synchronous password-operation metadata reports DONE. This is
  NOT a claim of verified database authentication.
- Refuses ALL automatic replay of a started journal, even a fully completed one.
  Interrupted, partial and uncertain cases retain credentials and evidence for
  separate read-only reconciliation. No resource is automatically deleted.

## Remaining separately approved validation phase

After credential recovery:

1. Reconcile and approve the exact historical UPDATE with least-privilege audit
   review; never assume all UPDATE operations were just the known label patch.
2. Revalidate the instance incarnation, ledger, inventories and source manifest.
3. Verify the escrowed credential by authenticating to the exact staging instance
   using a separately reviewed local proxy/adapter; never substitute a production
   connection string. No database authentication adapter is included in this tool.
4. Mark submitted-but-unconfirmed rotations uncertain; do not generate another
   password or blindly repeat. Reconcile the operation and use the same escrowed
   version for a separately approved recovery.
5. After verifying staging-only authentication, read SQL catalogs and synthetic
   contents before initializing anything. Unexpected contents block progress.
6. With separate initialization/deployment approval, transfer the exact reviewed
   source into a NEW persistent recovery workspace, preserving both the original
   creation ledger and new recovery provenance. The old continuation command
   cannot accept this workspace as if it were the original.
7. Only then initialize synthetic databases and proceed with isolated signing,
   PDF integrity/download, authorization, duplicate-signing and failed-upload tests.

Before initialization, implement/test the new recovery-to-validation adapter
against synthetic state. The original continuation must not be fooled with a
replacement workspace or edited ledger. Escrow retrieval after another restart
needs separately reviewed metadata/identity checks and a protected output file,
never a secret printed to stdout or chat.

All future credentials, source/tool hashes, operation IDs, write-ahead journal
and PDF evidence must live under the protected persistent recovery workspace,
with credentials additionally escrowed in narrowly authorized Secret Manager
versions before their dependent cloud mutations. An independently protected
backup of non-secret recovery evidence needs separate approval. `assess` creates
no cloud resources; the explicitly approved `rotate` creates only its one secret,
one version, and the staging postgres password change.

## Local verification

### Targeted read-only reconciliation after the diagnostic

#### Resource-format correction and two-record identity diagnostic

`diagnose_recovery_resource_identity.py --evidence /absolute/protected/reconciliation-directory`
verifies the completed manifest and original ledger, refreshes staging identity and
the two authoritative operations, and re-reads ONLY insert IDs `-9z64loe3oqmy` and
`-9f8c59e3pdtd` within two seconds of their preserved timestamps. It makes no
historical-window queries. Its projection excludes request/response bodies,
principal identities and unrequested labels. Output shows actual resource type,
name and selected system labels next to verified project ID/number, instance,
region and exact operation bindings; old versus corrected checks are explicit.
The original reconciliation remains unchanged and BLOCKED; the new report cannot
authorize resets or be supplied to `rotate`.

Two normalization cases are narrowly supported:

* Logging's [`cloudsql_database` descriptor](https://cloud.google.com/logging/docs/api/v2/resource-list#cloudsql_database)
  defines `database_id` as the instance name, not exclusively `project:instance`.
  That bare name is accepted ONLY for type `cloudsql_database` with an independent
  matching `project_id`; prefixed names still must match a verified project alias.
  Wrong project/instance/region values, wildcard projects and contradictory
  service/method labels remain failures.
* A project-level CREATE audit resource does not itself identify an instance.
  It is accepted ONLY for the exact CREATE ID/method with independently described
  successful DONE/no-error operation targeting the verified project and instance.
  Parent-only resources are NEVER accepted for UPDATE/connect, wrong operation
  IDs/types or unknown projects. All existing actor, timing, producer, success,
  label-only request and current-instance checks remain mandatory.

This handles known representations without declaring unknown records valid.
The metadata diagnostic must be inspected before rerunning reconciliation; a
different resource, unsupported shape or contradictory field remains blocked.

`reconcile_recovery_audit.py --evidence /absolute/protected/assessment-directory`
is a SEPARATE read-only tool. It neither relaxes the original `rotate` gate nor
authorizes resets. It is pinned to the two operation IDs explicitly identified by
the operator, not a guessed operation or a broad method/time match.

It first runs the offline diagnostic and validates the original 11-window prefix.
It then takes the existing attempt lock, verifies the current account/project,
instance incarnation/labels/version/tier, postgres-only database/user inventories,
and the exact two-operation SQL inventory. Each operation is independently
described via the Cloud SQL API with exact ID, target project/instance, type,
DONE/no-error status and completion timestamp checks. These authoritative status
checks supply completion evidence; optional Logging `operation.last` is not used
as a substitute for Cloud SQL status or as an unconditional prerequisite.

Only the uncovered tail from the validated prefix to a fresh fixed cutoff is
queried broadly, using the existing bounded windows/caps/deadline policy. Narrow
historical re-reads target the two exact operation IDs around their authoritative
lifetimes. Any saved unusual event, including `cloudsql.instances.connect`, not
already returned is re-read by exact insert ID within two seconds of its saved
timestamp. Immutable historical metadata must agree on those targeted reads.
The old 11 historical windows are not resubmitted.

Verification requires exact operation ID + correct method + successful audit
status + staging resource + independently authenticated actor, corroborated by
authoritative DONE status. Method/time proximity alone never establishes a match.
Project-number resource names are resolved ONLY against the freshly described
project number. Unknown aliases, producers, methods, actors, failed statuses or
additional SQL operations remain blockers, not blanket allowlist exceptions.

The UPDATE request is read transiently in memory only for exact-ID UPDATE queries.
Raw request/response content and principal emails are NEVER written into evidence,
printed, passed in argv or included in error messages. The tool outputs only
whitelisted audit metadata, a principal hash, and a structural request verdict.
The private audit subprocess disables SDK HTTP and file logging as well.
To prove the known label update, at least one matching request must contain
exactly the two expected labels, with no configuration fields except routing,
kind and optimistic-concurrency metadata. Tier/password/network/flag changes,
ambiguous wrappers, broad masks, redacted/unsupported bodies and missing label
requests cannot be inferred safe from the instance's current labels.

Google documents `cloudsql.instances.connect` as a non-LRO Admin Activity event
requiring an ADMIN_WRITE permission. It is NOT dismissed as a harmless read.
An exact staging-resource/successful/current-operator match is classified as
connection authorization rather than instance configuration mutation. That event
does not prove what SQL was executed through a connection or the absence of data
access; the report explicitly retains this limitation. Unknown connection actors
or resources remain blocked.

New protected `reconciliation-*` evidence is written beside, never into, the old
assessment. It includes fresh metadata, authoritative operations, sanitized audit
progress, window coverage, a read-only report and a SHA-256 manifest. All original
evidence hashes/ledger bytes and fresh instance/operations/account are rechecked.
Interrupted reads keep sanitized progress and a STOPPED marker. There is no reset,
SQL connection, production lookup, deployment or mutation command.

Even `READ_ONLY_FACTS_RECONCILED_AWAITING_SEPARATE_APPROVAL` is not authorization
for initialization, credentials, or signing. Do not run the original rotate
command using this report; approval-path integration remains a separate review.

### Offline diagnosis after terminal audit correlation fails

Do NOT rerun `assess` just to identify the operation. The standalone adjacent
`diagnose_recovery_audit.py --evidence /absolute/protected/assessment-directory`
reads the saved files locally and makes zero cloud, SQL or subprocess calls.
It creates no output file, does not edit the ledger/evidence, and never authorizes
recovery. Python bytecode writes are disabled. Run it from the verified tooling
checkout so the adjacent `recovery.py` is the reviewed version.

It accepts the pinned producer from the bounded-query release or its own adjacent
current producer; verifies private permissions, ledger bytes and snapshot identity;
and validates each completed window's count, hash, bounds and uniqueness. It shows:

- Every SQL operation ID/type/status and insert/start/end timestamps, with a flag
  for unexpected or failed operations.
- Whitelisted audit timestamps, insert IDs, service/method/resource, numeric
  status, operation ID/producer and first/last flags.
- The exact outcome under the unchanged original terminal-ID rule.
- Same-ID events lacking `last=true`, and method/time candidates with different
  IDs. These candidates are explicitly NOT proof or an accepted fallback.
- Completed-window coverage and hashes without repeating those queries.

Raw request/response bodies, principal identity, error messages, passwords and
patient fields are never emitted. Never paste the full private evidence bundle
into chat. The diagnostic's whitelisted operation/audit summary is sufficient
for the next decision.

Google's LogEntryOperation reference documents ID/first/last as optional and the
ID as arbitrary; the Cloud SQL audit guide says create/update LROs usually emit
start/end events. Neither fact by itself proves the live mismatch cause, nor
justifies accepting a timestamp-only match:

- https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogEntryOperation
- https://cloud.google.com/sql/docs/postgres/audit-logging

The legacy producer saved batches but not a final retrieval marker before its
terminal check. Therefore its valid saved windows prove a historical PREFIX, not
the original planned final cutoff or a successful assessment. That prefix can be
examined now and retained for a separately reviewed reuse path with fresh instance,
ledger/operation checks and any uncovered/tail or narrowly targeted delayed-event
queries. No automated reuse/approval adapter is introduced here. Do not edit or
remove `STOPPED.txt`, manufacture a coverage proof, or reset credentials.

The current producer now saves an explicit retrieval-complete marker before
correlation, and identifies the failing SQL operation in its error. The terminal
verification and all mutation/approval gates remain unchanged.

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/prescription-staging -p 'test_recovery.py' -v`

Synthetic tests cover unchanged ledgers, failed/unknown operations, partial
resources, lost processes/retries, persistent permissions and symlinks, drift,
sanitized SDK errors, exact-hash approval fences, escrow-before-reset ordering,
failed escrow, uncertain-action no-replay, private persistent credential files,
historical UPDATE review approval, and prohibited-command absence from assessment.
Audit regressions cover split-on-timeout, slow success, total deadlines/call
budgets, capped batches, contiguous coverage, missing terminal operations,
malformed/partial results, duplicate IDs, drift and report-to-evidence binding.
An installed SDK parser test injects an intentionally invalid sentinel in an
isolated credential-free SDK configuration: it tests the actual command shapes
without dispatching any GCP request. No live-cloud validation is claimed.
