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
  /** Simulates browsers that emit final dataavailable after stop() returns. */
  static deferStop = false;
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
    if (MockMediaRecorder.deferStop) return;
    this.finishStop();
  }
  finishStop() {
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

type FetchResult = { ok: boolean; body?: any };
type FetchPlan = (callIndex: number) => FetchResult | Promise<FetchResult>;
let fetchPlan: FetchPlan = () => ({ ok: true, body: { transcription: "hello" } });
let fetchCalls = 0;
let transcriptionBodies: FormData[] = [];
let sourceFetchCalls = 0;
let successfulTranscriptions: string[] = [];
let authoritativeSourceOverride: {
  text: string;
  kind: "verified_raw" | "legacy_unverified";
  state: "verified_raw" | "legacy_unverified" | "incomplete" | "transcription_failed";
  hasGaps: boolean;
  segmentCount: number;
} | null = null;

function installFetchMock() {
  fetchCalls = 0;
  transcriptionBodies = [];
  sourceFetchCalls = 0;
  successfulTranscriptions = [];
  authoritativeSourceOverride = null;
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: RequestInit) => {
    if (String(url).includes("/api/encounters/transcribe")) {
      transcriptionBodies.push(init?.body as FormData);
      const plan = await fetchPlan(fetchCalls++);
      if (plan.ok && typeof plan.body?.transcription === "string") {
        successfulTranscriptions.push(plan.body.transcription);
      }
      return {
        ok: plan.ok,
        json: async () => plan.body ?? { message: "boom" },
      } as any;
    }
    if (String(url) === "/api/encounters/7") {
      sourceFetchCalls += 1;
      const fallback = successfulTranscriptions.length
        ? {
            text: successfulTranscriptions.join("\n"),
            kind: "verified_raw" as const,
            state: "verified_raw" as const,
            hasGaps: false,
            segmentCount: successfulTranscriptions.length,
          }
        : {
            text: "[AUDIO GAP — session 1, segment 1 could not be transcribed]",
            kind: "verified_raw" as const,
            state: "transcription_failed" as const,
            hasGaps: true,
            segmentCount: 1,
          };
      return {
        ok: true,
        json: async () => ({ transcriptSource: authoritativeSourceOverride ?? fallback }),
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
  MockMediaRecorder.deferStop = false;
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
    // Per-segment source evidence is persisted by the STT endpoint. The client
    // must not copy assembled raw text into the editable encounter field.
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["/api/encounters", 7] }),
    );
  });

  test("retry submits the same immutable source slot instead of creating a second segment", async () => {
    fetchPlan = (i) => i === 0
      ? { ok: false, body: { message: "temporary outage" } }
      : { ok: true, body: { transcription: "recovered" } };

    await startRecording();
    MockMediaRecorder.latest().emitData();
    await tick(SEGMENT_MS);
    await tick(2000);

    expect(transcriptionBodies).toHaveLength(2);
    const [first, retry] = transcriptionBodies;
    expect(first.get("encounterId")).toBe("7");
    expect(first.get("segmentIndex")).toBe("0");
    expect(first.get("recordingSessionId")).toBeTruthy();
    expect(retry.get("encounterId")).toBe(first.get("encounterId"));
    expect(retry.get("segmentIndex")).toBe(first.get("segmentIndex"));
    expect(retry.get("recordingSessionId")).toBe(first.get("recordingSessionId"));
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
    expect(ctx.transcriptSource?.state).toBe("transcription_failed");
    // Loud INCOMPLETE-transcript toast at finalize
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: expect.stringContaining("INCOMPLETE"),
      }),
    );
    // The server has already persisted a failed source-segment outcome; the
    // client cannot overwrite it through the general encounter update route.
    expect(apiRequestMock).not.toHaveBeenCalled();
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
    expect(ctx.finalTranscript).toBe("minute one\nminute two");
  });
});

describe("MediaRecorder final-data lifecycle", () => {
  test("does not stop microphone tracks until final dataavailable and onstop have queued the final segment", async () => {
    MockMediaRecorder.deferStop = true;
    await startRecording();
    const recorder = MockMediaRecorder.latest();
    recorder.emitData(2048);

    await act(async () => ctx.stop());
    expect(trackStop).not.toHaveBeenCalled();
    expect(fetchCalls).toBe(0);

    await act(async () => recorder.finishStop());
    await tick(50);

    expect(fetchCalls).toBe(1);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe("review");
    const body = transcriptionBodies[0];
    expect(body.get("captureStartedAt")).toBeTruthy();
    expect(body.get("captureEndedAt")).toBeTruthy();
    expect(Number(body.get("captureDurationMs"))).toBeGreaterThanOrEqual(0);
    expect(body.get("captureMimeType")).toContain("audio/webm");
  });

  test("starts the next recorder independently before prior onstop", async () => {
    MockMediaRecorder.deferStop = true;
    fetchPlan = () => ({ ok: true, body: { transcription: "hello" } });
    await startRecording();
    const first = MockMediaRecorder.latest();
    first.emitData(2048);

    await tick(SEGMENT_MS);
    expect(MockMediaRecorder.instances).toHaveLength(1);
    expect(trackStop).not.toHaveBeenCalled();

    await tick(150);
    expect(MockMediaRecorder.instances).toHaveLength(2);
    const second = MockMediaRecorder.latest();
    expect(second).not.toBe(first);

    await act(async () => first.finishStop());
    await tick(50);
    expect(fetchCalls).toBe(1);
    expect(transcriptionBodies[0].get("segmentIndex")).toBe("0");
    second.emitData(2048);

    MockMediaRecorder.deferStop = false;
    await act(async () => ctx.stop());
    await tick(50);

    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toBe("hello\nhello");
    expect(transcriptionBodies.map((body) => body.get("segmentIndex"))).toEqual(["0", "1"]);
    expect(transcriptionBodies[1].get("recordingSessionId")).toBe(
      transcriptionBodies[0].get("recordingSessionId"),
    );
    expect(sourceFetchCalls).toBe(1);
  });

  test("does not retry or fabricate text for a server-confirmed invalid capture", async () => {
    fetchPlan = () => ({
      ok: false,
      body: { error: "audio_capture_failed", message: "Audio capture failed validation" },
    });
    authoritativeSourceOverride = {
      text: "[AUDIO CAPTURE FAILED — session 1, segment 1 was invalid]",
      kind: "verified_raw",
      state: "incomplete",
      hasGaps: true,
      segmentCount: 1,
    };

    await startRecording();
    MockMediaRecorder.latest().emitData(8);
    await act(async () => ctx.stop());
    await tick(50);

    expect(fetchCalls).toBe(1);
    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toContain("AUDIO CAPTURE FAILED");
    expect(ctx.finalTranscript).not.toContain("hello");
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("audio capture failed") }),
    );
  });
});

describe("authoritative source sequencing", () => {
  test("authoritative server source wins when browser-local assembly differs", async () => {
    fetchPlan = () => ({ ok: true, body: { transcription: "browser-local value" } });
    authoritativeSourceOverride = {
      text: "server-authoritative value",
      kind: "verified_raw",
      state: "verified_raw",
      hasGaps: false,
      segmentCount: 1,
    };

    await startRecording();
    MockMediaRecorder.latest().emitData();
    await act(async () => ctx.stop());
    await tick(1000);

    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toBe("server-authoritative value");
    expect(ctx.finalTranscript).not.toBe("browser-local value");
    expect(ctx.transcriptSource?.state).toBe("verified_raw");
  });

  test("waits for a delayed final segment before fetching the authoritative source", async () => {
    let releaseFinalSegment!: (value: FetchResult) => void;
    const delayedFinalSegment = new Promise<FetchResult>((resolve) => { releaseFinalSegment = resolve; });
    fetchPlan = () => delayedFinalSegment;
    authoritativeSourceOverride = {
      text: "server final segment",
      kind: "verified_raw",
      state: "verified_raw",
      hasGaps: false,
      segmentCount: 1,
    };

    await startRecording();
    MockMediaRecorder.latest().emitData();
    await act(async () => ctx.stop());
    await tick(50);

    expect(ctx.state).toBe("transcribing");
    expect(sourceFetchCalls).toBe(0);

    await act(async () => { releaseFinalSegment({ ok: true, body: { transcription: "late browser result" } }); });
    await tick(50);

    expect(sourceFetchCalls).toBe(1);
    expect(ctx.state).toBe("review");
    expect(ctx.finalTranscript).toBe("server final segment");
  });

  test("does not fetch the authoritative source while a retry remains pending", async () => {
    let releaseRetry!: (value: FetchResult) => void;
    const delayedRetry = new Promise<FetchResult>((resolve) => { releaseRetry = resolve; });
    fetchPlan = (i) => i === 0
      ? { ok: false, body: { message: "temporary outage" } }
      : delayedRetry;
    authoritativeSourceOverride = {
      text: "recovered authoritative source",
      kind: "verified_raw",
      state: "verified_raw",
      hasGaps: false,
      segmentCount: 1,
    };

    await startRecording();
    MockMediaRecorder.latest().emitData();
    await act(async () => ctx.stop());
    await tick(1600);

    expect(fetchCalls).toBe(2);
    expect(ctx.state).toBe("transcribing");
    expect(sourceFetchCalls).toBe(0);

    await act(async () => { releaseRetry({ ok: true, body: { transcription: "recovered local" } }); });
    await tick(50);

    expect(sourceFetchCalls).toBe(1);
    expect(ctx.finalTranscript).toBe("recovered authoritative source");
  });
});
