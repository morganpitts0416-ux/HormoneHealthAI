import type { FemaleLabValues, SupplementRecommendation } from "@shared/schema";

interface SupplementRule {
  supplement: Omit<SupplementRecommendation, 'indication' | 'rationale'>;
  evaluate: (labs: FemaleLabValues) => { shouldRecommend: boolean; indication: string; rationale: string } | null;
}

const supplementRules: SupplementRule[] = [
  // HEMAGENICS - Functional Iron Deficiency / Iron Deficiency Without Anemia
  {
    supplement: {
      name: "Hemagenics® Red Blood Cell Support",
      dose: "1 tablet twice daily with meals",
      priority: 'high',
      category: 'iron',
      caution: "Contains iron, folate, and B12 for comprehensive RBC support. Avoid with calcium-rich foods. May cause mild GI upset initially."
    },
    evaluate: (labs) => {
      const hasElevatedTIBC = labs.tibc !== undefined && labs.tibc > 450;
      const hasLowSerumIron = labs.iron !== undefined && labs.iron < 60;
      const lowFerritin = labs.ferritin !== undefined && labs.ferritin <= 50;
      const normalHemoglobin = labs.hemoglobin === undefined || labs.hemoglobin >= 12;
      
      const functionalIronDeficiency = hasElevatedTIBC || hasLowSerumIron || lowFerritin;
      const ironDeficiencyWithoutAnemia = lowFerritin && normalHemoglobin;
      
      if (functionalIronDeficiency || ironDeficiencyWithoutAnemia) {
        let indications: string[] = [];
        if (labs.ferritin !== undefined && labs.ferritin <= 50) indications.push(`Ferritin ${labs.ferritin} ng/mL`);
        if (hasLowSerumIron) indications.push(`Serum iron ${labs.iron} µg/dL`);
        if (hasElevatedTIBC) indications.push(`TIBC ${labs.tibc} µg/dL`);
        
        const indicationType = ironDeficiencyWithoutAnemia ? "Iron deficiency without anemia" : "Functional iron deficiency";
        
        return {
          shouldRecommend: true,
          indication: `${indicationType}: ${indications.join(', ')}`,
          rationale: "Hemagenics provides comprehensive red blood cell support with highly absorbable iron, folate, and B12. Indicated for functional iron deficiency or iron deficiency without anemia."
        };
      }
      
      return null;
    }
  },

  // D3 10000 + K - Severe Vitamin D Deficiency
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
      
      if (labs.vitaminD < 20) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (deficiency <20)`,
          rationale: "D3 10,000 + K provides high-dose vitamin D3 with K2 for efficient repletion. K2 ensures proper calcium utilization and bone health."
        };
      }
      
      return null;
    }
  },

  // D3 5000 + K - Moderate Vitamin D Insufficiency
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
      
      if (labs.vitaminD >= 20 && labs.vitaminD < 30) {
        return {
          shouldRecommend: true,
          indication: `Vitamin D ${labs.vitaminD} ng/mL (insufficiency 20-30)`,
          rationale: "D3 5,000 + K provides vitamin D3 with K2 for moderate insufficiency. K2 supports bone health and cardiovascular function."
        };
      }
      
      return null;
    }
  },

  // INTRINSI B12-FOLATE - Combined B12 and Folate
  {
    supplement: {
      name: "Intrinsi B12-Folate™",
      dose: "1 tablet daily",
      priority: 'high',
      category: 'vitamin',
      caution: "Contains intrinsic factor for enhanced B12 absorption. Ideal for patients with absorption concerns or vegetarian/vegan diets."
    },
    evaluate: (labs) => {
      const lowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 400;
      const lowFolate = labs.folate !== undefined && labs.folate < 5;
      
      if (lowB12 || lowFolate) {
        let indication = '';
        if (lowB12 && lowFolate) {
          indication = `B12 ${labs.vitaminB12} pg/mL, Folate ${labs.folate} ng/mL`;
        } else if (lowB12) {
          indication = `B12 ${labs.vitaminB12} pg/mL (suboptimal <400)`;
        } else {
          indication = `Folate ${labs.folate} ng/mL (low)`;
        }
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "Intrinsi B12-Folate provides methylated B12 and folate with intrinsic factor for superior absorption. Supports energy, cognition, and methylation."
        };
      }
      
      return null;
    }
  },

  // MAGTEIN MAGNESIUM L-THREONATE - For sleep disturbances or low energy
  {
    supplement: {
      name: "Magtein® Magnesium L-Threonate",
      dose: "3 capsules daily (divided doses)",
      priority: 'medium',
      category: 'mineral',
      caution: "L-Threonate form crosses blood-brain barrier for cognitive and sleep support. Well-tolerated; gentle on GI system."
    },
    evaluate: (labs) => {
      const hasSleepDisturbances = labs.sleepDisruption === true;
      const hasLowEnergy = labs.lowEnergy === true;
      
      if (hasSleepDisturbances || hasLowEnergy) {
        let indication = '';
        if (hasSleepDisturbances && hasLowEnergy) {
          indication = "Sleep disturbances and low energy";
        } else if (hasSleepDisturbances) {
          indication = "Sleep disturbances";
        } else {
          indication = "Low energy";
        }
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "Magtein is the only magnesium form shown to effectively cross the blood-brain barrier. Supports quality sleep, cognitive function, and energy levels."
        };
      }
      
      return null;
    }
  },

  // ULTRAFLORA COMPLETE WOMEN'S PROBIOTIC - Recommended for ALL female patients
  {
    supplement: {
      name: "UltraFlora® Complete Women's Probiotic",
      dose: "1 capsule daily",
      priority: 'low',
      category: 'general',
      caution: "5-in-1 multi-benefit probiotic with Lactobacillus GR-1 and RC-14 for vaginal and urinary health. Increase to 2 daily for urogenital irritation."
    },
    evaluate: (_labs) => {
      // Recommended for ALL female patients
      return {
        shouldRecommend: true,
        indication: "Women's health foundation",
        rationale: "UltraFlora Complete Women's provides 5-in-1 support for vaginal, urinary, digestive, and immune health with Lactobacillus GR-1 and RC-14 strains."
      };
    }
  },
  
  // HERWELLNESS RAPID STRESS RELIEF - Fast-Acting Stress Support
  {
    supplement: {
      name: "HerWellness™ Rapid Stress Relief",
      dose: "1 soft chew during times of stress",
      priority: 'medium',
      category: 'hormone-support',
      caution: "Fast-acting L-Theanine and Lactium formula. Non-drowsy. Promotes calm within 1 hour. Contains milk."
    },
    evaluate: (labs) => {
      const postmenopausal = labs.menstrualPhase === 'postmenopausal';
      const lowDHEAS = labs.dheas !== undefined && labs.dheas < 100;
      const suboptimalThyroid = labs.tsh !== undefined && labs.tsh > 3.0;
      const lowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 400;
      const lowFerritin = labs.ferritin !== undefined && labs.ferritin < 50;
      
      const stressFactors = [postmenopausal, lowDHEAS, suboptimalThyroid, lowB12, lowFerritin].filter(Boolean).length;
      
      if (stressFactors >= 2) {
        return {
          shouldRecommend: true,
          indication: "Multiple stress/fatigue indicators present",
          rationale: "HerWellness Rapid Stress Relief provides fast-acting stress support with L-Theanine (200mg) and Lactium. Promotes calm within 1 hour without drowsiness."
        };
      }
      
      return null;
    }
  },

  // HERWELLNESS ESTROVERA - Menopause Support
  {
    supplement: {
      name: "HerWellness™ Estrovera®",
      dose: "1 tablet daily",
      priority: 'medium',
      category: 'hormone-support',
      caution: "Rhubarb extract for menopausal symptom relief. Non-hormonal option. Effects typically noticed within 4 weeks."
    },
    evaluate: (labs) => {
      const postmenopausal = labs.menstrualPhase === 'postmenopausal';
      const lowEstradiol = labs.estradiol !== undefined && labs.estradiol < 30;
      const notOnHRT = labs.onHRT !== true;
      
      if ((postmenopausal || lowEstradiol) && notOnHRT) {
        return {
          shouldRecommend: true,
          indication: postmenopausal ? "Postmenopausal symptom support" : `Low estradiol (${labs.estradiol} pg/mL)`,
          rationale: "Estrovera provides clinically studied ERr 731® rhubarb extract for relief of menopausal symptoms including hot flashes, sleep disturbances, and mood changes without hormones."
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
      const lowDHEAS = labs.dheas !== undefined && labs.dheas < 100;
      const lowFerritin = labs.ferritin !== undefined && labs.ferritin < 50;
      const thyroidStress = labs.tsh !== undefined && labs.tsh > 3.5 && labs.freeT4 !== undefined && labs.freeT4 < 1.0;
      const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
      
      if (lowDHEAS || (lowFerritin && thyroidStress) || (lowFerritin && lowVitD)) {
        let indication = '';
        if (lowDHEAS) indication = `DHEA-S ${labs.dheas} µg/dL (low)`;
        else indication = "Fatigue pattern with suboptimal labs";
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "Adreset combines adaptogenic herbs to support healthy adrenal function, stress resilience, and energy. Helps restore HPA axis balance."
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
      const lowB12 = labs.vitaminB12 !== undefined && labs.vitaminB12 < 400;
      const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
      const lowFerritin = labs.ferritin !== undefined && labs.ferritin < 50;
      const suboptimalThyroid = labs.tsh !== undefined && labs.tsh > 3.0 && labs.tsh <= 4.5;
      
      const fatigueFactorCount = [lowB12, lowVitD, lowFerritin, suboptimalThyroid].filter(Boolean).length;
      
      if (fatigueFactorCount >= 2) {
        let factors: string[] = [];
        if (lowB12) factors.push(`B12 ${labs.vitaminB12}`);
        if (lowVitD) factors.push(`Vit D ${labs.vitaminD}`);
        if (lowFerritin) factors.push(`Ferritin ${labs.ferritin}`);
        if (suboptimalThyroid) factors.push(`TSH ${labs.tsh}`);
        
        return {
          shouldRecommend: true,
          indication: `Multiple fatigue factors: ${factors.join(', ')}`,
          rationale: "Exhilarin provides adaptogenic support for mental energy, mood, and stress resilience. Complements nutrient repletion for comprehensive fatigue management."
        };
      }
      
      return null;
    }
  },

  // NUTRAGEMS CoQ10 300 - Cardiovascular and Lipid Support
  {
    supplement: {
      name: "NutraGems® CoQ10 300",
      dose: "1 chewable gel daily",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "Chewable 300mg CoQ10 in emulsified form for enhanced absorption. Supports heart muscle function, energy production, and antioxidant protection. Non-GMO, gluten-free."
    },
    evaluate: (labs) => {
      // Abnormal lipid findings
      const highLDL = labs.ldl !== undefined && labs.ldl > 100;
      const lowHDL = labs.hdl !== undefined && labs.hdl < 50;
      const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const highTotalCholesterol = labs.totalCholesterol !== undefined && labs.totalCholesterol > 200;
      const abnormalLipids = highLDL || lowHDL || highTriglycerides || highTotalCholesterol;
      
      // Elevated cardiovascular risk markers
      const elevatedLpa = labs.lpa !== undefined && labs.lpa > 30;
      const elevatedApoB = labs.apoB !== undefined && labs.apoB > 90;
      const elevatedHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 2;
      const elevatedCVRisk = elevatedLpa || elevatedApoB || elevatedHsCRP;
      
      if (abnormalLipids || elevatedCVRisk) {
        let indications: string[] = [];
        if (highLDL) indications.push(`LDL ${labs.ldl} mg/dL`);
        if (lowHDL) indications.push(`HDL ${labs.hdl} mg/dL (low)`);
        if (highTriglycerides) indications.push(`TG ${labs.triglycerides} mg/dL`);
        if (highTotalCholesterol) indications.push(`TC ${labs.totalCholesterol} mg/dL`);
        if (elevatedLpa) indications.push(`Lp(a) ${labs.lpa} nmol/L`);
        if (elevatedApoB) indications.push(`ApoB ${labs.apoB} mg/dL`);
        if (elevatedHsCRP) indications.push(`hs-CRP ${labs.hsCRP} mg/L`);
        
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
