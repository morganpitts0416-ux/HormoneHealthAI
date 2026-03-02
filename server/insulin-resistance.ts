import type { LabValues, FemaleLabValues } from "@shared/schema";

export interface InsulinResistanceMarker {
  name: string;
  value: number | string;
  threshold: string;
  positive: boolean;
  detail: string;
}

export interface InsulinResistancePhenotype {
  name: string;
  key: 'visceral_metabolic' | 'hepatic' | 'hormonal_pcos' | 'early_lean';
  triggerCriteria: string[];
  matchedCriteria: string[];
  pathophysiology: string;
  treatmentRecommendations: string[];
  monitoringPlan: string;
  patientExplanation: string;
}

export interface InsulinResistanceScreening {
  markers: InsulinResistanceMarker[];
  positiveCount: number;
  likelihood: 'none' | 'moderate' | 'high';
  likelihoodLabel: string;
  phenotypes: InsulinResistancePhenotype[];
  confirmationTests: string;
  providerSummary: string;
}

function computeTgHdlRatio(triglycerides?: number, hdl?: number): number | null {
  if (triglycerides === undefined || hdl === undefined || hdl === 0) return null;
  return Math.round((triglycerides / hdl) * 100) / 100;
}

export function screenInsulinResistance(
  labs: LabValues | FemaleLabValues,
  sex: 'male' | 'female'
): InsulinResistanceScreening | null {
  const tgHdlRatio = computeTgHdlRatio(labs.triglycerides, labs.hdl);
  const altOptimalThreshold = sex === 'female' ? 25 : 35;

  const markers: InsulinResistanceMarker[] = [];
  let evaluableCount = 0;

  if (tgHdlRatio !== null) {
    evaluableCount++;
    markers.push({
      name: 'TG:HDL Ratio',
      value: tgHdlRatio,
      threshold: '>= 3.0',
      positive: tgHdlRatio >= 3,
      detail: `Triglycerides ${labs.triglycerides} / HDL ${labs.hdl} = ${tgHdlRatio}`,
    });
  }

  if (labs.a1c !== undefined) {
    evaluableCount++;
    markers.push({
      name: 'A1c',
      value: `${labs.a1c}%`,
      threshold: '>= 5.7%',
      positive: labs.a1c >= 5.7,
      detail: labs.a1c >= 5.7 ? 'Prediabetic range' : 'Normal glycemic control',
    });
  }

  if (labs.shbg !== undefined) {
    evaluableCount++;
    markers.push({
      name: 'SHBG',
      value: labs.shbg,
      threshold: '< 50 nmol/L',
      positive: labs.shbg < 50,
      detail: labs.shbg < 50
        ? (labs.shbg < 30 ? 'Very low - strong IR signal' : 'Low - hyperinsulinemia suppresses SHBG')
        : 'Within normal range',
    });
  }

  if (labs.alt !== undefined) {
    evaluableCount++;
    markers.push({
      name: 'ALT',
      value: labs.alt,
      threshold: `> ${altOptimalThreshold} U/L (optimal)`,
      positive: labs.alt > altOptimalThreshold,
      detail: labs.alt > altOptimalThreshold
        ? 'Above optimal range - may indicate hepatic insulin resistance'
        : 'Within optimal range',
    });
  }

  if (labs.apoB !== undefined) {
    evaluableCount++;
    markers.push({
      name: 'ApoB',
      value: `${labs.apoB} mg/dL`,
      threshold: '>= 90 mg/dL',
      positive: labs.apoB >= 90,
      detail: labs.apoB >= 90
        ? 'Elevated atherogenic particle count'
        : 'Normal atherogenic particle count',
    });
  }

  if (labs.hsCRP !== undefined) {
    evaluableCount++;
    markers.push({
      name: 'hs-CRP',
      value: `${labs.hsCRP} mg/L`,
      threshold: '>= 2.0 mg/L',
      positive: labs.hsCRP >= 2,
      detail: labs.hsCRP >= 2
        ? 'Elevated systemic inflammation'
        : 'Low inflammatory burden',
    });
  }

  if (evaluableCount < 2) return null;

  const positiveCount = markers.filter(m => m.positive).length;

  let likelihood: 'none' | 'moderate' | 'high';
  let likelihoodLabel: string;
  if (positiveCount >= 3) {
    likelihood = 'high';
    likelihoodLabel = 'HIGH LIKELIHOOD';
  } else if (positiveCount >= 2) {
    likelihood = 'moderate';
    likelihoodLabel = 'MODERATE LIKELIHOOD';
  } else {
    likelihood = 'none';
    likelihoodLabel = 'LOW LIKELIHOOD';
  }

  const phenotypes: InsulinResistancePhenotype[] = [];

  if (likelihood !== 'none') {
    const markerMap = {
      tgHdl: markers.find(m => m.name === 'TG:HDL Ratio'),
      a1c: markers.find(m => m.name === 'A1c'),
      shbg: markers.find(m => m.name === 'SHBG'),
      alt: markers.find(m => m.name === 'ALT'),
      apoB: markers.find(m => m.name === 'ApoB'),
      hsCRP: markers.find(m => m.name === 'hs-CRP'),
    };

    const tgHdlPositive = markerMap.tgHdl?.positive ?? false;
    const a1cPositive = markerMap.a1c?.positive ?? false;
    const shbgPositive = markerMap.shbg?.positive ?? false;
    const altPositive = markerMap.alt?.positive ?? false;
    const apoBPositive = markerMap.apoB?.positive ?? false;
    const hsCRPPositive = markerMap.hsCRP?.positive ?? false;

    const visceralMatched: string[] = [];
    if (a1cPositive) visceralMatched.push('A1c >= 5.7%');
    if (tgHdlPositive) visceralMatched.push('TG/HDL >= 3');
    if (apoBPositive) visceralMatched.push('ApoB >= 90 mg/dL');
    if (hsCRPPositive) visceralMatched.push('hs-CRP >= 2.0');
    if (altPositive) visceralMatched.push('ALT above optimal range');

    if (visceralMatched.length >= 2) {
      phenotypes.push({
        name: 'Visceral / Metabolic Insulin Resistance',
        key: 'visceral_metabolic',
        triggerCriteria: [
          'A1c >= 5.7%',
          'TG/HDL >= 3',
          'ApoB >= 90 mg/dL',
          'hs-CRP >= 2.0',
          'Central adiposity phenotype',
          'ALT above optimal range',
        ],
        matchedCriteria: visceralMatched,
        pathophysiology: 'Early peripheral + hepatic insulin resistance with compensatory hyperinsulinemia. Glucose may still be "normal." A1c often rises last.',
        treatmentRecommendations: [
          'Protein-forward nutrition (>= 25-35g/meal)',
          'Carbohydrate quality + timing education',
          'Strength training 2-3x weekly',
          '10-15 min post-meal walking',
          'Sleep optimization',
          'Consider: GLP-1 therapy if obesity, appetite dysregulation, A1c >= 5.7, or inflammatory phenotype',
          'Consider: Metformin if prediabetes or strong family history',
          'Recheck metabolic panel in 3-6 months',
        ],
        monitoringPlan: 'Recheck A1c, lipid panel, hs-CRP, ApoB in 3-6 months',
        patientExplanation: `What This Means

Your lab pattern suggests your body may not be responding to insulin as efficiently as it should. Insulin is the hormone that helps move sugar from your bloodstream into your cells for energy.

When cells become less sensitive to insulin:
- Blood sugar slowly rises over time
- Triglycerides increase
- Inflammation increases
- Weight gain around the midsection becomes easier

The good news? This stage is highly reversible with targeted nutrition, strength training, sleep optimization, and - when appropriate - medication support.

We'll focus on improving how your body processes fuel and reducing long-term cardiometabolic risk.`,
      });
    }

    const hepaticMatched: string[] = [];
    if (altPositive) hepaticMatched.push(`ALT above optimal (>${altOptimalThreshold} U/L)`);
    if (tgHdlPositive) hepaticMatched.push('TG elevated / TG:HDL >= 3');
    if (apoBPositive) hepaticMatched.push('ApoB elevated');
    if (a1cPositive) hepaticMatched.push('A1c mildly elevated');

    if (altPositive && (tgHdlPositive || apoBPositive)) {
      phenotypes.push({
        name: 'Hepatic (Liver-Driven) Insulin Resistance',
        key: 'hepatic',
        triggerCriteria: [
          `ALT above optimal (>= ${sex === 'female' ? '25' : '35'} U/L)`,
          'TG elevated or TG/HDL >= 3',
          'ApoB elevated',
          'A1c may be normal or mildly elevated',
        ],
        matchedCriteria: hepaticMatched,
        pathophysiology: 'Hepatic insulin resistance leads to increased hepatic glucose output + VLDL overproduction. Often early MASLD (metabolic-associated steatotic liver disease) physiology.',
        treatmentRecommendations: [
          'Weight reduction goal 5-10% if overweight',
          'Eliminate sugary beverages',
          'Alcohol reduction',
          'Protein-first nutrition',
          'Consider GLP-1 if weight loss appropriate',
          'Omega-3 if TG elevated',
        ],
        monitoringPlan: 'Monitor ALT, TG, ApoB, A1c every 3-6 months',
        patientExplanation: `What This Means

Your labs suggest your liver may be under metabolic strain. The liver plays a major role in managing blood sugar and fat metabolism.

When the liver becomes less responsive to insulin:
- Triglycerides rise
- Liver enzymes increase
- Fat can accumulate in the liver over time

This is common and often related to nutrition, stress, sleep, and weight distribution.

The encouraging part: liver-related metabolic changes are very responsive to targeted lifestyle changes and, if needed, medication support.`,
      });
    }

    if (sex === 'female') {
      const hormonalMatched: string[] = [];
      if (shbgPositive) {
        const shbgVal = labs.shbg!;
        hormonalMatched.push(shbgVal < 30 ? 'SHBG very low (<30)' : 'SHBG low (<50)');
      }
      const femaleLabs = labs as FemaleLabValues;
      if (femaleLabs.testosterone !== undefined && femaleLabs.testosterone > 45) {
        hormonalMatched.push('Elevated total testosterone');
      }
      if (femaleLabs.freeTestosterone !== undefined && femaleLabs.freeTestosterone > 6.4) {
        hormonalMatched.push('Elevated free testosterone');
      }
      if (tgHdlPositive) hormonalMatched.push('TG/HDL borderline-high');
      if (a1cPositive) hormonalMatched.push('A1c elevated');

      if (shbgPositive && hormonalMatched.length >= 2) {
        phenotypes.push({
          name: 'Hormonal / PCOS-Type Insulin Resistance',
          key: 'hormonal_pcos',
          triggerCriteria: [
            'Low SHBG (<50; strong if <30)',
            'Elevated total or free testosterone',
            'Irregular cycles',
            'A1c may still be normal',
            'TG/HDL may be borderline-high',
          ],
          matchedCriteria: hormonalMatched,
          pathophysiology: 'Hyperinsulinemia suppresses SHBG and increases ovarian androgen production.',
          treatmentRecommendations: [
            'Protein-forward, lower refined carb approach',
            'Strength training',
            'Consider metformin if cycles irregular or A1c trending',
            'Consider GLP-1 if obesity phenotype present',
            'Monitor SHBG, androgens, A1c',
          ],
          monitoringPlan: 'Monitor SHBG, androgens, A1c every 3-6 months',
          patientExplanation: `What This Means

Your lab pattern suggests insulin may be influencing your hormone balance.

When insulin levels run high:
- The body makes less SHBG (a protective hormone-binding protein)
- Androgen levels can rise
- Cycles may become irregular

This pattern is common in PCOS and other hormone imbalance states.

Improving insulin sensitivity often helps restore hormonal balance and reduce long-term metabolic risk.`,
        });
      }
    }

    const earlyLeanMatched: string[] = [];
    if (tgHdlRatio !== null && tgHdlRatio >= 2 && tgHdlRatio < 3) {
      earlyLeanMatched.push(`TG/HDL in 2-3 range (${tgHdlRatio})`);
    } else if (tgHdlPositive) {
      earlyLeanMatched.push(`TG/HDL elevated (${tgHdlRatio})`);
    }
    if (hsCRPPositive) earlyLeanMatched.push('hs-CRP >= 2');
    if (apoBPositive) earlyLeanMatched.push('ApoB mildly elevated');
    const a1cNormal = labs.a1c !== undefined && labs.a1c < 5.7;
    if (a1cNormal) earlyLeanMatched.push('A1c < 5.7 (still normal)');

    if (hsCRPPositive && !a1cPositive && earlyLeanMatched.length >= 2 && phenotypes.length === 0) {
      phenotypes.push({
        name: 'Early / Lean Insulin Resistance',
        key: 'early_lean',
        triggerCriteria: [
          'TG/HDL 2-3 range',
          'hs-CRP >= 2',
          'ApoB mildly elevated',
          'A1c < 5.7',
          'Normal BMI possible',
        ],
        matchedCriteria: earlyLeanMatched,
        pathophysiology: 'Early peripheral insulin resistance driven by stress, sleep disruption, genetics, sedentary lifestyle.',
        treatmentRecommendations: [
          'Resistance training emphasis',
          'Post-meal walks',
          'Sleep optimization',
          'Stress regulation',
          'Consider metformin if strong family history or A1c rising',
        ],
        monitoringPlan: 'Recheck metabolic markers in 3-6 months',
        patientExplanation: `What This Means

Even though your weight and blood sugar may look "normal," some of your markers suggest early changes in how your body handles carbohydrates and fats.

This is often influenced by:
- Stress
- Sleep quality
- Genetics
- Muscle mass and activity level

Catching this early allows us to intervene before blood sugar or weight become more difficult to manage.`,
      });
    }
  }

  let confirmationTests = '';
  if (likelihood !== 'none') {
    confirmationTests = 'Optional Confirmation: Fasting insulin + fasting glucose (HOMA-IR), OR fasting C-peptide + glucose.';
  }

  let providerSummary = '';
  if (likelihood === 'moderate') {
    providerSummary = `INSULIN RESISTANCE SCREENING: MODERATE LIKELIHOOD (${positiveCount}/6 markers positive). This combination points toward hyperinsulinemia physiology. Consider confirmation with fasting insulin + fasting glucose (HOMA-IR).`;
  } else if (likelihood === 'high') {
    const phenotypeNames = phenotypes.map(p => p.name).join(', ');
    providerSummary = `INSULIN RESISTANCE SCREENING: HIGH LIKELIHOOD (${positiveCount}/6 markers positive). Identified phenotype(s): ${phenotypeNames || 'Evaluate clinically'}. Treat according to phenotype-specific protocol.`;
  } else {
    providerSummary = `INSULIN RESISTANCE SCREENING: LOW LIKELIHOOD (${positiveCount}/6 markers positive). No significant insulin resistance pattern detected at this time.`;
  }

  return {
    markers,
    positiveCount,
    likelihood,
    likelihoodLabel,
    phenotypes,
    confirmationTests,
    providerSummary,
  };
}
