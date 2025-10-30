import type { LabValues, InterpretationResult } from "@shared/schema";
import { apiRequest } from "./queryClient";

export const labsApi = {
  interpretLabs: async (labValues: LabValues): Promise<InterpretationResult> => {
    console.log('[API Client] interpretLabs called with:', labValues);
    const result = await apiRequest("POST", "/api/interpret-labs", labValues);
    console.log('[API Client] interpretLabs result:', result);
    return result;
  },
};
