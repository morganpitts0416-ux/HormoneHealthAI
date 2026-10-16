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
