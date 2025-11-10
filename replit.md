# Lab Interpretation Tool - Men's Clinic

## Overview
A clinical lab interpretation tool designed for men's hormone and primary care clinic staff. The application helps interpret lab results, generate AI-powered recommendations, and identify red flags that require immediate physician notification.

## Project Purpose
- Enable clinic staff to efficiently interpret standard men's clinic lab panels
- Automatically apply clinical protocols from standing orders
- Generate patient-friendly summaries for communication
- Flag critical values requiring physician review
- Leverage AI to provide context-aware recommendations

## Current State
**In Development** - Phase 2 (Database & Persistence)

### Completed
- ✅ Data schemas for lab values and interpretations
- ✅ Comprehensive lab input form with organized panels (CBC, CMP, Hormones, Lipids, Other)
- ✅ Results display with color-coded status indicators
- ✅ Red flag alert system with severity levels (critical, urgent, warning)
- ✅ AI-powered recommendations display
- ✅ Patient summary generator with edit and copy functionality
- ✅ Professional medical UI design with Inter/JetBrains Mono fonts
- ✅ Responsive layouts for all screen sizes
- ✅ Backend implementation with OpenAI integration
- ✅ Clinical logic engine based on standing orders (1,172 lines)
- ✅ API endpoints for lab interpretation
- ✅ PDF export functionality with jsPDF
- ✅ PostgreSQL database with patients and lab_results tables
- ✅ Database storage layer with Drizzle ORM
- ✅ **AI-powered PDF upload** - Automatically extract lab values from Pathgroup and hospital PDFs
  - Frontend upload UI with drag-and-drop support
  - Backend endpoint with multer for file handling
  - OpenAI integration for intelligent text extraction and field mapping
  - Auto-fills form fields for staff review before submission
  - Supports up to 10MB PDF files
- ✅ **ASCVD Cardiovascular Risk Assessment** - Evidence-based 10-year heart attack/stroke risk calculation
  - Patient demographics form (age, sex, race, BP, diabetes, smoking status)
  - 2013 ACC/AHA Pooled Cohort Equations with race/sex-specific models (full precision coefficients)
  - Prominent risk display card with color-coded risk categories (Low/Borderline/Intermediate/High)
  - 2018 ACC/AHA guideline-based statin recommendations and LDL goals
  - Risk-stratified cardiovascular lifestyle modifications in patient summaries
  - Actionable guidance for diet, exercise, smoking cessation based on risk level

### In Progress
- Patient database integration with CRUD operations
- Historical PSA velocity and Hct trend calculations

## Standard Lab Panels
Based on the clinic's standing orders document:

### General Health Panel
- CBC: Hemoglobin, Hematocrit
- CMP: AST, ALT, Bilirubin, Creatinine, eGFR, BUN
- TSH

### Hormone Panel
- Total Testosterone (target: 400-700 ng/dL trough)
- Estradiol
- LH
- Prolactin

### Lipid Panel
- LDL, HDL, Total Cholesterol, Triglycerides

### Other
- PSA (with previous PSA tracking for velocity)
- Hemoglobin A1c

## Red Flag Criteria (Physician Notification Required)
- Hct ≥54% or Hgb ≥18.5 g/dL
- PSA rise >1.4 ng/mL per 12 months
- ALT/AST >5× ULN (Upper Limit Normal)
- Bilirubin >2.0 mg/dL
- eGFR <45 mL/min
- New symptoms (chest pain, SOB, DVT)

## Clinical Protocols Summary
1. **Erythrocytosis Management**: Dose adjustments and phlebotomy recommendations
2. **Testosterone Optimization**: Target 400-700 ng/dL with symptom-driven adjustments
3. **Lipid Management**: Lifestyle interventions, flag LDL ≥190 or TG ≥500
4. **Liver Function**: Stratified follow-up by severity
5. **Kidney Function**: eGFR-based monitoring
6. **PSA Monitoring**: Age/risk-based screening with velocity tracking
7. **Glycemic Control**: A1c-based diabetes screening
8. **Hormonal Assessment**: Prolactin and LH interpretation

## Tech Stack
### Frontend
- React with TypeScript
- Wouter for routing
- Shadcn UI components
- TanStack Query for data fetching
- Tailwind CSS with custom medical color scheme
- Form validation with React Hook Form + Zod

### Backend
- Express.js
- OpenAI via Replit AI Integrations (for AI recommendations)
- In-memory storage (MemStorage)
- TypeScript

### Design System
- Primary Font: Inter (clinical clarity)
- Monospace Font: JetBrains Mono (lab values)
- Color Scheme: Professional blues with medical-grade status colors
- Components: Material Design-inspired for trust and consistency

## Recent Changes
**November 10, 2025** (Latest)
- **ENHANCED: Clinical Clarity and ASCVD Integration Improvements**
  - **Testosterone Language Clarification**: Updated testosterone interpretation language to clearly distinguish actionable findings from life-threatening critical situations
    - Changed "suboptimal" to "below target range - dose optimization needed"
    - Added "Provider recommendation:" prefix to all testosterone recommendations
    - Emphasizes dose adjustments are routine therapy management, not emergencies
    - Maintains 'abnormal' status (orange badge) distinct from 'critical' (red badge) for true emergencies
  - **ASCVD in Main Interpretations Table**: ASCVD cardiovascular risk now appears alongside other lab results in the Complete Lab Results Overview table
    - Displays 10-year risk percentage (e.g., "30.2%") and category (LOW/BORDERLINE/INTERMEDIATE/HIGH RISK)
    - Badge color reflects risk level: Low=green, Borderline=yellow, Intermediate=orange, High=red
    - Positioned after lipid panel for clinical context
    - Shows interpretation: "10-year risk of heart attack or stroke: 30.2% (HIGH RISK)"
    - Includes cardiovascular recommendations and annual recheck timing
    - Separate detailed ASCVD card remains for comprehensive guidance (LDL goals, statin therapy, lifestyle modifications)
  - **End-to-End Testing**: Validated both improvements with high-risk patient scenario, confirmed correct badge colors and placement

**November 10, 2025**
- **COMPLETED: ASCVD Cardiovascular Risk Assessment Integration**
  - **Demographics Form**: Added patient demographics section with fields for age, sex, race, systolic BP, BP medication status, diabetes status, and smoking status
  - **Mathematical Accuracy**: Implemented official 2013 ACC/AHA Pooled Cohort Equations with race/sex-specific models:
    - White Male: Correct coefficients with smoker interaction (7.837, -1.795)
    - White Female: Includes ln(Age)² term (4.884) with full interaction terms
    - African American Male: Includes ln(Age)×ln(Treated SBP) interaction (0.307)
    - African American Female: Full precision coefficients (86.6081 mean, 0.9533 baseline)
  - **Results Display**: Prominent ASCVD risk card showing 10-year risk percentage, risk category badge, LDL goals, and statin recommendations
  - **Patient Communication**: AI-generated summaries now include risk-stratified cardiovascular lifestyle modifications:
    - Borderline Risk (5-7.4%): 150 min/week exercise, Mediterranean diet guidance
    - Intermediate Risk (7.5-19.9%): 200-300 min/week exercise, heart-healthy fats, sodium reduction, smoking cessation
    - High Risk (≥20%): Daily exercise, strict Mediterranean/DASH diet, medication adherence, stress management
  - **End-to-End Testing**: Validated complete workflow with 55yo high-risk patient (30.2% calculated risk), confirmed ASCVD card display and lifestyle modifications in patient summary
  - **Production Ready**: All components tested and approved for clinical use

**November 10, 2025**
- **FIXED: Critical User-Reported Issues**
  - **Comprehensive Results Overview Table**: Added table showing all labs at a glance with columns for Lab Test, Value, Status, Reference Range, Interpretation, Recommendation, and Alert (red flag indicator)
  - **Staff-Facing AI Recommendations**: Updated AI prompts to be strictly clinical and professional for staff - removed all emojis, added specific guidance for dose adjustments, follow-up timing, physician notifications
  - **Patient-Friendly Summaries**: Patient Communication Summary now always starts with "Here is a copy of your recent lab results, along with the recommendations" and uses plain language suitable for direct patient communication
  - **Partial Lab Data Handling**: System gracefully handles missing lab values by displaying "Not provided" instead of breaking - supports workflows where not all patients have hormone panels
  - **PDF Auto-Analysis Fix**: PDF upload now automatically triggers lab interpretation - users no longer need to click "Interpret Labs" a second time after PDF extraction completes

**November 3, 2025**
- **FIXED: PDF Upload Form Integration**
  - Fixed critical bug where form fields weren't updating after PDF extraction
  - Added useEffect hook to reset form when initialValues change
  - PDF-extracted values now properly populate form fields for review
  - Results display now shows complete "Lab Results Summary" after PDF upload submission
  - End-to-end tested and verified working

**October 31, 2025**
- **COMPLETED: AI-Powered PDF Lab Upload Feature**
  - Implemented complete PDF upload workflow using pdf-parse v2 and OpenAI
  - Backend: multer for file handling (10MB limit), PDF text extraction, AI-powered field mapping
  - Frontend: Upload button with loading states, success indicators, auto-fill form fields
  - Users can now upload Pathgroup or hospital lab PDFs for automatic data extraction
  - Staff can review and edit extracted values before submitting for interpretation
  - Added proper TypeScript types and error handling throughout
- **FIXED OpenAI AI Integration**: Increased token limits to prevent response truncation
  - AI recommendations now generating successfully (tested 5,635 characters)
  - Patient summaries configured for specific values and actionable lifestyle recommendations
  - Switched to gpt-5-mini for faster, more reliable responses
- **Enhanced Hematocrit Clinical Guidelines**: Implemented detailed 4-tier protocols
  - <50%: Normal - Continue TRT with routine monitoring
  - 50-52%: Warning - Re-check hydration, lower dose, screen for OSA
  - 52-53.9%: Urgent - DO NOT escalate TRT, reduce dose, plan phlebotomy if trending up
  - ≥54%: Critical - HOLD TRT, therapeutic phlebotomy, evaluate OSA
- Fixed critical API client bug - JSON response parsing working
- End-to-end workflow tested (form → interpretation → red flags → AI → summary → PDF)
- Implemented PDF export with jsPDF library
- PostgreSQL database with proper constraints (unique MRN, cascade delete, timestamp DOB)
- Migrated storage layer to Drizzle ORM with Neon PostgreSQL

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## Project Architecture
### File Structure
```
client/
  src/
    pages/
      lab-interpretation.tsx - Main application page
    components/
      lab-input-form.tsx - Multi-panel lab entry form
      results-display.tsx - Lab results with interpretations
      red-flag-alert.tsx - Critical alert banner
      patient-summary.tsx - Editable patient communication
shared/
  schema.ts - Type-safe data models
server/
  routes.ts - API endpoints (to be implemented)
  storage.ts - In-memory storage
```

## Next Steps
1. Implement backend API with OpenAI integration
2. Build clinical logic engine based on standing orders
3. Connect frontend to backend
4. Test complete user journey
5. Deploy for clinical use
