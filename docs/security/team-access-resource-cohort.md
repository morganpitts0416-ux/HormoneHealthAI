# Patient resource protection cohort

This development-only cohort is intentionally limited to these exact method/path
pairs:

* `GET /api/patients/:id`
* `GET /api/patients/:id/chart`
* `GET /api/patients/:id/photo-id`
* `GET /api/patients/:id/documents`
* `GET /api/patients/:id/documents/:docId/download`
* `GET /api/encounters/:id`
* `GET /api/patients/:id/messages`
* `POST /api/patients/:id/messages`
* `GET /api/patients/:id/clinical-orders`
* `GET /api/clinical-orders/active`

The executable allowlist is `PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ_ALLOWLIST`;
startup audit rejects duplicates, non-API paths, or any count other than ten.
Matching uses Express's mounted route templates and rejects non-canonical numeric
parameters while enforcement is enabled; it never normalizes attacker-controlled
path text or widens to a prefix family.

## Enforcement contract

`SHADOW_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ` and
`ENFORCE_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ` are absent/off by default.
Only development requests marked by the in-process synthetic WeakSet marker can
enter enforcement. Browser headers, query/body values, and cookies cannot mark a
request or select a clinic. Current actor membership/staff linkage is resolved
first; resource ownership is queried only after actor access is allowed.
`finalAllow = legacyAllow && proposedAllow`. Unreadable, absent, disabled, and
expired flags preserve legacy behavior, including malformed resource IDs.
Canonical parameter rejection occurs only after an enabled synthetic
enforcement flag is successfully resolved, and still precedes actor, resource,
and handler work.

## SQL ownership constraints

* Patient chart/profile lab history uses patient clinic joins.
* Photo ID and document listing constrain both `patient_id` and `clinic_id`.
* Document download uses one lookup constrained by `document_id`,
  `patient_id`, and `clinic_id`; no file stream starts before it succeeds.
* Message reads join the patient clinic; read-marking uses an `EXISTS` patient
  clinic predicate. Clinician message insertion uses `INSERT ... SELECT FROM
  patients WHERE patients.id = ? AND patients.clinic_id = ?`, so a route guard
  cannot turn into a cross-tenant write.
* Encounter ownership remains clinic plus patient/legacy author scope. Null
  clinic encounters are never repaired or reassigned.
* Clinical orders constrain order clinic and patient clinic. Provider expansion
  requires a provider row in the same clinic; patient and order assignee
  expansions are performed only for already-scoped orders.
* Active-order promotion and selection are clinic constrained and are reachable
  only after middleware authorization.

## Synthetic HTTP matrix

`tests/unit/patient-resource-cohort-authz.test.ts` uses Express,
`express-session`, real middleware, injected isolated actor/resource readers, and
HTTP requests for every allowlisted method/path. It covers active clinician and
staff, stale/revoked actor denial, absent/disabled/expired/unreadable flags,
legacy denial, explicit Clinic B selection, browser override attempts, and
cross-clinic/nonexistent equivalence. Denied downstream handlers are not
invoked, proving no PHI read, stream, transcript lookup, message read-mark or
insert, email/external forward, order promotion, or provider/assignee expansion
can be reached.

The focused storage assertions are in the SQL implementations themselves:
`getPatientDocument`, `getPortalMessages`, `markPortalMessagesRead`,
`createPortalMessageInClinic`, and both clinical-order readers.

## Legacy null-clinic inventory

`countLegacyNullClinicEncounters()` is an inventory-only query using
`clinical_encounters.clinic_id IS NULL`. It reports the count for a development
rollback/report run and performs no update, reassignment, or repair. The
existing rollback validator continues to provide transaction rollback and
before/during/after cleanup proof; this cohort adds no patient, identity,
portal, or feature-flag rows.

## Remaining routes and indirect paths

All other patient, chart, document, encounter, messaging, order, transcript,
provider/team, workflow, lab, portal, upload, deletion, and external-delivery
routes remain outside this cohort. Deactivate/Remove controls, patient identity
and portal authentication, billing/cancellation, Account 2, Stripe/GCP, and
production enforcement remain out of scope. Before deactivation can truthfully
take effect everywhere, the remaining read, mutation, background-job, import,
webhook, transcript, notification/email, external-forwarding, provider
expansion, and scheduled-order indirect paths require separately reviewed
allowlists and current actor/tenant SQL constraints.