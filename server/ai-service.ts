// AI Service for generating clinical recommendations using OpenAI
// Using Replit AI Integrations (blueprint:javascript_openai_ai_integrations)

import OpenAI from "openai";
import type { LabValues, FemaleLabValues, RedFlag, LabInterpretation, ASCVDRiskResult, PREVENTRiskResult } from "@shared/schema";

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
    labs: LabValues | FemaleLabValues,
    redFlags: RedFlag[],
    interpretations: LabInterpretation[],
    gender: 'male' | 'female' = 'male'
  ): Promise<string> {
    const prompt = this.buildRecommendationPrompt(labs, redFlags, interpretations, gender);
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
- Format as clear bullet points or numbered list`
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
    labs: LabValues | FemaleLabValues,
    interpretations: LabInterpretation[],
    hasRedFlags: boolean,
    riskResult?: ASCVDRiskResult | PREVENTRiskResult | null,
    gender: 'male' | 'female' = 'male'
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

    const prompt = `Write a patient communication summary for these lab results. Use SPECIFIC values and ACTIONABLE recommendations.

CRITICAL FINDINGS:
${abnormalFindings.length > 0 ? buildFindingsList(abnormalFindings) : 'None'}

BORDERLINE FINDINGS:
${borderlineFindings.length > 0 ? buildFindingsList(borderlineFindings) : 'None'}

NORMAL FINDINGS:
${normalFindings.length > 0 ? buildFindingsList(normalFindings) : 'None'}
${cvRiskSection}
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
   
   FOR CARDIOVASCULAR RISK (if ASCVD risk is present):
   
   IF BORDERLINE RISK (5-7.4%):
   - "Aim for 150 minutes moderate aerobic activity weekly: brisk walking, cycling, or swimming"
   - "Mediterranean diet: emphasize vegetables, whole grains, olive oil, fish, nuts"
   - "Limit processed foods and added sugars"
   - "Target LDL based on your specific goal mentioned above"
   
   IF INTERMEDIATE RISK (7.5-19.9%):
   - "Increase to 200-300 minutes aerobic exercise weekly plus strength training 2x/week"
   - "Focus on heart-healthy fats: avocados, nuts, olive oil, fatty fish 3x weekly"
   - "Reduce sodium to <2,300mg daily: avoid processed foods, choose fresh ingredients"
   - "Strongly consider quitting smoking if applicable - reduces risk by 50% within 1 year"
   - "Work toward LDL goal through diet changes and discuss statin therapy with your provider"
   
   IF HIGH RISK (≥20%):
   - "Daily exercise is critical: 30-60 minutes moderate activity most days of the week"
   - "Strict Mediterranean or DASH diet - consult with provider about nutrition counseling"
   - "If smoking: Quit immediately - single most important action to reduce heart attack risk"
   - "Achieve and maintain healthy weight (BMI <25)"
   - "Stress management: proven techniques like meditation, yoga, or cardiac rehab programs"
   - "Medication adherence is essential - discuss statin therapy and blood pressure control with provider"

3. If ASCVD risk is included, ALWAYS incorporate the cardiovascular lifestyle modifications above based on risk category. Be specific about the risk percentage and explain what it means in plain English.

4. Start with: "Here is a copy of your recent lab results, along with the recommendations."

4. Structure (300-400 words):
   - Opening sentence (required): "Here is a copy of your recent lab results, along with the recommendations."
   - Overall assessment in plain language
   - Positive findings (be specific about normal values)
   - Areas to improve (cite exact values + concrete actions)
   - Next steps and timeline
   
4. Use encouraging, empowering tone
5. Avoid medical jargon - explain in plain English

Write the summary now:`;

    try {
      console.log('[AI Service] Generating patient summary with prompt length:', prompt.length);
      console.log('[AI Service] Gender context:', gender);
      
      const clinicType = gender === 'female' ? "women's health clinic" : "men's health clinic";
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are writing a patient-friendly lab results summary for a ${clinicType}. Always mention specific numeric values and give concrete, actionable lifestyle recommendations.${gender === 'female' ? ' Consider menstrual cycle phase when discussing hormone results. Address female-specific health concerns like iron status, thyroid function, and bone health.' : ''}`
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
    labs: LabValues | FemaleLabValues,
    redFlags: RedFlag[],
    interpretations: LabInterpretation[],
    gender: 'male' | 'female' = 'male'
  ): string {
    const patientType = gender === 'female' ? "women's hormone clinic patient" : "men's hormone clinic patient";
    let prompt = `Analyze these lab results from a ${patientType} and provide synthesized clinical recommendations:\n\n`;

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
    return `Dear Patient,

We have reviewed your recent lab results from your men's health panel. Your labs help us keep your testosterone therapy safe and effective while monitoring your overall health.

Your Results:
We've carefully reviewed all your lab values including blood counts, hormone levels, cholesterol, liver and kidney function, and other important markers.

Next Steps:
Your healthcare provider will review these results and contact you if any changes to your treatment plan are needed. We monitor these labs to ensure optimal testosterone levels while keeping your blood counts, cholesterol, liver, kidney, and prostate health in the safest range possible.

If you have any questions about your results, please don't hesitate to contact our clinic.

Thank you for trusting us with your care.`;
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
- Testosterone: The foundation of male energy, muscle, mood, and libido. Optimal range is 700-1100 ng/dL.
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
}
