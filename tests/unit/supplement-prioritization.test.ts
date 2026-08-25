import { describe, expect, test } from "vitest";
import { evaluateSupplements } from "../../server/supplements-female";
import { evaluateMaleSupplements } from "../../server/supplements-male";
import { calculateMitoScore } from "../../server/mito-score";

const isPhytoMulti = (name: string) => name.toLowerCase().includes("phytomulti");

describe("PhytoMulti fallback prioritization", () => {
  test("suppresses PhytoMulti when targeted vitamin D repletion is recommended for women", () => {
    const recommendations = evaluateSupplements({
      vitaminD: 35,
      vitaminB12: 300,
      folate: 8,
    }).recommendations;
    const names = recommendations.map(recommendation => recommendation.name);

    expect(names).toContain("D3 5,000 + K");
    expect(names.some(isPhytoMulti)).toBe(false);
  });

  test("suppresses PhytoMulti when B-vitamin support is recommended for women", () => {
    const recommendations = evaluateSupplements({
      vitaminB12: 500,
      folate: 8,
    }).recommendations;
    const names = recommendations.map(recommendation => recommendation.name);

    expect(names).toContain("StayStrong+® Brain & Body");
    expect(names.some(isPhytoMulti)).toBe(false);
  });

  test("suppresses PhytoMulti when targeted vitamin D or B-vitamin support is recommended for men", () => {
    const recommendations = evaluateMaleSupplements({
      vitaminD: 35,
      vitaminB12: 300,
      folate: 8,
    });
    const names = recommendations.map(recommendation => recommendation.name);

    expect(names).toContain("D3 5,000 + K");
    expect(names).toContain("StayStrong+® Brain & Body");
    expect(names.some(isPhytoMulti)).toBe(false);
  });

  test("suppresses PhytoMulti from Mito Score output when another supplement is present", () => {
    const result = calculateMitoScore({
      vitaminD: 35,
      vitaminB12: 300,
      folate: 8,
      ferritin: 30,
      hsCRP: 3,
      hemoglobin: 11,
    }, "female");
    const names = (result.supplementRecommendations ?? []).map(recommendation => recommendation.name);

    expect(names.length).toBeGreaterThan(0);
    expect(names.some(name => name.toLowerCase().includes("coq10"))).toBe(true);
    expect(names.some(isPhytoMulti)).toBe(false);
  });
});