# ClinIQ Lab Interpretation - Multi-Tenant SaaS Platform

## Overview
ClinIQ is a multi-tenant SaaS platform for staff in men's and women's hormone and primary care clinics. It provides an isolated workspace for interpreting standard lab panels, applying clinical protocols, generating AI-powered recommendations, and identifying critical "red flag" values. The platform supports gender-specific lab interpretation, comprehensive patient wellness reports, and advanced risk assessments, aiming to streamline clinical decision-making and enhance patient care, ultimately improving clinical efficiency and patient outcomes.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The ClinIQ platform features comprehensive lab input, results display with color-coded status indicators, a red flag alert system, AI-powered recommendations, and a patient summary generator, all within a professional medical UI.

**Core Architectural Decisions and Features:**
-   **Multi-tenant SaaS**: Ensures isolated data for each clinician account using `clinic_id` scoping.
-   **Clinic-Centric Architecture**: Dedicated tables for `clinics`, `clinic_memberships`, `providers`, `patient_assignments`.
-   **Two-Layer Permission Model**: Independent `clinicalRole` and `adminRole` for fine-grained access control.
-   **AI Clinical Colleague Chat**: Floating "Ask ClinIQ" chat, patient-context-aware, providing evidence-backed recommendations with guideline citations.
-   **AI-Powered PDF Upload**: Extracts lab values from various PDF formats.
-   **Advanced Risk Assessments**: Integrates PREVENT Cardiovascular Risk, Advanced Lipid Marker Assessment, hs-CRP interpretation, and STOP-BANG Sleep Apnea Screening.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds with gender-specific logic (e.g., platelet interpretation, FIB-4 scoring).
-   **Female-Specific Workflows**: Dedicated features for female lab interpretation, including menstrual phase context and Female Testosterone Pattern Recognition.
-   **Insulin Resistance Screening**: Identifies likelihood and phenotypes with recommendations.
-   **AI-Generated SOAP Notes**: Creates chart-ready notes incorporating lab values, red flags, risk scores, and supplement recommendations through a multi-stage pipeline.
-   **Patient Profiles & Lab History Tracking**: Persistent patient profiles with searchable selection, lab history view, trend indicators, and charts for key markers.
-   **Patient Wellness PDF Report**: Generates comprehensive patient-facing wellness reports with AI-powered personalized recommendations.
-   **Clinician Customization**: Allows clinicians to customize supplement libraries, lab range preferences, and upload custom medication dictionaries.
-   **EHR-Style Patient Chart**: Persistent per-patient chart panel for `currentMedications`, `medicalHistory`, `familyHistory`, `socialHistory`, `allergies`, `surgicalHistory` as JSONB arrays, supporting manual editing and AI extraction.
-   **SOAP Note PDF Export with Clinical Letterhead**: Generates formatted medical documents with clinic branding.
-   **Clinic Branding & Provider Signature Uploads**: Clinicians can upload logos and signature images.
-   **Signed & Locked Chart Notes (EMR)**: Electronic signing and locking of SOAP notes for immutability, audit trails, and amendment support.
-   **Manual SOAP Notes**: Block-based note builder with 12 section types, supporting chart-mode editors and structured assessment/plan with ICD-10 search.
-   **Smart Intake + Digital Forms Module**: Clinicians can build, publish, and manage patient intake forms with 20 field types, smart field auto-linking to patient profiles, and patient portal access. Includes "Sync to Profile" review dialog for selective merging of clinical data.
-   **Lab Eval → Vital Trends Bridge**: Automatically persists and interprets systolic BP and BMI from lab evaluations into patient vitals, rendering them with color-coded status, red flags, and injecting them into AI recommendation prompts.
-   **Daily Check-In (Phase 2) — Vitals Monitoring Mode**: Clinician-directed BP/HR/weight tracking with configurable episodes, patient logging, and an alert engine for critical readings and missed logs.
-   **Daily Check-In (Phase 1) — Patient Tracking**: Optional, opt-in patient tracking with modules for Food, Sleep, Movement, Mood, Symptoms, Cycle, and Medications, generating clinician inbox notifications for significant events.
-   **Account Settings**: Comprehensive account management via sidebar navigation with role-based access.
-   **Patient-Safety Tripwires (Cross-Patient Write Prevention)**: Defense-in-depth against stale-state UI bugs writing to the wrong patient's chart. Every encounter mutation from the client stamps `expectedPatientId` in the request body; every server endpoint that writes to an encounter (`PUT /:id`, `PUT /:id/soap`, `PUT /:id/summary`, `POST /sign`, `/amend`, `/normalize`, `/extract`, `/match-patterns`, `/validate`, `/evidence`, `/publish`, `/unpublish`, `/generate-soap`, `/generate-summary`) parses it (400 if NaN), fetches the encounter, and returns 409 if the encounter's `patientId` doesn't match — short-circuiting before any database write or AI call. AudioCapture uses ref-based callbacks plus a `recordingStartPatientIdRef` snapshot and shows a banner+toast if the patient is switched mid-recording. The AI chat drawer clears messages on patient switch (including set→null), tags every chat request with `issuedForPatientId`, discards stale responses on `onSuccess`/`onError`, and aborts in-flight requests via `AbortController` (signal wired through `apiRequest`). SOAP-generation buttons are disabled while recording/transcribing or while patient changed during recording.

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