export interface ICD10Diagnosis {
  code: string;
  name: string;
  aliases?: string[];
}

export const ICD10_DIAGNOSES: ICD10Diagnosis[] = [
  // Endocrine & Metabolic — Thyroid
  { code: "E03.9", name: "Hypothyroidism, unspecified", aliases: ["low thyroid", "underactive thyroid"] },
  { code: "E03.8", name: "Other specified hypothyroidism" },
  { code: "E03.5", name: "Myxedema coma" },
  { code: "E06.3", name: "Autoimmune thyroiditis", aliases: ["hashimoto", "hashimoto's"] },
  { code: "E05.90", name: "Thyrotoxicosis, unspecified", aliases: ["hyperthyroid", "overactive thyroid"] },
  { code: "E05.00", name: "Thyrotoxicosis with diffuse goiter without thyrotoxic crisis", aliases: ["graves", "graves disease"] },
  { code: "E04.1", name: "Nontoxic single thyroid nodule", aliases: ["thyroid nodule"] },
  { code: "E04.2", name: "Nontoxic multinodular goiter" },
  { code: "E07.89", name: "Other specified disorders of thyroid" },
  { code: "E07.9", name: "Disorder of thyroid, unspecified" },

  // Endocrine & Metabolic — Diabetes & Glucose
  { code: "E11.9", name: "Type 2 diabetes mellitus without complications", aliases: ["diabetes", "dm2", "t2dm"] },
  { code: "E11.65", name: "Type 2 diabetes mellitus with hyperglycemia" },
  { code: "E11.69", name: "Type 2 diabetes mellitus with other specified complication" },
  { code: "E11.40", name: "Type 2 diabetes mellitus with diabetic neuropathy, unspecified" },
  { code: "E11.21", name: "Type 2 diabetes mellitus with diabetic nephropathy" },
  { code: "E11.319", name: "Type 2 diabetes mellitus with unspecified diabetic retinopathy without macular edema" },
  { code: "E10.9", name: "Type 1 diabetes mellitus without complications", aliases: ["t1dm", "type 1"] },
  { code: "E13.9", name: "Other specified diabetes mellitus without complications" },
  { code: "R73.03", name: "Prediabetes", aliases: ["impaired fasting glucose", "pre-diabetes", "borderline diabetes"] },
  { code: "R73.09", name: "Other abnormal glucose" },
  { code: "E16.1", name: "Other hypoglycemia", aliases: ["low blood sugar", "hypoglycemia"] },

  // Endocrine & Metabolic — Lipids
  { code: "E78.5", name: "Dyslipidemia, unspecified", aliases: ["high cholesterol", "cholesterol"] },
  { code: "E78.00", name: "Pure hypercholesterolemia, unspecified", aliases: ["elevated LDL", "high LDL"] },
  { code: "E78.01", name: "Familial hypercholesterolemia" },
  { code: "E78.1", name: "Pure hyperglyceridemia", aliases: ["high triglycerides", "elevated triglycerides"] },
  { code: "E78.2", name: "Mixed hyperlipidemia", aliases: ["combined hyperlipidemia"] },
  { code: "E78.41", name: "Elevated lipoprotein(a)", aliases: ["high lpa", "elevated lp(a)"] },
  { code: "E78.49", name: "Other hyperlipidemia" },
  { code: "E78.6", name: "Lipoprotein deficiency", aliases: ["low HDL"] },

  // Endocrine & Metabolic — Hormones
  { code: "E29.1", name: "Testicular hypofunction", aliases: ["low testosterone", "hypogonadism", "low T", "male hypogonadism"] },
  { code: "E29.0", name: "Testicular hyperfunction" },
  { code: "E89.5", name: "Postprocedural testicular hypofunction" },
  { code: "E28.39", name: "Other primary ovarian failure", aliases: ["premature ovarian failure", "POF"] },
  { code: "E28.310", name: "Premature menopause" },
  { code: "E28.2", name: "Polycystic ovarian syndrome", aliases: ["PCOS", "polycystic ovaries"] },
  { code: "E28.1", name: "Androgen excess", aliases: ["hyperandrogenism", "high testosterone female"] },
  { code: "E28.8", name: "Other ovarian dysfunction" },
  { code: "E28.9", name: "Ovarian dysfunction, unspecified" },
  { code: "E22.1", name: "Hyperprolactinemia", aliases: ["elevated prolactin", "high prolactin"] },
  { code: "E23.0", name: "Hypopituitarism", aliases: ["pituitary insufficiency"] },
  { code: "E22.0", name: "Acromegaly and pituitary gigantism", aliases: ["elevated growth hormone", "high GH"] },
  { code: "E27.1", name: "Primary adrenocortical insufficiency", aliases: ["addison's", "adrenal insufficiency"] },
  { code: "E27.40", name: "Unspecified adrenocortical insufficiency", aliases: ["adrenal fatigue"] },
  { code: "E24.9", name: "Cushing syndrome, unspecified", aliases: ["cushing's", "elevated cortisol"] },
  { code: "E34.9", name: "Endocrine disorder, unspecified" },

  // Endocrine & Metabolic — Menopause & Perimenopause
  { code: "N95.1", name: "Menopausal and female climacteric states", aliases: ["menopause", "menopausal symptoms", "hot flashes"] },
  { code: "N95.0", name: "Postmenopausal bleeding" },
  { code: "E89.40", name: "Asymptomatic postprocedural ovarian failure", aliases: ["surgical menopause"] },
  { code: "E89.41", name: "Symptomatic postprocedural ovarian failure" },

  // Endocrine & Metabolic — Insulin Resistance & Metabolic Syndrome
  { code: "E88.81", name: "Metabolic syndrome", aliases: ["syndrome X", "insulin resistance syndrome"] },
  { code: "E88.89", name: "Other specified metabolic disorders" },

  // Endocrine & Metabolic — Vitamin & Mineral Deficiencies
  { code: "E55.9", name: "Vitamin D deficiency, unspecified", aliases: ["low vitamin D", "low vit D"] },
  { code: "E53.8", name: "Deficiency of other specified B group vitamins", aliases: ["B vitamin deficiency"] },
  { code: "D51.9", name: "Vitamin B12 deficiency anemia, unspecified", aliases: ["B12 deficiency", "low B12"] },
  { code: "E61.1", name: "Iron deficiency", aliases: ["low iron", "iron deficient"] },
  { code: "D50.9", name: "Iron deficiency anemia, unspecified", aliases: ["anemia", "low iron anemia"] },
  { code: "D50.0", name: "Iron deficiency anemia secondary to blood loss" },
  { code: "E56.0", name: "Vitamin E deficiency" },
  { code: "E58", name: "Dietary calcium deficiency" },
  { code: "E61.2", name: "Zinc deficiency", aliases: ["low zinc"] },
  { code: "E61.0", name: "Copper deficiency" },
  { code: "E83.42", name: "Hypomagnesemia", aliases: ["low magnesium", "mag deficiency"] },

  // Obesity & Weight
  { code: "E66.01", name: "Morbid (severe) obesity due to excess calories", aliases: ["morbid obesity", "severe obesity", "BMI 40+"] },
  { code: "E66.09", name: "Other obesity due to excess calories" },
  { code: "E66.1", name: "Drug-induced obesity" },
  { code: "E66.3", name: "Overweight", aliases: ["BMI 25-29"] },
  { code: "E66.9", name: "Obesity, unspecified", aliases: ["obese", "obesity"] },
  { code: "Z68.30", name: "Body mass index (BMI) 30.0-30.9, adult" },
  { code: "Z68.35", name: "Body mass index (BMI) 35.0-35.9, adult" },
  { code: "Z68.41", name: "Body mass index (BMI) 40.0-44.9, adult" },
  { code: "R63.4", name: "Abnormal weight loss", aliases: ["unintentional weight loss"] },
  { code: "R63.5", name: "Abnormal weight gain" },

  // Cardiovascular
  { code: "I10", name: "Essential (primary) hypertension", aliases: ["high blood pressure", "HTN", "hypertension"] },
  { code: "I11.9", name: "Hypertensive heart disease without heart failure" },
  { code: "I25.10", name: "Atherosclerotic heart disease of native coronary artery without angina", aliases: ["CAD", "coronary artery disease"] },
  { code: "I48.91", name: "Unspecified atrial fibrillation", aliases: ["afib", "a-fib"] },
  { code: "I48.0", name: "Paroxysmal atrial fibrillation" },
  { code: "I48.19", name: "Other persistent atrial fibrillation" },
  { code: "I49.9", name: "Cardiac arrhythmia, unspecified", aliases: ["arrhythmia", "irregular heartbeat"] },
  { code: "I50.9", name: "Heart failure, unspecified", aliases: ["CHF", "congestive heart failure"] },
  { code: "I50.22", name: "Chronic systolic (congestive) heart failure" },
  { code: "I73.9", name: "Peripheral vascular disease, unspecified", aliases: ["PVD", "PAD"] },
  { code: "I83.90", name: "Asymptomatic varicose veins of unspecified lower extremity" },
  { code: "R00.0", name: "Tachycardia, unspecified", aliases: ["fast heart rate", "rapid heart rate"] },
  { code: "R00.1", name: "Bradycardia, unspecified", aliases: ["slow heart rate"] },
  { code: "R00.2", name: "Palpitations", aliases: ["heart palpitations"] },

  // Hematology
  { code: "D64.9", name: "Anemia, unspecified" },
  { code: "D75.1", name: "Secondary polycythemia", aliases: ["polycythemia", "elevated hematocrit", "high hematocrit", "erythrocytosis"] },
  { code: "D75.9", name: "Disease of blood and blood-forming organs, unspecified" },
  { code: "D69.6", name: "Thrombocytopenia, unspecified", aliases: ["low platelets"] },
  { code: "D72.829", name: "Elevated white blood cell count, unspecified", aliases: ["leukocytosis", "high WBC"] },
  { code: "D72.819", name: "Decreased white blood cell count, unspecified", aliases: ["leukopenia", "low WBC"] },

  // Hepatic / Liver
  { code: "K76.0", name: "Fatty (change of) liver, not elsewhere classified", aliases: ["fatty liver", "NAFLD", "MASLD", "hepatic steatosis"] },
  { code: "K75.81", name: "Nonalcoholic steatohepatitis (NASH)", aliases: ["NASH", "MASH"] },
  { code: "K76.9", name: "Liver disease, unspecified" },
  { code: "K74.60", name: "Unspecified cirrhosis of liver", aliases: ["cirrhosis", "liver cirrhosis"] },
  { code: "R74.01", name: "Elevation of liver transaminase levels", aliases: ["elevated AST", "elevated ALT", "elevated liver enzymes"] },
  { code: "R74.02", name: "Elevation of liver function test", aliases: ["abnormal LFTs"] },

  // Renal / Kidney
  { code: "N18.3", name: "Chronic kidney disease, stage 3 (moderate)", aliases: ["CKD 3", "CKD stage 3"] },
  { code: "N18.30", name: "Chronic kidney disease, stage 3 unspecified" },
  { code: "N18.4", name: "Chronic kidney disease, stage 4 (severe)", aliases: ["CKD 4"] },
  { code: "N18.9", name: "Chronic kidney disease, unspecified", aliases: ["CKD", "kidney disease"] },
  { code: "R80.9", name: "Proteinuria, unspecified", aliases: ["protein in urine"] },

  // GI
  { code: "K21.0", name: "Gastro-esophageal reflux disease with esophagitis", aliases: ["GERD", "acid reflux"] },
  { code: "K21.9", name: "Gastro-esophageal reflux disease without esophagitis" },
  { code: "K58.9", name: "Irritable bowel syndrome without diarrhea", aliases: ["IBS"] },
  { code: "K58.0", name: "Irritable bowel syndrome with diarrhea" },
  { code: "K30", name: "Functional dyspepsia", aliases: ["indigestion"] },
  { code: "K59.00", name: "Constipation, unspecified", aliases: ["constipation"] },

  // Musculoskeletal
  { code: "M79.3", name: "Panniculitis, unspecified", aliases: ["inflammation of subcutaneous fat"] },
  { code: "M79.1", name: "Myalgia", aliases: ["muscle pain", "myalgia"] },
  { code: "M54.5", name: "Low back pain", aliases: ["back pain", "lumbago"] },
  { code: "M25.50", name: "Pain in unspecified joint", aliases: ["joint pain", "arthralgia"] },
  { code: "M81.0", name: "Age-related osteoporosis without current pathological fracture", aliases: ["osteoporosis"] },
  { code: "M85.80", name: "Other specified disorders of bone density and structure, unspecified site", aliases: ["osteopenia"] },
  { code: "M10.9", name: "Gout, unspecified", aliases: ["gout", "gouty arthritis"] },

  // Mental Health & Neurology
  { code: "F32.9", name: "Major depressive disorder, single episode, unspecified", aliases: ["depression"] },
  { code: "F33.0", name: "Major depressive disorder, recurrent, mild" },
  { code: "F33.1", name: "Major depressive disorder, recurrent, moderate" },
  { code: "F41.1", name: "Generalized anxiety disorder", aliases: ["anxiety", "GAD"] },
  { code: "F41.9", name: "Anxiety disorder, unspecified" },
  { code: "F43.10", name: "Post-traumatic stress disorder, unspecified", aliases: ["PTSD"] },
  { code: "F51.01", name: "Primary insomnia", aliases: ["insomnia", "can't sleep"] },
  { code: "F51.09", name: "Other insomnia not due to a substance or known physiological condition" },
  { code: "G47.33", name: "Obstructive sleep apnea", aliases: ["sleep apnea", "OSA", "STOP-BANG"] },
  { code: "G47.9", name: "Sleep disorder, unspecified", aliases: ["sleep problems"] },
  { code: "G43.909", name: "Migraine, unspecified, not intractable, without status migrainosus", aliases: ["migraine", "migraines"] },
  { code: "R51.9", name: "Headache, unspecified", aliases: ["headache"] },
  { code: "R53.83", name: "Other fatigue", aliases: ["fatigue", "tired", "exhaustion", "chronic fatigue"] },
  { code: "R53.81", name: "Other malaise", aliases: ["malaise", "not feeling well"] },
  { code: "G89.29", name: "Other chronic pain", aliases: ["chronic pain"] },
  { code: "R41.840", name: "Attention and concentration deficit", aliases: ["brain fog", "cognitive difficulty"] },
  { code: "R41.3", name: "Other amnesia", aliases: ["memory loss", "forgetfulness"] },

  // Respiratory
  { code: "J06.9", name: "Acute upper respiratory infection, unspecified", aliases: ["URI", "cold", "upper respiratory infection"] },
  { code: "J45.20", name: "Mild intermittent asthma, uncomplicated", aliases: ["asthma"] },
  { code: "J44.1", name: "Chronic obstructive pulmonary disease with acute exacerbation", aliases: ["COPD exacerbation"] },
  { code: "J44.9", name: "Chronic obstructive pulmonary disease, unspecified", aliases: ["COPD"] },
  { code: "R06.02", name: "Shortness of breath", aliases: ["dyspnea", "SOB"] },

  // Dermatology
  { code: "L70.0", name: "Acne vulgaris", aliases: ["acne"] },
  { code: "L63.9", name: "Alopecia areata, unspecified", aliases: ["hair loss", "alopecia"] },
  { code: "L65.9", name: "Nonscarring hair loss, unspecified", aliases: ["thinning hair"] },
  { code: "L30.9", name: "Dermatitis, unspecified", aliases: ["eczema", "skin rash"] },

  // Urological & Reproductive
  { code: "N52.9", name: "Male erectile dysfunction, unspecified", aliases: ["ED", "erectile dysfunction", "impotence"] },
  { code: "N53.12", name: "Painful ejaculation" },
  { code: "R35.0", name: "Frequency of micturition", aliases: ["frequent urination", "urinary frequency"] },
  { code: "N40.0", name: "Benign prostatic hyperplasia without lower urinary tract symptoms", aliases: ["BPH", "enlarged prostate"] },
  { code: "N40.1", name: "Benign prostatic hyperplasia with lower urinary tract symptoms" },
  { code: "R97.20", name: "Elevated prostate specific antigen [PSA]", aliases: ["elevated PSA", "high PSA"] },
  { code: "N92.0", name: "Excessive and frequent menstruation with regular cycle", aliases: ["menorrhagia", "heavy periods"] },
  { code: "N91.2", name: "Amenorrhea, unspecified", aliases: ["no period", "absent period", "amenorrhea"] },
  { code: "N94.6", name: "Dysmenorrhea, unspecified", aliases: ["painful periods", "menstrual cramps"] },
  { code: "N94.89", name: "Other specified conditions associated with female genital organs and menstrual cycle" },

  // Infections & Immune
  { code: "B19.20", name: "Unspecified viral hepatitis C without hepatic coma", aliases: ["hepatitis C", "hep C", "HCV"] },
  { code: "B20", name: "Human immunodeficiency virus [HIV] disease", aliases: ["HIV"] },
  { code: "D89.9", name: "Disorder involving the immune mechanism, unspecified", aliases: ["autoimmune disorder"] },

  // Screening & Prevention
  { code: "Z13.220", name: "Encounter for screening for lipoid disorders", aliases: ["lipid screening", "cholesterol screening"] },
  { code: "Z13.1", name: "Encounter for screening for diabetes mellitus", aliases: ["diabetes screening"] },
  { code: "Z13.6", name: "Encounter for screening for cardiovascular disorders", aliases: ["cardiac screening", "heart screening"] },
  { code: "Z13.29", name: "Encounter for screening for other suspected endocrine disorder", aliases: ["thyroid screening", "hormone screening"] },
  { code: "Z00.00", name: "Encounter for general adult medical examination without abnormal findings", aliases: ["annual physical", "wellness visit", "routine exam"] },
  { code: "Z00.01", name: "Encounter for general adult medical examination with abnormal findings" },
  { code: "Z01.89", name: "Encounter for other specified special examinations" },
  { code: "Z79.899", name: "Other long-term (current) drug therapy", aliases: ["medication management"] },
  { code: "Z79.891", name: "Long term (current) use of opiate analgesic" },
  { code: "Z79.3", name: "Long term (current) use of hormonal contraceptives" },
  { code: "Z79.890", name: "Hormone replacement therapy", aliases: ["HRT", "hormone therapy", "TRT", "testosterone replacement"] },
  { code: "Z79.52", name: "Long term (current) use of systemic steroids" },

  // Lab Abnormalities
  { code: "R79.89", name: "Other specified abnormal findings of blood chemistry", aliases: ["abnormal labs"] },
  { code: "R79.0", name: "Abnormal level of blood mineral", aliases: ["electrolyte abnormality"] },
  { code: "R77.9", name: "Abnormality of plasma protein, unspecified" },
  { code: "R71.0", name: "Precipitous drop in hematocrit", aliases: ["hematocrit drop"] },
  { code: "R70.0", name: "Elevated erythrocyte sedimentation rate", aliases: ["elevated ESR", "high ESR"] },
  { code: "R76.8", name: "Other specified abnormal immunological findings in serum" },
  { code: "E87.6", name: "Hypokalemia", aliases: ["low potassium"] },
  { code: "E87.5", name: "Hyperkalemia", aliases: ["high potassium"] },
  { code: "E87.1", name: "Hypo-osmolality and hyponatremia", aliases: ["low sodium", "hyponatremia"] },
  { code: "E87.0", name: "Hyperosmolality and hypernatremia", aliases: ["high sodium", "hypernatremia"] },
  { code: "E83.51", name: "Hypocalcemia", aliases: ["low calcium"] },
  { code: "E83.52", name: "Hypercalcemia", aliases: ["high calcium", "elevated calcium"] },
  { code: "E79.0", name: "Hyperuricemia without signs of inflammatory arthritis and tophaceous disease", aliases: ["elevated uric acid", "high uric acid"] },

  // Inflammatory Markers
  { code: "R79.82", name: "Elevated C-reactive protein (CRP)", aliases: ["elevated CRP", "high CRP", "elevated hs-CRP"] },
  { code: "R70.1", name: "Abnormal plasma viscosity" },

  // Allergies
  { code: "J30.9", name: "Allergic rhinitis, unspecified", aliases: ["allergies", "hay fever", "seasonal allergies"] },
  { code: "T78.40XA", name: "Allergy, unspecified, initial encounter", aliases: ["allergic reaction"] },

  // Pain
  { code: "M79.7", name: "Fibromyalgia", aliases: ["fibromyalgia", "fibro"] },
  { code: "M54.2", name: "Cervicalgia", aliases: ["neck pain"] },
  { code: "M25.511", name: "Pain in right shoulder" },
  { code: "M25.512", name: "Pain in left shoulder" },
  { code: "M25.561", name: "Pain in right knee" },
  { code: "M25.562", name: "Pain in left knee" },
  { code: "M54.9", name: "Dorsalgia, unspecified", aliases: ["back pain"] },

  // Supplement & Lifestyle Related
  { code: "Z71.3", name: "Dietary counseling and surveillance", aliases: ["nutrition counseling", "diet counseling"] },
  { code: "Z71.89", name: "Other specified counseling", aliases: ["supplement counseling", "lifestyle counseling"] },
  { code: "Z72.0", name: "Tobacco use", aliases: ["smoking", "tobacco"] },
  { code: "F17.210", name: "Nicotine dependence, cigarettes, uncomplicated", aliases: ["nicotine dependence"] },
  { code: "Z72.3", name: "Lack of physical exercise", aliases: ["sedentary", "physical inactivity"] },
  { code: "E63.9", name: "Nutritional deficiency, unspecified", aliases: ["malnutrition", "nutritional deficiency"] },

  // Sexual Health
  { code: "F52.0", name: "Hypoactive sexual desire disorder", aliases: ["low libido", "decreased libido", "low sex drive"] },
  { code: "F52.21", name: "Male erectile disorder", aliases: ["erectile dysfunction"] },
  { code: "F52.31", name: "Female orgasmic disorder" },
  { code: "N94.10", name: "Dyspareunia, unspecified", aliases: ["painful intercourse"] },

  // Edema & Fluid
  { code: "R60.0", name: "Localized edema", aliases: ["swelling"] },
  { code: "R60.9", name: "Edema, unspecified", aliases: ["fluid retention"] },

  // Misc Symptoms
  { code: "R63.0", name: "Anorexia", aliases: ["loss of appetite", "poor appetite"] },
  { code: "R11.0", name: "Nausea", aliases: ["nausea"] },
  { code: "R11.10", name: "Vomiting, unspecified", aliases: ["vomiting"] },
  { code: "R19.7", name: "Diarrhea, unspecified", aliases: ["diarrhea"] },
  { code: "R42", name: "Dizziness and giddiness", aliases: ["dizziness", "vertigo", "lightheaded"] },
  { code: "R61", name: "Generalized hyperhidrosis", aliases: ["excessive sweating", "night sweats"] },
  { code: "R20.2", name: "Paresthesia of skin", aliases: ["tingling", "numbness", "pins and needles"] },
  { code: "M62.838", name: "Other muscle spasm", aliases: ["muscle cramps", "cramping"] },
  { code: "R21", name: "Rash and other nonspecific skin eruption", aliases: ["rash", "skin rash"] },
  { code: "R05.9", name: "Cough, unspecified", aliases: ["cough"] },
  { code: "R50.9", name: "Fever, unspecified", aliases: ["fever"] },
  { code: "R63.6", name: "Underweight", aliases: ["underweight"] },
  { code: "G25.81", name: "Restless legs syndrome", aliases: ["RLS", "restless legs"] },

  // Ophthalmology
  { code: "H52.4", name: "Presbyopia", aliases: ["age-related vision changes"] },
  { code: "H40.10X0", name: "Unspecified open-angle glaucoma, stage unspecified", aliases: ["glaucoma"] },
];

export function searchDiagnoses(query: string, limit = 20): ICD10Diagnosis[] {
  const q = query.toLowerCase().trim();
  if (!q) return ICD10_DIAGNOSES.slice(0, limit);

  const terms = q.split(/\s+/);

  const scored: { dx: ICD10Diagnosis; score: number }[] = [];

  for (const dx of ICD10_DIAGNOSES) {
    const codeLower = dx.code.toLowerCase().replace(/\./g, "");
    const nameLower = dx.name.toLowerCase();
    const aliasStr = (dx.aliases ?? []).join(" ").toLowerCase();
    const haystack = `${codeLower} ${nameLower} ${aliasStr}`;

    let score = 0;

    if (codeLower === q.replace(/\./g, "")) {
      score = 100;
    } else if (codeLower.startsWith(q.replace(/\./g, ""))) {
      score = 80;
    } else if (dx.aliases?.some(a => a.toLowerCase() === q)) {
      score = 90;
    } else {
      let allMatch = true;
      for (const term of terms) {
        if (!haystack.includes(term)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        if (nameLower.startsWith(q)) {
          score = 70;
        } else if (nameLower.includes(q)) {
          score = 60;
        } else if (dx.aliases?.some(a => a.toLowerCase().includes(q))) {
          score = 55;
        } else {
          score = 40;
        }
      }
    }

    if (score > 0) {
      scored.push({ dx, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.dx);
}
