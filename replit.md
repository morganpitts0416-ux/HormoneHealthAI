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
**In Development** - Phase 1 (Schema & Frontend) Complete

### Completed
- ✅ Data schemas for lab values and interpretations
- ✅ Comprehensive lab input form with organized panels (CBC, CMP, Hormones, Lipids, Other)
- ✅ Results display with color-coded status indicators
- ✅ Red flag alert system with severity levels (critical, urgent, warning)
- ✅ AI-powered recommendations display
- ✅ Patient summary generator with edit and copy functionality
- ✅ Professional medical UI design with Inter/JetBrains Mono fonts
- ✅ Responsive layouts for all screen sizes

### In Progress
- Backend implementation with OpenAI integration
- Clinical logic engine based on standing orders
- API endpoints for lab interpretation

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
**October 30, 2025**
- Initial project setup
- Complete frontend implementation for all MVP features
- Data schema definition for lab values and interpretations
- Comprehensive form with accordion panels for organized data entry
- Results display with detailed interpretations and status badges
- Red flag alert system with prominent styling
- Patient summary editor with clipboard functionality

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
