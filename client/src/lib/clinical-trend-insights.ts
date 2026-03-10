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
        if (c >= 400 && c <= 700) return `Testosterone in optimal clinical range (400-700 ng/dL). Protocol effective.`;
        if (c > 700) return `Testosterone elevated at ${c} ng/dL. Consider dose reduction per protocol.`;
        return `Testosterone improving (${p} -> ${c}). Continue current protocol.`;
      }
      if (d === 'worsened') {
        if (c < 300) return `Testosterone subtherapeutic at ${c}. Evaluate protocol adherence and consider dose adjustment.`;
        return `Testosterone declining (${p} -> ${c}). Assess adherence and absorption.`;
      }
      return `Testosterone stable at ${c} ng/dL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your testosterone level has improved from ${p} to ${c} - your treatment is working well.`;
      if (d === 'worsened') return `Your testosterone has changed from ${p} to ${c}. We may need to adjust your treatment plan.`;
      return `Your testosterone is stable at ${c}.`;
    }
  },
  {
    name: 'Free Testosterone', key: 'freeTestosterone', unit: 'pg/mL',
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') return `Free testosterone improving (${p} -> ${c} pg/mL). Better bioavailable hormone activity.`;
      if (d === 'worsened') return `Free testosterone declining (${p} -> ${c} pg/mL). Evaluate SHBG levels and consider protocol adjustment.`;
      return `Free testosterone stable at ${c} pg/mL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your free testosterone (the active form) has improved from ${p} to ${c}.`;
      if (d === 'worsened') return `Your free testosterone has decreased from ${p} to ${c}. We'll look into what might be affecting this.`;
      return `Your free testosterone is steady at ${c}.`;
    }
  },
  {
    name: 'Estradiol', key: 'estradiol', unit: 'pg/mL',
    getClinicianInsight: (c, p, d) => {
      if (d === 'improved') return `Estradiol trending in favorable direction (${p} -> ${c} pg/mL).`;
      if (d === 'worsened') {
        if (c > 50) return `Estradiol elevated at ${c} pg/mL. Consider aromatase inhibitor if on TRT. Assess symptoms.`;
        return `Estradiol shifting (${p} -> ${c} pg/mL). Monitor for symptoms.`;
      }
      return `Estradiol stable at ${c} pg/mL.`;
    },
    getPatientInsight: (c, p, d) => {
      if (d === 'improved') return `Your estradiol level has moved in a positive direction, from ${p} to ${c}.`;
      if (d === 'worsened') return `Your estradiol has changed from ${p} to ${c}. We'll evaluate whether any adjustment is needed.`;
      return `Your estradiol is stable at ${c}.`;
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
      if (c < 30) return `Ferritin depleted (${c} ng/mL). Iron deficiency likely. Evaluate for blood loss and initiate iron supplementation.`;
      if (c > 300) return `Ferritin elevated (${c} ng/mL). Rule out hemochromatosis, inflammation, or liver disease.`;
      return `Ferritin ${d === 'stable' ? 'stable' : 'changed'} at ${c} ng/mL. Within acceptable range.`;
    },
    getPatientInsight: (c, p, d) => {
      if (c < 30) return `Your ferritin (iron stores) is low at ${c}. This can contribute to fatigue and we'll address it.`;
      if (c > 300) return `Your ferritin is elevated at ${c}. We'll investigate the cause.`;
      return `Your iron stores (ferritin) are at ${c} - looking good.`;
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
    const cInRange = c >= 400 && c <= 700;
    const pInRange = p >= 400 && p <= 700;
    if (cInRange && !pInRange) return 'improved';
    if (!cInRange && pInRange) return 'worsened';
    const cDist = Math.min(Math.abs(c - 400), Math.abs(c - 700));
    const pDist = Math.min(Math.abs(p - 400), Math.abs(p - 700));
    if (cInRange) return 'stable';
    return cDist < pDist ? 'improved' : cDist > pDist ? 'worsened' : 'stable';
  },
  freeTestosterone: (c, p) => c > p ? 'improved' : c < p ? 'worsened' : 'stable',
  estradiol: (c, p) => {
    const optMin = 20, optMax = 50;
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
    const optMin = 30, optMax = 300;
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
