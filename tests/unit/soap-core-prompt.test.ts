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

  test("resolves conversational references when determining the final treatment plan", () => {
    expect(prompt).toContain("CONVERSATIONAL REFERENCE RESOLUTION — FINAL TREATMENT PLAN");
    expect(prompt).toContain('"put it in there"');
    expect(prompt).toContain('"put X in there too"');
    expect(prompt).toContain("Treat a referent as resolved when the same contiguous treatment exchange provides a natural, clinically coherent antecedent");
    expect(prompt).toContain('Do not require the clinician to repeat the full medication or product name, or to use explicit "switch" or "stop" language');
    expect(prompt).toContain('A later definitive instruction such as "put X in there too" or "add that to it" modifies or combines X');
    expect(prompt).toContain("apply the Four-Location Mandate only to the resolved active treatment.");
    expect(prompt).toContain("I'm going to put your estrogen in there too.");
    expect(prompt).toContain("compounded preparation containing estrogen and testosterone");
    expect(prompt).toContain("If no natural, clinically coherent antecedent exists, or two competing antecedents remain genuinely plausible, do not guess.");
  });

  test("states clinical conclusions directly while preserving valid counseling-event language", () => {
    expect(prompt).toContain('Clinical conclusions should be stated directly rather than distanced by qualifiers such as "discussed," "reviewed," "stated," or "described"');
    expect(prompt).toContain('Avoid: "ApoB is 90 mg/dL, below the discussed low-risk goal of 130 mg/dL."');
    expect(prompt).toContain('Prefer: "ApoB is 90 mg/dL, within goal for her current cardiovascular risk category."');
    expect(prompt).toContain('Avoid: "Estradiol is below the range discussed for bone preservation."');
    expect(prompt).toContain('Prefer: "Estradiol is below the target range used for bone preservation."');
    expect(prompt).toContain('This does not prohibit documenting actual counseling or discussion events');
    expect(prompt).toContain('"risks and benefits were discussed"');
    expect(prompt).toContain('"treatment options were reviewed"');
  });

  test("uses narrative economy without dropping clinically relevant encounter detail", () => {
    expect(prompt).toContain("NARRATIVE ECONOMY / CLINICAL RELEVANCE:");
    expect(prompt).toContain("Detailed does not mean exhaustive.");
    expect(prompt).toContain("document the topic and the clinically relevant takeaway rather than reproducing the full teaching explanation");
    expect(prompt).toContain('"Reviewed differences between semaglutide and tirzepatide, including expected efficacy and GI tolerability."');
    expect(prompt).toContain("Do not narrate uncertainty about conversational relationships unless that uncertainty affects diagnosis, treatment, medication reconciliation, or safety.");
    expect(prompt).toContain("Do not achieve concision by deleting symptoms, treatment decisions, counseling, patient preferences, medication changes, or clinically relevant rationale.");
  });

  test("uses natural outpatient clinical documentation style", () => {
    expect(prompt).toContain("NATURAL CLINICAL DOCUMENTATION STYLE:");
    expect(prompt).toContain("Write in natural, professional clinical language that resembles how an experienced outpatient clinician documents an encounter.");
    expect(prompt).toContain('"Her goal is appetite control rather than additional weight loss."');
    expect(prompt).toContain('"Food noise/appetite has returned since stopping semaglutide."');
    expect(prompt).toContain('"Discussed restarting semaglutide vs trying tirzepatide. She would like to trial tirzepatide."');
    expect(prompt).toContain('Preserve the patient\'s own clinically useful terminology when appropriate');
    expect(prompt).toContain("sounds like it was written by the treating clinician rather than generated as a formal summary of the encounter.");
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