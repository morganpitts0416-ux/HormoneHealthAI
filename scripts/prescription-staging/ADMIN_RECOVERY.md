# Administrator recovery after successful read-only reconciliation

This tool is for **only** project `realign-lab-app`, instance
`cliniq-rx-stage-c73ac1bc32`, region `us-central1`, account `postgres`.
It cannot select either production SQL instance, change Cloud Run traffic,
initialize a database, run SQL, deploy, enable signing, alter IAM or enable APIs.
The previous `recovery.py rotate` approval path is NOT used or relaxed.

## 1. Prepare: no cloud mutations or credential generation

`recover_staging_admin.py prepare --reconciliation /protected/reconciliation-...
--assessment /protected/assessment-...`

The two paths must belong to this attempt's protected persistent state.
The successful reconciliation must have an intact manifest, no blockers, exact
operation/audit bindings, labels-only historical UPDATE proof and independent
before/after region proof. The original assessment hashes and original attempt
ledger must agree. Original evidence is never rewritten or deleted.

The installed SDK is tested with its real parser and synthetic data in a
credential-isolated configuration. This covers async password reset with a
protected flags file, Secret Manager creation/add/access-to-file, IAM and operation
reads. No real cloud command is issued by the parser check.

Fresh project/account/instance/database/user/operation metadata must equal the
successful reconciliation. Attempt-scoped resources must still be absent. Existing
escrow or prior credential-recovery state stops the tool. Project IAM is read, its
digest bound to the plan, and public bindings cause a separate-review stop; this
tool never changes IAM. Required API/IAM access must already exist.

The output is a protected `admin-recovery-plan-*/approval-plan.json` and SHA-256.
The plan expires in 30 minutes and binds exact source evidence, runtime hashes,
inventories and original ledger. It identifies the exact intended secret and
postgres password reset. It authorizes nothing and generates no credential.

## 2. Explicit approval: separate from reconciliation and plan creation

Review the actual plan before approval. The intended cloud mutations are:

1. Create `cliniq-rx-stage-c73ac1bc32-recovery-postgres` in Secret Manager,
   automatically replicated, with no direct IAM grants. Project IAM inheritance
   remains unchanged and is fingerprinted/rechecked.
2. Generate a new password, persist it locally with owner-only permissions, add a
   secret version, verify ENABLED identity and read back its exact bytes privately.
3. ONLY after escrow verification, change `postgres`'s password on the exact
   existing staging instance using `gcloud sql users set-password --async`.

This replaces the lost password and can invalidate staging clients using it. It
does not clear unknown SQL objects/data or prove authentication works.

Historical `cloudsql.instances.connect` events establish connection authorization,
not what SQL ran or what data exists. Synthetic labels establish intended use,
not database contents. Explicit acknowledgment of this limitation is mandatory.
The tool never reads existing postgres application/patient rows.

Only after separate explicit approval, execute requires ALL of:

- `--plan` pointing to the protected reviewed plan;
- `--approve-plan-sha256` matching its exact hash;
- `--approve-instance cliniq-rx-stage-c73ac1bc32`;
- `--approve-postgres-reset-and-secret-escrow`;
- `--acknowledge-historical-connections-unverified-sql`.

Approval is not inferred from a successful assessment, an empty blocker list, a
plan file, a previous command, or a changed CLI default. Prepare rejects approval
flags. Wrong instance names, stale/tampered plans and changed runtime all stop.

## 3. Execution safeguards (not the next command)

Before writes, the complete read-only reconciler refreshes identity, all SQL
inventories/operations, bounded tail audit evidence and exact historical UPDATE
request proof. New connections or blockers require fresh review. The original
attempt lock then fences the credential action; immediate snapshots must match
the plan and fresh audited state. Identity/inventories/operations/IAM/ledger,
protected credentials, source evidence, approval expiry and runtime are checked
again before each cloud mutation.

The fixed persistent `credential-recovery/` directory is shared with the legacy
duplicate-attempt fence. A durable journal precedes credential generation and
records PENDING/UNCERTAIN before each mutation. Any existing attempt, even one
reported successful, refuses replay. No secret or instance is adopted, replaced,
deleted or reset again automatically.

Passwords occur ONLY in owner-only persistent credential/flags/readback files
and the exact Secret Manager version. They are never arguments, output, Git
content or SDK error bodies. HTTP/file logging is disabled; stdout/stderr are
captured and sanitized. Secret version access uses `--out-file`, never stdout.
The credential is escrowed, enabled and byte-for-byte read-back verified BEFORE
the SQL reset. These private files must never be uploaded, committed or pasted.

Async submission supplies an exact new `UPDATE_USER` operation ID. Only that
operation is polled, with a bounded deadline, project/instance/type/error and DONE
checks. Empty/malformed responses, unknown outcomes, failed/incomplete operations
or unexpected inventories stop without replay. Secret escrow survives local
workspace loss; local state survives normal Cloud Shell restarts under `$HOME`.

Do not rerun execute after interruption. Preserve its journal, local credentials,
secret version and all evidence for separately reviewed read-only reconciliation.
No destructive cleanup or automatic retry is offered.

Successful command verification produces
`RESET_OPERATION_DONE_AUTHENTICATION_UNVERIFIED`. This is not an authentication
test, database initialization or staging deployment.

## 4. Separately controlled initialization/signing path

`recover_staging_admin.py next-phase-plan` is local/read-only and accepts no
approval flags. It requires a completed reset journal and unchanged original
ledger. It reports the exact escrow reference and the remaining approval gates:

1. Reconcile reset/secret metadata; separately approve bounded staging
   authentication and metadata-only checks. Never query existing application rows.
2. Because connection history cannot prove contents, do NOT initialize, wipe,
   inspect patient data in, or reuse `postgres` as the synthetic application DB.
   Review creation of a new dedicated synthetic database and app role separately.
3. Review a pinned-source provisioning plan for private GCS, restricted staging
   service credentials and an isolated staging-only Cloud Run service. Do not
   fabricate the lost original workspace or silently route the old continuation
   script around its credential requirements.
4. Separately authorize initialization and synthetic seed data, then run real
   noncontrolled prescription signing/PDF tests: authorization, clinic isolation,
   duplicate signing, saved provider signature, PDF integrity, failed uploads,
   download/print. No production signing/traffic activation is implied.

The reset tool deliberately implements no initializer or deployer. The handoff
plan identifies the boundary for subsequent review, not a claim those steps have
already run.

## Local verification

Run `test_staging_admin_recovery` alongside the existing recovery suite. All cloud
actions are synthetic mocks; the native SDK test uses an unknown-flag sentinel
and isolated credentials, never live cloud resources.
