// Clinical Logic Engine based on Men's Clinic Standing Orders
// Reference: attached_assets/Mens_Clinic_Lab_Standing_Orders (1)_1761860457332.pdf

import type { LabValues, RedFlag, LabInterpretation } from "@shared/schema";

// Upper Limit Normal (ULN) values - typical reference ranges
const ULN = {
  AST: 40, // U/L
  ALT: 40, // U/L
};

export class ClinicalLogicEngine {
  /**
   * Analyze lab values and detect red flags requiring physician notification
   */
  static detectRedFlags(labs: LabValues): RedFlag[] {
    const redFlags: RedFlag[] = [];

    // 1. Hematocrit/Hemoglobin - Critical for erythrocytosis
    if (labs.hematocrit !== undefined && labs.hematocrit >= 54) {
      redFlags.push({
        category: "Erythrocytosis - Critical Hematocrit",
        severity: 'critical',
        message: `Hematocrit is ${labs.hematocrit}% (≥54% threshold). Immediate action required for hyperviscosity risk.`,
        action: "HOLD TRT and perform therapeutic phlebotomy (or arrange blood donation if eligible). Evaluate for hypoxia/OSA. Once Hct is back in safe range, restart at lower dose or different route (e.g., transdermal).",
      });
    } else if (labs.hematocrit !== undefined && labs.hematocrit >= 52 && labs.hematocrit < 54) {
      redFlags.push({
        category: "Erythrocytosis - High Hematocrit (52-53.9%)",
        severity: 'urgent',
        message: `Hematocrit is ${labs.hematocrit}% (52-53.9% range). DO NOT escalate TRT.`,
        action: "Reduce dose/extend interval or change formulation. Treat contributing factors (OSA, smoking). Recheck in 2-4 weeks. If trending upward despite adjustments, plan phlebotomy/donation.",
      });
    } else if (labs.hematocrit !== undefined && labs.hematocrit >= 50 && labs.hematocrit < 52) {
      redFlags.push({
        category: "Erythrocytosis - Elevated Hematocrit (50-52%)",
        severity: 'warning',
        message: `Hematocrit is ${labs.hematocrit}% (50-52% range). Preventive measures needed.`,
        action: "Re-check hydration status. Draw labs mid-interval (avoid post-injection peaks). Lower dose or split injections weekly, or switch to transdermal (lower erythrocytosis risk). Screen for OSA and other causes. Recheck CBC in 4-8 weeks.",
      });
    }

    if (labs.hemoglobin !== undefined && labs.hemoglobin >= 18.5) {
      redFlags.push({
        category: "Erythrocytosis - Critical Hemoglobin",
        severity: 'critical',
        message: `Hemoglobin is ${labs.hemoglobin} g/dL (≥18.5 threshold).`,
        action: "HOLD or REDUCE testosterone. Consider therapeutic phlebotomy.",
      });
    }

    // 2. Liver Enzymes - Severe elevation
    if (labs.ast !== undefined && labs.ast > 5 * ULN.AST) {
      redFlags.push({
        category: "Liver Function - Severe AST Elevation",
        severity: 'critical',
        message: `AST is ${labs.ast} U/L (>5× ULN at ${5 * ULN.AST}).`,
        action: "URGENT evaluation required. HOLD testosterone pending workup.",
      });
    }

    if (labs.alt !== undefined && labs.alt > 5 * ULN.ALT) {
      redFlags.push({
        category: "Liver Function - Severe ALT Elevation",
        severity: 'critical',
        message: `ALT is ${labs.alt} U/L (>5× ULN at ${5 * ULN.ALT}).`,
        action: "URGENT evaluation required. HOLD testosterone pending workup.",
      });
    }

    // 3. Bilirubin
    if (labs.bilirubin !== undefined && labs.bilirubin > 2.0) {
      redFlags.push({
        category: "Liver Function - Elevated Bilirubin",
        severity: 'critical',
        message: `Total bilirubin is ${labs.bilirubin} mg/dL (>2.0 threshold).`,
        action: "URGENT hepatic evaluation. HOLD testosterone.",
      });
    }

    // 4. Kidney Function - eGFR
    if (labs.egfr !== undefined && labs.egfr < 45) {
      redFlags.push({
        category: "Kidney Function - Decreased eGFR",
        severity: 'critical',
        message: `eGFR is ${labs.egfr} mL/min (<45 threshold).`,
        action: "Provider review required. Possible nephrology referral needed.",
      });
    }

    // 5. PSA - Absolute value and velocity
    if (labs.psa !== undefined && labs.psa > 4.0) {
      redFlags.push({
        category: "PSA - Elevated Absolute Value",
        severity: 'urgent',
        message: `PSA is ${labs.psa} ng/mL (>4.0 threshold).`,
        action: "Flag provider for urology evaluation. Consider DRE and age/risk assessment.",
      });
    }

    // PSA Velocity calculation
    if (
      labs.psa !== undefined &&
      labs.previousPsa !== undefined &&
      labs.monthsSinceLastPsa !== undefined &&
      labs.monthsSinceLastPsa > 0
    ) {
      const psaChange = labs.psa - labs.previousPsa;
      const annualizedChange = (psaChange / labs.monthsSinceLastPsa) * 12;

      if (annualizedChange > 1.4) {
        redFlags.push({
          category: "PSA - Rapid Velocity",
          severity: 'critical',
          message: `PSA increased ${psaChange.toFixed(2)} ng/mL over ${labs.monthsSinceLastPsa} months (${annualizedChange.toFixed(2)} ng/mL/year). Velocity >1.4 ng/mL/year.`,
          action: "IMMEDIATE provider notification. Urology referral likely needed.",
        });
      }
    }

    // 6. Lipids - Flag for provider review
    if (labs.ldl !== undefined && labs.ldl >= 190) {
      redFlags.push({
        category: "Lipids - Severe LDL Elevation",
        severity: 'warning',
        message: `LDL is ${labs.ldl} mg/dL (≥190 threshold).`,
        action: "Flag provider for consideration of statin therapy. Intensive lifestyle counseling.",
      });
    }

    if (labs.triglycerides !== undefined && labs.triglycerides >= 500) {
      redFlags.push({
        category: "Lipids - Severe Triglyceride Elevation",
        severity: 'warning',
        message: `Triglycerides are ${labs.triglycerides} mg/dL (≥500 threshold).`,
        action: "Flag provider for pancreatitis risk. Consider fibrate therapy.",
      });
    }

    // 7. Glucose/A1c - Diabetes detection
    if (labs.glucose !== undefined && labs.glucose >= 126) {
      redFlags.push({
        category: "Glucose - Diabetes Range",
        severity: 'urgent',
        message: `Fasting glucose is ${labs.glucose} mg/dL (≥126 diabetes threshold).`,
        action: "Confirm with repeat testing or A1c. Initiate diabetes management plan.",
      });
    }

    if (labs.a1c !== undefined && labs.a1c >= 6.5) {
      redFlags.push({
        category: "A1c - Diabetes Diagnosis",
        severity: 'urgent',
        message: `Hemoglobin A1c is ${labs.a1c}% (≥6.5% diabetes threshold).`,
        action: "Diabetes diagnosis confirmed. Initiate comprehensive diabetes management. Provider review required.",
      });
    }

    // 8. Electrolyte Imbalances
    if (labs.potassium !== undefined && labs.potassium > 5.5) {
      redFlags.push({
        category: "Electrolytes - Critical Hyperkalemia",
        severity: 'critical',
        message: `Potassium is ${labs.potassium} mEq/L (>5.5 critical threshold).`,
        action: "URGENT: Rule out hemolysis. If confirmed, check ECG, discontinue K-sparing agents, consider urgent treatment.",
      });
    }

    if (labs.potassium !== undefined && labs.potassium < 3.0) {
      redFlags.push({
        category: "Electrolytes - Severe Hypokalemia",
        severity: 'urgent',
        message: `Potassium is ${labs.potassium} mEq/L (<3.0 threshold).`,
        action: "Potassium replacement needed urgently. Monitor ECG. Evaluate for cause.",
      });
    }

    if (labs.sodium !== undefined && (labs.sodium < 133 || labs.sodium > 145)) {
      const type = labs.sodium < 133 ? 'Hyponatremia' : 'Hypernatremia';
      redFlags.push({
        category: `Electrolytes - ${type}`,
        severity: 'urgent',
        message: `Sodium is ${labs.sodium} mEq/L (normal 136-145).`,
        action: `Evaluate cause and manage ${type.toLowerCase()}. May require specialist input if severe.`,
      });
    }

    // 9. CBC Abnormalities
    if (labs.wbc !== undefined && labs.wbc < 3.5) {
      redFlags.push({
        category: "CBC - Leukopenia",
        severity: 'warning',
        message: `WBC count is ${labs.wbc} K/μL (<3.5 threshold).`,
        action: "Evaluate for bone marrow suppression, medication effects, or autoimmune causes.",
      });
    }

    if (labs.platelets !== undefined && labs.platelets < 100) {
      redFlags.push({
        category: "CBC - Thrombocytopenia",
        severity: 'warning',
        message: `Platelet count is ${labs.platelets} K/μL (<100 threshold).`,
        action: "Evaluate for causes. Monitor for bleeding risk. Consider hematology consultation.",
      });
    }

    return redFlags;
  }

  /**
   * Generate detailed interpretations for each lab value
   */
  static interpretLabValues(labs: LabValues): LabInterpretation[] {
    const interpretations: LabInterpretation[] = [];

    // Hemoglobin
    if (labs.hemoglobin !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.hemoglobin >= 18.5) {
        status = 'critical';
        interpretation = 'Critically elevated hemoglobin indicating severe erythrocytosis.';
        recommendation = 'HOLD or reduce testosterone dose 20-30%. Therapeutic phlebotomy indicated.';
        recheckTiming = '4-8 weeks';
      } else if (labs.hemoglobin >= 17.5) {
        status = 'abnormal';
        interpretation = 'Elevated hemoglobin suggesting erythrocytosis.';
        recommendation = 'Reduce testosterone dose 10-20%. Monitor closely.';
        recheckTiming = '6-8 weeks';
      } else if (labs.hemoglobin >= 13.5 && labs.hemoglobin < 17.5) {
        status = 'normal';
        interpretation = 'Hemoglobin within normal range for adult males.';
        recommendation = 'Continue current testosterone regimen.';
      } else {
        status = 'abnormal';
        interpretation = 'Low hemoglobin may indicate anemia.';
        recommendation = 'Evaluate for iron deficiency or other causes of anemia.';
        recheckTiming = '4-6 weeks';
      }

      interpretations.push({
        category: 'Hemoglobin',
        value: labs.hemoglobin,
        unit: 'g/dL',
        status,
        referenceRange: '13.5-17.5 g/dL',
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // Hematocrit
    if (labs.hematocrit !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.hematocrit >= 54) {
        status = 'critical';
        interpretation = 'Critical hematocrit (≥54%). Hyperviscosity risk with potential for headache, dizziness, vision changes.';
        recommendation = 'HOLD TRT. Therapeutic phlebotomy or blood donation required. Evaluate for hypoxia/OSA. Restart at lower dose or transdermal route once safe.';
        recheckTiming = 'After phlebotomy, then 2-4 weeks';
      } else if (labs.hematocrit >= 52 && labs.hematocrit < 54) {
        status = 'abnormal';
        interpretation = 'Hematocrit 52-53.9%. DO NOT escalate TRT. High risk zone.';
        recommendation = 'Reduce dose/extend interval or change formulation (transdermal has lower erythrocytosis risk). Treat OSA/smoking. Plan phlebotomy if trending up.';
        recheckTiming = '2-4 weeks';
      } else if (labs.hematocrit >= 50 && labs.hematocrit < 52) {
        status = 'borderline';
        interpretation = 'Hematocrit 50-52%. Elevated but manageable with interventions.';
        recommendation = 'Re-check hydration. Draw labs mid-interval (avoid post-injection peaks). Lower dose, split weekly injections, or switch to transdermal. Screen for OSA.';
        recheckTiming = '4-8 weeks';
      } else if (labs.hematocrit >= 38 && labs.hematocrit < 50) {
        status = 'normal';
        interpretation = 'Hematocrit <50%. Within safe range for TRT continuation.';
        recommendation = 'Continue TRT with routine monitoring per protocol.';
        recheckTiming = 'Per standard monitoring schedule';
      } else {
        status = 'abnormal';
        interpretation = 'Low hematocrit (<38%). May indicate anemia or hemodilution.';
        recommendation = 'Evaluate for underlying causes (iron deficiency, chronic disease, recent blood loss).';
        recheckTiming = '4-6 weeks';
      }

      interpretations.push({
        category: 'Hematocrit',
        value: labs.hematocrit,
        unit: '%',
        status,
        referenceRange: '<50% (target), 50-52% (caution), 52-54% (high risk), ≥54% (critical)',
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // Testosterone
    if (labs.testosterone !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.testosterone > 900) {
        status = 'abnormal';
        interpretation = 'Testosterone trough significantly above target range.';
        recommendation = 'Lower dose 10-20% or lengthen injection interval to avoid supraphysiologic levels.';
        recheckTiming = '8 weeks';
      } else if (labs.testosterone >= 700 && labs.testosterone <= 900) {
        status = 'borderline';
        interpretation = 'Testosterone trough at upper end of target. Consider if symptomatic (anxiety, irritability, acne).';
        recommendation = 'If asymptomatic, maintain dose. If symptomatic, reduce 10%.';
        recheckTiming = '8-12 weeks';
      } else if (labs.testosterone >= 400 && labs.testosterone < 700) {
        status = 'normal';
        interpretation = 'Testosterone trough in optimal range (400-700 ng/dL).';
        recommendation = 'Maintain current dose if patient reports symptom relief.';
      } else if (labs.testosterone >= 300 && labs.testosterone < 400) {
        status = 'borderline';
        interpretation = 'Testosterone trough below target but may be adequate if asymptomatic.';
        recommendation = 'If symptomatic (fatigue, low libido), increase dose 20-30%.';
        recheckTiming = '8-12 weeks';
      } else {
        status = 'abnormal';
        interpretation = 'Testosterone trough suboptimal (<350 ng/dL).';
        recommendation = 'Increase dose 20-30% if symptomatic. Verify timing of trough draw.';
        recheckTiming = '8-12 weeks';
      }

      interpretations.push({
        category: 'Testosterone (Total)',
        value: labs.testosterone,
        unit: 'ng/dL',
        status,
        referenceRange: '400-700 ng/dL (trough target)',
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // Estradiol
    if (labs.estradiol !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.estradiol > 60) {
        status = 'borderline';
        interpretation = 'Estradiol elevated (>60 pg/mL). Address only if symptomatic.';
        recommendation = 'If patient has gynecomastia, water retention, or mood issues, consider aromatase inhibitor or dose adjustment. If asymptomatic, monitor.';
      } else if (labs.estradiol >= 20 && labs.estradiol <= 60) {
        status = 'normal';
        interpretation = 'Estradiol within expected range for men on TRT.';
        recommendation = 'No intervention needed. Estradiol is beneficial for bone and cardiovascular health.';
      } else {
        status = 'borderline';
        interpretation = 'Estradiol low (<20 pg/mL). Low estradiol can affect libido and bone health.';
        recommendation = 'Monitor. Low E2 may indicate need to increase testosterone dose or address over-aromatization blockade.';
      }

      interpretations.push({
        category: 'Estradiol',
        value: labs.estradiol,
        unit: 'pg/mL',
        status,
        referenceRange: '20-60 pg/mL',
        interpretation,
        recommendation,
      });
    }

    // AST
    if (labs.ast !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.ast > 5 * ULN.AST) {
        status = 'critical';
        interpretation = `Severe AST elevation (>5× ULN at ${5 * ULN.AST} U/L).`;
        recommendation = 'URGENT evaluation. HOLD testosterone. Rule out hepatotoxicity, viral hepatitis, NAFLD.';
        recheckTiming = '1-2 weeks';
      } else if (labs.ast >= 2 * ULN.AST && labs.ast <= 5 * ULN.AST) {
        status = 'abnormal';
        interpretation = `Moderate AST elevation (2-5× ULN).`;
        recommendation = 'Hold hepatotoxins. Evaluate for NAFLD/viral hepatitis. Consider imaging.';
        recheckTiming = '1-2 weeks';
      } else if (labs.ast > ULN.AST && labs.ast < 2 * ULN.AST) {
        status = 'borderline';
        interpretation = `Mild AST elevation (<2× ULN).`;
        recommendation = 'Counsel on alcohol reduction and weight management. Repeat in 4-6 weeks.';
        recheckTiming = '4-6 weeks';
      } else {
        status = 'normal';
        interpretation = 'AST within normal limits.';
        recommendation = 'Continue routine monitoring.';
      }

      interpretations.push({
        category: 'AST',
        value: labs.ast,
        unit: 'U/L',
        status,
        referenceRange: `<${ULN.AST} U/L`,
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // ALT
    if (labs.alt !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.alt > 5 * ULN.ALT) {
        status = 'critical';
        interpretation = `Severe ALT elevation (>5× ULN at ${5 * ULN.ALT} U/L).`;
        recommendation = 'URGENT evaluation. HOLD testosterone. Hepatology consultation.';
        recheckTiming = '1-2 weeks';
      } else if (labs.alt >= 2 * ULN.ALT && labs.alt <= 5 * ULN.ALT) {
        status = 'abnormal';
        interpretation = `Moderate ALT elevation (2-5× ULN).`;
        recommendation = 'Hold hepatotoxins. Evaluate for NAFLD. Repeat labs promptly.';
        recheckTiming = '1-2 weeks';
      } else if (labs.alt > ULN.ALT && labs.alt < 2 * ULN.ALT) {
        status = 'borderline';
        interpretation = `Mild ALT elevation (<2× ULN).`;
        recommendation = 'Lifestyle counseling (alcohol, weight). Recheck in 4-6 weeks.';
        recheckTiming = '4-6 weeks';
      } else {
        status = 'normal';
        interpretation = 'ALT within normal limits.';
        recommendation = 'Continue routine monitoring.';
      }

      interpretations.push({
        category: 'ALT',
        value: labs.alt,
        unit: 'U/L',
        status,
        referenceRange: `<${ULN.ALT} U/L`,
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // Continue with other lab values...
    // eGFR
    if (labs.egfr !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.egfr < 45) {
        status = 'critical';
        interpretation = 'Significantly reduced kidney function (eGFR <45).';
        recommendation = 'PROVIDER REVIEW. Possible nephrology referral. Evaluate medications.';
        recheckTiming = '2-4 weeks';
      } else if (labs.egfr >= 45 && labs.egfr < 60) {
        status = 'borderline';
        interpretation = 'Borderline kidney function (eGFR 45-59). Monitor for progression.';
        recommendation = 'Hydrate well. Avoid NSAIDs. Repeat in 2-4 weeks.';
        recheckTiming = '2-4 weeks';
      } else if (labs.egfr >= 60) {
        status = 'normal';
        interpretation = 'Normal kidney function (eGFR ≥60).';
        recommendation = 'Routine care and monitoring.';
      }

      interpretations.push({
        category: 'eGFR',
        value: labs.egfr,
        unit: 'mL/min',
        status,
        referenceRange: '≥60 mL/min',
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // Creatinine
    if (labs.creatinine !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.creatinine > 1.5) {
        status = 'abnormal';
        interpretation = 'Elevated creatinine suggesting possible kidney dysfunction.';
        recommendation = 'Hydrate. Avoid NSAIDs. Repeat with eGFR in 2-4 weeks.';
        recheckTiming = '2-4 weeks';
      } else if (labs.creatinine > 1.3 && labs.creatinine <= 1.5) {
        status = 'borderline';
        interpretation = 'Borderline creatinine elevation.';
        recommendation = 'Encourage hydration. Recheck in 2-4 weeks.';
        recheckTiming = '2-4 weeks';
      } else {
        status = 'normal';
        interpretation = 'Creatinine within normal limits.';
        recommendation = 'Continue routine monitoring.';
      }

      interpretations.push({
        category: 'Creatinine',
        value: labs.creatinine,
        unit: 'mg/dL',
        status,
        referenceRange: '≤1.3 mg/dL',
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // PSA
    if (labs.psa !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.psa > 4.0) {
        status = 'abnormal';
        interpretation = `PSA elevated (${labs.psa} ng/mL). Warrants urology evaluation.`;
        recommendation = 'FLAG PROVIDER. Consider DRE, age/risk factors, and urology referral.';
      } else if (labs.psa >= 2.5 && labs.psa <= 4.0) {
        status = 'borderline';
        interpretation = 'PSA in upper normal range. Monitor trend.';
        recommendation = 'Monitor PSA velocity. Consider baseline 3-12 months after TRT start, then per risk.';
      } else {
        status = 'normal';
        interpretation = 'PSA within normal limits.';
        recommendation = 'Continue monitoring per protocol (baseline, 3-12 mo, then per risk).';
      }

      interpretations.push({
        category: 'PSA',
        value: labs.psa,
        unit: 'ng/mL',
        status,
        referenceRange: '<4.0 ng/mL',
        interpretation,
        recommendation,
      });
    }

    // A1c
    if (labs.a1c !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.a1c >= 6.5) {
        status = 'abnormal';
        interpretation = 'A1c in diabetic range (≥6.5%). Diabetes diagnosis likely.';
        recommendation = 'Confirm diagnosis. Initiate diabetes management plan. Refer to provider/endocrinology.';
        recheckTiming = '3 months';
      } else if (labs.a1c >= 5.7 && labs.a1c < 6.5) {
        status = 'borderline';
        interpretation = 'A1c in prediabetic range (5.7-6.4%). Increased diabetes risk.';
        recommendation = 'Lifestyle intervention: diet, exercise, weight loss. Recheck in 3-6 months.';
        recheckTiming = '3-6 months';
      } else {
        status = 'normal';
        interpretation = 'A1c normal (<5.7%). No evidence of diabetes.';
        recommendation = 'Continue healthy lifestyle. Routine monitoring q6-12 months.';
      }

      interpretations.push({
        category: 'Hemoglobin A1c',
        value: labs.a1c,
        unit: '%',
        status,
        referenceRange: '<5.7% (normal)',
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // LDL
    if (labs.ldl !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.ldl >= 190) {
        status = 'abnormal';
        interpretation = 'LDL severely elevated (≥190 mg/dL). High cardiovascular risk.';
        recommendation = 'FLAG PROVIDER for statin consideration. Intensive lifestyle: Mediterranean/DASH diet, exercise ≥150 min/wk, fiber 25-40 g/day.';
      } else if (labs.ldl >= 130 && labs.ldl < 190) {
        status = 'borderline';
        interpretation = 'LDL elevated. Lifestyle modification indicated.';
        recommendation = 'Mediterranean/DASH diet, minimize saturated fats, ≥150 min/wk aerobic + resistance training. Omega-3s twice weekly. Repeat in 3 months.';
      } else {
        status = 'normal';
        interpretation = 'LDL within optimal range.';
        recommendation = 'Maintain heart-healthy lifestyle. Continue routine monitoring.';
      }

      interpretations.push({
        category: 'LDL Cholesterol',
        value: labs.ldl,
        unit: 'mg/dL',
        status,
        referenceRange: '<130 mg/dL (optimal)',
        interpretation,
        recommendation,
      });
    }

    // Triglycerides
    if (labs.triglycerides !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.triglycerides >= 500) {
        status = 'abnormal';
        interpretation = 'Triglycerides severely elevated (≥500 mg/dL). Pancreatitis risk.';
        recommendation = 'FLAG PROVIDER. Consider fibrate therapy. Strict diet modification, limit alcohol and refined carbs.';
      } else if (labs.triglycerides >= 200 && labs.triglycerides < 500) {
        status = 'borderline';
        interpretation = 'Triglycerides elevated. Lifestyle and metabolic optimization needed.';
        recommendation = 'Reduce refined carbs, minimize alcohol. Increase physical activity. Omega-3 supplementation. Repeat in 3 months.';
      } else if (labs.triglycerides >= 150 && labs.triglycerides < 200) {
        status = 'borderline';
        interpretation = 'Triglycerides borderline high.';
        recommendation = 'Lifestyle modifications: reduce simple sugars, increase exercise. Monitor.';
      } else {
        status = 'normal';
        interpretation = 'Triglycerides within normal range.';
        recommendation = 'Continue healthy diet and exercise habits.';
      }

      interpretations.push({
        category: 'Triglycerides',
        value: labs.triglycerides,
        unit: 'mg/dL',
        status,
        referenceRange: '<150 mg/dL (optimal)',
        interpretation,
        recommendation,
      });
    }

    // Prolactin
    if (labs.prolactin !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.prolactin > 100) {
        status = 'critical';
        interpretation = 'Severely elevated prolactin (>100 ng/mL). Pituitary adenoma concern.';
        recommendation = 'URGENT endocrine workup. MRI pituitary indicated.';
      } else if (labs.prolactin > 30) {
        status = 'abnormal';
        interpretation = 'Elevated prolactin (>25-30 ng/mL). Persistent elevation requires workup.';
        recommendation = 'Repeat fasting AM draw. If persistent >25-30 or symptomatic, endocrine consultation.';
      } else if (labs.prolactin > 20 && labs.prolactin <= 30) {
        status = 'borderline';
        interpretation = 'Mildly elevated prolactin (>20 ng/mL).';
        recommendation = 'Repeat fasting AM to confirm. Assess for medications/stress that elevate prolactin.';
      } else {
        status = 'normal';
        interpretation = 'Prolactin within normal range.';
        recommendation = 'No action needed. Routine monitoring as indicated.';
      }

      interpretations.push({
        category: 'Prolactin',
        value: labs.prolactin,
        unit: 'ng/mL',
        status,
        referenceRange: '<20 ng/mL',
        interpretation,
        recommendation,
      });
    }

    // LH
    if (labs.lh !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      // On TRT, LH should be suppressed
      if (labs.lh < 1.0) {
        status = 'normal';
        interpretation = 'LH appropriately suppressed on testosterone replacement therapy.';
        recommendation = 'Expected finding. No action needed.';
      } else if (labs.lh >= 1.0) {
        status = 'borderline';
        interpretation = 'LH not fully suppressed despite TRT. May indicate poor adherence or timing issue.';
        recommendation = 'Verify patient adherence to testosterone protocol. Confirm timing of trough labs.';
      }

      interpretations.push({
        category: 'LH',
        value: labs.lh,
        unit: 'mIU/mL',
        status,
        referenceRange: 'Suppressed on TRT',
        interpretation,
        recommendation,
      });
    }

    // TSH
    if (labs.tsh !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.tsh > 4.5) {
        status = 'abnormal';
        interpretation = 'TSH elevated. Possible hypothyroidism.';
        recommendation = 'Check free T4. Consider thyroid replacement if confirmed hypothyroid.';
      } else if (labs.tsh < 0.4) {
        status = 'abnormal';
        interpretation = 'TSH suppressed. Possible hyperthyroidism or overtreatment.';
        recommendation = 'Check free T4. Evaluate for hyperthyroidism or adjust thyroid medication if applicable.';
      } else if ((labs.tsh >= 0.4 && labs.tsh < 1.0) || (labs.tsh > 3.0 && labs.tsh <= 4.5)) {
        status = 'borderline';
        interpretation = 'TSH at borderline of normal range. Monitor.';
        recommendation = 'If symptomatic, consider additional thyroid testing. Otherwise monitor.';
      } else {
        status = 'normal';
        interpretation = 'TSH within optimal range.';
        recommendation = 'Normal thyroid function. Routine monitoring.';
      }

      interpretations.push({
        category: 'TSH',
        value: labs.tsh,
        unit: 'mIU/L',
        status,
        referenceRange: '0.4-4.5 mIU/L',
        interpretation,
        recommendation,
      });
    }

    // HDL Cholesterol
    if (labs.hdl !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.hdl < 40) {
        status = 'abnormal';
        interpretation = 'Low HDL (<40 mg/dL). Increased cardiovascular risk.';
        recommendation = 'Lifestyle: aerobic exercise ≥150 min/wk, omega-3 fatty acids, limit alcohol. Consider niacin or fibrate if very low.';
      } else if (labs.hdl >= 40 && labs.hdl < 50) {
        status = 'borderline';
        interpretation = 'HDL borderline low. Could be improved.';
        recommendation = 'Increase aerobic exercise, healthy fats (nuts, olive oil, fatty fish). Limit refined carbs.';
      } else {
        status = 'normal';
        interpretation = 'HDL protective level (≥50 mg/dL).';
        recommendation = 'Excellent. Maintain heart-healthy lifestyle.';
      }

      interpretations.push({
        category: 'HDL Cholesterol',
        value: labs.hdl,
        unit: 'mg/dL',
        status,
        referenceRange: '≥40 mg/dL (optimal ≥50)',
        interpretation,
        recommendation,
      });
    }

    // BUN
    if (labs.bun !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.bun > 24) {
        status = 'abnormal';
        interpretation = 'Elevated BUN. May indicate dehydration or kidney dysfunction.';
        recommendation = 'Hydrate well. Evaluate BUN/Cr ratio. Assess kidney function.';
      } else if (labs.bun >= 20 && labs.bun <= 24) {
        status = 'borderline';
        interpretation = 'BUN borderline high.';
        recommendation = 'Ensure adequate hydration. Monitor.';
      } else if (labs.bun >= 7 && labs.bun < 20) {
        status = 'normal';
        interpretation = 'BUN within normal limits.';
        recommendation = 'Continue routine monitoring.';
      } else {
        status = 'borderline';
        interpretation = 'BUN low. May indicate overhydration or low protein intake.';
        recommendation = 'Generally not concerning. Monitor if persistent.';
      }

      interpretations.push({
        category: 'BUN',
        value: labs.bun,
        unit: 'mg/dL',
        status,
        referenceRange: '7-24 mg/dL',
        interpretation,
        recommendation,
      });
    }

    // Bilirubin
    if (labs.bilirubin !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let recheckTiming = '';

      if (labs.bilirubin > 2.0) {
        status = 'critical';
        interpretation = 'Significantly elevated bilirubin (>2.0 mg/dL). Liver dysfunction concern.';
        recommendation = 'URGENT hepatic evaluation. HOLD testosterone.';
        recheckTiming = '1 week';
      } else if (labs.bilirubin > 1.2) {
        status = 'abnormal';
        interpretation = 'Mildly elevated bilirubin. Possible Gilbert syndrome or liver issue.';
        recommendation = 'Evaluate for hemolysis, Gilbert syndrome, or hepatic dysfunction. Repeat with liver panel.';
        recheckTiming = '2-4 weeks';
      } else {
        status = 'normal';
        interpretation = 'Bilirubin within normal limits.';
        recommendation = 'Continue routine monitoring.';
      }

      interpretations.push({
        category: 'Bilirubin (Total)',
        value: labs.bilirubin,
        unit: 'mg/dL',
        status,
        referenceRange: '≤1.2 mg/dL',
        interpretation,
        recommendation,
        recheckTiming,
      });
    }

    // SHBG (Sex Hormone Binding Globulin)
    if (labs.shbg !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.shbg > 60) {
        status = 'abnormal';
        interpretation = 'Elevated SHBG (>60 nmol/L). Reduces free/bioavailable testosterone.';
        recommendation = 'May require higher testosterone doses or more frequent injections. Consider free testosterone measurement.';
      } else if (labs.shbg < 20) {
        status = 'abnormal';
        interpretation = 'Low SHBG (<20 nmol/L). Increases free testosterone clearance rate.';
        recommendation = 'May need more frequent injections to maintain stable levels. Monitor free testosterone.';
      } else if ((labs.shbg >= 20 && labs.shbg < 25) || (labs.shbg > 50 && labs.shbg <= 60)) {
        status = 'borderline';
        interpretation = 'SHBG at borderline of optimal range.';
        recommendation = 'Monitor in relation to total and free testosterone. Adjust dosing frequency if needed.';
      } else {
        status = 'normal';
        interpretation = 'SHBG within optimal range (25-50 nmol/L).';
        recommendation = 'Good balance for testosterone delivery. Continue current regimen.';
      }

      interpretations.push({
        category: 'SHBG',
        value: labs.shbg,
        unit: 'nmol/L',
        status,
        referenceRange: '20-60 nmol/L (optimal 25-50)',
        interpretation,
        recommendation,
      });
    }

    // Free Testosterone
    if (labs.freeTestosterone !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.freeTestosterone > 30) {
        status = 'abnormal';
        interpretation = 'Free testosterone elevated (>30 pg/mL). May indicate supraphysiologic dosing.';
        recommendation = 'Consider dose reduction 10-20% if symptomatic or SHBG very low.';
      } else if (labs.freeTestosterone >= 12 && labs.freeTestosterone <= 30) {
        status = 'normal';
        interpretation = 'Free testosterone in optimal range (12-30 pg/mL).';
        recommendation = 'Excellent bioavailable hormone level. Maintain current dose.';
      } else if (labs.freeTestosterone >= 8 && labs.freeTestosterone < 12) {
        status = 'borderline';
        interpretation = 'Free testosterone borderline low.';
        recommendation = 'If symptomatic, consider dose increase or check SHBG. If asymptomatic, monitor.';
      } else {
        status = 'abnormal';
        interpretation = 'Free testosterone suboptimal (<8 pg/mL).';
        recommendation = 'Increase dose 20-30% or address high SHBG if present.';
      }

      interpretations.push({
        category: 'Free Testosterone',
        value: labs.freeTestosterone,
        unit: 'pg/mL',
        status,
        referenceRange: '12-30 pg/mL',
        interpretation,
        recommendation,
      });
    }

    // RBC (Red Blood Cell Count)
    if (labs.rbc !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.rbc > 6.0) {
        status = 'abnormal';
        interpretation = 'Elevated RBC count. Polycythemia concern.';
        recommendation = 'Correlate with hematocrit/hemoglobin. Consider dose reduction or phlebotomy.';
      } else if (labs.rbc >= 5.5 && labs.rbc <= 6.0) {
        status = 'borderline';
        interpretation = 'RBC count upper normal/borderline high.';
        recommendation = 'Monitor closely. Ensure adequate hydration.';
      } else if (labs.rbc >= 4.5 && labs.rbc < 5.5) {
        status = 'normal';
        interpretation = 'RBC count within normal range.';
        recommendation = 'Continue routine monitoring.';
      } else {
        status = 'abnormal';
        interpretation = 'Low RBC count. Possible anemia.';
        recommendation = 'Evaluate for iron deficiency, B12/folate deficiency, or other causes.';
      }

      interpretations.push({
        category: 'RBC Count',
        value: labs.rbc,
        unit: 'M/μL',
        status,
        referenceRange: '4.5-5.5 M/μL',
        interpretation,
        recommendation,
      });
    }

    // WBC (White Blood Cell Count)
    if (labs.wbc !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.wbc > 11.0) {
        status = 'abnormal';
        interpretation = 'Elevated WBC (>11,000/μL). May indicate infection or inflammation.';
        recommendation = 'Evaluate for infection, inflammation, or stress response. Repeat if no clear cause.';
      } else if (labs.wbc >= 10.0 && labs.wbc <= 11.0) {
        status = 'borderline';
        interpretation = 'WBC borderline high.';
        recommendation = 'Generally benign. Monitor for upward trend.';
      } else if (labs.wbc >= 4.0 && labs.wbc < 10.0) {
        status = 'normal';
        interpretation = 'WBC within normal limits.';
        recommendation = 'Normal immune function. Continue routine monitoring.';
      } else if (labs.wbc >= 3.5 && labs.wbc < 4.0) {
        status = 'borderline';
        interpretation = 'WBC borderline low.';
        recommendation = 'Monitor. Usually benign if patient feels well.';
      } else {
        status = 'abnormal';
        interpretation = 'Low WBC (<3,500/μL). Possible immunosuppression.';
        recommendation = 'Evaluate for bone marrow suppression, medication effect, or autoimmune cause.';
      }

      interpretations.push({
        category: 'WBC Count',
        value: labs.wbc,
        unit: 'K/μL',
        status,
        referenceRange: '4.0-11.0 K/μL',
        interpretation,
        recommendation,
      });
    }

    // Platelets
    if (labs.platelets !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.platelets > 450) {
        status = 'abnormal';
        interpretation = 'Elevated platelets (thrombocytosis). May increase clotting risk.';
        recommendation = 'Evaluate for inflammation, iron deficiency, or myeloproliferative disorder. Consider hematology consult if very high.';
      } else if (labs.platelets >= 400 && labs.platelets <= 450) {
        status = 'borderline';
        interpretation = 'Platelets upper normal/borderline high.';
        recommendation = 'Monitor. Usually benign.';
      } else if (labs.platelets >= 150 && labs.platelets < 400) {
        status = 'normal';
        interpretation = 'Platelet count within normal limits.';
        recommendation = 'Normal clotting function. Continue routine monitoring.';
      } else if (labs.platelets >= 100 && labs.platelets < 150) {
        status = 'borderline';
        interpretation = 'Mild thrombocytopenia (low platelets).';
        recommendation = 'Monitor. Usually not clinically significant above 100K.';
      } else {
        status = 'abnormal';
        interpretation = 'Significant thrombocytopenia (<100,000/μL).';
        recommendation = 'Evaluate for causes. Consider hematology consultation. Monitor for bleeding risk.';
      }

      interpretations.push({
        category: 'Platelet Count',
        value: labs.platelets,
        unit: 'K/μL',
        status,
        referenceRange: '150-400 K/μL',
        interpretation,
        recommendation,
      });
    }

    // Glucose
    if (labs.glucose !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.glucose >= 126) {
        status = 'abnormal';
        interpretation = 'Fasting glucose ≥126 mg/dL. Diabetes range.';
        recommendation = 'Confirm with repeat or A1c. Initiate diabetes management.';
      } else if (labs.glucose >= 100 && labs.glucose < 126) {
        status = 'borderline';
        interpretation = 'Impaired fasting glucose (100-125 mg/dL). Prediabetes range.';
        recommendation = 'Lifestyle intervention: diet, exercise, weight loss. Check A1c. Repeat in 3-6 months.';
      } else if (labs.glucose >= 70 && labs.glucose < 100) {
        status = 'normal';
        interpretation = 'Fasting glucose normal.';
        recommendation = 'Excellent glycemic control. Maintain healthy lifestyle.';
      } else {
        status = 'abnormal';
        interpretation = 'Hypoglycemia (<70 mg/dL).';
        recommendation = 'Evaluate for excessive fasting, medications, or endocrine disorder.';
      }

      interpretations.push({
        category: 'Glucose (Fasting)',
        value: labs.glucose,
        unit: 'mg/dL',
        status,
        referenceRange: '70-99 mg/dL',
        interpretation,
        recommendation,
      });
    }

    // Sodium
    if (labs.sodium !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.sodium > 145) {
        status = 'abnormal';
        interpretation = 'Hypernatremia (>145 mEq/L). Dehydration or sodium excess.';
        recommendation = 'Increase fluid intake. Evaluate for diabetes insipidus if severe or persistent.';
      } else if (labs.sodium >= 143 && labs.sodium <= 145) {
        status = 'borderline';
        interpretation = 'Sodium upper normal.';
        recommendation = 'Ensure adequate hydration. Usually benign.';
      } else if (labs.sodium >= 136 && labs.sodium < 143) {
        status = 'normal';
        interpretation = 'Sodium within normal limits.';
        recommendation = 'Normal electrolyte balance. Continue routine monitoring.';
      } else if (labs.sodium >= 133 && labs.sodium < 136) {
        status = 'borderline';
        interpretation = 'Mild hyponatremia (133-135 mEq/L).';
        recommendation = 'Monitor. Evaluate fluid status and medications.';
      } else {
        status = 'abnormal';
        interpretation = 'Hyponatremia (<133 mEq/L).';
        recommendation = 'Evaluate cause (SIADH, diuretics, kidney/heart/liver disease). May need specialist input.';
      }

      interpretations.push({
        category: 'Sodium',
        value: labs.sodium,
        unit: 'mEq/L',
        status,
        referenceRange: '136-145 mEq/L',
        interpretation,
        recommendation,
      });
    }

    // Potassium
    if (labs.potassium !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.potassium > 5.5) {
        status = 'critical';
        interpretation = 'Hyperkalemia (>5.5 mEq/L). Cardiac arrhythmia risk.';
        recommendation = 'URGENT: Evaluate for hemolysis artifact. If confirmed, discontinue K-sparing agents, check ECG, consider treatment.';
      } else if (labs.potassium >= 5.0 && labs.potassium <= 5.5) {
        status = 'borderline';
        interpretation = 'Potassium upper normal/borderline high.';
        recommendation = 'Repeat to rule out hemolysis. Review medications (ACE-I, ARBs, spironolactone).';
      } else if (labs.potassium >= 3.5 && labs.potassium < 5.0) {
        status = 'normal';
        interpretation = 'Potassium within normal limits.';
        recommendation = 'Normal electrolyte balance. Continue routine monitoring.';
      } else if (labs.potassium >= 3.0 && labs.potassium < 3.5) {
        status = 'borderline';
        interpretation = 'Mild hypokalemia (3.0-3.4 mEq/L).';
        recommendation = 'Consider potassium supplementation or dietary increase. Evaluate for diuretic use or GI losses.';
      } else {
        status = 'abnormal';
        interpretation = 'Significant hypokalemia (<3.0 mEq/L).';
        recommendation = 'Potassium replacement needed. Evaluate for cause (diuretics, vomiting, diarrhea). Monitor ECG if very low.';
      }

      interpretations.push({
        category: 'Potassium',
        value: labs.potassium,
        unit: 'mEq/L',
        status,
        referenceRange: '3.5-5.0 mEq/L',
        interpretation,
        recommendation,
      });
    }

    return interpretations;
  }

  /**
   * Determine appropriate recheck window based on findings
   */
  static determineRecheckWindow(redFlags: RedFlag[], interpretations: LabInterpretation[]): string {
    // Critical findings = most urgent recheck
    if (redFlags.some(f => f.severity === 'critical')) {
      return '1-4 weeks (after addressing critical findings)';
    }

    // Urgent findings
    if (redFlags.some(f => f.severity === 'urgent')) {
      return '4-8 weeks';
    }

    // Any abnormal labs
    const hasAbnormal = interpretations.some(i => 
      i.status === 'abnormal' || i.status === 'borderline'
    );

    if (hasAbnormal) {
      return '8-12 weeks (after dose change or intervention)';
    }

    // All normal - stable patient
    return '6 months (stable patient routine monitoring)';
  }
}
