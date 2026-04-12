# ClinIQ Lab Interpretation - Multi-Tenant SaaS Platform

## Overview
ClinIQ is a multi-tenant SaaS platform for staff in men's and women's hormone and primary care clinics. It provides an isolated workspace for clinicians to interpret standard lab panels, apply clinical protocols, generate AI-powered recommendations, and identify critical "red flag" values. The platform supports gender-specific lab interpretation, comprehensive patient wellness reports, and advanced risk assessments, aiming to streamline clinical decision-making and enhance patient care.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The ClinIQ platform features comprehensive lab input, results display with color-coded status indicators, a red flag alert system, AI-powered recommendations, and a patient summary generator, all within a professional medical UI.

**Core Architectural Decisions and Features:**
-   **Multi-tenant SaaS**: Ensures isolated data for each clinician account.
-   **Authentication & Authorization**: Session-based authentication with `express-session`, `passport-local`, and `bcrypt`. Supports staff access with role-based restrictions.
-   **AI-Powered PDF Upload**: Extracts lab values from Pathgroup and hospital PDFs.
-   **Advanced Risk Assessments**: Includes PREVENT Cardiovascular Risk Assessment (2023 AHA), Advanced Lipid Marker Assessment (ApoB, Lp(a)), and hs-CRP interpretation.
-   **STOP-BANG Sleep Apnea Screening**: Integrates an 8-component questionnaire.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds for various conditions with gender-specific logic, including platelet interpretation and FIB-4 scoring.
-   **Female-Specific Workflows**: Dedicated routes, reference ranges, menstrual phase context, and Female Testosterone Pattern Recognition.
-   **Insulin Resistance Screening**: Identifies likelihood and four phenotypes with recommendations.
-   **AI-Generated SOAP Notes**: Creates chart-ready notes incorporating lab values, red flags, risk scores, and supplement recommendations.
-   **Patient Profiles & Lab History Tracking**: Persistent patient profiles with searchable selection, lab history view, trend indicators, and trend charts for 21 lab markers.
-   **Patient Wellness PDF Report**: Generates comprehensive patient-facing wellness PDFs with AI-powered personalized diet, supplement, and lifestyle recommendations.
-   **Metagenics Supplement Catalog Integration**: Recommends Metagenics supplements based on lab values, symptoms, and phenotypes.
-   **Portal Messaging System**: Supports None, In-app, SMS link, and External API (two-way bridge via webhooks).
-   **HIPAA Technical Controls**: Includes audit logging, login lockout, client-side session timeout, and robust password strength.
-   **Email Integration**: Supports clinician invite flows and password resets.
-   **Clinical Encounter Documentation & 6-Stage AI Pipeline**: Full visit documentation workflow including audio upload/recording (OpenAI Whisper), transcription, medical term normalization, fact extraction, AI-generated SOAP, evidence suggestions, and patient summary. HIPAA-conscious: no audio stored.
-   **Clinician Customizable Supplement Library**: Clinicians can add, edit, and delete custom supplements with lab-value, symptom-based, or combined trigger rules.
-   **Supplement Pricing & Discount Settings**: Per-clinician discount settings applied to supplement orders.
-   **Clinician Lab Range Preferences**: Clinicians can override optimal and reference ranges for 60+ lab markers on a per-gender basis.
-   **Boulevard Appointment Sync (Zapier)**: Appointments flow into the app via Zapier webhooks for display on the Appointments page and patient portal.
-   **Medication Dictionary (CSV Upload)**: Clinicians can upload custom CSV medication dictionaries for detecting medications in encounter transcripts using a multi-pass matching engine.
-   **Stripe Billing & Subscriptions**: Full Stripe integration for clinician billing, including free trials, subscription management, and webhook handling. Registration requires payment method upfront (guest SetupIntent → atomic account + Stripe customer/subscription creation). BillingGate component enforces active subscription before accessing protected routes (fail-closed). Account/billing routes exempt from BillingGate to allow recovery.
-   **EHR-Style Patient Chart**: Persistent per-patient chart panel storing `currentMedications`, `medicalHistory`, `familyHistory`, `socialHistory`, `allergies`, `surgicalHistory` as JSONB arrays. Supports manual editing and AI-extraction from encounters.
-   **SOAP Note PDF Export with Clinical Letterhead**: Generates formatted medical documents with clinic letterhead, provider info, patient details, and SOAP content.
-   **Clinic Branding & Provider Signature Uploads**: Clinicians upload logo and signature images via Account Settings.
-   **Registration — Required Clinic Fields**: NPI, clinic phone, and clinic address are required at registration.
-   **Signed & Locked Chart Notes (EMR)**: Clinicians can electronically sign and lock SOAP notes, creating an immutable version snapshot and audit trail. Supports amendments.
-   **Enhanced SOAP Generation Prompt**: AI prompt includes mandatory clinical documentation rules for BMI, patient education, and patient-stated decisions.
-   **Smart Intake + Digital Forms Module**: Clinicians build and publish patient intake forms with a drag-and-drop field builder (16 field types). Forms are published via unique shareable links (`/f/:token`) requiring no patient login. Submissions are reviewed in the app and synced to the patient chart via a deduplication-aware sync engine. Forms tab added to patient profiles for per-patient submission history.

**Technology Stack:**
-   **Frontend**: React, TypeScript, Wouter, Shadcn UI, TanStack Query, Tailwind CSS, React Hook Form, Zod.
-   **Backend**: Express.js.
-   **Database**: PostgreSQL with Drizzle ORM (`drizzle-orm/node-postgres` + `pg` Pool).
-   **Design System**: Inter and JetBrains Mono fonts, professional blue color scheme, Material Design-inspired components.

## External Dependencies
-   **OpenAI**: For AI-powered recommendations, PDF text extraction, and summary generation.
-   **PostgreSQL**: Primary database.
-   **multer**: For handling file uploads (PDFs).
-   **jsPDF**: For programmatic generation of PDF reports.
-   **Resend API (Optional)**: For sending emails.
-   **Spruce, Klara (or other webhook-capable platforms)**: For external messaging system integration.
-   **Zapier**: For integrating with Boulevard for appointment synchronization.
-   **Stripe**: For billing and subscription management.