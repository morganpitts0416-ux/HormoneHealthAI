// Female Clinical Logic Engine - Women's Hormone Clinic Standing Orders
import type { FemaleLabValues, RedFlag, LabInterpretation, CardiovascularRiskFlags, CacStatinRecommendation } from "@shared/schema";

const ULN = {
  AST: 32, // U/L - lower for women
  ALT: 32, // U/L - lower for women
};

export class FemaleClinicalLogicEngine {
  static detectRedFlags(labs: FemaleLabValues): RedFlag[] {
    const redFlags: RedFlag[] = [];

    // 1. Hemoglobin - Critical anemia (women have lower thresholds)
    if (labs.hemoglobin !== undefined && labs.hemoglobin < 8) {
      redFlags.push({
        category: "Anemia - Critical Hemoglobin",
        severity: 'critical',
        message: `Hemoglobin is ${labs.hemoglobin} g/dL (<8 critical threshold).`,
        action: "URGENT evaluation. Consider transfusion if symptomatic. Evaluate for acute blood loss.",
      });
    } else if (labs.hemoglobin !== undefined && labs.hemoglobin < 10) {
      redFlags.push({
        category: "Anemia - Moderate Hemoglobin",
        severity: 'urgent',
        message: `Hemoglobin is ${labs.hemoglobin} g/dL (<10 threshold).`,
        action: "Evaluate for iron deficiency, B12/folate deficiency, or chronic disease. Consider iron studies.",
      });
    }

    // Polycythemia in women (rare but significant)
    if (labs.hematocrit !== undefined && labs.hematocrit >= 48) {
      redFlags.push({
        category: "Polycythemia - Elevated Hematocrit",
        severity: 'urgent',
        message: `Hematocrit is ${labs.hematocrit}% (≥48% for women).`,
        action: "Evaluate for causes: dehydration, hypoxia, polycythemia vera. Consider hematology referral.",
      });
    }

    // 2. Liver Enzymes - Severe elevation
    if (labs.ast !== undefined && labs.ast > 5 * ULN.AST) {
      redFlags.push({
        category: "Liver Function - Severe AST Elevation",
        severity: 'critical',
        message: `AST is ${labs.ast} U/L (>5× ULN at ${5 * ULN.AST}).`,
        action: "URGENT evaluation required. HOLD any hepatotoxic medications.",
      });
    }

    if (labs.alt !== undefined && labs.alt > 5 * ULN.ALT) {
      redFlags.push({
        category: "Liver Function - Severe ALT Elevation",
        severity: 'critical',
        message: `ALT is ${labs.alt} U/L (>5× ULN at ${5 * ULN.ALT}).`,
        action: "URGENT evaluation required. Hepatology consultation.",
      });
    }

    // 3. Bilirubin
    if (labs.bilirubin !== undefined && labs.bilirubin > 2.0) {
      redFlags.push({
        category: "Liver Function - Elevated Bilirubin",
        severity: 'critical',
        message: `Total bilirubin is ${labs.bilirubin} mg/dL (>2.0 threshold).`,
        action: "URGENT hepatic evaluation required.",
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

    // 5. Thyroid - TSH extremes
    if (labs.tsh !== undefined && labs.tsh > 10) {
      redFlags.push({
        category: "Thyroid - Severe Hypothyroidism",
        severity: 'urgent',
        message: `TSH is ${labs.tsh} mIU/L (>10 threshold).`,
        action: "Initiate or adjust levothyroxine therapy. Evaluate for symptoms of myxedema.",
      });
    }

    if (labs.tsh !== undefined && labs.tsh < 0.1) {
      redFlags.push({
        category: "Thyroid - Severe Hyperthyroidism",
        severity: 'urgent',
        message: `TSH is ${labs.tsh} mIU/L (<0.1 threshold).`,
        action: "Evaluate for thyrotoxicosis. Consider endocrinology referral. Check Free T4/T3.",
      });
    }

    // 6. Lipids
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
        action: "Diabetes diagnosis confirmed. Initiate comprehensive diabetes management.",
      });
    }

    // 8. Electrolyte Imbalances
    if (labs.potassium !== undefined && labs.potassium > 5.5) {
      redFlags.push({
        category: "Electrolytes - Critical Hyperkalemia",
        severity: 'critical',
        message: `Potassium is ${labs.potassium} mEq/L (>5.5 critical threshold).`,
        action: "URGENT: Rule out hemolysis. If confirmed, check ECG, discontinue K-sparing agents.",
      });
    }

    if (labs.potassium !== undefined && labs.potassium < 3.0) {
      redFlags.push({
        category: "Electrolytes - Severe Hypokalemia",
        severity: 'urgent',
        message: `Potassium is ${labs.potassium} mEq/L (<3.0 threshold).`,
        action: "Potassium replacement needed urgently. Monitor ECG.",
      });
    }

    // 9. Prolactin - Elevated (important for fertility/menstrual issues)
    if (labs.prolactin !== undefined && labs.prolactin > 100) {
      redFlags.push({
        category: "Prolactin - Significantly Elevated",
        severity: 'urgent',
        message: `Prolactin is ${labs.prolactin} ng/mL (>100 threshold).`,
        action: "Consider pituitary imaging (MRI). Evaluate for prolactinoma. Review medications.",
      });
    }

    // 10. Iron/Ferritin - Severe deficiency
    const hasAnemia = labs.hemoglobin !== undefined && labs.hemoglobin < 12;
    if (labs.ferritin !== undefined && labs.ferritin < 10) {
      if (hasAnemia) {
        redFlags.push({
          category: "Iron - Severe Deficiency WITH Anemia",
          severity: 'critical',
          message: `Ferritin is ${labs.ferritin} ng/mL (<10) with hemoglobin ${labs.hemoglobin} g/dL (<12).`,
          action: "CONSIDER IV IRON INFUSION for rapid repletion. If oral: Prescription 65mg Elemental Iron every other day. Evaluate for blood loss (menorrhagia, GI).",
        });
      } else {
        redFlags.push({
          category: "Iron - Severe Deficiency",
          severity: 'urgent',
          message: `Ferritin is ${labs.ferritin} ng/mL (<10 threshold).`,
          action: "Metagenics Hemagenics OR Prescription 65mg Elemental Iron. Evaluate for occult blood loss.",
        });
      }
    } else if (labs.ferritin !== undefined && labs.ferritin <= 30 && hasAnemia) {
      redFlags.push({
        category: "Iron Deficiency WITH Anemia",
        severity: 'urgent',
        message: `Ferritin is ${labs.ferritin} ng/mL (≤30) with hemoglobin ${labs.hemoglobin} g/dL (<12).`,
        action: "Prescription 65mg Elemental Iron (every other day, empty stomach). Evaluate for heavy menstrual bleeding or GI loss.",
      });
    }

    // 11. Vitamin D - Severe deficiency
    if (labs.vitaminD !== undefined && labs.vitaminD < 10) {
      redFlags.push({
        category: "Vitamin D - Severe Deficiency",
        severity: 'warning',
        message: `Vitamin D is ${labs.vitaminD} ng/mL (<10 threshold). Goal is 60-80 ng/mL.`,
        action: "Provider protocol: 10,000 IU D3+K daily OR weekly prescription of 50,000 IU D3. Screen for malabsorption.",
      });
    }

    // 12. Platelets - Significant thrombocytosis or thrombocytopenia
    if (labs.platelets !== undefined) {
      if (labs.platelets > 600) {
        redFlags.push({
          category: "Platelets - Significant Thrombocytosis",
          severity: 'critical',
          message: `Platelet count is ${labs.platelets} K/uL (>600 threshold).`,
          action: "Consider hematology referral. Discuss further evaluation including peripheral smear +/- JAK2/CALR/MPL testing. Do not diagnose ET/MPN without specialist evaluation.",
        });
      } else if (labs.platelets < 100) {
        redFlags.push({
          category: "Platelets - Significant Thrombocytopenia",
          severity: 'urgent',
          message: `Platelet count is ${labs.platelets} K/uL (<100 threshold).`,
          action: "Evaluate for causes including medications, infections, autoimmune conditions. Consider hematology referral if persistent.",
        });
      }
    }

    return redFlags;
  }

  static interpretLabValues(labs: FemaleLabValues): LabInterpretation[] {
    const interpretations: LabInterpretation[] = [];
    const phase = labs.menstrualPhase || 'unknown';

    // Hemoglobin - Female ranges
    if (labs.hemoglobin !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.hemoglobin < 8) {
        status = 'critical';
        interpretation = 'Critically low hemoglobin - severe anemia.';
        recommendation = 'URGENT evaluation. Consider transfusion. Evaluate for acute blood loss.';
      } else if (labs.hemoglobin < 12) {
        status = 'abnormal';
        interpretation = 'Low hemoglobin indicating anemia.';
        recommendation = 'Check iron studies, B12, folate. Evaluate menstrual blood loss if applicable.';
      } else if (labs.hemoglobin >= 12 && labs.hemoglobin <= 16) {
        status = 'normal';
        interpretation = 'Hemoglobin within normal range for adult females.';
        recommendation = 'Continue routine monitoring.';
      } else {
        status = 'borderline';
        interpretation = 'Elevated hemoglobin - evaluate for dehydration or polycythemia.';
        recommendation = 'Check hydration status. Consider hematology referral if persistent.';
      }

      interpretations.push({
        category: 'Hemoglobin',
        value: labs.hemoglobin,
        unit: 'g/dL',
        status,
        referenceRange: '12-16 g/dL',
        interpretation,
        recommendation,
      });
    }

    // Hematocrit - Female ranges
    if (labs.hematocrit !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.hematocrit < 36) {
        status = 'abnormal';
        interpretation = 'Low hematocrit suggesting anemia.';
        recommendation = 'Evaluate for iron deficiency or other causes. Check iron studies.';
      } else if (labs.hematocrit >= 36 && labs.hematocrit <= 44) {
        status = 'normal';
        interpretation = 'Hematocrit within normal range for adult females.';
        recommendation = 'Continue routine monitoring.';
      } else if (labs.hematocrit > 44 && labs.hematocrit < 48) {
        status = 'borderline';
        interpretation = 'Slightly elevated hematocrit - may indicate dehydration.';
        recommendation = 'Encourage hydration. Repeat if persistent.';
      } else {
        status = 'abnormal';
        interpretation = 'Elevated hematocrit - evaluate for polycythemia.';
        recommendation = 'Consider hematology referral. Evaluate for underlying causes.';
      }

      interpretations.push({
        category: 'Hematocrit',
        value: labs.hematocrit,
        unit: '%',
        status,
        referenceRange: '36-44%',
        interpretation,
        recommendation,
      });
    }

    // MCV - Mean Corpuscular Volume (RBC size index)
    if (labs.mcv !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      const hasLowFerritin = labs.ferritin !== undefined && labs.ferritin < 30;
      const hasLowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 300;
      const hasLowFolate = labs.folate !== undefined && labs.folate < 4;

      if (labs.mcv < 80) {
        status = 'abnormal';
        interpretation = `Low MCV (${labs.mcv} fL) indicates microcytic red blood cells. Most common cause in women is iron deficiency; thalassemia trait should also be considered.`;
        if (hasLowFerritin) {
          recommendation = 'Low MCV with low ferritin strongly supports iron deficiency anemia. Provider protocol: Metagenics Hemagenics. Recheck CBC and iron studies after 3 months of repletion.';
        } else {
          recommendation = 'Evaluate iron studies (ferritin, serum iron, TIBC, iron saturation). If iron studies are normal, consider hemoglobin electrophoresis to evaluate for thalassemia trait.';
        }
      } else if (labs.mcv > 100) {
        status = 'abnormal';
        const macrocyticCauses: string[] = [];
        if (hasLowB12) macrocyticCauses.push(`low B12 (${labs.vitaminB12} pg/mL)`);
        if (hasLowFolate) macrocyticCauses.push(`low folate (${labs.folate} ng/mL)`);
        const causeText = macrocyticCauses.length > 0 ? ` Lab data supports: ${macrocyticCauses.join(', ')}.` : '';
        interpretation = `Elevated MCV (${labs.mcv} fL) indicates macrocytic red blood cells.${causeText} Common causes include B12 deficiency, folate deficiency, hypothyroidism, alcohol use, or certain medications (methotrexate, hydroxyurea).`;
        const recParts: string[] = [];
        if (hasLowB12) recParts.push('B12 deficiency confirmed — provider protocol: Metagenics IntrinsiB12/Folate or intramuscular B12 if severe');
        if (hasLowFolate) recParts.push('folate deficiency confirmed — supplement with Metagenics Ultraflora or folate 1 mg/day');
        if (recParts.length === 0) recParts.push('check serum B12, folate, TSH, reticulocyte count, and medication list. Rule out alcohol use.');
        recommendation = recParts.join('. ') + '.';
      } else if (labs.mcv >= 96 && labs.mcv <= 100) {
        status = 'borderline';
        interpretation = `MCV ${labs.mcv} fL is in the high-normal range. Early macrocytosis can precede overt B12 or folate deficiency.`;
        recommendation = 'Ensure B12 and folate levels are within optimal range. Monitor CBC at next visit.';
      } else {
        status = 'normal';
        interpretation = `MCV ${labs.mcv} fL is within normal range (80–100 fL), indicating normal-sized red blood cells.`;
        recommendation = 'Continue routine monitoring.';
      }

      interpretations.push({
        category: 'MCV',
        value: labs.mcv,
        unit: 'fL',
        status,
        referenceRange: '80-100 fL',
        interpretation,
        recommendation,
      });
    }

    // Platelets - Thrombocytosis evaluation with reactive pattern detection
    if (labs.platelets !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      const platelets = labs.platelets;

      // Determine elevation category
      let elevationCategory: 'none' | 'mild' | 'moderate' | 'high' = 'none';
      if (platelets > 600) {
        elevationCategory = 'high';
      } else if (platelets > 450) {
        elevationCategory = 'moderate';
      } else if (platelets >= 400) {
        elevationCategory = 'mild';
      }

      // Check for reactive patterns (iron restriction, inflammation, etc.)
      const reactivePatterns: string[] = [];
      
      // Iron restriction: Use directly reported iron saturation if available, otherwise calculate from iron/TIBC
      // TSAT = (Iron / TIBC) × 100
      const ferritin = labs.ferritin;
      let effectiveTsat: number | undefined;
      if (labs.ironSaturation !== undefined) {
        effectiveTsat = labs.ironSaturation;
      } else if (labs.iron !== undefined && labs.tibc !== undefined && labs.tibc > 0) {
        effectiveTsat = (labs.iron / labs.tibc) * 100;
      }
      if (effectiveTsat !== undefined && effectiveTsat < 20) {
        reactivePatterns.push('iron restriction (low iron saturation)');
      }
      if (ferritin !== undefined && ferritin < 30) {
        reactivePatterns.push('low ferritin suggesting iron deficiency');
      } else if (ferritin !== undefined && ferritin >= 30 && ferritin < 50) {
        reactivePatterns.push('borderline ferritin');
      }

      // Inflammation: hs-CRP elevated (>3.0 mg/L = high cardiovascular risk)
      if (labs.hsCRP !== undefined && labs.hsCRP > 3.0) {
        reactivePatterns.push('elevated hs-CRP (inflammation/infection)');
      }

      // Smoking status (from demographics)
      if (labs.demographics?.smoker === true) {
        reactivePatterns.push('smoking');
      }

      // Check for concerning features that may warrant hematology referral
      const concerningFeatures: string[] = [];
      
      // WBC abnormal (low <4.0 or high >11.0)
      if (labs.wbc !== undefined) {
        if (labs.wbc < 4.0) {
          concerningFeatures.push('low WBC');
        } else if (labs.wbc > 11.0) {
          concerningFeatures.push('elevated WBC');
        }
      }

      // Hemoglobin abnormal without explanation
      if (labs.hemoglobin !== undefined) {
        if (labs.hemoglobin < 12.0) {
          concerningFeatures.push('low hemoglobin');
        } else if (labs.hemoglobin > 16.0) {
          concerningFeatures.push('elevated hemoglobin');
        }
      }

      // Low platelets (thrombocytopenia)
      if (platelets < 150) {
        status = 'abnormal';
        interpretation = 'Low platelet count (thrombocytopenia). Evaluate for causes including medications, viral infections, autoimmune conditions, or bone marrow disorders.';
        recommendation = 'Repeat CBC to confirm. Consider hematology referral if persistent or symptomatic.';
      } else if (platelets >= 150 && platelets < 400) {
        // Normal range
        status = 'normal';
        interpretation = 'Platelet count within normal range.';
        recommendation = 'Continue routine monitoring.';
      } else if (elevationCategory === 'mild') {
        // Mild elevation: 400-450
        status = 'borderline';
        const isLikelyReactive = reactivePatterns.length > 0;
        
        if (isLikelyReactive) {
          interpretation = `Mild platelet elevation (400-450), likely reactive. Identified factors: ${reactivePatterns.join(', ')}. Iron restriction is a frequent cause in menstruating women.`;
          recommendation = 'Address underlying cause (especially iron deficiency). Repeat CBC in 4-8 weeks.';
        } else {
          interpretation = 'Mild platelet elevation (400-450). Commonly reactive to iron deficiency, inflammation, or infection.';
          recommendation = 'Check iron studies and inflammatory markers. Repeat CBC in 4-8 weeks.';
        }
      } else if (elevationCategory === 'moderate') {
        // Moderate elevation: 450-600
        status = 'abnormal';
        const isLikelyReactive = reactivePatterns.length > 0;
        
        if (isLikelyReactive) {
          interpretation = `Moderate platelet elevation (450-600), likely reactive. Identified factors: ${reactivePatterns.join(', ')}.`;
          recommendation = 'Address underlying cause. Repeat CBC in 2-4 weeks with iron studies and inflammatory workup.';
        } else {
          interpretation = 'Moderate platelet elevation (450-600). Requires evaluation for reactive vs. primary thrombocytosis.';
          recommendation = 'Repeat CBC in 2-4 weeks. Complete iron/inflammation evaluation. If >=450 persists over 3 months, discuss further evaluation (smear +/- JAK2/CALR/MPL testing).';
        }

        // Add concerning features if present
        if (concerningFeatures.length > 0) {
          interpretation += ` Additional concerns: ${concerningFeatures.join(', ')}.`;
          recommendation = 'Consider hematology referral given concerning features. Discuss further evaluation (smear +/- JAK2/CALR/MPL) if persistent.';
        }
      } else if (elevationCategory === 'high') {
        // High elevation: >600
        status = 'critical';
        interpretation = `Significant platelet elevation (>600). While reactive causes are still possible, this level warrants evaluation for myeloproliferative neoplasm.`;
        
        if (reactivePatterns.length > 0) {
          interpretation += ` Possible reactive factors identified: ${reactivePatterns.join(', ')}.`;
        }
        
        if (concerningFeatures.length > 0) {
          interpretation += ` Additional concerns: ${concerningFeatures.join(', ')}.`;
        }

        recommendation = 'Consider hematology referral. Discuss further evaluation including peripheral blood smear +/- JAK2/CALR/MPL testing. Do not diagnose ET/MPN without specialist evaluation.';
      }

      interpretations.push({
        category: 'Platelets',
        value: labs.platelets,
        unit: 'K/uL',
        status,
        referenceRange: '150-400 K/uL',
        interpretation,
        recommendation,
      });
    }

    // Estradiol - Phase-dependent interpretation with HRT-specific goals
    if (labs.estradiol !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let referenceRange = '';
      const onHRT = labs.onHRT === true;

      if (onHRT) {
        // HRT patient - Provider goal: 60-100 pg/mL, minimum >40 for bone health
        referenceRange = '60-100 pg/mL (HRT goal, >40 for bone)';
        if (labs.estradiol < 40) {
          status = 'abnormal';
          interpretation = 'Estradiol below bone protection threshold (<40 pg/mL). Bone resorption increases below 40-60 pg/mL.';
          recommendation = 'Provider recommendation: Increase estrogen dose. Target 60-100 pg/mL. Current level inadequate for bone protection.';
        } else if (labs.estradiol >= 40 && labs.estradiol < 60) {
          status = 'borderline';
          interpretation = 'Estradiol at minimum bone protection level (40-60 pg/mL) but below optimal HRT goal.';
          recommendation = 'Provider recommendation: Consider increasing estrogen dose. Target 60-100 pg/mL for optimized symptom relief.';
        } else if (labs.estradiol >= 60 && labs.estradiol <= 100) {
          status = 'normal';
          interpretation = 'Estradiol at optimal HRT goal (60-100 pg/mL).';
          recommendation = 'Provider recommendation: Optimal level for HRT. Maintain current dosing. Bone protection achieved.';
        } else if (labs.estradiol > 100 && labs.estradiol <= 150) {
          status = 'borderline';
          interpretation = 'Estradiol above HRT optimization goal (60-100 pg/mL).';
          recommendation = 'Provider recommendation: Consider reducing estrogen dose slightly if no symptoms warrant higher levels.';
        } else {
          status = 'abnormal';
          interpretation = 'Estradiol elevated above typical HRT range.';
          recommendation = 'Provider recommendation: Evaluate estrogen dose. Monitor for estrogen excess symptoms.';
        }
      } else if (phase === 'postmenopausal') {
        referenceRange = '<20 pg/mL (postmenopausal without HRT)';
        if (labs.estradiol > 20) {
          status = 'borderline';
          interpretation = 'Estradiol elevated for postmenopausal status without HRT.';
          recommendation = 'Evaluate for exogenous estrogen source or ovarian pathology. Consider HRT if symptomatic.';
        } else {
          status = 'normal';
          interpretation = 'Estradiol appropriate for postmenopausal status.';
          recommendation = 'Consider HRT if symptomatic for vasomotor symptoms, bone health, or quality of life.';
        }
      } else if (phase === 'follicular') {
        referenceRange = '20-150 pg/mL (follicular phase)';
        if (labs.estradiol < 20) {
          status = 'abnormal';
          interpretation = 'Low estradiol in follicular phase.';
          recommendation = 'Evaluate for ovarian dysfunction or premature ovarian insufficiency.';
        } else if (labs.estradiol > 150) {
          status = 'borderline';
          interpretation = 'Elevated estradiol for early follicular phase.';
          recommendation = 'May indicate approaching ovulation. Correlate with cycle day.';
        } else {
          status = 'normal';
          interpretation = 'Estradiol appropriate for follicular phase.';
          recommendation = 'Normal finding. Continue monitoring if needed for fertility.';
        }
      } else if (phase === 'ovulatory') {
        referenceRange = '150-500 pg/mL (ovulatory phase)';
        if (labs.estradiol < 150) {
          status = 'abnormal';
          interpretation = 'Low estradiol for ovulatory phase.';
          recommendation = 'May indicate anovulatory cycle. Consider fertility evaluation.';
        } else if (labs.estradiol > 500) {
          status = 'borderline';
          interpretation = 'High estradiol peak - may indicate multiple follicle development.';
          recommendation = 'If on fertility medications, monitor for OHSS risk.';
        } else {
          status = 'normal';
          interpretation = 'Estradiol appropriate for ovulatory phase.';
          recommendation = 'Indicates healthy ovulation. Continue monitoring.';
        }
      } else if (phase === 'luteal') {
        referenceRange = '50-250 pg/mL (luteal phase)';
        if (labs.estradiol < 50) {
          status = 'borderline';
          interpretation = 'Low estradiol in luteal phase.';
          recommendation = 'May indicate corpus luteum dysfunction. Correlate with progesterone.';
        } else {
          status = 'normal';
          interpretation = 'Estradiol appropriate for luteal phase.';
          recommendation = 'Normal finding. Continue monitoring.';
        }
      } else {
        referenceRange = '20-500 pg/mL (varies by cycle phase)';
        status = 'normal';
        interpretation = 'Estradiol level recorded. Interpretation depends on menstrual phase.';
        recommendation = 'For accurate interpretation, document cycle day or menstrual phase.';
      }

      interpretations.push({
        category: 'Estradiol',
        value: labs.estradiol,
        unit: 'pg/mL',
        status,
        referenceRange,
        interpretation,
        recommendation,
      });
    }

    // Progesterone - Phase-dependent interpretation with HRT-specific goals
    if (labs.progesterone !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let referenceRange = '';
      const onHRT = labs.onHRT === true;

      if (onHRT) {
        // HRT patient - Provider goal: 8-10 ng/mL
        referenceRange = '8-10 ng/mL (HRT goal)';
        if (labs.progesterone < 5) {
          status = 'abnormal';
          interpretation = 'Progesterone below HRT therapeutic range.';
          recommendation = 'Provider recommendation: Increase progesterone dose. Target 8-10 ng/mL for optimal endometrial protection.';
        } else if (labs.progesterone >= 5 && labs.progesterone < 8) {
          status = 'borderline';
          interpretation = 'Progesterone below optimal HRT goal (8-10 ng/mL).';
          recommendation = 'Provider recommendation: Consider increasing progesterone dose slightly. Target 8-10 ng/mL.';
        } else if (labs.progesterone >= 8 && labs.progesterone <= 10) {
          status = 'normal';
          interpretation = 'Progesterone at optimal HRT goal (8-10 ng/mL).';
          recommendation = 'Provider recommendation: Optimal level for HRT. Maintain current dosing.';
        } else if (labs.progesterone > 10 && labs.progesterone <= 15) {
          status = 'borderline';
          interpretation = 'Progesterone slightly above HRT optimization goal.';
          recommendation = 'Provider recommendation: Acceptable level. May reduce if side effects present.';
        } else {
          status = 'abnormal';
          interpretation = 'Progesterone elevated above typical HRT range.';
          recommendation = 'Provider recommendation: Consider reducing progesterone dose. Evaluate for side effects.';
        }
      } else if (phase === 'follicular' || phase === 'ovulatory') {
        referenceRange = '<1.5 ng/mL (pre-ovulation)';
        if (labs.progesterone > 1.5) {
          status = 'borderline';
          interpretation = 'Elevated progesterone for pre-ovulatory phase.';
          recommendation = 'May indicate premature luteinization. Correlate with cycle day.';
        } else {
          status = 'normal';
          interpretation = 'Progesterone appropriate for pre-ovulatory phase.';
          recommendation = 'Normal finding.';
        }
      } else if (phase === 'luteal') {
        referenceRange = '5-20 ng/mL (luteal phase)';
        if (labs.progesterone < 5) {
          status = 'abnormal';
          interpretation = 'Low progesterone in luteal phase - luteal phase defect.';
          recommendation = 'May affect fertility/early pregnancy. Consider progesterone support if TTC.';
        } else if (labs.progesterone > 20) {
          status = 'normal';
          interpretation = 'Good progesterone level indicating ovulation occurred.';
          recommendation = 'If trying to conceive, this confirms ovulation.';
        } else {
          status = 'normal';
          interpretation = 'Progesterone appropriate for luteal phase.';
          recommendation = 'Confirms ovulation occurred.';
        }
      } else if (phase === 'postmenopausal') {
        referenceRange = '<1 ng/mL (postmenopausal)';
        if (labs.progesterone > 1) {
          status = 'borderline';
          interpretation = 'Elevated progesterone for postmenopausal status.';
          recommendation = 'Evaluate for exogenous source or adrenal production.';
        } else {
          status = 'normal';
          interpretation = 'Progesterone appropriate for postmenopausal status.';
          recommendation = 'Expected finding.';
        }
      } else {
        referenceRange = 'Varies by cycle phase';
        status = 'normal';
        interpretation = 'Progesterone level recorded.';
        recommendation = 'For accurate interpretation, document cycle phase.';
      }

      interpretations.push({
        category: 'Progesterone',
        value: labs.progesterone,
        unit: 'ng/mL',
        status,
        referenceRange,
        interpretation,
        recommendation,
      });
    }

    // FSH - Phase-dependent
    if (labs.fsh !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let referenceRange = '';

      if (phase === 'postmenopausal') {
        referenceRange = '>25 mIU/mL (postmenopausal)';
        if (labs.fsh < 25) {
          status = 'borderline';
          interpretation = 'FSH lower than expected for postmenopausal status.';
          recommendation = 'Confirm menopausal status. Rule out pituitary dysfunction.';
        } else {
          status = 'normal';
          interpretation = 'Elevated FSH consistent with menopause.';
          recommendation = 'Expected finding for postmenopausal women.';
        }
      } else if (phase === 'follicular') {
        referenceRange = '3-10 mIU/mL (follicular phase)';
        if (labs.fsh > 10) {
          status = 'borderline';
          interpretation = 'Elevated FSH may indicate diminished ovarian reserve.';
          recommendation = 'Consider AMH testing if fertility is a concern.';
        } else if (labs.fsh < 3) {
          status = 'borderline';
          interpretation = 'Low FSH - evaluate pituitary function.';
          recommendation = 'Check other pituitary hormones if concerning.';
        } else {
          status = 'normal';
          interpretation = 'FSH appropriate for follicular phase.';
          recommendation = 'Normal finding.';
        }
      } else {
        referenceRange = '3-20 mIU/mL (varies by phase)';
        status = 'normal';
        interpretation = 'FSH level recorded.';
        recommendation = 'For accurate interpretation, document cycle phase.';
      }

      interpretations.push({
        category: 'FSH',
        value: labs.fsh,
        unit: 'mIU/mL',
        status,
        referenceRange,
        interpretation,
        recommendation,
      });
    }

    // LH
    if (labs.lh !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (phase === 'ovulatory' && labs.lh > 20) {
        status = 'normal';
        interpretation = 'LH surge detected - indicates imminent ovulation.';
        recommendation = 'Peak fertility window. If TTC, optimal timing for conception.';
      } else if (phase === 'postmenopausal' && labs.lh > 25) {
        status = 'normal';
        interpretation = 'Elevated LH consistent with menopause.';
        recommendation = 'Expected finding.';
      } else if (labs.lh > 20 && phase !== 'ovulatory' && phase !== 'postmenopausal') {
        status = 'borderline';
        interpretation = 'Elevated LH outside expected phase.';
        recommendation = labs.onHRT === true
          ? 'Elevated LH — exogenous hormone use can influence gonadotropin suppression. Correlate clinically with HRT protocol.'
          : 'May indicate PCOS if LH:FSH ratio >2. Correlate with other findings.';
      } else {
        status = 'normal';
        interpretation = 'LH within expected range.';
        recommendation = 'Continue monitoring if needed.';
      }

      interpretations.push({
        category: 'LH',
        value: labs.lh,
        unit: 'mIU/mL',
        status,
        referenceRange: '2-15 mIU/mL (varies by phase)',
        interpretation,
        recommendation,
      });
    }

    // Testosterone - Female ranges with HRT-specific goals
    if (labs.testosterone !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      const onHRT = labs.onHRT === true;

      if (onHRT) {
        // HRT patient - Provider goal: 75-125 ng/dL for optimized results
        if (labs.testosterone > 125) {
          status = 'abnormal';
          interpretation = 'Testosterone above HRT optimization goal (75-125 ng/dL).';
          recommendation = 'Provider recommendation: Consider reducing testosterone dose. Monitor for androgenic side effects.';
        } else if (labs.testosterone >= 75 && labs.testosterone <= 125) {
          status = 'normal';
          interpretation = 'Testosterone at optimal HRT goal (75-125 ng/dL).';
          recommendation = 'Provider recommendation: Optimal level for HRT. Maintain current dosing.';
        } else if (labs.testosterone >= 50 && labs.testosterone < 75) {
          status = 'borderline';
          interpretation = 'Testosterone below optimal HRT goal (75-125 ng/dL).';
          recommendation = 'Provider recommendation: Consider increasing testosterone dose for optimized results if symptomatic.';
        } else {
          status = 'abnormal';
          interpretation = 'Low testosterone despite HRT.';
          recommendation = 'Provider recommendation: Increase testosterone dose. Target 75-125 ng/dL for optimal results.';
        }
      } else {
        // Non-HRT patient — optimized clinical range: 30–60 ng/dL
        if (labs.testosterone > 70) {
          status = 'abnormal';
          interpretation = `Testosterone elevated (${labs.testosterone} ng/dL). Above the physiologic range for women — evaluate for PCOS, adrenal hyperplasia, or androgen-secreting tumor.`;
          recommendation = 'Evaluate for PCOS, adrenal hyperplasia, or androgen-secreting tumor. Consider LH/FSH ratio, 17-OH progesterone. Endocrinology referral if etiology unclear.';
        } else if (labs.testosterone > 60 && labs.testosterone <= 70) {
          status = 'borderline';
          interpretation = `Testosterone upper-normal (${labs.testosterone} ng/dL). At the high end of the female range — correlate with symptoms of androgen excess (acne, hirsutism, hair thinning).`;
          recommendation = 'Correlate with clinical signs (hirsutism, acne, scalp hair loss). Consider PCOS workup if symptomatic. Optimal range for androgen balance is 30–60 ng/dL.';
        } else if (labs.testosterone >= 30 && labs.testosterone <= 60) {
          status = 'normal';
          interpretation = `Testosterone within optimal range (${labs.testosterone} ng/dL). Supports libido, energy, muscle tone, cognitive function, and bone density.`;
          recommendation = 'Optimal androgen level. Continue routine monitoring.';
        } else if (labs.testosterone >= 20 && labs.testosterone < 30) {
          status = 'borderline';
          interpretation = `Testosterone low-normal (${labs.testosterone} ng/dL). Below the optimal range of 30–60 ng/dL. May contribute to reduced libido, energy, motivation, or muscle tone.`;
          recommendation = 'Correlate with free testosterone, SHBG, and symptoms. If symptomatic, consider full androgen panel (free T, bioavailable T, SHBG). Discuss androgen optimization if persistent symptoms.';
        } else {
          status = 'abnormal';
          interpretation = `Testosterone low (${labs.testosterone} ng/dL). Significantly below the optimal range of 30–60 ng/dL. Associated with low libido, fatigue, reduced motivation, poor muscle tone, and mood changes.`;
          recommendation = 'Evaluate free testosterone and SHBG. If free T also low, consider androgen optimization discussion. Assess adrenal reserve (DHEA-S). Identify reversible drivers: poor sleep, under-eating, overtraining, elevated cortisol. Consider low-dose testosterone therapy if symptomatic.';
        }
      }

      interpretations.push({
        category: 'Testosterone (Total)',
        value: labs.testosterone,
        unit: 'ng/dL',
        status,
        referenceRange: onHRT ? '75-125 ng/dL (HRT goal)' : '30-60 ng/dL (optimal)',
        interpretation,
        recommendation,
      });
    }

    // TSH
    if (labs.tsh !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.tsh > 10) {
        status = 'critical';
        interpretation = 'Significantly elevated TSH - overt hypothyroidism.';
        recommendation = 'Initiate or adjust levothyroxine. Check Free T4.';
      } else if (labs.tsh > 4.5 && labs.tsh <= 10) {
        status = 'abnormal';
        interpretation = 'Elevated TSH - hypothyroidism.';
        recommendation = 'Check Free T4, TPO antibodies. Consider levothyroxine if symptomatic.';
      } else if (labs.tsh >= 0.4 && labs.tsh <= 4.5) {
        status = 'normal';
        interpretation = 'TSH within normal range - euthyroid.';
        recommendation = 'No thyroid intervention needed.';
      } else if (labs.tsh >= 0.1 && labs.tsh < 0.4) {
        status = 'borderline';
        interpretation = 'Low TSH - possible subclinical hyperthyroidism.';
        recommendation = 'Check Free T4/T3. Evaluate for thyroiditis or Graves.';
      } else {
        status = 'critical';
        interpretation = 'Suppressed TSH - overt hyperthyroidism.';
        recommendation = 'URGENT: Check Free T4/T3. Endocrinology referral.';
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

    // Prolactin
    if (labs.prolactin !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.prolactin > 100) {
        status = 'critical';
        interpretation = 'Significantly elevated prolactin.';
        recommendation = 'Pituitary MRI recommended. Evaluate for prolactinoma.';
      } else if (labs.prolactin > 25) {
        status = 'abnormal';
        interpretation = 'Elevated prolactin.';
        recommendation = 'Review medications (antipsychotics, metoclopramide). Consider MRI if persistent.';
      } else if (labs.prolactin >= 4 && labs.prolactin <= 25) {
        status = 'normal';
        interpretation = 'Prolactin within normal range.';
        recommendation = 'No intervention needed.';
      } else {
        status = 'borderline';
        interpretation = 'Low prolactin.';
        recommendation = 'Rarely clinically significant. Monitor if concerning symptoms.';
      }

      interpretations.push({
        category: 'Prolactin',
        value: labs.prolactin,
        unit: 'ng/mL',
        status,
        referenceRange: '4-25 ng/mL',
        interpretation,
        recommendation,
      });
    }

    // Free T4 (Free Thyroxine) — Female
    if (labs.freeT4 !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.freeT4 > 1.7) {
        status = 'abnormal';
        interpretation = `Elevated Free T4 (${labs.freeT4} ng/dL). Possible hyperthyroidism, overtreatment with levothyroxine, or thyroiditis.`;
        recommendation = 'Correlate with TSH. If TSH suppressed, evaluate for Graves disease or postpartum thyroiditis. Adjust levothyroxine if on replacement. Consider endocrine referral.';
      } else if (labs.freeT4 >= 1.5 && labs.freeT4 <= 1.7) {
        status = 'borderline';
        interpretation = `Free T4 upper normal (${labs.freeT4} ng/dL). Monitor for symptoms of overtreatment.`;
        recommendation = 'If on levothyroxine and symptomatic (anxiety, palpitations, tremor), consider 10% dose reduction. Correlate with TSH and Free T3.';
      } else if (labs.freeT4 >= 0.9 && labs.freeT4 < 1.5) {
        status = 'normal';
        interpretation = `Free T4 optimal (${labs.freeT4} ng/dL). Normal thyroid hormone production and T4 availability.`;
        recommendation = 'Healthy thyroid output. Evaluate Free T3 to confirm adequate T4→T3 conversion.';
      } else if (labs.freeT4 >= 0.7 && labs.freeT4 < 0.9) {
        status = 'borderline';
        interpretation = `Free T4 borderline low (${labs.freeT4} ng/dL). Suboptimal thyroid output — correlate with TSH and symptoms.`;
        recommendation = 'Evaluate for hypothyroid symptoms: fatigue, weight gain, cold intolerance, hair thinning, constipation. If TSH elevated and symptomatic, initiate levothyroxine or increase dose.';
      } else {
        status = 'abnormal';
        interpretation = `Free T4 low (<0.7 ng/dL). Likely hypothyroidism — reduced thyroid hormone output.`;
        recommendation = "Confirm with TSH. Thyroid replacement therapy typically indicated. Monitor for Hashimoto's with TPO antibodies.";
      }

      interpretations.push({
        category: 'Free T4',
        value: labs.freeT4,
        unit: 'ng/dL',
        status,
        referenceRange: '0.9-1.7 ng/dL',
        interpretation,
        recommendation,
      });
    }

    // Free T3 (Free Triiodothyronine) — the active thyroid hormone, Female
    if (labs.freeT3 !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.freeT3 > 4.2) {
        status = 'abnormal';
        interpretation = `Elevated Free T3 (${labs.freeT3} pg/mL). Possible hyperthyroidism or excess T3 supplementation.`;
        recommendation = 'Correlate with TSH. If on T3 medication, consider dose reduction. Evaluate for thyrotoxicosis.';
      } else if (labs.freeT3 >= 3.2 && labs.freeT3 <= 4.2) {
        status = 'normal';
        interpretation = `Free T3 optimal (${labs.freeT3} pg/mL). Active thyroid hormone in the clinic-preferred range. Excellent T4→T3 peripheral conversion.`;
        recommendation = 'Optimal active thyroid hormone. Maintain current approach.';
      } else if (labs.freeT3 >= 2.3 && labs.freeT3 < 3.2) {
        status = 'borderline';
        interpretation = `Free T3 low-normal (${labs.freeT3} pg/mL). Within lab reference range but below the clinic-preferred optimal of 3.2 pg/mL. Common in women — suboptimal T4→T3 conversion can cause fatigue, weight resistance, brain fog, and mood changes even with "normal" TSH and T4.`;
        recommendation = 'Evaluate for hypothyroid symptoms. Impaired T4→T3 conversion is common with: selenium deficiency, elevated cortisol (chronic stress), insulin resistance, chronic inflammation. If symptomatic, consider T3 support (liothyronine) or compounded T4/T3. Supplement: selenium 200 mcg/day. Address cortisol burden and gut health.';
      } else if (labs.freeT3 >= 1.8 && labs.freeT3 < 2.3) {
        status = 'abnormal';
        interpretation = `Free T3 low (${labs.freeT3} pg/mL). Below laboratory reference — active thyroid hormone insufficient at tissue level. Can cause significant symptoms even when TSH appears normal, particularly in women on estrogen (estrogen raises TBG, reducing free thyroid hormone).`;
        recommendation = 'Clinical hypothyroid pattern. Review: is patient on oral estrogen? (raises TBG, lowers free hormones — switch to transdermal). Consider adding T3 (liothyronine) or combination T4/T3 therapy. Selenium 200 mcg/day, optimize iron (ferritin >50 required for thyroid enzyme function), reduce inflammatory triggers.';
      } else {
        status = 'critical';
        interpretation = `Free T3 critically low (<1.8 pg/mL). Severe thyroid hormone deficiency at tissue level.`;
        recommendation = 'URGENT: Optimize thyroid replacement — consider T3 addition. Evaluate for central hypothyroidism if TSH also low. Endocrinology referral.';
      }

      interpretations.push({
        category: 'Free T3',
        value: labs.freeT3,
        unit: 'pg/mL',
        status,
        referenceRange: '2.3-4.2 pg/mL (optimal >3.2)',
        interpretation,
        recommendation,
      });
    }

    // Total T3 — Female
    if (labs.totalT3 !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      // Unit normalization: some labs report Total T3 in ng/mL (range ~0.8–2.0)
      // rather than ng/dL (range ~80–200). Any raw value < 5 is unambiguously
      // ng/mL — even severe hypothyroidism never produces ng/dL values that low
      // in a living patient. Convert to ng/dL before all comparisons and display.
      const totalT3NgDl = labs.totalT3 < 5 ? Math.round(labs.totalT3 * 100) : labs.totalT3;

      if (totalT3NgDl > 200) {
        status = 'abnormal';
        interpretation = `Total T3 elevated (${totalT3NgDl} ng/dL). Possible hyperthyroidism or T3 supplementation effect.`;
        recommendation = 'Correlate with TSH and Free T3. If on T3 medication, assess dose. Evaluate for thyrotoxicosis.';
      } else if (totalT3NgDl >= 100 && totalT3NgDl <= 200) {
        status = 'normal';
        interpretation = `Total T3 optimal (${totalT3NgDl} ng/dL). Adequate total circulating T3 pool.`;
        recommendation = 'Normal T3 levels. Routine monitoring.';
      } else if (totalT3NgDl >= 80 && totalT3NgDl < 100) {
        status = 'borderline';
        interpretation = `Total T3 borderline low (${totalT3NgDl} ng/dL). Suboptimal total T3 — correlate with Free T3 for clinical significance. Elevated TBG (common with oral estrogen) may lower Total T3 while Free T3 remains adequate.`;
        recommendation = 'Check Free T3. If on oral estrogen and Free T3 is low, consider switching to transdermal delivery to reduce TBG elevation. Selenium 200 mcg/day to support T4→T3 conversion.';
      } else if (totalT3NgDl >= 60 && totalT3NgDl < 80) {
        status = 'abnormal';
        interpretation = `Total T3 low (${totalT3NgDl} ng/dL). Reduced T3 production or conversion consistent with hypothyroid state.`;
        recommendation = 'Optimize thyroid replacement. Consider adding T3 if on levothyroxine alone and symptomatic. Check selenium, iron (ferritin target >50), and cortisol status.';
      } else {
        status = 'critical';
        interpretation = `Total T3 critically low (${totalT3NgDl} ng/dL). Severe hypothyroid state.`;
        recommendation = 'Immediate thyroid optimization required. Consider T3 therapy. Evaluate for pituitary dysfunction.';
      }

      interpretations.push({
        category: 'Total T3',
        value: totalT3NgDl,
        unit: 'ng/dL',
        status,
        referenceRange: '80-200 ng/dL (optimal 100-180)',
        interpretation,
        recommendation,
      });
    }

    // Total T4 — Female
    if (labs.totalT4 !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.totalT4 > 12.0) {
        status = 'abnormal';
        interpretation = `Total T4 elevated (${labs.totalT4} mcg/dL). May reflect hyperthyroidism, levothyroxine overtreatment, or elevated thyroid binding globulin (TBG). Note: oral estrogen significantly raises TBG and can elevate Total T4 even with normal Free T4.`;
        recommendation = 'Correlate with Free T4 and TSH. If on oral estrogen and Free T4 is normal, elevated TBG is likely responsible — Total T4 elevation may be a binding artifact, not true overtreatment.';
      } else if (labs.totalT4 >= 6.5 && labs.totalT4 <= 12.0) {
        status = 'normal';
        interpretation = `Total T4 optimal (${labs.totalT4} mcg/dL). Normal total circulating thyroxine.`;
        recommendation = 'Normal thyroid hormone pool. Evaluate Free T4 for unbound hormone availability.';
      } else if (labs.totalT4 >= 5.0 && labs.totalT4 < 6.5) {
        status = 'borderline';
        interpretation = `Total T4 borderline low (${labs.totalT4} mcg/dL). Suboptimal T4 levels — correlate with Free T4 for clinical significance.`;
        recommendation = 'Evaluate Free T4. If also borderline, consider thyroid optimization. Ensure adequate iodine and selenium intake.';
      } else {
        status = 'abnormal';
        interpretation = `Total T4 low (<5 mcg/dL). Consistent with hypothyroid state.`;
        recommendation = 'Confirm with Free T4 and TSH. Initiate or adjust levothyroxine if hypothyroidism confirmed.';
      }

      interpretations.push({
        category: 'Total T4',
        value: labs.totalT4,
        unit: 'mcg/dL',
        status,
        referenceRange: '5.0-12.0 mcg/dL (optimal 6.5-12.0)',
        interpretation,
        recommendation,
      });
    }

    // Anti-TPO Antibodies — Female (already expanded)
    if (labs.tpoAntibodies !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.tpoAntibodies > 500) {
        status = 'critical';
        interpretation = `Anti-TPO antibodies markedly elevated (${labs.tpoAntibodies} IU/mL). High-positive Hashimoto's thyroiditis. Active autoimmune attack on thyroid tissue — risk of progressive hypothyroidism is significant.`;
        recommendation = "PROVIDER: Confirm Hashimoto's diagnosis. Initiate levothyroxine even if TSH borderline — protect remaining thyroid tissue. Prescribe selenium 200 mcg/day (Cochrane-supported for reducing TPO antibody titers). Consider LDN (low-dose naltrexone) if persistent autoimmune burden. Discuss gluten-free trial 90 days. Address gut dysbiosis and estrogen balance (high estrogen amplifies autoimmunity). Recheck TPO at 6-12 months.";
      } else if (labs.tpoAntibodies > 100 && labs.tpoAntibodies <= 500) {
        status = 'abnormal';
        interpretation = `Anti-TPO antibodies positive (${labs.tpoAntibodies} IU/mL). Hashimoto's thyroiditis confirmed. The immune system is attacking thyroid peroxidase — an enzyme critical for thyroid hormone production.`;
        recommendation = 'Optimize TSH to 0.5-2.5 mIU/L. Selenium 200 mcg/day. Anti-inflammatory dietary protocol. Monitor thyroid function every 6 months. Note: estrogen fluctuations (perimenopause, OCP, HRT changes) can increase autoimmune flares.';
      } else if (labs.tpoAntibodies > 35 && labs.tpoAntibodies <= 100) {
        status = 'borderline';
        interpretation = `Anti-TPO antibodies borderline elevated (${labs.tpoAntibodies} IU/mL). Early autoimmune thyroid activity — possible early Hashimoto's.`;
        recommendation = 'Begin selenium 200 mcg/day as primary prevention. Anti-inflammatory diet. Monitor thyroid function every 6 months. Recheck TPO antibodies at 12 months — rising trend warrants treatment.';
      } else {
        status = 'normal';
        interpretation = `Anti-TPO antibodies negative (${labs.tpoAntibodies} IU/mL). No autoimmune thyroid activity detected.`;
        recommendation = 'No autoimmune thyroid disease. Annual thyroid monitoring.';
      }

      interpretations.push({
        category: 'Anti-TPO Antibodies',
        value: labs.tpoAntibodies,
        unit: 'IU/mL',
        status,
        referenceRange: '<35 IU/mL',
        interpretation,
        recommendation,
      });
    }

    // Anti-Thyroglobulin Antibodies (Anti-Tg) — Female
    if (labs.antiTg !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.antiTg > 40) {
        status = 'abnormal';
        interpretation = `Anti-thyroglobulin antibodies positive (${labs.antiTg} IU/mL). Elevated anti-Tg indicates autoimmune thyroid disease — Hashimoto's or Graves. Importantly, 10-15% of Hashimoto's patients have isolated anti-Tg elevation with normal TPO antibodies. Women are disproportionately affected.`;
        recommendation = "Treat as Hashimoto's thyroiditis. Optimize TSH to 0.5-2.5 mIU/L. Selenium 200 mcg/day. Anti-Tg is also used to monitor differentiated thyroid cancer recurrence — correlate with clinical context. Address immune triggers: estrogen balance, gut health, gluten sensitivity, vitamin D optimization.";
      } else if (labs.antiTg > 20 && labs.antiTg <= 40) {
        status = 'borderline';
        interpretation = `Anti-thyroglobulin antibodies borderline elevated (${labs.antiTg} IU/mL). Low-level thyroid autoimmunity — monitor closely if TPO antibodies also abnormal.`;
        recommendation = 'Selenium 200 mcg/day. Monitor thyroid function every 6 months. Anti-inflammatory lifestyle. Recheck in 12 months.';
      } else {
        status = 'normal';
        interpretation = `Anti-thyroglobulin antibodies negative (${labs.antiTg} IU/mL). No thyroglobulin autoimmunity detected.`;
        recommendation = 'No anti-thyroglobulin autoimmunity. Routine monitoring.';
      }

      interpretations.push({
        category: 'Anti-Thyroglobulin Antibodies',
        value: labs.antiTg,
        unit: 'IU/mL',
        status,
        referenceRange: '<20 IU/mL',
        interpretation,
        recommendation,
      });
    }

    // Homocysteine — cardiovascular and methylation risk marker, Female
    if (labs.homocysteine !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.homocysteine > 30) {
        status = 'critical';
        interpretation = `Homocysteine critically elevated (${labs.homocysteine} µmol/L). Severe hyperhomocysteinemia — independent cardiovascular risk factor. Associated with thrombosis, miscarriage risk, cognitive decline, and accelerated atherosclerosis. Consider methylation disorder or severe B-vitamin deficiency.`;
        recommendation = 'URGENT: Begin aggressive B-vitamin therapy: methylfolate 1-5 mg/day, methylcobalamin B12 1000-2000 mcg/day, pyridoxal-5-phosphate (B6) 50-100 mg/day. Rule out MTHFR polymorphism. Evaluate renal function. Cardiology referral if cardiovascular disease present. Recheck in 8 weeks.';
      } else if (labs.homocysteine > 15 && labs.homocysteine <= 30) {
        status = 'abnormal';
        interpretation = `Homocysteine elevated (${labs.homocysteine} µmol/L). Significant cardiovascular and thrombotic risk. In women, elevated homocysteine is associated with increased risk of venous thromboembolism, adverse pregnancy outcomes, and accelerated bone loss.`;
        recommendation = 'Begin methyl B-vitamin protocol: methylfolate 1 mg/day, methylcobalamin B12 1000 mcg/day, P5P (B6) 25-50 mg/day. Check serum B12 and folate. Consider MTHFR genetic testing. If on oral contraceptives or hormone therapy (known to elevate homocysteine), evaluate route and formulation. Dietary: leafy greens, eggs, legumes. Recheck in 8-12 weeks.';
      } else if (labs.homocysteine > 10 && labs.homocysteine <= 15) {
        status = 'borderline';
        interpretation = `Homocysteine borderline elevated (${labs.homocysteine} µmol/L). Above clinic-preferred optimal of <10 µmol/L. Emerging cardiovascular risk — correlate with hs-CRP, lipid panel, and hormone balance.`;
        recommendation = 'Optimize B-vitamin intake: methylfolate 400-800 mcg/day, B12 500-1000 mcg/day, B6. Note: some oral contraceptives and conventional HRT deplete B vitamins — ensure supplementation. Dietary: leafy greens, legumes, eggs. Recheck in 3-6 months.';
      } else if (labs.homocysteine >= 7 && labs.homocysteine <= 10) {
        status = 'normal';
        interpretation = `Homocysteine in acceptable range (${labs.homocysteine} µmol/L). Within standard reference, though clinic-preferred optimal is <7 µmol/L.`;
        recommendation = 'Maintain B-vitamin status. Dietary optimization: leafy greens, eggs, legumes. Consider methylfolate if MTHFR positive.';
      } else {
        status = 'normal';
        interpretation = `Homocysteine optimal (${labs.homocysteine} µmol/L). Excellent methylation capacity. Low cardiovascular risk from this marker.`;
        recommendation = 'Optimal homocysteine. Maintain current nutrition and B-vitamin status.';
      }

      interpretations.push({
        category: 'Homocysteine',
        value: labs.homocysteine,
        unit: 'µmol/L',
        status,
        referenceRange: '<15 µmol/L (optimal <10)',
        interpretation,
        recommendation,
      });
    }

    // DHEA-S — Female (expanded)
    if (labs.dheas !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.dheas > 400) {
        status = 'abnormal';
        interpretation = `DHEA-S elevated (${labs.dheas} µg/dL). Adrenal androgen excess — evaluate for adrenal hyperplasia or adrenal tumor. In the context of PCOS, elevated DHEA-S indicates adrenal-origin androgen excess.`;
        recommendation = 'Evaluate for adrenal hyperplasia: order 17-OH progesterone. Consider adrenal imaging if very high. If PCOS diagnosis: correlate with LH/FSH ratio and testosterone. Endocrinology referral if etiology unclear.';
      } else if (labs.dheas > 350 && labs.dheas <= 400) {
        status = 'borderline';
        interpretation = `DHEA-S high-normal (${labs.dheas} µg/dL). Above the clinical optimal ceiling of 350 µg/dL. Monitor for androgen excess symptoms (acne, hair thinning, hirsutism), particularly if on DHEA supplementation.`;
        recommendation = 'If on DHEA or testosterone supplementation, consider dose reduction. Monitor for androgenic side effects. Recheck in 3 months.';
      } else if (labs.dheas >= 150 && labs.dheas <= 350) {
        status = 'normal';
        interpretation = `DHEA-S within optimal range (${labs.dheas} µg/dL). Supports energy, libido, bone density, skin health, and cognitive function. Optimal female range is 150–300 µg/dL; values to 350 are well-tolerated.`;
        recommendation = 'Healthy adrenal androgen production. No intervention needed.';
      } else if (labs.dheas >= 100 && labs.dheas < 150) {
        status = 'borderline';
        interpretation = `DHEA-S borderline low (${labs.dheas} µg/dL). Below the optimal range of 150–300 µg/dL. Reduced adrenal androgen reserve — may contribute to fatigue, low libido, brain fog, hair thinning, and mood changes. Common in perimenopausal and postmenopausal women.`;
        recommendation = 'Consider low-dose DHEA supplementation 5–10 mg/day (women are more sensitive than men — start low). Use caution if patient is androgen-sensitive, has acne, or is already on testosterone therapy (prefer pregnenolone in that case). Support adrenal reserve: sleep optimization, stress management, adaptogen herbs. Monitor testosterone and DHEA-S at recheck in 8–12 weeks.';
      } else if (labs.dheas >= 65 && labs.dheas < 100) {
        status = 'abnormal';
        interpretation = `DHEA-S low (${labs.dheas} µg/dL). Significantly below the optimal range of 150–300 µg/dL. Indicates reduced adrenal androgen reserve — associated with fatigue, low libido, poor stress resilience, brain fog, and accelerated aging.`;
        recommendation = 'PROVIDER: Low-dose DHEA 5–10 mg/day in women (start at 5 mg and titrate). Avoid higher doses — women are highly androgen-sensitive. Consider pregnenolone 10–25 mg as an upstream precursor if patient has androgenic sensitivity or is on testosterone therapy. Monitor DHEA-S, free testosterone, and estradiol. Full adrenal support: sleep, stress, nutrition. Recheck in 8–12 weeks.';
      } else {
        status = 'abnormal';
        interpretation = `DHEA-S severely deficient (<65 µg/dL). Critically low adrenal androgen production. Associated with pronounced fatigue, very low libido, accelerated bone loss, mood disorders, poor stress tolerance, and reduced quality of life.`;
        recommendation = 'PROVIDER: Evaluate adrenal function (consider morning cortisol, 24h urinary cortisol if adrenal insufficiency suspected). DHEA supplementation 5–10 mg/day (start low). Consider pregnenolone 10–25 mg as upstream support. Full adrenal support protocol. Monitor DHEA-S, testosterone, and estradiol — DHEA is a hormone precursor. Recheck in 8 weeks.';
      }

      interpretations.push({
        category: 'DHEA-S',
        value: labs.dheas,
        unit: 'µg/dL',
        status,
        referenceRange: '100-400 µg/dL (optimal 150-350)',
        interpretation,
        recommendation,
      });
    }

    // AMH - Ovarian reserve marker
    if (labs.amh !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (phase === 'postmenopausal' || labs.amh < 0.3) {
        status = phase === 'postmenopausal' ? 'normal' : 'abnormal';
        interpretation = labs.amh < 0.3 ? 'Very low AMH - diminished ovarian reserve.' : 'Low AMH consistent with menopause.';
        recommendation = phase === 'postmenopausal' ? 'Expected finding.' : 'Fertility counseling recommended if conception desired.';
      } else if (labs.amh >= 0.3 && labs.amh < 1.0) {
        status = 'borderline';
        interpretation = 'Low AMH - reduced ovarian reserve.';
        recommendation = 'Time-sensitive fertility planning. Consider early referral to reproductive endocrinology.';
      } else if (labs.amh >= 1.0 && labs.amh <= 3.5) {
        status = 'normal';
        interpretation = 'AMH indicates normal ovarian reserve.';
        recommendation = 'Good indicator for fertility planning.';
      } else if (labs.amh > 3.5) {
        status = 'borderline';
        interpretation = labs.onHRT === true
          ? 'Elevated AMH noted in the context of HRT use.'
          : 'High AMH - may indicate PCOS.';
        recommendation = labs.onHRT === true
          ? 'Elevated AMH noted. In a patient on HRT, correlate with clinical history rather than assuming PCOS. High AMH in this context may reflect robust ovarian reserve.'
          : 'Correlate with clinical findings and ultrasound for PCOS diagnosis.';
      }

      interpretations.push({
        category: 'AMH',
        value: labs.amh,
        unit: 'ng/mL',
        status,
        referenceRange: '1.0-3.5 ng/mL (reproductive age)',
        interpretation,
        recommendation,
      });
    }

    // Ferritin - Provider-specific iron treatment guidelines
    if (labs.ferritin !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      // Check for anemia (hemoglobin < 12 for women)
      const hasAnemia = labs.hemoglobin !== undefined && labs.hemoglobin < 12;
      
      // Check for functional iron deficiency indicators
      const hasElevatedTIBC = labs.tibc !== undefined && labs.tibc > 450;
      const hasLowSerumIron = labs.iron !== undefined && labs.iron < 40;
      const hasFunctionalDeficiency = hasElevatedTIBC || hasLowSerumIron;

      // Critical: Consider iron infusion
      if (labs.ferritin < 10) {
        status = 'critical';
        if (hasAnemia) {
          interpretation = 'Severely depleted iron stores WITH anemia. Consider iron infusion.';
          recommendation = 'CRITICAL: Consider IV iron infusion for rapid repletion. If oral therapy: Prescription 65mg Elemental Iron (take every other day, on empty stomach, avoid caffeine and dairy 2 hours before/after). Evaluate for blood loss (menorrhagia, GI).';
        } else {
          interpretation = 'Severely depleted iron stores without anemia.';
          recommendation = 'Provider protocol: Metagenics Hemagenics OR Prescription 65mg Elemental Iron (take every other day, on empty stomach, avoid caffeine and dairy 2 hours before/after). Evaluate for blood loss.';
        }
      } 
      // Deficient: ≤30
      else if (labs.ferritin <= 30) {
        status = 'abnormal';
        if (hasAnemia) {
          interpretation = 'Iron deficiency WITH anemia (ferritin ≤30).';
          recommendation = 'Provider protocol: Prescription 65mg Elemental Iron (take every other day, on empty stomach, avoid caffeine and dairy 2 hours before/after). Evaluate for heavy menstrual bleeding or GI loss.';
        } else {
          interpretation = 'Iron deficiency without anemia (ferritin ≤30).';
          recommendation = 'Provider protocol: Metagenics Hemagenics OR Prescription 65mg Elemental Iron (take every other day, on empty stomach, avoid caffeine and dairy 2 hours before/after).';
        }
      } 
      // Insufficient: 31-50
      else if (labs.ferritin > 30 && labs.ferritin <= 50) {
        if (hasAnemia) {
          status = 'abnormal';
          interpretation = 'Iron insufficiency WITH anemia (ferritin 31-50).';
          recommendation = 'Provider protocol: Prescription 65mg Elemental Iron (take every other day, on empty stomach, avoid caffeine and dairy 2 hours before/after).';
        } else if (hasFunctionalDeficiency) {
          status = 'borderline';
          interpretation = 'Iron insufficiency with functional deficiency indicators (ferritin 31-50, elevated TIBC or low serum iron).';
          recommendation = 'Provider protocol: Metagenics Hemagenics. If symptomatic (fatigue, hair loss, restless legs), consider Prescription 65mg Elemental Iron.';
        } else {
          status = 'borderline';
          interpretation = 'Iron insufficiency (ferritin 31-50). Optimal is >50.';
          recommendation = 'Provider protocol: Metagenics Hemagenics if symptomatic (fatigue, hair loss, restless legs, exercise intolerance).';
        }
      } else if (labs.ferritin > 50 && labs.ferritin <= 150) {
        status = 'normal';
        interpretation = 'Ferritin within optimal range (>50).';
        recommendation = 'Adequate iron stores. No supplementation needed.';
      } else {
        status = 'borderline';
        interpretation = 'Elevated ferritin.';
        recommendation = 'May indicate inflammation, hemochromatosis, or liver disease. Correlate clinically.';
      }

      interpretations.push({
        category: 'Ferritin',
        value: labs.ferritin,
        unit: 'ng/mL',
        status,
        referenceRange: '>50 ng/mL (optimal)',
        interpretation,
        recommendation,
      });
    }

    // Vitamin D - Provider protocol: Goal ≥60 ng/mL
    // Deficient: ≤30, Insufficient: 31-40, Suboptimal: 41-59, Optimal: ≥60
    // Supplement tiers: ≤20 = D3 10,000+K, 21-40 = D3 5,000+K, 41-59 = D3 2000 Complex
    if (labs.vitaminD !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.vitaminD <= 20) {
        status = 'abnormal';
        interpretation = 'Severe Vitamin D deficiency (≤20 ng/mL). Associated with fatigue, bone loss, and immune dysfunction.';
        recommendation = 'High-dose repletion: Metagenics D3 10,000 + K daily for 8-12 weeks. Recheck levels after repletion.';
      } else if (labs.vitaminD > 20 && labs.vitaminD <= 30) {
        status = 'abnormal';
        interpretation = 'Vitamin D deficiency (21-30 ng/mL). Suboptimal for hormone and bone health.';
        recommendation = 'Repletion: Metagenics D3 5,000 + K daily. Target ≥60 ng/mL. Recheck in 8-12 weeks.';
      } else if (labs.vitaminD > 30 && labs.vitaminD <= 40) {
        status = 'borderline';
        interpretation = 'Vitamin D insufficient (31-40 ng/mL). Suboptimal for hormone optimization.';
        recommendation = 'Metagenics D3 5,000 + K daily. Target ≥60 ng/mL.';
      } else if (labs.vitaminD > 40 && labs.vitaminD < 60) {
        status = 'borderline';
        interpretation = 'Vitamin D adequate but suboptimal (41-59 ng/mL).';
        recommendation = 'Metagenics D3 2000 Complex daily to reach optimal range ≥60 ng/mL.';
      } else if (labs.vitaminD >= 60 && labs.vitaminD <= 100) {
        status = 'normal';
        interpretation = 'Vitamin D optimal (60-100 ng/mL). Supports hormone, bone, and immune health.';
        recommendation = 'Maintain current regimen. Monitor annually.';
      } else {
        status = 'abnormal';
        interpretation = 'Vitamin D elevated (>100 ng/mL). Monitor for toxicity signs.';
        recommendation = 'Hold supplementation. Monitor calcium levels. Recheck in 4-6 weeks.';
      }

      interpretations.push({
        category: 'Vitamin D (25-OH)',
        value: labs.vitaminD,
        unit: 'ng/mL',
        status,
        referenceRange: '≥60 ng/mL optimal',
        interpretation,
        recommendation,
      });
    }

    // Vitamin B12
    if (labs.vitaminB12 !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.vitaminB12 < 200) {
        status = 'abnormal';
        interpretation = 'B12 deficiency.';
        recommendation = 'B12 supplementation. Evaluate for pernicious anemia or malabsorption.';
      } else if (labs.vitaminB12 >= 200 && labs.vitaminB12 < 300) {
        status = 'borderline';
        interpretation = 'Low-normal B12.';
        recommendation = 'Consider supplementation especially if symptomatic.';
      } else if (labs.vitaminB12 >= 300 && labs.vitaminB12 <= 900) {
        status = 'normal';
        interpretation = 'B12 within normal range.';
        recommendation = 'No supplementation needed.';
      } else {
        status = 'borderline';
        interpretation = 'Elevated B12.';
        recommendation = 'Usually from supplementation. Rarely indicates liver disease.';
      }

      interpretations.push({
        category: 'Vitamin B12',
        value: labs.vitaminB12,
        unit: 'pg/mL',
        status,
        referenceRange: '200-900 pg/mL',
        interpretation,
        recommendation,
      });
    }

    // A1c
    if (labs.a1c !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.a1c >= 6.5) {
        status = 'abnormal';
        interpretation = 'A1c in diabetic range (≥6.5%).';
        recommendation = 'Diabetes diagnosis. Initiate comprehensive management plan.';
      } else if (labs.a1c >= 5.7 && labs.a1c < 6.5) {
        status = 'borderline';
        interpretation = 'Prediabetes range (5.7-6.4%).';
        recommendation = 'Lifestyle modifications. Consider metformin if high risk.';
      } else {
        status = 'normal';
        interpretation = 'Normal glycemic control.';
        recommendation = 'Continue healthy lifestyle.';
      }

      interpretations.push({
        category: 'Hemoglobin A1c',
        value: labs.a1c,
        unit: '%',
        status,
        referenceRange: '<5.7%',
        interpretation,
        recommendation,
      });
    }

    // LDL — if triglycerides are very high and LDL is absent, document why
    if (labs.ldl === undefined && labs.triglycerides !== undefined && labs.triglycerides >= 400) {
      interpretations.push({
        category: 'LDL Cholesterol',
        value: undefined,
        unit: 'mg/dL',
        status: 'borderline' as const,
        referenceRange: '<100 mg/dL optimal',
        interpretation: `LDL not reported — cannot be calculated when triglycerides are ≥400 mg/dL (${labs.triglycerides} mg/dL). ASCVD risk calculations requiring LDL were not performed.`,
        recommendation: 'Obtain direct LDL measurement (non-Friedewald method) once triglycerides are reduced. Address severely elevated triglycerides first: eliminate alcohol, reduce refined carbohydrates, consider fibrate therapy.',
      });
    }

    // Lipid Panel - Same as men but HDL thresholds differ
    if (labs.ldl !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.ldl >= 190) {
        status = 'abnormal';
        interpretation = 'Very high LDL - high cardiovascular risk.';
        recommendation = 'Statin therapy recommended. Intensive lifestyle changes.';
      } else if (labs.ldl >= 160 && labs.ldl < 190) {
        status = 'abnormal';
        interpretation = 'High LDL.';
        recommendation = 'Consider statin based on ASCVD risk. Lifestyle modifications.';
      } else if (labs.ldl >= 130 && labs.ldl < 160) {
        status = 'borderline';
        interpretation = 'Borderline high LDL.';
        recommendation = 'Lifestyle modifications. Consider statin if additional risk factors.';
      } else if (labs.ldl >= 100 && labs.ldl < 130) {
        status = 'borderline';
        interpretation = 'Near optimal LDL.';
        recommendation = 'Maintain healthy diet and exercise.';
      } else {
        status = 'normal';
        interpretation = 'Optimal LDL.';
        recommendation = 'Continue healthy lifestyle.';
      }

      interpretations.push({
        category: 'LDL Cholesterol',
        value: labs.ldl,
        unit: 'mg/dL',
        status,
        referenceRange: '<100 mg/dL optimal',
        interpretation,
        recommendation,
      });
    }

    // HDL - Higher optimal range for women
    if (labs.hdl !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.hdl < 50) {
        status = 'abnormal';
        interpretation = 'Low HDL - increased cardiovascular risk.';
        recommendation = 'Increase aerobic exercise. Consider niacin if very low.';
      } else if (labs.hdl >= 50 && labs.hdl < 60) {
        status = 'borderline';
        interpretation = 'HDL could be higher for optimal protection.';
        recommendation = 'Increase exercise. Moderate alcohol if appropriate.';
      } else {
        status = 'normal';
        interpretation = 'Good HDL level - protective.';
        recommendation = 'Maintain with regular exercise.';
      }

      interpretations.push({
        category: 'HDL Cholesterol',
        value: labs.hdl,
        unit: 'mg/dL',
        status,
        referenceRange: '≥50 mg/dL (optimal ≥60)',
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
        status = 'critical';
        interpretation = 'Very high triglycerides - pancreatitis risk.';
        recommendation = 'Strict diet. Consider fibrate therapy. Avoid alcohol.';
      } else if (labs.triglycerides >= 200 && labs.triglycerides < 500) {
        status = 'abnormal';
        interpretation = 'High triglycerides.';
        recommendation = 'Dietary changes. Reduce refined carbs and alcohol.';
      } else if (labs.triglycerides >= 150 && labs.triglycerides < 200) {
        status = 'borderline';
        interpretation = 'Borderline high triglycerides.';
        recommendation = 'Lifestyle modifications. Reduce sugar and alcohol.';
      } else {
        status = 'normal';
        interpretation = 'Normal triglycerides.';
        recommendation = 'Maintain healthy diet.';
      }

      interpretations.push({
        category: 'Triglycerides',
        value: labs.triglycerides,
        unit: 'mg/dL',
        status,
        referenceRange: '<150 mg/dL',
        interpretation,
        recommendation,
      });
    }

    // Liver enzymes - Female reference ranges (lower)
    if (labs.ast !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.ast > 5 * ULN.AST) {
        status = 'critical';
        interpretation = `Severe AST elevation (>5× ULN at ${5 * ULN.AST} U/L).`;
        recommendation = 'URGENT evaluation. Rule out hepatotoxicity, viral hepatitis.';
      } else if (labs.ast >= 2 * ULN.AST) {
        status = 'abnormal';
        interpretation = 'Moderate AST elevation.';
        recommendation = 'Evaluate for NAFLD, medications, viral hepatitis.';
      } else if (labs.ast > ULN.AST) {
        status = 'borderline';
        interpretation = 'Mild AST elevation.';
        recommendation = 'Lifestyle counseling. Repeat in 4-6 weeks.';
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
      });
    }

    if (labs.alt !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.alt > 5 * ULN.ALT) {
        status = 'critical';
        interpretation = `Severe ALT elevation (>5× ULN at ${5 * ULN.ALT} U/L).`;
        recommendation = 'URGENT evaluation. Hepatology consultation.';
      } else if (labs.alt >= 2 * ULN.ALT) {
        status = 'abnormal';
        interpretation = 'Moderate ALT elevation.';
        recommendation = 'Evaluate for NAFLD, medications. Repeat labs.';
      } else if (labs.alt > ULN.ALT) {
        status = 'borderline';
        interpretation = 'Mild ALT elevation.';
        recommendation = 'Lifestyle changes. Repeat in 4-6 weeks.';
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
      });
    }

    // FIB-4 Score Calculation (for patients with elevated LFTs)
    // FIB-4 = (Age × AST) / (Platelets × √ALT)
    // Only calculate if AST or ALT is elevated AND we have all required values
    const patientAgeForFib4 = labs.demographics?.age;
    if (patientAgeForFib4 !== undefined && 
        labs.ast !== undefined && 
        labs.alt !== undefined && 
        labs.platelets !== undefined &&
        labs.alt > 0 && // Prevent division by zero
        labs.platelets > 0 &&
        (labs.ast > ULN.AST || labs.alt > ULN.ALT)) { // Only if LFTs elevated
      
      // Platelets should be in 10^9/L (thousands). If value > 1000, assume it's per μL and convert
      const plateletsNormalized = labs.platelets > 1000 ? labs.platelets / 1000 : labs.platelets;
      
      const fib4Score = (patientAgeForFib4 * labs.ast) / (plateletsNormalized * Math.sqrt(labs.alt));
      const fib4Rounded = Math.round(fib4Score * 100) / 100;
      
      let fib4Status: LabInterpretation['status'] = 'normal';
      let fib4Interpretation = '';
      let fib4Recommendation = '';
      let fib4RecheckTiming = '';
      
      if (fib4Score < 1.30) {
        fib4Status = 'normal';
        fib4Interpretation = `FIB-4 score ${fib4Rounded} indicates LOW risk of advanced fibrosis (F0-F1). Negative predictive value >90%.`;
        fib4Recommendation = 'Advanced fibrosis unlikely. Continue lifestyle modifications and routine LFT monitoring. Address underlying cause of LFT elevation.';
      } else if (fib4Score >= 1.30 && fib4Score <= 2.67) {
        fib4Status = 'borderline';
        fib4Interpretation = `FIB-4 score ${fib4Rounded} is INDETERMINATE for fibrosis risk. Falls between low and high-risk thresholds.`;
        fib4Recommendation = 'Consider additional testing: FibroScan/elastography, enhanced liver fibrosis (ELF) test, or hepatology referral for further evaluation. Repeat FIB-4 in 3-6 months.';
        fib4RecheckTiming = '3-6 months';
      } else {
        fib4Status = 'abnormal';
        fib4Interpretation = `FIB-4 score ${fib4Rounded} indicates HIGH risk of advanced fibrosis (F3-F4). Positive predictive value ~65%.`;
        fib4Recommendation = 'HEPATOLOGY REFERRAL recommended. Consider FibroScan to confirm. Screen for varices if cirrhosis suspected. Avoid hepatotoxic medications.';
        fib4RecheckTiming = '1-2 months';
      }
      
      interpretations.push({
        category: 'FIB-4 Score (Liver Fibrosis)',
        value: fib4Rounded,
        unit: 'score',
        status: fib4Status,
        referenceRange: '<1.30 low risk, 1.30-2.67 indeterminate, >2.67 high risk',
        interpretation: fib4Interpretation,
        recommendation: fib4Recommendation,
        recheckTiming: fib4RecheckTiming,
      });
    }

    // eGFR - Kidney function
    if (labs.egfr !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.egfr < 45) {
        status = 'critical';
        interpretation = 'Significantly reduced kidney function.';
        recommendation = 'PROVIDER REVIEW. Nephrology referral.';
      } else if (labs.egfr >= 45 && labs.egfr < 60) {
        status = 'borderline';
        interpretation = 'Borderline kidney function.';
        recommendation = 'Hydrate well. Avoid NSAIDs. Repeat in 2-4 weeks.';
      } else {
        status = 'normal';
        interpretation = 'Normal kidney function.';
        recommendation = 'Routine care.';
      }

      interpretations.push({
        category: 'eGFR',
        value: labs.egfr,
        unit: 'mL/min',
        status,
        referenceRange: '≥60 mL/min',
        interpretation,
        recommendation,
      });
    }

    // Creatinine - Female reference (lower)
    if (labs.creatinine !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.creatinine > 1.2) {
        status = 'abnormal';
        interpretation = 'Elevated creatinine.';
        recommendation = 'Evaluate kidney function. Check eGFR.';
      } else if (labs.creatinine > 1.0) {
        status = 'borderline';
        interpretation = 'Borderline creatinine.';
        recommendation = 'Monitor hydration. Repeat in 2-4 weeks.';
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
        referenceRange: '≤1.0 mg/dL',
        interpretation,
        recommendation,
      });
    }

    // Apo B
    if (labs.apoB !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.apoB >= 130) {
        status = 'abnormal';
        interpretation = 'Elevated Apo B - increased cardiovascular risk.';
        recommendation = 'Consider statin therapy. Intensive lifestyle modifications.';
      } else if (labs.apoB >= 90 && labs.apoB < 130) {
        status = 'borderline';
        interpretation = 'Borderline elevated Apo B.';
        recommendation = 'Lifestyle modifications. Consider pharmacotherapy if high ASCVD risk.';
      } else {
        status = 'normal';
        interpretation = 'Apo B at optimal level.';
        recommendation = 'Continue current lifestyle.';
      }

      interpretations.push({
        category: 'Apolipoprotein B',
        value: labs.apoB,
        unit: 'mg/dL',
        status,
        referenceRange: '<90 mg/dL optimal',
        interpretation,
        recommendation,
      });
    }

    // Lp(a) - Per clinic protocol with unit detection
    // Values ≥200 treated as nmol/L, <200 as mg/dL
    // mg/dL thresholds: <29 normal, ≥29 elevated, ≥50 risk enhancer (increases CVD category)
    // nmol/L thresholds: <75 normal, ≥75 elevated, ≥125 risk enhancer
    if (labs.lpa !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      
      // Detect unit based on value magnitude
      const isNmolL = labs.lpa >= 200;
      const unit = isNmolL ? 'nmol/L' : 'mg/dL';

      if (isNmolL) {
        // nmol/L thresholds
        if (labs.lpa >= 125) {
          status = 'abnormal';
          interpretation = 'Elevated Lp(a) - RISK ENHANCER. Increases CVD risk category.';
          recommendation = 'Lp(a) ≥125 nmol/L is a risk enhancer - consider upgrading CVD risk category. Aggressive LDL lowering indicated. Discuss hereditary nature.';
        } else if (labs.lpa >= 75) {
          status = 'abnormal';
          interpretation = 'Elevated Lp(a) - genetic cardiovascular risk factor.';
          recommendation = 'Lp(a) is genetically determined. Consider more aggressive LDL lowering. CAC scoring may help refine risk.';
        } else {
          status = 'normal';
          interpretation = 'Lp(a) within optimal range.';
          recommendation = 'Continue current lifestyle. Routine monitoring.';
        }
      } else {
        // mg/dL thresholds: ≥29 elevated, ≥50 risk enhancer
        if (labs.lpa >= 50) {
          status = 'abnormal';
          interpretation = 'Elevated Lp(a) - RISK ENHANCER. Increases CVD risk category.';
          recommendation = 'Lp(a) ≥50 mg/dL is a risk enhancer - consider upgrading CVD risk category. Aggressive LDL lowering indicated. Discuss hereditary nature.';
        } else if (labs.lpa >= 29) {
          status = 'abnormal';
          interpretation = 'Elevated Lp(a) - genetic cardiovascular risk factor.';
          recommendation = 'Lp(a) is genetically determined. Consider more aggressive LDL lowering. CAC scoring may help refine risk.';
        } else {
          status = 'normal';
          interpretation = 'Lp(a) within optimal range.';
          recommendation = 'Continue current lifestyle. Routine monitoring.';
        }
      }

      const referenceRange = isNmolL 
        ? '<75 nmol/L normal, ≥75 elevated, ≥125 risk enhancer'
        : '<29 mg/dL normal, ≥29 elevated, ≥50 risk enhancer';

      interpretations.push({
        category: 'Lipoprotein(a)',
        value: labs.lpa,
        unit,
        status,
        referenceRange,
        interpretation,
        recommendation,
      });
    }

    // TIBC
    if (labs.tibc !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.tibc > 450) {
        status = 'abnormal';
        interpretation = 'Elevated TIBC - suggestive of iron deficiency.';
        recommendation = 'Evaluate iron stores. Check ferritin, serum iron.';
      } else if (labs.tibc < 250) {
        status = 'borderline';
        interpretation = 'Low TIBC - possible iron overload or chronic disease.';
        recommendation = 'Evaluate for hemochromatosis or chronic inflammation.';
      } else {
        status = 'normal';
        interpretation = 'TIBC within normal limits.';
        recommendation = 'Routine monitoring.';
      }

      interpretations.push({
        category: 'TIBC (Iron Binding Capacity)',
        value: labs.tibc,
        unit: 'ug/dL',
        status,
        referenceRange: '250-450 ug/dL',
        interpretation,
        recommendation,
      });
    }

    // Serum Iron
    if (labs.iron !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.iron < 40) {
        status = 'abnormal';
        interpretation = 'Low serum iron - iron deficiency.';
        recommendation = 'Iron supplementation. Evaluate for blood loss.';
      } else if (labs.iron > 170) {
        status = 'borderline';
        interpretation = 'Elevated serum iron.';
        recommendation = 'Evaluate for hemochromatosis. Check ferritin.';
      } else {
        status = 'normal';
        interpretation = 'Serum iron within normal limits.';
        recommendation = 'Routine monitoring.';
      }

      interpretations.push({
        category: 'Serum Iron',
        value: labs.iron,
        unit: 'ug/dL',
        status,
        referenceRange: '40-170 ug/dL',
        interpretation,
        recommendation,
      });
    }

    // Iron Saturation (Transferrin Saturation / TSAT)
    // Normal: 20-45%; Low (<20%): iron deficiency or functional deficiency; High (>45%): iron overload concern
    if (labs.ironSaturation !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.ironSaturation < 16) {
        status = 'abnormal';
        const ferritinContext = labs.ferritin !== undefined
          ? labs.ferritin < 30
            ? ' With low ferritin, this confirms iron deficiency anemia.'
            : labs.ferritin >= 100
              ? ' With normal-to-high ferritin, consider functional iron deficiency (anemia of chronic disease).'
              : ''
          : '';
        interpretation = `Low iron saturation (${labs.ironSaturation.toFixed(1)}%) — significant reduction in iron transport capacity.${ferritinContext}`;
        recommendation = 'Iron supplementation indicated. Evaluate for blood loss (menorrhagia, GI). If ferritin is normal or high with low TSAT, consider anemia of chronic disease rather than iron deficiency; treat the underlying inflammation.';
      } else if (labs.ironSaturation >= 16 && labs.ironSaturation < 20) {
        status = 'borderline';
        interpretation = `Borderline-low iron saturation (${labs.ironSaturation.toFixed(1)}%). Suggests developing iron deficiency or suboptimal iron transport.`;
        recommendation = 'Correlate with ferritin and serum iron. Consider iron supplementation if symptomatic (fatigue, hair loss, restless legs). Recheck iron studies in 3 months.';
      } else if (labs.ironSaturation >= 20 && labs.ironSaturation <= 45) {
        status = 'normal';
        interpretation = `Iron saturation ${labs.ironSaturation.toFixed(1)}% — within normal range, adequate iron transport.`;
        recommendation = 'Routine monitoring.';
      } else if (labs.ironSaturation > 45 && labs.ironSaturation <= 55) {
        status = 'borderline';
        interpretation = `Iron saturation mildly elevated (${labs.ironSaturation.toFixed(1)}%). May indicate early iron excess or high dietary iron intake.`;
        recommendation = 'Correlate with ferritin. If ferritin also elevated, evaluate for hemochromatosis (HFE gene testing).';
      } else {
        status = 'abnormal';
        interpretation = `Elevated iron saturation (${labs.ironSaturation.toFixed(1)}%) — suggests iron overload. Hemochromatosis or excessive supplementation should be considered.`;
        recommendation = 'Check ferritin. If both TSAT >45% and ferritin elevated, order HFE gene testing (C282Y, H63D mutations). Reduce iron supplementation. Refer to gastroenterology if hemochromatosis confirmed.';
      }

      interpretations.push({
        category: 'Iron Saturation (TSAT)',
        value: labs.ironSaturation,
        unit: '%',
        status,
        referenceRange: '20-45%',
        interpretation,
        recommendation,
      });
    }

    // Folate
    if (labs.folate !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.folate < 3) {
        status = 'abnormal';
        interpretation = 'Folate deficiency.';
        recommendation = 'Folate supplementation. Critical if planning pregnancy.';
      } else if (labs.folate < 5) {
        status = 'borderline';
        interpretation = 'Low-normal folate.';
        recommendation = 'Consider supplementation, especially if planning pregnancy.';
      } else {
        status = 'normal';
        interpretation = 'Folate within normal limits.';
        recommendation = 'Continue folic acid if reproductive age.';
      }

      interpretations.push({
        category: 'Folate',
        value: labs.folate,
        unit: 'ng/mL',
        status,
        referenceRange: '>5 ng/mL',
        interpretation,
        recommendation,
      });
    }

    // hs-CRP (using mg/L - standard lab reporting unit)
    // Clinical thresholds: <1.0 mg/L = low risk, 1.0-3.0 mg/L = moderate, >3.0 mg/L = high, >10.0 mg/L = acute
    if (labs.hsCRP !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.hsCRP >= 10.0) {
        status = 'critical';
        interpretation = 'Markedly elevated hs-CRP - acute inflammation.';
        recommendation = 'Evaluate for infection or inflammatory condition.';
      } else if (labs.hsCRP > 3.0) {
        status = 'abnormal';
        interpretation = 'Elevated hs-CRP - increased cardiovascular risk.';
        recommendation = 'Address cardiovascular risk factors. Consider repeat testing.';
      } else if (labs.hsCRP >= 1.0) {
        status = 'borderline';
        interpretation = 'Borderline hs-CRP - moderate cardiovascular risk.';
        recommendation = 'Lifestyle modifications. Continue monitoring.';
      } else {
        status = 'normal';
        interpretation = 'Low cardiovascular inflammation risk.';
        recommendation = 'Continue healthy lifestyle.';
      }

      interpretations.push({
        category: 'hs-CRP',
        value: labs.hsCRP,
        unit: 'mg/L',
        status,
        referenceRange: '<1.0 mg/L low risk, 1.0-3.0 mg/L moderate, >3.0 mg/L high',
        interpretation,
        recommendation,
      });
    }

    // ============================================================
    // COMBINED HORMONE PATTERN EVALUATION (Women 35+)
    // These patterns identify clinically significant hormone imbalances
    // that may not be apparent from individual lab values alone
    // Only applied to patients age 35 and older
    // ============================================================
    
    const patientAge = labs.demographics?.age;
    const isAge35Plus = patientAge !== undefined && patientAge >= 35;
    
    // Operational marker — individual hormone values intentionally omitted from logs
    console.log('[Clinical Logic] evaluating hormone patterns age35Plus=' + isAge35Plus);
    
    if (isAge35Plus) {
      // One-winner-per-subset system: only the most clinically specific pattern fires
      // for each hormone category (progesterone, estrogen). Independent patterns fire freely.
      let progesteronePatternIdentified = false;
      let estrogenPatternIdentified = false;
      const patientAgeForPeri = patientAge;

      // ════════════════════════════════════════════════════════════════
      // PROGESTERONE SUBSET — only the highest-priority match fires
      // Priority order (most specific → least specific):
      //   1. Luteal-phase or postmenopausal phase-specific assessment
      //   2. Estrogen Volatility/Spiking (E2 >200 + P4 <5 + age ≥35)
      //   3. Estrogen Dominance Pattern (E2 >150 + P4 <5)
      //   4. Estrogen Dominance – symptom focus (E2 ≥250 + P4 <3)
      //   5. Luteal Progesterone Deficiency (age ≥35 + P4 <5 + E2 ≥60)
      //   6. Relative Progesterone Deficiency (E2 >100 + P4 <8)
      //   7. Early Perimenopause – FSH rising (FSH 8–15 + P4 <5 + age ≥35)
      //   8. Low Progesterone – Phase Not Documented (fallback)
      // ════════════════════════════════════════════════════════════════

      // ── P1: Phase-specific assessment (most specific — phase is documented) ──
      if (!progesteronePatternIdentified && labs.progesterone !== undefined) {
        const currentPhase = labs.menstrualPhase || 'unknown';

        if (currentPhase === 'luteal') {
          progesteronePatternIdentified = true;
          if (labs.progesterone >= 10) {
            interpretations.push({
              category: 'Perimenopause Assessment: Luteal Progesterone',
              value: labs.progesterone,
              unit: 'ng/mL',
              status: 'normal',
              referenceRange: '≥10 ng/mL optimal, 8–10 borderline, <8 low, <5 anovulatory',
              interpretation: `Luteal progesterone of ${labs.progesterone} ng/mL indicates robust ovulation. This is an optimal level suggesting good ovarian function.`,
              recommendation: `PROVIDER RECOMMENDATION: Ovulatory function appears intact. Continue monitoring as part of routine perimenopause surveillance. PATIENT EDUCATION: Your progesterone level shows healthy ovulation this cycle.`,
            });
          } else if (labs.progesterone >= 8) {
            interpretations.push({
              category: 'Perimenopause Assessment: Luteal Progesterone',
              value: labs.progesterone,
              unit: 'ng/mL',
              status: 'borderline',
              referenceRange: '≥10 ng/mL optimal, 8–10 borderline, <8 low, <5 anovulatory',
              interpretation: `Luteal progesterone of ${labs.progesterone} ng/mL indicates borderline luteal adequacy. Ovulation occurred but corpus luteum function may be suboptimal.`,
              recommendation: `PROVIDER RECOMMENDATION: Monitor for symptoms of luteal phase deficiency (short cycles, premenstrual spotting, difficulty maintaining pregnancy). Consider repeat testing next cycle. If symptomatic, progesterone supplementation may help. PATIENT EDUCATION: Your progesterone is in a borderline range. This can happen as ovarian function begins to shift in perimenopause.`,
            });
          } else if (labs.progesterone >= 5) {
            interpretations.push({
              category: 'Perimenopause Assessment: Luteal Progesterone',
              value: labs.progesterone,
              unit: 'ng/mL',
              status: 'abnormal',
              referenceRange: '≥10 ng/mL optimal, 8–10 borderline, <8 low, <5 anovulatory',
              interpretation: `Luteal progesterone of ${labs.progesterone} ng/mL is functionally low — a hallmark of perimenopause. This level suggests ovulation may have occurred but with inadequate luteal support.`,
              recommendation: `PROVIDER RECOMMENDATION: This is a perimenopause indicator. If patient has symptoms (sleep disruption, anxiety, PMS, irregular cycles), consider micronized progesterone 100–200 mg nightly in luteal phase or continuously. PATIENT EDUCATION: Your progesterone level suggests your ovaries are producing less than optimal amounts. This is common in perimenopause and can cause sleep problems, mood changes, and cycle irregularities. Progesterone supplementation can help.`,
            });
          } else {
            interpretations.push({
              category: 'Perimenopause Assessment: Luteal Progesterone',
              value: labs.progesterone,
              unit: 'ng/mL',
              status: 'abnormal',
              referenceRange: '≥10 ng/mL optimal, 8–10 borderline, <8 low, <5 anovulatory',
              interpretation: `Luteal progesterone of ${labs.progesterone} ng/mL indicates anovulation or luteal failure. This cycle was likely anovulatory — a common perimenopause finding.`,
              recommendation: `PROVIDER RECOMMENDATION: Anovulatory cycle confirmed. If recurrent, this signals advancing perimenopause. Consider progesterone for symptom management: micronized progesterone 100 mg nightly continuously, or cyclically if patient prefers withdrawal bleeds. Discuss HRT options if symptomatic. PATIENT EDUCATION: This level indicates you likely did not ovulate this cycle, which is common in perimenopause. This can cause irregular periods, heavy bleeding, and other symptoms. Treatment is available to help regulate your cycles and relieve symptoms.`,
            });
          }
        } else if (currentPhase === 'postmenopausal' && labs.progesterone > 1) {
          progesteronePatternIdentified = true;
          interpretations.push({
            category: 'Hormone Pattern: Elevated Postmenopausal Progesterone',
            value: labs.progesterone,
            unit: 'ng/mL',
            status: 'borderline',
            referenceRange: '<1 ng/mL expected postmenopausal',
            interpretation: `Progesterone of ${labs.progesterone} ng/mL is unexpectedly elevated for postmenopausal status. This may indicate exogenous progesterone use, adrenal source, or lab timing issue.`,
            recommendation: `PROVIDER RECOMMENDATION: Confirm patient is not on progesterone therapy. If no exogenous source, consider adrenal evaluation. PATIENT EDUCATION: Your progesterone level is higher than expected after menopause. We should confirm you're not taking any progesterone supplements.`,
          });
        }
        // follicular/ovulatory/other phases: progesterone not interpreted as a perimenopause pattern
      }

      // ── P2: Estrogen Volatility / Spiking (E2 >200 + P4 <5 + age ≥35) ──
      if (!progesteronePatternIdentified &&
          patientAgeForPeri !== undefined && patientAgeForPeri >= 35 &&
          labs.estradiol !== undefined && labs.estradiol > 200 &&
          labs.progesterone !== undefined && labs.progesterone < 5) {
        progesteronePatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Estrogen Volatility/Spiking',
          value: labs.estradiol,
          unit: 'pg/mL',
          status: 'abnormal',
          referenceRange: 'E2 >200 with P4 <5 indicates hormone instability',
          interpretation: `Estradiol of ${labs.estradiol} pg/mL with progesterone of ${labs.progesterone} ng/mL in a ${patientAgeForPeri}-year-old indicates estrogen volatility — the "hormone rollercoaster" of perimenopause. These spikes can cause paradoxical symptoms like anxiety surges, panic episodes, night sweats, palpitations, and sudden mood swings.`,
          recommendation: `PROVIDER RECOMMENDATION: Progesterone stabilization is first-line: micronized progesterone 100–200 mg nightly. If symptoms are paradoxical (anxiety surges, panic, palpitations despite high E2), consider adding low-dose transdermal estradiol (0.025 mg) to smooth out the spikes. PATIENT EDUCATION: Your estrogen is spiking high, which can feel like a rollercoaster — anxiety, heart racing, sleep disruption, mood swings. This is your ovaries' erratic signaling in perimenopause. Progesterone helps stabilize the swings. Sometimes low-dose estrogen also helps by "quieting" the erratic surges.`,
        });
      }

      // ── P3: Estrogen Dominance Pattern (E2 >150 + P4 <5) ──
      if (!progesteronePatternIdentified &&
          labs.estradiol !== undefined && labs.estradiol > 150 &&
          labs.progesterone !== undefined && labs.progesterone < 5) {
        progesteronePatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Estrogen Dominance Pattern',
          value: labs.estradiol,
          unit: 'pg/mL',
          status: 'abnormal',
          referenceRange: 'E2 >150 with P4 <5 indicates unopposed estrogen',
          interpretation: `Estradiol of ${labs.estradiol} pg/mL with progesterone of only ${labs.progesterone} ng/mL represents estrogen dominance. This is not excess estrogen production — it reflects ovulatory dysfunction where estrogen continues but ovulation (and thus progesterone) fails. Associated symptoms include insomnia or 3am waking, anxiety, breast tenderness, migraines, and heavy or irregular cycles.`,
          recommendation: `PROVIDER RECOMMENDATION: Add progesterone first — do not attempt to suppress estrogen. Micronized progesterone 100–200 mg nightly provides opposition and symptom relief. Avoid language about "too much estrogen" — the issue is inadequate progesterone from anovulatory cycles. PATIENT EDUCATION: Your estrogen is in the higher range, but the real issue is that progesterone hasn't kept up. This happens when ovulation becomes irregular in perimenopause. Adding progesterone will help balance things out and relieve symptoms like heavy periods, breast tenderness, and mood swings.`,
        });
      }

      // ── P4: Estrogen Dominance — symptom-focused (E2 ≥250 + P4 <3) ──
      // Note: usually superseded by P3 above; fires only if P3 did not
      if (!progesteronePatternIdentified &&
          labs.estradiol !== undefined && labs.estradiol >= 250 &&
          labs.progesterone !== undefined && labs.progesterone < 3) {
        progesteronePatternIdentified = true;
        interpretations.push({
          category: 'Hormone Pattern: Estrogen Dominance',
          value: labs.estradiol,
          unit: 'pg/mL E2 / ng/mL P4',
          status: 'abnormal',
          referenceRange: 'E2:P4 ratio should be balanced',
          interpretation: `Estrogen spike (${labs.estradiol} pg/mL) with low progesterone (${labs.progesterone} ng/mL) detected. This pattern indicates estrogen dominance/unopposed estrogen. Associated symptoms include: insomnia or 3am waking, anxiety, breast tenderness, migraines, and heavy or short menstrual cycles.`,
          recommendation: `PROVIDER RECOMMENDATION: If insomnia/anxiety prominent, consider micronized progesterone at bedtime. Continuous dosing: 100 mg nightly. If vasomotor symptoms (VMS) also present, consider low-dose transdermal estradiol patch + progesterone (if uterus intact). PATIENT EDUCATION: This hormone imbalance may cause sleep disruption, mood changes, and menstrual irregularities. Progesterone supplementation can help restore balance and improve symptoms.`,
        });
      }

      // ── P5: Luteal Progesterone Deficiency (age ≥35 + P4 <5 + E2 ≥60) ──
      if (!progesteronePatternIdentified &&
          patientAgeForPeri !== undefined && patientAgeForPeri >= 35 &&
          labs.progesterone !== undefined && labs.progesterone < 5 &&
          labs.estradiol !== undefined && labs.estradiol >= 60) {
        progesteronePatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Luteal Progesterone Deficiency',
          value: labs.progesterone,
          unit: 'ng/mL',
          status: 'abnormal',
          referenceRange: 'P4 ≥5 ng/mL expected with E2 ≥60 pg/mL',
          interpretation: `Progesterone of ${labs.progesterone} ng/mL with estradiol of ${labs.estradiol} pg/mL in a woman ${patientAgeForPeri} years old indicates luteal progesterone deficiency. Estrogen production is adequate but progesterone is not keeping pace — a hallmark of perimenopause.`,
          recommendation: `PROVIDER RECOMMENDATION: Micronized progesterone 100–200 mg nightly. Dosing can be cyclic (days 14–28) or continuous depending on cycle regularity. Progesterone provides GABAergic support for sleep and anxiety relief. PATIENT EDUCATION: Your body is making enough estrogen, but progesterone has dropped. This is very common in perimenopause and causes sleep disruption, anxiety, and mood changes. Progesterone supplementation supports your nervous system and helps restore calm, restful sleep.`,
        });
      }

      // ── P6: Relative Progesterone Deficiency (E2 >100 + P4 <8) ──
      if (!progesteronePatternIdentified &&
          labs.estradiol !== undefined && labs.estradiol > 100 &&
          labs.progesterone !== undefined && labs.progesterone < 8) {
        progesteronePatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Relative Progesterone Deficiency',
          value: labs.progesterone,
          unit: 'ng/mL',
          status: 'abnormal',
          referenceRange: 'E2 >100 should have P4 ≥8 for adequate opposition',
          interpretation: `Estradiol of ${labs.estradiol} pg/mL with progesterone of only ${labs.progesterone} ng/mL indicates relative progesterone deficiency. The estrogen is not being adequately opposed by progesterone, which can lead to estrogen dominance symptoms.`,
          recommendation: `PROVIDER RECOMMENDATION: Consider progesterone supplementation to balance the E2:P4 ratio. Micronized progesterone 100–200 mg nightly can provide adequate opposition. If patient has symptoms (insomnia, anxiety, heavy bleeding, breast tenderness), progesterone should help. PATIENT EDUCATION: Your estrogen level is good, but your progesterone is not keeping up. This imbalance can cause sleep problems, mood changes, and heavy periods. Progesterone supplementation can help restore balance.`,
        });
      }

      // ── P7: Early Perimenopause — FSH rising (FSH 8–15 + P4 <5 + age ≥35) ──
      if (!progesteronePatternIdentified &&
          patientAgeForPeri !== undefined && patientAgeForPeri >= 35 &&
          labs.fsh !== undefined && labs.fsh >= 8 && labs.fsh <= 15 &&
          labs.progesterone !== undefined && labs.progesterone < 5) {
        progesteronePatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Early Perimenopause',
          value: labs.fsh,
          unit: 'mIU/mL',
          status: 'borderline',
          referenceRange: 'FSH 8–15 with P4 <5 indicates early transition',
          interpretation: `FSH of ${labs.fsh} mIU/mL with progesterone of ${labs.progesterone} ng/mL in a ${patientAgeForPeri}-year-old indicates early perimenopause. The brain is starting to signal harder (rising FSH) because ovarian response is becoming unpredictable. This is the beginning of the transition.`,
          recommendation: `PROVIDER RECOMMENDATION: Progesterone is foundational at this stage: micronized progesterone 100 mg nightly for sleep and nervous system support. Begin the hormone continuity discussion — frame HRT as future-forward planning, not crisis intervention. Nervous system calming messaging matters. PATIENT EDUCATION: Your body is entering the perimenopause transition. Your brain is working a little harder to communicate with your ovaries, and ovulation is becoming less consistent. This can cause sleep changes, anxiety, and cycle irregularities. Progesterone support now can smooth this transition and protect your quality of life.`,
        });
      }

      // ── P8: Low Progesterone — Phase Not Documented (lowest-priority fallback) ──
      // Only fires when phase is unknown/not selected; follicular/ovulatory phases expect low P4 (normal)
      if (!progesteronePatternIdentified &&
          labs.progesterone !== undefined && labs.progesterone < 5 &&
          (labs.menstrualPhase === undefined || labs.menstrualPhase === 'unknown')) {
        progesteronePatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Low Progesterone (Phase Not Documented)',
          value: labs.progesterone,
          unit: 'ng/mL',
          status: 'borderline',
          referenceRange: 'Varies by cycle phase; <5 ng/mL suggests anovulation if luteal',
          interpretation: `Progesterone is ${labs.progesterone} ng/mL. Without documented cycle phase or sufficient estradiol/FSH context to identify a specific pattern, interpretation is limited. If drawn in the luteal phase, this level would indicate anovulation — a perimenopause marker.`,
          recommendation: `PROVIDER RECOMMENDATION: Document cycle phase for accurate interpretation. If the patient is mid-cycle or in the luteal phase, this suggests anovulation. Consider symptoms: sleep disruption, anxiety, irregular cycles. If symptomatic, empiric progesterone (100 mg nightly) is reasonable. PATIENT EDUCATION: Knowing where you are in your menstrual cycle helps us fully interpret this result. Please note when your last period started so we can better understand your hormone picture.`,
        });
      }

      // ════════════════════════════════════════════════════════════════
      // ESTROGEN SUBSET — only the highest-priority match fires
      // Priority order (most specific → least specific):
      //   1. Hypoestrogenic Pattern (E2 <50 + FSH >10) — FSH confirms deficiency
      //   2. Hypoestrogen State (E2 <30 + symptoms)
      //   3. Vasomotor Symptoms with Fluctuating Estrogen (VMS + E2 ≥30)
      //   4. Reduced Bioavailable Estrogen / SHBG Binding (SHBG >80 + E2 60–100)
      // ════════════════════════════════════════════════════════════════

      // ── E1: Hypoestrogenic Pattern (E2 <50 + FSH >10) ──
      if (!estrogenPatternIdentified &&
          labs.estradiol !== undefined && labs.estradiol < 50 &&
          labs.fsh !== undefined && labs.fsh > 10) {
        estrogenPatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Hypoestrogenic Pattern',
          value: labs.estradiol,
          unit: 'pg/mL',
          status: 'abnormal',
          referenceRange: 'E2 <50 with FSH >10 indicates estrogen deficiency',
          interpretation: `Estradiol of ${labs.estradiol} pg/mL with FSH of ${labs.fsh} mIU/mL indicates hypoestrogenic perimenopause — the "crash phase." Estrogen production has dropped significantly and the brain is signaling strongly (elevated FSH) trying to stimulate the ovaries.`,
          recommendation: `PROVIDER RECOMMENDATION: Transdermal estradiol 0.025–0.05 mg is appropriate replacement therapy. Add micronized progesterone for uterine protection and sleep support. Frame this as hormone replacement, not stimulation — we are restoring what the body needs. PATIENT EDUCATION: Your estrogen has dropped to a level that can cause symptoms like hot flashes, night sweats, brain fog, and mood changes. Replacing estrogen with a patch or gel can relieve these symptoms and protect your long-term health. Progesterone is added to protect your uterus and help with sleep.`,
        });
      }

      // ── E2: Hypoestrogen State (E2 <30 + symptoms) ──
      if (!estrogenPatternIdentified &&
          labs.estradiol !== undefined && labs.estradiol < 30) {
        const hasHypoEstrogenSymptoms = 
          labs.hotFlashes === true || labs.nightSweats === true ||
          labs.vaginalDryness === true || labs.frequentUTIs === true ||
          labs.jointAches === true || labs.sleepDisruption === true;
        if (hasHypoEstrogenSymptoms) {
          estrogenPatternIdentified = true;
          const symptomsPresent: string[] = [];
          if (labs.hotFlashes) symptomsPresent.push('hot flashes');
          if (labs.nightSweats) symptomsPresent.push('night sweats');
          if (labs.vaginalDryness) symptomsPresent.push('vaginal dryness');
          if (labs.frequentUTIs) symptomsPresent.push('frequent UTIs');
          if (labs.jointAches) symptomsPresent.push('joint aches');
          if (labs.sleepDisruption) symptomsPresent.push('sleep disruption');
          interpretations.push({
            category: 'Hormone Pattern: Hypoestrogen State',
            value: labs.estradiol,
            unit: 'pg/mL',
            status: 'abnormal',
            referenceRange: 'Provider target: 60–100 pg/mL (>40 minimum)',
            interpretation: `Low estradiol (${labs.estradiol} pg/mL) with symptomatic presentation: ${symptomsPresent.join(', ')}. This pattern is consistent with a low estrogen state, especially in late perimenopause or postmenopause.`,
            recommendation: `PROVIDER RECOMMENDATION: Consider transdermal estradiol initiation (product dependent). Add micronized progesterone 100 mg nightly if patient has uterus. Monitor symptoms and estradiol levels. PATIENT EDUCATION: Low estrogen can cause the symptoms you're experiencing. Hormone replacement therapy (HRT) with estradiol can help relieve these symptoms and protect bone and cardiovascular health.`,
          });
        }
      }

      // ── E3: Vasomotor Symptoms with Fluctuating Estrogen (VMS + E2 ≥30) ──
      if (!estrogenPatternIdentified &&
          (labs.hotFlashes === true || labs.nightSweats === true) &&
          labs.estradiol !== undefined && labs.estradiol >= 30) {
        estrogenPatternIdentified = true;
        const vmsSymptoms: string[] = [];
        if (labs.hotFlashes) vmsSymptoms.push('hot flashes');
        if (labs.nightSweats) vmsSymptoms.push('night sweats');
        interpretations.push({
          category: 'Hormone Pattern: Vasomotor Symptoms with Fluctuating Estrogen',
          value: labs.estradiol,
          unit: 'pg/mL',
          status: 'borderline',
          referenceRange: 'Symptoms indicate hormonal instability despite E2 level',
          interpretation: `Vasomotor symptoms (${vmsSymptoms.join(', ')}) present despite estradiol level of ${labs.estradiol} pg/mL. In perimenopause, estrogen can be spiky and fluctuating, causing vasomotor symptoms even when levels appear normal or high at time of draw.`,
          recommendation: `PROVIDER RECOMMENDATION: Consider steady delivery: transdermal estradiol patch starting at 0.0375 mg/day (common starting dose for twice-weekly systems). Add micronized progesterone 100 mg nightly if patient has uterus. Goal is symptom control through stable hormone delivery. PATIENT EDUCATION: Your hot flashes and night sweats may be caused by fluctuating hormone levels rather than consistently low estrogen. A steady-release estrogen patch can help stabilize your levels and reduce symptoms.`,
        });
      }

      // ── E4: Reduced Bioavailable Estrogen / SHBG Binding (SHBG >80 + E2 60–100) ──
      if (!estrogenPatternIdentified &&
          labs.estradiol !== undefined && labs.estradiol >= 60 && labs.estradiol <= 100 &&
          labs.shbg !== undefined && labs.shbg > 80) {
        estrogenPatternIdentified = true;
        interpretations.push({
          category: 'Perimenopause Assessment: Reduced Bioavailable Estrogen',
          value: labs.shbg,
          unit: 'nmol/L',
          status: 'borderline',
          referenceRange: 'SHBG >80 with E2 60–100 reduces free estrogen',
          interpretation: `SHBG of ${labs.shbg} nmol/L with estradiol of ${labs.estradiol} pg/mL indicates reduced bioavailable estrogen. While total estradiol appears "normal," high SHBG binds it tightly, leaving less free hormone available to tissues. This is a hidden deficiency.`,
          recommendation: `PROVIDER RECOMMENDATION: Do not dismiss symptoms as "normal labs." Consider testosterone optimization — testosterone can lower SHBG. Address metabolic contributors (thyroid, insulin sensitivity). If symptomatic, may need higher estradiol targets to overcome SHBG binding. PATIENT EDUCATION: Your estrogen level looks normal on paper, but a protein called SHBG is binding it up so your body can't use it effectively. This can cause symptoms even with "normal" labs. We may need to address the SHBG or optimize other hormones like testosterone to help you feel better.`,
        });
      }

      // ════════════════════════════════════════════════════════════════
      // INDEPENDENT PATTERNS — fire whenever triggered, regardless of above flags
      // ════════════════════════════════════════════════════════════════

      // Pattern 5: FSH-Based Perimenopause / Menopause Staging (always fires if FSH ≥25)
      // Pattern 5 threshold check — FSH value omitted from log
      if (labs.fsh !== undefined && labs.fsh >= 25) {
        // Pattern 5 matched — Perimenopause/Menopause (FSH value omitted from log)
        const isPostmenopausal = labs.menstrualPhase === 'postmenopausal';
        const symptomsPresent: string[] = [];
        if (labs.hotFlashes) symptomsPresent.push('hot flashes');
        if (labs.nightSweats) symptomsPresent.push('night sweats');
        if (labs.sleepDisruption) symptomsPresent.push('sleep disruption');
        if (labs.vaginalDryness) symptomsPresent.push('vaginal dryness');

        let stage = 'perimenopause';
        let stageDescription = '';
        if (labs.fsh >= 40 || isPostmenopausal) {
          stage = 'menopause';
          stageDescription = labs.estradiol !== undefined && labs.estradiol < 30
            ? `FSH of ${labs.fsh} mIU/mL with low estradiol (${labs.estradiol} pg/mL) confirms menopausal status.`
            : `FSH of ${labs.fsh} mIU/mL is consistent with menopause.`;
        } else {
          stageDescription = `FSH of ${labs.fsh} mIU/mL indicates perimenopause (menopausal transition).`;
        }
        const symptomText = symptomsPresent.length > 0
          ? ` Symptoms present: ${symptomsPresent.join(', ')}.`
          : ' No specific symptoms reported at this time.';
        interpretations.push({
          category: `Hormone Pattern: ${stage === 'menopause' ? 'Menopause' : 'Perimenopause Transition'}`,
          value: labs.fsh,
          unit: 'mIU/mL',
          status: 'abnormal',
          referenceRange: 'FSH <25 mIU/mL premenopausal; ≥25 suggests transition; ≥40 menopausal',
          interpretation: `${stageDescription}${symptomText} Elevated FSH reflects decreased ovarian function and reduced estrogen production. This is a normal part of reproductive aging but may benefit from hormone optimization if symptomatic.`,
          recommendation: stage === 'menopause'
            ? `PROVIDER RECOMMENDATION: If symptomatic, consider hormone therapy (HT): transdermal estradiol + micronized progesterone (if uterus intact). Discuss benefits/risks of HT including cardiovascular, bone, and quality of life considerations. PATIENT EDUCATION: Your lab results confirm you are in menopause. Hormone therapy can help manage symptoms like hot flashes, sleep problems, and vaginal dryness while also protecting bone health.`
            : `PROVIDER RECOMMENDATION: If symptomatic, consider low-dose transdermal estradiol + micronized progesterone (if uterus intact). Perimenopause is characterized by fluctuating hormones. Steady hormone delivery via patch can smooth out peaks and valleys. PATIENT EDUCATION: Your lab results show you are in perimenopause — the transition phase before menopause. Hormone levels can swing widely during this time, causing symptoms. Treatment options are available to help you feel better.`,
        });
      }

      // Pattern 6: High SHBG → Low Free Hormone Availability (symptom-based, no free T data)
      // Only triggers when free T and bioavailable T are NOT available
      if (labs.shbg !== undefined && labs.shbg >= 120 &&
          labs.freeTestosterone === undefined && labs.bioavailableTestosterone === undefined) {
        const hasLowHormoneSymptoms =
          labs.lowLibido === true || labs.lowEnergy === true || labs.lowMotivation === true;
        if (hasLowHormoneSymptoms) {
          const symptomsPresent: string[] = [];
          if (labs.lowLibido) symptomsPresent.push('low libido');
          if (labs.lowEnergy) symptomsPresent.push('low energy');
          if (labs.lowMotivation) symptomsPresent.push('low motivation');
          interpretations.push({
            category: 'Hormone Pattern: High SHBG / Low Bioavailable Hormones',
            value: labs.shbg,
            unit: 'nmol/L',
            status: 'abnormal',
            referenceRange: 'SHBG <120 nmol/L preferred for optimal bioavailability',
            interpretation: `Elevated SHBG (${labs.shbg} nmol/L) with symptoms of low bioavailable hormones: ${symptomsPresent.join(', ')}. High SHBG can reduce bioavailable testosterone even when total testosterone looks "fine." Consider ordering Free Testosterone and Bioavailable Testosterone for complete assessment.`,
            recommendation: `PROVIDER RECOMMENDATION: Order Free Testosterone (pg/mL) and Bioavailable Testosterone (ng/dL) for full assessment. Check for drivers of elevated SHBG: oral contraceptive pill (OCP) use, thyroid medication dosing (thyroid hormone increases SHBG), and estrogen route/dose (oral estrogen raises SHBG more than transdermal). PATIENT EDUCATION: A protein in your blood (SHBG) is binding up your hormones, making less available for your body to use. This can cause low energy, low libido, and other symptoms. Identifying the cause and potentially adjusting your current medications may help.`,
          });
        }
      }
    } // End of age 35+ hormone patterns

    // FEMALE TESTOSTERONE PATTERN EVALUATION (all ages)
    // Use free & bioavailable testosterone, SHBG context, and symptoms to guide treatment
    // rather than total testosterone alone.
    
    // Track which testosterone pattern was identified to avoid duplicate individual interpretations
    let testosteronePatternIdentified = false;
    
    // Pattern A – SHBG Trap (Low Androgen Signaling)
    // Total T: 15–40 ng/dL, SHBG: >80-100 (always), or >60-80 if symptomatic (low libido/energy/motivation)
    // Free T: Low, Bioavailable T: Low
    // Common symptoms: low libido, low motivation, brain fog, mental fatigue, low confidence, poor strength response
    const shbgTrapSymptomatic = labs.lowLibido === true || labs.lowEnergy === true || labs.lowMotivation === true;
    const shbgTrapThreshold = shbgTrapSymptomatic ? 60 : 80; // Lower threshold when symptoms present
    if (labs.testosterone !== undefined && labs.testosterone >= 15 && labs.testosterone <= 40 &&
        labs.shbg !== undefined && labs.shbg > shbgTrapThreshold &&
        ((labs.freeTestosterone !== undefined && labs.freeTestosterone < 1.5) ||
         (labs.bioavailableTestosterone !== undefined && labs.bioavailableTestosterone < 5))) {
      
      testosteronePatternIdentified = true;
      const labDetails: string[] = [`Total T: ${labs.testosterone} ng/dL`];
      labDetails.push(`SHBG: ${labs.shbg} nmol/L`);
      if (labs.freeTestosterone !== undefined) labDetails.push(`Free T: ${labs.freeTestosterone} pg/mL (low)`);
      if (labs.bioavailableTestosterone !== undefined) labDetails.push(`Bioavailable T: ${labs.bioavailableTestosterone} ng/dL (low)`);
      
      interpretations.push({
        category: 'Testosterone Pattern A: SHBG Trap (Low Androgen Signaling)',
        value: labs.shbg,
        unit: 'nmol/L',
        status: 'abnormal',
        referenceRange: 'Total T 15-40, SHBG >60-100, Free T low, Bioavail T low',
        interpretation: `SHBG Trap pattern identified (${labDetails.join('; ')}). Total testosterone appears "normal" but SHBG is trapping it, resulting in low free and bioavailable testosterone. This pattern commonly presents with low libido and desire, low motivation and drive, brain fog and mental fatigue, low confidence, people-pleasing behavior, and poor strength response to exercise.`,
        recommendation: `PROVIDER RECOMMENDATION: Address SHBG drivers first — oral estrogen (switch to transdermal to reduce SHBG), oral contraceptives (major SHBG elevator), thyroid medication dosing (excess thyroid hormone raises SHBG). Consider low-dose titratable testosterone therapy if symptomatic after addressing SHBG drivers. Support iron levels, sleep quality, and nutrition optimization. Monitor: SHBG, free T, bioavailable T to track response. PATIENT EDUCATION: Your total testosterone level looks normal on paper, but a binding protein (SHBG) is holding onto it tightly so your body can't use it. This can cause symptoms like low energy, foggy thinking, and reduced motivation. Your provider will work on identifying what's driving the SHBG up and may discuss treatment options to help.`,
      });
    }
    
    // Pattern B – Low SHBG / High Activity
    // Total T: 30–60 ng/dL, SHBG: <30-40, Free/Bioavailable: High relative to total
    // Common symptoms: acne, oily skin, hirsutism, scalp hair loss, irritability, light sleep, cravings, insulin resistance
    if (labs.shbg !== undefined && labs.shbg < 40 &&
        labs.testosterone !== undefined && labs.testosterone >= 30 && labs.testosterone <= 60 &&
        ((labs.freeTestosterone !== undefined && labs.freeTestosterone > 3.0) ||
         (labs.bioavailableTestosterone !== undefined && labs.bioavailableTestosterone > 8))) {
      
      testosteronePatternIdentified = true;
      const labDetails: string[] = [`Total T: ${labs.testosterone} ng/dL`];
      labDetails.push(`SHBG: ${labs.shbg} nmol/L (low)`);
      if (labs.freeTestosterone !== undefined) labDetails.push(`Free T: ${labs.freeTestosterone} pg/mL (high relative to total)`);
      if (labs.bioavailableTestosterone !== undefined) labDetails.push(`Bioavailable T: ${labs.bioavailableTestosterone} ng/dL (high relative to total)`);
      
      const metabolicFindings: string[] = [];
      if (labs.a1c !== undefined && labs.a1c >= 5.7) metabolicFindings.push(`A1c ${labs.a1c}% (prediabetes)`);
      if (labs.triglycerides !== undefined && labs.triglycerides > 150) metabolicFindings.push(`Triglycerides ${labs.triglycerides} mg/dL (elevated)`);
      
      interpretations.push({
        category: 'Testosterone Pattern B: Low SHBG / High Androgen Activity',
        value: labs.shbg,
        unit: 'nmol/L',
        status: 'abnormal',
        referenceRange: 'Total T 30-60, SHBG <30-40, Free/Bioavail T elevated',
        interpretation: `Low SHBG / High Androgen Activity pattern identified (${labDetails.join('; ')}). Low SHBG allows more testosterone to circulate freely, creating androgenic symptoms even with a "normal" total testosterone. This pattern commonly presents with acne and oily skin, hirsutism (excess facial/body hair), scalp hair thinning, irritability, light/disrupted sleep, cravings, and insulin resistance.${metabolicFindings.length > 0 ? ` Metabolic markers: ${metabolicFindings.join('; ')}.` : ''}`,
        recommendation: `PROVIDER RECOMMENDATION: Avoid aggressive testosterone dosing in this pattern — adding testosterone will worsen symptoms. Address insulin resistance as the primary driver (fasting insulin, HOMA-IR). Consider metformin if insulin resistant. Dietary modifications: low glycemic index, anti-inflammatory diet. Consider downstream androgen blockade (spironolactone) for androgenic symptoms if clinically appropriate. Weight management if applicable (5-10% loss improves SHBG). Monitor metabolic markers alongside hormone levels. PATIENT EDUCATION: Your body has lower levels of a binding protein (SHBG), which means more of your testosterone is active and available. While your total testosterone looks normal, the extra activity can cause symptoms like acne, unwanted hair growth, and sleep issues. This is often connected to how your body handles insulin and blood sugar. Your provider will focus on addressing the root cause.`,
      });
    }
    
    // Pattern C – Supraphysiologic / Above Goal
    // For HRT patients: fires when T > 125 ng/dL (above the HRT optimization goal of 75-125)
    // For non-HRT patients: fires when T > 100 ng/dL (supraphysiologic for women)
    // Common symptoms: early energy/libido boost → later insomnia, heat intolerance, acne, hair shedding, irritability, anxiety
    const patternC_onHRT = labs.onHRT === true;
    const patternC_threshold = patternC_onHRT ? 125 : 100;
    if (labs.testosterone !== undefined && labs.testosterone > patternC_threshold) {
      
      testosteronePatternIdentified = true;
      const labDetails: string[] = patternC_onHRT
        ? [`Total T: ${labs.testosterone} ng/dL (above HRT optimization goal of 75–125 ng/dL)`]
        : [`Total T: ${labs.testosterone} ng/dL (supraphysiologic for women)`];
      if (labs.shbg !== undefined) labDetails.push(`SHBG: ${labs.shbg} nmol/L`);
      if (labs.freeTestosterone !== undefined) labDetails.push(`Free T: ${labs.freeTestosterone} pg/mL${labs.freeTestosterone > 5.0 ? ' (elevated)' : ''}`);
      if (labs.bioavailableTestosterone !== undefined) labDetails.push(`Bioavailable T: ${labs.bioavailableTestosterone} ng/dL${labs.bioavailableTestosterone > 10 ? ' (elevated)' : ''}`);
      
      interpretations.push({
        category: patternC_onHRT
          ? 'Testosterone Pattern C: Above HRT Optimization Goal'
          : 'Testosterone Pattern C: Supraphysiologic / Pellet Pattern',
        value: labs.testosterone,
        unit: 'ng/dL',
        status: labs.testosterone > 150 ? 'critical' : 'abnormal',
        referenceRange: patternC_onHRT ? 'HRT optimization goal: 75–125 ng/dL' : 'Total T >100–150+ (supraphysiologic for women)',
        interpretation: patternC_onHRT
          ? `Testosterone above HRT optimization goal (${labDetails.join('; ')}). The target range for testosterone on HRT is 75–125 ng/dL. At ${labs.testosterone} ng/dL, the patient is above goal${labs.testosterone > 150 ? ' and significantly elevated — dose reduction should be prioritized' : ' — consider dose reduction or reassessment of delivery method'}.`
          : `Supraphysiologic testosterone pattern identified (${labDetails.join('; ')}). Total testosterone is well above the physiologic range for women.${labs.testosterone > 150 ? ' At >150 ng/dL, this requires urgent evaluation.' : ''} This pattern is commonly seen with testosterone pellet therapy and may initially produce an energy and libido boost, but typically leads to insomnia, heat intolerance, acne, hair shedding, irritability, and anxiety as levels remain elevated.`,
        recommendation: patternC_onHRT
          ? `PROVIDER RECOMMENDATION: Testosterone is above the HRT optimization goal of 75–125 ng/dL. Reduce the testosterone dose — do NOT add additional testosterone.${labs.testosterone > 150 ? ' At >150 ng/dL, this is significantly elevated; prioritize dose reduction promptly.' : ''} Manage downstream symptoms if present: spironolactone for acne or hair thinning, sleep support for insomnia, anxiety management as needed. If using pellet therapy, consider transitioning to a titratable form (transdermal cream or gel) to allow precise dose adjustments. Monitor CBC, lipids, and liver function. PATIENT EDUCATION: Your testosterone is above the target range for your hormone therapy. Your provider will adjust your dose to bring it back into the optimal range (75–125 ng/dL) and manage any related symptoms.`
          : `PROVIDER RECOMMENDATION: Do NOT stack testosterone — do not add more testosterone on top of existing supraphysiologic levels. Manage downstream symptoms: consider spironolactone for acne/hair loss, sleep support, anxiety management. ${labs.testosterone > 150 ? 'Rule out androgen-secreting tumor if NOT on exogenous testosterone (pelvic ultrasound, CT adrenals). ' : ''}If pellet-related: transition to titratable testosterone therapy (transdermal cream/gel) to allow dose adjustments. Target physiologic range (Total T 15–70 ng/dL for non-HRT women). Monitor CBC, lipids, liver function. PATIENT EDUCATION: Your testosterone level is much higher than what the body typically needs. This can happen with certain forms of testosterone therapy like pellets. While it may feel good initially, sustained high levels can cause side effects. Your provider may recommend transitioning to a form of testosterone that allows more precise dosing control.`,
      });
    }
    
    // Pattern E – HRT Testosterone within Optimization Goal (75–125 ng/dL)
    // Only fires for patients on HRT whose total testosterone is within the goal range
    // Prevents misfiring of non-HRT patterns (A/B/D) which have different reference ranges
    if (!testosteronePatternIdentified &&
        labs.onHRT === true &&
        labs.testosterone !== undefined && labs.testosterone >= 75 && labs.testosterone <= 125) {
      
      testosteronePatternIdentified = true;
      const labDetails: string[] = [`Total T: ${labs.testosterone} ng/dL (within HRT goal 75–125 ng/dL)`];
      if (labs.freeTestosterone !== undefined) labDetails.push(`Free T: ${labs.freeTestosterone} pg/mL`);
      if (labs.bioavailableTestosterone !== undefined) labDetails.push(`Bioavailable T: ${labs.bioavailableTestosterone} ng/dL`);
      if (labs.shbg !== undefined) labDetails.push(`SHBG: ${labs.shbg} nmol/L`);
      
      interpretations.push({
        category: 'Testosterone Pattern E: HRT Optimization — On Target',
        value: labs.testosterone,
        unit: 'ng/dL',
        status: 'normal',
        referenceRange: 'HRT goal: 75–125 ng/dL',
        interpretation: `Testosterone is within the HRT optimization target range (${labDetails.join('; ')}). This is the expected therapeutic range for women on testosterone HRT. Elevated free and/or bioavailable testosterone relative to non-HRT reference ranges is expected at this total testosterone level.`,
        recommendation: `PROVIDER RECOMMENDATION: Testosterone is at goal for HRT. Continue current dosing regimen. Monitor for androgenic side effects (acne, hair thinning, hirsutism) at follow-up — if symptoms develop, consider dose reduction to the lower end of the target range. Recheck CBC, lipids, and liver function per standard HRT monitoring intervals. PATIENT EDUCATION: Your testosterone level is right in the target range for your hormone therapy program. This is a positive finding. Your provider will continue monitoring to keep it in this optimal zone.`,
      });
    }
    
    // Perimenopause: Low Androgen Availability / High SHBG
    // Fires for non-HRT patients age 35–65 with at least one marker of reduced androgen availability.
    // Takes priority over Pattern D — prevents the contradictory "adequate androgens" label
    // when free T is low, total T is low-normal, SHBG is elevated, or DHEA-S is borderline-low.
    const _periAge = labs.demographics?.age === undefined || (labs.demographics.age >= 35 && labs.demographics.age <= 65);
    if (!testosteronePatternIdentified && labs.onHRT !== true && _periAge) {
      const _freeT = labs.freeTestosterone;
      const _totalT = labs.testosterone;
      const _shbg = labs.shbg;
      const _dheas = labs.dheas;

      const _freeTLow = _freeT !== undefined && _freeT < 4;
      const _totalTLow = _totalT !== undefined && _totalT < 30;
      const _shbgHigh = _shbg !== undefined && _shbg > 60;
      const _dheasLow = _dheas !== undefined && _dheas < 150;

      const _periFindings: string[] = [];
      if (_freeT !== undefined) {
        if (_freeT < 3) _periFindings.push(`Free testosterone ${_freeT} pg/mL (low, optimal 3–10 pg/mL)`);
        else if (_freeT < 4) _periFindings.push(`Free testosterone ${_freeT} pg/mL (low-normal, optimal 3–10 pg/mL)`);
      }
      if (_totalT !== undefined) {
        if (_totalT < 20) _periFindings.push(`Total testosterone ${_totalT} ng/dL (low, optimal 30–60 ng/dL)`);
        else if (_totalT < 30) _periFindings.push(`Total testosterone ${_totalT} ng/dL (low-normal, optimal 30–60 ng/dL)`);
      }
      if (_shbg !== undefined) {
        if (_shbg > 90) _periFindings.push(`SHBG ${_shbg} nmol/L (very elevated, markedly reducing androgen bioavailability)`);
        else if (_shbg > 70) _periFindings.push(`SHBG ${_shbg} nmol/L (elevated, reducing androgen bioavailability)`);
        else if (_shbg > 60) _periFindings.push(`SHBG ${_shbg} nmol/L (borderline elevated, optimal 30–60 nmol/L)`);
      }
      if (_dheas !== undefined) {
        if (_dheas < 100) _periFindings.push(`DHEA-S ${_dheas} µg/dL (very low, significantly reduced adrenal androgen reserve)`);
        else if (_dheas < 135) _periFindings.push(`DHEA-S ${_dheas} µg/dL (low, optimal 150–300 µg/dL)`);
        else if (_dheas < 150) _periFindings.push(`DHEA-S ${_dheas} µg/dL (borderline low adrenal reserve)`);
      }

      const _periMarkers = [_freeTLow, _totalTLow, _shbgHigh, _dheasLow].filter(Boolean).length;

      if (_periMarkers >= 1 && _periFindings.length > 0) {
        testosteronePatternIdentified = true;

        const _periSymptoms: string[] = [];
        if (labs.lowLibido) _periSymptoms.push('low libido');
        if (labs.lowEnergy) _periSymptoms.push('fatigue/low energy');
        if (labs.brainFog) _periSymptoms.push('brain fog');
        if (labs.lowMotivation) _periSymptoms.push('low motivation');
        if (labs.moodChanges) _periSymptoms.push('mood changes');
        if (_periSymptoms.length > 0) _periFindings.push(`Compatible symptoms: ${_periSymptoms.join(', ')}`);

        const _periStatus: LabInterpretation['status'] = _periMarkers >= 3 ? 'abnormal' : 'borderline';

        interpretations.push({
          category: 'Perimenopause Assessment: Low Androgen / High SHBG Pattern',
          value: _totalT ?? _shbg ?? _freeT ?? 0,
          unit: _totalT !== undefined ? 'ng/dL' : _shbg !== undefined ? 'nmol/L' : 'pg/mL',
          status: _periStatus,
          referenceRange: 'Total T 30–60 ng/dL, Free T 3–10 pg/mL, SHBG 30–60 nmol/L',
          interpretation: `Low Androgen Availability / High SHBG perimenopause pattern identified (${_periFindings.filter(f => !f.startsWith('Compatible')).join('; ')}). Pattern suggests reduced androgen availability due to low free testosterone, low-normal total testosterone, elevated SHBG, and/or borderline-low DHEA-S. Estradiol and progesterone may still appear adequate — this is an androgen availability and hormone-binding pattern, not primarily an estrogen-deficiency pattern. Common in women ages 35–55.${_periSymptoms.length > 0 ? ` Symptom correlation: ${_periSymptoms.join(', ')}.` : ''}`,
          recommendation: `PROVIDER RECOMMENDATION: Evaluate SHBG drivers — oral estrogen route (switch to transdermal to reduce SHBG), oral contraceptive history, thyroid dosing. Consider adrenal androgen reserve: check DHEA-S if not already done. Consider low-dose DHEA or pregnenolone supplementation. If free testosterone remains consistently low after addressing SHBG, discuss low-dose testosterone optimization. PATIENT EDUCATION: Your lab results show that while total hormone levels may appear borderline, your body's available androgens (hormones that support energy, libido, and mood) are lower than optimal. This is a common pattern in women in their 30s–50s. Your provider will identify what's reducing your available hormones and discuss targeted treatment options.`,
        });
      }
    }

    // Pattern D – Adequate Androgens, Persistent Symptoms
    // Total T >30 ng/dL AND Free T >3 pg/mL (when available), SHBG not extreme
    // Only fires when all testosterone markers are genuinely adequate (new optimized thresholds).
    // Excluded for HRT patients — their reference range is 75-125 ng/dL, not 30-60 ng/dL.
    // Excluded for patients who already matched the perimenopause Low Androgen pattern above.
    if (!testosteronePatternIdentified &&
        labs.onHRT !== true &&
        labs.testosterone !== undefined && labs.testosterone > 30 && labs.testosterone <= 70 &&
        (labs.freeTestosterone === undefined || (labs.freeTestosterone > 3 && labs.freeTestosterone <= 10)) &&
        (labs.bioavailableTestosterone === undefined || (labs.bioavailableTestosterone >= 2 && labs.bioavailableTestosterone <= 10)) &&
        (labs.shbg === undefined || (labs.shbg >= 24 && labs.shbg <= 100))) {
      
      testosteronePatternIdentified = true;
      
      // Identify other factors that may be driving persistent symptoms
      const otherFactors: string[] = [];
      if (labs.ferritin !== undefined && labs.ferritin < 50) otherFactors.push(`Low ferritin (${labs.ferritin} ng/mL) — iron deficiency mimics androgen insufficiency`);
      if (labs.tsh !== undefined && (labs.tsh > 3.0 || labs.tsh < 0.5)) otherFactors.push(`Thyroid: TSH ${labs.tsh} mIU/L — evaluate thyroid function`);
      if (labs.vitaminD !== undefined && labs.vitaminD < 30) otherFactors.push(`Low Vitamin D (${labs.vitaminD} ng/mL) — contributes to fatigue and mood changes`);
      if (labs.estradiol !== undefined && labs.progesterone !== undefined) {
        otherFactors.push(`Estrogen/Progesterone balance should be assessed (E2: ${labs.estradiol} pg/mL, P4: ${labs.progesterone} ng/mL)`);
      }
      
      const labDetails: string[] = [`Total T: ${labs.testosterone} ng/dL (within range)`];
      if (labs.freeTestosterone !== undefined) labDetails.push(`Free T: ${labs.freeTestosterone} pg/mL`);
      if (labs.bioavailableTestosterone !== undefined) labDetails.push(`Bioavailable T: ${labs.bioavailableTestosterone} ng/dL`);
      if (labs.shbg !== undefined) labDetails.push(`SHBG: ${labs.shbg} nmol/L`);
      
      interpretations.push({
        category: 'Testosterone Pattern D: Adequate Androgens, Persistent Symptoms',
        value: labs.testosterone,
        unit: 'ng/dL',
        status: 'borderline',
        referenceRange: 'Total T 30-60 ng/dL, Free T 3-10 pg/mL (all within range)',
        interpretation: `Adequate Androgens pattern identified (${labDetails.join('; ')}). Total, free, and bioavailable testosterone are within normal ranges and SHBG is not extreme. If the patient reports fatigue, low mood, sleep disruption, or low libido, these symptoms are likely driven by non-androgenic factors.${otherFactors.length > 0 ? ` Findings to evaluate: ${otherFactors.join('. ')}.` : ' Evaluate iron, thyroid, sleep quality, and estrogen/progesterone balance.'}`,
        recommendation: `PROVIDER RECOMMENDATION: Do not reflexively add testosterone when levels are adequate — look deeper. Evaluate iron status (ferritin target >50 for symptom resolution), thyroid function (optimize TSH), and sleep quality (consider sleep apnea screening with STOP-BANG). Assess estrogen and progesterone balance — E2/P4 imbalance is a common driver of persistent symptoms. Address CNS and psychosocial drivers: chronic stress, HPA axis dysregulation, mood disorders. Consider DHEA-S if not already checked. Support with lifestyle optimization: sleep hygiene, stress management, nutrition. PATIENT EDUCATION: Your testosterone levels are actually in a healthy range, which is good news. When symptoms persist despite normal testosterone, it usually means something else is contributing. Your provider will look at other factors like iron levels, thyroid function, sleep quality, and hormone balance to find what's driving your symptoms.`,
      });
    }
    
    // Individual marker interpretations (only when no pattern was identified)
    if (!testosteronePatternIdentified) {
      // Individual SHBG interpretation
      if (labs.shbg !== undefined) {
        let shbgStatus: LabInterpretation['status'] = 'normal';
        let shbgInterp = '';
        let shbgRec = '';
        
        if (labs.shbg > 120) {
          shbgStatus = 'abnormal';
          shbgInterp = `SHBG ${labs.shbg} nmol/L is significantly elevated. Well above the optimal range of 30–70 nmol/L. At this level, SHBG is substantially binding both testosterone and estradiol, leaving little free hormone available to tissues. This can cause symptoms even when total hormone levels appear "normal."`;
          const hasFreeT = labs.freeTestosterone !== undefined;
          const hasBioavailT = labs.bioavailableTestosterone !== undefined;
          if (!hasFreeT && !hasBioavailT) {
            shbgRec = 'Order Free Testosterone and Bioavailable Testosterone to quantify impact. Evaluate SHBG drivers: oral estrogen (switch to transdermal), oral contraceptives (major SHBG elevator), thyroid medication dosing, liver conditions. Consider testosterone optimization if free T is low.';
          } else {
            shbgRec = 'Identify and address SHBG drivers: oral estrogen → switch to transdermal, OCP → discuss alternatives, thyroid medication → review dosing, liver → check hepatic markers. Consider testosterone optimization if free T is low despite treatment of SHBG drivers.';
          }
        } else if (labs.shbg > 90 && labs.shbg <= 120) {
          shbgStatus = 'borderline';
          shbgInterp = `SHBG ${labs.shbg} nmol/L is very elevated. Above the optimal upper limit of 70 nmol/L. High SHBG is significantly reducing androgen bioavailability — evaluate free testosterone to quantify impact.`;
          shbgRec = 'Evaluate SHBG drivers: oral estrogen (switch to transdermal), OCP, thyroid medication dosing, underweight/undereating, or genetic tendency. Check free testosterone and bioavailable testosterone if not already done.';
        } else if (labs.shbg > 70 && labs.shbg <= 90) {
          shbgStatus = 'borderline';
          shbgInterp = `SHBG ${labs.shbg} nmol/L is elevated. Above the optimal range of 30–70 nmol/L — is binding testosterone and reducing androgen bioavailability. Common in perimenopause and is associated with oral estrogen use, thyroid medication, and OCP history.`;
          shbgRec = 'Correlate with free testosterone to assess impact. Evaluate SHBG drivers: oral estrogen (transdermal reduces SHBG), OCP, thyroid medication dosing. If free T is low, discuss androgen availability with patient.';
        } else if (labs.shbg >= 30 && labs.shbg <= 70) {
          shbgInterp = `SHBG ${labs.shbg} nmol/L is within the optimal range (30–70 nmol/L). Appropriate hormone binding — supports balanced free and total sex hormone levels.`;
          shbgRec = 'Optimal SHBG. Continue routine monitoring.';
        } else if (labs.shbg >= 17 && labs.shbg < 30) {
          shbgStatus = 'borderline';
          shbgInterp = `SHBG ${labs.shbg} nmol/L is low. Below the optimal range of 30–70 nmol/L. Low SHBG increases free androgen activity and is associated with insulin resistance, metabolic syndrome, and PCOS.`;
          shbgRec = 'Evaluate for insulin resistance (fasting insulin, HOMA-IR, TG:HDL ratio). Consider metabolic workup. Low SHBG combined with normal or elevated total testosterone may cause androgenic symptoms.';
        } else {
          shbgStatus = 'abnormal';
          shbgInterp = `SHBG ${labs.shbg} nmol/L is very low. Significantly below the optimal range of 30–70 nmol/L. Very low SHBG strongly suggests insulin resistance or metabolic dysfunction.`;
          shbgRec = 'Evaluate for insulin resistance: fasting insulin, HOMA-IR, A1c, TG:HDL ratio. Consider endocrinology referral. Very low SHBG amplifies free androgen activity and increases androgen-related symptom burden.';
        }
        
        interpretations.push({
          category: 'SHBG',
          value: labs.shbg,
          unit: 'nmol/L',
          status: shbgStatus,
          referenceRange: '30-70 nmol/L (optimal)',
          interpretation: shbgInterp,
          recommendation: shbgRec,
        });
      }
      
      // Individual Free Testosterone interpretation
      if (labs.freeTestosterone !== undefined) {
        let ftStatus: LabInterpretation['status'] = 'normal';
        let ftInterp = '';
        let ftRec = '';
        
        if (labs.freeTestosterone < 1.5) {
          ftStatus = 'abnormal';
          ftInterp = `Free testosterone ${labs.freeTestosterone} pg/mL is low. Well below the optimal range of 3–10 pg/mL. Reduced androgen signaling — commonly associated with low libido, fatigue, brain fog, reduced motivation, and poor stress resilience.`;
          ftRec = 'Evaluate SHBG (elevated SHBG reduces free T), total testosterone, and DHEA-S. Consider full androgen panel if not already done. If symptomatic, discuss testosterone optimization. Identify SHBG drivers (oral estrogen, OCP, thyroid medication).';
        } else if (labs.freeTestosterone > 10.0) {
          ftStatus = 'abnormal';
          ftInterp = `Free testosterone ${labs.freeTestosterone} pg/mL is elevated${labs.onHRT ? ' — consistent with exogenous testosterone use at current dose' : ''}. Above the optimal range of 3–10 pg/mL — may cause androgenic symptoms (acne, oily skin, hirsutism, scalp hair thinning, irritability, sleep disruption).`;
          ftRec = labs.onHRT === true
            ? 'Free testosterone above optimal range (3–10 pg/mL). Monitor for androgenic side effects (acne, hair thinning, hirsutism, sleep disruption). Correlate with total testosterone and consider dose reduction if symptomatic.'
            : 'Elevated free testosterone without exogenous therapy. Evaluate for PCOS, low SHBG driving elevated free T, or adrenal excess. Correlate with clinical symptoms.';
        } else if (labs.freeTestosterone >= 1.5 && labs.freeTestosterone < 3.0) {
          ftStatus = 'borderline';
          ftInterp = `Free testosterone ${labs.freeTestosterone} pg/mL is low-normal/suboptimal. Below the optimal range of 3–10 pg/mL. May contribute to reduced libido, energy, or motivation, particularly with SHBG elevation or borderline total testosterone.`;
          ftRec = 'Correlate with symptoms, SHBG, and total testosterone. Evaluate SHBG drivers if elevated (oral estrogen, OCP, thyroid medication). If symptomatic, consider androgen optimization discussion.';
        } else {
          ftInterp = `Free testosterone ${labs.freeTestosterone} pg/mL is within the optimal functional range (3–10 pg/mL). Supports libido, energy, cognitive function, and muscle tone.`;
          ftRec = 'Optimal free testosterone. Continue routine monitoring.';
        }
        
        interpretations.push({
          category: 'Free Testosterone',
          value: labs.freeTestosterone,
          unit: 'pg/mL',
          status: ftStatus,
          referenceRange: '3.0-10.0 pg/mL (optimal)',
          interpretation: ftInterp,
          recommendation: ftRec,
        });
      }
      
      // Individual Bioavailable Testosterone interpretation
      if (labs.bioavailableTestosterone !== undefined) {
        let batStatus: LabInterpretation['status'] = 'normal';
        let batInterp = '';
        let batRec = '';
        
        if (labs.bioavailableTestosterone < 2) {
          batStatus = 'abnormal';
          batInterp = `Bioavailable testosterone ${labs.bioavailableTestosterone} ng/dL is low. May contribute to androgen insufficiency symptoms.`;
          batRec = 'Evaluate alongside SHBG and free testosterone. Consider androgen insufficiency workup.';
        } else if (labs.bioavailableTestosterone > 10) {
          batStatus = labs.onHRT ? 'borderline' : 'abnormal';
          batInterp = `Bioavailable testosterone ${labs.bioavailableTestosterone} ng/dL is elevated${labs.onHRT ? ' — consistent with exogenous testosterone use' : ''}. May cause androgenic symptoms.`;
          batRec = labs.onHRT === true
            ? 'Elevated bioavailable testosterone is expected with exogenous testosterone therapy. Monitor for androgenic side effects and correlate with total testosterone dose and the HRT target range (75–125 ng/dL).'
            : 'Evaluate for low SHBG, exogenous testosterone, or other causes of elevated bioavailable androgens.';
        } else if (labs.bioavailableTestosterone < 3) {
          batStatus = 'borderline';
          batInterp = `Bioavailable testosterone ${labs.bioavailableTestosterone} ng/dL is low-normal. May correlate with symptoms of androgen insufficiency.`;
          batRec = 'Clinical correlation recommended. If symptomatic, evaluate alongside free T and SHBG.';
        } else {
          batInterp = `Bioavailable testosterone ${labs.bioavailableTestosterone} ng/dL is within normal functional range.`;
          batRec = 'Continue routine monitoring.';
        }
        
        interpretations.push({
          category: 'Bioavailable Testosterone',
          value: labs.bioavailableTestosterone,
          unit: 'ng/dL',
          status: batStatus,
          referenceRange: '2-10 ng/dL',
          interpretation: batInterp,
          recommendation: batRec,
        });
      }
    }

    return interpretations;
  }

  static determineRecheckWindow(labs: FemaleLabValues, redFlags: RedFlag[]): string {
    if (redFlags.some(f => f.severity === 'critical')) {
      return '1-2 weeks (critical values present)';
    }
    if (redFlags.some(f => f.severity === 'urgent')) {
      return '2-4 weeks (urgent values present)';
    }
    
    // Check for specific conditions requiring earlier follow-up
    if (labs.ferritin !== undefined && labs.ferritin < 30) {
      return '6-8 weeks (iron supplementation monitoring)';
    }
    if (labs.tsh !== undefined && (labs.tsh > 4.5 || labs.tsh < 0.4)) {
      return '6-8 weeks (thyroid monitoring)';
    }
    if (labs.a1c !== undefined && labs.a1c >= 5.7) {
      return '3 months (glycemic monitoring)';
    }
    
    return '3-6 months (routine follow-up)';
  }

  /**
   * Compute cardiovascular risk stratification flags based on lab values
   * These flags are used to identify risk enhancers for ASCVD and treatment decisions
   */
  static computeCardiovascularRiskFlags(labs: FemaleLabValues): CardiovascularRiskFlags {
    const flags: CardiovascularRiskFlags = {
      high_Lp_a: false,
      very_high_Lp_a: false,
      high_ApoB: false,
      very_high_ApoB: false,
      high_nonHDL: false,
      very_high_nonHDL: false,
      high_TG: false,
      very_high_TG: false,
      low_HDL: false,
      hsCRP_high: false,
      CKD: false,
      family_history: false,
      diabetes: false,
      prediabetes: false,
    };

    // Lipoprotein(a) - Lp(a) thresholds per clinic protocol
    // <29 mg/dL = normal
    // ≥29 mg/dL = elevated (high_Lp_a flag)
    // ≥50 mg/dL = risk enhancer (increases CVD risk category)
    // ≥180 mg/dL = very high / genetic-equivalent risk
    if (labs.lpa !== undefined) {
      if (labs.lpa >= 180) {
        flags.high_Lp_a = true;
        flags.very_high_Lp_a = true;
      } else if (labs.lpa >= 29) {
        flags.high_Lp_a = true;
      }
    }

    // Apolipoprotein B thresholds
    // ≥90 mg/dL = risk enhancer zone
    // ≥120 mg/dL = very high (corresponds to LDL ~160+)
    if (labs.apoB !== undefined) {
      if (labs.apoB >= 120) {
        flags.high_ApoB = true;
        flags.very_high_ApoB = true;
      } else if (labs.apoB >= 90) {
        flags.high_ApoB = true;
      }
    }

    // Non-HDL Cholesterol = Total Cholesterol - HDL
    // ≥130 mg/dL = high
    // ≥160 mg/dL = very high
    if (labs.totalCholesterol !== undefined && labs.hdl !== undefined) {
      const nonHDL = labs.totalCholesterol - labs.hdl;
      if (nonHDL >= 160) {
        flags.high_nonHDL = true;
        flags.very_high_nonHDL = true;
      } else if (nonHDL >= 130) {
        flags.high_nonHDL = true;
      }
    }

    // Triglycerides thresholds
    // ≥150 mg/dL = high (borderline)
    // ≥200 mg/dL = marked elevation
    if (labs.triglycerides !== undefined) {
      if (labs.triglycerides >= 200) {
        flags.high_TG = true;
        flags.very_high_TG = true;
      } else if (labs.triglycerides >= 150) {
        flags.high_TG = true;
      }
    }

    // Low HDL - sex-specific
    // Female: <50 mg/dL
    // Male: <40 mg/dL
    // For female labs page, we use female threshold
    if (labs.hdl !== undefined && labs.hdl < 50) {
      flags.low_HDL = true;
    }

    // hs-CRP >3.0 mg/L = cardiovascular risk enhancer (standard clinical threshold)
    if (labs.hsCRP !== undefined && labs.hsCRP > 3.0) {
      flags.hsCRP_high = true;
    }

    // CKD: eGFR <60 mL/min (Stage 3+)
    if (labs.egfr !== undefined && labs.egfr < 60) {
      flags.CKD = true;
    }

    // Family history from demographics
    if (labs.demographics?.familyHistory === true) {
      flags.family_history = true;
    }

    // Glycemic status from A1c
    // ≥6.5% = diabetes
    // 5.7-6.4% = prediabetes
    if (labs.a1c !== undefined) {
      if (labs.a1c >= 6.5) {
        flags.diabetes = true;
      } else if (labs.a1c >= 5.7) {
        flags.prediabetes = true;
      }
    }

    // Also check demographics.diabetic checkbox
    if (labs.demographics?.diabetic === true) {
      flags.diabetes = true;
    }

    return flags;
  }

  /**
   * Generate CAC and Statin recommendations based on clinical guidelines
   * Implements 2018 ACC/AHA guidelines for CAC scoring and statin decision-making
   */
  static generateCacStatinRecommendations(labs: FemaleLabValues, cvFlags: CardiovascularRiskFlags): CacStatinRecommendation {
    const age = labs.demographics?.age;
    const ldl = labs.ldl;
    const apoB = labs.apoB;
    const lpa = labs.lpa;
    const tg = labs.triglycerides;
    const hdl = labs.hdl;
    const tc = labs.totalCholesterol;
    const cacScore = labs.cacScore;
    const knownASCVD = labs.knownASCVD === true;
    const statinHesitant = labs.statinHesitant === true;
    const familyHistory = cvFlags.family_history;
    const diabetes = cvFlags.diabetes;
    const prediabetes = cvFlags.prediabetes;
    
    // Calculate non-HDL if we have the values
    const nonHDL = (tc !== undefined && hdl !== undefined) ? tc - hdl : undefined;
    
    // Count risk enhancers
    const riskEnhancers: string[] = [];
    if (familyHistory) riskEnhancers.push('family history of premature ASCVD');
    if (cvFlags.hsCRP_high) riskEnhancers.push('elevated hs-CRP');
    if (cvFlags.CKD) riskEnhancers.push('chronic kidney disease');
    if (cvFlags.low_HDL) riskEnhancers.push('low HDL');
    if (cvFlags.high_TG) riskEnhancers.push('elevated triglycerides');
    if (prediabetes) riskEnhancers.push('prediabetes/metabolic syndrome');
    if (lpa !== undefined && lpa >= 50) riskEnhancers.push('elevated Lp(a)');
    if (apoB !== undefined && apoB >= 90) riskEnhancers.push('elevated ApoB');
    
    // Initialize result
    const result: CacStatinRecommendation = {
      cacRecommendation: {
        recommended: false,
        priority: 'none',
        rationale: '',
      },
      statinDiscussion: {
        indicated: false,
        strength: 'none',
        rationale: '',
      },
    };
    
    // ============================================
    // CAC RECOMMENDATION LOGIC
    // ============================================
    
    // Don't recommend CAC if known ASCVD (treat aggressively, CAC not needed)
    if (knownASCVD) {
      result.cacRecommendation = {
        recommended: false,
        priority: 'none',
        rationale: 'CAC not indicated - patient has known ASCVD. Treat aggressively per secondary prevention guidelines.',
        contraindicated: true,
        contraindicationReason: 'Known ASCVD - treat aggressively; CAC is not needed for "proof".',
      };
    }
    // Age <40: Generally less informative unless extreme circumstances
    else if (age !== undefined && age < 40) {
      // Exception: extreme family history + very high Lp(a)
      if (familyHistory && lpa !== undefined && lpa >= 180) {
        result.cacRecommendation = {
          recommended: true,
          priority: 'consider',
          rationale: `Despite age <40, CAC may be informative given extreme family history combined with very high Lp(a) (${lpa} mg/dL). Early detection of subclinical atherosclerosis could guide aggressive prevention.`,
        };
      } else {
        result.cacRecommendation = {
          recommended: false,
          priority: 'none',
          rationale: 'CAC generally less informative under age 40. Consider if extreme family history with very high Lp(a).',
        };
      }
    }
    // Age ≥40: Apply standard CAC decision logic
    else if (age !== undefined && age >= 40) {
      const meetsLipidCriteria = (ldl !== undefined && ldl >= 70) || 
                                  (apoB !== undefined && apoB >= 80) || 
                                  (nonHDL !== undefined && nonHDL >= 100);
      
      // Strongly recommend CAC if Lp(a) ≥50 (especially ≥180)
      if (lpa !== undefined && lpa >= 180) {
        result.cacRecommendation = {
          recommended: true,
          priority: 'strongly_recommend',
          rationale: `Very high Lp(a) of ${lpa} mg/dL represents extreme genetic cardiovascular risk. CAC highly recommended to assess subclinical atherosclerosis burden and guide aggressive prevention strategy.`,
        };
      } else if (lpa !== undefined && lpa >= 50) {
        result.cacRecommendation = {
          recommended: true,
          priority: 'strongly_recommend',
          rationale: `Elevated Lp(a) of ${lpa} mg/dL is a genetic risk marker. CAC strongly recommended to assess arterial calcium burden and inform treatment intensity.`,
        };
      }
      // Strong family history + multiple risk enhancers
      else if (familyHistory && riskEnhancers.length >= 2) {
        result.cacRecommendation = {
          recommended: true,
          priority: 'recommend',
          rationale: `Strong family history of premature ASCVD with multiple risk enhancers (${riskEnhancers.join(', ')}). CAC recommended to clarify risk and guide statin decision.`,
        };
      }
      // Metabolic syndrome/prediabetes with mixed lipids
      else if ((prediabetes || diabetes) && (cvFlags.high_TG || cvFlags.low_HDL)) {
        result.cacRecommendation = {
          recommended: true,
          priority: 'recommend',
          rationale: 'Metabolic syndrome pattern (prediabetes/diabetes with dyslipidemia). CAC recommended to assess cardiovascular risk and guide therapy intensity.',
        };
      }
      // Standard CAC criteria: Age ≥40 AND lipid criteria AND (hesitant or uncertain risk)
      else if (meetsLipidCriteria && statinHesitant) {
        result.cacRecommendation = {
          recommended: true,
          priority: 'recommend',
          rationale: 'Patient age ≥40 with lipid levels meeting treatment thresholds but hesitant about statin therapy. CAC can help clarify individual risk and inform shared decision-making.',
        };
      }
      // Borderline risk with multiple enhancers
      else if (meetsLipidCriteria && riskEnhancers.length >= 2) {
        result.cacRecommendation = {
          recommended: true,
          priority: 'consider',
          rationale: `Borderline lipid levels with multiple risk enhancers (${riskEnhancers.join(', ')}). Consider CAC to refine risk assessment.`,
        };
      }
      else if (meetsLipidCriteria) {
        result.cacRecommendation = {
          recommended: false,
          priority: 'consider',
          rationale: 'Lipid levels meet threshold for CAC consideration. CAC may be useful if risk level is uncertain or patient is hesitant about statin.',
        };
      }
    }
    
    // ============================================
    // STATIN DISCUSSION LOGIC
    // ============================================
    
    // LDL ≥190 (or familial pattern) → "strongly indicated"
    if (ldl !== undefined && ldl >= 190) {
      result.statinDiscussion = {
        indicated: true,
        strength: 'strongly_indicated',
        rationale: `LDL-C ≥190 mg/dL (${ldl} mg/dL). High-intensity statin therapy strongly indicated per ACC/AHA guidelines. Consider familial hypercholesterolemia evaluation.`,
        additionalNotes: familyHistory ? 'Strong family history further supports aggressive lipid lowering.' : undefined,
      };
    }
    // Diabetes age 40-75 with LDL ≥70 → "generally recommended"
    else if (diabetes && age !== undefined && age >= 40 && age <= 75 && ldl !== undefined && ldl >= 70) {
      result.statinDiscussion = {
        indicated: true,
        strength: 'generally_recommended',
        rationale: `Diabetes with age 40-75 and LDL-C ≥70 mg/dL (${ldl} mg/dL). Moderate-to-high intensity statin generally recommended per guidelines.`,
        additionalNotes: riskEnhancers.length > 0 ? `Additional risk enhancers present: ${riskEnhancers.join(', ')}. Consider high-intensity statin.` : undefined,
      };
    }
    // CAC ≥100 → strong statin indication
    else if (cacScore !== undefined && cacScore >= 100) {
      result.statinDiscussion = {
        indicated: true,
        strength: 'strongly_indicated',
        rationale: `CAC score ≥100 (${cacScore}) indicates significant coronary atherosclerosis. Strong indication for statin therapy plus intensive risk factor modification.`,
      };
    }
    // CAC 1-99 → favors statin
    else if (cacScore !== undefined && cacScore >= 1 && cacScore < 100) {
      const ageNote = age !== undefined && age > 55 ? ' especially given age >55' : '';
      result.statinDiscussion = {
        indicated: true,
        strength: 'generally_recommended',
        rationale: `CAC score 1-99 (${cacScore}) indicates presence of coronary atherosclerosis. Statin therapy favored${ageNote}.`,
        additionalNotes: riskEnhancers.length > 0 ? `Risk enhancers present: ${riskEnhancers.join(', ')}.` : undefined,
      };
    }
    // CAC = 0 interpretation
    else if (cacScore !== undefined && cacScore === 0) {
      if (lpa !== undefined && lpa >= 50) {
        result.statinDiscussion = {
          indicated: false,
          strength: 'consider',
          rationale: `CAC = 0 supports deferring statin in low-intermediate risk, but elevated Lp(a) (${lpa} mg/dL) is a genetic risk factor not reflected by CAC. Close follow-up warranted.`,
          additionalNotes: 'High Lp(a) patients can develop ASCVD despite CAC = 0. Consider lifestyle optimization and reassess periodically.',
        };
      } else {
        result.statinDiscussion = {
          indicated: false,
          strength: 'none',
          rationale: 'CAC = 0 supports deferring statin therapy short-term in selected low-intermediate risk patients. Reassess risk factors in 5-10 years.',
        };
      }
    }
    // ApoB ≥90 with risk enhancers
    else if (apoB !== undefined && apoB >= 90 && riskEnhancers.length > 0) {
      result.statinDiscussion = {
        indicated: true,
        strength: 'generally_recommended',
        rationale: `ApoB ≥90 mg/dL (${apoB} mg/dL) with risk enhancers (${riskEnhancers.join(', ')}). Statin discussion recommended.`,
      };
    }
    // non-HDL ≥160 persistent
    else if (nonHDL !== undefined && nonHDL >= 160) {
      result.statinDiscussion = {
        indicated: true,
        strength: 'generally_recommended',
        rationale: `Persistent non-HDL ≥160 mg/dL (${nonHDL} mg/dL) indicates elevated atherogenic lipoprotein burden. Statin discussion recommended.`,
      };
    }
    // Lp(a) ≥50 + ApoB/non-HDL above goal
    else if (lpa !== undefined && lpa >= 50 && ((apoB !== undefined && apoB >= 90) || (nonHDL !== undefined && nonHDL >= 130))) {
      result.statinDiscussion = {
        indicated: true,
        strength: 'generally_recommended',
        rationale: `Elevated Lp(a) (${lpa} mg/dL) combined with elevated ApoB/non-HDL. Statin therapy recommended to reduce overall atherogenic burden.`,
        additionalNotes: 'While statins do not lower Lp(a), reducing LDL/ApoB provides cardiovascular benefit.',
      };
    }
    
    // ============================================
    // CAC INTERPRETATION (if score provided)
    // ============================================
    if (cacScore !== undefined) {
      if (cacScore === 0) {
        result.cacInterpretation = {
          score: cacScore,
          interpretation: 'CAC = 0: No detectable coronary artery calcium.',
          clinicalImplication: 'Supports deferring statin short-term in selected patients. However, high Lp(a) still warrants close follow-up as it reflects genetic risk not captured by CAC.',
        };
      } else if (cacScore >= 1 && cacScore < 100) {
        result.cacInterpretation = {
          score: cacScore,
          interpretation: `CAC 1-99 (${cacScore}): Mild coronary atherosclerosis detected.`,
          clinicalImplication: 'Favors statin therapy, especially if age >55 or risk enhancers present. Indicates presence of subclinical disease.',
        };
      } else if (cacScore >= 100) {
        result.cacInterpretation = {
          score: cacScore,
          interpretation: `CAC ≥100 (${cacScore}): Significant coronary atherosclerosis.`,
          clinicalImplication: 'Strong indication for statin therapy plus intensive cardiovascular risk reduction. Consider aspirin if appropriate.',
        };
      }
    }
    
    // ============================================
    // TRIGLYCERIDE MANAGEMENT
    // ============================================
    if (tg !== undefined) {
      if (tg >= 500) {
        result.triglycerideMgmt = {
          elevated: true,
          severity: 'very_high',
          recommendation: `Triglycerides ≥500 mg/dL (${tg} mg/dL) - URGENT: High risk for pancreatitis. Fibrate therapy indicated. Rule out secondary causes (diabetes, alcohol, medications).`,
        };
      } else if (tg >= 200) {
        let rec = `Triglycerides 200-499 mg/dL (${tg} mg/dL). Recommend intensive lifestyle modification first. Rule out secondary causes (diabetes, hypothyroidism, medications, alcohol).`;
        // If on statin and TG persists, discuss omega-3
        if (result.statinDiscussion.indicated || knownASCVD) {
          rec += ' If on statin and TG persists ≥150, consider prescription omega-3 (icosapent ethyl) for patients with established ASCVD or diabetes with additional risk factors.';
        }
        result.triglycerideMgmt = {
          elevated: true,
          severity: 'high',
          recommendation: rec,
        };
      } else if (tg >= 150) {
        result.triglycerideMgmt = {
          elevated: true,
          severity: 'borderline',
          recommendation: `Triglycerides 150-199 mg/dL (${tg} mg/dL). Lifestyle modifications recommended (weight loss, exercise, reduce refined carbs/alcohol).`,
        };
      } else {
        result.triglycerideMgmt = {
          elevated: false,
          severity: 'normal',
          recommendation: 'Triglycerides within normal range.',
        };
      }
    }
    
    // ============================================
    // Lp(a) WARNING MESSAGE
    // ============================================
    if (lpa !== undefined && lpa >= 180) {
      result.lpaWarning = `Very high Lp(a) of ${lpa} mg/dL detected. Even if LDL appears "okay," overall inherited cardiovascular risk is high. Lp(a) is a genetic, largely non-modifiable risk factor. Lowering ApoB/LDL through statin therapy is one of the best available strategies to mitigate this risk. Consider referral to lipid specialist.`;
    } else if (lpa !== undefined && lpa >= 50) {
      result.lpaWarning = `Elevated Lp(a) of ${lpa} mg/dL is a genetic cardiovascular risk marker. This level is associated with increased ASCVD risk independent of LDL. Since Lp(a) cannot be significantly lowered, focus on aggressive LDL/ApoB reduction and lifestyle optimization.`;
    }
    
    return result;
  }
}
