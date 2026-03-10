import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { interpretLabsRequestSchema, femaleLabValuesSchema, type InterpretationResult, type LabValues, type FemaleLabValues, type InsertLabResult, insertSavedInterpretationSchema, insertPatientSchema } from "@shared/schema";
import { ClinicalLogicEngine } from "./clinical-logic";
import { FemaleClinicalLogicEngine } from "./clinical-logic-female";
import { AIService } from "./ai-service";
import { PDFExtractionService } from "./pdf-extraction";
import { ASCVDCalculator } from "./ascvd-calculator";
import { PREVENTCalculator } from "./prevent-calculator";
import { StopBangCalculator } from "./stopbang-calculator";
import { evaluateSupplements } from "./supplements-female";
import { evaluateMaleSupplements } from "./supplements-male";
import { screenInsulinResistance } from "./insulin-resistance";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Lab interpretation endpoint
  app.post("/api/interpret-labs", async (req, res) => {
    console.log('[API] POST /api/interpret-labs - Received request');
    console.log('[API] Request body:', JSON.stringify(req.body, null, 2));
    try {
      // Validate request body
      const parseResult = interpretLabsRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid lab values", 
          details: parseResult.error.errors 
        });
      }

      const labs = parseResult.data;
      const patientId = req.body.patientId ? parseInt(req.body.patientId) : undefined;

      let trendContext = '';
      if (patientId) {
        const priorLabs = await storage.getLabResultsByPatient(patientId);
        if (priorLabs.length > 0) {
          trendContext = AIService.buildTrendContext(labs, priorLabs.map(l => ({ labDate: l.labDate, labValues: l.labValues as LabValues })));
          console.log('[API] Trend context built from', priorLabs.length, 'prior labs');
        }
      }

      // Step 1: Detect red flags
      const redFlags = ClinicalLogicEngine.detectRedFlags(labs);

      // Step 2: Generate detailed interpretations
      const interpretations = ClinicalLogicEngine.interpretLabValues(labs);

      // Step 3: Calculate PREVENT cardiovascular risk (replaces legacy ASCVD)
      // PREVENT uses sex-specific, race-free equations with eGFR and BMI
      const preventLabData = {
        ...labs,
        demographics: labs.demographics ? { ...labs.demographics, sex: 'male' as const } : undefined
      };
      const preventRisk = PREVENTCalculator.calculateRisk(preventLabData) || undefined;
      console.log('[API] Male PREVENT calculation result:', preventRisk ? `10yr CVD: ${preventRisk.tenYearCVDPercentage}, ASCVD: ${preventRisk.tenYearASCVDPercentage}, HF: ${preventRisk.tenYearHFPercentage}` : 'Not calculated');

      // Step 3a: Add PREVENT risk metrics to interpretations if calculated
      if (preventRisk) {
        console.log('[API] Adding PREVENT to male interpretations array');
        const getRiskStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'borderline': return 'borderline';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical';
            default: return 'abnormal';
          }
        };

        const lipidEndIndex = interpretations.findIndex((interp, idx, arr) => 
          (interp.category.toLowerCase().includes('cholesterol') || 
           interp.category.toLowerCase().includes('triglyceride') ||
           interp.category.toLowerCase().includes('ldl') ||
           interp.category.toLowerCase().includes('hdl')) &&
          (!arr[idx + 1] || 
           (!arr[idx + 1].category.toLowerCase().includes('cholesterol') &&
            !arr[idx + 1].category.toLowerCase().includes('triglyceride') &&
            !arr[idx + 1].category.toLowerCase().includes('ldl') &&
            !arr[idx + 1].category.toLowerCase().includes('hdl')))
        );

        // Add CVD risk interpretation
        const cvdInterpretation = {
          category: '10-Year Total CVD Risk (PREVENT)',
          value: preventRisk.tenYearTotalCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Low <5%, Borderline 5-7.4%, Intermediate 7.5-19.9%, High ≥20%',
          interpretation: `10-year cardiovascular disease risk: ${preventRisk.tenYearCVDPercentage} (${preventRisk.riskCategory.toUpperCase()} RISK). Includes ASCVD and heart failure.`,
          recommendation: preventRisk.recommendations,
          recheckTiming: 'Annual',
        };

        // Add ASCVD-specific risk
        const ascvdInterpretation = {
          category: '10-Year ASCVD Risk (PREVENT)',
          value: preventRisk.tenYearASCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Heart attack & stroke risk',
          interpretation: `10-year ASCVD risk (heart attack, stroke): ${preventRisk.tenYearASCVDPercentage}`,
          recommendation: preventRisk.statinRecommendation || '',
          recheckTiming: 'Annual',
        };

        // Add Heart Failure risk
        const hfStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.tenYearHeartFailure >= 0.1 ? 'abnormal' : preventRisk.tenYearHeartFailure >= 0.05 ? 'borderline' : 'normal';
        const hfInterpretation = {
          category: '10-Year Heart Failure Risk (PREVENT)',
          value: preventRisk.tenYearHeartFailure * 100,
          unit: '%',
          status: hfStatus,
          referenceRange: 'Heart failure risk',
          interpretation: `10-year heart failure risk: ${preventRisk.tenYearHFPercentage}`,
          recommendation: preventRisk.tenYearHeartFailure >= 0.075 ? 'Consider SGLT2 inhibitor or GLP-1 agonist for cardioprotection if diabetic or high-risk.' : 'Monitor for symptoms: shortness of breath, fatigue, leg swelling.',
          recheckTiming: 'Annual',
        };

        // Insert after lipid panel if found, otherwise append at end
        if (lipidEndIndex !== -1) {
          interpretations.splice(lipidEndIndex + 1, 0, cvdInterpretation, ascvdInterpretation, hfInterpretation);
        } else {
          interpretations.push(cvdInterpretation, ascvdInterpretation, hfInterpretation);
        }

        // Add 30-year risks if available (ages 30-59)
        if (preventRisk.thirtyYearTotalCVD !== undefined) {
          const thirtyYearStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.thirtyYearTotalCVD >= 0.30 ? 'abnormal' : preventRisk.thirtyYearTotalCVD >= 0.15 ? 'borderline' : 'normal';
          const thirtyYearInterpretation = {
            category: '30-Year CVD Risk (PREVENT)',
            value: preventRisk.thirtyYearTotalCVD * 100,
            unit: '%',
            status: thirtyYearStatus,
            referenceRange: 'Long-term cardiovascular risk',
            interpretation: `30-year risks: CVD ${preventRisk.thirtyYearCVDPercentage}, ASCVD ${preventRisk.thirtyYearASCVDPercentage}, Heart Failure ${preventRisk.thirtyYearHFPercentage}`,
            recommendation: 'Long-term lifestyle modifications and risk factor management are critical for reducing lifetime cardiovascular risk.',
            recheckTiming: 'Annual',
          };
          const hfIdx = interpretations.findIndex(i => i.category === '10-Year Heart Failure Risk (PREVENT)');
          if (hfIdx !== -1) {
            interpretations.splice(hfIdx + 1, 0, thirtyYearInterpretation);
          } else {
            interpretations.push(thirtyYearInterpretation);
          }
        }
      }

      // Step 3b: Calculate STOP-BANG sleep apnea risk if demographics data available
      const stopBangRisk = StopBangCalculator.calculateRisk(labs) || undefined;
      console.log('[API] Male STOP-BANG calculation result:', stopBangRisk ? `Score: ${stopBangRisk.score}/8, Risk: ${stopBangRisk.riskCategory}` : 'Not calculated (missing demographics data)');

      // Step 3c: Add STOP-BANG to interpretations if calculated
      if (stopBangRisk) {
        console.log('[API] Adding STOP-BANG to interpretations array');
        // Map STOP-BANG risk category to interpretation status
        const getStopBangStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical'; // High OSA risk is critical due to CV/erythrocytosis complications
            default: return 'abnormal';
          }
        };

        const stopBangInterpretation = {
          category: 'Sleep Apnea Risk (STOP-BANG)',
          value: stopBangRisk.score,
          unit: 'points',
          status: getStopBangStatus(stopBangRisk.riskCategory),
          referenceRange: 'Low 0-2, Intermediate 3-4, High 5-8',
          interpretation: stopBangRisk.riskDescription,
          recommendation: stopBangRisk.recommendations,
          recheckTiming: stopBangRisk.riskCategory === 'low' ? 'Annual' : 'Follow-up in 1-3 months after sleep study',
        };

        // Insert after 30-year CVD risk if exists, otherwise after HF risk, otherwise after lipid panel
        const thirtyYearIndex = interpretations.findIndex(interp => interp.category === '30-Year CVD Risk (PREVENT)');
        const hfRiskIndex = interpretations.findIndex(interp => interp.category === '10-Year Heart Failure Risk (PREVENT)');
        if (thirtyYearIndex !== -1) {
          interpretations.splice(thirtyYearIndex + 1, 0, stopBangInterpretation);
        } else if (hfRiskIndex !== -1) {
          interpretations.splice(hfRiskIndex + 1, 0, stopBangInterpretation);
        } else {
          const lipidEndIndex = interpretations.findIndex((interp, idx, arr) => 
            (interp.category.toLowerCase().includes('cholesterol') || 
             interp.category.toLowerCase().includes('triglyceride') ||
             interp.category.toLowerCase().includes('ldl') ||
             interp.category.toLowerCase().includes('hdl')) &&
            (!arr[idx + 1] || 
             (!arr[idx + 1].category.toLowerCase().includes('cholesterol') &&
              !arr[idx + 1].category.toLowerCase().includes('triglyceride') &&
              !arr[idx + 1].category.toLowerCase().includes('ldl') &&
              !arr[idx + 1].category.toLowerCase().includes('hdl')))
          );
          if (lipidEndIndex !== -1) {
            interpretations.splice(lipidEndIndex + 1, 0, stopBangInterpretation);
          } else {
            interpretations.push(stopBangInterpretation);
          }
        }
      }

      // Step 3d: Calculate Adjusted Risk Assessment based on ApoB and Lp(a)
      let adjustedRisk = undefined;
      if (preventRisk && (labs.apoB !== undefined || labs.lpa !== undefined)) {
        adjustedRisk = PREVENTCalculator.calculateAdjustedRisk(
          preventRisk.tenYearASCVD,
          labs.apoB,
          labs.lpa
        ) || undefined;
        console.log('[API] Male Adjusted Risk Assessment:', adjustedRisk ? 
          `Base: ${adjustedRisk.baseASCVDRisk.toFixed(1)}%, Category: ${adjustedRisk.riskCategory} → ${adjustedRisk.adjustedCategory}` : 
          'Not calculated');
      }

      // Step 4: Generate AI-powered recommendations
      const aiRecommendations = await AIService.generateRecommendations(
        labs,
        redFlags,
        interpretations,
        'male',
        trendContext || undefined
      );

      // Step 5: Generate patient-friendly summary (includes PREVENT-based lifestyle modifications)
      const patientSummary = await AIService.generatePatientSummary(
        labs,
        interpretations,
        redFlags.length > 0,
        preventRisk
      );

      // Step 6: Determine recheck window
      const recheckWindow = ClinicalLogicEngine.determineRecheckWindow(
        redFlags,
        interpretations
      );

      // Step 7: Evaluate supplement recommendations
      const supplements = evaluateMaleSupplements(labs);
      console.log('[API] Male supplement recommendations:', supplements.length);

      // Step 8: Insulin Resistance Screening
      const insulinResistance = screenInsulinResistance(labs, 'male') || undefined;
      console.log('[API] Male IR Screening:', insulinResistance ? `${insulinResistance.positiveCount} positive markers, ${insulinResistance.likelihoodLabel}` : 'Not calculated (insufficient markers)');

      if (insulinResistance && insulinResistance.likelihood !== 'none') {
        const irStatus: 'normal' | 'borderline' | 'abnormal' | 'critical' = 
          insulinResistance.likelihood === 'high' ? 'critical' : 'abnormal';
        const irInterpretation = {
          category: 'Insulin Resistance Screening',
          value: insulinResistance.positiveCount,
          unit: 'of 6 markers positive',
          status: irStatus,
          referenceRange: '0-1 Low, 2 Moderate, 3+ High Likelihood',
          interpretation: insulinResistance.providerSummary,
          recommendation: insulinResistance.phenotypes.length > 0 
            ? `Phenotype(s): ${insulinResistance.phenotypes.map(p => p.name).join('; ')}. ${insulinResistance.confirmationTests}`
            : insulinResistance.confirmationTests || 'Consider fasting insulin + fasting glucose for confirmation.',
          recheckTiming: '3-6 months',
        };
        interpretations.push(irInterpretation);
      }

      // Step 9: Generate SOAP note
      const soapNote = await AIService.generateSOAPNote(
        labs, redFlags, interpretations, aiRecommendations, recheckWindow,
        'male', preventRisk, supplements, insulinResistance, trendContext || undefined
      );

      const result: InterpretationResult = {
        redFlags,
        interpretations,
        aiRecommendations,
        patientSummary,
        recheckWindow,
        preventRisk,
        adjustedRisk,
        supplements,
        insulinResistance,
        soapNote,
      };

      console.log('[API] Response summary:');
      console.log('  - Red flags:', redFlags.length);
      console.log('  - Interpretations:', interpretations.length);
      console.log('  - AI recommendations length:', aiRecommendations.length);
      console.log('  - Patient summary length:', patientSummary.length);
      console.log('  - Recheck window:', recheckWindow);
      console.log('  - Supplements:', supplements.length);
      console.log('  - SOAP note length:', soapNote.length);

      res.json(result);
    } catch (error) {
      console.error("Error interpreting labs:", error);
      res.status(500).json({ 
        error: "Failed to interpret lab results", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Female lab interpretation endpoint
  app.post("/api/interpret-labs-female", async (req, res) => {
    console.log('[API] POST /api/interpret-labs-female - Received request');
    console.log('[API] Request body:', JSON.stringify(req.body, null, 2));
    try {
      // Validate request body
      const parseResult = femaleLabValuesSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid lab values", 
          details: parseResult.error.errors 
        });
      }

      const labs = parseResult.data;
      const patientId = req.body.patientId ? parseInt(req.body.patientId) : undefined;

      let trendContext = '';
      if (patientId) {
        const priorLabs = await storage.getLabResultsByPatient(patientId);
        if (priorLabs.length > 0) {
          trendContext = AIService.buildTrendContext(labs, priorLabs.map(l => ({ labDate: l.labDate, labValues: l.labValues as FemaleLabValues })));
          console.log('[API] Female trend context built from', priorLabs.length, 'prior labs');
        }
      }

      // Debug: Log hormone values received
      console.log('[API] Female hormone values received:', {
        estradiol: labs.estradiol,
        progesterone: labs.progesterone,
        fsh: labs.fsh,
        lh: labs.lh,
        testosterone: labs.testosterone,
        menstrualPhase: labs.menstrualPhase,
        onHRT: labs.onHRT
      });

      // Step 1: Detect red flags using female-specific logic
      const redFlags = FemaleClinicalLogicEngine.detectRedFlags(labs);

      // Step 2: Generate detailed interpretations with female reference ranges
      const interpretations = FemaleClinicalLogicEngine.interpretLabValues(labs);
      
      // Debug: Log categories of all interpretations generated
      console.log('[API] Female interpretation categories:', interpretations.map(i => i.category));

      // Step 3: Calculate PREVENT cardiovascular risk if demographics and lipid data are available
      // PREVENT uses sex-specific, race-free equations with eGFR and BMI
      const preventLabData = {
        ...labs,
        demographics: labs.demographics ? { ...labs.demographics, sex: 'female' as const } : undefined
      };
      const preventRisk = PREVENTCalculator.calculateRisk(preventLabData) || undefined;
      console.log('[API] Female PREVENT calculation result:', preventRisk ? `10yr CVD: ${preventRisk.tenYearCVDPercentage}, ASCVD: ${preventRisk.tenYearASCVDPercentage}, HF: ${preventRisk.tenYearHFPercentage}` : 'Not calculated');

      // Step 3a: Add PREVENT risk metrics to interpretations if calculated
      if (preventRisk) {
        console.log('[API] Adding PREVENT to female interpretations array');
        const getRiskStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'borderline': return 'borderline';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical';
            default: return 'abnormal';
          }
        };

        const lipidEndIndex = interpretations.findIndex((interp, idx, arr) => 
          (interp.category.toLowerCase().includes('cholesterol') || 
           interp.category.toLowerCase().includes('triglyceride') ||
           interp.category.toLowerCase().includes('ldl') ||
           interp.category.toLowerCase().includes('hdl')) &&
          (!arr[idx + 1] || 
           (!arr[idx + 1].category.toLowerCase().includes('cholesterol') &&
            !arr[idx + 1].category.toLowerCase().includes('triglyceride') &&
            !arr[idx + 1].category.toLowerCase().includes('ldl') &&
            !arr[idx + 1].category.toLowerCase().includes('hdl')))
        );

        // Add CVD risk interpretation
        const cvdInterpretation = {
          category: '10-Year Total CVD Risk (PREVENT)',
          value: preventRisk.tenYearTotalCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Low <5%, Borderline 5-7.4%, Intermediate 7.5-19.9%, High ≥20%',
          interpretation: `10-year cardiovascular disease risk: ${preventRisk.tenYearCVDPercentage} (${preventRisk.riskCategory.toUpperCase()} RISK). Includes ASCVD and heart failure.`,
          recommendation: preventRisk.recommendations,
          recheckTiming: 'Annual',
        };

        // Add ASCVD-specific risk
        const ascvdInterpretation = {
          category: '10-Year ASCVD Risk (PREVENT)',
          value: preventRisk.tenYearASCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Heart attack & stroke risk',
          interpretation: `10-year ASCVD risk (heart attack, stroke): ${preventRisk.tenYearASCVDPercentage}`,
          recommendation: preventRisk.statinRecommendation || '',
          recheckTiming: 'Annual',
        };

        // Add Heart Failure risk
        const femaleHfStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.tenYearHeartFailure >= 0.1 ? 'abnormal' : preventRisk.tenYearHeartFailure >= 0.05 ? 'borderline' : 'normal';
        const hfInterpretation = {
          category: '10-Year Heart Failure Risk (PREVENT)',
          value: preventRisk.tenYearHeartFailure * 100,
          unit: '%',
          status: femaleHfStatus,
          referenceRange: 'Heart failure risk',
          interpretation: `10-year heart failure risk: ${preventRisk.tenYearHFPercentage}`,
          recommendation: preventRisk.tenYearHeartFailure >= 0.075 ? 'Consider SGLT2 inhibitor or GLP-1 agonist for cardioprotection if diabetic or high-risk.' : 'Monitor for symptoms: shortness of breath, fatigue, leg swelling.',
          recheckTiming: 'Annual',
        };

        // Insert after lipid panel if found, otherwise append at end
        if (lipidEndIndex !== -1) {
          interpretations.splice(lipidEndIndex + 1, 0, cvdInterpretation, ascvdInterpretation, hfInterpretation);
        } else {
          interpretations.push(cvdInterpretation, ascvdInterpretation, hfInterpretation);
        }

        // Add 30-year risks if available (ages 30-59)
        if (preventRisk.thirtyYearTotalCVD !== undefined) {
          const femaleThirtyYearStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.thirtyYearTotalCVD >= 0.30 ? 'abnormal' : preventRisk.thirtyYearTotalCVD >= 0.15 ? 'borderline' : 'normal';
          const thirtyYearInterpretation = {
            category: '30-Year CVD Risk (PREVENT)',
            value: preventRisk.thirtyYearTotalCVD * 100,
            unit: '%',
            status: femaleThirtyYearStatus,
            referenceRange: 'Long-term cardiovascular risk',
            interpretation: `30-year risks: CVD ${preventRisk.thirtyYearCVDPercentage}, ASCVD ${preventRisk.thirtyYearASCVDPercentage}, Heart Failure ${preventRisk.thirtyYearHFPercentage}`,
            recommendation: 'Long-term lifestyle modifications and risk factor management are critical for reducing lifetime cardiovascular risk.',
            recheckTiming: 'Annual',
          };
          const hfIdx = interpretations.findIndex(i => i.category === '10-Year Heart Failure Risk (PREVENT)');
          if (hfIdx !== -1) {
            interpretations.splice(hfIdx + 1, 0, thirtyYearInterpretation);
          } else {
            interpretations.push(thirtyYearInterpretation);
          }
        }
      }

      // Step 3b: Calculate STOP-BANG sleep apnea risk (female-adjusted - no automatic male point)
      // For females, we don't add the automatic "male gender" point
      const stopBangRisk = StopBangCalculator.calculateRisk({
        ...labs,
        demographics: labs.demographics ? { ...labs.demographics, sex: 'female' as const } : undefined
      }) || undefined;
      console.log('[API] Female STOP-BANG calculation result:', stopBangRisk ? `Score: ${stopBangRisk.score}/8, Risk: ${stopBangRisk.riskCategory}` : 'Not calculated');

      // Step 3c: Add STOP-BANG to interpretations if calculated
      if (stopBangRisk) {
        console.log('[API] Adding STOP-BANG to female interpretations array');
        const getStopBangStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical';
            default: return 'abnormal';
          }
        };

        const stopBangInterpretation = {
          category: 'Sleep Apnea Risk (STOP-BANG)',
          value: stopBangRisk.score,
          unit: 'points',
          status: getStopBangStatus(stopBangRisk.riskCategory),
          referenceRange: 'Low 0-2, Intermediate 3-4, High 5-8',
          interpretation: stopBangRisk.riskDescription,
          recommendation: stopBangRisk.recommendations,
          recheckTiming: stopBangRisk.riskCategory === 'low' ? 'Annual' : 'Follow-up in 1-3 months after sleep study',
        };

        // Find the last PREVENT risk category or 30-year risk to insert STOP-BANG after
        const preventIndex = interpretations.findIndex(interp => 
          interp.category === '30-Year CVD Risk (PREVENT)' || 
          interp.category === '10-Year Heart Failure Risk (PREVENT)'
        );
        if (preventIndex !== -1) {
          interpretations.splice(preventIndex + 1, 0, stopBangInterpretation);
        } else {
          interpretations.push(stopBangInterpretation);
        }
      }

      // Step 4: Generate AI-powered recommendations with female context
      const aiRecommendations = await AIService.generateRecommendations(
        labs,
        redFlags,
        interpretations,
        'female',
        trendContext || undefined
      );

      // Step 5: Generate patient-friendly summary
      const patientSummary = await AIService.generatePatientSummary(
        labs,
        interpretations,
        redFlags.length > 0,
        preventRisk,
        'female'
      );

      // Step 6: Determine recheck window using female-specific logic
      const recheckWindow = FemaleClinicalLogicEngine.determineRecheckWindow(labs, redFlags);

      // Step 7: Insulin Resistance Screening (moved before supplements for phenotype input)
      const insulinResistance = screenInsulinResistance(labs, 'female') || undefined;
      console.log('[API] Female IR Screening:', insulinResistance ? `${insulinResistance.positiveCount} positive markers, ${insulinResistance.likelihoodLabel}` : 'Not calculated (insufficient markers)');

      if (insulinResistance && insulinResistance.likelihood !== 'none') {
        const irStatus: 'normal' | 'borderline' | 'abnormal' | 'critical' = 
          insulinResistance.likelihood === 'high' ? 'critical' : 'abnormal';
        const irInterpretation = {
          category: 'Insulin Resistance Screening',
          value: insulinResistance.positiveCount,
          unit: 'of 6 markers positive',
          status: irStatus,
          referenceRange: '0-1 Low, 2 Moderate, 3+ High Likelihood',
          interpretation: insulinResistance.providerSummary,
          recommendation: insulinResistance.phenotypes.length > 0 
            ? `Phenotype(s): ${insulinResistance.phenotypes.map(p => p.name).join('; ')}. ${insulinResistance.confirmationTests}`
            : insulinResistance.confirmationTests || 'Consider fasting insulin + fasting glucose for confirmation.',
          recheckTiming: '3-6 months',
        };
        interpretations.push(irInterpretation);
      }

      // Step 8: Evaluate supplement recommendations based on lab values, phenotypes, and IR screening
      const supplementResult = evaluateSupplements(labs, insulinResistance);
      const supplements = supplementResult.recommendations;
      const clinicalPhenotypes = supplementResult.phenotypes;
      console.log('[API] Supplement recommendations:', supplements.length);
      console.log('[API] Clinical phenotypes detected:', clinicalPhenotypes.map(p => `${p.name} (${p.confidence})`).join(', ') || 'None');

      // Step 9: Compute cardiovascular risk stratification flags
      const cvRiskFlags = FemaleClinicalLogicEngine.computeCardiovascularRiskFlags(labs);
      console.log('[API] CV Risk Flags:', JSON.stringify(cvRiskFlags, null, 2));

      // Step 10: Generate CAC and statin recommendations
      const cacStatinRec = FemaleClinicalLogicEngine.generateCacStatinRecommendations(labs, cvRiskFlags);
      console.log('[API] CAC/Statin Recommendations generated');

      // Step 11: Calculate Adjusted Risk Assessment based on ApoB and Lp(a)
      let adjustedRisk = undefined;
      if (preventRisk && (labs.apoB !== undefined || labs.lpa !== undefined)) {
        adjustedRisk = PREVENTCalculator.calculateAdjustedRisk(
          preventRisk.tenYearASCVD,
          labs.apoB,
          labs.lpa
        ) || undefined;
        console.log('[API] Adjusted Risk Assessment:', adjustedRisk ? 
          `Base: ${adjustedRisk.baseASCVDRisk.toFixed(1)}%, Category: ${adjustedRisk.riskCategory} → ${adjustedRisk.adjustedCategory}` : 
          'Not calculated');
      }

      // Step 10: Generate SOAP note
      const soapNote = await AIService.generateSOAPNote(
        labs, redFlags, interpretations, aiRecommendations, recheckWindow,
        'female', preventRisk, supplements, insulinResistance, trendContext || undefined
      );

      const result: InterpretationResult = {
        redFlags,
        interpretations,
        aiRecommendations,
        patientSummary,
        recheckWindow,
        preventRisk,
        adjustedRisk,
        supplements,
        cvRiskFlags,
        cacStatinRec,
        insulinResistance,
        clinicalPhenotypes,
        soapNote,
      };

      console.log('[API] Female interpretation response summary:');
      console.log('  - Red flags:', redFlags.length);
      console.log('  - Interpretations:', interpretations.length);
      console.log('  - AI recommendations length:', aiRecommendations.length);
      console.log('  - Patient summary length:', patientSummary.length);
      console.log('  - Recheck window:', recheckWindow);
      console.log('  - Supplements:', supplements.length);
      console.log('  - CV Risk Flags computed');
      console.log('  - Insulin Resistance:', insulinResistance ? insulinResistance.likelihoodLabel : 'Not screened');
      console.log('  - SOAP note length:', soapNote.length);

      res.json(result);
    } catch (error) {
      console.error("Error interpreting female labs:", error);
      res.status(500).json({ 
        error: "Failed to interpret lab results", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Generate patient wellness plan endpoint
  app.post("/api/generate-wellness-plan", async (req, res) => {
    console.log('[API] POST /api/generate-wellness-plan - Received request');
    
    try {
      const { labs, interpretations, supplements, preventRisk } = req.body;
      
      if (!labs || !interpretations) {
        return res.status(400).json({ error: 'Missing required fields: labs, interpretations' });
      }

      console.log('[API] Generating wellness plan with:', {
        labsProvided: !!labs,
        interpretationsCount: interpretations?.length,
        supplementsCount: supplements?.length,
        preventRiskProvided: !!preventRisk
      });

      const wellnessPlan = await AIService.generatePatientWellnessPlan(
        labs,
        interpretations,
        supplements || [],
        preventRisk || null
      );

      console.log('[API] Wellness plan generated successfully');
      
      res.json({ 
        success: true, 
        wellnessPlan 
      });
    } catch (error) {
      console.error('[API] Error generating wellness plan:', error);
      res.status(500).json({ 
        error: 'Failed to generate wellness plan',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generate male patient wellness plan endpoint
  app.post("/api/generate-wellness-plan-male", async (req, res) => {
    console.log('[API] POST /api/generate-wellness-plan-male - Received request');
    
    try {
      const { labs, interpretations, supplements, preventRisk } = req.body;
      
      if (!labs || !interpretations) {
        return res.status(400).json({ error: 'Missing required fields: labs, interpretations' });
      }

      console.log('[API] Generating male wellness plan with:', {
        labsProvided: !!labs,
        interpretationsCount: interpretations?.length,
        supplementsCount: supplements?.length,
        preventRiskProvided: !!preventRisk
      });

      const wellnessPlan = await AIService.generateMalePatientWellnessPlan(
        labs,
        interpretations,
        supplements || [],
        preventRisk || null
      );

      console.log('[API] Male wellness plan generated successfully');
      
      res.json({ 
        success: true, 
        wellnessPlan 
      });
    } catch (error) {
      console.error('[API] Error generating male wellness plan:', error);
      res.status(500).json({ 
        error: 'Failed to generate male wellness plan',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Configure multer for PDF uploads (memory storage)
  const upload = multer({ 
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    }
  });

  // PDF upload and extraction endpoint
  app.post("/api/extract-pdf-labs", upload.single('pdf'), async (req, res) => {
    console.log('[API] POST /api/extract-pdf-labs - Received PDF upload');
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file provided' });
      }

      console.log('[API] PDF file received:', {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      // Extract lab values from PDF using AI
      const extractedValues = await PDFExtractionService.extractLabValues(req.file.buffer);

      console.log('[API] Extraction complete, extracted fields:', Object.keys(extractedValues));

      res.json({ 
        success: true, 
        data: extractedValues,
        message: 'Lab values extracted successfully. Please review and edit before submitting.'
      });
    } catch (error) {
      console.error('[API] Error extracting PDF:', error);
      res.status(500).json({ 
        error: 'Failed to extract lab values from PDF',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== PATIENT PROFILE ENDPOINTS =====

  app.post("/api/patients", async (req, res) => {
    try {
      const parseResult = insertPatientSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid patient data", details: parseResult.error.errors });
      }
      const patient = await storage.createPatient(parseResult.data);
      res.json(patient);
    } catch (error) {
      console.error("Error creating patient:", error);
      res.status(500).json({ error: "Failed to create patient" });
    }
  });

  app.get("/api/patients/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const gender = req.query.gender as string | undefined;
      if (!q || q.length < 1) {
        return res.json([]);
      }
      const patients = await storage.searchPatients(q, gender);
      res.json(patients);
    } catch (error) {
      console.error("Error searching patients:", error);
      res.status(500).json({ error: "Failed to search patients" });
    }
  });

  app.get("/api/patients/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const labHistory = await storage.getLabResultsByPatient(id);
      res.json({ patient, labHistory });
    } catch (error) {
      console.error("Error getting patient:", error);
      res.status(500).json({ error: "Failed to get patient" });
    }
  });

  app.get("/api/patients/:id/labs", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const labs = await storage.getLabResultsByPatient(id);
      res.json(labs);
    } catch (error) {
      console.error("Error getting patient labs:", error);
      res.status(500).json({ error: "Failed to get patient labs" });
    }
  });

  app.post("/api/patients/:id/labs", async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const { labValues: bodyLabValues, interpretationResult: bodyInterpretation, notes } = req.body;
      const labResult = await storage.createLabResult({
        patientId,
        labDate: new Date(),
        labValues: bodyLabValues as LabValues | FemaleLabValues,
        interpretationResult: bodyInterpretation as InterpretationResult,
        notes,
      } as InsertLabResult);
      await storage.updatePatient(patientId, {});
      res.json(labResult);
    } catch (error) {
      console.error("Error saving patient labs:", error);
      res.status(500).json({ error: "Failed to save patient labs" });
    }
  });

  // ===== SAVED INTERPRETATIONS ENDPOINTS =====
  
  // Get all saved interpretations (with optional gender filter)
  app.get("/api/saved-interpretations", async (req, res) => {
    console.log('[API] GET /api/saved-interpretations');
    try {
      const gender = req.query.gender as string | undefined;
      const interpretations = await storage.getAllSavedInterpretations(gender);
      res.json(interpretations);
    } catch (error) {
      console.error('[API] Error fetching saved interpretations:', error);
      res.status(500).json({ error: 'Failed to fetch saved interpretations' });
    }
  });

  // Search saved interpretations by patient name
  app.get("/api/saved-interpretations/search", async (req, res) => {
    console.log('[API] GET /api/saved-interpretations/search');
    try {
      const searchTerm = req.query.q as string;
      const gender = req.query.gender as string | undefined;
      
      if (!searchTerm) {
        return res.status(400).json({ error: 'Search term (q) is required' });
      }
      
      const interpretations = await storage.searchSavedInterpretations(searchTerm, gender);
      res.json(interpretations);
    } catch (error) {
      console.error('[API] Error searching saved interpretations:', error);
      res.status(500).json({ error: 'Failed to search saved interpretations' });
    }
  });

  // Get a single saved interpretation by ID
  app.get("/api/saved-interpretations/:id", async (req, res) => {
    console.log('[API] GET /api/saved-interpretations/:id');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid interpretation ID' });
      }
      
      const interpretation = await storage.getSavedInterpretation(id);
      if (!interpretation) {
        return res.status(404).json({ error: 'Interpretation not found' });
      }
      
      res.json(interpretation);
    } catch (error) {
      console.error('[API] Error fetching saved interpretation:', error);
      res.status(500).json({ error: 'Failed to fetch saved interpretation' });
    }
  });

  // Save a new interpretation
  app.post("/api/saved-interpretations", async (req, res) => {
    console.log('[API] POST /api/saved-interpretations');
    try {
      const { patientName, gender, labValues, interpretation, labDate } = req.body;
      
      if (!patientName || !gender || !labValues || !interpretation) {
        return res.status(400).json({ 
          error: 'Missing required fields: patientName, gender, labValues, interpretation' 
        });
      }
      
      const saved = await storage.createSavedInterpretation({
        patientName,
        gender,
        labValues,
        interpretation,
        labDate: labDate ? new Date(labDate) : new Date(),
      });

      // Also create/find patient profile and link lab result
      try {
        const nameParts = patientName.trim().split(/\s+/);
        const firstName = nameParts[0] || patientName;
        const lastName = nameParts.slice(1).join(' ') || '';
        if (firstName && lastName) {
          let patient = await storage.getPatientByName(firstName, lastName);
          if (!patient) {
            patient = await storage.createPatient({
              firstName,
              lastName,
              gender: gender as 'male' | 'female',
            });
            console.log('[API] Auto-created patient profile:', patient.id, firstName, lastName);
          }
          await storage.createLabResult({
            patientId: patient.id,
            labDate: labDate ? new Date(labDate) : new Date(),
            labValues,
            interpretationResult: interpretation,
          } as InsertLabResult);
          console.log('[API] Linked lab result to patient:', patient.id);
        }
      } catch (linkError) {
        console.error('[API] Error auto-linking patient profile (non-fatal):', linkError);
      }
      
      console.log('[API] Saved interpretation for patient:', patientName);
      res.status(201).json(saved);
    } catch (error) {
      console.error('[API] Error saving interpretation:', error);
      res.status(500).json({ error: 'Failed to save interpretation' });
    }
  });

  // Delete a saved interpretation
  app.delete("/api/saved-interpretations/:id", async (req, res) => {
    console.log('[API] DELETE /api/saved-interpretations/:id');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid interpretation ID' });
      }
      
      const deleted = await storage.deleteSavedInterpretation(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Interpretation not found' });
      }
      
      res.json({ success: true, message: 'Interpretation deleted' });
    } catch (error) {
      console.error('[API] Error deleting interpretation:', error);
      res.status(500).json({ error: 'Failed to delete interpretation' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
