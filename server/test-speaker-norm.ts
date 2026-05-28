/**
 * Speaker Normalization Regression / Safety Test
 * Run with:  npx tsx server/test-speaker-norm.ts
 *
 * Tests 5 synthetic transcripts (including the Rena Green drift scenario)
 * against normalizeSpeakerRoles() and validates all 7 safety checks.
 * Also verifies that no SOAP prompt blocks were removed or reordered.
 *
 * Zero API calls required — entirely synchronous.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Exact copy of normalizeSpeakerRoles from soap-pipeline.ts ───────────────
// Keep in sync with production manually.  If you change the production
// version, update here, then re-run this test.

const CLINICIAN_SIGNALS = [
  /\b(I'?d like to|let'?s (start|increase|decrease|add|try|hold|stop|continue)|I'?ll (send|order|prescribe|refer|check)|plan (to|was)|recommend(ed)?|we('?ll| will) (start|add|monitor|recheck|adjust|follow))\b/i,
  /\b(your (TSH|T3|T4|A1C|ferritin|testosterone|estradiol|progesterone|LDL|HDL|Lp\(a\)|ApoB|hs-CRP|insulin|glucose|iron saturation|DHEA|cortisol|SHBG|PSA|CBC|CMP|BMP|labs?|levels?|results?)|labs? (show|reveal|indicate|are|look))\b/i,
  /\b(elevated|low|normal range|borderline|mildly|significantly|optimal(ly)?|within normal|out of range|concerning for|consistent with|suggestive of|likely|differential)\b/i,
  /\b(dose|titrat|taper|mg|mcg|mL|units?|twice (daily|a week)|once (daily|a week|weekly|monthly)|every (day|morning|evening|night|other day|\d+ (hours?|days?|weeks?)))\b/i,
  /\b(recheck|follow.?up|return (in|to)|see (you|her|him) (back|in)|office visit|next (visit|appointment|labs?)|labs? in \d+)\b/i,
  /\b(diagnosis|diagnos(ed|is|tic)|assessment|impression|the reason (we'?re|I'?m)|indicated for|works by|mechanism|treatment (goal|plan|option))\b/i,
];

const PATIENT_SIGNALS = [
  /\b(I'?ve been (feeling|having|getting|taking|noticing|experiencing)|I (feel|have|get|notice|think|wonder|worry)|my (energy|mood|sleep|weight|pain|head|stomach|hair|skin|period|cycle))\b/i,
  /\b(yeah|yep|no( not really)?|kind of|I guess|I think (so|maybe)|not sure|maybe|possibly|I don'?t know|I haven'?t|I'?m not)\b/i,
  /\b(it (made|makes|has been making) me|I (stopped|started|forgot|missed|ran out)|I'?ve been (on it|taking it|using it)|side effect(s)? (from|of)|it (bothers?|upsets?|hurts?))\b/i,
  /\b(my (mom|dad|sister|brother|family|grandmother|grandfather) (had|has|was diagnosed)|I had (that|it|surgery|a procedure) (years? ago|when I was|in \d{4})|history of)\b/i,
  /\b(I'?m (worried|concerned|hoping|trying to|struggling|frustrated|tired of)|that'?s (scary|good to know|reassuring|a lot)|I didn'?t (know|realize|think))\b/i,
  /\b(my (TSH|T3|T4|LDL|HDL|Lp\(a\)|ApoB|ferritin|testosterone|estradiol|A1C|hs-CRP|insulin|glucose|DHEA|cortisol|SHBG|PSA|iron|cholesterol|triglycerides?|B12|vitamin D|levels?|labs?|results?) (is |are |was |came|shows?)|does that mean (I should|we should|I need)|should I (start|stop|increase|decrease|take|add|try)|is that (bad|good|normal|concerning|serious|okay))\b/i,
];

const GENERIC_SPEAKER_RE = /^(speaker[_\s]?\d+|spk_\d+|s\d+|speaker[_\s]?[a-z]|unknown|spk)$/i;

interface SpeakerNormResult {
  normalized: any[];
  conflicts: string[];
}

function normalizeSpeakerRoles(diarized: any[]): SpeakerNormResult {
  if (!diarized || diarized.length === 0) return { normalized: [], conflicts: [] };
  const conflicts: string[] = [];

  const normalized = diarized.map((u: any) => {
    const speaker: string = (u.speaker ?? "unknown").toString().trim().toLowerCase();
    const isGenericOrUnknown = speaker === "unknown" || GENERIC_SPEAKER_RE.test(speaker);
    if (!isGenericOrUnknown) {
      return { ...u, speaker: speaker === "clinician" ? "clinician" : speaker === "patient" ? "patient" : "unknown" };
    }
    const text: string = (u.normalizedText ?? u.text ?? "").toString();
    const clinicianScore = CLINICIAN_SIGNALS.filter(re => re.test(text)).length;
    const patientScore   = PATIENT_SIGNALS.filter(re => re.test(text)).length;
    let resolvedSpeaker = "unknown";
    let uncertain = true;
    if (clinicianScore >= 2 && clinicianScore > patientScore) { resolvedSpeaker = "clinician"; uncertain = false; }
    else if (patientScore >= 2 && patientScore > clinicianScore) { resolvedSpeaker = "patient"; uncertain = false; }
    else if (clinicianScore === 1 && patientScore === 0) { resolvedSpeaker = "clinician"; uncertain = true; }
    else if (patientScore === 1 && clinicianScore === 0) { resolvedSpeaker = "patient"; uncertain = true; }
    return { ...u, speaker: resolvedSpeaker, uncertain: uncertain || (u.uncertain ?? false), _speakerResolved: true };
  });

  const MEDICATION_PLAN_RE = /\b(start(ing)?|initiat(e|ing)|prescri(be|bing)|recommend(ing)?|titrat|increas(e|ing)|decreas(e|ing)|add(ing)?|adjust(ing)?) (the |a |your |my )?(dose|medication|supplement|treatment|therapy|[a-z]+(ine|ide|ole|ate|mab|zole|pril|artan|statin|mycin)\b)/i;
  const LAB_INTERPRETATION_RE = /\b(your |the )?(TSH|T3|T4|LDL|HDL|ApoB|Lp\(a\)|ferritin|testosterone|estradiol|A1C|hs-CRP|CBC|CMP|glucose|insulin|iron saturation|DHEA|cortisol|SHBG|PSA) (is |are |looks?|shows?|came back|resulted|came in)\b/i;

  for (const u of normalized) {
    const text: string = (u.normalizedText ?? u.text ?? "").toString();
    // Flag on any segment NOT clearly attributed to the clinician (patient OR unknown).
    if (u.speaker === "patient" || u.speaker === "unknown") {
      if (MEDICATION_PLAN_RE.test(text))
        conflicts.push(`[ID:${u.id ?? "?"}][${u.speaker.toUpperCase()}] Medication plan language on non-clinician segment — verify speaker: "${text.slice(0, 120)}"`);
      if (LAB_INTERPRETATION_RE.test(text))
        conflicts.push(`[ID:${u.id ?? "?"}][${u.speaker.toUpperCase()}] Lab interpretation on non-clinician segment — likely misattributed: "${text.slice(0, 120)}"`);
    }
  }
  return { normalized, conflicts };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failedTests: string[] = [];

function assert(condition: boolean, label: string, details?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}${details ? `\n    → ${details}` : ""}`);
    failed++;
    failedTests.push(label);
  }
}

function printConflicts(conflicts: string[]) {
  if (conflicts.length === 0) console.log("  (no conflicts)");
  else conflicts.forEach(c => console.log(`  ⚠ ${c}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 — RENA GREEN DRIFT SCENARIO
// Generic "SPEAKER_1"/"SPEAKER_2" labels; patient asking about their own
// lab results using clinical terms.
//
// Expected:
//   • SPEAKER_1 segments (lab interpretation, prescription, plan) → clinician
//   • SPEAKER_2 segments (symptoms, concerns, questions) → patient or unknown
//   • Segment [6]: "My Lp(a) is elevated — does that mean I should start
//     increasing my omega-3 dosage?" has clinician=1 (elevated) and
//     patient=1 (my Lp(a) is / does that mean I should) → tie → UNKNOWN
//     → conflict check fires on UNKNOWN segment with lab language ✓
// ─────────────────────────────────────────────────────────────────────────────
console.log("=".repeat(70));
console.log("  SPEAKER NORMALIZATION REGRESSION TEST");
console.log("=".repeat(70));

console.log("\n── T1: Rena Green — generic labels, patient-lab conflict detection ──────");

const t1Input = [
  { id: 0, speaker: "SPEAKER_1", text: "Let's review your labs today. Your iron saturation is low at 15 percent and your Lp(a) is elevated, which is concerning for cardiovascular risk." },
  { id: 1, speaker: "SPEAKER_2", text: "I've been feeling really tired and my hair has been falling out a lot lately." },
  { id: 2, speaker: "SPEAKER_1", text: "I'd like to start you on iron supplementation 325mg daily. We'll recheck your ferritin and iron saturation in 6 weeks." },
  { id: 3, speaker: "SPEAKER_2", text: "Yeah, that makes sense. I didn't know my Lp(a) was that high." },
  { id: 4, speaker: "SPEAKER_1", text: "Elevated Lp(a) is a genetic risk factor. We'll monitor it and focus on LDL optimization and lifestyle modification." },
  { id: 5, speaker: "SPEAKER_2", text: "I'm worried about the cardiovascular stuff. Maybe I should add something." },
  { id: 6, speaker: "SPEAKER_2", text: "My Lp(a) is elevated — does that mean I should start increasing my omega-3 dosage?" },
];

const t1 = normalizeSpeakerRoles(t1Input);

console.log("\nBefore → After speaker labels:");
t1Input.forEach((u, i) => {
  const after = t1.normalized[i];
  const label = `${after.speaker.toUpperCase()}${after.uncertain ? "[?]" : ""}`;
  const changed = u.speaker.toLowerCase() !== after.speaker;
  console.log(`  [${u.id}] ${u.speaker.padEnd(12)} → ${label}${changed ? "" : " (unchanged)"}`);
});

console.log("\nConflict warnings:");
printConflicts(t1.conflicts);

console.log("\nSafety checks:");
assert(t1.normalized[0].speaker === "clinician", "T1-C1: 'Let's review labs / Your iron saturation is low / Lp(a) is elevated' → CLINICIAN");
assert(t1.normalized[2].speaker === "clinician", "T1-C2: 'I'd like to start iron 325mg / recheck ferritin in 6 weeks' → CLINICIAN");
assert(t1.normalized[4].speaker === "clinician", "T1-C3: 'Elevated Lp(a) / monitor / LDL optimization' → CLINICIAN");
assert(t1.normalized[1].speaker === "patient",   "T1-C4: 'I've been feeling tired / hair falling out' → PATIENT");
assert(t1.normalized[3].speaker === "patient",   "T1-C5: 'Yeah / I didn't know Lp(a) was that high' → PATIENT");
assert(t1.normalized[5].speaker === "patient",   "T1-C6: 'I'm worried / Maybe I should add something' → PATIENT");

// Seg [6]: tie score → UNKNOWN; conflict check must fire on UNKNOWN segment with lab language
const seg6 = t1.normalized[6];
assert(
  seg6.speaker === "unknown" || seg6.speaker === "patient",
  `T1-C7a: Seg [6] is not misclassified as high-confidence CLINICIAN (got: ${seg6.speaker})`,
);
assert(
  t1.conflicts.some(c => c.includes("[ID:6]") && (c.includes("Lab interpretation") || c.includes("Medication plan"))),
  "T1-C7b: Conflict warning fires on seg [6] with 'My Lp(a) is elevated / does that mean I should start'"
);

// ─────────────────────────────────────────────────────────────────────────────
// T2 — CLEAN ENCOUNTER: Pre-labeled speakers must be preserved exactly
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── T2: Clean encounter — pre-labeled clinician/patient preserved ─────────");

const t2Input = [
  { id: 0, speaker: "clinician", text: "How have you been feeling on the tirzepatide 7.5mg weekly?" },
  { id: 1, speaker: "patient",   text: "Really well. I've lost 8 pounds and I'm not as hungry." },
  { id: 2, speaker: "clinician", text: "Excellent. Let's continue the current dose. Recheck HbA1c in 3 months." },
  { id: 3, speaker: "patient",   text: "Do I need to watch anything for side effects?" },
  { id: 4, speaker: "clinician", text: "The main things to monitor are nausea and injection site reactions. Follow up in 6 weeks." },
];

const t2 = normalizeSpeakerRoles(t2Input);

console.log("\nConflict warnings:");
printConflicts(t2.conflicts);
console.log("\nSafety checks:");
assert(t2.normalized.every((u, i) => u.speaker === t2Input[i].speaker),
  "T2-C1: All pre-labeled speakers preserved exactly (no overwrites)");
assert(t2.normalized.every(u => !u._speakerResolved),
  "T2-C2: _speakerResolved flag absent on pre-labeled utterances");
assert(t2.conflicts.length === 0,
  "T2-C3: No conflicts on clean encounter with proper clinician labels");

// ─────────────────────────────────────────────────────────────────────────────
// T3 — GENERIC HARDWARE LABELS: Speaker 1/2, SPEAKER_00, UNKNOWN, spk_1
// All should be reclassified; pure affirmatives must stay unknown.
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── T3: Generic hardware labels — heuristic reclassification ─────────────");

const t3Input = [
  { id: 0, speaker: "Speaker 1",  text: "Your TSH is 5.2, which is elevated. I'd like to increase your levothyroxine to 88mcg daily." },
  { id: 1, speaker: "Speaker 2",  text: "I've been having a lot of fatigue and I'm not sleeping well. My mood has been really low." },
  { id: 2, speaker: "SPEAKER_00", text: "We'll recheck TSH and free T4 in 6 weeks to assess the titration." },
  { id: 3, speaker: "UNKNOWN",    text: "Okay." },
  { id: 4, speaker: "spk_1",     text: "The diagnosis is hypothyroidism. Treatment goal is TSH within normal range." },
  { id: 5, speaker: "spk_2",     text: "I think maybe it's the stress too — I'm not sure." },
  { id: 6, speaker: "unknown",   text: "Right, that could contribute. We'll also check your cortisol level at the next visit." },
];

const t3 = normalizeSpeakerRoles(t3Input);

console.log("\nReclassification results:");
t3.normalized.forEach((u, i) => {
  const before = t3Input[i].speaker;
  const after  = `${u.speaker.toUpperCase()}${u.uncertain ? "[?]" : ""}`;
  console.log(`  [${u.id}] ${before.padEnd(12)} → ${after}`);
});

console.log("\nConflict warnings:");
printConflicts(t3.conflicts);

console.log("\nSafety checks:");
assert(t3.normalized[0].speaker === "clinician" && !t3.normalized[0].uncertain,
  "T3-C1: 'Your TSH elevated / increase levothyroxine 88mcg' → CLINICIAN (high confidence)");
assert(t3.normalized[1].speaker === "patient" && !t3.normalized[1].uncertain,
  "T3-C2: 'I've been having fatigue / mood really low' → PATIENT (high confidence)");
assert(t3.normalized[2].speaker === "clinician",
  "T3-C3: 'Recheck TSH and free T4 in 6 weeks' → CLINICIAN");
assert(t3.normalized[3].speaker === "unknown",
  "T3-C4: Bare 'Okay.' with no signals → UNKNOWN (not guessed)");
assert(t3.normalized[4].speaker === "clinician",
  "T3-C5: 'Diagnosis hypothyroidism / treatment goal / normal range' → CLINICIAN");
assert(t3.normalized[5].speaker === "patient",
  "T3-C6: 'I think maybe / I'm not sure' → PATIENT");
assert(t3.normalized[6].speaker === "clinician",
  "T3-C7: 'We'll also check cortisol at the next visit' → CLINICIAN");

// ─────────────────────────────────────────────────────────────────────────────
// T4 — UNCERTAIN [?] SEGMENTS: Check spec item 4 —
// uncertain segments must not cause clinically important information
// to be silently dropped.
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── T4: Uncertain [?] segments — clinical content not silently dropped ────");

const t4Input = [
  { id: 0, speaker: "unknown", text: "Mm-hmm." },
  { id: 1, speaker: "unknown", text: "Right." },
  { id: 2, speaker: "unknown", text: "Let's add DHEA 25mg daily." },
  { id: 3, speaker: "unknown", text: "I've been on it for about a month." },
  { id: 4, speaker: "unknown", text: "We'll follow up." },
];

const t4 = normalizeSpeakerRoles(t4Input);

console.log("\nReclassification results:");
t4.normalized.forEach(u => {
  console.log(`  [${u.id}] ${u.speaker.toUpperCase()}${u.uncertain ? "[?]" : ""}: ${(u.text ?? "").slice(0, 80)}`);
});

console.log("\nConflict warnings:");
printConflicts(t4.conflicts);

console.log("\nSafety checks:");
assert(t4.normalized[0].speaker === "unknown", "T4-C1: 'Mm-hmm.' → UNKNOWN");
assert(t4.normalized[1].speaker === "unknown", "T4-C2: 'Right.' → UNKNOWN");

const dhea = t4.normalized[2];
assert(dhea.speaker === "clinician",
  `T4-C3: 'Let's add DHEA 25mg daily' → CLINICIAN (got ${dhea.speaker}, uncertain=${dhea.uncertain})`);

assert(t4.normalized[3].speaker === "patient",
  "T4-C4: 'I've been on it for about a month' → PATIENT");

// Key safety guarantee: segments with real clinical content get a best-guess
// label (even if uncertain) so the SOAP model sees them, rather than UNKNOWN
const hasLabel = t4.normalized.filter(u => u.speaker !== "unknown");
assert(hasLabel.length >= 2,
  `T4-C5: ≥2 segments resolved beyond UNKNOWN (got ${hasLabel.length}) — clinical content not dropped`);

// ─────────────────────────────────────────────────────────────────────────────
// T5 — CONFLICT DETECTION: med plan + lab interpretation on patient/unknown
// Genuine patient concerns must NOT generate false conflicts.
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── T5: Conflict detection — med plan + lab on non-clinician segments ──────");

const t5Input = [
  { id: 0, speaker: "clinician", text: "Your LDL is elevated at 165 and ApoB is borderline. I'd like to start rosuvastatin 10mg nightly." },
  { id: 1, speaker: "patient",   text: "My LDL is elevated — could that mean I should start a statin to lower it?" },
  { id: 2, speaker: "patient",   text: "The doctor said I should start increasing my rosuvastatin dose." },
  { id: 3, speaker: "clinician", text: "We'll recheck a fasting lipid panel in 6 weeks and adjust based on your response." },
  { id: 4, speaker: "patient",   text: "I'm worried about my cholesterol. I've been watching what I eat." },
];

const t5 = normalizeSpeakerRoles(t5Input);

console.log("\nConflict warnings:");
printConflicts(t5.conflicts);

console.log("\nSafety checks:");
assert(t5.normalized[0].speaker === "clinician",
  "T5-C1: Pre-labeled clinician segment (LDL + statin plan) preserved");
assert(
  t5.conflicts.some(c => c.includes("[ID:1]") && c.includes("Lab interpretation")),
  "T5-C2: Patient seg [1] 'My LDL is elevated' → lab conflict ⚠"
);
assert(
  t5.conflicts.some(c => c.includes("[ID:2]") && c.includes("Medication plan")),
  "T5-C3: Patient seg [2] 'start increasing rosuvastatin dose' → medication plan conflict ⚠"
);
assert(
  !t5.conflicts.some(c => c.includes("[ID:4]")),
  "T5-C4: Patient seg [4] 'worried about cholesterol / watching diet' → NO false conflict"
);
assert(t5.conflicts.length === 2,
  `T5-C5: Exactly 2 conflicts generated (got ${t5.conflicts.length})`);

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL INTEGRITY — verify soap-pipeline.ts prompt blocks
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── STRUCTURAL INTEGRITY: soap-pipeline.ts prompt block audit ───────────");

const pipelineSource = fs.readFileSync(
  path.join(__dirname, "soap-pipeline.ts"), "utf8"
);

const requiredBlocks = [
  { label: "CORE RULES — NON-NEGOTIABLE",                   text: "CORE RULES — NON-NEGOTIABLE" },
  { label: "FACT FIDELITY — NO EMBELLISHMENT",               text: "FACT FIDELITY — NO EMBELLISHMENT" },
  { label: "ANTI-DRIFT block present",                        text: "ANTI-DRIFT / SOURCE-GROUNDED CLINICAL DOCUMENTATION RULES" },
  { label: "AD-1 Tight grounding",                            text: "AD-1. TIGHT GROUNDING" },
  { label: "AD-3 Forbidden dramatic language",                text: "AD-3. FORBIDDEN DRAMATIC" },
  { label: "AD-8 Pre-finalization drift check",               text: "AD-8. PRE-FINALIZATION DRIFT CHECK" },
  { label: "FF-6 Completeness is factual",                    text: "FF-6. COMPLETENESS IS FACTUAL" },
  { label: "SECTION 1 — HPI RECONSTRUCTION",                  text: "SECTION 1 — HPI RECONSTRUCTION" },
  { label: "FORBIDDEN NARRATOR PHRASES",                      text: "FORBIDDEN NARRATOR PHRASES" },
  { label: "ROS FORMATTING rules",                            text: "ROS FORMATTING" },
  { label: "normalizeSpeakerRoles function present",           text: "function normalizeSpeakerRoles" },
  { label: "diarizedNorm wired into extraction",              text: "diarizedNorm" },
  { label: "speakerConflictContext injected in extraction",   text: "speakerConflictContext" },
  { label: "speakerConflictContext2 injected in SOAP",        text: "speakerConflictContext2" },
  { label: "CLINICIAN[?] label in extraction transcript",     text: "CLINICIAN[?] = uncertain speaker assignment" },
  { label: "CLINICIAN[?] label in SOAP transcript",           text: "treat with extra care" },
];

const blockPositions: { label: string; pos: number }[] = [];
console.log("");
requiredBlocks.forEach(b => {
  const idx = pipelineSource.indexOf(b.text);
  assert(idx !== -1, `STRUCT: "${b.label}"`, idx === -1 ? `NOT FOUND in soap-pipeline.ts` : undefined);
  if (idx !== -1) blockPositions.push({ label: b.label, pos: idx });
});

// ── Ordering invariants ───────────────────────────────────────────────────────
const posOf = (label: string) => blockPositions.find(b => b.label === label)?.pos ?? -1;

console.log("");
assert(
  posOf("CORE RULES — NON-NEGOTIABLE") < posOf("FACT FIDELITY — NO EMBELLISHMENT"),
  "ORDER: CORE RULES before FACT FIDELITY"
);
assert(
  posOf("FACT FIDELITY — NO EMBELLISHMENT") < posOf("ANTI-DRIFT block present"),
  "ORDER: FACT FIDELITY before ANTI-DRIFT"
);
assert(
  posOf("ANTI-DRIFT block present") < posOf("SECTION 1 — HPI RECONSTRUCTION"),
  "ORDER: ANTI-DRIFT before SECTION 1 HPI RECONSTRUCTION"
);
assert(
  posOf("normalizeSpeakerRoles function present") < posOf("diarizedNorm wired into extraction"),
  "ORDER: normalizeSpeakerRoles defined before its call sites"
);

// ─────────────────────────────────────────────────────────────────────────────
// RENA GREEN BEFORE/AFTER SIMULATION
// Demonstrates how the normalization layer changes what the SOAP model sees.
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── RENA GREEN: Before vs. After (what SOAP model receives) ─────────────");

const beforeTranscript = t1Input
  .map(u => `${u.speaker.toUpperCase()}: ${u.text}`)
  .join("\n");

const afterTranscript = t1.normalized
  .map(u => `${u.speaker.toUpperCase()}${u.uncertain ? "[?]" : ""}: ${u.normalizedText ?? u.text}`)
  .join("\n");

console.log("\nBEFORE normalization (generic labels — SOAP model has no role context):");
console.log(beforeTranscript.split("\n").map(l => `  ${l}`).join("\n"));

console.log("\nAFTER normalization (roles resolved — SOAP model can apply A&P rules correctly):");
console.log(afterTranscript.split("\n").map(l => `  ${l}`).join("\n"));

if (t1.conflicts.length > 0) {
  console.log("\nConflict warnings passed to SOAP prompt:");
  t1.conflicts.forEach(c => console.log(`  ⚠ ${c}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log(`  RESULTS: ${passed} passed  |  ${failed} failed`);
if (failed > 0) {
  console.log("\n  Failed tests:");
  failedTests.forEach(t => console.log(`    ✗ ${t}`));
}
console.log("=".repeat(70));

process.exit(failed > 0 ? 1 : 0);
