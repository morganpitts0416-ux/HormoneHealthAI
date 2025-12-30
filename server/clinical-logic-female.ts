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
    if (labs.ferritin !== undefined && labs.ferritin < 10) {
      redFlags.push({
        category: "Iron - Severe Deficiency",
        severity: 'urgent',
        message: `Ferritin is ${labs.ferritin} ng/mL (<10 threshold).`,
        action: "Evaluate for occult blood loss. Initiate iron replacement therapy.",
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
      
      // Iron restriction: Calculate TSAT from iron and TIBC, or check ferritin low/borderline
      // TSAT = (Iron / TIBC) × 100
      const ferritin = labs.ferritin;
      let calculatedTsat: number | undefined;
      if (labs.iron !== undefined && labs.tibc !== undefined && labs.tibc > 0) {
        calculatedTsat = (labs.iron / labs.tibc) * 100;
      }
      if (calculatedTsat !== undefined && calculatedTsat < 20) {
        reactivePatterns.push('iron restriction (low iron saturation)');
      }
      if (ferritin !== undefined && ferritin < 30) {
        reactivePatterns.push('low ferritin suggesting iron deficiency');
      } else if (ferritin !== undefined && ferritin >= 30 && ferritin < 50) {
        reactivePatterns.push('borderline ferritin');
      }

      // Inflammation: hs-CRP elevated
      if (labs.hsCRP !== undefined && labs.hsCRP >= 2.0) {
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
        recommendation = 'May indicate PCOS if LH:FSH ratio >2. Correlate with other findings.';
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
        // Non-HRT patient - standard female ranges
        if (labs.testosterone > 70) {
          status = 'abnormal';
          interpretation = 'Elevated testosterone for females.';
          recommendation = 'Evaluate for PCOS, adrenal hyperplasia, or androgen-secreting tumor.';
        } else if (labs.testosterone > 50 && labs.testosterone <= 70) {
          status = 'borderline';
          interpretation = 'Upper normal testosterone - may be elevated.';
          recommendation = 'Correlate with clinical signs (hirsutism, acne). Consider PCOS workup.';
        } else if (labs.testosterone >= 15 && labs.testosterone <= 50) {
          status = 'normal';
          interpretation = 'Testosterone within normal female range.';
          recommendation = 'No intervention needed.';
        } else {
          status = 'borderline';
          interpretation = 'Low testosterone.';
          recommendation = 'May contribute to low libido or fatigue. Consider HRT discussion.';
        }
      }

      interpretations.push({
        category: 'Testosterone (Total)',
        value: labs.testosterone,
        unit: 'ng/dL',
        status,
        referenceRange: onHRT ? '75-125 ng/dL (HRT goal)' : '15-70 ng/dL',
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

    // DHEA-S
    if (labs.dheas !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.dheas > 400) {
        status = 'abnormal';
        interpretation = 'Elevated DHEA-S - adrenal androgen excess.';
        recommendation = 'Evaluate for adrenal hyperplasia or tumor. Consider 17-OH progesterone.';
      } else if (labs.dheas >= 65 && labs.dheas <= 400) {
        status = 'normal';
        interpretation = 'DHEA-S within normal range.';
        recommendation = 'No intervention needed.';
      } else {
        status = 'borderline';
        interpretation = 'Low DHEA-S.';
        recommendation = 'May contribute to fatigue. Consider adrenal function testing.';
      }

      interpretations.push({
        category: 'DHEA-S',
        value: labs.dheas,
        unit: 'µg/dL',
        status,
        referenceRange: '65-400 µg/dL',
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
        interpretation = 'High AMH - may indicate PCOS.';
        recommendation = 'Correlate with clinical findings and ultrasound for PCOS diagnosis.';
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

      // Check for functional iron deficiency indicators
      const hasElevatedTIBC = labs.tibc !== undefined && labs.tibc > 450;
      const hasLowSerumIron = labs.iron !== undefined && labs.iron < 40;
      const hasFunctionalDeficiency = hasElevatedTIBC || hasLowSerumIron;

      if (labs.ferritin < 10) {
        status = 'critical';
        interpretation = 'Severely depleted iron stores.';
        recommendation = 'Provider recommendation: Treat with 65mg elemental iron. Evaluate for blood loss (menorrhagia, GI).';
      } else if (labs.ferritin <= 30) {
        status = 'abnormal';
        interpretation = 'Low ferritin - iron deficiency. Treat all patients at this level.';
        recommendation = 'Provider recommendation: Treat with 65mg elemental iron. Evaluate for heavy menstrual bleeding or GI loss.';
      } else if (labs.ferritin > 30 && labs.ferritin <= 50) {
        if (hasFunctionalDeficiency) {
          status = 'borderline';
          interpretation = 'Ferritin 31-50 with functional iron deficiency indicators (elevated TIBC or low serum iron).';
          recommendation = 'Provider recommendation: Treat with 65mg elemental iron if symptomatic (fatigue, hair loss, restless legs). Evaluate other iron studies.';
        } else {
          status = 'borderline';
          interpretation = 'Ferritin in lower optimal range (31-50).';
          recommendation = 'Consider 65mg elemental iron if symptomatic (fatigue, hair loss, restless legs, exercise intolerance).';
        }
      } else if (labs.ferritin > 50 && labs.ferritin <= 150) {
        status = 'normal';
        interpretation = 'Ferritin within optimal range.';
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
        referenceRange: '30-150 ng/mL (optimal >50)',
        interpretation,
        recommendation,
      });
    }

    // Vitamin D - Provider protocol: Goal 60-80 ng/mL
    if (labs.vitaminD !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.vitaminD <= 30) {
        status = 'abnormal';
        interpretation = 'Vitamin D deficiency (≤30 ng/mL). Goal is 60-80 ng/mL.';
        recommendation = 'Provider protocol: 10,000 IU D3+K daily OR weekly prescription of 50,000 IU D3. Recheck in 8-12 weeks.';
      } else if (labs.vitaminD <= 40) {
        status = 'borderline';
        interpretation = 'Vitamin D insufficiency (≤40 ng/mL). Goal is 60-80 ng/mL.';
        recommendation = 'Provider protocol: 5,000 IU D3+K daily. Recheck in 8-12 weeks.';
      } else if (labs.vitaminD < 60) {
        status = 'borderline';
        interpretation = 'Vitamin D suboptimal. Goal is 60-80 ng/mL.';
        recommendation = 'Consider 2,000-5,000 IU D3+K daily to reach optimal range of 60-80 ng/mL.';
      } else if (labs.vitaminD >= 60 && labs.vitaminD <= 80) {
        status = 'normal';
        interpretation = 'Optimal vitamin D level (60-80 ng/mL).';
        recommendation = 'Maintain with 1,000-2,000 IU D3+K daily.';
      } else if (labs.vitaminD > 80 && labs.vitaminD <= 100) {
        status = 'borderline';
        interpretation = 'Vitamin D above optimal range.';
        recommendation = 'Reduce supplementation to maintenance dose. Goal is 60-80 ng/mL.';
      } else {
        status = 'abnormal';
        interpretation = 'Elevated vitamin D - possible toxicity risk if >100.';
        recommendation = 'Hold supplementation. Monitor calcium levels. Recheck in 4-6 weeks.';
      }

      interpretations.push({
        category: 'Vitamin D (25-OH)',
        value: labs.vitaminD,
        unit: 'ng/mL',
        status,
        referenceRange: '60-80 ng/mL (optimal)',
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

    // Lp(a)
    if (labs.lpa !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.lpa >= 125) {
        status = 'abnormal';
        interpretation = 'Significantly elevated Lp(a) - high cardiovascular risk.';
        recommendation = 'Genetic cardiovascular risk factor. Consider aggressive LDL lowering.';
      } else if (labs.lpa >= 75 && labs.lpa < 125) {
        status = 'borderline';
        interpretation = 'Moderately elevated Lp(a).';
        recommendation = 'Lifestyle optimization. Lower other modifiable risk factors.';
      } else {
        status = 'normal';
        interpretation = 'Lp(a) within acceptable range.';
        recommendation = 'Routine monitoring.';
      }

      interpretations.push({
        category: 'Lipoprotein(a)',
        value: labs.lpa,
        unit: 'nmol/L',
        status,
        referenceRange: '<75 nmol/L',
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

    // hs-CRP
    if (labs.hsCRP !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.hsCRP > 10) {
        status = 'critical';
        interpretation = 'Markedly elevated hs-CRP - acute inflammation.';
        recommendation = 'Evaluate for infection or inflammatory condition.';
      } else if (labs.hsCRP > 3) {
        status = 'abnormal';
        interpretation = 'Elevated hs-CRP - high cardiovascular risk.';
        recommendation = 'Aggressive cardiovascular risk factor modification.';
      } else if (labs.hsCRP >= 1 && labs.hsCRP <= 3) {
        status = 'borderline';
        interpretation = 'Moderate cardiovascular inflammation risk.';
        recommendation = 'Lifestyle modifications. Consider repeat in 2-4 weeks.';
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
        referenceRange: '<1 low risk, 1-3 moderate, >3 high risk',
        interpretation,
        recommendation,
      });
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

    // Lipoprotein(a) - Lp(a) thresholds
    // ≥50 mg/dL (or ≥125 nmol/L) = high risk
    // ≥180 mg/dL = very high / genetic-equivalent risk
    if (labs.lpa !== undefined) {
      if (labs.lpa >= 180) {
        flags.high_Lp_a = true;
        flags.very_high_Lp_a = true;
      } else if (labs.lpa >= 50) {
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

    // hs-CRP ≥2.0 mg/L = cardiovascular risk enhancer
    if (labs.hsCRP !== undefined && labs.hsCRP >= 2.0) {
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
