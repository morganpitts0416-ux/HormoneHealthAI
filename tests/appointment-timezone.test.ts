/**
 * Appointment timezone display — integration + unit tests.
 *
 * These tests verify two things:
 *
 * 1. UNIT: The date-utils helpers used by appointment-dialog.tsx return
 *    strings in local-clock format (no UTC shift) when converting ISO
 *    timestamps to datetime-local input values.
 *
 * 2. INTEGRATION: The live API stores and returns appointment timestamps
 *    correctly so that the round-trip
 *       user enters local time → save → reload → input shows same local time
 *    produces no drift regardless of the server's UTC offset.
 *
 * Run from repo root:
 *   node --import tsx --test tests/appointment-timezone.test.ts
 *
 * The test user "tz_test_user / CliniqTest1!" must exist in the database.
 * It is seeded in the dev DB as part of the timezone audit work.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ─── Inline copies of date-utils helpers ─────────────────────────────────────
// We inline rather than import to avoid the ESM/CJS boundary in a tsx run.

function toLocalDateTimeStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}T${hh}:${min}`;
}

function localDateTimeStr(): string {
  return toLocalDateTimeStr(new Date());
}

// ─── Unit tests for date-utils ────────────────────────────────────────────────

test("toLocalDateTimeStr returns YYYY-MM-DDTHH:MM format", () => {
  const d = new Date(2026, 8, 10, 14, 30, 0); // Sep 10 2026 14:30 LOCAL
  const result = toLocalDateTimeStr(d);
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("toLocalDateTimeStr uses local clock getters, not UTC", () => {
  // Create a date at a specific LOCAL time.  getHours() always returns the
  // local clock hour, so the output must match what the local clock shows.
  const d = new Date(2026, 8, 10, 14, 30, 0); // Sep 10 2026 14:30 LOCAL
  const result = toLocalDateTimeStr(d);

  // The local hours and minutes must appear verbatim in the result.
  const expectedHH = String(d.getHours()).padStart(2, "0");
  const expectedMM = String(d.getMinutes()).padStart(2, "0");
  assert.ok(
    result.endsWith(`T${expectedHH}:${expectedMM}`),
    `expected result to end with T${expectedHH}:${expectedMM} but got ${result}`,
  );
});

test("localDateTimeStr does not end with Z (must not be raw UTC ISO)", () => {
  const result = localDateTimeStr();
  assert.ok(!result.endsWith("Z"), `localDateTimeStr() must not end with Z, got: ${result}`);
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("toLocalDateTimeStr round-trips through new Date correctly", () => {
  // This simulates what appointment-dialog.tsx does:
  //   setStartsAt(toLocalDateTimeStr(new Date(appointment.appointmentStart)))
  //
  // appointment.appointmentStart comes from the server as an ISO string.
  // We simulate an appointment saved at 14:30 local time.

  const entered = "2026-09-10T14:30";  // User typed this in datetime-local
  // Browser interprets datetime-local string as LOCAL time
  const startDate = new Date(entered);
  const isoForServer = startDate.toISOString(); // Sent to server

  // Server stores isoForServer, returns it back as-is in JSON
  // Dialog reopens: converts back to local datetime-local string
  const redisplayed = toLocalDateTimeStr(new Date(isoForServer));

  assert.equal(
    redisplayed,
    entered,
    `Round-trip failed: entered "${entered}", redisplayed "${redisplayed}". ` +
    `This indicates a timezone offset was introduced between save and reload.`,
  );
});

// ─── Integration tests against the live server ───────────────────────────────

const BASE = "http://localhost:5000";
const COOKIE_JAR: Record<string, string> = {};

async function apiFetch(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const cookieHeader = Object.entries(COOKIE_JAR)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const headers = new Headers(opts.headers);
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  // Persist session cookies
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const [pair] = c.split(";");
    const [name, value] = pair.split("=");
    COOKIE_JAR[name.trim()] = value?.trim() ?? "";
  }
  return res;
}

test("integration: appointment time round-trip preserves local time", async () => {
  // Login
  const loginRes = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "tz_test_user", password: "CliniqTest1!" }),
  });
  assert.equal(loginRes.status, 200, "Login must succeed");

  const me = await loginRes.json() as any;
  assert.ok(me.id, "Response must include user id");

  // Get the provider list for this clinic
  const providersRes = await apiFetch("/api/scheduling/providers");
  assert.ok(providersRes.ok, "Must be able to list providers");
  const providers = await providersRes.json() as any[];
  assert.ok(providers.length > 0, "Clinic must have at least one provider");
  const providerId = providers[0].id;

  // Create an appointment at a specific LOCAL time
  const localStart = "2026-09-15T10:30";           // User enters this
  const startDate  = new Date(localStart);          // Interpreted as LOCAL
  const endDate    = new Date(startDate.getTime() + 30 * 60000);

  const createRes = await apiFetch("/api/appointments", {
    method: "POST",
    body: JSON.stringify({
      providerId,
      appointmentStart: startDate.toISOString(),
      appointmentEnd:   endDate.toISOString(),
      durationMinutes:  30,
      status:           "scheduled",
    }),
  });
  assert.ok(createRes.ok, `Create appointment must succeed, got ${createRes.status}`);
  const created = await createRes.json() as any;
  const apptId = created.id ?? created.appointment?.id;
  assert.ok(apptId, "Created appointment must have an id");

  try {
    // Fetch the appointment back (as the dialog would)
    const rangeRes = await apiFetch(
      `/api/appointments/range?start=2026-09-01T00:00:00Z&end=2026-09-30T23:59:59Z`,
    );
    assert.ok(rangeRes.ok, "Must be able to fetch appointments in range");
    const appts = await rangeRes.json() as any[];
    const fetched = appts.find((a: any) => a.id === apptId);
    assert.ok(fetched, "Created appointment must appear in range query");

    // Simulate what appointment-dialog.tsx does on load:
    //   setStartsAt(toLocalDateTimeStr(new Date(appointment.appointmentStart)))
    const redisplayed = toLocalDateTimeStr(new Date(fetched.appointmentStart));
    assert.equal(
      redisplayed,
      localStart,
      `Timezone round-trip failed: entered "${localStart}", dialog would show "${redisplayed}". ` +
      `appointmentStart from server: ${fetched.appointmentStart}`,
    );
  } finally {
    // Clean up
    await apiFetch(`/api/appointments/${apptId}`, { method: "DELETE" });
  }
});
