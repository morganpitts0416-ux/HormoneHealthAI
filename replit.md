# ClinIQ Lab Interpretation - Multi-Tenant SaaS Platform

## Overview
ClinIQ is a multi-tenant SaaS platform designed for staff in men's and women's hormone and primary care clinics. Its core purpose is to provide an isolated workspace for interpreting standard lab panels, applying clinical protocols, generating AI-powered recommendations, and identifying critical "red flag" values. The platform supports gender-specific lab interpretation, comprehensive patient wellness reports, and advanced risk assessments, aiming to streamline clinical decision-making, enhance patient care, and improve overall clinical efficiency and patient outcomes.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The ClinIQ platform offers comprehensive lab input, results display with color-coded status indicators, a red flag alert system, AI-powered recommendations, and a patient summary generator, all within a professional medical UI.

**Core Architectural Decisions and Features:**
-   **Multi-tenant SaaS**: Ensures isolated data for each clinician account using `clinic_id` scoping.
-   **Clinic-Centric Architecture**: Dedicated tables for `clinics`, `clinic_memberships`, `providers`, `patient_assignments`.
-   **Two-Layer Permission Model**: Independent `clinicalRole` and `adminRole` for fine-grained access control.
-   **AI Clinical Colleague Chat**: Floating "Ask ClinIQ" chat, patient-context-aware, providing evidence-backed recommendations with guideline citations.
-   **AI-Powered PDF Upload**: Extracts lab values from various PDF formats.
-   **Advanced Risk Assessments**: Integrates PREVENT Cardiovascular Risk, Advanced Lipid Marker Assessment, hs-CRP interpretation, and STOP-BANG Sleep Apnea Screening.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds with gender-specific logic.
-   **Female-Specific Workflows**: Dedicated features for female lab interpretation, including menstrual phase context and Female Testosterone Pattern Recognition.
-   **Insulin Resistance Screening**: Identifies likelihood and phenotypes with recommendations.
-   **AI-Generated SOAP Notes**: Creates chart-ready notes incorporating lab values, red flags, risk scores, and supplement recommendations through a multi-stage pipeline, enforcing a strict Review of Systems (ROS) format.
-   **Patient Profiles & Lab History Tracking**: Persistent patient profiles with searchable selection, lab history view, trend indicators, and charts for key markers.
-   **Patient Wellness PDF Report**: Generates comprehensive patient-facing wellness reports with AI-powered personalized recommendations.
-   **Clinician Customization**: Allows clinicians to customize supplement libraries, lab range preferences, and upload custom medication dictionaries.
-   **EHR-Style Patient Chart**: Persistent per-patient chart panel for `currentMedications`, `medicalHistory`, `familyHistory`, `socialHistory`, `allergies`, `surgicalHistory` as JSONB arrays, supporting manual editing and AI extraction.
-   **SOAP Note PDF Export with Clinical Letterhead**: Generates formatted medical documents with clinic branding.
-   **Clinic Branding & Provider Signature Uploads**: Clinicians can upload logos and signature images.
-   **Signed & Locked Chart Notes (EMR)**: Electronic signing and locking of SOAP notes for immutability, audit trails, and amendment support.
-   **Manual SOAP Notes**: Block-based note builder with 12 section types, supporting chart-mode editors and structured assessment/plan with ICD-10 search.
-   **Smart Intake + Digital Forms Module**: Clinicians can build, publish, and manage patient intake forms with 20 field types, smart field auto-linking to patient profiles, and patient portal access, including a "Sync to Profile" review dialog.
-   **Lab Eval → Vital Trends Bridge**: Automatically persists and interprets systolic BP and BMI from lab evaluations into patient vitals, rendering them with color-coded status, red flags, and injecting them into AI recommendation prompts.
-   **Daily Check-In (Phase 1) — Patient Tracking**: Optional, opt-in patient tracking with modules for Food, Sleep, Movement, Mood, Symptoms, Cycle, and Medications, generating clinician inbox notifications for significant events via a guided multi-step "moments" wizard. This includes a menstrual cycle tracker with symptom and flow details, and utilizes patient-friendly labeled chip scales for numerical inputs.
-   **Daily Check-In (Phase 2) — Vitals Monitoring Mode**: Clinician-directed BP/HR/weight tracking with configurable episodes, patient logging, and an alert engine for critical readings and missed logs.
-   **Account Settings**: Comprehensive account management via sidebar navigation with role-based access.
-   **Patient Profile Layout (account-style sub-nav)**: Patient list collapses to a 12px rail by default, and the patient-specific view uses an account-style left sub-navigation with sections for Overview, Portal & Messages, Active Monitoring, Encounters, Labs, PREVENT Calc, and Documents. The right-column content uses generous bottom padding so the floating "Ask ClinIQ" button doesn't overlap card content.
-   **Inline PREVENT Calculator**: The AHA PREVENT cardiovascular risk calculator renders inline within the patient profile (no modal), with an "Import from latest labs & vitals" button that pre-fills systolic BP, total cholesterol, HDL, LDL, eGFR, and BMI from the most recent lab interpretation and clinic vitals. Implemented as a reusable `PreventCalculatorPanel` (with a thin `PreventCalculatorDialog` wrapper retained for legacy callsites). Stale-response guard prevents an in-flight import for one patient from poisoning the form when the user switches patients mid-fetch.
-   **Active Monitoring Calendar**: The patient-profile Active Monitoring section displays a month calendar (with prev/next/Today nav) where each day cell shows a colored dot per check-in (green = normal, amber = concerning, rose = unexpected bleeding), a heart icon when the patient self-logged a vital that day, and a pill icon when meds were logged. Clicking a day opens a detail dialog with mood/energy, sleep, food, movement, symptoms & cycle, weight, notes, and a per-day medication adherence list. The redundant "Patient-added" stat tile was replaced with an "Adherence streak" tile (consecutive days with no skipped/missed meds).
-   **Unified Vitals Dialog**: A single entry point for all vital signs, displaying both clinic-recorded and patient-logged data from the shared `patient_vitals` table, with distinct color-coding and iconography for each source. It includes active monitoring episode banners, source badges, and an EMR-style flowsheet History view (rows = vital metrics like BP/HR/WT/HT/BMI, columns = visit dates oldest→newest, sticky vital-label and trend columns, inline Recharts sparkline per row). A "Time Window" selector defaults to Last 6 months and also offers Last 12 months / All Data; a per-row click expands an inline single-metric drilldown chart that distinguishes clinic vs patient-logged points by dot shape (filled vs hollow). Patient-reported cells render in italic amber; abnormal cells (BP Stage 1/2, HR <40 / >120, BMI ≥35 / <16) render bold red on a light-red wash. A bottom color key documents the source + abnormal conventions, and a collapsible "Manage entries" details disclosure preserves per-visit deletion (clinic-entered only — patient-logged readings remain audit-locked). The legacy big-graph trends dialog is preserved for the patient wellness PDF and a "View Trends" footer button.
-   **Patient-Safety Tripwires (Cross-Patient Write Prevention)**: Defense-in-depth against stale-state UI bugs, using `expectedPatientId` in requests and server-side validation to prevent writes to the wrong patient's chart. Includes specific safeguards for AI chat and audio recording.

**Technology Stack:**
-   **Frontend**: React, TypeScript, Wouter, Shadcn UI, TanStack Query, Tailwind CSS, React Hook Form, Zod.
-   **Backend**: Express.js.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Design System**: Inter and JetBrains Mono fonts, professional blue color scheme, Material Design-inspired components.

## External Dependencies
-   **OpenAI**: AI-powered recommendations, PDF text extraction, summary generation, and multi-stage SOAP note pipeline.
-   **PostgreSQL**: Primary database for all application data.
-   **multer**: Middleware for handling file uploads.
-   **jsPDF**: Programmatic generation of PDF reports.
-   **Resend API**: Optional email sending.
-   **Stripe**: Billing and subscription management for clinicians.
-   **Metagenics**: Supplement catalog integration.