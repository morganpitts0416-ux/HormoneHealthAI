import OpenAI from "openai";

async function retryOnRateLimit<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(err?.headers?.get?.("retry-after-ms") || err?.headers?.["retry-after-ms"] || "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter + 1000 : (attempt + 1) * 15000;
        console.warn(`[SOAP Pipeline] Rate limited (429). Waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted retries");
}

interface PipelineInput {
  transcriptText: string;
  diarized: any[];
  extraction: any;
  labContext: string;
  patternContext: string;
  medicationContext: string;
  encounter: any;
  openai: OpenAI;
  patientName?: string;
}

interface PipelineOutput {
  fullNote: string;
  uncertain_items: string[];
  needs_clinician_review: string[];
}

interface NormalizedExtraction {
  medications_normalized: Array<{
    name: string;
    dose?: string;
    route?: string;
    frequency?: string;
    status: "current" | "new" | "discontinued" | "adjusted" | "discussed";
    confidence: "explicit" | "strongly_implied" | "requires_confirmation";
    indication?: string;
  }>;
  conditions_inferred: Array<{
    condition: string;
    basis: string;
    confidence: "explicit" | "strongly_implied" | "requires_confirmation";
  }>;
  preventative_signals: Array<{
    signal: string;
    clinical_relevance: string;
    supporting_evidence: string[];
  }>;
  symptom_timeline: Array<{
    symptom: string;
    onset?: string;
    duration?: string;
    trajectory: "improving" | "stable" | "worsening" | "new" | "resolved" | "unknown";
    context?: string;
  }>;
  explicitly_decided_plan_items: string[];
  discussed_but_not_decided: string[];
  clinically_relevant_followup: string[];
  enhanced_extraction: any;
}

async function medicalNormalizationAndInference(
  openai: OpenAI,
  extraction: any,
  transcriptText: string,
  diarized: any[]
): Promise<NormalizedExtraction> {
  const diarizedInput = diarized.length > 0
    ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
    : transcriptText;

  const systemPrompt = `You are a clinical intelligence engine specializing in medical normalization, context inference, and plan-decision classification.

You receive:
1. Structured clinical extraction (JSON) from a prior pipeline stage
2. The original diarized transcript

Your job has FOUR parts:

═══════════════════════════════════════
PART 1 — MEDICATION NORMALIZATION
═══════════════════════════════════════
For every medication mentioned in the extraction or transcript:
- Normalize brand names to generic + brand: "Lexapro" → "escitalopram (Lexapro)"
- Normalize common misspellings/STT errors: "tire zap a tide" → "tirzepatide"
- Preserve dose, route, frequency if stated
- Classify status: current (patient is on it), new (starting today), discontinued, adjusted, discussed (mentioned but not started)
- Classify confidence: explicit (directly stated), strongly_implied (clear from context), requires_confirmation (uncertain)
- Identify the likely indication when inferable from context

═══════════════════════════════════════
PART 2 — CONDITION INFERENCE
═══════════════════════════════════════
Identify conditions that are:
- Explicitly stated as diagnoses
- Strongly implied by medication use (e.g., Lexapro → anxiety/depression; levothyroxine/Synthroid/Armour → hypothyroidism; methimazole/PTU/propylthiouracil/post-RAI/post-thyroidectomy → hyperthyroidism or Graves disease; metformin → insulin resistance/T2DM)
- Strongly implied by symptom clusters
- Requires confirmation (possible but not certain)

For each condition, note the basis (which meds/symptoms/context support it) and confidence level.

CRITICAL: Do NOT hallucinate diagnoses. Every inference must be traceable to specific transcript evidence.

THYROID-SPECIFIC RULES (READ CAREFULLY — common error source):
- Do NOT default to "hypothyroidism" whenever the thyroid is discussed. Hyperthyroidism / Graves disease / thyroiditis are equally valid diagnoses and are commonly missed.
- Lab interpretation:
  • LOW TSH (often with elevated free T4/free T3, positive TSI/TRAb, or thyroid nodule with hyperfunction) → HYPERthyroidism / Graves disease / toxic nodule. NOT hypothyroidism.
  • HIGH TSH (often with low/normal free T4) → HYPOthyroidism.
  • Normal TSH with positive TPO/TgAb → autoimmune thyroiditis (euthyroid Hashimoto's possible).
- Medication mapping is one-way and explicit:
  • Levothyroxine, Synthroid, Tirosint, Armour Thyroid, NP Thyroid, liothyronine/Cytomel → patient HAS hypothyroidism (replacement therapy).
  • Methimazole (Tapazole), propylthiouracil (PTU), beta-blockers prescribed for thyroid symptoms, history of radioactive iodine (RAI) ablation, or thyroidectomy → patient HAS or HAD hyperthyroidism / Graves disease. (Post-ablation/post-surgical patients may now be hypothyroid on replacement — capture both.)
- "Being investigated for" / "workup for" / "evaluating for" a thyroid condition is NOT the same as having it. Capture as assessment_candidates (uncertain), not as a confirmed diagnosis. Do not invent a thyroid medication the patient is not currently taking.
- If the transcript mentions Graves, hyperthyroid, thyrotoxicosis, low TSH, exophthalmos, heat intolerance, palpitations, weight loss, tremor, or thyroid eye disease — the working diagnosis is HYPERthyroidism, not hypothyroidism. Do not flip it.

═══════════════════════════════════════
MEDICATION-IMPLIED CONDITION DICTIONARY
═══════════════════════════════════════
Use these mappings to infer underlying diagnoses when a medication is documented as currently taken (status = "current"). Always preserve nuance — a patient on a drug class may have ANY of the listed indications; pick the one that best fits the encounter context. Never invent a medication the patient is not actually on.

ENDOCRINE / METABOLIC
- Levothyroxine, Synthroid, Tirosint, Armour Thyroid, NP Thyroid, liothyronine, Cytomel → hypothyroidism (E03.9)
- Methimazole (Tapazole), propylthiouracil (PTU), post-RAI, post-thyroidectomy → hyperthyroidism / Graves disease (E05.x)
- Metformin → T2DM (E11.9) OR insulin resistance/prediabetes (R73.03 / E88.81) OR PCOS (E28.2) — pick by context
- GLP-1 RAs: semaglutide (Ozempic/Wegovy/Rybelsus), tirzepatide (Mounjaro/Zepbound), liraglutide (Victoza/Saxenda), dulaglutide (Trulicity), exenatide → T2DM (E11.9) OR obesity (E66.x). Wegovy/Zepbound/Saxenda dosing → obesity. Ozempic/Mounjaro/Trulicity dosing → T2DM.
- SGLT2 inhibitors: empagliflozin (Jardiance), dapagliflozin (Farxiga), canagliflozin (Invokana), ertugliflozin → T2DM, HFrEF, or CKD
- DPP-4 inhibitors: sitagliptin (Januvia), linagliptin (Tradjenta) → T2DM
- Sulfonylureas: glipizide, glimepiride, glyburide → T2DM
- Insulin (any formulation: glargine/Lantus/Basaglar, aspart/Novolog, lispro/Humalog, NPH, detemir, degludec/Tresiba) → diabetes — specify T1DM (E10) if lean/autoimmune/lifelong, T2DM (E11.9) otherwise. Insulin from diagnosis with no oral agents trial → consider T1DM.
- Pioglitazone (Actos) → T2DM / insulin resistance
- Naltrexone-bupropion (Contrave), phentermine, phentermine-topiramate (Qsymia), orlistat → obesity (E66.x)
- Hydrocortisone, fludrocortisone → adrenal insufficiency (E27.x); chronic prednisone → autoimmune disease, adrenal suppression, or asthma/COPD per context
- Spironolactone (in women) → PCOS (E28.2), acne, hirsutism, or HFrEF; (in men) → HFrEF, resistant HTN, primary aldosteronism

HORMONE THERAPY
- Estradiol (oral, patch, gel, spray, vaginal, pellet), conjugated estrogens (Premarin), Estring, Vagifem → menopause (N95.1) or perimenopause (N95.0); GU symptoms only → GSM (N95.2)
- Progesterone (Prometrium, micronized), medroxyprogesterone, norethindrone → menopause/HRT, AUB, or contraception per context
- Testosterone in women (compounded cream, pellet, low-dose injection) → HSDD (R37) or female testosterone deficiency
- Testosterone in men (cypionate/enanthate IM, gel/Androgel, pellet, Jatenzo) → male hypogonadism (E29.1) — specify primary (high LH/FSH) vs secondary (low/normal LH/FSH) when labs available
- Anastrozole, letrozole (in men on TRT, low dose) → estrogen management on TRT; (in women, oncology dosing) → breast cancer / hormone-sensitive tumor
- hCG, clomiphene, enclomiphene (Androxal), tamoxifen (in men) → secondary hypogonadism, fertility preservation on TRT
- Finasteride, dutasteride → BPH (N40.x) or androgenetic alopecia
- Tamsulosin (Flomax), alfuzosin, silodosin → BPH (N40.0)
- Sildenafil (Viagra), tadalafil (Cialis) PRN → erectile dysfunction (N52.9); tadalafil daily 5 mg → BPH or ED
- Combined OCPs, progestin-only pills, NuvaRing, hormonal IUD (Mirena/Kyleena/Skyla) → contraception (Z30.0) OR menstrual regulation, dysmenorrhea, endometriosis, PCOS, AUB per context

CARDIOVASCULAR
- Statins (atorvastatin/Lipitor, rosuvastatin/Crestor, simvastatin, pravastatin, lovastatin, pitavastatin) → hyperlipidemia (E78.x) ± ASCVD (I25.x); high-intensity post-MI/post-stent → secondary prevention
- Ezetimibe (Zetia), bempedoic acid (Nexletol) → hyperlipidemia
- PCSK9 inhibitors: evolocumab (Repatha), alirocumab (Praluent); inclisiran (Leqvio) → familial/refractory hyperlipidemia, ASCVD
- Icosapent ethyl (Vascepa) → hypertriglyceridemia + elevated CV risk
- Fibrates (fenofibrate, gemfibrozil) → hypertriglyceridemia
- ACEi/ARBs (lisinopril, enalapril, losartan, valsartan, olmesartan), CCBs (amlodipine, diltiazem), thiazides (HCTZ, chlorthalidone, indapamide), beta-blockers (metoprolol, carvedilol, bisoprolol, atenolol) → hypertension (I10) ± HFrEF, post-MI, AFib rate control per context
- Sacubitril-valsartan (Entresto) → HFrEF (I50.x)
- Spironolactone, eplerenone → HFrEF, resistant HTN, primary aldosteronism
- Warfarin → AFib (I48), VTE (I82.x), mechanical valve, hypercoagulable state
- DOACs: apixaban (Eliquis), rivaroxaban (Xarelto), dabigatran (Pradaxa), edoxaban → AFib or VTE
- Antiplatelets: aspirin 81 mg → primary or secondary CV prevention; clopidogrel (Plavix), prasugrel, ticagrelor → post-stent / ACS / secondary prevention
- Nitrates (nitroglycerin SL, isosorbide) → CAD / angina

PSYCHIATRIC / SLEEP
- SSRIs (sertraline/Zoloft, escitalopram/Lexapro, fluoxetine/Prozac, paroxetine/Paxil, citalopram/Celexa, fluvoxamine) → MDD (F32.x/F33.x), GAD (F41.1), panic disorder, OCD, PTSD per context
- SNRIs (duloxetine/Cymbalta, venlafaxine/Effexor, desvenlafaxine/Pristiq, levomilnacipran) → MDD, GAD, neuropathic pain (duloxetine), fibromyalgia
- Bupropion (Wellbutrin) → MDD, SAD, smoking cessation, ADHD adjunct
- Mirtazapine → MDD with insomnia/poor appetite
- Trazodone → insomnia (low dose) or MDD (high dose)
- TCAs (amitriptyline, nortriptyline) → neuropathic pain, migraine prophylaxis, MDD
- Buspirone → GAD
- Benzodiazepines (alprazolam/Xanax, lorazepam/Ativan, clonazepam/Klonopin, diazepam/Valium) → anxiety, panic, insomnia (short-term)
- Mood stabilizers: lamotrigine, lithium, valproate, carbamazepine → bipolar disorder; lamotrigine/valproate also seizure
- Antipsychotics: quetiapine/Seroquel, aripiprazole/Abilify, olanzapine, risperidone, lurasidone → bipolar, MDD augmentation, psychotic disorder
- ADHD stimulants: methylphenidate (Ritalin/Concerta), amphetamine salts (Adderall), lisdexamfetamine (Vyvanse) → ADHD (F90.x)
- ADHD non-stimulants: atomoxetine (Strattera), guanfacine ER (Intuniv), clonidine ER → ADHD
- Sleep hypnotics: zolpidem (Ambien), eszopiclone (Lunesta), zaleplon, ramelteon, suvorexant (Belsomra), lemborexant (Dayvigo) → insomnia (G47.00); melatonin → circadian/sleep onset
- Naltrexone (50 mg PO daily, Vivitrol IM) → AUD or OUD; low-dose naltrexone (1.5–4.5 mg) → autoimmune/chronic pain protocols
- Buprenorphine (Suboxone, Subutex), methadone → OUD MAT (F11.20)

GI
- PPIs (omeprazole, pantoprazole, esomeprazole, lansoprazole, rabeprazole, dexlansoprazole) → GERD (K21.9) or PUD
- H2 blockers (famotidine) → GERD or PUD
- Sucralfate → PUD or stress ulcer prophylaxis
- 5-ASA (mesalamine, sulfasalazine) → UC or Crohn's
- Biologics for IBD (infliximab/Remicade, adalimumab/Humira, vedolizumab/Entyvio, ustekinumab/Stelara) → IBD (K50.x / K51.x) — context required to distinguish from rheum/derm indications
- Linaclotide (Linzess), lubiprostone (Amitiza), plecanatide → IBS-C or chronic constipation
- Rifaximin (Xifaxan) → IBS-D or hepatic encephalopathy or SIBO
- Bile acid sequestrants (cholestyramine, colesevelam) → bile acid diarrhea, hyperlipidemia, or pruritus

PULMONARY / ALLERGY
- ICS/LABA inhalers (Advair, Symbicort, Breo, Trelegy, Wixela) → asthma or COPD
- Albuterol PRN → asthma or COPD
- LAMA (tiotropium/Spiriva, umeclidinium) → COPD primarily
- Montelukast (Singulair) → asthma, allergic rhinitis
- Biologics: omalizumab (Xolair) → severe allergic asthma, chronic urticaria; dupilumab (Dupixent) → atopic dermatitis, asthma, EoE; mepolizumab/benralizumab → eosinophilic asthma
- Intranasal steroids (fluticasone, mometasone) → allergic rhinitis

BONE / RHEUMATOLOGY
- Bisphosphonates (alendronate/Fosamax, risedronate, ibandronate, zoledronic acid/Reclast) → osteoporosis (M81.0) or osteopenia (M85.8)
- Denosumab (Prolia) → osteoporosis; (Xgeva at higher dose) → bone metastases
- Romosozumab (Evenity), teriparatide (Forteo), abaloparatide (Tymlos) → severe osteoporosis with high fracture risk
- Hydroxychloroquine (Plaquenil) → SLE, RA, Sjögren's
- Methotrexate → RA, psoriasis, psoriatic arthritis (low-dose); ectopic / oncology at high dose
- TNF inhibitors (etanercept/Enbrel, adalimumab/Humira, infliximab/Remicade, golimumab, certolizumab) → RA, AS, PsA, IBD, psoriasis (context required)
- IL-17/IL-23 (secukinumab, ixekizumab, guselkumab, risankizumab) → psoriasis, PsA, AS
- JAK inhibitors (tofacitinib, baricitinib, upadacitinib) → RA, PsA, atopic dermatitis, alopecia areata
- Allopurinol, febuxostat → gout (M10.x) or hyperuricemia
- Colchicine → gout (acute or prophylaxis), pericarditis, FMF

NEUROLOGY
- Anticonvulsants: gabapentin, pregabalin (Lyrica) → neuropathic pain, fibromyalgia, anxiety (gabapentinoids), restless legs
- Topiramate → migraine prophylaxis, seizure, weight loss adjunct
- Triptans (sumatriptan, rizatriptan, zolmitriptan, eletriptan) → migraine (G43.x)
- CGRP mAbs (erenumab/Aimovig, fremanezumab/Ajovy, galcanezumab/Emgality), gepants (rimegepant/Nurtec, ubrogepant/Ubrelvy, atogepant/Qulipta) → chronic migraine
- Carbidopa-levodopa, ropinirole, pramipexole → Parkinson's; ropinirole/pramipexole at low dose → restless legs
- Donepezil, memantine, rivastigmine → Alzheimer's / dementia
- MS DMTs (ocrelizumab, glatiramer, dimethyl fumarate, fingolimod) → multiple sclerosis

PAIN / OPIOIDS
- Chronic opioids (oxycodone, hydrocodone-acetaminophen, morphine ER, fentanyl patch, tramadol) → chronic pain syndrome — document indication
- Buprenorphine (Belbuca, Butrans) for pain → chronic pain; (Suboxone) → OUD MAT
- Naloxone (Narcan) prescription → opioid use / overdose risk

HEMATOLOGY
- Iron (ferrous sulfate/gluconate, IV iron — Venofer, Injectafer, Monoferric) → iron deficiency ± anemia (D50.9 / E61.1)
- B12 IM/SL → B12 deficiency (E53.8) or pernicious anemia (D51.0)
- Folic acid → folate deficiency, pregnancy, MTHFR support
- Erythropoiesis stimulators (darbepoetin, epoetin) → CKD anemia, chemo-induced anemia

DERMATOLOGY
- Isotretinoin (Accutane) → severe nodulocystic acne
- Tretinoin, adapalene topical → acne, photoaging
- Topical calcineurin inhibitors (tacrolimus, pimecrolimus) → atopic dermatitis
- Spironolactone (women) → hormonal acne, hirsutism, PCOS

═══════════════════════════════════════
DIAGNOSTIC SPECIFICITY RULES (commonly mis-coded)
═══════════════════════════════════════
Apply these rules whenever the relevant context is present. Default to MORE specific diagnoses; flag uncertainty in assessment_candidates.

DIABETES TYPE
- Adult-onset, on metformin/GLP-1 ± oral agents, insulin resistant, no DKA history → T2DM (E11.x).
- Lean, autoimmune phenotype, insulin from diagnosis, possible DKA history, GAD/IA-2/ZnT8 antibody history → T1DM (E10.x).
- LADA (latent autoimmune diabetes of adults) — adult onset that progresses to insulin dependence — flag explicitly when antibody positivity or rapid beta-cell failure is mentioned. Do not auto-collapse to T2DM.
- Steroid-induced or pancreatogenic diabetes — capture if context (chronic prednisone, post-pancreatitis, post-pancreatectomy, CF) supports it.

GLUCOSE DYSREGULATION SPECTRUM (distinct ICD-10 — do not conflate)
- A1c ≥6.5% OR fasting glucose ≥126 OR random ≥200 with symptoms → diabetes (E10/E11)
- A1c 5.7–6.4% → prediabetes (R73.03)
- Elevated fasting insulin / HOMA-IR with normal A1c → insulin resistance (E88.81)
- Reactive hypoglycemia → E16.1
- Metabolic syndrome (3+ of: central adiposity, low HDL, high TG, elevated FBG, HTN) → E88.81 with metabolic syndrome documented

MALE HYPOGONADISM — specify primary vs secondary
- Low total/free T + ELEVATED LH/FSH → primary hypogonadism (E29.1)
- Low total/free T + LOW or inappropriately normal LH/FSH → secondary hypogonadism / hypogonadotropic hypogonadism (E23.0)
- If LH/FSH not yet drawn, capture as "hypogonadism, type to be determined" in assessment_candidates rather than picking one
- Functional hypogonadism (obesity, OSA, opioids, chronic illness) — note when context supports reversible causes

FEMALE REPRODUCTIVE LIFE STAGE — three distinct entities
- <40 years + amenorrhea + elevated FSH + low estradiol → primary ovarian insufficiency / POI (E28.310), NOT menopause
- 40–55 + cycle irregularity, vasomotor symptoms, FSH variable → perimenopause (N95.0)
- ≥12 months amenorrhea (typically 45–55+) → menopause (N95.1)
- Surgical menopause (post-bilateral oophorectomy) → N95.1 with surgical context
- GU symptoms only (vaginal dryness, dyspareunia, recurrent UTI) → genitourinary syndrome of menopause / GSM (N95.2)
- PCOS — irregular cycles + clinical/biochemical hyperandrogenism + polycystic morphology (Rotterdam) → E28.2. Common pitfall: do NOT call irregular cycles in a young woman "perimenopause" — PCOS first.

THYROID — see thyroid-specific rules above. Do not default to hypothyroidism.

HYPERLIPIDEMIA — use specific subtype codes
- Pure hypercholesterolemia (high LDL only) → E78.0
- Pure hypertriglyceridemia → E78.1
- Mixed hyperlipidemia → E78.2
- Low HDL → E78.6
- Elevated Lp(a) → E78.41
- Familial hypercholesterolemia (very high LDL, family history of premature ASCVD, tendon xanthomas) → E78.01

HYPERTENSION
- Default essential HTN → I10
- If young (<30), refractory (≥3 drugs including diuretic), hypokalemia, episodic (pheo), bruits (RAS), sleep apnea — flag secondary HTN workup in needs_clinician_review

LIVER (renamed in 2023 — use new nomenclature)
- Hepatic steatosis on imaging + metabolic risk factors → MASLD / metabolic dysfunction-associated steatotic liver disease (formerly NAFLD) — K76.0
- Steatohepatitis with fibrosis/inflammation → MASH (formerly NASH) — K75.81
- Always pair with metabolic syndrome documentation

SLEEP APNEA
- Snoring + witnessed apneas + obesity + EDS → obstructive sleep apnea (G47.33). High STOP-BANG → strongly_implied.
- Cheyne-Stokes pattern + HFrEF → consider central sleep apnea (G47.31)

ANEMIA — distinguish workup
- Microcytic + low ferritin → iron deficiency anemia (D50.9)
- Microcytic + normal/high ferritin → anemia of chronic disease (D63.x) or thalassemia trait
- Macrocytic + low B12 → B12 deficiency anemia (D51.x)
- Macrocytic + low folate → folate deficiency anemia (D52.x)
- Normocytic in CKD → CKD-related anemia (D63.1)

MIGRAINE — specify subtype
- With aura → G43.10x
- Without aura → G43.00x
- Chronic (≥15 headache days/month for 3 months) → G43.70x
- Menstrual / catamenial → G43.829

═══════════════════════════════════════
PART 3 — PREVENTATIVE MEDICINE SIGNALS
═══════════════════════════════════════
Identify "between the lines" clinical clues that a thoughtful clinician would notice:
- fatigue + heavy menses + hair shedding → possible iron deficiency
- constipation + fatigue + weight change + thyroid treatment → thyroid optimization question
- perimenopause + ApoB/Lp(a)/family history → cardiometabolic prevention opportunity
- GLP-1 use + constipation/nausea/poor intake → treatment-management issue
- SSRI + sexual side effects/weight change → medication counseling opportunity
- Statin discussion + liver function → monitoring consideration

Only include signals grounded in the transcript. Do not fabricate.

═══════════════════════════════════════
PART 4 — PLAN DECISION CLASSIFICATION
═══════════════════════════════════════
This is CRITICAL for recommendation quality. Classify every discussed action item into exactly one of:

A. "explicitly_decided_plan_items" — The provider clearly and definitively committed to this action during the visit. The patient agreed or the provider stated it as a decision.
   Trigger phrases: "I'm going to start you on", "let's do", "we'll begin", "I'll order", "I'm prescribing", "continue current dose", "we decided to"
   
B. "discussed_but_not_decided" — The topic was discussed but no definitive commitment was made. The patient needs to think about it, or it's a future consideration.
   Trigger phrases: "we could consider", "you might want to think about", "if you're interested", "we can discuss next time", "I'd like you to consider", "once you're ready"
   
C. "clinically_relevant_followup" — Items that were NOT discussed but are clinically relevant given the visit context. These are intelligent clinical additions a thoughtful provider might consider.
   Examples: Preventative screenings suggested by age/risk, monitoring implied by medication class, follow-up labs implied by treatment changes

Return this exact JSON structure:
{
  "medications_normalized": [...],
  "conditions_inferred": [...],
  "preventative_signals": [...],
  "symptom_timeline": [
    {
      "symptom": "string",
      "onset": "string or null",
      "duration": "string or null", 
      "trajectory": "improving|stable|worsening|new|resolved|unknown",
      "context": "relevant context"
    }
  ],
  "explicitly_decided_plan_items": ["list of plan items the provider definitively committed to"],
  "discussed_but_not_decided": ["list of items discussed but not finalized"],
  "clinically_relevant_followup": ["list of clinically relevant considerations not explicitly discussed"],
  "enhanced_extraction": {
    "hpi_chronological_elements": ["ordered list of clinically relevant events/discussions as they occurred in the visit, for HPI reconstruction"],
    "patient_perspective_statements": ["direct or paraphrased patient statements that are medically relevant"],
    "provider_reasoning_statements": ["provider explanations, interpretations, or clinical reasoning shared with patient"],
    "education_provided": ["specific clinical education topics discussed with depth of what was explained"],
    "patient_decisions": ["patient-stated decisions, preferences, or deferred choices"]
  }
}`;

  const userPrompt = `STRUCTURED EXTRACTION (from prior pipeline stage):
${JSON.stringify(extraction, null, 2)}

TRANSCRIPT:
${diarizedInput}`;

  const completion = await retryOnRateLimit(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  }));

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return {
    medications_normalized: result.medications_normalized ?? [],
    conditions_inferred: result.conditions_inferred ?? [],
    preventative_signals: (result.preventative_signals ?? []).map((s: any) => ({
      signal: s.signal ?? "",
      clinical_relevance: s.clinical_relevance ?? "",
      supporting_evidence: Array.isArray(s.supporting_evidence) ? s.supporting_evidence : [],
    })),
    symptom_timeline: result.symptom_timeline ?? [],
    explicitly_decided_plan_items: result.explicitly_decided_plan_items ?? [],
    discussed_but_not_decided: result.discussed_but_not_decided ?? [],
    clinically_relevant_followup: result.clinically_relevant_followup ?? [],
    enhanced_extraction: result.enhanced_extraction ?? {},
  };
}

async function generateSoapSections(
  openai: OpenAI,
  extraction: any,
  normalized: NormalizedExtraction,
  transcriptText: string,
  diarized: any[],
  labContext: string,
  patternContext: string,
  medicationContext: string,
  encounter: any,
  patientName?: string
): Promise<PipelineOutput> {
  const diarizedInput = diarized.length > 0
    ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
    : transcriptText;

  const normalizedMedsContext = normalized.medications_normalized.length
    ? `\nNORMALIZED MEDICATIONS:\n${normalized.medications_normalized.map(m =>
        `- ${m.name}${m.dose ? ` ${m.dose}` : ""}${m.route ? ` ${m.route}` : ""}${m.frequency ? ` ${m.frequency}` : ""} [${m.status}] (${m.confidence})${m.indication ? ` — for: ${m.indication}` : ""}`
      ).join('\n')}`
    : "";

  const conditionsContext = normalized.conditions_inferred.length
    ? `\nINFERRED CONDITIONS:\n${normalized.conditions_inferred.map(c =>
        `- ${c.condition} [${c.confidence}]: ${c.basis}`
      ).join('\n')}`
    : "";

  const preventativeContext = normalized.preventative_signals.length
    ? `\nPREVENTATIVE MEDICINE SIGNALS:\n${normalized.preventative_signals.map(s =>
        `- ${s.signal}: ${s.clinical_relevance}${Array.isArray(s.supporting_evidence) && s.supporting_evidence.length ? ` (evidence: ${s.supporting_evidence.join("; ")})` : ""}`
      ).join('\n')}`
    : "";

  const symptomTimelineContext = normalized.symptom_timeline.length
    ? `\nSYMPTOM TIMELINE:\n${normalized.symptom_timeline.map(s =>
        `- ${s.symptom} [${s.trajectory}]${s.onset ? ` onset: ${s.onset}` : ""}${s.duration ? ` duration: ${s.duration}` : ""}${s.context ? ` — ${s.context}` : ""}`
      ).join('\n')}`
    : "";

  const planClassification = `
PLAN DECISION CLASSIFICATION:
Explicitly decided (DO include in Plan): ${normalized.explicitly_decided_plan_items?.length ? normalized.explicitly_decided_plan_items.join("; ") : "none identified"}
Discussed but not decided (mention in HPI/Assessment, do NOT put in Plan as decided): ${normalized.discussed_but_not_decided?.length ? normalized.discussed_but_not_decided.join("; ") : "none"}
Clinically relevant follow-up considerations (for needs_clinician_review only): ${normalized.clinically_relevant_followup?.length ? normalized.clinically_relevant_followup.join("; ") : "none"}`;

  const hpiElements = normalized.enhanced_extraction?.hpi_chronological_elements?.length
    ? `\nHPI CHRONOLOGICAL ELEMENTS (use these to reconstruct the clinical story in order):\n${normalized.enhanced_extraction.hpi_chronological_elements.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}`
    : "";

  const patientPerspective = normalized.enhanced_extraction?.patient_perspective_statements?.length
    ? `\nPATIENT PERSPECTIVE STATEMENTS (integrate into HPI as clinical paraphrases):\n${normalized.enhanced_extraction.patient_perspective_statements.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const providerReasoning = normalized.enhanced_extraction?.provider_reasoning_statements?.length
    ? `\nPROVIDER REASONING (integrate into Assessment where relevant):\n${normalized.enhanced_extraction.provider_reasoning_statements.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const educationProvided = normalized.enhanced_extraction?.education_provided?.length
    ? `\nEDUCATION PROVIDED (document fully in HPI + Assessment + Plan):\n${normalized.enhanced_extraction.education_provided.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const patientDecisions = normalized.enhanced_extraction?.patient_decisions?.length
    ? `\nPATIENT DECISIONS (document in HPI + Plan):\n${normalized.enhanced_extraction.patient_decisions.map((s: string) => `- ${s}`).join('\n')}`
    : "";

  const extractionSummary = buildExtractionSummary(extraction);

  const systemPrompt = `You are an expert clinical documentation specialist functioning as a high-end clinical intelligence system for a hormone and primary care clinic. You generate chart-ready, medically complete SOAP notes.

CRITICAL DISTINCTION — This is NOT a transcript summary. You are RECONSTRUCTING the clinical encounter as a complete medical document.

═══════════════════════════════════════
SECTION 1 — HPI RECONSTRUCTION (NOT SUMMARY)
═══════════════════════════════════════
The HPI is a CLINICAL STORY RECONSTRUCTION — a detailed, chronological narrative that rebuilds the encounter as a complete medical document. It must read as if the treating provider wrote it directly into the chart after the visit.

NARRATIVE VOICE — CRITICAL:
Write the HPI from the perspective of the documenting provider. This is a first-person clinical note, NOT a third-person observation report.

FORBIDDEN NARRATOR PHRASES (never use these):
- "the conversation included" / "the visit included discussion of"
- "the patient acknowledged" / "the patient confirmed"
- "the clinician mentioned" / "the clinician explained" / "the clinician discussed"
- "the provider reviewed" / "the provider noted" / "the provider counseled"
- Any phrasing that positions the writer as an outside observer describing what happened

PREFERRED PROVIDER-AUTHORED PHRASING:
- "she reports" / "he reports" / "patient reports"
- "she describes" / "she endorses" / "she denies"
- "we discussed" / "I discussed" / "we reviewed"
- "plan was made to" / "decision was made to" / "we will reassess"
- "labs were reviewed and notable for" / "review of labs shows"
- "she was counseled on" / "education was provided regarding"
- "she elected to" / "patient agreed to" / "she declined"
- "she has been tolerating [medication] well" / "she notes improvement in"

VOICE VARIETY — IMPORTANT:
Do NOT overuse any single phrasing pattern. Vary naturally between "she reports," "she describes," "she notes," "she endorses," "per patient," and direct clinical statements. A well-written HPI reads naturally, not formulaically. Mix patient-reported phrasing with direct clinical observations and provider reasoning.

HPI RECONSTRUCTION RULES:
1. CHRONOLOGICAL FLOW: Reconstruct events in the order they occurred during the visit. Start with why the patient came in, move through each topic discussed, and end with decisions/next steps.
2. COMPLETENESS OVER COMPRESSION: Include EVERY medically relevant topic discussed. If the provider and patient spent time discussing a topic, it belongs in the HPI. A 20-minute visit should produce a multi-paragraph HPI, not 4 sentences.
3. PATIENT VOICE: Include the patient's perspective using clinical paraphrase: "She reports that...", "She describes...", "She notes improvement in...". The patient's story matters — convey it through provider-owned documentation language.
4. PROVIDER REASONING: When clinical reasoning, counseling, or data interpretation occurred — document it in provider voice: "We reviewed her labs and noted...", "I discussed treatment options including...", "Labs were reviewed showing..."
5. MEDICATION STORY: Don't just list medications. Tell the story: "She has been on tirzepatide 15mg weekly for approximately 3 months, initiated for weight management. She describes good tolerability with mild initial nausea that has since resolved. Weight loss trajectory has been [described]."
6. SECONDARY CONCERNS: Every secondary topic discussed gets its own paragraph or substantial mention. Do NOT flatten a multi-topic visit into a single-complaint note.
7. PRIOR TREATMENT HISTORY: If prior medication trials, failed treatments, or side effect history was discussed, reconstruct that history: "She previously tried metformin but discontinued due to GI intolerance. She was briefly on a different SSRI approximately 2 years ago..."
8. DENIED SYMPTOMS: Weave naturally: "She denies nausea, vomiting, or injection site reactions."
9. EDUCATION & DECISIONS: Document what was discussed and decided in provider voice: "We discussed the mechanism of GLP-1 therapy including appetite regulation and metabolic effects. She verbalized understanding and elected to continue current regimen."
10. CLINICAL INTERPRETATION: Where appropriate, include subtle clinical reasoning — rationale for decisions, treatment context, clinical significance of findings — without adding unsupported information. Example: "Given her improving A1c trend and weight loss, plan was made to maintain current dose rather than escalate."
11. DO NOT COMPRESS: If the transcript contains 30 minutes of clinical conversation covering 5+ topics, the HPI should be 3-5 substantial paragraphs. A 2-sentence HPI for a rich encounter is WRONG.

HPI LENGTH GUIDANCE:
- Brief focused visit (5 min, single topic): 1-2 paragraphs
- Standard follow-up (15 min, 2-3 topics): 2-3 paragraphs
- Comprehensive wellness visit (20-30+ min, multiple topics): 3-5+ paragraphs
- The HPI should be proportional to the depth and breadth of the actual conversation

MEDICATION TENSE — CRITICAL:
- medications_current (patient is already on it) → HPI as ongoing: "She has been on...", "Patient has been on..."
- medication_changes_discussed (recommended/started at this visit) → HPI as discussed: "We discussed initiating...", "Plan was made to start...", "She agreed to begin..."
- NEVER write a recommended medication as if the patient is currently taking it

═══════════════════════════════════════
SECTION 2 — ASSESSMENT WITH CLINICAL REASONING
═══════════════════════════════════════
The Assessment must demonstrate clinical thinking, not transcript restating.

Assessment Summary paragraph (REQUIRED, before numbered items):
- Synthesize the clinical picture: why the patient is here, what the key findings are, what the clinical trajectory looks like
- Reference lab findings, symptom patterns, treatment response, and risk factors
- This should read as a clinician's opening synthesis

Each numbered item:
- Diagnosis Name (ICD-10 code) on its own line
- Supporting clinical reasoning as a separate paragraph below (2-3 sentences minimum)
- Explain WHY this diagnosis applies, its current status, relevant evidence
- Include preventative medicine signals where supported
- "Plan:" on its own line with specific actions

ASSESSMENT RULES:
- Use ICD-10 codes for all diagnoses
- Infer clinically appropriate diagnoses from context (medications, symptoms, lab patterns) — do not require the clinician to have verbally stated the diagnosis
- Inferred conditions with "requires_confirmation" confidence should use hedging language: "consistent with", "suggestive of"
- Inferred conditions with "strongly_implied" confidence can be stated more directly but note the basis
- Preventative medicine signals should be woven into relevant assessment items as clinical context, not presented as confirmed diagnoses

═══════════════════════════════════════
SECTION 3 — PLAN REFLECTING ACTUAL DECISIONS + COUNSELING/SDM PRESERVATION
═══════════════════════════════════════
The Plan must ONLY reflect what was actually decided during the visit. AND it must preserve the clinical counseling and shared decision-making that actually occurred — not collapse it into vague summary phrases.

CRITICAL PLAN RULE — DECISION CLASSIFICATION:
- Items in "explicitly_decided_plan_items" → include in the Plan as definitive orders/decisions
- Items in "discussed_but_not_decided" → mention in the Assessment reasoning or HPI, but do NOT include as a decided plan action. Instead: "Patient to consider [X] and follow up when ready"
- Items in "clinically_relevant_followup" → put in needs_clinician_review ONLY, never in the Plan

Plan specifics:
- Include drug name, dose, route, frequency for every medication
- Include monitoring parameters appropriate to medication class
- Include specific follow-up interval with clinical rationale
- Include labs ordered
- "Continue treatment" is never acceptable — always specify which treatment

═══════════════════════════════════════
SECTION 3B — COUNSELING, EDUCATION, AND SHARED DECISION-MAKING (MANDATORY PRESERVATION)
═══════════════════════════════════════
Treat the transcript as a SOURCE FOR CLINICAL DETAIL EXTRACTION, not just summarization. When the visit contains real counseling content, that content MUST appear in the note.

PRESERVE WHENEVER DISCUSSED (do NOT collapse into vague phrases):
- Risks vs. benefits of the chosen treatment
- Side effects reviewed (specific ones named in the conversation)
- Medication mechanism explained to the patient
- Titration schedule reviewed (starting dose → step-up plan → target)
- Administration / use instructions reviewed (route, technique, timing, storage)
- Alternatives discussed (what other options were considered)
- Rationale for choosing one option over the alternatives
- Follow-up and monitoring plan (labs, intervals, what we are watching for)
- Return precautions / when to notify the clinic (red-flag symptoms)
- Patient understanding, agreement, and consent

FORBIDDEN VAGUE COMPRESSIONS — if the transcript contains the actual counseling points, do NOT replace them with these:
- "treatment discussed" / "options reviewed" / "options were discussed"
- "patient interested" / "patient is on board"
- "risks and benefits discussed" (without saying which risks or which benefits — name them when they were named)
- "medication counseled" / "education provided" (without saying what was actually taught)

PER-PROBLEM SUB-STRUCTURE — every numbered Assessment/Plan item should follow this layout when counseling/monitoring content exists for it:

  N. Diagnosis Name (ICD-10)
  [Supporting evidence and clinical reasoning — keep the existing assessment paragraph]
  Plan: [specific orders, medications, doses, labs, referrals]
  Counseling / Education: [concise but specific — what risks, which side effects, the actual titration steps, administration instructions, alternatives discussed, rationale for the chosen option, and that the patient verbalized understanding and agrees]
  Monitoring / Follow-up: [labs to recheck and when, symptoms/parameters being tracked, follow-up interval and what would prompt earlier return]

Rules for the sub-structure:
- Only include "Counseling / Education" or "Monitoring / Follow-up" when there is real content for them. If the transcript contains nothing for a given sub-line for a given problem, OMIT that sub-line for that problem (do NOT pad with filler).
- Keep each sub-line concise — phrases and short clauses, not theatrical paragraphs. Completeness, not length.
- Never invent counseling details that did not occur in the transcript.
- Shared decision-making must be visible: what was discussed, why the chosen option was selected, what the patient preferred, what the follow-up is.

═══════════════════════════════════════
SECTION 3C — MEDICATION-INITIATION VISITS (HORMONES, GLP-1s, CONTROLLED SUBSTANCES, INJECTABLES, CHRONIC DISEASE STARTS)
═══════════════════════════════════════
When a medication is being INITIATED at this visit (especially testosterone, estrogen, progesterone, thyroid hormone, GLP-1s like semaglutide/tirzepatide/liraglutide, controlled substances, naltrexone/LDN, injectables, or any new chronic disease therapy), the note MUST explicitly preserve — when the transcript contains them — the following counseling elements for that medication:

- Contraindication review (what was screened for / asked about)
- Side effect counseling (the specific side effects named to the patient)
- Administration counseling (injection technique, timing, storage, missed-dose handling)
- Titration plan (starting dose → schedule of dose increases → target)
- Safety precautions and return precautions (red-flag symptoms that should prompt a call)
- Patient consent / verbalized understanding / agreement to start

Example — if a GLP-1 is being initiated and the transcript contains the conversation: the Counseling / Education sub-line for that problem must document the risk/benefit discussion, the titration schedule, the injection technique and timing, the named side effects (nausea, GI effects, gallbladder, pancreatitis warning, mood/appetite monitoring), and that the patient verbalized understanding and agreed to start. Do NOT reduce this to one sentence when the transcript contains the actual content.

If the transcript does NOT contain a given counseling element, do NOT invent it. Only document what is actually present.

═══════════════════════════════════════
SECTION 4 — RECOMMENDATION DUPLICATE SUPPRESSION
═══════════════════════════════════════
The "needs_clinician_review" array must NEVER include items that duplicate the explicit plan.

Rules:
- If an action was explicitly decided and is in the Plan → SUPPRESS from needs_clinician_review
- needs_clinician_review should contain ONLY:
  a) Items from "discussed_but_not_decided" — unresolved considerations
  b) Items from "clinically_relevant_followup" — intelligent clinical additions not discussed
  c) Items flagged as uncertain requiring clinician verification
  d) Preventative medicine opportunities grounded in the visit context
- NEVER recommend an action the provider already decided to take
- Example: If provider explicitly decided "start testosterone" → do NOT put "Consider initiating testosterone" in needs_clinician_review

═══════════════════════════════════════
SECTION 4B — REVIEW OF SYSTEMS (ROS) FORMATTING — STRICT
═══════════════════════════════════════
The Review of Systems must ALWAYS be rendered as a fixed two-column chart — body system on the left, findings on the right. NEVER produce a running paragraph, a comma-separated single line, a bulleted list, or a partial subset of systems.

Rules — these are non-negotiable and apply on EVERY note:
1. Output exactly these 13 system rows, in this exact order, each on its own line:
   Constitutional, HEENT, Cardiovascular, Respiratory, Gastrointestinal, Genitourinary, Musculoskeletal, Skin, Neurological, Psychiatric, Endocrine, Hematologic/Lymphatic, Allergic/Immunologic.
2. Each row uses the format: "System Name: <findings>." — the colon between the system name and the findings is REQUIRED so the chart renders correctly.
3. No bullets ("-" or "•"), no dashes, no markdown tables, no numbering. One system per line, system name first, colon, findings, period.
4. Findings should list pertinent positives first, then pertinent negatives, separated by semicolons. Keep each row to one sentence or two short clauses.
5. If a system was NOT addressed in the encounter, write exactly: "System Name: Not addressed at this visit."
6. Do NOT invent symptoms — only document positives present in the transcript or extraction, plus relevant denials the patient explicitly negated.
7. This format MUST appear every time, regardless of visit length, visit type, or how brief the encounter was. Even a 5-minute focused visit gets all 13 rows (most will be "Not addressed at this visit.").
8. Do NOT collapse the ROS into the HPI. Do NOT skip the ROS section. Do NOT replace it with "see HPI."

This formatting rule applies to ROS ONLY. Assessment/Plan, Care Plan, Follow-up, HPI, and Medical History formatting are unchanged — keep those exactly as specified elsewhere in this prompt.

═══════════════════════════════════════
SECTION 5 — FABRICATION GUARDRAILS
═══════════════════════════════════════
- Do NOT invent BMI, weight, blood pressure, or lab values not provided
- Do NOT invent physical exam findings not documented
- Do NOT add medications not mentioned in the transcript
- Preserve all documented negatives
- If uncertain, flag in needs_clinician_review
- Physical Exam not performed → "Physical examination not performed at this encounter."

CRITICAL — HANDLING [SUGGESTED] ITEMS FROM CLINICAL INTERPRETATION:
Items labeled [SUGGESTED — clinician must approve before charting] require careful classification:
1. If the transcript shows the provider and patient DISCUSSED and AGREED to initiate/continue/adjust this item (i.e., it appears in "explicitly_decided_plan_items" or was clearly decided in the transcript) → include it as a regular numbered Plan item. It is NO LONGER a suggestion — it was adopted during the encounter.
2. If the item was NOT discussed or decided during the encounter → copy it to needs_clinician_review with prefix "SUGGESTED (awaiting clinician approval): ..."
3. The purpose of suggestions is to surface GAPS — things the lab interpretation flagged that the provider did NOT address during the visit. If the provider DID address it, it belongs in the Plan, not as a suggestion.

BMI VALUE MENTIONED — MANDATORY WEIGHT DIAGNOSIS RULE:
If ANY BMI value is explicitly mentioned, generate the appropriate weight classification as a numbered assessment item:
- BMI 25.0–29.9: "Overweight (E66.3)"
- BMI 30.0–34.9: "Obesity, Class I (E66.01)"
- BMI 35.0–39.9: "Obesity, Class II (E66.01)"
- BMI ≥40.0: "Obesity, Class III — Morbid Obesity (E66.01)"

PATIENT EDUCATION — MANDATORY DOCUMENTATION:
Document in THREE places: HPI narrative, Assessment item reasoning, Plan for that item.

MEDICATION-IMPLIED PMH — MANDATORY:
Psychiatric/sleep medications → corresponding conditions in PMH and Assessment. See medication list for specific mappings.

MEDICATION NAMES:
Use normalized medication list provided. Do NOT phonetically guess drug names.
LAB LEVEL TARGETS: "increase vitamin D to 60-80" = lab level target (ng/mL), NOT a dose.

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════
Return JSON with exactly these keys:
{
  "fullNote": "<complete formatted SOAP note as plain text>",
  "uncertain_items": ["<items needing clinician clarification>"],
  "needs_clinician_review": ["<specific flags — NO duplicates of explicit plan items>"]
}

Use this EXACT format for fullNote:

CC/Reason: [chief complaint or visit reason]

SUBJECTIVE

HPI: [DETAILED CLINICAL STORY RECONSTRUCTION — multiple paragraphs. See Section 1 rules above. This is the most important section — do not compress.]

Medical History:
- Allergies: [if mentioned, else "Not reported at this visit"]
- Past Medical Hx: [all mentioned + medication-implied conditions]
- Past Surgical Hx: [if mentioned]
- Social Hx: [if mentioned]
- Family Hx: [if mentioned]

ROS:
Constitutional: <pertinent positives; pertinent negatives — or "Not addressed at this visit.">
HEENT: <...>
Cardiovascular: <...>
Respiratory: <...>
Gastrointestinal: <...>
Genitourinary: <...>
Musculoskeletal: <...>
Skin: <...>
Neurological: <...>
Psychiatric: <...>
Endocrine: <...>
Hematologic/Lymphatic: <...>
Allergic/Immunologic: <...>
[See ROS FORMATTING RULES — all 13 systems must appear, in this exact order, each on its own line, in "System Name: findings." format. NEVER produce a paragraph, a comma-separated list, or a partial list.]

OBJECTIVE

Vitals: [if provided; if not: "Not obtained at this encounter"]
Physical Exam: [if performed; if not: "Physical examination not performed at this encounter."]
[Include objective data from linked lab results if provided]

ASSESSMENT/PLAN

[Assessment Summary paragraph — 2-4 sentences synthesizing the clinical picture BEFORE the numbered list]

1. Diagnosis Name (ICD-10 code)
[Supporting evidence and clinical reasoning — 2-3 sentences on their own lines]
Plan: [specific medications/doses, labs ordered, referrals]
Counseling / Education: [include only if real counseling content exists for this problem — name the specific risks/benefits, side effects, titration, administration, alternatives, rationale, and patient understanding/agreement that were actually discussed]
Monitoring / Follow-up: [include only if real monitoring content exists for this problem — labs to recheck and when, parameters being tracked, follow-up interval, return precautions]

2. Diagnosis Name (ICD-10 code)
[Supporting evidence and clinical reasoning]
Plan: [...]
Counseling / Education: [omit if not applicable]
Monitoring / Follow-up: [omit if not applicable]

[Continue for each diagnosis]

CARE PLAN
[Patient-readable action list — specific, named, complete]

FOLLOW-UP
[Specific interval with clinical rationale]

PROSE STANDARDS:
- Third person, past tense for Subjective, present for Assessment/Plan
- Standard medical abbreviations
- No redundancy
- Numerals for doses/measurements
- Integrate lab values naturally into narrative

CRITICAL — PATIENT vs. CLINICIAN IDENTITY:
- The PATIENT is the person being treated. Their name will be provided below. Use ONLY the patient's name (or "patient"/"she"/"he") when referring to the person receiving care.
- The CLINICIAN/PROVIDER is the person conducting the visit. NEVER use the clinician's name as the patient. The transcript is often recorded from the clinician's perspective — do NOT confuse the speaker with the patient.
- If the transcript is narrated in first person by the clinician (e.g., "I told her...", "we discussed..."), the "I" is the CLINICIAN, not the patient.`;

  const patientLine = patientName ? `\nPatient Name: ${patientName}` : "";
  const userPrompt = `Visit Type: ${encounter.visitType}
Chief Complaint: ${encounter.chiefComplaint || "Not specified"}
Visit Date: ${new Date(encounter.visitDate).toLocaleDateString()}${patientLine}${labContext}${extractionSummary}${patternContext}${medicationContext}${normalizedMedsContext}${conditionsContext}${preventativeContext}${symptomTimelineContext}${planClassification}${hpiElements}${patientPerspective}${providerReasoning}${educationProvided}${patientDecisions}

TRANSCRIPT:
${diarizedInput}

Generate the SOAP note following all rules above. The HPI must be a DETAILED RECONSTRUCTION of the clinical encounter, not a compressed summary.${patientName ? ` The patient's name is "${patientName}" — use this name (NOT the clinician's name) when referring to the patient in the note.` : ""} Flag uncertain items and non-duplicate recommendations in needs_clinician_review.`;

  const completion = await retryOnRateLimit(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  }));

  const soapResult = JSON.parse(completion.choices[0].message.content || "{}");
  return {
    fullNote: soapResult.fullNote ?? "",
    uncertain_items: soapResult.uncertain_items ?? [],
    needs_clinician_review: soapResult.needs_clinician_review ?? [],
  };
}

async function qaCheck(
  openai: OpenAI,
  extraction: any,
  normalized: NormalizedExtraction,
  soapOutput: PipelineOutput,
  transcriptText: string
): Promise<PipelineOutput> {
  const systemPrompt = `You are a clinical documentation quality assurance specialist. Your job is to compare the SOAP note against the source extraction data and transcript to catch omissions, contradictions, and over-compression.

CHECK FOR:
1. MEDICATION OMISSIONS: Are all medications from the extraction present in the SOAP note? Every medication in medications_current must appear somewhere (HPI or Care Plan).
2. SYMPTOM OMISSIONS: Are all reported symptoms captured in the HPI? Secondary concerns must not be lost.
3. SIDE EFFECT OMISSIONS: Were side effects or tolerability issues discussed but not documented?
4. PRIOR TREATMENT OMISSIONS: Were prior medication trials or failed treatments mentioned but not captured?
5. DIAGNOSIS OMISSIONS: Are medication-implied conditions documented in PMH and Assessment?
6. EDUCATION OMISSIONS: Was patient education provided but not documented in all three required places?
7. PATIENT DECISION OMISSIONS: Did the patient state decisions/preferences that were not documented?
8. CONTRADICTIONS: Does the note contradict any transcript facts? (e.g., "denies nausea" when patient reported nausea)
9. TENSE ERRORS: Are recommended medications incorrectly presented as current medications?
10. OVER-COMPRESSION: Does the HPI reduce a rich, multi-topic encounter to a brief summary? Is the HPI proportional to the visit depth?
11. PREVENTATIVE SIGNALS LOST: Were clinically relevant "between the lines" clues identified in normalization but not reflected in the Assessment?
12. RECOMMENDATION DUPLICATES: Does needs_clinician_review contain items that duplicate the explicit Plan?
13. MISCLASSIFIED SUGGESTIONS: Does needs_clinician_review contain "SUGGESTED (awaiting clinician approval):" items for actions that were EXPLICITLY DISCUSSED AND DECIDED during the encounter? If the transcript and extraction show the provider and patient agreed to initiate/adjust/continue something, it must be in the Plan as a decided action, NOT in needs_clinician_review as a suggestion. Move it to the Plan and remove from needs_clinician_review.
14. COUNSELING / SDM UNDER-DOCUMENTATION: When the transcript contains real counseling content (risks/benefits, side effects named, mechanism explained, titration schedule, administration instructions, alternatives discussed, rationale for the chosen option, return precautions, patient verbalized understanding/agreement) — does the SOAP note's relevant Assessment/Plan item actually preserve those specifics, or does it collapse them into vague phrases like "treatment discussed", "options reviewed", "patient interested", or a generic "risks and benefits discussed" without naming what was actually said? If under-documented, REVISE the affected numbered item by adding a "Counseling / Education:" sub-line (and a "Monitoring / Follow-up:" sub-line where applicable) that names the specific counseling points that occurred. Do NOT invent counseling content that is not in the transcript.
15. MEDICATION INITIATION COUNSELING: For any medication being INITIATED at this visit (especially hormones, GLP-1s, controlled substances, injectables, chronic disease starts) — is the counseling that occurred in the transcript (contraindication review, side effect counseling, administration counseling, titration plan, safety/return precautions, patient consent/understanding) actually documented under that problem? If the transcript contains it and the note collapsed it, restore the specifics in a "Counseling / Education:" sub-line for that problem. Concise but specific — not theatrical.
16. SHARED DECISION-MAKING VISIBILITY: When the transcript shows the patient and provider weighed alternatives or the patient stated a preference, the note must make the SDM visible: what was discussed, why the chosen option was selected, what the patient preferred, and the follow-up. If missing, add it concisely.
17. ROS FORMAT COMPLIANCE: Is the Review of Systems rendered as the required 13-row two-column chart, with each of these systems on its own line in this exact order — Constitutional, HEENT, Cardiovascular, Respiratory, Gastrointestinal, Genitourinary, Musculoskeletal, Skin, Neurological, Psychiatric, Endocrine, Hematologic/Lymphatic, Allergic/Immunologic — each in "System Name: findings." format (colon required)? If the ROS was instead written as a paragraph, a comma-separated list, a bulleted list, a partial subset of systems, or any other format — REVISE the ROS section to the strict 13-row chart format. Use "Not addressed at this visit." for any system that was not discussed. Do NOT invent symptoms; preserve all documented positives and negatives. This rule applies to the ROS section ONLY — do NOT alter Assessment/Plan/HPI/Care Plan/Follow-up formatting.

CRITICAL — DIAGNOSIS PRESERVATION:
- Do NOT remove a diagnosis from the Assessment simply because you cannot find supporting dialogue in the transcript portion you can see. Long encounters discuss conditions throughout the visit; supporting evidence may appear anywhere in the conversation.
- Only flag a diagnosis for removal if it directly contradicts something explicitly stated in the transcript or extraction (e.g., note says "diabetes" but extraction and transcript both deny diabetes).
- If anything in the structured extraction (diagnoses_discussed, assessment_candidates, conditions_inferred, medications_current with their implied conditions, symptoms_reported, labs_reviewed) supports a diagnosis, that diagnosis is valid and must be kept.
- Err on the side of KEEPING diagnoses. The provider can remove them if not relevant; missing diagnoses are far worse than extra ones.
- The Assessment should reflect ALL clinically relevant problems discussed across the entire encounter. Do not impose any cap on the number of assessment items.

RESPONSE FORMAT:
{
  "issues_found": [
    {
      "type": "omission|contradiction|over_compression|tense_error|recommendation_duplicate",
      "severity": "critical|important|minor",
      "description": "what was missed or wrong",
      "fix_instruction": "specific instruction for how to fix this in the note"
    }
  ],
  "requires_revision": true/false,
  "revised_fullNote": "<if requires_revision is true, provide the corrected fullNote with all issues fixed; if false, omit this field>",
  "revised_uncertain_items": ["<if revised, updated uncertain_items>"],
  "revised_needs_clinician_review": ["<if revised, updated needs_clinician_review with duplicates removed>"]
}

CRITICAL: Only flag requires_revision for critical or important issues. Minor issues can be noted but do not require revision.
If requires_revision is true, you MUST provide the complete revised_fullNote — do not provide partial patches.`;

  const userPrompt = `STRUCTURED EXTRACTION (source of truth for what was discussed):
${JSON.stringify(extraction, null, 2)}

NORMALIZED INTELLIGENCE:
- Medications: ${JSON.stringify(normalized.medications_normalized)}
- Conditions inferred: ${JSON.stringify(normalized.conditions_inferred)}
- Preventative signals: ${JSON.stringify(normalized.preventative_signals)}
- Explicitly decided plan items: ${JSON.stringify(normalized.explicitly_decided_plan_items)}
- Discussed but not decided: ${JSON.stringify(normalized.discussed_but_not_decided)}

GENERATED SOAP NOTE:
${soapOutput.fullNote}

NEEDS_CLINICIAN_REVIEW (check for duplicates of plan):
${JSON.stringify(soapOutput.needs_clinician_review)}

TRANSCRIPT (full conversation — review the entire encounter, including later sections, before flagging diagnoses or findings as unsupported):
${transcriptText.substring(0, 60000)}

Review the note for quality issues. If critical/important issues are found, provide a corrected version.`;

  const completion = await retryOnRateLimit(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  }));

  const qaResult = JSON.parse(completion.choices[0].message.content || "{}");

  if (qaResult.requires_revision && qaResult.revised_fullNote) {
    console.log(`[SOAP Pipeline QA] Revision applied. Issues found: ${qaResult.issues_found?.length ?? 0}`);
    return {
      fullNote: qaResult.revised_fullNote,
      uncertain_items: qaResult.revised_uncertain_items ?? soapOutput.uncertain_items,
      needs_clinician_review: qaResult.revised_needs_clinician_review ?? soapOutput.needs_clinician_review,
    };
  }

  if (qaResult.issues_found?.length) {
    console.log(`[SOAP Pipeline QA] ${qaResult.issues_found.length} minor issues noted, no revision needed.`);
  }

  return soapOutput;
}

function buildExtractionSummary(extraction: any): string {
  if (!extraction) return "";
  const lines: string[] = [];
  if (extraction.chief_concerns?.length)             lines.push(`Chief concerns: ${extraction.chief_concerns.join("; ")}`);
  if (extraction.secondary_concerns?.length)         lines.push(`Secondary concerns: ${extraction.secondary_concerns.join("; ")}`);
  if (extraction.symptoms_reported?.length)           lines.push(`Symptoms reported: ${extraction.symptoms_reported.join("; ")}`);
  if (extraction.symptoms_denied?.length)             lines.push(`Symptoms denied: ${extraction.symptoms_denied.join("; ")}`);
  if (extraction.medications_current?.length)         lines.push(`Current medications: ${extraction.medications_current.join("; ")}`);
  if (extraction.supplements_current?.length)         lines.push(`Current supplements: ${extraction.supplements_current.join("; ")}`);
  if (extraction.medication_changes_discussed?.length) lines.push(`Medication changes discussed: ${extraction.medication_changes_discussed.join("; ")}`);
  if (extraction.labs_reviewed?.length)               lines.push(`Labs reviewed: ${extraction.labs_reviewed.join("; ")}`);
  if (extraction.allergies?.length)                   lines.push(`Allergies: ${extraction.allergies.join("; ")}`);
  if (extraction.past_medical_history?.length)        lines.push(`Past medical history: ${extraction.past_medical_history.join("; ")}`);
  if (extraction.surgical_history?.length)            lines.push(`Surgical history: ${extraction.surgical_history.join("; ")}`);
  if (extraction.family_history?.length)              lines.push(`Family history: ${extraction.family_history.join("; ")}`);
  if (extraction.social_history?.length)              lines.push(`Social history: ${extraction.social_history.join("; ")}`);
  if (extraction.mental_health_context?.length)       lines.push(`Mental health context: ${extraction.mental_health_context.join("; ")}`);
  if (extraction.lifestyle_factors?.length)           lines.push(`Lifestyle factors: ${extraction.lifestyle_factors.join("; ")}`);
  if (extraction.prior_treatments_and_trials?.length) lines.push(`Prior treatments/trials: ${extraction.prior_treatments_and_trials.join("; ")}`);
  if (extraction.side_effects_reported?.length)       lines.push(`Side effects reported: ${extraction.side_effects_reported.join("; ")}`);
  if (extraction.diagnoses_discussed?.length)         lines.push(`Diagnoses discussed: ${extraction.diagnoses_discussed.join("; ")}`);
  if (extraction.assessment_candidates?.length)       lines.push(`Assessment candidates (uncertain): ${extraction.assessment_candidates.join("; ")}`);
  if (extraction.plan_candidates?.length)             lines.push(`Plan items discussed: ${extraction.plan_candidates.join("; ")}`);
  if (extraction.follow_up_items?.length)             lines.push(`Follow-up items: ${extraction.follow_up_items.join("; ")}`);
  if (extraction.red_flags?.length)                   lines.push(`Red flags noted: ${extraction.red_flags.join("; ")}`);
  if (extraction.uncertain_items?.length)             lines.push(`Uncertain/unresolved: ${extraction.uncertain_items.join("; ")}`);
  if (extraction.context_inferred_items?.length)      lines.push(`Context-inferred (confirm with patient): ${extraction.context_inferred_items.join("; ")}`);
  if (extraction.patient_questions?.length)           lines.push(`Patient questions: ${extraction.patient_questions.join("; ")}`);
  return lines.length ? `\n\nSTRUCTURED CLINICAL EXTRACTION (verified from transcript):\n${lines.join('\n')}` : "";
}

export async function runEnhancedSoapPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { openai, extraction, transcriptText, diarized, labContext, patternContext, medicationContext, encounter } = input;

  console.log("[SOAP Pipeline] Step 3c: Medical normalization + context inference...");
  let normalized: NormalizedExtraction;
  try {
    normalized = await medicalNormalizationAndInference(openai, extraction, transcriptText, diarized);
    console.log(`[SOAP Pipeline] Normalization complete: ${normalized.medications_normalized.length} meds, ${normalized.conditions_inferred.length} conditions, ${normalized.preventative_signals.length} preventative signals`);
    console.log(`[SOAP Pipeline] Plan classification: ${normalized.explicitly_decided_plan_items.length} decided, ${normalized.discussed_but_not_decided.length} discussed, ${normalized.clinically_relevant_followup.length} follow-up`);
  } catch (err) {
    console.warn("[SOAP Pipeline] Normalization/inference failed, proceeding with extraction only:", err);
    normalized = {
      medications_normalized: [],
      conditions_inferred: [],
      preventative_signals: [],
      symptom_timeline: [],
      explicitly_decided_plan_items: [],
      discussed_but_not_decided: [],
      clinically_relevant_followup: [],
      enhanced_extraction: {},
    };
  }

  console.log("[SOAP Pipeline] Step 4: Section-specific SOAP generation (HPI reconstruction)...");
  let soapOutput: PipelineOutput;
  try {
    soapOutput = await generateSoapSections(
      openai, extraction, normalized, transcriptText, diarized,
      labContext, patternContext, medicationContext, encounter, input.patientName
    );
  } catch (err) {
    console.error("[SOAP Pipeline] SOAP generation failed:", err);
    throw err;
  }

  console.log("[SOAP Pipeline] Step 5: Omission/contradiction QA check...");
  try {
    soapOutput = await qaCheck(openai, extraction, normalized, soapOutput, transcriptText);
  } catch (qaErr) {
    console.warn("[SOAP Pipeline] QA check failed, using unrevised SOAP:", qaErr);
  }

  console.log("[SOAP Pipeline] Pipeline complete.");
  return soapOutput;
}
