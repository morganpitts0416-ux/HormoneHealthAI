import type { FemaleLabValues, SupplementRecommendation } from "@shared/schema";

interface SupplementRule {
  supplement: Omit<SupplementRecommendation, 'indication' | 'rationale'>;
  evaluate: (labs: FemaleLabValues) => { shouldRecommend: boolean; indication: string; rationale: string } | null;
}

const supplementRules: SupplementRule[] = [
  // HEMAGENICS - Red Blood Cell Support (replaces generic iron)
  {
    supplement: {
      name: "Hemagenics® Red Blood Cell Support",
      dose: "1 tablet twice daily with meals",
      priority: 'high',
      category: 'iron',
      caution: "Contains iron, folate, and B12 for comprehensive RBC support. Avoid with calcium-rich foods. May cause mild GI upset initially."
    },
    evaluate: (labs) => {
      if (labs.ferritin === undefined) return null;
      
      const hasElevatedTIBC = labs.tibc !== undefined && labs.tibc > 450;
      const hasLowSerumIron = labs.iron !== undefined && labs.iron < 40;
      const hasFunctionalDeficiency = hasElevatedTIBC || hasLowSerumIron;
      const lowHemoglobin = labs.hemoglobin !== undefined && labs.hemoglobin < 12;
      
      if (labs.ferritin <= 30 || lowHemoglobin) {
        return {
          shouldRecommend: true,
          indication: `Ferritin ${labs.ferritin} ng/mL${lowHemoglobin ? `, Hemoglobin ${labs.hemoglobin} g/dL` : ''}`,
          rationale: "Hemagenics provides comprehensive red blood cell support with iron, folate, and B12 in highly absorbable forms. Indicated for ferritin ≤30 or anemia."
        };
      }
      
      if (labs.ferritin > 30 && labs.ferritin <= 50 && hasFunctionalDeficiency) {
        return {
          shouldRecommend: true,
          indication: `Ferritin ${labs.ferritin} ng/mL with functional iron deficiency markers`,
          rationale: "Hemagenics supports iron stores and RBC production. Consider for symptomatic patients with ferritin 31-50 and functional deficiency signs."
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

  // OMEGAGENICS FISH OIL EPA-DHA 1000mg
  {
    supplement: {
      name: "OmegaGenics® Fish Oil EPA-DHA 1000",
      dose: "1-2 softgels twice daily with meals",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "Pharmaceutical-grade fish oil. Take with food to minimize fishy aftertaste. May have mild blood-thinning effect."
    },
    evaluate: (labs) => {
      const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const highHsCRP = labs.hsCRP !== undefined && labs.hsCRP > 2;
      const elevatedLpa = labs.lpa !== undefined && labs.lpa > 50;
      const suboptimalHDL = labs.hdl !== undefined && labs.hdl < 50;
      
      if (highTriglycerides || highHsCRP || elevatedLpa || suboptimalHDL) {
        let indications: string[] = [];
        if (highTriglycerides) indications.push(`TG ${labs.triglycerides} mg/dL`);
        if (highHsCRP) indications.push(`hs-CRP ${labs.hsCRP} mg/L`);
        if (elevatedLpa) indications.push(`Lp(a) ${labs.lpa} nmol/L`);
        if (suboptimalHDL) indications.push(`HDL ${labs.hdl} mg/dL`);
        
        return {
          shouldRecommend: true,
          indication: indications.join(', '),
          rationale: "OmegaGenics EPA-DHA 1000 provides concentrated omega-3s to reduce triglycerides, lower inflammation, and support cardiovascular health."
        };
      }
      
      return null;
    }
  },

  // MAGTEIN MAGNESIUM L-THREONATE
  {
    supplement: {
      name: "Magtein® Magnesium L-Threonate",
      dose: "2 capsules daily (1 morning, 1 evening)",
      priority: 'medium',
      category: 'mineral',
      caution: "L-Threonate form crosses blood-brain barrier for cognitive support. Well-tolerated; gentle on GI system."
    },
    evaluate: (labs) => {
      const hasThyroidIssues = labs.tsh !== undefined && (labs.tsh > 4.5 || labs.tsh < 0.4);
      const lowFerritin = labs.ferritin !== undefined && labs.ferritin < 50;
      const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
      const onHRT = labs.onHRT === true;
      const postmenopausal = labs.menstrualPhase === 'postmenopausal';
      
      if (hasThyroidIssues || onHRT || postmenopausal || (lowFerritin && lowVitD)) {
        return {
          shouldRecommend: true,
          indication: "Cognitive and metabolic support",
          rationale: "Magtein is the only magnesium form shown to effectively cross the blood-brain barrier. Supports memory, sleep, stress resilience, and metabolic function."
        };
      }
      
      return null;
    }
  },

  // NUTRAGEN CoQ10 300mg
  {
    supplement: {
      name: "NutraGems® CoQ10 300",
      dose: "1 chewable softgel daily",
      priority: 'medium',
      category: 'cardiovascular',
      caution: "High-potency CoQ10 in absorbable form. Take with fatty meal for best absorption. Essential for statin users."
    },
    evaluate: (labs) => {
      const highLDL = labs.ldl !== undefined && labs.ldl > 130;
      const highTriglycerides = labs.triglycerides !== undefined && labs.triglycerides > 150;
      const lowFerritin = labs.ferritin !== undefined && labs.ferritin < 50;
      const postmenopausal = labs.menstrualPhase === 'postmenopausal';
      
      if ((highLDL || highTriglycerides) || (postmenopausal && lowFerritin)) {
        let indication = '';
        if (highLDL) indication = `LDL ${labs.ldl} mg/dL`;
        if (highTriglycerides) indication += indication ? `, TG ${labs.triglycerides} mg/dL` : `TG ${labs.triglycerides} mg/dL`;
        if (!indication && postmenopausal) indication = "Postmenopausal energy support";
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "NutraGems CoQ10 300 provides high-dose ubiquinone for cardiovascular support, cellular energy, and antioxidant protection. Critical if on statin therapy."
        };
      }
      
      return null;
    }
  },

  // ULTRAFLORA COMPLETE PROBIOTIC
  {
    supplement: {
      name: "UltraFlora® Complete",
      dose: "1 capsule daily",
      priority: 'low',
      category: 'general',
      caution: "Multi-strain probiotic. Store refrigerated for optimal potency. May cause temporary bloating when starting."
    },
    evaluate: (labs) => {
      const onHRT = labs.onHRT === true;
      const hasInflammation = labs.hsCRP !== undefined && labs.hsCRP > 2;
      const onBirthControl = labs.onBirthControl === true;
      const thyroidIssues = labs.tsh !== undefined && (labs.tsh > 4.5 || labs.tsh < 0.4);
      
      if (onHRT || hasInflammation || onBirthControl || thyroidIssues) {
        let indication = '';
        if (onHRT) indication = "HRT hormone metabolism support";
        else if (hasInflammation) indication = `Elevated hs-CRP (${labs.hsCRP} mg/L)`;
        else if (onBirthControl) indication = "Oral contraceptive support";
        else if (thyroidIssues) indication = "Gut-thyroid axis support";
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "UltraFlora Complete provides comprehensive probiotic support for gut health, hormone metabolism, immune function, and inflammation modulation."
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
      dose: "1 tablet twice daily",
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

  // SELENIUM FOR THYROID
  {
    supplement: {
      name: "Selenium",
      dose: "200 mcg daily",
      priority: 'medium',
      category: 'thyroid',
      caution: "Do not exceed 400 mcg daily from all sources. Supports thyroid hormone conversion and reduces antibodies."
    },
    evaluate: (labs) => {
      const hasThyroidIssue = labs.tsh !== undefined && (labs.tsh > 4.5 || labs.tsh < 0.4);
      const hasTPOAntibodies = labs.tpoAntibodies !== undefined && labs.tpoAntibodies > 34;
      
      if (hasThyroidIssue || hasTPOAntibodies) {
        let indication = '';
        if (hasTPOAntibodies) indication = `TPO antibodies elevated (${labs.tpoAntibodies} IU/mL)`;
        else indication = `TSH abnormal (${labs.tsh} mIU/L)`;
        
        return {
          shouldRecommend: true,
          indication: indication,
          rationale: "Selenium is essential for thyroid hormone production and conversion. Studies show it can reduce TPO antibodies in autoimmune thyroiditis."
        };
      }
      
      return null;
    }
  },

  // ZINC FOR THYROID SUPPORT
  {
    supplement: {
      name: "Zinc A.G.™",
      dose: "1 tablet daily with meal",
      priority: 'low',
      category: 'mineral',
      caution: "Zinc arginate/glycinate chelate for enhanced absorption. Take with food. Long-term use may require copper monitoring."
    },
    evaluate: (labs) => {
      const lowThyroid = labs.tsh !== undefined && labs.tsh > 4.5;
      const lowFreeT3 = labs.freeT3 !== undefined && labs.freeT3 < 2.3;
      const lowDHEAS = labs.dheas !== undefined && labs.dheas < 100;
      
      if (lowThyroid || lowFreeT3 || lowDHEAS) {
        return {
          shouldRecommend: true,
          indication: "Thyroid and hormone support",
          rationale: "Zinc A.G. provides highly absorbable zinc for T4 to T3 conversion, immune function, and hormone production."
        };
      }
      
      return null;
    }
  },

  // CALCIUM FOR BONE HEALTH (Postmenopausal)
  {
    supplement: {
      name: "Cal Apatite Bone Builder®",
      dose: "2 tablets twice daily with meals",
      priority: 'medium',
      category: 'bone',
      caution: "MCHC calcium for bone support. Take separately from iron (2+ hours). Best taken in divided doses."
    },
    evaluate: (labs) => {
      const postmenopausal = labs.menstrualPhase === 'postmenopausal';
      const lowEstradiol = labs.estradiol !== undefined && labs.estradiol < 40 && labs.onHRT === true;
      const lowVitD = labs.vitaminD !== undefined && labs.vitaminD < 30;
      
      if (postmenopausal || (lowEstradiol && lowVitD)) {
        return {
          shouldRecommend: true,
          indication: postmenopausal ? "Postmenopausal bone protection" : `Low estradiol with vitamin D insufficiency`,
          rationale: "Cal Apatite Bone Builder provides microcrystalline hydroxyapatite (MCHC) - the form of calcium found in bone - for comprehensive skeletal support."
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
