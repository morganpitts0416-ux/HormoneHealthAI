export type MedicationFormulation = {
  id: number;
  medicationName: string;
  strength: string;
  dosageForm: string;
  isActive: boolean;
};
type Identity = Pick<MedicationFormulation, "medicationName" | "strength" | "dosageForm">;
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

// Never resolve by medication name alone: salts, strength and release form matter.
export function findExactFormulation(rows: unknown, identity: Identity): MedicationFormulation | null {
  if (!Array.isArray(rows) || (["medicationName", "strength", "dosageForm"] as const).some(field =>
    typeof identity[field] !== "string" || !identity[field].trim()
  )) return null;
  return rows.find(row => row && Number.isSafeInteger(row.id) && row.id > 0 && row.isActive === true &&
    (["medicationName", "strength", "dosageForm"] as const).every(field =>
      typeof row[field] === "string" && normalize(row[field]) === normalize(identity[field])
    )) ?? null;
}
