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