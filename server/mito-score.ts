/**
 * Cellular Energy / Mito Score
 *
 * Identifies patterns associated with impaired cellular energy production using
 * conventional lab markers. This does NOT diagnose primary mitochondrial disease.
 * It identifies modifiable contributors to impaired cellular energy production.
 *
 * 11 domains scored. Only available markers are scored.
 * Score = patient points ÷ max available points × 100
 */
import type { LabValues, FemaleLabValues, MitoScoreResult, MitoScoreDomain, InsulinResistanceScreening } from "@shared/schema";

type AnyLabs = LabValues | FemaleLabValues;

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(score: number, max: number): number {
  if (max === 0) return 0;
  return Math.round((score / max) * 100);
}

function interpretPct(p: number): string {
  if (p <= 20) return 'Low evidence of cellular energy dysfunction';
  if (p <= 40) return 'Mild cellular energy support need';
  if (p <= 60) return 'Moderate cellular energy dysfunction pattern';
  return 'High cellular energy dysfunction pattern';
}

function domain(name: string, points: number, maxPoints: number, detail: string, available: boolean): MitoScoreDomain {
  return { name, points, maxPoints, detail, available };
}

// ── Domain scoring functions ───────────────────────────────────────────────

function scoreInflammation(labs: AnyLabs): MitoScoreDomain {
  const v = labs.hsCRP;
  if (v === undefined || v === null) return domain('Inflammation (hs-CRP)', 0, 2, 'Not available', false);
  if (v < 1.0) return domain('Inflammation (hs-CRP)', 0, 2, `hs-CRP ${v} mg/L — optimal, low inflammatory burden`, true);
  if (v < 3.0) return domain('Inflammation (hs-CRP)', 1, 2, `hs-CRP ${v} mg/L — mildly elevated, modest inflammatory signal`, true);
  return domain('Inflammation (hs-CRP)', 2, 2, `hs-CRP ${v} mg/L — significantly elevated, active inflammatory burden`, true);
}

function scoreIronAvailability(labs: AnyLabs): MitoScoreDomain {
  const ferritin = labs.ferritin;
  const hsCRP = labs.hsCRP;
  if (ferritin === undefined || ferritin === null) return domain('Iron Availability (Ferritin)', 0, 2, 'Not available', false);
  // Special rule: ferritin >150 + elevated hs-CRP → assign 1 pt (may reflect inflammation not iron)
  if (ferritin > 150) {
    const crpElevated = hsCRP !== undefined && hsCRP !== null && hsCRP >= 1.0;
    if (crpElevated) {
      return domain('Iron Availability (Ferritin)', 1, 2, `Ferritin ${ferritin} ng/mL — elevated, but hs-CRP is raised; may reflect acute phase response rather than true iron surplus`, true);
    }
    return domain('Iron Availability (Ferritin)', 0, 2, `Ferritin ${ferritin} ng/mL — adequate iron stores`, true);
  }
  if (ferritin >= 75) return domain('Iron Availability (Ferritin)', 0, 2, `Ferritin ${ferritin} ng/mL — optimal for mitochondrial function`, true);
  if (ferritin >= 50) return domain('Iron Availability (Ferritin)', 1, 2, `Ferritin ${ferritin} ng/mL — low-normal; suboptimal for energy production`, true);
  return domain('Iron Availability (Ferritin)', 2, 2, `Ferritin ${ferritin} ng/mL — low; insufficient iron availability for cellular energy`, true);
}

function scoreB12(labs: AnyLabs): MitoScoreDomain {
  const v = labs.vitaminB12;
  if (v === undefined || v === null) return domain('B12 (Vitamin B12)', 0, 2, 'Not available', false);
  if (v > 600) return domain('B12 (Vitamin B12)', 0, 2, `B12 ${v} pg/mL — optimal methylation support`, true);
  if (v >= 450) return domain('B12 (Vitamin B12)', 1, 2, `B12 ${v} pg/mL — low-normal; suboptimal for mitochondrial cofactor support`, true);
  return domain('B12 (Vitamin B12)', 2, 2, `B12 ${v} pg/mL — low; impaired methylation and energy metabolism`, true);
}

function scoreFolate(labs: AnyLabs): MitoScoreDomain {
  const v = labs.folate;
  if (v === undefined || v === null) return domain('Folate', 0, 2, 'Not available', false);
  if (v > 10) return domain('Folate', 0, 2, `Folate ${v} ng/mL — optimal`, true);
  if (v >= 6) return domain('Folate', 1, 2, `Folate ${v} ng/mL — borderline; suboptimal for one-carbon metabolism`, true);
  return domain('Folate', 2, 2, `Folate ${v} ng/mL — low; impaired methylation support`, true);
}

function scoreVitaminD(labs: AnyLabs): MitoScoreDomain {
  const v = labs.vitaminD;
  if (v === undefined || v === null) return domain('Vitamin D', 0, 2, 'Not available', false);
  if (v > 50) return domain('Vitamin D', 0, 2, `Vitamin D ${v} ng/mL — optimal`, true);
  if (v >= 30) return domain('Vitamin D', 1, 2, `Vitamin D ${v} ng/mL — insufficient; impairs mitochondrial biogenesis`, true);
  return domain('Vitamin D', 2, 2, `Vitamin D ${v} ng/mL — deficient; significantly impairs cellular energy and immune function`, true);
}

function scoreMagnesium(): MitoScoreDomain {
  // Magnesium (serum or RBC) is not captured in current lab panels
  return domain('Magnesium (Serum/RBC)', 0, 2, 'Not available — add serum or RBC magnesium to evaluate this domain', false);
}

function scoreThyroid(labs: AnyLabs): MitoScoreDomain {
  const tsh = labs.tsh;
  const ft4 = labs.freeT4;
  const ft3 = labs.freeT3;
  if (tsh === undefined && ft4 === undefined && ft3 === undefined) {
    return domain('Thyroid Support (TSH/FT4/FT3)', 0, 2, 'Not available', false);
  }
  // Determine abnormalities
  const tshHigh = tsh !== undefined && tsh > 4.0;
  const tshBorderline = tsh !== undefined && tsh >= 2.6 && tsh <= 4.0;
  const tshOptimal = tsh !== undefined && tsh >= 0.5 && tsh <= 2.5;
  // FT3: low = <2.3 pg/mL; low-normal = 2.3–2.8
  const ft3Low = ft3 !== undefined && ft3 < 2.3;
  const ft3LowNormal = ft3 !== undefined && ft3 >= 2.3 && ft3 <= 2.8;
  // FT4: low = <0.9 ng/dL
  const ft4Low = ft4 !== undefined && ft4 < 0.9;

  if (tshHigh || ft4Low || ft3Low) {
    const parts: string[] = [];
    if (tsh !== undefined) parts.push(`TSH ${tsh} mIU/L`);
    if (ft4 !== undefined) parts.push(`FT4 ${ft4} ng/dL`);
    if (ft3 !== undefined) parts.push(`FT3 ${ft3} pg/mL`);
    return domain('Thyroid Support (TSH/FT4/FT3)', 2, 2, `${parts.join(', ')} — significantly impaired thyroid support for cellular energy`, true);
  }
  if (tshBorderline || ft3LowNormal) {
    const parts: string[] = [];
    if (tsh !== undefined) parts.push(`TSH ${tsh} mIU/L`);
    if (ft4 !== undefined) parts.push(`FT4 ${ft4} ng/dL`);
    if (ft3 !== undefined) parts.push(`FT3 ${ft3} pg/mL`);
    return domain('Thyroid Support (TSH/FT4/FT3)', 1, 2, `${parts.join(', ')} — borderline thyroid support; may limit metabolic rate and energy production`, true);
  }
  const parts: string[] = [];
  if (tsh !== undefined) parts.push(`TSH ${tsh}`);
  if (ft4 !== undefined) parts.push(`FT4 ${ft4}`);
  if (ft3 !== undefined) parts.push(`FT3 ${ft3}`);
  return domain('Thyroid Support (TSH/FT4/FT3)', 0, 2, `${parts.join(', ')} — thyroid markers within optimal range`, true);
}

function scoreIRBurden(ir: InsulinResistanceScreening | undefined): MitoScoreDomain {
  if (!ir || ir.likelihood === 'none') {
    return domain('Insulin Resistance Burden', 0, 2, 'Insulin resistance screening: none detected or not calculated', ir !== undefined);
  }
  if (ir.likelihood === 'early') {
    return domain('Insulin Resistance Burden', 1, 2, `IR screening: ${ir.likelihoodLabel} — early metabolic dysfunction, moderate mitochondrial impact`, true);
  }
  // moderate or high
  return domain('Insulin Resistance Burden', 2, 2, `IR screening: ${ir.likelihoodLabel} — significant insulin resistance, major driver of impaired mitochondrial function`, true);
}

function scoreLipidApoB(labs: AnyLabs): MitoScoreDomain {
  const apoB = labs.apoB;
  const tg = labs.triglycerides;
  if (apoB === undefined && tg === undefined) {
    return domain('Lipid / ApoB Burden', 0, 2, 'Not available', false);
  }
  // Scoring: ApoB ≥90 OR TG ≥3 = 2pts; ApoB 80–89 OR TG 2–2.9 = 1pt; else 0pts
  const apoBHighRisk = apoB !== undefined && apoB >= 90;
  const apoBBorderline = apoB !== undefined && apoB >= 80 && apoB < 90;
  const tgHighRisk = tg !== undefined && tg >= 3.0;
  const tgBorderline = tg !== undefined && tg >= 2.0 && tg < 3.0;
  const parts: string[] = [];
  if (apoB !== undefined) parts.push(`ApoB ${apoB} mg/dL`);
  if (tg !== undefined) parts.push(`TG ${tg} mg/dL`);
  const label = parts.join(', ');
  if (apoBHighRisk || tgHighRisk) {
    return domain('Lipid / ApoB Burden', 2, 2, `${label} — elevated atherogenic burden, metabolic stress on mitochondrial function`, true);
  }
  if (apoBBorderline || tgBorderline) {
    return domain('Lipid / ApoB Burden', 1, 2, `${label} — borderline; early metabolic lipid stress`, true);
  }
  return domain('Lipid / ApoB Burden', 0, 2, `${label} — optimal lipid profile`, true);
}

function scoreCBCOxygenDelivery(labs: AnyLabs, sex: 'male' | 'female'): MitoScoreDomain {
  const hgb = labs.hemoglobin;
  const hct = labs.hematocrit;
  const mcv = labs.mcv;
  if (hgb === undefined && hct === undefined && mcv === undefined) {
    return domain('CBC / Oxygen Delivery', 0, 2, 'Not available', false);
  }
  // Sex-specific hemoglobin thresholds
  const hgbNormal = sex === 'male' ? 13.5 : 12.0;
  const hgbMildAnemia = sex === 'male' ? 12.0 : 11.0;
  const hgbAnemia = hgbMildAnemia;

  const parts: string[] = [];
  if (hgb !== undefined) parts.push(`Hgb ${hgb} g/dL`);
  if (hct !== undefined) parts.push(`Hct ${hct}%`);
  if (mcv !== undefined) parts.push(`MCV ${mcv} fL`);
  const label = parts.join(', ');

  // Determine severity
  const hasAnemia = hgb !== undefined && hgb < hgbAnemia;
  const hasMildAnemia = hgb !== undefined && hgb >= hgbAnemia && hgb < hgbNormal;
  const hasMacrocytosis = mcv !== undefined && mcv > 100;
  const hasMarkedMacrocytosis = mcv !== undefined && mcv > 110;
  const hasMicrocytosis = mcv !== undefined && mcv < 80;
  const hasMarkedMicrocytosis = mcv !== undefined && mcv < 75;

  if (hasAnemia || hasMarkedMacrocytosis || hasMarkedMicrocytosis) {
    return domain('CBC / Oxygen Delivery', 2, 2, `${label} — significant abnormality impairs oxygen delivery and cellular energy production`, true);
  }
  if (hasMildAnemia || hasMacrocytosis || hasMicrocytosis) {
    return domain('CBC / Oxygen Delivery', 1, 2, `${label} — mild abnormality; mildly reduced oxygen delivery`, true);
  }
  return domain('CBC / Oxygen Delivery', 0, 2, `${label} — normal oxygen delivery`, true);
}

function scoreHormonalFemale(labs: AnyLabs): MitoScoreDomain {
  const femLabs = labs as FemaleLabValues;
  const estradiol = femLabs.estradiol ?? labs.estradiol;
  const freeTesto = femLabs.freeTestosterone ?? (labs as any).freeTestosterone;
  const menstrualPhase = (femLabs as any).menstrualPhase as string | undefined;
  const isPostmenopausal = menstrualPhase === 'postmenopausal';

  if (estradiol === undefined && freeTesto === undefined) {
    return domain('Hormonal Support (Female)', 0, 2, 'Estradiol and free testosterone not available', false);
  }

  // For postmenopausal: score based on estradiol level
  if (isPostmenopausal && estradiol !== undefined) {
    if (estradiol > 50) return domain('Hormonal Support (Female)', 0, 2, `Estradiol ${estradiol} pg/mL — adequate hormonal support for cellular energy`, true);
    if (estradiol >= 20) return domain('Hormonal Support (Female)', 1, 2, `Estradiol ${estradiol} pg/mL — low-normal for postmenopausal; consider hormonal optimization`, true);
    return domain('Hormonal Support (Female)', 2, 2, `Estradiol ${estradiol} pg/mL — very low; significantly impairs mitochondrial biogenesis and metabolic flexibility`, true);
  }

  // For perimenopausal or unknown: single estradiol level is not reliable for scoring
  // Use free testosterone as a proxy if available (score only if clearly low)
  if (freeTesto !== undefined) {
    if (freeTesto < 0.8) return domain('Hormonal Support (Female)', 2, 2, `Free testosterone ${freeTesto} pg/mL — clearly low; impairs muscle maintenance and cellular energy`, true);
    if (freeTesto < 1.5) return domain('Hormonal Support (Female)', 1, 2, `Free testosterone ${freeTesto} pg/mL — borderline low; may limit recovery and metabolic flexibility`, true);
    return domain('Hormonal Support (Female)', 0, 2, `Free testosterone ${freeTesto} pg/mL — within functional range`, true);
  }

  // Estradiol available but not postmenopausal — note symptom context required
  if (estradiol !== undefined) {
    return domain('Hormonal Support (Female)', 0, 2, `Estradiol ${estradiol} pg/mL — perimenopausal scoring requires symptom assessment (vasomotor, sleep, fatigue). Assess clinically.`, true);
  }

  return domain('Hormonal Support (Female)', 0, 2, 'Insufficient hormonal data for scoring', false);
}

// ── Pattern confidence scoring ─────────────────────────────────────────────

type PatternName = 'Nutrient Depletion Pattern' | 'Inflammatory Pattern' | 'Metabolic Pattern' | 'Thyroid/Hormonal Pattern' | 'Oxygen Delivery Pattern';

interface PatternConfidence {
  name: PatternName;
  confidence: number;
}

function scorePatternConfidences(
  labs: AnyLabs,
  domains: MitoScoreDomain[],
  ir: InsulinResistanceScreening | undefined,
  sex: 'male' | 'female',
): PatternConfidence[] {
  const get = (name: string) => domains.find(d => d.name.startsWith(name));

  const conf: Record<PatternName, number> = {
    'Nutrient Depletion Pattern': 0,
    'Inflammatory Pattern': 0,
    'Metabolic Pattern': 0,
    'Thyroid/Hormonal Pattern': 0,
    'Oxygen Delivery Pattern': 0,
  };

  // Nutrient Depletion
  const iron = get('Iron Availability');
  const b12 = get('B12');
  const folate = get('Folate');
  const vitD = get('Vitamin D');
  const mag = get('Magnesium');
  if (iron?.available && iron.points > 0) conf['Nutrient Depletion Pattern'] += iron.points;
  if (b12?.available && b12.points > 0) conf['Nutrient Depletion Pattern'] += b12.points;
  if (folate?.available && folate.points > 0) conf['Nutrient Depletion Pattern'] += folate.points;
  if (vitD?.available && vitD.points > 0) conf['Nutrient Depletion Pattern'] += vitD.points;
  if (mag?.available && mag.points > 0) conf['Nutrient Depletion Pattern'] += mag.points;

  // Inflammatory
  const infl = get('Inflammation');
  const inflFerritin = iron;
  if (infl?.available && infl.points > 0) conf['Inflammatory Pattern'] += infl.points * 2;
  // Elevated ferritin + elevated hsCRP
  if (labs.ferritin !== undefined && labs.ferritin > 150 && labs.hsCRP !== undefined && labs.hsCRP >= 1.0) {
    conf['Inflammatory Pattern'] += 2;
  }

  // Metabolic
  const irDomain = get('Insulin Resistance');
  const lipid = get('Lipid');
  if (irDomain?.available && irDomain.points >= 2) conf['Metabolic Pattern'] += 3;
  else if (irDomain?.available && irDomain.points === 1) conf['Metabolic Pattern'] += 1;
  if (lipid?.available && lipid.points >= 2) conf['Metabolic Pattern'] += 2;
  else if (lipid?.available && lipid.points === 1) conf['Metabolic Pattern'] += 1;
  // Low SHBG (<40) is a metabolic confidence signal
  const shbg = (labs as any).shbg;
  if (shbg !== undefined && shbg < 40) conf['Metabolic Pattern'] += 1;

  // Thyroid/Hormonal
  const thyroid = get('Thyroid');
  if (thyroid?.available && thyroid.points >= 2) conf['Thyroid/Hormonal Pattern'] += 3;
  else if (thyroid?.available && thyroid.points === 1) conf['Thyroid/Hormonal Pattern'] += 1;
  if (sex === 'female') {
    const hormonal = get('Hormonal Support');
    if (hormonal?.available && hormonal.points >= 2) conf['Thyroid/Hormonal Pattern'] += 3;
    else if (hormonal?.available && hormonal.points === 1) conf['Thyroid/Hormonal Pattern'] += 1;
    // SHBG modifier: free testosterone low + SHBG >100 → increase hormonal confidence
    const freeTesto = (labs as FemaleLabValues).freeTestosterone ?? (labs as any).freeTestosterone;
    if (freeTesto !== undefined && freeTesto < 1.5 && shbg !== undefined && shbg > 100) {
      conf['Thyroid/Hormonal Pattern'] += 2;
    }
  }

  // Oxygen Delivery
  const cbc = get('CBC');
  if (cbc?.available && cbc.points >= 2) conf['Oxygen Delivery Pattern'] += 4;
  else if (cbc?.available && cbc.points === 1) conf['Oxygen Delivery Pattern'] += 2;
  // Low ferritin with CBC changes
  if (iron?.available && iron.points >= 2 && cbc?.available && cbc.points >= 1) {
    conf['Oxygen Delivery Pattern'] += 2;
  }

  return (Object.entries(conf) as [PatternName, number][])
    .map(([name, confidence]) => ({ name, confidence }))
    .sort((a, b) => b.confidence - a.confidence);
}

function selectPrimaryPattern(
  patternConfs: PatternConfidence[],
  labs: AnyLabs,
  ir: InsulinResistanceScreening | undefined,
): PatternName {
  // Sort descending by confidence
  const sorted = [...patternConfs].sort((a, b) => b.confidence - a.confidence);
  if (sorted.length === 0) return 'Nutrient Depletion Pattern';

  const top = sorted[0];
  const second = sorted[1];
  const isTie = second && top.confidence === second.confidence;

  if (!isTie) return top.name;

  // Tie-breaker hierarchy (per spec):
  // 1. Oxygen Delivery wins if anemia present
  const hgb = labs.hemoglobin;
  const sex = (labs as FemaleLabValues).menstrualPhase !== undefined ? 'female' : 'male';
  const anemiaThreshold = sex === 'female' ? 12.0 : 13.5;
  if (hgb !== undefined && hgb < anemiaThreshold) return 'Oxygen Delivery Pattern';
  // 2. Metabolic wins if moderate/high IR
  if (ir && (ir.likelihood === 'moderate' || ir.likelihood === 'high')) return 'Metabolic Pattern';
  // 3. Inflammatory wins if hs-CRP ≥3
  if (labs.hsCRP !== undefined && labs.hsCRP >= 3.0) return 'Inflammatory Pattern';
  // 4. Nutrient Depletion wins if 3+ nutrient abnormalities
  const ironD = labs.ferritin !== undefined && labs.ferritin < 75 ? 1 : 0;
  const b12D = labs.vitaminB12 !== undefined && labs.vitaminB12 < 600 ? 1 : 0;
  const folD = labs.folate !== undefined && labs.folate < 10 ? 1 : 0;
  const vitDD = labs.vitaminD !== undefined && labs.vitaminD < 50 ? 1 : 0;
  if (ironD + b12D + folD + vitDD >= 3) return 'Nutrient Depletion Pattern';
  // 5. Thyroid/Hormonal
  if (labs.tsh !== undefined && labs.tsh > 2.5) return 'Thyroid/Hormonal Pattern';

  return sorted[0].name;
}

// ── Recommendations engine ─────────────────────────────────────────────────

const GLOBAL_RECS = [
  'Prioritize protein intake (1.2–1.6 g/kg/day)',
  'Resistance training 2–4x/week',
  'Zone 2 cardiovascular activity as tolerated',
  'Optimize sleep quality (7–9 hours)',
  'Reduce ultra-processed foods and alcohol',
];

const PATTERN_RECS: Record<PatternName, string[]> = {
  'Nutrient Depletion Pattern': [
    'Optimize ferritin to 75–150 ng/mL',
    'Optimize vitamin B12 (target >600 pg/mL)',
    'Optimize folate status',
    'Optimize vitamin D (target >50 ng/mL)',
    'Consider magnesium glycinate supplementation',
    'Evaluate for methylated B-complex support',
    'Consider CoQ10 supplementation',
    'Consider creatine monohydrate 3–5 g/day if appropriate',
  ],
  'Inflammatory Pattern': [
    'Investigate and address underlying inflammation source',
    'Repeat hs-CRP if acute illness may be contributing',
    'Mediterranean-style nutrition pattern',
    'Optimize sleep and stress recovery',
    'Avoid overtraining; prioritize recovery',
    'Consider omega-3 fatty acid support',
  ],
  'Metabolic Pattern': [
    'Improve insulin sensitivity through dietary carbohydrate modification',
    'Reduce visceral adiposity through structured lifestyle intervention',
    'Address elevated lipid burden (ApoB/triglycerides)',
    'Monitor liver enzymes; screen for hepatic steatosis',
    'Consider pharmacotherapy support for metabolic syndrome if appropriate',
  ],
  'Thyroid/Hormonal Pattern': [
    'Optimize thyroid function; consider full thyroid panel if not done',
    'Evaluate free T3 conversion (T4→T3) if on levothyroxine',
    'Optimize hormone status when clinically appropriate',
    'Evaluate for HPA axis dysfunction if fatigue is prominent',
  ],
  'Oxygen Delivery Pattern': [
    'Evaluate and treat underlying anemia',
    'Assess iron stores, B12, and folate as anemia etiology',
    'Consider CBC with differential and reticulocyte count',
    'Optimize ferritin to support red cell production',
    'Evaluate for occult blood loss if iron deficiency is confirmed',
  ],
};

// ── Main export ────────────────────────────────────────────────────────────

export function calculateMitoScore(
  labs: LabValues | FemaleLabValues,
  sex: 'male' | 'female',
  ir?: InsulinResistanceScreening,
): MitoScoreResult {
  // Score each domain
  const domains: MitoScoreDomain[] = [
    scoreInflammation(labs),
    scoreIronAvailability(labs),
    scoreB12(labs),
    scoreFolate(labs),
    scoreVitaminD(labs),
    scoreMagnesium(),
    scoreThyroid(labs),
    scoreIRBurden(ir),
    scoreLipidApoB(labs),
    scoreCBCOxygenDelivery(labs, sex),
  ];

  // Domain 11: Hormonal support — females only
  if (sex === 'female') {
    domains.push(scoreHormonalFemale(labs));
  }

  // Accumulate only available domains
  const availableDomains = domains.filter(d => d.available);
  const score = availableDomains.reduce((sum, d) => sum + d.points, 0);
  const maxScore = availableDomains.reduce((sum, d) => sum + d.maxPoints, 0);
  const percentage = pct(score, maxScore);

  // Collect missing markers
  const missingMarkers = domains
    .filter(d => !d.available)
    .map(d => d.name.replace(/\s*\(.*\)$/, '').trim());

  // Pattern confidence + primary selection
  const patternConfs = scorePatternConfidences(labs, domains, ir, sex);
  const primaryPattern = selectPrimaryPattern(patternConfs, labs, ir);

  // Secondary patterns: top 2 after primary with any confidence
  const secondaryPatterns = patternConfs
    .filter(p => p.name !== primaryPattern && p.confidence > 0)
    .slice(0, 2)
    .map(p => p.name);

  // Recommendations: global + pattern-specific
  const recommendations = [
    ...GLOBAL_RECS,
    ...(PATTERN_RECS[primaryPattern] || []),
  ];

  // Provider summary
  const interpretLabel = interpretPct(percentage);
  const providerSummary = [
    `Cellular Energy / Mito Score: ${score} / ${maxScore} available points (${percentage}%). ${interpretLabel}.`,
    `Primary cellular energy pattern: ${primaryPattern}.`,
    secondaryPatterns.length > 0 ? `Secondary contributors: ${secondaryPatterns.join(', ')}.` : '',
    missingMarkers.length > 0 ? `Missing markers (not scored): ${missingMarkers.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  return {
    score,
    maxScore,
    percentage,
    interpretationLabel: interpretLabel,
    domains,
    missingMarkers,
    primaryPattern,
    secondaryPatterns,
    recommendations,
    providerSummary,
  };
}
