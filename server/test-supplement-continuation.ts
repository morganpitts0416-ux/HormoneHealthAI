/**
 * Regression test for the supplement continuation layer.
 * Run with: npx tsx server/test-supplement-continuation.ts
 */
import { applySupplementContinuation } from "./supplement-continuation";
import type { SupplementRecommendation } from "@shared/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_SUPP = (name: string): SupplementRecommendation => ({
  name,
  dose: "1 daily",
  indication: "Test indication",
  rationale: "Test rationale",
  priority: "medium",
  category: "vitamin",
});

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ── Test cases ────────────────────────────────────────────────────────────────

console.log("\n1. Existing engine recommendations are unchanged when patient has no meds");
{
  const supps = [BASE_SUPP("OmegaGenics® EPA-DHA 1000"), BASE_SUPP("Ferrochel® Iron")];
  const result = applySupplementContinuation(supps, [], {});
  assert("Same count returned", result.length === 2);
  assert("No continuationNote on first", !result[0].continuationNote);
  assert("No continuationOnly on second", !result[1].continuationOnly);
}

console.log("\n2. Engine-recommended supplement is NOT duplicated when patient is taking it (Scenario A)");
{
  const supps = [BASE_SUPP("Vitamin D3 with K2")];
  const labs = { vitaminD: 80 };
  const meds = ["Vitamin D3 5000 IU daily"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("Still only one entry (no duplicate)", result.length === 1);
  assert("continuationNote set on existing entry", !!result[0].continuationNote);
  assert("continuationOnly NOT set (Scenario A)", result[0].continuationOnly !== true);
  assert("Original name preserved", result[0].name === "Vitamin D3 with K2");
}

console.log("\n3. Vitamin D = 80 + patient taking D3 → continuation-only entry created (Scenario B)");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { vitaminD: 80 };
  const meds = ["Vitamin D3 5000 IU daily"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("One continuation-only entry added", result.length === 1);
  assert("continuationOnly = true", result[0].continuationOnly === true);
  assert("continuationNote is set", !!result[0].continuationNote);
  assert("Note says 'while taking'", result[0].continuationNote!.includes("while taking"));
  assert("Note does NOT say 'caused'", !result[0].continuationNote!.includes("caused"));
  assert("Note mentions optimal value", result[0].continuationNote!.includes("80 ng/mL"));
  assert("Priority is 'low'", result[0].priority === "low");
  assert("Category is 'vitamin'", result[0].category === "vitamin");
  console.log("   Note:", result[0].continuationNote);
}

console.log("\n4. Vitamin D = 80 + patient NOT taking D3 → no continuation entry");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { vitaminD: 80 };
  const meds = ["Lisinopril 10mg daily", "Metformin 500mg twice daily"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("No entries added", result.length === 0);
}

console.log("\n5. Low Vitamin D (35 ng/mL) + patient taking D3 → no continuation (lab not optimal)");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { vitaminD: 35 };
  const meds = ["Vitamin D3 5000 IU daily"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("No continuation entry (not optimal)", result.length === 0);
}

console.log("\n6. Low Vitamin D + patient NOT taking D3 → engine would fire normally, no interference");
{
  // Simulate engine-recommended Vitamin D for a deficient patient
  const supps = [BASE_SUPP("Vitamin D3 + K2 5000")];
  const labs = { vitaminD: 35 };
  const meds: string[] = [];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("Engine recommendation preserved", result.length === 1);
  assert("No continuationNote", !result[0].continuationNote);
  assert("No continuationOnly", !result[0].continuationOnly);
}

console.log("\n7. Omega-3: triglycerides 120 + patient taking fish oil → continuation-only (Scenario B)");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { triglycerides: 120 };
  const meds = ["OmegaGenics Fish Oil 1000mg twice daily"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("Continuation-only entry added", result.length === 1);
  assert("continuationOnly = true", result[0].continuationOnly === true);
  assert("Note mentions triglycerides", result[0].continuationNote!.includes("triglycerides"));
  assert("Note says 'while taking'", result[0].continuationNote!.includes("while taking"));
}

console.log("\n8. Omega-3: triglycerides 200 (not optimal) + patient taking fish oil → no entry");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { triglycerides: 200 };
  const meds = ["Omega-3 Fish Oil 2000mg"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("No continuation entry (not optimal)", result.length === 0);
}

console.log("\n9. Multiple meds — only the one with an optimal marker fires");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { vitaminD: 75, vitaminB12: 300 }; // B12 not optimal (<500)
  const meds = ["Vitamin D3 5000 IU", "Methylcobalamin B12 1000mcg", "Lisinopril 10mg"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("Only D3 continuation added (B12 not optimal)", result.length === 1);
  assert("The entry is Vitamin D3", result[0].name === "Vitamin D3");
}

console.log("\n10. Iron: ferritin 70 (optimal) + patient taking Hemagenics → continuation-only");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { ferritin: 70 };
  const meds = ["Hemagenics Iron 29mg daily"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("Continuation-only entry added", result.length === 1);
  assert("continuationOnly = true", result[0].continuationOnly === true);
  assert("Category is 'iron'", result[0].category === "iron");
}

console.log("\n11. Berberine: A1c 5.1 (optimal) + patient taking berberine → continuation-only");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { hba1c: 5.1 };
  const meds = ["Berberine HCl 500mg twice daily"];
  const result = applySupplementContinuation(supps, meds, labs);
  assert("Continuation-only entry added", result.length === 1);
  assert("Note mentions A1c", result[0].continuationNote!.includes("A1c"));
}

console.log("\n12. No duplicate when two med strings match the same category");
{
  const supps: SupplementRecommendation[] = [];
  const labs = { vitaminD: 72 };
  const meds = ["D3 5000 IU", "Vitamin D3 + K2 combo"]; // two D3 entries
  const result = applySupplementContinuation(supps, meds, labs);
  assert("Only one continuation entry (no duplicate)", result.length === 1);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
