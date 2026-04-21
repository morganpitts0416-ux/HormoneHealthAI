// Universal patient-facing branding tokens.
//
// These are the platform-default colors used when a clinic (and a per-form
// override) has not set anything. The defaults are intentionally close to the
// historic ClinIQ blue so existing patient artifacts keep the same look.
//
// Layout, fonts, spacing, and clinical-meaning colors (normal / borderline /
// abnormal / critical, red-flag alerts) are NEVER affected by branding. Only
// the brand color tokens below are swapped per-clinic.

export interface BrandingColors {
  /** Main brand color — section headers, divider lines, primary header band. */
  primaryColor: string;
  /** Secondary highlight — call-outs, small accent rules, status pills. */
  accentColor: string;
  /** Background tint behind public form pages. */
  formBackgroundColor: string;
}

export const PLATFORM_DEFAULT_BRANDING: BrandingColors = {
  primaryColor: "#1f4e79",        // ClinIQ navy
  accentColor: "#3b82f6",         // ClinIQ accent blue
  formBackgroundColor: "#f8fafc", // Soft slate background for portal pages
};

export type PartialBranding = Partial<Record<keyof BrandingColors, string | null | undefined>>;

/**
 * Resolve the effective branding for a patient-facing artifact.
 *
 * Order: per-form override (if present) → clinic default → platform default.
 * Any nullish or empty value falls through to the next layer.
 */
export function resolveBranding(
  formBranding?: PartialBranding | null,
  clinicBranding?: PartialBranding | null,
): BrandingColors {
  const pick = (key: keyof BrandingColors): string => {
    const fb = formBranding?.[key];
    if (typeof fb === "string" && fb.trim()) return fb;
    const cb = clinicBranding?.[key];
    if (typeof cb === "string" && cb.trim()) return cb;
    return PLATFORM_DEFAULT_BRANDING[key];
  };
  return {
    primaryColor: pick("primaryColor"),
    accentColor: pick("accentColor"),
    formBackgroundColor: pick("formBackgroundColor"),
  };
}

/** Convert a 6-digit hex color (#rrggbb) to a jsPDF-friendly [r,g,b] tuple. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
