import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildSoapCoreSystemPrompt } from "../../server/soap-pipeline";

describe("shared ClinIQ SOAP core prompt", () => {
  const prompt = buildSoapCoreSystemPrompt(true);
  const pipelineSource = readFileSync("server/soap-pipeline.ts", "utf8");

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
    expect(prompt).toContain("The note documents the clinical meaning of the encounter in natural provider language — not a recap of the conversation.");
    expect(prompt).toContain("Read and reason over the full transcript; document the clinical picture.");
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
    expect(prompt).toContain("Adding clinical precision means increasing specificity or reducing ambiguity");
    expect(prompt).toContain('"appetite-related signaling has returned" is more abstract, not more precise.');
    expect(prompt).toContain("sounds like it was written by the treating clinician rather than generated as a formal summary of the encounter.");
  });

  test("preserves clear functional symptom language without embellishment or unnecessary medicalization", () => {
    expect(prompt).toContain("FF-7. SYMPTOM FIDELITY — NO EMBELLISHMENT:");
    expect(prompt).toContain("Document symptoms in natural clinical language reflecting what the patient reported.");
    expect(prompt).toContain("Never attach anatomical detail, mechanism, sensory description, cause, or location that the patient did not explicitly state.");
    expect(prompt).toContain("Preserve a patient's own wording when it adds clinical meaning");
    expect(prompt).toContain("use that wording or a close natural paraphrase that preserves the same level of concreteness");
    expect(prompt).toContain("Do not replace it with a more abstract synonym merely because the synonym sounds more medical.");
    expect(prompt).toContain('"appetite signal," "appetite drive," or a similar abstract construct');
    expect(prompt).not.toContain("FF-7. VERBATIM SYMPTOM MINIMUM:");
  });

  test("defines section ownership without weakening clinical completeness", () => {
    expect(prompt).toContain("SECTION FUNCTION — REQUIRED NON-REDUNDANCY:");
    expect(prompt).toContain("HPI owns the detailed patient story, chronology, symptoms, prior treatment response, substantive discussion, and patient perspective.");
    expect(prompt).toContain("Overall Clinical Impression owns a focused synthesis of the current clinical picture and principal treatment outcome; it must not retell the HPI.");
    expect(prompt).toContain("Clinical Rationale owns the diagnosis- or treatment-specific evidence and provider reasoning.");
    expect(prompt).toContain("Plan owns the actions, exact medication details, orders, monitoring, and follow-up.");
    expect(prompt).toContain("Care Plan owns patient execution/next-step instructions and safety information");
    expect(prompt).toContain("Repeat action details required for safe execution");
    expect(prompt).toContain("Do not duplicate narrative merely to satisfy a coverage rule.");
  });

  test("limits Care Plan to patient execution and next steps", () => {
    expect(prompt).toContain("Care Plan is a patient execution/next-steps list, not an abbreviated Assessment & Plan.");
    expect(prompt).toContain("relevant clinic/provider actions that affect the patient's next steps");
    expect(prompt).toContain("Do not repeat clinical rationale, diagnostic interpretation, Future Considerations merely because they were discussed, or extensive counseling.");
    expect(prompt).toContain("Do not list unchanged medications unless they create a patient-facing action.");
    expect(prompt).toContain("Closely related actions may be combined when doing so preserves clinically meaningful and safety-critical information.");
    expect(prompt).toContain("Keep declined, deferred, and pending decisions in the HPI, Assessment/Plan, or Future Considerations");
    expect(pipelineSource).toContain("An unchanged medication with no patient-facing action may remain in Current Medications");
    expect(pipelineSource).toContain("Starts, stops, changes, essential administration instructions, testing, follow-up, relevant clinic/provider actions, and safety-critical precautions remain required in the Care Plan");
  });

  test("does not turn unspoken prescription fields into artificial uncertainty", () => {
    expect(prompt).toContain("PRESCRIPTION DETAIL COMPLETENESS IS NOT DECISION UNCERTAINTY:");
    expect(prompt).toContain("Missing detail alone does not create a provider review flag.");
    expect(prompt).toContain('write "Initiate testosterone IM twice weekly."');
    expect(prompt).toContain("Do not append a dose-verification warning.");
    expect(prompt).toContain('Do not add "dose requires confirmation," "exact concentration not captured," "verify before initiation,"');
    expect(prompt).toContain("This rule does not suppress safeguards for conflicting doses or routes, clinically consequential unclear identity, unclear start-versus-discussion state");
    expect(pipelineSource).toContain("If a prescription-level field was simply not spoken, document only the known details and do not flag or narrate the field's absence.");
    expect(pipelineSource).toContain('Missing prescription detail alone is not a provider review flag and must not be rewritten as "requires confirmation."');
  });

  test("documents clear category-level treatment without turning identity gaps into patient tasks", () => {
    expect(prompt).toContain("IDENTITY COMPLETENESS IS NOT PATIENT VERIFICATION:");
    expect(prompt).toContain("When the treatment category and action are clear but the exact product or prescription details are not recoverable");
    expect(prompt).toContain('write "Initiate low-dose antihypertensive therapy"');
    expect(prompt).toContain("Internal extraction uncertainty about the exact product must never create a patient-facing instruction");
    expect(prompt).toContain("Absence of sufficient transcript detail is not itself a patient-facing action");
    expect(prompt).toContain("omit that specific intervention from the active Plan and Care Plan rather than manufacturing a verification task");
    expect(pipelineSource).toContain("\"requires_confirmation\" is an internal extraction-confidence state, not a patient-facing instruction");
  });

  test("omits an incompletely identified second nasal spray from active treatment", () => {
    expect(prompt).toContain("if a second nasal spray is mentioned but its product identity and active-treatment decision are not established");
    expect(prompt).toContain("omit that specific spray from the active Plan and Care Plan");
    expect(prompt).toContain("do not create a patient task to verify it");
  });

  test("keeps true identity conflicts as provider-review safeguards", () => {
    expect(prompt).toContain("an unclear medication identity that would require choosing among materially different treatments");
    expect(prompt).toContain("Preserve genuine provider-review safeguards when identifiable medications, doses, routes, or treatment decisions conflict in a way that could materially affect care");
    expect(pipelineSource).toContain("clinically consequential unclear identity/route");
    expect(prompt).toContain("Do not invent a product, dose, concentration, quantity, or directions");
    expect(pipelineSource).toContain("PRESERVE the patient's stated name");
  });

  test("preserves spoken medication details and true ambiguity safeguards", () => {
    expect(pipelineSource).toContain("MISSING ROUTE / DOSE / FREQUENCY WHEN TRANSCRIPT PROVIDES THEM");
    expect(pipelineSource).toContain("verify the note includes the route, dose, and frequency when the transcript stated them.");
    expect(pipelineSource).toContain("If the transcript provides conflicting values or another genuine clinically consequential ambiguity");
    expect(pipelineSource).toContain("conflicting identifiable details, clinically consequential unclear identity/route, unclear start-versus-discussion status");
    expect(prompt).toContain("Every medication START in the A/P must appear as a Care Plan bullet");
    expect(prompt).toContain("Every STOP or HOLD in the A/P must appear in the Care Plan");
    expect(prompt).toContain("Every lab order, referral, and follow-up from the A/P must appear in the Care Plan");
    expect(prompt).toContain("Every safety-critical precaution, essential administration instruction, or relevant clinic/provider action affecting the patient's next steps must appear in the Care Plan");
  });

  test("uses section-specific routing for clinical abstraction, counseling, and treatment reasoning", () => {
    expect(prompt).toContain("HPI-D9. CLINICAL ABSTRACTION:");
    expect(prompt).toContain("Do not replace a clear functional description with a more abstract or medicalized equivalent.");
    expect(prompt).toContain("Do not restate the full HPI or reproduce the complete counseling narrative.");
    expect(prompt).toContain("Overall Clinical Impression — 3–5 sentence paragraph providing a focused synthesis");
    expect(pipelineSource).toContain("PATIENT PERSPECTIVE STATEMENTS (use to preserve the patient's meaning in the HPI");
    expect(pipelineSource).toContain("EDUCATION PROVIDED (document the substantive education in the HPI as part of the encounter story");
    expect(pipelineSource).toContain("PATIENT DECISIONS (document the decision context in the HPI and the resulting action or deferral");
    expect(pipelineSource).toContain("Supplement decisions (document the clinical context in HPI");
  });

  test("makes QA verify coverage by section function without changing QA check 40", () => {
    expect(pipelineSource).toContain("7. EDUCATION OMISSIONS: Was patient education provided but not represented according to section function");
    expect(pipelineSource).toContain("15. COUNSELING AND SDM INTEGRATION: When the transcript contains specific counseling content");
    expect(pipelineSource).toContain("16. SHARED DECISION-MAKING VISIBILITY: When the transcript shows the patient and provider weighed options");
    expect(pipelineSource).toContain("18. TREATMENT RATIONALE COMPLETENESS: For each new medication initiated or dose changed");
    expect(pipelineSource).toContain("27. CLINICAL REASONING PRESERVATION: For each new medication initiated");
    expect(pipelineSource).toContain("30. STATE B COVERAGE — DISCUSSED-BUT-DEFERRED ITEMS MUST HAVE A/P ENTRIES WITH FUTURE CONSIDERATIONS");
    expect(pipelineSource).toContain("40. SILENTLY RESOLVED AMBIGUITY — CLINICALLY CONSEQUENTIAL DECISION-STATE ONLY:");
  });

  test("limits ambiguity QA to clinically consequential decision states", () => {
    expect(pipelineSource).toContain("40. SILENTLY RESOLVED AMBIGUITY — CLINICALLY CONSEQUENTIAL DECISION-STATE ONLY:");
    expect(pipelineSource).toContain("a treatment, medication, procedure, diagnostic test, referral, follow-up decision, or other clinically consequential plan item");
    expect(pipelineSource).toContain("This check governs clinical decision-state ambiguity only.");
    expect(pipelineSource).toContain("It does NOT apply to patient-reported symptoms, conversational references, or incidental transcript statements");
    expect(pipelineSource).toContain("Uncertainty that does not affect a clinical decision must not be narrated in the note body.");
    expect(pipelineSource).not.toContain("40. SILENTLY RESOLVED AMBIGUITY: Identify decisions where the transcript is genuinely ambiguous or contradictory");
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