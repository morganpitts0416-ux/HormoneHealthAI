import { PDFParse } from 'pdf-parse';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface ExtractedLabValues {
  // CBC
  hemoglobin?: number;
  hematocrit?: number;
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
  
  // Hormones - Male/Female
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
  tpoAntibodies?: number;
  
  // Iron Studies
  iron?: number;
  tibc?: number;
  ironSaturation?: number;
  ferritin?: number;
  
  // Vitamins
  vitaminD?: number;
  vitaminB12?: number;
  folate?: number;
  
  // Inflammation
  hsCRP?: number;
  
  // Glycemic
  a1c?: number;
  
  // Male-specific
  psa?: number;
  previousPsa?: number;
  monthsSinceLastPsa?: number;
}

export class PDFExtractionService {
  static async extractLabValues(pdfBuffer: Buffer): Promise<ExtractedLabValues> {
    console.log('[PDF Extraction] Starting extraction, buffer size:', pdfBuffer.length);
    
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    const extractedText = result.text;
    
    console.log('[PDF Extraction] Text extracted, length:', extractedText.length);
    console.log('[PDF Extraction] First 500 chars:', extractedText.substring(0, 500));

    const labValues = await this.parseLabValuesWithAI(extractedText);
    
    console.log('[PDF Extraction] Extracted values:', JSON.stringify(labValues, null, 2));
    
    return labValues;
  }

  private static async parseLabValuesWithAI(text: string): Promise<ExtractedLabValues> {
    const prompt = `You are a medical lab report parser. Extract numerical lab values from this lab report text.

LAB REPORT TEXT:
${text}

EXTRACTION RULES:
1. Extract ONLY numeric values (e.g., 48, 165, 5.8)
2. Match values to the correct lab test names
3. For values like "<5" or ">20", extract the number (5 or 20)
4. Common test name variations:
   - Hematocrit: HCT, Hct, Hematocrit
   - Hemoglobin: HGB, Hgb, Hemoglobin (NOT Hemoglobin A1C)
   - MCV: Mean Corpuscular Volume, MCV (fL)
   - LDL: LDL-C, LDL Cholesterol, LDL Cholesterol (Calculation)
   - HDL: HDL-C, HDL Cholesterol
   - Total Cholesterol: CHOL, Cholesterol Total
   - Triglycerides: TRIG, TG
   - Testosterone: Total Testosterone, Testosterone Total, Testosterone Total by LC/MS
   - Free Testosterone: Free Testosterone (calculation), Free T
   - A1c: HbA1c, Hemoglobin A1c, Hemoglobin A1C, Glycated Hemoglobin
   - PSA: Prostate Specific Antigen
   - TSH: Thyroid Stimulating Hormone
   - Free T4: FT4, Free Thyroxine
   - Free T3: FT3, Free Triiodothyronine
   - TPO Antibodies: Thyroid Peroxidase Antibodies, TPO Ab
   - AST: SGOT, Aspartate Aminotransferase
   - ALT: SGPT, Alanine Aminotransferase
   - Alk Phos: Alkaline Phosphatase
   - eGFR: Estimated GFR, GFR, eGFR by Creatinine
   - Estradiol: E2
   - Progesterone: Prog
   - LH: Luteinizing Hormone
   - FSH: Follicle Stimulating Hormone
   - Prolactin: PRL
   - SHBG: Sex Hormone Binding Globulin
   - DHEA-S: DHEAS, Dehydroepiandrosterone Sulfate
   - AMH: Anti-Mullerian Hormone
   - Iron: Serum Iron
   - TIBC: Iron Binding Cap, Iron Binding Capacity, Total Iron Binding Capacity
   - Iron Saturation: Percent Saturation, % Saturation, Transferrin Saturation
   - Ferritin: Serum Ferritin
   - Vitamin D: Vitamin D 25-Hydroxy, 25-OH Vitamin D, 25-Hydroxyvitamin D
   - Vitamin B12: B12, Cobalamin
   - Folate: Folic Acid
   - hs-CRP: C-Reactive Protein High Sensitivity, CRP High Sensitivity, hsCRP
   - Apo B: Apolipoprotein B
   - Lp(a): Lipoprotein (a), Lipoprotein A
   - Magnesium: Mg

5. Return ONLY values found in the report
6. Omit any field that's not present
7. Convert percentages to decimals where appropriate (e.g., Hct 48% → 48)

Return a JSON object with these possible fields (use camelCase):
{
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
}

Extract now:`;

    try {
      console.log('[PDF Extraction] Calling OpenAI for value extraction');
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a medical lab report parser. Extract lab values accurately and return valid JSON only. For values with < or > symbols, extract just the number."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      console.log('[PDF Extraction] AI response:', content);
      
      if (!content) {
        throw new Error('No content in AI response');
      }

      const parsed = JSON.parse(content);
      console.log('[PDF Extraction] Parsed values:', parsed);
      
      return parsed as ExtractedLabValues;
    } catch (error) {
      console.error('[PDF Extraction] Error parsing with AI:', error);
      throw new Error('Failed to extract lab values from PDF');
    }
  }
}
