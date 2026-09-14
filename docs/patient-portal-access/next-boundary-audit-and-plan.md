# Patient Portal Identity and Authorization: Next-Boundary Audit and Plan

## Scope and constraints

This is a read-only audit and implementation plan. It does not authorize implementation.

The next boundary must preserve:

- Legacy patient authentication as the sole production authority.
- Account 2 in `identity_ready`, never `identity_enabled`.
- Existing login, password reset, logout, and session behavior until a later group is separately approved.
- No relationship enforcement, clinic selector, identity-owned HTTP session, push, publish, or deployment.
- Foreign and nonexistent resources must produce equivalent responses.
- Self, guardian, and proxy access must be modeled and authorized separately.

## Audit conclusions

### Authentication and sessions

| Flow | Current authority and behavior | Gap before identity enablement |
|---|---|---|
| Set initial portal password | Invite token locates `patient_portal_accounts`; writes only its bcrypt hash (`server/routes.ts:5538-5558`) | A mapped identity credential would diverge |
| Login | Compares only `patient_portal_accounts.password_hash`; sets `session.portalPatientId` (`5561-5614`) | No identity, clinic, relationship, scope, account-version, or resource binding |
| Logout | Deletes only `portalPatientId`; session row/cookie survive (`5617-5621`) | No full destruction, rotation, or identity cleanup |
| Forgot password | Finds legacy account by email and writes reset token/expiry (`5623-5671`) | No canonical identity binding; response and token lifecycle need an anti-enumeration contract |
| Reset password | Writes only the legacy account hash and clears reset token (`5673-5698`) | Existing copied identity credential becomes stale |
| Portal password change | No separate authenticated patient password-change route was found | Future implementation must use the same credential-authority service |
| Session persistence | PostgreSQL-backed Express session, rolling two-hour cookie (`server/index.ts:381-403`) | Patient session contains only a patient ID; no account, identity, clinic, relationship, scope, or version |
| Session invalidation | No patient-wide invalidation on reset, disablement, relationship revocation, or identity session-version change | Stale sessions remain usable until expiry |

### Credential-divergence release blocker

Both the legacy account and identity credential may contain the same copied bcrypt bytes at migration time, but all current patient password writers update only the legacy hash. Migration-time `direct_copy_confirmed` is not a continuing equality guarantee.

Identity authentication must not be enabled until one reviewed credential-authority service:

1. Generates or accepts one bcrypt hash per password operation.
2. Updates the authoritative legacy hash and any eligible mapped identity credential in one transaction.
3. Rolls back both writes if either fails.
4. Rejects unexpected mapping, credential-count, status, or ownership states.
5. Records a non-secret audit event.
6. Provides a reconciliation report proving byte equality before any enablement.
7. Defines session invalidation explicitly rather than changing it incidentally.

During the dual-hash transition, the legacy hash remains authoritative for login. Synchronization prevents future divergence; it does not activate identity authentication.

### Current authorization model

`requirePortalAuth` checks only `session.portalPatientId`. Most portal handlers pass that patient ID into storage methods. Relationship 119 and equivalent relationships are not enforced. The shadow access foundation can observe selected requests, but it does not cover every portal resource and must remain non-enforcing until reviewed.

Under the required standard, every patient-ID-only portal route is a release blocker for identity authentication even when the patient ID came from a valid legacy session.

## Route-by-route inventory

Severity definitions:

- **SAFE-DISABLED**: deliberately unavailable and returns a uniform response.
- **NEEDS-HARDENING**: has meaningful resource ownership checks but lacks canonical identity, active relationship, clinic, or scope enforcement.
- **RELEASE-BLOCKER**: trusts only a patient ID/session patient ID, has an unproved indirect binding, or has a direct functional/ownership defect.

### Intake and account lifecycle

| Method and route | Current checks | Required checks | Classification |
|---|---|---|---|
| POST `/api/patient-intake/invites/:patientId` | Clinician auth and clinic-scoped patient lookup (`server/routes.ts:5318-5335`) | Explicit actor clinic authority and invite target audit | NEEDS-HARDENING |
| POST `/api/patient-intake/invites/:inviteId/resend` | Clinician auth; invite loaded with clinic context (`5337-5359`) | Exact actor-to-clinic authorization | NEEDS-HARDENING |
| POST `/api/patient-intake/invites/:inviteId/cancel` | Clinician auth; invite loaded with clinic context (`5361-5383`) | Exact actor-to-clinic authorization | NEEDS-HARDENING |
| GET `/api/patient-intake/exchange` | Always uniform not-found (`5385`) | Keep disabled | SAFE-DISABLED |
| ALL `/api/patient-intake/flows/cleanup` | Always uniform not-found (`5386`) | Keep disabled | SAFE-DISABLED |
| POST `/api/patient-intake/exchange` | Flags, rate limit, token helper (`5387`) | Prove one-time token, invite, identity, patient, clinic, relationship, and scope binding | RELEASE-BLOCKER |
| POST `/api/patient-intake/flow/authenticate` | Flags, limiter, flow/email/identity helper (`5388-5407`) | Prove active relationship and exact clinic/scope | NEEDS-HARDENING |
| POST `/api/patient-intake/flow/accept` | Bound-flow relationship transition (`5409-5418`) | Prove canonical actor and strict clinic scope | NEEDS-HARDENING |
| POST `/api/patient-intake/relationships/:relationshipId/verify` | Clinician auth and transition helper (`5420-5437`) | Enforce current actor's clinic ownership at route and storage boundary | NEEDS-HARDENING |
| GET `/api/patient-intake/forms` | Flow helper; no standard HTTP auth middleware (`5439-5443`) | Identity, bound relationship, `intake_only` scope, assignment ownership | RELEASE-BLOCKER pending helper proof |
| GET `/api/patient-intake/forms/:formId` | Flow helper (`5444-5448`) | Same plus exact form assignment | RELEASE-BLOCKER pending helper proof |
| POST `/api/patient-intake/forms/:formId/draft` | Flow helper (`5450-5455`) | Same plus write authority | RELEASE-BLOCKER pending helper proof |
| POST `/api/patient-intake/forms/:formId/submit` | Flow helper (`5457-5462`) | Same plus immutable submit transition | RELEASE-BLOCKER pending helper proof |
| GET `/api/patient-intake/forms/:formId/status` | Flow helper (`5464-5470`) | Same | RELEASE-BLOCKER pending helper proof |
| POST `/api/portal/invite/:patientId` | Clinician auth and clinic-scoped patient lookup (`5472-5537`) | Prevent email fallback from linking a foreign account; explicit identity/relationship audit | NEEDS-HARDENING |
| POST `/api/portal/set-password` | Invite-token account lookup (`5539-5560`) | Canonical account/identity binding and atomic credential synchronization | RELEASE-BLOCKER |
| POST `/api/portal/login` | Legacy email/hash; stores patient ID (`5562-5616`) | Keep legacy decision; add reviewed shadow context before any enforcement | RELEASE-BLOCKER for identity rollout |
| POST `/api/portal/logout` | Deletes only patient ID (`5618-5622`) | Define later full-session destruction/rotation without changing current behavior prematurely | NEEDS-HARDENING |
| POST `/api/portal/forgot-password` | Legacy email lookup and reset token (`5624-5672`) | Uniform anti-enumeration and canonical account binding | NEEDS-HARDENING |
| POST `/api/portal/reset-password` | Legacy reset token; updates legacy hash (`5674-5699`) | Atomic dual-hash synchronization and explicit session policy | RELEASE-BLOCKER |

### Profile, documents, labs, and protocols

| Method and route | Current checks | Required checks | Classification |
|---|---|---|---|
| GET `/api/portal/me` | Session patient ID (`5701-5736`) | Identity, active relationship, clinic, `full_portal` scope | RELEASE-BLOCKER |
| PATCH `/api/portal/account` | Session patient ID; updates patient/account (`5739-5804`) | Same plus field-level write authority | RELEASE-BLOCKER |
| GET `/api/portal/account/documents` | Session patient ID; submissions and published encounters (`5807-5853`) | Relationship, clinic, scope, per-resource ownership | RELEASE-BLOCKER |
| GET `/api/portal/lab-documents` | Session patient; patient clinic passed to storage (`5856-5875`) | Canonical relationship and scope; prove patient+clinic predicate in storage | NEEDS-HARDENING |
| GET `/api/portal/lab-documents/:docId/download` | Clinic-constrained lookup and explicit `doc.patientId === patientId` (`5877-5893`) | Canonical identity, active relationship, scope | NEEDS-HARDENING |
| GET `/api/portal/healthiq/snapshot` | Session patient ID (`5906-5971`) | Relationship, clinic, scope across every contributing query | RELEASE-BLOCKER |
| GET `/api/portal/healthiq/insight` | Session patient ID and patient existence (`5974-6005`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| GET `/api/portal/labs` | Session patient ID (`6008-6024`) | Relationship, clinic, lab ownership | RELEASE-BLOCKER |
| GET `/api/portal/protocol` | Session patient ID (`6336-6351`) | Relationship, clinic, published-resource ownership | RELEASE-BLOCKER |
| GET `/api/portal/protocols` | Session patient ID (`6355-6363`) | Same | RELEASE-BLOCKER |
| GET `/api/portal/status/:patientId` | Clinician auth and clinic-scoped patient lookup (`6453-6504`) | Validate account relationship and legacy email fallback | NEEDS-HARDENING |

The lab-document download is not a current cross-patient ID leak: it explicitly compares the document patient to the session patient and returns the same 404 for foreign and nonexistent documents. Its remaining gap is the future identity/relationship/scope layer.

### Messaging, recipes, orders, forms, encounters, and appointments

| Method and route | Current checks | Required checks | Classification |
|---|---|---|---|
| GET `/api/portal/messaging-config` | Session patient and clinician lookup (`6509-6525`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| GET `/api/portal/messages` | Session patient query/read mark (`6527-6538`) | Relationship, clinic, message ownership | RELEASE-BLOCKER |
| POST `/api/portal/messages` | Session patient write (`6540-6565`) | Relationship, clinic, write scope; bind async forwarding | RELEASE-BLOCKER |
| GET `/api/portal/messages/unread` | Session patient (`8231-8241`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| POST `/api/portal/recipes` | Session patient (`6915-6977`) | Relationship and resource scope | RELEASE-BLOCKER |
| GET/POST `/api/portal/saved-recipes` | Session patient (`6980-7004`) | Relationship and patient ownership in storage | RELEASE-BLOCKER |
| DELETE `/api/portal/saved-recipes/:id` | Patient ID passed to delete (`7006-7015`) | Relationship and uniform ownership/error contract | RELEASE-BLOCKER |
| GET/POST `/api/portal/supplement-orders` | Session patient; POST derives clinic from patient (`7017-7090`) | Relationship, clinic, order ownership | RELEASE-BLOCKER |
| GET `/api/portal/forms` | Assignments/submissions by session patient (`7091-7134`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| GET `/api/portal/clinic-discount` | Session patient lookup (`7135-7151`) | Relationship and clinic scope | RELEASE-BLOCKER |
| GET `/api/portal/forms/submission/:id` | Explicit submission-patient comparison (`7153-7194`) | Canonical relationship, clinic, scope | NEEDS-HARDENING |
| GET `/api/portal/forms/:assignmentId` | Assignment selected for session patient (`7195-7224`) | Canonical relationship, clinic, scope | RELEASE-BLOCKER |
| POST `/api/portal/forms/:assignmentId/submit` | Assignment selected for session patient (`7226+`) | Same plus explicit write transition | RELEASE-BLOCKER |
| GET `/api/portal/encounters` | Manual session patient check, no shared middleware (`14675-14686`) | Standard middleware, relationship, clinic, published encounter ownership | RELEASE-BLOCKER |
| GET `/api/portal/appointments` | `requirePortalAuth`, then dereferences undefined `req.portalUser` (`15796-15805`) | Repair actor binding, then relationship, clinic, appointment ownership | RELEASE-BLOCKER; currently expected to return 500 |

`req.portalUser` is not populated by `requirePortalAuth` or another server middleware. The appointments defect should be repaired in a separately approved compatibility group, not hidden inside identity enablement.

### Tracking, medications, refills, and vitals

| Method and route | Current checks | Required checks | Classification |
|---|---|---|---|
| GET/POST `/api/portal/tracking/settings` | Session patient settings (`20293-20331`) | Relationship, clinic, read/write scope | RELEASE-BLOCKER |
| GET `/api/portal/tracking/checkins` | Session patient (`20333-20346`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| GET `/api/portal/tracking/checkins/today` | Session patient and date (`20348-20358`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| POST `/api/portal/tracking/checkins` | Session patient write (`20360-20404`) | Relationship, clinic, write scope | RELEASE-BLOCKER |
| GET `/api/portal/tracking/medications` | Session patient chart/reported medication queries (`20406-20441`) | Relationship, clinic, medication ownership | RELEASE-BLOCKER |
| POST `/api/portal/tracking/med-adherence` | Session patient; accepts a medication ID (`20443-20468`) | Verify medication belongs to actor's patient+clinic before insert | RELEASE-BLOCKER |
| GET `/api/portal/tracking/med-adherence` | Session patient (`20470-20482`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| POST `/api/portal/tracking/patient-reported-medication` | Session patient write (`20484-20524`) | Relationship, clinic, write scope | RELEASE-BLOCKER |
| PATCH `/api/portal/tracking/patient-reported-medication/:id` | Storage receives resource ID and patient ID (`20526-20541`) | Canonical relationship; uniform not-found contract | NEEDS-HARDENING |
| DELETE `/api/portal/tracking/patient-reported-medication/:id` | Storage receives resource ID and patient ID (`20543-20554`) | Same; normalize false/404 behavior | NEEDS-HARDENING |
| POST `/api/portal/refill-request` | Session patient; clinic derived from patient (`20560+`) | Relationship, clinic, medication/refill authority | RELEASE-BLOCKER |
| GET `/api/portal/vitals-monitoring/active` | Session patient episode/history (`20844-20877`) | Relationship, clinic, scope | RELEASE-BLOCKER |
| POST `/api/portal/vitals-monitoring/:id/log` | Explicit episode-patient equality and active state (`20880-20893`) | Canonical relationship, clinic, scope | NEEDS-HARDENING |
| PATCH `/api/portal/vitals/:id` | Explicit patient and `patient_logged` source checks (`21018-21032`) | Canonical relationship, clinic, scope | NEEDS-HARDENING |

## Realtime, background, upload, and indirect release paths

No WebSocket, Socket.IO, SSE, EventSource, pub/sub, or dedicated patient-portal worker was found.

| Path | Current state | Required future rule |
|---|---|---|
| External portal-message forwarding | Fire-and-forget after patient message write (`server/routes.ts:6559-6577`) | Persist actor identity, target patient, clinic, relationship, and authorization decision with the job; revalidate before external send when delayed |
| Form-generated patient documents | Created from form patient context (`server/routes.ts:719-753`) | Carry immutable patient+clinic+assignment provenance; readers still enforce current relationship |
| Lab PDF document creation | Created from clinician/lab context (`server/routes.ts:2655-2718`) | Require clinician clinic ownership before create; preserve patient+clinic provenance |
| Direct portal lab download | Streams database-held base64 data; no signed URL | Authorize before bytes are loaded; bind by identity+relationship+patient+clinic+document |
| Workflow/chart-review queues | Database-backed background-like processing | Store tenant/resource provenance and revalidate on execution; never trust only a queued patient ID |
| Spruce/Boulevard callbacks | External webhooks, not patient portal sessions | Verify signature and resolve clinic before any patient/resource mutation |

No general patient-portal upload endpoint was found. Any future upload must authorize before accepting bytes, assign patient and clinic server-side, quarantine until validation completes, and use the same ownership checks for every later download.

## Guardian and proxy access

Guardian/proxy access must not reuse the self-access assumption that the authenticated identity is the patient.

A future authorization context must distinguish:

- **Actor identity**: who authenticated.
- **Target patient**: whose record is requested.
- **Relationship**: self, guardian, or proxy.
- **Clinic**: exact tenant for that relationship and resource.
- **Scope/capabilities**: explicit read/write actions allowed for that relationship.
- **Resource owner**: target patient and clinic stored on the requested object.

Requirements:

1. No relationship type defaults to `full_portal`.
2. Guardian/proxy grants are explicit, auditable, time-bound when required, and revocable.
3. Sensitive capabilities can differ: messages, medication changes, forms, downloads, billing/order actions, and demographic edits must be separately grantable.
4. The patient and clinic can see active delegates and revoke them.
5. Revocation invalidates or rejects stale sessions on the next request.
6. Foreign and nonexistent relationships/resources return the same response.

## Clinic selection without aggregated PHI

A future clinic selector may expose only clinics already authorized for the actor. Safe metadata is limited to:

- Opaque clinic identifier.
- Clinic display name and logo/brand.
- Public contact information and address.
- Timezone, locale, and business hours.
- Public appointment-booking configuration.
- Messaging availability label.
- Care-team display names/credentials only after authorization to that clinic.

Do not include patient counts, appointment volume, lab/diagnosis/order/message summaries, recent activity, outstanding tasks, cohort statistics, or cross-clinic timelines. Pharmacy and patient demographic data are PHI and do not belong in selector metadata.

## Stale sessions and invalidation

A future identity session must bind:

- Identity ID.
- Selected relationship ID.
- Target patient ID.
- Clinic ID.
- Granted scope/capability version.
- Identity `session_version`.
- Relationship update/revocation version or timestamp.
- Authentication and expiry timestamps.

Every request must reject the session if the identity is disabled, session version changed, relationship is not active, relationship expired/revoked, selected patient/clinic no longer match, or required capability is absent.

Password reset/change, identity-wide rollback, account recovery, relationship revocation, and security-sensitive email ownership changes need explicit invalidation rules. These rules must be approved before altering legacy session behavior.

## Foreign-versus-nonexistent response contract

For resource-ID routes:

1. Query by resource ID **and** authorized patient ID **and** clinic ID in one operation.
2. Return the same status and body when the resource does not exist or belongs to another patient/clinic.
3. Do not return authorization-specific details until ownership is established.
4. Log the internal reason without exposing it to the caller.
5. Test every resource route with own, foreign-same-clinic, foreign-other-clinic, and nonexistent IDs.

Existing response differences requiring review include invalid ID versus missing resource, wrong document category, inactive monitoring episode, disabled account, expired token, and delete operations returning `{ok:false}` instead of 404. Valid state errors may remain distinct only after ownership has been proven.

## Independently approved implementation groups

Each group stops for review and approval. No group implicitly authorizes the next.

### Group 1 — Compatibility and ownership regression harness

No production behavior change.

- Add route inventory assertions so new patient routes cannot bypass the matrix.
- Snapshot legacy login/logout/forgot/reset/session behavior.
- Add own/foreign/nonexistent resource tests for every route.
- Add tests proving account 2 remains `identity_ready` and unused by HTTP auth.
- Add a test proving no ordinary route can enable an identity.

**Exit evidence:** tests fail on the current appointments defect and medication-adherence ownership gap, while accepted legacy behavior remains captured.

### Group 2 — Credential-coexistence guard

Legacy login remains authoritative; identity login stays unavailable.

- Centralize set/reset/future-change password writes.
- For an eligible mapped `identity_ready` account, write one bcrypt result to both legacy and identity credential rows atomically.
- Reject ambiguous mappings or credential counts.
- Add non-secret audit events and a read-only equality report.
- Decide session invalidation separately; do not silently alter it.

**Exit evidence:** forced failure rolls back both hashes, exact-byte equality is maintained, and legacy-only accounts behave identically.

### Group 3 — Complete shadow authorization context

No enforcement.

- Build one request context containing legacy account, candidate identity, patient, clinic, relationship, scope, and resource provenance.
- Extend observation to every route and indirect release path in this inventory.
- Record PHI-minimized allow/deny/indeterminate reasons.
- Compare foreign and nonexistent behavior without changing responses.

**Exit evidence:** complete route coverage and reviewed shadow evidence with no response/session changes.

### Group 4 — Legacy compatibility defect fixes

Still no identity enforcement.

- Repair `/api/portal/appointments` without introducing identity-owned sessions.
- Enforce medication ownership for adherence writes.
- Normalize unsafe foreign/nonexistent differences where ownership is not yet established.
- Verify document/form ownership predicates at storage boundaries.

**Exit evidence:** focused compatibility tests pass and no accepted legacy auth flow changes.

### Group 5 — Relationship enforcement by resource family

Approve each sub-group independently:

1. Profile and account writes.
2. Documents, downloads, labs, HealthIQ, and protocols.
3. Messages and asynchronous forwarding.
4. Recipes, saved items, supplement orders, and discounts.
5. Forms and submissions.
6. Encounters and appointments.
7. Tracking, medications, adherence, refills, and vitals.

Start with shadow comparison, then a disabled enforcement flag, then synthetic accounts only. No real account is enabled by completing this group.

**Exit evidence:** every route proves identity/relationship/patient/clinic/scope/resource ownership and foreign/nonexistent equivalence.

### Group 6 — Guardian/proxy capability model

- Define delegated capabilities separately from self access.
- Add grant, expiry, revocation, visibility, and audit rules.
- Test one actor with multiple targets and one patient with multiple delegates.

**Exit evidence:** no proxy or guardian receives undeclared capabilities or cross-clinic data.

### Group 7 — Identity session and invalidation design

Still disabled for real users.

- Define session payload, rotation, expiry, version checks, selected relationship, and revocation behavior.
- Define password/reset/account-recovery invalidation.
- Test stale sessions after identity-version and relationship changes.

**Exit evidence:** synthetic-only sessions fail closed on every stale-state condition.

### Group 8 — PHI-free clinic-selection metadata

Backend contract first; no dashboard yet.

- Return only already-authorized clinics and approved public metadata.
- Exclude all activity, counts, summaries, and patient-specific fields.
- Test zero/one/many clinic states and revoked relationships.

**Exit evidence:** privacy review confirms no aggregated or patient-specific PHI.

### Group 9 — Explicit enablement review

This group is planning-only until separately authorized.

- Require passing credential equality, route ownership, shadow evidence, stale-session, guardian/proxy, and rollback gates.
- Enable only an explicitly approved synthetic identity first.
- Preserve per-account rollback and identity-wide revocation.
- Require a separate decision before any real account, including account 2.

## Current release blockers

1. Legacy sessions identify only a patient, not an identity, relationship, clinic, or scope.
2. Password set/reset can diverge legacy and identity credential hashes.
3. Existing sessions are not invalidated by password reset, account disablement, relationship revocation, or identity version changes.
4. Most portal routes trust only the session patient ID.
5. `/api/portal/appointments` dereferences an unset `req.portalUser`.
6. Medication-adherence creation accepts a medication resource ID without proving patient ownership.
7. Guardian/proxy authorization and capability boundaries are not implemented.
8. Shadow resource resolution does not yet cover every portal route and indirect delivery path.

Identity authentication, clinic selection, and relationship enforcement must remain disabled until the applicable blockers are resolved and separately accepted.
