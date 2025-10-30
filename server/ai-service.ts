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
    const prompt = `Generate a patient-friendly summary email for the following lab results from a men's hormone clinic. 

Lab values provided:
${Object.entries(labs).filter(([_, value]) => value !== undefined).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

Key findings:
${interpretations.filter(i => i.status !== 'normal').map(i => 
  `- ${i.category}: ${i.status} - ${i.interpretation}`
).join('\n')}

${hasRedFlags ? '\nNOTE: Some values require physician review before communicating with patient.' : ''}

Guidelines for the summary:
- Use simple, non-technical language
- Be reassuring but honest
- Explain what the results mean for their health
- Mention any necessary next steps (dose changes, lifestyle modifications, follow-up timing)
- Keep it concise (250-400 words)
- Use a warm, professional tone
- Start with overall assessment, then specific findings
- End with clear next steps

Write the patient summary:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a compassionate healthcare communicator helping to explain lab results to patients in a clear, reassuring way."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 1000,
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
