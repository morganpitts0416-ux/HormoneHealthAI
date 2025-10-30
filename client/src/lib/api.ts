import type { LabValues, InterpretationResult } from "@shared/schema";
import { apiRequest } from "./queryClient";

export const labsApi = {
  interpretLabs: async (labValues: LabValues): Promise<InterpretationResult> => {
    return apiRequest("POST", "/api/interpret-labs", labValues);
  },
};
