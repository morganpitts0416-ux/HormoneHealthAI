import type { LabValues, InterpretationResult } from "@shared/schema";
import { apiRequest } from "./queryClient";

export const labsApi = {
  interpretLabs: async (labValues: LabValues): Promise<InterpretationResult> => {
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
};
