import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { interpretLabsRequestSchema, femaleLabValuesSchema, type InterpretationResult, insertSavedInterpretationSchema } from "@shared/schema";
import { ClinicalLogicEngine } from "./clinical-logic";
import { FemaleClinicalLogicEngine } from "./clinical-logic-female";
import { AIService } from "./ai-service";
import { PDFExtractionService } from "./pdf-extraction";
import { ASCVDCalculator } from "./ascvd-calculator";
import { StopBangCalculator } from "./stopbang-calculator";
import { evaluateSupplements } from "./supplements-female";
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

      // Step 1: Detect red flags
      const redFlags = ClinicalLogicEngine.detectRedFlags(labs);

      // Step 2: Generate detailed interpretations
      const interpretations = ClinicalLogicEngine.interpretLabValues(labs);

      // Step 3: Calculate ASCVD risk if demographics and lipid data are available
      const ascvdRisk = ASCVDCalculator.calculateRisk(labs) || undefined;
      console.log('[API] ASCVD calculation result:', ascvdRisk ? `Risk: ${ascvdRisk.riskPercentage}, Category: ${ascvdRisk.riskCategory}` : 'Not calculated (missing required fields)');

      // Step 3a: Add ASCVD to interpretations if calculated (displayed in main results table)
      if (ascvdRisk) {
        console.log('[API] Adding ASCVD to interpretations array');
        // Map ASCVD risk category to interpretation status
        const getRiskStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'borderline': return 'borderline';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical';
            default: return 'abnormal';
          }
        };

        // Find the index after lipid panel interpretations to insert ASCVD
        const lipidEndIndex = interpretations.findIndex((interp, idx, arr) => 
          // Find last lipid-related interpretation
          (interp.category.toLowerCase().includes('cholesterol') || 
           interp.category.toLowerCase().includes('triglyceride') ||
           interp.category.toLowerCase().includes('ldl') ||
           interp.category.toLowerCase().includes('hdl')) &&
          // Check if next item is not lipid-related
          (!arr[idx + 1] || 
           (!arr[idx + 1].category.toLowerCase().includes('cholesterol') &&
            !arr[idx + 1].category.toLowerCase().includes('triglyceride') &&
            !arr[idx + 1].category.toLowerCase().includes('ldl') &&
            !arr[idx + 1].category.toLowerCase().includes('hdl')))
        );

        const ascvdInterpretation = {
          category: 'ASCVD Cardiovascular Risk',
          value: parseFloat(ascvdRisk.riskPercentage.replace('%', '')),
          unit: '%',
          status: getRiskStatus(ascvdRisk.riskCategory),
          referenceRange: 'Low <5%, Borderline 5-7.4%, Intermediate 7.5-19.9%, High ≥20%',
          interpretation: `10-year risk of heart attack or stroke: ${ascvdRisk.riskPercentage} (${ascvdRisk.riskCategory.toUpperCase()} RISK)`,
          recommendation: ascvdRisk.recommendations,
          recheckTiming: 'Annual',
        };

        // Insert after lipid panel if found, otherwise append at end
        if (lipidEndIndex !== -1) {
          interpretations.splice(lipidEndIndex + 1, 0, ascvdInterpretation);
        } else {
          interpretations.push(ascvdInterpretation);
        }
      }

      // Step 3b: Calculate STOP-BANG sleep apnea risk if demographics data available
      const stopBangRisk = StopBangCalculator.calculateRisk(labs) || undefined;
      console.log('[API] STOP-BANG calculation result:', stopBangRisk ? `Score: ${stopBangRisk.score}/8, Risk: ${stopBangRisk.riskCategory}` : 'Not calculated (missing demographics data)');

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

        // Insert after ASCVD if it exists, otherwise after lipid panel, otherwise at end
        const ascvdIndex = interpretations.findIndex(interp => interp.category === 'ASCVD Cardiovascular Risk');
        if (ascvdIndex !== -1) {
          interpretations.splice(ascvdIndex + 1, 0, stopBangInterpretation);
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

      // Step 4: Generate AI-powered recommendations
      const aiRecommendations = await AIService.generateRecommendations(
        labs,
        redFlags,
        interpretations
      );

      // Step 5: Generate patient-friendly summary (includes ASCVD-based lifestyle modifications)
      const patientSummary = await AIService.generatePatientSummary(
        labs,
        interpretations,
        redFlags.length > 0,
        ascvdRisk
      );

      // Step 6: Determine recheck window
      const recheckWindow = ClinicalLogicEngine.determineRecheckWindow(
        redFlags,
        interpretations
      );

      // Construct response
      const result: InterpretationResult = {
        redFlags,
        interpretations,
        aiRecommendations,
        patientSummary,
        recheckWindow,
        ascvdRisk,
      };

      console.log('[API] Response summary:');
      console.log('  - Red flags:', redFlags.length);
      console.log('  - Interpretations:', interpretations.length);
      console.log('  - AI recommendations length:', aiRecommendations.length);
      console.log('  - Patient summary length:', patientSummary.length);
      console.log('  - Recheck window:', recheckWindow);

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

      // Step 1: Detect red flags using female-specific logic
      const redFlags = FemaleClinicalLogicEngine.detectRedFlags(labs);

      // Step 2: Generate detailed interpretations with female reference ranges
      const interpretations = FemaleClinicalLogicEngine.interpretLabValues(labs);

      // Step 3: Calculate ASCVD risk if demographics and lipid data are available
      // Note: ASCVD calculator already handles sex-specific equations
      const ascvdLabData = {
        ...labs,
        demographics: labs.demographics ? { ...labs.demographics, sex: 'female' as const } : undefined
      };
      const ascvdRisk = ASCVDCalculator.calculateRisk(ascvdLabData) || undefined;
      console.log('[API] Female ASCVD calculation result:', ascvdRisk ? `Risk: ${ascvdRisk.riskPercentage}, Category: ${ascvdRisk.riskCategory}` : 'Not calculated');

      // Step 3a: Add ASCVD to interpretations if calculated
      if (ascvdRisk) {
        console.log('[API] Adding ASCVD to female interpretations array');
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

        const ascvdInterpretation = {
          category: 'ASCVD Cardiovascular Risk',
          value: parseFloat(ascvdRisk.riskPercentage.replace('%', '')),
          unit: '%',
          status: getRiskStatus(ascvdRisk.riskCategory),
          referenceRange: 'Low <5%, Borderline 5-7.4%, Intermediate 7.5-19.9%, High ≥20%',
          interpretation: `10-year risk of heart attack or stroke: ${ascvdRisk.riskPercentage} (${ascvdRisk.riskCategory.toUpperCase()} RISK)`,
          recommendation: ascvdRisk.recommendations,
          recheckTiming: 'Annual',
        };

        if (lipidEndIndex !== -1) {
          interpretations.splice(lipidEndIndex + 1, 0, ascvdInterpretation);
        } else {
          interpretations.push(ascvdInterpretation);
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

        const ascvdIndex = interpretations.findIndex(interp => interp.category === 'ASCVD Cardiovascular Risk');
        if (ascvdIndex !== -1) {
          interpretations.splice(ascvdIndex + 1, 0, stopBangInterpretation);
        } else {
          interpretations.push(stopBangInterpretation);
        }
      }

      // Step 4: Generate AI-powered recommendations with female context
      const aiRecommendations = await AIService.generateRecommendations(
        labs,
        redFlags,
        interpretations,
        'female'
      );

      // Step 5: Generate patient-friendly summary
      const patientSummary = await AIService.generatePatientSummary(
        labs,
        interpretations,
        redFlags.length > 0,
        ascvdRisk,
        'female'
      );

      // Step 6: Determine recheck window using female-specific logic
      const recheckWindow = FemaleClinicalLogicEngine.determineRecheckWindow(labs, redFlags);

      // Step 7: Evaluate supplement recommendations based on lab values
      const supplements = evaluateSupplements(labs);
      console.log('[API] Supplement recommendations:', supplements.length);

      // Step 8: Compute cardiovascular risk stratification flags
      const cvRiskFlags = FemaleClinicalLogicEngine.computeCardiovascularRiskFlags(labs);
      console.log('[API] CV Risk Flags:', JSON.stringify(cvRiskFlags, null, 2));

      // Step 9: Generate CAC and statin recommendations
      const cacStatinRec = FemaleClinicalLogicEngine.generateCacStatinRecommendations(labs, cvRiskFlags);
      console.log('[API] CAC/Statin Recommendations generated');

      // Construct response
      const result: InterpretationResult = {
        redFlags,
        interpretations,
        aiRecommendations,
        patientSummary,
        recheckWindow,
        ascvdRisk,
        supplements,
        cvRiskFlags,
        cacStatinRec,
      };

      console.log('[API] Female interpretation response summary:');
      console.log('  - Red flags:', redFlags.length);
      console.log('  - Interpretations:', interpretations.length);
      console.log('  - AI recommendations length:', aiRecommendations.length);
      console.log('  - Patient summary length:', patientSummary.length);
      console.log('  - Recheck window:', recheckWindow);
      console.log('  - Supplements:', supplements.length);
      console.log('  - CV Risk Flags computed');

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
      const { labs, interpretations, supplements, ascvdRisk } = req.body;
      
      if (!labs || !interpretations) {
        return res.status(400).json({ error: 'Missing required fields: labs, interpretations' });
      }

      console.log('[API] Generating wellness plan with:', {
        labsProvided: !!labs,
        interpretationsCount: interpretations?.length,
        supplementsCount: supplements?.length,
        ascvdRiskProvided: !!ascvdRisk
      });

      const wellnessPlan = await AIService.generatePatientWellnessPlan(
        labs,
        interpretations,
        supplements || [],
        ascvdRisk || null
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
