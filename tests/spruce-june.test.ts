/**
 * Spruce June Phase 3A — Unit / Integration Tests
 *
 * Tests cover gate checks, field extraction, AI generation fallbacks, and
 * pipeline orchestration logic in server/spruce-june.ts.
 *
 * These tests run in-process with mocked storage and OpenAI — no real
 * HTTP calls, no DB writes, no side effects on any other ClinIQ system.
 */

import {
  shouldJuneAcknowledge,
  generateJuneAcknowledgment,
  generateJuneMemo,
  extractWorkflowFields,
  runJunePipeline,
} from "../server/spruce-june";
import type { JunePipelineInput } from "../server/spruce-june";
import OpenAI from "openai";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeClinicSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clinicId: 1,
    isEnabled: true,
    spruceAutoReplyEnabled: false,
    spruceJuneAcknowledgmentsEnabled: true,
    spruceOrgId: null,
    spruceWebhookEndpointId: null,
    spruceReceivingPhone: "+12025550001",
    webhookSecretEncrypted: null,
    apiTokenEncrypted: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

function makeWorkflowSetting(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clinicId: 1,
    workflow: "medication_refill",
    allowAcknowledgment: true,
    allowFollowUpQuestion: false,
    maxJuneTurns: 1,
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

function makeConvState(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clinicId: 1,
    conversationKey: "t_conv123",
    state: "open",
    aiMutedAt: null,
    aiMutedByUserId: null,
    lastActivityAt: new Date(),
    archivedAt: null,
    archivedByUserId: null,
    archiveSource: null,
    spruceArchiveSyncedAt: null,
    spruceArchiveError: null,
    ...overrides,
  } as any;
}

function makeStorage(overrides: Record<string, unknown> = {}) {
  return {
    getSpruceWorkflowSetting: async () => makeWorkflowSetting(),
    upsertSpruceConversationState: async () => makeConvState(),
    createSpruceOutboundMessage: async () => ({
      id: 99, clinicId: 1, conversationKey: "t_conv123", messageBody: "test",
      sentByAI: true, sentAt: new Date(), workflowRequestId: null,
      spruceDeliveryId: null, sentByUserId: null,
    }),
    createSpruceMessage: async () => ({ id: 100, clinicId: 1 }),
    updateSpruceWorkflowRequestJune: async () => {},
    updateSpruceOutboundDeliveryId: async () => {},
    ...overrides,
  } as any;
}

function makePipelineInput(overrides: Partial<JunePipelineInput> = {}): JunePipelineInput {
  return {
    clinicId: 1,
    conversationKey: "t_conv123",
    spruceConversationId: "t_conv123",
    messageBody: "I need a refill on my testosterone cream please",
    messageDirection: "inbound_patient",
    classification: { workflow: "medication_refill", confidence: "high" },
    workflowRequestId: 42,
    clinicSettings: makeClinicSettings(),
    convState: makeConvState(),
    patientName: "Jane Doe",
    patientId: 7,
    fromPhone: "+15550001234",
    spruceConversationUrl: "https://app.sprucehealth.com/conversations/t_conv123",
    apiToken: null,
    storage: makeStorage(),
    openaiClient: null as any,
    ...overrides,
  };
}

/** Returns a mock OpenAI client that cycles through `responses` in order. */
function makeMockOpenAI(...responses: Array<string | (() => Promise<string>)>): OpenAI {
  let callIndex = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const r = responses[callIndex] ?? responses[responses.length - 1];
          callIndex++;
          const text = typeof r === "function" ? await r() : r;
          return { choices: [{ message: { content: text } }] };
        },
      },
    },
  } as any;
}

function makeThrowingOpenAI(): OpenAI {
  return {
    chat: {
      completions: {
        create: async () => { throw new Error("OpenAI timeout"); },
      },
    },
  } as any;
}

// ── Test 1: Gate — master switch off ─────────────────────────────────────

async function test_gateMasterSwitchOff() {
  const clinicSettings = makeClinicSettings({ spruceJuneAcknowledgmentsEnabled: false });
  const workflowSetting = makeWorkflowSetting({ allowAcknowledgment: true });
  const skipReason = await shouldJuneAcknowledge(
    makePipelineInput({ clinicSettings }),
    workflowSetting,
    0,
  );
  console.assert(
    skipReason !== null && skipReason.includes("spruceJuneAcknowledgmentsEnabled=false"),
    `❌ test_gateMasterSwitchOff FAILED — expected skip with master switch reason, got: ${skipReason}`,
  );
  console.log("✓ test_gateMasterSwitchOff passed");
}

// ── Test 2: Gate — workflow-level switch off ──────────────────────────────

async function test_gateWorkflowSwitchOff() {
  const workflowSetting = makeWorkflowSetting({ allowAcknowledgment: false });
  const skipReason = await shouldJuneAcknowledge(
    makePipelineInput(),
    workflowSetting,
    0,
  );
  console.assert(
    skipReason !== null && skipReason.includes("allowAcknowledgment=false"),
    `❌ test_gateWorkflowSwitchOff FAILED — got: ${skipReason}`,
  );
  console.log("✓ test_gateWorkflowSwitchOff passed");
}

// ── Test 3: Gate — staff takeover blocks June ─────────────────────────────

async function test_gateStaffTakeover() {
  const convState = makeConvState({ state: "staff_takeover" });
  const workflowSetting = makeWorkflowSetting({ allowAcknowledgment: true });
  const skipReason = await shouldJuneAcknowledge(
    makePipelineInput({ convState }),
    workflowSetting,
    0,
  );
  console.assert(
    skipReason !== null && skipReason.includes("staff_takeover"),
    `❌ test_gateStaffTakeover FAILED — got: ${skipReason}`,
  );
  console.log("✓ test_gateStaffTakeover passed");
}

// ── Test 4: Gate — all clear, proceed ────────────────────────────────────

async function test_gateAllClear() {
  const workflowSetting = makeWorkflowSetting({ allowAcknowledgment: true });
  const skipReason = await shouldJuneAcknowledge(
    makePipelineInput(),
    workflowSetting,
    0,
  );
  console.assert(
    skipReason === null,
    `❌ test_gateAllClear FAILED — expected null skip reason, got: ${skipReason}`,
  );
  console.log("✓ test_gateAllClear passed");
}

// ── Test 5: Pipeline skips when master switch is off ─────────────────────

async function test_pipelineSkipsWhenDisabled() {
  const clinicSettings = makeClinicSettings({ spruceJuneAcknowledgmentsEnabled: false });
  const storage = makeStorage({
    getSpruceWorkflowSetting: async () => makeWorkflowSetting({ allowAcknowledgment: true }),
  });
  const openaiClient = makeMockOpenAI("This should never be called");
  const result = await runJunePipeline(
    makePipelineInput({ clinicSettings, storage, openaiClient }),
  );
  console.assert(
    result.skipped === true,
    `❌ test_pipelineSkipsWhenDisabled FAILED — expected skipped=true, got: ${JSON.stringify(result)}`,
  );
  console.assert(
    result.acknowledgmentSent === false,
    `❌ test_pipelineSkipsWhenDisabled: expected acknowledgmentSent=false`,
  );
  console.log("✓ test_pipelineSkipsWhenDisabled passed");
}

// ── Test 6: Pipeline runs and produces acknowledgment (3 OpenAI calls) ───
// Order: (1) extractWorkflowFields, (2) generateJuneAcknowledgment, (3) generateJuneMemo

async function test_pipelineAcknowledgesWhenEnabled() {
  const extractJson = JSON.stringify({
    confidence: "high",
    fields: { medication: "testosterone cream", dose: null, frequency: null, pharmacy: null, amountRemaining: null, sideEffects: null },
  });
  const ackText = "Of course — I can help get that testosterone cream refill to the care team. Which pharmacy should we use?";
  const memoText = "PATIENT: Jane Doe | WORKFLOW: medication_refill | SUMMARY: Testosterone refill request";

  let calledCreateOutbound = false;
  let calledUpdateWorkflowRequest = false;
  let calledCreateMessage = false;
  let calledUpsertConvState = false;

  const storage = makeStorage({
    getSpruceWorkflowSetting: async () => makeWorkflowSetting({ allowAcknowledgment: true }),
    createSpruceOutboundMessage: async (data: any) => {
      calledCreateOutbound = true;
      console.assert(data.sentByAI === true, "sentByAI must be true");
      return { id: 99, ...data, sentAt: new Date() };
    },
    createSpruceMessage: async (data: any) => {
      calledCreateMessage = true;
      console.assert(data.messageDirection === "outbound_staff", "mirrored message should be outbound_staff");
      return { id: 100, ...data };
    },
    upsertSpruceConversationState: async (clinicId: number, key: string, data: any) => {
      calledUpsertConvState = true;
      console.assert(data.state === "active", `conv state should be active, got ${data.state}`);
      return makeConvState({ state: data.state });
    },
    updateSpruceWorkflowRequestJune: async (id: number, data: any) => {
      calledUpdateWorkflowRequest = true;
      console.assert(data.juneAckSentAt instanceof Date, "juneAckSentAt must be a Date");
      console.assert(typeof data.juneMemoText === "string" && data.juneMemoText.length > 0, "juneMemoText must be non-empty");
      console.assert(data.juneTurnCount === 1, `juneTurnCount must be 1, got ${data.juneTurnCount}`);
    },
    updateSpruceOutboundDeliveryId: async () => {},
  });

  // Call order: 1=extractWorkflowFields JSON, 2=ack text, 3=memo text
  const openaiClient = makeMockOpenAI(extractJson, ackText, memoText);

  const result = await runJunePipeline(
    makePipelineInput({ storage, openaiClient }),
  );

  console.assert(result.skipped === false, `expected skipped=false, got ${result.skipped} (reason: ${result.skipReason})`);
  console.assert(result.acknowledgmentSent === true, "acknowledgmentSent must be true");
  console.assert(result.acknowledgmentText === ackText, `ackText mismatch: "${result.acknowledgmentText}"`);
  console.assert(typeof result.memoText === "string" && result.memoText.length > 0, "memoText must be non-empty");
  console.assert(calledCreateOutbound, "createSpruceOutboundMessage must have been called");
  console.assert(calledCreateMessage, "createSpruceMessage must have been called (inbox mirror)");
  console.assert(calledUpsertConvState, "upsertSpruceConversationState must have been called");
  console.assert(calledUpdateWorkflowRequest, "updateSpruceWorkflowRequestJune must have been called");
  console.log("✓ test_pipelineAcknowledgesWhenEnabled passed");
}

// ── Test 7: Acknowledgment uses template fallback when OpenAI fails ───────

async function test_acknowledgmentFallbackOnOpenAIFailure() {
  const ackText = await generateJuneAcknowledgment(
    makeThrowingOpenAI(),
    "medication_refill",
    "I need a refill on my metformin",
    "John Smith",
    false,
  );

  console.assert(
    typeof ackText === "string" && ackText.length >= 20,
    `❌ test_acknowledgmentFallbackOnOpenAIFailure FAILED — expected fallback text, got: "${ackText}"`,
  );
  console.log("✓ test_acknowledgmentFallbackOnOpenAIFailure passed");
}

// ── Test 8: Memo uses fallback template when OpenAI fails ─────────────────

async function test_memoFallbackOnOpenAIFailure() {
  const memoText = await generateJuneMemo(makeThrowingOpenAI(), {
    workflow: "medication_refill",
    messageBody: "I need a refill on my testosterone please",
    patientName: "Alice Smith",
    patientId: 7,
    patientPhone: "+15550009999",
    conversationKey: "t_conv999",
    spruceConversationUrl: "https://app.sprucehealth.com/conversations/t_conv999",
    juneAckText: "Thanks, I'll get this to the care team.",
  });

  console.assert(
    typeof memoText === "string" && memoText.length > 0,
    `❌ test_memoFallbackOnOpenAIFailure — expected fallback memo, got: "${memoText}"`,
  );
  console.assert(
    memoText.includes("PATIENT"),
    `❌ Fallback memo missing PATIENT section: "${memoText.slice(0, 100)}"`,
  );
  console.log("✓ test_memoFallbackOnOpenAIFailure passed");
}

// ── Test 9: Gate — turn limit blocks June ─────────────────────────────────

async function test_gateTurnLimitExceeded() {
  const workflowSetting = makeWorkflowSetting({ allowAcknowledgment: true, maxJuneTurns: 2 });
  const skipReason = await shouldJuneAcknowledge(
    makePipelineInput(),
    workflowSetting,
    2,
  );
  console.assert(
    skipReason !== null && skipReason.includes("turn limit"),
    `❌ test_gateTurnLimitExceeded FAILED — got: ${skipReason}`,
  );
  console.log("✓ test_gateTurnLimitExceeded passed");
}

// ── Test 10: Gate — low confidence blocks June ────────────────────────────

async function test_gateLowConfidenceBlocked() {
  const workflowSetting = makeWorkflowSetting({ allowAcknowledgment: true });
  const skipReason = await shouldJuneAcknowledge(
    makePipelineInput({ classification: { workflow: "medication_refill", confidence: "low" } }),
    workflowSetting,
    0,
  );
  console.assert(
    skipReason !== null && skipReason.includes("confidence"),
    `❌ test_gateLowConfidenceBlocked FAILED — got: ${skipReason}`,
  );
  console.log("✓ test_gateLowConfidenceBlocked passed");
}

// ── Test 11: extractWorkflowFields parses known fields correctly ──────────

async function test_extractWorkflowFields_parsesKnownFields() {
  const mockJson = JSON.stringify({
    confidence: "high",
    fields: {
      medication: "testosterone",
      dose: "200mg/mL",
      frequency: null,
      pharmacy: "Walgreens",
      amountRemaining: null,
      sideEffects: null,
    },
  });

  const openaiClient = makeMockOpenAI(mockJson);
  const result = await extractWorkflowFields(
    openaiClient,
    "medication_refill",
    "I need a refill on testosterone 200mg/mL at Walgreens",
  );

  console.assert(result !== null, "❌ test_extractWorkflowFields_parsesKnownFields — expected non-null result");
  console.assert(result!.confidence === "high", `❌ expected confidence=high, got ${result!.confidence}`);
  console.assert(result!.fields.medication === "testosterone", `❌ expected medication=testosterone, got ${result!.fields.medication}`);
  console.assert(result!.fields.pharmacy === "Walgreens", `❌ expected pharmacy=Walgreens, got ${result!.fields.pharmacy}`);
  console.assert(result!.missingFields.includes("dose") === false, "dose was provided — must not appear in missingFields");
  console.assert(result!.missingFields.includes("amountRemaining") === true, "amountRemaining is null — must appear in missingFields");
  console.assert(result!.missingFields.includes("pharmacy") === false, "pharmacy was provided — must not appear in missingFields");
  console.assert(result!.collectedSummary.includes("testosterone"), `❌ collectedSummary missing medication: "${result!.collectedSummary}"`);
  console.log("✓ test_extractWorkflowFields_parsesKnownFields passed");
}

// ── Test 12: extractWorkflowFields returns null safely on OpenAI failure ──

async function test_extractWorkflowFields_fallbackOnFailure() {
  const result = await extractWorkflowFields(
    makeThrowingOpenAI(),
    "medication_refill",
    "I need a refill",
  );
  console.assert(result === null, `❌ test_extractWorkflowFields_fallbackOnFailure — expected null, got ${JSON.stringify(result)}`);
  console.log("✓ test_extractWorkflowFields_fallbackOnFailure passed");
}

// ── Test 13: extractWorkflowFields returns null for workflows with no defs

async function test_extractWorkflowFields_nullForUnclassified() {
  const openaiClient = makeMockOpenAI('{"confidence":"low","fields":{}}');
  const result = await extractWorkflowFields(openaiClient, "unclassified", "hello");
  console.assert(result === null, `❌ test_extractWorkflowFields_nullForUnclassified — expected null for unclassified, got ${JSON.stringify(result)}`);
  console.log("✓ test_extractWorkflowFields_nullForUnclassified passed");
}

// ── Test 14: Acknowledgment fallback uses extracted medication name ────────
// When OpenAI fails for the ack but extraction provided a medication name,
// the fallback ack should still mention the medication (not generic).

async function test_acknowledgmentFallbackUsesExtractedMedication() {
  const extracted = {
    workflow: "medication_refill",
    confidence: "high" as const,
    fields: { medication: "progesterone", dose: "100mg", frequency: null, pharmacy: null, amountRemaining: null, sideEffects: null },
    missingFields: ["pharmacy", "frequency", "amountRemaining", "sideEffects"],
    collectedSummary: "medication: progesterone; dose: 100mg",
  };

  // OpenAI throws for the ack call — forces buildFallbackAck path
  const ackText = await generateJuneAcknowledgment(
    makeThrowingOpenAI(),
    "medication_refill",
    "I need a refill on progesterone 100mg",
    "Susan Lee",
    true,
    extracted,
  );

  console.assert(
    typeof ackText === "string" && ackText.length > 0,
    `❌ test_acknowledgmentFallbackUsesExtractedMedication — empty ack`,
  );
  console.assert(
    ackText.toLowerCase().includes("progesterone"),
    `❌ Fallback ack should mention progesterone. Got: "${ackText}"`,
  );
  console.assert(
    ackText.toLowerCase().includes("pharmacy"),
    `❌ Fallback ack should ask about pharmacy (it's missing). Got: "${ackText}"`,
  );
  console.log("✓ test_acknowledgmentFallbackUsesExtractedMedication passed");
}

// ── Test 15: Memo fallback includes extracted collected/missing fields ─────

async function test_memoFallbackIncludesExtractedFields() {
  const extracted = {
    workflow: "medication_refill",
    confidence: "medium" as const,
    fields: { medication: "semaglutide", dose: null, frequency: null, pharmacy: "Madison Pharmacy", amountRemaining: "out", sideEffects: null },
    missingFields: ["dose", "frequency", "sideEffects"],
    collectedSummary: "medication: semaglutide; pharmacy: Madison Pharmacy; amountRemaining: out",
  };

  const memoText = await generateJuneMemo(makeThrowingOpenAI(), {
    workflow: "medication_refill",
    messageBody: "I'm out of semaglutide and use Madison Pharmacy",
    patientName: "Bob Johnson",
    patientId: 12,
    patientPhone: "+15550001111",
    conversationKey: "t_conv555",
    spruceConversationUrl: null,
    juneAckText: "Got it — I'll flag this for the care team.",
    extractedFields: extracted,
  });

  console.assert(typeof memoText === "string" && memoText.includes("PATIENT"), `❌ Missing PATIENT section`);
  console.assert(memoText.includes("semaglutide"), `❌ Memo fallback should include semaglutide. Got: "${memoText.slice(0, 200)}"`);
  console.assert(memoText.includes("Madison Pharmacy"), `❌ Memo fallback should include Madison Pharmacy`);
  console.assert(memoText.toLowerCase().includes("dose"), `❌ Memo fallback should list dose in missing fields`);
  console.log("✓ test_memoFallbackIncludesExtractedFields passed");
}

// ── Test 16: Pipeline exposes extractedFields in result ───────────────────

async function test_pipelineExposesExtractedFields() {
  const extractJson = JSON.stringify({
    confidence: "high",
    fields: { medication: "testosterone", dose: null, frequency: null, pharmacy: "CVS", amountRemaining: null, sideEffects: null },
  });
  const ackText = "I'll get that testosterone refill request to the care team.";
  const memoText = "PATIENT: Jane Doe | WORKFLOW: medication_refill";

  const openaiClient = makeMockOpenAI(extractJson, ackText, memoText);
  const result = await runJunePipeline(makePipelineInput({ openaiClient }));

  console.assert(result.skipped === false, `expected skipped=false`);
  console.assert(result.extractedFields !== null && result.extractedFields !== undefined, "extractedFields must be present in pipeline result");
  console.assert(result.extractedFields!.fields.medication === "testosterone", `❌ extractedFields.medication mismatch`);
  console.assert(result.extractedFields!.fields.pharmacy === "CVS", `❌ extractedFields.pharmacy mismatch`);
  console.log("✓ test_pipelineExposesExtractedFields passed");
}

// ── Runner ────────────────────────────────────────────────────────────────

async function run() {
  let failed = 0;
  const tests = [
    test_gateMasterSwitchOff,
    test_gateWorkflowSwitchOff,
    test_gateStaffTakeover,
    test_gateAllClear,
    test_pipelineSkipsWhenDisabled,
    test_pipelineAcknowledgesWhenEnabled,
    test_acknowledgmentFallbackOnOpenAIFailure,
    test_memoFallbackOnOpenAIFailure,
    test_gateTurnLimitExceeded,
    test_gateLowConfidenceBlocked,
    test_extractWorkflowFields_parsesKnownFields,
    test_extractWorkflowFields_fallbackOnFailure,
    test_extractWorkflowFields_nullForUnclassified,
    test_acknowledgmentFallbackUsesExtractedMedication,
    test_memoFallbackIncludesExtractedFields,
    test_pipelineExposesExtractedFields,
  ];

  for (const t of tests) {
    try {
      await t();
    } catch (err: any) {
      console.error(`❌ ${t.name} THREW:`, err?.message ?? err);
      failed++;
    }
  }

  console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
  if (failed > 0) process.exit(1);
}

run();
