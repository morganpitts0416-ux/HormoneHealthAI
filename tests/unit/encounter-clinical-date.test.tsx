import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseEncounterDate, encounterDay, encounterVitalDate, assertEncounterDateEdit } from "../../shared/encounter-date";
import { EncounterDateSession } from "../../client/src/lib/encounter-date-session";
import { EncounterSignatureHistory } from "../../client/src/components/encounter-signature-history";
import { NurseNoteBuilder } from "../../client/src/components/nurse-note-builder";
import { apiRequest, queryClient } from "../../client/src/lib/queryClient";

vi.mock("../../client/src/lib/queryClient", () => ({
  apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("../../client/src/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../../client/src/hooks/use-floating-panel", () => ({
  useFloatingPanel: () => ({ panelPos: null, minimized: false, panelRef: { current: null }, floating: false,
    setMinimized: vi.fn(), startDrag: vi.fn(), bringToFront: vi.fn(), zIndex: 100 }),
}));
vi.mock("../../client/src/components/phrase-search", () => ({ usePhraseSearch: () => ({}) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const response = (data: unknown) => ({ json: async () => data }) as Response;

describe("Wall-calendar date semantics", () => {
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00",
    "2026-01-01T24:00", "2026-01-01T12:60", "2026-01-01T12:00:60", "2026-01-01T00:00+99:99", "0000-01-01", "", "11/09/2026", null, 123])("rejects invalid input %s", value => {
    expect(() => parseEncounterDate(value)).toThrow("Invalid encounter date");
  });
  it("retains valid leap dates, wall times and calendar days across timezone boundaries", () => {
    const previous = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
        process.env.TZ = zone;
        for (const input of ["2024-02-29", "2024-02-29T23:59", "2024-02-29T00:00:00+14:00", "2024-02-29T23:59:00-11:00"]) {
          expect(encounterDay(input)).toBe("2024-02-29");
          expect(encounterVitalDate(input).toISOString()).toBe("2024-02-29T00:00:00.000Z");
        }
      }
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
  it("requires a valid original date for corrections and honors both lock types", () => {
    const current = { visitDate: parseEncounterDate("2026-01-01") };
    expect(() => assertEncounterDateEdit(current, parseEncounterDate("2026-01-02"), undefined)).toThrow("Reopen");
    expect(() => assertEncounterDateEdit(current, parseEncounterDate("2026-01-02"), "bad")).toThrow("Reopen");
    expect(() => assertEncounterDateEdit({ ...current, signedAt: new Date() }, parseEncounterDate("2026-01-02"), "2026-01-01")).toThrow("locked");
    expect(() => assertEncounterDateEdit({ ...current, pendingCollabReview: true }, parseEncounterDate("2026-01-02"), "2026-01-01")).toThrow("locked");
    expect(() => assertEncounterDateEdit(current, parseEncounterDate("2026-01-02"), "2026-01-01")).not.toThrow();
  });
});

describe("Save-before-dependent-action date lifecycle", () => {
  it("does not sign or generate when the metadata save fails", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("date save failed"));
    const session = new EncounterDateSession("2026-01-01");
    const sign = vi.fn();
    await expect(session.beforeAction(1, { visitDate: "2026-01-02" }, sign)).rejects.toThrow("date save failed");
    expect(sign).not.toHaveBeenCalled();
    expect(session.expectedVisitDate).toBe("2026-01-01");
  });
  it("saves current metadata first and passes the returned date to signing", async () => {
    const returned = { visitDate: "2026-01-02T00:00:00.000Z", patientId: 7 };
    vi.mocked(apiRequest).mockResolvedValueOnce(response(returned));
    const session = new EncounterDateSession("2026-01-01");
    const sign = vi.fn(async expected => expected);
    expect(await session.beforeAction(1, { visitDate: "2026-01-02" }, sign)).toBe(returned.visitDate);
    expect(apiRequest).toHaveBeenCalledWith("PUT", "/api/encounters/1", {
      visitDate: "2026-01-02", expectedVisitDate: "2026-01-01",
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/patients", 7, "vitals"] });
  });
  it("serializes multiple saves so a late first response cannot revert the corrected date", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(apiRequest)
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(response({ visitDate: "2026-01-03", patientId: 7 }));
    const session = new EncounterDateSession("2026-01-01");
    const first = session.save(1, { visitDate: "2026-01-02" });
    const second = session.save(1, { visitDate: "2026-01-03" });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    finish(response({ visitDate: "2026-01-02", patientId: 7 }));
    await Promise.all([first, second]);
    expect(vi.mocked(apiRequest).mock.calls[1][2]).toMatchObject({ expectedVisitDate: "2026-01-02", visitDate: "2026-01-03" });
    expect(session.expectedVisitDate).toBe("2026-01-03");
  });
});

describe("Clinical date UI", () => {
  it("shows a new signature's encounter date separately from actual signing and is honest for legacy dates", () => {
    render(<EncounterSignatureHistory versions={[
      { version: 1, signedAt: "2026-11-09T18:00:00Z", signedBy: "Synthetic", action: "initial_sign", soapNote: { fullNote: "Old" } },
      { version: 2, visitDate: "2026-02-03", signedAt: "2026-11-10T18:00:00Z", signedBy: "Synthetic", action: "amendment", soapNote: { fullNote: "New" } },
    ]} />);
    expect(screen.getByText(/Not recorded in this legacy version/)).toBeTruthy();
    expect(screen.getByText(/Encounter date: 2026-02-03/)).toBeTruthy();
    expect(screen.getAllByText(/Signed on/)).toHaveLength(2);
  });
  it("reopens a nurse note, persists its edited date before note/vitals saves and preserves the encounter link", async () => {
    const enc = { id: 100, patientId: 7, visitDate: "2026-11-09T08:30:00.000Z", chiefComplaint: "Synthetic",
      soapNote: { blocks: [{ uid: "v", type: "vitals", label: "Vital Signs", vitals: { heartRate: "70" } }] } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () =>
      url.includes("note-templates") ? [] : enc })));
    vi.mocked(apiRequest).mockImplementation(async (_method, url) => response(
      url === "/api/encounters/100" ? { ...enc, visitDate: "2026-02-03T08:30:00.000Z" } : {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NurseNoteBuilder patientId={7} initialEncounterId={100} onClose={vi.fn()} /></QueryClientProvider>);
    const date = await screen.findByTestId("input-nurse-date") as HTMLInputElement;
    expect(date.value).toBe("2026-11-09T08:30");
    fireEvent.change(date, { target: { value: "2026-02-03T08:30" } });
    fireEvent.click(screen.getByTestId("button-save-nurse-note"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("POST", "/api/patients/7/vitals",
      expect.objectContaining({ sourceEncounterId: 100, heartRate: 70 })));
    expect(vi.mocked(apiRequest).mock.calls[0]).toEqual(["PUT", "/api/encounters/100", expect.objectContaining({
      visitDate: "2026-02-03T08:30", expectedVisitDate: enc.visitDate, expectedPatientId: 7,
    })]);
    expect(vi.mocked(apiRequest).mock.calls[1][1]).toBe("/api/encounters/100/soap");
    client.clear();
  });
});
