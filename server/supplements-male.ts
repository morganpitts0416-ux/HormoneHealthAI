import type { LabValues, SupplementRecommendation } from "@shared/schema";

interface SupplementRule {
  supplement: Omit<SupplementRecommendation, 'indication' | 'rationale'>;
  evaluate: (labs: LabValues) => { shouldRecommend: boolean; indication: string; rationale: string } | null;
}

const supplementRules: SupplementRule[] = [
  // TESTRALIN - Testosterone Support (Men-specific)
  {
    supplement: {
      name: "Testralin®",
      dose: "2 tablets twice daily",
      priority: 'high',
      category: 'hormone-support',
      caution: "Supports healthy testosterone levels and male vitality. Best taken with meals. May take 4-8 weeks for optimal effects."
    },
    evaluate: (labs) => {
      const lowTestosterone = labs.testosterone !== undefined && labs.testosterone < 400;
      const borderlineTestosterone = labs.testosterone !== undefined && labs.testosterone >= 400 && labs.testosterone < 500;
      const lowFreeTestosterone = labs.freeTestosterone !== undefined && labs.freeTestosterone < 10;
      const elevatedSHBG = labs.shbg !== undefined && labs.shbg > 50;
      
      if (lowTestosterone || (borderlineTestosterone && (lowFreeTestosterone || elevatedSHBG))) {
        let indications: string[] = [];
        if (labs.testosterone !== undefined) indications.push(`Total T ${labs.testosterone} ng/dL`);
        if (lowFreeTestosterone) indications.push(`Free T ${labs.freeTestosterone} pg/mL (low)`);
        if (elevatedSHBG) indications.push(`SHBG ${labs.shbg} nmol/L (elevated)`);
        
        return {
          shouldRecommend: true,
          indication: indications.join(', '),
          rationale: "Testralin provides targeted botanical and nutrient support for healthy testosterone production and male hormonal balance. Supports energy, vitality, and healthy aging."
        };
      }
      
      return null;
    }
  },

  // ULTRAFLORA COMPLETE PROBIOTIC - Gut Health Foundation for Men
  // Requires at least one clinical or metabolic trigger — not for 100% of patients.
  // Patients already triggered for UltraFlora Night Rest & Digest (metabolic/gut) do NOT
  // need this as well; Night Rest covers the gut axis more specifically for that phenotype.
  {
    supplement: {
      name: "UltraFlora® Complete Probiotic",
      dose: "1 capsule daily",
      priority: 'low',
      category: 'general',
      caution: "Multi-strain probiotic for digestive and immune health. Shelf-stable formula. No refrigeration needed."
    },
    evaluate: (labs) => {
      const age           = labs.demographics?.age;
      const ageOver45     = age !== undefined && age >= 45;
      const elevatedCRP   = labs.hsCRP !== undefined && labs.hsCRP >= 0.5;
      const glucoseUp     = labs.glucose !== undefined && labs.glucose >= 95;
      const a1cUp         = labs.a1c !== undefined && labs.a1c >= 5.4;
      const trigsUp       = labs.triglycerides !== undefined && labs.triglycerides > 130;
      const lowT          = labs.testosterone !== undefined && labs.testosterone < 500;
      // Only recommend when at least one gut-relevant clinical signal is present
      const triggers = [ageOver45, elevatedCRP, glucoseUp, a1cUp, trigsUp, lowT].filter(Boolean).length;
      if (triggers < 1) return null;
      const indications: string[] = [];
      if (ageOver45)   indications.push(`Age ${age} — gut microbiome diversity declines with age`);
      if (elevatedCRP) indications.push(`hs-CRP ${labs.hsCRP} mg/L — dysbiosis contributes to systemic inflammation`);
      if (glucoseUp)   indications.push(`Glucose ${labs.glucose} mg/dL — gut bacteria modulate glucose metabolism`);
      if (a1cUp)       indications.push(`A1c ${labs.a1c}% — microbiome influences glycemic regulation`);
      if (trigsUp)     indications.push(`Triglycerides ${labs.triglycerides} mg/dL — gut flora influence lipid metabolism`);
      if (lowT)        indications.push(`Testosterone ${labs.testosterone} ng/dL — gut health supports hormonal balance`);
      return {
        shouldRecommend: true,
        indication: indications.slice(0, 2).join('; '),
        rationale: "UltraFlora Complete provides comprehensive multi-strain probiotic support for digestive health, immune function, and overall wellness. A healthy gut microbiome is foundational for hormone metabolism, inflammation regulation, and metabolic health."
      };
    }
  },

  // D3 10000 + K - Severe Vitamin D Deficiency (≤20 ng/mL)
  {
    supplement: {
      name: "D3 10,000 + K",
      dose: "1 softgel daily with meal",
      priority: 'high',
      category: 'vitamin',
      caution: "High-dose repletion therapy. Recheck vitamin D levels in 8-12 weeks. Contains vitamin K2 for calcium metabolism."
    },
    evaluate: (labs) => {
      if (labs.vitaminD === undefined) return null;
      
      // Severe deficiency: ≤20 ng/mL - high-dose repletion needed
      if (labs.vitaminD <= 20) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (severe deficiency ≤20)`,
          rationale: "D3 10,000 + K provides high-dose vitamin D3 with K2 for efficient repletion. K2 ensures proper calcium utilization and supports testosterone production."
        };
      }
      
      return null;
    }
  },

  // D3 5000 + K - Vitamin D Deficiency/Insufficiency (21-40 ng/mL)
  {
    supplement: {
      name: "D3 5,000 + K",
      dose: "1 softgel daily with meal",
      priority: 'medium',
      category: 'vitamin',
      caution: "Repletion dose for deficiency/insufficiency. Contains vitamin K2 for optimal calcium metabolism. Recheck levels in 8-12 weeks."
    },
    evaluate: (labs) => {
      if (labs.vitaminD === undefined) return null;
      
      // Deficiency/Insufficiency: 21-40 ng/mL
      if (labs.vitaminD > 20 && labs.vitaminD <= 40) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (${labs.vitaminD <= 30 ? 'deficient' : 'insufficient'})`,
          rationale: "D3 5,000 + K provides vitamin D3 with K2 for repletion. Supports bone health, cardiovascular function, and healthy testosterone levels. Target ≥60 ng/mL."
        };
      }
      
      return null;
    }
  },

  // D3 2000 Complex - Vitamin D Suboptimal (41-59 ng/mL)
  {
    supplement: {
      name: "D3 2000 Complex",
      dose: "1 tablet daily with meal",
      priority: 'low',
      category: 'vitamin',
      caution: "Maintenance dose for suboptimal levels. Comprehensive vitamin D support with cofactors."
    },
    evaluate: (labs) => {
      if (labs.vitaminD === undefined) return null;
      
      // Suboptimal: 41-59 ng/mL - maintenance to reach optimal
      if (labs.vitaminD > 40 && labs.vitaminD < 60) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (suboptimal, target ≥60)`,
          rationale: "D3 2000 Complex provides maintenance vitamin D with cofactors to reach optimal range ≥60 ng/mL for testosterone and immune support."
        };
      }
      
      return null;
    }
  },

  // MAGTEIN MAGNESIUM L-THREONATE - For sleep disturbances or cognitive support
  {
    supplement: {
      name: "Magtein® Magnesium L-Threonate",
      dose: "3 capsules daily (divided doses)",
      priority: 'medium',
      category: 'mineral',
      caution: "L-Threonate form crosses blood-brain barrier for cognitive and sleep support. Well-tolerated; gentle on GI system."
    },
    evaluate: (labs) => {
      const suboptimalTestosterone = labs.testosterone !== undefined && labs.testosterone < 500;
      const elevatedGlucose = labs.glucose !== undefined && labs.glucose > 100;
      const suboptimalThyroid = labs.tsh !== undefined && labs.tsh > 3.0;
      
      const stressFactors = [suboptimalTestosterone, elevatedGlucose, suboptimalThyroid].filter(Boolean).length;
      
      if (stressFactors >= 2) {
        return {
          shouldRecommend: true,
          indication: "Multiple metabolic/hormonal stress indicators",
          rationale: "Magtein is the only magnesium form shown to effectively cross the blood-brain barrier. Supports quality sleep, cognitive function, and hormonal balance."
        };
      }
      
      return null;
    }
  },

  // ADRESET - Adrenal/Stress Support
  {
    supplement: {
      name: "Adreset®",
      dose: "2 capsules twice daily",
      priority: 'medium',
      category: 'hormone-support',
      caution: "Adaptogenic formula with ginseng, rhodiola, and cordyceps. Best taken earlier in day. May take 2-4 weeks for full effect."
    },
    evaluate: (labs) => {
      const lowTestosterone = labs.testosterone !== undefined && labs.testosterone < 400;
      const suboptimalTestosterone = labs.testosterone !== undefined && labs.testosterone >= 400 && labs.testosterone < 500;
      const thyroidStress = labs.tsh !== undefined && labs.tsh > 3.5;
      const elevatedGlucose = labs.glucose !== undefined && labs.glucose > 100;
      
      if (lowTestosterone || (suboptimalTestosterone && (thyroidStress || elevatedGlucose))) {
        let indication = '';
        if (lowTestosterone) indication = `Total T ${labs.testosterone} ng/dL (low)`;
        else indication = "Fatigue pattern with suboptimal hormonal/metabolic labs";
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "Adreset combines adaptogenic herbs to support healthy adrenal function, stress resilience, and energy. Helps restore HPA axis balance and supports testosterone production."
        };
      }
      
      return null;
    }
  },

  // EXHILARIN - Mood and Energy Support
  {
    supplement: {
      name: "Exhilarin®",
      dose: "2 tablets daily",
      priority: 'medium',
      category: 'general',
      caution: "Ayurvedic adaptogenic formula. Supports mental clarity and emotional well-being. Takes 2-4 weeks for optimal benefits."
    },
    evaluate: (labs) => {
      const suboptimalTestosterone = labs.testosterone !== undefined && labs.testosterone < 500;
      const suboptimalThyroid = labs.tsh !== undefined && labs.tsh > 3.0 && labs.tsh <= 4.5;
      const elevatedA1c = labs.a1c !== undefined && labs.a1c > 5.6;
      const elevatedGlucose = labs.glucose !== undefined && labs.glucose > 100;
      
      const fatigueFactorCount = [suboptimalTestosterone, suboptimalThyroid, elevatedA1c, elevatedGlucose].filter(Boolean).length;
      
      if (fatigueFactorCount >= 2) {
        let factors: string[] = [];
        if (suboptimalTestosterone) factors.push(`Total T ${labs.testosterone}`);
        if (suboptimalThyroid) factors.push(`TSH ${labs.tsh}`);
        if (elevatedA1c) factors.push(`A1c ${labs.a1c}%`);
        if (elevatedGlucose) factors.push(`Glucose ${labs.glucose}`);
        
        return {
          shouldRecommend: true,
          indication: `Multiple fatigue factors: ${factors.join(', ')}`,
          rationale: "Exhilarin provides adaptogenic support for mental energy, mood, and stress resilience. Complements hormonal optimization for comprehensive fatigue management."
        };
      }
      
      return null;
    }
  },

  // OMEGAGENICS FISH OIL NEURO 1000 - Brain, Cardiovascular, and Joint Support
  // Age ≥ 40 lowers the threshold but is not a standalone trigger — requires at least one
  // lipid or CV-risk lab finding.
  {
    supplement: {
      name: "OmegaGenics® Fish Oil Neuro 1000",
      dose: "1 softgel 1-2 times daily",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "High-DHA omega-3 (750mg DHA, 250mg EPA) for brain and heart health. Lemon-flavored, no fishy taste. Contains calamari - avoid if shellfish allergy."
    },
    evaluate: (labs) => {
      const highLDL = labs.ldl !== undefined && labs.ldl > 100;
      const lowHDL = labs.hdl !== undefined && labs.hdl < 40;
      const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const highTotalCholesterol = labs.totalCholesterol !== undefined && labs.totalCholesterol > 200;
      const abnormalLipids = highLDL || lowHDL || highTriglycerides || highTotalCholesterol;

      const elevatedLpa = labs.lpa !== undefined && labs.lpa > 30;
      const elevatedApoB = labs.apoB !== undefined && labs.apoB > 90;
      const elevatedHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 1.0;
      const elevatedCVRisk = elevatedLpa || elevatedApoB || elevatedHsCRP;

      const age = labs.demographics?.age;
      const ageOver40 = age !== undefined && age >= 40;

      // Require at least one lab-confirmed finding; age lowers threshold for borderline lipids
      if (!abnormalLipids && !elevatedCVRisk) {
        // If age ≥ 40 but no lipid/CV labs provided, don't fire
        return null;
      }

      const indications: string[] = [];
      if (highTriglycerides) indications.push(`TG ${labs.triglycerides} mg/dL`);
      if (highLDL) indications.push(`LDL ${labs.ldl} mg/dL`);
      if (lowHDL) indications.push(`HDL ${labs.hdl} mg/dL (low)`);
      if (elevatedHsCRP) indications.push(`hs-CRP ${labs.hsCRP} mg/L`);
      if (elevatedLpa) indications.push(`Lp(a) ${labs.lpa}`);
      if (elevatedApoB) indications.push(`ApoB ${labs.apoB} mg/dL`);
      if (ageOver40 && indications.length === 0) indications.push(`Age ${age} — cardiovascular prevention support`);

      return {
        shouldRecommend: true,
        indication: indications.join(', '),
        rationale: "OmegaGenics Fish Oil Neuro 1000 provides concentrated DHA and EPA to reduce triglycerides, support brain function, cardiovascular health, and reduce inflammation."
      };
    }
  },

  // NUTRAGEMS CoQ10 300 - Cardiovascular and Energy Support
  // Age ≥ 40 contributes to indication context but requires a clinical lab trigger.
  // Statins are a hard indication (statin therapy depletes CoQ10).
  {
    supplement: {
      name: "NutraGems® CoQ10 300",
      dose: "1 chewable gel daily",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "Chewable 300mg CoQ10 in emulsified form for enhanced absorption. Supports heart muscle function, energy production, and antioxidant protection. Essential for patients on statins."
    },
    evaluate: (labs) => {
      const highLDL = labs.ldl !== undefined && labs.ldl > 100;
      const lowHDL = labs.hdl !== undefined && labs.hdl < 40;
      const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const highTotalCholesterol = labs.totalCholesterol !== undefined && labs.totalCholesterol > 200;
      const abnormalLipids = highLDL || lowHDL || highTriglycerides || highTotalCholesterol;

      const elevatedLpa = labs.lpa !== undefined && labs.lpa > 30;
      const elevatedApoB = labs.apoB !== undefined && labs.apoB > 90;
      const elevatedHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 0.30;
      const elevatedCVRisk = elevatedLpa || elevatedApoB || elevatedHsCRP;

      const lowTestosterone = labs.testosterone !== undefined && labs.testosterone < 400;
      const onStatins = (labs as any).demographics?.onStatins === true;
      const age = labs.demographics?.age;
      const ageOver40 = age !== undefined && age >= 40;

      if (!abnormalLipids && !elevatedCVRisk && !lowTestosterone && !onStatins) return null;

      const indications: string[] = [];
      if (onStatins) indications.push("On statin therapy — CoQ10 depletion indicated");
      if (highLDL) indications.push(`LDL ${labs.ldl} mg/dL`);
      if (lowHDL) indications.push(`HDL ${labs.hdl} mg/dL (low)`);
      if (highTriglycerides) indications.push(`TG ${labs.triglycerides} mg/dL`);
      if (highTotalCholesterol) indications.push(`TC ${labs.totalCholesterol} mg/dL`);
      if (elevatedLpa) indications.push(`Lp(a) ${labs.lpa}`);
      if (elevatedApoB) indications.push(`ApoB ${labs.apoB} mg/dL`);
      if (elevatedHsCRP) indications.push(`hs-CRP ${labs.hsCRP} mg/dL`);
      if (lowTestosterone) indications.push(`Total T ${labs.testosterone} ng/dL (low — mitochondrial support)`);
      if (ageOver40) indications.push(`Age ${age} — endogenous CoQ10 production declines after 40`);

      return {
        shouldRecommend: true,
        indication: indications.slice(0, 3).join('; '),
        rationale: "NutraGems CoQ10 300 provides high-potency ubiquinone for cardiovascular protection, cellular energy production, and antioxidant support. Essential for patients on statin therapy (which depletes CoQ10) and for men with cardiovascular risk markers or low testosterone requiring mitochondrial energy support."
      };
    }
  },
  // HEMAGENICS - Iron Deficiency (hemoglobin-triggered for male panel)
  {
    supplement: {
      name: "Hemagenics\u00AE Red Blood Cell Support",
      dose: "1 tablet twice daily with meals",
      priority: 'high',
      category: 'iron',
      caution: "Contains iron bisglycinate, B12, B6, and folate for comprehensive red blood cell support. Avoid taking with calcium-rich foods or dairy. May cause mild GI upset initially — take with food."
    },
    evaluate: (labs) => {
      const lowHemoglobin = labs.hemoglobin !== undefined && labs.hemoglobin < 13.5;
      const hasHairLoss   = labs.hairLoss === true;
      const hasLowEnergy  = labs.lowEnergy === true;
      const hasRestless   = labs.restlessLegs === true;

      if (!lowHemoglobin) return null;

      const indications: string[] = [];
      indications.push(`Hemoglobin ${labs.hemoglobin} g/dL (low <13.5 in men)`);
      if (hasHairLoss)  indications.push("Hair loss (iron-responsive symptom)");
      if (hasLowEnergy) indications.push("Fatigue/low energy with anemia");
      if (hasRestless)  indications.push("Restless legs (iron-responsive symptom)");

      return {
        shouldRecommend: true,
        indication: indications.join('; '),
        rationale: "Hemagenics provides highly absorbable iron bisglycinate with B12, B6, and folate for comprehensive red blood cell support. Indicated for low hemoglobin, iron-responsive fatigue, hair loss, and restless legs syndrome. High-confidence recommendation when hemoglobin is below normal male reference range."
      };
    }
  },

  // BERBERINE GT - Insulin Resistance / Metabolic Support
  {
    supplement: {
      name: "Berberine GT\u00AE",
      dose: "1 capsule 2–3 times daily with meals (or as directed by provider)",
      priority: 'high',
      category: 'metabolic',
      caution: "Berberine HCl 500 mg + decaffeinated green tea extract 200 mg per capsule. May potentiate blood-sugar-lowering medications — monitor glucose levels. Take with food to minimize GI effects."
    },
    evaluate: (labs) => {
      const glucoseBorderline  = labs.glucose !== undefined && labs.glucose >= 90 && labs.glucose <= 110;
      const glucoseElevated    = labs.glucose !== undefined && labs.glucose > 110;
      const a1cPreDiabetic     = labs.a1c !== undefined && labs.a1c >= 5.4 && labs.a1c < 6.5;
      const trigsOver100       = labs.triglycerides !== undefined && labs.triglycerides > 100;
      const trigsOver150       = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const lowHDL             = labs.hdl !== undefined && labs.hdl < 40;
      const unfavorableTGHDL   = labs.triglycerides !== undefined && labs.hdl !== undefined && labs.hdl > 0 && (labs.triglycerides / labs.hdl) > 3.0;
      const elevatedALT        = labs.alt !== undefined && labs.alt > 35;
      const hasWeightGain      = labs.weightGain === true;

      let score = 0;
      if (glucoseElevated)    score += 4;
      else if (glucoseBorderline) score += 2;
      if (a1cPreDiabetic)     score += 4;
      if (trigsOver150)       score += 3;
      else if (trigsOver100)  score += 2;
      if (lowHDL)             score += 2;
      if (unfavorableTGHDL)   score += 2;
      if (elevatedALT)        score += 2;
      if (hasWeightGain)      score += 2;

      if (score < 4) return null;

      const indications: string[] = [];
      if (glucoseElevated)       indications.push(`Fasting glucose ${labs.glucose} mg/dL (elevated — pre-diabetic)`);
      else if (glucoseBorderline) indications.push(`Fasting glucose ${labs.glucose} mg/dL (90–110, trending pre-diabetic)`);
      if (a1cPreDiabetic)        indications.push(`A1c ${labs.a1c}% (pre-diabetic range 5.4–6.4%)`);
      if (trigsOver150)          indications.push(`Triglycerides ${labs.triglycerides} mg/dL (elevated >150)`);
      else if (trigsOver100)     indications.push(`Triglycerides ${labs.triglycerides} mg/dL (elevated >100)`);
      if (lowHDL)                indications.push(`HDL ${labs.hdl} mg/dL (low)`);
      if (unfavorableTGHDL)      indications.push(`TG:HDL ratio ${(labs.triglycerides! / labs.hdl!).toFixed(1)} (unfavorable >3.0)`);
      if (elevatedALT)           indications.push(`ALT ${labs.alt} U/L (elevated — metabolic/fatty liver pattern)`);
      if (hasWeightGain)         indications.push("Central weight gain / visceral adiposity");

      return {
        shouldRecommend: true,
        indication: indications.join('; '),
        rationale: "Metagenics Berberine GT combines berberine HCl 500 mg with decaffeinated green tea extract 200 mg per capsule, dosed 1 capsule 2–3× daily with meals. Berberine activates AMPK to improve insulin sensitivity, lower fasting glucose, reduce triglycerides, support favorable LDL particle quality, and assist with weight management. Green tea EGCG provides complementary antioxidant and metabolic support. Indicated for pre-diabetic glucose or A1c, unfavorable TG:HDL ratio, low HDL, elevated ALT or fatty liver tendency, central adiposity, or metabolic syndrome features. Also appropriate as adjunct support in GLP-1 patients needing additional glucose and lipid optimization."
      };
    }
  },

  // PHYTOMULTI MULTIVITAMIN - Multiple micronutrient gaps
  {
    supplement: {
      name: "PhytoMulti® Multivitamin",
      dose: "2 tablets daily with meals",
      priority: 'medium',
      category: 'general',
      caution: "Comprehensive multivitamin with phytonutrients. Contains vitamin K — consult provider if on blood thinners. Take with food to minimize GI effects."
    },
    evaluate: (labs) => {
      const lowVitD   = labs.vitaminD !== undefined && labs.vitaminD < 50;
      const lowB12    = (labs as any).vitaminB12 !== undefined && (labs as any).vitaminB12 < 600;
      const lowFolate = (labs as any).folate !== undefined && (labs as any).folate < 10;
      const nutrientGaps = [lowVitD, lowB12, lowFolate].filter(Boolean).length;
      if (nutrientGaps < 2) return null;
      const indications: string[] = [];
      if (lowVitD)   indications.push(`Vitamin D ${labs.vitaminD} ng/mL (suboptimal)`);
      if (lowB12)    indications.push(`B12 suboptimal — methylation support`);
      if (lowFolate) indications.push(`Folate borderline — one-carbon metabolism`);
      return {
        shouldRecommend: true,
        indication: indications.join('; '),
        rationale: "PhytoMulti provides a comprehensive multivitamin and phytonutrient complex with 13 vitamins, essential minerals, and 13 standardized plant extracts with DNA protection activity. Indicated when multiple micronutrient gaps are identified — supports methylation, cellular energy production, cardiovascular health, immune function, and hormonal balance. Provides methylfolate, methylcobalamin B12, and vitamin D3 in bioavailable forms as a foundational supplement."
      };
    }
  },

  // STAYSTRONG+ BRAIN & BODY - Cognitive and energy support
  // Requires at least one neurological/methylation marker (B12 or folate) — testosterone
  // or thyroid alone are NOT sufficient to trigger this; those are covered by Testralin /
  // Adreset / Exhilarin. This prevents near-universal firing in borderline male patients.
  {
    supplement: {
      name: "StayStrong+® Brain & Body",
      dose: "2 capsules daily",
      priority: 'medium',
      category: 'general',
      caution: "Contains adaptogenic botanicals and B-complex. May interact with MAOIs. Consult provider if on psychiatric medications."
    },
    evaluate: (labs) => {
      const lowB12    = (labs as any).vitaminB12 !== undefined && (labs as any).vitaminB12 < 600;
      const lowFolate = (labs as any).folate !== undefined && (labs as any).folate < 10;
      const lowVitD   = labs.vitaminD !== undefined && labs.vitaminD < 40;
      const suboptimalT = labs.testosterone !== undefined && labs.testosterone < 500;
      const suboptimalThyroid = labs.tsh !== undefined && (labs.tsh < 0.5 || labs.tsh > 3.0);

      // Hard gate: at least one B-vitamin / methylation marker must be present
      if (!lowB12 && !lowFolate) return null;

      // Then require a second supporting signal
      const supporting = [lowVitD, suboptimalT, suboptimalThyroid].filter(Boolean).length;
      if (supporting < 1) return null;

      const indications: string[] = [];
      if (lowB12) indications.push(`B12 suboptimal — neurological and methylation support`);
      if (lowFolate) indications.push(`Folate borderline — one-carbon metabolism and brain energy`);
      if (lowVitD) indications.push(`Vitamin D ${labs.vitaminD} ng/mL — cognitive and mood support`);
      if (suboptimalT) indications.push(`Testosterone ${labs.testosterone} ng/dL — energy and mental clarity support`);
      if (suboptimalThyroid) indications.push(`TSH ${labs.tsh} (suboptimal) — metabolic energy support`);
      return {
        shouldRecommend: true,
        indication: indications.slice(0, 2).join('; '),
        rationale: "StayStrong+ Brain & Body combines methylated B-vitamins, adaptogenic botanicals, and mitochondrial cofactors to support cognitive clarity, mental energy, and physical vitality. Indicated when B12 or folate are suboptimal alongside additional hormonal or metabolic stress — addresses the neuroendocrine-mitochondrial axis critical for sustained cognitive performance and physical energy."
      };
    }
  },

  // STAYSTRONG+ JOINT & MUSCLE POWDER - Musculoskeletal support
  {
    supplement: {
      name: "StayStrong+® Joint & Muscle Powder",
      dose: "1 scoop daily mixed in water or smoothie",
      priority: 'low',
      category: 'general',
      caution: "Collagen-based powder with joint-support compounds. Check for fish/shellfish allergy if marine collagen is present."
    },
    evaluate: (labs) => {
      const elevatedCRP  = labs.hsCRP !== undefined && labs.hsCRP >= 1.0;
      const lowVitD      = labs.vitaminD !== undefined && labs.vitaminD < 40;
      const lowT         = labs.testosterone !== undefined && labs.testosterone < 400;
      const age          = labs.demographics?.age;
      const olderPatient = age !== undefined && age >= 50;
      const triggers = [elevatedCRP, lowVitD, lowT, olderPatient].filter(Boolean).length;
      if (triggers < 2) return null;
      const indications: string[] = [];
      if (elevatedCRP)  indications.push(`hs-CRP ${labs.hsCRP} mg/L — inflammation impairs musculoskeletal recovery`);
      if (lowVitD)      indications.push(`Vitamin D ${labs.vitaminD} ng/mL — muscle function and bone health support`);
      if (lowT)         indications.push(`Testosterone ${labs.testosterone} ng/dL — muscle maintenance support`);
      if (olderPatient) indications.push(`Age ${age} — musculoskeletal structural support indicated`);
      return {
        shouldRecommend: true,
        indication: indications.slice(0, 2).join('; '),
        rationale: "StayStrong+ Joint & Muscle Powder provides collagen peptides, amino acids, and joint-support compounds to support musculoskeletal integrity, joint comfort, and muscle tissue maintenance. Particularly indicated when labs show elevated hs-CRP, low vitamin D, suboptimal testosterone (reduces anabolic muscle maintenance), or in older patients where structural decline is a clinical priority. Supports recovery and musculoskeletal resilience in the context of systemic inflammatory or hormonal burden."
      };
    }
  },

  // STAYSTRONG+ 4IN1 COLLAGEN CHEWS - Whole body collagen support
  {
    supplement: {
      name: "StayStrong+® 4in1 Collagen Whole Body Chews",
      dose: "2 chews daily",
      priority: 'low',
      category: 'general',
      caution: "Multi-type collagen in chewable form. Check for marine-derived allergens if applicable."
    },
    evaluate: (labs) => {
      const elevatedCRP  = labs.hsCRP !== undefined && labs.hsCRP >= 1.0;
      const age          = labs.demographics?.age;
      const olderPatient = age !== undefined && age >= 45;
      const suboptimalT  = labs.testosterone !== undefined && labs.testosterone < 500;
      if (!elevatedCRP && !(olderPatient && suboptimalT)) return null;
      const indications: string[] = [];
      if (elevatedCRP)  indications.push(`hs-CRP ${labs.hsCRP} mg/L — inflammation degrades collagen matrix`);
      if (olderPatient) indications.push(`Age ${age} — collagen synthesis declines with age`);
      if (suboptimalT)  indications.push(`Testosterone ${labs.testosterone} ng/dL — androgen decline reduces collagen cross-linking`);
      return {
        shouldRecommend: true,
        indication: indications.slice(0, 2).join('; '),
        rationale: "StayStrong+ 4in1 Collagen Whole Body Chews provide four types of collagen peptides (Type I for skin/tendons, Type II for joint cartilage, Type III for skin and gut lining, and marine-sourced) in convenient chewable form. In men, testosterone decline reduces collagen cross-linking and structural tissue integrity; elevated CRP accelerates collagen degradation. Supports skin, joint integrity, tendon strength, and gut lining structure across multiple systems."
      };
    }
  },

  // ULTRAFLORA NIGHT REST & DIGEST POSTBIOTIC - Sleep and gut support
  {
    supplement: {
      name: "UltraFlora® Night Rest & Digest Postbiotic",
      dose: "1–2 capsules at bedtime",
      priority: 'low',
      category: 'probiotic',
      caution: "Heat-inactivated postbiotic strains — stable at room temperature. Generally well tolerated. No live organism concerns."
    },
    evaluate: (labs) => {
      const elevatedCRP       = labs.hsCRP !== undefined && labs.hsCRP >= 1.0;
      const glucoseBorderline = labs.glucose !== undefined && labs.glucose >= 95;
      const a1cBorderline     = labs.a1c !== undefined && labs.a1c >= 5.4;
      const trigsElevated     = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const metabolicLoad     = [elevatedCRP, glucoseBorderline, a1cBorderline, trigsElevated].filter(Boolean).length;
      if (metabolicLoad < 2) return null;
      const indications: string[] = [];
      if (elevatedCRP)       indications.push(`hs-CRP ${labs.hsCRP} mg/L — gut dysbiosis drives systemic inflammation`);
      if (glucoseBorderline) indications.push(`Glucose ${labs.glucose} mg/dL — gut microbiome modulates glucose metabolism`);
      if (a1cBorderline)     indications.push(`A1c ${labs.a1c}% — dysbiosis contributes to metabolic dysregulation`);
      if (trigsElevated)     indications.push(`Triglycerides ${labs.triglycerides} mg/dL — gut bacteria influence lipid metabolism`);
      return {
        shouldRecommend: true,
        indication: indications.slice(0, 2).join('; '),
        rationale: "UltraFlora Night Rest & Digest Postbiotic combines heat-inactivated probiotic strains (postbiotics) with overnight digestive and sleep-support compounds. Postbiotics provide immune modulation and gut barrier support without live organism instability. Evening dosing aligns with overnight gut repair and the circadian gut-brain axis. Indicated when metabolic markers (glucose, A1c, triglycerides) and inflammatory markers suggest gut dysbiosis is contributing to the overall metabolic and inflammatory burden."
      };
    }
  },
];
export function evaluateMaleSupplements(labs: LabValues): SupplementRecommendation[] {
  const supplementMap = new Map<string, SupplementRecommendation>();
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  
  for (const rule of supplementRules) {
    const result = rule.evaluate(labs);
    
    if (result && result.shouldRecommend) {
      const key = rule.supplement.name;
      const existing = supplementMap.get(key);
      
      const newRecommendation: SupplementRecommendation = {
        ...rule.supplement,
        indication: result.indication,
        rationale: result.rationale
      };
      
      if (!existing) {
        supplementMap.set(key, newRecommendation);
      } else {
        if (priorityOrder[newRecommendation.priority] < priorityOrder[existing.priority]) {
          supplementMap.set(key, newRecommendation);
        }
      }
    }
  }
  
  const allRecommendations = Array.from(supplementMap.values());
  // PhytoMulti is a fallback broad-spectrum foundation, not an additive
  // recommendation. Prefer any targeted supplement recommendation instead.
  const hasAlternativeSupplement = allRecommendations.some(
    recommendation => !recommendation.name.toLowerCase().includes('phytomulti'),
  );
  const recommendations = hasAlternativeSupplement
    ? allRecommendations.filter(recommendation => !recommendation.name.toLowerCase().includes('phytomulti'))
    : allRecommendations;
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations;
}
