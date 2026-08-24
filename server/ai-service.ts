// AI Service for generating clinical recommendations using OpenAI
// Using Replit AI Integrations (blueprint:javascript_openai_ai_integrations)

import OpenAI from "openai";
import type { LabValues, FemaleLabValues, RedFlag, LabInterpretation, ASCVDRiskResult, PREVENTRiskResult, SupplementRecommendation, InsulinResistanceScreening } from "@shared/schema";
import {
  type TherapyContext,
  buildTherapyPromptBlock,
  annotateRecommendationMarkdown,
  annotatePatientSummary,
} from "./therapy-context";
import { buildPatientVisibleSupplementProtocolPromptBlock } from "./patient-communication-context";

// Using gpt-5-mini for faster responses - smaller model but still capable
// Production-safe: prefer OPENAI_API_KEY (GCP/direct); fall back to AI_INTEGRATIONS_* (Replit dev)
const _aiApiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const _aiBaseURL = process.env.OPENAI_API_KEY ? undefined : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  apiKey: _aiApiKey,
  ...(_aiBaseURL ? { baseURL: _aiBaseURL } : {}),
});

export class AIService {
  /**
   * Generate comprehensive AI-powered clinical recommendations
   */
  static async generateRecommendations(
    labs: LabValues | FemaleLabValues,
    redFlags: RedFlag[],
    interpretations: LabInterpretation[],
    gender: 'male' | 'female' = 'male',
    trendContext?: string,
    therapyContext?: TherapyContext | null,
  ): Promise<string> {
    let prompt = this.buildRecommendationPrompt(labs, redFlags, interpretations, gender);
    if (trendContext) {
      prompt += trendContext;
    }
    const therapyBlock = buildTherapyPromptBlock(therapyContext);
    if (therapyBlock) {
      prompt = `${therapyBlock}\n\n${prompt}`;
    }
    const clinicType = gender === 'female' ? "women's hormone and primary care clinic" : "men's hormone and primary care clinic";

    try {
      console.log('[AI Service] Generating AI recommendations with prompt length:', prompt.length);
      console.log('[AI Service] Red flags count:', redFlags.length);
      console.log('[AI Service] Interpretations count:', interpretations.length);
      console.log('[AI Service] Gender context:', gender);
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a clinical decision support assistant for a ${clinicType}. Your role is to synthesize lab findings and provide clear, actionable, STAFF-FACING recommendations based on established clinical protocols.

CRITICAL: These recommendations are FOR CLINIC STAFF ONLY - not for patients.

Guidelines:
- Be concise and clinically focused
- Use professional medical language appropriate for clinic staff
- Reference specific lab values and clinical protocols
- Organize by priority: CRITICAL → URGENT → ROUTINE
- Provide specific next steps for staff:
  * Dose adjustments (specific medications and doses)
  * Follow-up timing (when to recheck labs)
  * Physician notification requirements
  * Patient education points to cover
  * Lifestyle interventions to recommend
${gender === 'female' ? `- Consider menstrual cycle phase when interpreting hormone levels
- Address female-specific concerns: iron deficiency from menstruation, thyroid issues, fertility markers
- Note HRT or birth control interactions where relevant` : ''}
- Do not diagnose - provide clinical guidance for staff review
- NO EMOJIS - use professional medical terminology only
- Format as clear bullet points or numbered list
- MEDICATION NAMES: Only use real, established generic or brand names (e.g., semaglutide, tirzepatide, testosterone cypionate, metformin, anastrozole, levothyroxine, atorvastatin). If a specific drug is not confirmed in the patient's chart, refer to the drug class only (e.g., "GLP-1 receptor agonist," "statin therapy"). NEVER invent or approximate a medication name — doing so is a patient-safety error.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 4000,
      });

      const recommendations = response.choices[0]?.message?.content;
      console.log('[AI Service] AI recommendations generated, length:', recommendations?.length || 0);

      const annotated = annotateRecommendationMarkdown(
        recommendations || "Unable to generate recommendations. Please review lab findings manually.",
        therapyContext,
      );
      return annotated;
    } catch (error) {
      console.error("Error generating AI recommendations:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
      }
      return "AI recommendations temporarily unavailable. Please apply clinical protocols manually based on the lab interpretations provided.";
    }
  }

  /**
   * Generate patient-friendly summary for communication
   */
  static async generatePatientSummary(
    labs: LabValues | FemaleLabValues,
    interpretations: LabInterpretation[],
    hasRedFlags: boolean,
    riskResult?: ASCVDRiskResult | PREVENTRiskResult | null,
    gender: 'male' | 'female' = 'male',
    therapyContext?: TherapyContext | null,
    brainContext?: {
      redFlags?: RedFlag[];
      aiRecommendations?: string;
      recheckWindow?: string;
      supplements?: SupplementRecommendation[];
      insulinResistance?: InsulinResistanceScreening;
      clinicalPhenotypes?: Array<{ name?: string; description?: string; patientExplanation?: string }>;
      maleHormonePatterns?: Array<{ name?: string; patientExplanation?: string; description?: string }>;
      mitoScore?: { patientExplanation?: string; summary?: string; interpretation?: string };
      adjustedRisk?: { adjustedCategory?: string; riskCategory?: string; summary?: string };
      stopBangRisk?: { riskDescription?: string; recommendations?: string };
      trendContext?: string;
    },
  ): Promise<string> {
    // Categorize findings
    const abnormalFindings = interpretations.filter(i => i.status === 'abnormal' || i.status === 'critical');
    const borderlineFindings = interpretations.filter(i => i.status === 'borderline');
    const normalFindings = interpretations.filter(i => i.status === 'normal');

    // Build specific findings with values
    const buildFindingsList = (findings: LabInterpretation[]) => {
      return findings.map(f => `${f.category}: ${f.value} ${f.unit} (${f.interpretation})`).join('\n');
    };

    // Build cardiovascular risk section if available (supports both ASCVD and PREVENT)
    let cvRiskSection = '';
    if (riskResult) {
      if ('tenYearTotalCVD' in riskResult) {
        // PREVENT Risk Result (2023 equations)
        const preventRisk = riskResult as PREVENTRiskResult;
        cvRiskSection = `
CARDIOVASCULAR RISK ASSESSMENT (PREVENT 2023):
10-Year Total CVD Risk: ${preventRisk.tenYearCVDPercentage}
10-Year ASCVD Risk (Heart Attack/Stroke): ${preventRisk.tenYearASCVDPercentage}
10-Year Heart Failure Risk: ${preventRisk.tenYearHFPercentage}
Risk Category: ${preventRisk.riskCategory.toUpperCase()}
${preventRisk.thirtyYearCVDPercentage ? `30-Year CVD Risk: ${preventRisk.thirtyYearCVDPercentage}` : ''}
${preventRisk.ldlGoal ? `LDL Cholesterol Goal: ${preventRisk.ldlGoal}` : ''}
${preventRisk.statinRecommendation ? `Statin Recommendation: ${preventRisk.statinRecommendation}` : ''}
`;
      } else {
        // Legacy ASCVD Risk Result
        const ascvdRisk = riskResult as ASCVDRiskResult;
        cvRiskSection = `
CARDIOVASCULAR RISK ASSESSMENT:
10-Year Risk of Heart Attack/Stroke: ${ascvdRisk.riskPercentage}
Risk Category: ${ascvdRisk.riskCategory.toUpperCase()}
${ascvdRisk.ldlGoal ? `LDL Cholesterol Goal: ${ascvdRisk.ldlGoal}` : ''}
${ascvdRisk.statinRecommendation ? `Statin Recommendation: ${ascvdRisk.statinRecommendation}` : ''}
`;
      }
    }

    const prompt = `Write a direct, patient-friendly summary of these lab results. You are the provider — write TO your patient, FROM yourself. Use specific values and concrete next steps.

CRITICAL FINDINGS (abnormal or out of range):
${abnormalFindings.length > 0 ? buildFindingsList(abnormalFindings) : 'None'}

BORDERLINE FINDINGS (approaching out of range):
${borderlineFindings.length > 0 ? buildFindingsList(borderlineFindings) : 'None'}

NORMAL FINDINGS (within range):
${normalFindings.length > 0 ? buildFindingsList(normalFindings) : 'None'}
${cvRiskSection}

REQUIREMENTS:
1. Always use specific numeric values — say "Your LDL is 160 mg/dL" not "your cholesterol is elevated."
2. When two or more findings point in the same direction, group them as a pattern rather than listing each marker separately.
3. Give a focused set of concrete next steps tied directly to the findings above. Aim for 3–5 actions when that covers the major actionable clinical domains; include additional material only when needed to avoid dropping an important Brain-selected intervention or major treatment domain:
   - Cholesterol (elevated LDL, low HDL, or high triglycerides): fiber intake, omega-3 rich foods, reducing saturated fat, daily movement
   - Blood sugar (A1c or fasting glucose elevated): protein with each meal, reducing refined carbs, post-meal walks
   - Liver markers (elevated AST/ALT): limit alcohol, review medications/supplements, weight management
   - Testosterone (suboptimal): sleep quality, resistance training, stress management
   - Cardiovascular risk: tailor the intensity of lifestyle recommendations to the risk category and explain the percentage in plain terms
4. If all or most findings are normal, say so clearly and specifically — mention key values that look good and what that means for the patient.
5. Keep the communication focused and readable, typically 300–500 words. Do not reproduce the full evaluation or a supplement catalog, but use enough space to explain every major actionable clinical domain.
6. Do not close with a generic sign-off or "thank you for trusting us" — end on the next steps.

Write the summary now:`;

    const therapyBlock = buildTherapyPromptBlock(therapyContext);

    // If the patient is on HRT, prepend an explicit framing block so the AI
    // never describes estradiol/progesterone as endogenous production.
    const onHRTForSummary = gender === 'female' && (labs as any).onHRT === true;
    const hrtSummaryBlock = onHRTForSummary
      ? `PATIENT CONTEXT — ON HORMONE REPLACEMENT THERAPY (HRT):
This patient is actively on female Hormone Replacement Therapy. Apply these rules without exception:
- NEVER say "estrogen production," "your body is producing estrogen," or "estrogen levels are sufficient/adequate/normal." These values reflect response to prescribed therapy, not the patient's own output.
- Frame estradiol and progesterone as therapy response: "Your estrogen level on therapy is at goal," "Your estradiol is responding well to your HRT at X pg/mL," "Your progesterone is at the target range on therapy."
- If estradiol is 60–100 pg/mL: tell the patient her estrogen therapy is working well and is at the target level for bone protection and symptom relief.
- Testosterone values reflect therapy as well — frame any testosterone in range as the intended therapeutic response.\n\n`
      : '';

    const finalPrompt = [hrtSummaryBlock, therapyBlock, prompt].filter(Boolean).join('\n\n');
    const visibleSupplements = buildPatientVisibleSupplementProtocolPromptBlock(
      brainContext?.supplements,
    );
    const phenotypeDetails = [
      ...(brainContext?.clinicalPhenotypes ?? []).map(p => `${p.name || 'Pattern'}: ${p.patientExplanation || p.description || ''}`),
      ...(brainContext?.maleHormonePatterns ?? []).map(p => `${p.name || 'Hormone pattern'}: ${p.patientExplanation || p.description || ''}`),
    ].filter(Boolean).join('\n');
    const completedBrainBlock = [
      brainContext?.redFlags?.length ? `RED FLAGS:\n${brainContext.redFlags.map(f => `- ${f.category}: ${f.message}. Action: ${f.action}`).join('\n')}` : '',
      brainContext?.aiRecommendations ? `CLINIQ BRAIN MANAGEMENT RECOMMENDATIONS (authoritative where present):\n${brainContext.aiRecommendations}` : '',
      visibleSupplements ? `PATIENT-VISIBLE SUPPLEMENTS:\n${visibleSupplements}` : '',
      phenotypeDetails ? `PATIENT-VISIBLE PATTERNS:\n${phenotypeDetails}` : '',
      brainContext?.insulinResistance ? `INSULIN-RESISTANCE SCREENING:\n${brainContext.insulinResistance.patientExplanation || brainContext.insulinResistance.providerSummary || ''}\nMonitoring: ${brainContext.insulinResistance.monitoringPlan || ''}` : '',
      brainContext?.mitoScore ? `MITO FINDING:\n${brainContext.mitoScore.patientExplanation || brainContext.mitoScore.summary || brainContext.mitoScore.interpretation || ''}` : '',
      brainContext?.adjustedRisk ? `ADJUSTED CARDIOVASCULAR RISK:\n${brainContext.adjustedRisk.summary || brainContext.adjustedRisk.adjustedCategory || brainContext.adjustedRisk.riskCategory || ''}` : '',
      brainContext?.stopBangRisk ? `SLEEP-APNEA SCREENING:\n${brainContext.stopBangRisk.riskDescription || ''}\n${brainContext.stopBangRisk.recommendations || ''}` : '',
      brainContext?.trendContext ? `LAB TREND CONTEXT:\n${brainContext.trendContext}` : '',
      brainContext?.recheckWindow ? `RECHECK WINDOW: ${brainContext.recheckWindow}` : '',
    ].filter(Boolean).join('\n\n');
    const communicationPrompt = `${finalPrompt}${completedBrainBlock ? `\n\nCOMPLETED PATIENT-VISIBLE CLINIQ BRAIN CONTEXT:\n${completedBrainBlock}\n\nAUTHORITATIVE CONTEXT RULES:\n- When ClinIQ Brain has supplied an interpretation, management recommendation, dose, target, classification, or treatment, preserve it; do not substitute a conflicting conclusion.\n- You may explain clinically relevant findings not covered by Brain rules only when directly supported by the supplied data. Do not manufacture diagnoses, certainty, treatment decisions, or causal relationships.\n- Select what matters most. Do not mechanically narrate every marker or algorithm.\n- Do not include content that is not in this patient-visible context.` : ''}`;

    try {
      console.log('[AI Service] Generating patient summary with prompt length:', finalPrompt.length);
      console.log('[AI Service] Gender context:', gender);
      
      const clinicType = gender === 'female' ? "women's health clinic" : "men's health clinic";
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a clinician at a ${clinicType} writing a direct summary of lab results for your patient. This note goes straight to the patient — write as yourself, to them.

VOICE
- Direct, warm, human. First-person plural ("we reviewed," "we want to focus on") or second-person ("your results show").
- Never say "ask your provider," "your provider will," "your care team will," "consult a physician," or anything that sounds like you're a third party — you ARE their provider.
- No AI-bot language. No over-explanation. No filler phrases like "Great news!" or "Thank you for trusting us with your care."
- Sound like a clinician talking to a patient after reviewing their chart — clear, confident, and caring.

CONTENT
- Lead with the most important finding, not a generic opener.
- Name specific values. Connect related findings as patterns when they point in the same direction.
- Be honest about what needs attention without being alarming.
- If something looks good, say it plainly: "Your kidney function is solid — creatinine and GFR are both in a healthy range."
- Give next steps that are specific to these results, not generic wellness advice.${gender === 'female' ? '\n- Consider cycle phase context when interpreting hormone markers. Address female-specific markers (iron, thyroid, bone density) when present.' : ''}`
          },
          {
            role: "user",
            content: communicationPrompt
          }
        ],
        max_completion_tokens: 2500,
      });

      const summary = response.choices[0]?.message?.content;
      console.log('[AI Service] Patient summary generated, length:', summary?.length || 0);

      return annotatePatientSummary(summary || this.getDefaultPatientSummary(), therapyContext);
    } catch (error) {
      console.error("Error generating patient summary:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
      }
      return this.getDefaultPatientSummary();
    }
  }

  static buildTrendContext(
    currentLabs: LabValues | FemaleLabValues,
    priorLabs: Array<{ labDate: Date | string; labValues: LabValues | FemaleLabValues }>
  ): string {
    if (!priorLabs || priorLabs.length === 0) return '';

    const prior = priorLabs[0];
    const priorDate = new Date(prior.labDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const priorVals = prior.labValues as any;
    const currentVals = currentLabs as any;

    const trackedMarkers: Array<{ name: string; key: string; unit: string }> = [
      { name: 'Total Cholesterol', key: 'totalCholesterol', unit: 'mg/dL' },
      { name: 'LDL', key: 'ldl', unit: 'mg/dL' },
      { name: 'HDL', key: 'hdl', unit: 'mg/dL' },
      { name: 'Triglycerides', key: 'triglycerides', unit: 'mg/dL' },
      { name: 'A1c', key: 'a1c', unit: '%' },
      { name: 'Hemoglobin', key: 'hemoglobin', unit: 'g/dL' },
      { name: 'Hematocrit', key: 'hematocrit', unit: '%' },
      { name: 'PSA', key: 'psa', unit: 'ng/mL' },
      { name: 'TSH', key: 'tsh', unit: 'mIU/L' },
      { name: 'Testosterone', key: 'testosterone', unit: 'ng/dL' },
      { name: 'Estradiol', key: 'estradiol', unit: 'pg/mL' },
      { name: 'Vitamin D', key: 'vitaminD', unit: 'ng/mL' },
      { name: 'Ferritin', key: 'ferritin', unit: 'ng/mL' },
      { name: 'AST', key: 'ast', unit: 'U/L' },
      { name: 'ALT', key: 'alt', unit: 'U/L' },
      { name: 'Creatinine', key: 'creatinine', unit: 'mg/dL' },
      { name: 'eGFR', key: 'egfr', unit: 'mL/min' },
      { name: 'ApoB', key: 'apoB', unit: 'mg/dL' },
      { name: 'hs-CRP', key: 'hsCRP', unit: 'mg/L' },
      { name: 'SHBG', key: 'shbg', unit: 'nmol/L' },
      { name: 'Free Testosterone', key: 'freeTestosterone', unit: '' },
      { name: 'Progesterone', key: 'progesterone', unit: 'ng/mL' },
    ];

    const trends: string[] = [];
    for (const marker of trackedMarkers) {
      const current = currentVals[marker.key];
      const previous = priorVals[marker.key];
      if (current !== undefined && current !== null && previous !== undefined && previous !== null) {
        const diff = Number(current) - Number(previous);
        const direction = diff > 0 ? 'increased' : diff < 0 ? 'decreased' : 'unchanged';
        const absChange = Math.abs(diff).toFixed(1);
        trends.push(`${marker.name}: ${previous} -> ${current} ${marker.unit} (${direction} by ${absChange})`);
      }
    }

    if (trends.length === 0) return '';

    return `\n\nPRIOR LAB COMPARISON (vs ${priorDate}):\n${trends.join('\n')}\nPlease reference these trends in your recommendations - note improvements, worsening values, and stability.`;
  }

  static async generateSOAPNote(
    labs: LabValues | FemaleLabValues,
    redFlags: RedFlag[],
    interpretations: LabInterpretation[],
    aiRecommendations: string,
    recheckWindow: string,
    gender: 'male' | 'female' = 'male',
    riskResult?: ASCVDRiskResult | PREVENTRiskResult | null,
    supplements?: SupplementRecommendation[],
    insulinResistance?: InsulinResistanceScreening | null,
    trendContext?: string,
    therapyContext?: TherapyContext | null,
  ): Promise<string> {
    const clinicType = gender === 'female' ? "Women's Hormone & Primary Care Clinic" : "Men's Hormone & Primary Care Clinic";
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

    const abnormalFindings = interpretations.filter(i => i.status === 'abnormal' || i.status === 'critical');
    const borderlineFindings = interpretations.filter(i => i.status === 'borderline');
    const normalFindings = interpretations.filter(i => i.status === 'normal');

    const buildLabList = (findings: LabInterpretation[]) =>
      findings.map(f => `${f.category}: ${f.value} ${f.unit} [${f.status.toUpperCase()}] - ${f.interpretation}`).join('\n');

    let cvRiskSection = '';
    if (riskResult) {
      if ('tenYearTotalCVD' in riskResult) {
        const pr = riskResult as PREVENTRiskResult;
        cvRiskSection = `\nCardiovascular Risk (AHA PREVENT 2023): 10-yr Total CVD ${pr.tenYearCVDPercentage}, 10-yr ASCVD ${pr.tenYearASCVDPercentage}, 10-yr HF ${pr.tenYearHFPercentage}. Category: ${pr.riskCategory}.`;
        if (pr.thirtyYearCVDPercentage) cvRiskSection += ` 30-yr CVD: ${pr.thirtyYearCVDPercentage}.`;
        if (pr.statinRecommendation) cvRiskSection += ` Statin: ${pr.statinRecommendation}.`;
      } else {
        const ar = riskResult as ASCVDRiskResult;
        cvRiskSection = `\nCardiovascular Risk: 10-yr ASCVD ${ar.riskPercentage}, Category: ${ar.riskCategory}.`;
        if (ar.statinRecommendation) cvRiskSection += ` Statin: ${ar.statinRecommendation}.`;
      }
    }

    let irSection = '';
    if (insulinResistance && insulinResistance.positiveCount >= 2) {
      const totalMarkers = insulinResistance.markers?.length || 6;
      irSection = `\nInsulin Resistance Screening: ${insulinResistance.likelihoodLabel} (${insulinResistance.positiveCount}/${totalMarkers} markers positive).`;
      if (insulinResistance.phenotypes && insulinResistance.phenotypes.length > 0) {
        irSection += ` Phenotypes: ${insulinResistance.phenotypes.map((p: any) => p.name).join(', ')}.`;
      }
    }

    let supplementSection = '';
    if (supplements && supplements.length > 0) {
      const highPriority = supplements.filter(s => s.priority === 'high');
      const medPriority = supplements.filter(s => s.priority === 'medium');
      if (highPriority.length > 0) {
        supplementSection += `\nHigh-priority supplements recommended: ${highPriority.map(s => `${s.name} (${s.dose})`).join('; ')}.`;
      }
      if (medPriority.length > 0) {
        supplementSection += `\nMedium-priority supplements: ${medPriority.map(s => `${s.name} (${s.dose})`).join('; ')}.`;
      }
    }

    const patientName = (labs as any).patientName || 'Patient';
    const age = (labs as any).age || (labs as any).demographics?.age;
    const ageStr = age ? `, ${age}-year-old` : '';
    const sexStr = gender === 'female' ? 'female' : 'male';

    const prompt = `Generate a complete SOAP note for a clinical chart entry based on the following lab interpretation data. This note should be ready to copy and paste directly into an EMR/EHR.

PATIENT: ${patientName}${ageStr} ${sexStr}
CLINIC: ${clinicType}
DATE: ${today}

RED FLAGS (${redFlags.length}):
${redFlags.length > 0 ? redFlags.map(f => `- [${f.severity.toUpperCase()}] ${f.category}: ${f.message} → Action: ${f.action}`).join('\n') : 'None'}

ABNORMAL/CRITICAL FINDINGS:
${abnormalFindings.length > 0 ? buildLabList(abnormalFindings) : 'None'}

BORDERLINE FINDINGS:
${borderlineFindings.length > 0 ? buildLabList(borderlineFindings) : 'None'}

NORMAL FINDINGS (${normalFindings.length}):
${normalFindings.map(f => `${f.category}: ${f.value} ${f.unit}`).join(', ')}
${cvRiskSection}${irSection}${supplementSection}

RECHECK WINDOW: ${recheckWindow}
${trendContext || ''}
${buildTherapyPromptBlock(therapyContext)}

AI CLINICAL RECOMMENDATIONS (already generated):
${aiRecommendations}

FORMAT THE SOAP NOTE AS FOLLOWS:

SUBJECTIVE:
- Chief complaint: Lab review / follow-up / hormone management (use clinical context)
- Include any relevant symptoms the patient reports based on abnormal findings
- For ${gender === 'female' ? 'women' : 'men'}: reference relevant ${gender === 'female' ? 'hormonal symptoms, menstrual history, or menopausal status' : 'hormone therapy status, energy, libido, or mood concerns'} if labs suggest them

OBJECTIVE:
- List ALL lab values in a clean, organized format grouped by category (CBC, CMP, Lipids, Hormones, etc.)
- Include units and flag abnormal/critical values
- Include vital signs if available (BMI, BP)
- Include risk scores (cardiovascular, insulin resistance) if calculated

ASSESSMENT/PLAN:

Begin with an Assessment Summary paragraph BEFORE the numbered problem list. This paragraph (2–4 sentences) should:
- Synthesize the overall clinical picture: most significant findings, symptom patterns, metabolic trends, and monitoring priorities
- Sound like a clinician's opening synthesis — medically grounded and professional, not a list restated as a sentence
- Connect related findings when appropriate (e.g., insulin resistance + dyslipidemia + elevated hs-CRP reflect a broader cardiometabolic pattern rather than isolated problems)
- Stay strictly grounded in the lab data and clinical context provided — do not invent findings

For each numbered problem (diagnosis), write a substantive entry in this style:

1. [Diagnosis]:
   [2–3 sentences of clinical reasoning — explain what the finding means in this patient's context, reference the relevant lab value(s), note any pertinent history or trend, and state the rationale for the management approach chosen. Do not write a bare label with a one-line generic action.]
   Plan: [specific steps — medication with dose/frequency if applicable, supplements with dosing, lifestyle recommendations, labs to recheck with timing, follow-up interval with rationale]

Tone guidance:
- Write like a thoughtful NP/PA/MD would document in a polished outpatient note
- Be concise but meaningful — not padded, not robotic, not repetitive
- BAD: "Hyperlipidemia. Will continue lifestyle changes. Repeat labs in 3 months."
- GOOD: "Hyperlipidemia with persistence of atherogenic markers on this panel, including LDL and triglycerides above optimal thresholds. Ongoing dietary modification was reinforced at this visit, particularly in the context of the patient's broader cardiometabolic risk. Will continue lifestyle intervention and recheck lipid markers at the scheduled follow-up interval to assess trajectory and determine whether pharmacologic therapy is indicated."
- BAD: "Testosterone optimization. Continue current protocol."
- GOOD: "Testosterone optimization with current values reflecting [status relative to target range]. The patient's hormonal picture is being managed within the framework of this clinic's protocol, with attention to [relevant secondary markers]. Current management will be continued with monitoring for [relevant parameters] at follow-up."

End with:
"Results reviewed and discussed with patient. Questions answered. Patient verbalized understanding. Follow-up as above."

CRITICAL FORMATTING RULES:
- Use standard SOAP format with clear S/O/A headers, then combined ASSESSMENT/PLAN
- Assessment Summary paragraph appears FIRST in the Assessment/Plan section, before any numbered items
- Use numbered problem list after the summary paragraph
- Be thorough but concise — this goes directly into a medical chart
- Use professional medical terminology
- NO emojis
- Include today's date: ${today}
- MEDICATION NAMES: Only use real, established generic or brand names. If the patient chart does not specify the exact drug name, write the drug class (e.g., "GLP-1 receptor agonist") — NEVER invent a name. Fictional medication names are a patient-safety violation.`;

    try {
      console.log('[AI Service] Generating SOAP note...');
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are an experienced clinician-level documentation specialist generating chart-ready SOAP notes for a ${clinicType}. Your notes synthesize clinical findings the way an experienced NP, PA, or physician would — integrating lab data, clinical context, and medical reasoning into a polished, professional document. You do NOT merely restate findings as a list. You write substantive Assessment/Plan entries with clinical reasoning, appropriate treatment rationale, and follow-up logic. Your Assessment section always begins with a 2–4 sentence summary paragraph synthesizing the overall clinical picture before the numbered problem list. Every note you produce is ready to sign with minimal editing. You never invent facts not present in the provided data.

MEDICATION NAME RULE — NON-NEGOTIABLE: You must NEVER invent, fabricate, or approximate a medication or supplement name. Only use real, established generic or brand names (e.g., semaglutide, tirzepatide, liraglutide, metformin, testosterone cypionate, anastrozole, progesterone, levothyroxine, atorvastatin, rosuvastatin, vitamin D3, magnesium glycinate, omega-3, berberine, etc.). If the patient's chart does not specify the exact medication name, refer to the DRUG CLASS only (e.g., "GLP-1 receptor agonist," "testosterone therapy," "statin therapy") — never invent a brand name to fill the gap. Any fictional name (e.g., "Zephytide," "Hormonex," "Testovance") is a serious clinical documentation error.

DOCUMENTATION VOICE — NON-NEGOTIABLE:
This note is authored by the treating provider. Write in provider voice throughout — never as a third-party observer narrating about "the provider."
- NEVER write: "The provider discussed...", "The provider recommended...", "The provider noted...", "The clinician advised..."
- These are legal errors — a signed chart note cannot refer to its own author in the third person.
- Instead use direct provider voice or standard clinical passive construction:
  • "We discussed..." / "I recommended..." / "Discussed with patient..."
  • "Recommended starting omega-3 fish oils..."
  • "Testosterone therapy was discussed as an option for..."
  • "Plan was made to initiate..."
  • "Patient was counseled on..."
  • "She reports..." / "She denies..." / "She endorses..."
  • "Labs were reviewed showing..." / "We reviewed labs showing..."
- The HPI and A/P must read as if the signing provider wrote every word — because they did.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 4000,
      });

      const soapNote = response.choices[0]?.message?.content;
      console.log('[AI Service] SOAP note generated, length:', soapNote?.length || 0);
      return annotateRecommendationMarkdown(soapNote || this.getDefaultSOAPNote(today), therapyContext);
    } catch (error) {
      console.error("Error generating SOAP note:", error);
      return this.getDefaultSOAPNote(today);
    }
  }

  private static getDefaultSOAPNote(date: string): string {
    return `SOAP NOTE - ${date}\n\nS: Lab review visit. [Unable to generate AI-powered SOAP note at this time. Please document subjective findings manually.]\n\nO: See lab results above.\n\nA: See clinical interpretations above.\n\nP: See recommendations above. Follow up as clinically indicated.\n\nResults reviewed with patient. Questions answered. Patient verbalized understanding.`;
  }

  /**
   * Generate a provider SOAP note from the provider's already-curated lab eval:
   * the edited patient communication, visible (non-hidden) interpretations, and
   * effective supplement list. This is called after the provider has finished
   * customizing the eval — the note reflects exactly what was shared with the
   * patient rather than re-deriving from raw data.
   */
  static async generateSOAPNoteFromEdited(opts: {
    patientName: string;
    age?: number;
    gender: 'male' | 'female';
    effectivePatientSummary: string;
    effectiveInterpretations: LabInterpretation[];
    effectiveSupplements: SupplementRecommendation[];
    rawLabValues: Record<string, unknown>;
    recheckWindow: string;
    riskSummary?: string;
    trendContext?: string;
  }): Promise<string> {
    const {
      patientName, age, gender, effectivePatientSummary,
      effectiveInterpretations, effectiveSupplements,
      rawLabValues, recheckWindow, riskSummary, trendContext,
    } = opts;

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const ageStr = age ? `, ${age}-year-old` : '';
    const sexStr = gender === 'female' ? 'female' : 'male';
    const clinicType = gender === 'female' ? "Women's Hormone & Primary Care Clinic" : "Men's Hormone & Primary Care Clinic";

    const abnormal = effectiveInterpretations.filter(i => i.status === 'abnormal' || i.status === 'critical');
    const borderline = effectiveInterpretations.filter(i => i.status === 'borderline');
    const normal = effectiveInterpretations.filter(i => i.status === 'normal');

    const fmtFindings = (arr: LabInterpretation[]) =>
      arr.map(f => `  ${f.category}: ${f.value} ${f.unit} [${f.status.toUpperCase()}]\n    Finding: ${f.interpretation}\n    Recommendation: ${f.recommendation || '—'}`).join('\n');

    const suppSection = effectiveSupplements.length > 0
      ? effectiveSupplements.map(s => `  - ${s.name}${s.dose ? ` ${s.dose}` : ''}${s.rationale ? ` — ${s.rationale}` : ''}`).join('\n')
      : '  None';

    // Flatten raw lab values into a readable objective block
    const labLines = Object.entries(rawLabValues)
      .filter(([k, v]) => v !== undefined && v !== null && v !== '' && typeof v !== 'object' && !k.startsWith('_') && k !== 'patientName' && k !== 'gender' && k !== 'age')
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const prompt = `You are generating a concise, chart-ready provider SOAP note summarizing a completed lab evaluation for a ${clinicType}.

PATIENT: ${patientName}${ageStr} ${sexStr}
DATE: ${today}
RECHECK WINDOW: ${recheckWindow}
${riskSummary ? `CARDIOVASCULAR RISK: ${riskSummary}` : ''}
${trendContext ? `TREND CONTEXT:\n${trendContext}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT COMMUNICATION SUMMARY
(Provider-approved text already sent to the patient — use this as the basis for the Subjective section)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${effectivePatientSummary || '[No patient summary recorded]'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAB FINDINGS (provider-reviewed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABNORMAL / CRITICAL (${abnormal.length}):
${abnormal.length ? fmtFindings(abnormal) : '  None'}

BORDERLINE (${borderline.length}):
${borderline.length ? fmtFindings(borderline) : '  None'}

NORMAL (${normal.length}):
${normal.length ? normal.map(f => `  ${f.category}: ${f.value} ${f.unit}`).join('\n') : '  None'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROVIDER-APPROVED SUPPLEMENT RECOMMENDATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${suppSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RAW LAB VALUES (for Objective section)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${labLines || '  See findings above'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write a concise, chart-ready SOAP note. The provider has already reviewed and curated everything above — reflect it exactly. Do not re-interpret, contradict, or add findings not listed.

SUBJECTIVE:
- "Patient presents for lab review."
- Pull 2–4 relevant context sentences from the PATIENT COMMUNICATION SUMMARY above (symptoms mentioned, current therapies, relevant history). Do not invent anything not referenced there.

OBJECTIVE:
- List ALL lab values grouped by panel (CBC, CMP, Lipids, Hormones, Thyroid, etc.), one value per line
- Format: [Marker]: [Value] [Unit] — flag as (ABNORMAL) or (BORDERLINE) where applicable
- Normal values: list without a flag

ASSESSMENT:
- Write 2–3 sentences summarizing the overall clinical picture based on the abnormal and borderline findings above.
- Reference specific values. Do not invent clinical conclusions not supported by the findings.

PLAN:
- Number each actionable item. One item per abnormal/critical finding; group minor borderlines if appropriate.
- Format each item as:
  1. [Finding/Diagnosis]: [1–2 sentence clinical rationale]. [Specific action — supplement with dose, lifestyle change, medication, recheck timing.]
- After the numbered items, add a "Supplements" line listing every approved supplement with dose and one-line rationale.
- Close with: "Lab results reviewed and discussed with patient. Patient verbalized understanding. Recheck labs in ${recheckWindow}. Follow-up as clinically indicated."

VOICE RULES (non-negotiable):
- Write in provider voice throughout. Never say "The provider…" or "The clinician…"
- Use implied subject: "Reviewed…", "Discussed…", "Recommended…", "Patient reports…", "She denies…", "He reports…"
- No emojis. No placeholders. No invented names.`;

    console.log('[AIService] generateSOAPNoteFromEdited: calling OpenAI, model=gpt-5-mini, patient=', patientName);
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are an experienced clinician-level documentation specialist generating chart-ready SOAP notes for a ${clinicType}. The provider has already curated the patient communication and approved findings — your job is to translate that curated content into a polished provider chart note. You synthesize, not re-derive. You never invent findings or contradict what the provider approved. Every note you produce is ready to sign with minimal editing.

DOCUMENTATION VOICE — NON-NEGOTIABLE:
This note is authored by the treating provider. Write in provider voice throughout.
- NEVER write: "The provider discussed…", "The provider recommended…", "The clinician advised…"
- Use implied-subject constructions: "Reviewed…", "Discussed…", "Recommended…", "Patient was counseled on…", "She reports…", "He denies…"

MEDICATION NAME RULE: Only use real, established generic or brand names. Never invent a name.`
        },
        { role: "user", content: prompt }
      ],
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    console.log('[AIService] generateSOAPNoteFromEdited: response received, length=', content?.length ?? 0);
    if (!content) throw new Error('OpenAI returned an empty response for the SOAP note');
    return content;
  }

  private static buildRecommendationPrompt(
    labs: LabValues | FemaleLabValues,
    redFlags: RedFlag[],
    interpretations: LabInterpretation[],
    gender: 'male' | 'female' = 'male'
  ): string {
    const patientType = gender === 'female' ? "women's hormone clinic patient" : "men's hormone clinic patient";
    const onTRT = gender === 'male' && (labs as any).onTRT === true;
    const onHRT = gender === 'female' && (labs as any).onHRT === true;
    const trtContext = onTRT ? ' Currently on Testosterone Replacement Therapy (TRT).' : '';
    const hrtContext = onHRT ? ' Currently on Hormone Replacement Therapy (HRT).' : '';
    let prompt = `Analyze these lab results from a ${patientType}.${trtContext}${hrtContext} Provide synthesized clinical recommendations:\n\n`;
    if (onTRT) {
      prompt += `CLINICAL CONTEXT: Patient is actively on TRT. Testosterone optimal target: 600–1200 ng/dL (trough). Interpret testosterone findings in context of TRT protocol management.\n\n`;
    }
    if (onHRT) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLINICAL CONTEXT — FEMALE HRT PATIENT (NON-NEGOTIABLE REASONING RULES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This patient is actively on female Hormone Replacement Therapy. Apply the following rules without exception:

TESTOSTERONE ON HRT:
- Clinic optimization target: 50–125 ng/dL total testosterone.
- Pre-treatment baseline is typically 5–25 ng/dL. A rise from that baseline into the 50–125 ng/dL range is the INTENDED THERAPEUTIC RESPONSE — it is NOT a critical finding, NOT excess exogenous exposure, NOT a transference risk event.
- A trend from low baseline (e.g., 13 ng/dL) to therapeutic range (e.g., 50 ng/dL) = HRT working correctly. Document as "testosterone responding appropriately to therapy."
- Do NOT flag any testosterone value ≤125 ng/dL as elevated, concerning, or requiring urgent action in an HRT patient.
- Only flag as truly elevated (dose reduction needed) if total testosterone >150 ng/dL.
- Free testosterone target on HRT: 3–10 pg/mL. Values 6–10 pg/mL are acceptable. Only flag if >12 pg/mL.

PCOS RULE — ABSOLUTE:
- NEVER suggest PCOS workup, PCOS pattern, or androgen excess pathology for a patient on HRT whose testosterone is elevated due to therapy.
- Elevated androgens in an HRT patient reflect therapeutic intent. PCOS is a diagnosis of exclusion in the non-treated state.

ESTRADIOL & PROGESTERONE TARGETS ON HRT:
- Estradiol goal: 60–100 pg/mL (minimum 40 pg/mL for bone protection).
- Progesterone goal: 8–10 ng/mL.

ESTRADIOL & PROGESTERONE FRAMING — ABSOLUTE RULE:
- NEVER describe estradiol or progesterone as "production," "endogenous," or "sufficient." These values reflect the patient's RESPONSE TO THERAPY, not her natural output.
- Always frame as response to therapy. Examples: "Estradiol is responding well to estrogen therapy at 72 pg/mL — within the clinic optimization target of 60–100 pg/mL." / "Estradiol is at the therapeutic goal on current HRT dosing." / "Progesterone is responding appropriately to progesterone therapy."
- For estradiol 60–100 pg/mL on HRT: state it is at therapeutic goal, bone protection is achieved, maintain current dosing.
- For estradiol <40 pg/mL on HRT: state absorption or dose inadequacy — do NOT say "low production."
- For progesterone at goal: state it is responding appropriately to progesterone therapy.

TREND INTERPRETATION ON HRT:
- Rising testosterone from pre-HRT baseline to therapeutic range = success.
- Falling testosterone on existing HRT = dose adherence or absorption issue — do NOT treat as spontaneous decline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    // Add vital signs (BP, BMI) so cardiovascular and metabolic recommendations
    // factor in hypertension and obesity context.
    try {
      // Lazy-require to avoid circular import at module-load time.
      const { buildVitalsPromptBlock } = require("./vital-signs-analyzer") as typeof import("./vital-signs-analyzer");
      const vitalsBlock = buildVitalsPromptBlock((labs as any).demographics);
      if (vitalsBlock) prompt += vitalsBlock;
    } catch { /* non-fatal */ }

    // Add ASCVD risk modifiers (family history, statin use)
    if (gender === 'male') {
      const dem = (labs as any).demographics ?? {};
      const riskModifiers: string[] = [];
      if (dem.familyHistory) riskModifiers.push('premature family CVD history');
      if (dem.onStatins) riskModifiers.push('currently on statin therapy');
      if (riskModifiers.length) {
        prompt += `CARDIOVASCULAR RISK MODIFIERS: ${riskModifiers.join(', ')}.\n\n`;
      }
    }

    // Add patient-reported symptoms block for male patients
    if (gender === 'male') {
      const MALE_SYMPTOM_LABELS: Record<string, string> = {
        lowLibido: 'Low libido',
        lowEnergy: 'Low energy / fatigue',
        lowMotivation: 'Low motivation',
        brainFog: 'Brain fog',
        moodChanges: 'Mood changes',
        irritability: 'Irritability',
        anxiety: 'Anxiety',
        sleepDisruption: 'Sleep disruption',
        nightSweats: 'Night sweats',
        hairLoss: 'Hair loss / thinning',
        weightGain: 'Weight gain / central adiposity',
        jointAches: 'Joint aches',
        headaches: 'Headaches',
        acne: 'Acne',
        bloating: 'Bloating / GI issues',
        restlessLegs: 'Restless legs',
      };
      const activeSymptoms = Object.entries(MALE_SYMPTOM_LABELS)
        .filter(([key]) => (labs as any)[key] === true)
        .map(([, label]) => label);
      if (activeSymptoms.length > 0) {
        prompt += `PATIENT-REPORTED SYMPTOMS: ${activeSymptoms.join(', ')}.\nFactor these into your clinical assessment and recommendations — correlate with lab findings where applicable.\n\n`;
      }
    }

    // Add red flags if any
    if (redFlags.length > 0) {
      prompt += "RED FLAGS (Physician Notification Required):\n";
      redFlags.forEach(flag => {
        prompt += `- [${flag.severity.toUpperCase()}] ${flag.category}: ${flag.message}\n  Action: ${flag.action}\n`;
      });
      prompt += "\n";
    }

    // Add abnormal findings
    const abnormalFindings = interpretations.filter(i => i.status !== 'normal');
    if (abnormalFindings.length > 0) {
      prompt += "Abnormal/Borderline Findings:\n";
      abnormalFindings.forEach(finding => {
        prompt += `- ${finding.category}: ${finding.value} ${finding.unit} [${finding.status}]\n`;
        prompt += `  Clinical significance: ${finding.interpretation}\n`;
        prompt += `  Protocol recommendation: ${finding.recommendation}\n`;
        if (finding.recheckTiming) {
          prompt += `  Recheck: ${finding.recheckTiming}\n`;
        }
        prompt += "\n";
      });
    }

    // Add normal findings summary
    const normalFindings = interpretations.filter(i => i.status === 'normal');
    if (normalFindings.length > 0) {
      prompt += `Normal Results (${normalFindings.length}): `;
      prompt += normalFindings.map(f => f.category).join(', ') + "\n\n";
    }

    // Request specific output
    prompt += `Please provide:
1. Overall clinical assessment
2. Priority actions (if red flags exist)
3. Testosterone dose recommendations (if applicable)
4. Lifestyle interventions needed
5. Any additional testing or referrals to consider
6. Summary of next steps and timeline

Format your response in clear sections with bullet points where appropriate.`;

    return prompt;
  }

  private static getDefaultPatientSummary(): string {
    return `We've reviewed your recent lab results.

Your Results:
We went through each of your values — hormone levels, blood counts, metabolic markers, and organ function. We'll highlight anything that needs attention and let you know where things stand.

Next Steps:
We'll go over the specifics at your follow-up, or reach out if anything needs to be addressed sooner. In the meantime, keep up with any lifestyle or medication recommendations we've discussed.`;
  }

  /**
   * Generate comprehensive patient wellness plan for patient PDF
   * Includes personalized diet with meal examples, supplement protocols with dosing,
   * and detailed lifestyle recommendations based on lab results
   */
  static async generatePatientWellnessPlan(
    labs: FemaleLabValues,
    interpretations: LabInterpretation[],
    supplements: Array<{ name: string; dose: string; reason: string }>,
    riskResult?: ASCVDRiskResult | PREVENTRiskResult | null
  ): Promise<{
    dietPlan: string;
    supplementProtocol: string;
    lifestyleRecommendations: string;
    educationalContent: string;
  }> {
    const abnormalFindings = interpretations.filter(i => i.status === 'abnormal' || i.status === 'critical');
    const borderlineFindings = interpretations.filter(i => i.status === 'borderline');

    const buildFindingsList = (findings: LabInterpretation[]) => {
      return findings.map(f => `${f.category}: ${f.value} ${f.unit} - ${f.interpretation}`).join('\n');
    };

    const supplementsList = supplements.map(s => `${s.name} (${s.dose}) - ${s.reason}`).join('\n');

    // Build cardiovascular risk section supporting both ASCVD and PREVENT formats
    let cvRiskSection = '';
    if (riskResult) {
      if ('tenYearTotalCVD' in riskResult) {
        // PREVENT Risk Result (2023 AHA equations)
        const preventRisk = riskResult as PREVENTRiskResult;
        cvRiskSection = `
CARDIOVASCULAR RISK (PREVENT 2023):
10-Year Total CVD Risk: ${preventRisk.tenYearCVDPercentage}
10-Year ASCVD Risk: ${preventRisk.tenYearASCVDPercentage}
10-Year Heart Failure Risk: ${preventRisk.tenYearHFPercentage}
Risk Category: ${preventRisk.riskCategory}
${preventRisk.thirtyYearCVDPercentage ? `30-Year CVD Risk: ${preventRisk.thirtyYearCVDPercentage}` : ''}
${preventRisk.ldlGoal ? `LDL Goal: ${preventRisk.ldlGoal}` : ''}`;
      } else {
        // Legacy ASCVD Risk Result
        const ascvdRisk = riskResult as ASCVDRiskResult;
        cvRiskSection = `
CARDIOVASCULAR RISK:
10-Year Risk: ${ascvdRisk.riskPercentage}
Category: ${ascvdRisk.riskCategory}
${ascvdRisk.ldlGoal ? `LDL Goal: ${ascvdRisk.ldlGoal}` : ''}`;
      }
    }

    const prompt = `Create a comprehensive personalized wellness plan for a female patient based on her lab results.

ABNORMAL FINDINGS:
${abnormalFindings.length > 0 ? buildFindingsList(abnormalFindings) : 'None'}

BORDERLINE FINDINGS:
${borderlineFindings.length > 0 ? buildFindingsList(borderlineFindings) : 'None'}

RECOMMENDED SUPPLEMENTS:
${supplementsList || 'None specified'}
${cvRiskSection}

KEY LAB VALUES:
- Hemoglobin: ${labs.hemoglobin || 'not tested'} g/dL
- Ferritin: ${labs.ferritin || 'not tested'} ng/mL
- Vitamin D: ${labs.vitaminD || 'not tested'} ng/mL
- Vitamin B12: ${labs.vitaminB12 || 'not tested'} pg/mL
- TSH: ${labs.tsh || 'not tested'} mIU/L
- LDL: ${labs.ldl || 'not tested'} mg/dL
- HDL: ${labs.hdl || 'not tested'} mg/dL
- Triglycerides: ${labs.triglycerides || 'not tested'} mg/dL
- A1c: ${labs.a1c || 'not tested'}%
- hs-CRP: ${labs.hsCRP || 'not tested'} mg/L
- Estradiol: ${labs.estradiol || 'not tested'} pg/mL
- Progesterone: ${labs.progesterone || 'not tested'} ng/mL

Please generate FOUR separate sections. Each section should be thorough, educational, and actionable.

SECTION 1 - PERSONALIZED NUTRITION PLAN (400-500 words):
Based on the specific lab findings, structure this section with these three subsections:

GOAL:
Write 2-3 sentences explaining the patient's personalized nutrition goal based on their lab results. What are we trying to achieve? (e.g., "Your goal is to optimize iron levels and reduce inflammation to boost energy and support hormone balance.")

DIET:
Recommend a specific named diet approach that fits their needs (e.g., Mediterranean, Anti-Inflammatory, Heart-Healthy, Iron-Rich). Explain in 2-3 sentences why this diet is ideal for their specific situation.

FOODS TO EMPHASIZE:
List 6-8 specific foods with explanations of why each food will help THIS patient. Format each as:
Food Name - reason it helps their specific condition

Example format:
- Salmon - Rich in omega-3s to lower your elevated triglycerides and reduce inflammation
- Spinach - High in iron and folate to address your low ferritin levels
- Blueberries - Antioxidants support healthy aging and reduce oxidative stress

SECTION 2 - SUPPLEMENT PROTOCOL (300-400 words):
Based on the recommended supplements and lab findings, provide:
- Each supplement with exact dosing and timing
- When to take each supplement (morning, with food, at bedtime, etc.)
- Expected benefits and timeline for improvement
- Any interactions to be aware of
- Tips for optimal absorption
- Format as a clear daily schedule

SECTION 3 - LIFESTYLE RECOMMENDATIONS (300-400 words):
Structure this section with FOUR specific categories. Personalize each recommendation based on the patient's age and lab findings:

PHYSICAL ACTIVITY:
Recommend specific exercise types, frequency, and duration appropriate for this patient. Consider their energy levels, any fatigue indicators, and cardiovascular health from labs.

SLEEP:
Provide sleep optimization strategies including hours needed, bedtime routine tips, and any supplements or habits that could help based on their specific situation.

STRESS MANAGEMENT:
Suggest stress reduction techniques appropriate for this patient. Include specific practices (meditation, breathing, journaling) with timing and frequency.

HYDRATION:
Give specific daily water intake goals in ounces. Adjust based on activity level and any relevant lab findings. Include tips for meeting hydration goals.

SECTION 4 - EDUCATIONAL CONTENT (300-400 words):
Help the patient understand their results:
- What their key lab values mean in plain language
- Why certain values are important for women's health
- How the recommended changes will help improve their numbers
- What to expect at their next lab check
- Signs of improvement to watch for
- When to contact the clinic

IMPORTANT FORMATTING:
- Use clear headers and bullet points
- Write in warm, encouraging, patient-friendly language
- Be specific with numbers, portions, and timing
- Avoid medical jargon - explain everything clearly
- Make it feel personalized to THEIR results
- NO EMOJIS

Respond with exactly four clearly labeled sections:
[DIET PLAN]
(content)

[SUPPLEMENT PROTOCOL]
(content)

[LIFESTYLE RECOMMENDATIONS]
(content)

[EDUCATIONAL CONTENT]
(content)`;

    try {
      console.log('[AI Service] Generating comprehensive patient wellness plan');
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a women's wellness expert creating personalized health plans. Write in a warm, encouraging, educational tone. Be specific with actionable recommendations. Focus on practical, achievable steps. Always connect recommendations back to their specific lab results.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 6000,
      });

      const content = response.choices[0]?.message?.content || '';
      console.log('[AI Service] Wellness plan generated, length:', content.length);

      // Parse the sections
      const dietMatch = content.match(/\[DIET PLAN\]([\s\S]*?)(?=\[SUPPLEMENT PROTOCOL\]|$)/i);
      const supplementMatch = content.match(/\[SUPPLEMENT PROTOCOL\]([\s\S]*?)(?=\[LIFESTYLE RECOMMENDATIONS\]|$)/i);
      const lifestyleMatch = content.match(/\[LIFESTYLE RECOMMENDATIONS\]([\s\S]*?)(?=\[EDUCATIONAL CONTENT\]|$)/i);
      const educationalMatch = content.match(/\[EDUCATIONAL CONTENT\]([\s\S]*?)$/i);

      return {
        dietPlan: dietMatch?.[1]?.trim() || this.getDefaultDietPlan(),
        supplementProtocol: supplementMatch?.[1]?.trim() || this.getDefaultSupplementProtocol(supplements),
        lifestyleRecommendations: lifestyleMatch?.[1]?.trim() || this.getDefaultLifestyleRecommendations(),
        educationalContent: educationalMatch?.[1]?.trim() || this.getDefaultEducationalContent(),
      };
    } catch (error) {
      console.error("Error generating patient wellness plan:", error);
      return {
        dietPlan: this.getDefaultDietPlan(),
        supplementProtocol: this.getDefaultSupplementProtocol(supplements),
        lifestyleRecommendations: this.getDefaultLifestyleRecommendations(),
        educationalContent: this.getDefaultEducationalContent(),
      };
    }
  }

  private static getDefaultDietPlan(): string {
    return `Your Personalized Nutrition Plan

Based on your lab results, we recommend focusing on a balanced, nutrient-rich diet that supports your overall health and addresses any areas needing attention.

Key Dietary Focus:
- Emphasize whole, unprocessed foods
- Include lean proteins at every meal
- Choose colorful fruits and vegetables daily
- Select whole grains over refined options
- Include healthy fats from nuts, seeds, and olive oil

Sample Meal Ideas:
Breakfast: Greek yogurt with berries and a sprinkle of nuts, or eggs with spinach and whole grain toast
Lunch: Large salad with grilled chicken, mixed greens, vegetables, and olive oil dressing
Dinner: Baked salmon with roasted vegetables and quinoa
Snacks: Apple with almond butter, hummus with vegetables, or a handful of mixed nuts

Please discuss specific dietary modifications with your healthcare provider based on your individual needs.`;
  }

  private static getDefaultSupplementProtocol(supplements: Array<{ name: string; dose: string; reason: string }>): string {
    if (supplements.length === 0) {
      return `Supplement Recommendations

Based on your lab results, your healthcare provider may recommend specific supplements at your follow-up visit. General wellness supplements to discuss include a high-quality multivitamin and vitamin D if levels are suboptimal.

Always consult with your healthcare provider before starting any new supplements.`;
    }

    let protocol = `Your Supplement Protocol\n\n`;
    supplements.forEach(s => {
      protocol += `${s.name}\n`;
      protocol += `  Dose: ${s.dose}\n`;
      protocol += `  Why: ${s.reason}\n\n`;
    });
    protocol += `\nTake supplements as directed. If you experience any side effects, contact the clinic.`;
    return protocol;
  }

  private static getDefaultLifestyleRecommendations(): string {
    return `Lifestyle Recommendations for Optimal Health

Exercise:
- Aim for 150 minutes of moderate activity weekly (brisk walking, swimming, cycling)
- Include strength training 2-3 times per week
- Find activities you enjoy to stay consistent

Sleep:
- Target 7-8 hours of quality sleep nightly
- Maintain consistent sleep and wake times
- Create a relaxing bedtime routine

Stress Management:
- Practice deep breathing or meditation for 10 minutes daily
- Take regular breaks during your workday
- Connect with friends and family for emotional support

Hydration:
- Drink at least 8 glasses of water daily
- Limit caffeine to 2-3 cups before noon
- Reduce alcohol consumption

These recommendations support your overall wellness and help optimize your lab values over time.`;
  }

  private static getDefaultEducationalContent(): string {
    return `Understanding Your Results

Your lab tests provide valuable insights into your overall health and help us create a personalized wellness plan just for you.

Why These Tests Matter:
Regular monitoring allows us to track your progress, identify areas for improvement, and ensure your treatment plan is working effectively.

What to Expect:
As you implement the dietary, supplement, and lifestyle changes recommended in this report, you may begin to notice improvements in your energy levels, mood, and overall well-being within 4-8 weeks. Lab values typically improve over 2-3 months with consistent effort.

Your Next Steps:
1. Review this wellness plan and start implementing changes gradually
2. Schedule your follow-up lab work as recommended by your provider
3. Contact the clinic if you have any questions or concerns

We're Here for You:
Our team is dedicated to supporting your health journey. Don't hesitate to reach out if you need guidance or have questions about your wellness plan.`;
  }

  /**
   * Generate comprehensive patient wellness plan for MALE patients
   */
  static async generateMalePatientWellnessPlan(
    labs: LabValues,
    interpretations: LabInterpretation[],
    supplements: Array<{ name: string; dose: string; reason: string }>,
    riskResult?: ASCVDRiskResult | PREVENTRiskResult | null
  ): Promise<{
    dietPlan: string;
    supplementProtocol: string;
    lifestyleRecommendations: string;
    educationalContent: string;
  }> {
    const abnormalFindings = interpretations.filter(i => i.status === 'abnormal' || i.status === 'critical');
    const borderlineFindings = interpretations.filter(i => i.status === 'borderline');

    const buildFindingsList = (findings: LabInterpretation[]) => {
      return findings.map(f => `${f.category}: ${f.value} ${f.unit} - ${f.interpretation}`).join('\n');
    };

    const supplementsList = supplements.map(s => `${s.name} (${s.dose}) - ${s.reason}`).join('\n');

    let cvRiskSection = '';
    if (riskResult) {
      if ('tenYearTotalCVD' in riskResult) {
        const preventRisk = riskResult as PREVENTRiskResult;
        cvRiskSection = `
CARDIOVASCULAR RISK (PREVENT 2023):
10-Year Total CVD Risk: ${preventRisk.tenYearCVDPercentage}
10-Year ASCVD Risk: ${preventRisk.tenYearASCVDPercentage}
10-Year Heart Failure Risk: ${preventRisk.tenYearHFPercentage}
Risk Category: ${preventRisk.riskCategory}
${preventRisk.thirtyYearCVDPercentage ? `30-Year CVD Risk: ${preventRisk.thirtyYearCVDPercentage}` : ''}
${preventRisk.ldlGoal ? `LDL Goal: ${preventRisk.ldlGoal}` : ''}`;
      } else {
        const ascvdRisk = riskResult as ASCVDRiskResult;
        cvRiskSection = `
CARDIOVASCULAR RISK:
10-Year Risk: ${ascvdRisk.riskPercentage}
Category: ${ascvdRisk.riskCategory}
${ascvdRisk.ldlGoal ? `LDL Goal: ${ascvdRisk.ldlGoal}` : ''}`;
      }
    }

    const prompt = `Create a comprehensive personalized wellness plan for a MALE patient based on his lab results. Focus on testosterone optimization, muscle building, cardiovascular health, and male vitality.

ABNORMAL FINDINGS:
${abnormalFindings.length > 0 ? buildFindingsList(abnormalFindings) : 'None'}

BORDERLINE FINDINGS:
${borderlineFindings.length > 0 ? buildFindingsList(borderlineFindings) : 'None'}

RECOMMENDED SUPPLEMENTS:
${supplementsList || 'None specified'}
${cvRiskSection}

KEY LAB VALUES:
- Testosterone: ${labs.testosterone || 'not tested'} ng/dL
- Free Testosterone: ${labs.freeTestosterone || 'not tested'} pg/mL
- Estradiol: ${labs.estradiol || 'not tested'} pg/mL
- Hemoglobin: ${labs.hemoglobin || 'not tested'} g/dL
- Hematocrit: ${labs.hematocrit || 'not tested'}%
- PSA: ${labs.psa || 'not tested'} ng/mL
- Vitamin D: ${labs.vitaminD || 'not tested'} ng/mL
- TSH: ${labs.tsh || 'not tested'} mIU/L
- LDL: ${labs.ldl || 'not tested'} mg/dL
- HDL: ${labs.hdl || 'not tested'} mg/dL
- Triglycerides: ${labs.triglycerides || 'not tested'} mg/dL
- A1c: ${labs.a1c || 'not tested'}%
- hs-CRP: ${labs.hsCRP || 'not tested'} mg/dL

Please generate FOUR separate sections. Each section should be thorough, educational, and actionable for a MALE patient.

SECTION 1 - PERSONALIZED NUTRITION PLAN (400-500 words):
Based on the specific lab findings, structure this section with these three subsections:

GOAL:
Write 2-3 sentences explaining the patient's personalized nutrition goal focused on testosterone optimization, muscle building, and male health. (e.g., "Your goal is to support healthy testosterone production, build lean muscle mass, and optimize cardiovascular health through strategic nutrition.")

DIET:
Recommend a specific named diet approach (e.g., High-Protein Mediterranean, Testosterone-Optimizing, Carnivore-Inspired, Anti-Inflammatory). Explain in 2-3 sentences why this diet supports his specific testosterone and health goals.

FOODS TO EMPHASIZE:
List 6-8 specific foods with explanations of why each food will help THIS male patient. Focus on testosterone-supporting, muscle-building, and heart-healthy foods. Format each as:
Food Name - reason it helps their specific condition

Example format:
- Beef/Red Meat - High in zinc and saturated fat needed for testosterone synthesis
- Eggs - Complete protein with cholesterol for hormone production
- Fatty Fish - Omega-3s reduce inflammation and support heart health
- Cruciferous Vegetables - Help metabolize excess estrogen

SECTION 2 - SUPPLEMENT PROTOCOL (300-400 words):
Based on the recommended supplements and lab findings, provide:
- Each supplement with exact dosing and timing
- When to take each supplement (morning, with food, at bedtime, etc.)
- Expected benefits specific to male health (testosterone, energy, muscle, recovery)
- Tips for optimal absorption
- Format as a clear daily schedule

SECTION 3 - LIFESTYLE RECOMMENDATIONS (300-400 words):
Structure this section with FOUR specific categories optimized for male health:

TRAINING & EXERCISE:
Recommend specific exercise types focusing on compound lifts and strength training. Include workout frequency, types (squats, deadlifts, bench press), and cardio recommendations that support testosterone.

SLEEP & RECOVERY:
Provide sleep optimization strategies critical for testosterone production. Include hours needed, sleep hygiene tips, and recovery practices.

STRESS MANAGEMENT:
Suggest stress reduction techniques for men. High cortisol suppresses testosterone - include specific practices to lower cortisol.

HYDRATION:
Give specific daily water intake goals (in ounces). Include pre/post workout hydration and limiting alcohol for testosterone optimization.

SECTION 4 - EDUCATIONAL CONTENT (300-400 words):
Help the patient understand their results:
- What their key lab values mean for male health
- Why testosterone, hematocrit, and PSA monitoring matters
- How the recommended changes will improve their numbers and how they feel
- What to expect at their next lab check (60-90 days)
- Signs of improvement to watch for (energy, libido, strength, mood)
- When to contact the clinic

IMPORTANT FORMATTING:
- Use clear headers and bullet points
- Write in direct, actionable language for men
- Be specific with numbers, sets/reps, and timing
- Avoid medical jargon - explain everything clearly
- Make it feel personalized to THEIR results
- NO EMOJIS

Respond with exactly four clearly labeled sections:
[DIET PLAN]
(content)

[SUPPLEMENT PROTOCOL]
(content)

[LIFESTYLE RECOMMENDATIONS]
(content)

[EDUCATIONAL CONTENT]
(content)`;

    try {
      console.log('[AI Service] Generating comprehensive MALE patient wellness plan');
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a men's health and testosterone optimization expert at MVP Men's Clinic creating personalized health plans. Write in a direct, motivating, action-oriented tone. Be specific with actionable recommendations focused on testosterone optimization, muscle building, energy, and cardiovascular health. Always connect recommendations back to their specific lab results.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 6000,
      });

      const content = response.choices[0]?.message?.content || '';
      console.log('[AI Service] Male wellness plan generated, length:', content.length);

      const dietMatch = content.match(/\[DIET PLAN\]([\s\S]*?)(?=\[SUPPLEMENT PROTOCOL\]|$)/i);
      const supplementMatch = content.match(/\[SUPPLEMENT PROTOCOL\]([\s\S]*?)(?=\[LIFESTYLE RECOMMENDATIONS\]|$)/i);
      const lifestyleMatch = content.match(/\[LIFESTYLE RECOMMENDATIONS\]([\s\S]*?)(?=\[EDUCATIONAL CONTENT\]|$)/i);
      const educationalMatch = content.match(/\[EDUCATIONAL CONTENT\]([\s\S]*?)$/i);

      return {
        dietPlan: dietMatch?.[1]?.trim() || this.getDefaultMaleDietPlan(),
        supplementProtocol: supplementMatch?.[1]?.trim() || this.getDefaultSupplementProtocol(supplements),
        lifestyleRecommendations: lifestyleMatch?.[1]?.trim() || this.getDefaultMaleLifestyleRecommendations(),
        educationalContent: educationalMatch?.[1]?.trim() || this.getDefaultMaleEducationalContent(),
      };
    } catch (error) {
      console.error("Error generating male patient wellness plan:", error);
      return {
        dietPlan: this.getDefaultMaleDietPlan(),
        supplementProtocol: this.getDefaultSupplementProtocol(supplements),
        lifestyleRecommendations: this.getDefaultMaleLifestyleRecommendations(),
        educationalContent: this.getDefaultMaleEducationalContent(),
      };
    }
  }

  private static getDefaultMaleDietPlan(): string {
    return `Your Personalized Nutrition Plan

GOAL:
Your goal is to support healthy testosterone production, build lean muscle mass, and optimize cardiovascular health through strategic nutrition focused on protein, healthy fats, and nutrient-dense whole foods.

DIET:
We recommend a High-Protein Mediterranean approach that combines testosterone-supporting nutrients with heart-healthy fats. This eating pattern provides the cholesterol and zinc needed for hormone production while reducing inflammation.

FOODS TO EMPHASIZE:
- Beef and Red Meat - Rich in zinc, saturated fat, and complete protein essential for testosterone synthesis
- Eggs (whole) - Complete protein with cholesterol for hormone production and vitamin D
- Fatty Fish (salmon, mackerel) - Omega-3s reduce inflammation and support heart and brain health
- Cruciferous Vegetables (broccoli, cauliflower) - Help metabolize excess estrogen
- Nuts and Seeds (almonds, pumpkin seeds) - Zinc and healthy fats for testosterone support
- Olive Oil - Monounsaturated fats support hormone production
- Berries - Antioxidants protect cells and support cardiovascular health`;
  }

  private static getDefaultMaleLifestyleRecommendations(): string {
    return `Lifestyle Recommendations for Optimal Male Health

TRAINING & EXERCISE:
- Prioritize strength training 3-4x per week focusing on compound movements
- Include squats, deadlifts, bench press, rows, and overhead press
- Keep workouts under 60 minutes to optimize testosterone response
- Add 150+ minutes of moderate cardio weekly (walking, swimming, cycling)
- Allow 48-72 hours recovery between training same muscle groups

SLEEP & RECOVERY:
- Target 7-8 hours of quality sleep nightly - critical for testosterone production
- Keep bedroom cool (65-68°F), dark, and screen-free 1 hour before bed
- Maintain consistent sleep and wake times, even on weekends
- Consider cold showers or contrast therapy for recovery

STRESS MANAGEMENT:
- High cortisol directly suppresses testosterone production
- Practice deep breathing or meditation for 10 minutes daily
- Limit work stress and take regular breaks
- Time in nature and outdoor activities lower cortisol naturally
- Cold exposure (cold showers) can boost resilience

HYDRATION:
- Drink at least 100 oz (3L) of water daily
- Increase intake with exercise - hydration affects workout performance
- Limit alcohol which suppresses testosterone and disrupts sleep
- Avoid excessive caffeine after noon`;
  }

  private static getDefaultMaleEducationalContent(): string {
    return `Understanding Your Results

Your lab tests provide critical insights into your testosterone levels, cardiovascular health, and overall vitality. Here's what to know:

Why These Tests Matter:
- Testosterone: The foundation of male energy, muscle, mood, and libido. Optimal range is 600–1200 ng/dL.
- Hematocrit: Measures red blood cells - important to monitor with testosterone therapy. Target under 54%.
- PSA: Prostate health marker - baseline and monitoring during treatment.
- Vitamin D: Supports testosterone production - optimal 60-80 ng/mL.

What to Expect:
As you implement the nutrition, supplement, and training changes in this report, you may notice improvements in:
- Energy levels: 2-4 weeks
- Mood and motivation: 3-6 weeks
- Strength and muscle gains: 4-8 weeks
- Libido and sexual function: 3-6 weeks
- Lab value improvements: 60-90 days

Your Next Steps:
1. Start implementing one change at a time for sustainable results
2. Prioritize strength training and sleep optimization
3. Schedule your follow-up lab work in 60-90 days
4. Contact MVP Men's Clinic with any questions

We're Here for Your Success:
Our team is dedicated to optimizing your health and vitality. Reach out anytime with questions about your wellness plan.`;
  }

  static async generateTrendNarrative(
    trendData: Array<{
      markerName: string;
      unit: string;
      currentValue: number;
      previousValue: number;
      direction: 'improved' | 'worsened' | 'stable';
      severity: string;
      clinicianInsight: string;
      patientInsight: string;
    }>,
    gender: 'male' | 'female',
    patientName?: string
  ): Promise<{ clinicianNarrative: string; patientNarrative: string }> {
    const notable = trendData.filter(t => t.direction !== 'stable');
    if (notable.length === 0) {
      return {
        clinicianNarrative: 'All tracked markers are stable since the prior visit. No significant interval changes to report.',
        patientNarrative: 'Great news — all of your tracked lab values have remained stable since your last visit. Keep doing what you\'re doing!',
      };
    }

    const improved = notable.filter(t => t.direction === 'improved');
    const worsened = notable.filter(t => t.direction === 'worsened');

    const markerSummary = notable.map(t =>
      `${t.markerName}: ${t.previousValue} → ${t.currentValue} ${t.unit} (${t.direction}, severity: ${t.severity}) — ${t.clinicianInsight}`
    ).join('\n');

    const clinicianPrompt = `You are a clinical specialist reviewing interval lab trends for a ${gender} patient${patientName ? ` named ${patientName}` : ''}.

Interval changes since last visit:
${markerSummary}

Write a concise clinical trend narrative (3-5 sentences) for the provider chart. Include:
- Which markers improved and the clinical significance
- Which markers worsened and recommended actions
- Any patterns across markers (e.g., metabolic cluster, hormonal pattern)
- Specific next steps where indicated
Be direct, clinical, and actionable. Do not use bullet points — write in flowing prose. Do not repeat the numbers already shown in the trend table.`;

    const patientSummary = notable.map(t =>
      `${t.markerName}: ${t.previousValue} → ${t.currentValue} ${t.unit} (${t.direction}) — ${t.patientInsight}`
    ).join('\n');

    const patientPrompt = `You are writing a patient-friendly explanation of their lab trends since their last visit.

Lab changes:
${patientSummary}

Write a warm, encouraging 3-4 sentence explanation for the patient. Include:
- Acknowledge what's improving and why it matters for how they feel
- Explain what needs more work in plain language (no jargon)
- One clear takeaway or encouragement
Write in second person ("your"), be warm but honest, avoid medical jargon. No bullet points.`;

    const [clinicianResp, patientResp] = await Promise.all([
      openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "You are a clinical analyst writing concise lab trend summaries. Always respond with 2-3 sentences of narrative text, nothing else." },
          { role: "user", content: clinicianPrompt },
        ],
      }),
      openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "You are a health coach writing encouraging patient-friendly summaries of lab trends. Always respond with 2-3 sentences, nothing else." },
          { role: "user", content: patientPrompt },
        ],
      }),
    ]);

    return {
      clinicianNarrative: clinicianResp.choices[0]?.message?.content?.trim() || '',
      patientNarrative: patientResp.choices[0]?.message?.content?.trim() || '',
    };
  }

  /**
   * HealthIQ multi-signal coaching insight for the patient portal.
   * Reads the last 7 days of daily check-ins and writes a 2-3 sentence
   * cross-domain pattern observation in a warm coach voice.
   */
  static async generateHealthIQInsight(input: {
    firstName?: string | null;
    gender?: "male" | "female" | string | null;
    checkins: any[];
  }): Promise<string> {
    const { firstName, gender, checkins } = input;

    const summarize = (label: string, vals: any[], unit = "") => {
      const nums = vals.filter((v) => typeof v === "number") as number[];
      if (!nums.length) return `${label}: not logged`;
      const avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
      return `${label}: avg ${avg}${unit} across ${nums.length} day${nums.length === 1 ? "" : "s"}`;
    };
    const countWhere = (label: string, predicate: (c: any) => boolean) => {
      const n = checkins.filter(predicate).length;
      return `${label}: ${n}/${checkins.length} day${checkins.length === 1 ? "" : "s"}`;
    };

    const dataBlock = [
      summarize("Sleep hours", checkins.map((c) => c.sleepHours), "h"),
      summarize("Mood (1–5)", checkins.map((c) => c.moodScore)),
      summarize("Energy (1–5)", checkins.map((c) => c.energyScore)),
      summarize("Brain fog (1–5)", checkins.map((c) => c.brainFogScore)),
      summarize("Anxiety/irritability (1–5)", checkins.map((c) => c.anxietyIrritabilityScore)),
      countWhere("Strong hydration", (c) => c.waterLevel === "strong"),
      countWhere("Strong protein", (c) => c.foodProteinLevel === "strong"),
      countWhere("Movement", (c) => c.exerciseDone === true),
      countWhere("Alcohol", (c) => c.alcoholUse === true),
      countWhere("Night sweats / woke during night", (c) => c.nightSweats === true || c.wokeDuringNight === true),
    ].join("\n");

    const prompt = `Write a short HealthIQ weekly read for ${firstName || "this patient"} (${gender || "unspecified"}). Use only the data below.

DATA (last 7 days):
${dataBlock}

REQUIREMENTS:
- 2-3 sentences, warm coach voice, second person ("you", "your"). No headings, no bullets.
- Connect AT LEAST TWO different signals into a single pattern observation. Example voices we want:
   "Your energy may be dipping from a combination of light sleep, low hydration, and lighter protein this week — pulling those three up a notch tomorrow tends to lift the others with it."
   "Your mood and brain fog scores both crept down on the days you skipped movement and slept under 6 hours, which is a really common combo to see together."
- End with one specific, doable suggestion for tomorrow.
- Never say "the patient." Never use medical jargon. Never list the data back at them — interpret it.`;

    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "You are a warm, pattern-recognizing health coach. Always respond with a single short paragraph (2-3 sentences) that synthesizes multiple signals into one observation, then ends with a concrete suggestion. No markdown, no lists." },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 350,
      });
      const text = resp.choices[0]?.message?.content?.trim() || "";
      return text || "Keep logging your check-ins this week and your AI coach will start spotting cross-signal patterns — sleep with energy, hydration with mood, movement with brain fog — to give you a personalized read.";
    } catch (err) {
      console.error("[AI Service] HealthIQ insight error:", err);
      return "Your weekly insight is taking a moment. Keep logging your check-ins and try again shortly.";
    }
  }
}
