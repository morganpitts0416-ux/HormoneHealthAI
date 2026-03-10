import type { LabValues, FemaleLabValues, InterpretationResult } from "@shared/schema";
import { apiRequest } from "./queryClient";

export const labsApi = {
  interpretLabs: async (labValues: LabValues & { patientId?: number }): Promise<InterpretationResult> => {
    console.log('[API Client] interpretLabs called with:', labValues);
    const response = await apiRequest("POST", "/api/interpret-labs", labValues);
    const result = await response.json();
    console.log('[API Client] interpretLabs result:', result);
    return result;
  },

  extractPdfLabs: async (pdfFile: File): Promise<Partial<LabValues>> => {
    console.log('[API Client] extractPdfLabs called with file:', pdfFile.name);
    const formData = new FormData();
    formData.append('pdf', pdfFile);

    const response = await fetch('/api/extract-pdf-labs', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to extract PDF');
    }

    const result = await response.json();
    console.log('[API Client] extractPdfLabs result:', result);
    return result.data;
  },

  generateWellnessPlan: async (
    labs: LabValues,
    interpretations: InterpretationResult['interpretations'],
    supplements: InterpretationResult['supplements'],
    preventRisk: InterpretationResult['preventRisk']
  ): Promise<WellnessPlan> => {
    console.log('[API Client] generateMaleWellnessPlan called');
    const response = await apiRequest("POST", "/api/generate-wellness-plan-male", {
      labs,
      interpretations,
      supplements,
      preventRisk,
    });
    const result = await response.json();
    console.log('[API Client] generateMaleWellnessPlan result:', result);
    return result.wellnessPlan;
  },
};

export interface WellnessPlan {
  dietPlan: string;
  supplementProtocol: string;
  lifestyleRecommendations: string;
  educationalContent: string;
}

export const femaleLabsApi = {
  interpretLabs: async (labValues: FemaleLabValues & { patientId?: number }): Promise<InterpretationResult> => {
    console.log('[API Client] interpretLabsFemale called with:', labValues);
    const response = await apiRequest("POST", "/api/interpret-labs-female", labValues);
    const result = await response.json();
    console.log('[API Client] interpretLabsFemale result:', result);
    return result;
  },

  extractPdfLabs: async (pdfFile: File): Promise<Partial<FemaleLabValues>> => {
    console.log('[API Client] extractPdfLabsFemale called with file:', pdfFile.name);
    const formData = new FormData();
    formData.append('pdf', pdfFile);

    const response = await fetch('/api/extract-pdf-labs', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to extract PDF');
    }

    const result = await response.json();
    console.log('[API Client] extractPdfLabsFemale result:', result);
    return result.data;
  },

  generateWellnessPlan: async (
    labs: FemaleLabValues,
    interpretations: InterpretationResult['interpretations'],
    supplements: InterpretationResult['supplements'],
    preventRisk: InterpretationResult['preventRisk']
  ): Promise<WellnessPlan> => {
    console.log('[API Client] generateWellnessPlan called');
    const response = await apiRequest("POST", "/api/generate-wellness-plan", {
      labs,
      interpretations,
      supplements,
      preventRisk,
    });
    const result = await response.json();
    console.log('[API Client] generateWellnessPlan result:', result);
    return result.wellnessPlan;
  },
};
