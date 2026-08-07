/**
 * Recording-context failure-path tests.
 *
 * The recording context contains safety-critical retry / auto-recovery /
 * gap-marker logic added after a real encounter lost ~55 minutes of audio.
 * These tests prove that a recorder failure can never SILENTLY end (or
 * silently truncate) a long recording:
 *
 *  1. Transient segment-upload failure → retried, transcript complete, no gap.
 *  2. Permanent segment-upload failure → explicit [AUDIO GAP] marker (never a
 *     silent empty string) + destructive toast, and the raw blob is retained.
 *  3. Finalize-time last-chance recovery → a blob that failed all in-flight
 *     retries is re-uploaded at stop time and the gap marker is replaced.
 *  4. MediaRecorder restart failure after retries → ends in 'error' state,
 *     NEVER 'review', even after in-flight segment uploads complete.
 *
 * Run: npx vitest run  (or npm run test:unit)
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import {
  RecordingProvider,
  useRecording,
  AUDIO_GAP_MARKER_PREFIX,
} from "@/contexts/recording-context";

// ─── Module mocks ────────────────────────────────────────────────────────────

const apiRequestMock = vi.fn(async () => ({}) as any);
const invalidateQueriesMock = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: (...args: any[]) => invalidateQueriesMock(...args) },
}));

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

// ─── MediaRecorder mock ──────────────────────────────────────────────────────

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  /** When > 0, the next N constructions throw (simulates restart failure). */
  static failConstructions = 0;
  static isTypeSupported = () => true;

  state: "recording" | "inactive" = "recording";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  private chunks: Blob[] = [];

  constructor(public stream: any, public opts: any) {
    if (MockMediaRecorder.failConstructions > 0) {
      MockMediaRecorder.failConstructions -= 1;
      throw new Error("MediaRecorder construction failed");
    }
    MockMediaRecorder.instances.push(this);
  }
  start(_timesliceMs?: number) {}
  stop() {
    this.state = "inactive";
    for (const c of this.chunks) this.ondataavailable?.({ data: c });
    this.onstop?.();
  }
  /** Queue audio data to be delivered on stop (like a real recorder). */
  emitData(size = 1024) {
    this.chunks.push(new Blob([new Uint8Array(size)], { type: "audio/webm" }));
  }
  static latest() {
    return MockMediaRecorder.instances[MockMediaRecorder.instances.length - 1];
  }
}

// ─── fetch mock (segment transcription endpoint) ─────────────────────────────

type FetchPlan = (callIndex: number) => { ok: boolean; body?: any };
let fetchPlan: FetchPlan = () => ({ ok: true, body: { transcription: "hello" } });
let fetchCalls = 0;

function installFetchMock() {
  fetchCalls = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    if (String(url).includes("/api/encounters/transcribe")) {
      const plan = fetchPlan(fetchCalls++);
      return {
        ok: plan.ok,
        json: async () => plan.body ?? { message: "boom" },
      } as any;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
}

// ─── Harness ─────────────────────────────────────────────────────────────────

let ctx: ReturnType<typeof useRecording>;
function Grab() {
  ctx = useRecording();
  return null;
}

const trackStop = vi.fn();
function makeStream() {
  return { getTracks: () => [{ stop: trackStop }] } as any;
}

async function startRecording() {
  await act(async () => {
    await ctx.start({
      patientId: 42,
      patientName: "Test Patient",
      encounterId: 7,
    });
  });
  expect(ctx.state).toBe("recording");
}

/** Advance fake timers inside act so React state updates settle. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const SEGMENT_MS = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  MockMediaRecorder.instances = [];
  MockMediaRecorder.failConstructions = 0;
  vi.stubGlobal("MediaRecorder", MockMediaRecorder as any);
  installFetchMock();
  apiRequestMock.mockClear().mockResolvedValue({});
  invalidateQueriesMock.mockClear();
  toastMock.mockClear();
  trackStop.mockClear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => makeStream()) },
  });
  render(
    <RecordingProvider>
      <Grab />
    </RecordingProvider>,
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("segment upload failures", () => {
  test("transient failure is retried and the transcript stays complete (no gap marker)", async () => {
    // Segment 0: first attempt fails, second succeeds.
    fetchPlan = (i) =>
      i === 0
        ? { ok: false, body: { message: "503" } }
        : { ok: true, body: { transcription: "minute one text" } };

    await startRecording();
    MockMediaRecorder.latest().emitData();
    await tick(SEGMENT_MS); // flushes segment 0, restarts recorder
    await tick(2000); // cover the 1500ms backoff before retry

    expect(fetchCalls).toBe(2);
    expect(ctx.segmentsDone).toBe(1);

    await act(async () => ctx.stop());
    await tick(1000);

    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toBe("minute one text");
    expect(ctx.finalTranscript).not.toContain(AUDIO_GAP_MARKER_PREFIX);
    // Transcript persisted with the patient-safety tripwire field
    expect(apiRequestMock).toHaveBeenCalledWith(
      "PUT",
      "/api/encounters/7",
      expect.objectContaining({ transcription: "minute one text", expectedPatientId: 42 }),
    );
  });

  test("permanent failure writes an explicit [AUDIO GAP] marker and warns loudly — never a silent drop", async () => {
    fetchPlan = () => ({ ok: false, body: { message: "server down" } });

    await startRecording();
    MockMediaRecorder.latest().emitData();
    await tick(SEGMENT_MS); // flush segment 0
    await tick(10_000); // exhaust in-flight retries (1500 + 4000 backoffs)

    expect(fetchCalls).toBe(3); // MAX_UPLOAD_ATTEMPTS
    // Loud per-segment failure toast
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: expect.stringContaining("Segment 1 failed"),
      }),
    );

    await act(async () => ctx.stop());
    await tick(1000); // finalize (last-chance retry also fails: +1 fetch call)

    expect(fetchCalls).toBe(4);
    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toContain(AUDIO_GAP_MARKER_PREFIX);
    expect(ctx.finalTranscript).toContain("minute 1");
    // Loud INCOMPLETE-transcript toast at finalize
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: expect.stringContaining("INCOMPLETE"),
      }),
    );
    // The gap marker is persisted so the legal record shows the hole
    expect(apiRequestMock).toHaveBeenCalledWith(
      "PUT",
      "/api/encounters/7",
      expect.objectContaining({
        transcription: expect.stringContaining(AUDIO_GAP_MARKER_PREFIX),
      }),
    );
  });

  test("finalize-time last-chance retry recovers a failed blob and removes the gap marker", async () => {
    // Segment 0 fails all 3 in-flight attempts, but the 4th (finalize) succeeds.
    fetchPlan = (i) =>
      i < 3
        ? { ok: false, body: { message: "outage" } }
        : { ok: true, body: { transcription: "recovered minute" } };

    await startRecording();
    MockMediaRecorder.latest().emitData();
    await tick(SEGMENT_MS);
    await tick(10_000); // exhaust in-flight retries → gap marker + blob retained

    await act(async () => ctx.stop());
    await tick(1000); // finalize runs last-chance retry, which succeeds

    expect(fetchCalls).toBe(4);
    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toBe("recovered minute");
    expect(ctx.finalTranscript).not.toContain(AUDIO_GAP_MARKER_PREFIX);
    // No INCOMPLETE toast — the audio was fully recovered
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("INCOMPLETE") }),
    );
  });
});

describe("MediaRecorder restart failure", () => {
  test("restart failure after retries ends in 'error' state — never 'review' — even after uploads finish", async () => {
    fetchPlan = () => ({ ok: true, body: { transcription: "minute one text" } });

    await startRecording();
    MockMediaRecorder.latest().emitData();

    // Every restart attempt from now on throws.
    MockMediaRecorder.failConstructions = 100;

    // 60s tick: old recorder flushed (upload of segment 0 starts), restart
    // attempted at +150ms then retried at +500ms/+1000ms before giving up.
    await tick(SEGMENT_MS);
    await tick(5_000);

    expect(ctx.state).toBe("error");
    expect(ctx.errorMessage).toBeTruthy();

    // Let everything in flight settle — the completed segment upload must NOT
    // flip the state to 'review' (recordingAbortedRef blocks finalize).
    await tick(30_000);
    expect(ctx.state).toBe("error");
    expect(ctx.state).not.toBe("review");
    // No transcript PUT — the session ended in error, not silent success.
    expect(apiRequestMock).not.toHaveBeenCalled();
    // Mic tracks were torn down so nothing keeps recording invisibly.
    expect(trackStop).toHaveBeenCalled();

    // Recovery path: clinician dismisses the error → back to a clean idle.
    await act(async () => ctx.dismissReview());
    expect(ctx.state).toBe("idle");
  });

  test("a successful restart mid-recording keeps segments flowing across the boundary", async () => {
    const texts = ["minute one", "minute two"];
    fetchPlan = (i) => ({ ok: true, body: { transcription: texts[i] ?? "" } });

    await startRecording();
    const first = MockMediaRecorder.latest();
    first.emitData();
    await tick(SEGMENT_MS); // flush seg 0
    await tick(500); // restart happens ~150ms after the flush

    const second = MockMediaRecorder.latest();
    expect(second).not.toBe(first);
    second.emitData();
    await tick(500);

    await act(async () => ctx.stop());
    await tick(1000);

    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toBe("minute one minute two");
  });
});
