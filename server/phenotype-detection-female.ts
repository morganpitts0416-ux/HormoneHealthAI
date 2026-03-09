import type { FemaleLabValues, ClinicalPhenotype } from "@shared/schema";
import type { InsulinResistanceScreening } from "@shared/schema";

interface PhenotypeDetectionContext {
  labs: FemaleLabValues;
  irScreening?: InsulinResistanceScreening;
}

function detectInflammatoryPhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs } = ctx;
  const findings: string[] = [];

  const elevatedCRP = labs.hsCRP !== undefined && labs.hsCRP > 2.0;
  const highCRP = labs.hsCRP !== undefined && labs.hsCRP > 3.0;
  const elevatedWBC = labs.wbc !== undefined && labs.wbc > 10;
  const elevatedApoB = labs.apoB !== undefined && labs.apoB >= 90;
  const elevatedTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
  const hasJointAches = labs.jointAches === true;
  const hasHeadaches = labs.headaches === true;

  if (highCRP) findings.push(`hs-CRP ${labs.hsCRP} mg/L (elevated >3.0)`);
  else if (elevatedCRP) findings.push(`hs-CRP ${labs.hsCRP} mg/L (moderate 2.0-3.0)`);
  if (elevatedWBC) findings.push(`WBC ${labs.wbc} K/uL (elevated)`);
  if (elevatedApoB) findings.push(`ApoB ${labs.apoB} mg/dL (elevated)`);
  if (elevatedTriglycerides) findings.push(`Triglycerides ${labs.triglycerides} mg/dL (elevated)`);
  if (hasJointAches) findings.push("Joint aches reported");
  if (hasHeadaches) findings.push("Headaches reported");

  const score = [highCRP, elevatedCRP && !highCRP, elevatedWBC, elevatedApoB, elevatedTriglycerides, hasJointAches].filter(Boolean).length;

  if (score >= 2 || highCRP) {
    return {
      name: "Inflammatory Burden",
      confidence: score >= 3 || highCRP ? 'high' : 'moderate',
      supportingFindings: findings,
      description: "Pattern of systemic inflammation indicated by elevated inflammatory markers and/or symptomatic presentation. May benefit from anti-inflammatory nutritional support.",
    };
  }
  return null;
}

function detectIronDeficiencyPhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs } = ctx;
  const findings: string[] = [];

  const lowFerritin = labs.ferritin !== undefined && labs.ferritin <= 50;
  const veryLowFerritin = labs.ferritin !== undefined && labs.ferritin <= 20;
  const lowIron = labs.iron !== undefined && labs.iron < 60;
  const elevatedTIBC = labs.tibc !== undefined && labs.tibc > 450;
  const lowHemoglobin = labs.hemoglobin !== undefined && labs.hemoglobin < 12;
  const hasHairLoss = labs.hairLoss === true;
  const hasRestlessLegs = labs.restlessLegs === true;
  const hasLowEnergy = labs.lowEnergy === true;

  if (veryLowFerritin) findings.push(`Ferritin ${labs.ferritin} ng/mL (severely depleted ≤20)`);
  else if (lowFerritin) findings.push(`Ferritin ${labs.ferritin} ng/mL (suboptimal ≤50)`);
  if (lowIron) findings.push(`Serum iron ${labs.iron} µg/dL (low)`);
  if (elevatedTIBC) findings.push(`TIBC ${labs.tibc} µg/dL (elevated, suggesting iron deficiency)`);
  if (lowHemoglobin) findings.push(`Hemoglobin ${labs.hemoglobin} g/dL (low)`);
  if (hasHairLoss) findings.push("Hair loss reported");
  if (hasRestlessLegs) findings.push("Restless legs reported");
  if (hasLowEnergy) findings.push("Low energy/fatigue reported");

  const score = [veryLowFerritin, lowFerritin && !veryLowFerritin, lowIron, elevatedTIBC, lowHemoglobin, hasHairLoss, hasRestlessLegs].filter(Boolean).length;

  if (score >= 1 && (lowFerritin || lowIron || elevatedTIBC)) {
    return {
      name: "Iron Deficiency",
      confidence: score >= 3 || veryLowFerritin ? 'high' : score >= 2 ? 'moderate' : 'low',
      supportingFindings: findings,
      description: "Iron stores are depleted or suboptimal. Iron is essential for energy, cognitive function, hair health, and oxygen transport.",
    };
  }
  return null;
}

function detectInsulinResistancePhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs, irScreening } = ctx;
  const findings: string[] = [];

  const hasIR = irScreening && irScreening.likelihood !== 'none';
  const elevatedA1c = labs.a1c !== undefined && labs.a1c >= 5.7;
  const elevatedTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
  const lowHDL = labs.hdl !== undefined && labs.hdl < 50;
  const highTGHDLRatio = labs.triglycerides !== undefined && labs.hdl !== undefined && labs.hdl > 0 && (labs.triglycerides / labs.hdl) >= 3;
  const lowSHBG = labs.shbg !== undefined && labs.shbg < 50;
  const elevatedApoB = labs.apoB !== undefined && labs.apoB >= 90;
  const elevatedCRP = labs.hsCRP !== undefined && labs.hsCRP >= 2;
  const hasWeightGain = labs.weightGain === true;
  const elevatedALT = labs.alt !== undefined && labs.alt > 25;

  if (hasIR) findings.push(`Insulin resistance screening: ${irScreening!.likelihoodLabel} (${irScreening!.positiveCount}/6 markers positive)`);
  if (elevatedA1c) findings.push(`A1c ${labs.a1c}% (prediabetic range)`);
  if (highTGHDLRatio) findings.push(`TG:HDL ratio ${(labs.triglycerides! / labs.hdl!).toFixed(1)} (≥3.0)`);
  if (elevatedTriglycerides) findings.push(`Triglycerides ${labs.triglycerides} mg/dL (elevated)`);
  if (lowHDL) findings.push(`HDL ${labs.hdl} mg/dL (low)`);
  if (lowSHBG) findings.push(`SHBG ${labs.shbg} nmol/L (low, associated with insulin resistance)`);
  if (elevatedApoB) findings.push(`ApoB ${labs.apoB} mg/dL (elevated)`);
  if (elevatedCRP) findings.push(`hs-CRP ${labs.hsCRP} mg/L (metabolic inflammation)`);
  if (hasWeightGain) findings.push("Unexplained weight gain / central adiposity reported");
  if (elevatedALT) findings.push(`ALT ${labs.alt} U/L (above optimal for women >25)`);

  const score = [hasIR, elevatedA1c, highTGHDLRatio, lowSHBG, elevatedApoB, hasWeightGain, elevatedCRP, elevatedALT].filter(Boolean).length;

  if (score >= 2 || (hasIR && irScreening!.likelihood === 'high')) {
    return {
      name: "Insulin Resistance / Visceral Adiposity",
      confidence: score >= 4 || (hasIR && irScreening!.likelihood === 'high') ? 'high' : 'moderate',
      supportingFindings: findings,
      description: "Metabolic pattern consistent with insulin resistance and/or visceral adiposity. This drives inflammation, hormonal imbalance, and cardiovascular risk.",
    };
  }
  return null;
}

function detectMenopausalTransitionPhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs } = ctx;
  const findings: string[] = [];

  const isPostmenopausal = labs.menstrualPhase === 'postmenopausal';
  const age = labs.demographics?.age;
  const isPeriAge = age !== undefined && age >= 38;
  const elevatedFSH = labs.fsh !== undefined && labs.fsh > 10;
  const highFSH = labs.fsh !== undefined && labs.fsh > 25;
  const lowEstradiol = labs.estradiol !== undefined && labs.estradiol < 50;
  const lowAMH = labs.amh !== undefined && labs.amh < 1.0;
  const hasHotFlashes = labs.hotFlashes === true;
  const hasNightSweats = labs.nightSweats === true;
  const hasSleepDisruption = labs.sleepDisruption === true;
  const hasMoodChanges = labs.moodChanges === true;
  const hasVaginalDryness = labs.vaginalDryness === true;
  const hasIrritability = labs.irritability === true;

  if (isPostmenopausal) findings.push("Postmenopausal status");
  if (isPeriAge && !isPostmenopausal) findings.push(`Age ${age} (perimenopause window)`);
  if (highFSH) findings.push(`FSH ${labs.fsh} mIU/mL (elevated, menopausal range)`);
  else if (elevatedFSH) findings.push(`FSH ${labs.fsh} mIU/mL (rising, perimenopause range)`);
  if (lowEstradiol) findings.push(`Estradiol ${labs.estradiol} pg/mL (declining)`);
  if (lowAMH) findings.push(`AMH ${labs.amh} ng/mL (low ovarian reserve)`);
  if (hasHotFlashes) findings.push("Hot flashes reported");
  if (hasNightSweats) findings.push("Night sweats reported");
  if (hasSleepDisruption) findings.push("Sleep disruption reported");
  if (hasMoodChanges) findings.push("Mood changes reported");
  if (hasVaginalDryness) findings.push("Vaginal dryness reported");
  if (hasIrritability) findings.push("Irritability reported");

  const labScore = [isPostmenopausal, highFSH, elevatedFSH && !highFSH, lowEstradiol, lowAMH].filter(Boolean).length;
  const symptomScore = [hasHotFlashes, hasNightSweats, hasSleepDisruption, hasMoodChanges, hasVaginalDryness, hasIrritability].filter(Boolean).length;

  if (isPostmenopausal || labScore >= 2 || (isPeriAge && (labScore >= 1 || symptomScore >= 2))) {
    return {
      name: "Menopausal Transition",
      confidence: isPostmenopausal || labScore >= 2 ? 'high' : symptomScore >= 3 ? 'moderate' : 'low',
      supportingFindings: findings,
      description: "Clinical picture consistent with perimenopause or menopause. Hormonal shifts during this transition affect bone health, cardiovascular risk, mood, and quality of life.",
    };
  }
  return null;
}

function detectEstrogenDominancePhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs } = ctx;
  const findings: string[] = [];

  const hasEstradiol = labs.estradiol !== undefined;
  const hasProgesterone = labs.progesterone !== undefined;
  const isNotPostmenopausal = labs.menstrualPhase !== 'postmenopausal';

  const lowProgesterone = labs.progesterone !== undefined && labs.progesterone < 5 && isNotPostmenopausal;
  const veryLowProgesterone = labs.progesterone !== undefined && labs.progesterone < 2 && isNotPostmenopausal;
  const highEstrogen = labs.estradiol !== undefined && labs.estradiol > 150 && labs.menstrualPhase !== 'ovulatory';
  const estrogenProgesteroneImbalance = hasEstradiol && hasProgesterone && labs.progesterone! < 5 && labs.estradiol! > 80 && isNotPostmenopausal;

  const borderlineALT = labs.alt !== undefined && labs.alt > 20 && labs.alt <= 32;
  const borderlineAST = labs.ast !== undefined && labs.ast > 20 && labs.ast <= 32;
  const elevatedALT = labs.alt !== undefined && labs.alt > 32;
  const hasPMS = labs.pmsSymptoms === true;
  const hasHeavyMenses = labs.heavyMenses === true;
  const hasAcne = labs.acne === true;
  const hasHeadaches = labs.headaches === true;
  const hasIrritability = labs.irritability === true;
  const hasBloating = labs.bloating === true;
  const hasMoodChanges = labs.moodChanges === true;

  if (estrogenProgesteroneImbalance) findings.push(`Estradiol:Progesterone imbalance (E2 ${labs.estradiol}, P4 ${labs.progesterone})`);
  if (highEstrogen && !estrogenProgesteroneImbalance) findings.push(`Elevated estradiol ${labs.estradiol} pg/mL`);
  if (veryLowProgesterone) findings.push(`Progesterone ${labs.progesterone} ng/mL (very low)`);
  else if (lowProgesterone && !estrogenProgesteroneImbalance) findings.push(`Progesterone ${labs.progesterone} ng/mL (low)`);
  if (borderlineALT || borderlineAST) findings.push(`Borderline liver markers (ALT ${labs.alt ?? 'N/A'}, AST ${labs.ast ?? 'N/A'}) suggesting possible impaired hepatic clearance`);
  if (elevatedALT) findings.push(`ALT ${labs.alt} U/L (elevated, may impair estrogen metabolism)`);
  if (hasPMS) findings.push("PMS symptoms reported");
  if (hasHeavyMenses) findings.push("Heavy menses reported");
  if (hasAcne) findings.push("Acne reported");
  if (hasHeadaches) findings.push("Headaches reported");
  if (hasIrritability) findings.push("Irritability reported");
  if (hasBloating) findings.push("Bloating reported");
  if (hasMoodChanges) findings.push("Mood changes reported");

  const labScore = [estrogenProgesteroneImbalance, highEstrogen, lowProgesterone, borderlineALT || borderlineAST, elevatedALT].filter(Boolean).length;
  const symptomScore = [hasPMS, hasHeavyMenses, hasAcne, hasHeadaches, hasIrritability, hasBloating, hasMoodChanges].filter(Boolean).length;

  if (labScore >= 1 && symptomScore >= 2) {
    return {
      name: "Estrogen Dominance / Impaired Clearance",
      confidence: labScore >= 2 && symptomScore >= 3 ? 'high' : labScore >= 1 && symptomScore >= 2 ? 'moderate' : 'low',
      supportingFindings: findings,
      description: "Pattern suggesting relative estrogen excess or impaired estrogen metabolism. This may result from insufficient progesterone, sluggish hepatic clearance, or both. Supporting liver detoxification pathways and estrogen metabolism may help restore balance.",
    };
  }
  if (estrogenProgesteroneImbalance || (labScore >= 2)) {
    return {
      name: "Estrogen Dominance / Impaired Clearance",
      confidence: 'moderate',
      supportingFindings: findings,
      description: "Lab pattern consistent with relative estrogen excess or impaired estrogen clearance. Even without reported symptoms, supporting liver detoxification and estrogen metabolism pathways may be beneficial.",
    };
  }
  return null;
}

function detectOxidativeStressPhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs, irScreening } = ctx;
  const findings: string[] = [];

  const elevatedCRP = labs.hsCRP !== undefined && labs.hsCRP > 2.0;
  const highCRP = labs.hsCRP !== undefined && labs.hsCRP > 3.0;
  const borderlineALT = labs.alt !== undefined && labs.alt > 20;
  const borderlineAST = labs.ast !== undefined && labs.ast > 20;
  const hasIR = irScreening && irScreening.likelihood !== 'none';
  const elevatedA1c = labs.a1c !== undefined && labs.a1c >= 5.7;
  const elevatedTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasBrainFog = labs.brainFog === true;
  const age = labs.demographics?.age;
  const ageOver45 = age !== undefined && age >= 45;

  if (highCRP) findings.push(`hs-CRP ${labs.hsCRP} mg/L (elevated, systemic inflammation)`);
  else if (elevatedCRP) findings.push(`hs-CRP ${labs.hsCRP} mg/L (moderate inflammatory burden)`);
  if (borderlineALT) findings.push(`ALT ${labs.alt} U/L (hepatic stress marker)`);
  if (borderlineAST) findings.push(`AST ${labs.ast} U/L (cellular stress marker)`);
  if (hasIR) findings.push("Insulin resistance pattern (metabolic oxidative driver)");
  if (elevatedA1c) findings.push(`A1c ${labs.a1c}% (glycemic stress)`);
  if (elevatedTriglycerides) findings.push(`Triglycerides ${labs.triglycerides} mg/dL (lipid peroxidation risk)`);
  if (hasLowEnergy) findings.push("Low energy / fatigue (possible mitochondrial burden)");
  if (hasBrainFog) findings.push("Brain fog reported (possible oxidative CNS burden)");
  if (ageOver45) findings.push(`Age ${age} (increased oxidative stress risk)`);

  const score = [highCRP, elevatedCRP && !highCRP, borderlineALT || borderlineAST, hasIR, elevatedA1c, elevatedTriglycerides, hasLowEnergy && hasBrainFog].filter(Boolean).length;

  if (score >= 2) {
    return {
      name: "Oxidative Stress Burden",
      confidence: score >= 4 ? 'high' : 'moderate',
      supportingFindings: findings,
      description: "Multiple markers suggest increased oxidative stress and cellular burden. Antioxidant and glutathione support may help reduce oxidative damage and support cellular energy production.",
    };
  }
  return null;
}

function detectStressDysregulationPhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs } = ctx;
  const findings: string[] = [];

  const lowDHEAS = labs.dheas !== undefined && labs.dheas < 100;
  const hasSleepDisruption = labs.sleepDisruption === true;
  const hasAnxiety = labs.anxiety === true;
  const hasIrritability = labs.irritability === true;
  const hasLowEnergy = labs.lowEnergy === true;
  const hasLowMotivation = labs.lowMotivation === true;
  const hasBrainFog = labs.brainFog === true;
  const suboptimalThyroid = labs.tsh !== undefined && labs.tsh > 3.0;
  const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
  const lowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 400;

  if (lowDHEAS) findings.push(`DHEA-S ${labs.dheas} µg/dL (low, adrenal depletion marker)`);
  if (hasSleepDisruption) findings.push("Sleep disruption reported");
  if (hasAnxiety) findings.push("Anxiety reported");
  if (hasIrritability) findings.push("Irritability reported");
  if (hasLowEnergy) findings.push("Low energy / fatigue reported");
  if (hasLowMotivation) findings.push("Low motivation reported");
  if (hasBrainFog) findings.push("Brain fog reported");
  if (suboptimalThyroid) findings.push(`TSH ${labs.tsh} mIU/L (suboptimal, HPA-thyroid axis stress)`);
  if (lowVitD) findings.push(`Vitamin D ${labs.vitaminD} ng/mL (low, stress resilience impact)`);
  if (lowB12) findings.push(`B12 ${labs.vitaminB12} pg/mL (low, neurotransmitter support)`);

  const symptomScore = [hasSleepDisruption, hasAnxiety, hasIrritability, hasLowEnergy, hasLowMotivation, hasBrainFog].filter(Boolean).length;
  const labScore = [lowDHEAS, suboptimalThyroid, lowVitD, lowB12].filter(Boolean).length;

  if (symptomScore >= 3 || (symptomScore >= 2 && labScore >= 1) || (lowDHEAS && symptomScore >= 1)) {
    return {
      name: "Stress / Cortisol Dysregulation",
      confidence: symptomScore >= 4 || (lowDHEAS && symptomScore >= 2) ? 'high' : 'moderate',
      supportingFindings: findings,
      description: "Pattern consistent with HPA-axis stress and cortisol dysregulation. Chronic stress depletes DHEA-S, disrupts sleep, and impairs cognitive and emotional function.",
    };
  }
  return null;
}

function detectGutMicrobiomePhenotype(ctx: PhenotypeDetectionContext): ClinicalPhenotype | null {
  const { labs } = ctx;
  const findings: string[] = [];

  const hasBloating = labs.bloating === true;
  const hasFrequentUTIs = labs.frequentUTIs === true;
  const hasVaginalDryness = labs.vaginalDryness === true;
  const elevatedCRP = labs.hsCRP !== undefined && labs.hsCRP > 1.5;
  const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
  const lowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 400;

  if (hasBloating) findings.push("Bloating / GI symptoms reported");
  if (hasFrequentUTIs) findings.push("Frequent UTIs reported (urogenital microbiome disruption)");
  if (hasVaginalDryness) findings.push("Vaginal dryness (mucosal barrier may benefit from probiotic support)");
  if (elevatedCRP) findings.push(`hs-CRP ${labs.hsCRP} mg/L (gut-driven inflammation possible)`);
  if (lowVitD) findings.push(`Vitamin D ${labs.vitaminD} ng/mL (impacts gut barrier integrity)`);
  if (lowB12) findings.push(`B12 ${labs.vitaminB12} pg/mL (possible absorption issues)`);

  const score = [hasBloating, hasFrequentUTIs, hasVaginalDryness, elevatedCRP, lowB12].filter(Boolean).length;

  if (score >= 2 || hasBloating || hasFrequentUTIs) {
    return {
      name: "Gut-Microbiome Support",
      confidence: score >= 3 ? 'high' : score >= 2 ? 'moderate' : 'low',
      supportingFindings: findings,
      description: "Indicators suggest the gut and/or urogenital microbiome may benefit from targeted probiotic support and gut barrier maintenance.",
    };
  }
  return null;
}

export function detectClinicalPhenotypes(labs: FemaleLabValues, irScreening?: InsulinResistanceScreening): ClinicalPhenotype[] {
  const ctx: PhenotypeDetectionContext = { labs, irScreening };

  const detectors = [
    detectInflammatoryPhenotype,
    detectIronDeficiencyPhenotype,
    detectInsulinResistancePhenotype,
    detectMenopausalTransitionPhenotype,
    detectEstrogenDominancePhenotype,
    detectOxidativeStressPhenotype,
    detectStressDysregulationPhenotype,
    detectGutMicrobiomePhenotype,
  ];

  const phenotypes: ClinicalPhenotype[] = [];
  for (const detect of detectors) {
    const result = detect(ctx);
    if (result) phenotypes.push(result);
  }

  phenotypes.sort((a, b) => {
    const order = { high: 0, moderate: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });

  return phenotypes;
}
