/**
 * metagenics-catalog.ts
 * Canonical Metagenics product catalog shared between:
 *  - Patient wellness PDF export (female + male)
 *  - "Add supplement from library" dialog picker
 *
 * Single source of truth — edit here and both consumers update automatically.
 */

export interface MetagenicsCatalogProduct {
  name: string;
  aliases: string[];
  description: string;
  defaultDose: string;
  /** Broad clinical category — used for filtering and PDF matching */
  category: string;
  /** 'male' | 'female' | 'both' — informational only, clinician decides what's appropriate */
  gender?: 'male' | 'female' | 'both';
}

export const METAGENICS_CATALOG: MetagenicsCatalogProduct[] = [
  // ── Hormonal / Female ────────────────────────────────────────────────────
  {
    name: 'HerWellness Estrovera',
    aliases: ['estrovera', 'herwellness estrovera', 'err 731', 'rhubarb', 'menopause', 'hot flash', 'night sweat'],
    description: 'Hormone-free, plant-based menopause relief featuring ERr 731 Siberian rhubarb extract. Clinically proven to relieve hot flashes, night sweats, sleep disturbances, and mood changes in 1–4 weeks.',
    defaultDose: '1 tablet daily with food',
    category: 'menopause',
    gender: 'female',
  },
  {
    name: 'EstroFactors',
    aliases: ['estrofactors', 'estro factors', 'i3c', 'dim', 'calcium d-glucarate', 'estrogen metabolism', 'estrogen balance'],
    description: 'Nutritional support for healthy estrogen metabolism and balance with I3C, DIM, and calcium D-glucarate. Supports healthy estrogen metabolite ratios during hormonal transitions.',
    defaultDose: '2 tablets twice daily',
    category: 'estrogen-support',
    gender: 'female',
  },
  {
    name: 'HerWellness Rapid Stress Relief',
    aliases: ['rapid stress', 'stress relief', 'l-theanine', 'lactium', 'stress chew', 'herwellness stress'],
    description: 'Fast-acting stress support with L-Theanine (200 mg) and Lactium for calm within 1 hour. Non-drowsy formula with saffron and vitamin B6 for relaxation and hormonal balance.',
    defaultDose: '1 soft chew during times of stress',
    category: 'stress',
    gender: 'female',
  },
  {
    name: 'StayStrong+® 4in1 Collagen Whole Body Chews',
    aliases: ['staystrong', 'stay strong', 'collagen', '4in1 collagen', 'whole body chews'],
    description: 'Four types of collagen peptides (Type I for skin/hair/nails, Type II for joint cartilage, Type III for skin elasticity and gut lining, and marine-sourced collagen). Indicated when estrogen decline accelerates collagen degradation.',
    defaultDose: '2 chews daily',
    category: 'collagen',
    gender: 'female',
  },

  // ── Male / Testosterone ──────────────────────────────────────────────────
  {
    name: 'Testralin',
    aliases: ['testralin', 'testosterone support', 'test support', 'male vitality'],
    description: 'Botanical and nutrient formula supporting healthy testosterone levels, male vitality, energy, and reproductive function.',
    defaultDose: '2 tablets twice daily with meals',
    category: 'testosterone',
    gender: 'male',
  },

  // ── Vitamins ─────────────────────────────────────────────────────────────
  {
    name: 'Vitamin D3 10,000 + K',
    aliases: ['d3 10000', 'd3 10,000', 'vitamin d 10000', 'high dose d', 'vitamin d 10000 + k'],
    description: 'High-potency vitamin D3 (10,000 IU) with vitamin K2 (MK-7) in olive oil for enhanced absorption. Supports bone health, immune function, cardiovascular health, and proper calcium utilization. Monitor serum levels every 60–90 days.',
    defaultDose: '1 softgel daily with meal',
    category: 'vitamind-high',
    gender: 'both',
  },
  {
    name: 'Vitamin D3 5,000 + K',
    aliases: ['d3 5000', 'd3 5,000', 'vitamin d', 'd3', 'cholecalciferol', 'vitamin d3'],
    description: 'Vitamin D3 (5,000 IU) with vitamin K2 for deficiency/insufficiency repletion (21–40 ng/mL). Supports bone, cardiovascular, and immune health.',
    defaultDose: '1 softgel daily with meal',
    category: 'vitamind',
    gender: 'both',
  },
  {
    name: 'D3 2000 Complex',
    aliases: ['d3 2000', 'vitamin d 2000', 'd3 complex', 'vitamin d maintenance'],
    description: 'Comprehensive vitamin D3 with cofactors for suboptimal levels (41–59 ng/mL). Supports reaching the optimal range (≥60 ng/mL) for bone and immune health.',
    defaultDose: '1 tablet daily with meal',
    category: 'vitamind-maintenance',
    gender: 'both',
  },
  {
    name: 'Intrinsi B12-Folate',
    aliases: ['intrinsi', 'b12-folate', 'b12 folate', 'intrinsic factor', 'methylcobalamin', 'b12', 'vitamin b12'],
    description: 'High-potency methylcobalamin (500 mcg) and L-5-MTHF folate with intrinsic factor for enhanced absorption. Supports nervous system function, cardiovascular health, and energy metabolism.',
    defaultDose: '1 tablet daily',
    category: 'b12',
    gender: 'both',
  },
  {
    name: 'Hemagenics',
    aliases: ['hemagenics', 'iron b12', 'red blood cell', 'rbc', 'iron folate', 'iron supplement'],
    description: 'Non-constipating iron formula with B12, B6, and folate for red blood cell formation. Supports energy metabolism and reduces fatigue with gentle, highly absorbable iron bisglycinate.',
    defaultDose: '1 tablet daily with food',
    category: 'iron',
    gender: 'both',
  },

  // ── Minerals / Brain ─────────────────────────────────────────────────────
  {
    name: 'Magtein Magnesium L-Threonate',
    aliases: ['magtein', 'magnesium', 'mag l-threonate', 'l-threonate', 'brain magnesium'],
    description: 'Clinically studied magnesium L-threonate that crosses the blood-brain barrier. Supports memory, focus, learning, cognitive performance, and sleep quality.',
    defaultDose: '1 capsule morning, 2 capsules 2 hours before sleep',
    category: 'magnesium',
    gender: 'both',
  },

  // ── Adaptogens ────────────────────────────────────────────────────────────
  {
    name: 'Adreset',
    aliases: ['adreset', 'adrenal', 'cordyceps', 'ginseng', 'rhodiola', 'adaptogen'],
    description: 'Adaptogen formula with Cordyceps, Asian Ginseng, and Rhodiola for those who are stressed and tired. Supports stress resilience, energy, stamina, and mental clarity.',
    defaultDose: '2 capsules twice daily',
    category: 'adrenal',
    gender: 'both',
  },
  {
    name: 'Exhilarin',
    aliases: ['exhilarin', 'ashwagandha', 'holy basil', 'tulsi', 'bacopa', 'amla'],
    description: 'Ayurvedic adaptogen blend with Ashwagandha, Holy Basil, Bacopa, and Amla. Increases stress tolerance, supports energy, mental acuity, and mood balance without stimulants.',
    defaultDose: '2 tablets daily',
    category: 'mood',
    gender: 'both',
  },

  // ── Cardiovascular ────────────────────────────────────────────────────────
  {
    name: 'NutraGems CoQ10 300',
    aliases: ['nutragems', 'coq10', 'coenzyme q10', 'ubiquinone', 'coq10 300'],
    description: 'Chewable 300 mg CoQ10 in emulsified form for enhanced absorption. Supports heart muscle function, cellular energy production, and antioxidant protection. Non-GMO, gluten-free.',
    defaultDose: '1 chewable gel daily',
    category: 'cardiovascular',
    gender: 'both',
  },
  {
    name: 'OmegaGenics Fish Oil Neuro 1000',
    aliases: ['omegagenics', 'fish oil', 'omega-3', 'omega 3', 'dha', 'epa', 'neuro 1000'],
    description: 'High-DHA omega-3 fish oil (750 mg DHA, 250 mg EPA) for brain health, cognitive function, mood balance, and cardiovascular support. Lemon-flavored. Non-GMO, gluten-free.',
    defaultDose: '1 softgel 1–2 times daily',
    category: 'omega',
    gender: 'both',
  },
  {
    name: 'Berberine GT',
    aliases: ['berberine gt', 'berberine', 'berberine hcl', 'berberine green tea', 'blood sugar support'],
    description: 'Berberine HCl 500 mg combined with decaffeinated green tea extract 200 mg per capsule. Supports healthy blood sugar regulation, improves insulin sensitivity, helps lower triglycerides, and supports healthy cholesterol levels.',
    defaultDose: '1 capsule 2–3 times daily with meals',
    category: 'metabolic',
    gender: 'both',
  },

  // ── Probiotics ────────────────────────────────────────────────────────────
  {
    name: "UltraFlora Complete Women's Probiotic",
    aliases: ['ultraflora', 'ultraflora complete', 'probiotic', 'womens probiotic', 'lactobacillus', 'vaginal health'],
    description: "5-in-1 multi-benefit probiotic with Lactobacillus GR-1 and RC-14 for vaginal, urinary, digestive, and immune health. Includes vitamins B2, B6, and D.",
    defaultDose: '1 capsule daily (2 daily for urogenital irritation)',
    category: 'probiotic',
    gender: 'female',
  },
  {
    name: 'UltraFlora Complete Probiotic',
    aliases: ['ultraflora complete probiotic', 'ultraflora men', 'mens probiotic', 'gut health probiotic'],
    description: 'Multi-strain probiotic for digestive health, immune support, nutrient absorption, and gut-brain axis function. Foundation for overall wellness.',
    defaultDose: '1 capsule daily',
    category: 'probiotic',
    gender: 'male',
  },
  {
    name: 'UltraFlora Healthy Weight with Akkermansia',
    aliases: ['healthy weight', 'akkermansia', 'ultraflora weight', 'metabolic probiotic', 'weight probiotic'],
    description: 'Specialized probiotic with Akkermansia muciniphila and Bifidobacterium lactis B420 for metabolic health, gut barrier integrity, and healthy weight management support.',
    defaultDose: '1 capsule daily',
    category: 'metabolic-probiotic',
    gender: 'both',
  },

  // ── Detox ─────────────────────────────────────────────────────────────────
  {
    name: 'AdvaClear',
    aliases: ['advaclear', 'adva clear', 'liver detox', 'biotransformation', 'phase i', 'phase ii', 'detoxification'],
    description: 'Broad-spectrum liver detoxification support with nutrients for both Phase I and Phase II biotransformation pathways. Supports metabolic clearance of hormones, environmental compounds, and metabolic byproducts.',
    defaultDose: '2 capsules twice daily with food',
    category: 'detox',
    gender: 'both',
  },
  {
    name: 'GlutaClear',
    aliases: ['glutaclear', 'gluta clear', 'glutathione', 'nac', 'antioxidant', 'alpha lipoic'],
    description: 'Glutathione and antioxidant support formula with NAC, alpha-lipoic acid, and green tea catechins. Supports cellular defense against oxidative damage, liver health, and immune function.',
    defaultDose: '2 capsules daily',
    category: 'detox',
    gender: 'both',
  },
];
