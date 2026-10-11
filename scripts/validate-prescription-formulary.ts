import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { requireNoncontrolledMedication } from "../server/prescription-medication-policy";
const path = process.argv[2];
if (!path) throw new Error("Usage: npx tsx scripts/validate-prescription-formulary.ts /approved/catalog.json");
const bytes = readFileSync(path);
const catalog = JSON.parse(bytes.toString("utf8"));
if (!Array.isArray(catalog) || !catalog.length) throw new Error("Nonempty reviewed catalog required");
const identities = new Set<string>();
for (const entry of catalog) {
  const identity = [entry.medicationName, entry.strength, entry.dosageForm]
    .map(value => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "").join("\u0000");
  if (identities.has(identity)) throw new Error("Duplicate formulation identities are not allowed");
  identities.add(identity);
  requireNoncontrolledMedication(entry, catalog, new Date());
}
console.log(JSON.stringify({ entries: catalog.length, sha256: createHash("sha256").update(bytes).digest("hex"),
  note: "Schema/expiry checks only; an authorized clinician must independently verify clinical eligibility." }));
