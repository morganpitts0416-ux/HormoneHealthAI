import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DiarizedUtterance } from "@shared/schema";

export type RecordingState = "idle" | "recording" | "transcribing" | "review" | "error";

const SEGMENT_MS = 60_000;

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
  finalTranscript: string;
  finalUtterances: DiarizedUtterance[] | null;
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
  const [finalUtterances, setFinalUtterances] = useState<DiarizedUtterance[] | null>(null);
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
  // Counts MediaRecorder.stop() calls whose onstop has not yet fired.
  // Used so stop() can wait for an in-flight mid-segment flush to land
  // (and bump pendingSegmentsRef from onstop) before deciding to finalize.
  const pendingFlushesRef = useRef(0);
  const recordingStoppedRef = useRef(false);
  const finalizedRef = useRef(false);

  // PATIENT-SAFETY: Every start() bumps this generation counter. Async callbacks
  // (onstop, transcribeSegment, finalize, flushSegment timeouts) capture the
  // session at scheduling time and refuse to mutate state if the session is
  // stale. This prevents late results from a discarded recording from leaking
  // into a subsequent recording bound to a DIFFERENT patient/encounter.
  const recordingSessionRef = useRef(0);

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

  // Cleanup on unmount (i.e. full app teardown)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  // Reset all internal state — call after review/discard/error dismiss
  const resetAll = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    releaseWakeLock();
    mediaRecorderRef.current = null;
    transcribedSegmentsRef.current.clear();
    transcribedUtterancesRef.current.clear();
    segmentIndexRef.current = 0;
    pendingSegmentsRef.current = 0;
    pendingFlushesRef.current = 0;
    recordingStoppedRef.current = false;
    finalizedRef.current = false;
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
    setFinalUtterances(null);
    setErrorMessage(null);
    setState("idle");
  }, [releaseWakeLock]);

  // Once all segments have been transcribed AND recording has stopped, persist
  // the final transcript to the bound encounter and switch to review state.
  // `session` is the recording generation captured by the caller; if it no
  // longer matches the current session the recording was discarded/restarted
  // and we MUST NOT persist anything from the prior session.
  const finalize = useCallback(async (session: number) => {
    if (session !== recordingSessionRef.current) return;
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    // Collect segment indices in ascending order
    const indices = Array.from(transcribedSegmentsRef.current.keys()).sort((a, b) => a - b);
    const allText: string[] = [];
    const allUtterances: DiarizedUtterance[] = [];
    let utteranceIdOffset = 0;
    for (const i of indices) {
      const t = transcribedSegmentsRef.current.get(i) ?? "";
      if (t) allText.push(t);
      const u = transcribedUtterancesRef.current.get(i);
      if (u) {
        u.forEach(ut => allUtterances.push({ ...ut, id: ut.id + utteranceIdOffset }));
        utteranceIdOffset += u.length;
      }
    }
    const newText = allText.join(" ").trim();
    const utterances = allUtterances.length > 0 ? allUtterances : null;
    const base = preExistingTranscriptRef.current;
    const fullTranscript = base ? base + "\n\n" + newText : newText;

    setFinalTranscript(fullTranscript);
    setFinalUtterances(utterances);

    const encounterId = boundEncounterIdRef.current;
    const patientId = boundPatientIdRef.current;

    if (encounterId && patientId) {
      try {
        // PATIENT-SAFETY: always send expectedPatientId so the server's
        // 409 tripwire prevents writing this transcript to the wrong chart
        // even if the bound encounter was reassigned by a concurrent edit.
        const body: any = {
          transcription: fullTranscript || null,
          expectedPatientId: patientId,
        };
        if (utterances) body.diarizedTranscript = utterances;
        await apiRequest("PUT", `/api/encounters/${encounterId}`, body);
        // PATIENT-SAFETY: post-await guard — if the user discarded (or the
        // app started a new recording) while the PUT was in flight, do NOT
        // overwrite the new session's state with this prior session's
        // success/error. The PUT already used the prior session's bound
        // ids so the server stored it correctly; just don't surface UI.
        if (session !== recordingSessionRef.current) return;
        // Refresh the open notes / encounter detail caches so any visible
        // editor or list reflects the saved transcript.
        queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId] });
        queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
        queryClient.invalidateQueries({ queryKey: ["/api/encounters/open"] });
      } catch (err: any) {
        if (session !== recordingSessionRef.current) return;
        setErrorMessage(err?.message || "Failed to save transcript to encounter");
        setState("error");
        return;
      }
    }

    if (session !== recordingSessionRef.current) return;
    setState("review");
  }, []);

  const transcribeSegment = useCallback(async (blob: Blob, segIdx: number, session: number) => {
    const ext = (blob.type || "audio/webm").includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `seg-${segIdx}.${ext}`, { type: blob.type || "audio/webm" });
    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("visitType", visitTypeRef.current);
      const res = await fetch("/api/encounters/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Transcription failed");
      }
      const data = await res.json();
      // PATIENT-SAFETY: bail out if the recording session has been replaced
      // (e.g. user discarded then started a new recording for a different
      // patient). Late results from the prior session must NOT be written
      // into the current session's shared maps/state.
      if (session !== recordingSessionRef.current) return;
      transcribedSegmentsRef.current.set(segIdx, data.transcription ?? "");
      transcribedUtterancesRef.current.set(segIdx, data.utterances ?? null);
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
      transcribedSegmentsRef.current.set(segIdx, "");
      transcribedUtterancesRef.current.set(segIdx, null);
      setSegmentsDone(d => d + 1);
      toast({
        variant: "destructive",
        title: `Segment ${segIdx + 1} failed`,
        description: err?.message || "One recording segment could not be transcribed.",
      });
    } finally {
      if (session === recordingSessionRef.current) {
        pendingSegmentsRef.current -= 1;
        if (recordingStoppedRef.current && pendingSegmentsRef.current === 0) {
          finalize(session);
        }
      }
    }
  }, [toast, finalize]);

  const startSegmentRecorder = useCallback((stream: MediaStream) => {
    const segIdx = segmentIndexRef.current;
    const session = recordingSessionRef.current;
    const localChunks: Blob[] = [];
    const mimeType = mimeTypeRef.current;
    const mr = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 16000,
    });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data.size > 0) localChunks.push(e.data); };
    mr.onstop = () => {
      // PATIENT-SAFETY: bail BEFORE touching pendingFlushesRef. resetAll()
      // already zeroed the counter on discard, and a new session may have
      // its own non-zero count we must not decrement on its behalf.
      if (session !== recordingSessionRef.current) return;
      if (pendingFlushesRef.current > 0) pendingFlushesRef.current -= 1;
      if (localChunks.length === 0) {
        if (recordingStoppedRef.current && pendingSegmentsRef.current === 0 && pendingFlushesRef.current === 0) {
          finalize(session);
        }
        return;
      }
      const blob = new Blob(localChunks, { type: mimeType || "audio/webm" });
      pendingSegmentsRef.current += 1;
      setSegmentsTotal(t => t + 1);
      transcribeSegment(blob, segIdx, session);
    };

    mr.start(1000);
  }, [finalize, transcribeSegment]);

  const flushSegment = useCallback((stream: MediaStream) => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    const session = recordingSessionRef.current;
    segmentIndexRef.current += 1;
    pendingFlushesRef.current += 1;
    try { mr.stop(); }
    catch { pendingFlushesRef.current = Math.max(0, pendingFlushesRef.current - 1); }
    setTimeout(() => {
      // PATIENT-SAFETY: only restart if we're still the active session AND
      // the user hasn't stopped/discarded.
      if (session !== recordingSessionRef.current) return;
      if (!recordingStoppedRef.current && streamRef.current) {
        try {
          startSegmentRecorder(stream);
        } catch (err: any) {
          // Recorder failed to restart mid-recording. Tear everything down
          // immediately so we don't leak mic tracks / wake lock / timers
          // while the error banner is shown.
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
        }
      }
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

    streamRef.current = stream;
    segmentIndexRef.current = 0;
    pendingSegmentsRef.current = 0;
    recordingStoppedRef.current = false;
    finalizedRef.current = false;
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
    setFinalUtterances(null);
    setErrorMessage(null);

    mimeTypeRef.current = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";

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
  }, [acquireWakeLock, flushSegment, startSegmentRecorder, toast]);

  const stop = useCallback(() => {
    if (stateRef.current !== "recording") return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null; }
    releaseWakeLock();
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
    // Else: an in-flight flush or transcribe will reach finalize through the
    // recordingStoppedRef + pendingFlushesRef + pendingSegmentsRef === 0 gate
    // in onstop / transcribeSegment.finally.

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, [finalize, releaseWakeLock]);

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
    finalUtterances,
    errorMessage,
    start,
    stop,
    discard,
    dismissReview,
  };

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}
