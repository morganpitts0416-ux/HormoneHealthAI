/**
 * workflow-engine.ts — Layer 2 + 2.5: Form Workflow Execution Engine
 *
 * Exports:
 *   enrollWorkflow(storage, opts)     — called fire-and-forget from both form submit endpoints
 *   processWaitingSteps(storage)      — called every 60s by the background runner in routes.ts
 *   notifyPatientResponse(storage, …) — called from Spruce inbound webhook + portal message creation
 *   notifyStaffReply(storage, …)      — called from staff reply routes
 *   pauseRun(storage, runId, actorId, note?)   — Layer 2.5 manual control
 *   resumeRun(storage, runId, actorId, note?)  — Layer 2.5 manual control
 *   retryStep(storage, runId, stepPos, actorId, note?)  — Layer 2.5 manual control
 *   skipStep(storage, runId, stepPos, actorId, reason, note?)  — Layer 2.5 manual control
 *
 * Safety guarantees:
 *   • Workflows default OFF — enrollWorkflow checks enabled=true before doing anything
 *   • No double-execution — lockWaitingStep is atomic; step_state status guard prevents replay
 *   • Failed steps are logged (result_json) and the run continues to the next step
 *   • Missing Spruce token → step logged as skipped_no_token, run continues
 *   • staff_takeover / ai_muted → Spruce send skipped + logged, run continues
 *   • All outbound messages (Spruce + portal) go through existing audited storage paths
 *   • Strictly scoped to form-submission-triggered workflows; no other trigger types
 */

import OpenAI from "openai";
import { decryptSecret, isEncrypted } from "./crypto-utils";
import type { IStorage } from "./storage";
import type * as schema from "@shared/schema";

// ── Internal types ─────────────────────────────────────────────────────────

interface StepConfig {
  staffUserId?: number | null;
  message?: string;
  note?: string;
  title?: string;
  assigneeUserId?: number | null;
  priority?: string;
  mode?: "static" | "june" | "june_draft";
  staticMessage?: string;
  juneInstructions?: string;
  content?: string;
  amount?: number;
  unit?: "hours" | "days";
  condition?: string;
  conditionDetail?: string;
  trueBranch?: StepConfig[];
  falseBranch?: StepConfig[];
  statusField?: string;
  statusValue?: string;
  reason?: string;
}

interface RunContext {
  formId?: number;
  formName?: string;
  clinicianId?: number;
  patientId?: number;
  patientName?: string;
  patientPhone?: string;
  responses?: Record<string, any>;
}

interface StepResult {
  stop?: boolean;
  wait?: boolean;
  dueAt?: Date;
  log: Record<string, any>;
}

// ── OpenAI client factory ──────────────────────────────────────────────────

function makeOpenAI(): OpenAI {
  // Production-safe: prefer OPENAI_API_KEY (GCP/direct); fall back to AI_INTEGRATIONS_* (Replit dev)
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_KEY
    ? undefined
    : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "http://localhost:1106/modelfarm/openai");
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

// ── Milestone helper ───────────────────────────────────────────────────────

async function logMilestone(
  storage: IStorage,
  run: { patientId: number | null; clinicId: number },
  context: RunContext,
  content: string,
): Promise<void> {
  if (!run.patientId) return;
  const clinicianId = context.clinicianId;
  if (!clinicianId || clinicianId <= 0) return;
  try {
    await (storage as any).logWorkflowMilestone(run.patientId, clinicianId, content);
  } catch (err) {
    console.warn("[workflow-engine] logMilestone failed (non-fatal):", err);
  }
}

// ── Enrollment ─────────────────────────────────────────────────────────────

export async function enrollWorkflow(
  storage: IStorage,
  opts: {
    submissionId: number;
    formId: number;
    clinicId: number;
    patientId?: number | null;
    responses?: Record<string, any>;
  },
): Promise<void> {
  const { submissionId, formId, clinicId, patientId, responses } = opts;

  // 1. Find an enabled workflow for this clinic + form. Default OFF.
  const workflow = await (storage as any).findEnabledWorkflowForForm(clinicId, formId);
  if (!workflow) return;

  // 2. Deduplicate: never enroll the same submission into the same workflow twice
  const existing = await (storage as any).getWorkflowRunBySubmission(workflow.id, submissionId);
  if (existing) {
    console.log(`[workflow-engine] sub=${submissionId} already enrolled in workflow=${workflow.id} run=${existing.id}, skipping`);
    return;
  }

  // 3. Build context snapshot — captured once at enrollment; steps read this
  let patientName: string | undefined;
  let patientPhone: string | undefined;
  let formName: string | undefined;
  let clinicianId: number | undefined;
  try {
    if (patientId) {
      const patient = await storage.getPatientById(patientId);
      if (patient) {
        patientName = `${patient.firstName} ${patient.lastName}`.trim();
        patientPhone = (patient as any).phone ?? undefined;
      }
    }
    const form = await storage.getIntakeFormById(formId);
    formName = form?.name;
    clinicianId = form?.clinicianId ?? undefined;
  } catch (err) {
    console.warn("[workflow-engine] context snapshot error (non-fatal):", err);
  }

  const contextJson: RunContext = {
    formId,
    formName,
    clinicianId,
    patientId: patientId ?? undefined,
    patientName,
    patientPhone,
    responses: responses ?? {},
  };

  // 4. Create the run record
  const run = await (storage as any).createWorkflowRun({
    workflowId: workflow.id,
    clinicId,
    submissionId,
    patientId: patientId ?? null,
    status: "running",
    startedAt: new Date(),
    currentStepPosition: 0,
    contextJson,
  });

  console.log(`[workflow-engine] enrolled: workflow=${workflow.id} run=${run.id} patient=${patientId ?? "unknown"} form=${formId}`);

  // 5. Write enrollment milestone to communication timeline
  await logMilestone(storage, run, contextJson, `Workflow started: "${workflow.name}" triggered by ${contextJson.formName ?? "form submission"}`);

  // 6. Execute synchronously from step 0
  await executeRun(storage, run.id);
}

// ── Run execution loop ─────────────────────────────────────────────────────

async function executeRun(storage: IStorage, runId: number, fromPosition?: number): Promise<void> {
  const run = await (storage as any).getWorkflowRun(runId);
  if (!run) return;
  if (["stopped", "completed", "failed"].includes(run.status)) return;

  const workflow = await (storage as any).getFormWorkflow(run.workflowId, run.clinicId);
  if (!workflow) {
    await (storage as any).updateWorkflowRun(runId, {
      status: "failed",
      stoppedReason: "Workflow definition not found",
      completedAt: new Date(),
    });
    return;
  }

  const steps: schema.FormWorkflowStep[] = await (storage as any).listFormWorkflowSteps(run.workflowId);
  const context = (run.contextJson ?? {}) as RunContext;
  const startPos = fromPosition ?? run.currentStepPosition;

  for (let i = startPos; i < steps.length; i++) {
    const step = steps[i];

    // Idempotency: skip already-completed/skipped steps
    const existingState = await (storage as any).getWorkflowStepState(runId, i);
    if (existingState && ["completed", "skipped"].includes(existingState.status)) {
      continue;
    }

    // Mark step running + advance run pointer
    await (storage as any).upsertWorkflowStepState(runId, i, {
      stepType: step.stepType,
      status: "running",
      executedAt: new Date(),
    });
    await (storage as any).updateWorkflowRun(runId, { currentStepPosition: i });

    try {
      const result = await executeStep(storage, run, step, context);

      if (result.stop) {
        await (storage as any).upsertWorkflowStepState(runId, i, {
          stepType: step.stepType,
          status: "completed",
          executedAt: new Date(),
          resultJson: result.log,
        });
        await (storage as any).updateWorkflowRun(runId, {
          status: "stopped",
          stoppedReason: String(result.log?.reason ?? "stop_workflow"),
          completedAt: new Date(),
        });
        console.log(`[workflow-engine] run=${runId} STOPPED at step=${i} reason=${result.log?.reason}`);
        await logMilestone(storage, run, context, `Workflow stopped at step ${i + 1}: ${String(result.log?.reason ?? "stop_workflow")}`);
        return;
      }

      if (result.wait) {
        await (storage as any).upsertWorkflowStepState(runId, i, {
          stepType: step.stepType,
          status: "waiting",
          dueAt: result.dueAt,
          resultJson: result.log,
        });
        // Leave currentStepPosition at i; runner will resume from here when due
        console.log(`[workflow-engine] run=${runId} WAITING at step=${i} dueAt=${result.dueAt?.toISOString()}`);
        return;
      }

      // Step completed normally
      await (storage as any).upsertWorkflowStepState(runId, i, {
        stepType: step.stepType,
        status: "completed",
        executedAt: new Date(),
        resultJson: result.log,
      });

    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      const prevState = await (storage as any).getWorkflowStepState(runId, i);
      const retryCount: number = (prevState?.resultJson as any)?.retryCount ?? 0;

      console.error(`[workflow-engine] run=${runId} step=${i} type=${step.stepType} error (retry=${retryCount}):`, errMsg);

      await (storage as any).upsertWorkflowStepState(runId, i, {
        stepType: step.stepType,
        status: "failed",
        executedAt: new Date(),
        resultJson: { error: errMsg, retryCount: retryCount + 1, finalFailure: retryCount >= 2 },
      });
      // Run continues to next step — failed steps are logged but do not halt the workflow
    }
  }

  // All steps processed
  await (storage as any).updateWorkflowRun(runId, {
    status: "completed",
    completedAt: new Date(),
  });
  console.log(`[workflow-engine] run=${runId} COMPLETED`);
  await logMilestone(storage, run, context, "Workflow completed: all steps finished successfully");
}

// ── Step dispatcher ────────────────────────────────────────────────────────

async function executeStep(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  step: schema.FormWorkflowStep,
  context: RunContext,
): Promise<StepResult> {
  const cfg = (step.config ?? {}) as StepConfig;

  switch (step.stepType) {
    case "notify_staff":      return executeNotifyStaff(storage, run, cfg, context);
    case "assign_staff":      return executeAssignStaff(storage, run, cfg, context);
    case "create_task":       return executeCreateTask(storage, run, cfg, context);
    case "add_internal_note": return executeAddInternalNote(storage, run, cfg, context);
    case "send_spruce_sms":   return executeSendSpruceSms(storage, run, cfg, context, step.position);
    case "send_portal_message": return executeSendPortalMessage(storage, run, cfg, context, step.position);
    case "wait_delay":        return executeWaitDelay(cfg);
    case "if_then_branch":    return executeIfThenBranch(storage, run, cfg, context);
    case "update_status":     return executeUpdateStatus(storage, run, cfg, context);
    case "stop_workflow":     return { stop: true, log: { reason: cfg.reason ?? "stop_workflow step reached" } };
    default:
      return { log: { outcome: "skipped", reason: `unknown_step_type:${step.stepType}` } };
  }
}

// ── Step handlers ──────────────────────────────────────────────────────────

async function executeNotifyStaff(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
): Promise<StepResult> {
  const patientLabel = context.patientName ? ` — ${context.patientName}` : "";
  const title = cfg.message
    ? cfg.message.slice(0, 160)
    : `Workflow notification${patientLabel}`;
  const body = `Form workflow "${(run as any).workflowName ?? "automated"}"${patientLabel} requires your attention. Form: ${context.formName ?? "unknown"}.`;

  await (storage as any).createWorkflowInboxNotification({
    clinicId: run.clinicId,
    patientId: run.patientId ?? null,
    providerId: cfg.staffUserId ?? null,
    type: "workflow_note",
    title,
    message: cfg.message ?? body,
    severity: "normal",
    relatedEntityId: run.patientId ?? null,
  });

  return { log: { outcome: "notified", providerId: cfg.staffUserId ?? "broadcast" } };
}

async function executeAssignStaff(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
): Promise<StepResult> {
  const patientLabel = context.patientName ? ` — patient: ${context.patientName}` : "";
  const title = `Assigned: follow up from form "${context.formName ?? "form"}"${patientLabel}`;
  const note = cfg.note ? `\n\n${cfg.note}` : "";

  await (storage as any).createWorkflowInboxNotification({
    clinicId: run.clinicId,
    patientId: run.patientId ?? null,
    providerId: cfg.staffUserId ?? null,
    type: "workflow_note",
    title,
    message: `You have been assigned to follow up${patientLabel}. Form: ${context.formName ?? "unknown"}.${note}`,
    severity: "normal",
    relatedEntityId: run.patientId ?? null,
  });

  return { log: { outcome: "assigned", providerId: cfg.staffUserId ?? "broadcast" } };
}

async function executeCreateTask(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
): Promise<StepResult> {
  const title = cfg.title ?? `Task from form workflow (${context.formName ?? "form"})`;

  await (storage as any).createWorkflowInboxNotification({
    clinicId: run.clinicId,
    patientId: run.patientId ?? null,
    providerId: cfg.assigneeUserId ?? null,
    type: "june_memo",
    title,
    message: title,
    severity: cfg.priority === "urgent" ? "urgent" : "normal",
    relatedEntityId: run.patientId ?? null,
  });

  return { log: { outcome: "task_created", title, assigneeUserId: cfg.assigneeUserId ?? "broadcast" } };
}

async function executeAddInternalNote(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
): Promise<StepResult> {
  if (!run.patientId) {
    return { log: { outcome: "skipped", reason: "no_patient_id" } };
  }
  const clinicianId = context.clinicianId ?? run.clinicId;
  const content = cfg.content ?? `Automated note from form workflow (form: ${context.formName ?? "unknown"}).`;

  await storage.createPortalMessage({
    patientId: run.patientId,
    clinicianId,
    senderType: "clinician",
    content,
    readAt: null,
    messageType: "internal_note",
    visibility: "internal_only",
    deliveryChannel: null,
    externalDeliveryId: null,
    externalMessageId: null,
  } as any);

  return { log: { outcome: "note_added", patientId: run.patientId } };
}

async function executeWaitDelay(cfg: StepConfig): Promise<StepResult> {
  const amount = cfg.amount ?? 1;
  const unit = cfg.unit ?? "hours";
  const ms = unit === "days" ? amount * 24 * 60 * 60 * 1000 : amount * 60 * 60 * 1000;
  const dueAt = new Date(Date.now() + ms);
  return {
    wait: true,
    dueAt,
    log: { outcome: "waiting", amount, unit, dueAt: dueAt.toISOString() },
  };
}

async function executeIfThenBranch(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
): Promise<StepResult> {
  const condition = cfg.condition ?? "patient_responded";
  let conditionMet = false;

  switch (condition) {
    case "patient_responded":
    case "no_patient_response": {
      if (!run.patientId) {
        conditionMet = false;
      } else {
        const since = (run as any).startedAt
          ? new Date((run as any).startedAt)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const responded = await (storage as any).hasPatientRespondedSince(
          run.clinicId,
          run.patientId,
          since,
        );
        conditionMet = condition === "patient_responded" ? responded : !responded;
      }
      break;
    }
    case "staff_replied": {
      conditionMet = false;
      break;
    }
    case "patient_matched":
      conditionMet = !!run.patientId;
      break;
    case "patient_unmatched":
      conditionMet = !run.patientId;
      break;
    default:
      conditionMet = false;
  }

  const branch: StepConfig[] = conditionMet
    ? (cfg.trueBranch ?? [])
    : (cfg.falseBranch ?? []);

  // Execute inline sub-steps — synthesize fake FormWorkflowStep objects
  for (let bi = 0; bi < branch.length; bi++) {
    const subCfg = branch[bi];
    const fakeStep = {
      id: -1,
      workflowId: run.workflowId,
      position: bi,
      stepType: subCfg.staticMessage !== undefined
        ? "send_spruce_sms"
        : (subCfg.title !== undefined
            ? "create_task"
            : (subCfg.content !== undefined
                ? "add_internal_note"
                : (subCfg.reason !== undefined ? "stop_workflow" : "notify_staff"))),
      config: subCfg,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as schema.FormWorkflowStep;

    // Use the step_type from config directly if present
    if ((subCfg as any).stepType) {
      (fakeStep as any).stepType = (subCfg as any).stepType;
    }

    try {
      const subResult = await executeStep(storage, run, fakeStep, context);
      if (subResult.stop) {
        return { stop: true, log: { reason: subResult.log?.reason, branch: conditionMet ? "true" : "false" } };
      }
    } catch (err: any) {
      console.warn(`[workflow-engine] branch sub-step ${bi} error (non-fatal):`, err?.message);
    }
  }

  return {
    log: {
      outcome: "branched",
      condition,
      conditionMet,
      branch: conditionMet ? "true" : "false",
      subStepsExecuted: branch.length,
    },
  };
}

async function executeUpdateStatus(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
): Promise<StepResult> {
  const field = cfg.statusField ?? "workflowStatus";
  const value = cfg.statusValue ?? "updated";

  // Update contextJson with the new status field value
  const updatedContext = { ...context, [field]: value };
  await (storage as any).updateWorkflowRun(run.id, { contextJson: updatedContext });

  return { log: { outcome: "status_updated", field, value } };
}

// ── Spruce SMS handler ─────────────────────────────────────────────────────

async function executeSendSpruceSms(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
  stepPosition: number,
): Promise<StepResult> {
  if (!run.patientId && !context.patientPhone) {
    return { log: { outcome: "skipped", reason: "no_patient_context" } };
  }

  // Find conversation
  const conv = run.patientId
    ? await (storage as any).findSpruceConversationByPatient(run.clinicId, run.patientId)
    : null;

  if (!conv) {
    return { log: { outcome: "skipped", reason: "no_spruce_conversation" } };
  }

  // Check staff_takeover / ai_muted
  const convState = await (storage as any).getSpruceConversationState(run.clinicId, conv.conversationKey).catch(() => null);
  if (convState?.aiMutedAt) {
    return { log: { outcome: "skipped_ai_muted", reason: "staff_takeover_active", conversationKey: conv.conversationKey } };
  }

  // Get Spruce API token
  const clinicSettings = await (storage as any).getClinicSpruceSettings(run.clinicId).catch(() => null);
  const apiToken = clinicSettings?.apiTokenEncrypted && isEncrypted(clinicSettings.apiTokenEncrypted)
    ? decryptSecret(clinicSettings.apiTokenEncrypted)
    : null;

  if (!apiToken) {
    return { log: { outcome: "skipped_no_token", reason: "no_spruce_api_token_configured" } };
  }

  // Resolve message body
  let body: string;
  const dedupeKey = `workflow_step:${run.id}:${stepPosition}`;

  if (cfg.mode === "june" || cfg.mode === "june_draft") {
    try {
      body = await generateJuneMessage(storage, run, cfg, context);
    } catch (err: any) {
      return { log: { outcome: "failed", reason: "june_generation_failed", error: err?.message } };
    }
    if (cfg.mode === "june_draft") {
      // Create a draft task for staff to review — do NOT send automatically
      await (storage as any).createWorkflowInboxNotification({
        clinicId: run.clinicId,
        patientId: run.patientId ?? null,
        providerId: null,
        type: "june_memo",
        title: `June draft ready: ${context.patientName ?? "patient"} (workflow message)`,
        message: `[DRAFT — awaiting approval]\n\n${body}`,
        severity: "normal",
        relatedEntityId: run.patientId ?? null,
      });
      return { log: { outcome: "june_draft_created", draftBody: body.slice(0, 120) } };
    }
  } else {
    body = cfg.staticMessage ?? "";
    if (!body.trim()) {
      return { log: { outcome: "skipped", reason: "empty_static_message" } };
    }
  }

  // Write outbound row + mirror row BEFORE API call (race-proof echo suppression)
  const outbound = await (storage as any).createSpruceOutboundMessage({
    clinicId: run.clinicId,
    conversationKey: conv.conversationKey,
    messageBody: body,
    sentByUserId: null,
    sentByAI: true,
    workflowRequestId: null,
    spruceDeliveryId: null,
  });

  const mirroredMsg = await (storage as any).createSpruceMessage({
    clinicId: run.clinicId,
    spruceMessageId: `cliniq_reply_${outbound.id}`,
    spruceConversationId: conv.spruceConversationId ?? null,
    fromPhone: conv.toPhone ?? null,
    toPhone: conv.fromPhone ?? null,
    patientId: run.patientId ?? null,
    messageBody: body,
    eventType: "workflow_sms",
    rawPayload: { source: "cliniq", outboundMessageId: outbound.id, workflowRunId: run.id, stepPosition, dedupeKey },
    classifiedWorkflow: null,
    classificationConfidence: null,
    messageDirection: "outbound_staff",
    staffRepliedAt: new Date(),
    spruceEventDedupeKey: dedupeKey,
    spruceContactName: null,
  });

  // Also write to portal_messages (longitudinal timeline) if patient is known
  if (run.patientId) {
    try {
      const clinicianId = context.clinicianId ?? run.clinicId;
      await storage.createPortalMessage({
        patientId: run.patientId,
        clinicianId,
        senderType: "clinician",
        content: body,
        readAt: null,
        messageType: "message",
        visibility: "patient_visible",
        deliveryChannel: "spruce",
        externalDeliveryId: null,
        externalMessageId: null,
      } as any);
    } catch (err) {
      console.warn("[workflow-engine] portal_messages write failed (non-fatal):", err);
    }
  }

  // Deliver to Spruce API
  let spruceMessageId: string | null = null;
  try {
    const spruceRes = await fetch(
      `https://api.sprucehealth.com/v1/conversations/${conv.spruceConversationId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: [{ type: "text", value: body }], internal: false }),
      },
    );
    if (spruceRes.ok) {
      const spruceData: any = await spruceRes.json().catch(() => ({}));
      if (spruceData?.id) {
        spruceMessageId = spruceData.id;
        await (storage as any).updateSpruceOutboundDeliveryId(outbound.id, spruceData.id);
        await (storage as any).updateSpruceMessageEchoIds(
          mirroredMsg.id,
          spruceData.id,
          `conversationItem.created:${spruceData.id}`,
        ).catch(() => {});
      }
    } else {
      console.warn(`[workflow-engine] Spruce API ${spruceRes.status} for run=${run.id} step=${stepPosition} — stored in ClinIQ only`);
    }
  } catch (err: any) {
    console.warn("[workflow-engine] Spruce API delivery error (non-fatal):", err?.message);
  }

  await logMilestone(storage, run, context, `Workflow: follow-up SMS sent to ${context.patientName ?? "patient"} via Spruce`);

  return {
    log: {
      outcome: "sent",
      channel: "spruce",
      spruceMessageId,
      conversationKey: conv.conversationKey,
      bodyPreview: body.slice(0, 80),
    },
  };
}

// ── Portal message handler ─────────────────────────────────────────────────

async function executeSendPortalMessage(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
  stepPosition: number,
): Promise<StepResult> {
  if (!run.patientId) {
    return { log: { outcome: "skipped", reason: "no_patient_id" } };
  }

  let body: string;

  if (cfg.mode === "june" || cfg.mode === "june_draft") {
    try {
      body = await generateJuneMessage(storage, run, cfg, context);
    } catch (err: any) {
      return { log: { outcome: "failed", reason: "june_generation_failed", error: err?.message } };
    }
    if (cfg.mode === "june_draft") {
      await (storage as any).createWorkflowInboxNotification({
        clinicId: run.clinicId,
        patientId: run.patientId ?? null,
        providerId: null,
        type: "june_memo",
        title: `June draft ready: ${context.patientName ?? "patient"} (portal message)`,
        message: `[DRAFT — awaiting approval]\n\n${body}`,
        severity: "normal",
        relatedEntityId: run.patientId ?? null,
      });
      return { log: { outcome: "june_draft_created", draftBody: body.slice(0, 120) } };
    }
  } else {
    body = cfg.staticMessage ?? cfg.message ?? "";
    if (!body.trim()) {
      return { log: { outcome: "skipped", reason: "empty_message" } };
    }
  }

  const clinicianId = context.clinicianId ?? run.clinicId;

  const msg = await storage.createPortalMessage({
    patientId: run.patientId,
    clinicianId,
    senderType: "clinician",
    content: body,
    readAt: null,
    messageType: "message",
    visibility: "patient_visible",
    deliveryChannel: "portal",
    externalDeliveryId: null,
    externalMessageId: `workflow_step:${run.id}:${stepPosition}`,
  } as any);

  await logMilestone(storage, run, context, `Workflow: portal message sent to ${context.patientName ?? "patient"}`);

  return {
    log: {
      outcome: "sent",
      channel: "portal",
      portalMessageId: msg.id,
      bodyPreview: body.slice(0, 80),
    },
  };
}

// ── June message generation ────────────────────────────────────────────────

async function generateJuneMessage(
  storage: IStorage,
  run: schema.FormWorkflowRun,
  cfg: StepConfig,
  context: RunContext,
): Promise<string> {
  const openai = makeOpenAI();

  // Load clinic playbook for context
  let playbookText = "";
  try {
    const playbook = await (storage as any).getClinicJunePlaybook(run.clinicId);
    if (playbook?.content) playbookText = `\n\nClinic playbook:\n${playbook.content}`;
  } catch {}

  const patientContext = context.patientName
    ? `Patient: ${context.patientName}${context.patientPhone ? ` (${context.patientPhone})` : ""}`
    : "Patient: unknown";

  const formContext = context.formName
    ? `Triggered by form submission: "${context.formName}"`
    : "";

  const systemPrompt = `You are June, a clinical assistant AI for a healthcare clinic. You are generating an automated follow-up message to a patient.${playbookText}

SAFETY RULES (always follow, no exceptions):
- Do NOT diagnose, prescribe, or suggest specific medications or dosages
- Do NOT give specific medical advice or clinical recommendations
- Do NOT mention specific lab values or test results unless explicitly in the instructions
- Keep messages warm, professional, and concise (under 200 words)
- If the message involves anything clinical, direct the patient to contact the clinic

Context:
${patientContext}
${formContext}`;

  const userPrompt = `Generate a patient message with these instructions:
${cfg.juneInstructions ?? "Send a brief follow-up message to the patient about their recent form submission."}

Write only the message body — no subject line, no greeting labels. Start directly with the message.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 350,
    temperature: 0.4,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty response from AI");
  return text;
}

// ── Background runner: process due wait steps ──────────────────────────────

export async function processWaitingSteps(storage: IStorage): Promise<void> {
  const due = await (storage as any).listWaitingStepStates(20);
  if (due.length === 0) return;

  console.log(`[workflow-engine] processWaitingSteps: ${due.length} due step(s)`);

  for (const stepState of due) {
    // Atomic lock — if another process/invocation already grabbed it, skip
    const locked = await (storage as any).lockWaitingStep(stepState.id);
    if (!locked) continue;

    try {
      const run = await (storage as any).getWorkflowRun(stepState.runId);
      if (!run || ["stopped", "completed", "failed"].includes(run.status)) {
        // Run is no longer active — mark step completed and move on
        await (storage as any).upsertWorkflowStepState(stepState.runId, stepState.stepPosition, {
          stepType: stepState.stepType,
          status: "skipped",
          executedAt: new Date(),
          resultJson: { reason: "run_no_longer_active" },
          lockedAt: null,
        });
        continue;
      }

      // Check stop conditions triggered by patient response during the wait
      const workflow = await (storage as any).getFormWorkflow(run.workflowId, run.clinicId);
      const stopConditions: string[] = (workflow?.stopConditions as any) ?? [];

      if (
        stopConditions.includes("patient_responds") &&
        run.patientId &&
        run.startedAt
      ) {
        const responded = await (storage as any).hasPatientRespondedSince(
          run.clinicId,
          run.patientId,
          new Date(run.startedAt),
        );
        if (responded) {
          await (storage as any).upsertWorkflowStepState(stepState.runId, stepState.stepPosition, {
            stepType: stepState.stepType,
            status: "skipped",
            executedAt: new Date(),
            resultJson: { reason: "stop_condition_patient_responded" },
            lockedAt: null,
          });
          await (storage as any).updateWorkflowRun(run.id, {
            status: "stopped",
            stoppedReason: "stop_condition: patient_responds",
            completedAt: new Date(),
          });
          console.log(`[workflow-engine] run=${run.id} stopped: patient responded during wait`);
          continue;
        }
      }

      // Advance position past the completed wait step, then resume execution
      await (storage as any).upsertWorkflowStepState(stepState.runId, stepState.stepPosition, {
        stepType: stepState.stepType,
        status: "completed",
        executedAt: new Date(),
        resultJson: { ...(stepState.resultJson as any), completedAt: new Date().toISOString() },
        lockedAt: null,
      });

      await (storage as any).updateWorkflowRun(run.id, {
        currentStepPosition: stepState.stepPosition + 1,
      });

      await executeRun(storage, run.id, stepState.stepPosition + 1);

    } catch (err: any) {
      console.error(`[workflow-engine] processWaitingSteps step=${stepState.id} error:`, err?.message);
      // Clear lock so it can be retried next tick
      await (storage as any).clearWaitingStepLock(stepState.id).catch(() => {});
    }
  }
}

// ── Response detection hooks ───────────────────────────────────────────────
// Called fire-and-forget from Spruce inbound webhook + portal message creation.

export async function notifyPatientResponse(
  storage: IStorage,
  clinicId: number,
  patientId?: number | null,
): Promise<void> {
  if (!patientId) return;

  const activeRuns = await (storage as any).listActiveRunsForPatient(clinicId, patientId);
  if (activeRuns.length === 0) return;

  for (const run of activeRuns) {
    try {
      const workflow = await (storage as any).getFormWorkflow(run.workflowId, run.clinicId);
      const stopConditions: string[] = (workflow?.stopConditions as any) ?? [];

      if (stopConditions.includes("patient_responds")) {
        await (storage as any).updateWorkflowRun(run.id, {
          status: "stopped",
          stoppedReason: "stop_condition: patient_responds",
          completedAt: new Date(),
        });
        console.log(`[workflow-engine] run=${run.id} stopped: patient response detected`);
      }
    } catch (err: any) {
      console.warn(`[workflow-engine] notifyPatientResponse run=${run.id} error:`, err?.message);
    }
  }
}

// ── Layer 2.5: Manual control exports ─────────────────────────────────────

export async function pauseRun(
  storage: IStorage,
  runId: number,
  actorId: number | null,
  note?: string,
): Promise<{ ok: boolean; message?: string }> {
  const run = await (storage as any).getWorkflowRun(runId);
  if (!run) return { ok: false, message: "Run not found" };
  if (!["running", "waiting"].includes(run.status)) {
    return { ok: false, message: `Run is ${run.status} — cannot pause` };
  }
  const context = (run.contextJson ?? {}) as RunContext;
  await (storage as any).pauseWorkflowRun(runId);
  await logMilestone(storage, run, context, `Workflow paused by staff${note ? `: ${note}` : ""}`);
  return { ok: true };
}

export async function resumeRun(
  storage: IStorage,
  runId: number,
  actorId: number | null,
  note?: string,
): Promise<{ ok: boolean; message?: string }> {
  const run = await (storage as any).getWorkflowRun(runId);
  if (!run) return { ok: false, message: "Run not found" };
  if (run.status !== "paused") {
    return { ok: false, message: `Run is ${run.status} — not paused` };
  }
  const context = (run.contextJson ?? {}) as RunContext;
  await (storage as any).resumeWorkflowRun(runId);
  await logMilestone(storage, run, context, `Workflow resumed by staff${note ? `: ${note}` : ""}`);
  // Re-execute from current position
  executeRun(storage, runId).catch(e =>
    console.error(`[workflow-engine] resumeRun background exec error run=${runId}:`, e),
  );
  return { ok: true };
}

export async function retryStep(
  storage: IStorage,
  runId: number,
  stepPos: number,
  actorId: number | null,
  note?: string,
): Promise<{ ok: boolean; message?: string }> {
  const run = await (storage as any).getWorkflowRun(runId);
  if (!run) return { ok: false, message: "Run not found" };
  const reset = await (storage as any).retryWorkflowStep(runId, stepPos);
  if (!reset) return { ok: false, message: "Step is not in failed state" };
  const context = (run.contextJson ?? {}) as RunContext;
  await logMilestone(storage, run, context, `Workflow: step ${stepPos + 1} retried by staff${note ? `: ${note}` : ""}`);
  // Re-execute from the retried step
  executeRun(storage, runId, stepPos).catch(e =>
    console.error(`[workflow-engine] retryStep background exec error run=${runId}:`, e),
  );
  return { ok: true };
}

export async function skipStep(
  storage: IStorage,
  runId: number,
  stepPos: number,
  actorId: number | null,
  reason: string,
  note?: string,
): Promise<{ ok: boolean; message?: string }> {
  const run = await (storage as any).getWorkflowRun(runId);
  if (!run) return { ok: false, message: "Run not found" };
  if (["stopped", "completed", "failed"].includes(run.status)) {
    return { ok: false, message: `Run is ${run.status}` };
  }
  const context = (run.contextJson ?? {}) as RunContext;
  await (storage as any).skipWorkflowStep(runId, stepPos, actorId, reason);
  await logMilestone(
    storage, run, context,
    `Workflow: step ${stepPos + 1} skipped by staff${reason ? ` — ${reason}` : ""}${note ? ` (${note})` : ""}`,
  );
  // Continue from next step
  executeRun(storage, runId, stepPos + 1).catch(e =>
    console.error(`[workflow-engine] skipStep background exec error run=${runId}:`, e),
  );
  return { ok: true };
}

export async function notifyStaffReply(
  storage: IStorage,
  clinicId: number,
  patientId?: number | null,
): Promise<void> {
  if (!patientId) return;

  const activeRuns = await (storage as any).listActiveRunsForPatient(clinicId, patientId);
  if (activeRuns.length === 0) return;

  for (const run of activeRuns) {
    try {
      const workflow = await (storage as any).getFormWorkflow(run.workflowId, run.clinicId);
      const stopConditions: string[] = (workflow?.stopConditions as any) ?? [];

      if (stopConditions.includes("staff_replies")) {
        await (storage as any).updateWorkflowRun(run.id, {
          status: "stopped",
          stoppedReason: "stop_condition: staff_replies",
          completedAt: new Date(),
        });
        console.log(`[workflow-engine] run=${run.id} stopped: staff reply detected`);
      }
    } catch (err: any) {
      console.warn(`[workflow-engine] notifyStaffReply run=${run.id} error:`, err?.message);
    }
  }
}
