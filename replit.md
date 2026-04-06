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
-   **Clinical Encounter Documentation**: Full visit documentation workflow — audio upload transcribed via OpenAI Whisper (file deleted immediately after processing), link to existing patient lab results for AI context, GPT-4o generates structured SOAP notes (Subjective, Objective, Review of Systems, Assessment, Plan) with evidence-based guidance and lab interpretation, editable patient-facing visit summaries publishable to the patient portal. HIPAA-conscious: no audio stored in database.
-   **Clinician Customizable Supplement Library**: Clinicians can add, edit, and delete custom supplements with lab-value trigger rules (marker + range), symptom-based trigger rules, or combined lab+symptom conditions. Each supplement has pricing, gender filtering, category, and patient-facing descriptions generated by AI. Rules determine when a supplement is recommended in patient results.
-   **Supplement Pricing & Discount Settings**: Per-clinician discount settings (percentage or flat) applied to supplement orders through the patient portal.
-   **Clinician Lab Range Preferences**: Clinicians can override optimal and reference ranges for any of 60+ lab markers on a per-gender basis. Overrides display in interpretation pages; the system falls back to hardwired defaults if no override is set.

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
