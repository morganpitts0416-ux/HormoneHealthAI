import { PDFParse } from 'pdf-parse';
import OpenAI from 'openai';

// Production-safe: prefer OPENAI_API_KEY (GCP/direct); fall back to AI_INTEGRATIONS_* (Replit dev)
const _pdfApiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const _pdfBaseURL = process.env.OPENAI_API_KEY ? undefined : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  apiKey: _pdfApiKey,
  ...(_pdfBaseURL ? { baseURL: _pdfBaseURL } : {}),
});

export interface ExtractedLabValues {
  patientName?: string;
  dateOfBirth?: string;
  collectionDate?: string;

  // CBC
  hemoglobin?: number;
  hematocrit?: number;
  mcv?: number;
  rbc?: number;
  wbc?: number;
  platelets?: number;

  // CMP - Liver
  ast?: number;
  alt?: number;
  bilirubin?: number;
  alkalinePhosphatase?: number;

  // CMP - Kidney
  creatinine?: number;
  egfr?: number;
  bun?: number;

  // CMP - Electrolytes
  sodium?: number;
  potassium?: number;
  chloride?: number;
  co2?: number;
  calcium?: number;
  magnesium?: number;

  // CMP - Metabolic
  glucose?: number;
  albumin?: number;
  totalProtein?: number;

  // Lipids
  ldl?: number;
  hdl?: number;
  totalCholesterol?: number;
  triglycerides?: number;
  apoB?: number;
  lpa?: number;
  lpaUnit?: string; // 'mg/dL' or 'nmol/L' — extracted from the lab report unit column

  // Hormones
  testosterone?: number;
  freeTestosterone?: number;
  bioavailableTestosterone?: number;
  estradiol?: number;
  progesterone?: number;
  lh?: number;
  fsh?: number;
  prolactin?: number;
  shbg?: number;
  dheas?: number;
  amh?: number;

  // Thyroid
  tsh?: number;
  freeT4?: number;
  freeT3?: number;
  totalT3?: number;
  tpoAntibodies?: number;
  antiTg?: number;

  // Iron
  iron?: number;
  tibc?: number;
  ironSaturation?: number;
  ferritin?: number;

  // Vitamins
  vitaminD?: number;
  vitaminB12?: number;
  folate?: number;

  // Inflammation / Glycemic / Cardiovascular
  hsCRP?: number;
  a1c?: number;
  homocysteine?: number;

  // Male-specific
  psa?: number;
  previousPsa?: number;
  monthsSinceLastPsa?: number;
}

// ── Shared extraction prompt ──────────────────────────────────────────────────
// Written to be lab-agnostic: works with Quest, LabCorp, Pathgroup, BioReference,
// ARUP, Mayo, hospital labs, specialty labs, and any other format.
const SYSTEM_PROMPT = `You are a highly accurate medical lab report parser. \
Your job is to extract patient demographics and numerical lab values from any \
lab report, regardless of which laboratory produced it or how it is formatted.

LAYOUT AWARENESS — CRITICAL:
Lab reports come in many layouts. Before extracting values, identify the column structure:
- Most reports have columns: Test Name | Result | Units | Reference Range (or Flag)
- Some reports add a "Previous Result" column — ALWAYS extract from the CURRENT result column, never the previous result
- Some reports list results vertically with the value on the same line as the test name
- Some reports are multi-page — scan ALL pages, every test name and result
- When in doubt which number is the result vs. reference range: the result is a single value; the reference range is a range (e.g. "72-100" or "< 5.0")
- A reference range written as "< X" or "> X" on a SEPARATE "Reference Interval" or "Ref Range" column is a reference range — do NOT extract it as a result
- A result written as "< X" or "> X" in the RESULT column IS a result — extract the number (e.g. "< 5" → 5)

EXTRACTION RULES:
1. Patient demographics
   - patientName: patient's full name (look for "Patient:", "Name:", "Patient Name:", header area)
   - dateOfBirth: DOB in MM/DD/YYYY or YYYY-MM-DD (look for "DOB:", "Date of Birth:", "Birth Date:", "D.O.B:")
   - collectionDate: the specimen draw/collection date — NOT the report date, NOT the received date, NOT the resulted date
     (look for "Collection Date:", "Date Collected:", "Collected:", "Draw Date:", "Specimen Date:", "Collection:", "Collect Date:", "Date of Collection:", "Specimen Collection Date:")
     If no collection date, look for "Service Date:", "Date of Service:", "Visit Date:" as fallback.

2. Lab values — extract the RESULT number only (not reference range numbers)
   - For values like "<5" or ">20" in the RESULT column, extract just the number (5 or 20)
   - For ranges like "72-100", this is a reference range — do NOT extract it as a result
   - Percentages like "48%" → extract as 48
   - Only return values that are explicitly present in the RESULT column; omit anything not found
   - IGNORE columns labeled "Previous", "Prior", "Last Result", "Historical", "Prior Result" — extract current results only
   - If a test appears multiple times (e.g., run twice), extract the most recent result

3. Handle any lab's naming conventions — the same test has many names across different labs:
   - Hemoglobin: HGB, Hgb, Hb, Hemoglobin (NOT HbA1c or Hemoglobin A1C)
   - Hematocrit: HCT, Hct, PCV, HCT/PCV, Hematocrit (%), Packed Cell Volume
   - MCV: Mean Corpuscular Volume, Mean Corp Volume, MCV (fL)
   - WBC: White Blood Cell Count, Leukocytes, White Cells, WBC Count, WBC w/Differential
   - RBC: Red Blood Cell Count, Erythrocytes, Red Cells, RBC Count, Red Blood Cells
   - Platelets: PLT, Thrombocytes, Platelet Count, PLT Count
   - Glucose: Blood Glucose, Fasting Glucose, Random Glucose, Glucose, Serum, Glucose (Fasting), Glucose, Plasma
   - Creatinine: Serum Creatinine, SCr, Creatinine, Serum, Creatinine (Serum), Creatinine-Serum
   - eGFR: Estimated GFR, GFR (CKD-EPI), Glomerular Filtration Rate, eGFR Non-African American, eGFR African American, eGFR (CKD-EPI 2021), Estimated Glomerular Filtration Rate, GFR Estimated, GFR Est
     NOTE for eGFR: Some labs report separate eGFR values for African American and Non-African American populations. Extract whichever single value is present, or the Non-African American value when both are shown.
   - BUN: Blood Urea Nitrogen, Urea Nitrogen, BUN (Blood Urea Nitrogen), Urea, Blood Urea
   - AST: SGOT, Aspartate Aminotransferase, AST (SGOT), Aspartate Transaminase
   - ALT: SGPT, Alanine Aminotransferase, ALT (SGPT), Alanine Transaminase
   - Alkaline Phosphatase: Alk Phos, ALP, Alkaline Phosphatase, Serum, Alk. Phosphatase
   - Total Bilirubin: T. Bilirubin, TBIL, Bilirubin Total, Bilirubin, Total, Total Bilirubin, Serum
   - Total Protein: TP, Total Prot, Protein, Total, Protein Total
   - LDL: LDL-C, LDL Cholesterol, LDL Chol, LDL (Calc), LDL Cholesterol (Calc), LDL-Cholesterol, Cholesterol, LDL, Low Density Lipoprotein
     IMPORTANT for LDL: When the lab reports LDL as "Unable to calculate", "Cannot be calculated", "---", "N/A", "Calc", or any non-numeric text (which commonly occurs when triglycerides are >=400 mg/dL), do NOT extract an LDL value and do NOT substitute any nearby number. Leave "ldl" absent from the output entirely.
   - HDL: HDL-C, HDL Cholesterol, HDL Chol, HDL-Cholesterol, Cholesterol, HDL, High Density Lipoprotein
   - Total Cholesterol: Cholesterol, Chol, CHOL, TC, Cholesterol Total, Total Cholesterol, Serum, Cholesterol, Total
   - Triglycerides: TG, TRIG, Trigs, Triglyceride, Triglycerides, Serum, Triglycerides Total
   - ApoB: Apolipoprotein B, Apo B, Apo-B, ApoB-100, Apolipoprotein B-100, Apo B-100, Apolipoprotein B (ApoB), Apolipoprotein B, Serum
   - Lp(a): Lipoprotein (a), Lipoprotein(a), Lipoprotein A, Lipoprotein a, LP(a), LP(A), LPA, Lp-a, Lp a, Lp[a], LIPOPROTEIN A, lipoprotein little a, Lipoprotein(A), Lipoprotien (a), Lipoprotien(a), Lipoprotien A, Lipoprotien a, LIPOPROTIEN A, Lipoprotein-a, Lipo Protein (a), Lipo-protein (a), Lp(a) Serum, Lp(a), Serum, LIPOPROTEIN (a) SERUM, LIPOPROTEIN (a), SERUM, Lipoprotein (a) Serum, Lipoprotein(a) Serum, Lipoprotein(a), Serum, LP(a) SERUM, Lp(a) Particle, Lipoprotein-Associated, Lipoprotein, Little a
     IMPORTANT for Lp(a): Many labs report this as "< 14 mg/dL" or "< 75 nmol/L" (a less-than result indicating below the detection limit). This is a RESULT, not a reference range — extract the number (e.g. "< 14" → lpa: 14). Also capture the unit from the unit column: if the unit column shows "mg/dL" set lpaUnit to "mg/dL"; if it shows "nmol/L" set lpaUnit to "nmol/L".
   - Testosterone: Total Testosterone, Testosterone Total, Serum Testosterone, Testosterone, Serum, Testosterone, Total, Testosterone (Total), Testosterone, Total, Serum
   - Free Testosterone: Free T, Free Testosterone (Direct), Free Testosterone (Calc), Free Testosterone, Serum, Testosterone, Free, Testosterone Free, Free Testosterone (Equilibrium Dialysis), Testosterone Free (Direct), Testosterone, Free (Direct)
   - Bioavailable Testosterone (→ field "bioavailableTestosterone"): Testosterone Bioavailable, Bioavailable Testosterone, Bioavailable T, Testosterone, Bioavailable, Bio-Available Testosterone, Testosterone Bio Available, Bioavailable Testosterone (Calc), Testosterone Bioavailable (Calc), Testosterone Bioavail, Bioavailable Testosterone, Serum
   - SHBG: Sex Hormone Binding Globulin, SHBG, Sex Hormone-Binding Globulin, SHBG, Serum, Sex Hormone Binding Globulin, Serum
   - Estradiol: E2, Oestradiol, Estradiol, Serum, Estradiol (E2), Estradiol Ultrasensitive, Estradiol, LC/MS/MS
   - Progesterone: Prog, P4, Progesterone, Serum, Progesterone (P4)
   - LH: Luteinizing Hormone, LH, Serum, LH (Luteinizing Hormone), Luteinizing Hormone (LH), Luteinizing Hormone, Serum
   - FSH: Follicle Stimulating Hormone, FSH, Serum, FSH (Follicle Stimulating Hormone), Follicle-Stimulating Hormone, Follicle Stimulating Hormone (FSH), FSH and LH
     CRITICAL — LH AND FSH ARE DISTINCT TESTS: Never use the FSH value for LH, or the LH value for FSH. If only FSH appears on the lab panel, output only "fsh" and leave "lh" absent. If only LH appears, output only "lh" and leave "fsh" absent. Do NOT infer, duplicate, or cross-populate these values under any circumstances.
   - Prolactin: PRL, Prolactin, Serum, Prolactin Level, PRL (Prolactin)
   - DHEA-S: DHEAS, DHEA Sulfate, Dehydroepiandrosterone Sulfate, DHEA-S, DHEA-SO4, DHEA Sulfate, Serum, Dehydroepiandrosterone (DHEA) Sulfate, DHEA-Sulfate, DHEA S Sulfate
   - AMH: Anti-Mullerian Hormone, MIS, AMH, Serum, Anti-Mullerian Hormone (AMH), Müllerian-Inhibiting Substance, Mullerian Inhibiting Substance, AMH (Elecsys)
   - TSH: Thyroid Stimulating Hormone, Thyrotropin, TSH, Serum, TSH (3rd generation), TSH Reflex, TSH with Reflex, Thyroid Stimulating Hormone (TSH), TSH III Generation
   - Free T4: FT4, Free Thyroxine, Free T4 (Direct), Free T4, Serum, Thyroxine, Free, T4 Free, T4, Free, Free T4 (Equilibrium Dialysis), Free Thyroxine (T4), Thyroxine Free
   - Free T3: FT3, Free Triiodothyronine, Free T3 (Direct), Free T3, Serum, Triiodothyronine, Free, T3 Free, T3, Free, Free T3 (Equilibrium Dialysis), Triiodothyronine Free
   - TPO Antibodies: Thyroid Peroxidase Ab, Anti-TPO, TPO Ab, TPO Antibodies, Thyroid Peroxidase Antibodies, Thyroperoxidase (TPO) Antibodies, Anti-Thyroid Peroxidase Antibodies, TPO Ab, Serum, Thyroid Perox Ab, Thyroid Peroxidase (TPO) Ab
   - Total T3: T3 Total, Triiodothyronine Total, Total Triiodothyronine, T3, Total, Triiodothyronine (T3) Total, T3 (Total), Triiodothyronine, Total, T3 Total, Serum
   - Anti-Thyroglobulin: Anti-TG, Anti-Tg Ab, Thyroglobulin Antibodies, TgAb, Thyroglobulin Ab, Anti-Thyroglobulin Antibodies, Thyroglobulin Antibody, Thyroglobulin (Tg) Antibodies, TG Antibodies, Anti-Tg Antibody
   - Homocysteine: HOMOCYSTEINE, Homocyst, HCY, Plasma Homocysteine, Homocysteine, Plasma, Homocysteine, Serum, Homocysteine (Plasma), Homocysteine Total
   - Iron (→ field "iron"): Iron, Serum Iron, Iron Serum, Iron Total, Iron (Fe), Fe Iron, Iron-Serum, Serum Fe, Iron (Total), Iron (Serum), IRON, Iron Level, Iron Studies Iron, Iron (ug/dL), Iron (µg/dL), Iron, Serum (ug/dL)
     IMPORTANT for Iron: When the label column says simply "Iron" (with unit ug/dL or µg/dL), that is the serum iron result — extract it as "iron". Do NOT confuse it with TIBC or Iron Saturation rows on adjacent lines.
   - TIBC (→ field "tibc"): Total Iron Binding Capacity, TIBC, Iron Binding Capacity, Iron Binding Cap, Iron Binding Cap., Iron binding Cap, Iron Bind. Cap., Iron Bind Cap, Iron Binding Capacity Total, Total Iron Binding Cap, Iron Binding, Total Iron Binding, Iron Binding Capacity (TIBC), TIBC (Iron Binding Capacity), Iron Binding Cap Total, Iron Binding Cap (ug/dL), Iron Binding Cap (µg/dL), Unsaturated Iron Binding Capacity (UIBC) — NOTE: UIBC is NOT the same as TIBC; if only UIBC is present, do NOT populate tibc
   - Iron Saturation (→ field "ironSaturation"): Percent Saturation, % Saturation, Iron Saturation, Iron Sat, Iron % Saturation, % Iron Saturation, Transferrin Saturation, Transferrin Sat, TSAT, T-Sat, Iron %, Sat %, % Sat, Sat. %, Percent Sat, Iron Percent Saturation, % Iron Sat, Saturation (Iron), Iron Saturation %
     NOTE — Iron Saturation is always a RESULT percentage (the patient's actual measured saturation, typically 10–60%). When the label says "Percent Saturation" with unit "%" the result on that line is the iron saturation — extract it as "ironSaturation". Extract as a plain number (e.g. "28%" → 28). Do NOT confuse this with reference range percentages printed separately.
   - Ferritin: Serum Ferritin, Ferritin, Serum, Ferritin Level, Ferritin (Serum), Ferritin, Serum (ng/mL)
   - Vitamin D: 25-OH Vitamin D, 25-Hydroxyvitamin D, Vitamin D 25-Hydroxy, Calcidiol, 25(OH) Vitamin D, Vitamin D, 25-Hydroxy, Vitamin D (25-OH), Vitamin D, 25-OH, 25 OH Vitamin D, 25-OH Vit D, 25 Hydroxy Vitamin D, Cholecalciferol, Vitamin D3 25-Hydroxy, 25-Hydroxyvitamin D3, Vitamin D, 25-Hydroxyvitamin D (D2+D3), Vitamin D Total, 25-OH Vitamin D Total
   - Vitamin B12: B12, Cobalamin, Cyanocobalamin, Vitamin B12, Serum, Vitamin B-12, B12 (Cobalamin), Cyanocobalamin B12, Cobalamin (B12), Vitamin B12 Level, B12, Serum
   - Folate: Folic Acid, Serum Folate, Folate, Serum, Folic Acid (Folate), Folate (Folic Acid), Folate Level, Vitamin B9
   - hs-CRP: C-Reactive Protein (High Sensitivity), CRP-HS, hsCRP, hs-CRP, High Sensitivity CRP, CRP, High Sensitivity, CRP (High Sensitivity), Cardiac CRP, hs CRP, C-Reactive Protein HS, C-Reactive Protein, High Sensitivity, CRP Cardiac
   - HbA1c: Hemoglobin A1c, A1C, Glycated Hemoglobin, HbA1C, A1c, HbA1c, Glycohemoglobin, Hemoglobin A1C (HbA1c), Hemoglobin A1c (HbA1c), HbA1c (%), A1C (%), Glycated Hemoglobin (HbA1c)
   - PSA: Prostate Specific Antigen, Total PSA, PSA Total, PSA, Serum, Prostate Specific Antigen (PSA), PSA (Total), Total Prostate Specific Antigen

Return ONLY a valid JSON object. Include only fields with extracted values. No explanation, no commentary, no markdown.`;

const USER_PROMPT_SUFFIX = `

Return this JSON structure (include ONLY fields you found):
{
  "patientName": "string",
  "dateOfBirth": "string (MM/DD/YYYY or YYYY-MM-DD)",
  "collectionDate": "string (MM/DD/YYYY or YYYY-MM-DD)",
  "hemoglobin": number,
  "hematocrit": number,
  "mcv": number,
  "rbc": number,
  "wbc": number,
  "platelets": number,
  "ast": number,
  "alt": number,
  "bilirubin": number,
  "alkalinePhosphatase": number,
  "creatinine": number,
  "egfr": number,
  "bun": number,
  "sodium": number,
  "potassium": number,
  "chloride": number,
  "co2": number,
  "glucose": number,
  "calcium": number,
  "magnesium": number,
  "albumin": number,
  "totalProtein": number,
  "ldl": number,
  "hdl": number,
  "totalCholesterol": number,
  "triglycerides": number,
  "apoB": number,
  "lpa": number,
  "lpaUnit": "mg/dL or nmol/L",
  "testosterone": number,
  "freeTestosterone": number,
  "bioavailableTestosterone": number,
  "estradiol": number,
  "progesterone": number,
  "lh": number,
  "fsh": number,
  "prolactin": number,
  "shbg": number,
  "dheas": number,
  "amh": number,
  "tsh": number,
  "freeT4": number,
  "freeT3": number,
  "tpoAntibodies": number,
  "totalT3": number,
  "antiTg": number,
  "homocysteine": number,
  "iron": number,
  "tibc": number,
  "ironSaturation": number,
  "ferritin": number,
  "vitaminD": number,
  "vitaminB12": number,
  "folate": number,
  "hsCRP": number,
  "a1c": number,
  "psa": number
}`;

/**
 * Count how many numeric lab fields (non-demographic) were extracted.
 * Used to decide whether text extraction was sufficient or vision retry is needed.
 */
function countLabFields(result: ExtractedLabValues): number {
  const demographicKeys = new Set(['patientName', 'dateOfBirth', 'collectionDate', 'lpaUnit']);
  return Object.keys(result).filter(k => !demographicKeys.has(k)).length;
}

/**
 * Detect whether pdf-parse produced garbled/column-scrambled text that will
 * confuse the AI model. Signs of garbled output from multi-column lab PDFs:
 * - Very few word characters relative to total length (mostly numbers/symbols)
 * - Extremely long "words" (columns collapsed without spaces)
 * - The ratio of newlines to content is very low (everything on one line)
 * - Common lab keywords are absent (no "sodium", "glucose", "testosterone", etc.)
 */
function isLikelyGarbled(text: string): boolean {
  if (text.length < 150) return false; // Already handled by caller

  // Check for coherent content — at least some recognizable lab/medical words
  const labKeywords = [
    'sodium', 'glucose', 'creatinine', 'hemoglobin', 'testosterone',
    'cholesterol', 'thyroid', 'ferritin', 'vitamin', 'protein',
    'result', 'patient', 'reference', 'range', 'collected', 'name',
    // Also check for short abbreviations common in labs
    'tsh', 'hdl', 'ldl', 'alt', 'ast', 'wbc', 'rbc', 'hgb', 'hct',
    'plt', 'bun', 'fsh', 'lh', 'e2', 'shbg', 'dhea',
  ];
  const lowerText = text.toLowerCase();
  const keywordsFound = labKeywords.filter(kw => lowerText.includes(kw)).length;

  // If fewer than 2 recognizable keywords found in a long document, it's likely garbled
  if (text.length > 500 && keywordsFound < 2) return true;

  // Check for very long unbroken token sequences (a sign of column collapse)
  const longestToken = Math.max(...text.split(/\s+/).map(t => t.length));
  if (longestToken > 80) return true;

  // Check if text is almost entirely numeric/punctuation (no words)
  const wordChars = (text.match(/[a-zA-Z]/g) ?? []).length;
  const wordRatio = wordChars / text.length;
  if (wordRatio < 0.15 && text.length > 300) return true;

  return false;
}

/**
 * Merge two extraction results, preferring the one with more fields.
 * For fields present in both, prefer the result with more total fields (vision usually wins
 * when text was garbled). Demographics from either source are accepted.
 */
function mergeResults(text: ExtractedLabValues, vision: ExtractedLabValues): ExtractedLabValues {
  const textCount = countLabFields(text);
  const visionCount = countLabFields(vision);

  // Start from the richer source, then fill in any gaps from the other
  const [primary, secondary] = visionCount >= textCount ? [vision, text] : [text, vision];
  const merged: ExtractedLabValues = { ...primary };
  for (const key of Object.keys(secondary) as (keyof ExtractedLabValues)[]) {
    if (merged[key] === undefined || merged[key] === null) {
      (merged as any)[key] = secondary[key];
    }
  }
  return merged;
}

export class PDFExtractionService {
  static async extractLabValues(pdfBuffer: Buffer): Promise<ExtractedLabValues> {
    console.log('[PDF Extraction] Starting extraction, buffer size:', pdfBuffer.length);

    // ── Step 1: Attempt text extraction ──────────────────────────────────────
    let extractedText = '';
    try {
      const parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      extractedText = (result?.text ?? '').trim();
      console.log('[PDF Extraction] Text extracted, length:', extractedText.length);
      if (extractedText.length > 0) {
        console.log('[PDF Extraction] First 300 chars:', extractedText.substring(0, 300));
      }
    } catch (textErr) {
      console.warn('[PDF Extraction] Text extraction failed:', textErr);
    }

    // ── Step 2: Route to text path, vision path, or two-pass ─────────────────
    const textIsShort = extractedText.length <= 150;
    const textIsGarbled = !textIsShort && isLikelyGarbled(extractedText);

    if (textIsShort || textIsGarbled) {
      // Text is missing or garbled — go straight to vision
      if (textIsGarbled) {
        console.log('[PDF Extraction] Text appears garbled/column-scrambled — routing to vision');
      } else {
        console.log('[PDF Extraction] Text too short — falling back to vision extraction');
      }
      return this.extractFromVision(pdfBuffer);
    }

    // Text looks usable — try it first
    console.log('[PDF Extraction] Using text-based AI extraction');
    const textResult = await this.extractFromText(extractedText);
    const textFields = countLabFields(textResult);
    console.log(`[PDF Extraction] Text extraction yielded ${textFields} lab field(s)`);

    // ── Step 3: Two-pass — if text extraction is sparse, also try vision ─────
    // Threshold: fewer than 3 lab values means the text path probably failed to
    // parse this lab's layout correctly. Run vision too and merge.
    if (textFields < 3) {
      console.log('[PDF Extraction] Text extraction sparse — running vision pass for comparison');
      try {
        const visionResult = await this.extractFromVision(pdfBuffer);
        const visionFields = countLabFields(visionResult);
        console.log(`[PDF Extraction] Vision extraction yielded ${visionFields} lab field(s)`);
        const merged = mergeResults(textResult, visionResult);
        console.log(`[PDF Extraction] Merged result has ${countLabFields(merged)} lab field(s)`);
        return merged;
      } catch (visionErr) {
        console.warn('[PDF Extraction] Vision pass failed, using text result:', visionErr);
        return textResult;
      }
    }

    return textResult;
  }

  // ── Text-based extraction ─────────────────────────────────────────────────
  private static async extractFromText(text: string): Promise<ExtractedLabValues> {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',  // Upgraded from gpt-4o-mini for better layout understanding
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Extract all lab values from this report:\n\n${text.slice(0, 30000)}${USER_PROMPT_SUFFIX}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      console.log('[PDF Extraction] Text AI response length:', content.length);
      const parsed = JSON.parse(content);
      console.log('[PDF Extraction] Extracted fields:', Object.keys(parsed).join(', '));
      return parsed as ExtractedLabValues;
    } catch (err) {
      console.error('[PDF Extraction] Text-based AI extraction failed:', err);
      throw new Error('Failed to extract lab values from PDF text');
    }
  }

  // ── Vision-based extraction (scanned / image-based PDFs) ─────────────────
  private static async extractFromVision(pdfBuffer: Buffer): Promise<ExtractedLabValues> {
    // Render PDF pages as PNG screenshots — capture up to 12 pages
    let pageImages: { data: Buffer }[] = [];
    try {
      const parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getScreenshot({ scale: 1.5, first: 12, imageDataUrl: false, imageBuffer: true });
      pageImages = (result?.pages ?? []).filter((p: any) => p?.data) as { data: Buffer }[];
      await parser.destroy();
      console.log('[PDF Extraction] Got', pageImages.length, 'page screenshot(s)');
    } catch (shotErr) {
      console.error('[PDF Extraction] Screenshot extraction failed:', shotErr);
      throw new Error('This PDF appears to be image-based and could not be rendered. Please enter lab values manually.');
    }

    if (pageImages.length === 0) {
      throw new Error('No pages could be rendered from this PDF. Please enter lab values manually.');
    }

    // Build vision message — send all pages (up to 10) so no lab values are missed
    const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `This is a lab report rendered as image(s) — ALL pages are included. Scan every page carefully and extract all patient demographics and lab values found anywhere in the report. Pay close attention to the column layout: identify which column contains the actual result values vs. reference ranges.${USER_PROMPT_SUFFIX}`,
      },
      ...pageImages.slice(0, 10).map((p): OpenAI.Chat.ChatCompletionContentPart => ({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${Buffer.from(p.data).toString('base64')}`,
          detail: 'high',  // Upgraded from 'auto' for better text recognition on lab reports
        },
      })),
    ];

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: imageContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 4000,  // Increased from 3000 to handle larger panels
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      console.log('[PDF Extraction] Vision AI response length:', content.length);
      const parsed = JSON.parse(content);
      console.log('[PDF Extraction] Vision extracted fields:', Object.keys(parsed).join(', '));
      return parsed as ExtractedLabValues;
    } catch (err) {
      console.error('[PDF Extraction] Vision-based AI extraction failed:', err);
      throw new Error('Failed to extract lab values from PDF images');
    }
  }
}
