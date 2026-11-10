import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { localClinicalDay, vitalMeasurementDate } from "../../shared/vital-date";
import { VitalsDialog } from "../../client/src/components/vitals-dialog";
import { VitalTrendsDialog } from "../../client/src/components/vital-trends-dialog";

const mocks = vi.hoisted(() => ({ api: vi.fn(), invalidate: vi.fn(), toast: vi.fn() }));
vi.mock("../../client/src/lib/queryClient", () => ({
  apiRequest: mocks.api, queryClient: { invalidateQueries: mocks.invalidate },
}));
vi.mock("../../client/src/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("../../client/src/hooks/use-floating-panel", () => ({
  useFloatingPanel: () => ({ panelPos: null, minimized: false, panelRef: { current: null }, floating: false,
    setMinimized: vi.fn(), startDrag: vi.fn(), bringToFront: vi.fn(), zIndex: 100 }),
}));
vi.mock("../../client/src/components/configure-vitals-monitoring-dialog", () => ({
  ConfigureVitalsMonitoringDialog: () => null,
}));
vi.mock("recharts", () => ({
  LineChart: () => null, Line: () => null, ResponsiveContainer: () => null, XAxis: () => null,
  YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, Legend: () => null,
}));

let qc: QueryClient;
let rows: any[];
const fixture = (id = 1) => ({
  id, patientId: 1, clinicianId: 1, recordedAt: "2026-11-02T00:00:00.000Z",
  createdAt: "2026-11-10T18:00:00.000Z", source: "clinic", sourceEncounterId: null,
  monitoringEpisodeId: null, systolicBp: 120, diastolicBp: 80, heartRate: 70,
  weightLbs: null, heightInches: null, bmi: null, temperature: null, respiratoryRate: null,
  oxygenSaturation: null, painScore: null, notes: null, symptoms: [], timeOfDay: null,
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T18:00:00Z"));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  rows = [fixture()];
  mocks.invalidate.mockImplementation(options => qc.invalidateQueries(options));
  mocks.api.mockImplementation(async (method, path, payload) => {
    const recordedAt = payload.recordedAt ? vitalMeasurementDate(payload.recordedAt).toISOString() : undefined;
    if (method === "POST") rows = [{ ...fixture(2), ...payload, recordedAt }, ...rows];
    if (method === "PATCH") rows = rows.map(v => path === `/api/vitals/${v.id}`
      ? { ...v, ...payload, ...(recordedAt ? { recordedAt } : {}) } : v);
    return { json: async () => rows[0] };
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true, json: async () => url.endsWith("/vitals-monitoring")
      ? { episodes: [], logsPerEpisode: {}, alertsPerEpisode: {} } : rows,
  })));
});
afterEach(() => {
  cleanup(); qc.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers();
});
function view(component: React.ReactNode) {
  return render(<QueryClientProvider client={qc}>{component}</QueryClientProvider>);
}
const modal = (patientId = 1) => <VitalsDialog open onOpenChange={() => {}} patientId={patientId} patientName="Synthetic patient" />;
const trends = (open = true) => <VitalTrendsDialog open={open} onOpenChange={() => {}} patientId={1} patientName="Synthetic patient" />;

describe("Standalone vital measurement dates", () => {
  it("defaults to the local calendar rather than the UTC day", () => {
    const localClock = { getFullYear: () => 2026, getMonth: () => 10, getDate: () => 9,
      toISOString: () => "2026-11-10T01:00:00Z" } as Date;
    expect(localClinicalDay(localClock)).toBe("2026-11-09");
    expect(vitalMeasurementDate("2024-02-29").toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(vitalMeasurementDate("2026-11-02T23:10:00-06:00").toISOString()).toBe("2026-11-03T05:10:00.000Z");
  });
  it.each(["", "not-a-date", "2026-02-29", "2026-04-31", "0000-01-01"])("rejects invalid measurement date %s", value => {
    expect(() => vitalMeasurementDate(value)).toThrow("Date Taken");
  });
  it("saves the selected day, reloads it in history and invalidates both vital caches", async () => {
    view(modal());
    fireEvent.click(await screen.findByTestId("button-add-vitals"));
    const date = screen.getByLabelText("Date Taken") as HTMLInputElement;
    expect(date.value).toBe(localClinicalDay());
    fireEvent.change(date, { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByTestId("input-heart-rate"), { target: { value: "72" } });
    fireEvent.click(screen.getByTestId("button-save-vitals"));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("POST", "/api/patients/1/vitals",
      expect.objectContaining({ source: "clinic", recordedAt: "2026-11-02", heartRate: 72 })));
    await waitFor(() => expect(screen.getByTestId("flowsheet-col-2").textContent).toContain("11/02"));
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/patients", 1, "vitals"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/patients", 1, "vitals", "all"] });
  });
  it("keeps the historical date and draft after a failed save", async () => {
    view(modal());
    fireEvent.click(await screen.findByTestId("button-add-vitals"));
    fireEvent.change(screen.getByLabelText("Date Taken"), { target: { value: "2026-11-02" } });
    mocks.api.mockRejectedValueOnce(new Error("Synthetic save failure"));
    fireEvent.click(screen.getByTestId("button-save-vitals"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Save failed" })));
    expect((screen.getByLabelText("Date Taken") as HTMLInputElement).value).toBe("2026-11-02");
  });
  it("clears drafts on patient changes and refuses an empty date", async () => {
    const mounted = view(modal());
    fireEvent.click(await screen.findByTestId("button-add-vitals"));
    fireEvent.change(screen.getByLabelText("Date Taken"), { target: { value: "" } });
    expect((screen.getByTestId("button-save-vitals") as HTMLButtonElement).disabled).toBe(true);
    mounted.rerender(<QueryClientProvider client={qc}>{modal(2)}</QueryClientProvider>);
    await waitFor(() => expect(screen.queryByLabelText("Date Taken")).toBeNull());
    fireEvent.click(await screen.findByTestId("button-add-vitals"));
    expect((screen.getByLabelText("Date Taken") as HTMLInputElement).value).toBe(localClinicalDay());
  });
  it("reopens an existing reading at its saved date and persists a date correction", async () => {
    const mounted = view(trends());
    fireEvent.click(await screen.findByTestId("button-edit-vital-1"));
    expect((screen.getByTestId("input-edit-date-1") as HTMLInputElement).value).toBe("2026-11-02");
    fireEvent.change(screen.getByTestId("input-edit-date-1"), { target: { value: "2026-10-31" } });
    fireEvent.click(screen.getByTestId("button-save-vital-1"));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("PATCH", "/api/vitals/1",
      expect.objectContaining({ recordedAt: "2026-10-31" })));
    await waitFor(() => expect(screen.queryByTestId("input-edit-date-1")).toBeNull());
    mounted.rerender(<QueryClientProvider client={qc}>{trends(false)}</QueryClientProvider>);
    mounted.rerender(<QueryClientProvider client={qc}>{trends()}</QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-edit-vital-1"));
    expect((screen.getByTestId("input-edit-date-1") as HTMLInputElement).value).toBe("2026-10-31");
  });
  it("does not truncate an unchanged legacy timestamp on other edits", async () => {
    rows[0].recordedAt = "2026-11-02T16:35:12Z";
    view(trends());
    fireEvent.click(await screen.findByTestId("button-edit-vital-1"));
    fireEvent.click(screen.getByTestId("button-save-vital-1"));
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(mocks.api.mock.calls[0][2]).not.toHaveProperty("recordedAt");
    expect(rows[0].recordedAt).toBe("2026-11-02T16:35:12Z");
  });
  it("displays an encounter-derived date read-only and does not submit an override", async () => {
    rows[0].sourceEncounterId = 99;
    view(trends());
    fireEvent.click(await screen.findByTestId("button-edit-vital-1"));
    const date = screen.getByTestId("input-edit-date-1") as HTMLInputElement;
    expect(date.value).toBe("2026-11-02");
    expect(date.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-save-vital-1"));
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(mocks.api.mock.calls[0][2]).not.toHaveProperty("recordedAt");
  });
});
