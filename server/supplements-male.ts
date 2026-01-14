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

  // D3 10000 + K - Vitamin D Deficiency (≤30 ng/mL)
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
      
      // Deficiency: ≤30 ng/mL - high-dose repletion needed
      if (labs.vitaminD <= 30) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (deficient ≤30)`,
          rationale: "D3 10,000 + K provides high-dose vitamin D3 with K2 for efficient repletion. K2 ensures proper calcium utilization and supports testosterone production."
        };
      }
      
      return null;
    }
  },

  // D3 5000 + K - Vitamin D Insufficiency (31-40 ng/mL)
  {
    supplement: {
      name: "D3 5,000 + K",
      dose: "1 softgel daily with meal",
      priority: 'medium',
      category: 'vitamin',
      caution: "Maintenance/repletion dose. Contains vitamin K2 for optimal calcium metabolism. Recheck levels annually."
    },
    evaluate: (labs) => {
      if (labs.vitaminD === undefined) return null;
      
      // Insufficiency: 31-40 ng/mL - maintenance dose
      if (labs.vitaminD > 30 && labs.vitaminD <= 40) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (insufficient 31-40)`,
          rationale: "D3 5,000 + K provides vitamin D3 with K2 for moderate insufficiency. Supports bone health, cardiovascular function, and healthy testosterone levels."
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
