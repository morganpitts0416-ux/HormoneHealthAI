import type { LabValues, FemaleLabValues, InsulinResistanceMarker, InsulinResistancePhenotype, InsulinResistanceScreening } from "@shared/schema";

export type { InsulinResistanceMarker, InsulinResistancePhenotype, InsulinResistanceScreening };

function computeTgHdlRatio(trig?: number, hdl?: number): number | null {
  if (trig === undefined || hdl === undefined || hdl === 0) return null;
  return Math.round((trig / hdl) * 100) / 100;
}

export function screenInsulinResistance(
  labs: LabValues | FemaleLabValues,
  sex: 'male' | 'female'
): InsulinResistanceScreening | null {
  const tgHdl = computeTgHdlRatio(labs.triglycerides, labs.hdl);
  const fastingInsulin = (labs as any).fastingInsulin as number | undefined;
  const glucose = labs.glucose;

  const markers: InsulinResistanceMarker[] = [];
  const missingMarkers: string[] = [];

  // ── A1c (0–3 pts) ────────────────────────────────────────────────────────
  if (labs.a1c !== undefined) {
    let pts = 0;
    let detail = '';
    if (labs.a1c < 5.3)        { pts = 0; detail = 'Optimal glycemic control'; }
    else if (labs.a1c < 5.5)   { pts = 1; detail = 'Early glycemic drift — subtle IR signal'; }
    else if (labs.a1c < 5.7)   { pts = 2; detail = 'Pre-prediabetes range — early IR physiology'; }
    else                        { pts = 3; detail = 'Prediabetic range'; }
    markers.push({
      name: 'A1c', value: `${labs.a1c}%`,
      threshold: '<5.3=0 / 5.3–5.4=1pt / 5.5–5.6=2pt / ≥5.7=3pt',
      positive: pts > 0, points: pts, maxPoints: 3, detail,
    });
  } else {
    missingMarkers.push('A1c');
  }

  // ── TG:HDL ratio (0–2 pts) ───────────────────────────────────────────────
  if (tgHdl !== null) {
    let pts = 0;
    let detail = '';
    if (tgHdl < 2.0)      { pts = 0; detail = 'Optimal TG:HDL ratio'; }
    else if (tgHdl < 3.0) { pts = 1; detail = 'Borderline — early IR signal'; }
    else                   { pts = 2; detail = 'Elevated — strong IR marker'; }
    markers.push({
      name: 'TG:HDL Ratio', value: tgHdl,
      threshold: '<2.0=0 / 2.0–2.9=1pt / ≥3.0=2pt',
      positive: pts > 0, points: pts, maxPoints: 2, detail,
    });
  } else {
    missingMarkers.push('TG:HDL Ratio (requires triglycerides + HDL)');
  }

  // ── ApoB (0–2 pts) ───────────────────────────────────────────────────────
  if (labs.apoB !== undefined) {
    let pts = 0;
    let detail = '';
    if (labs.apoB < 80)       { pts = 0; detail = 'Optimal atherogenic particle count'; }
    else if (labs.apoB < 90)  { pts = 1; detail = 'Borderline ApoB'; }
    else                       { pts = 2; detail = 'Elevated atherogenic particle count'; }
    markers.push({
      name: 'ApoB', value: `${labs.apoB} mg/dL`,
      threshold: '<80=0 / 80–89=1pt / ≥90=2pt',
      positive: pts > 0, points: pts, maxPoints: 2, detail,
    });
  } else {
    missingMarkers.push('ApoB');
  }

  // ── ALT — sex-specific (0–2 pts) ─────────────────────────────────────────
  if (labs.alt !== undefined) {
    let pts = 0;
    let detail = '';
    if (sex === 'female') {
      if (labs.alt < 20)       { pts = 0; detail = 'Optimal liver enzyme (female)'; }
      else if (labs.alt < 25)  { pts = 1; detail = 'Borderline — hepatic IR signal (female)'; }
      else                      { pts = 2; detail = 'Elevated — hepatic insulin resistance pattern'; }
    } else {
      if (labs.alt < 25)       { pts = 0; detail = 'Optimal liver enzyme (male)'; }
      else if (labs.alt < 35)  { pts = 1; detail = 'Borderline — hepatic IR signal (male)'; }
      else                      { pts = 2; detail = 'Elevated — hepatic insulin resistance pattern'; }
    }
    const thresh = sex === 'female'
      ? '<20=0 / 20–24=1pt / ≥25=2pt'
      : '<25=0 / 25–34=1pt / ≥35=2pt';
    markers.push({
      name: 'ALT', value: `${labs.alt} U/L`,
      threshold: thresh,
      positive: pts > 0, points: pts, maxPoints: 2, detail,
    });
  } else {
    missingMarkers.push('ALT');
  }

  // ── hs-CRP (0–2 pts) ─────────────────────────────────────────────────────
  if (labs.hsCRP !== undefined) {
    let pts = 0;
    let detail = '';
    if (labs.hsCRP < 1.0)       { pts = 0; detail = 'Low inflammatory burden'; }
    else if (labs.hsCRP < 2.0)  { pts = 1; detail = 'Borderline inflammation'; }
    else                          { pts = 2; detail = 'Elevated systemic inflammation'; }
    markers.push({
      name: 'hs-CRP', value: `${labs.hsCRP} mg/L`,
      threshold: '<1.0=0 / 1.0–1.9=1pt / ≥2.0=2pt',
      positive: pts > 0, points: pts, maxPoints: 2, detail,
    });
  } else {
    missingMarkers.push('hs-CRP');
  }

  // ── SHBG — sex-specific (0–2 pts) ────────────────────────────────────────
  if (labs.shbg !== undefined) {
    let pts = 0;
    let detail = '';
    if (sex === 'female') {
      if (labs.shbg >= 60)      { pts = 0; detail = 'Optimal — no SHBG suppression'; }
      else if (labs.shbg >= 40) { pts = 1; detail = 'Borderline low — possible hyperinsulinemia'; }
      else                       { pts = 2; detail = 'Low — hyperinsulinemia-driven SHBG suppression'; }
    } else {
      if (labs.shbg >= 30)      { pts = 0; detail = 'Optimal — no SHBG suppression'; }
      else if (labs.shbg >= 20) { pts = 1; detail = 'Borderline low — possible hyperinsulinemia'; }
      else                       { pts = 2; detail = 'Low — hyperinsulinemia-driven SHBG suppression'; }
    }
    const thresh = sex === 'female'
      ? '≥60=0 / 40–59=1pt / <40=2pt'
      : '≥30=0 / 20–29=1pt / <20=2pt';
    markers.push({
      name: 'SHBG', value: `${labs.shbg} nmol/L`,
      threshold: thresh,
      positive: pts > 0, points: pts, maxPoints: 2, detail,
    });
  } else {
    missingMarkers.push('SHBG');
  }

  // ── Fasting Insulin — optional (0–2 pts) ─────────────────────────────────
  if (fastingInsulin !== undefined) {
    let pts = 0;
    let detail = '';
    if (fastingInsulin < 8)       { pts = 0; detail = 'Optimal fasting insulin'; }
    else if (fastingInsulin <= 12) { pts = 1; detail = 'Borderline — early hyperinsulinemia'; }
    else                            { pts = 2; detail = 'Elevated — hyperinsulinemia pattern'; }
    markers.push({
      name: 'Fasting Insulin', value: `${fastingInsulin} µIU/mL`,
      threshold: '<8=0 / 8–12=1pt / >12=2pt',
      positive: pts > 0, points: pts, maxPoints: 2, detail,
    });
  } else {
    missingMarkers.push('Fasting Insulin');
  }

  // ── HOMA-IR — only if both insulin and glucose are present (0–2 pts) ─────
  let homaIRValue: number | null = null;
  if (fastingInsulin !== undefined && glucose !== undefined && glucose > 0) {
    homaIRValue = Math.round((fastingInsulin * glucose / 405) * 100) / 100;
    let pts = 0;
    let detail = '';
    if (homaIRValue < 1.5)       { pts = 0; detail = 'Optimal insulin sensitivity'; }
    else if (homaIRValue < 2.5)  { pts = 1; detail = 'Borderline — early insulin resistance'; }
    else                          { pts = 2; detail = 'Elevated — significant insulin resistance'; }
    markers.push({
      name: 'HOMA-IR', value: homaIRValue,
      threshold: '<1.5=0 / 1.5–2.4=1pt / ≥2.5=2pt',
      positive: pts > 0, points: pts, maxPoints: 2, detail,
    });
  }

  // Require at least 2 evaluable markers to produce a result
  if (markers.length < 2) return null;

  const score = markers.reduce((s, m) => s + (m.points ?? 0), 0);
  const maxScore = markers.reduce((s, m) => s + (m.maxPoints ?? 0), 0);
  const positiveCount = markers.filter(m => m.positive).length;

  // ── Risk tier ─────────────────────────────────────────────────────────────
  let likelihood: 'none' | 'early' | 'moderate' | 'high';
  let likelihoodLabel: string;
  if (score >= 9) {
    likelihood = 'high';
    likelihoodLabel = 'HIGH LIKELIHOOD OF INSULIN RESISTANCE';
  } else if (score >= 6) {
    likelihood = 'moderate';
    likelihoodLabel = 'MODERATE INSULIN RESISTANCE';
  } else if (score >= 3) {
    likelihood = 'early';
    likelihoodLabel = 'EARLY INSULIN RESISTANCE / EMERGING METABOLIC DYSFUNCTION';
  } else {
    likelihood = 'none';
    likelihoodLabel = 'LOW LIKELIHOOD OF INSULIN RESISTANCE';
  }

  // ── A1c safety note ───────────────────────────────────────────────────────
  const a1cValue = labs.a1c;
  const a1cBelowPrediabetes = a1cValue !== undefined && a1cValue < 5.7;
  const a1cSafetyNote = (likelihood !== 'none' && a1cBelowPrediabetes)
    ? 'A1c remains below the prediabetes threshold, but other markers suggest early insulin resistance physiology. A1c often rises last.'
    : null;

  // ── Phenotype confidence scoring ─────────────────────────────────────────
  const gm = (name: string) => markers.find(m => m.name === name);
  const altM    = gm('ALT');
  const tgHdlM  = gm('TG:HDL Ratio');
  const a1cM    = gm('A1c');
  const apoBM   = gm('ApoB');
  const hsCRPM  = gm('hs-CRP');
  const shbgM   = gm('SHBG');
  const insulinM = gm('Fasting Insulin');
  const homaM   = gm('HOMA-IR');

  const pts = (m: InsulinResistanceMarker | undefined) => m?.points ?? 0;

  const altElevated      = pts(altM) >= 1;
  const tgHdlBorderline  = pts(tgHdlM) >= 1;
  const tgHdlHigh        = pts(tgHdlM) >= 2;
  const a1cElevated      = pts(a1cM) >= 1;
  const apoBBorderline   = pts(apoBM) >= 1;
  const apoBHigh         = pts(apoBM) >= 2;
  const hsCRPBorderline  = pts(hsCRPM) >= 1;
  const hsCRPHigh        = pts(hsCRPM) >= 2;
  const shbgLow          = pts(shbgM) >= 1;
  const insulinHigh      = pts(insulinM) >= 2;
  const insulinBorderline = pts(insulinM) >= 1;
  const homaHigh         = pts(homaM) >= 2;
  const homaBorderline   = pts(homaM) >= 1;

  // Confidence score per phenotype
  const conf: Record<string, number> = {
    hyperinsulinemic: 0,
    hepatic: 0,
    visceral_metabolic: 0,
    hormonal_low_shbg: 0,
    inflammatory: 0,
  };

  // Hyperinsulinemic
  if (insulinHigh)      conf.hyperinsulinemic += 2;
  if (homaHigh)         conf.hyperinsulinemic += 2;
  if (insulinBorderline && !insulinHigh) conf.hyperinsulinemic += 1;
  if (homaBorderline && !homaHigh)       conf.hyperinsulinemic += 1;

  // Hepatic: gated on ALT being elevated
  if (altElevated) {
    conf.hepatic += pts(altM);
    if (tgHdlBorderline) conf.hepatic += 1;
    if (a1cElevated)     conf.hepatic += 1;
    if (apoBBorderline)  conf.hepatic += 1;
  }

  // Visceral / metabolic
  if (tgHdlHigh)       conf.visceral_metabolic += 2;
  else if (tgHdlBorderline) conf.visceral_metabolic += 1;
  if (apoBHigh)        conf.visceral_metabolic += 2;
  else if (apoBBorderline)  conf.visceral_metabolic += 1;
  if (a1cElevated)     conf.visceral_metabolic += 1;

  // Hormonal / low-SHBG: SHBG must be low; bonus if glucose/A1c still normal
  if (shbgLow) {
    conf.hormonal_low_shbg += pts(shbgM);
    if (!a1cElevated) conf.hormonal_low_shbg += 1;
  }

  // Inflammatory: hs-CRP drives this, but heavy metabolic phenotypes weaken it
  if (hsCRPHigh)       conf.inflammatory += 2;
  else if (hsCRPBorderline) conf.inflammatory += 1;

  // ── Build candidate phenotypes ────────────────────────────────────────────
  const TIE_ORDER = ['hyperinsulinemic', 'hepatic', 'visceral_metabolic', 'hormonal_low_shbg', 'inflammatory'] as const;

  const candidates: InsulinResistancePhenotype[] = [];

  if (likelihood !== 'none') {
    // Hyperinsulinemic
    if (conf.hyperinsulinemic > 0) {
      const matched: string[] = [];
      if (pts(insulinM) > 0) matched.push(`Fasting insulin ${fastingInsulin} µIU/mL${insulinHigh ? ' (>12)' : ' (8–12, borderline)'}`);
      if (pts(homaM) > 0)    matched.push(`HOMA-IR ${homaIRValue}${homaHigh ? ' (≥2.5)' : ' (1.5–2.4, borderline)'}`);
      candidates.push({
        name: 'Hyperinsulinemic Insulin Resistance',
        key: 'hyperinsulinemic',
        isPrimary: false,
        confidenceScore: conf.hyperinsulinemic,
        triggerCriteria: ['Fasting insulin >12 µIU/mL', 'HOMA-IR ≥2.5'],
        matchedCriteria: matched,
        pathophysiology: 'Compensatory hyperinsulinemia is driving receptor downregulation. Glucose and A1c may remain normal despite significant underlying insulin resistance.',
        treatmentRecommendations: [
          'Carbohydrate periodization and time-restricted eating',
          'Resistance training 3–4× weekly',
          'Post-meal movement (10–15 min walking)',
          'Consider metformin if HOMA-IR ≥2.5 and other metabolic markers trending',
          'Consider GLP-1/GIP agonist if obesity phenotype or appetite dysregulation present',
          'Monitor fasting insulin and HOMA-IR every 3–6 months',
        ],
        supplementConsiderations: [
          'Berberine GT — supports healthy glucose metabolism and insulin response',
          'MetaGlycemX — supports cardiometabolic health and healthy insulin signaling',
          'Ultra Glucose Control — consider if meal replacement or higher-protein glucose support is appropriate',
        ],
        monitoringPlan: 'Recheck fasting insulin, HOMA-IR, A1c, and metabolic panel in 3–6 months',
        patientExplanation: `What This Means\n\nYour body is producing more insulin than it should need to keep your blood sugar in range. This is called hyperinsulinemia — and it often develops years before blood sugar rises into the prediabetic or diabetic range.\n\nWhen insulin levels run chronically high:\n- Cell insulin receptors become less sensitive over time\n- Fat storage — especially around the midsection — increases\n- SHBG drops, affecting hormone balance\n- Risk for type 2 diabetes and cardiovascular disease rises\n\nThe good news: this stage responds very well to targeted nutrition, movement, and — when appropriate — medication support.`,
      });
    }

    // Hepatic
    if (altElevated && (tgHdlBorderline || a1cElevated || apoBBorderline)) {
      const matched: string[] = [];
      if (pts(altM) > 0)   matched.push(`ALT ${labs.alt} U/L (${altM!.detail})`);
      if (tgHdlBorderline) matched.push(`TG:HDL ${tgHdl}${tgHdlHigh ? ' (≥3.0)' : ' (2.0–2.9)'}`);
      if (a1cElevated)     matched.push(`A1c ${labs.a1c}% (elevated)`);
      if (apoBBorderline)  matched.push(`ApoB ${labs.apoB} mg/dL${apoBHigh ? ' (≥90)' : ' (80–89)'}`);
      candidates.push({
        name: 'Hepatic / Liver-Driven Insulin Resistance',
        key: 'hepatic',
        isPrimary: false,
        confidenceScore: conf.hepatic,
        triggerCriteria: [
          sex === 'female' ? 'ALT ≥20 U/L (female)' : 'ALT ≥25 U/L (male)',
          'AND TG:HDL ≥2.0 or A1c elevated',
        ],
        matchedCriteria: matched,
        pathophysiology: 'Hepatic insulin resistance leads to increased hepatic glucose output and VLDL overproduction. Often represents early MASLD (metabolic-associated steatotic liver disease) physiology, even when ALT is only mildly elevated.',
        treatmentRecommendations: [
          'Reduce fructose and simple carbohydrates; eliminate sugary beverages',
          'Minimize alcohol intake',
          'Protein-first nutrition (≥25g per meal)',
          'Weight reduction goal 5–10% if overweight',
          'Resistance training 3× weekly',
          'Consider GLP-1 therapy if weight loss is clinically appropriate',
        ],
        supplementConsiderations: [
          'Berberine GT — supports healthy glucose, insulin, and lipid metabolism',
          'OmegaGenics EPA-DHA — supports healthy triglyceride levels and inflammatory balance',
          'CandiBactin-BR — consider only if gut/microbial balance or detox support is clinically relevant',
        ],
        monitoringPlan: 'Monitor ALT, TG, ApoB, A1c every 3–6 months',
        patientExplanation: `What This Means\n\nYour labs suggest your liver may be under metabolic strain. The liver plays a central role in blood sugar regulation and fat metabolism.\n\nWhen the liver becomes resistant to insulin:\n- Blood glucose output from the liver rises throughout the day\n- Triglycerides increase\n- Liver enzymes (like ALT) can elevate even before imaging shows changes\n\nThis is common and highly reversible with targeted nutrition, activity, and — when appropriate — medication support.`,
      });
    }

    // Visceral / metabolic
    if (tgHdlBorderline || apoBBorderline) {
      const matched: string[] = [];
      if (tgHdlBorderline) matched.push(`TG:HDL ${tgHdl}${tgHdlHigh ? ' (≥3.0 — significant)' : ' (2.0–2.9)'}`);
      if (apoBBorderline)  matched.push(`ApoB ${labs.apoB} mg/dL${apoBHigh ? ' (≥90 — significant)' : ' (80–89, borderline)'}`);
      if (a1cElevated)     matched.push(`A1c ${labs.a1c}% (elevated)`);
      candidates.push({
        name: 'Visceral / Metabolic Insulin Resistance',
        key: 'visceral_metabolic',
        isPrimary: false,
        confidenceScore: conf.visceral_metabolic,
        triggerCriteria: ['TG:HDL ≥3.0', 'ApoB ≥90 mg/dL', 'A1c elevated (supporting)'],
        matchedCriteria: matched,
        pathophysiology: 'Visceral adiposity-driven insulin resistance with dyslipidemia pattern. Elevated atherogenic particle burden (ApoB, TG:HDL) reflects increased VLDL production and impaired lipolysis from insulin-resistant adipose tissue.',
        treatmentRecommendations: [
          'Protein-forward nutrition (≥25–35g per meal)',
          'Carbohydrate quality and timing optimization',
          'Strength training 2–3× weekly',
          '10–15 min post-meal walking',
          'Sleep and stress optimization',
          'Consider GLP-1/GIP therapy if obesity, appetite dysregulation, or A1c ≥5.7',
          'Consider metformin if prediabetes or strong family history',
        ],
        supplementConsiderations: [
          'Berberine GT — supports healthy glucose metabolism and insulin response',
          'Ultra Glucose Control — supports cardiometabolic health and healthy insulin signaling',
          'OmegaGenics EPA-DHA — supports healthy triglyceride levels if elevated',
        ],
        monitoringPlan: 'Recheck A1c, lipid panel, hs-CRP, ApoB in 3–6 months',
        patientExplanation: `What This Means\n\nYour labs suggest your body may not be responding to insulin as efficiently as it should. Elevated triglycerides, elevated ApoB (particle count), and a high TG:HDL ratio are among the earliest detectable signs of insulin resistance — often appearing before blood sugar rises into the prediabetic range.\n\nThe good news: this pattern responds very well to targeted nutrition, exercise, and — when appropriate — medication.`,
      });
    }

    // Hormonal / low-SHBG
    if (shbgLow) {
      const matched: string[] = [];
      matched.push(`SHBG ${labs.shbg} nmol/L (${shbgM!.detail})`);
      if (!a1cElevated && a1cValue !== undefined) matched.push(`A1c ${a1cValue}% — below prediabetes threshold (hormonal IR physiology)`);
      if (tgHdlBorderline) matched.push(`TG:HDL ${tgHdl}`);
      if (sex === 'female') {
        const fl = labs as FemaleLabValues;
        if (fl.testosterone !== undefined && fl.testosterone > 45)       matched.push(`Elevated total testosterone ${fl.testosterone} ng/dL`);
        if (fl.freeTestosterone !== undefined && fl.freeTestosterone > 6.4) matched.push('Elevated free testosterone');
      }
      candidates.push({
        name: 'Hormonal / Low-SHBG Insulin Resistance',
        key: 'hormonal_low_shbg',
        isPrimary: false,
        confidenceScore: conf.hormonal_low_shbg,
        triggerCriteria: [
          sex === 'female' ? 'SHBG <60 nmol/L (female threshold)' : 'SHBG <30 nmol/L (male threshold)',
          'May occur with normal glucose and A1c',
        ],
        matchedCriteria: matched,
        pathophysiology: 'Chronic hyperinsulinemia suppresses hepatic SHBG production. Low SHBG is an independent marker of insulin resistance and often precedes glucose dysregulation by years.',
        treatmentRecommendations: [
          sex === 'female'
            ? 'Evaluate androgen excess and PCOS pattern; assess thyroid, estradiol/progesterone, sleep quality'
            : 'Evaluate androgen status, thyroid function, visceral adiposity, and sleep quality',
          'Strength training and visceral adiposity reduction',
          'Consider metformin if cycles irregular (female) or A1c trending',
          'Consider GLP-1 if obesity phenotype present',
        ],
        supplementConsiderations: [
          'Berberine GT — consider if TG:HDL, ApoB, or A1c also suggest metabolic dysfunction',
          'MetaGlycemX — consider if broader insulin signaling support is appropriate',
        ],
        monitoringPlan: 'Monitor SHBG, androgens, A1c, and TG:HDL every 3–6 months',
        patientExplanation: `What This Means\n\nYour SHBG (sex hormone-binding globulin) is below optimal. SHBG is produced by the liver and is directly suppressed by elevated insulin levels.\n\nLow SHBG can:\n- Indicate that insulin has been running high, even when blood sugar looks normal\n- Affect hormone availability and balance\n- Signal early metabolic dysfunction before other markers change\n\nImproving insulin sensitivity often helps restore SHBG and hormone balance.`,
      });
    }

    // Inflammatory
    if (hsCRPBorderline) {
      const matched: string[] = [];
      matched.push(`hs-CRP ${labs.hsCRP} mg/L (${hsCRPHigh ? 'significant elevation' : 'borderline'})`);
      candidates.push({
        name: 'Inflammatory Insulin Resistance',
        key: 'inflammatory',
        isPrimary: false,
        confidenceScore: conf.inflammatory,
        triggerCriteria: ['hs-CRP ≥1.0 mg/L (borderline); ≥2.0 mg/L (significant)'],
        matchedCriteria: matched,
        pathophysiology: 'Systemic inflammation — driven by gut dysbiosis, visceral adipose tissue, sleep disruption, chronic stress, or autoimmune activation — promotes inflammatory cytokine release that impairs insulin receptor signaling.',
        treatmentRecommendations: [
          'Prioritize sleep quality and duration (7–9 hours)',
          'Stress regulation: HRV training, therapy, mindfulness',
          'Anti-inflammatory nutrition: Mediterranean pattern, reduce ultra-processed foods',
          'Screen for underlying inflammatory sources: gut, autoimmune, periodontal',
          'Repeat hs-CRP in 6–8 weeks if acutely elevated to confirm chronic pattern',
        ],
        supplementConsiderations: [
          'OmegaGenics EPA-DHA — supports healthy inflammatory balance',
          'UltraInflamX or clinic-approved inflammatory support — consider if inflammatory dietary pattern or gut involvement is suspected',
        ],
        monitoringPlan: 'Repeat hs-CRP in 6–8 weeks; reassess inflammatory sources and sleep/stress factors',
        patientExplanation: `What This Means\n\nYour hs-CRP is elevated, indicating systemic inflammation. Inflammation and insulin resistance are closely linked — each can drive the other in a cycle.\n\nCommon sources of inflammation that impair insulin signaling include:\n- Poor sleep\n- Chronic stress\n- Gut imbalances\n- Visceral adipose tissue\n- Autoimmune activity\n\nAddressing the root cause of the inflammation is the most targeted approach for this pattern.`,
      });
    }
  }

  // ── Select primary phenotype via confidence + tie-breaker hierarchy ────────
  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => {
      if ((b.confidenceScore ?? 0) !== (a.confidenceScore ?? 0)) return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
      return TIE_ORDER.indexOf(a.key) - TIE_ORDER.indexOf(b.key);
    });
    sorted[0].isPrimary = true;
    // Return primary first, then secondaries
    const primary = sorted[0];
    const secondaries = sorted.slice(1);
    candidates.length = 0;
    candidates.push(primary, ...secondaries);
  }

  // ── Confirmation tests ────────────────────────────────────────────────────
  let confirmationTests = '';
  if (likelihood !== 'none') {
    if (fastingInsulin === undefined) {
      confirmationTests = 'Add fasting insulin + fasting glucose (HOMA-IR) to confirm and quantify insulin resistance. Consider fasting C-peptide if insulin secretory capacity is in question.';
    } else if (homaIRValue !== null && homaIRValue >= 1.5) {
      confirmationTests = `HOMA-IR ${homaIRValue} confirms insulin resistance. Consider repeat in 3–6 months to track treatment response.`;
    } else {
      confirmationTests = 'Repeat fasting insulin and HOMA-IR in 3–6 months to track treatment response.';
    }
  }

  // ── Provider summary ──────────────────────────────────────────────────────
  const primaryPhenotype = candidates.find(p => p.isPrimary);
  const secondaryPhenotypes = candidates.filter(p => !p.isPrimary);
  const scoreStr = `${score}/${maxScore}`;

  let providerSummary = '';
  if (likelihood === 'none') {
    providerSummary = `INSULIN RESISTANCE SCREENING: LOW LIKELIHOOD (${scoreStr} points). Available markers do not suggest significant insulin resistance physiology at this time.${missingMarkers.length > 0 ? ` Missing markers: ${missingMarkers.join(', ')}.` : ''}`;
  } else {
    const phenotypeLine = primaryPhenotype
      ? ` Primary phenotype: ${primaryPhenotype.name}.${secondaryPhenotypes.length > 0 ? ` Supporting contributors: ${secondaryPhenotypes.map(p => p.name).join(', ')}.` : ''}`
      : '';
    const safetyLine = a1cSafetyNote ? ` ${a1cSafetyNote}` : '';
    const missingLine = missingMarkers.length > 0 ? ` Missing markers: ${missingMarkers.join(', ')}.` : '';
    providerSummary = `INSULIN RESISTANCE SCREENING: ${likelihoodLabel} (${scoreStr} points).${phenotypeLine}${safetyLine}${missingLine}`;
  }

  return {
    markers,
    missingMarkers,
    score,
    maxScore,
    positiveCount,
    likelihood,
    likelihoodLabel,
    phenotypes: candidates,
    confirmationTests,
    providerSummary,
    a1cSafetyNote,
  };
}
