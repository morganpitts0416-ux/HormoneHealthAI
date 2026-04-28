// Vitals Monitoring Mode — daily sweep.
//
// Runs every ~15 minutes (in-process setInterval). Single entry point
// `runVitalsMonitoringSweep()` is idempotent — safe across restarts and
// multiple invocations within the same day. Side effects:
//
//   1. Episodes whose `end_date` is in the past AND status='active' get
//      transitioned to status='completed' and a `vitals_monitoring_completed`
//      inbox notification is created (deduped via vitals_monitoring_alerts).
//
//   2. For each still-active episode, count distinct logging-days. If the
//      number of expected logging-days that have passed (since startDate, up
//      to today, excluding today) exceeds the number of distinct days the
//      patient has logged readings on by 2 or more, fire a single
//      `missed_required_vital_log` notification per (episode, alert_date)
//      where alert_date = today.

import { storage } from "./storage";
import type { VitalsMonitoringEpisode } from "@shared/schema";

let sweepRunning = false;
let lastSweepAt: Date | null = null;
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function patientName(p: any): string {
  if (!p) return "Patient";
  const first = (p.firstName ?? "").trim();
  const last = (p.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || `Patient #${p.id}`;
}

function vitalTypeLabel(types: string[]): string {
  if (!types || types.length === 0) return "vitals";
  if (types.includes("blood_pressure") && types.length === 1) return "blood pressure";
  if (types.includes("heart_rate") && types.length === 1) return "heart rate";
  if (types.includes("weight") && types.length === 1) return "weight";
  return types
    .map((t) => (t === "blood_pressure" ? "blood pressure" : t === "heart_rate" ? "heart rate" : "weight"))
    .join(" + ");
}

function durationDays(ep: VitalsMonitoringEpisode): number {
  const start = new Date(`${ep.startDate}T00:00:00`);
  const end = new Date(`${ep.endDate}T00:00:00`);
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (24 * 3600 * 1000)) + 1);
}

async function completeEpisode(ep: VitalsMonitoringEpisode): Promise<void> {
  // Idempotency check — if completion alert already exists for this episode,
  // bail (handles restarts mid-sweep).
  const already = await (storage as any).hasVitalsMonitoringAlert(ep.id, "vitals_monitoring_completed");
  if (already) return;

  // Best-effort name lookup via patients table (unscoped — sweep is system-level)
  let pname = `Patient #${ep.patientId}`;
  try {
    const p = await (storage as any).getPatientById?.(ep.patientId);
    if (p) pname = patientName(p);
  } catch { /* fall through */ }

  const days = durationDays(ep);
  const label = vitalTypeLabel(ep.vitalTypes as string[]);
  const notif = await (storage as any).createInboxNotification({
    clinicId: ep.clinicId,
    patientId: ep.patientId,
    providerId: ep.createdByUserId,
    type: "vitals_monitoring_completed",
    title: `${pname} completed ${days}-day ${label} log`,
    message: `${pname} has completed their ${days}-day ${label} monitoring period. View results.`,
    relatedEntityType: "monitoring_episode",
    relatedEntityId: ep.id,
    severity: "normal",
  });

  await (storage as any).recordVitalsMonitoringAlert({
    episodeId: ep.id,
    patientId: ep.patientId,
    clinicId: ep.clinicId,
    alertType: "vitals_monitoring_completed",
    inboxNotificationId: notif?.id ?? null,
    alertDate: todayYmd(),
    details: { vitalTypes: ep.vitalTypes, days },
  });

  await (storage as any).endVitalsMonitoringEpisode(ep.id, { status: "completed" });
}

async function checkMissedDays(ep: VitalsMonitoringEpisode): Promise<void> {
  const today = todayYmd();
  // Only one missed-day alert per episode per day
  const dup = await (storage as any).hasVitalsMonitoringAlert(ep.id, "missed_required_vital_log", today);
  if (dup) return;

  // Count distinct calendar dates with at least one logged reading
  const logs: any[] = await (storage as any).listPatientLoggedVitalsForEpisode(ep.id);
  const loggedDates = new Set<string>();
  for (const r of logs) {
    if (!r.recordedAt) continue;
    const d = new Date(r.recordedAt);
    if (!Number.isFinite(d.getTime())) continue;
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    loggedDates.add(ymd);
  }

  const start = new Date(`${ep.startDate}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  // Days that *should* have had a reading by yesterday (don't penalize today)
  const expectedDays = Math.floor((todayDate.getTime() - start.getTime()) / (24 * 3600 * 1000));
  if (expectedDays < 2) return;
  const missed = expectedDays - loggedDates.size;
  if (missed < 2) return;

  let pname = `Patient #${ep.patientId}`;
  try {
    const p = await (storage as any).getPatientById?.(ep.patientId);
    pname = patientName(p);
  } catch { /* fall through */ }

  const label = vitalTypeLabel(ep.vitalTypes as string[]);
  const notif = await (storage as any).createInboxNotification({
    clinicId: ep.clinicId,
    patientId: ep.patientId,
    providerId: ep.createdByUserId,
    type: "missed_required_vital_log",
    title: `${pname} missed ${missed} required ${label} logs`,
    message: `${pname} has missed ${missed} required ${label} logs. Review monitoring period.`,
    relatedEntityType: "monitoring_episode",
    relatedEntityId: ep.id,
    severity: "normal",
  });

  await (storage as any).recordVitalsMonitoringAlert({
    episodeId: ep.id,
    patientId: ep.patientId,
    clinicId: ep.clinicId,
    alertType: "missed_required_vital_log",
    alertDate: today,
    inboxNotificationId: notif?.id ?? null,
    details: { missed, expectedDays, loggedDays: loggedDates.size },
  });
}

export async function runVitalsMonitoringSweep(): Promise<void> {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const today = todayYmd();
    const active: VitalsMonitoringEpisode[] = await (storage as any).getActiveVitalsMonitoringEpisodes();
    for (const ep of active) {
      try {
        // Completion check: end_date strictly before today
        if (ep.endDate < today) {
          await completeEpisode(ep);
          continue;
        }
        // Missed-day check (only for still-running episodes)
        await checkMissedDays(ep);
      } catch (err) {
        console.warn(`[vitals-sweep] episode ${ep.id} failed:`, (err as any)?.message ?? err);
      }
    }
    lastSweepAt = new Date();
  } catch (err) {
    console.error("[vitals-sweep] sweep failed:", err);
  } finally {
    sweepRunning = false;
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startVitalsMonitoringSweepLoop(): void {
  if (intervalHandle) return;
  // First run after a short startup delay to avoid blocking boot.
  setTimeout(() => { runVitalsMonitoringSweep().catch(() => {}); }, 30_000);
  intervalHandle = setInterval(() => {
    runVitalsMonitoringSweep().catch(() => {});
  }, SWEEP_INTERVAL_MS);
}

export function getVitalsMonitoringSweepStatus() {
  return { sweepRunning, lastSweepAt };
}
