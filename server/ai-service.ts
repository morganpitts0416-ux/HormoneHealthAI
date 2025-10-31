// AI Service for generating clinical recommendations using OpenAI
// Using Replit AI Integrations (blueprint:javascript_openai_ai_integrations)

import OpenAI from "openai";
import type { LabValues, RedFlag, LabInterpretation } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export class AIService {
  /**
   * Generate comprehensive AI-powered clinical recommendations
   */
  static async generateRecommendations(
    labs: LabValues,
    redFlags: RedFlag[],
    interpretations: LabInterpretation[]
  ): Promise<string> {
    const prompt = this.buildRecommendationPrompt(labs, redFlags, interpretations);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are a clinical decision support assistant for a men's hormone and primary care clinic. Your role is to synthesize lab findings and provide clear, actionable recommendations to clinic staff based on established clinical protocols.

Guidelines:
- Be concise and clinically focused
- Prioritize patient safety
- Reference specific lab values in your recommendations
- Organize recommendations by priority (critical → routine)
- Use professional medical language appropriate for clinic staff
- Do not diagnose - provide clinical guidance for staff review
- Highlight any dose adjustments, follow-up timing, and lifestyle interventions`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 2000,
      });

      return response.choices[0]?.message?.content || "Unable to generate recommendations. Please review lab findings manually.";
    } catch (error) {
      console.error("Error generating AI recommendations:", error);
      return "AI recommendations temporarily unavailable. Please apply clinical protocols manually based on the lab interpretations provided.";
    }
  }

  /**
   * Generate patient-friendly summary for communication
   */
  static async generatePatientSummary(
    labs: LabValues,
    interpretations: LabInterpretation[],
    hasRedFlags: boolean
  ): Promise<string> {
    // Build a detailed context with actual lab values
    const labContext = Object.entries(labs)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    // Categorize findings
    const abnormalFindings = interpretations.filter(i => i.status === 'abnormal' || i.status === 'critical');
    const borderlineFindings = interpretations.filter(i => i.status === 'borderline');
    const normalFindings = interpretations.filter(i => i.status === 'normal');

    const prompt = `Create a personalized, informative patient communication summary for lab results from a men's hormone clinic.

ACTUAL LAB VALUES:
${labContext}

CLINICAL INTERPRETATIONS:
${abnormalFindings.length > 0 ? `\nAreas Needing Attention:\n${abnormalFindings.map(i => 
  `- ${i.category}: ${i.value} ${i.unit} - ${i.interpretation}`
).join('\n')}` : ''}

${borderlineFindings.length > 0 ? `\nBorderline Results:\n${borderlineFindings.map(i => 
  `- ${i.category}: ${i.value} ${i.unit} - ${i.interpretation}`
).join('\n')}` : ''}

${normalFindings.length > 0 ? `\nHealthy Results:\n${normalFindings.map(i => 
  `- ${i.category}: ${i.value} ${i.unit}`
).join('\n')}` : ''}

${hasRedFlags ? '\nIMPORTANT: Include a note that the physician will personally review critical findings before any changes.' : ''}

CRITICAL REQUIREMENTS FOR THE SUMMARY:
1. Reference SPECIFIC lab values (e.g., "Your LDL cholesterol is 145 mg/dL" not just "Your cholesterol is elevated")
2. Provide PERSONALIZED, ACTIONABLE lifestyle recommendations based on their actual results:
   - If cholesterol is elevated: Specific dietary changes (e.g., increase fiber, reduce saturated fat, add omega-3s)
   - If blood pressure/metabolic markers affected: Exercise recommendations with specifics
   - If liver markers elevated: Alcohol/supplement guidance
   - If kidney markers affected: Hydration and diet tips
   - If testosterone suboptimal: Lifestyle factors that affect testosterone
3. Make recommendations PRACTICAL and SPECIFIC (not vague like "eat healthy" but "add 2-3 servings of fatty fish per week")
4. Avoid repetitive phrasing - each section should add new, useful information
5. Make it encouraging and empowering about improvements they can make
6. Use simple language but be informative and specific
7. Structure: Brief greeting → Highlight positive findings → Address areas for improvement with SPECIFIC values and actions → Clear next steps
8. Length: 300-450 words (enough to be informative without overwhelming)

Write a patient-friendly summary that treats the patient as an active participant in their health with actionable steps they can take TODAY:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are a compassionate healthcare communicator specializing in patient education and empowerment. Your summaries help patients understand their specific lab results and take actionable steps to improve their health.

Key principles:
- Always reference specific lab values, not vague generalizations
- Provide concrete, practical lifestyle recommendations tailored to their results
- Be encouraging about what they can control and improve
- Use clear, simple language while being informative
- Make every sentence add value - avoid repetitive phrasing
- Focus on actionable steps they can take immediately`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 1200,
      });

      return response.choices[0]?.message?.content || this.getDefaultPatientSummary();
    } catch (error) {
      console.error("Error generating patient summary:", error);
      return this.getDefaultPatientSummary();
    }
  }

  private static buildRecommendationPrompt(
    labs: LabValues,
    redFlags: RedFlag[],
    interpretations: LabInterpretation[]
  ): string {
    let prompt = "Analyze these lab results from a men's hormone clinic patient and provide synthesized clinical recommendations:\n\n";

    // Add red flags if any
    if (redFlags.length > 0) {
      prompt += "🚨 RED FLAGS (Physician Notification Required):\n";
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
    return `Dear Patient,

We have reviewed your recent lab results from your men's health panel. Your labs help us keep your testosterone therapy safe and effective while monitoring your overall health.

Your Results:
We've carefully reviewed all your lab values including blood counts, hormone levels, cholesterol, liver and kidney function, and other important markers.

Next Steps:
Your healthcare provider will review these results and contact you if any changes to your treatment plan are needed. We monitor these labs to ensure optimal testosterone levels while keeping your blood counts, cholesterol, liver, kidney, and prostate health in the safest range possible.

If you have any questions about your results, please don't hesitate to contact our clinic.

Thank you for trusting us with your care.`;
  }
}
