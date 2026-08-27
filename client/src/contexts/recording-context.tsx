import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DiarizedUtterance } from "@shared/schema";
import { rememberAudioCaptureDiagnosticRequest } from "@/lib/audio-capture-diagnostic";

export type RecordingState = "idle" | "recording" | "transcribing" | "review" | "error";
export type TranscriptSourceState =
  | "verified_raw"
  | "legacy_unverified"
  | "incomplete"
  | "transcription_failed";

export interface TranscriptSourceSummary {
  text: string;
  kind: "verified_raw" | "legacy_unverified";
  state: TranscriptSourceState;
  hasGaps: boolean;
  segmentCount: number;
}

export interface CaptureDiagnostic {
  url: string;
  segmentIndex: number;
  mimeType: string;
  byteLength: number;
  durationMs: number;
  sttStatus: "pending" | "completed" | "empty" | "failed" | "audio_capture_failed";
  sttText: string | null;
}

export interface CaptureInputDevice {
  label: string | null;
  deviceId: string | null;
  groupId: string | null;
  sampleRate: number | null;
  channelCount: number | null;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
}

export interface MicrophoneSignalDiagnostic {
  rms: number;
  peak: number;
  trackEnabled: boolean | null;
  trackMuted: boolean | null;
  trackReadyState: string | null;
  streamActive: boolean | null;
  audioContextState: string | null;
  transitions: string[];
  error: string | null;
}

export interface AudioCaptureDiagnosticStatus {
  enabled: boolean;
  reason: string;
}

interface MicrophoneSignalStateSnapshot {
  trackEnabled: boolean | null;
  trackMuted: boolean | null;
  trackReadyState: string | null;
  streamActive: boolean | null;
  audioContextState: string | null;
  input: CaptureInputDevice | null;
}

const SEGMENT_MS = 60_000;
// Upload retry policy: transient network/server failures must NOT silently
// drop a minute of clinical audio. Each segment upload is attempted up to
// MAX_UPLOAD_ATTEMPTS times with backoff, the raw blob is retained for one
// last retry at finalize time, and only then is an explicit gap marker
// written into the transcript so the clinician can see exactly what's missing.
const MAX_UPLOAD_ATTEMPTS = 3;
const UPLOAD_BACKOFF_MS = [1500, 4000];
export const AUDIO_GAP_MARKER_PREFIX = "[AUDIO GAP";
const gapMarker = (segIdx: number) =>
  `${AUDIO_GAP_MARKER_PREFIX} — minute ${segIdx + 1} of the recording could not be transcribed]`;
const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

interface CaptureMetadata {
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  mimeType: string;
}

interface FailedSegmentBlob {
  blob: Blob;
  capture: CaptureMetadata;
}

export interface StartRecordingParams {
  patientId: number;
  patientName: string;
  encounterId: number;
  visitType?: string;
  preExistingTranscript?: string;
}

interface RecordingContextValue {
  state: RecordingState;
  boundPatientId: number | null;
  boundPatientName: string | null;
  boundEncounterId: number | null;
  visitType: string;
  elapsed: number;
  segmentsDone: number;
  segmentsTotal: number;
  liveTranscript: string;
  // This is populated only from the server's ordered immutable source after
  // every upload/retry settles. It is never the browser-local assembly.
  finalTranscript: string;
  transcriptSource: TranscriptSourceSummary | null;
  finalUtterances: DiarizedUtterance[] | null;
  // Browser-memory playback and result metadata for the exact Blobs handed to
  // STT. It is released only by an authenticated server-side test-environment
  // gate plus ?audioCaptureDiagnostic=1.
  captureDiagnostics: CaptureDiagnostic[];
  captureInputDevice: CaptureInputDevice | null;
  microphoneSignalDiagnostic: MicrophoneSignalDiagnostic | null;
  audioCaptureDiagnosticStatus: AudioCaptureDiagnosticStatus;
  errorMessage: string | null;
  start: (params: StartRecordingParams) => Promise<boolean>;
  stop: () => void;
  discard: () => void;
  dismissReview: () => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("useRecording must be used inside <RecordingProvider>");
  return ctx;
}

export function RecordingProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const [state, setState] = useState<RecordingState>("idle");
  const [boundPatientId, setBoundPatientId] = useState<number | null>(null);
  const [boundPatientName, setBoundPatientName] = useState<string | null>(null);
  const [boundEncounterId, setBoundEncounterId] = useState<number | null>(null);
  const [visitType, setVisitType] = useState<string>("follow-up");
  const [elapsed, setElapsed] = useState(0);
  const [segmentsDone, setSegmentsDone] = useState(0);
  const [segmentsTotal, setSegmentsTotal] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSourceSummary | null>(null);
  const [finalUtterances, setFinalUtterances] = useState<DiarizedUtterance[] | null>(null);
  const [captureDiagnostics, setCaptureDiagnostics] = useState<CaptureDiagnostic[]>([]);
  const [captureInputDevice, setCaptureInputDevice] = useState<CaptureInputDevice | null>(null);
  const [microphoneSignalDiagnostic, setMicrophoneSignalDiagnostic] = useState<MicrophoneSignalDiagnostic | null>(null);
  const [captureDiagnosticRuntimeEnabled, setCaptureDiagnosticRuntimeEnabled] = useState(false);
  const [audioCaptureDiagnosticStatus, setAudioCaptureDiagnosticStatus] = useState<AudioCaptureDiagnosticStatus>(() => ({
    enabled: false,
    reason: rememberAudioCaptureDiagnosticRequest()
      ? "waiting for authenticated server approval"
      : "initial ?audioCaptureDiagnostic=1 query flag was not present in this tab",
  }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for the recorder mechanics
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mimeTypeRef = useRef<string>("");
  const segmentIndexRef = useRef(0);
  const transcribedSegmentsRef = useRef<Map<number, string>>(new Map());
  const transcribedUtterancesRef = useRef<Map<number, DiarizedUtterance[] | null>>(new Map());
  const pendingSegmentsRef = useRef(0);
  // Raw audio blobs for segments whose uploads exhausted all retries.
  // Held so finalize() can make one last attempt before writing a gap marker.
  const failedSegmentBlobsRef = useRef<Map<number, FailedSegmentBlob>>(new Map());
  // Counts MediaRecorder.stop() calls whose onstop has not yet fired.
  // Used so stop() can wait for an in-flight mid-segment flush to land
  // (and bump pendingSegmentsRef from onstop) before deciding to finalize.
  const pendingFlushesRef = useRef(0);
  const recordingStoppedRef = useRef(false);
  const finalizedRef = useRef(false);
  // Set when the recorder died mid-session and could not be recovered.
  // Blocks any later finalize() from overwriting the error state with a
  // normal "review" transition — the clinician MUST see the interruption.
  const recordingAbortedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const microphoneSignalSnapshotRef = useRef<MicrophoneSignalStateSnapshot | null>(null);
  const microphoneSignalTransitionsRef = useRef<string[]>([]);
  const microphoneSignalStartedAtRef = useRef(0);

  // PATIENT-SAFETY: Every start() bumps this generation counter. Async callbacks
  // (onstop, transcribeSegment, finalize, flushSegment timeouts) capture the
  // session at scheduling time and refuse to mutate state if the session is
  // stale. This prevents late results from a discarded recording from leaking
  // into a subsequent recording bound to a DIFFERENT patient/encounter.
  const recordingSessionRef = useRef(0);
  // Stable opaque identifier sent with every segment in one MediaRecorder
  // session. The server reserves its encounter-local ordering slot.
  const sourceSessionIdRef = useRef("");
  const startSegmentRecorderRef = useRef<(stream: MediaStream) => void>(() => {});
  const captureDiagnosticUrlsRef = useRef<Set<string>>(new Set());

  // Captured at start time — used so finalize/autosave always writes to the
  // ORIGINAL bound patient/encounter, not whatever the UI is currently showing.
  const boundPatientIdRef = useRef<number | null>(null);
  const boundEncounterIdRef = useRef<number | null>(null);
  const visitTypeRef = useRef<string>("follow-up");
  const preExistingTranscriptRef = useRef<string>("");
  const stateRef = useRef<RecordingState>("idle");
  useEffect(() => { stateRef.current = state; }, [state]);

  // Wake lock — keep the device awake while recording (mobile mics get cut otherwise)
  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
    } catch {
      // Non-fatal — recording continues without wake lock
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && stateRef.current === "recording") {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [acquireWakeLock]);

  const captureDiagnosticRequested = () => rememberAudioCaptureDiagnosticRequest();

  useEffect(() => {
    if (!captureDiagnosticRequested()) {
      setCaptureDiagnosticRuntimeEnabled(false);
      setAudioCaptureDiagnosticStatus({
        enabled: false,
        reason: "initial ?audioCaptureDiagnostic=1 query flag was not present in this tab",
      });
      return;
    }
    let active = true;
    setAudioCaptureDiagnosticStatus({ enabled: false, reason: "waiting for authenticated server approval" });
    fetch("/api/diagnostics/audio-capture/config?audioCaptureDiagnostic=1", { credentials: "include" })
      .then(async (response) => {
        if (response.ok) return response.json();
        if (response.status === 401) return { enabled: false, reason: "authentication is required" };
        if (response.status === 403) return { enabled: false, reason: "clinician authorization is required" };
        return { enabled: false, reason: `server gate request failed (${response.status})` };
      })
      .then((data) => {
        if (!active) return;
        const enabled = data?.enabled === true;
        setCaptureDiagnosticRuntimeEnabled(enabled);
        setAudioCaptureDiagnosticStatus({
          enabled,
          reason: typeof data?.reason === "string"
            ? data.reason
            : enabled
              ? "server approved diagnostic"
              : "server did not approve the diagnostic",
        });
      })
      .catch(() => {
        if (!active) return;
        setCaptureDiagnosticRuntimeEnabled(false);
        setAudioCaptureDiagnosticStatus({ enabled: false, reason: "server gate request could not be reached" });
      });
    return () => { active = false; };
  }, []);

  const clearCaptureDiagnostics = useCallback(() => {
    captureDiagnosticUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    captureDiagnosticUrlsRef.current.clear();
    setCaptureDiagnostics([]);
    setCaptureInputDevice(null);
  }, []);

  const saveCaptureDiagnostic = useCallback((blob: Blob, segIdx: number, capture: CaptureMetadata) => {
    if (!captureDiagnosticRuntimeEnabled) {
      return;
    }
    const url = URL.createObjectURL(blob);
    captureDiagnosticUrlsRef.current.add(url);
    setCaptureDiagnostics((previous) => [...previous, {
      url,
      segmentIndex: segIdx,
      mimeType: blob.type || capture.mimeType,
      byteLength: blob.size,
      durationMs: capture.durationMs,
      sttStatus: "pending",
      sttText: null,
    }]);
  }, [captureDiagnosticRuntimeEnabled]);

  const updateCaptureDiagnosticStt = useCallback((
    segIdx: number,
    sttStatus: CaptureDiagnostic["sttStatus"],
    sttText: string | null = null,
  ) => {
    setCaptureDiagnostics((previous) => previous.map((diagnostic) =>
      diagnostic.segmentIndex === segIdx
        ? { ...diagnostic, sttStatus, sttText }
        : diagnostic,
    ));
  }, []);

  const describeCaptureInputDevice = useCallback((stream: MediaStream): CaptureInputDevice | null => {
    const track = stream.getAudioTracks()[0];
    if (!track) return null;
    const settings = track.getSettings?.() ?? {};
    const nullableString = (value: unknown) => typeof value === "string" && value ? value : null;
    const nullableNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const nullableBoolean = (value: unknown) => typeof value === "boolean" ? value : null;
    return {
      label: nullableString(track.label),
      deviceId: nullableString(settings.deviceId),
      groupId: nullableString(settings.groupId),
      sampleRate: nullableNumber(settings.sampleRate),
      channelCount: nullableNumber(settings.channelCount),
      echoCancellation: nullableBoolean(settings.echoCancellation),
      noiseSuppression: nullableBoolean(settings.noiseSuppression),
      autoGainControl: nullableBoolean(settings.autoGainControl),
    };
  }, []);

  const stopMicrophoneSignalDiagnostic = useCallback(() => {
    if (audioLevelTimerRef.current) {
      clearInterval(audioLevelTimerRef.current);
      audioLevelTimerRef.current = null;
    }
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    audioAnalyserRef.current?.disconnect();
    audioAnalyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => {});
    }
    microphoneSignalSnapshotRef.current = null;
    microphoneSignalTransitionsRef.current = [];
    microphoneSignalStartedAtRef.current = 0;
    setMicrophoneSignalDiagnostic(null);
  }, []);

  const startMicrophoneSignalDiagnostic = useCallback((stream: MediaStream) => {
    stopMicrophoneSignalDiagnostic();

    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const track = stream.getAudioTracks()[0] ?? null;
    if (!AudioContextConstructor) {
      setMicrophoneSignalDiagnostic({
        rms: 0,
        peak: 0,
        trackEnabled: track?.enabled ?? null,
        trackMuted: track?.muted ?? null,
        trackReadyState: track?.readyState ?? null,
        streamActive: stream.active,
        audioContextState: "unavailable",
        transitions: [],
        error: "Web Audio is unavailable in this browser.",
      });
      return;
    }

    try {
      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      audioAnalyserRef.current = analyser;
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      audioSourceRef.current = source;
      // Observes the same stream passed to MediaRecorder without connecting
      // to speakers, recording, persisting, or uploading any extra audio.
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);

      microphoneSignalStartedAtRef.current = performance.now();
      void audioContext.resume().catch(() => {});

      const sampleLevel = () => {
        if (audioContextRef.current !== audioContext) return;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        let peak = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const sample = samples[index];
          sum += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
        }
        const activeTrack = stream.getAudioTracks()[0] ?? track;
        const input = describeCaptureInputDevice(stream);
        const snapshot: MicrophoneSignalStateSnapshot = {
          trackEnabled: activeTrack?.enabled ?? null,
          trackMuted: activeTrack?.muted ?? null,
          trackReadyState: activeTrack?.readyState ?? null,
          streamActive: stream.active,
          audioContextState: audioContext.state,
          input,
        };
        const previousSnapshot = microphoneSignalSnapshotRef.current;
        if (previousSnapshot) {
          const changedStates: string[] = [];
          if (previousSnapshot.trackEnabled !== snapshot.trackEnabled) {
            changedStates.push(`track.enabled: ${previousSnapshot.trackEnabled} → ${snapshot.trackEnabled}`);
          }
          if (previousSnapshot.trackMuted !== snapshot.trackMuted) {
            changedStates.push(`track.muted: ${previousSnapshot.trackMuted} → ${snapshot.trackMuted}`);
          }
          if (previousSnapshot.trackReadyState !== snapshot.trackReadyState) {
            changedStates.push(`track.readyState: ${previousSnapshot.trackReadyState} → ${snapshot.trackReadyState}`);
          }
          if (previousSnapshot.streamActive !== snapshot.streamActive) {
            changedStates.push(`stream.active: ${previousSnapshot.streamActive} → ${snapshot.streamActive}`);
          }
          if (JSON.stringify(previousSnapshot.input) !== JSON.stringify(snapshot.input)) {
            changedStates.push("input device/settings changed");
          }
          if (changedStates.length > 0) {
            const elapsedMs = Math.round(performance.now() - microphoneSignalStartedAtRef.current);
            microphoneSignalTransitionsRef.current = [
              ...microphoneSignalTransitionsRef.current,
              ...changedStates.map((change) => `+${elapsedMs} ms ${change}`),
            ].slice(-8);
          }
        }
        microphoneSignalSnapshotRef.current = snapshot;
        setCaptureInputDevice(input);
        setMicrophoneSignalDiagnostic({
          rms: Math.sqrt(sum / samples.length),
          peak,
          trackEnabled: snapshot.trackEnabled,
          trackMuted: snapshot.trackMuted,
          trackReadyState: snapshot.trackReadyState,
          streamActive: snapshot.streamActive,
          audioContextState: snapshot.audioContextState,
          transitions: microphoneSignalTransitionsRef.current,
          error: null,
        });
      };

      sampleLevel();
      audioLevelTimerRef.current = setInterval(sampleLevel, 100);
    } catch (error: any) {
      stopMicrophoneSignalDiagnostic();
      setMicrophoneSignalDiagnostic({
        rms: 0,
        peak: 0,
        trackEnabled: track?.enabled ?? null,
        trackMuted: track?.muted ?? null,
        trackReadyState: track?.readyState ?? null,
        streamActive: stream.active,
        audioContextState: "error",
        transitions: [],
        error: error?.message || "Could not initialize the microphone signal analyser.",
      });
    }
  }, [describeCaptureInputDevice, stopMicrophoneSignalDiagnostic]);

  // Cleanup on unmount (i.e. full app teardown)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      stopMicrophoneSignalDiagnostic();
      captureDiagnosticUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      captureDiagnosticUrlsRef.current.clear();
      releaseWakeLock();
    };
  }, [releaseWakeLock, stopMicrophoneSignalDiagnostic]);

  // Reset all internal state — call after review/discard/error dismiss
  const resetAll = useCallback(() => {
    failedSegmentBlobsRef.current.clear();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    stopMicrophoneSignalDiagnostic();
    releaseWakeLock();
    mediaRecorderRef.current = null;
    transcribedSegmentsRef.current.clear();
    transcribedUtterancesRef.current.clear();
    segmentIndexRef.current = 0;
    pendingSegmentsRef.current = 0;
    pendingFlushesRef.current = 0;
    recordingStoppedRef.current = false;
    finalizedRef.current = false;
    recordingAbortedRef.current = false;
    sourceSessionIdRef.current = "";
    boundPatientIdRef.current = null;
    boundEncounterIdRef.current = null;
    visitTypeRef.current = "follow-up";
    preExistingTranscriptRef.current = "";
    setBoundPatientId(null);
    setBoundPatientName(null);
    setBoundEncounterId(null);
    setVisitType("follow-up");
    setElapsed(0);
    setSegmentsDone(0);
    setSegmentsTotal(0);
    setLiveTranscript("");
    setFinalTranscript("");
    setTranscriptSource(null);
    setFinalUtterances(null);
    clearCaptureDiagnostics();
    setErrorMessage(null);
    setState("idle");
  }, [clearCaptureDiagnostics, releaseWakeLock, stopMicrophoneSignalDiagnostic]);

  // Single upload+transcribe attempt for one segment blob. Throws on failure.
  const uploadSegmentOnce = useCallback(async (blob: Blob, segIdx: number, capture: CaptureMetadata) => {
    const ext = (blob.type || "audio/webm").includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `seg-${segIdx}.${ext}`, { type: blob.type || "audio/webm" });
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("visitType", visitTypeRef.current);
    formData.append("encounterId", String(boundEncounterIdRef.current ?? ""));
    formData.append("recordingSessionId", sourceSessionIdRef.current);
    formData.append("segmentIndex", String(segIdx));
    formData.append("captureStartedAt", capture.startedAt.toISOString());
    formData.append("captureEndedAt", capture.endedAt.toISOString());
    formData.append("captureDurationMs", String(capture.durationMs));
    formData.append("captureMimeType", capture.mimeType);
    const res = await fetch("/api/encounters/transcribe", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const error = new Error(err.message || "Transcription failed") as Error & { code?: string };
      error.code = err.error;
      throw error;
    }
    return (await res.json()) as { transcription?: string; utterances?: DiarizedUtterance[] | null };
  }, []);

  // This is deliberately separate from the segment POST response. The browser
  // may use its local assembly as temporary recording feedback, but clinical
  // review must come from the ordered, immutable source the server assembled.
  const fetchAuthoritativeTranscriptSource = useCallback(async (encounterId: number): Promise<TranscriptSourceSummary> => {
    const res = await fetch(`/api/encounters/${encounterId}`, { credentials: "include" });
    if (!res.ok) throw new Error("Could not load the authoritative transcript source");
    const payload = await res.json();
    const source = payload?.transcriptSource as TranscriptSourceSummary | undefined;
    if (!source || typeof source.text !== "string" || !source.state) {
      throw new Error("The authoritative transcript source is unavailable");
    }
    return source;
  }, []);

  // Once all segments have been transcribed AND recording has stopped, fetch
  // the authoritative server source and then switch to review state.
  // `session` is the recording generation captured by the caller; if it no
  // longer matches the current session the recording was discarded/restarted
  // and we MUST NOT persist anything from the prior session.
  const finalize = useCallback(async (session: number) => {
    if (session !== recordingSessionRef.current) return;
    if (finalizedRef.current) return;
    if (recordingAbortedRef.current) return; // recorder died — stay in error state
    finalizedRef.current = true;

    // LAST-CHANCE RETRY: any segment that exhausted its upload retries still
    // has its raw audio blob held in memory. Try each once more (sequentially)
    // before assembling the final transcript, so a transient outage mid-visit
    // doesn't permanently lose audio we still possess.
    if (failedSegmentBlobsRef.current.size > 0) {
      const failed = Array.from(failedSegmentBlobsRef.current.entries()).sort((a, b) => a[0] - b[0]);
      for (const [segIdx, failedSegment] of failed) {
        if (session !== recordingSessionRef.current) return;
        try {
          const data = await uploadSegmentOnce(failedSegment.blob, segIdx, failedSegment.capture);
          if (session !== recordingSessionRef.current) return;
          transcribedSegmentsRef.current.set(segIdx, data.transcription ?? "");
          transcribedUtterancesRef.current.set(segIdx, data.utterances ?? null);
            updateCaptureDiagnosticStt(
              segIdx,
              data.sourceStatus === "empty" ? "empty" : "completed",
              data.transcription ?? null,
            );
          failedSegmentBlobsRef.current.delete(segIdx);
        } catch {
          // Gap marker already in place for this segment — leave it.
        }
      }
    }
    const unrecoveredGaps = failedSegmentBlobsRef.current.size;

    // Local utterance timing remains helpful review assistance, but local text
    // assembly must never become the clinical transcript shown after stop.
    const indices = Array.from(transcribedSegmentsRef.current.keys()).sort((a, b) => a - b);
    const allUtterances: DiarizedUtterance[] = [];
    let utteranceIdOffset = 0;
    for (const i of indices) {
      const u = transcribedUtterancesRef.current.get(i);
      if (u) {
        u.forEach(ut => allUtterances.push({ ...ut, id: ut.id + utteranceIdOffset }));
        utteranceIdOffset += u.length;
      }
    }
    const utterances = allUtterances.length > 0 ? allUtterances : null;
    setFinalUtterances(utterances);

    if (unrecoveredGaps > 0) {
      toast({
        variant: "destructive",
        title: `Transcript is INCOMPLETE — ${unrecoveredGaps} minute${unrecoveredGaps === 1 ? "" : "s"} of audio missing`,
        description: "The missing sections are marked with [AUDIO GAP …] in the transcript. Review carefully before generating a note; the note cannot include what was not transcribed.",
        duration: 30000,
      });
    }

    // The final GET intentionally happens only after every upload/retry and
    // last-chance retry above has settled. Fetching earlier can race the last
    // provider response and show an incomplete authoritative assembly.
    const encounterId = boundEncounterIdRef.current;
    if (!encounterId) {
      setErrorMessage("The recording was not linked to an encounter.");
      setState("error");
      return;
    }
    try {
      const source = await fetchAuthoritativeTranscriptSource(encounterId);
      if (session !== recordingSessionRef.current) return;
      setTranscriptSource(source);
      setFinalTranscript(source.text);
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId] });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters/open"] });
    } catch {
      if (session !== recordingSessionRef.current) return;
      // Fail closed rather than presenting unverified browser-local text as
      // the final clinical transcript.
      setErrorMessage("Recording finished, but the authoritative transcript source could not be loaded. Please retry the review.");
      setState("error");
      return;
    }

    if (session !== recordingSessionRef.current) return;
    setState("review");
  }, [fetchAuthoritativeTranscriptSource, toast, updateCaptureDiagnosticStt, uploadSegmentOnce]);

  const settleAfterStop = useCallback((session: number) => {
    if (
      session !== recordingSessionRef.current ||
      !recordingStoppedRef.current ||
      pendingFlushesRef.current > 0 ||
      pendingSegmentsRef.current > 0
    ) return;
    // Do not end the microphone stream until the active recorder's onstop has
    // assembled its final Blob and every upload/retry has settled.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    finalize(session);
  }, [finalize]);

  const transcribeSegment = useCallback(async (
    blob: Blob,
    segIdx: number,
    session: number,
    capture: CaptureMetadata,
  ) => {
    let captureFailed = false;
    try {
       let data: { transcription?: string; utterances?: DiarizedUtterance[] | null; sourceStatus?: "completed" | "empty" } | null = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt++) {
        if (session !== recordingSessionRef.current) return;
        try {
          data = await uploadSegmentOnce(blob, segIdx, capture);
          break;
        } catch (err: any) {
          lastErr = err;
          if (err?.code === "audio_capture_failed") {
            captureFailed = true;
            break;
          }
          if (attempt < MAX_UPLOAD_ATTEMPTS - 1) {
            await sleep(UPLOAD_BACKOFF_MS[Math.min(attempt, UPLOAD_BACKOFF_MS.length - 1)]);
          }
        }
      }
      if (data === null) throw lastErr ?? new Error("Transcription failed");
      // PATIENT-SAFETY: bail out if the recording session has been replaced
      // (e.g. user discarded then started a new recording for a different
      // patient). Late results from the prior session must NOT be written
      // into the current session's shared maps/state.
      if (session !== recordingSessionRef.current) return;
      transcribedSegmentsRef.current.set(segIdx, data.transcription ?? "");
      transcribedUtterancesRef.current.set(segIdx, data.utterances ?? null);
       updateCaptureDiagnosticStt(
         segIdx,
         data.sourceStatus === "empty" ? "empty" : "completed",
         data.transcription ?? null,
       );
      setSegmentsDone(d => d + 1);

      // Update live transcript so subscribers (dock, encounter editor) see it
      if (!recordingStoppedRef.current) {
        const partialIndices = Array.from(transcribedSegmentsRef.current.keys()).sort((a, b) => a - b);
        const partialText = partialIndices
          .map(i => transcribedSegmentsRef.current.get(i) ?? "")
          .filter(Boolean)
          .join(" ")
          .trim();
        const base = preExistingTranscriptRef.current;
        setLiveTranscript(base ? base + "\n\n" + partialText : partialText);
      }
    } catch (err: any) {
      if (session !== recordingSessionRef.current) return;
      if (captureFailed) {
        // The server persisted an explicit audio_capture_failed provenance slot.
        // Never retry or fabricate replacement dialogue for an invalid capture.
        transcribedSegmentsRef.current.set(segIdx, gapMarker(segIdx));
        transcribedUtterancesRef.current.set(segIdx, null);
         updateCaptureDiagnosticStt(segIdx, "audio_capture_failed");
        setSegmentsDone(d => d + 1);
        toast({
          variant: "destructive",
          title: `Segment ${segIdx + 1} audio capture failed`,
          description: "The audio container was invalid and was not sent to transcription. The authoritative transcript marks this segment as an audio gap.",
          duration: 10000,
        });
        return;
      }
      // All retries exhausted. Write an EXPLICIT gap marker (never a silent
      // empty string) and keep the raw blob so finalize() can try once more.
      transcribedSegmentsRef.current.set(segIdx, gapMarker(segIdx));
      transcribedUtterancesRef.current.set(segIdx, null);
       updateCaptureDiagnosticStt(segIdx, "failed");
      failedSegmentBlobsRef.current.set(segIdx, { blob, capture });
      setSegmentsDone(d => d + 1);
      toast({
        variant: "destructive",
        title: `Segment ${segIdx + 1} failed after ${MAX_UPLOAD_ATTEMPTS} attempts`,
        description: "One minute of audio could not be transcribed yet. A final retry will run when you stop the recording; any remaining gap will be clearly marked in the transcript.",
        duration: 10000,
      });
    } finally {
      if (session === recordingSessionRef.current) {
        pendingSegmentsRef.current -= 1;
        settleAfterStop(session);
      }
    }
  }, [settleAfterStop, toast, updateCaptureDiagnosticStt, uploadSegmentOnce]);

  const startSegmentRecorder = useCallback((stream: MediaStream) => {
    const segIdx = segmentIndexRef.current;
    const session = recordingSessionRef.current;
    const localChunks: Blob[] = [];
    const mimeType = mimeTypeRef.current;
    const captureStartedAt = new Date();
    let receivedDataEvent = false;
    const mr = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 16000,
    });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      receivedDataEvent = true;
      if (e.data.size > 0) localChunks.push(e.data);
    };
    mr.onstop = () => {
      // PATIENT-SAFETY: bail BEFORE touching pendingFlushesRef. resetAll()
      // already zeroed the counter on discard, and a new session may have
      // its own non-zero count we must not decrement on its behalf.
      if (session !== recordingSessionRef.current) return;
      if (pendingFlushesRef.current > 0) pendingFlushesRef.current -= 1;
      if (mediaRecorderRef.current === mr) mediaRecorderRef.current = null;
      // A browser that emits a dataavailable event with an empty Blob is a
      // real invalid capture and must be persisted/fail-closed. A recorder
      // that never emitted any data event at all, however, represents no
      // capture slot (for example an immediate stop of a just-started next
      // segment), so it must not create a false gap.
      if (!receivedDataEvent) {
        // The independent flush timer owns recorder restart. Even an onstop
        // without data must not start another recorder from this callback.
        if (recordingStoppedRef.current) {
          settleAfterStop(session);
        }
        return;
      }
      const blob = new Blob(localChunks, { type: mimeType || "audio/webm" });
      const capture: CaptureMetadata = {
        startedAt: captureStartedAt,
        endedAt: new Date(),
        durationMs: Math.max(0, Date.now() - captureStartedAt.getTime()),
        mimeType: blob.type || mimeType || "audio/webm",
      };
      // Diagnostic only: this retains a browser-memory URL for the exact
      // assembled Blob below. It is never uploaded separately, transformed,
      // persisted, or included in the clinical transcript.
      saveCaptureDiagnostic(blob, segIdx, capture);
      pendingSegmentsRef.current += 1;
      setSegmentsTotal(t => t + 1);
      transcribeSegment(blob, segIdx, session, capture);
    };

    mr.start(1000);
  }, [releaseWakeLock, saveCaptureDiagnostic, settleAfterStop, transcribeSegment]);
  startSegmentRecorderRef.current = startSegmentRecorder;

  const flushSegment = useCallback((stream: MediaStream) => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    const session = recordingSessionRef.current;
    segmentIndexRef.current += 1;
    pendingFlushesRef.current += 1;
    try { mr.stop(); }
    catch { pendingFlushesRef.current = Math.max(0, pendingFlushesRef.current - 1); }
    // Preserve the known-working transition: stopping the current recorder
    // schedules the next recorder independently of the prior onstop callback.
    // The prior onstop still assembles and uploads its own captured Blob.
    setTimeout(() => {
      if (session !== recordingSessionRef.current) return;
      if (recordingStoppedRef.current || !streamRef.current) return;

      const failRecording = (err: any) => {
        recordingAbortedRef.current = true;
        recordingStoppedRef.current = true;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null; }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        releaseWakeLock();
        setErrorMessage(err?.message || "Recording was interrupted and could not resume.");
        setState("error");
      };

      const tryRestart = (attempt: number) => {
        if (session !== recordingSessionRef.current) return;
        if (recordingStoppedRef.current || !streamRef.current) return;
        try {
          startSegmentRecorder(stream);
        } catch (err: any) {
          if (attempt < 3) {
            setTimeout(() => tryRestart(attempt + 1), 500 * attempt);
            return;
          }
          failRecording(err);
        }
      };

      tryRestart(1);
    }, 150);
  }, [releaseWakeLock, startSegmentRecorder]);

  const start = useCallback(async (params: StartRecordingParams): Promise<boolean> => {
    if (stateRef.current !== "idle") {
      toast({
        variant: "destructive",
        title: "Recording already in progress",
        description: "Stop the current recording before starting a new one.",
      });
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({
        variant: "destructive",
        title: "Microphone access denied",
        description: "Please allow microphone access in your browser settings and try again.",
      });
      return false;
    }

    // PATIENT-SAFETY: bump the session BEFORE wiring up new refs/recorder so
    // any in-flight callbacks from a prior (discarded/aborted) session see a
    // stale session id and bail.
    recordingSessionRef.current += 1;
    sourceSessionIdRef.current = globalThis.crypto?.randomUUID?.()
      ?? `recording-${recordingSessionRef.current}-${Math.random().toString(36).slice(2)}`;

    streamRef.current = stream;
    segmentIndexRef.current = 0;
    pendingSegmentsRef.current = 0;
    recordingStoppedRef.current = false;
    finalizedRef.current = false;
    recordingAbortedRef.current = false;
    failedSegmentBlobsRef.current.clear();
    transcribedSegmentsRef.current.clear();
    transcribedUtterancesRef.current.clear();
    boundPatientIdRef.current = params.patientId;
    boundEncounterIdRef.current = params.encounterId;
    visitTypeRef.current = params.visitType || "follow-up";
    preExistingTranscriptRef.current = params.preExistingTranscript || "";

    setBoundPatientId(params.patientId);
    setBoundPatientName(params.patientName);
    setBoundEncounterId(params.encounterId);
    setVisitType(params.visitType || "follow-up");
    setElapsed(0);
    setSegmentsDone(0);
    setSegmentsTotal(0);
    setLiveTranscript(params.preExistingTranscript || "");
    setFinalTranscript("");
    setTranscriptSource(null);
    setFinalUtterances(null);
    clearCaptureDiagnostics();
    setErrorMessage(null);

    mimeTypeRef.current = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";

    setCaptureInputDevice(captureDiagnosticRuntimeEnabled ? describeCaptureInputDevice(stream) : null);
    if (captureDiagnosticRuntimeEnabled) {
      startMicrophoneSignalDiagnostic(stream);
    }
    startSegmentRecorder(stream);
    setState("recording");

    timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    segmentTimerRef.current = setInterval(() => {
      if (!recordingStoppedRef.current && streamRef.current) {
        flushSegment(streamRef.current);
      }
    }, SEGMENT_MS);

    acquireWakeLock();
    return true;
  }, [acquireWakeLock, captureDiagnosticRuntimeEnabled, clearCaptureDiagnostics, describeCaptureInputDevice, flushSegment, startMicrophoneSignalDiagnostic, startSegmentRecorder, toast]);

  const stop = useCallback(() => {
    if (stateRef.current !== "recording") return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null; }
    releaseWakeLock();
    stopMicrophoneSignalDiagnostic();
    recordingStoppedRef.current = true;
    setState("transcribing");

    const session = recordingSessionRef.current;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      // Active recorder — its onstop will bump pendingFlushesRef→0 and route
      // finalize via transcribeSegment's finally (or directly if no chunks).
      pendingFlushesRef.current += 1;
      try { mr.stop(); }
      catch { pendingFlushesRef.current = Math.max(0, pendingFlushesRef.current - 1); }
    } else if (pendingFlushesRef.current === 0 && pendingSegmentsRef.current === 0) {
      // Either no recorder ever started, OR we're cleanly between a finished
      // flush and the next segment with no in-flight work. Safe to finalize
      // directly — otherwise we'd hang in 'transcribing' forever.
      finalize(session);
    }
    // Else: an in-flight flush or transcribe will reach the settle gate through
    // onstop / transcribeSegment.finally. That gate ends the stream only after
    // the final capture and retry lifecycle has settled.
    settleAfterStop(session);
  }, [finalize, releaseWakeLock, settleAfterStop, stopMicrophoneSignalDiagnostic]);

  const discard = useCallback(() => {
    // Hard-stop everything; do NOT persist any transcript.
    // PATIENT-SAFETY: bump the session FIRST so any in-flight
    // onstop/transcribeSegment/setTimeout callbacks see a stale session
    // and bail before mutating shared maps/state. resetAll() then clears
    // the refs cleanly without a window for prior-session contamination.
    recordingSessionRef.current += 1;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null; }
    releaseWakeLock();
    recordingStoppedRef.current = true;
    finalizedRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    resetAll();
  }, [releaseWakeLock, resetAll]);

  const dismissReview = useCallback(() => {
    if (stateRef.current !== "review" && stateRef.current !== "error") return;
    resetAll();
  }, [resetAll]);

  const value: RecordingContextValue = {
    state,
    boundPatientId,
    boundPatientName,
    boundEncounterId,
    visitType,
    elapsed,
    segmentsDone,
    segmentsTotal,
    liveTranscript,
    finalTranscript,
    transcriptSource,
    finalUtterances,
    captureDiagnostics,
    captureInputDevice,
    microphoneSignalDiagnostic,
    audioCaptureDiagnosticStatus,
    errorMessage,
    start,
    stop,
    discard,
    dismissReview,
  };

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}
