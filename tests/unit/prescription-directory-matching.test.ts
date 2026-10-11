import { describe, expect, it } from "vitest";
import { findExactFormulation } from "../../client/src/lib/prescription-directory";
const product = { id: 1, medicationName: "Synthetic Medication", strength: "25 mg", dosageForm: "tablet", isActive: true };
describe("Exact clinical formulation matching", () => {
  it("matches case and whitespace without interpreting clinical identity", () => {
    expect(findExactFormulation([product], { medicationName: "synthetic  medication", strength: "25 MG", dosageForm: "TABLET" })).toEqual(product);
  });
  it.each(["strength", "dosageForm", "medicationName"] as const)("does not match a different %s", field => {
    expect(findExactFormulation([product], { ...product, [field]: "different" })).toBeNull();
  });
  it("does not guess an identity from just the drug name or from inactive/malformed rows", () => {
    expect(findExactFormulation([product], { ...product, strength: "" })).toBeNull();
    expect(findExactFormulation([{ ...product, isActive: false }, null, { id: 2 }], product)).toBeNull();
    expect(findExactFormulation({}, product)).toBeNull();
  });
});
