import type { Express } from "express";
import { createServer, type Server } from "http";
import { interpretLabsRequestSchema, type InterpretationResult } from "@shared/schema";
import { ClinicalLogicEngine } from "./clinical-logic";
import { AIService } from "./ai-service";

export async function registerRoutes(app: Express): Promise<Server> {
  // Lab interpretation endpoint
  app.post("/api/interpret-labs", async (req, res) => {
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

      // Step 3: Generate AI-powered recommendations
      const aiRecommendations = await AIService.generateRecommendations(
        labs,
        redFlags,
        interpretations
      );

      // Step 4: Generate patient-friendly summary
      const patientSummary = await AIService.generatePatientSummary(
        labs,
        interpretations,
        redFlags.length > 0
      );

      // Step 5: Determine recheck window
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
      };

      res.json(result);
    } catch (error) {
      console.error("Error interpreting labs:", error);
      res.status(500).json({ 
        error: "Failed to interpret lab results", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
