import type { FemaleLabValues, SupplementRecommendation, ClinicalPhenotype } from "@shared/schema";
import type { InsulinResistanceScreening } from "@shared/schema";
import { detectClinicalPhenotypes } from "./phenotype-detection-female";

interface SupplementCandidate {
  name: string;
  dose: string;
  category: SupplementRecommendation['category'];
  caution?: string;
  score: number;
  priority: 'high' | 'medium' | 'low';
  confidenceLevel: 'high' | 'moderate' | 'supportive';
  supportingFindings: string[];
  phenotypes: string[];
  clinicalRationale: string;
  patientExplanation: string;
}

function evaluateHemagenics(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const lowFerritin = labs.ferritin !== undefined && labs.ferritin <= 50;
  const veryLowFerritin = labs.ferritin !== undefined && labs.ferritin <= 20;
  const moderateLowFerritin = labs.ferritin !== undefined && labs.ferritin > 20 && labs.ferritin <= 30;
  const lowIron = labs.iron !== undefined && labs.iron < 60;
  const elevatedTIBC = labs.tibc !== undefined && labs.tibc > 450;
  const lowHemoglobin = labs.hemoglobin !== undefined && labs.hemoglobin < 12;
  const hasHairLoss = labs.hairLoss === true;
  const hasRestlessLegs = labs.restlessLegs === true;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasHeavyMenses = labs.heavyMenses === true;

  if (veryLowFerritin) { findings.push(`Ferritin ${labs.ferritin} ng/mL (severely depleted ≤20)`); score += 5; }
  else if (moderateLowFerritin) { findings.push(`Ferritin ${labs.ferritin} ng/mL (iron deficiency ≤30)`); score += 4; }
  else if (lowFerritin) { findings.push(`Ferritin ${labs.ferritin} ng/mL (suboptimal ≤50, optimal >50)`); score += 4; }
  if (lowIron) { findings.push(`Serum iron ${labs.iron} µg/dL (low <60)`); score += 2; }
  if (elevatedTIBC) { findings.push(`TIBC ${labs.tibc} µg/dL (elevated >450)`); score += 2; }
  if (lowHemoglobin) { findings.push(`Hemoglobin ${labs.hemoglobin} g/dL (low)`); score += 3; }
  if (hasHairLoss) { findings.push("Hair loss reported (iron-responsive symptom)"); score += 1; }
  if (hasRestlessLegs) { findings.push("Restless legs reported (iron-responsive symptom)"); score += 1; }
  if (hasLowEnergy && lowFerritin) { findings.push("Fatigue with iron depletion"); score += 1; }
  if (hasHeavyMenses) { findings.push("Heavy menses (increased iron loss)"); score += 1; }

  const ironPhenotype = phenotypes.find(p => p.name === "Iron Deficiency");
  if (ironPhenotype) matchedPhenotypes.push(ironPhenotype.name);

  const hasLabEvidence = lowFerritin || veryLowFerritin || lowIron || elevatedTIBC || lowHemoglobin;
  if (!hasLabEvidence) return null;
  if (score < 3) return null;

  const isHighPriority = lowFerritin || veryLowFerritin || moderateLowFerritin || lowHemoglobin || lowIron || elevatedTIBC || score >= 5;

  return {
    name: "Hemagenics\u00AE Red Blood Cell Support",
    dose: "1 tablet twice daily with meals",
    category: 'iron',
    caution: "Contains iron, folate, and B12 for comprehensive RBC support. Avoid taking with calcium-rich foods or dairy. May cause mild GI upset initially.",
    score,
    priority: isHighPriority ? 'high' : 'medium',
    confidenceLevel: score >= 6 ? 'high' : score >= 4 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "Hemagenics provides highly absorbable iron bisglycinate with B12, B6, and folate for comprehensive red blood cell support. Indicated for functional iron deficiency, iron deficiency without anemia, and iron-responsive symptoms.",
    patientExplanation: "Your lab results suggest your iron stores are lower than optimal. This supplement provides a gentle, well-absorbed form of iron along with B12 and folate to support your energy levels, hair health, and overall vitality.",
  };
}

function evaluateVitaminD(labs: FemaleLabValues): SupplementCandidate | null {
  if (labs.vitaminD === undefined) return null;

  if (labs.vitaminD <= 20) {
    return {
      name: "D3 10,000 + K",
      dose: "1 softgel daily with meal",
      category: 'vitamin',
      caution: "High-dose repletion therapy. Recheck vitamin D levels in 8-12 weeks. Contains vitamin K2 for calcium metabolism.",
      score: 8,
      priority: 'high',
      confidenceLevel: 'high',
      supportingFindings: [`Vitamin D ${labs.vitaminD} ng/mL (severe deficiency \u226420)`],
      phenotypes: [],
      clinicalRationale: "D3 10,000 + K provides high-dose vitamin D3 with K2 for efficient repletion of severe deficiency. K2 ensures proper calcium utilization and prevents arterial calcification.",
      patientExplanation: "Your vitamin D level is very low, which can affect your bones, immune system, mood, and energy. This high-dose supplement will help bring your level up to optimal range, and the vitamin K2 helps your body use calcium properly.",
    };
  }
  if (labs.vitaminD <= 40) {
    return {
      name: "D3 5,000 + K",
      dose: "1 softgel daily with meal",
      category: 'vitamin',
      caution: "Repletion dose for deficiency/insufficiency. Contains vitamin K2 for optimal calcium metabolism. Recheck levels in 8-12 weeks.",
      score: 6,
      priority: 'medium',
      confidenceLevel: 'high',
      supportingFindings: [`Vitamin D ${labs.vitaminD} ng/mL (${labs.vitaminD <= 30 ? 'deficient' : 'insufficient'})`],
      phenotypes: [],
      clinicalRationale: "D3 5,000 + K provides vitamin D3 with K2 for repletion of deficiency/insufficiency. Target \u226560 ng/mL for bone, immune, and cardiovascular support.",
      patientExplanation: "Your vitamin D is below optimal range. This supplement will help restore your levels to support bone health, immune function, and overall wellness.",
    };
  }
  if (labs.vitaminD < 60) {
    return {
      name: "D3 2000 Complex",
      dose: "1 tablet daily with meal",
      category: 'vitamin',
      caution: "Maintenance dose for suboptimal levels. Comprehensive vitamin D support with cofactors.",
      score: 3,
      priority: 'low',
      confidenceLevel: 'moderate',
      supportingFindings: [`Vitamin D ${labs.vitaminD} ng/mL (suboptimal, target \u226560)`],
      phenotypes: [],
      clinicalRationale: "D3 2000 Complex provides maintenance vitamin D with cofactors to reach and maintain optimal range \u226560 ng/mL.",
      patientExplanation: "Your vitamin D is close to optimal but could benefit from a maintenance dose to reach the ideal range for bone and immune health.",
    };
  }
  return null;
}

function evaluateIntrinsiB12(labs: FemaleLabValues): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;

  const lowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 400;
  const veryLowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 300;
  const lowFolate = labs.folate !== undefined && labs.folate < 5;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasBrainFog = labs.brainFog === true;
  const hasHairLoss = labs.hairLoss === true;
  const hasMoodChanges = labs.moodChanges === true;

  if (veryLowB12) { findings.push(`B12 ${labs.vitaminB12} pg/mL (deficient <300)`); score += 4; }
  else if (lowB12) { findings.push(`B12 ${labs.vitaminB12} pg/mL (suboptimal <400)`); score += 3; }
  if (lowFolate) { findings.push(`Folate ${labs.folate} ng/mL (low)`); score += 3; }
  if (hasLowEnergy && (lowB12 || lowFolate)) { findings.push("Fatigue with B12/folate deficiency"); score += 1; }
  if (hasBrainFog && lowB12) { findings.push("Brain fog with low B12 (neurologic support needed)"); score += 1; }
  if (hasMoodChanges && lowB12) { findings.push("Mood changes with low B12"); score += 1; }
  if (hasHairLoss && lowB12) { findings.push("Hair loss with low B12"); score += 1; }

  if (score < 2) return null;

  return {
    name: "Intrinsi B12-Folate\u2122",
    dose: "1 tablet daily",
    category: 'vitamin',
    caution: "Contains intrinsic factor for enhanced B12 absorption. Ideal for patients with absorption concerns or vegetarian/vegan diets.",
    score,
    priority: score >= 5 ? 'high' : 'medium',
    confidenceLevel: score >= 5 ? 'high' : 'moderate',
    supportingFindings: findings,
    phenotypes: [],
    clinicalRationale: "Intrinsi B12-Folate provides methylated B12 and folate with intrinsic factor for superior absorption. Supports energy, cognition, methylation, and nerve function.",
    patientExplanation: "Your B12 and/or folate levels need support. This supplement provides highly absorbable forms of these essential vitamins to support your energy, brain function, and nervous system health.",
  };
}

function evaluateMagnesium(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const hasSleepDisruption = labs.sleepDisruption === true;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasAnxiety = labs.anxiety === true;
  const hasBrainFog = labs.brainFog === true;
  const hasHeadaches = labs.headaches === true;
  const hasIrritability = labs.irritability === true;

  if (hasSleepDisruption) { findings.push("Sleep disruption reported"); score += 3; }
  if (hasLowEnergy) { findings.push("Low energy reported"); score += 1; }
  if (hasAnxiety) { findings.push("Anxiety reported (magnesium supports GABA)"); score += 2; }
  if (hasBrainFog) { findings.push("Brain fog reported"); score += 2; }
  if (hasHeadaches) { findings.push("Headaches reported"); score += 1; }
  if (hasIrritability) { findings.push("Irritability reported"); score += 1; }

  const stressPhenotype = phenotypes.find(p => p.name === "Stress / Cortisol Dysregulation");
  if (stressPhenotype) { matchedPhenotypes.push(stressPhenotype.name); score += 1; }

  if (score < 3) return null;

  return {
    name: "Magtein\u00AE Magnesium L-Threonate",
    dose: "3 capsules daily (divided doses)",
    category: 'mineral',
    caution: "L-Threonate form crosses blood-brain barrier for cognitive and sleep support. Well-tolerated; gentle on GI system.",
    score,
    priority: 'medium',
    confidenceLevel: score >= 5 ? 'high' : 'moderate',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "Magtein is the only magnesium form clinically shown to cross the blood-brain barrier. Supports quality sleep, cognitive function, GABA activity, and stress resilience.",
    patientExplanation: "This special form of magnesium is designed to reach the brain, where it supports better sleep quality, mental clarity, and a calmer nervous system.",
  };
}

function evaluateUltraFloraWomens(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 2;
  const matchedPhenotypes: string[] = [];

  const hasBloating = labs.bloating === true;
  const hasFrequentUTIs = labs.frequentUTIs === true;
  const hasVaginalDryness = labs.vaginalDryness === true;

  findings.push("Foundational women's probiotic support");
  if (hasBloating) { findings.push("Bloating / GI symptoms reported"); score += 2; }
  if (hasFrequentUTIs) { findings.push("Frequent UTIs reported (urogenital microbiome)"); score += 3; }
  if (hasVaginalDryness) { findings.push("Vaginal dryness (mucosal barrier support)"); score += 1; }

  const gutPhenotype = phenotypes.find(p => p.name === "Gut-Microbiome Support");
  if (gutPhenotype) { matchedPhenotypes.push(gutPhenotype.name); score += 1; }

  return {
    name: "UltraFlora\u00AE Complete Women's Probiotic",
    dose: "1 capsule daily",
    category: 'probiotic',
    caution: "5-in-1 multi-benefit probiotic with Lactobacillus GR-1 and RC-14 for vaginal and urinary health. Increase to 2 daily for urogenital irritation.",
    score,
    priority: score >= 5 ? 'medium' : 'low',
    confidenceLevel: score >= 5 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "UltraFlora Complete Women's provides 5-in-1 support for vaginal, urinary, digestive, and immune health with clinically studied Lactobacillus GR-1 and RC-14 strains.",
    patientExplanation: "This women-specific probiotic supports digestive health, vaginal and urinary tract balance, and immune function with clinically proven strains.",
  };
}

function evaluateRapidStressRelief(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const hasSleepDisruption = labs.sleepDisruption === true;
  const hasAnxiety = labs.anxiety === true;
  const hasIrritability = labs.irritability === true;
  const hasMoodChanges = labs.moodChanges === true;
  const lowDHEAS = labs.dheas !== undefined && labs.dheas < 100;

  if (hasAnxiety) { findings.push("Anxiety reported"); score += 3; }
  if (hasSleepDisruption) { findings.push("Sleep disruption (stress-related)"); score += 2; }
  if (hasIrritability) { findings.push("Irritability reported"); score += 2; }
  if (hasMoodChanges) { findings.push("Mood changes reported"); score += 1; }
  if (lowDHEAS) { findings.push(`DHEA-S ${labs.dheas} \u00B5g/dL (low, adrenal depletion)`) ; score += 2; }

  const stressPhenotype = phenotypes.find(p => p.name === "Stress / Cortisol Dysregulation");
  if (stressPhenotype) { matchedPhenotypes.push(stressPhenotype.name); score += 2; }

  if (score < 3) return null;

  return {
    name: "HerWellness\u2122 Rapid Stress Relief",
    dose: "1 soft chew during times of stress",
    category: 'hormone-support',
    caution: "Fast-acting L-Theanine and Lactium formula. Non-drowsy. Promotes calm within 1 hour. Contains milk.",
    score,
    priority: score >= 6 ? 'medium' : 'low',
    confidenceLevel: score >= 6 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "HerWellness Rapid Stress Relief provides fast-acting stress support with L-Theanine (200mg) and Lactium. Promotes calm within 1 hour without drowsiness.",
    patientExplanation: "This fast-acting supplement helps your body respond to stress more calmly. It promotes relaxation within about an hour and can be taken as needed without causing drowsiness.",
  };
}

function evaluateEstrovera(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const isPostmenopausal = labs.menstrualPhase === 'postmenopausal';
  const age = labs.demographics?.age;
  const isPeriAge = age !== undefined && age >= 40;
  const lowEstradiol = labs.estradiol !== undefined && labs.estradiol < 30;
  const notOnHRT = labs.onHRT !== true;
  const hasHotFlashes = labs.hotFlashes === true;
  const hasNightSweats = labs.nightSweats === true;
  const hasSleepDisruption = labs.sleepDisruption === true;
  const hasMoodChanges = labs.moodChanges === true;
  const hasIrritability = labs.irritability === true;

  if (hasHotFlashes) { findings.push("Hot flashes reported"); score += 4; }
  if (hasNightSweats) { findings.push("Night sweats reported"); score += 3; }
  if (isPostmenopausal) { findings.push("Postmenopausal status"); score += 3; }
  if (lowEstradiol && notOnHRT) { findings.push(`Estradiol ${labs.estradiol} pg/mL (low, not on HRT)`); score += 2; }
  if (isPeriAge && !isPostmenopausal) { findings.push(`Age ${age} (perimenopause window)`); score += 1; }
  if (hasSleepDisruption) { findings.push("Sleep disruption (vasomotor-related)"); score += 1; }
  if (hasMoodChanges) { findings.push("Mood changes reported"); score += 1; }
  if (hasIrritability) { findings.push("Irritability reported"); score += 1; }

  const menoPhenotype = phenotypes.find(p => p.name === "Menopausal Transition");
  if (menoPhenotype) { matchedPhenotypes.push(menoPhenotype.name); score += 2; }

  const vasomotorSymptoms = hasHotFlashes || hasNightSweats;
  const menopausalSymptomCluster = [hasHotFlashes, hasNightSweats, hasSleepDisruption, hasMoodChanges, hasIrritability].filter(Boolean).length >= 2;
  if (!vasomotorSymptoms && !menopausalSymptomCluster) return null;
  if (score < 4) return null;

  return {
    name: "HerWellness\u2122 Estrovera\u00AE",
    dose: "1 tablet daily",
    category: 'hormone-support',
    caution: "Clinically studied ERr 731 rhubarb extract for vasomotor symptom relief. Non-hormonal option. Effects typically noticed within 4 weeks.",
    score,
    priority: vasomotorSymptoms ? 'high' : 'medium',
    confidenceLevel: vasomotorSymptoms ? 'high' : 'moderate',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "Estrovera provides clinically studied ERr 731 Siberian rhubarb extract specifically for vasomotor symptom relief (hot flashes, night sweats). Best suited for women with active vasomotor symptoms who need non-hormonal support.",
    patientExplanation: "This plant-based supplement is clinically proven to help with hot flashes, night sweats, and related sleep and mood changes. It works without hormones and most women notice improvement within 4 weeks.",
  };
}

function evaluateEstroFactors(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const age = labs.demographics?.age;
  const isPeriAge = age !== undefined && age >= 38;
  const isPostmenopausal = labs.menstrualPhase === 'postmenopausal';
  const hasMoodChanges = labs.moodChanges === true;
  const hasIrritability = labs.irritability === true;
  const hasPMS = labs.pmsSymptoms === true;
  const hasHeavyMenses = labs.heavyMenses === true;
  const hasAcne = labs.acne === true;
  const hasBloating = labs.bloating === true;
  const hasHeadaches = labs.headaches === true;
  const hasWeightGain = labs.weightGain === true;

  const estrogenDomPhenotype = phenotypes.find(p => p.name === "Estrogen Dominance / Impaired Clearance");
  const menoPhenotype = phenotypes.find(p => p.name === "Menopausal Transition");

  if (estrogenDomPhenotype) {
    matchedPhenotypes.push(estrogenDomPhenotype.name);
    score += estrogenDomPhenotype.confidence === 'high' ? 4 : 3;
    findings.push("Estrogen dominance / impaired clearance phenotype detected");
  }
  if (menoPhenotype && !estrogenDomPhenotype) {
    const hasEstrogenMetabolismSymptoms = [hasPMS, hasHeavyMenses, hasAcne, hasBloating, hasHeadaches].filter(Boolean).length >= 1;
    if (hasEstrogenMetabolismSymptoms) {
      matchedPhenotypes.push(menoPhenotype.name);
      score += 2;
      findings.push("Menopausal transition with estrogen metabolism symptoms");
    }
  }

  if (hasPMS) { findings.push("PMS symptoms reported"); score += 2; }
  if (hasHeavyMenses) { findings.push("Heavy menses reported"); score += 2; }
  if (hasAcne) { findings.push("Acne reported (hormonal pattern)"); score += 1; }
  if (hasMoodChanges) { findings.push("Mood changes reported"); score += 1; }
  if (hasIrritability) { findings.push("Irritability reported"); score += 1; }
  if (hasBloating) { findings.push("Bloating reported (estrogen-related)"); score += 1; }
  if (hasHeadaches) { findings.push("Headaches reported (hormone-related)"); score += 1; }
  if (hasWeightGain) { findings.push("Weight gain (estrogen metabolism factor)"); score += 1; }
  if (isPeriAge || isPostmenopausal) { findings.push(`Age-appropriate for estrogen metabolism support`); score += 1; }

  if (score < 3) return null;

  return {
    name: "EstroFactors\u2122",
    dose: "2 tablets twice daily",
    category: 'hormone-support',
    caution: "Nutritional support for estrogen balance and metabolism. Contains I3C, DIM, and calcium D-glucarate. Supports healthy estrogen metabolite ratios.",
    score,
    priority: score >= 6 ? 'high' : 'medium',
    confidenceLevel: score >= 6 ? 'high' : score >= 4 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "EstroFactors provides targeted nutritional support for estrogen metabolism and balance with I3C, DIM, and calcium D-glucarate. Best suited for women with estrogen dominance patterns, PMS, perimenopausal hormone imbalance, or those needing broader estrogen metabolism support during hormonal transitions. Differs from Estrovera in that it addresses the underlying estrogen metabolism rather than vasomotor symptom relief.",
    patientExplanation: "This supplement helps your body process and balance estrogen more effectively. It supports healthy hormone metabolism, which can help with PMS symptoms, bloating, mood changes, and hormonal balance during life transitions.",
  };
}

function evaluateAdvaClear(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const estrogenDomPhenotype = phenotypes.find(p => p.name === "Estrogen Dominance / Impaired Clearance");
  const oxidativePhenotype = phenotypes.find(p => p.name === "Oxidative Stress Burden");
  const inflammatoryPhenotype = phenotypes.find(p => p.name === "Inflammatory Burden");
  const irPhenotype = phenotypes.find(p => p.name === "Insulin Resistance / Visceral Adiposity");

  const borderlineALT = labs.alt !== undefined && labs.alt > 20;
  const borderlineAST = labs.ast !== undefined && labs.ast > 20;
  const elevatedALT = labs.alt !== undefined && labs.alt > 32;
  const elevatedCRP = labs.hsCRP !== undefined && labs.hsCRP > 2.0;
  const hasWeightGain = labs.weightGain === true;
  const hasBloating = labs.bloating === true;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasBrainFog = labs.brainFog === true;

  if (estrogenDomPhenotype) {
    matchedPhenotypes.push(estrogenDomPhenotype.name);
    score += estrogenDomPhenotype.confidence === 'high' ? 4 : 3;
    findings.push("Estrogen dominance pattern (hepatic detox pathways needed for clearance)");
  }
  if (oxidativePhenotype) {
    matchedPhenotypes.push(oxidativePhenotype.name);
    score += 2;
    findings.push("Oxidative stress burden (liver biotransformation support)");
  }
  if (inflammatoryPhenotype) {
    matchedPhenotypes.push(inflammatoryPhenotype.name);
    score += 1;
    findings.push("Inflammatory burden (metabolic clearance support)");
  }
  if (irPhenotype) {
    matchedPhenotypes.push(irPhenotype.name);
    score += 2;
    findings.push("Insulin resistance / metabolic dysfunction (hepatic metabolic support)");
  }

  if (borderlineALT || borderlineAST) {
    findings.push(`Borderline liver markers (ALT ${labs.alt ?? 'N/A'}, AST ${labs.ast ?? 'N/A'}) suggesting hepatic biotransformation load`);
    score += 2;
  }
  if (elevatedALT) { findings.push(`ALT ${labs.alt} U/L (elevated, liver detox support indicated)`); score += 1; }
  if (elevatedCRP) { findings.push(`hs-CRP ${labs.hsCRP} mg/L (inflammatory metabolic burden)`); score += 1; }
  if (hasWeightGain) { findings.push("Weight gain (metabolic clearance factor)"); score += 1; }
  if (hasBloating) { findings.push("Bloating (GI-hepatic axis)"); score += 1; }
  if (hasLowEnergy) { findings.push("Low energy (biotransformation burden)"); score += 1; }
  if (hasBrainFog) { findings.push("Brain fog (toxin clearance burden)"); score += 1; }

  if (score < 4) return null;

  return {
    name: "AdvaClear\u00AE",
    dose: "2 capsules twice daily",
    category: 'detox',
    caution: "Broad-spectrum phase I/II liver detoxification support. Contains NAC, green tea extract, milk thistle, and B-vitamins for biotransformation. Best taken with food.",
    score,
    priority: score >= 7 ? 'high' : 'medium',
    confidenceLevel: score >= 7 ? 'high' : score >= 5 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "AdvaClear provides broad-spectrum phase I and phase II liver detoxification support with NAC, green tea extract, watercress, and B-vitamins. Designed for metabolic clearance support, biotransformation of hormones and environmental compounds, and hepatic stress. Appropriate when liver markers are borderline, estrogen clearance is sluggish, or metabolic dysfunction is present.",
    patientExplanation: "This supplement supports your liver's natural detoxification processes. Your results suggest your body could benefit from help processing hormones, metabolic byproducts, and other compounds. It provides nutrients that support both phases of your liver's detox pathways.",
  };
}

function evaluateGlutaClear(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const oxidativePhenotype = phenotypes.find(p => p.name === "Oxidative Stress Burden");
  const inflammatoryPhenotype = phenotypes.find(p => p.name === "Inflammatory Burden");
  const irPhenotype = phenotypes.find(p => p.name === "Insulin Resistance / Visceral Adiposity");

  const elevatedCRP = labs.hsCRP !== undefined && labs.hsCRP > 3.0;
  const moderateCRP = labs.hsCRP !== undefined && labs.hsCRP > 2.0;
  const borderlineALT = labs.alt !== undefined && labs.alt > 20;
  const elevatedA1c = labs.a1c !== undefined && labs.a1c >= 5.7;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasBrainFog = labs.brainFog === true;
  const age = labs.demographics?.age;
  const ageOver45 = age !== undefined && age >= 45;

  if (oxidativePhenotype) {
    matchedPhenotypes.push(oxidativePhenotype.name);
    score += oxidativePhenotype.confidence === 'high' ? 4 : 3;
    findings.push("Oxidative stress phenotype (glutathione/antioxidant support indicated)");
  }
  if (inflammatoryPhenotype) {
    matchedPhenotypes.push(inflammatoryPhenotype.name);
    score += 2;
    findings.push("Inflammatory burden (antioxidant defense support)");
  }
  if (irPhenotype) {
    matchedPhenotypes.push(irPhenotype.name);
    score += 2;
    findings.push("Insulin resistance (oxidative metabolic stress)");
  }

  if (elevatedCRP) { findings.push(`hs-CRP ${labs.hsCRP} mg/L (high inflammatory/oxidative burden)`); score += 2; }
  else if (moderateCRP) { findings.push(`hs-CRP ${labs.hsCRP} mg/L (moderate oxidative stress marker)`); score += 1; }
  if (borderlineALT) { findings.push(`ALT ${labs.alt} U/L (hepatic glutathione demand)`); score += 1; }
  if (elevatedA1c) { findings.push(`A1c ${labs.a1c}% (glycemic oxidative stress)`); score += 1; }
  if (hasLowEnergy) { findings.push("Low energy (mitochondrial antioxidant support)"); score += 1; }
  if (hasBrainFog) { findings.push("Brain fog (CNS oxidative burden)"); score += 1; }
  if (ageOver45) { findings.push(`Age ${age} (declining glutathione production)`); score += 1; }

  if (score < 4) return null;

  return {
    name: "GlutaClear\u00AE",
    dose: "2 capsules daily",
    category: 'detox',
    caution: "Glutathione and antioxidant support formula. Contains NAC, alpha-lipoic acid, and green tea catechins. Supports cellular defense against oxidative damage.",
    score,
    priority: score >= 7 ? 'high' : 'medium',
    confidenceLevel: score >= 7 ? 'high' : score >= 5 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "GlutaClear supports glutathione production and antioxidant defense with NAC, alpha-lipoic acid, and green tea catechins. Indicated when there is evidence of oxidative stress, inflammatory burden, or metabolic dysfunction requiring enhanced cellular defense. While AdvaClear provides broader liver detoxification support, GlutaClear specifically targets glutathione pathways and antioxidant capacity.",
    patientExplanation: "This supplement boosts your body's master antioxidant, glutathione, which protects your cells from damage. Your results suggest increased oxidative stress, and this formula helps your body defend and repair at the cellular level.",
  };
}

function evaluateUltraFloraHealthyWeight(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const irPhenotype = phenotypes.find(p => p.name === "Insulin Resistance / Visceral Adiposity");
  const gutPhenotype = phenotypes.find(p => p.name === "Gut-Microbiome Support");
  const inflammatoryPhenotype = phenotypes.find(p => p.name === "Inflammatory Burden");

  const elevatedTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
  const elevatedApoB = labs.apoB !== undefined && labs.apoB >= 90;
  const elevatedCRP = labs.hsCRP !== undefined && labs.hsCRP >= 2;
  const elevatedA1c = labs.a1c !== undefined && labs.a1c >= 5.7;
  const hasWeightGain = labs.weightGain === true;
  const hasBloating = labs.bloating === true;
  const lowSHBG = labs.shbg !== undefined && labs.shbg < 50;

  if (irPhenotype) {
    matchedPhenotypes.push(irPhenotype.name);
    score += irPhenotype.confidence === 'high' ? 5 : 3;
    findings.push("Insulin resistance / visceral adiposity phenotype (gut-metabolic axis support)");
  }
  if (gutPhenotype) {
    matchedPhenotypes.push(gutPhenotype.name);
    score += 2;
    findings.push("Gut-microbiome support phenotype");
  }
  if (inflammatoryPhenotype) {
    matchedPhenotypes.push(inflammatoryPhenotype.name);
    score += 1;
    findings.push("Inflammatory phenotype (gut-immune axis)");
  }

  if (hasWeightGain) { findings.push("Weight gain / weight loss resistance"); score += 3; }
  if (elevatedTriglycerides) { findings.push(`Triglycerides ${labs.triglycerides} mg/dL (elevated, metabolic)`); score += 1; }
  if (elevatedApoB) { findings.push(`ApoB ${labs.apoB} mg/dL (atherogenic metabolic pattern)`); score += 1; }
  if (elevatedCRP) { findings.push(`hs-CRP ${labs.hsCRP} mg/L (metabolic inflammation)`); score += 1; }
  if (elevatedA1c) { findings.push(`A1c ${labs.a1c}% (glycemic dysregulation)`); score += 1; }
  if (hasBloating) { findings.push("Bloating reported (gut-metabolic dysfunction)"); score += 1; }
  if (lowSHBG) { findings.push(`SHBG ${labs.shbg} nmol/L (low, metabolic marker)`); score += 1; }

  if (score < 4) return null;

  return {
    name: "UltraFlora\u00AE Healthy Weight with Akkermansia",
    dose: "1 capsule daily",
    category: 'metabolic',
    caution: "Contains Akkermansia muciniphila and Bifidobacterium lactis B420 for metabolic and gut barrier support. Refrigerate after opening for maximum potency.",
    score,
    priority: score >= 7 ? 'high' : 'medium',
    confidenceLevel: score >= 7 ? 'high' : score >= 5 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "UltraFlora Healthy Weight with Akkermansia provides targeted probiotic support for the gut-metabolic axis. Akkermansia muciniphila supports gut barrier integrity, metabolic health, and healthy weight management. Indicated for insulin resistance, metabolic syndrome features, visceral adiposity, and weight loss resistance.",
    patientExplanation: "This specialized probiotic contains Akkermansia, a beneficial gut bacteria linked to healthy metabolism and weight management. It supports your gut barrier, helps manage metabolic inflammation, and works with your body's natural weight regulation systems.",
  };
}

function evaluateAdreset(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const lowDHEAS = labs.dheas !== undefined && labs.dheas < 100;
  const lowFerritin = labs.ferritin !== undefined && labs.ferritin < 50;
  const thyroidStress = labs.tsh !== undefined && labs.tsh > 3.5;
  const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasLowMotivation = labs.lowMotivation === true;
  const hasBrainFog = labs.brainFog === true;

  if (lowDHEAS) { findings.push(`DHEA-S ${labs.dheas} \u00B5g/dL (low, adrenal depletion)`); score += 4; }
  if (thyroidStress) { findings.push(`TSH ${labs.tsh} mIU/L (HPA-thyroid axis stress)`); score += 2; }
  if (lowFerritin && lowVitD) { findings.push("Combined ferritin and vitamin D depletion (fatigue pattern)"); score += 2; }
  else if (lowFerritin) { findings.push(`Ferritin ${labs.ferritin} (fatigue contributor)`); score += 1; }
  if (hasLowEnergy) { findings.push("Low energy reported"); score += 1; }
  if (hasLowMotivation) { findings.push("Low motivation reported"); score += 1; }
  if (hasBrainFog) { findings.push("Brain fog reported"); score += 1; }

  const stressPhenotype = phenotypes.find(p => p.name === "Stress / Cortisol Dysregulation");
  if (stressPhenotype) { matchedPhenotypes.push(stressPhenotype.name); score += 2; }

  if (score < 4) return null;

  return {
    name: "Adreset\u00AE",
    dose: "2 capsules twice daily",
    category: 'hormone-support',
    caution: "Adaptogenic formula with ginseng, rhodiola, and cordyceps. Best taken earlier in day. May take 2-4 weeks for full effect.",
    score,
    priority: lowDHEAS ? 'high' : 'medium',
    confidenceLevel: score >= 6 ? 'high' : 'moderate',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "Adreset combines adaptogenic herbs (Cordyceps, Asian Ginseng, Rhodiola) to support healthy adrenal function, stress resilience, and HPA axis balance. Indicated for low DHEA-S, fatigue patterns, and cortisol dysregulation.",
    patientExplanation: "This adaptogen formula helps your body better handle stress and restore energy. It supports your adrenal glands, which produce hormones that help you cope with daily demands and maintain stamina.",
  };
}

function evaluateExhilarin(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const lowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 400;
  const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
  const lowFerritin = labs.ferritin !== undefined && labs.ferritin < 50;
  const suboptimalThyroid = labs.tsh !== undefined && labs.tsh > 3.0 && labs.tsh <= 4.5;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasLowMotivation = labs.lowMotivation === true;
  const hasMoodChanges = labs.moodChanges === true;
  const hasBrainFog = labs.brainFog === true;

  if (lowB12) { findings.push(`B12 ${labs.vitaminB12} pg/mL (suboptimal)`); score += 1; }
  if (lowVitD) { findings.push(`Vit D ${labs.vitaminD} ng/mL (low)`); score += 1; }
  if (lowFerritin) { findings.push(`Ferritin ${labs.ferritin} ng/mL (low)`); score += 1; }
  if (suboptimalThyroid) { findings.push(`TSH ${labs.tsh} mIU/L (suboptimal)`); score += 1; }
  if (hasLowEnergy) { findings.push("Low energy reported"); score += 2; }
  if (hasLowMotivation) { findings.push("Low motivation reported"); score += 2; }
  if (hasMoodChanges) { findings.push("Mood changes reported"); score += 2; }
  if (hasBrainFog) { findings.push("Brain fog reported"); score += 1; }

  const stressPhenotype = phenotypes.find(p => p.name === "Stress / Cortisol Dysregulation");
  if (stressPhenotype) { matchedPhenotypes.push(stressPhenotype.name); score += 1; }

  const fatigueFactorCount = [lowB12, lowVitD, lowFerritin, suboptimalThyroid].filter(Boolean).length;
  const symptomCount = [hasLowEnergy, hasLowMotivation, hasMoodChanges, hasBrainFog].filter(Boolean).length;

  if (fatigueFactorCount < 2 && symptomCount < 2) return null;
  if (score < 4) return null;

  return {
    name: "Exhilarin\u00AE",
    dose: "2 tablets daily",
    category: 'general',
    caution: "Ayurvedic adaptogenic formula. Supports mental clarity and emotional well-being. Takes 2-4 weeks for optimal benefits.",
    score,
    priority: 'medium',
    confidenceLevel: score >= 6 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "Exhilarin provides adaptogenic support with Ashwagandha, Holy Basil, Bacopa, and Amla for mental energy, mood, and stress resilience. Complements nutrient repletion for comprehensive fatigue and mood management.",
    patientExplanation: "This herbal formula supports mental energy, mood balance, and stress resilience. It works alongside your nutrient supplements to help restore your energy and emotional well-being.",
  };
}

function evaluateOmegaGenics(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const highLDL = labs.ldl !== undefined && labs.ldl > 100;
  const lowHDL = labs.hdl !== undefined && labs.hdl < 50;
  const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
  const highTC = labs.totalCholesterol !== undefined && labs.totalCholesterol > 200;
  const elevatedLpa = labs.lpa !== undefined && labs.lpa > 30;
  const elevatedApoB = labs.apoB !== undefined && labs.apoB > 90;
  const elevatedHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 2;
  const hasJointAches = labs.jointAches === true;

  if (highTriglycerides) { findings.push(`Triglycerides ${labs.triglycerides} mg/dL (elevated)`); score += 3; }
  if (elevatedHsCRP) { findings.push(`hs-CRP ${labs.hsCRP} mg/L (inflammatory)`); score += 3; }
  if (elevatedApoB) { findings.push(`ApoB ${labs.apoB} mg/dL (elevated)`); score += 2; }
  if (highLDL) { findings.push(`LDL ${labs.ldl} mg/dL (elevated)`); score += 1; }
  if (lowHDL) { findings.push(`HDL ${labs.hdl} mg/dL (low)`); score += 1; }
  if (highTC) { findings.push(`Total cholesterol ${labs.totalCholesterol} mg/dL (elevated)`); score += 1; }
  if (elevatedLpa) { findings.push(`Lp(a) ${labs.lpa} (elevated genetic risk)`); score += 2; }
  if (hasJointAches) { findings.push("Joint aches reported (anti-inflammatory benefit)"); score += 2; }

  const inflammatoryPhenotype = phenotypes.find(p => p.name === "Inflammatory Burden");
  const irPhenotype = phenotypes.find(p => p.name === "Insulin Resistance / Visceral Adiposity");
  if (inflammatoryPhenotype) { matchedPhenotypes.push(inflammatoryPhenotype.name); score += 2; }
  if (irPhenotype) { matchedPhenotypes.push(irPhenotype.name); score += 1; }

  if (score < 3) return null;

  return {
    name: "OmegaGenics\u00AE Fish Oil Neuro 1000",
    dose: "1 softgel 1-2 times daily",
    category: 'cardiovascular',
    caution: "High-DHA omega-3 (750mg DHA, 250mg EPA) for brain and heart health. Lemon-flavored, no fishy taste. Contains calamari - avoid if shellfish allergy.",
    score,
    priority: score >= 6 ? 'high' : 'medium',
    confidenceLevel: score >= 6 ? 'high' : 'moderate',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "OmegaGenics Fish Oil Neuro 1000 provides concentrated DHA and EPA to reduce triglycerides, support brain function, cardiovascular health, and reduce systemic inflammation.",
    patientExplanation: "This high-quality fish oil provides omega-3 fatty acids that help reduce inflammation, support your heart and brain health, and may help improve your cholesterol profile.",
  };
}

function evaluateCoQ10(labs: FemaleLabValues, phenotypes: ClinicalPhenotype[]): SupplementCandidate | null {
  const findings: string[] = [];
  let score = 0;
  const matchedPhenotypes: string[] = [];

  const highLDL = labs.ldl !== undefined && labs.ldl > 100;
  const lowHDL = labs.hdl !== undefined && labs.hdl < 50;
  const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
  const highTC = labs.totalCholesterol !== undefined && labs.totalCholesterol > 200;
  const elevatedLpa = labs.lpa !== undefined && labs.lpa > 30;
  const elevatedApoB = labs.apoB !== undefined && labs.apoB > 90;
  const elevatedHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 2;
  const hasLowEnergy = labs.lowEnergy === true;
  const onStatins = labs.demographics?.onStatins === true;
  const age = labs.demographics?.age;
  const ageOver40 = age !== undefined && age >= 40;

  if (onStatins) { findings.push("On statin therapy (CoQ10 depletion)"); score += 5; }
  if (elevatedApoB) { findings.push(`ApoB ${labs.apoB} mg/dL (cardiovascular support)`); score += 2; }
  if (highTriglycerides) { findings.push(`Triglycerides ${labs.triglycerides} mg/dL`); score += 1; }
  if (elevatedHsCRP) { findings.push(`hs-CRP ${labs.hsCRP} mg/L`); score += 1; }
  if (highLDL) { findings.push(`LDL ${labs.ldl} mg/dL`); score += 1; }
  if (lowHDL) { findings.push(`HDL ${labs.hdl} mg/dL (low)`); score += 1; }
  if (highTC) { findings.push(`TC ${labs.totalCholesterol} mg/dL`); score += 1; }
  if (elevatedLpa) { findings.push(`Lp(a) ${labs.lpa} (elevated)`); score += 1; }
  if (hasLowEnergy) { findings.push("Low energy (mitochondrial support benefit)"); score += 2; }
  if (ageOver40) { findings.push(`Age ${age} (declining CoQ10 production)`); score += 1; }

  const inflammatoryPhenotype = phenotypes.find(p => p.name === "Inflammatory Burden");
  const oxidativePhenotype = phenotypes.find(p => p.name === "Oxidative Stress Burden");
  if (inflammatoryPhenotype) { matchedPhenotypes.push(inflammatoryPhenotype.name); score += 1; }
  if (oxidativePhenotype) { matchedPhenotypes.push(oxidativePhenotype.name); score += 2; }

  if (score < 3) return null;

  return {
    name: "NutraGems\u00AE CoQ10 300",
    dose: "1 chewable gel daily",
    category: 'cardiovascular',
    caution: "Chewable 300mg CoQ10 in emulsified form for enhanced absorption. Supports heart muscle function, energy production, and antioxidant protection. Essential for patients on statins.",
    score,
    priority: onStatins ? 'high' : score >= 5 ? 'medium' : 'low',
    confidenceLevel: onStatins ? 'high' : score >= 5 ? 'moderate' : 'supportive',
    supportingFindings: findings,
    phenotypes: matchedPhenotypes,
    clinicalRationale: "NutraGems CoQ10 300 provides high-potency ubiquinone for cardiovascular protection, cellular energy production, and antioxidant support. Essential for patients on statin therapy, which depletes CoQ10.",
    patientExplanation: "CoQ10 is a vital nutrient your body uses for energy production and heart health. This chewable supplement supports your cardiovascular system and helps maintain cellular energy, especially important as natural production declines with age.",
  };
}

function prioritizeAndCap(candidates: SupplementCandidate[]): SupplementRecommendation[] {
  candidates.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.score - a.score;
  });

  const highPriority = candidates.filter(c => c.priority === 'high');
  const mediumPriority = candidates.filter(c => c.priority === 'medium');
  const lowPriority = candidates.filter(c => c.priority === 'low');

  const maxHigh = 5;
  const maxMedium = 5;
  const maxLow = 7;

  const selected = [
    ...highPriority.slice(0, maxHigh),
    ...mediumPriority.slice(0, maxMedium),
    ...lowPriority.slice(0, maxLow),
  ];

  return selected.map(c => ({
    name: c.name,
    dose: c.dose,
    indication: c.supportingFindings.slice(0, 4).join('; '),
    rationale: c.clinicalRationale,
    priority: c.priority,
    category: c.category,
    caution: c.caution,
    supportingFindings: c.supportingFindings,
    patientExplanation: c.patientExplanation,
    confidenceLevel: c.confidenceLevel,
    phenotypes: c.phenotypes.length > 0 ? c.phenotypes : undefined,
  }));
}

export interface SupplementEvaluationResult {
  recommendations: SupplementRecommendation[];
  phenotypes: ClinicalPhenotype[];
}

export function evaluateSupplements(labs: FemaleLabValues, irScreening?: InsulinResistanceScreening): SupplementEvaluationResult {
  const phenotypes = detectClinicalPhenotypes(labs, irScreening);

  const evaluators = [
    () => evaluateHemagenics(labs, phenotypes),
    () => evaluateVitaminD(labs),
    () => evaluateIntrinsiB12(labs),
    () => evaluateMagnesium(labs, phenotypes),
    () => evaluateUltraFloraWomens(labs, phenotypes),
    () => evaluateRapidStressRelief(labs, phenotypes),
    () => evaluateEstrovera(labs, phenotypes),
    () => evaluateEstroFactors(labs, phenotypes),
    () => evaluateAdvaClear(labs, phenotypes),
    () => evaluateGlutaClear(labs, phenotypes),
    () => evaluateUltraFloraHealthyWeight(labs, phenotypes),
    () => evaluateAdreset(labs, phenotypes),
    () => evaluateExhilarin(labs, phenotypes),
    () => evaluateOmegaGenics(labs, phenotypes),
    () => evaluateCoQ10(labs, phenotypes),
  ];

  const candidates: SupplementCandidate[] = [];
  for (const evaluate of evaluators) {
    const result = evaluate();
    if (result) candidates.push(result);
  }

  const recommendations = prioritizeAndCap(candidates);
  return { recommendations, phenotypes };
}
