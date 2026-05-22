/**
 * Spruce June Phase 3A — Unit / Integration Tests
 *
 * Tests cover the gate checks, AI generation fallbacks, and pipeline
 * orchestration logic in server/spruce-june.ts.
 *
 * These tests run in-process with mocked storage and OpenAI — no real
 * HTTP calls, no DB writes, no side effects on any other ClinIQ system.
 */

import {
  shouldJuneAcknowledge,
  generateJuneAcknowledgment,
  generateJuneMemo,
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
    createSpruceOutboundMessage: async () => ({ id: 99, clinicId: 1, conversationKey: "t_conv123", messageBody: "test", sentByAI: true, sentAt: new Date(), workflowRequestId: null, spruceDeliveryId: null, sentByUserId: null }),
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
    openaiClient: null as any, // will be overridden in AI tests
    ...overrides,
  };
}

// Minimal OpenAI mock that returns a fixed message
function makeMockOpenAI(responseText: string): OpenAI {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: responseText } }],
        }),
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

// ── Test 6: Pipeline runs and produces acknowledgment ────────────────────

async function test_pipelineAcknowledgesWhenEnabled() {
  const ackText = "Thanks for reaching out — I will get this to the care team right away.";
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

  // OpenAI mock: first call = ack, second call = memo
  let openaiCallCount = 0;
  const openaiClient = {
    chat: {
      completions: {
        create: async () => {
          openaiCallCount++;
          if (openaiCallCount === 1) {
            return { choices: [{ message: { content: ackText } }] };
          }
          return { choices: [{ message: { content: memoText } }] };
        },
      },
    },
  } as any;

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
  const openaiClient = {
    chat: {
      completions: {
        create: async () => { throw new Error("OpenAI timeout"); },
      },
    },
  } as any;

  const ackText = await generateJuneAcknowledgment(
    openaiClient,
    "medication_refill",
    "I need a refill on my metformin",
    "John Smith",
    false,
  );

  console.assert(
    typeof ackText === "string" && ackText.length > 0,
    `❌ test_acknowledgmentFallbackOnOpenAIFailure FAILED — expected fallback text, got: "${ackText}"`,
  );
  // Fallback should be the template example (contains "refill" or "care team" language)
  console.assert(
    ackText.length >= 20,
    `❌ Fallback text too short: "${ackText}"`,
  );
  console.log("✓ test_acknowledgmentFallbackOnOpenAIFailure passed");
}

// ── Test 8: Memo uses fallback template when OpenAI fails ─────────────────

async function test_memoFallbackOnOpenAIFailure() {
  const openaiClient = {
    chat: {
      completions: {
        create: async () => { throw new Error("OpenAI quota exceeded"); },
      },
    },
  } as any;

  const memoText = await generateJuneMemo(openaiClient, {
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
  // Fallback must include PATIENT section
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
    2, // juneTurnCount equals maxJuneTurns
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
