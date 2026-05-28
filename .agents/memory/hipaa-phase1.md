---
name: HIPAA Phase 1 hardening
description: What was done in Phase 1 safe hardening and what phases are still pending
---

## Phase 1 — DONE (safe, additive)

**Helmet headers** — `server/index.ts`: `app.use(helmet({ contentSecurityPolicy: false, hsts: prod-only }))` after trust-proxy. CSP stays off (Vite inline scripts); HSTS only in production.

**SESSION_SECRET enforcement** — startup `process.exit(1)` if `NODE_ENV=production` and `SESSION_SECRET` absent. Does NOT change the secret value.

**PHI log cleanup** — removed/replaced in:
- `server/ai-service.ts`: raw OpenAI response dump + patient summary content
- `server/clinical-logic-female.ts`: hormone pattern debug block + FSH value logs
- `server/routes.ts`: female hormone values object, msgBody.slice, patient name in Spruce simulate, q="" search query

**Rate limiting** — `express-rate-limit` on auth endpoints only (no global):
- Clinician login: 10/15min, forgot/reset: 5/15min
- Portal login: 10/15min, forgot/reset: 5/15min
- Ops login: 5/15min

**PHI access audit logging** — new `server/phi-audit.ts` (fire-and-forget Pool writes). New `phi_access_log` table in `server/prod-migrate.sql` (additive). Eight routes instrumented: view_patient_list, view_patient_profile, view_lab_results, view_encounter, download_patient_document, portal_view_labs, portal_view_documents, portal_view_encounters.

**Why:** `phi_access_log` uses a separate Pool from the Drizzle `db` export — intentional, so audit writes never interfere with the main ORM transaction path.

## Phase 2+ — NOT YET DONE (explicitly deferred)
- MFA for clinician accounts
- Idle timeout / auto-logout
- Application-layer document encryption at rest
- Patient chart access controls review
- Existing auth/session refactor
- Global rate limiting
