# ClinIQ Lab Interpretation - Multi-Tenant SaaS Platform

## Overview
ClinIQ is a multi-tenant SaaS platform designed for staff in men's and women's hormone and primary care clinics. It provides an isolated workspace for each clinician to interpret standard lab panels, apply clinical protocols, generate AI-powered recommendations, and identify critical "red flag" values. The platform supports gender-specific lab interpretation, comprehensive patient wellness reports, and advanced risk assessments, aiming to streamline clinical decision-making and enhance patient care.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

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

**Technology Stack:**
-   **Frontend**: React, TypeScript, Wouter (routing), Shadcn UI (components), TanStack Query (data fetching), Tailwind CSS, React Hook Form and Zod (form validation).
-   **Backend**: Express.js.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Design System**: Inter and JetBrains Mono fonts, professional blue color scheme, Material Design-inspired components.

## External Dependencies
-   **OpenAI**: For AI-powered recommendations, PDF text extraction, and summary generation.
-   **PostgreSQL**: Primary database for data storage.
-   **multer**: For handling file uploads, specifically PDFs.
-   **jsPDF**: For programmatic generation of PDF reports.
-   **Resend API (Optional)**: For sending emails (clinician invites, password resets).
-   **Spruce, Klara (or other webhook-capable platforms)**: For external messaging system integration.