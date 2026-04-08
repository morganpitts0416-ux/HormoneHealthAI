import type { MedicationEntry, MedicationMatch } from "@shared/schema";

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

type TermEntry = {
  entry: MedicationEntry;
  matchType: MedicationMatch["matchType"];
  confidence: number;
};

export function normalizeTranscript(
  transcriptText: string,
  entries: MedicationEntry[]
): MedicationMatch[] {
  if (!entries.length || !transcriptText.trim()) return [];

  const lookup = new Map<string, TermEntry>();

  const add = (term: string, entry: MedicationEntry, matchType: TermEntry["matchType"], confidence: number) => {
    const key = norm(term);
    if (key && !lookup.has(key)) lookup.set(key, { entry, matchType, confidence });
  };

  for (const entry of entries) {
    add(entry.genericName, entry, "generic", 1.0);
    for (const b of (entry.brandNames ?? [])) add(b, entry, "brand", 0.95);
    for (const s of (entry.commonSpokenVariants ?? [])) add(s, entry, "spoken_variant", 0.85);
    for (const m of (entry.commonMisspellings ?? [])) add(m, entry, "misspelling", 0.75);
  }

  const singleWordTerms = [...lookup.keys()].filter(k => !k.includes(" "));

  const wordTokens: { word: string; normWord: string; start: number; end: number }[] = [];
  let pos = 0;
  for (const chunk of transcriptText.split(/(\s+)/)) {
    if (/\S/.test(chunk)) {
      wordTokens.push({ word: chunk, normWord: norm(chunk), start: pos, end: pos + chunk.length });
    }
    pos += chunk.length;
  }

  const matches: MedicationMatch[] = [];
  const usedRanges: [number, number][] = [];
  const overlaps = (s: number, e: number) => usedRanges.some(([us, ue]) => s < ue && e > us);

  for (let winSize = 4; winSize >= 1; winSize--) {
    for (let i = 0; i <= wordTokens.length - winSize; i++) {
      const slice = wordTokens.slice(i, i + winSize);
      const phrase = slice.map(w => w.normWord).join(" ");
      const start = slice[0].start;
      const end = slice[slice.length - 1].end;
      if (overlaps(start, end)) continue;
      if (lookup.has(phrase)) {
        const { entry, matchType, confidence } = lookup.get(phrase)!;
        usedRanges.push([start, end]);
        matches.push({
          originalTerm: transcriptText.slice(start, end),
          canonicalName: entry.genericName,
          drugClass: entry.drugClass ?? null,
          subclass: entry.subclass ?? null,
          route: entry.route ?? null,
          matchType,
          confidence,
          needsReview: confidence < 0.75,
          notes: entry.notes ?? null,
          startIndex: start,
          endIndex: end,
        });
      }
    }
  }

  for (let i = 0; i < wordTokens.length; i++) {
    const { normWord, start, end } = wordTokens[i];
    if (normWord.length < 5 || overlaps(start, end)) continue;
    let bestDist = Infinity;
    let bestTerm: TermEntry | null = null;
    for (const term of singleWordTerms) {
      if (Math.abs(term.length - normWord.length) > 3) continue;
      const dist = levenshtein(normWord, term);
      if (dist <= 2 && dist < bestDist) { bestDist = dist; bestTerm = lookup.get(term)!; }
    }
    if (bestTerm) {
      const confidence = parseFloat(Math.max(0.5, bestTerm.confidence - bestDist * 0.15).toFixed(2));
      usedRanges.push([start, end]);
      matches.push({
        originalTerm: transcriptText.slice(start, end),
        canonicalName: bestTerm.entry.genericName,
        drugClass: bestTerm.entry.drugClass ?? null,
        subclass: bestTerm.entry.subclass ?? null,
        route: bestTerm.entry.route ?? null,
        matchType: "fuzzy",
        confidence,
        needsReview: true,
        notes: bestTerm.entry.notes ?? null,
        startIndex: start,
        endIndex: end,
      });
    }
  }

  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/);
  if (!lines.length) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        fields.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

export function parseArrayField(val: string): string[] {
  if (!val || !val.trim()) return [];
  const v = val.trim();
  if (v.startsWith("[")) {
    try { return JSON.parse(v).map((s: unknown) => String(s).trim()).filter(Boolean); } catch { /* fall through */ }
  }
  return v.split(/[|;]/).map(s => s.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}
