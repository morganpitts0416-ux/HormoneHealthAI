# Lab Interpretation Tool - Men's & Women's Clinics

## Overview
This tool is a clinical lab interpretation application for staff in men's and women's hormone and primary care clinics. Its core purpose is to efficiently interpret standard lab panels, apply clinical protocols, generate AI-powered recommendations, and identify critical "red flag" values for immediate physician attention. The project supports gender-specific lab interpretation, including female-specific reference ranges and menstrual phase context, aiming to improve diagnostic accuracy and patient care. It provides comprehensive patient wellness reports and integrates advanced risk assessments like the AHA PREVENT model.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The application features a comprehensive lab input form, results display with color-coded status indicators, a red flag alert system, AI-powered recommendations, and a patient summary generator. It supports a professional medical UI design with Inter/JetBrains Mono fonts and responsive layouts.

Key architectural decisions and features include:

-   **AI-Powered PDF Upload**: Automatic lab value extraction and form pre-filling from Pathgroup and hospital PDFs (up to 10MB).
-   **PREVENT Cardiovascular Risk Assessment (2023 AHA)**: Implements official AHA PREVENT equations for 10-year and 30-year risks for Total CVD, ASCVD, and Heart Failure, validated to produce exact matches with the official calculator. It is a race-free model using logistic regression with specific variable transformations.
-   **Advanced Lipid Marker Assessment**: Includes ApoB and Lp(a) assessment with adjusted risk and reclassification logic based on specific thresholds and unit detection.
-   **hs-CRP Interpretation**: Standard interpretation based on mg/L units for risk stratification.
-   **STOP-BANG Sleep Apnea Screening**: Integrates an 8-component questionnaire for OSA risk assessment, scoring, and clinical guidance.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds for various conditions (e.g., erythrocytosis, testosterone optimization, lipid management, liver/kidney function, PSA tracking, glycemic control, hormonal assessment) with gender-specific logic, including detailed platelet interpretation and FIB-4 scoring.
-   **Female Testosterone Pattern Recognition**: Defines four clinical optimization patterns (SHBG Trap, Low SHBG/High Activity, Supraphysiologic, Adequate Androgens/Persistent Symptoms) using SHBG, Free T, Bioavailable T, and Total T context.
-   **Female-Specific Workflow**: Dedicated route with female-specific reference ranges, menstrual phase context for hormone interpretation, and specific lab markers (e.g., AMH, Ferritin, Vitamin D, B12, SHBG, Free Testosterone, Bioavailable Testosterone).
-   **Insulin Resistance Screening**: Screens six metabolic markers to identify likelihood and four phenotypes (Visceral/Metabolic, Hepatic, Hormonal/PCOS-Type, Early/Lean), each with trigger criteria, pathophysiology, treatment recommendations, monitoring, and patient-facing explanations.
-   **AI-Generated SOAP Notes**: Creates chart-ready SOAP notes (Subjective, Objective, Assessment, Plan) incorporating lab values, red flags, risk scores, IR screening, and supplement recommendations, with copy-to-clipboard functionality and inclusion in provider PDFs.
-   **Patient Profiles & Lab History Tracking**: Persistent patient profiles with searchable patient selection, lab history view with trend indicators, and auto-save/manual save features. AI utilizes historical data for trend-aware recommendations and SOAP note generation.
-   **Lab Trend Charts**: Interactive Recharts-based line charts (`client/src/components/patient-trend-charts.tsx`) showing patient lab value trends over time for 21 markers grouped by category (Lipids, Metabolic, Hormones, Thyroid, Inflammation, CBC, Nutrients). Charts appear in the UI when a patient has 2+ lab results, with filterable group badges and goal/reference lines. Trend charts are also rendered natively in Patient Wellness PDFs (`client/src/lib/pdf-trend-charts.ts`) using jsPDF drawing primitives when patient lab history is available.
-   **Smoking Cessation Education**: Includes a smoking cessation section in patient wellness PDFs with health benefits timeline and resources for current smokers.
-   **Frontend**: Built with React, TypeScript, Wouter for routing, Shadcn UI components, TanStack Query for data fetching, Tailwind CSS, and form validation using React Hook Form and Zod.
-   **Backend**: Uses Express.js.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Design System**: Employs Inter and JetBrains Mono fonts, a professional blue color scheme with medical-grade status colors, and Material Design-inspired components.
-   **Patient Wellness PDF Report (Women's Clinic)**: Generates comprehensive patient-facing wellness PDFs with AI-powered personalized diet, supplement, and lifestyle recommendations, and educational content.
-   **Metagenics Supplement Catalog**: Integrates a catalog of Metagenics supplements for both men's and women's clinics, with specific recommendation logic based on lab values, symptoms, and detected phenotypes (e.g., Vitamin D protocol, women's phenotype-driven recommendations, men's age-based recommendations). The women's supplement system uses a layered architecture for phenotype detection, supplement matching, prioritization, and explanation.

## External Dependencies
-   **OpenAI**: For AI-powered recommendations, PDF text extraction, and summary generation.
-   **PostgreSQL**: Primary database.
-   **Drizzle ORM**: Database interaction.
-   **multer**: For handling PDF uploads.
-   **jsPDF**: For generating PDF reports.
-   **Wouter**: Frontend routing.
-   **Shadcn UI**: UI component library.
-   **TanStack Query**: Data fetching and state management.
-   **Zod**: Schema validation.