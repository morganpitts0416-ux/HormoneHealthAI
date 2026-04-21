import { useQuery } from "@tanstack/react-query";
import type { PartialBranding } from "@/lib/branding";

export interface ClinicBrandingResponse {
  primaryColor: string | null;
  accentColor: string | null;
  formBackgroundColor: string | null;
}

/**
 * Loads the current clinic's universal brand colors. All fields may be null
 * (clinic hasn't customized) — `resolveBranding()` from `@/lib/branding`
 * handles the fallback chain.
 */
export function useClinicBranding() {
  return useQuery<ClinicBrandingResponse>({
    queryKey: ["/api/clinic/branding"],
    staleTime: 5 * 60 * 1000,
  });
}

/** Convenience: returns the clinic branding shaped for `resolveBranding`. */
export function useClinicBrandingPartial(): PartialBranding | null {
  const { data } = useClinicBranding();
  return data ?? null;
}
