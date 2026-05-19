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
  historicalContext?: string;
  diagnosisBundles?: Array<{
    title: string;
    codes: { code: string; name: string }[];
    aliases: string[];
  }>;
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
    causality?: "pre_existing" | "medication_side_effect" | "temporally_associated" | "exacerbation_of_chronic" | "unrelated_coincidental" | "differential" | "confirmed" | "unknown";
  }>;
  explicitly_decided_plan_items: string[];
  discussed_but_not_decided: string[];
  future_considerations: Array<{
    item: string;
    deferred_reason: string;
    deferred_trigger: "next_visit" | "labs_pending" | "patient_consideration" | "specialist_evaluation" | "insurance_approval" | "condition_stabilization" | "symptom_progression" | "other";
  }>;
  exploratory_discussions: string[];
  treatment_rationale: Array<{
    treatment: string;
    symptoms_addressed: string[];
    diagnosis_pattern: string;
    relevant_labs: string[];
    prior_treatment_context: string;
    provider_reasoning: string;
  }>;
  clinically_relevant_followup: string[];
  matched_bundles: Array<{
    bundle_title: string;
    matched_codes: string[];
    confidence: "strong" | "moderate" | "weak";
    rationale: string;
  }>;
  enhanced_extraction: any;
}

async function medicalNormalizationAndInference(
  openai: OpenAI,
  extraction: any,
  transcriptText: string,
  diarized: any[],
  diagnosisBundles?: Array<{ title: string; codes: { code: string; name: string }[]; aliases: string[] }>
): Promise<NormalizedExtraction> {
  const diarizedInput = diarized.length > 0
    ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
    : transcriptText;

  const systemPrompt = `You are a clinical intelligence engine specializing in medical normalization, context inference, and plan-decision classification.

You receive:
1. Structured clinical extraction (JSON) from a prior pipeline stage
2. The original diarized transcript

Your job has FIVE parts:

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
This is CRITICAL for recommendation quality. Classify every discussed action item into exactly one of these four states:

STATE A — "explicitly_decided_plan_items": Provider clearly and definitively committed to this action. Patient agreed or provider stated it as a decision. → Add as a string to this array.
   Trigger phrases: "I'm going to start you on", "let's do", "we'll begin", "I'll order", "I'm prescribing", "continue current dose", "we decided to"

STATE B — "discussed_but_not_decided": Topic was raised AND definitively deferred — a specific reason or trigger for deferral is identifiable. → Add as a string to "discussed_but_not_decided" AND as an object to "future_considerations" with deferred_reason and deferred_trigger.
   Trigger phrases: "once labs come back", "we'll revisit at next visit", "if symptoms worsen", "once you decide", "pending specialist", "once insurance approves", "after we stabilize X first", "come back and we'll discuss"
   Deferred trigger values: next_visit | labs_pending | patient_consideration | specialist_evaluation | insurance_approval | condition_stabilization | symptom_progression | other

STATE C — "exploratory_discussions": Theoretical or speculative discussion — possibilities floated conversationally with no near-term commitment or specific deferral trigger. → Add to "exploratory_discussions" ONLY. Do NOT add to discussed_but_not_decided.
   Trigger phrases: "someday we might think about", "just so you're aware that option exists", "theoretically we could", conversational musings about distant future possibilities with no specific plan

STATE D — "clinically_relevant_followup": Items NOT discussed but clinically relevant given context. → Add to this array only. Never appears in Plan.
   Examples: Preventative screenings suggested by age/risk, monitoring implied by medication class, follow-up labs implied by treatment changes

═══════════════════════════════════════
PART 4B — TREATMENT RATIONALE EXTRACTION
═══════════════════════════════════════
For each STATE A treatment being INITIATED or CHANGED at this visit, and for each STATE B item discussed with clinical depth, extract the full treatment rationale into "treatment_rationale":
- treatment: the medication or intervention name
- symptoms_addressed: list of specific symptoms or complaints this treatment directly addresses
- diagnosis_pattern: the underlying diagnosis or clinical pattern driving the decision
- relevant_labs: specific lab values or findings supporting the choice (e.g., "Free T 0.8 pg/mL below therapeutic range")
- prior_treatment_context: any prior treatment failures, intolerances, or alternatives that were considered and rejected (empty string if none)
- provider_reasoning: the provider's stated rationale extracted verbatim or as close paraphrase from the transcript — WHY this treatment, WHY this dose, WHY now

═══════════════════════════════════════
PART 4C — SYMPTOM CAUSALITY CLASSIFICATION
═══════════════════════════════════════
For each symptom in "symptom_timeline", classify its causality:
- pre_existing: symptom/condition was present before any medication or treatment mentioned in this visit
- medication_side_effect: provider or patient directly and explicitly attributes the symptom to a specific medication
- temporally_associated: symptom onset correlates with medication start but causality is NOT confirmed by provider
- exacerbation_of_chronic: worsening of a known pre-existing condition (the underlying condition is not new)
- unrelated_coincidental: provider explicitly notes it is likely unrelated to current treatments
- differential: named as a possible cause under consideration but not confirmed
- confirmed: provider explicitly confirmed the diagnosis or causal relationship
- unknown: insufficient information to classify

═══════════════════════════════════════
PART 5 — DIAGNOSIS BUNDLE MATCHING
═══════════════════════════════════════
If PROVIDER DIAGNOSIS BUNDLES are provided in the user message, evaluate whether the clinical pattern of this visit matches one or more of those bundles. A diagnosis bundle is a clinician-defined grouping of related diagnoses that together represent a unified clinical picture (e.g., "Early Hormone Transition" grouping HSDD, perimenopause, fatigue, and sleep disturbance).

MATCHING CRITERIA:
- STRONG: ≥ 2/3 of the bundle's component diagnoses are discussed explicitly with clinical depth (symptoms, labs, treatment decisions) AND the visit clearly revolves around this pattern as its central theme
- MODERATE: The core diagnoses of the bundle are discussed but not all components, AND the provider's framing aligns with the bundle's clinical concept
- WEAK: Some overlap but the visit's primary focus is on a different issue, or fewer than half the component diagnoses were substantively discussed

If matched (strong or moderate): add to "matched_bundles" with bundle_title (exact title from the bundle list), matched_codes (only the codes from the bundle that were relevant to this visit), confidence, and rationale (one sentence: which diagnoses were discussed and why the bundle fits).
If no match or weak confidence only: return empty "matched_bundles" array.
If no PROVIDER DIAGNOSIS BUNDLES were provided in the user message: return empty "matched_bundles" array.

RULE — CURRENT MEDICATIONS MENTIONED IN ANY CLINICAL CONTEXT:
If a medication has status = "current" AND it was referenced in ANY clinical context during this encounter — including: dose stated, tolerability asked about, efficacy or weight discussed in its context, labs reviewed in relation to it, continuation confirmed, patient asked about it, side effects mentioned, refill discussed, or it was simply acknowledged as part of the ongoing plan of care — you MUST add it to "explicitly_decided_plan_items" using this format:
"Continue [medication name] [dose] [route] [frequency] — reviewed and continued at this visit"
The threshold is LOW. If the medication was brought up in any way that indicates it is part of this patient's active treatment plan, it belongs in explicitly_decided_plan_items. A medication is considered "discussed" even if it was mentioned in a single sentence. Do NOT require extensive discussion — ANY acknowledgment in a clinical context counts. Failing to include it means the note-writing stage will silently omit it from the Assessment/Plan, which is unacceptable.

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
      "context": "relevant context",
      "causality": "pre_existing|medication_side_effect|temporally_associated|exacerbation_of_chronic|unrelated_coincidental|differential|confirmed|unknown"
    }
  ],
  "explicitly_decided_plan_items": ["STATE A — list of plan items the provider definitively committed to"],
  "discussed_but_not_decided": ["STATE B — list of items discussed but definitively deferred (also populate future_considerations)"],
  "future_considerations": [
    {
      "item": "what was discussed",
      "deferred_reason": "specific reason for deferral in plain language",
      "deferred_trigger": "next_visit|labs_pending|patient_consideration|specialist_evaluation|insurance_approval|condition_stabilization|symptom_progression|other"
    }
  ],
  "exploratory_discussions": ["STATE C — conversational/theoretical possibilities with no near-term plan"],
  "treatment_rationale": [
    {
      "treatment": "medication or intervention name",
      "symptoms_addressed": ["symptom1", "symptom2"],
      "diagnosis_pattern": "underlying diagnosis or clinical pattern",
      "relevant_labs": ["specific lab value or finding supporting the decision"],
      "prior_treatment_context": "prior failures, intolerances, alternatives considered — or empty string",
      "provider_reasoning": "provider's stated rationale extracted from transcript"
    }
  ],
  "clinically_relevant_followup": ["STATE D — clinically relevant items not discussed"],
  "matched_bundles": [
    {
      "bundle_title": "exact title from the provider bundle list",
      "matched_codes": ["ICD-10 codes from the bundle that were relevant to this visit"],
      "confidence": "strong|moderate|weak",
      "rationale": "one sentence: which diagnoses were discussed and why the bundle fits"
    }
  ],
  "enhanced_extraction": {
    "hpi_chronological_elements": ["ordered list of clinically relevant events/discussions as they occurred in the visit, for HPI reconstruction"],
    "patient_perspective_statements": ["direct or paraphrased patient statements that are medically relevant"],
    "provider_reasoning_statements": ["provider explanations, interpretations, or clinical reasoning shared with patient"],
    "education_provided": ["specific clinical education topics discussed with depth of what was explained"],
    "patient_decisions": ["patient-stated decisions, preferences, or deferred choices"]
  }
}`;

  const bundlesBlock = diagnosisBundles?.length
    ? `\nPROVIDER DIAGNOSIS BUNDLES (evaluate for PART 5 pattern matching):\n${diagnosisBundles.map(b =>
        `- "${b.title}": ${b.codes.map(c => `${c.code} (${c.name})`).join(", ")}${b.aliases?.length ? ` | keywords: ${b.aliases.join(", ")}` : ""}`
      ).join('\n')}`
    : "";

  const userPrompt = `STRUCTURED EXTRACTION (from prior pipeline stage):
${JSON.stringify(extraction, null, 2)}${bundlesBlock}

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
    future_considerations: result.future_considerations ?? [],
    exploratory_discussions: result.exploratory_discussions ?? [],
    treatment_rationale: result.treatment_rationale ?? [],
    clinically_relevant_followup: result.clinically_relevant_followup ?? [],
    matched_bundles: result.matched_bundles ?? [],
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
  patientName?: string,
  historicalContext?: string,
  diagnosisBundles?: Array<{ title: string; codes: { code: string; name: string }[]; aliases: string[] }>
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
        `- ${s.symptom} [${s.trajectory}${s.causality ? ` / causality:${s.causality}` : ""}]${s.onset ? ` onset: ${s.onset}` : ""}${s.duration ? ` duration: ${s.duration}` : ""}${s.context ? ` — ${s.context}` : ""}`
      ).join('\n')}`
    : "";

  const futureConsiderationsContext = normalized.future_considerations?.length
    ? `\nFUTURE CONSIDERATIONS (STATE B — deferred with specific trigger; MUST receive a numbered Assessment/Plan entry; Plan line must name the deferral reason):\n${normalized.future_considerations.map(f =>
        `- ${f.item} | deferred because: ${f.deferred_reason} | trigger type: ${f.deferred_trigger}`
      ).join('\n')}`
    : "";

  const exploratoryContext = normalized.exploratory_discussions?.length
    ? `\nEXPLORATORY DISCUSSIONS (STATE C — conversational possibilities only; do NOT create Assessment entries or needs_clinician_review items; brief HPI mention is acceptable if clinically relevant):\n${normalized.exploratory_discussions.map(e => `- ${e}`).join('\n')}`
    : "";

  const treatmentRationaleContext = normalized.treatment_rationale?.length
    ? `\nTREATMENT RATIONALE (use to build the clinical reasoning paragraph for each Assessment item — these are the WHY behind each treatment decision):\n${normalized.treatment_rationale.map(t =>
        `- ${t.treatment}:\n    Symptoms addressed: ${t.symptoms_addressed.join(", ") || "not specified"}\n    Diagnosis/pattern: ${t.diagnosis_pattern || "not specified"}\n    Supporting labs: ${t.relevant_labs.join(", ") || "none cited"}\n    Prior treatment context: ${t.prior_treatment_context || "none"}\n    Provider reasoning: ${t.provider_reasoning || "not captured"}`
      ).join('\n')}`
    : "";

  const planClassification = `
PLAN DECISION CLASSIFICATION (use these states to determine note language — see DECISION-STATE DOCUMENTATION LANGUAGE rules):
STATE A — Explicitly decided (include in Plan as definitive order): ${normalized.explicitly_decided_plan_items?.length ? normalized.explicitly_decided_plan_items.join("; ") : "none identified"}
STATE B — Future consideration (MUST receive a numbered Assessment/Plan entry; Plan line must reflect the specific deferral reason and trigger): ${normalized.discussed_but_not_decided?.length ? normalized.discussed_but_not_decided.join("; ") : "none"}
STATE C — Exploratory discussion (do NOT create Assessment entries; brief HPI mention only if relevant): ${normalized.exploratory_discussions?.length ? normalized.exploratory_discussions.join("; ") : "none"}
STATE D — Clinically relevant follow-up (for needs_clinician_review only; never in Plan): ${normalized.clinically_relevant_followup?.length ? normalized.clinically_relevant_followup.join("; ") : "none"}`;

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

  const systemPrompt = `You are a clinical documentation specialist writing chart-ready SOAP notes for a concierge hormone optimization and primary care practice. Your notes read like those of a highly competent internist or NP with deep expertise in hormone therapy, metabolic medicine, and functional primary care — someone who synthesizes clinical patterns effortlessly and writes with precision and confidence. You are not a transcriptionist. You are not an AI explaining medicine to a layperson. You form clinical impressions and document them efficiently.

STYLE STANDARD:
- Intelligent and clinically sophisticated — write for a provider reading this note, not for an insurance reviewer
- Efficient over verbose — a densely reasoned paragraph is better than three repetitive bullets
- Show clinical thinking: connect symptoms to labs to treatment rationale in a single flowing statement
- Avoid over-explaining common medical concepts (do not explain what hypothyroidism is; document its management)
- Integrate patient education into the treatment narrative naturally — it should read as part of the clinical reasoning, not as a bolted-on "Counseling" section
- The note should feel like a real clinician synthesizing a real encounter, not a template being filled in

DOCUMENT EVERYTHING — but document it once, where it belongs. Completeness means every clinical decision is captured with its reasoning, dosing, and monitoring. It does not mean repeating the same medication in five separate places or narrating the patient's personal story.

════════════════════════════════════════
FOUR-LOCATION MANDATE — THE OVERARCHING RULE
════════════════════════════════════════
Every medication, supplement, or treatment plan item that is discussed, acknowledged, mentioned, or referenced in relation to this patient's health during the encounter MUST appear in ALL applicable sections of this note:

  1. HPI — mentioned with clinical context (what was discussed, its relevance, tolerability, response)
  2. Current Medications — listed with dose/route/frequency if the patient is currently taking it
  3. Assessment/Plan — as a numbered item with diagnosis, clinical reasoning, plan details, and monitoring
  4. Care Plan — as a patient-actionable item

This rule applies to ALL of the following:
- Existing medications being continued (even if "just" acknowledged or confirmed)
- Dose adjustments and titrations
- New prescriptions being started
- Supplements and OTC recommendations
- Any treatment that is part of this patient's active plan of care

There are NO exceptions. A medication listed only in Current Medications but absent from A/P is an incomplete, deficient note. A medication acknowledged in the transcript but missing from the HPI narrative is a documentation failure. The note is not complete until every clinically referenced item appears in all four applicable locations.

════════════════════════════════════════
CORE RULES — NON-NEGOTIABLE
════════════════════════════════════════

1. DO NOT OMIT CLINICAL ACTIONS
   If a treatment, medication, supplement, or intervention is discussed AND reasonably intended for use, it MUST be included in the Assessment & Plan — even if briefly mentioned.

2. CAPTURE ALL MEDICATION DECISIONS
   Include ALL of the following:
   - New prescriptions
   - Dose changes or titrations
   - "Let's try this" or "we can add this" statements
   - PRN or optional add-ons
   - Over-the-counter recommendations
   - Supplements (vitamin D, magnesium, omega-3, berberine, etc.)
   - Existing medications acknowledged or confirmed as continuing
   Even if the plan is tentative, include it clearly in the note.

3. DISTINGUISH DISCUSSED vs. INTENDED PLAN
   - DISCUSSED ONLY (education, options presented, patient declined): document in HPI and reasoning — do NOT put in the Plan as decided
   - INTENDED PLAN (provider expressed intent): if the provider said "let's try," "I'll send," "we can start," "go ahead and," "continue," or similar intent/continuation language — put it in Assessment/Plan as a decided item.

4. DO NOT PRIORITIZE BY FREQUENCY
   Even if something is mentioned ONCE, if it affects patient care, INCLUDE IT. A single sentence about a supplement, a dose change, or a PRN option is clinically significant.

5. INCLUDE DOSING WHEN AVAILABLE
   If a medication dose, frequency, route, or titration plan is mentioned anywhere in the transcript, include it in the Plan. Do not strip dosing detail.

6. CURRENT MEDICATIONS THAT APPEAR IN THE ENCOUNTER MUST APPEAR IN ASSESSMENT/PLAN
   Listing a medication in Current Medications is never sufficient on its own. If the transcript contains any clinical mention of that medication — dose stated, tolerability asked, efficacy noted, labs reviewed in context of it, refill discussed, or continuation of plan acknowledged — it MUST receive its own numbered Assessment/Plan item AND appear in the HPI with context AND appear in the Care Plan.

7. DO NOT SUMMARIZE AWAY CLINICAL DETAIL
   Preserve meaningful clinical nuance:
   - Reasoning behind decisions
   - Symptom associations that drove the decision
   - Medication rationale (why this drug, why this dose)
   - Conditional plans ("if this doesn't work in 4 weeks, we'll...")

8. ERR ON THE SIDE OF OVER-INCLUSION
   It is better to include slightly more than to miss something clinically important. The provider can trim; they cannot recover what was never documented.

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
1. NARRATIVE CONTINUITY AND GROUPING — HIGHEST PRIORITY: The HPI must follow the natural clinical flow of the encounter, with related symptoms and conditions kept together. Do not scatter a symptom cluster across multiple paragraphs. Do not jump abruptly between unrelated topics. Group clinically related concerns into unified paragraphs, then transition clearly to the next topic. The note should read like a coherent clinical story, not a list of disconnected observations.

   GROUPING GUIDE — keep these together in a single paragraph or contiguous passage:
   - Hormonal symptoms: fatigue, libido, mood, brain fog, menstrual irregularity, hot flashes, vaginal dryness, testosterone/estrogen/progesterone discussion
   - Metabolic/weight: weight changes, appetite, GLP-1 therapy, insulin resistance, blood sugar, metabolic labs (A1c, fasting glucose, insulin, HOMA-IR)
   - Sleep: insomnia, sleep quality, sleep apnea, night sweats, progesterone for sleep
   - Thyroid: energy, cold intolerance, hair loss, TSH/T4/T3 discussion, levothyroxine/liothyronine management
   - Cardiovascular/lipids: BP, cholesterol panel, Lp(a), ApoB, cardiovascular risk discussion
   - Nutrient deficiencies: vitamin D, B12, ferritin, magnesium, zinc — group together when multiple discussed
   - Mental health: anxiety, depression, mood changes, psychiatric medications
   - GI: constipation, nausea, bloating, GI side effects of medications

2. WITHIN-TOPIC FLOW: For each topic group, document in this natural order: (a) patient's symptoms/concerns, (b) relevant clinical interpretation or pattern recognition, (c) discussion and treatment plan for that topic. This way the treatment rationale is immediately adjacent to the symptoms it addresses — not separated by other content.

3. TRANSITIONS: Use brief, natural transitions between topic groups: "Turning to her thyroid management...", "With respect to sleep...", "Labs were also reviewed and notable for..."

4. CLINICAL COMPLETENESS: Every medically relevant topic discussed belongs in the HPI. A comprehensive wellness visit should produce 3-5+ paragraphs, but those paragraphs should be clinically dense, not narratively padded.

5. PATIENT VOICE — CLINICAL FRAMING ONLY: Paraphrase clinically. "Fatigue interfering with daily function" is clinical. Personal biographical details or social anecdotes belong only if they directly clarify symptom severity or diagnostic reasoning.

6. PROVIDER REASONING: Document clinical reasoning efficiently in provider voice: "Labs reviewed and notable for...", "Consistent with...", "Decision made to..."

7. MEDICATION HISTORY: Note tolerability, duration, and response where clinically relevant. Do not pad with unnecessary detail about medications being continued unchanged.

8. PRIOR TREATMENT HISTORY: "Previously trialed [X], discontinued due to [specific reason]." One efficient sentence.

9. DENIED SYMPTOMS: Weave naturally: "She denies nausea, vomiting, or injection site reactions."

10. PROPORTIONALITY: Long because it contains clinical reasoning = excellent. Long because it narrates the patient's life story = not acceptable.

HPI LENGTH GUIDANCE:
- Brief focused visit (single topic): 1-2 paragraphs
- Standard follow-up (2-3 topics): 2-3 focused paragraphs, one per topic cluster
- Comprehensive wellness visit (multiple topics): 3-6 paragraphs, grouped by clinical domain
- Each paragraph should contain a complete topic — symptoms, pattern, and treatment rationale for that domain

MEDICATION TENSE — CRITICAL:
- medications_current (patient is already on it) → Current Medications section + HPI as ongoing: "She has been on...", "She continues on...", "Patient is currently taking..."
- medication_changes_discussed (recommended/started at this visit) → Assessment/Plan ONLY + HPI as new/discussed: "We discussed initiating...", "Plan was made to start...", "She agreed to begin..."
- NEVER write a recommended medication as if the patient is currently taking it
- NEVER put a newly-initiated medication in the Current Medications section — only in the Plan
- The Current Medications section is a snapshot of what the patient walked in on. The Plan reflects what changes to that regimen occurred at this visit.

═══════════════════════════════════════
SECTION 2 — ASSESSMENT WITH CLINICAL SYNTHESIS
═══════════════════════════════════════

OPENING SYNTHESIS PARAGRAPH — REQUIRED, BEFORE ALL NUMBERED ITEMS:
Write one concise paragraph (3-5 sentences) that captures the overall clinical picture and rationale for the visit's treatment decisions. This is the most important paragraph in the note — it tells the story of why this patient is being managed this way.

The synthesis paragraph must:
- Connect the patient's symptom pattern to the underlying hormonal, metabolic, or clinical picture
- Name the key lab findings or clinical patterns driving decisions
- State the treatment rationale at the pattern level (not just "starting testosterone because testosterone is low" — but WHY, in this patient's context)
- Read like a clinician who has synthesized the full picture, not like an introduction to a list

Example of the RIGHT synthesis voice:
"Presentation is consistent with female androgen insufficiency compounded by suboptimal thyroid conversion, producing the triad of fatigue, low libido, and cognitive slowing she describes. Free testosterone remains below the therapeutic range despite her current regimen; fT3/fT4 ratio is narrow, suggesting conversion inefficiency rather than insufficient T4. Treatment approach this visit focuses on optimizing androgen levels and improving thyroid conversion, with close monitoring given the interplay between these axes."

Example of WRONG synthesis (table of contents, not synthesis):
"This patient has several diagnoses that were discussed today. These include hypothyroidism, female testosterone deficiency, and vitamin D insufficiency. Each will be addressed below."

NUMBERED ASSESSMENT ITEMS — GROUPING RULE:
Group related diagnoses together in logical clinical clusters, matching the HPI grouping. Do not alternate randomly between unrelated problems. Present hormonal issues together, metabolic issues together, etc. The Assessment should follow the same topical flow as the HPI.

Each numbered item format:
- Diagnosis Name (ICD-10 code)
- Clinical reasoning (2-3 sentences): WHY this diagnosis, what evidence supports it, how it connects to symptoms or labs
- Plan: [specific orders — drug name, dose, route, frequency, labs ordered, referrals]
- Include monitoring targets and follow-up parameters only when specific and relevant — never as generic filler

ASSESSMENT RULES:
- Use ICD-10 codes for all diagnoses
- Infer clinically appropriate diagnoses from context (medications, symptoms, lab patterns) — do not require the clinician to have verbally stated the diagnosis
- Inferred conditions with "requires_confirmation" confidence: use "consistent with", "suggestive of"
- Inferred conditions with "strongly_implied" confidence: state directly, note the basis
- Preventative medicine signals: woven into relevant items as clinical context, not listed as separate diagnoses

LAB VALUE CITATION RULE — SPECIFICITY REQUIRED:
When lab values are available in the lab context provided, cite them numerically in the clinical reasoning — not generically.

CORRECT: "Free testosterone 0.8 pg/mL (goal 1.5–2.5 pg/mL) — below therapeutic range despite current dose"
CORRECT: "TSH 3.8 mIU/L with fT3 2.4 pg/mL — fT3/fT4 ratio narrow at 0.31, suggesting suboptimal peripheral conversion"
CORRECT: "LDL 142 mg/dL, ApoB 98 mg/dL — above target of <70 mg/dL given 10-year ASCVD risk"
WRONG: "free testosterone was low" / "TSH was not at goal" / "LDL was elevated"

If the lab context contains specific values, you must use those numbers. Do not describe a lab result in vague directional terms when the actual number is available to you.

═══════════════════════════════════════
TREATMENT RATIONALE LINKING — REQUIRED FOR ALL NEW TREATMENTS AND DOSE CHANGES
═══════════════════════════════════════
When a treatment is being INITIATED or CHANGED at this visit, the clinical reasoning paragraph for that Assessment item MUST explicitly link ALL of the following elements that are available:

1. SYMPTOMS → name the specific symptoms this treatment addresses ("persistent fatigue, low libido, and cognitive slowing")
2. DIAGNOSIS/PATTERN → state the clinical pattern being treated ("female androgen insufficiency")
3. SUPPORTING LABS → cite the specific values driving the decision ("Free testosterone 0.8 pg/mL, below our target of 1.5–2.5 pg/mL")
4. PRIOR TREATMENT CONTEXT → if relevant, name what was tried before ("previously trialed topical testosterone cream with inadequate absorption and subtherapeutic levels")
5. PROVIDER REASONING → state WHY this specific treatment, dose, or approach ("initiated injectable form to improve dose predictability and bioavailability")

The TREATMENT RATIONALE data extracted by Stage 1 provides this structured information — use it to build the clinical reasoning paragraph. Do not write a generic "testosterone initiated for low testosterone" sentence when you have the provider's actual reasoning available.

EXAMPLE OF COMPLETE TREATMENT RATIONALE:
"Semaglutide 0.25 mg SQ weekly initiated for obesity management (BMI 34.2) in the setting of fatigue, cravings, and metabolic dysregulation. Fasting insulin 22 mIU/L with HOMA-IR 4.8 and A1c 5.9% confirm insulin resistance as the primary driver. Patient previously attempted caloric restriction with a 6-lb loss over 6 months, plateauing without further progress. GLP-1 initiated to target the insulin resistance mechanism directly, with expectation of improved satiety, glycemic stabilization, and progressive weight loss."

If the TREATMENT RATIONALE context block above contains extracted rationale for this treatment, use it. If it does not, infer from the transcript. If neither is available, document with whatever specificity the transcript allows — but never reduce a treatment initiation to a single generic sentence.

═══════════════════════════════════════
DECISION-STATE DOCUMENTATION LANGUAGE
═══════════════════════════════════════
The PLAN DECISION CLASSIFICATION above assigns each treatment to a state. Use these language patterns based on state:

STATE A — INITIATED TODAY (provider and patient committed):
- Use definitive, present-tense treatment language in the Plan: "[Drug] [dose] [route] [frequency] initiated/continued/adjusted"
- Clinical reasoning states the treatment as a decided course of action
- Do NOT hedge with "may consider" or "could potentially"

STATE B — FUTURE CONSIDERATION (deferred with specific trigger):
- Assessment entry EXISTS with full clinical reasoning (why this treatment warrants consideration for this patient)
- Plan line reflects the specific deferral: "Deferred pending [specific trigger]; patient to return for further discussion once [condition]. Will reassess at [timeframe]."
- Do NOT write "patient declined" unless the patient explicitly declined
- Do NOT write "options discussed" as the only Plan line — name what the options are and why they were deferred
- Name the specific trigger: "pending DEXA results before initiating bisphosphonate", "patient considering and will follow up", "deferred pending insurance authorization"

STATE C — EXPLORATORY DISCUSSION (conversational possibility, no near-term plan):
- Brief mention in HPI narrative only, if clinically relevant: "Future hormonal pellet therapy was discussed in passing as a long-term option"
- Do NOT create a numbered Assessment entry
- Do NOT add to needs_clinician_review as a clinical recommendation
- One clause in the HPI is sufficient — do not elevate to a clinical plan item

STATE D — CLINICALLY RELEVANT (not discussed, provider flag only):
- Add to needs_clinician_review only, never in the note body
- Prefix: "SUGGESTED (awaiting clinician approval): [specific recommendation with rationale]"

═══════════════════════════════════════
DIAGNOSIS BUNDLE CONSOLIDATION
═══════════════════════════════════════
The MATCHED DIAGNOSIS BUNDLES context above (when present) lists provider-defined clinical bundles that match this visit's pattern with strong or moderate confidence. A diagnosis bundle is a clinician-curated grouping of related diagnoses representing a unified clinical picture.

WHEN ONE OR MORE MATCHED BUNDLES ARE LISTED (strong or moderate confidence):
- Use the bundle title as the PRIMARY Assessment item header for all component diagnoses. Instead of numbering each diagnosis separately, group them under the single bundle header.
- Format: "[Bundle Title] ([ICD-10 code1], [ICD-10 code2], ...)\n  [Provider-defined clinical bundle]"
- Write a SINGLE unified clinical reasoning paragraph that narrates the full clinical picture — all component diagnoses, all supporting lab values, all symptoms, as one coherent story. Do not write separate paragraphs per diagnosis.
- The Plan section under this one Assessment item covers ALL treatment decisions:
  - STATE A items: list as definitive orders
  - STATE B items: name the deferral reason and trigger
  - STATE C items: omit from Plan (HPI only)
- Do NOT also create separate numbered Assessment items for the component diagnoses — they are fully subsumed by the bundle item.
- If additional diagnoses were discussed that are NOT part of the bundle, create separate numbered items for those in the normal format.

EXAMPLE — before bundle consolidation (incorrect):
1. Perimenopause (N95.1) — Clinical reasoning... Plan: estrogen deferred
2. Female androgen insufficiency (E28.39) — Clinical reasoning... Plan: testosterone deferred
3. Sleep-onset insomnia (G47.00) — Clinical reasoning... Plan: progesterone 100 mg QHS

EXAMPLE — after bundle consolidation (correct):
1. Early Hormone Transition (N95.1, E28.39, F52.0, G47.00)
   [Provider-defined clinical bundle]
   Patient presents with a constellation of early perimenopausal symptoms — disrupted sleep onset, low libido meeting HSDD criteria, fatigue, and mood instability — consistent with an early hormone transition pattern. Progesterone was initiated at this visit as the primary entry point for hormone therapy, targeting sleep and uterine protection. Estrogen was discussed in depth and deferred to a 2-week follow-up to assess progesterone efficacy and patient tolerance before layering a second hormone. Testosterone was reviewed as a later phase of the transition plan, deferred to a subsequent visit once the hormonal foundation is established.
   Plan: Progesterone 100 mg PO QHS initiated. Return in 2 weeks to assess sleep response and tolerability; estrogen initiation to be determined at that visit. Testosterone deferred to a follow-up visit pending progesterone establishment and estrogen decision.

WHEN NO MATCHED BUNDLES ARE PRESENT:
- Use the standard Assessment format (one numbered item per diagnosis/condition).
- This consolidation logic does not apply.

═══════════════════════════════════════
SECTION 3 — PLAN REFLECTING ACTUAL DECISIONS + COUNSELING/SDM PRESERVATION
═══════════════════════════════════════
The Plan must ONLY reflect what was actually decided during the visit. AND it must preserve the clinical counseling and shared decision-making that actually occurred — not collapse it into vague summary phrases.

CRITICAL PLAN RULE — DECISION CLASSIFICATION:
- Items in "explicitly_decided_plan_items" → include in the Plan as a definitive order/decision with full specificity (drug name, dose, route, frequency, monitoring)
- Items in "discussed_but_not_decided" → MUST still receive a NUMBERED ASSESSMENT/PLAN ENTRY. The distinction only affects how the Plan line is written — not whether the Assessment entry exists. Write the diagnosis and clinical reasoning as normal, then write the Plan line as pending/under consideration: "Options discussed; patient to consider [X] and follow up when ready" or "Further evaluation warranted; plan to be finalized at follow-up." Do NOT reduce these to HPI-only mentions. A problem discussed with the patient is a clinical problem that belongs in the Assessment, regardless of whether treatment was decided.
- Items in "clinically_relevant_followup" → put in needs_clinician_review ONLY, never in the Plan

SYMPTOM-TO-ASSESSMENT RULE — NON-NEGOTIABLE:
Every significant symptom reported by the patient (fatigue, mood changes, low libido, sleep disturbance, weight changes, pain, cognitive symptoms, etc.) that drove clinical discussion during this encounter MUST appear as a numbered Assessment/Plan entry — not just in the HPI narrative. Symptoms that cluster around a known condition (e.g., fatigue + low libido + mood changes in a woman discussing hormone optimization) should be grouped under the most appropriate diagnosis. If no treatment was decided, the Assessment entry still exists with a Plan line reflecting the discussion and next steps. Symptoms documented only in the HPI with no corresponding Assessment entry represent an incomplete, medicolegally deficient note.

MEDICATION CONTINUATION TRIAGE — WHEN TO CREATE AN ASSESSMENT ENTRY:
Not every currently-prescribed medication needs its own numbered Assessment/Plan entry. Apply this rule:

ASSESSMENT ENTRY REQUIRED — when any of these apply:
- New prescription being initiated at this visit
- Dose change, titration, or medication switch
- Medication is the primary focus of the visit (the main reason the patient came)
- Tolerability concern, side effect, or efficacy question was discussed
- Labs ordered or reviewed specifically in relation to this medication
- The underlying condition is being actively managed, reassessed, or newly diagnosed
- Any hormone therapy in a hormone optimization visit (testosterone, estrogen, progesterone, thyroid) — these are the point of the visit even if unchanged
- Any controlled substance renewed at this visit

NO ASSESSMENT ENTRY NEEDED — simple continuation:
- Medication mentioned in passing and acknowledged, no new clinical discussion
- No change, no concern, no new decision, no relevant labs
→ Current Medications list + brief HPI mention is sufficient. Do NOT generate a numbered item just to write "Continue [medication] — patient tolerating well."

Plan specifics:
- Include drug name, dose, route, frequency for every medication
- Include monitoring parameters appropriate to medication class
- Include specific follow-up interval with clinical rationale
- Include labs ordered
- "Continue treatment" is never acceptable — always specify which treatment

═══════════════════════════════════════
SECTION 3B — CLINICAL REASONING, EDUCATION, AND SDM — INTEGRATED APPROACH
═══════════════════════════════════════

HOW TO HANDLE EDUCATION AND COUNSELING CONTENT:
Do NOT create a separate "Counseling / Education:" sub-section for each diagnosis. Instead, weave education, counseling specifics, shared decision-making, and informed consent naturally into the clinical reasoning paragraph and plan for each Assessment item. A skilled clinician doesn't document "Education: risks and benefits reviewed." They write: "Testosterone cypionate 10 mg IM weekly initiated; started at conservative dose given her prior sensitivity — plan to advance to 20 mg at 6-week re-evaluation if tolerated and symptom response is incomplete. Patient aware of expected onset of effect at 4-6 weeks and instructed to report mood changes or pelvic symptoms before next visit."

THE FORMAT FOR EACH NUMBERED ITEM:

  N. Diagnosis Name (ICD-10)
  [Clinical reasoning: 2-3 sentences connecting symptoms, labs, pattern — WHY this diagnosis and why this treatment approach. If specific counseling occurred — titration plan reviewed, risks named, alternatives discussed, patient preference stated — integrate it here naturally as part of the clinical narrative. If a monitoring target was discussed, include it: "goal free testosterone 1.5–2.5 pg/mL." If patient education was specific and meaningful, integrate it: "instructed to take on empty stomach," "aware that symptom improvement may lag 6-8 weeks."]
  Plan: [drug name, dose, route, frequency — precise and complete. Labs ordered. Follow-up interval with rationale. Conditional plans: "if no response in 6 weeks, will advance dose."]

INTEGRATION RULES:
- Education that is specific and patient-relevant belongs in the clinical reasoning paragraph — not in a separate sub-section
- Generic statements ("risks and benefits discussed," "patient verbalized understanding") must not appear anywhere — they are legally weak and clinically empty
- If the transcript captured specific counseling (titration steps, side effects named, administration instructions, alternatives weighed), preserve it by writing it as part of the clinical reasoning — one fluid sentence, not a bulleted list
- Monitoring targets, goal lab values, and follow-up triggers belong in the Plan line
- Patient agreement/consent is captured by the plan itself (the fact that a prescription was issued and a plan was made implies consent)
- Never add a "Monitoring / Follow-up:" sub-line — monitoring goes in the Plan line

FORBIDDEN ANYWHERE IN THE NOTE:
- "Counseling / Education:" as a sub-section header
- "Monitoring / Follow-up:" as a sub-section header
- "Risks and benefits discussed." (without naming them)
- "Patient verbalized understanding and consented."
- "Education provided regarding [X]." (without specifying what was taught)
- "Patient is agreeable." / "Patient is on board."
- "We reviewed the benefits of [X]." (without clinical content)
- Shared decision-making must be visible through the specifics of what was discussed — not through boilerplate consent language.

═══════════════════════════════════════
SECTION 3C — MEDICATION-INITIATION VISITS (HORMONES, GLP-1s, CONTROLLED SUBSTANCES, INJECTABLES, CHRONIC DISEASE STARTS)
═══════════════════════════════════════
When a medication is being INITIATED at this visit (especially testosterone, estrogen, progesterone, thyroid hormone, GLP-1s like semaglutide/tirzepatide/liraglutide, controlled substances, naltrexone/LDN, injectables, or any new chronic disease therapy), the initiation counseling must be preserved in the clinical reasoning paragraph for that Assessment item — woven in naturally, not announced with a sub-section header.

Elements to capture when present in the transcript — write them as integrated clinical sentences, not as a list:
- Contraindication review: "screened for history of [X] before initiating"
- Side effects named: write the actual side effects mentioned, not "side effects reviewed"
- Administration: "instructed on injection technique / timing / storage"
- Titration plan: "starting at [dose], advancing to [target] at [interval] if tolerated"
- Return precautions: "instructed to call if [specific symptoms]"
- Patient agreement: captured implicitly by the fact that a prescription was issued — do not add "patient verbalized understanding and agreed to start" as a standalone sentence

CORRECT format for a GLP-1 initiation:
"Semaglutide 0.25 mg SQ weekly initiated for weight management given BMI [X] with [symptoms/comorbidities]. Counseled on expected GI side effects including nausea and constipation, importance of slow titration, and rare gallbladder/pancreatitis risk; instructed to inject in abdomen or thigh on the same day each week and call with severe abdominal pain or vomiting. Plan to advance to 0.5 mg at 4 weeks if tolerating well."
Plan: Semaglutide 0.25 mg SQ weekly × 4 weeks, then 0.5 mg if tolerated. Follow up 4 weeks.

FORBIDDEN — do not create a separate sub-section:
"Counseling / Education: Risks and benefits of semaglutide reviewed. Patient verbalized understanding and agreed to start."

If the transcript does NOT contain a given counseling element, do NOT invent it. Only document what actually occurred.

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

═══════════════════════════════════════
CRITICAL SAFETY CHECK — MANDATORY BEFORE OUTPUT
═══════════════════════════════════════
Before finalizing the note, perform this internal completeness audit in TWO passes.

PASS 1 — CONTENT AUDIT: "Did I include ALL of the following if present in the transcript?"

□ New medications (any drug, supplement, OTC recommendation discussed with intent to use)
□ Medication changes (dose increases, dose decreases, titrations, switches)
□ Existing medications acknowledged or confirmed as part of ongoing care
□ Supplements mentioned with intent (vitamin D, magnesium, omega-3, berberine, etc.)
□ Weight loss adjuncts (topiramate, phentermine, GLP-1s, naltrexone, etc.)
□ Hormone therapy decisions (initiation, adjustment, continuation, discontinuation)
□ Conditional plans ("if this doesn't work," "if labs come back abnormal," "if she tolerates it")
□ Follow-up labs or monitoring (which labs, when to recheck)
□ PRN or optional add-on medications ("you can take this as needed," "we can add this if")
□ Patient education points that reflect a clinical decision or intent
□ Any item mentioned even ONCE that represents a clinical action or recommendation

If ANY of the above are missing from the Assessment & Plan → REVISE before producing output.

PASS 2 — FOUR-LOCATION AUDIT: For every medication/treatment identified in Pass 1, verify it appears in ALL four applicable locations:

□ HPI — mentioned with clinical context (tolerability, response, relevance to visit)
□ Current Medications — listed with dose/route/frequency (if currently prescribed)
□ Assessment/Plan — numbered item with diagnosis, reasoning, plan, and monitoring
□ Care Plan — patient-actionable item

If ANY medication or treatment is missing from any of its required locations → ADD IT before producing output.

After generating the initial draft, perform both audit passes against the transcript. If anything is missing from any required location, revise automatically. Only return the final revised note — never the initial draft.

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

CHART DATA — MANDATORY CHART-TO-NOTE MAPPING:
If PATIENT HISTORICAL CONTEXT contains a "PATIENT CHART DATA" block, you MUST use those exact items in the Medical History section — verbatim, not paraphrased. Specific rules:
- "Past Medical History" chart items → Past Medical Hx in the note (list ALL of them — never omit or condense)
- "Past Surgical History" chart items → Past Surgical Hx in the note (list ALL of them)
- "Social History" chart items → Social Hx in the note (list ALL of them)
- "Current Medications" chart items → include in OBJECTIVE and weave into HPI/Assessment as clinically relevant
- "Allergies" chart items → Allergies line
- "Family History" chart items → Family Hx in the note
If additional history is mentioned in the transcript, ADD it to the chart items — never replace them. Do NOT write "not reported," "not mentioned," or "none documented" for any section that has chart data.

HISTORICAL TRAJECTORY — USE PRIOR NOTES AND LABS FOR TREND LANGUAGE:
If PATIENT HISTORICAL CONTEXT contains prior notes, prior lab results, or prior vitals, use them to surface explicit trajectory language in the HPI and Assessment. Do not silently have this data and ignore it.

Trajectory language to generate when data supports it:
- Lab trends: "Free testosterone has increased from 0.4 → 0.8 → 1.2 pg/mL over the past three visits, approaching therapeutic range"
- Weight: "Weight down 11 lbs since initiating tirzepatide in January" / "Weight stable over the past two visits"
- Symptom trajectory: "Energy has progressively improved since thyroid optimization began in October" / "Sleep remains disrupted despite progesterone initiation at last visit — dose reassessment warranted"
- Vitals: "Blood pressure trending down: 148/92 at last visit, 138/86 today — improvement on current regimen"
- Lab normalization: "Vitamin D has normalized to 58 ng/mL from a baseline of 18 ng/mL six months ago"

Format: weave trajectory naturally into the HPI narrative and Assessment reasoning — not as a separate "Historical Trends" section. One efficient sentence with the actual numbers is far more useful than a vague "patient has been making progress."

Only generate trajectory language when you have actual prior data to cite. Do not invent trends or approximate values.

MEDICATION-IMPLIED PMH — MANDATORY:
Psychiatric/sleep medications → corresponding conditions in PMH and Assessment. See medication list for specific mappings.

MEDICATION NAMES — PATIENT SAFETY RULE:
Copy every medication and drug name EXACTLY as it appears in the NORMALIZED MEDICATION LIST or transcript. Character-for-character. Never phonetically approximate, respell, or paraphrase a drug name (e.g., do NOT write "lisartan" when the drug is "losartan", do NOT write "acrofirm" when the drug is "ACCRUFeR"). If a name in the transcript is genuinely unclear, write [unclear medication] — never guess at the spelling.
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

Current Medications:
[List every medication and supplement the patient is CURRENTLY taking — meaning they were on it BEFORE this visit or it is being CONTINUED/MAINTAINED from this visit. Include dose, route, and frequency if known. Each medication on its own line, formatted as: "- [Medication name] [dose] [route] [frequency]". Include prescription medications, OTC medications, and supplements. If no current medications are known: "None reported." Do NOT list medications being newly initiated at this visit — those belong in the Assessment/Plan.]

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

[Opening synthesis paragraph — 3-5 sentences connecting the patient's symptom pattern, key lab findings, and overall treatment rationale. This is NOT an introduction to the list below — it is an independent clinical impression that stands on its own.]

1. Diagnosis Name (ICD-10 code)
[Clinical reasoning — 2-3 sentences: WHY this diagnosis, what evidence (symptoms, labs, pattern) supports it, and why this treatment approach. Weave in any specific counseling, titration plan, or patient education naturally as part of this reasoning — do NOT create separate "Counseling" or "Monitoring" sub-lines.]
Plan: [drug name, dose, route, frequency; labs ordered; referrals; follow-up interval and trigger; conditional next steps]

2. Diagnosis Name (ICD-10 code)
[Clinical reasoning and integrated education/counseling as above]
Plan: [...]

[Continue for each diagnosis, grouped by clinical domain — hormonal together, metabolic together, etc.]

CARE PLAN
[Write this section as a patient-readable summary of what they need to do and know after this visit. It should be genuinely useful to the patient, not just a medication reprint. Structure it to answer: what am I starting/changing and why does it matter, what labs are being ordered and when should I get them, what symptoms should make me call before my next visit, what was decided today vs. what is still pending a decision.

Format: a short paragraph or brief numbered list — whichever reads more naturally for this patient's complexity. Avoid bullet lists of raw medication names with no context. Include:
- New medications/supplements being started, with a one-line rationale the patient can understand
- Any dose changes and what to expect
- Labs ordered with a timeframe ("bloodwork in 6 weeks")
- Any pending decisions the patient is still considering
- Red-flag symptoms to watch for and call about
- Any lifestyle or dietary action items discussed

Keep it concise. This is a care summary, not a restatement of the entire Assessment/Plan.]

FOLLOW-UP
[Specific interval with clinical rationale]

═══════════════════════════════════════
END OF NOTE — STOP HERE.
The fullNote field MUST END after the FOLLOW-UP section.
Do NOT append, restate, or echo any of the rules, headers, or instructions
that appear below or anywhere else in this prompt (including "PROSE STANDARDS",
"WRITING RULES", "PATIENT vs. CLINICIAN IDENTITY", "OUTPUT FORMAT", etc.).
Those are instructions to YOU — they are not part of the note content.
═══════════════════════════════════════

═══════════════════════════════════════
WRITING RULES (apply while drafting — never include this header or these bullets in fullNote)
═══════════════════════════════════════
- PLAIN TEXT ONLY — ABSOLUTELY NO MARKDOWN: Never use asterisks (*), double asterisks (**), underscores (_), pound signs (#), or any other markdown syntax anywhere in the note. This includes medication names, diagnosis headings, sub-section labels (Plan:, Counseling:, Monitoring:), and Assessment items. Everything is plain text. If you write **anything** with asterisks you have produced an invalid note.
- Third person, past tense for Subjective, present for Assessment/Plan
- Standard medical abbreviations
- No redundancy
- Numerals for doses/measurements
- Integrate lab values naturally into narrative

═══════════════════════════════════════
CAUSALITY & TEMPORAL REASONING (apply throughout — HPI, Assessment, Plan)
═══════════════════════════════════════
Distinguish carefully between confirmed causation, temporal association, and coincidence. The SYMPTOM TIMELINE above includes causality classifications for each symptom — use them to guide language.

CAUSALITY LANGUAGE GUIDE:

pre_existing: "she has had [symptom] for [duration], predating any current treatment" / "a pre-existing condition, present prior to initiating [medication]"

medication_side_effect (provider explicitly attributed): "[Medication] was identified as the likely cause of [symptom]" / "patient reports [symptom] consistent with known [medication] side effects, as confirmed by provider"

temporally_associated (onset correlates but NOT confirmed): "she reports [symptom] that appeared approximately [timeframe] after initiating [medication], though causality has not been established" / "[symptom] appears to have worsened temporally with [medication] initiation — may be contributing"

exacerbation_of_chronic: "[symptom] represents worsening of her underlying [condition], superimposed on chronic baseline" / "[condition] exacerbated in the setting of [context]"

unrelated_coincidental (provider explicitly noted): "provider noted this finding is likely unrelated to current hormonal therapy" / "considered incidental given clinical context"

differential (possible cause, not confirmed): "[medication] may be contributing to [symptom]; differential includes [alternative causes]" / "temporally associated — cannot exclude [medication] as a contributing factor, though [alternative] also possible"

confirmed: "[symptom] confirmed as [diagnosis] by [finding/test]" / "provider confirmed [causal relationship]"

FORBIDDEN CAUSAL LANGUAGE — do not use:
- "caused by [medication]" unless provider explicitly confirmed causation
- "[Medication] is causing [symptom]" — only if provider stated this directly
- Attributing a pre-existing symptom to a newly initiated medication unless the transcript explicitly supports it
- Stating a diagnosis as confirmed when the provider expressed uncertainty or is still investigating

PREFERRED OVER-ATTRIBUTION GUARDRAILS:
- If a patient reports a symptom that started before a medication was initiated → do not attribute the symptom to the medication
- If a patient reports a symptom that may or may not be medication-related → use "appears to worsen", "may be contributing to", "temporally associated with", "superimposed on"
- If a provider hedged with "it could be the [medication]" → write "may be contributing" not "is causing"

═══════════════════════════════════════
PATIENT vs. CLINICIAN IDENTITY (apply while drafting — never include this header in fullNote)
═══════════════════════════════════════
- The PATIENT is the person being treated. Their name will be provided below. Use ONLY the patient's name (or "patient"/"she"/"he") when referring to the person receiving care.
- The CLINICIAN/PROVIDER is the person conducting the visit. NEVER use the clinician's name as the patient. The transcript is often recorded from the clinician's perspective — do NOT confuse the speaker with the patient.
- If the transcript is narrated in first person by the clinician (e.g., "I told her...", "we discussed..."), the "I" is the CLINICIAN, not the patient.`;

  const patientLine = patientName ? `\nPatient Name: ${patientName}` : "";
  const historicalBlock = historicalContext
    ? `\n\n${historicalContext}`
    : "";
  const bundleContext = normalized.matched_bundles?.filter(b => b.confidence !== "weak").length
    ? `\nMATCHED DIAGNOSIS BUNDLES (apply DIAGNOSIS BUNDLE CONSOLIDATION rules for these — use bundle title as Assessment header, unify all component diagnoses under it):\n${normalized.matched_bundles.filter(b => b.confidence !== "weak").map(b =>
        `- "${b.bundle_title}" [${b.confidence} match]: codes ${b.matched_codes.join(", ")} — ${b.rationale}`
      ).join('\n')}`
    : "";

  const userPrompt = `Visit Type: ${encounter.visitType}
Chief Complaint: ${encounter.chiefComplaint || "Not specified"}
Visit Date: ${new Date(encounter.visitDate).toLocaleDateString()}${patientLine}${historicalBlock}${labContext}${extractionSummary}${patternContext}${medicationContext}${normalizedMedsContext}${conditionsContext}${preventativeContext}${symptomTimelineContext}${planClassification}${futureConsiderationsContext}${exploratoryContext}${treatmentRationaleContext}${bundleContext}${hpiElements}${patientPerspective}${providerReasoning}${educationProvided}${patientDecisions}

TRANSCRIPT:
${diarizedInput}

Generate the SOAP note following all rules above. The HPI must be a DETAILED RECONSTRUCTION of the clinical encounter, not a compressed summary.${patientName ? ` The patient's name is "${patientName}" — use this name (NOT the clinician's name) when referring to the patient in the note.` : ""} Flag uncertain items and non-duplicate recommendations in needs_clinician_review.

FINAL STEP — MANDATORY BEFORE RETURNING OUTPUT:
Scan the entire transcript one more time. For every medication (prescription, OTC, supplement), dose change, conditional plan, follow-up lab, or clinical recommendation mentioned — confirm it appears in the Assessment & Plan. If anything is missing, add it now. Return only the final complete note — never the initial draft.`;

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
    fullNote: stripLeakedInstructions(soapResult.fullNote ?? ""),
    uncertain_items: soapResult.uncertain_items ?? [],
    needs_clinician_review: soapResult.needs_clinician_review ?? [],
  };
}

// Defensive: occasionally the LLM echoes prompt instructions back into the
// note body (e.g. "PROSE STANDARDS:", "WRITING RULES:", "OUTPUT FORMAT:",
// "PATIENT vs. CLINICIAN IDENTITY:"). Trim everything from the first leaked
// rule heading onward, plus any trailing whitespace.
function stripLeakedInstructions(note: string): string {
  if (!note) return note;
  const leakHeaders = [
    /\n\s*PROSE\s+STANDARDS\s*:?/i,
    /\n\s*WRITING\s+RULES\b[^\n]*/i,
    /\n\s*OUTPUT\s+FORMAT\b[^\n]*/i,
    /\n\s*PATIENT\s+vs\.?\s+CLINICIAN\s+IDENTITY\b[^\n]*/i,
    /\n\s*END\s+OF\s+NOTE\b[^\n]*/i,
    /\n\s*CRITICAL\s*[—\-]\s*PATIENT\s+vs\b[^\n]*/i,
  ];
  let earliest = note.length;
  for (const re of leakHeaders) {
    const m = note.match(re);
    if (m && typeof m.index === "number" && m.index < earliest) {
      earliest = m.index;
    }
  }
  return note.slice(0, earliest).replace(/[\s═]+$/g, "").trimEnd();
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
1. FOUR-LOCATION COMPLETENESS — CRITICAL: For every medication, supplement, or treatment referenced in the transcript in any clinical context, verify it appears in ALL four applicable locations:
   a) HPI — mentioned with clinical context (what was said about it, tolerability, response, dose stated)
   b) Current Medications — listed with dose/route/frequency (if currently prescribed)
   c) Assessment/Plan — as a numbered item with clinical reasoning, plan details, monitoring, and continuation decision
   d) Care Plan — as a patient-actionable item

   Scan the full transcript and medications_normalized list. For ANY medication with "current" status that was mentioned in the transcript — even briefly, even in a single sentence, even to simply confirm continuation — check all four locations. A medication present in medications_current but absent from the Assessment/Plan is a CRITICAL omission. A medication discussed in the transcript but absent from the HPI is a CRITICAL omission. Both require revision.

   If ANY currently-prescribed or newly-started medication (GLP-1, testosterone, thyroid medication, antidepressant, supplement, hormone, etc.) is missing from any of its four required locations → flag as CRITICAL and add it to every missing location before returning the revised note.
2. SYMPTOM-TO-ASSESSMENT OMISSIONS — CRITICAL: Are all significant symptoms reported by the patient captured not only in the HPI but ALSO in a numbered Assessment/Plan entry?
   Symptoms that drove clinical discussion (fatigue, mood changes, low libido, sleep disturbance, weight changes, pain, brain fog, palpitations, etc.) MUST appear as numbered Assessment items — not just as narrative in the HPI. Symptom clusters that point to a known condition (fatigue + low libido + mood in a woman = likely female hormone deficiency/HSDD) should be grouped under the appropriate diagnosis with clinical reasoning. A Plan line of "Options discussed; patient to consider further" is acceptable when no treatment was decided — but the Assessment entry MUST exist. If significant symptoms appear in the HPI but have no corresponding numbered Assessment entry, flag as CRITICAL and add the Assessment item.
3. SECONDARY CONCERN OMISSIONS: Are all secondary concerns discussed during the visit captured in the HPI and Assessment? Secondary concerns must not be lost.
4. SIDE EFFECT OMISSIONS: Were side effects or tolerability issues discussed but not documented?
5. PRIOR TREATMENT OMISSIONS: Were prior medication trials or failed treatments mentioned but not captured?
6. DIAGNOSIS OMISSIONS: Are medication-implied conditions documented in PMH and Assessment?
7. EDUCATION OMISSIONS: Was patient education provided but not documented in all three required places?
8. PATIENT DECISION OMISSIONS: Did the patient state decisions/preferences that were not documented?
9. CONTRADICTIONS: Does the note contradict any transcript facts? (e.g., "denies nausea" when patient reported nausea)
10. TENSE ERRORS: Are recommended medications incorrectly presented as current medications?
11. OVER-COMPRESSION: Does the HPI reduce a rich, multi-topic encounter to a brief summary? Is the HPI proportional to the visit depth?
12. PREVENTATIVE SIGNALS LOST: Were clinically relevant "between the lines" clues identified in normalization but not reflected in the Assessment?
13. RECOMMENDATION DUPLICATES: Does needs_clinician_review contain items that duplicate the explicit Plan?
14. MISCLASSIFIED SUGGESTIONS: Does needs_clinician_review contain "SUGGESTED (awaiting clinician approval):" items for actions that were EXPLICITLY DISCUSSED AND DECIDED during the encounter? If so, move them to the Plan and remove from needs_clinician_review.
15. COUNSELING AND SDM INTEGRATION: When the transcript contains specific counseling content (named side effects, titration steps reviewed, administration instructions, alternatives weighed, return precautions stated) — is this content preserved in the note? It should appear woven into the clinical reasoning paragraph for each affected Assessment item — NOT as a separate "Counseling / Education:" sub-line. If meaningful counseling content from the transcript is collapsed into a vague phrase ("risks and benefits discussed," "patient educated"), flag as important and integrate it naturally into the clinical reasoning. Do NOT add "Counseling / Education:" or "Monitoring / Follow-up:" sub-section headers — that format is forbidden.
16. SHARED DECISION-MAKING VISIBILITY: When the transcript shows the patient and provider weighed options or the patient stated a preference, the note should make that visible through the specifics of the reasoning — what alternatives were considered, why the chosen option was selected, what the patient preferred. This belongs in the clinical reasoning paragraph, not in boilerplate consent language.
17. ROS FORMAT COMPLIANCE: Is the Review of Systems rendered as the required 13-row two-column chart, with each of these systems on its own line in this exact order — Constitutional, HEENT, Cardiovascular, Respiratory, Gastrointestinal, Genitourinary, Musculoskeletal, Skin, Neurological, Psychiatric, Endocrine, Hematologic/Lymphatic, Allergic/Immunologic — each in "System Name: findings." format (colon required)? If the ROS was instead written as a paragraph, a comma-separated list, a bulleted list, a partial subset of systems, or any other format — REVISE the ROS section to the strict 13-row chart format. Use "Not addressed at this visit." for any system that was not discussed. Do NOT invent symptoms; preserve all documented positives and negatives. This rule applies to the ROS section ONLY — do NOT alter Assessment/Plan/HPI/Care Plan/Follow-up formatting.
18. TREATMENT RATIONALE COMPLETENESS: For each new medication initiated or dose changed at this visit — does the Assessment item's clinical reasoning paragraph explicitly connect: (a) the specific symptoms it addresses, (b) the diagnosis or clinical pattern driving the decision, (c) relevant lab values or findings (cited numerically if available), and (d) the provider's reasoning for choosing this treatment at this dose? A reasoning paragraph that only says "testosterone initiated for low testosterone levels" when specific symptoms, labs, and provider reasoning are present in the transcript is an important omission. If the rationale is present in the transcript but not reflected in the note, revise the clinical reasoning paragraph to include it.
19. CAUSAL LANGUAGE ACCURACY: Does the note correctly distinguish confirmed causation from temporal association and coincidence? Specifically: (a) are symptoms that pre-date a medication incorrectly attributed to that medication? (b) does the note say a medication "is causing" a symptom when the provider only expressed uncertainty or possibility? (c) are temporally associated symptoms described without appropriate hedging language ("appears to worsen," "may be contributing," "temporally associated with")? If the note makes overconfident causal claims unsupported by the transcript, flag as important and revise to use nuanced causal language matching the provider's actual certainty level.

STYLE PRESERVATION — MANDATORY WHEN REVISING:
If you are writing a revised_fullNote, the following style rules are non-negotiable and apply to your revision exactly as they applied to the original generation. Do not introduce patterns the original generation was specifically trained to avoid.

- OPENING SYNTHESIS PARAGRAPH REQUIRED: The Assessment must begin with a 3-5 sentence paragraph synthesizing the clinical picture at the pattern level — connecting symptoms, labs, and treatment rationale. This is NOT a table of contents ("This patient has X, Y, Z diagnoses addressed below"). It is an independent clinical impression.
- NO "Counseling / Education:" SUB-SECTIONS: Never add a "Counseling / Education:" or "Monitoring / Follow-up:" sub-section header under any numbered Assessment item. Education and counseling belong woven into the clinical reasoning paragraph as integrated clinical sentences.
- NO BOILERPLATE CONSENT PHRASES: Never write "Patient verbalized understanding and consented," "Risks and benefits discussed," "Patient is agreeable," or "Education provided regarding [X]." These phrases must not appear anywhere in the revised note.
- NUMBERED ITEMS GROUPED BY DOMAIN: Assessment items should follow the same topical grouping as the HPI — hormonal together, metabolic together, etc. Do not scatter related diagnoses randomly.
- PLAIN TEXT ONLY: No asterisks, no markdown bold, no pound signs, no underscores anywhere in the note.
- INTEGRATED INITIATION COUNSELING: For medications being initiated, write the counseling specifics (titration plan, named side effects, administration instructions) as natural sentences in the clinical reasoning paragraph — not as a separate sub-section.

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

TRANSCRIPT (full conversation — review the entire encounter, including later sections, before flagging diagnoses or findings as unsupported; encounters may be 60-90 minutes long, review the entire text):
${transcriptText.substring(0, 120000)}

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
  const { openai, extraction, transcriptText, diarized, labContext, patternContext, medicationContext, encounter, historicalContext, diagnosisBundles } = input;

  console.log("[SOAP Pipeline] Step 3c: Medical normalization + context inference...");
  let normalized: NormalizedExtraction;
  try {
    normalized = await medicalNormalizationAndInference(openai, extraction, transcriptText, diarized, diagnosisBundles);
    console.log(`[SOAP Pipeline] Normalization complete: ${normalized.medications_normalized.length} meds, ${normalized.conditions_inferred.length} conditions, ${normalized.preventative_signals.length} preventative signals`);
    console.log(`[SOAP Pipeline] Plan classification: ${normalized.explicitly_decided_plan_items.length} decided, ${normalized.discussed_but_not_decided.length} discussed, ${normalized.clinically_relevant_followup.length} follow-up`);
    if (normalized.matched_bundles?.length) {
      console.log(`[SOAP Pipeline] Diagnosis bundle matches: ${normalized.matched_bundles.map(b => `"${b.bundle_title}" (${b.confidence})`).join(", ")}`);
    }
  } catch (err) {
    console.warn("[SOAP Pipeline] Normalization/inference failed, proceeding with extraction only:", err);
    normalized = {
      medications_normalized: [],
      conditions_inferred: [],
      preventative_signals: [],
      symptom_timeline: [],
      explicitly_decided_plan_items: [],
      discussed_but_not_decided: [],
      future_considerations: [],
      exploratory_discussions: [],
      treatment_rationale: [],
      clinically_relevant_followup: [],
      matched_bundles: [],
      enhanced_extraction: {},
    };
  }

  console.log("[SOAP Pipeline] Step 4: Section-specific SOAP generation (HPI reconstruction)...");
  let soapOutput: PipelineOutput;
  try {
    soapOutput = await generateSoapSections(
      openai, extraction, normalized, transcriptText, diarized,
      labContext, patternContext, medicationContext, encounter, input.patientName, historicalContext, diagnosisBundles
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
