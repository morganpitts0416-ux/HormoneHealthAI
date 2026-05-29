import { PDFParse } from 'pdf-parse';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
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

  // Hormones
  testosterone?: number;
  freeTestosterone?: number;
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
// Used for both text-based and vision-based extraction.  Written to be
// lab-agnostic: works with Quest, LabCorp, BioReference, hospital labs,
// specialty labs, and any other format.
const SYSTEM_PROMPT = `You are a highly accurate medical lab report parser. \
Your job is to extract patient demographics and numerical lab values from any \
lab report, regardless of which laboratory produced it or how it is formatted.

EXTRACTION RULES:
1. Patient demographics
   - patientName: patient's full name (look for "Patient:", "Name:", header area)
   - dateOfBirth: DOB in MM/DD/YYYY or YYYY-MM-DD (look for "DOB:", "Date of Birth:", "Birth Date:")
   - collectionDate: the specimen draw/collection date — NOT the report date
     (look for "Collection Date:", "Date Collected:", "Collected:", "Draw Date:", "Specimen Date:")

2. Lab values — extract the RESULT number only (not reference range numbers)
   - For values like "<5" or ">20", extract just the number (5 or 20)
   - For ranges like "72-100", this is a reference range — do NOT extract it
   - Percentages like "48%" → extract as 48
   - Only return values that are explicitly present; omit anything not found

3. Handle any lab's naming conventions — the same test has many names:
   - Hemoglobin: HGB, Hgb, Hb (NOT HbA1c or Hemoglobin A1C)
   - Hematocrit: HCT, Hct, PCV
   - MCV: Mean Corpuscular Volume
   - WBC: White Blood Cell Count, Leukocytes
   - RBC: Red Blood Cell Count, Erythrocytes
   - Platelets: PLT, Thrombocytes
   - Glucose: Blood Glucose, Fasting Glucose, Random Glucose
   - Creatinine: Serum Creatinine, SCr
   - eGFR: Estimated GFR, GFR (CKD-EPI), Glomerular Filtration Rate
   - BUN: Blood Urea Nitrogen, Urea Nitrogen
   - AST: SGOT, Aspartate Aminotransferase
   - ALT: SGPT, Alanine Aminotransferase
   - Alkaline Phosphatase: Alk Phos, ALP
   - Total Bilirubin: T. Bilirubin, TBIL
   - Total Protein: TP, Total Prot
   - LDL: LDL-C, LDL Cholesterol, LDL Chol, LDL (Calc)
   - HDL: HDL-C, HDL Cholesterol, HDL Chol
   - Total Cholesterol: Cholesterol, Chol, CHOL, TC
   - Triglycerides: TG, TRIG, Trigs
   - ApoB: Apolipoprotein B, Apo B, Apo-B, ApoB-100, Apolipoprotein B-100, Apo B-100
   - Lp(a): Lipoprotein (a), Lipoprotein(a), Lipoprotein A, Lipoprotein a, LP(a), LP(A), LPA, Lp-a, Lp a, Lp[a], LIPOPROTEIN A, lipoprotein little a, Lipoprotein(A), Lipoprotien (a), Lipoprotien(a), Lipoprotien A, Lipoprotien a, LIPOPROTIEN A, Lipoprotein-a, Lipo Protein (a), Lipo-protein (a)
   - Testosterone: Total Testosterone, Testosterone Total, Serum Testosterone
   - Free Testosterone: Free T, Free Testosterone (Direct), Free Testosterone (Calc)
   - SHBG: Sex Hormone Binding Globulin
   - Estradiol: E2, Oestradiol
   - Progesterone: Prog, P4
   - LH: Luteinizing Hormone
   - FSH: Follicle Stimulating Hormone
   - Prolactin: PRL
   - DHEA-S: DHEAS, DHEA Sulfate, Dehydroepiandrosterone Sulfate
   - AMH: Anti-Mullerian Hormone, MIS
   - TSH: Thyroid Stimulating Hormone, Thyrotropin
   - Free T4: FT4, Free Thyroxine, Free T4 (Direct)
   - Free T3: FT3, Free Triiodothyronine, Free T3 (Direct)
   - TPO Antibodies: Thyroid Peroxidase Ab, Anti-TPO, TPO Ab
   - Total T3: T3 Total, Triiodothyronine Total, Total Triiodothyronine
   - Anti-Thyroglobulin: Anti-TG, Anti-Tg Ab, Thyroglobulin Antibodies, TgAb
   - Homocysteine: HOMOCYSTEINE, Homocyst, HCY, Plasma Homocysteine
   - Iron (→ field "iron"): Serum Iron, Iron Serum, Iron Total, Iron, Total, Iron (Fe), Fe, Iron, Serum, Iron Total Serum, Fe Serum, Iron-Serum, Serum Fe, Iron (Total), Iron (Serum), IRON, FE, Iron Level, Iron Studies Iron
   - TIBC (→ field "tibc"): Total Iron Binding Capacity, TIBC, Iron Binding Capacity, Iron Binding Cap, Iron Binding Cap., Iron Bind. Cap., Iron Bind Cap, Iron Binding Capacity Total, Iron Binding Capacity, Total, Total Iron Binding Cap, Iron Binding, Total Iron Binding, Iron Binding Capacity (TIBC), TIBC (Iron Binding Capacity), Iron Binding Cap Total
   - Iron Saturation (→ field "ironSaturation"): % Saturation, Percent Saturation, Iron Saturation, Iron Sat, Iron Sat., Iron % Saturation, Iron, % Saturation, % Iron Saturation, Transferrin Saturation, Transferrin Sat, Transferrin Sat., TSAT, T-Sat, Iron %, Sat %, % Sat, % Sat., Sat. %, Percent Sat, Iron Percent Saturation, % Iron Sat, Saturation (Iron), Iron Saturation %
   NOTE — Iron Saturation is always a RESULT percentage (the patient's actual measured saturation, typically 10–60%). The number after "% Saturation" on the same line is the RESULT. Extract it as a plain number (e.g. "28%" → 28). Do NOT confuse this with reference range percentages printed separately.
   - Ferritin: Serum Ferritin
   - Vitamin D: 25-OH Vitamin D, 25-Hydroxyvitamin D, Vitamin D 25-Hydroxy, Calcidiol
   - Vitamin B12: B12, Cobalamin, Cyanocobalamin
   - Folate: Folic Acid, Serum Folate
   - hs-CRP: C-Reactive Protein (High Sensitivity), CRP-HS, hsCRP
   - HbA1c: Hemoglobin A1c, A1C, Glycated Hemoglobin, HbA1C
   - PSA: Prostate Specific Antigen, Total PSA

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
  "testosterone": number,
  "freeTestosterone": number,
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

    // ── Step 2: Route to text or vision path ─────────────────────────────────
    // If we got meaningful text (>150 chars) use the text-based path.
    // Otherwise fall back to vision — the PDF is likely scanned/image-based.
    if (extractedText.length > 150) {
      console.log('[PDF Extraction] Using text-based AI extraction');
      return this.extractFromText(extractedText);
    }

    console.log('[PDF Extraction] Text too short — falling back to vision extraction');
    return this.extractFromVision(pdfBuffer);
  }

  // ── Text-based extraction ─────────────────────────────────────────────────
  private static async extractFromText(text: string): Promise<ExtractedLabValues> {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
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
      const result = await parser.getScreenshot({ scale: 1.2, first: 12, imageDataUrl: false, imageBuffer: true });
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
    // Scale is reduced to 1.2 to keep per-page token cost manageable across many pages
    const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `This is a lab report rendered as image(s) — ALL pages are included. Scan every page and extract all patient demographics and lab values found anywhere in the report.${USER_PROMPT_SUFFIX}`,
      },
      ...pageImages.slice(0, 10).map((p): OpenAI.Chat.ChatCompletionContentPart => ({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${Buffer.from(p.data).toString('base64')}`,
          detail: 'auto',
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
        max_tokens: 3000,
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
