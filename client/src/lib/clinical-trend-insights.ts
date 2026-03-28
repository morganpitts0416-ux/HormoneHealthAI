import type { LabResult } from '@shared/schema';

export interface TrendInsight {
  markerKey: string;
  markerName: string;
  unit: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  direction: 'improved' | 'worsened' | 'stable';
  severity: 'positive' | 'neutral' | 'concern' | 'urgent';
  clinicianInsight: string;
  patientInsight: string;
  recommendation?: string;
}

interface MarkerProfile {
  name: string;
  key: string;
  unit: string;
  lowerIsBetter?: boolean;
  optimalMin?: number;
  optimalMax?: number;
  criticalMin?: number;
  criticalMax?: number;
  getClinicianInsight: (current: number, previous: number, direction: 'improved' | 'worsened' | 'stable') => string;
  getPatientInsight: (current: number, previous: number, direction: 'improved' | 'worsened' | 'stable') => string;
  getRecommendation?: (current: number, direction: 'improved' | 'worsened' | 'stable') => string | undefined;
}

const markerProfiles: MarkerProfile[] = [
  {
    name: 'LDL', key: 'ldl', unit: 'mg/dL', lowerIsBetter: true,
    optimalMax: 100, criticalMax: 190,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c < 70) return `LDL at goal (<70 mg/dL) for high-risk patients. Excellent response to therapy.`;
        if (c <= 100) return `LDL improved to optimal range. Continue current lipid-lowering regimen.`;
        return `LDL trending down (${p} -> ${c}). Continue monitoring; consider intensifying therapy if not at goal.`;
      }
      if (d === 'worsened') {
        if (c >= 190) return `LDL critically elevated at ${c}. Evaluate for familial hypercholesterolemia. High-intensity statin indicated.`;
        if (c > 130) return `LDL rising above desirable range. Assess medication adherence, dietary factors, and consider statin initiation/intensification.`;
        return `LDL trending up (${p} -> ${c}). Review dietary habits and medication compliance.`;
      }
      return `LDL stable at ${c} mg/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your LDL ("bad cholesterol") has improved from ${p} to ${c} - this is great progress for your heart health.`;
      if (d === 'worsened') return `Your LDL cholesterol has risen from ${p} to ${c}. We'll discuss strategies to help bring this back down.`;
      return `Your LDL cholesterol is holding steady at ${c}.`;
    },
    getRecommendation: (c, d) => {
      if (d === 'worsened' && c > 130) return 'Consider statin therapy evaluation. Recommend Mediterranean-style diet, increase soluble fiber, and regular aerobic exercise.';
      if (d === 'worsened') return 'Review dietary habits - reduce saturated fat, increase omega-3 fatty acids and soluble fiber intake.';
      return undefined;
    }
  },
  {
    name: 'HDL', key: 'hdl', unit: 'mg/dL', lowerIsBetter: false,
    optimalMin: 40, criticalMin: 30,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c >= 60) return `HDL at cardioprotective level (>= 60 mg/dL). Positive trend.`;
        return `HDL improving (${p} -> ${c}). Encourage continued exercise and healthy fat intake.`;
      }
      if (d === 'worsened') {
        if (c < 40) return `HDL below protective threshold. Assess lifestyle factors, insulin resistance, and consider niacin or fibrate therapy.`;
        return `HDL declining (${p} -> ${c}). Screen for metabolic syndrome contributors.`;
      }
      return `HDL stable at ${c} mg/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your HDL ("good cholesterol") has increased from ${p} to ${c} - this helps protect your heart.`;
      if (d === 'worsened') return `Your HDL cholesterol has decreased from ${p} to ${c}. We'll work on lifestyle changes to help raise it.`;
      return `Your HDL cholesterol is stable at ${c}.`;
    },
    getRecommendation: (c, d) => {
      if (d === 'worsened' && c < 40) return 'Increase aerobic exercise (150+ min/week), add omega-3 rich foods, consider Omega-3 supplementation.';
      return undefined;
    }
  },
  {
    name: 'Triglycerides', key: 'triglycerides', unit: 'mg/dL', lowerIsBetter: true,
    optimalMax: 150, criticalMax: 500,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c < 100) return `Triglycerides optimal (<100 mg/dL). Excellent metabolic marker.`;
        return `Triglycerides improving (${p} -> ${c}). Continue current management.`;
      }
      if (d === 'worsened') {
        if (c >= 500) return `Triglycerides severely elevated - pancreatitis risk. Immediate dietary intervention and pharmacotherapy indicated.`;
        if (c > 200) return `Triglycerides elevated. Evaluate carbohydrate intake, alcohol use, and insulin resistance. Consider omega-3 or fibrate therapy.`;
        return `Triglycerides trending up (${p} -> ${c}). Review dietary carbohydrate and alcohol intake.`;
      }
      return `Triglycerides stable at ${c} mg/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your triglycerides have come down from ${p} to ${c} - a positive sign for your metabolic health.`;
      if (d === 'worsened') return `Your triglycerides have risen from ${p} to ${c}. Diet modifications can make a big difference here.`;
      return `Your triglycerides are holding steady at ${c}.`;
    },
    getRecommendation: (c, d) => {
      if (d === 'worsened' && c > 200) return 'Reduce refined carbohydrates and sugar, limit alcohol, increase omega-3 intake, and consider Omega-3 supplementation.';
      return undefined;
    }
  },
  {
    name: 'Total Cholesterol', key: 'totalCholesterol', unit: 'mg/dL', lowerIsBetter: true,
    optimalMax: 200,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') return `Total cholesterol improved (${p} -> ${c}). Evaluate LDL/HDL ratio for complete picture.`;
      if (d === 'worsened') return `Total cholesterol rising (${p} -> ${c}). Assess individual lipid fractions for targeted intervention.`;
      return `Total cholesterol stable at ${c} mg/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your total cholesterol improved from ${p} to ${c}.`;
      if (d === 'worsened') return `Your total cholesterol has risen from ${p} to ${c}. We'll look at the individual components to guide next steps.`;
      return `Your total cholesterol is stable at ${c}.`;
    }
  },
  {
    name: 'ApoB', key: 'apoB', unit: 'mg/dL', lowerIsBetter: true,
    optimalMax: 90, criticalMax: 130,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c < 80) return `ApoB at advanced lipid goal (<80). Superior marker of atherogenic particle burden - excellent response.`;
        return `ApoB improving (${p} -> ${c}). Continue current lipid management.`;
      }
      if (d === 'worsened') {
        if (c > 130) return `ApoB significantly elevated - high atherogenic particle count. Consider intensifying lipid-lowering therapy.`;
        return `ApoB trending up (${p} -> ${c}). Re-evaluate lipid management strategy.`;
      }
      return `ApoB stable at ${c} mg/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your ApoB (a key marker for heart disease risk particles) has improved from ${p} to ${c}.`;
      if (d === 'worsened') return `Your ApoB level has risen from ${p} to ${c}, meaning there are more cholesterol-carrying particles in your blood.`;
      return `Your ApoB level is stable at ${c}.`;
    }
  },
  {
    name: 'A1c', key: 'a1c', unit: '%', lowerIsBetter: true,
    optimalMax: 5.7, criticalMax: 9.0,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c < 5.7) return `A1c normalized to non-diabetic range. Excellent glycemic control.`;
        if (c < 6.5) return `A1c improved to pre-diabetic range (${p} -> ${c}). Continue lifestyle modifications and monitoring.`;
        return `A1c trending down (${p}% -> ${c}%). Continue current glycemic management.`;
      }
      if (d === 'worsened') {
        if (c >= 6.5 && p < 6.5) return `A1c has crossed diabetic threshold (${p}% -> ${c}%). Initiate formal diabetes workup and management plan.`;
        if (c >= 5.7 && p < 5.7) return `A1c crossed into pre-diabetic range (${p}% -> ${c}%). Intensify lifestyle interventions. Screen for insulin resistance.`;
        return `A1c rising (${p}% -> ${c}%). Assess dietary compliance, physical activity, and medication adherence.`;
      }
      return `A1c stable at ${c}%.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your A1c (3-month blood sugar average) improved from ${p}% to ${c}% - your blood sugar management is heading in the right direction.`;
      if (d === 'worsened') return `Your A1c has risen from ${p}% to ${c}%, meaning your average blood sugar has increased. We'll discuss steps to improve this.`;
      return `Your A1c is steady at ${c}%.`;
    },
    getRecommendation: (c, d) => {
      if (d === 'worsened' && c >= 6.5) return 'Formal diabetes evaluation recommended. Consider metformin therapy, structured exercise program, and nutritional counseling.';
      if (d === 'worsened' && c >= 5.7) return 'Insulin resistance screening recommended. Focus on reducing refined carbohydrates, increasing physical activity, and weight management.';
      return undefined;
    }
  },
  {
    name: 'Fasting Glucose', key: 'fastingGlucose', unit: 'mg/dL', lowerIsBetter: true,
    optimalMax: 100, criticalMax: 200,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') return `Fasting glucose improved (${p} -> ${c} mg/dL). ${c <= 100 ? 'Now within normal range.' : 'Continue monitoring.'}`;
      if (d === 'worsened') {
        if (c >= 126) return `Fasting glucose in diabetic range (>= 126). Correlate with A1c and consider formal diabetes evaluation.`;
        if (c >= 100) return `Fasting glucose in pre-diabetic range. Screen for insulin resistance.`;
        return `Fasting glucose trending up (${p} -> ${c}).`;
      }
      return `Fasting glucose stable at ${c} mg/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your fasting blood sugar improved from ${p} to ${c} - a positive change.`;
      if (d === 'worsened') return `Your fasting blood sugar has risen from ${p} to ${c}. We'll monitor this closely.`;
      return `Your fasting blood sugar is stable at ${c}.`;
    }
  },
  {
    name: 'Testosterone', key: 'testosterone', unit: 'ng/dL',
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c >= 600 && c <= 1200) return `Testosterone in optimal range (600–1200 ng/dL). Protocol effective.`;
        if (c > 1200) return `Testosterone improving toward range but still elevated at ${c} ng/dL (was ${p}). Monitor; dose review may be needed.`;
        return `Testosterone improving (${p} → ${c} ng/dL). Continue current protocol and recheck.`;
      }
      if (d === 'worsened') {
        if (c > 1200) return `Testosterone supraphysiologic at ${c} ng/dL (was ${p} ng/dL; goal 600–1200). Reduce dose 20-30% or extend injection interval.`;
        if (c < 300) return `Testosterone subtherapeutic at ${c} ng/dL (was ${p} ng/dL). Evaluate TRT adherence, injection technique, and trough timing. Consider dose increase.`;
        if (c < p) return `Testosterone declining (${p} → ${c} ng/dL; goal 600–1200). If on TRT, assess adherence and absorption. Consider dose adjustment.`;
        return `Testosterone moved below optimal range (${p} → ${c} ng/dL; goal 600–1200). Evaluate protocol.`;
      }
      return `Testosterone stable at ${c} ng/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your testosterone level has improved from ${p} to ${c} ng/dL — your treatment is working well.`;
      if (d === 'worsened') {
        if (c > 1200) return `Your testosterone is above our target range at ${c} ng/dL. We'll review your protocol.`;
        return `Your testosterone has changed from ${p} to ${c} ng/dL. We may need to adjust your treatment plan.`;
      }
      return `Your testosterone is stable at ${c} ng/dL.`;
    }
  },
  {
    name: 'Free Testosterone', key: 'freeTestosterone', unit: 'pg/mL',
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') return `Free testosterone improving (${p} → ${c} pg/mL). Better bioavailable hormone activity.`;
      if (d === 'worsened') {
        if (c > 200) return `Free testosterone elevated at ${c} pg/mL (was ${p} pg/mL). Supraphysiologic free T — consider protocol dose review.`;
        return `Free testosterone declining (${p} → ${c} pg/mL). Evaluate SHBG levels and consider protocol adjustment.`;
      }
      return `Free testosterone stable at ${c} pg/mL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your free testosterone (the active form) has improved from ${p} to ${c} pg/mL.`;
      if (d === 'worsened') {
        if (c > 200) return `Your free testosterone is on the higher side at ${c} pg/mL. We'll review your protocol.`;
        return `Your free testosterone has decreased from ${p} to ${c} pg/mL. We'll look into what might be affecting this.`;
      }
      return `Your free testosterone is steady at ${c} pg/mL.`;
    }
  },
  {
    name: 'Estradiol', key: 'estradiol', unit: 'pg/mL',
    optimalMin: 55,
    optimalMax: 150,
    criticalMin: 15,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c >= 55 && c <= 150) return `Estradiol improved into optimization goal range (${p} → ${c} pg/mL; goal: 55–150 pg/mL).`;
        return `Estradiol trending toward optimization goal (${p} → ${c} pg/mL; goal: 55–150 pg/mL).`;
      }
      if (d === 'worsened') {
        if (c < 55) return `Estradiol dropped below optimization goal: ${c} pg/mL (was ${p} pg/mL; goal ≥55 pg/mL). Evaluate for perimenopausal decline; consider initiating or adjusting transdermal estradiol.`;
        if (c > 150) return `Estradiol elevated above optimization ceiling: ${c} pg/mL (was ${p} pg/mL; goal 55–150). Assess for high-dose HRT effect or endogenous spike.`;
        return `Estradiol declining within range (${p} → ${c} pg/mL; goal: 55–150 pg/mL). Monitor closely.`;
      }
      if (c < 55) return `Estradiol stable at ${c} pg/mL but below optimization goal (≥55 pg/mL). Consider dose adjustment or initiation of estradiol therapy.`;
      if (c > 150) return `Estradiol stable but above optimization ceiling (${c} pg/mL; goal: 55–150). Monitor for symptoms of excess.`;
      return `Estradiol stable within optimization goal range (${c} pg/mL; goal: 55–150 pg/mL).`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your estrogen (estradiol) level improved from ${p} to ${c} pg/mL, moving toward the healthy target range.`;
      if (d === 'worsened') {
        if (c < 55) return `Your estrogen level has dropped to ${c} pg/mL, which is below the target range. Low estrogen can contribute to hot flashes, sleep problems, mood changes, and other symptoms.`;
        return `Your estrogen level has changed from ${p} to ${c} pg/mL. Your provider will evaluate whether any adjustment is needed.`;
      }
      if (c < 55) return `Your estrogen is steady at ${c} pg/mL, though below the target range. Your provider may discuss options to bring this into the optimal zone.`;
      return `Your estrogen is stable at ${c} pg/mL, within the healthy target range.`;
    },
    getRecommendation: (c, d) => {
      if (c < 55) return 'Estradiol below optimization goal (≥55 pg/mL). If symptomatic, initiate or increase transdermal estradiol — target 55–150 pg/mL. Add micronized progesterone if uterus intact. Avoid oral estrogen (raises SHBG, variable absorption).';
      if (c > 150) return 'Estradiol above optimization ceiling (>150 pg/mL). If on HRT, consider dose reduction. Rule out endogenous spike from ovarian activity. Assess symptoms of estrogen excess.';
      return undefined;
    }
  },
  {
    name: 'SHBG', key: 'shbg', unit: 'nmol/L',
    getClinicianInsight: (c, p, d) => {
      if (d === 'worsened') {
        if (c > 70) return `SHBG elevated (${c} nmol/L) - may be binding free testosterone. Evaluate thyroid function and liver status.`;
        if (c < 20) return `SHBG low (${c} nmol/L) - may indicate insulin resistance or metabolic dysfunction.`;
      }
      return `SHBG ${d === 'stable' ? 'stable' : 'changed'} (${p} -> ${c} nmol/L). Correlate with free testosterone levels.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your SHBG (a protein that affects hormone availability) has improved from ${p} to ${c}.`;
      if (d === 'worsened') return `Your SHBG has shifted from ${p} to ${c}, which may affect how your body uses hormones.`;
      return `Your SHBG is stable at ${c}.`;
    }
  },
  {
    name: 'TSH', key: 'tsh', unit: 'mIU/L',
    optimalMin: 0.45, optimalMax: 4.5,
    getClinicianInsight: (c, p, d) => {
      if (c < 0.4) return `TSH suppressed at ${c}. Rule out hyperthyroidism. Check Free T4/T3.`;
      if (c > 4.5) return `TSH elevated at ${c}. Evaluate for hypothyroidism. Check Free T4 and thyroid antibodies.`;
      if (c >= 0.45 && c <= 4.5) return `TSH within reference range (${c} mIU/L). ${d === 'improved' ? 'Trending toward optimal.' : d === 'worsened' ? 'Monitor trend.' : 'Stable.'}`;
      return `TSH at ${c} mIU/L. ${d !== 'stable' ? `Changed from ${p}.` : 'Stable.'}`;
    },
    getPatientInsight: (c, p, d) => {
      if (c >= 0.45 && c <= 4.5) return `Your thyroid function (TSH) is in the normal range at ${c}.`;
      if (c > 4.5) return `Your TSH is elevated at ${c}, which may indicate your thyroid is underactive. We'll discuss treatment options.`;
      return `Your TSH is at ${c}. We'll discuss what this means for your thyroid health.`;
    }
  },
  {
    name: 'Free T4', key: 'freeT4', unit: 'ng/dL',
    getClinicianInsight: (c, p, d) => {
      return `Free T4 ${d === 'stable' ? 'stable' : d === 'improved' ? 'improving' : 'changed'} (${p} -> ${c} ng/dL). Correlate with TSH.`;
    },
    getPatientInsight: (c, p, d) => {
      return `Your Free T4 (thyroid hormone) is at ${c} ng/dL.`;
    }
  },
  {
    name: 'Free T3', key: 'freeT3', unit: 'pg/mL',
    getClinicianInsight: (c, p, d) => {
      return `Free T3 ${d === 'stable' ? 'stable' : d === 'improved' ? 'improving' : 'changed'} (${p} -> ${c} pg/mL). Assess T4-to-T3 conversion.`;
    },
    getPatientInsight: (c, p, d) => {
      return `Your Free T3 (active thyroid hormone) is at ${c} pg/mL.`;
    }
  },
  {
    name: 'hs-CRP', key: 'hsCRP', unit: 'mg/L', lowerIsBetter: true,
    optimalMax: 1.0, criticalMax: 10.0,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c < 1.0) return `hs-CRP in low-risk category (<1.0 mg/L). Excellent inflammatory marker response.`;
        return `hs-CRP improving (${p} -> ${c}). Inflammatory burden decreasing.`;
      }
      if (d === 'worsened') {
        if (c > 10) return `hs-CRP > 10 mg/L - likely acute inflammation or infection. Rule out acute process before interpreting CV risk.`;
        if (c > 3.0) return `hs-CRP in high-risk category (>3.0 mg/L). Evaluate for chronic inflammatory sources and cardiovascular risk.`;
        return `hs-CRP trending up (${p} -> ${c}). Monitor inflammatory status.`;
      }
      return `hs-CRP stable at ${c} mg/L.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your inflammation marker (hs-CRP) has improved from ${p} to ${c} - less inflammation is better for your overall health.`;
      if (d === 'worsened') return `Your inflammation marker has risen from ${p} to ${c}. We'll investigate what might be causing increased inflammation.`;
      return `Your inflammation marker is stable at ${c}.`;
    },
    getRecommendation: (c, d) => {
      if (d === 'worsened' && c > 3.0) return 'Anti-inflammatory diet recommended. Consider omega-3 supplementation, stress management, and evaluation for chronic inflammatory conditions.';
      return undefined;
    }
  },
  {
    name: 'Hemoglobin', key: 'hemoglobin', unit: 'g/dL',
    getClinicianInsight: (c, p, d) => {
      if (c > 17.5) return `Hemoglobin elevated (${c} g/dL). If on TRT, assess for erythrocytosis. Consider therapeutic phlebotomy.`;
      if (c < 12) return `Hemoglobin low (${c} g/dL). Evaluate for anemia - iron studies, B12, folate.`;
      return `Hemoglobin ${d === 'stable' ? 'stable' : 'changed'} at ${c} g/dL. Within acceptable range.`;
    },
    getPatientInsight: (c, p, d) => {
      if (c > 17.5) return `Your hemoglobin is elevated at ${c}. This needs attention and we'll discuss next steps.`;
      if (c < 12) return `Your hemoglobin is low at ${c}, which can cause fatigue. We'll look into the cause.`;
      return `Your hemoglobin is at ${c} g/dL - within a normal range.`;
    }
  },
  {
    name: 'Hematocrit', key: 'hematocrit', unit: '%',
    criticalMax: 54,
    getClinicianInsight: (c, p, d) => {
      if (c >= 54) return `CRITICAL: Hematocrit >= 54%. Per standing orders: HOLD TRT, order therapeutic phlebotomy, recheck in 2-4 weeks.`;
      if (c >= 50) return `Hematocrit elevated (${c}%). Approaching critical threshold. Consider dose reduction and monitor closely.`;
      return `Hematocrit ${d === 'stable' ? 'stable' : 'changed'} at ${c}%. Within acceptable range.`;
    },
    getPatientInsight: (c, p, d) => {
      if (c >= 54) return `Your hematocrit is elevated at ${c}%, which needs immediate attention for your safety.`;
      if (c >= 50) return `Your hematocrit is slightly elevated at ${c}%. We're monitoring this closely.`;
      return `Your hematocrit is at ${c}% - within normal range.`;
    }
  },
  {
    name: 'Vitamin D', key: 'vitaminD', unit: 'ng/mL', lowerIsBetter: false,
    optimalMin: 40, optimalMax: 80,
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') {
        if (c >= 40 && c <= 80) return `Vitamin D in optimal range (40-80 ng/mL). Maintenance dosing appropriate.`;
        return `Vitamin D improving (${p} -> ${c}). Continue supplementation protocol.`;
      }
      if (d === 'worsened') {
        if (c <= 20) return `Vitamin D deficient (<= 20 ng/mL). Initiate repletion protocol: D3 10,000 IU daily.`;
        if (c <= 40) return `Vitamin D insufficient (${c} ng/mL). Increase supplementation: D3 5,000 IU daily.`;
        return `Vitamin D declining (${p} -> ${c}). Assess supplementation compliance.`;
      }
      return `Vitamin D stable at ${c} ng/mL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your vitamin D has improved from ${p} to ${c} - great progress! Vitamin D is important for bones, immunity, and energy.`;
      if (d === 'worsened') return `Your vitamin D has dropped from ${p} to ${c}. We may need to adjust your supplement dose.`;
      return `Your vitamin D is stable at ${c}.`;
    },
    getRecommendation: (c, d) => {
      if (c <= 20) return 'Vitamin D3 10,000 IU daily repletion protocol. Recheck in 8-12 weeks.';
      if (c > 20 && c <= 40) return 'Vitamin D3 5,000 IU daily. Recheck in 8-12 weeks.';
      return undefined;
    }
  },
  {
    name: 'Ferritin', key: 'ferritin', unit: 'ng/mL',
    getClinicianInsight: (c, p, d) => {
      if (c < 20) return `Ferritin critically depleted at ${c} ng/mL (prev ${p}). Significant iron deficiency — evaluate for occult blood loss, evaluate GI source. Initiate iron supplementation; goal >50 ng/mL.`;
      if (c < 30) return `Ferritin deficient at ${c} ng/mL (prev ${p}). Initiate oral iron supplementation. Goal >50 ng/mL for functional sufficiency.`;
      if (c < 50) {
        if (d === 'improved') return `Ferritin improving (${p} → ${c} ng/mL) — good response to supplementation. Continue to replete; clinical goal >50 ng/mL.`;
        if (d === 'worsened') return `Ferritin declining (${p} → ${c} ng/mL) and remains suboptimal. Reassess supplementation compliance; goal >50 ng/mL.`;
        return `Ferritin suboptimal at ${c} ng/mL. Continue iron supplementation to reach goal >50 ng/mL.`;
      }
      if (c > 300) return `Ferritin elevated at ${c} ng/mL (prev ${p}). Rule out hemochromatosis, chronic inflammation, or liver disease.`;
      if (d === 'improved') return `Ferritin reached goal range at ${c} ng/mL (prev ${p}). Transition to maintenance dosing.`;
      if (d === 'worsened') return `Ferritin declining from ${p} to ${c} ng/mL. Monitor — reassess supplementation if trending below 50 ng/mL.`;
      return `Ferritin stable at ${c} ng/mL — within goal range (>50 ng/mL).`;
    },
    getPatientInsight: (c, p, d) => {
      if (c < 20) return `Your iron stores (ferritin) are critically low at ${c} — this commonly causes fatigue, brain fog, and hair loss. Iron supplementation has been initiated; goal is >50 ng/mL.`;
      if (c < 30) return `Your ferritin (iron stores) is low at ${c} ng/mL. We're working to replete this — the goal is above 50 ng/mL for optimal energy and function.`;
      if (c < 50) {
        if (d === 'improved') return `Your ferritin improved from ${p} to ${c} ng/mL — great progress! Keep taking your iron supplement; the goal is above 50 ng/mL.`;
        if (d === 'worsened') return `Your ferritin dropped from ${p} to ${c} ng/mL and is still below the goal of 50 ng/mL. Make sure to take your iron supplement consistently.`;
        return `Your iron stores are at ${c} ng/mL — improving but still below our goal of 50 ng/mL. Continue your iron supplement.`;
      }
      if (c > 300) return `Your ferritin is elevated at ${c} ng/mL. We'll investigate the cause.`;
      if (d === 'improved') return `Your iron stores (ferritin) reached the goal range — improved from ${p} to ${c} ng/mL. Well done staying consistent with supplementation.`;
      if (d === 'worsened') return `Your ferritin dipped slightly from ${p} to ${c} ng/mL. Still in range, but we'll keep an eye on this trend.`;
      return `Your iron stores (ferritin) are at ${c} ng/mL — in a healthy range. Keep it up.`;
    },
    getRecommendation: (c, d) => {
      if (c < 30) return 'Iron supplementation recommended: Ferrous bisglycinate 25–50 mg elemental iron daily with vitamin C for absorption. Avoid taking with calcium or coffee. Recheck in 8–12 weeks. Goal ferritin >50 ng/mL.';
      if (c < 50) return 'Continue iron supplementation. Ferrous bisglycinate preferred for tolerability. Goal ferritin >50 ng/mL. Recheck in 8–12 weeks.';
      return undefined;
    }
  },
  {
    name: 'Vitamin B12', key: 'vitaminB12', unit: 'pg/mL', lowerIsBetter: false,
    getClinicianInsight: (c, p, d) => {
      if (c < 300) return `B12 suboptimal (${c} pg/mL). Consider methylcobalamin supplementation.`;
      return `B12 ${d === 'stable' ? 'stable' : d === 'improved' ? 'improving' : 'changed'} at ${c} pg/mL. ${c >= 500 ? 'Optimal level.' : 'Adequate.'}`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your vitamin B12 has improved from ${p} to ${c} - important for energy and brain health.`;
      if (d === 'worsened' && c < 300) return `Your vitamin B12 has dropped to ${c}. Supplementation can help boost this important vitamin.`;
      return `Your vitamin B12 is at ${c} pg/mL.`;
    }
  },
  {
    name: 'PSA', key: 'psa', unit: 'ng/mL', lowerIsBetter: true,
    optimalMax: 4.0,
    getClinicianInsight: (c, p, d) => {
      const velocity = c - p;
      if (velocity > 1.4) return `PSA velocity > 1.4 ng/mL/year (${p} -> ${c}). Per standing orders: urology referral recommended.`;
      if (c > 4.0) return `PSA elevated above 4.0 ng/mL. Consider urology referral for evaluation.`;
      if (d === 'worsened') return `PSA rising (${p} -> ${c}). Continue monitoring. Velocity ${velocity.toFixed(2)} ng/mL.`;
      if (d === 'improved') return `PSA decreased (${p} -> ${c}). Favorable trend.`;
      return `PSA stable at ${c} ng/mL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (c > 4.0) return `Your PSA is at ${c}, which is above the typical reference range. A specialist consultation may be recommended.`;
      if (d === 'worsened') return `Your PSA has increased slightly from ${p} to ${c}. We're keeping a close eye on this.`;
      if (d === 'improved') return `Your PSA has decreased from ${p} to ${c} - a good sign.`;
      return `Your PSA is stable at ${c}.`;
    }
  },
];

const rangeBasedDirectionality: Record<string, (current: number, previous: number) => 'improved' | 'worsened' | 'stable'> = {
  testosterone: (c, p) => {
    const cInRange = c >= 600 && c <= 1200;
    const pInRange = p >= 600 && p <= 1200;
    if (cInRange && !pInRange) return 'improved';
    if (!cInRange && pInRange) return 'worsened';
    if (cInRange && pInRange) return 'stable';
    // Both outside range — use distance to nearest range boundary
    const cDist = c < 600 ? 600 - c : c - 1200;
    const pDist = p < 600 ? 600 - p : p - 1200;
    return cDist < pDist ? 'improved' : cDist > pDist ? 'worsened' : 'stable';
  },
  freeTestosterone: (c, p) => {
    if (c > 200 && c > p) return 'worsened';
    return c > p ? 'improved' : c < p ? 'worsened' : 'stable';
  },
  vitaminD: (c, p) => {
    const optMin = 40, optMax = 80;
    const cDist = c < optMin ? optMin - c : c > optMax ? c - optMax : 0;
    const pDist = p < optMin ? optMin - p : p > optMax ? p - optMax : 0;
    if (cDist < pDist) return 'improved';
    if (cDist > pDist) return 'worsened';
    return 'stable';
  },
  vitaminB12: (c, p) => {
    const optMin = 400, optMax = 1100;
    const cDist = c < optMin ? optMin - c : c > optMax ? c - optMax : 0;
    const pDist = p < optMin ? optMin - p : p > optMax ? p - optMax : 0;
    if (cDist < pDist) return 'improved';
    if (cDist > pDist) return 'worsened';
    return 'stable';
  },
  estradiol: (c, p) => {
    // Optimization goal: 55–150 pg/mL. Distance from range determines direction.
    const optMin = 55, optMax = 150;
    const cDist = c < optMin ? optMin - c : c > optMax ? c - optMax : 0;
    const pDist = p < optMin ? optMin - p : p > optMax ? p - optMax : 0;
    if (cDist < pDist) return 'improved';
    if (cDist > pDist) return 'worsened';
    return 'stable';
  },
  shbg: (c, p) => {
    const optMin = 20, optMax = 70;
    const cDist = c < optMin ? optMin - c : c > optMax ? c - optMax : 0;
    const pDist = p < optMin ? optMin - p : p > optMax ? p - optMax : 0;
    if (cDist < pDist) return 'improved';
    if (cDist > pDist) return 'worsened';
    return 'stable';
  },
  tsh: (c, p) => {
    const optMin = 0.45, optMax = 4.5;
    const cDist = c < optMin ? optMin - c : c > optMax ? c - optMax : 0;
    const pDist = p < optMin ? optMin - p : p > optMax ? p - optMax : 0;
    if (cDist < pDist) return 'improved';
    if (cDist > pDist) return 'worsened';
    return 'stable';
  },
  hemoglobin: (c, p) => {
    const optMin = 13, optMax = 17;
    const cDist = c < optMin ? optMin - c : c > optMax ? c - optMax : 0;
    const pDist = p < optMin ? optMin - p : p > optMax ? p - optMax : 0;
    if (cDist < pDist) return 'improved';
    if (cDist > pDist) return 'worsened';
    return 'stable';
  },
  hematocrit: (c, p) => {
    if (c >= 54) return p >= 54 ? (c < p ? 'improved' : 'worsened') : 'worsened';
    if (p >= 54) return 'improved';
    const optMax = 50;
    if (c > optMax && p <= optMax) return 'worsened';
    if (c <= optMax && p > optMax) return 'improved';
    return 'stable';
  },
  ferritin: (c, p) => {
    const optMin = 50, optMax = 300;
    const cDist = c < optMin ? optMin - c : c > optMax ? c - optMax : 0;
    const pDist = p < optMin ? optMin - p : p > optMax ? p - optMax : 0;
    if (cDist < pDist) return 'improved';
    if (cDist > pDist) return 'worsened';
    return 'stable';
  },
  freeT4: (c, p) => 'stable',
  freeT3: (c, p) => 'stable',
};

function determineDirection(
  current: number,
  previous: number,
  lowerIsBetter?: boolean,
  markerKey?: string
): 'improved' | 'worsened' | 'stable' {
  const changePct = previous !== 0 ? Math.abs((current - previous) / previous) * 100 : 0;
  if (changePct < 2) return 'stable';

  if (lowerIsBetter === true) {
    return current < previous ? 'improved' : 'worsened';
  }
  if (lowerIsBetter === false) {
    return current > previous ? 'improved' : 'worsened';
  }

  if (markerKey && rangeBasedDirectionality[markerKey]) {
    return rangeBasedDirectionality[markerKey](current, previous);
  }

  return 'stable';
}

function determineSeverity(
  direction: 'improved' | 'worsened' | 'stable',
  current: number,
  profile: MarkerProfile
): 'positive' | 'neutral' | 'concern' | 'urgent' {
  if (direction === 'improved') return 'positive';
  if (direction === 'stable') return 'neutral';

  if (profile.criticalMax && current >= profile.criticalMax) return 'urgent';
  if (profile.criticalMin && current <= profile.criticalMin) return 'urgent';
  if (profile.optimalMax && current > profile.optimalMax * 1.3) return 'urgent';
  return 'concern';
}

export function generateTrendInsights(labs: LabResult[]): TrendInsight[] {
  if (labs.length < 2) return [];

  const sorted = [...labs].sort((a, b) => new Date(b.labDate).getTime() - new Date(a.labDate).getTime());
  const current = sorted[0].labValues as any;
  const previous = sorted[1].labValues as any;

  const insights: TrendInsight[] = [];

  for (const profile of markerProfiles) {
    const currentVal = current?.[profile.key];
    const previousVal = previous?.[profile.key];

    if (currentVal == null || currentVal === '' || previousVal == null || previousVal === '') continue;

    const c = Number(currentVal);
    const p = Number(previousVal);
    if (!Number.isFinite(c) || !Number.isFinite(p)) continue;

    const change = c - p;
    const changePercent = p !== 0 ? (change / p) * 100 : 0;
    const direction = determineDirection(c, p, profile.lowerIsBetter, profile.key);
    const severity = determineSeverity(direction, c, profile);

    insights.push({
      markerKey: profile.key,
      markerName: profile.name,
      unit: profile.unit,
      currentValue: c,
      previousValue: p,
      change,
      changePercent,
      direction,
      severity,
      clinicianInsight: profile.getClinicianInsight(c, p, direction),
      patientInsight: profile.getPatientInsight(c, p, direction),
      recommendation: profile.getRecommendation?.(c, direction),
    });
  }

  // ── Erratic Estradiol Detection (perimenopausal volatility flag) ──
  // Fires when: female patient ≥35 y/o WITH perimenopausal symptoms AND
  // estradiol shifts >60 pg/mL OR >50% between consecutive labs.
  // Upgrades the existing estradiol insight to urgent with volatility-specific messaging.
  const e2Idx = insights.findIndex(i => i.markerKey === 'estradiol');
  if (e2Idx !== -1) {
    const age = current?.demographics?.age != null ? Number(current.demographics.age) : null;
    const hasPerimenoSymptoms =
      current?.hotFlashes === true ||
      current?.hotFlashes === 'true' ||
      current?.nightSweats === true ||
      current?.nightSweats === 'true' ||
      current?.sleepDisruption === true ||
      current?.sleepDisruption === 'true' ||
      current?.moodChanges === true ||
      current?.moodChanges === 'true' ||
      current?.vaginalDryness === true ||
      current?.vaginalDryness === 'true';

    if (age !== null && age >= 35 && hasPerimenoSymptoms) {
      const e2 = insights[e2Idx];
      const absChange = Math.abs(e2.change);
      const absPct = Math.abs(e2.changePercent);

      if (absChange >= 60 || absPct >= 50) {
        const direction = e2.previousValue < e2.currentValue ? 'rise' : 'drop';
        const pctLabel = absPct.toFixed(0);
        const absLabel = absChange.toFixed(0);
        insights[e2Idx] = {
          ...e2,
          direction: 'worsened',
          severity: 'urgent',
          clinicianInsight: `Estradiol volatility detected: ${e2.previousValue} → ${e2.currentValue} pg/mL (${pctLabel}% ${direction === 'rise' ? 'increase' : 'drop'}, ${absLabel} pg/mL swing). In a ${age}-year-old with active perimenopausal symptoms, erratic estradiol is a hallmark of the perimenopause hormone rollercoaster. Erratic endogenous production causes symptom waves even when individual levels appear within range. Low-dose transdermal estradiol (patch or gel) can dampen volatility, stabilize trough levels, and reduce symptom burden without suppressing the axis.`,
          patientInsight: `Your estrogen level shifted significantly from ${e2.previousValue} to ${e2.currentValue} pg/mL — a ${pctLabel}% swing. Erratic estrogen is one of the hallmarks of perimenopause: levels that spike and crash can cause hot flashes, poor sleep, mood swings, and brain fog even when a single reading looks "normal." Stabilizing these swings is one of the main goals of hormone therapy.`,
          recommendation: `Erratic perimenopausal estradiol: consider low-dose transdermal estradiol (patch 0.025–0.05 mg/day or equivalent gel) to buffer endogenous fluctuations and stabilize trough levels. Add or continue micronized progesterone (100–200 mg nightly) if uterus intact. Reassess estradiol in 6–8 weeks. Target steady-state 55–150 pg/mL. Avoid oral estrogen (peak-trough variability, first-pass SHBG elevation).`,
        };
      }
    }
  }

  return insights;
}

export function generateClinicalSnapshot(labs: LabResult[], patientName: string): string {
  const insights = generateTrendInsights(labs);
  if (insights.length === 0) return '';

  const improvements = insights.filter(i => i.direction === 'improved');
  const concerns = insights.filter(i => i.direction === 'worsened');
  const urgents = insights.filter(i => i.severity === 'urgent');
  const stables = insights.filter(i => i.direction === 'stable');

  const parts: string[] = [];

  if (urgents.length > 0) {
    parts.push(`ATTENTION: ${urgents.map(u => u.clinicianInsight).join(' ')}`);
  }

  if (improvements.length > 0) {
    parts.push(`Improvements: ${improvements.map(i => `${i.markerName} (${i.previousValue} -> ${i.currentValue} ${i.unit})`).join(', ')}.`);
  }

  if (concerns.length > 0) {
    parts.push(`Areas of concern: ${concerns.map(c => `${c.markerName} (${c.previousValue} -> ${c.currentValue} ${c.unit})`).join(', ')}.`);
  }

  if (stables.length > 0) {
    parts.push(`Stable markers: ${stables.map(s => s.markerName).join(', ')}.`);
  }

  const recInsights = insights.filter(i => i.recommendation);
  if (recInsights.length > 0) {
    parts.push(`Recommendations: ${recInsights.map(r => `${r.markerName}: ${r.recommendation}`).join(' | ')}`);
  }

  return parts.join('\n\n');
}
