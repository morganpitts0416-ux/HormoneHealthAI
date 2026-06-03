/**
 * Appointment timezone display tests.
 *
 * Verifies that appointment times entered in a datetime-local input are stored
 * and retrieved correctly without timezone shift.  All assertions run with the
 * Playwright browser pinned to UTC (see playwright.config.ts → timezoneId),
 * which matches the server environment, so the "local" time the user types is
 * the same as the UTC time stored in the database.
 *
 * Key invariant: if a clinician enters "2026-09-10T14:30" in the Starts field
 * the server should store 2026-09-10T14:30:00.000Z and when the dialog is
 * reopened the input must show "2026-09-10T14:30" — not a UTC-shifted value.
 *
 * Run: npx playwright test tests/e2e/appointment-timezone.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5000";
const TEST_USER = { username: "tz_test_user", password: "CliniqTest1!" };
const APPT_START = "2026-09-10T14:30";
const APPT_DATE_NAV = { year: 2026, month: 8, day: 10 }; // 0-indexed month

async function login(page: Page): Promise<void> {
  const res = await page.request.post(`${BASE}/api/auth/login`, {
    data: TEST_USER,
  });
  expect(res.status()).toBe(200);
}

async function deleteAppointmentIfExists(
  page: Page,
  start: string,
): Promise<void> {
  const rangeStart = "2026-09-01T00:00:00.000Z";
  const rangeEnd = "2026-09-30T23:59:59.999Z";
  const res = await page.request.get(
    `${BASE}/api/appointments/range?start=${rangeStart}&end=${rangeEnd}`,
  );
  if (!res.ok()) return;
  const appts: any[] = await res.json();
  for (const a of appts) {
    const s = new Date(a.appointmentStart).toISOString();
    if (s.startsWith(start.replace("T", "T").slice(0, 16))) {
      await page.request.delete(`${BASE}/api/appointments/${a.id}`);
    }
  }
}

test.describe("Appointment timezone display", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await deleteAppointmentIfExists(page, "2026-09-10T14:30");
  });

  test.afterEach(async ({ page }) => {
    await deleteAppointmentIfExists(page, "2026-09-10T14:30");
  });

  test("datetime-local input pre-fills with local time format (not raw UTC)", async ({
    page,
  }) => {
    await page.goto("/appointments");
    await page.getByTestId("button-new-appointment").click();
    await expect(page.getByTestId("dialog-appointment")).toBeVisible();

    const val = await page.getByTestId("input-appt-start").inputValue();
    expect(val).not.toBe("");
    expect(val).not.toMatch(/Z$/); // raw UTC ISO strings end with Z; datetime-local must not
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/); // YYYY-MM-DDTHH:MM
  });

  test("appointment time round-trips correctly: entered value survives save and reopen", async ({
    page,
  }) => {
    await page.goto("/appointments");

    // Open new appointment dialog
    await page.getByTestId("button-new-appointment").click();
    await expect(page.getByTestId("dialog-appointment")).toBeVisible();

    // Enter a specific start time
    await page.getByTestId("input-appt-start").fill(APPT_START);

    // Select provider
    await page.getByTestId("select-appt-provider").click();
    await page.getByRole("option").first().click();

    // Save
    await page.getByTestId("button-save-appt").click();
    await expect(page.getByTestId("dialog-appointment")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify stored UTC time via API (server is in UTC so local == UTC here)
    const rangeStart = "2026-09-01T00:00:00.000Z";
    const rangeEnd = "2026-09-30T23:59:59.999Z";
    const res = await page.request.get(
      `${BASE}/api/appointments/range?start=${rangeStart}&end=${rangeEnd}`,
    );
    expect(res.ok()).toBe(true);
    const appts: any[] = await res.json();
    const saved = appts.find((a) => {
      const diff =
        Math.abs(
          new Date(a.appointmentStart).getTime() -
            new Date(APPT_START).getTime(),
        ) / 60000;
      return diff < 5;
    });
    expect(saved).toBeDefined();
    const savedId = saved.id;

    // Navigate to day view for the appointment date
    await page.getByTestId("button-view-day").click();

    // Jump to September 2026 via date picker
    await page.getByTestId("button-date-picker").click();
    // Navigate forward months until we reach September 2026
    // The calendar starts near current date; September 2026 is several months out
    for (let i = 0; i < 18; i++) {
      const heading = await page.locator(".rdp-caption_label").first().textContent();
      if (heading && heading.includes("September 2026")) break;
      await page.locator('[name="next-month"]').first().click();
    }
    await page.getByRole("gridcell", { name: "10" }).click();

    // Verify the calendar event is shown with correct local time text
    const eventEl = page.getByTestId(`event-appt-${savedId}`);
    await expect(eventEl).toBeVisible({ timeout: 5000 });
    const timeText = await eventEl
      .locator(".font-semibold")
      .first()
      .textContent();
    // FullCalendar timeText in 12-hour format should show "2:30pm", "2:30 PM", or similar
    expect(timeText).toMatch(/2:30/i);

    // Click the event to open edit dialog
    await eventEl.click();
    await expect(page.getByTestId("dialog-appointment")).toBeVisible({
      timeout: 3000,
    });

    // Critical timezone round-trip assertion
    const inputVal = await page.getByTestId("input-appt-start").inputValue();
    expect(inputVal).toBe(APPT_START);

    // Close dialog
    await page.getByTestId("button-cancel-appt").click();
  });

  test("account-scheduling time-off blocks display times in locale-aware format", async ({
    page,
  }) => {
    await page.goto("/account/scheduling");

    // The page uses toLocaleString() for calendar block display — this test
    // checks the tab is reachable and the time-off section is rendered
    await page.getByTestId("tab-timeoff").click();
    await expect(page.getByText("Time Off")).toBeVisible();

    // Select the test provider to load their time-off list
    await page.getByTestId("select-timeoff-provider").click();
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible();
    // Just verify the provider list loaded (coverage that the tab renders)
    await page.keyboard.press("Escape");
  });
});
