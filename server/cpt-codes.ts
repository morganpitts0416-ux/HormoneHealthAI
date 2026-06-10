export interface CPTCode {
  code: string;
  description: string;
  aliases?: string[];
}

export const CPT_CODES: CPTCode[] = [
  // ── Evaluation & Management — Office / Outpatient ──────────────────────
  { code: "99202", description: "Office visit, new patient — straightforward complexity", aliases: ["new patient", "office visit new"] },
  { code: "99203", description: "Office visit, new patient — low complexity" },
  { code: "99204", description: "Office visit, new patient — moderate complexity" },
  { code: "99205", description: "Office visit, new patient — high complexity" },
  { code: "99211", description: "Office visit, established patient — minimal complexity", aliases: ["nurse visit", "medication check"] },
  { code: "99212", description: "Office visit, established patient — straightforward complexity" },
  { code: "99213", description: "Office visit, established patient — low complexity", aliases: ["follow up", "established"] },
  { code: "99214", description: "Office visit, established patient — moderate complexity", aliases: ["established moderate"] },
  { code: "99215", description: "Office visit, established patient — high complexity" },

  // ── Preventive Medicine ────────────────────────────────────────────────
  { code: "99385", description: "Preventive medicine, new patient — age 18–39", aliases: ["annual wellness", "preventive new", "physical new"] },
  { code: "99386", description: "Preventive medicine, new patient — age 40–64", aliases: ["annual new 40s"] },
  { code: "99387", description: "Preventive medicine, new patient — age 65+", aliases: ["annual new senior"] },
  { code: "99395", description: "Preventive medicine, established patient — age 18–39", aliases: ["annual established", "annual physical", "yearly physical"] },
  { code: "99396", description: "Preventive medicine, established patient — age 40–64", aliases: ["annual 40s", "annual exam"] },
  { code: "99397", description: "Preventive medicine, established patient — age 65+", aliases: ["annual senior"] },
  { code: "99401", description: "Preventive counseling — approx. 15 min", aliases: ["counseling 15"] },
  { code: "99402", description: "Preventive counseling — approx. 30 min", aliases: ["counseling 30"] },
  { code: "G0438", description: "Annual Wellness Visit (AWV), initial", aliases: ["AWV initial", "medicare wellness"] },
  { code: "G0439", description: "Annual Wellness Visit (AWV), subsequent", aliases: ["AWV subsequent", "medicare annual"] },
  { code: "G0444", description: "Annual depression screening", aliases: ["PHQ-9 screening", "depression screen"] },
  { code: "G0446", description: "Annual intensive behavioral counseling — cardiovascular disease", aliases: ["cardiac counseling annual"] },
  { code: "G0447", description: "Behavioral counseling — obesity, 15 min", aliases: ["obesity counseling", "weight counseling"] },

  // ── Hormones & Endocrine Procedures ────────────────────────────────────
  { code: "96372", description: "Therapeutic injection, subcutaneous or intramuscular", aliases: ["IM injection", "SubQ injection", "testosterone injection", "hormone injection"] },
  { code: "11980", description: "Subcutaneous hormone pellet implantation", aliases: ["pellet implant", "hormone pellet", "BioTE", "testosterone pellet"] },
  { code: "11981", description: "Insertion, non-biodegradable drug delivery implant", aliases: ["implant insertion", "Nexplanon"] },
  { code: "11982", description: "Removal, non-biodegradable drug delivery implant", aliases: ["implant removal"] },
  { code: "11983", description: "Removal with reinsertion, non-biodegradable drug delivery implant", aliases: ["implant exchange"] },
  { code: "90471", description: "Immunization administration, first vaccine", aliases: ["vaccine admin"] },
  { code: "90472", description: "Immunization administration, each additional vaccine" },

  // ── Laboratory — Panels ────────────────────────────────────────────────
  { code: "80048", description: "Basic Metabolic Panel (BMP)", aliases: ["BMP", "basic metabolic"] },
  { code: "80053", description: "Comprehensive Metabolic Panel (CMP)", aliases: ["CMP", "comprehensive metabolic"] },
  { code: "80061", description: "Lipid panel", aliases: ["cholesterol panel", "lipids", "lipid profile"] },
  { code: "80076", description: "Hepatic function panel", aliases: ["liver panel", "LFTs", "liver function"] },

  // ── Laboratory — Individual Analytes (Hormone/Metabolic) ───────────────
  { code: "83036", description: "Hemoglobin A1c (HbA1c)", aliases: ["HbA1c", "A1c", "glycated hemoglobin"] },
  { code: "83525", description: "Insulin, total", aliases: ["insulin level", "fasting insulin"] },
  { code: "83527", description: "Insulin, free", aliases: ["free insulin"] },
  { code: "84403", description: "Testosterone, total", aliases: ["total testosterone", "testosterone total"] },
  { code: "84402", description: "Testosterone, free (direct)", aliases: ["free testosterone", "testosterone free"] },
  { code: "84270", description: "Sex hormone binding globulin (SHBG)", aliases: ["SHBG"] },
  { code: "82670", description: "Estradiol (E2)", aliases: ["estradiol", "estrogen E2", "E2"] },
  { code: "82671", description: "Estrogens, fractionated", aliases: ["fractionated estrogens"] },
  { code: "84144", description: "Progesterone", aliases: ["progesterone level"] },
  { code: "83001", description: "Luteinizing Hormone (LH)", aliases: ["LH", "luteinizing hormone"] },
  { code: "83002", description: "Follicle Stimulating Hormone (FSH)", aliases: ["FSH", "follicle stimulating"] },
  { code: "83519", description: "Immunoassay for analyte, non-antibody (DHEA-S)", aliases: ["DHEA-S", "DHEAS", "dehydroepiandrosterone"] },
  { code: "84430", description: "Cortisol, total", aliases: ["cortisol", "morning cortisol"] },
  { code: "82533", description: "Cortisol, free", aliases: ["free cortisol", "urine cortisol"] },
  { code: "83003", description: "Growth hormone (GH)", aliases: ["growth hormone", "HGH", "IGF"] },
  { code: "84305", description: "Somatomedin (IGF-1)", aliases: ["IGF-1", "somatomedin C"] },
  { code: "84443", description: "Thyroid Stimulating Hormone (TSH)", aliases: ["TSH", "thyroid stimulating hormone"] },
  { code: "84439", description: "Thyroxine (T4), free", aliases: ["free T4", "fT4", "thyroxine free"] },
  { code: "84436", description: "Thyroxine (T4), total", aliases: ["total T4", "T4 total"] },
  { code: "84481", description: "Triiodothyronine (T3), free", aliases: ["free T3", "fT3"] },
  { code: "84480", description: "Triiodothyronine (T3), total", aliases: ["total T3"] },
  { code: "84482", description: "Triiodothyronine (T3), reverse (rT3)", aliases: ["reverse T3", "rT3"] },
  { code: "86376", description: "Thyroid peroxidase antibody (TPO Ab)", aliases: ["TPO antibody", "anti-TPO", "thyroid antibodies"] },
  { code: "86800", description: "Thyroglobulin antibody", aliases: ["anti-thyroglobulin", "TgAb"] },
  { code: "84153", description: "Prostate specific antigen (PSA), total", aliases: ["PSA", "prostate specific antigen"] },
  { code: "84154", description: "PSA, free", aliases: ["free PSA"] },
  { code: "82728", description: "Ferritin", aliases: ["ferritin level", "iron storage"] },
  { code: "82330", description: "Calcium, ionized", aliases: ["ionized calcium"] },
  { code: "82607", description: "Vitamin B12 (cobalamin)", aliases: ["B12", "vitamin B12", "cobalamin"] },
  { code: "82306", description: "Vitamin D, 25-hydroxy", aliases: ["vitamin D", "25-OH vitamin D", "25-hydroxyvitamin D"] },
  { code: "82180", description: "Ascorbic acid (Vitamin C)", aliases: ["vitamin C"] },
  { code: "84590", description: "Vitamin A", aliases: ["vitamin A", "retinol"] },
  { code: "86141", description: "C-reactive protein (hs-CRP), high sensitivity", aliases: ["hs-CRP", "high sensitivity CRP", "hsCRP"] },
  { code: "86140", description: "C-reactive protein (CRP)", aliases: ["CRP"] },
  { code: "84520", description: "Blood urea nitrogen (BUN)", aliases: ["BUN", "urea nitrogen"] },
  { code: "82947", description: "Glucose, fasting", aliases: ["fasting glucose", "blood sugar fasting"] },
  { code: "82962", description: "Glucose, blood — POC", aliases: ["fingerstick glucose", "POC glucose"] },
  { code: "84132", description: "Potassium, serum", aliases: ["potassium", "K+"] },
  { code: "84295", description: "Sodium, serum", aliases: ["sodium", "Na+"] },
  { code: "82565", description: "Creatinine, serum", aliases: ["creatinine", "kidney function"] },
  { code: "82042", description: "Albumin, urine (microalbumin)", aliases: ["microalbumin", "urine albumin"] },
  { code: "85025", description: "Complete blood count (CBC) with differential", aliases: ["CBC", "CBC with diff", "complete blood count"] },
  { code: "85027", description: "Complete blood count (CBC) without differential", aliases: ["CBC no diff"] },
  { code: "85610", description: "Prothrombin time (PT/INR)", aliases: ["PT", "INR", "prothrombin time"] },
  { code: "85730", description: "Partial thromboplastin time (PTT/aPTT)", aliases: ["PTT", "aPTT"] },

  // ── Imaging ────────────────────────────────────────────────────────────
  { code: "77057", description: "Screening mammography, bilateral", aliases: ["mammogram", "mammography screening", "breast screening"] },
  { code: "77065", description: "Diagnostic mammography, unilateral", aliases: ["diagnostic mammogram"] },
  { code: "77066", description: "Diagnostic mammography, bilateral" },
  { code: "76092", description: "Screening mammography, bilateral (digital)", aliases: ["digital mammogram"] },
  { code: "76536", description: "Ultrasound, soft tissue of head and neck", aliases: ["neck ultrasound", "thyroid ultrasound"] },
  { code: "76700", description: "Ultrasound, abdominal — complete", aliases: ["abdominal ultrasound", "abd US"] },
  { code: "76856", description: "Ultrasound, pelvic — complete (transabdominal)", aliases: ["pelvic ultrasound", "tranabdominal pelvic US"] },
  { code: "76857", description: "Ultrasound, pelvic — limited", aliases: ["limited pelvic US"] },
  { code: "76830", description: "Ultrasound, transvaginal", aliases: ["transvaginal ultrasound", "TVUS"] },
  { code: "72148", description: "MRI, lumbar spine without contrast", aliases: ["lumbar MRI", "low back MRI", "MRI lumbar spine"] },
  { code: "72141", description: "MRI, cervical spine without contrast", aliases: ["cervical MRI", "neck MRI"] },
  { code: "70553", description: "MRI, brain with and without contrast", aliases: ["brain MRI with contrast"] },
  { code: "70551", description: "MRI, brain without contrast", aliases: ["brain MRI"] },
  { code: "73221", description: "MRI, joint of upper extremity without contrast", aliases: ["shoulder MRI", "wrist MRI", "elbow MRI"] },
  { code: "73721", description: "MRI, joint of lower extremity without contrast", aliases: ["knee MRI", "hip MRI", "ankle MRI"] },
  { code: "74177", description: "CT, abdomen and pelvis with contrast", aliases: ["abdominal CT", "CT abdomen pelvis"] },
  { code: "71046", description: "X-ray, chest — 2 views", aliases: ["chest xray", "CXR"] },
  { code: "77080", description: "Bone density (DEXA), axial", aliases: ["DEXA", "bone density scan", "bone densitometry", "osteoporosis screening"] },
  { code: "77085", description: "Bone density (DEXA), axial with vertebral fracture assessment" },

  // ── Preventive Screenings & Procedures ────────────────────────────────
  { code: "45378", description: "Colonoscopy, diagnostic", aliases: ["colonoscopy", "colon cancer screening"] },
  { code: "45380", description: "Colonoscopy with biopsy" },
  { code: "88175", description: "Pap smear — liquid based", aliases: ["Pap smear", "pap test", "cervical cytology"] },
  { code: "87624", description: "HPV high-risk types — molecular detection", aliases: ["HPV test", "HPV screening", "co-testing"] },
  { code: "93000", description: "Electrocardiogram (ECG/EKG)", aliases: ["EKG", "ECG", "electrocardiogram"] },
  { code: "93015", description: "Cardiovascular stress test", aliases: ["stress test", "treadmill test", "exercise stress test"] },
  { code: "93880", description: "Carotid ultrasound, bilateral", aliases: ["carotid ultrasound", "carotid duplex"] },
  { code: "99213", description: "Office visit, established — low complexity" },

  // ── Minor Procedures ───────────────────────────────────────────────────
  { code: "20610", description: "Aspiration / injection, major joint (knee, shoulder, hip)", aliases: ["joint injection", "cortisone injection", "knee injection"] },
  { code: "20600", description: "Aspiration / injection, small joint", aliases: ["small joint injection"] },
  { code: "11900", description: "Intralesional injection, up to 7 lesions", aliases: ["intralesional injection"] },
  { code: "36415", description: "Venipuncture for lab draw", aliases: ["blood draw", "phlebotomy"] },
  { code: "81003", description: "Urinalysis with microscopy", aliases: ["UA", "urinalysis", "urine analysis"] },
  { code: "81025", description: "Urine pregnancy test", aliases: ["urine pregnancy", "UPT", "pregnancy test"] },
];

export function searchCPT(query: string, limit = 15): CPTCode[] {
  if (!query || query.trim().length < 1) {
    return CPT_CODES.slice(0, limit);
  }
  const q = query.trim().toLowerCase();
  const scored: { code: CPTCode; score: number }[] = [];

  for (const c of CPT_CODES) {
    const descL = c.description.toLowerCase();
    const aliasStr = (c.aliases ?? []).join(" ").toLowerCase();
    let score = 0;

    if (c.code.toLowerCase() === q) score = 120;
    else if (c.code.toLowerCase().startsWith(q)) score = 100;
    else if (descL.startsWith(q)) score = 90;
    else if ((c.aliases ?? []).some(a => a.toLowerCase() === q)) score = 88;
    else if (descL.includes(q)) score = 70;
    else if (aliasStr.includes(q)) score = 60;
    else {
      const terms = q.split(/\s+/).filter(Boolean);
      if (terms.length > 1 && terms.every(t => (descL + " " + aliasStr).includes(t))) score = 50;
    }

    if (score > 0) scored.push({ code: c, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.code);
}
