# ClinIQ Lab Interpretation - Multi-Tenant SaaS Platform

## Overview
ClinIQ is a multi-tenant SaaS platform designed for staff in men's and women's hormone and primary care clinics. It provides an isolated workspace for each clinician to interpret standard lab panels, apply clinical protocols, generate AI-powered recommendations, and identify critical "red flag" values. The platform supports gender-specific lab interpretation, comprehensive patient wellness reports, and advanced risk assessments, aiming to streamline clinical decision-making and enhance patient care.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## Production Deployment — Google Cloud Run (MANDATORY RULES)

**This app is deployed to Google Cloud Run. Every code change must respect these rules:**

### NEVER use in any server-side file (outside of server/vite.ts):
- `import ... from 'vite'` or any Vite APIs at runtime
- `@neondatabase/serverless`
- `drizzle-orm/neon-serverless`
- `neonConfig` or any Neon-specific WebSocket configuration

### ALWAYS use for database:
- `drizzle-orm/node-postgres` (standard node-postgres driver)
- `pg` Pool with `process.env.DATABASE_URL`
- Schema changes: run `npm run db:push` (never handwrite SQL migrations)

### Frontend serving (production):
- Run `npm run build` — output goes to `dist/public/`
- `server/static-serve.ts` serves `dist/public/` via `express.static`
- Falls back to `index.html` for all non-API routes (SPA support)
- Do NOT add Vite proxy config or any dev-only middleware to production paths

### Vite isolation pattern (already in place — do not change):
- `server/vite.ts` is the only file that imports from `vite`
- `server/index.ts` loads it via `new Function("m","return import(m)")("./vite.js")` so esbuild never bundles it into `dist/index.js`
- This means `dist/index.js` must NEVER contain `setupVite`, `createServer` from vite, or any Neon imports

### Pre-deploy verification checklist:
```bash
# Zero Neon references in bundle:
grep -c "neondatabase\|neon-serverless\|neonConfig" dist/index.js   # must be 0

# Zero real Vite references in bundle (invite* is fine, vite-the-tool is not):
grep -n "from 'vite'\|require.*vite\|setupVite" dist/index.js       # must be empty

# Correct DB driver in bundle:
grep -c "drizzle-orm/node-postgres" dist/index.js                   # must be ≥ 1

# Static serve present:
grep -c "express.static" dist/index.js                              # must be ≥ 1
```

### Cloud Run deploy command:
```bash
git push origin main
gcloud run deploy hormonehealthai \
  --source . \
  --region YOUR-REGION \
  --allow-unauthenticated \
  --clear-base-image
```

---

## System Architecture
The ClinIQ platform features a comprehensive lab input, results display with color-coded status indicators, a red flag alert system, AI-powered recommendations, and a patient summary generator, all within a professional medical UI.

**Core Architectural Decisions and Features:**
-   **Multi-tenant SaaS**: Ensures isolated patient data, lab results, and interpretations for each clinician account.
-   **Authentication & Authorization**: Session-based authentication with `express-session`, `passport-local`, and `bcrypt` for clinicians. A dedicated staff access system allows invited staff to operate within the clinician's workspace with role-based restrictions.
-   **AI-Powered PDF Upload**: Automatic extraction of lab values from Pathgroup and hospital PDFs.
-   **Advanced Risk Assessments**:
    -   **PREVENT Cardiovascular Risk Assessment (2023 AHA)**: Implements official AHA equations for 10-year and 30-year CVD, ASCVD, and Heart Failure risks.
    -   **Advanced Lipid Marker Assessment**: Includes ApoB and Lp(a) assessment with adjusted risk.
    -   **hs-CRP Interpretation**: Standard interpretation for risk stratification.
-   **STOP-BANG Sleep Apnea Screening**: Integrates an 8-component questionnaire for OSA risk assessment.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds for various conditions (e.g., erythrocytosis, testosterone optimization, lipid management) with gender-specific logic, including platelet interpretation and FIB-4 scoring.
-   **Female-Specific Workflows**: Dedicated routes, reference ranges, menstrual phase context for hormone interpretation, and specific lab markers. Features Female Testosterone Pattern Recognition for clinical optimization.
-   **Insulin Resistance Screening**: Identifies likelihood and four phenotypes with trigger criteria, pathophysiology, and treatment recommendations.
-   **AI-Generated SOAP Notes**: Creates chart-ready notes incorporating lab values, red flags, risk scores, and supplement recommendations.
-   **Patient Profiles & Lab History Tracking**: Persistent patient profiles with searchable selection, lab history view, trend indicators, and trend charts. The system provides clinical trend insights for 21 lab markers, generating both clinician and patient-facing insights.
-   **Patient Wellness PDF Report**: Generates comprehensive patient-facing wellness PDFs with AI-powered personalized diet, supplement, and lifestyle recommendations, including smoking cessation education.
-   **Metagenics Supplement Catalog Integration**: Recommends Metagenics supplements based on lab values, symptoms, and detected phenotypes, with an interactive provider-facing selector for customization.
-   **Portal Messaging System**: Supports four modes: None, In-app, SMS link, and External API (two-way bridge) for integration with external messaging platforms like Spruce or Klara via webhooks.
-   **HIPAA Technical Controls**: Includes audit logging, login lockout mechanisms (after 5 failed attempts), client-side session timeout with warning dialogs, and robust password strength enforcement.
-   **Email Integration**: Supports clinician invite flows and password reset functionalities, using an email service (currently stubbed, configurable for Resend API).
-   **Clinical Encounter Documentation & 6-Stage AI Pipeline**: Full visit documentation workflow — audio upload/recording transcribed via OpenAI Whisper (file deleted immediately after processing), link to existing patient lab results for AI context. Encounter editor has 5 tabs: **Details** (audio, transcription, patient/visit info), **Transcript** (diarized speaker-labeled view + pipeline buttons), **SOAP Note** (AI-generated, editable), **Evidence** (clinical evidence suggestions with citations), **Summary** (patient-facing, publishable to portal). The Clinical AI Pipeline runs 6 stages: 1-Transcribe → 2-Normalize (medical term correction, speaker diarization) → 3-Extract Facts (chief concerns, symptoms, diagnoses, plan items) → 4-Generate SOAP (uses extraction context; returns uncertain_items + needs_clinician_review flags) → 5-Evidence (guideline citations per diagnosis, confidence levels) → 6-Patient Summary. HIPAA-conscious: no audio stored in database. Safety guardrails prevent SOAP from inventing unsupported exam findings or vitals.
-   **Clinician Customizable Supplement Library**: Clinicians can add, edit, and delete custom supplements with lab-value trigger rules (marker + range), symptom-based trigger rules, or combined lab+symptom conditions. Each supplement has pricing, gender filtering, category, and patient-facing descriptions generated by AI. Rules determine when a supplement is recommended in patient results.
-   **Supplement Pricing & Discount Settings**: Per-clinician discount settings (percentage or flat) applied to supplement orders through the patient portal.
-   **Clinician Lab Range Preferences**: Clinicians can override optimal and reference ranges for any of 60+ lab markers on a per-gender basis. Overrides display in interpretation pages; the system falls back to hardwired defaults if no override is set.
-   **Boulevard Appointment Sync (Zapier)**: Appointments booked, rescheduled, or cancelled in Boulevard flow into the app automatically via Zapier webhooks. Webhook endpoint: `POST /api/webhooks/boulevard/:clinicianId` (public, no auth). Clinicians copy their personal webhook URL from the Appointments page and configure 3 Zaps (New, Updated, Cancelled). Appointments display on a dedicated clinician Appointments page (`/appointments`) and as a "Next Appointment" card in the patient portal. Patients are auto-linked to appointment records by email when a match is found in the patient table.
-   **Medication Dictionary (CSV Upload)**: Clinicians can upload custom CSV medication dictionaries (`medication_dictionaries` + `medication_entries` tables). Each CSV entry supports: `generic_name`, `brand_names`, `common_spoken_variants`, `common_misspellings`, `drug_class`, `subclass`, `route`, `notes`. After transcription, the "Detect Medications" button in the Encounter Transcript tab scans the text using a multi-pass engine: exact match on generic (100%), brand (95%), spoken variant (85%), misspelling (75%), and Levenshtein fuzzy match (flagged for review). Results display in a table with original term, canonical name, drug class, match type, confidence score, and review flag. Management page at `/medication-dictionary` (nav: "Med Dictionary"). Multiple dictionaries can be uploaded and are all scanned together. No external NDB — fully curated by the clinician.
-   **Stripe Billing & Subscriptions**: Full Stripe integration for clinician billing. Price: $97/month (`price_1TJb7eKbgudErHaMxs1B2BzZ`, livemode). 14-day free trial via `trial_period_days: 14`. Card collection via Stripe Elements (SetupIntent flow). Backend routes: `/api/billing/config`, `/api/billing/status`, `/api/billing/create-setup-intent`, `/api/billing/subscribe`, `/api/billing/cancel`, `/api/billing/reactivate`, `/api/stripe/webhook`. Webhook handles `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`. Schema fields: `stripeCustomerId`, `stripeSubscriptionId`, `stripeCurrentPeriodEnd`, `stripeCancelAtPeriodEnd`. Frontend billing page at `/billing` accessible from the dashboard header.
-   **EHR-Style Patient Chart**: Persistent per-patient chart panel embedded in the Patient Profiles page (`/patients`). Stores 6 sections as JSONB arrays: `currentMedications`, `medicalHistory`, `familyHistory`, `socialHistory`, `allergies`, `surgicalHistory`. Each section displays as a color-coded chip list (allergies in red, others in green). Clinicians can: (a) manually edit chips with inline add/remove inputs; (b) AI-extract chart data from any clinical encounter (uses transcript + SOAP note via GPT-4o, returns draft for review); (c) review and approve/reject individual extracted items in a draft review dialog before saving. DB table: `patient_charts`. API routes: `GET /api/patients/:id/chart`, `PUT /api/patients/:id/chart`, `POST /api/patients/:id/chart/extract`. Collapsible patient list sidebar: toggle button in patient header collapses the left panel to a narrow strip to maximize chart reading space.
-   **Signed & Locked Chart Notes (EMR)**: Clinicians can electronically sign and lock SOAP notes once complete. Signing: `POST /api/encounters/:id/sign` — locks the note with provider name/NPI, timestamp, and saves an immutable version snapshot to `encounterVersions` JSONB audit trail. Amendment: `POST /api/encounters/:id/amend` — unlocks the note for editing while preserving prior signed version in audit trail. Schema columns: `signedAt`, `signedBy`, `isAmended`, `amendedAt`, `encounterVersions`. Frontend: green signed banner + electronic signature footer displayed in SOAP Note tab; edit mode and Transcript tab hidden when signed; "Sign Note" button replaces "Save SOAP" when SOAP exists; "Amend" button available when signed. Signed encounters show a Lock badge in the encounter list. Patient Profiles encounters section: signed encounters expand inline to show read-only SOAP note with signature footer instead of navigating away.
-   **Enhanced SOAP Generation Prompt**: SOAP AI prompt strengthened with three mandatory clinical documentation rules: (1) BMI → weight diagnosis: if any BMI value is stated, the appropriate ICD-10 weight classification (Overweight E66.3, Obesity Class I–III E66.01) is always generated as a numbered assessment/plan item with clinical context; (2) Patient education full documentation: any clinical counseling discussed must appear in HPI, Assessment item, and Plan for the relevant diagnosis — full drug names, mechanisms, route options; never condensed; (3) Patient-stated decisions: any patient decision or intent must appear verbatim in HPI and in the Plan for the relevant diagnosis with clinician next-step instructions.

**Technology Stack:**
-   **Frontend**: React, TypeScript, Wouter (routing), Shadcn UI (components), TanStack Query (data fetching), Tailwind CSS, React Hook Form and Zod (form validation).
-   **Backend**: Express.js.
-   **Database**: PostgreSQL with Drizzle ORM (`drizzle-orm/node-postgres` + `pg` Pool).
-   **Design System**: Inter and JetBrains Mono fonts, professional blue color scheme, Material Design-inspired components.

## External Dependencies
-   **OpenAI**: For AI-powered recommendations, PDF text extraction, and summary generation.
-   **PostgreSQL**: Primary database for data storage.
-   **multer**: For handling file uploads, specifically PDFs.
-   **jsPDF**: For programmatic generation of PDF reports.
-   **Resend API (Optional)**: For sending emails (clinician invites, password resets).
-   **Spruce, Klara (or other webhook-capable platforms)**: For external messaging system integration.
