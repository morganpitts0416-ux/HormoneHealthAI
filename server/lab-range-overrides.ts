// Per-marker, per-gender lab range overrides.
//
// Approach: defaults remain authoritative. After the existing ClinicalLogicEngine
// (or FemaleClinicalLogicEngine) produces interpretations, we walk the result and
// for ONLY the markers a clinician has explicitly customized, we recompute the
// status (normal / borderline / abnormal / critical), refresh the displayed
// reference range string, and append a small note so the provider sees that the
// custom range was applied. Markers without a custom override are left exactly
// as the engine returned them.

import type { LabInterpretation } from "@shared/schema";
import type { ClinicianLabPreference } from "@shared/schema";
import { LAB_MARKER_DEFAULTS, type LabMarkerDefault } from "./lab-marker-defaults";

type Gender = "male" | "female";

export interface ResolvedRange {
  markerKey: string;
  displayName: string;
  unit: string;
  optimalMin?: number;
  optimalMax?: number;
  normalMin?: number;
  normalMax?: number;
  isCustom: boolean;
}

/**
 * Build a lookup keyed by displayName (case-insensitive) → resolved range
 * for the given gender. Each entry indicates whether the values came from a
 * clinician override or the default.
 */
export function buildResolvedRangeLookup(
  preferences: ClinicianLabPreference[],
  gender: Gender,
): Map<string, ResolvedRange> {
  const lookup = new Map<string, ResolvedRange>();

  // 1. Seed with defaults for this gender (and 'both').
  for (const def of LAB_MARKER_DEFAULTS) {
    if (def.gender !== gender && def.gender !== "both") continue;
    lookup.set(def.displayName.toLowerCase(), {
      markerKey: def.key,
      displayName: def.displayName,
      unit: def.unit,
      optimalMin: def.optimalMin,
      optimalMax: def.optimalMax,
      normalMin: def.normalMin,
      normalMax: def.normalMax,
      isCustom: false,
    });
  }

  // 2. Layer clinician overrides on top, ONLY for markers the clinician customized.
  for (const pref of preferences) {
    // Honor gender targeting on the override row.
    if (pref.gender !== "both" && pref.gender !== gender) continue;

    // Find the matching default(s) so we know the canonical displayName/unit.
    const matchingDefaults = LAB_MARKER_DEFAULTS.filter(
      d => d.key === pref.markerKey && (d.gender === gender || d.gender === "both"),
    );
    const baseDef: LabMarkerDefault | undefined = matchingDefaults[0];
    const displayName = pref.displayName || baseDef?.displayName;
    if (!displayName) continue; // unknown marker, skip silently

    const existing = lookup.get(displayName.toLowerCase());
    lookup.set(displayName.toLowerCase(), {
      markerKey: pref.markerKey,
      displayName,
      unit: pref.unit || existing?.unit || baseDef?.unit || "",
      // Per-field override: clinician value wins when set, otherwise keep default.
      optimalMin: pref.optimalMin ?? existing?.optimalMin,
      optimalMax: pref.optimalMax ?? existing?.optimalMax,
      normalMin: pref.normalMin ?? existing?.normalMin,
      normalMax: pref.normalMax ?? existing?.normalMax,
      isCustom: true,
    });
  }

  return lookup;
}

function formatRange(min?: number, max?: number, unit?: string): string {
  const u = unit ? ` ${unit}` : "";
  if (min !== undefined && max !== undefined) return `${min}–${max}${u}`;
  if (min !== undefined) return `≥ ${min}${u}`;
  if (max !== undefined) return `≤ ${max}${u}`;
  return "";
}

/**
 * Recompute interpretation status using a custom range.
 * - Inside optimal → 'normal'
 * - Inside reference but outside optimal → 'borderline'
 * - Outside reference → 'abnormal'
 * Critical statuses set by the upstream engine (red-flag thresholds) are preserved.
 */
function statusFromCustomRange(
  value: number,
  range: ResolvedRange,
  upstreamStatus: LabInterpretation["status"],
): LabInterpretation["status"] {
  // Never downgrade a critical flag set by red-flag logic.
  if (upstreamStatus === "critical") return "critical";

  const inOptimal =
    (range.optimalMin === undefined || value >= range.optimalMin) &&
    (range.optimalMax === undefined || value <= range.optimalMax);
  if (inOptimal && (range.optimalMin !== undefined || range.optimalMax !== undefined)) {
    return "normal";
  }

  const inReference =
    (range.normalMin === undefined || value >= range.normalMin) &&
    (range.normalMax === undefined || value <= range.normalMax);
  if (inReference) {
    // Has an optimal range and value falls outside it but inside reference → borderline.
    if (range.optimalMin !== undefined || range.optimalMax !== undefined) return "borderline";
    return "normal";
  }

  return "abnormal";
}

/**
 * Apply per-marker clinician overrides to an array of interpretations.
 * Mutates a copy and returns it. Defaults remain when no override exists.
 */
export function applyCustomRangesToInterpretations(
  interpretations: LabInterpretation[],
  preferences: ClinicianLabPreference[],
  gender: Gender,
): LabInterpretation[] {
  if (!preferences.length) return interpretations;

  const lookup = buildResolvedRangeLookup(preferences, gender);

  return interpretations.map(interp => {
    const resolved = lookup.get(interp.category.toLowerCase());
    if (!resolved || !resolved.isCustom) return interp;

    // Only re-evaluate when we actually have a numeric value to test against.
    if (interp.value === undefined || interp.value === null) {
      return {
        ...interp,
        referenceRange: buildReferenceRangeString(resolved) || interp.referenceRange,
        recommendation: appendCustomNote(interp.recommendation, resolved),
      };
    }

    const newStatus = statusFromCustomRange(interp.value, resolved, interp.status);

    return {
      ...interp,
      status: newStatus,
      referenceRange: buildReferenceRangeString(resolved) || interp.referenceRange,
      recommendation: appendCustomNote(interp.recommendation, resolved),
    };
  });
}

function buildReferenceRangeString(r: ResolvedRange): string {
  const optimal = formatRange(r.optimalMin, r.optimalMax, r.unit);
  const reference = formatRange(r.normalMin, r.normalMax, r.unit);
  if (optimal && reference) return `Optimal ${optimal} (Reference ${reference})`;
  return optimal || reference || "";
}

function appendCustomNote(existing: string, r: ResolvedRange): string {
  const optimal = formatRange(r.optimalMin, r.optimalMax, r.unit);
  const note = optimal
    ? `Provider's optimized target range applied for this marker: ${optimal}.`
    : "Provider's customized reference range applied for this marker.";
  if (existing && existing.includes(note)) return existing;
  return existing ? `${existing.trim()}\n\n${note}` : note;
}
