import type { LabValues, PatientDemographics } from "@shared/schema";

export interface StopBangResult {
  score: number;
  riskCategory: 'low' | 'intermediate' | 'high';
  riskDescription: string;
  recommendations: string;
  clinicalGuidance: string;
}

/**
 * STOP-BANG Sleep Apnea Screening Calculator
 * 
 * STOP-BANG is a validated screening tool for obstructive sleep apnea (OSA)
 * with 8 yes/no questions. Each "yes" = 1 point.
 * 
 * Risk Stratification:
 * - Low Risk: 0-2 points (6.7% probability of moderate-severe OSA)
 * - Intermediate Risk: 3-4 points (25% probability)
 * - High Risk: 5-8 points (54% probability)
 * 
 * STOP-BANG Components:
 * S - Snoring (loud enough to be heard through closed door)
 * T - Tiredness (daytime sleepiness, fatigue)
 * O - Observed apnea (witnessed breathing pauses during sleep)
 * P - Pressure (high blood pressure, BP ≥140/90 or on treatment)
 * B - BMI >35 kg/m²
 * A - Age >50 years
 * N - Neck circumference >40cm (16 inches)
 * G - Gender (male)
 */
export class StopBangCalculator {
  static calculateRisk(labs: LabValues): StopBangResult | null {
    const demographics = labs.demographics;
    
    // Require at least some demographics data
    if (!demographics) {
      return null;
    }

    // Calculate STOP-BANG score (0-8 points)
    let score = 0;
    
    // S - Snoring
    if (demographics.snoring) score++;
    
    // T - Tiredness (daytime sleepiness)
    if (demographics.tiredness) score++;
    
    // O - Observed apnea
    if (demographics.observedApnea) score++;
    
    // P - Pressure (hypertension: BP ≥140 systolic OR on BP meds)
    const hasHypertension = demographics.onBPMeds || 
                           (demographics.systolicBP !== undefined && demographics.systolicBP >= 140);
    if (hasHypertension) score++;
    
    // B - BMI >35
    if (demographics.bmiOver35) score++;
    
    // A - Age >50
    if (demographics.age !== undefined && demographics.age > 50) score++;
    
    // N - Neck circumference >40cm
    if (demographics.neckCircOver40cm) score++;
    
    // G - Gender (male)
    if (demographics.sex === 'male') score++;

    // Determine risk category
    let riskCategory: 'low' | 'intermediate' | 'high';
    let riskDescription: string;
    let recommendations: string;
    let clinicalGuidance: string;

    if (score <= 2) {
      riskCategory = 'low';
      riskDescription = `LOW RISK for obstructive sleep apnea (${score}/8 points)`;
      recommendations = 'Low probability of moderate-severe OSA. Continue routine monitoring. Consider sleep study if persistent symptoms of excessive daytime sleepiness, loud snoring, or cardiovascular risk factors.';
      clinicalGuidance = 'Reassess annually or if symptoms develop. Patient education on sleep hygiene recommended.';
    } else if (score <= 4) {
      riskCategory = 'intermediate';
      riskDescription = `INTERMEDIATE RISK for obstructive sleep apnea (${score}/8 points)`;
      recommendations = 'Moderate probability of OSA. Consider home sleep apnea test (HSAT) or in-lab polysomnography, especially if on TRT or elevated hematocrit. Screen for cardiovascular complications.';
      clinicalGuidance = 'Clinical correlation recommended. Consider sleep study referral if patient has erythrocytosis, hypertension, or is on testosterone replacement therapy.';
    } else {
      riskCategory = 'high';
      riskDescription = `HIGH RISK for obstructive sleep apnea (${score}/8 points)`;
      recommendations = 'High probability of moderate-severe OSA. STRONGLY RECOMMEND sleep study (polysomnography or HSAT). Evaluate for CPAP therapy. Address cardiovascular risk factors. Consider holding or reducing TRT dose if elevated hematocrit.';
      clinicalGuidance = 'PRIORITY: Sleep study referral indicated. Untreated OSA increases cardiovascular risk and can cause secondary erythrocytosis. Reassess TRT dosing if Hct ≥52%.';
    }

    return {
      score,
      riskCategory,
      riskDescription,
      recommendations,
      clinicalGuidance,
    };
  }

  /**
   * Get user-friendly explanation of STOP-BANG components
   */
  static getComponentDetails(): string {
    return `
STOP-BANG Sleep Apnea Screening Components:
• S - Snoring (loud, disruptive)
• T - Tiredness (excessive daytime sleepiness)
• O - Observed apnea (witnessed breathing pauses)
• P - Pressure (high blood pressure ≥140/90 or on meds)
• B - BMI >35 kg/m²
• A - Age >50 years
• N - Neck circumference >40cm (16 inches)
• G - Gender (male)

Each "yes" = 1 point. Total score 0-8.
    `.trim();
  }
}
