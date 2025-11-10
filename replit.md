# Lab Interpretation Tool - Men's Clinic

## Overview
This tool is a clinical lab interpretation application for men's hormone and primary care clinic staff. Its core purpose is to efficiently interpret standard lab panels, apply clinical protocols, generate AI-powered recommendations, and identify critical "red flag" values requiring immediate physician attention. The project aims to enhance clinical decision-making, streamline patient communication, and integrate advanced features like AI-powered PDF lab result extraction and comprehensive cardiovascular risk assessment.

## User Preferences
- Medical-grade professional interface
- Clear visual hierarchy for clinical decision-making
- Color-coded status indicators (normal/borderline/abnormal/critical)
- Prominent red flag alerts
- Easy-to-read monospace fonts for numerical lab values

## System Architecture
The application features a comprehensive lab input form, a results display with color-coded status indicators, a red flag alert system, and an AI-powered recommendations display. It also includes a patient summary generator with editing and copy functionality, and a professional medical UI design with Inter/JetBrains Mono fonts and responsive layouts. Key features include:

-   **AI-Powered PDF Upload**: Allows staff to upload Pathgroup and hospital PDFs for automatic lab value extraction and form pre-filling using OpenAI, supporting files up to 10MB.
-   **ASCVD Cardiovascular Risk Assessment**: Calculates 10-year heart attack/stroke risk using the 2013 ACC/AHA Pooled Cohort Equations with race/sex-specific models, providing risk display, statin recommendations, and risk-stratified lifestyle modifications.
-   **STOP-BANG Sleep Apnea Screening**: Integrates an 8-component validated questionnaire for Obstructive Sleep Apnea (OSA) risk assessment, providing automated scoring, risk stratification, and clinical guidance.
-   **Clinical Logic Engine**: Implements standing orders for erythrocytosis management, testosterone optimization, lipid management, liver/kidney function monitoring, PSA tracking, glycemic control, and hormonal assessment.
-   **Frontend**: Built with React, TypeScript, Wouter for routing, Shadcn UI components, TanStack Query for data fetching, Tailwind CSS, and form validation using React Hook Form and Zod.
-   **Backend**: Uses Express.js, integrates with OpenAI for AI recommendations, and employs TypeScript.
-   **Database**: Utilizes PostgreSQL with Drizzle ORM for data persistence, including patient and lab results tables.
-   **Design System**: Employs Inter and JetBrains Mono fonts, a professional blue color scheme with medical-grade status colors, and Material Design-inspired components.

## External Dependencies
-   **OpenAI**: Used for AI-powered recommendations, intelligent text extraction from PDFs, and generating patient-friendly summaries.
-   **PostgreSQL**: The primary database for storing patient and lab result data.
-   **Drizzle ORM**: Used for interacting with the PostgreSQL database.
-   **multer**: A Node.js middleware for handling `multipart/form-data`, used for PDF file uploads.
-   **jsPDF**: A client-side JavaScript library for generating PDF documents, used for exporting lab reports.
-   **Wouter**: A lightweight client-side router for React.
-   **Shadcn UI**: A collection of re-usable components.
-   **TanStack Query**: For data fetching, caching, and state management.
-   **Zod**: For schema declaration and validation.

## Recent Changes

**November 10, 2025** (Latest)
- **FIXED: PDF Auto-Analysis Before Demographics Entry**
  - **Problem**: PDF upload was automatically analyzing labs immediately after value extraction, BEFORE staff could enter patient demographics or STOP-BANG answers. This prevented ASCVD and STOP-BANG from calculating on the first analysis, forcing users to re-enter data and re-analyze.
  - **Root Cause**: `pdfExtractMutation.onSuccess` callback was calling `interpretMutation.mutate()` immediately after PDF extraction.
  - **Solution - Two-Phase Workflow**: 
    - **Phase 1 (Extract)**: PDF upload → AI extracts values → Form auto-filled → Guidance alert appears
    - **Phase 2 (Review & Analyze)**: User enters demographics → User completes STOP-BANG → User clicks "Interpret Labs" → Single analysis with complete data
  - **Implementation Details**:
    - Added `isPdfPendingReview` state flag to track extraction completion
    - Removed automatic `interpretMutation.mutate()` call from PDF extraction success handler
    - Updated toast message: "Lab values filled. Please enter patient demographics and STOP-BANG data, then click 'Interpret Labs'."
    - Added guidance alert with step-by-step workflow instructions
    - Clear previous results when new PDF uploaded to prevent confusion
  - **Result**: Users can now upload PDF, enter demographics once, and get complete ASCVD + STOP-BANG calculations on first analysis

- **COMPLETED: STOP-BANG Sleep Apnea Screening Integration**
  - Implemented validated STOP-BANG questionnaire for obstructive sleep apnea (OSA) risk assessment
  - 8-component screening (Snoring, Tiredness, Observed apnea, Pressure, BMI, Age, Neck circumference, Gender)
  - Automated scoring (0-8 points) with risk stratification (Low 0-2, Intermediate 3-4, High 5-8)
  - Displays in main interpretations table with color-coded badges (Low=green, Intermediate=orange, High=red critical)
  - Sleep study referral recommendations for intermediate/high risk patients
  - Clinical context for TRT patients (OSA can worsen erythrocytosis and cardiovascular risk)

- **FIXED: ASCVD Not Displaying When Risk Factor Checkboxes Unchecked**
  - Updated schema to use `.default(false)` for onBPMeds, diabetic, smoker boolean fields
  - Form explicitly initializes all checkboxes to `false` in defaultValues
  - Healthy patients (no risk factors) now calculate ASCVD correctly

- **ENHANCED: Clinical Clarity and ASCVD Integration**
  - Updated testosterone interpretation language to distinguish routine dose adjustments from emergencies
  - Added "Provider recommendation:" prefix to testosterone recommendations
  - ASCVD cardiovascular risk now appears in Complete Lab Results Overview table alongside other labs