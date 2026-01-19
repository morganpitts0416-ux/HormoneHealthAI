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
-   **PREVENT Cardiovascular Risk Assessment (2023 AHA)**: Both men's and women's clinics now use the **official AHA PREVENT equations** with sex-specific coefficients extracted directly from the AHA Stata package (aha_prevent v1.0.0). This is a race-free model that predicts 10-year and 30-year risks for Total CVD, ASCVD, and Heart Failure. Uses logistic regression formula: `Risk = exp(LP) / (1 + exp(LP))`. **Validated to produce exact matches** with the official AHA PREVENT calculator (e.g., 36yo low-risk female: 0.5% 10yr ASCVD, 3.7% 30yr ASCVD - exact match). Variable transformations from official Stata code: age=(age-55)/10, non-HDL=TC*0.02586-HDL*0.02586-3.5 (mmol/L), HDL=(HDL*0.02586-1.3)/0.3, SBP spline at 110 with (sbp-110)/20 transformation, BMI spline at (bmi-25)/5 knot 1, eGFR spline at 60 with -x/15+4 transformation. Requires age, sex, systolic BP, total cholesterol, HDL, eGFR, BMI, diabetes, smoking, BP medication, and statin use. The 30-year predictions are only valid for ages 30-59. Located in `server/prevent-calculator.ts`.
-   **Advanced Lipid Marker Assessment**: Both clinics include ApoB and Lp(a) three-tier classification (normal/borderline/elevated) with adjusted risk assessment and risk reclassification logic. ApoB thresholds: <90 normal, 90-129 borderline, ≥130 elevated (mg/dL). Lp(a) thresholds: mg/dL (<40 normal, 40-49 borderline, ≥50 elevated); nmol/L (<75 normal, 75-124 borderline, ≥125 elevated). Unit detection: values >75 treated as nmol/L.
-   **hs-CRP Interpretation**: Uses standard mg/L units (<1.0 mg/L low risk, 1.0-3.0 mg/L moderate/borderline, >3.0 mg/L high, ≥10.0 mg/L critical/acute inflammation).
-   **STOP-BANG Sleep Apnea Screening**: Integrates an 8-component validated questionnaire for Obstructive Sleep Apnea (OSA) risk assessment, providing automated scoring, risk stratification, and clinical guidance.
-   **Clinical Logic Engine**: Implements standing orders and red flag thresholds for various conditions including erythrocytosis, testosterone optimization, lipid management, liver/kidney function, PSA tracking, glycemic control, and hormonal assessment, with gender-specific logic. Includes detailed platelet interpretation logic.
-   **Female-Specific Workflow**: Dedicated `/female` route with female-specific reference ranges, menstrual phase context for hormone interpretation (Follicular, Ovulatory, Luteal, Postmenopausal), and specific lab markers like AMH, Ferritin, Vitamin D, and B12.
-   **Frontend**: Built with React, TypeScript, Wouter for routing, Shadcn UI components, TanStack Query for data fetching, Tailwind CSS, and form validation using React Hook Form and Zod.
-   **Backend**: Uses Express.js and integrates with OpenAI for AI recommendations.
-   **Database**: PostgreSQL with Drizzle ORM for data persistence.
-   **Design System**: Employs Inter and JetBrains Mono fonts, a professional blue color scheme with medical-grade status colors, and Material Design-inspired components.
-   **Patient Wellness PDF Report (Women's Clinic)**: Generates comprehensive patient-facing wellness PDFs with AI-powered personalized diet, supplement, and lifestyle recommendations, and educational content.

## Metagenics Supplement Catalog (Clinic Inventory)

### Vitamin D Protocol (Both Clinics)
- **Deficient**: ≤30 ng/mL (≤20 is severe deficiency)
- **Insufficient**: 31-40 ng/mL
- **Suboptimal**: 41-59 ng/mL
- **Optimal**: ≥60 ng/mL

**Supplement Recommendations by Level**:
- **≤20 ng/mL (severe)**: Metagenics D3 10,000 + K
- **21-40 ng/mL (deficiency/insufficiency)**: Metagenics D3 5,000 + K
- **41-59 ng/mL (suboptimal)**: Metagenics D3 2000 Complex

### Women's Clinic Catalog (13 products)
The following Metagenics products are configured for the women's clinic in `server/supplements-female.ts`:

1. **HerWellness Estrovera** - Hormone-free menopause relief with ERr 731 rhubarb extract (1 tablet daily)
2. **Hemagenics** - Non-constipating iron with B12, B6, folate for red blood cell support (1 tablet daily)
3. **Intrinsi B12-Folate** - Methylcobalamin + folate with intrinsic factor for enhanced absorption (1 tablet daily)
4. **HerWellness Rapid Stress Relief** - Fast-acting L-Theanine + Lactium stress support chews (1 chew as needed)
5. **Vitamin D3 10,000 + K** - High-dose vitamin D with K2 for severe deficiency ≤20 ng/mL (1 softgel daily)
6. **Vitamin D3 5,000 + K** - Vitamin D with K2 for deficiency/insufficiency 21-40 ng/mL (1 softgel daily)
7. **D3 2000 Complex** - Maintenance vitamin D for suboptimal 41-59 ng/mL (1 tablet daily)
8. **Magtein Magnesium L-Threonate** - Brain-focused magnesium for sleep and cognitive support (3 capsules daily, divided)
9. **Adreset** - Adaptogen formula with Cordyceps, Ginseng, Rhodiola for adrenal support (2 capsules twice daily)
10. **Exhilarin** - Ayurvedic adaptogen blend for mood, energy, and stress tolerance (2 tablets daily)
11. **UltraFlora Complete Women's Probiotic** - 5-in-1 probiotic for vaginal, urinary, digestive health (1 capsule daily)
12. **NutraGems CoQ10 300** - Chewable 300mg CoQ10 for cardiovascular health, energy production (1 gel daily)
13. **OmegaGenics Fish Oil Neuro 1000** - High-DHA omega-3 (750mg DHA, 250mg EPA) for brain, heart, and joint health (1-2 softgels daily)

### Men's Clinic Catalog (11 products)
The following Metagenics products are configured for the men's clinic in `server/supplements-male.ts`:

1. **Testralin** - Testosterone support with botanical and nutrient formula for male vitality (2 tablets twice daily)
2. **UltraFlora Complete Probiotic** - Multi-strain probiotic for digestive and immune health (1 capsule daily)
3. **Vitamin D3 10,000 + K** - High-dose vitamin D with K2 for severe deficiency ≤20 ng/mL (1 softgel daily)
4. **Vitamin D3 5,000 + K** - Vitamin D with K2 for deficiency/insufficiency 21-40 ng/mL (1 softgel daily)
5. **D3 2000 Complex** - Maintenance vitamin D for suboptimal 41-59 ng/mL (1 tablet daily)
6. **Magtein Magnesium L-Threonate** - Brain-focused magnesium for sleep and cognitive support (3 capsules daily, divided)
7. **Adreset** - Adaptogen formula with Cordyceps, Ginseng, Rhodiola for adrenal/testosterone support (2 capsules twice daily)
8. **Exhilarin** - Ayurvedic adaptogen blend for mood, energy, and stress tolerance (2 tablets daily)
9. **NutraGems CoQ10 300** - Chewable 300mg CoQ10 for cardiovascular health, energy production (1 gel daily) - **Auto-recommended for patients 40+**
10. **OmegaGenics Fish Oil Neuro 1000** - High-DHA omega-3 (750mg DHA, 250mg EPA) for brain, heart, and joint health (1-2 softgels daily)
11. **OmegaGenics Fish Oil EPA-DHA 1000** - Balanced omega-3 (500mg EPA, 500mg DHA) for cardiac/neurologic support (1-2 softgels daily) - **Auto-recommended for patients 40+**

**Age-Based Recommendations**: For men 40 and over, OmegaGenics Fish Oil EPA-DHA 1000 and NutraGems CoQ10 300 are automatically recommended for overall cardiac and neurologic health maintenance.

**Note**: To add new Metagenics products to women's clinic, update `server/supplements-female.ts` and `client/src/lib/patient-pdf-export.ts`. For men's clinic, update `server/supplements-male.ts`.

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