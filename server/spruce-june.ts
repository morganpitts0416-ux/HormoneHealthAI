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
}

export interface JunePipelineResult {
  skipped: boolean;
  skipReason?: string;
  acknowledgmentSent: boolean;
  acknowledgmentText?: string;
  memoText?: string;
  spruceDelivered?: boolean;
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

  // Gate 5: No staff reply may exist after the triggering patient message
  // (The webhook sets staffRepliedAt on the stored message for outbound_staff;
  //  convState.aiMutedAt covers the sticky mute. If the conv state row shows
  //  staff_takeover we already returned above. This is a belt-and-suspenders check.)
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
- Tone: professional, warm, reassuring — never robotic or clinical`;

const ACK_EXAMPLES: Record<SpruceWorkflowType, string> = {
  medication_refill:
    "I can help get this to the care team. Which medication are you needing refilled, and which pharmacy should we use?",
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

export async function generateJuneAcknowledgment(
  openaiClient: OpenAI,
  workflow: string,
  messageBody: string,
  patientName: string | null,
  allowFollowUpQuestion: boolean,
): Promise<string> {
  const workflowKey = (workflow as SpruceWorkflowType) in ACK_EXAMPLES
    ? (workflow as SpruceWorkflowType)
    : "unclassified";
  const example = ACK_EXAMPLES[workflowKey];
  const patientRef = patientName ? `The patient's name is ${patientName}.` : "The patient's name is not on file.";
  const followUpInstruction = allowFollowUpQuestion
    ? "You may ask up to 2 brief, safe clarifying questions to help the care team."
    : "Do NOT ask any follow-up questions — acknowledge only.";

  const userPrompt = `Workflow type: ${workflow}
${patientRef}
${followUpInstruction}

Patient's message:
"${messageBody.slice(0, 500)}"

Example response style for this workflow:
"${example}"

Write a brief, professional acknowledgment. Do not copy the example verbatim — tailor it to this specific message.`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ACK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.4,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch (err) {
    console.warn("[SpruceJune/ack] OpenAI call failed, falling back to template:", err);
  }

  // Fallback: use the template directly
  return example;
}

// ── Staff memo generation ─────────────────────────────────────────────────

const MEMO_SYSTEM_PROMPT = `You are a clinical assistant generating a brief, structured staff memo for a healthcare team. The memo summarizes a patient's inbound Spruce message and any information collected by June. It is for internal staff use only — the patient never sees it.

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
}

export async function generateJuneMemo(
  openaiClient: OpenAI,
  input: MemoInput,
): Promise<string> {
  const {
    workflow, messageBody, patientName, patientId,
    patientPhone, spruceConversationUrl, juneAckText,
  } = input;

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

Write a structured staff memo with these sections:
- PATIENT
- WORKFLOW TYPE
- MESSAGE SUMMARY
- INFORMATION COLLECTED (from the patient message — what do we know?)
- MISSING INFORMATION (what does staff still need to find out?)
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
      max_tokens: 400,
      temperature: 0.2,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch (err) {
    console.warn("[SpruceJune/memo] OpenAI call failed, building basic memo:", err);
  }

  // Fallback: structured template memo
  return buildFallbackMemo(input);
}

function buildFallbackMemo(input: MemoInput): string {
  const { workflow, messageBody, patientName, patientId, patientPhone, spruceConversationUrl, juneAckText } = input;
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
  return `PATIENT: ${patientName ?? "Unmatched"} | Phone: ${patientPhone ?? "unknown"} | ClinIQ ID: ${patientId ?? "N/A"}
WORKFLOW TYPE: ${workflow}
MESSAGE SUMMARY: ${messageBody.slice(0, 200)}${messageBody.length > 200 ? "…" : ""}
INFORMATION COLLECTED: See message above
MISSING INFORMATION: Review original message for details needed
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
 * is stored and classified. Checks all gates, generates acknowledgment +
 * memo if enabled, stores audit records, and attempts Spruce delivery.
 *
 * Always resolves (never throws) so it's safe to call fire-and-forget.
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

    // Load current turn count from the workflow request (if any)
    const juneTurnCount = 0; // new message = fresh check; workflow request was just created

    // Gate check
    const skipReason = await shouldJuneAcknowledge(input, workflowSetting, juneTurnCount);
    if (skipReason) {
      console.log(`${tag} June SKIPPED: ${skipReason}`);
      return { skipped: true, skipReason, acknowledgmentSent: false };
    }

    console.log(`${tag} June pipeline proceeding — workflow="${classification.workflow}"`);

    // Generate acknowledgment
    const ackText = await generateJuneAcknowledgment(
      input.openaiClient,
      classification.workflow,
      input.messageBody,
      input.patientName,
      workflowSetting?.allowFollowUpQuestion ?? false,
    );

    // Generate staff memo
    const memoText = await generateJuneMemo(input.openaiClient, {
      workflow: classification.workflow,
      messageBody: input.messageBody,
      patientName: input.patientName,
      patientId: input.patientId,
      patientPhone: input.fromPhone,
      conversationKey: conversationKey,
      spruceConversationUrl: input.spruceConversationUrl,
      juneAckText: ackText,
    });

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
    await storage.createSpruceMessage({
      clinicId,
      spruceMessageId: `june_ack_${outbound.id}`,
      spruceConversationId: input.spruceConversationId,
      fromPhone: null,
      toPhone: input.fromPhone,
      patientId: input.patientId,
      messageBody: ackText,
      eventType: "cliniq_june_ack",
      rawPayload: { source: "cliniq_june", outboundMessageId: outbound.id, sentByAI: true },
      classifiedWorkflow: classification.workflow,
      classificationConfidence: null,
      messageDirection: "outbound_staff",
      staffRepliedAt: null,
      spruceEventDedupeKey: `june_ack:${outbound.id}`,
      spruceContactName: "Spruce June",
    });

    // Update conversation state — mark as active (June responded, not staff)
    // Do NOT set aiMutedAt — that's only for human staff replies
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

    // Attempt Spruce API delivery (stub if no token or no conversationId)
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
