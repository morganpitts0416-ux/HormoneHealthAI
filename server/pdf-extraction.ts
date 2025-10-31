import { PDFParse } from 'pdf-parse';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface ExtractedLabValues {
  hemoglobin?: number;
  hematocrit?: number;
  rbc?: number;
  wbc?: number;
  platelets?: number;
  ast?: number;
  alt?: number;
  bilirubin?: number;
  creatinine?: number;
  egfr?: number;
  bun?: number;
  sodium?: number;
  potassium?: number;
  chloride?: number;
  co2?: number;
  glucose?: number;
  calcium?: number;
  albumin?: number;
  totalProtein?: number;
  ldl?: number;
  hdl?: number;
  totalCholesterol?: number;
  triglycerides?: number;
  testosterone?: number;
  estradiol?: number;
  lh?: number;
  prolactin?: number;
  shbg?: number;
  freeTestosterone?: number;
  tsh?: number;
  psa?: number;
  a1c?: number;
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
3. Common test name variations:
   - Hematocrit: HCT, Hct, Hematocrit
   - Hemoglobin: HGB, Hgb, Hemoglobin
   - LDL: LDL-C, LDL Cholesterol
   - HDL: HDL-C, HDL Cholesterol
   - Total Cholesterol: CHOL, Cholesterol Total
   - Triglycerides: TRIG, TG
   - Testosterone: Test, Total Testosterone, Testosterone Total
   - A1c: HbA1c, Hemoglobin A1c, Glycated Hemoglobin
   - PSA: Prostate Specific Antigen
   - TSH: Thyroid Stimulating Hormone
   - AST: SGOT, Aspartate Aminotransferase
   - ALT: SGPT, Alanine Aminotransferase
   - eGFR: Estimated GFR, GFR
   - Estradiol: E2
   - LH: Luteinizing Hormone
   - Prolactin: PRL
   - SHBG: Sex Hormone Binding Globulin

4. Return ONLY values found in the report
5. Omit any field that's not present
6. Convert percentages to decimals where appropriate (e.g., Hct 48% → 48)

Return a JSON object with these possible fields (use camelCase):
{
  "hemoglobin": number,
  "hematocrit": number,
  "rbc": number,
  "wbc": number,
  "platelets": number,
  "ast": number,
  "alt": number,
  "bilirubin": number,
  "creatinine": number,
  "egfr": number,
  "bun": number,
  "sodium": number,
  "potassium": number,
  "chloride": number,
  "co2": number,
  "glucose": number,
  "calcium": number,
  "albumin": number,
  "totalProtein": number,
  "ldl": number,
  "hdl": number,
  "totalCholesterol": number,
  "triglycerides": number,
  "testosterone": number,
  "estradiol": number,
  "lh": number,
  "prolactin": number,
  "shbg": number,
  "freeTestosterone": number,
  "tsh": number,
  "psa": number,
  "a1c": number
}

Extract now:`;

    try {
      console.log('[PDF Extraction] Calling OpenAI for value extraction');
      
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a medical lab report parser. Extract lab values accurately and return valid JSON only."
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
