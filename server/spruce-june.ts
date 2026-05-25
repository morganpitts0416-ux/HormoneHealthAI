/**
 * Spruce June Phase 3A — Acknowledgment + Staff Memo Pipeline
 *
 * ISOLATION CONTRACT:
 *   This module ONLY touches the Spruce-specific tables:
 *     spruce_outbound_messages, spruce_messages, spruce_workflow_requests,
 *     spruce_conversation_state, spruce_workflow_settings, clinic_spruce_settings
 *
 *   It does NOT import from or modify:
 *     - ClinIQ June (ai-chat, June preferences)
 *     - SOAP pipeline (soap-pipeline.ts, ai-service.ts)
 *     - Lab evaluation or transcription
 *     - Auth, billing, sessions, or core ClinIQ systems
 *
 * Everything off by default. No message is ever sent unless:
 *   spruceJuneAcknowledgmentsEnabled = true  (clinic-level)
 *   allowAcknowledgment = true               (workflow-level)
 *   All gate checks pass
 *
 * INTELLIGENCE LAYER (Phase 3A):
 *   Before generating any acknowledgment, June extracts structured fields
 *   already present in the patient message (medication, pharmacy, dose, etc.).
 *   The acknowledgment prompt is then told exactly what is KNOWN vs MISSING,
 *   so June never asks the patient to repeat information they already gave.
 */

import OpenAI from "openai";
import type { IStorage } from "./storage.js";
import type {
  ClinicSpruceSettings,
  SpruceConversationStateRow,
  SpruceWorkflowSettings,
  ClinicJunePlaybook,
  ClinicKnowledgeEntry,
  SpruceWorkflowPlaybook,
} from "../shared/schema.js";

// ── Types ─────────────────────────────────────────────────────────────────

export type SpruceWorkflowType =
  | "medication_refill"
  | "lab_question"
  | "appointment"
  | "intake_form"
  | "new_patient"
  | "billing"
  | "urgent_safety"
  | "unclassified";

export interface JunePipelineInput {
  clinicId: number;
  conversationKey: string;
  spruceConversationId: string | null;
  messageBody: string;
  messageDirection: string;
  classification: { workflow: string; confidence: string };
  workflowRequestId: number | null;
  clinicSettings: ClinicSpruceSettings;
  convState: SpruceConversationStateRow | null;
  patientName: string | null;
  patientId: number | null;
  fromPhone: string | null;
  spruceConversationUrl: string | null;
  apiToken: string | null;
  storage: IStorage;
  openaiClient: OpenAI;
  /** Actual turn index for this conversation (0 = first reply). Defaults to 0. */
  juneTurnCount?: number;
}

export interface JunePipelineResult {
  skipped: boolean;
  skipReason?: string;
  acknowledgmentSent: boolean;
  acknowledgmentText?: string;
  memoText?: string;
  spruceDelivered?: boolean;
  extractedFields?: ExtractedFields | null;
  intentAnalysis?: IntentAnalysis | null;
}

// ── Playbook context ───────────────────────────────────────────────────────

/**
 * Loaded once per pipeline run, before any AI calls.
 * Null fields mean "no configuration — use June's built-in defaults."
 */
export interface PlaybookContext {
  clinicPlaybook: ClinicJunePlaybook | null;
  knowledgeEntries: ClinicKnowledgeEntry[];
  workflowPlaybook: SpruceWorkflowPlaybook | null;
  /** True when current wall-clock time is outside configured business hours. */
  isAfterHours: boolean;
  /** True when today is a configured holiday closure. */
  isHoliday: boolean;
}

/**
 * Returns true if the current time is within the clinic's configured business hours.
 * Returns true (assume open) when no timezone or businessHours is configured.
 */
function isWithinBusinessHours(playbook: ClinicJunePlaybook, now: Date = new Date()): boolean {
  if (!playbook.timezone || !playbook.businessHours) return true;

  const tz = playbook.timezone as string;
  const hours = playbook.businessHours as Record<string, { open: string; close: string } | null>;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const weekday = parts.find(p => p.type === "weekday")?.value?.toLowerCase().slice(0, 3) ?? "";
    const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);

    const dayConfig = hours[weekday];
    if (dayConfig === undefined) return true;  // key absent = not configured = assume open
    if (dayConfig === null) return false;       // null = clinic closed this day

    const [openH, openM] = dayConfig.open.split(":").map(Number);
    const [closeH, closeM] = dayConfig.close.split(":").map(Number);
    const nowMins = hour * 60 + minute;
    return nowMins >= openH * 60 + openM && nowMins < closeH * 60 + closeM;
  } catch {
    return true; // parsing error = assume open (fail open for safety)
  }
}

/**
 * Returns true when today (in the clinic's timezone) is in the holidayClosures list.
 */
function isTodayHoliday(playbook: ClinicJunePlaybook, now: Date = new Date()): boolean {
  if (!playbook.holidayClosures || !playbook.timezone) return false;
  const holidays = playbook.holidayClosures as string[];
  if (!Array.isArray(holidays) || holidays.length === 0) return false;

  try {
    const tz = playbook.timezone as string;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const y = parts.find(p => p.type === "year")?.value ?? "";
    const m = parts.find(p => p.type === "month")?.value ?? "";
    const d = parts.find(p => p.type === "day")?.value ?? "";
    const isoDate = `${y}-${m}-${d}`;
    return holidays.includes(isoDate);
  } catch {
    return false;
  }
}

/**
 * Loads all three playbook tables for a clinic + workflow in parallel.
 * Never throws — any fetch failure returns null/[] and logs a warning.
 */
async function loadPlaybookContext(
  storage: IStorage,
  clinicId: number,
  workflow: string,
): Promise<PlaybookContext> {
  const [clinicPlaybook, knowledgeEntries, workflowPlaybook] = await Promise.all([
    (storage as any).getClinicJunePlaybook(clinicId).catch((e: any) => {
      console.warn("[SpruceJune/playbook] getClinicJunePlaybook failed (non-fatal):", e?.message);
      return null;
    }),
    (storage as any).getClinicKnowledgeEntries(clinicId).catch((e: any) => {
      console.warn("[SpruceJune/playbook] getClinicKnowledgeEntries failed (non-fatal):", e?.message);
      return [];
    }),
    (storage as any).getSpruceWorkflowPlaybook(clinicId, workflow).catch((e: any) => {
      console.warn("[SpruceJune/playbook] getSpruceWorkflowPlaybook failed (non-fatal):", e?.message);
      return null;
    }),
  ]);

  const now = new Date();
  const isAfterHours = clinicPlaybook ? !isWithinBusinessHours(clinicPlaybook, now) : false;
  const isHoliday = clinicPlaybook ? isTodayHoliday(clinicPlaybook, now) : false;

  return { clinicPlaybook, knowledgeEntries, workflowPlaybook, isAfterHours, isHoliday };
}

// ── Multi-intent types ─────────────────────────────────────────────────────

/**
 * A single detected intent within a patient message.
 * One message can contain many intents (e.g. reschedule + UTI + pharmacy).
 */
export interface IntentItem {
  workflow: SpruceWorkflowType;
  confidence: "high" | "medium" | "low";
  /** One-sentence plain-English description of this specific issue. */
  summary: string;
  /** Fields extracted from the message for this intent. null = not mentioned. */
  extracted: Record<string, string | null>;
  /** Field names that are relevant but not yet provided by the patient. */
  missing: string[];
}

/**
 * Full multi-intent analysis of a patient message.
 * Replaces single-workflow ExtractedFields for response + memo generation.
 */
export interface IntentAnalysis {
  intents: IntentItem[];
  hasUrgentSafety: boolean;
  overallUrgency: "routine" | "soon" | "urgent";
  /**
   * At most 2 follow-up questions — AI-selected as the most clinically
   * useful across ALL detected intents.  Never asks about info already given.
   */
  bestFollowUpQuestions: string[];
  /** Primary workflow — urgent_safety takes precedence, otherwise first detected. */
  primaryWorkflow: SpruceWorkflowType;
}

// ── Gate checks ───────────────────────────────────────────────────────────

/**
 * shouldJuneAcknowledge — returns null if June should proceed, or a string
 * skip-reason if any gate fails. Call this before doing any AI work.
 */
export async function shouldJuneAcknowledge(
  input: JunePipelineInput,
  workflowSetting: SpruceWorkflowSettings | null,
  juneTurnCount: number,
  playbookCtx?: PlaybookContext | null,
): Promise<string | null> {
  const { messageDirection, classification, clinicSettings, convState } = input;

  // Gate 1: Only respond to inbound patient messages.
  // "unknown" direction is no longer allowed — system events now have their own
  // "spruce_system_event" kind and must never reach June. "unknown" is kept as
  // a fallback but blocked here so ambiguous payloads don't trigger responses.
  if (messageDirection !== "inbound_patient") {
    return `direction="${messageDirection}" — June only responds to inbound_patient messages`;
  }

  // Gate 2: Clinic-level master switch
  if (!clinicSettings.spruceJuneAcknowledgmentsEnabled) {
    return "spruceJuneAcknowledgmentsEnabled=false for this clinic";
  }

  // Gate 3: Workflow-level switch (defaults deny when row absent)
  // Exception: unclassified messages bypass this gate when generalMessageAcknowledgmentEnabled=true.
  // The clinic-level general toggle IS the workflow-level control for unclassified — no separate
  // spruce_workflow_settings row is required.
  const isUnclassifiedGeneralEnabled =
    classification.workflow === "unclassified" &&
    (clinicSettings as any).generalMessageAcknowledgmentEnabled === true;
  if (!isUnclassifiedGeneralEnabled && !workflowSetting?.allowAcknowledgment) {
    return `allowAcknowledgment=false for workflow="${classification.workflow}"`;
  }

  // Gate 4: Conversation state — stop if staff has taken over or AI is muted
  if (convState) {
    if (convState.state === "staff_takeover" || convState.state === "ai_muted") {
      return `conversation state="${convState.state}" — June blocked`;
    }
    if (convState.aiMutedAt) {
      return "aiMutedAt is set — human has replied, June must not respond";
    }
  }

  // Gate 5: Belt-and-suspenders check for staff_takeover
  if (convState?.state === "staff_takeover") {
    return "staff_takeover active — June must not reply";
  }

  // Gate 6: Workflow confidence
  // Unclassified messages always have confidence="low" (no specific workflow matched) —
  // bypass this gate when general acknowledgment is enabled; the AI prompt enforces safety.
  if (!isUnclassifiedGeneralEnabled && classification.confidence === "low") {
    return `classification confidence="low" — June requires medium or high confidence`;
  }

  // Gate 7: Turn limit (unclassified defaults to maxJuneTurns=1 when no workflow row exists)
  const maxTurns = workflowSetting?.maxJuneTurns ?? 1;
  if (juneTurnCount >= maxTurns) {
    return `juneTurnCount=${juneTurnCount} >= maxJuneTurns=${maxTurns} — turn limit reached`;
  }

  // Gate 8: Unclassified messages — generalMessageAcknowledgmentEnabled is the gate
  if (classification.workflow === "unclassified") {
    if (!isUnclassifiedGeneralEnabled) {
      return "workflow=unclassified — generalMessageAcknowledgmentEnabled=false";
    }
    // General acknowledgment is on — allow through; prompt handles safe response
  }

  // Gate 9 (T4): After-hours gate — only applies when playbookEnabled=true
  // If the clinic has a playbook configured and the current time is outside business hours:
  //   - afterHoursEnabled=false → block completely (silent outside hours)
  //   - afterHoursEnabled=true → allow through; pipeline generates after-hours message
  //     BUT dedup: if an after-hours notice was already sent in this conversation within 24h, skip.
  if (playbookCtx?.clinicPlaybook?.playbookEnabled) {
    const closed = playbookCtx.isAfterHours || playbookCtx.isHoliday;
    if (closed) {
      if (!playbookCtx.clinicPlaybook.afterHoursEnabled) {
        return "after_hours: clinic is closed and afterHoursEnabled=false — June silent";
      }
      // After-hours enabled — check 24h dedup
      const sentAt = convState?.afterHoursNoticeSentAt;
      if (sentAt) {
        const hoursAgo = (Date.now() - new Date(sentAt).getTime()) / 3_600_000;
        if (hoursAgo < 24) {
          return `after_hours: notice already sent ${hoursAgo.toFixed(1)}h ago — dedup skip`;
        }
      }
      // Fall through — pipeline will use after-hours instructions
    }
  }

  return null; // All gates passed
}

// ── Playbook-aware system prompt builder ──────────────────────────────────

const VOICE_STYLE_DESC: Record<string, string> = {
  warm_boutique:
    "Warm, boutique-clinic style — personal and unhurried, like a trusted concierge who knows each patient by name",
  professional_clinical:
    "Professional and clinical — warm but precise, authoritative without being cold or transactional",
  concierge:
    "White-glove concierge style — highly personal, anticipate patient needs, attentive to every detail",
  direct_efficient:
    "Direct and efficient — friendly, clear, get to the point without being curt",
  family_practice:
    "Friendly family-practice style — approachable, caring, community-focused, like a neighbor who's also a nurse",
};

/**
 * Builds the dynamic June system prompt when a clinic playbook is active.
 * Falls back to the static JUNE_RESPONSE_SYSTEM_PROMPT when playbookEnabled=false.
 */
function buildJuneSystemPrompt(ctx: PlaybookContext | null): string {
  if (!ctx?.clinicPlaybook?.playbookEnabled) return JUNE_RESPONSE_SYSTEM_PROMPT;

  const pb = ctx.clinicPlaybook;
  const voiceDesc = VOICE_STYLE_DESC[pb.voiceStyle ?? ""] ?? VOICE_STYLE_DESC.warm_boutique;
  const clinicRef = pb.clinicDisplayName ?? "the care team";
  const closed = ctx.isAfterHours || ctx.isHoliday;

  // Knowledge base section — only enabled entries, sorted, capped at 8 entries
  const enabledKnowledge = (ctx.knowledgeEntries ?? [])
    .filter(e => e.isEnabled)
    .slice(0, 8);
  const knowledgeSection = enabledKnowledge.length > 0
    ? `\n\nCLINIC KNOWLEDGE BASE (use this to answer operational questions accurately):\n` +
      enabledKnowledge
        .map(e => {
          const linkPart = e.link ? ` — Link: ${e.link}${e.linkLabel ? ` (label: "${e.linkLabel}")` : ""}` : "";
          return `• ${e.topicLabel}: ${e.content.slice(0, 400)}${linkPart}`;
        })
        .join("\n")
    : "";

  // Workflow playbook section
  const wb = ctx.workflowPlaybook;
  const workflowSection = wb?.isEnabled
    ? (() => {
        const parts: string[] = ["\n\nWORKFLOW-SPECIFIC GUIDANCE:"];
        if (wb.playbookInstructions) parts.push(wb.playbookInstructions);
        if (wb.expectedNextStep) parts.push(`Tell the patient: "${wb.expectedNextStep}"`);
        const links = wb.customLinks as Array<{ label: string; url: string }> | null;
        if (links?.length) {
          parts.push(
            `Embed these links naturally in-sentence (never as a raw list):\n` +
            links.map(l => `  - "${l.label}": ${l.url}`).join("\n"),
          );
        }
        return parts.join("\n");
      })()
    : "";

  // After-hours section
  const afterHoursSection = closed && pb.afterHoursEnabled
    ? `\n\nAFTER-HOURS CONTEXT:\nThe clinic is currently closed. Acknowledge kindly that the office is closed and set appropriate expectations.${pb.afterHoursInstructions ? "\n" + pb.afterHoursInstructions : ""}\nAlways direct emergencies to 911 — never promise urgent clinical attention.`
    : "";

  // Optional custom instructions from clinic
  const customSection = [
    pb.additionalToneGuidance ? `ADDITIONAL TONE GUIDANCE:\n${pb.additionalToneGuidance}` : "",
    pb.expectedResponseTime ? `RESPONSE TIME EXPECTATION: When relevant, mention "${pb.expectedResponseTime}"` : "",
    pb.generalHandoffLanguage ? `PREFERRED HANDOFF LANGUAGE: "${pb.generalHandoffLanguage}"` : "",
    pb.providerNamingPreference ? `PROVIDER NAMING: ${pb.providerNamingPreference}` : "",
    pb.emergencyLanguage ? `EMERGENCY LANGUAGE (use instead of default 911 language): "${pb.emergencyLanguage}"` : "",
  ].filter(Boolean).join("\n");

  return `You are June, a front-desk assistant at ${clinicRef}. You send warm, human messages to patients on behalf of the care team.

VOICE & TONE: ${voiceDesc}

GLOBAL SAFETY RULES (NEVER violate — these override all other instructions):
- Do NOT diagnose, prescribe, approve refills, change medication doses, or give medical advice of any kind
- Do NOT answer clinical questions — the nurse or care team will always follow up
- For any emergency or safety concern, always include: "${pb.emergencyLanguage ?? "If this is an emergency, please call 911 or go to your nearest ER right away."}"
- Never make promises about timelines, refill approvals, or clinical outcomes
- NEVER ask the patient for information they already provided
- Do NOT ask more than 1–2 follow-up questions per message${knowledgeSection}${workflowSection}${afterHoursSection}

${customSection}

FORMATTING RULES:
- Use the patient's first name naturally in the greeting
- Lead with empathy when the patient is sick, worried, or stressed
- Be brief: 2–4 sentences — this is SMS
- Sound like a real, caring human — never robotic or like an auto-reply
- NEVER use: "Thank you for reaching out", "I appreciate your message", "I understand your concern", "Your concern has been documented"`;
}

// ── Field extraction ──────────────────────────────────────────────────────

/**
 * Per-workflow field definitions.
 * key   = machine name used in extracted JSON
 * value = human description of what to look for
 */
const WORKFLOW_FIELD_DEFS: Partial<Record<SpruceWorkflowType, Record<string, string>>> = {
  medication_refill: {
    medication:       "Medication name(s) (e.g. testosterone, semaglutide, progesterone)",
    dose:             "Dose or strength (e.g. 100mg, 200mg/mL, 0.5mg)",
    frequency:        "How often taken (e.g. daily, twice weekly, weekly)",
    pharmacy:         "Pharmacy name or location (e.g. Walgreens, CVS, Madison Pharmacy)",
    amountRemaining:  "How much is left (e.g. out, almost out, 2 doses left, has refills)",
    sideEffects:      "Any side effects, concerns, or symptoms mentioned",
  },
  appointment: {
    appointmentType:  "Type of visit (e.g. follow-up, new patient, annual, procedure)",
    preferredTimes:   "Preferred days or times (e.g. mornings, Tuesdays, next week)",
    providerPreference: "Specific provider requested by name",
    reason:           "Reason for visit or chief complaint",
    insurance:        "Insurance or payment method mentioned",
  },
  lab_question: {
    specificLab:      "Specific lab test or panel (e.g. testosterone, thyroid, A1C)",
    labDate:          "When labs were drawn or when results were received",
    specificValue:    "Specific lab value or result mentioned",
    concern:          "What the patient is concerned or confused about",
  },
  billing: {
    invoiceRef:       "Invoice number, date, or specific charge mentioned",
    amount:           "Dollar amount mentioned",
    insuranceIssue:   "Insurance-related issue (e.g. denial, wrong billing, EOB question)",
    concern:          "Main billing concern in plain language",
  },
  urgent_safety: {
    symptom:          "Primary symptom or chief complaint",
    severity:         "Severity descriptors (e.g. severe, mild, can't breathe, dizziness)",
    duration:         "How long symptoms have been present",
    currentLocation:  "Where the patient is now or geographic location",
  },
  new_patient: {
    serviceInterest:  "Service or condition they want help with",
    referralSource:   "How they heard about the practice",
    insurance:        "Insurance or payment mentioned",
    contactPreference:"Preferred contact method if stated",
  },
  intake_form: {
    formType:         "Specific form or paperwork they're asking about",
    concern:          "What they need help with",
  },
};

export interface ExtractedFields {
  workflow: string;
  confidence: "high" | "medium" | "low";
  /** Extracted values — null means the field was looked for but not found. */
  fields: Record<string, string | null>;
  /** Field keys that are relevant but were NOT found in the message. */
  missingFields: string[];
  /** Human-readable summary of what we already know from the message. */
  collectedSummary: string;
}

/**
 * extractWorkflowFields — single fast OpenAI call to pull structured data
 * out of the patient message. Returns null on any failure so the pipeline
 * gracefully falls back to generic acknowledgment.
 *
 * Uses JSON mode for reliable parsing. Temperature=0 for determinism.
 */
export async function extractWorkflowFields(
  openaiClient: OpenAI,
  workflow: string,
  messageBody: string,
): Promise<ExtractedFields | null> {
  const fieldDefs = WORKFLOW_FIELD_DEFS[workflow as SpruceWorkflowType];
  if (!fieldDefs || Object.keys(fieldDefs).length === 0) return null;

  const fieldList = Object.entries(fieldDefs)
    .map(([k, desc]) => `  "${k}": "${desc} — null if not mentioned"`)
    .join(",\n");

  const systemPrompt = `You are a clinical message parser. Extract structured information from a patient's message to a healthcare clinic. Return ONLY valid JSON — no explanation, no markdown, no code blocks.`;

  const userPrompt = `Extract information from this patient message for a "${workflow}" workflow.

Patient message:
"${messageBody.slice(0, 600)}"

Return JSON with exactly this structure:
{
  "confidence": "high" | "medium" | "low",
  "fields": {
${fieldList}
  }
}

Rules:
- confidence = "high" if 2+ fields were clearly found, "medium" if 1 was found, "low" if nothing specific was mentioned
- Extract ONLY what is explicitly stated — do not infer or assume
- Use null for any field not clearly present in the message
- Keep extracted values concise (under 60 chars each)`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      confidence: string;
      fields: Record<string, string | null>;
    };

    const fields = parsed.fields ?? {};
    const confidence = (["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "low") as "high" | "medium" | "low";

    const missingFields = Object.keys(fieldDefs).filter(
      (k) => fields[k] === null || fields[k] === undefined || fields[k] === "",
    );

    const foundEntries = Object.entries(fields).filter(([, v]) => v !== null && v !== "");
    const collectedSummary = foundEntries.length > 0
      ? foundEntries.map(([k, v]) => `${k}: ${v}`).join("; ")
      : "No specific details extracted";

    return { workflow, confidence, fields, missingFields, collectedSummary };
  } catch (err) {
    console.warn("[SpruceJune/extract] Field extraction failed (non-fatal):", err);
    return null;
  }
}

// ── Multi-intent analysis ─────────────────────────────────────────────────

/**
 * analyzeMessageIntents — single fast AI call that identifies EVERY distinct
 * issue in a patient message and extracts relevant fields for each one.
 *
 * This replaces extractWorkflowFields (single-workflow) for pipeline use.
 * extractWorkflowFields is kept as a fallback.
 *
 * Returns null on any failure so the pipeline gracefully falls back.
 */
export async function analyzeMessageIntents(
  openaiClient: OpenAI,
  messageBody: string,
): Promise<IntentAnalysis | null> {
  const systemPrompt = `You are a clinical message parser for a healthcare clinic. Identify every distinct issue or request in a patient message and extract relevant details. Return ONLY valid JSON — no explanation, no markdown.`;

  const userPrompt = `Read this patient message and identify ALL distinct issues or requests.

Patient message:
"${messageBody.slice(0, 800)}"

Return this exact JSON structure:
{
  "intents": [
    {
      "workflow": "medication_refill" | "appointment" | "lab_question" | "billing" | "urgent_safety" | "new_patient" | "intake_form" | "unclassified",
      "confidence": "high" | "medium" | "low",
      "summary": "one sentence describing this specific issue",
      "extracted": {
        "fieldName": "value (under 60 chars) or null if not mentioned"
      },
      "missing": ["list", "of", "important", "details", "not", "yet", "provided"]
    }
  ],
  "hasUrgentSafety": false,
  "overallUrgency": "routine" | "soon" | "urgent",
  "bestFollowUpQuestions": ["most useful question 1", "most useful question 2"]
}

Extraction field guidance per workflow:
- medication_refill: medication, dose, pharmacy, amountRemaining
- appointment: appointmentType, preferredTimes, reason, providerPreference
- lab_question: specificLab, labDate, concern
- urgent_safety: symptom, severity, duration
- billing: invoiceRef, amount, concern
- new_patient: serviceInterest, referralSource, insurance

Rules:
- List EVERY distinct issue as its own intent object
- bestFollowUpQuestions: at most 2, only for genuinely missing critical info, never about info already in the message
- hasUrgentSafety = true if any emergency, severe symptom, or safety concern is present
- overallUrgency = "urgent" for safety issues, "soon" for clinical symptoms, "routine" for admin tasks`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 600,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      intents: Array<{
        workflow: string;
        confidence: string;
        summary: string;
        extracted: Record<string, string | null>;
        missing: string[];
      }>;
      hasUrgentSafety: boolean;
      overallUrgency: string;
      bestFollowUpQuestions: string[];
    };

    const validWorkflows = new Set<string>([
      "medication_refill", "lab_question", "appointment", "intake_form",
      "new_patient", "billing", "urgent_safety", "unclassified",
    ]);
    const validConfidences = new Set(["high", "medium", "low"]);

    const intents: IntentItem[] = (parsed.intents ?? []).map((item) => ({
      workflow: validWorkflows.has(item.workflow)
        ? (item.workflow as SpruceWorkflowType)
        : "unclassified",
      confidence: validConfidences.has(item.confidence)
        ? (item.confidence as "high" | "medium" | "low")
        : "low",
      summary: String(item.summary ?? ""),
      extracted: (item.extracted && typeof item.extracted === "object") ? item.extracted : {},
      missing: Array.isArray(item.missing) ? item.missing : [],
    }));

    if (intents.length === 0) return null;

    // urgent_safety always takes priority as primary intent
    const primaryIntent =
      intents.find((i) => i.workflow === "urgent_safety") ?? intents[0];

    return {
      intents,
      hasUrgentSafety: Boolean(parsed.hasUrgentSafety),
      overallUrgency: (["routine", "soon", "urgent"].includes(parsed.overallUrgency)
        ? parsed.overallUrgency
        : "routine") as "routine" | "soon" | "urgent",
      bestFollowUpQuestions: (Array.isArray(parsed.bestFollowUpQuestions)
        ? parsed.bestFollowUpQuestions
        : []
      ).slice(0, 2),
      primaryWorkflow: primaryIntent.workflow,
    };
  } catch (err) {
    console.warn("[SpruceJune/intents] Intent analysis failed (non-fatal):", err);
    return null;
  }
}

// ── Acknowledgment generation ─────────────────────────────────────────────

const ACK_SYSTEM_PROMPT = `You are June, a warm and calm front-desk assistant at a healthcare clinic. You send brief, human acknowledgment messages to patients on behalf of the care team.

TONE — THIS IS THE MOST IMPORTANT RULE:
- Sound like a real, caring person — not a bot or auto-reply
- Use the patient's first name naturally when you have it (e.g. "Hi Sarah,")
- Lead with empathy or acknowledgment before logistics ("I'm sorry you're dealing with that." / "Of course!" / "Got it!")
- Be brief and conversational — 1–3 sentences, no more
- Never use hollow filler phrases like "Thank you for reaching out", "I appreciate your message", or "I understand your concern"

STRICT SAFETY RULES:
- Do NOT diagnose, prescribe, approve refills, change medication doses, or give medical advice
- Do NOT answer clinical questions — always say the care team or nurse will review
- Always let the patient know a team member will follow up
- For urgent/safety situations, always include: "If this is an emergency, please call 911 or go to your nearest ER immediately."
- Never make promises about timelines, refills, or outcomes
- NEVER ask the patient for information they already provided in their message
- Do NOT ask more than 1 follow-up question per message`;

/**
 * Fallback examples used when extraction confidence is low or unavailable.
 * These are style guides — not templates to copy verbatim.
 */
/**
 * Closing-turn style guides — used when this is the last allowed June turn.
 * June wraps up, confirms what it collected, and hands off to the care team.
 */
const CLOSING_STYLE_GUIDES: Partial<Record<SpruceWorkflowType, string>> = {
  medication_refill:
    "Got it — I'm passing your refill request to the care team now. They'll be in touch with you shortly.",
  appointment:
    "Perfect! I'm sending this to the team now. Someone will follow up to get that confirmed.",
  lab_question:
    "I'm getting this to the clinical team right now — they'll be in touch soon.",
  billing:
    "I'm forwarding this to our billing team. They'll follow up with you shortly.",
  unclassified:
    "I'll get this to the right person on the team. They'll follow up with you soon.",
};

const ACK_STYLE_GUIDES: Record<SpruceWorkflowType, string> = {
  medication_refill:
    "Of course — which medication do you need a refill on? Once I have that I'll get it over to the care team right away.",
  appointment:
    "Of course! What days or times work best for you? I'll pass this along so someone can check availability.",
  lab_question:
    "I'll get this to the clinical team right away. Is there a specific lab or result you're asking about?",
  new_patient:
    "We'd love to help! A team member will follow up with next steps for getting you scheduled.",
  intake_form:
    "Happy to help with that. Someone will be in touch shortly to walk you through it.",
  billing:
    "I'll make sure this gets to the right person on our billing team. They'll follow up with you shortly.",
  urgent_safety:
    "I'm flagging this for the care team right now. If this is an emergency, please call 911 or go to your nearest ER immediately.",
  unclassified:
    "I'll get this over to the team. A nurse will follow up with you shortly.",
};

/**
 * Which missing fields are most important to ask about, per workflow.
 * June will prioritise these when choosing what to ask.
 */
const PRIORITY_MISSING_FIELDS: Partial<Record<SpruceWorkflowType, string[]>> = {
  medication_refill: ["medication", "pharmacy", "dose", "amountRemaining"],
  appointment:       ["appointmentType", "preferredTimes", "reason"],
  lab_question:      ["specificLab", "concern"],
  billing:           ["concern", "invoiceRef"],
  urgent_safety:     ["symptom", "severity"],
};

export async function generateJuneAcknowledgment(
  openaiClient: OpenAI,
  workflow: string,
  messageBody: string,
  patientName: string | null,
  allowFollowUpQuestion: boolean,
  extractedFields: ExtractedFields | null = null,
  isLastTurn: boolean = false,
): Promise<string> {
  const workflowKey = (workflow as SpruceWorkflowType) in ACK_STYLE_GUIDES
    ? (workflow as SpruceWorkflowType)
    : "unclassified";

  // On the last allowed turn, use a closing style guide and never ask questions
  const styleGuide = isLastTurn
    ? (CLOSING_STYLE_GUIDES[workflowKey] ?? CLOSING_STYLE_GUIDES.unclassified ?? ACK_STYLE_GUIDES[workflowKey])
    : ACK_STYLE_GUIDES[workflowKey];
  const patientRef = patientName ? `The patient's name is ${patientName}.` : "";

  // Build the known/missing context for the prompt
  let extractionContext = "";
  if (extractedFields && extractedFields.confidence !== "low") {
    const foundEntries = Object.entries(extractedFields.fields)
      .filter(([, v]) => v !== null && v !== "");

    if (foundEntries.length > 0) {
      const knownLines = foundEntries
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");
      extractionContext += `\nINFORMATION ALREADY PROVIDED BY THE PATIENT (do NOT ask about these):\n${knownLines}\n`;
    }

    // Never suggest more questions on the closing turn
    if (!isLastTurn && allowFollowUpQuestion && extractedFields.missingFields.length > 0) {
      // Only suggest the highest-priority missing fields
      const priorityList = PRIORITY_MISSING_FIELDS[workflowKey as SpruceWorkflowType] ?? [];
      const prioritised = [
        ...extractedFields.missingFields.filter((f) => priorityList.includes(f)),
        ...extractedFields.missingFields.filter((f) => !priorityList.includes(f)),
      ].slice(0, 2); // never suggest asking more than 2

      if (prioritised.length > 0) {
        extractionContext += `\nINFORMATION STILL MISSING (you may ask about 1–2 of these):\n${prioritised.map((f) => `  - ${f}`).join("\n")}\n`;
      }
    }
  }

  const followUpInstruction = isLastTurn
    ? "This is your FINAL message. Do NOT ask any more questions. Warmly confirm what was collected, thank the patient, and let them know the care team will follow up. Keep it brief."
    : allowFollowUpQuestion
      ? "You may ask about 1–2 of the MISSING fields above (highest priority first). Do NOT ask about anything already provided."
      : "Do NOT ask any follow-up questions — acknowledge only and confirm the care team will follow up.";

  // Extra guidance for general/unclassified messages so June responds specifically
  // to what the patient said and sounds like a real person, not a canned bot reply.
  const generalMessageGuidance = workflowKey === "unclassified" ? `
IMPORTANT — GENERAL PATIENT MESSAGE (not matched to a specific workflow):
- Read the message carefully and respond specifically to what they said. Never be generic.
- Use the patient's first name if you have it: start with "Hi [FirstName],"
- Lead with empathy FIRST, logistics second. Example: "I'm sorry you're dealing with that. I'll get this over to the nurse for review."
- Symptom / health concern → acknowledge the concern warmly, say a nurse/the care team will review, then ask ONE focused triage question (e.g. "When did your symptoms start?" or "Are you running a fever?"). Do NOT diagnose, prescribe, or give medical advice.
- Wants a callback → acknowledge and ask for a good time or number if not already given.
- Running late / simple logistical update → brief, warm acknowledgment. No question needed.
- Anything urgent or potentially an emergency → say: "If this is an emergency, please call 911 or go to your nearest ER right away." then flag it for the team.
- Always close by saying the care team/nurse will follow up.
- Maximum 2–3 sentences. Sound human, not like an auto-reply.
` : "";

  const userPrompt = `Workflow type: ${workflow}
${patientRef}
${extractionContext}
${generalMessageGuidance}
${followUpInstruction}

Patient's original message:
"${messageBody.slice(0, 500)}"

Tone reference (do not copy verbatim — use as style inspiration only):
"${styleGuide}"

Write a brief, warm, natural acknowledgment. Lead with empathy or a natural opener — never start with "Thank you for reaching out" or similar hollow phrases. Use the patient's first name if provided. Sound like a real person, not an auto-reply.`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ACK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 160,
      temperature: 0.4,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch (err) {
    console.warn("[SpruceJune/ack] OpenAI call failed, falling back to template:", err);
  }

  // Fallback: build a basic contextual response from extracted fields
  return buildFallbackAck(workflowKey, extractedFields, patientName, allowFollowUpQuestion, isLastTurn);
}

function buildFallbackAck(
  workflow: SpruceWorkflowType,
  extracted: ExtractedFields | null,
  patientName: string | null,
  allowFollowUp: boolean,
  isLastTurn: boolean = false,
): string {
  const greeting = patientName ? `Hi ${patientName.split(" ")[0]}, ` : "";

  // Closing turn — wrap up regardless of what's missing
  if (isLastTurn) {
    const closingGuide = CLOSING_STYLE_GUIDES[workflow] ?? CLOSING_STYLE_GUIDES.unclassified ?? "";
    if (workflow === "medication_refill" && extracted?.fields) {
      const med = extracted.fields.medication;
      const pharm = extracted.fields.pharmacy;
      if (med && pharm) {
        return `${greeting}Got it — I'm passing your ${med} refill request at ${pharm} over to the care team now. They'll be in touch with you shortly.`;
      }
      if (med) {
        return `${greeting}Got it — I'm getting your ${med} refill request over to the care team now. They'll follow up with you shortly.`;
      }
    }
    return `${greeting}${closingGuide || "Thank you! A team member will be in touch with you shortly."}`;
  }

  if (workflow === "medication_refill" && extracted?.fields) {
    const med = extracted.fields.medication;
    const pharm = extracted.fields.pharmacy;
    if (med && pharm) {
      return `${greeting}I'll get this ${med} refill request to ${pharm} over to the care team right away. A team member will be in touch shortly.`;
    }
    if (med && allowFollowUp) {
      return `${greeting}I can help get that ${med} refill request to the care team. Which pharmacy should we send it to?`;
    }
    if (med) {
      return `${greeting}I can help get that ${med} refill request to the care team. They'll follow up with you shortly.`;
    }
    // Medication not specified — ask for it first before anything else
    if (allowFollowUp) {
      return `${greeting}I can help with your refill request. Which medication are you needing a refill on?`;
    }
    return `${greeting}I can help with your refill request. A team member will follow up with you shortly.`;
  }

  if (workflow === "urgent_safety") {
    return "If this is a medical emergency or you are experiencing severe symptoms, please call 911 or go to the nearest emergency room immediately. I am also flagging this for our care team right now.";
  }

  return ACK_STYLE_GUIDES[workflow] ?? ACK_STYLE_GUIDES.unclassified;
}

// ── Conversation-first response generation ────────────────────────────────

/**
 * The system prompt that makes June sound like a warm boutique clinic
 * receptionist — not a workflow engine, not a help desk.
 *
 * This completely replaces the per-workflow ACK_STYLE_GUIDES approach.
 * Every response goes through this single, consistent voice.
 */
const JUNE_RESPONSE_SYSTEM_PROMPT = `You are June, the front-desk coordinator at a boutique women's wellness clinic. You send warm, personal text messages to patients on behalf of the care team.

TONE — THIS IS THE MOST IMPORTANT RULE:
You are a real, caring person — not a bot, not an auto-reply, not a help desk.

NEVER USE THESE PHRASES (they sound robotic and corporate):
- "Thank you for reaching out"
- "I appreciate your message"
- "I've noted your concern"
- "Your concern has been documented"
- "I will pass this along to the care team"
- "We value your feedback"
- Any ticketing, support-desk, or automated-system language

PREFERRED NATURAL LANGUAGE:
- Greet with: "Hey [Name]!" or "Hi [Name],"
- "Thanks for letting us know"
- "I'm so sorry you're dealing with all of that"
- "I'll make sure the team sees this"
- "I'll get this over to [the team / the nurse / Morgan]"
- "We'll be in touch soon!"
- "Hope you feel better soon"
- "Of course!"
- "Glad you reached out"

HOW TO STRUCTURE YOUR RESPONSE:
1. Open with the patient's first name ("Hey Sarah!" or "Hi Sarah,")
2. Lead with empathy first if they're sick, worried, or stressed
3. Acknowledge EVERY issue they mentioned — show you read the whole message
4. Ask at most 1–2 useful follow-up questions (never about info they already gave)
5. Close with one warm sentence ("We'll be in touch soon!" / "Hope you have a great weekend!")

LENGTH: 2–4 sentences. This is an SMS — keep it short, warm, and human.

STRICT CLINICAL SAFETY RULES:
- NEVER diagnose, prescribe, approve refills, change medication doses, or give medical advice of any kind
- NEVER answer clinical questions — the nurse or care team will follow up
- For any emergency or severe symptom: always include "If this is an emergency, please call 911 or go to your nearest ER right away."
- Never promise specific timelines, refill approvals, or clinical outcomes`;

/**
 * generateJuneResponse — conversation-first response that addresses ALL
 * detected intents in a single, warm, natural message.
 *
 * This is the primary response generator. Falls back to generateJuneAcknowledgment
 * if the AI call fails so the pipeline is always resilient.
 */
export async function generateJuneResponse(
  openaiClient: OpenAI,
  intentAnalysis: IntentAnalysis,
  messageBody: string,
  patientName: string | null,
  allowFollowUpQuestion: boolean,
  isLastTurn: boolean,
  playbookCtx?: PlaybookContext | null,
): Promise<string> {
  const firstName = patientName ? patientName.trim().split(/\s+/)[0] : null;
  const patientRef = firstName
    ? `The patient's first name is ${firstName}. Use it naturally in your greeting.`
    : "You don't have the patient's name — skip a name in the greeting.";

  // Build a concise per-intent summary so the model knows what was said
  const intentLines = intentAnalysis.intents.map((intent, i) => {
    const knownEntries = Object.entries(intent.extracted).filter(
      ([, v]) => v !== null && v !== "",
    );
    const knownStr = knownEntries.length > 0
      ? `Already known: ${knownEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`
      : "No specific details extracted yet";
    const missingStr = intent.missing.length > 0
      ? ` | Still missing: ${intent.missing.slice(0, 3).join(", ")}`
      : "";
    return `Issue ${i + 1}: ${intent.summary} [${intent.workflow}] — ${knownStr}${missingStr}`;
  }).join("\n");

  const urgencyInstruction = intentAnalysis.hasUrgentSafety
    ? `\n⚠️ SAFETY NOTE: This message contains a potential safety concern. You MUST include: "If this is an emergency, please call 911 or go to your nearest ER right away."\n`
    : "";

  const followUpInstruction = isLastTurn
    ? "FINAL TURN: Do NOT ask any more questions. Confirm you're passing everything to the team and close warmly."
    : allowFollowUpQuestion && intentAnalysis.bestFollowUpQuestions.length > 0
      ? `You may ask 1–2 of these follow-up questions if genuinely useful (never ask about info already given):\n${intentAnalysis.bestFollowUpQuestions.map((q) => `- ${q}`).join("\n")}`
      : "Do NOT ask follow-up questions — acknowledge and confirm the team will follow up.";

  const userPrompt = `${patientRef}
${urgencyInstruction}
ALL ISSUES IN THIS MESSAGE (address every one in your response):
${intentLines}

${followUpInstruction}

Patient's original message:
"${messageBody.slice(0, 600)}"

Write a single, warm, natural response. 2–4 sentences. Sound like a real person, not an auto-reply.`;

  const systemPrompt = buildJuneSystemPrompt(playbookCtx ?? null);

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 220,
      temperature: 0.5,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch (err) {
    console.warn("[SpruceJune/response] generateJuneResponse failed, falling back:", err);
  }

  // Fallback to the original single-workflow generator (resilient path)
  return generateJuneAcknowledgment(
    openaiClient,
    intentAnalysis.primaryWorkflow,
    messageBody,
    patientName,
    allowFollowUpQuestion,
    null,
    isLastTurn,
  );
}

// ── Staff memo generation ─────────────────────────────────────────────────

const MEMO_SYSTEM_PROMPT = `You are a clinical assistant generating a brief, structured staff memo for a healthcare team. The memo summarizes a patient's inbound Spruce message and information collected by June. It is for internal staff use only — the patient never sees it.

Format the memo as plain text with labeled sections. Be concise and factual. Do not add medical advice or recommendations not clearly indicated by the message.`;

export interface MemoInput {
  workflow: string;
  messageBody: string;
  patientName: string | null;
  patientId: number | null;
  patientPhone: string | null;
  conversationKey: string;
  spruceConversationUrl: string | null;
  juneAckText?: string;
  extractedFields?: ExtractedFields | null;
  // T5 enrichment fields
  isAfterHours?: boolean;
  playbookUsed?: boolean;
  voiceStyle?: string | null;
  workflowHandoffNotes?: string | null;
  intentAnalysis?: IntentAnalysis | null;
}

export async function generateJuneMemo(
  openaiClient: OpenAI,
  input: MemoInput,
): Promise<string> {
  const {
    workflow, messageBody, patientName, patientId,
    patientPhone, spruceConversationUrl, juneAckText, extractedFields,
  } = input;

  // Build structured collected/missing context from extraction
  let collectedSection = "See message above";
  let missingSection = "Review original message";

  if (extractedFields && extractedFields.confidence !== "low") {
    const found = Object.entries(extractedFields.fields)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    if (found.length > 0) {
      collectedSection = found.join("\n  ");
    }
    if (extractedFields.missingFields.length > 0) {
      missingSection = extractedFields.missingFields.join(", ");
    } else {
      missingSection = "None — all expected fields collected";
    }
  }

  const {
    isAfterHours, playbookUsed, voiceStyle, workflowHandoffNotes, intentAnalysis,
  } = input;

  const afterHoursLine = isAfterHours ? "⚠️ AFTER HOURS — message received outside business hours" : "";
  const playbookLine = playbookUsed
    ? `Playbook active (voice: ${voiceStyle ?? "default"})`
    : "Playbook: not active (built-in defaults used)";

  const intentSummaryLines = intentAnalysis?.intents?.length
    ? intentAnalysis.intents.map((i, idx) =>
        `  ${idx + 1}. [${i.workflow}/${i.confidence}] ${i.summary}`,
      ).join("\n")
    : null;

  const userPrompt = `Generate a staff-facing memo for the following patient message.

WORKFLOW: ${workflow}
PATIENT: ${patientName ?? "Unmatched — phone " + (patientPhone ?? "unknown")}
PATIENT ID: ${patientId ? `ClinIQ #${patientId}` : "Not matched to a patient"}
PATIENT PHONE: ${patientPhone ?? "unknown"}
SPRUCE CONVERSATION: ${spruceConversationUrl ?? "N/A"}
${afterHoursLine ? afterHoursLine + "\n" : ""}${playbookLine}

PATIENT MESSAGE:
"${messageBody.slice(0, 600)}"

JUNE ACKNOWLEDGMENT SENT:
"${juneAckText ?? "(none)"}"

INFORMATION COLLECTED FROM MESSAGE:
  ${collectedSection}

INFORMATION STILL MISSING:
  ${missingSection}
${intentSummaryLines ? `\nALL DETECTED INTENTS:\n${intentSummaryLines}` : ""}
${workflowHandoffNotes ? `\nHANDOFF NOTES (from clinic playbook):\n  ${workflowHandoffNotes}` : ""}

Write a structured staff memo with exactly these sections:
- PATIENT
- WORKFLOW TYPE
- MESSAGE SUMMARY
- INFORMATION COLLECTED
- MISSING INFORMATION
- URGENCY (routine / soon / urgent)
- RECOMMENDED STAFF ACTION${workflowHandoffNotes ? " (incorporate handoff notes above)" : ""}
- CONVERSATION LINK`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: MEMO_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 450,
      temperature: 0.2,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch (err) {
    console.warn("[SpruceJune/memo] OpenAI call failed, building basic memo:", err);
  }

  return buildFallbackMemo(input);
}

function buildFallbackMemo(input: MemoInput): string {
  const { workflow, messageBody, patientName, patientId, patientPhone, spruceConversationUrl, juneAckText, extractedFields } = input;
  const urgencyMap: Record<string, string> = {
    urgent_safety: "URGENT",
    medication_refill: "Routine",
    appointment: "Routine",
    lab_question: "Soon",
    new_patient: "Routine",
    intake_form: "Routine",
    billing: "Routine",
    unclassified: "Routine",
  };

  let collected = "See message above";
  let missing = "Review original message for details needed";
  if (extractedFields && extractedFields.confidence !== "low") {
    const found = Object.entries(extractedFields.fields)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    if (found.length > 0) collected = found.join(" | ");
    if (extractedFields.missingFields.length > 0) {
      missing = extractedFields.missingFields.join(", ");
    } else {
      missing = "None — all expected fields collected";
    }
  }

  return `PATIENT: ${patientName ?? "Unmatched"} | Phone: ${patientPhone ?? "unknown"} | ClinIQ ID: ${patientId ?? "N/A"}
WORKFLOW TYPE: ${workflow}
MESSAGE SUMMARY: ${messageBody.slice(0, 200)}${messageBody.length > 200 ? "…" : ""}
INFORMATION COLLECTED: ${collected}
MISSING INFORMATION: ${missing}
URGENCY: ${urgencyMap[workflow] ?? "Routine"}
RECOMMENDED STAFF ACTION: Review and respond in Spruce
CONVERSATION LINK: ${spruceConversationUrl ?? "N/A"}
JUNE ACK SENT: ${juneAckText ? `"${juneAckText.slice(0, 100)}"` : "None"}`;
}

// ── Spruce API delivery ───────────────────────────────────────────────────

async function deliverViaSpruceApi(
  spruceConversationId: string,
  messageText: string,
  apiToken: string,
): Promise<{ ok: boolean; deliveryId?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://api.sprucehealth.com/v1/conversations/${spruceConversationId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: [{ type: "text", value: messageText }],
          internal: false,
        }),
      },
    );
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, deliveryId: data?.id };
    }
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Spruce API ${res.status}: ${errText.slice(0, 200)}` };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Network error" };
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────

/**
 * runJunePipeline — Called from the Spruce webhook handler after a message
 * is stored and classified. Checks all gates, extracts known fields,
 * generates acknowledgment + memo, stores audit records, and delivers.
 *
 * Always resolves (never throws) so it's safe to call fire-and-forget.
 *
 * Intelligence layer order:
 *   1. Gate checks (fast — no AI if any gate fails)
 *   2. extractWorkflowFields() — single fast JSON call, fallback = null
 *   3. generateJuneAcknowledgment() — uses extracted fields for smart reply
 *   4. generateJuneMemo() — uses extracted fields for collected/missing sections
 *   5. DB audit + Spruce delivery
 */
export async function runJunePipeline(
  input: JunePipelineInput,
): Promise<JunePipelineResult> {
  const tag = `[SpruceJune clinic=${input.clinicId} conv="${input.conversationKey.slice(0, 40)}"]`;

  try {
    const { storage, classification, conversationKey, clinicId } = input;

    // Load workflow-level settings AND playbook context in parallel.
    // Both are required before the gate check — fail-safe: null = use defaults.
    const [workflowSetting, playbookCtx] = await Promise.all([
      storage.getSpruceWorkflowSetting(clinicId, classification.workflow).catch(() => null),
      loadPlaybookContext(storage, clinicId, classification.workflow),
    ]);

    const playbookEnabled = playbookCtx.clinicPlaybook?.playbookEnabled ?? false;
    console.log(
      `${tag} playbookEnabled=${playbookEnabled} ` +
      `isAfterHours=${playbookCtx.isAfterHours} isHoliday=${playbookCtx.isHoliday}`,
    );

    // Use the real turn count passed in from the webhook handler.
    // Turn 0 = first June reply, Turn 1 = second, etc.
    const juneTurnCount = input.juneTurnCount ?? 0;

    // Gate check — bail early before any AI calls if blocked.
    // Gate 9 (after-hours) is included here via playbookCtx.
    const skipReason = await shouldJuneAcknowledge(input, workflowSetting, juneTurnCount, playbookCtx);
    if (skipReason) {
      console.log(`${tag} June SKIPPED: ${skipReason}`);
      return { skipped: true, skipReason, acknowledgmentSent: false };
    }

    console.log(`${tag} June pipeline proceeding — workflow="${classification.workflow}"`);

    // ── Step 1: Extract structured fields from the patient message ────────
    // This is a fast, cheap AI call that tells us what's already in the message.
    // On any failure, extractedFields = null and we fall back to generic prompts.
    const extractedFields = await extractWorkflowFields(
      input.openaiClient,
      classification.workflow,
      input.messageBody,
    );

    if (extractedFields) {
      console.log(
        `${tag} Extracted fields confidence="${extractedFields.confidence}" ` +
        `collected="${extractedFields.collectedSummary}" ` +
        `missing=[${extractedFields.missingFields.join(",")}]`,
      );
    } else {
      console.log(`${tag} Field extraction returned null — using generic prompts`);
    }

    // ── Step 2: Generate acknowledgment (context-aware + playbook-aware) ──
    // Determine if this is the final allowed turn so June wraps up instead of asking more questions
    const maxTurns = workflowSetting?.maxJuneTurns ?? 1;
    const isLastTurn = juneTurnCount + 1 >= maxTurns;
    console.log(`${tag} turn=${juneTurnCount} maxTurns=${maxTurns} isLastTurn=${isLastTurn}`);

    // Try multi-intent analysis first (richer response); fall back to single-workflow ack
    let ackText: string;
    let intentAnalysis: IntentAnalysis | null = null;

    try {
      intentAnalysis = await analyzeMessageIntents(input.openaiClient, input.messageBody);
    } catch {
      intentAnalysis = null;
    }

    if (intentAnalysis && intentAnalysis.intents.length > 0) {
      ackText = await generateJuneResponse(
        input.openaiClient,
        intentAnalysis,
        input.messageBody,
        input.patientName,
        workflowSetting?.allowFollowUpQuestion ?? false,
        isLastTurn,
        playbookCtx,  // T3: inject playbook context into response prompt
      );
    } else {
      ackText = await generateJuneAcknowledgment(
        input.openaiClient,
        classification.workflow,
        input.messageBody,
        input.patientName,
        workflowSetting?.allowFollowUpQuestion ?? false,
        extractedFields,
        isLastTurn,
      );
    }

    // ── Step 3: Generate staff memo (with collected/missing + T5 enrichment)
    const memoText = await generateJuneMemo(input.openaiClient, {
      workflow: classification.workflow,
      messageBody: input.messageBody,
      patientName: input.patientName,
      patientId: input.patientId,
      patientPhone: input.fromPhone,
      conversationKey: conversationKey,
      spruceConversationUrl: input.spruceConversationUrl,
      juneAckText: ackText,
      extractedFields,
      // T5 enrichment
      isAfterHours: playbookCtx.isAfterHours || playbookCtx.isHoliday,
      playbookUsed: playbookEnabled,
      voiceStyle: playbookCtx.clinicPlaybook?.voiceStyle ?? null,
      workflowHandoffNotes: playbookCtx.workflowPlaybook?.isEnabled
        ? playbookCtx.workflowPlaybook.handoffNotes ?? null
        : null,
      intentAnalysis,
    });

    // ── Step 4: Audit + Spruce delivery ───────────────────────────────────

    // Store outbound message audit record (sentByAI=true, sender=Spruce June)
    const outbound = await storage.createSpruceOutboundMessage({
      clinicId,
      conversationKey,
      messageBody: ackText,
      sentByUserId: null,
      sentByAI: true,
      workflowRequestId: input.workflowRequestId,
      spruceDeliveryId: null,
    });

    // Mirror into spruceMessages so the inbox thread shows the June message
    const mirroredAck = await storage.createSpruceMessage({
      clinicId,
      spruceMessageId: `june_ack_${outbound.id}`,
      spruceConversationId: input.spruceConversationId,
      fromPhone: null,
      toPhone: input.fromPhone,
      patientId: input.patientId,
      messageBody: ackText,
      eventType: "cliniq_june_ack",
      rawPayload: {
        source: "cliniq_june",
        outboundMessageId: outbound.id,
        sentByAI: true,
        extractedFields: extractedFields ?? null,
      },
      classifiedWorkflow: classification.workflow,
      classificationConfidence: null,
      messageDirection: "outbound_staff",
      staffRepliedAt: null,
      spruceEventDedupeKey: `june_ack:${outbound.id}`,
      spruceContactName: "Spruce June",
    });

    // Update conversation state — mark as active
    await storage.upsertSpruceConversationState(clinicId, conversationKey, {
      state: "active",
      lastActivityAt: new Date(),
    });

    // Update workflow request with memo + ack timestamp + turn count
    if (input.workflowRequestId) {
      await storage.updateSpruceWorkflowRequestJune(input.workflowRequestId, {
        juneAckSentAt: new Date(),
        juneMemoText: memoText,
        juneTurnCount: juneTurnCount + 1,
      });
    }

    // Attempt Spruce API delivery
    let spruceDelivered = false;
    if (input.apiToken && input.spruceConversationId) {
      const deliveryResult = await deliverViaSpruceApi(
        input.spruceConversationId,
        ackText,
        input.apiToken,
      );
      spruceDelivered = deliveryResult.ok;
      if (deliveryResult.ok) {
        if (deliveryResult.deliveryId) {
          await storage.updateSpruceOutboundDeliveryId(outbound.id, deliveryResult.deliveryId);
          // Stamp the mirror row so Spruce's echo webhook is suppressed by dedup
          if (mirroredAck?.id) {
            await storage.updateSpruceMessageEchoIds(
              mirroredAck.id,
              deliveryResult.deliveryId,
              `conversationItem.created:${deliveryResult.deliveryId}`,
            ).catch((e) => console.warn(`${tag} updateSpruceMessageEchoIds failed (non-fatal):`, e));
          }
        }
        console.log(`${tag} Spruce API delivery OK deliveryId=${deliveryResult.deliveryId}`);
      } else {
        console.warn(`${tag} Spruce API delivery failed: ${deliveryResult.error}`);
      }
    } else {
      console.log(
        `${tag} Spruce API delivery skipped — ` +
        `token=${input.apiToken ? "present" : "absent"} ` +
        `conversationId=${input.spruceConversationId ?? "absent"}`,
      );
    }

    // T4: After-hours dedup stamp — if we sent an after-hours notice, record it
    // so Gate 9 suppresses re-sends within the next 24 hours for this conversation.
    const sentAfterHours =
      playbookEnabled &&
      (playbookCtx.isAfterHours || playbookCtx.isHoliday) &&
      (playbookCtx.clinicPlaybook?.afterHoursEnabled ?? false);
    if (sentAfterHours) {
      await (storage as any).setAfterHoursNoticeSentAt(clinicId, conversationKey, new Date()).catch(
        (e: any) => console.warn(`${tag} setAfterHoursNoticeSentAt failed (non-fatal):`, e),
      );
      console.log(`${tag} after-hours notice stamped on conv state`);
    }

    console.log(
      `${tag} June pipeline complete — ` +
      `ackLen=${ackText.length} memoLen=${memoText.length} ` +
      `spruceDelivered=${spruceDelivered} playbookUsed=${playbookEnabled} ` +
      `afterHours=${sentAfterHours}`,
    );

    return {
      skipped: false,
      acknowledgmentSent: true,
      acknowledgmentText: ackText,
      memoText,
      spruceDelivered,
      extractedFields,
      intentAnalysis,
    };
  } catch (err: any) {
    console.error(`[SpruceJune] Pipeline error (non-fatal):`, err);
    return {
      skipped: true,
      skipReason: `Pipeline error: ${err?.message ?? "unknown"}`,
      acknowledgmentSent: false,
    };
  }
}
