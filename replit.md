# ClinIQ Lab Interpretation - Multi-Tenant SaaS Platform

## Overview
ClinIQ is a multi-tenant SaaS platform designed for staff in men's and women's hormone and primary care clinics. It provides an isolated workspace for clinicians to interpret standard lab panels, apply clinical protocols, generate AI-powered recommendations, and identify critical "red flag" values. The platform supports gender-specific lab interpretation, comprehensive patient wellness reports, and advanced risk assessments, aiming to streamline clinical decision-making and enhance patient care. The business vision is to improve clinical efficiency and patient outcomes in hormone and primary care.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The ClinIQ platform features comprehensive lab input, results display with color-coded status indicators, a red flag alert system, AI-powered recommendations, and a patient summary generator, all within a professional medical UI.

**Core Architectural Decisions and Features:**
-   **Multi-tenant SaaS**: Ensures isolated data for each clinician account using `clinic_id` scoping for all patient data.
-   **Clinic-Centric Architecture**: Dedicated tables for `clinics`, `clinic_memberships`, `providers`, `patient_assignments`. New user registration automatically provisions a new clinic.
-   **Two-Layer Permission Model**: Independent `clinicalRole` (provider/rn/staff) and `adminRole` (owner/admin/limited_admin/standard) for fine-grained access control.
-   **Per-Provider Account Settings Scoping**: Limits access to clinic-wide settings based on `adminRole`.
-   **Authentication & Authorization**: Session-based with `express-session`, `passport-local`, and `bcrypt`. Role-based restrictions for staff.
-   **Ask ClinIQ — AI Clinical Colleague Chat**: Floating "Ask ClinIQ" chat drawer (bottom-right) on all authenticated pages. AI speaks as a clinical colleague, not a generic chatbot. Patient-context-aware: when a patient is selected on Lab Interpretation, Female Lab Interpretation, or Patient Profiles pages, the chat automatically loads the patient's chart data, medications, allergies, medical/surgical/family/social history, and most recent lab values. Uses the clinic's optimized functional ranges, red flag thresholds, ASCVD/PREVENT calculators, STOP-BANG, insulin resistance phenotypes, and Metagenics supplement protocols as reference. All recommendations are evidence-backed with guideline citations. Quick-start badges for common queries. `PatientContextProvider` in `client/src/hooks/use-patient-context.tsx` shares selected-patient state across pages. Backend: `POST /api/ai-chat` with `{ messages, patientId? }`. Frontend: `client/src/components/ai-chat-drawer.tsx`.
-   **AI-Powered PDF Upload**: Extracts lab values from various PDF formats.
-   **Advanced Risk Assessments**: Integrates PREVENT Cardiovascular Risk, Advanced Lipid Marker Assessment, and hs-CRP interpretation.
-   **STOP-BANG Sleep Apnea Screening**: 8-component questionnaire.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds with gender-specific logic, including platelet interpretation and FIB-4 scoring.
-   **Female-Specific Workflows**: Dedicated features for female lab interpretation, including menstrual phase context and Female Testosterone Pattern Recognition.
-   **Insulin Resistance Screening**: Identifies likelihood and phenotypes with recommendations.
-   **AI-Generated SOAP Notes**: Creates chart-ready notes incorporating lab values, red flags, risk scores, and supplement recommendations through a multi-stage pipeline.
-   **Patient Profiles & Lab History Tracking**: Persistent patient profiles with searchable selection, lab history view, trend indicators, and charts for key markers.
-   **Patient Wellness PDF Report**: Generates comprehensive patient-facing wellness reports with AI-powered personalized recommendations.
-   **Clinician Customizable Supplement Library**: Allows clinicians to add, edit, and delete custom supplements with trigger rules.
-   **Clinician Lab Range Preferences**: Clinicians can override optimal and reference ranges for 60+ lab markers per gender.
-   **Medication Dictionary**: Clinicians can upload custom CSV medication dictionaries for detection in encounter transcripts.
-   **Stripe Billing & Subscriptions**: Full integration for clinician billing, subscription management, and seat-count enforcement for provider invites.
-   **EHR-Style Patient Chart**: Persistent per-patient chart panel for `currentMedications`, `medicalHistory`, `familyHistory`, `socialHistory`, `allergies`, `surgicalHistory` as JSONB arrays, supporting manual editing and AI extraction.
-   **SOAP Note PDF Export with Clinical Letterhead**: Generates formatted medical documents with clinic branding.
-   **Clinic Branding & Provider Signature Uploads**: Clinicians can upload logos and signature images.
-   **Signed & Locked Chart Notes (EMR)**: Electronic signing and locking of SOAP notes for immutability and audit trails, with amendment support.
-   **Smart Intake + Digital Forms Module**: Clinicians can build, publish, and manage patient intake forms with 16 field types, smart field auto-linking to patient profiles, and patient portal access. Supports form reassignment and patient profile merging.
-   **Account Settings — Sidebar Navigation**: Comprehensive account management via a sidebar navigation with role-based access.

**Technology Stack:**
-   **Frontend**: React, TypeScript, Wouter, Shadcn UI, TanStack Query, Tailwind CSS, React Hook Form, Zod.
-   **Backend**: Express.js.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Design System**: Inter and JetBrains Mono fonts, professional blue color scheme, Material Design-inspired components.

## External Dependencies
-   **OpenAI**: AI-powered recommendations, PDF text extraction, summary generation, and multi-stage SOAP note pipeline (Whisper for transcription).
-   **PostgreSQL**: Primary database for all application data.
-   **multer**: Middleware for handling file uploads (e.g., PDFs).
-   **jsPDF**: Programmatic generation of PDF reports.
-   **Resend API**: Optional email sending (e.g., for form links, password resets).
-   **Spruce, Klara (or other webhook-capable platforms)**: Integration for external messaging systems.
-   **Zapier**: Integration with Boulevard for appointment synchronization.
-   **Stripe**: Billing and subscription management for clinicians.
-   **Metagenics**: Supplement catalog integration for recommendations.