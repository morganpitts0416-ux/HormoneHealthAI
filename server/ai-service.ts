// AI Service for generating clinical recommendations using OpenAI
// Using Replit AI Integrations (blueprint:javascript_openai_ai_integrations)

import OpenAI from "openai";
import type { LabValues, RedFlag, LabInterpretation } from "@shared/schema";

// Using gpt-5-mini for faster responses - smaller model but still capable
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
      console.log('[AI Service] Generating AI recommendations with prompt length:', prompt.length);
      console.log('[AI Service] Red flags count:', redFlags.length);
      console.log('[AI Service] Interpretations count:', interpretations.length);
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
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
        max_completion_tokens: 4000,
      });

      const recommendations = response.choices[0]?.message?.content;
      console.log('[AI Service] AI recommendations generated, length:', recommendations?.length || 0);
      
      return recommendations || "Unable to generate recommendations. Please review lab findings manually.";
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
    labs: LabValues,
    interpretations: LabInterpretation[],
    hasRedFlags: boolean
  ): Promise<string> {
    // Categorize findings
    const abnormalFindings = interpretations.filter(i => i.status === 'abnormal' || i.status === 'critical');
    const borderlineFindings = interpretations.filter(i => i.status === 'borderline');
    const normalFindings = interpretations.filter(i => i.status === 'normal');

    // Build specific findings with values
    const buildFindingsList = (findings: LabInterpretation[]) => {
      return findings.map(f => `${f.category}: ${f.value} ${f.unit} (${f.interpretation})`).join('\n');
    };

    const prompt = `Write a patient communication summary for these lab results. Use SPECIFIC values and ACTIONABLE recommendations.

CRITICAL FINDINGS:
${abnormalFindings.length > 0 ? buildFindingsList(abnormalFindings) : 'None'}

BORDERLINE FINDINGS:
${borderlineFindings.length > 0 ? buildFindingsList(borderlineFindings) : 'None'}

NORMAL FINDINGS:
${normalFindings.length > 0 ? buildFindingsList(normalFindings) : 'None'}

${hasRedFlags ? 'NOTE: Critical values require physician review before changes.\n' : ''}

MANDATORY REQUIREMENTS:
1. ALWAYS mention specific numeric values (e.g., "Your LDL cholesterol is 160 mg/dL" NOT "Your cholesterol is high")
2. Give CONCRETE lifestyle actions based on actual results:
   
   FOR CHOLESTEROL (if LDL >130 or HDL <40 or TG >150):
   - "Add 25-30g fiber daily: oatmeal for breakfast, beans with lunch, vegetables at dinner"
   - "Include 2-3 servings fatty fish weekly (salmon, mackerel, sardines) for omega-3s"
   - "Reduce saturated fat: choose lean meats, limit butter and cheese"
   - "Daily exercise: 30 minutes brisk walking or equivalent"
   
   FOR BLOOD SUGAR (if A1c >5.6):
   - "Reduce refined carbs: swap white bread for whole grain, limit sugary drinks"
   - "Include protein with each meal to stabilize blood sugar"
   - "Walk 10-15 minutes after meals"
   
   FOR LIVER MARKERS (if AST/ALT elevated):
   - "Limit alcohol to <2 drinks per week"
   - "Review supplements/medications that may stress liver"
   - "Maintain healthy weight through balanced diet"
   
   FOR TESTOSTERONE (if suboptimal):
   - "Prioritize 7-8 hours quality sleep"
   - "Include strength training 2-3x weekly"
   - "Manage stress through exercise, meditation, or hobbies"

3. Structure (300-400 words):
   - Greeting + overall assessment
   - Positive findings (be specific about normal values)
   - Areas to improve (cite exact values + concrete actions)
   - Next steps and timeline
   
4. Use encouraging, empowering tone
5. Avoid medical jargon - explain in plain English

Write the summary now:`;

    try {
      console.log('[AI Service] Generating patient summary with prompt length:', prompt.length);
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are writing a patient-friendly lab results summary for a men's health clinic. Always mention specific numeric values and give concrete, actionable lifestyle recommendations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 2500,
      });

      console.log('[AI Service] Response object:', JSON.stringify(response, null, 2));
      console.log('[AI Service] Choices array:', response.choices);
      console.log('[AI Service] First choice:', response.choices[0]);
      
      const summary = response.choices[0]?.message?.content;
      console.log('[AI Service] Patient summary generated, length:', summary?.length || 0);
      console.log('[AI Service] Patient summary content:', summary);
      
      return summary || this.getDefaultPatientSummary();
    } catch (error) {
      console.error("Error generating patient summary:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
      }
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
