import OpenAI from "openai";

async function retryOnRateLimit<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(err?.headers?.get?.("retry-after-ms") || err?.headers?.["retry-after-ms"] || "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter + 1000 : (attempt + 1) * 15000;
        console.warn(`[SOAP Pipeline] Rate limited (429). Waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted retries");
}

interface PipelineInput {
  transcriptText: string;
  diarized: any[];
  extraction: any;
  labContext: string;
  patternContext: string;
  medicationContext: string;
  encounter: any;
  openai: OpenAI;
}

interface PipelineOutput {
  fullNote: string;
  uncertain_items: string[];
  needs_clinician_review: string[];
}

interface NormalizedExtraction {
  medications_normalized: Array<{
    name: string;
    dose?: string;
    route?: string;
    frequency?: string;
    status: "current" | "new" | "discontinued" | "adjusted" | "discussed";
    confidence: "explicit" | "strongly_implied" | "requires_confirmation";
    indication?: string;
  }>;
  conditions_inferred: Array<{
    condition: string;
    basis: string;
    confidence: "explicit" | "strongly_implied" | "requires_confirmation";
  }>;
  preventative_signals: Array<{
    signal: string;
    clinical_relevance: string;
    supporting_evidence: string[];
  }>;
  symptom_timeline: Array<{
    symptom: string;
    onset?: string;
    duration?: string;
    trajectory: "improving" | "stable" | "worsening" | "new" | "resolved" | "unknown";
    context?: string;
  }>;
  explicitly_decided_plan_items: string[];
  discussed_but_not_decided: string[];
  clinically_relevant_followup: string[];
  enhanced_extraction: any;
}

async function medicalNormalizationAndInference(
  openai: OpenAI,
  extraction: any,
  transcriptText: string,
  diarized: any[]
): Promise<NormalizedExtraction> {
  const diarizedInput = diarized.length > 0
    ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
    : transcriptText;

  const systemPrompt = `You are a clinical intelligence engine specializing in medical normalization, context inference, and plan-decision classification.

You receive:
1. Structured clinical extraction (JSON) from a prior pipeline stage
2. The original diarized transcript

Your job has FOUR parts:

═══════════════════════════════════════
PART 1 — MEDICATION NORMALIZATION
═══════════════════════════════════════
For every medication mentioned in the extraction or transcript:
- Normalize brand names to generic + brand: "Lexapro" → "escitalopram (Lexapro)"
- Normalize common misspellings/STT errors: "tire zap a tide" → "tirzepatide"
- Preserve dose, route, frequency if stated
- Classify status: current (patient is on it), new (starting today), discontinued, adjusted, discussed (mentioned but not started)
- Classify confidence: explicit (directly stated), strongly_implied (clear from context), requires_confirmation (uncertain)
- Identify the likely indication when inferable from context

═══════════════════════════════════════
PART 2 — CONDITION INFERENCE
═══════════════════════════════════════
Identify conditions that are:
- Explicitly stated as diagnoses
- Strongly implied by medication use (e.g., Lexapro → anxiety/depression; levothyroxine → hypothyroidism; metformin → insulin resistance/T2DM)
- Strongly implied by symptom clusters
- Requires confirmation (possible but not certain)

For each condition, note the basis (which meds/symptoms/context support it) and confidence level.

CRITICAL: Do NOT hallucinate diagnoses. Every inference must be traceable to specific transcript evidence.

═══════════════════════════════════════
PART 3 — PREVENTATIVE MEDICINE SIGNALS
═══════════════════════════════════════
Identify "between the lines" clinical clues that a thoughtful clinician would notice:
- fatigue + heavy menses + hair shedding → possible iron deficiency
- constipation + fatigue + weight change + thyroid treatment → thyroid optimization question
- perimenopause + ApoB/Lp(a)/family history → cardiometabolic prevention opportunity
- GLP-1 use + constipation/nausea/poor intake → treatment-management issue
- SSRI + sexual side effects/weight change → medication counseling opportunity
- Statin discussion + liver function → monitoring consideration

Only include signals grounded in the transcript. Do not fabricate.

═══════════════════════════════════════
PART 4 — PLAN DECISION CLASSIFICATION
═══════════════════════════════════════
This is CRITICAL for recommendation quality. Classify every discussed action item into exactly one of:

A. "explicitly_decided_plan_items" — The provider clearly and definitively committed to this action during the visit. The patient agreed or the provider stated it as a decision.
   Trigger phrases: "I'm going to start you on", "let's do", "we'll begin", "I'll order", "I'm prescribing", "continue current dose", "we decided to"
   
B. "discussed_but_not_decided" — The topic was discussed but no definitive commitment was made. The patient needs to think about it, or it's a future consideration.
   Trigger phrases: "we could consider", "you might want to think about", "if you're interested", "we can discuss next time", "I'd like you to consider", "once you're ready"
   
C. "clinically_relevant_followup" — Items that were NOT discussed but are clinically relevant given the visit context. These are intelligent clinical additions a thoughtful provider might consider.
   Examples: Preventative screenings suggested by age/risk, monitoring implied by medication class, follow-up labs implied by treatment changes

Return this exact JSON structure:
{
  "medications_normalized": [...],
  "conditions_inferred": [...],
  "preventative_signals": [...],
  "symptom_timeline": [
    {
      "symptom": "string",
      "onset": "string or null",
      "duration": "string or null", 
      "trajectory": "improving|stable|worsening|new|resolved|unknown",
      "context": "relevant context"
    }
  ],
  "explicitly_decided_plan_items": ["list of plan items the provider definitively committed to"],
  "discussed_but_not_decided": ["list of items discussed but not finalized"],
  "clinically_relevant_followup": ["list of clinically relevant considerations not explicitly discussed"],
  "enhanced_extraction": {
    "hpi_chronological_elements": ["ordered list of clinically relevant events/discussions as they occurred in the visit, for HPI reconstruction"],
    "patient_perspective_statements": ["direct or paraphrased patient statements that are medically relevant"],
    "provider_reasoning_statements": ["provider explanations, interpretations, or clinical reasoning shared with patient"],
    "education_provided": ["specific clinical education topics discussed with depth of what was explained"],
    "patient_decisions": ["patient-stated decisions, preferences, or deferred choices"]
  }
}`;

  const userPrompt = `STRUCTURED EXTRACTION (from prior pipeline stage):
${JSON.stringify(extraction, null, 2)}

TRANSCRIPT:
${diarizedInput}`;

  const completion = await retryOnRateLimit(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  }));

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return {
    medications_normalized: result.medications_normalized ?? [],
    conditions_inferred: result.conditions_inferred ?? [],
    preventative_signals: (result.preventative_signals ?? []).map((s: any) => ({
      signal: s.signal ?? "",
      clinical_relevance: s.clinical_relevance ?? "",
      supporting_evidence: Array.isArray(s.supporting_evidence) ? s.supporting_evidence : [],
    })),
    symptom_timeline: result.symptom_timeline ?? [],
    explicitly_decided_plan_items: result.explicitly_decided_plan_items ?? [],
    discussed_but_not_decided: result.discussed_but_not_decided ?? [],
    clinically_relevant_followup: result.clinically_relevant_followup ?? [],
    enhanced_extraction: result.enhanced_extraction ?? {},
  };
}

async function generateSoapSections(
  openai: OpenAI,
  extraction: any,
  normalized: NormalizedExtraction,
  transcriptText: string,
  diarized: any[],
  labContext: string,
  patternContext: string,
  medicationContext: string,
  encounter: any
): Promise<PipelineOutput> {
  const diarizedInput = diarized.length > 0
    ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
    : transcriptText;

  const normalizedMedsContext = normalized.medications_normalized.length
    ? `\nNORMALIZED MEDICATIONS:\n${normalized.medications_normalized.map(m =>
        `- ${m.name}${m.dose ? ` ${m.dose}` : ""}${m.route ? ` ${m.route}` : ""}${m.frequency ? ` ${m.frequency}` : ""} [${m.status}] (${m.confidence})${m.indication ? ` — for: ${m.indication}` : ""}`
      ).join('\n')}`
    : "";

  const conditionsContext = normalized.conditions_inferred.length
    ? `\nINFERRED CONDITIONS:\n${normalized.conditions_inferred.map(c =>
        `- ${c.condition} [${c.confidence}]: ${c.basis}`
      ).join('\n')}`
    : "";

  const preventativeContext = normalized.preventative_signals.length
    ? `\nPREVENTATIVE MEDICINE SIGNALS:\n${normalized.preventative_signals.map(s =>
        `- ${s.signal}: ${s.clinical_relevance}${Array.isArray(s.supporting_evidence) && s.supporting_evidence.length ? ` (evidence: ${s.supporting_evidence.join("; ")})` : ""}`
      ).join('\n')}`
    : "";

  const symptomTimelineContext = normalized.symptom_timeline.length
    ? `\nSYMPTOM TIMELINE:\n${normalized.symptom_timeline.map(s =>
        `- ${s.symptom} [${s.trajectory}]${s.onset ? ` onset: ${s.onset}` : ""}${s.duration ? ` duration: ${s.duration}` : ""}${s.context ? ` — ${s.context}` : ""}`
      ).join('\n')}`
    : "";

  const planClassification = `
PLAN DECISION CLASSIFICATION:
Explicitly decided (DO include in Plan): ${normalized.explicitly_decided_plan_items?.length ? normalized.explicitly_decided_plan_items.join("; ") : "none identified"}
Discussed but not decided (mention in HPI/Assessment, do NOT put in Plan as decided): ${normalized.discussed_but_not_decided?.length ? normalized.discussed_but_not_decided.join("; ") : "none"}
Clinically relevant follow-up considerations (for needs_clinician_review only): ${normalized.clinically_relevant_followup?.length ? normalized.clinically_relevant_followup.join("; ") : "none"}`;

  const hpiElements = normalized.enhanced_extraction?.hpi_chronological_elements?.length
    ? `\nHPI CHRONOLOGICAL ELEMENTS (use these to reconstruct the clinical story in order):\n${normalized.enhanced_extraction.hpi_chronological_elements.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}`
    : "";

  const patientPerspective = normalized.enhanced_extraction?.patient_perspective_statements?.length
    ? `\nPATIENT PERSPECTIVE STATEMENTS (integrate into HPI as clinical paraphrases):\n${normalized.enhanced_extraction.patient_perspective_statements.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const providerReasoning = normalized.enhanced_extraction?.provider_reasoning_statements?.length
    ? `\nPROVIDER REASONING (integrate into Assessment where relevant):\n${normalized.enhanced_extraction.provider_reasoning_statements.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const educationProvided = normalized.enhanced_extraction?.education_provided?.length
    ? `\nEDUCATION PROVIDED (document fully in HPI + Assessment + Plan):\n${normalized.enhanced_extraction.education_provided.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const patientDecisions = normalized.enhanced_extraction?.patient_decisions?.length
    ? `\nPATIENT DECISIONS (document in HPI + Plan):\n${normalized.enhanced_extraction.patient_decisions.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const extractionSummary = buildExtractionSummary(extraction);

  const systemPrompt = `You are an expert clinical documentation specialist functioning as a high-end clinical intelligence system for a hormone and primary care clinic. You generate chart-ready, medically complete SOAP notes.

CRITICAL DISTINCTION — This is NOT a transcript summary. You are RECONSTRUCTING the clinical encounter as a complete medical document.

═══════════════════════════════════════
SECTION 1 — HPI RECONSTRUCTION (NOT SUMMARY)
═══════════════════════════════════════
The HPI is a CLINICAL STORY RECONSTRUCTION — a detailed, chronological narrative that rebuilds the encounter as a complete medical document. It must read as if a skilled clinician observed the entire visit and wrote a thorough chart entry.

HPI RECONSTRUCTION RULES:
1. CHRONOLOGICAL FLOW: Reconstruct events in the order they occurred during the visit. Start with why the patient came in, move through each topic discussed, and end with decisions/next steps.
2. COMPLETENESS OVER COMPRESSION: Include EVERY medically relevant topic discussed. If the provider and patient spent time discussing a topic, it belongs in the HPI. A 20-minute visit should produce a multi-paragraph HPI, not 4 sentences.
3. PATIENT VOICE: Include the patient's perspective using clinical paraphrase: "She reports that...", "Patient states...", "She expresses concern about...". The patient's story matters.
4. PROVIDER CONTEXT: When the provider explains reasoning, counsels, or interprets data — capture that: "Provider reviewed labs and noted...", "Clinician discussed treatment options including..."
5. MEDICATION STORY: Don't just list medications. Tell the story: "She has been on tirzepatide 15mg weekly for approximately 3 months, initiated for weight management. She reports good tolerability with mild initial nausea that has since resolved. Weight loss trajectory has been [described]."
6. SECONDARY CONCERNS: Every secondary topic discussed gets its own paragraph or substantial mention. Do NOT flatten a multi-topic visit into a single-complaint note.
7. PRIOR TREATMENT HISTORY: If prior medication trials, failed treatments, or side effect history was discussed, reconstruct that history: "She previously tried metformin but discontinued due to GI intolerance. She was briefly on a different SSRI approximately 2 years ago..."
8. DENIED SYMPTOMS: Weave naturally: "She denies nausea, vomiting, or injection site reactions."
9. EDUCATION & DECISIONS: Document what was explained and what the patient decided: "Clinician discussed the mechanism of GLP-1 therapy including appetite regulation and metabolic effects. Patient verbalized understanding and elected to continue current regimen."
10. DO NOT COMPRESS: If the transcript contains 30 minutes of clinical conversation covering 5+ topics, the HPI should be 3-5 substantial paragraphs. A 2-sentence HPI for a rich encounter is WRONG.

HPI LENGTH GUIDANCE:
- Brief focused visit (5 min, single topic): 1-2 paragraphs
- Standard follow-up (15 min, 2-3 topics): 2-3 paragraphs
- Comprehensive wellness visit (20-30+ min, multiple topics): 3-5+ paragraphs
- The HPI should be proportional to the depth and breadth of the actual conversation

MEDICATION TENSE — CRITICAL:
- medications_current (patient is already on it) → HPI as ongoing: "Patient has been on..."
- medication_changes_discussed (recommended/started at this visit) → HPI as discussed: "Clinician recommended initiation of...", "Provider discussed starting..."
- NEVER write a recommended medication as if the patient is currently taking it

═══════════════════════════════════════
SECTION 2 — ASSESSMENT WITH CLINICAL REASONING
═══════════════════════════════════════
The Assessment must demonstrate clinical thinking, not transcript restating.

Assessment Summary paragraph (REQUIRED, before numbered items):
- Synthesize the clinical picture: why the patient is here, what the key findings are, what the clinical trajectory looks like
- Reference lab findings, symptom patterns, treatment response, and risk factors
- This should read as a clinician's opening synthesis

Each numbered item:
- Diagnosis Name (ICD-10 code) on its own line
- Supporting clinical reasoning as a separate paragraph below (2-3 sentences minimum)
- Explain WHY this diagnosis applies, its current status, relevant evidence
- Include preventative medicine signals where supported
- "Plan:" on its own line with specific actions

ASSESSMENT RULES:
- Use ICD-10 codes for all diagnoses
- Infer clinically appropriate diagnoses from context (medications, symptoms, lab patterns) — do not require the clinician to have verbally stated the diagnosis
- Inferred conditions with "requires_confirmation" confidence should use hedging language: "consistent with", "suggestive of"
- Inferred conditions with "strongly_implied" confidence can be stated more directly but note the basis
- Preventative medicine signals should be woven into relevant assessment items as clinical context, not presented as confirmed diagnoses

═══════════════════════════════════════
SECTION 3 — PLAN REFLECTING ACTUAL DECISIONS
═══════════════════════════════════════
The Plan must ONLY reflect what was actually decided during the visit.

CRITICAL PLAN RULE — DECISION CLASSIFICATION:
- Items in "explicitly_decided_plan_items" → include in the Plan as definitive orders/decisions
- Items in "discussed_but_not_decided" → mention in the Assessment reasoning or HPI, but do NOT include as a decided plan action. Instead: "Patient to consider [X] and follow up when ready"
- Items in "clinically_relevant_followup" → put in needs_clinician_review ONLY, never in the Plan

Plan specifics:
- Include drug name, dose, route, frequency for every medication
- Include monitoring parameters appropriate to medication class
- Include specific follow-up interval with clinical rationale
- Include labs ordered
- Include patient education documented
- "Continue treatment" is never acceptable — always specify which treatment

═══════════════════════════════════════
SECTION 4 — RECOMMENDATION DUPLICATE SUPPRESSION
═══════════════════════════════════════
The "needs_clinician_review" array must NEVER include items that duplicate the explicit plan.

Rules:
- If an action was explicitly decided and is in the Plan → SUPPRESS from needs_clinician_review
- needs_clinician_review should contain ONLY:
  a) Items from "discussed_but_not_decided" — unresolved considerations
  b) Items from "clinically_relevant_followup" — intelligent clinical additions not discussed
  c) Items flagged as uncertain requiring clinician verification
  d) Preventative medicine opportunities grounded in the visit context
- NEVER recommend an action the provider already decided to take
- Example: If provider explicitly decided "start testosterone" → do NOT put "Consider initiating testosterone" in needs_clinician_review

═══════════════════════════════════════
SECTION 5 — FABRICATION GUARDRAILS
═══════════════════════════════════════
- Do NOT invent BMI, weight, blood pressure, or lab values not provided
- Do NOT invent physical exam findings not documented
- Do NOT add medications not mentioned in the transcript
- Preserve all documented negatives
- If uncertain, flag in needs_clinician_review
- Physical Exam not performed → "Physical examination not performed at this encounter."

CRITICAL — HANDLING [SUGGESTED] ITEMS FROM CLINICAL INTERPRETATION:
Items labeled [SUGGESTED — clinician must approve before charting] must NOT be written as plan items. Copy them to needs_clinician_review with prefix "SUGGESTED (awaiting clinician approval): ..."

BMI VALUE MENTIONED — MANDATORY WEIGHT DIAGNOSIS RULE:
If ANY BMI value is explicitly mentioned, generate the appropriate weight classification as a numbered assessment item:
- BMI 25.0–29.9: "Overweight (E66.3)"
- BMI 30.0–34.9: "Obesity, Class I (E66.01)"
- BMI 35.0–39.9: "Obesity, Class II (E66.01)"
- BMI ≥40.0: "Obesity, Class III — Morbid Obesity (E66.01)"

PATIENT EDUCATION — MANDATORY DOCUMENTATION:
Document in THREE places: HPI narrative, Assessment item reasoning, Plan for that item.

MEDICATION-IMPLIED PMH — MANDATORY:
Psychiatric/sleep medications → corresponding conditions in PMH and Assessment. See medication list for specific mappings.

MEDICATION NAMES:
Use normalized medication list provided. Do NOT phonetically guess drug names.
LAB LEVEL TARGETS: "increase vitamin D to 60-80" = lab level target (ng/mL), NOT a dose.

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════
Return JSON with exactly these keys:
{
  "fullNote": "<complete formatted SOAP note as plain text>",
  "uncertain_items": ["<items needing clinician clarification>"],
  "needs_clinician_review": ["<specific flags — NO duplicates of explicit plan items>"]
}

Use this EXACT format for fullNote:

CC/Reason: [chief complaint or visit reason]

SUBJECTIVE

HPI: [DETAILED CLINICAL STORY RECONSTRUCTION — multiple paragraphs. See Section 1 rules above. This is the most important section — do not compress.]

Medical History:
- Allergies: [if mentioned, else "Not reported at this visit"]
- Past Medical Hx: [all mentioned + medication-implied conditions]
- Past Surgical Hx: [if mentioned]
- Social Hx: [if mentioned]
- Family Hx: [if mentioned]

ROS: [standard clinical system format]

OBJECTIVE

Vitals: [if provided; if not: "Not obtained at this encounter"]
Physical Exam: [if performed; if not: "Physical examination not performed at this encounter."]
[Include objective data from linked lab results if provided]

ASSESSMENT/PLAN

[Assessment Summary paragraph — 2-4 sentences synthesizing the clinical picture BEFORE the numbered list]

1. Diagnosis Name (ICD-10 code)
[Supporting evidence and clinical reasoning — 2-3 sentences on their own lines]
Plan: [specific medications, monitoring, referrals, education]

2. Diagnosis Name (ICD-10 code)
[Supporting evidence and clinical reasoning]
Plan: [...]

[Continue for each diagnosis]

CARE PLAN
[Patient-readable action list — specific, named, complete]

FOLLOW-UP
[Specific interval with clinical rationale]

PROSE STANDARDS:
- Third person, past tense for Subjective, present for Assessment/Plan
- Standard medical abbreviations
- No redundancy
- Numerals for doses/measurements
- Integrate lab values naturally into narrative`;

  const userPrompt = `Visit Type: ${encounter.visitType}
Chief Complaint: ${encounter.chiefComplaint || "Not specified"}
Visit Date: ${new Date(encounter.visitDate).toLocaleDateString()}${labContext}${extractionSummary}${patternContext}${medicationContext}${normalizedMedsContext}${conditionsContext}${preventativeContext}${symptomTimelineContext}${planClassification}${hpiElements}${patientPerspective}${providerReasoning}${educationProvided}${patientDecisions}

TRANSCRIPT:
${diarizedInput}

Generate the SOAP note following all rules above. The HPI must be a DETAILED RECONSTRUCTION of the clinical encounter, not a compressed summary. Flag uncertain items and non-duplicate recommendations in needs_clinician_review.`;

  const completion = await retryOnRateLimit(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  }));

  const soapResult = JSON.parse(completion.choices[0].message.content || "{}");
  return {
    fullNote: soapResult.fullNote ?? "",
    uncertain_items: soapResult.uncertain_items ?? [],
    needs_clinician_review: soapResult.needs_clinician_review ?? [],
  };
}

async function qaCheck(
  openai: OpenAI,
  extraction: any,
  normalized: NormalizedExtraction,
  soapOutput: PipelineOutput,
  transcriptText: string
): Promise<PipelineOutput> {
  const systemPrompt = `You are a clinical documentation quality assurance specialist. Your job is to compare the SOAP note against the source extraction data and transcript to catch omissions, contradictions, and over-compression.

CHECK FOR:
1. MEDICATION OMISSIONS: Are all medications from the extraction present in the SOAP note? Every medication in medications_current must appear somewhere (HPI or Care Plan).
2. SYMPTOM OMISSIONS: Are all reported symptoms captured in the HPI? Secondary concerns must not be lost.
3. SIDE EFFECT OMISSIONS: Were side effects or tolerability issues discussed but not documented?
4. PRIOR TREATMENT OMISSIONS: Were prior medication trials or failed treatments mentioned but not captured?
5. DIAGNOSIS OMISSIONS: Are medication-implied conditions documented in PMH and Assessment?
6. EDUCATION OMISSIONS: Was patient education provided but not documented in all three required places?
7. PATIENT DECISION OMISSIONS: Did the patient state decisions/preferences that were not documented?
8. CONTRADICTIONS: Does the note contradict any transcript facts? (e.g., "denies nausea" when patient reported nausea)
9. TENSE ERRORS: Are recommended medications incorrectly presented as current medications?
10. OVER-COMPRESSION: Does the HPI reduce a rich, multi-topic encounter to a brief summary? Is the HPI proportional to the visit depth?
11. PREVENTATIVE SIGNALS LOST: Were clinically relevant "between the lines" clues identified in normalization but not reflected in the Assessment?
12. RECOMMENDATION DUPLICATES: Does needs_clinician_review contain items that duplicate the explicit Plan?

RESPONSE FORMAT:
{
  "issues_found": [
    {
      "type": "omission|contradiction|over_compression|tense_error|recommendation_duplicate",
      "severity": "critical|important|minor",
      "description": "what was missed or wrong",
      "fix_instruction": "specific instruction for how to fix this in the note"
    }
  ],
  "requires_revision": true/false,
  "revised_fullNote": "<if requires_revision is true, provide the corrected fullNote with all issues fixed; if false, omit this field>",
  "revised_uncertain_items": ["<if revised, updated uncertain_items>"],
  "revised_needs_clinician_review": ["<if revised, updated needs_clinician_review with duplicates removed>"]
}

CRITICAL: Only flag requires_revision for critical or important issues. Minor issues can be noted but do not require revision.
If requires_revision is true, you MUST provide the complete revised_fullNote — do not provide partial patches.`;

  const userPrompt = `STRUCTURED EXTRACTION (source of truth for what was discussed):
${JSON.stringify(extraction, null, 2)}

NORMALIZED INTELLIGENCE:
- Medications: ${JSON.stringify(normalized.medications_normalized)}
- Conditions inferred: ${JSON.stringify(normalized.conditions_inferred)}
- Preventative signals: ${JSON.stringify(normalized.preventative_signals)}
- Explicitly decided plan items: ${JSON.stringify(normalized.explicitly_decided_plan_items)}
- Discussed but not decided: ${JSON.stringify(normalized.discussed_but_not_decided)}

GENERATED SOAP NOTE:
${soapOutput.fullNote}

NEEDS_CLINICIAN_REVIEW (check for duplicates of plan):
${JSON.stringify(soapOutput.needs_clinician_review)}

TRANSCRIPT (for contradiction checking):
${transcriptText.substring(0, 8000)}

Review the note for quality issues. If critical/important issues are found, provide a corrected version.`;

  const completion = await retryOnRateLimit(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  }));

  const qaResult = JSON.parse(completion.choices[0].message.content || "{}");

  if (qaResult.requires_revision && qaResult.revised_fullNote) {
    console.log(`[SOAP Pipeline QA] Revision applied. Issues found: ${qaResult.issues_found?.length ?? 0}`);
    return {
      fullNote: qaResult.revised_fullNote,
      uncertain_items: qaResult.revised_uncertain_items ?? soapOutput.uncertain_items,
      needs_clinician_review: qaResult.revised_needs_clinician_review ?? soapOutput.needs_clinician_review,
    };
  }

  if (qaResult.issues_found?.length) {
    console.log(`[SOAP Pipeline QA] ${qaResult.issues_found.length} minor issues noted, no revision needed.`);
  }

  return soapOutput;
}

function buildExtractionSummary(extraction: any): string {
  if (!extraction) return "";
  const lines: string[] = [];
  if (extraction.chief_concerns?.length)             lines.push(`Chief concerns: ${extraction.chief_concerns.join("; ")}`);
  if (extraction.secondary_concerns?.length)         lines.push(`Secondary concerns: ${extraction.secondary_concerns.join("; ")}`);
  if (extraction.symptoms_reported?.length)           lines.push(`Symptoms reported: ${extraction.symptoms_reported.join("; ")}`);
  if (extraction.symptoms_denied?.length)             lines.push(`Symptoms denied: ${extraction.symptoms_denied.join("; ")}`);
  if (extraction.medications_current?.length)         lines.push(`Current medications: ${extraction.medications_current.join("; ")}`);
  if (extraction.supplements_current?.length)         lines.push(`Current supplements: ${extraction.supplements_current.join("; ")}`);
  if (extraction.medication_changes_discussed?.length) lines.push(`Medication changes discussed: ${extraction.medication_changes_discussed.join("; ")}`);
  if (extraction.labs_reviewed?.length)               lines.push(`Labs reviewed: ${extraction.labs_reviewed.join("; ")}`);
  if (extraction.allergies?.length)                   lines.push(`Allergies: ${extraction.allergies.join("; ")}`);
  if (extraction.past_medical_history?.length)        lines.push(`Past medical history: ${extraction.past_medical_history.join("; ")}`);
  if (extraction.surgical_history?.length)            lines.push(`Surgical history: ${extraction.surgical_history.join("; ")}`);
  if (extraction.family_history?.length)              lines.push(`Family history: ${extraction.family_history.join("; ")}`);
  if (extraction.social_history?.length)              lines.push(`Social history: ${extraction.social_history.join("; ")}`);
  if (extraction.mental_health_context?.length)       lines.push(`Mental health context: ${extraction.mental_health_context.join("; ")}`);
  if (extraction.lifestyle_factors?.length)           lines.push(`Lifestyle factors: ${extraction.lifestyle_factors.join("; ")}`);
  if (extraction.prior_treatments_and_trials?.length) lines.push(`Prior treatments/trials: ${extraction.prior_treatments_and_trials.join("; ")}`);
  if (extraction.side_effects_reported?.length)       lines.push(`Side effects reported: ${extraction.side_effects_reported.join("; ")}`);
  if (extraction.diagnoses_discussed?.length)         lines.push(`Diagnoses discussed: ${extraction.diagnoses_discussed.join("; ")}`);
  if (extraction.assessment_candidates?.length)       lines.push(`Assessment candidates (uncertain): ${extraction.assessment_candidates.join("; ")}`);
  if (extraction.plan_candidates?.length)             lines.push(`Plan items discussed: ${extraction.plan_candidates.join("; ")}`);
  if (extraction.follow_up_items?.length)             lines.push(`Follow-up items: ${extraction.follow_up_items.join("; ")}`);
  if (extraction.red_flags?.length)                   lines.push(`Red flags noted: ${extraction.red_flags.join("; ")}`);
  if (extraction.uncertain_items?.length)             lines.push(`Uncertain/unresolved: ${extraction.uncertain_items.join("; ")}`);
  if (extraction.context_inferred_items?.length)      lines.push(`Context-inferred (confirm with patient): ${extraction.context_inferred_items.join("; ")}`);
  if (extraction.patient_questions?.length)           lines.push(`Patient questions: ${extraction.patient_questions.join("; ")}`);
  return lines.length ? `\n\nSTRUCTURED CLINICAL EXTRACTION (verified from transcript):\n${lines.join('\n')}` : "";
}

export async function runEnhancedSoapPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { openai, extraction, transcriptText, diarized, labContext, patternContext, medicationContext, encounter } = input;

  console.log("[SOAP Pipeline] Step 3c: Medical normalization + context inference...");
  let normalized: NormalizedExtraction;
  try {
    normalized = await medicalNormalizationAndInference(openai, extraction, transcriptText, diarized);
    console.log(`[SOAP Pipeline] Normalization complete: ${normalized.medications_normalized.length} meds, ${normalized.conditions_inferred.length} conditions, ${normalized.preventative_signals.length} preventative signals`);
    console.log(`[SOAP Pipeline] Plan classification: ${normalized.explicitly_decided_plan_items.length} decided, ${normalized.discussed_but_not_decided.length} discussed, ${normalized.clinically_relevant_followup.length} follow-up`);
  } catch (err) {
    console.warn("[SOAP Pipeline] Normalization/inference failed, proceeding with extraction only:", err);
    normalized = {
      medications_normalized: [],
      conditions_inferred: [],
      preventative_signals: [],
      symptom_timeline: [],
      explicitly_decided_plan_items: [],
      discussed_but_not_decided: [],
      clinically_relevant_followup: [],
      enhanced_extraction: {},
    };
  }

  console.log("[SOAP Pipeline] Step 4: Section-specific SOAP generation (HPI reconstruction)...");
  let soapOutput: PipelineOutput;
  try {
    soapOutput = await generateSoapSections(
      openai, extraction, normalized, transcriptText, diarized,
      labContext, patternContext, medicationContext, encounter
    );
  } catch (err) {
    console.error("[SOAP Pipeline] SOAP generation failed:", err);
    throw err;
  }

  console.log("[SOAP Pipeline] Step 5: Omission/contradiction QA check...");
  try {
    soapOutput = await qaCheck(openai, extraction, normalized, soapOutput, transcriptText);
  } catch (qaErr) {
    console.warn("[SOAP Pipeline] QA check failed, using unrevised SOAP:", qaErr);
  }

  console.log("[SOAP Pipeline] Pipeline complete.");
  return soapOutput;
}
