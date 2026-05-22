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
): Promise<string | null> {
  const { messageDirection, classification, clinicSettings, convState } = input;

  // Gate 1: Only respond to inbound patient messages
  if (messageDirection !== "inbound_patient" && messageDirection !== "unknown") {
    return `direction=${messageDirection} — June only responds to inbound patient messages`;
  }

  // Gate 2: Clinic-level master switch
  if (!clinicSettings.spruceJuneAcknowledgmentsEnabled) {
    return "spruceJuneAcknowledgmentsEnabled=false for this clinic";
  }

  // Gate 3: Workflow-level switch (defaults deny when row absent)
  if (!workflowSetting?.allowAcknowledgment) {
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
  if (classification.confidence === "low") {
    return `classification confidence="low" — June requires medium or high confidence`;
  }

  // Gate 7: Turn limit
  const maxTurns = workflowSetting?.maxJuneTurns ?? 1;
  if (juneTurnCount >= maxTurns) {
    return `juneTurnCount=${juneTurnCount} >= maxJuneTurns=${maxTurns} — turn limit reached`;
  }

  // Gate 8: Unclassified messages — don't respond
  if (classification.workflow === "unclassified") {
    return "workflow=unclassified — June does not respond to unclassified messages";
  }

  return null; // All gates passed
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

// ── Acknowledgment generation ─────────────────────────────────────────────

const ACK_SYSTEM_PROMPT = `You are Spruce June, a professional, warm, and concise clinical assistant for a healthcare practice. Your ONLY job is to send brief, safe acknowledgment messages to patients who have messaged the clinic.

STRICT RULES:
- Do NOT diagnose, prescribe, approve refills, change medication doses, or give medical advice
- Do NOT answer clinical questions — always defer to the care team
- Keep responses brief (2–4 sentences maximum)
- Always let the patient know a team member will follow up
- For urgent/safety situations, always include emergency escalation language (call 911 or go to the nearest ER)
- Never make promises about timelines, refills, or outcomes
- Do NOT ask more than 2 clarifying questions in a single message
- NEVER ask the patient for information they already provided in their message
- Tone: professional, warm, conversational — never robotic or canned`;

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
    "Got it — thank you! I'm passing your refill request over to the care team now. They'll follow up with you shortly.",
  appointment:
    "Perfect, thank you! I'm sending this over to the care team. Someone will follow up to confirm your appointment.",
  lab_question:
    "Thank you for that information. I'm getting this to the clinical team right now — they'll be in touch soon.",
  billing:
    "Thank you — I'm forwarding this to our billing team. They'll follow up with you shortly.",
  unclassified:
    "Thank you for that information. A team member will be in touch with you soon.",
};

const ACK_STYLE_GUIDES: Record<SpruceWorkflowType, string> = {
  medication_refill:
    "Of course — which medication are you needing a refill on? Once I have that, I'll get this over to the care team right away.",
  appointment:
    "Of course — what days or times usually work best for you? I'll pass this along so the team can confirm availability.",
  lab_question:
    "I'll get this over to the clinical team right away. Is there a specific lab or result you're asking about?",
  new_patient:
    "Thanks for reaching out — we'd love to help. A team member will follow up with next steps for getting you scheduled.",
  intake_form:
    "Happy to help with that. A team member will be in touch shortly to walk you through the forms.",
  billing:
    "I'll make sure this gets to the right person on our billing team. They'll follow up with you shortly.",
  urgent_safety:
    "If this is a medical emergency or you are experiencing severe symptoms, please call 911 or go to the nearest emergency room immediately. I am also flagging this for our care team right now.",
  unclassified:
    "Thanks for reaching out — I'll make sure this gets to the right person. A team member will follow up with you shortly.",
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

  const userPrompt = `Workflow type: ${workflow}
${patientRef}
${extractionContext}
${followUpInstruction}

Patient's original message:
"${messageBody.slice(0, 500)}"

Style guide (do not copy — use as tone/length reference only):
"${styleGuide}"

Write a brief, warm, natural acknowledgment. Confirm what the patient shared. If asking a question, make it specific to what's actually missing — never ask them to repeat something they already said.`;

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

  const userPrompt = `Generate a staff-facing memo for the following patient message.

WORKFLOW: ${workflow}
PATIENT: ${patientName ?? "Unmatched — phone " + (patientPhone ?? "unknown")}
PATIENT ID: ${patientId ? `ClinIQ #${patientId}` : "Not matched to a patient"}
PATIENT PHONE: ${patientPhone ?? "unknown"}
SPRUCE CONVERSATION: ${spruceConversationUrl ?? "N/A"}

PATIENT MESSAGE:
"${messageBody.slice(0, 600)}"

JUNE ACKNOWLEDGMENT SENT:
"${juneAckText ?? "(none)"}"

INFORMATION COLLECTED FROM MESSAGE:
  ${collectedSection}

INFORMATION STILL MISSING:
  ${missingSection}

Write a structured staff memo with exactly these sections:
- PATIENT
- WORKFLOW TYPE
- MESSAGE SUMMARY
- INFORMATION COLLECTED
- MISSING INFORMATION
- URGENCY (routine / soon / urgent)
- RECOMMENDED STAFF ACTION
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

    // Load workflow-level settings (null = row absent → defaults deny)
    const workflowSetting = await storage.getSpruceWorkflowSetting(
      clinicId,
      classification.workflow,
    ).catch(() => null);

    // Use the real turn count passed in from the webhook handler.
    // Turn 0 = first June reply, Turn 1 = second, etc.
    const juneTurnCount = input.juneTurnCount ?? 0;

    // Gate check — bail early before any AI calls if blocked
    const skipReason = await shouldJuneAcknowledge(input, workflowSetting, juneTurnCount);
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

    // ── Step 2: Generate acknowledgment (context-aware) ───────────────────
    // Determine if this is the final allowed turn so June wraps up instead of asking more questions
    const maxTurns = workflowSetting?.maxJuneTurns ?? 1;
    const isLastTurn = juneTurnCount + 1 >= maxTurns;
    console.log(`${tag} turn=${juneTurnCount} maxTurns=${maxTurns} isLastTurn=${isLastTurn}`);

    const ackText = await generateJuneAcknowledgment(
      input.openaiClient,
      classification.workflow,
      input.messageBody,
      input.patientName,
      workflowSetting?.allowFollowUpQuestion ?? false,
      extractedFields,
      isLastTurn,
    );

    // ── Step 3: Generate staff memo (with collected/missing sections) ──────
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

    console.log(
      `${tag} June pipeline complete — ` +
      `ackLen=${ackText.length} memoLen=${memoText.length} spruceDelivered=${spruceDelivered}`,
    );

    return {
      skipped: false,
      acknowledgmentSent: true,
      acknowledgmentText: ackText,
      memoText,
      spruceDelivered,
      extractedFields,
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
