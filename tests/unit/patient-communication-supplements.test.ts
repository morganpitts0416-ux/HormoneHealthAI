import { describe, expect, test } from "vitest";
import type { SupplementRecommendation } from "@shared/schema";
import {
  normalizeSupplementName,
  normalizeSupplementPriorityOverrides,
  resolvePatientVisibleSupplementProtocol,
} from "@shared/patient-visible-supplement-protocol";
import { buildPatientVisibleSupplementProtocolPromptBlock } from "../../server/patient-communication-context";

const brainSupplement: SupplementRecommendation = {
  name: "Brain Metabolic Support",
  dose: "1 capsule twice daily",
  indication: "Fasting glucose 102 mg/dL",
  rationale: "Supports insulin sensitivity.",
  priority: "high",
  category: "metabolic",
  supportingFindings: ["Fasting glucose 102 mg/dL", "TG:HDL pattern"],
  phenotypes: ["Insulin Resistance / Visceral Adiposity"],
  continuationNote: "Patient is currently taking a lower dose.",
};

const clinicianSupplement: SupplementRecommendation = {
  name: "Clinician Added Support",
  dose: "2 capsules with dinner",
  indication: "Supports the selected metabolic plan",
  rationale: "Added by clinician after reviewing the complete evaluation.",
  priority: "medium",
  category: "probiotic",
  supportingFindings: ["Bloating reported"],
  phenotypes: ["Gut-Microbiome Support"],
};

describe("patient-visible Supplement Protocol", () => {
  test("removes hidden Brain supplements, preserves structured fields, and includes clinician additions", () => {
    const resolved = resolvePatientVisibleSupplementProtocol(
      [brainSupplement, { ...brainSupplement, name: "Hidden Product" }],
      {
        hiddenSupplementNames: ["hidden product"],
        addedSupplements: [clinicianSupplement],
      },
    );

    expect(resolved).toEqual([brainSupplement, clinicianSupplement]);
    expect(resolved[0]).toMatchObject({
      supportingFindings: brainSupplement.supportingFindings,
      phenotypes: brainSupplement.phenotypes,
      continuationNote: brainSupplement.continuationNote,
    });
  });

  test("lets an explicitly clinician-added product replace a matching Brain product", () => {
    const clinicianVersion = {
      ...brainSupplement,
      dose: "1 capsule with dinner",
      rationale: "Clinician-adjusted plan.",
    };

    const resolved = resolvePatientVisibleSupplementProtocol(
      [brainSupplement],
      { addedSupplements: [clinicianVersion] },
    );

    expect(resolved).toEqual([clinicianVersion]);
  });

  test("passes structured protocol context and fidelity rules to the writer", () => {
    const block = buildPatientVisibleSupplementProtocolPromptBlock([
      brainSupplement,
      clinicianSupplement,
    ]);

    expect(block).toContain("RESOLVED PATIENT-VISIBLE SUPPLEMENT PROTOCOL");
    expect(block).toContain('"supportingFindings"');
    expect(block).toContain('"phenotypes"');
    expect(block).toContain('"continuationNote"');
    expect(block).toContain("Do not reproduce this as a separate product list");
    expect(block).toContain("use the exact selected product name");
    expect(block).toContain("absent from this resolved protocol");
  });

  test("uses the provider-selected priority instead of the Brain default", () => {
    const resolved = resolvePatientVisibleSupplementProtocol(
      [brainSupplement],
      {
        supplementPriorityOverrides: {
          [normalizeSupplementName(brainSupplement.name)]: "low",
        },
      },
    );

    expect(resolved).toEqual([{ ...brainSupplement, priority: "low" }]);
  });

  test("falls back to the Brain priority when no provider priority exists", () => {
    const resolved = resolvePatientVisibleSupplementProtocol([brainSupplement], {});

    expect(resolved[0].priority).toBe("high");
  });

  test("applies a provider priority override to a clinician-added supplement", () => {
    const resolved = resolvePatientVisibleSupplementProtocol(
      [],
      {
        addedSupplements: [clinicianSupplement],
        supplementPriorityOverrides: {
          [normalizeSupplementName(clinicianSupplement.name)]: "high",
        },
      },
    );

    expect(resolved).toEqual([{ ...clinicianSupplement, priority: "high" }]);
  });

  test("keeps hiding independent from a saved priority override", () => {
    const overrides = {
      supplementPriorityOverrides: {
        [normalizeSupplementName(brainSupplement.name)]: "medium" as const,
      },
      hiddenSupplementNames: [brainSupplement.name],
    };

    expect(resolvePatientVisibleSupplementProtocol([brainSupplement], overrides)).toEqual([]);
    expect(
      resolvePatientVisibleSupplementProtocol([brainSupplement], {
        ...overrides,
        hiddenSupplementNames: [],
      }),
    ).toEqual([{ ...brainSupplement, priority: "medium" }]);
  });

  test("matches priority override names through the centralized normalization rule", () => {
    const spacedName = "  BRAIN METABOLIC SUPPORT  ";
    const resolved = resolvePatientVisibleSupplementProtocol(
      [{ ...brainSupplement, name: spacedName }],
      {
        supplementPriorityOverrides: {
          [normalizeSupplementName("brain metabolic support")]: "medium",
        },
      },
    );

    expect(resolved[0].priority).toBe("medium");
  });

  test("canonicalizes priority override keys before persistence", () => {
    expect(
      normalizeSupplementPriorityOverrides({
        "  BRAIN METABOLIC SUPPORT  ": "medium",
        "Not a valid priority": "urgent",
      }),
    ).toEqual({
      [normalizeSupplementName(brainSupplement.name)]: "medium",
    });
  });

  test("passes the final resolved priority and priority semantics to Patient Communication", () => {
    const resolved = resolvePatientVisibleSupplementProtocol(
      [brainSupplement],
      {
        supplementPriorityOverrides: {
          [normalizeSupplementName(brainSupplement.name)]: "low",
        },
      },
    );
    const block = buildPatientVisibleSupplementProtocolPromptBlock(resolved);

    expect(block).toContain('"priority": "low"');
    expect(block).toContain("high priority should be strongly favored");
    expect(block).toContain("medium priority should be included");
    expect(block).toContain("low priority should generally remain");
    expect(block).toContain("does not mean mechanically mentioning every high-priority product");
  });
});