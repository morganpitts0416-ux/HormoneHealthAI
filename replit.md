# Lab Interpretation Tool - Men's & Women's Clinics

## Overview
This tool is a clinical lab interpretation application designed for staff in men's and women's hormone and primary care clinics. Its primary function is to efficiently interpret standard lab panels, apply clinical protocols, generate AI-powered recommendations, and identify critical "red flag" values requiring immediate physician attention. The project supports gender-specific lab interpretation, including female-specific reference ranges and menstrual phase context for hormone interpretation, aiming to improve diagnostic accuracy and patient care.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The application features a comprehensive lab input form, a results display with color-coded status indicators, a red flag alert system, and an AI-powered recommendations display. It also includes a patient summary generator with editing and copy functionality, and a professional medical UI design with Inter/JetBrains Mono fonts and responsive layouts. Key architectural decisions and features include:

-   **AI-Powered PDF Upload**: Automatic lab value extraction and form pre-filling from Pathgroup and hospital PDFs using OpenAI, supporting files up to 10MB.
-   **PREVENT Cardiovascular Risk Assessment (2023 AHA)**: For the women's clinic, calculates cardiovascular risk using the 2023 AHA PREVENT equations - a race-free model that predicts 10-year and 30-year risks for Total CVD, ASCVD, and Heart Failure. Uses logistic regression formula: `Risk = exp(LP) / (1 + exp(LP))`. Calibrated to match official AHA PREVENT calculator (validated: 50yo female high-risk case → 16.3% 10yr, 51.4% 30yr CVD). Variable transformations include age centering at 55/10, cholesterol centering at 3.5 mmol/L, SBP piecewise with knot at 110, BMI piecewise with knot at 30, eGFR piecewise with knot at 60. Requires age, sex, systolic BP, total cholesterol, HDL, eGFR, BMI, diabetes, smoking, BP medication, and statin use. The 30-year predictions are only valid for ages 30-59. Located in `server/prevent-calculator.ts`.
-   **Legacy ASCVD Risk Assessment (Men's Clinic)**: For the men's clinic, still uses the 2013 ACC/AHA Pooled Cohort Equations for 10-year heart attack/stroke risk. Includes CAC scoring recommendations based on ACC/AHA guidelines and statin discussion triggers.
-   **STOP-BANG Sleep Apnea Screening**: Integrates an 8-component validated questionnaire for Obstructive Sleep Apnea (OSA) risk assessment, providing automated scoring, risk stratification, and clinical guidance.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds for various conditions including erythrocytosis, testosterone optimization, lipid management, liver/kidney function, PSA tracking, glycemic control, and hormonal assessment, with gender-specific logic. Includes detailed platelet interpretation logic.
-   **Female-Specific Workflow**: Dedicated `/female` route with female-specific reference ranges, menstrual phase context for hormone interpretation (Follicular, Ovulatory, Luteal, Postmenopausal), and specific lab markers like AMH, Ferritin, Vitamin D, and B12.
-   **Frontend**: Built with React, TypeScript, Wouter for routing, Shadcn UI components, TanStack Query for data fetching, Tailwind CSS, and form validation using React Hook Form and Zod.
-   **Backend**: Uses Express.js and integrates with OpenAI for AI recommendations.
-   **Database**: PostgreSQL with Drizzle ORM for data persistence.
-   **Design System**: Employs Inter and JetBrains Mono fonts, a professional blue color scheme with medical-grade status colors, and Material Design-inspired components.
-   **Patient Wellness PDF Report (Women's Clinic)**: Generates comprehensive patient-facing wellness PDFs with AI-powered personalized diet, supplement, and lifestyle recommendations, and educational content.

## Metagenics Supplement Catalog (Clinic Inventory)
The following 12 Metagenics products are configured in the system. These are the only products that will be recommended:

1. **HerWellness Estrovera** - Hormone-free menopause relief with ERr 731 rhubarb extract (1 tablet daily)
2. **Hemagenics** - Non-constipating iron with B12, B6, folate for red blood cell support (1 tablet daily)
3. **Intrinsi B12-Folate** - Methylcobalamin + folate with intrinsic factor for enhanced absorption (1 tablet daily)
4. **HerWellness Rapid Stress Relief** - Fast-acting L-Theanine + Lactium stress support chews (1 chew as needed)
5. **Vitamin D3 10,000 + K** - High-dose vitamin D with K2 for deficiency repletion (1 softgel daily)
6. **Vitamin D3 5,000 + K** - Maintenance vitamin D with K2 for bone/immune support (1 softgel daily)
7. **Magtein Magnesium L-Threonate** - Brain-focused magnesium for sleep and cognitive support (3 capsules daily, divided)
8. **Adreset** - Adaptogen formula with Cordyceps, Ginseng, Rhodiola for adrenal support (2 capsules twice daily)
9. **Exhilarin** - Ayurvedic adaptogen blend for mood, energy, and stress tolerance (2 tablets daily)
10. **UltraFlora Complete Women's Probiotic** - 5-in-1 probiotic for vaginal, urinary, digestive health (1 capsule daily)
11. **NutraGems CoQ10 300** - Chewable 300mg CoQ10 for cardiovascular health, energy production (1 gel daily)
12. **OmegaGenics Fish Oil Neuro 1000** - High-DHA omega-3 (750mg DHA, 250mg EPA) for brain, heart, and joint health (1-2 softgels daily)

**Note**: To add new Metagenics products, update both `server/supplements-female.ts` (clinical logic) and `client/src/lib/patient-pdf-export.ts` (PDF display).

## External Dependencies
-   **OpenAI**: Used for AI-powered recommendations, intelligent text extraction from PDFs, and generating patient-friendly summaries and wellness plans.
-   **PostgreSQL**: The primary database for storing patient and lab result data.
-   **Drizzle ORM**: Used for interacting with the PostgreSQL database.
-   **multer**: Node.js middleware for handling `multipart/form-data` for PDF uploads.
-   **jsPDF**: Client-side JavaScript library for generating PDF documents, used for exporting reports.
-   **Wouter**: Lightweight client-side router for React.
-   **Shadcn UI**: A collection of re-usable UI components.
-   **TanStack Query**: For data fetching, caching, and state management.
-   **Zod**: For schema declaration and validation.