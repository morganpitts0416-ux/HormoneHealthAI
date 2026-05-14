import type { LabValues, SupplementRecommendation } from "@shared/schema";

interface SupplementRule {
  supplement: Omit<SupplementRecommendation, 'indication' | 'rationale'>;
  evaluate: (labs: LabValues) => { shouldRecommend: boolean; indication: string; rationale: string } | null;
}

const supplementRules: SupplementRule[] = [
  // AGE-BASED CARDIAC/NEUROLOGIC SUPPORT - OmegaGenics Fish Oil for patients 40+
  {
    supplement: {
      name: "OmegaGenics® Fish Oil EPA-DHA 1000",
      dose: "1 softgel 1-2 times daily with meals",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "High-quality omega-3 (500mg EPA, 500mg DHA) for heart and brain health. Lemon-flavored for easy consumption. Contains fish oil."
    },
    evaluate: (labs) => {
      const age = labs.demographics?.age;
      if (age !== undefined && age >= 40) {
        return {
          shouldRecommend: true,
          indication: `Age ${age} - cardiac/neurologic support for patients 40+`,
          rationale: "OmegaGenics Fish Oil EPA-DHA 1000 provides balanced omega-3 fatty acids to support cardiovascular health, cognitive function, and reduce inflammation. Recommended for all men 40+ for overall cardiac and neurologic protection."
        };
      }
      return null;
    }
  },

  // AGE-BASED CARDIAC/NEUROLOGIC SUPPORT - NutraGems CoQ10 for patients 40+
  {
    supplement: {
      name: "NutraGems® CoQ10 300",
      dose: "1 chewable gel daily",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "Chewable 300mg CoQ10 in emulsified form for enhanced absorption. Supports heart muscle function, energy production, and antioxidant protection."
    },
    evaluate: (labs) => {
      const age = labs.demographics?.age;
      if (age !== undefined && age >= 40) {
        return {
          shouldRecommend: true,
          indication: `Age ${age} - cardiac/energy support for patients 40+`,
          rationale: "NutraGems CoQ10 300 provides high-potency ubiquinone essential for mitochondrial energy production and cardiovascular protection. Recommended for all men 40+ for cardiac and neurologic health maintenance."
        };
      }
      return null;
    }
  },

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
  {
    supplement: {
      name: "UltraFlora® Complete Probiotic",
      dose: "1 capsule daily",
      priority: 'low',
      category: 'general',
      caution: "Multi-strain probiotic for digestive and immune health. Shelf-stable formula. No refrigeration needed."
    },
    evaluate: (_labs) => {
      return {
        shouldRecommend: true,
        indication: "Men's health foundation",
        rationale: "UltraFlora Complete provides comprehensive multi-strain probiotic support for digestive health, immune function, and overall wellness."
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
      const elevatedHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 0.30;
      const elevatedCVRisk = elevatedLpa || elevatedApoB || elevatedHsCRP;
      
      if (abnormalLipids || elevatedCVRisk) {
        let indications: string[] = [];
        if (highTriglycerides) indications.push(`TG ${labs.triglycerides} mg/dL`);
        if (highLDL) indications.push(`LDL ${labs.ldl} mg/dL`);
        if (lowHDL) indications.push(`HDL ${labs.hdl} mg/dL (low)`);
        if (elevatedHsCRP) indications.push(`hs-CRP ${labs.hsCRP} mg/dL`);
        if (elevatedLpa) indications.push(`Lp(a) ${labs.lpa}`);
        if (elevatedApoB) indications.push(`ApoB ${labs.apoB} mg/dL`);
        
        return {
          shouldRecommend: true,
          indication: indications.join(', '),
          rationale: "OmegaGenics Fish Oil Neuro 1000 provides concentrated DHA and EPA to reduce triglycerides, support brain function, cardiovascular health, and reduce inflammation."
        };
      }
      
      return null;
    }
  },

  // NUTRAGEMS CoQ10 300 - Cardiovascular and Energy Support
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
      
      if (abnormalLipids || elevatedCVRisk || lowTestosterone) {
        let indications: string[] = [];
        if (highLDL) indications.push(`LDL ${labs.ldl} mg/dL`);
        if (lowHDL) indications.push(`HDL ${labs.hdl} mg/dL (low)`);
        if (highTriglycerides) indications.push(`TG ${labs.triglycerides} mg/dL`);
        if (highTotalCholesterol) indications.push(`TC ${labs.totalCholesterol} mg/dL`);
        if (elevatedLpa) indications.push(`Lp(a) ${labs.lpa}`);
        if (elevatedApoB) indications.push(`ApoB ${labs.apoB} mg/dL`);
        if (elevatedHsCRP) indications.push(`hs-CRP ${labs.hsCRP} mg/dL`);
        if (lowTestosterone) indications.push(`Low T (energy support)`);
        
        return {
          shouldRecommend: true,
          indication: indications.join(', '),
          rationale: "NutraGems CoQ10 300 provides high-potency ubiquinone for cardiovascular protection, cellular energy production, and antioxidant support. Essential for patients on statins."
        };
      }
      
      return null;
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
  
  const recommendations = Array.from(supplementMap.values());
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations;
}
