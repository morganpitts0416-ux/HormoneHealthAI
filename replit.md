# ClinIQ Lab Interpretation - Multi-Tenant SaaS Platform

## Overview
ClinIQ is a multi-tenant SaaS platform for staff in men's and women's hormone and primary care clinics. Its primary function is to provide an isolated workspace for interpreting standard lab panels, applying clinical protocols, generating AI-powered recommendations, and identifying critical "red flag" values. The platform supports gender-specific lab interpretation, comprehensive patient wellness reports, and advanced risk assessments, aiming to streamline clinical decision-making, enhance patient care, and improve overall clinical efficiency and patient outcomes. The business vision is to become the leading AI-powered clinical decision support system for specialized health clinics, offering unparalleled accuracy, personalization, and operational efficiency, thereby expanding market potential in precision medicine and preventative care.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The ClinIQ platform offers comprehensive lab input, results display with color-coded status indicators, a red flag alert system, AI-powered recommendations, and a patient summary generator, all within a professional medical UI.

**Core Architectural Decisions and Features:**
-   **Multi-tenant SaaS Architecture**: Ensures isolated data for each clinician account using `clinic_id` scoping, with dedicated tables for `clinics`, `clinic_memberships`, `providers`, and `patient_assignments`.
-   **Two-Layer Permission Model**: Independent `clinicalRole` and `adminRole` for fine-grained access control.
-   **AI Integration**: Features include an AI Clinical Colleague Chat for patient-context-aware recommendations, AI-powered PDF upload for lab value extraction, and AI-generated SOAP Notes with a strict Review of Systems (ROS) format.
-   **Advanced Risk Assessments**: Integrates PREVENT Cardiovascular Risk, Advanced Lipid Marker Assessment, hs-CRP interpretation, and STOP-BANG Sleep Apnea Screening.
-   **Clinical Logic Engine**: Implements standing orders and gender-specific red flag thresholds.
-   **Gender-Specific Workflows**: Dedicated features for female lab interpretation, including menstrual phase context and Female Testosterone Pattern Recognition. Insulin Resistance Screening is also included.
-   **Patient Management**: Persistent patient profiles with lab history tracking, trend indicators, and charts. Patient Wellness PDF Reports are also generated.
-   **Clinician Customization**: Allows customization of supplement libraries, lab range preferences, and medication dictionaries.
-   **EHR-Style Patient Chart**: Persistent per-patient chart panel for medical history, medications, allergies, etc., supporting manual editing and AI extraction.
-   **Document Management**: SOAP Note PDF Export with clinical letterhead, clinic branding, provider signature uploads, and electronic signing/locking of chart notes for immutability.
-   **Manual SOAP Notes**: Block-based note builder with chart-mode editors and structured assessment/plan with ICD-10 search.
-   **Smart Intake + Digital Forms Module**: Clinicians can build and manage patient intake forms with smart field auto-linking and patient portal access.
-   **Vitals Integration**: Lab evaluations automatically persist and interpret systolic BP and BMI into patient vitals, with color-coded status and red flags.
-   **Daily Check-In & Vitals Monitoring**: Optional patient tracking for food, sleep, mood, etc., and clinician-directed BP/HR/weight tracking with an alert engine.
-   **Patient-Safety Tripwires**: Defense-in-depth against cross-patient data writes using `expectedPatientId` for server-side validation.
-   **Global Recording Context**: Audio recording persists across navigation via a `RecordingProvider` and `FloatingRecorderDock`.
-   **Dashboard**: Displays "Open SOAP Notes" and allows resuming existing notes.
-   **Patient Portal**: Interactive Home & HealthIQ Hub with dedicated pages for labs, visit summaries, protocols, recipes, messages, and medication refill requests (chart meds with checkboxes plus add-your-own form). Account access lives only in the top-right avatar menu. Includes patient self-service for contact info and document downloads.
-   **Portal Publish — Patient-Specific Dietary Guidance**: When a clinician publishes a lab to the patient portal, the dietary recommendations textarea auto-populates with foods tied to that patient's specific lab values (e.g. "Oats - to lower your LDL of 165 mg/dL"). Generated directly from each lab's interpretations, measured values, red flags, and supplements — never from a second-pass extraction of staff-facing text. Endpoint enforces clinic/clinician ownership of the lab before generation.
-   **UI/UX**: Professional blue color scheme, Material Design-inspired components, Inter and JetBrains Mono fonts. React, TypeScript, Wouter, Shadcn UI, TanStack Query, Tailwind CSS, React Hook Form, Zod for frontend; Express.js for backend; PostgreSQL with Drizzle ORM for database.

## External Dependencies
-   **OpenAI**: AI-powered recommendations, PDF text extraction, summary generation, and multi-stage SOAP note pipeline.
-   **PostgreSQL**: Primary database.
-   **multer**: File uploads.
-   **jsPDF**: PDF report generation.
-   **Resend API**: Email sending.
-   **Stripe**: Billing and subscription management.
-   **Metagenics**: Supplement catalog integration.