export interface SupplementPriceInfo {
  price: number;
  supplyDays: number;
  sku?: string;
}

const PRICE_MAP: Record<string, SupplementPriceInfo> = {
  "OmegaGenics® Fish Oil EPA-DHA 1000":            { price: 44.95, supplyDays: 30 },
  "OmegaGenics® Fish Oil Neuro 1000":              { price: 52.95, supplyDays: 30 },
  "OmegaGenics\u00AE Fish Oil Neuro 1000":         { price: 52.95, supplyDays: 30 },
  "NutraGems® CoQ10 300":                          { price: 64.95, supplyDays: 30 },
  "NutraGems\u00AE CoQ10 300":                     { price: 64.95, supplyDays: 30 },
  "Testralin®":                                    { price: 74.95, supplyDays: 30 },
  "UltraFlora® Complete Probiotic":                { price: 47.95, supplyDays: 30 },
  "UltraFlora\u00AE Complete Women's Probiotic":   { price: 52.95, supplyDays: 30 },
  "UltraFlora® Healthy Weight with Akkermansia":   { price: 54.95, supplyDays: 30 },
  "UltraFlora\u00AE Healthy Weight with Akkermansia": { price: 54.95, supplyDays: 30 },
  "D3 10,000 + K":                                 { price: 34.95, supplyDays: 60 },
  "D3 5,000 + K":                                  { price: 29.95, supplyDays: 30 },
  "D3 2000 Complex":                               { price: 24.95, supplyDays: 30 },
  "Magtein® Magnesium L-Threonate":                { price: 54.95, supplyDays: 30 },
  "Magtein\u00AE Magnesium L-Threonate":           { price: 54.95, supplyDays: 30 },
  "Adreset®":                                      { price: 57.95, supplyDays: 30 },
  "Exhilarin®":                                    { price: 57.95, supplyDays: 30 },
  "Hemagenics® Red Blood Cell Support":            { price: 44.95, supplyDays: 30 },
  "Hemagenics\u00AE Red Blood Cell Support":       { price: 44.95, supplyDays: 30 },
  "Intrinsi B12-Folate™":                          { price: 41.95, supplyDays: 30 },
  "Intrinsi B12-Folate\u2122":                     { price: 41.95, supplyDays: 30 },
  "HerWellness™ Rapid Stress Relief":              { price: 51.95, supplyDays: 30 },
  "HerWellness\u2122 Rapid Stress Relief":         { price: 51.95, supplyDays: 30 },
  "HerWellness™ Estrovera®":                       { price: 61.95, supplyDays: 30 },
  "HerWellness\u2122 Estrovera\u00AE":             { price: 61.95, supplyDays: 30 },
  "EstroFactors™":                                 { price: 54.95, supplyDays: 30 },
  "EstroFactors\u2122":                            { price: 54.95, supplyDays: 30 },
  "AdvaClear®":                                    { price: 54.95, supplyDays: 28 },
  "AdvaClear\u00AE":                               { price: 54.95, supplyDays: 28 },
  "GlutaClear®":                                   { price: 47.95, supplyDays: 30 },
  "GlutaClear\u00AE":                              { price: 47.95, supplyDays: 30 },
};

export function getSupplementPrice(name: string): SupplementPriceInfo | null {
  return PRICE_MAP[name] ?? null;
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}
