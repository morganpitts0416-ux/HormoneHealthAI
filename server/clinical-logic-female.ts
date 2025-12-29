// Female Clinical Logic Engine - Women's Hormone Clinic Standing Orders
import type { FemaleLabValues, RedFlag, LabInterpretation } from "@shared/schema";

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
        message: `Vitamin D is ${labs.vitaminD} ng/mL (<10 threshold).`,
        action: "High-dose vitamin D supplementation recommended. Screen for malabsorption.",
      });
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

    // Estradiol - Phase-dependent interpretation
    if (labs.estradiol !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let referenceRange = '';

      if (phase === 'postmenopausal') {
        referenceRange = '<20 pg/mL (postmenopausal)';
        if (labs.estradiol > 20 && !labs.onHRT) {
          status = 'borderline';
          interpretation = 'Estradiol elevated for postmenopausal status without HRT.';
          recommendation = 'Evaluate for exogenous estrogen source or ovarian pathology.';
        } else if (labs.onHRT) {
          status = 'normal';
          interpretation = 'Estradiol level consistent with HRT use.';
          recommendation = 'Continue monitoring HRT effectiveness and side effects.';
        } else {
          status = 'normal';
          interpretation = 'Estradiol appropriate for postmenopausal status.';
          recommendation = 'Consider HRT if symptomatic for vasomotor symptoms.';
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

    // Progesterone - Phase-dependent interpretation
    if (labs.progesterone !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';
      let referenceRange = '';

      if (phase === 'follicular' || phase === 'ovulatory') {
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

    // Testosterone - Female ranges (much lower than male)
    if (labs.testosterone !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

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

      interpretations.push({
        category: 'Testosterone (Total)',
        value: labs.testosterone,
        unit: 'ng/dL',
        status,
        referenceRange: '15-70 ng/dL',
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

    // Ferritin
    if (labs.ferritin !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.ferritin < 10) {
        status = 'critical';
        interpretation = 'Severely depleted iron stores.';
        recommendation = 'Iron replacement therapy. Evaluate for blood loss (menorrhagia, GI).';
      } else if (labs.ferritin < 30) {
        status = 'abnormal';
        interpretation = 'Low ferritin - iron deficiency.';
        recommendation = 'Oral iron supplementation. Evaluate for heavy menstrual bleeding.';
      } else if (labs.ferritin >= 30 && labs.ferritin <= 150) {
        status = 'normal';
        interpretation = 'Ferritin within normal range.';
        recommendation = 'Adequate iron stores.';
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
        referenceRange: '30-150 ng/mL',
        interpretation,
        recommendation,
      });
    }

    // Vitamin D
    if (labs.vitaminD !== undefined) {
      let status: LabInterpretation['status'] = 'normal';
      let interpretation = '';
      let recommendation = '';

      if (labs.vitaminD < 10) {
        status = 'critical';
        interpretation = 'Severe vitamin D deficiency.';
        recommendation = 'High-dose vitamin D (50,000 IU weekly). Screen for malabsorption.';
      } else if (labs.vitaminD < 20) {
        status = 'abnormal';
        interpretation = 'Vitamin D deficiency.';
        recommendation = 'Vitamin D3 supplementation 2,000-4,000 IU daily.';
      } else if (labs.vitaminD < 30) {
        status = 'borderline';
        interpretation = 'Vitamin D insufficiency.';
        recommendation = 'Moderate supplementation (1,000-2,000 IU daily).';
      } else if (labs.vitaminD >= 30 && labs.vitaminD <= 80) {
        status = 'normal';
        interpretation = 'Optimal vitamin D level.';
        recommendation = 'Maintain with 1,000 IU daily or sun exposure.';
      } else {
        status = 'abnormal';
        interpretation = 'Elevated vitamin D - possible toxicity if >100.';
        recommendation = 'Reduce supplementation. Monitor calcium levels.';
      }

      interpretations.push({
        category: 'Vitamin D (25-OH)',
        value: labs.vitaminD,
        unit: 'ng/mL',
        status,
        referenceRange: '30-80 ng/mL',
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
}
