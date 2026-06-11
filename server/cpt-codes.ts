export interface CPTCode {
  code: string;
  description: string;
  aliases?: string[];
}

export const CPT_CODES: CPTCode[] = [
  // ── Evaluation & Management — Office / Outpatient ─────────────────────
  { code: "99202", description: "Office visit, new patient — straightforward complexity", aliases: ["new patient visit", "office visit new", "new patient office"] },
  { code: "99203", description: "Office visit, new patient — low complexity", aliases: ["new patient low"] },
  { code: "99204", description: "Office visit, new patient — moderate complexity", aliases: ["new patient moderate"] },
  { code: "99205", description: "Office visit, new patient — high complexity", aliases: ["new patient high"] },
  { code: "99211", description: "Office visit, established patient — minimal complexity", aliases: ["nurse visit", "medication check", "minimal visit"] },
  { code: "99212", description: "Office visit, established patient — straightforward complexity", aliases: ["established straightforward"] },
  { code: "99213", description: "Office visit, established patient — low complexity", aliases: ["follow up", "established low", "established visit"] },
  { code: "99214", description: "Office visit, established patient — moderate complexity", aliases: ["established moderate", "follow up moderate"] },
  { code: "99215", description: "Office visit, established patient — high complexity", aliases: ["established high"] },

  // ── Preventive Medicine ───────────────────────────────────────────────
  { code: "99385", description: "Preventive medicine, new patient — age 18–39", aliases: ["annual wellness new", "preventive new", "physical new", "annual new"] },
  { code: "99386", description: "Preventive medicine, new patient — age 40–64", aliases: ["annual new 40s", "preventive new 40"] },
  { code: "99387", description: "Preventive medicine, new patient — age 65+", aliases: ["annual new senior", "preventive new senior"] },
  { code: "99391", description: "Preventive medicine, established patient — infant (under age 1)", aliases: ["infant well child", "well baby"] },
  { code: "99392", description: "Preventive medicine, established patient — age 1–4", aliases: ["well child 1-4"] },
  { code: "99393", description: "Preventive medicine, established patient — age 5–11", aliases: ["well child 5-11"] },
  { code: "99394", description: "Preventive medicine, established patient — age 12–17", aliases: ["adolescent physical", "teen physical"] },
  { code: "99395", description: "Preventive medicine, established patient — age 18–39", aliases: ["annual physical", "annual established", "yearly physical", "wellness visit"] },
  { code: "99396", description: "Preventive medicine, established patient — age 40–64", aliases: ["annual exam", "annual 40s", "annual established 40"] },
  { code: "99397", description: "Preventive medicine, established patient — age 65+", aliases: ["annual senior", "annual elderly"] },
  { code: "99401", description: "Preventive counseling — approximately 15 min", aliases: ["counseling 15", "preventive counseling"] },
  { code: "99402", description: "Preventive counseling — approximately 30 min", aliases: ["counseling 30"] },
  { code: "99403", description: "Preventive counseling — approximately 45 min", aliases: ["counseling 45"] },
  { code: "99404", description: "Preventive counseling — approximately 60 min", aliases: ["counseling 60"] },
  { code: "G0438", description: "Annual Wellness Visit (AWV), initial", aliases: ["AWV initial", "medicare wellness initial", "medicare annual initial"] },
  { code: "G0439", description: "Annual Wellness Visit (AWV), subsequent", aliases: ["AWV subsequent", "medicare wellness", "medicare annual"] },
  { code: "G0444", description: "Annual depression screening (PHQ-9)", aliases: ["PHQ-9 screening", "depression screen", "depression screening"] },
  { code: "G0446", description: "Annual alcohol misuse screening (AUDIT-C)", aliases: ["alcohol screening", "AUDIT", "alcohol misuse"] },
  { code: "G0447", description: "Obesity counseling — 15 min face-to-face", aliases: ["obesity counseling", "weight counseling"] },
  { code: "G0442", description: "Annual alcohol misuse screening", aliases: ["alcohol screen annual"] },
  { code: "G0445", description: "High-intensity behavioral counseling to prevent STIs", aliases: ["STI counseling", "STD counseling"] },

  // ── Telehealth / E-Visit ──────────────────────────────────────────────
  { code: "99421", description: "Online digital E/M — 5–10 min", aliases: ["telehealth 5", "portal message", "e-visit"] },
  { code: "99422", description: "Online digital E/M — 11–20 min", aliases: ["telehealth 15", "video visit short"] },
  { code: "99423", description: "Online digital E/M — 21+ min", aliases: ["telehealth long", "video visit"] },
  { code: "99441", description: "Telephone E/M — 5–10 min", aliases: ["phone visit 5", "telephone visit"] },
  { code: "99442", description: "Telephone E/M — 11–20 min", aliases: ["phone visit 15"] },
  { code: "99443", description: "Telephone E/M — 21–30 min", aliases: ["phone visit 30"] },

  // ── Chronic Care / Care Management ───────────────────────────────────
  { code: "99490", description: "Chronic care management (CCM) — first 20 min", aliases: ["CCM", "chronic care management", "care coordination"] },
  { code: "99439", description: "Chronic care management — additional 20 min", aliases: ["CCM additional"] },
  { code: "99487", description: "Complex chronic care management — first 60 min", aliases: ["complex CCM", "complex care management"] },
  { code: "99484", description: "Care management for behavioral health — 20 min", aliases: ["behavioral health management"] },

  // ── Laboratory — Hormones ─────────────────────────────────────────────
  { code: "84402", description: "Testosterone, total", aliases: ["testosterone total", "total testosterone", "T level"] },
  { code: "84403", description: "Testosterone, free", aliases: ["free testosterone", "free T"] },
  { code: "84270", description: "Sex hormone binding globulin (SHBG)", aliases: ["SHBG", "sex hormone binding globulin"] },
  { code: "84481", description: "Triiodothyronine (T3), free", aliases: ["free T3", "FT3", "T3 free"] },
  { code: "84480", description: "T3, total", aliases: ["total T3", "T3 total"] },
  { code: "84439", description: "Thyroxine (T4), free", aliases: ["free T4", "FT4", "T4 free", "thyroxine free"] },
  { code: "84436", description: "Thyroxine (T4), total", aliases: ["total T4", "T4 total"] },
  { code: "84443", description: "Thyroid stimulating hormone (TSH)", aliases: ["TSH", "thyroid stimulating hormone", "thyroid panel"] },
  { code: "84445", description: "Thyroid binding globulin (TBG)", aliases: ["TBG", "thyroid binding globulin"] },
  { code: "86800", description: "Thyroid antibody (anti-thyroglobulin)", aliases: ["thyroglobulin antibody", "anti-TG", "TG antibody"] },
  { code: "86376", description: "Thyroid peroxidase antibody (anti-TPO)", aliases: ["anti-TPO", "TPO antibody", "microsomal antibody", "thyroid peroxidase"] },
  { code: "84443", description: "TSH with reflex T4", aliases: ["TSH reflex", "thyroid panel full"] },
  { code: "84146", description: "Prolactin", aliases: ["prolactin level", "PRL"] },
  { code: "84144", description: "Progesterone", aliases: ["progesterone level", "serum progesterone"] },
  { code: "82670", description: "Estradiol (E2)", aliases: ["estradiol", "E2", "estrogen", "estradiol E2"] },
  { code: "82671", description: "Estrogens, fractionated (E1, E2, E3)", aliases: ["estrogen fractionated", "estrogens panel"] },
  { code: "83002", description: "Follicle stimulating hormone (FSH)", aliases: ["FSH", "follicle stimulating hormone"] },
  { code: "83003", description: "Luteinizing hormone (LH)", aliases: ["LH", "luteinizing hormone"] },
  { code: "83519", description: "Immunoassay analyte (non-antibody), quantitative — e.g. free hormones", aliases: ["immunoassay quantitative"] },
  { code: "82679", description: "Estriol (E3)", aliases: ["estriol", "E3"] },
  { code: "82652", description: "Vitamin D, 1,25-dihydroxy (calcitriol)", aliases: ["calcitriol", "1,25 vitamin D", "active vitamin D"] },
  { code: "82306", description: "Vitamin D, 25-hydroxy (calcidiol)", aliases: ["vitamin D", "25-OH vitamin D", "25 hydroxy vitamin D", "vitamin D level"] },
  { code: "82384", description: "Catecholamines, plasma (epinephrine, norepinephrine)", aliases: ["catecholamines", "plasma catecholamines"] },
  { code: "82383", description: "Catecholamines, urine", aliases: ["urine catecholamines"] },
  { code: "82088", description: "Aldosterone", aliases: ["aldosterone level"] },
  { code: "82530", description: "Cortisol, free, urine", aliases: ["urine cortisol", "free cortisol urine", "24 hour cortisol"] },
  { code: "82533", description: "Cortisol, total", aliases: ["cortisol", "serum cortisol", "cortisol total"] },
  { code: "82627", description: "Dehydroepiandrosterone sulfate (DHEA-S)", aliases: ["DHEA-S", "DHEAS", "DHEA sulfate", "dehydroepiandrosterone"] },
  { code: "82626", description: "Dehydroepiandrosterone (DHEA)", aliases: ["DHEA", "dehydroepiandrosterone free"] },
  { code: "83519", description: "Dihydrotestosterone (DHT)", aliases: ["DHT", "dihydrotestosterone"] },
  { code: "84305", description: "Somatomedin C (IGF-1)", aliases: ["IGF-1", "insulin-like growth factor", "somatomedin C", "growth hormone marker"] },
  { code: "82941", description: "Gastrin", aliases: ["gastrin level"] },
  { code: "83930", description: "Melatonin", aliases: ["melatonin level"] },
  { code: "84410", description: "Testosterone, bioavailable", aliases: ["bioavailable testosterone", "bio-available T"] },

  // ── Laboratory — Metabolic / CMP / BMP ───────────────────────────────
  { code: "80048", description: "Basic metabolic panel (BMP)", aliases: ["BMP", "basic metabolic panel", "basic metabolic"] },
  { code: "80053", description: "Comprehensive metabolic panel (CMP)", aliases: ["CMP", "comprehensive metabolic panel", "metabolic panel"] },
  { code: "82040", description: "Albumin, serum", aliases: ["albumin", "serum albumin"] },
  { code: "82042", description: "Albumin, urine (microalbumin)", aliases: ["microalbumin", "urine albumin", "ACR urine"] },
  { code: "82043", description: "Microalbumin/creatinine ratio (urine)", aliases: ["microalbumin creatinine ratio", "uACR", "urine microalbumin ratio"] },
  { code: "82550", description: "Creatine kinase (CK/CPK), total", aliases: ["CK", "CPK", "creatine kinase"] },
  { code: "82553", description: "Creatine kinase (CK-MB)", aliases: ["CK-MB", "cardiac CK"] },
  { code: "82565", description: "Creatinine, serum", aliases: ["creatinine", "serum creatinine"] },
  { code: "82570", description: "Creatinine, urine", aliases: ["urine creatinine"] },
  { code: "82945", description: "Glucose, body fluid", aliases: ["glucose", "blood glucose", "blood sugar"] },
  { code: "82947", description: "Glucose, quantitative", aliases: ["fasting glucose", "glucose fasting"] },
  { code: "83036", description: "Hemoglobin A1c (HbA1c)", aliases: ["HbA1c", "A1c", "glycated hemoglobin", "hemoglobin A1c", "glycosylated hemoglobin"] },
  { code: "84295", description: "Sodium", aliases: ["sodium level", "serum sodium", "Na"] },
  { code: "84132", description: "Potassium", aliases: ["potassium level", "serum potassium", "K"] },
  { code: "82374", description: "Carbon dioxide (CO2/bicarbonate)", aliases: ["CO2", "bicarbonate", "bicarb"] },
  { code: "82435", description: "Chloride", aliases: ["chloride level", "serum chloride", "Cl"] },
  { code: "84520", description: "BUN (blood urea nitrogen)", aliases: ["BUN", "blood urea nitrogen", "urea nitrogen"] },
  { code: "84075", description: "Alkaline phosphatase (ALP)", aliases: ["ALP", "alkaline phosphatase", "alk phos"] },
  { code: "84460", description: "Alanine aminotransferase (ALT/SGPT)", aliases: ["ALT", "SGPT", "liver enzymes", "alanine aminotransferase"] },
  { code: "84450", description: "Aspartate aminotransferase (AST/SGOT)", aliases: ["AST", "SGOT", "aspartate aminotransferase"] },
  { code: "82247", description: "Bilirubin, total", aliases: ["bilirubin total", "total bilirubin", "bili"] },
  { code: "82248", description: "Bilirubin, direct", aliases: ["bilirubin direct", "direct bilirubin"] },
  { code: "86140", description: "C-reactive protein (CRP)", aliases: ["CRP", "C-reactive protein", "inflammation marker"] },
  { code: "86141", description: "C-reactive protein, high sensitivity (hs-CRP)", aliases: ["hs-CRP", "high sensitivity CRP", "hsCRP", "cardiac CRP"] },
  { code: "82728", description: "Ferritin", aliases: ["ferritin level", "serum ferritin"] },
  { code: "83540", description: "Iron, serum", aliases: ["iron", "serum iron", "Fe"] },
  { code: "83550", description: "Iron binding capacity (TIBC)", aliases: ["TIBC", "iron binding capacity", "transferrin"] },
  { code: "84999", description: "Transferrin saturation", aliases: ["transferrin saturation", "iron saturation"] },
  { code: "82378", description: "Carcinoembryonic antigen (CEA)", aliases: ["CEA", "carcinoembryonic antigen"] },
  { code: "83500", description: "Lactate dehydrogenase (LDH)", aliases: ["LDH", "lactate dehydrogenase"] },
  { code: "83519", description: "Uric acid, serum", aliases: ["uric acid", "gout", "serum uric acid"] },
  { code: "84100", description: "Phosphorus (inorganic), serum", aliases: ["phosphorus", "phosphate", "serum phosphorus"] },
  { code: "82310", description: "Calcium, serum", aliases: ["calcium", "serum calcium", "Ca"] },
  { code: "82330", description: "Calcium, ionized", aliases: ["ionized calcium", "iCa"] },
  { code: "83615", description: "Lactate dehydrogenase isoenzymes", aliases: ["LDH isoenzymes"] },
  { code: "82803", description: "Gases, blood pH (ABG)", aliases: ["ABG", "arterial blood gas", "blood gas"] },
  { code: "82962", description: "Glucose, quantitative — whole blood self-monitoring", aliases: ["glucose monitoring", "glucose self test"] },

  // ── Laboratory — Lipids & Cardio ──────────────────────────────────────
  { code: "80061", description: "Lipid panel (cholesterol, HDL, triglycerides, LDL)", aliases: ["lipid panel", "cholesterol panel", "lipids"] },
  { code: "82465", description: "Cholesterol, total", aliases: ["total cholesterol", "cholesterol"] },
  { code: "83718", description: "HDL cholesterol", aliases: ["HDL", "good cholesterol", "high density lipoprotein"] },
  { code: "84478", description: "Triglycerides", aliases: ["triglycerides", "TG", "trigs"] },
  { code: "83721", description: "LDL cholesterol (direct)", aliases: ["LDL", "bad cholesterol", "low density lipoprotein"] },
  { code: "83695", description: "Lipoprotein(a) — Lp(a)", aliases: ["Lp(a)", "lipoprotein a", "lp little a"] },
  { code: "83700", description: "Lipoprotein, blood, high resolution fractionation (LDL particle size)", aliases: ["LDL particle size", "LDL fractionation", "NMR lipoproteins", "advanced lipid"] },
  { code: "83701", description: "Lipoprotein, blood, high resolution fractionation and quantitation", aliases: ["lipoprotein fractionation", "advanced lipid panel", "VAP test"] },
  { code: "83704", description: "LDL particle number (NMR)", aliases: ["LDL-P", "LDL particle number", "NMR LDL"] },
  { code: "82172", description: "Apolipoprotein A-I", aliases: ["ApoA1", "apolipoprotein A1"] },
  { code: "82174", description: "Apolipoprotein B", aliases: ["ApoB", "apolipoprotein B", "apo B"] },
  { code: "84681", description: "C-peptide", aliases: ["C-peptide", "insulin C-peptide"] },
  { code: "83525", description: "Insulin, serum", aliases: ["insulin level", "serum insulin", "fasting insulin"] },
  { code: "84703", description: "Gonadotropin, chorionic (hCG)", aliases: ["hCG", "pregnancy test serum", "beta hCG", "beta HCG"] },
  { code: "86431", description: "Rheumatoid factor (RF)", aliases: ["rheumatoid factor", "RF", "RA factor"] },
  { code: "86200", description: "CCP antibody (anti-cyclic citrullinated peptide)", aliases: ["anti-CCP", "CCP antibody", "RA marker"] },
  { code: "83519", description: "Homocysteine", aliases: ["homocysteine", "cardiovascular risk homocysteine"] },
  { code: "82607", description: "Cobalamin (Vitamin B12)", aliases: ["B12", "vitamin B12", "cobalamin"] },
  { code: "82746", description: "Folic acid (folate), serum", aliases: ["folate", "folic acid", "vitamin B9"] },
  { code: "82747", description: "Folic acid (folate), RBC", aliases: ["RBC folate", "red cell folate"] },
  { code: "82180", description: "Ascorbic acid (Vitamin C)", aliases: ["vitamin C", "ascorbic acid"] },
  { code: "84591", description: "Vitamin, NOS", aliases: ["vitamin level"] },
  { code: "82172", description: "Apolipoprotein E genotype", aliases: ["ApoE genotype", "APOE4", "apolipoprotein E gene"] },

  // ── Laboratory — CBC & Hematology ─────────────────────────────────────
  { code: "85025", description: "Complete blood count (CBC) with differential", aliases: ["CBC", "CBC with diff", "complete blood count", "blood count"] },
  { code: "85027", description: "Complete blood count (CBC) without differential", aliases: ["CBC no diff", "CBC without diff"] },
  { code: "85007", description: "Blood smear with manual differential", aliases: ["blood smear", "manual diff"] },
  { code: "85045", description: "Reticulocyte count", aliases: ["reticulocytes", "retic count"] },
  { code: "85610", description: "Prothrombin time (PT/INR)", aliases: ["PT", "INR", "prothrombin time", "coagulation"] },
  { code: "85730", description: "Partial thromboplastin time (PTT/aPTT)", aliases: ["PTT", "aPTT", "activated PTT"] },
  { code: "85379", description: "D-dimer", aliases: ["D-dimer", "fibrin degradation", "clot marker"] },
  { code: "85576", description: "Platelet aggregation study", aliases: ["platelet function", "platelet aggregation"] },
  { code: "85598", description: "Phospholipid antibody (antiphospholipid)", aliases: ["antiphospholipid", "lupus anticoagulant"] },
  { code: "86235", description: "Antinuclear antibody (ANA)", aliases: ["ANA", "antinuclear antibody", "autoimmune screen"] },
  { code: "86038", description: "Antinuclear antibody (ANA), HEp-2", aliases: ["ANA HEp-2", "ANA pattern"] },
  { code: "86060", description: "Antistreptolysin O (ASO)", aliases: ["ASO", "antistreptolysin", "strep antibody"] },
  { code: "86592", description: "Syphilis test (RPR)", aliases: ["RPR", "syphilis test", "rapid plasma reagin"] },
  { code: "86780", description: "Treponema pallidum antibody (FTA-ABS)", aliases: ["FTA-ABS", "syphilis confirmation", "treponemal antibody"] },

  // ── Laboratory — Metabolic Syndrome / Insulin Resistance ─────────────
  { code: "82945", description: "Glucose tolerance test (GTT) — fasting", aliases: ["GTT", "glucose tolerance", "oral glucose tolerance", "OGTT"] },
  { code: "82950", description: "Glucose; post-glucose dose", aliases: ["glucose post meal", "post prandial glucose", "2-hour glucose"] },
  { code: "82951", description: "Glucose tolerance panel (3 specimens)", aliases: ["glucose tolerance panel", "3 hour GTT"] },
  { code: "84999", description: "HOMA-IR (insulin resistance index)", aliases: ["HOMA-IR", "insulin resistance", "HOMA"] },

  // ── Laboratory — Renal ────────────────────────────────────────────────
  { code: "81001", description: "Urinalysis with microscopy (automated)", aliases: ["UA", "urinalysis", "urine analysis", "urine dipstick microscopy"] },
  { code: "81003", description: "Urinalysis, automated without microscopy", aliases: ["UA no micro", "urine dipstick"] },
  { code: "81025", description: "Urine pregnancy test (qualitative)", aliases: ["urine pregnancy", "UPT", "pregnancy test urine"] },
  { code: "81007", description: "Urinalysis, bacteriuria screen (non-automated)", aliases: ["urine bacteria", "bacteriuria"] },
  { code: "87086", description: "Urine culture, bacterial", aliases: ["urine culture", "UCx", "UTI culture", "clean catch culture"] },
  { code: "82570", description: "Creatinine, urine", aliases: ["urine creatinine"] },
  { code: "84560", description: "Urea nitrogen, urine (UUN)", aliases: ["urine urea nitrogen", "UUN"] },
  { code: "81050", description: "24-hour urine collection (volume)", aliases: ["24 hour urine", "24h urine"] },

  // ── Laboratory — Infectious Disease / STI ────────────────────────────
  { code: "87491", description: "Chlamydia trachomatis, NAAT", aliases: ["chlamydia", "chlamydia NAAT", "chlamydia test"] },
  { code: "87591", description: "Neisseria gonorrhoeae, NAAT", aliases: ["gonorrhea", "gonorrhoeae NAAT", "GC test"] },
  { code: "87801", description: "Chlamydia and gonorrhea NAAT, combined", aliases: ["chlamydia gonorrhea panel", "GC chlamydia combined"] },
  { code: "86703", description: "HIV-1/HIV-2, combination test (4th gen)", aliases: ["HIV test", "HIV screen", "HIV 4th generation"] },
  { code: "86701", description: "HIV-1 antibody", aliases: ["HIV-1 antibody"] },
  { code: "87390", description: "HIV-1 antigen detection", aliases: ["HIV p24 antigen", "HIV antigen"] },
  { code: "87340", description: "Hepatitis B surface antigen (HBsAg)", aliases: ["HBsAg", "hepatitis B surface antigen", "hep B surface antigen"] },
  { code: "86706", description: "Hepatitis B surface antibody (HBsAb)", aliases: ["HBsAb", "hepatitis B surface antibody", "hep B immunity"] },
  { code: "86704", description: "Hepatitis B core antibody, total (HBcAb)", aliases: ["HBcAb", "hepatitis B core antibody", "hep B core"] },
  { code: "86705", description: "Hepatitis B core antibody, IgM (acute)", aliases: ["HBcAb IgM", "acute hepatitis B"] },
  { code: "87522", description: "Hepatitis C virus, RNA (HCV RNA), quantitative", aliases: ["HCV RNA", "hepatitis C viral load", "hep C quantitative"] },
  { code: "86803", description: "Hepatitis C antibody (HCVAb)", aliases: ["HCV antibody", "hepatitis C screen", "hep C antibody"] },
  { code: "86804", description: "Hepatitis C antibody, confirmatory (RIBA)", aliases: ["HCV confirmation"] },
  { code: "87507", description: "Infectious agent genotyping, NOS", aliases: ["genotyping"] },
  { code: "86294", description: "Herpes simplex virus, IgM (HSV)", aliases: ["HSV IgM", "herpes IgM"] },
  { code: "86695", description: "Herpes simplex virus type 1 antibody (HSV-1)", aliases: ["HSV-1 antibody", "herpes 1"] },
  { code: "86696", description: "Herpes simplex virus type 2 antibody (HSV-2)", aliases: ["HSV-2 antibody", "herpes 2", "genital herpes antibody"] },
  { code: "87389", description: "HIV-1 antigen and HIV-1/2 antibodies, combo", aliases: ["HIV combo test", "HIV antigen antibody"] },
  { code: "86747", description: "Parvovirus B19 antibody, IgG", aliases: ["parvovirus B19", "fifth disease"] },
  { code: "86762", description: "Rubella antibody, IgG (titer)", aliases: ["rubella immunity", "rubella titer"] },
  { code: "86765", description: "Rubeola (measles) antibody, IgG", aliases: ["measles immunity", "measles antibody"] },
  { code: "86787", description: "Varicella-zoster (chickenpox) antibody, IgG", aliases: ["VZV antibody", "varicella immunity", "chickenpox immunity"] },

  // ── Laboratory — Autoimmune / Rheumatology ────────────────────────────
  { code: "86235", description: "Antinuclear antibody (ANA), titer", aliases: ["ANA titer", "lupus screen", "autoimmune titer"] },
  { code: "86255", description: "Antinuclear antibody, titer (HEp-2)", aliases: ["ANA HEp2"] },
  { code: "86200", description: "Anti-CCP antibody", aliases: ["anti-CCP", "CCP", "cyclic citrullinated peptide"] },
  { code: "86431", description: "Rheumatoid factor (RF)", aliases: ["RF", "rheumatoid factor", "RA test"] },
  { code: "86039", description: "Antinuclear antibody (ANA), screen", aliases: ["ANA screen"] },
  { code: "86364", description: "Platelet antibody", aliases: ["platelet antibody", "ITP workup"] },
  { code: "86160", description: "Complement, C3", aliases: ["C3 complement", "complement C3"] },
  { code: "86161", description: "Complement, C4", aliases: ["C4 complement", "complement C4"] },
  { code: "86162", description: "Complement, total (CH50)", aliases: ["CH50", "total complement"] },
  { code: "86376", description: "Anti-thyroid peroxidase antibody (anti-TPO)", aliases: ["anti-TPO", "TPO antibody", "thyroid peroxidase antibody", "hashimoto marker"] },
  { code: "86800", description: "Thyroglobulin antibody (anti-TG)", aliases: ["thyroglobulin antibody", "anti-TG", "TG antibody"] },
  { code: "86585", description: "Tuberculin skin test (TST) — reading only", aliases: ["TB test read", "PPD reading", "tuberculin reading"] },

  // ── Laboratory — Tumor Markers ────────────────────────────────────────
  { code: "86316", description: "Cancer antigen 125 (CA-125)", aliases: ["CA-125", "ovarian cancer marker", "CA125"] },
  { code: "86300", description: "Cancer antigen 15-3 (CA 15-3)", aliases: ["CA 15-3", "breast cancer marker", "CA153"] },
  { code: "86301", description: "Cancer antigen 19-9 (CA 19-9)", aliases: ["CA 19-9", "pancreatic cancer marker", "CA199"] },
  { code: "84153", description: "PSA (prostate-specific antigen), total", aliases: ["PSA", "prostate cancer screen", "prostate specific antigen"] },
  { code: "84154", description: "PSA, free", aliases: ["free PSA", "PSA free"] },
  { code: "82378", description: "CEA (carcinoembryonic antigen)", aliases: ["CEA", "carcinoembryonic antigen", "colon cancer marker"] },
  { code: "86316", description: "Alpha-fetoprotein (AFP)", aliases: ["AFP", "alpha fetoprotein", "liver tumor marker"] },
  { code: "86277", description: "Growth hormone, antibody", aliases: ["growth hormone antibody"] },

  // ── Laboratory — Genetics / Pharmacogenomics ──────────────────────────
  { code: "81401", description: "Molecular pathology — Tier 2 (e.g. single gene)", aliases: ["genetic testing tier 2", "molecular pathology"] },
  { code: "81479", description: "Unlisted molecular pathology procedure", aliases: ["genetic test NOS", "unlisted genetic"] },
  { code: "81346", description: "TPMT gene analysis (thiopurine metabolism)", aliases: ["TPMT", "thiopurine", "pharmacogenomics"] },
  { code: "81325", description: "PTEN gene analysis", aliases: ["PTEN gene"] },
  { code: "81551", description: "Oncology prostate, gene expression", aliases: ["Prolaris", "oncotype prostate"] },

  // ── Imaging — Mammography ─────────────────────────────────────────────
  { code: "77067", description: "Screening mammography, bilateral (2-view)", aliases: ["screening mammogram", "mammogram bilateral", "mammography screening", "breast screening", "annual mammogram"] },
  { code: "77063", description: "Screening digital breast tomosynthesis (3D mammogram), bilateral", aliases: ["3D mammogram", "tomosynthesis", "DBT", "3D breast imaging"] },
  { code: "77065", description: "Diagnostic mammography, unilateral", aliases: ["diagnostic mammogram unilateral", "one-sided mammogram"] },
  { code: "77066", description: "Diagnostic mammography, bilateral", aliases: ["diagnostic mammogram bilateral", "diagnostic mammography"] },
  { code: "77061", description: "Digital breast tomosynthesis, unilateral", aliases: ["3D mammogram unilateral"] },
  { code: "77062", description: "Digital breast tomosynthesis, bilateral", aliases: ["3D mammogram bilateral"] },

  // ── Imaging — Breast ──────────────────────────────────────────────────
  { code: "76641", description: "Breast ultrasound, complete", aliases: ["breast ultrasound", "breast US complete"] },
  { code: "76642", description: "Breast ultrasound, limited", aliases: ["breast ultrasound limited", "breast US limited"] },
  { code: "77046", description: "MRI, breast — unilateral without contrast", aliases: ["breast MRI unilateral", "breast MRI without contrast"] },
  { code: "77047", description: "MRI, breast — bilateral without contrast", aliases: ["breast MRI bilateral", "bilateral breast MRI"] },
  { code: "77048", description: "MRI, breast — unilateral with and without contrast", aliases: ["breast MRI with contrast"] },
  { code: "77049", description: "MRI, breast — bilateral with and without contrast", aliases: ["bilateral breast MRI with contrast"] },
  { code: "19081", description: "Breast biopsy, ultrasound-guided", aliases: ["breast biopsy US", "ultrasound breast biopsy"] },
  { code: "19083", description: "Breast biopsy, stereotactic guidance", aliases: ["stereotactic breast biopsy"] },
  { code: "19085", description: "Breast biopsy, MRI-guided", aliases: ["MRI breast biopsy"] },

  // ── Imaging — Ultrasound ──────────────────────────────────────────────
  { code: "76536", description: "Ultrasound, soft tissue of head and neck (thyroid)", aliases: ["thyroid ultrasound", "neck ultrasound", "thyroid US"] },
  { code: "76700", description: "Ultrasound, abdominal — complete", aliases: ["abdominal ultrasound", "abd US", "abdominal US complete"] },
  { code: "76705", description: "Ultrasound, abdominal — limited or single organ", aliases: ["abdominal ultrasound limited", "liver ultrasound", "gallbladder ultrasound"] },
  { code: "76770", description: "Ultrasound, retroperitoneal — complete (kidneys, aorta)", aliases: ["renal ultrasound", "kidney ultrasound", "retroperitoneal US"] },
  { code: "76775", description: "Ultrasound, retroperitoneal — limited", aliases: ["renal ultrasound limited"] },
  { code: "76856", description: "Ultrasound, pelvic — complete (transabdominal)", aliases: ["pelvic ultrasound", "transabdominal pelvic US", "pelvic US"] },
  { code: "76857", description: "Ultrasound, pelvic — limited", aliases: ["pelvic ultrasound limited", "limited pelvic US"] },
  { code: "76830", description: "Ultrasound, transvaginal", aliases: ["transvaginal ultrasound", "TVUS", "vaginal ultrasound"] },
  { code: "93971", description: "Duplex scan, extremity veins — unilateral", aliases: ["leg vein ultrasound", "DVT ultrasound", "venous duplex unilateral"] },
  { code: "93970", description: "Duplex scan, extremity veins — bilateral", aliases: ["bilateral DVT ultrasound", "venous duplex bilateral"] },
  { code: "76882", description: "Ultrasound, extremity — limited (joint or soft tissue)", aliases: ["joint ultrasound", "soft tissue ultrasound extremity"] },
  { code: "76870", description: "Ultrasound, scrotum and contents", aliases: ["testicular ultrasound", "scrotal ultrasound", "testis US"] },
  { code: "76872", description: "Ultrasound, transrectal", aliases: ["transrectal ultrasound", "TRUS", "prostate ultrasound"] },
  { code: "76881", description: "Ultrasound, extremity — complete joint (rotator cuff)", aliases: ["shoulder ultrasound", "rotator cuff ultrasound"] },

  // ── Imaging — MRI ─────────────────────────────────────────────────────
  { code: "70551", description: "MRI, brain without contrast", aliases: ["brain MRI", "head MRI", "MRI brain without"] },
  { code: "70552", description: "MRI, brain with contrast", aliases: ["brain MRI with contrast", "head MRI contrast"] },
  { code: "70553", description: "MRI, brain with and without contrast", aliases: ["brain MRI with and without contrast", "MRI brain full"] },
  { code: "72141", description: "MRI, cervical spine without contrast", aliases: ["cervical MRI", "neck MRI", "cervical spine MRI"] },
  { code: "72142", description: "MRI, cervical spine with contrast", aliases: ["cervical MRI contrast", "C-spine MRI contrast"] },
  { code: "72146", description: "MRI, thoracic spine without contrast", aliases: ["thoracic spine MRI", "T-spine MRI"] },
  { code: "72148", description: "MRI, lumbar spine without contrast", aliases: ["lumbar MRI", "low back MRI", "L-spine MRI", "lumbosacral MRI"] },
  { code: "72149", description: "MRI, lumbar spine with contrast", aliases: ["lumbar MRI contrast"] },
  { code: "72158", description: "MRI, lumbar spine with and without contrast", aliases: ["lumbar MRI full"] },
  { code: "73221", description: "MRI, joint of upper extremity without contrast", aliases: ["shoulder MRI", "wrist MRI", "elbow MRI", "upper extremity MRI"] },
  { code: "73223", description: "MRI, joint of upper extremity with and without contrast", aliases: ["shoulder MRI contrast"] },
  { code: "73721", description: "MRI, joint of lower extremity without contrast", aliases: ["knee MRI", "hip MRI", "ankle MRI", "lower extremity MRI"] },
  { code: "73723", description: "MRI, joint of lower extremity with and without contrast", aliases: ["knee MRI contrast"] },
  { code: "74181", description: "MRI, abdomen without contrast", aliases: ["abdominal MRI", "MRI abdomen"] },
  { code: "74183", description: "MRI, abdomen with and without contrast", aliases: ["abdominal MRI with contrast"] },
  { code: "74178", description: "MRI, abdomen and pelvis with and without contrast", aliases: ["MRI abdomen pelvis", "abdominal pelvic MRI"] },
  { code: "72195", description: "MRI, pelvis without contrast", aliases: ["pelvic MRI", "MRI pelvis"] },
  { code: "72197", description: "MRI, pelvis with and without contrast", aliases: ["pelvic MRI with contrast"] },

  // ── Imaging — CT ──────────────────────────────────────────────────────
  { code: "70450", description: "CT, head without contrast", aliases: ["head CT", "brain CT", "CT head"] },
  { code: "70460", description: "CT, head with contrast", aliases: ["head CT with contrast", "CT head contrast"] },
  { code: "70470", description: "CT, head with and without contrast", aliases: ["CT head full"] },
  { code: "71046", description: "X-ray, chest — 2 views (PA and lateral)", aliases: ["chest x-ray", "chest xray", "CXR", "chest radiograph"] },
  { code: "71047", description: "X-ray, chest — 3 views", aliases: ["chest x-ray 3 view"] },
  { code: "71048", description: "X-ray, chest — 4+ views", aliases: ["chest x-ray 4 view"] },
  { code: "71250", description: "CT, thorax without contrast", aliases: ["chest CT", "CT chest without contrast"] },
  { code: "71260", description: "CT, thorax with contrast", aliases: ["CT chest with contrast"] },
  { code: "71270", description: "CT, thorax with and without contrast", aliases: ["CT chest full"] },
  { code: "74176", description: "CT, abdomen and pelvis without contrast", aliases: ["CT abdomen pelvis without", "CT abd/pelvis"] },
  { code: "74177", description: "CT, abdomen and pelvis with contrast", aliases: ["CT abdomen pelvis", "CT abd pelvis", "CT belly"] },
  { code: "74178", description: "CT, abdomen and pelvis with and without contrast", aliases: ["CT abdomen pelvis full"] },
  { code: "74150", description: "CT, abdomen without contrast", aliases: ["CT abdomen", "abdominal CT without"] },
  { code: "74160", description: "CT, abdomen with contrast", aliases: ["CT abdomen contrast"] },
  { code: "72131", description: "CT, lumbar spine without contrast", aliases: ["CT lumbar spine", "CT low back"] },
  { code: "72192", description: "CT, pelvis without contrast", aliases: ["CT pelvis", "pelvic CT"] },
  { code: "70486", description: "CT, maxillofacial area without contrast", aliases: ["sinus CT", "CT sinuses", "facial CT"] },
  { code: "71275", description: "CT angiography, chest (coronary CTA)", aliases: ["coronary CTA", "cardiac CT angiography", "CCTA"] },
  { code: "75572", description: "CT, cardiac morphology without contrast (calcium score)", aliases: ["coronary calcium score", "CAC score", "cardiac calcium", "calcium scoring"] },
  { code: "75571", description: "CT, cardiac — calcium score", aliases: ["calcium score", "CAC", "coronary artery calcium"] },

  // ── Imaging — X-ray ───────────────────────────────────────────────────
  { code: "73030", description: "X-ray, shoulder — 2+ views", aliases: ["shoulder x-ray", "shoulder xray"] },
  { code: "73100", description: "X-ray, wrist — 2 views", aliases: ["wrist x-ray"] },
  { code: "73130", description: "X-ray, hand — 3 views", aliases: ["hand x-ray"] },
  { code: "73560", description: "X-ray, knee — 1 or 2 views", aliases: ["knee x-ray"] },
  { code: "73562", description: "X-ray, knee — 3 views", aliases: ["knee x-ray 3 view"] },
  { code: "73600", description: "X-ray, ankle — 2 views", aliases: ["ankle x-ray"] },
  { code: "73620", description: "X-ray, foot — 2 views", aliases: ["foot x-ray"] },
  { code: "72020", description: "X-ray, spine — single view", aliases: ["spine x-ray single"] },
  { code: "72100", description: "X-ray, lumbar spine — 2–3 views", aliases: ["lumbar x-ray", "low back x-ray", "L-spine x-ray"] },
  { code: "72040", description: "X-ray, cervical spine — 2–3 views", aliases: ["cervical spine x-ray", "neck x-ray"] },

  // ── Imaging — DEXA / Nuclear ──────────────────────────────────────────
  { code: "77080", description: "Bone density (DEXA), axial (spine and hip)", aliases: ["DEXA", "bone density", "bone densitometry", "osteoporosis screening", "DEXA scan"] },
  { code: "77081", description: "Bone density (DEXA), peripheral", aliases: ["DEXA peripheral", "heel bone density"] },
  { code: "77085", description: "Bone density (DEXA), axial with vertebral fracture assessment", aliases: ["DEXA with VFA", "vertebral fracture assessment"] },
  { code: "77078", description: "CT bone density (quantitative CT)", aliases: ["quantitative CT", "QCT bone density"] },
  { code: "78300", description: "Bone scan — limited area", aliases: ["bone scan limited"] },
  { code: "78300", description: "Bone scan — whole body", aliases: ["bone scan", "whole body bone scan"] },

  // ── Cardiology ────────────────────────────────────────────────────────
  { code: "93000", description: "Electrocardiogram (ECG/EKG) — routine, with report", aliases: ["EKG", "ECG", "electrocardiogram", "heart tracing"] },
  { code: "93005", description: "Electrocardiogram — tracing only", aliases: ["EKG tracing"] },
  { code: "93010", description: "Electrocardiogram — interpretation and report only", aliases: ["EKG interpretation"] },
  { code: "93015", description: "Cardiovascular stress test — with physician supervision", aliases: ["stress test", "treadmill test", "exercise stress test", "ETT"] },
  { code: "93016", description: "Cardiovascular stress test — physician supervision only", aliases: ["stress test supervision"] },
  { code: "93018", description: "Cardiovascular stress test — interpretation and report only", aliases: ["stress test interpretation"] },
  { code: "93040", description: "Rhythm ECG (Holter), interpretation — 1–3 leads", aliases: ["rhythm ECG", "brief holter"] },
  { code: "93224", description: "Holter monitor — 24 hours, setup and analysis", aliases: ["Holter monitor", "Holter 24 hour", "ambulatory ECG"] },
  { code: "93226", description: "Holter monitor — 24 hours, scanning analysis", aliases: ["Holter scanning"] },
  { code: "93241", description: "External cardiac event monitor — up to 30 days", aliases: ["cardiac event monitor", "loop recorder external", "30-day monitor"] },
  { code: "93303", description: "Transthoracic echocardiography (TTE) — congenital", aliases: ["echo congenital"] },
  { code: "93306", description: "Transthoracic echocardiography (TTE) — complete", aliases: ["echocardiogram", "TTE", "echo", "cardiac echo", "heart ultrasound"] },
  { code: "93307", description: "Transthoracic echocardiography — without Doppler", aliases: ["echo without doppler"] },
  { code: "93308", description: "Transthoracic echocardiography — limited", aliases: ["limited echo", "focused echo"] },
  { code: "93880", description: "Carotid duplex scan, bilateral", aliases: ["carotid ultrasound", "carotid duplex bilateral", "carotid US"] },
  { code: "93882", description: "Carotid duplex scan, unilateral", aliases: ["carotid ultrasound unilateral"] },
  { code: "93922", description: "Ankle-brachial index (ABI) — limited bilateral", aliases: ["ABI", "ankle brachial index", "PAD test"] },
  { code: "93923", description: "Ankle-brachial index — complete bilateral", aliases: ["ABI complete", "peripheral arterial study"] },

  // ── Preventive Screenings & Procedures ───────────────────────────────
  { code: "45378", description: "Colonoscopy, diagnostic", aliases: ["colonoscopy", "colon cancer screening", "diagnostic colonoscopy"] },
  { code: "45380", description: "Colonoscopy with biopsy, single or multiple", aliases: ["colonoscopy with biopsy", "colonoscopy biopsy"] },
  { code: "45385", description: "Colonoscopy with polypectomy", aliases: ["colonoscopy with polypectomy", "polyp removal colonoscopy"] },
  { code: "45386", description: "Colonoscopy with dilation", aliases: ["colonoscopy dilation"] },
  { code: "45390", description: "Colonoscopy with endoscopic mucosal resection", aliases: ["EMR colonoscopy"] },
  { code: "45330", description: "Sigmoidoscopy, flexible — diagnostic", aliases: ["sigmoidoscopy", "flex sig"] },
  { code: "43235", description: "Esophagogastroduodenoscopy (EGD) — diagnostic", aliases: ["EGD", "upper endoscopy", "upper scope", "esophagoscopy"] },
  { code: "88175", description: "Pap smear — liquid-based cytology", aliases: ["Pap smear", "pap test", "cervical cytology", "ThinPrep"] },
  { code: "88150", description: "Pap smear — manual screening", aliases: ["Pap conventional"] },
  { code: "87624", description: "HPV high-risk types — molecular detection", aliases: ["HPV test", "HPV screening", "HPV NAAT", "co-testing"] },
  { code: "87625", description: "HPV types 16 and 18 — molecular detection", aliases: ["HPV 16 18", "HPV genotyping"] },
  { code: "93000", description: "ECG — with interpretation and report", aliases: ["ECG routine"] },

  // ── Women's Health ────────────────────────────────────────────────────
  { code: "57454", description: "Colposcopy with biopsy", aliases: ["colposcopy with biopsy", "colposcopy biopsy"] },
  { code: "57452", description: "Colposcopy — diagnostic", aliases: ["colposcopy", "cervical colposcopy"] },
  { code: "57461", description: "Colposcopy with LEEP", aliases: ["LEEP", "loop excision", "LEEP procedure"] },
  { code: "57420", description: "Colposcopy of vagina", aliases: ["vaginal colposcopy"] },
  { code: "58100", description: "Endometrial biopsy (EMB)", aliases: ["endometrial biopsy", "EMB", "uterine biopsy"] },
  { code: "58300", description: "IUD insertion", aliases: ["IUD insertion", "intrauterine device insertion", "Mirena insertion", "Kyleena insertion"] },
  { code: "58301", description: "IUD removal", aliases: ["IUD removal", "IUD removal procedure"] },
  { code: "11981", description: "Implant insertion — non-biodegradable", aliases: ["Nexplanon insertion", "implant insertion", "subdermal implant"] },
  { code: "11982", description: "Implant removal — non-biodegradable", aliases: ["Nexplanon removal", "implant removal"] },
  { code: "11983", description: "Implant removal and reinsertion", aliases: ["Nexplanon exchange", "implant exchange"] },

  // ── Hormone Therapy Procedures ────────────────────────────────────────
  { code: "11900", description: "Intralesional injection, up to 7 lesions", aliases: ["intralesional injection", "pellet insertion", "hormone pellet"] },
  { code: "11981", description: "Implant insertion, non-biodegradable (hormone pellets)", aliases: ["testosterone pellet", "hormone pellet insertion", "BHRT pellet", "bioidentical pellet"] },
  { code: "96372", description: "Therapeutic injection, subcutaneous or intramuscular", aliases: ["IM injection", "SubQ injection", "testosterone injection", "B12 injection", "hormone injection"] },
  { code: "96401", description: "Chemotherapy injection, non-hormonal — SubQ or IM", aliases: ["chemo injection IM"] },
  { code: "96402", description: "Chemotherapy injection, hormonal — IM or SubQ", aliases: ["hormonal injection", "Lupron injection", "LHRH injection"] },
  { code: "11920", description: "Tattooing of skin, 6.0 cm² or less", aliases: ["skin tattooing"] },

  // ── Injections & Infusions ────────────────────────────────────────────
  { code: "96360", description: "IV infusion, hydration — initial 31–60 min", aliases: ["IV hydration", "IV fluids", "infusion hydration"] },
  { code: "96361", description: "IV infusion, hydration — each additional hour", aliases: ["IV hydration additional"] },
  { code: "96365", description: "IV infusion, therapeutic — initial (up to 1 hr)", aliases: ["IV infusion initial", "IV therapy", "infusion therapy"] },
  { code: "96366", description: "IV infusion, therapeutic — each additional hour", aliases: ["IV infusion additional"] },
  { code: "96374", description: "IV push, single drug", aliases: ["IV push", "IV drug push", "IV medication push"] },
  { code: "96376", description: "IV push, each additional drug", aliases: ["IV push additional"] },
  { code: "96372", description: "Subcutaneous or intramuscular injection (therapeutic)", aliases: ["SubQ injection", "IM injection", "injection therapeutic"] },
  { code: "90471", description: "Immunization administration, first injection", aliases: ["vaccine administration", "immunization admin", "shot administration"] },
  { code: "90472", description: "Immunization administration, each additional injection", aliases: ["vaccine admin additional"] },
  { code: "20610", description: "Aspiration / injection, major joint (knee, shoulder, hip)", aliases: ["joint injection", "cortisone injection", "knee injection", "shoulder injection", "joint aspiration", "corticosteroid injection"] },
  { code: "20611", description: "Aspiration / injection, major joint with ultrasound guidance", aliases: ["joint injection ultrasound", "US-guided joint injection"] },
  { code: "20600", description: "Aspiration / injection, small joint", aliases: ["small joint injection", "finger joint injection"] },
  { code: "20605", description: "Aspiration / injection, intermediate joint (wrist, ankle)", aliases: ["wrist injection", "ankle injection"] },
  { code: "20550", description: "Injection, single tendon sheath or ligament", aliases: ["tendon injection", "ligament injection", "trigger point tendon"] },
  { code: "20551", description: "Injection, single tendon origin/insertion", aliases: ["tendon origin injection", "tennis elbow injection"] },
  { code: "20552", description: "Injection, single or multiple trigger points — 1–2 muscles", aliases: ["trigger point injection", "TPI 2 muscles"] },
  { code: "20553", description: "Injection, single or multiple trigger points — 3+ muscles", aliases: ["trigger point injection 3", "TPI 3 muscles", "trigger point multiple"] },

  // ── Vaccines ──────────────────────────────────────────────────────────
  { code: "90686", description: "Influenza vaccine — quadrivalent, IM", aliases: ["flu shot", "influenza vaccine", "flu vaccine"] },
  { code: "90685", description: "Influenza vaccine — quadrivalent, IM, preservative-free", aliases: ["flu shot preservative-free"] },
  { code: "90670", description: "Pneumococcal conjugate vaccine (PCV13)", aliases: ["Prevnar", "PCV13", "pneumonia vaccine 13"] },
  { code: "90732", description: "Pneumococcal polysaccharide vaccine (PPSV23)", aliases: ["Pneumovax", "PPSV23", "pneumonia vaccine 23"] },
  { code: "90714", description: "Td vaccine — adult", aliases: ["Td vaccine", "tetanus diphtheria"] },
  { code: "90715", description: "Tdap vaccine — adult", aliases: ["Tdap", "tetanus pertussis", "whooping cough vaccine"] },
  { code: "90707", description: "MMR vaccine", aliases: ["MMR", "measles mumps rubella"] },
  { code: "90710", description: "MMRV vaccine (MMR + varicella)", aliases: ["MMRV", "MMR varicella", "ProQuad"] },
  { code: "90716", description: "Varicella (chickenpox) vaccine", aliases: ["varicella vaccine", "chickenpox vaccine", "Varivax"] },
  { code: "90736", description: "Zoster (shingles) vaccine, live (Zostavax)", aliases: ["shingles vaccine live", "Zostavax"] },
  { code: "90750", description: "Zoster (shingles) vaccine, recombinant (Shingrix), each dose", aliases: ["Shingrix", "shingles vaccine recombinant", "zoster recombinant"] },
  { code: "90651", description: "HPV vaccine (9-valent), 2-dose schedule", aliases: ["HPV vaccine 2 dose", "Gardasil 9"] },
  { code: "90649", description: "HPV vaccine (quadrivalent — 4-valent)", aliases: ["HPV vaccine 4-valent", "Gardasil"] },
  { code: "90723", description: "DTaP-HepB-IPV vaccine", aliases: ["Pediarix", "combo childhood vaccine"] },
  { code: "90734", description: "Meningococcal conjugate vaccine (quadrivalent)", aliases: ["meningitis vaccine", "Menactra", "meningococcal"] },
  { code: "90651", description: "HPV 9-valent vaccine, 3-dose schedule", aliases: ["HPV 9-valent 3 dose"] },

  // ── Mental Health ─────────────────────────────────────────────────────
  { code: "90791", description: "Psychiatric diagnostic evaluation", aliases: ["psych evaluation", "psychiatric eval", "mental health eval", "initial psych"] },
  { code: "90792", description: "Psychiatric diagnostic evaluation with medical services", aliases: ["psych eval with medical"] },
  { code: "90832", description: "Psychotherapy — 30 min", aliases: ["therapy 30", "psychotherapy 30", "counseling 30 min"] },
  { code: "90834", description: "Psychotherapy — 45 min", aliases: ["therapy 45", "psychotherapy 45"] },
  { code: "90837", description: "Psychotherapy — 60 min", aliases: ["therapy 60", "psychotherapy 60", "counseling 60 min"] },
  { code: "90839", description: "Psychotherapy for crisis — first 60 min", aliases: ["crisis therapy", "crisis intervention"] },
  { code: "90853", description: "Group psychotherapy", aliases: ["group therapy", "group counseling"] },
  { code: "96130", description: "Psychological testing — first hour", aliases: ["psychological testing", "psych testing"] },
  { code: "96136", description: "Psychological testing by computer — first 30 min", aliases: ["computerized testing psych"] },

  // ── Dermatology / Skin ────────────────────────────────────────────────
  { code: "11100", description: "Skin biopsy — first lesion", aliases: ["skin biopsy", "biopsy skin", "shave biopsy"] },
  { code: "11101", description: "Skin biopsy — each additional lesion", aliases: ["skin biopsy additional"] },
  { code: "11200", description: "Removal of skin tags — up to 15 lesions", aliases: ["skin tag removal", "acrochordon removal"] },
  { code: "17000", description: "Destruction, premalignant lesion — first lesion", aliases: ["cryotherapy", "liquid nitrogen", "AK destruction", "actinic keratosis treatment"] },
  { code: "17003", description: "Destruction, premalignant lesion — each additional 2–14", aliases: ["cryotherapy additional", "AK treatment additional"] },
  { code: "17110", description: "Destruction, benign lesions — up to 14", aliases: ["wart removal", "molluscum treatment", "benign lesion removal"] },
  { code: "17111", description: "Destruction, benign lesions — 15 or more", aliases: ["multiple wart removal"] },
  { code: "17270", description: "Destruction, malignant lesion — trunk/arm/leg", aliases: ["malignant skin lesion destruction"] },
  { code: "11640", description: "Excision, malignant lesion — face (0.5 cm or less)", aliases: ["skin cancer excision face"] },
  { code: "11602", description: "Excision, malignant lesion — trunk (0.6–1.0 cm)", aliases: ["skin cancer excision trunk"] },
  { code: "10060", description: "Incision and drainage, abscess — simple", aliases: ["I&D abscess", "abscess drainage", "incision drainage"] },
  { code: "10061", description: "Incision and drainage, abscess — complicated", aliases: ["I&D complicated", "abscess I&D complicated"] },
  { code: "11055", description: "Paring, callus or corn — single", aliases: ["callus removal", "corn removal"] },
  { code: "96900", description: "Phototherapy (UV light treatment)", aliases: ["phototherapy", "UV therapy", "light therapy skin"] },

  // ── Minor Procedures ──────────────────────────────────────────────────
  { code: "36415", description: "Venipuncture for lab draw", aliases: ["blood draw", "phlebotomy", "venipuncture", "blood collection"] },
  { code: "36416", description: "Capillary blood collection", aliases: ["finger stick", "capillary blood draw", "fingerstick"] },
  { code: "81003", description: "Urinalysis with microscopy", aliases: ["UA", "urinalysis", "urine dipstick"] },
  { code: "81025", description: "Urine pregnancy test", aliases: ["urine pregnancy", "UPT", "urine pregnancy test"] },
  { code: "82962", description: "Glucose measurement — whole blood (glucometer)", aliases: ["point of care glucose", "glucometer", "POC glucose", "fingerstick glucose"] },
  { code: "94760", description: "Pulse oximetry", aliases: ["pulse ox", "oxygen saturation", "SpO2"] },
  { code: "94010", description: "Spirometry — with graphic record", aliases: ["spirometry", "PFT", "pulmonary function test", "lung function test"] },
  { code: "94060", description: "Spirometry with bronchodilator", aliases: ["spirometry bronchodilator", "pre-post bronchodilator"] },
  { code: "95044", description: "Patch test (allergy), per allergen", aliases: ["patch test", "allergy patch test", "skin allergy test"] },
  { code: "95004", description: "Percutaneous allergy test (scratch test)", aliases: ["scratch test", "skin prick test", "allergy scratch test"] },
  { code: "86005", description: "Allergy sensitization test, qualitative (extract)", aliases: ["allergy extract test"] },
  { code: "58999", description: "Unlisted procedure, female genital system", aliases: ["unlisted gyn procedure"] },
  { code: "93975", description: "Duplex scan, arterial inflow — complete bilateral", aliases: ["arterial duplex", "arterial scan bilateral"] },

  // ── Ear, Nose, Throat (ENT) ───────────────────────────────────────────
  { code: "69210", description: "Removal of impacted cerumen — one ear", aliases: ["ear wax removal", "cerumen removal", "ear cleaning"] },
  { code: "69209", description: "Removal of impacted cerumen — lavage, one ear", aliases: ["ear wax lavage"] },
  { code: "92557", description: "Comprehensive audiometry threshold evaluation", aliases: ["hearing test", "audiogram", "audiometry"] },
  { code: "92553", description: "Pure tone audiometry, air only", aliases: ["hearing test air", "audiogram air"] },

  // ── Ophthalmology ────────────────────────────────────────────────────
  { code: "92002", description: "Eye exam, new patient — intermediate", aliases: ["eye exam new", "ophthalmology new"] },
  { code: "92004", description: "Eye exam, new patient — comprehensive with dilation", aliases: ["comprehensive eye exam new"] },
  { code: "92012", description: "Eye exam, established patient — intermediate", aliases: ["eye exam established"] },
  { code: "92014", description: "Eye exam, established patient — comprehensive with dilation", aliases: ["comprehensive eye exam established", "dilated eye exam"] },

  // ── Sleep Medicine ────────────────────────────────────────────────────
  { code: "95800", description: "Polysomnography, unattended (home sleep test)", aliases: ["home sleep test", "HST", "sleep study home", "sleep apnea test home"] },
  { code: "95810", description: "Polysomnography, attended — 7+ channels", aliases: ["sleep study lab", "polysomnography", "PSG", "sleep study formal"] },
  { code: "95811", description: "Polysomnography with CPAP titration", aliases: ["CPAP titration", "sleep study CPAP", "PSG CPAP"] },
  { code: "94660", description: "CPAP initiation and management", aliases: ["CPAP setup", "CPAP management"] },

  // ── Nutrition / Weight Management ─────────────────────────────────────
  { code: "97802", description: "Medical nutrition therapy — initial assessment (15 min)", aliases: ["nutrition therapy", "dietitian visit", "MNT initial"] },
  { code: "97803", description: "Medical nutrition therapy — follow-up (15 min)", aliases: ["nutrition follow-up", "MNT follow-up"] },
  { code: "97804", description: "Medical nutrition therapy — group session", aliases: ["nutrition group", "MNT group"] },
  { code: "G0447", description: "Obesity counseling face-to-face, 15 min", aliases: ["weight loss counseling", "obesity counseling", "BMI counseling"] },

  // ── Physical Therapy / Rehab ──────────────────────────────────────────
  { code: "97110", description: "Therapeutic exercise (15 min)", aliases: ["PT exercises", "physical therapy exercises", "therapeutic exercise"] },
  { code: "97112", description: "Neuromuscular re-education (15 min)", aliases: ["neuromuscular rehab", "balance therapy"] },
  { code: "97140", description: "Manual therapy (joint mobilization) — 15 min", aliases: ["manual therapy", "joint mobilization", "manipulation"] },
  { code: "97530", description: "Therapeutic activities (15 min)", aliases: ["therapeutic activities", "PT activities"] },
  { code: "97012", description: "Mechanical traction — 15 min", aliases: ["traction", "mechanical traction"] },
  { code: "97032", description: "Electrical stimulation — attended (15 min)", aliases: ["electrical stimulation", "TENS", "e-stim"] },
  { code: "97035", description: "Ultrasound therapy — 15 min", aliases: ["ultrasound PT", "therapeutic ultrasound"] },
  { code: "97161", description: "Physical therapy evaluation — low complexity", aliases: ["PT evaluation", "physical therapy eval"] },
  { code: "97162", description: "Physical therapy evaluation — moderate complexity", aliases: ["PT eval moderate"] },
  { code: "97163", description: "Physical therapy evaluation — high complexity", aliases: ["PT eval high"] },

  // ── Urology ───────────────────────────────────────────────────────────
  { code: "51700", description: "Bladder irrigation, simple", aliases: ["bladder irrigation"] },
  { code: "51701", description: "Urethral catheterization — straight catheter", aliases: ["urinary catheter", "straight cath"] },
  { code: "51702", description: "Urethral catheterization — Foley catheter", aliases: ["Foley catheter", "urinary catheter indwelling"] },
  { code: "52000", description: "Cystoscopy, diagnostic", aliases: ["cystoscopy", "bladder scope"] },
  { code: "76872", description: "Transrectal ultrasound (TRUS)", aliases: ["TRUS", "prostate ultrasound", "transrectal US"] },
  { code: "55700", description: "Prostate biopsy, needle — transperineal or transrectal", aliases: ["prostate biopsy", "TRUS biopsy"] },

  // ── Gastroenterology ──────────────────────────────────────────────────
  { code: "43239", description: "EGD with biopsy", aliases: ["upper endoscopy biopsy", "EGD biopsy"] },
  { code: "43255", description: "EGD with thermal hemostasis", aliases: ["EGD hemostasis"] },
  { code: "43270", description: "EGD with band ligation (varices)", aliases: ["variceal banding", "EGD varices"] },
  { code: "43281", description: "Laparoscopic repair, hiatal hernia", aliases: ["hiatal hernia repair"] },
  { code: "44388", description: "Colonoscopy through colostomy", aliases: ["colonoscopy colostomy"] },
  { code: "91010", description: "Esophageal motility study", aliases: ["esophageal manometry", "motility study"] },
  { code: "91034", description: "Esophageal pH recording (24-hour)", aliases: ["pH study", "GERD pH test", "ambulatory pH"] },

  // ── Miscellaneous / NOS ────────────────────────────────────────────────
  { code: "99070", description: "Supplies and materials, beyond those usually included", aliases: ["supplies", "materials"] },
  { code: "99080", description: "Special report — insurance, disability, workers comp forms", aliases: ["insurance form", "disability form", "workers comp form", "special report"] },
  { code: "99455", description: "Work-related or medical disability examination", aliases: ["disability exam", "workers comp exam"] },
  { code: "99456", description: "Work-related or medical disability examination by treating physician", aliases: ["treating physician disability"] },
  { code: "99199", description: "Unlisted special service, procedure, or report", aliases: ["unlisted service"] },
  { code: "99358", description: "Prolonged evaluation and management, first hour (non-face-to-face)", aliases: ["prolonged service", "extended service non-face-to-face"] },
  { code: "99417", description: "Prolonged office/outpatient evaluation and management", aliases: ["prolonged visit", "extended visit"] },
];

export function searchCPT(query: string, limit = 15): CPTCode[] {
  const q = query.trim().toLowerCase();

  if (!q || q.length < 1) {
    return CPT_CODES.slice(0, limit);
  }

  const terms = q.split(/\s+/).filter(Boolean);
  const scored: { code: CPTCode; score: number }[] = [];

  for (const c of CPT_CODES) {
    const descL = c.description.toLowerCase();
    const aliasStr = (c.aliases ?? []).join(" ").toLowerCase();
    const codeL = c.code.toLowerCase();
    let score = 0;

    if (codeL === q) {
      score = 120;
    } else if (codeL.startsWith(q)) {
      score = 100;
    } else if (descL === q) {
      score = 98;
    } else if (descL.startsWith(q)) {
      score = 90;
    } else if ((c.aliases ?? []).some(a => a.toLowerCase() === q)) {
      score = 88;
    } else if ((c.aliases ?? []).some(a => a.toLowerCase().startsWith(q))) {
      score = 82;
    } else if (descL.includes(q)) {
      score = 70;
    } else if (aliasStr.includes(q)) {
      score = 60;
    } else if (terms.length > 1) {
      const haystack = descL + " " + aliasStr;
      const matchCount = terms.filter(t => haystack.includes(t)).length;
      if (matchCount === terms.length) {
        score = 50;
      } else if (matchCount >= Math.ceil(terms.length * 0.7)) {
        score = 35;
      }
    } else {
      const wordBoundary = new RegExp(`(^|\\s|,|\\()${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      if (wordBoundary.test(descL) || wordBoundary.test(aliasStr)) {
        score = 45;
      }
    }

    if (score > 0) scored.push({ code: c, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.code);
}
