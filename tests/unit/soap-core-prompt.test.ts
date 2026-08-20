import { describe, expect, test } from "vitest";
import { buildSoapCoreSystemPrompt } from "../../server/soap-pipeline";

describe("shared ClinIQ SOAP core prompt", () => {
  const prompt = buildSoapCoreSystemPrompt(true);

  test("uses treating-clinician voice without third-person observer narration", () => {
    expect(prompt).toContain("Write as the treating clinician documenting the encounter directly.");
    expect(prompt).toContain("ApoB is 90, within goal for her current cardiovascular risk category.");
    expect(prompt).toContain('"was described as low" / "was described as elevated" / "the stated goal" / "the discussed goal"');
    expect(prompt).not.toContain("Third person, past tense for narrative sections");
  });

  test("reconciles evolving treatment decisions using final-plan precedence", () => {
    expect(prompt).toContain("FINAL PLAN PRECEDENCE — READ THE ENTIRE TRANSCRIPT BEFORE FINALIZING:");
    expect(prompt).toContain("A later definitive statement supersedes an earlier tentative, exploratory, or provisional statement");
    expect(prompt).toContain("Do not carry an earlier option forward as an active plan after a later statement replaces it.");
  });

  test("keeps interventions from creating artificial diagnoses", () => {
    expect(prompt).toContain("Do not create a standalone diagnosis merely to provide a home for a medication, supplement, counseling");
    expect(prompt).toContain("Do not create a diagnosis solely to house the intervention.");
    expect(prompt).toContain("it does not establish a diagnosis by itself.");
    expect(prompt).not.toContain("There are NO exceptions.");
  });

  test("distinguishes optimization targets from disease coding", () => {
    expect(prompt).toContain("CLINIQ OPTIMIZATION TARGETS ARE NOT AUTOMATIC DIAGNOSES:");
    expect(prompt).toContain('Do not convert "suboptimal" into "deficient," "insufficient," or another disease diagnosis');
    expect(prompt).toContain("omit unsupported disease coding.");
    expect(prompt).not.toContain("If support is uncertain, keep the code");
  });
});