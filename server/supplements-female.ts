import type { FemaleLabValues, SupplementRecommendation } from "@shared/schema";

interface SupplementRule {
  supplement: Omit<SupplementRecommendation, 'indication' | 'rationale'>;
  evaluate: (labs: FemaleLabValues) => { shouldRecommend: boolean; indication: string; rationale: string } | null;
}

const supplementRules: SupplementRule[] = [
  // IRON SUPPLEMENTS
  {
    supplement: {
      name: "Ferrous Sulfate (Iron)",
      dose: "65mg elemental iron daily",
      priority: 'high',
      category: 'iron',
      caution: "Take with vitamin C for better absorption. Avoid with calcium, coffee, or tea. May cause GI upset - take with food if needed."
    },
    evaluate: (labs) => {
      if (labs.ferritin === undefined) return null;
      
      const hasElevatedTIBC = labs.tibc !== undefined && labs.tibc > 450;
      const hasLowSerumIron = labs.iron !== undefined && labs.iron < 40;
      const hasFunctionalDeficiency = hasElevatedTIBC || hasLowSerumIron;
      
      if (labs.ferritin <= 30) {
        return {
          shouldRecommend: true,
          indication: `Ferritin ${labs.ferritin} ng/mL (depleted iron stores)`,
          rationale: "Iron deficiency confirmed. 65mg elemental iron recommended for all patients with ferritin ≤30."
        };
      }
      
      if (labs.ferritin > 30 && labs.ferritin <= 50 && hasFunctionalDeficiency) {
        return {
          shouldRecommend: true,
          indication: `Ferritin ${labs.ferritin} ng/mL with functional iron deficiency`,
          rationale: "Ferritin 31-50 with elevated TIBC or low serum iron suggests functional deficiency. Consider supplementation if symptomatic."
        };
      }
      
      return null;
    }
  },

  // VITAMIN D
  {
    supplement: {
      name: "Vitamin D3 (Cholecalciferol)",
      dose: "5,000 IU daily",
      priority: 'high',
      category: 'vitamin',
      caution: "Recheck levels in 8-12 weeks. High doses may require monitoring of calcium levels."
    },
    evaluate: (labs) => {
      if (labs.vitaminD === undefined) return null;
      
      if (labs.vitaminD < 20) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (deficiency)`,
          rationale: "Vitamin D deficiency. Higher dose supplementation needed for repletion."
        };
      }
      
      return null;
    }
  },
  {
    supplement: {
      name: "Vitamin D3 (Cholecalciferol)",
      dose: "2,000 IU daily",
      priority: 'medium',
      category: 'vitamin',
      caution: "Maintenance dose. Recheck annually."
    },
    evaluate: (labs) => {
      if (labs.vitaminD === undefined) return null;
      
      if (labs.vitaminD >= 20 && labs.vitaminD < 30) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (insufficiency)`,
          rationale: "Vitamin D insufficiency. Moderate supplementation recommended."
        };
      }
      
      return null;
    }
  },

  // VITAMIN B12
  {
    supplement: {
      name: "Vitamin B12 (Methylcobalamin)",
      dose: "1,000 mcg daily sublingual or oral",
      priority: 'high',
      category: 'vitamin',
      caution: "Sublingual form may have better absorption. Consider B12 injections if malabsorption suspected."
    },
    evaluate: (labs) => {
      if (labs.vitaminB12 === undefined) return null;
      
      if (labs.vitaminB12 < 300) {
        return {
          shouldRecommend: true,
          indication: `Vitamin B12 ${labs.vitaminB12} pg/mL (low/suboptimal)`,
          rationale: "B12 below optimal range. Supplementation recommended, especially for fatigue, cognitive symptoms, or vegetarian/vegan diet."
        };
      }
      
      return null;
    }
  },

  // FOLATE
  {
    supplement: {
      name: "Methylfolate (5-MTHF)",
      dose: "800-1000 mcg daily",
      priority: 'medium',
      category: 'vitamin',
      caution: "Preferred form over folic acid for better bioavailability. Important if planning pregnancy."
    },
    evaluate: (labs) => {
      if (labs.folate === undefined) return null;
      
      if (labs.folate < 5) {
        return {
          shouldRecommend: true,
          indication: `Folate ${labs.folate} ng/mL (low)`,
          rationale: "Low folate levels. Supplementation recommended."
        };
      }
      
      return null;
    }
  },

  // OMEGA-3 FOR CARDIOVASCULAR
  {
    supplement: {
      name: "Omega-3 Fish Oil (EPA/DHA)",
      dose: "2-4g EPA+DHA daily",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "Choose high-quality, purified fish oil. May have mild blood-thinning effect."
    },
    evaluate: (labs) => {
      const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const highHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 2;
      const elevatedLpa = labs.lpa !== undefined && labs.lpa > 50;
      
      if (highTriglycerides || (highHsCRP && elevatedLpa)) {
        let indication = '';
        if (highTriglycerides) indication = `Triglycerides ${labs.triglycerides} mg/dL`;
        if (highHsCRP) indication += indication ? `, hs-CRP ${labs.hsCRP} mg/L` : `hs-CRP ${labs.hsCRP} mg/L`;
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "Omega-3 fatty acids help reduce triglycerides and inflammation markers."
        };
      }
      
      return null;
    }
  },

  // MAGNESIUM
  {
    supplement: {
      name: "Magnesium Glycinate",
      dose: "200-400mg daily (at bedtime)",
      priority: 'medium',
      category: 'mineral',
      caution: "Glycinate form is gentle on stomach and promotes relaxation. Start with lower dose."
    },
    evaluate: (labs) => {
      const hasThyroidIssues = labs.tsh !== undefined && (labs.tsh > 4.5 || labs.tsh < 0.4);
      const hasFatigue = labs.ferritin !== undefined && labs.ferritin < 50;
      const hasMuscleCramps = labs.vitaminD !== undefined && labs.vitaminD < 30;
      const onHRT = labs.onHRT === true;
      
      if (hasThyroidIssues || (onHRT && (hasFatigue || hasMuscleCramps))) {
        return {
          shouldRecommend: true,
          indication: "General wellness support",
          rationale: "Magnesium supports thyroid function, energy production, muscle function, and sleep quality. Most women are deficient."
        };
      }
      
      return null;
    }
  },

  // CALCIUM + VITAMIN D FOR BONE HEALTH
  {
    supplement: {
      name: "Calcium Citrate",
      dose: "500-600mg twice daily with meals",
      priority: 'medium',
      category: 'bone',
      caution: "Take separately from iron supplements (2+ hours apart). Citrate form absorbs better than carbonate."
    },
    evaluate: (labs) => {
      const postmenopausal = labs.menstrualPhase === 'postmenopausal';
      const lowEstradiol = labs.estradiol !== undefined && labs.estradiol < 40 && labs.onHRT;
      const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
      
      if (postmenopausal || lowEstradiol) {
        return {
          shouldRecommend: true,
          indication: postmenopausal ? "Postmenopausal bone protection" : `Low estradiol (${labs.estradiol} pg/mL)`,
          rationale: "Calcium is essential for bone health, especially with low estrogen states. Combine with vitamin D for optimal absorption."
        };
      }
      
      return null;
    }
  },

  // SELENIUM FOR THYROID
  {
    supplement: {
      name: "Selenium",
      dose: "200mcg daily",
      priority: 'medium',
      category: 'thyroid',
      caution: "Do not exceed 400mcg daily. Brazil nuts are a good food source (1-2 nuts = ~100mcg)."
    },
    evaluate: (labs) => {
      const hasThyroidIssue = labs.tsh !== undefined && (labs.tsh > 4.5 || labs.tsh < 0.4);
      const hasTPOAntibodies = labs.tpoAntibodies !== undefined && labs.tpoAntibodies > 34;
      
      if (hasThyroidIssue || hasTPOAntibodies) {
        let indication = '';
        if (hasTPOAntibodies) indication = `TPO antibodies elevated (${labs.tpoAntibodies} IU/mL)`;
        else if (hasThyroidIssue) indication = `TSH abnormal (${labs.tsh} mIU/L)`;
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "Selenium supports thyroid function and may help reduce thyroid antibodies in autoimmune thyroiditis."
        };
      }
      
      return null;
    }
  },

  // ZINC FOR THYROID AND IMMUNITY
  {
    supplement: {
      name: "Zinc Picolinate",
      dose: "15-30mg daily",
      priority: 'low',
      category: 'mineral',
      caution: "Take with food to avoid nausea. Long-term high-dose zinc may deplete copper."
    },
    evaluate: (labs) => {
      const lowThyroid = labs.tsh !== undefined && labs.tsh > 4.5;
      const lowFreeT3 = labs.freeT3 !== undefined && labs.freeT3 < 2.3;
      
      if (lowThyroid || lowFreeT3) {
        return {
          shouldRecommend: true,
          indication: "Thyroid support",
          rationale: "Zinc is required for T4 to T3 conversion and optimal thyroid function."
        };
      }
      
      return null;
    }
  },

  // CoQ10 FOR STATIN USERS OR FATIGUE
  {
    supplement: {
      name: "CoQ10 (Ubiquinol)",
      dose: "100-200mg daily",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "Ubiquinol form is better absorbed than ubiquinone. Take with fatty meal."
    },
    evaluate: (labs) => {
      const highLDL = labs.ldl !== undefined && labs.ldl > 130;
      const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const lowEnergy = labs.ferritin !== undefined && labs.ferritin < 50;
      
      if ((highLDL || highTriglycerides) && lowEnergy) {
        return {
          shouldRecommend: true,
          indication: "Cardiovascular and energy support",
          rationale: "CoQ10 supports heart function and energy production. Essential if on statin therapy."
        };
      }
      
      return null;
    }
  },

  // DHEA FOR LOW DHEA-S
  {
    supplement: {
      name: "DHEA",
      dose: "10-25mg daily (start low)",
      priority: 'medium',
      category: 'hormone-support',
      caution: "Monitor with labs. May cause acne or hair changes. Discuss with provider before starting."
    },
    evaluate: (labs) => {
      if (labs.dheas === undefined) return null;
      
      if (labs.dheas < 65) {
        return {
          shouldRecommend: true,
          indication: `DHEA-S ${labs.dheas} µg/dL (low)`,
          rationale: "Low DHEA-S may contribute to fatigue, low libido, and decreased sense of wellbeing. Low-dose supplementation may help."
        };
      }
      
      return null;
    }
  },

  // PROBIOTICS FOR GENERAL WELLNESS
  {
    supplement: {
      name: "Probiotic (Multi-strain)",
      dose: "25-50 billion CFU daily",
      priority: 'low',
      category: 'general',
      caution: "Choose refrigerated, multi-strain formula. May cause temporary bloating initially."
    },
    evaluate: (labs) => {
      const onHRT = labs.onHRT === true;
      const hasInflammation = labs.hsCRP !== undefined && labs.hsCRP > 2;
      
      if (onHRT || hasInflammation) {
        return {
          shouldRecommend: true,
          indication: onHRT ? "HRT hormone metabolism support" : `Elevated hs-CRP (${labs.hsCRP} mg/L)`,
          rationale: "Probiotics support gut health, hormone metabolism, and may help reduce systemic inflammation."
        };
      }
      
      return null;
    }
  }
];

export function evaluateSupplements(labs: FemaleLabValues): SupplementRecommendation[] {
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
