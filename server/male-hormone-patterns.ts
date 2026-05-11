import type { LabValues } from "@shared/schema";

export interface MaleHormonePattern {
  id: string;
  name: string;
  confidence: 'high' | 'moderate' | 'low';
  typicalLabs: string;
  clinicalFeatures: string;
  interpretation: string;
  clinicalConsiderations: string;
  matchedFindings: string[];
}

export function detectMaleHormonePatterns(labs: LabValues): MaleHormonePattern[] {
  const detected: MaleHormonePattern[] = [];

  const T = labs.testosterone;
  const freeT = labs.freeTestosterone;
  const shbg = labs.shbg;
  const lh = labs.lh;
  const e2 = labs.estradiol;
  const hct = labs.hematocrit;
  const onTRT = (labs as any).onTRT as boolean | undefined;

  const tLow = T !== undefined && T < 350;
  const tVeryLow = T !== undefined && T < 300;
  const tBorderline = T !== undefined && T >= 300 && T < 500;
  const tNormal = T !== undefined && T >= 350 && T <= 1000;
  const tHigh = T !== undefined && T > 1000;
  const tSupra = T !== undefined && T > 1100;

  const freeTLow = freeT !== undefined && freeT < 50;
  const shbgLow = shbg !== undefined && shbg < 20;
  const shbgHigh = shbg !== undefined && shbg > 45;
  const lhElevated = lh !== undefined && lh > 9;
  const lhLow = lh !== undefined && lh < 2;
  const lhSuppressed = lh !== undefined && lh < 1.5;
  const e2High = e2 !== undefined && e2 > 40;
  const hctHigh = hct !== undefined && hct > 50;

  // ── 1. Primary Testicular Failure ─────────────────────────────────────────
  if (tLow && lhElevated) {
    const findings: string[] = [];
    if (T !== undefined) findings.push(`Total testosterone ${T} ng/dL (low)`);
    if (lh !== undefined) findings.push(`LH ${lh} mIU/mL (elevated — pituitary attempting compensation)`);
    if (freeTLow && freeT !== undefined) findings.push(`Free testosterone ${freeT} pg/mL (low)`);
    detected.push({
      id: 'primary_testicular_failure',
      name: 'Primary Testicular Failure Pattern',
      confidence: tVeryLow && lhElevated ? 'high' : 'moderate',
      typicalLabs: 'Low total testosterone, low free testosterone, elevated LH/FSH',
      clinicalFeatures: 'Low libido, erectile dysfunction, fatigue, infertility, reduced muscle mass',
      interpretation: 'Suggests impaired testicular testosterone production.',
      clinicalConsiderations: 'Repeat AM testosterone, fertility goals, prolactin, iron studies, urology/endocrinology referral when appropriate.',
      matchedFindings: findings,
    });
  }

  // ── 2. Secondary / Central Suppression Pattern ────────────────────────────
  if (tLow && lh !== undefined && lhLow && !onTRT) {
    const findings: string[] = [];
    if (T !== undefined) findings.push(`Total testosterone ${T} ng/dL (low)`);
    if (lh !== undefined) findings.push(`LH ${lh} mIU/mL (inappropriately low for hypogonadal state)`);
    detected.push({
      id: 'secondary_central_suppression',
      name: 'Secondary / Central Suppression Pattern',
      confidence: tVeryLow && lhLow ? 'high' : 'moderate',
      typicalLabs: 'Low total testosterone, low free testosterone, low or inappropriately normal LH/FSH',
      clinicalFeatures: 'Fatigue, low drive, obesity, poor recovery, sleep issues',
      interpretation: 'May reflect hypothalamic or pituitary suppression.',
      clinicalConsiderations: 'Assess obesity, OSA, opioid use, stress, pituitary causes, prolactin, thyroid function.',
      matchedFindings: findings,
    });
  }

  // ── 3. Obesity / Low SHBG Functional Low-T Pattern ───────────────────────
  if (tLow && shbgLow) {
    const findings: string[] = [];
    if (T !== undefined) findings.push(`Total testosterone ${T} ng/dL (may be artificially suppressed by low SHBG)`);
    if (shbg !== undefined) findings.push(`SHBG ${shbg} nmol/L (low — suppresses total testosterone reading)`);
    if (freeT !== undefined && !freeTLow) findings.push(`Free testosterone ${freeT} pg/mL (relatively preserved)`);
    detected.push({
      id: 'obesity_low_shbg',
      name: 'Obesity / Low SHBG Functional Low-T Pattern',
      confidence: 'high',
      typicalLabs: 'Low total testosterone, normal or borderline free testosterone, low SHBG',
      clinicalFeatures: 'Visceral adiposity, insulin resistance, fatty liver pattern',
      interpretation: 'Total testosterone may appear falsely low due to suppressed SHBG.',
      clinicalConsiderations: 'Prioritize free testosterone interpretation and metabolic optimization.',
      matchedFindings: findings,
    });
  }

  // ── 4. High SHBG / Low Free Testosterone Pattern ─────────────────────────
  if (tNormal && freeTLow && shbgHigh) {
    const findings: string[] = [];
    if (T !== undefined) findings.push(`Total testosterone ${T} ng/dL (within range)`);
    if (freeT !== undefined) findings.push(`Free testosterone ${freeT} pg/mL (low — biologically active fraction insufficient)`);
    if (shbg !== undefined) findings.push(`SHBG ${shbg} nmol/L (elevated — binding excess testosterone)`);
    detected.push({
      id: 'high_shbg_low_free_t',
      name: 'High SHBG / Low Free Testosterone Pattern',
      confidence: 'high',
      typicalLabs: 'Normal total testosterone, low free testosterone, elevated SHBG',
      clinicalFeatures: "Symptoms despite 'normal' total testosterone",
      interpretation: 'Bioavailable androgen may still be insufficient.',
      clinicalConsiderations: 'Review thyroid, liver status, nutrition, aging-related SHBG elevation.',
      matchedFindings: findings,
    });
  }

  // ── 5. Aromatization / Estrogen-Dominant Pattern ─────────────────────────
  if (e2High && T !== undefined && T < 600) {
    const findings: string[] = [];
    if (e2 !== undefined) findings.push(`Estradiol ${e2} pg/mL (elevated — suggests increased aromatization)`);
    if (T !== undefined) findings.push(`Total testosterone ${T} ng/dL (borderline/low relative to estradiol)`);
    detected.push({
      id: 'aromatization_estrogen_dominant',
      name: 'Aromatization / Estrogen-Dominant Pattern',
      confidence: e2High && tLow ? 'high' : 'moderate',
      typicalLabs: 'Borderline or low testosterone with higher estradiol',
      clinicalFeatures: 'Fluid retention, gynecomastia, emotional lability, low libido',
      interpretation: 'Increased aromatase activity often associated with adiposity.',
      clinicalConsiderations: 'Address metabolic health and body composition before reflexively suppressing estrogen.',
      matchedFindings: findings,
    });
  }

  // ── 6. Over-Replacement / Supraphysiologic TRT Pattern ───────────────────
  {
    const overReplacementSignals: string[] = [];
    if (tSupra && T !== undefined) overReplacementSignals.push(`Total testosterone ${T} ng/dL (supraphysiologic)`);
    if (lhSuppressed && lh !== undefined) overReplacementSignals.push(`LH ${lh} mIU/mL (suppressed — consistent with exogenous testosterone)`);
    if (hctHigh && hct !== undefined) overReplacementSignals.push(`Hematocrit ${hct}% (elevated — erythrocytosis risk)`);
    if (e2High && e2 !== undefined) overReplacementSignals.push(`Estradiol ${e2} pg/mL (elevated with high androgen load)`);

    if (overReplacementSignals.length >= 2) {
      detected.push({
        id: 'over_replacement_trt',
        name: 'Over-Replacement / Supraphysiologic TRT Pattern',
        confidence: tSupra && hctHigh ? 'high' : 'moderate',
        typicalLabs: 'High total/free testosterone, suppressed LH/FSH, elevated hematocrit',
        clinicalFeatures: 'Acne, irritability, insomnia, elevated BP, edema',
        interpretation: 'May indicate excessive androgen replacement.',
        clinicalConsiderations: 'Review dosing strategy, frequency, estradiol, CBC, fertility implications.',
        matchedFindings: overReplacementSignals,
      });
    }
  }

  // ── 7. TRT Non-Responder / Symptom-Mismatch Pattern ──────────────────────
  if ((onTRT || lhSuppressed) && tNormal && !tHigh) {
    const findings: string[] = [];
    if (T !== undefined) findings.push(`Total testosterone ${T} ng/dL (in optimized range)`);
    if (lhSuppressed && lh !== undefined) findings.push(`LH ${lh} mIU/mL (suppressed — consistent with TRT)`);
    if (onTRT) findings.push('Patient documented as currently on TRT');
    detected.push({
      id: 'trt_non_responder',
      name: 'TRT Non-Responder / Symptom-Mismatch Pattern',
      confidence: 'moderate',
      typicalLabs: 'Normal or high testosterone but persistent symptoms',
      clinicalFeatures: 'Fatigue, low motivation, poor sleep, mood symptoms',
      interpretation: 'Symptoms may not be androgen-driven if testosterone is adequately replaced.',
      clinicalConsiderations: 'Evaluate sleep apnea, thyroid, mental health, metabolic dysfunction, nutrient deficiencies.',
      matchedFindings: findings,
    });
  }

  // ── 8. Fertility-Preservation Pattern ────────────────────────────────────
  if (tBorderline && lh !== undefined && !lhSuppressed && !lhElevated && !onTRT) {
    const findings: string[] = [];
    if (T !== undefined) findings.push(`Total testosterone ${T} ng/dL (borderline — fertility-relevant range)`);
    if (lh !== undefined) findings.push(`LH ${lh} mIU/mL (preserved — HPG axis intact)`);
    detected.push({
      id: 'fertility_preservation',
      name: 'Fertility-Preservation Pattern',
      confidence: 'moderate',
      typicalLabs: 'Borderline testosterone with preserved or desired fertility',
      clinicalFeatures: 'Low libido or energy with concern about sperm production',
      interpretation: 'Traditional TRT may suppress spermatogenesis.',
      clinicalConsiderations: 'Discuss fertility goals prior to testosterone therapy. Consider clomiphene, hCG, or enclomiphene alternatives.',
      matchedFindings: findings,
    });
  }

  return detected;
}
