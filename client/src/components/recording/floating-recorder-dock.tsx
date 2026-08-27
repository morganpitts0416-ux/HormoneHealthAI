import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Mic, Square, ChevronDown, ChevronUp, X, ExternalLink, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { useRecording } from "@/contexts/recording-context";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function FloatingRecorderDock() {
  const recording = useRecording();
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Auto-dismiss the review banner after 30 s so it doesn't linger
  useEffect(() => {
    if (recording.state !== "review") return;
    const t = setTimeout(() => recording.dismissReview(), 30_000);
    return () => clearTimeout(t);
  }, [recording.state, recording.dismissReview]);

  if (recording.state === "idle") return null;

  const isRecording = recording.state === "recording";
  const isTranscribing = recording.state === "transcribing";
  const isReview = recording.state === "review";
  const isError = recording.state === "error";
  const microphoneSignal = recording.microphoneSignalDiagnostic;
  const microphoneLevelPercent = microphoneSignal
    ? Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(microphoneSignal.rms, 0.000_001)) + 60) / 60) * 100))
    : 0;

  const goToEncounter = () => {
    if (recording.boundEncounterId) {
      setLocation(`/encounters?encounterId=${recording.boundEncounterId}`);
    }
  };

  const accent = isError ? "#9c2a2a" : isReview ? "#2e3a20" : "#9c2a2a";
  const bgTop = isError ? "#fdecec" : isReview ? "#edf4e4" : "#fff";

  return (
    <div
      data-testid="floating-recorder-dock"
      className="fixed z-[80] shadow-xl"
      style={{
        bottom: "1rem",
        left: "1rem",
        width: expanded ? "min(380px, calc(100vw - 2rem))" : "min(320px, calc(100vw - 2rem))",
        backgroundColor: "#ffffff",
        border: "1px solid #d4c9b5",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ backgroundColor: bgTop, borderColor: "#ede8df" }}
      >
        {isRecording && (
          <span
            className="inline-block w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0"
            style={{ backgroundColor: "#dc2626" }}
            aria-label="recording"
          />
        )}
        {isTranscribing && (
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: "#a06a08" }} />
        )}
        {isReview && (
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#2e3a20" }} />
        )}
        {isError && (
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#9c2a2a" }} />
        )}

        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: "#1c2414" }}>
            {isRecording && "Recording"}
            {isTranscribing && "Transcribing…"}
            {isReview && "Encounter saved"}
            {isError && "Save failed"}
            {recording.boundPatientName && (
              <>
                <span style={{ color: "#7a8a64" }}> · </span>
                <span data-testid="text-recorder-patient">{recording.boundPatientName}</span>
              </>
            )}
          </div>
          {isRecording && (
            <div className="text-[11px] tabular-nums" style={{ color: "#7a8a64" }}>
              {fmtTime(recording.elapsed)}
              {recording.segmentsDone > 0 && (
                <> · {recording.segmentsDone} segment{recording.segmentsDone !== 1 ? "s" : ""} transcribed</>
              )}
            </div>
          )}
          {isTranscribing && (
            <div className="text-[11px]" style={{ color: "#7a8a64" }}>
              {recording.segmentsTotal > 0
                ? `${recording.segmentsDone} of ${recording.segmentsTotal} segments processed`
                : "Finalizing…"}
            </div>
          )}
        </div>

          <div
            className="max-w-[128px] text-right text-[10px] leading-tight"
            style={{ color: recording.audioCaptureDiagnosticStatus.enabled ? "#557a38" : "#7a8a64" }}
            data-testid="audio-capture-diagnostic-status"
          >
            {recording.audioCaptureDiagnosticStatus.enabled
              ? "Audio diagnostic: ENABLED"
              : `Audio diagnostic: DISABLED — ${recording.audioCaptureDiagnosticStatus.reason}`}
          </div>

        {isRecording && microphoneSignal && (
          <div
            className="w-12 flex-shrink-0"
            title={`Mic RMS ${microphoneSignal.rms.toFixed(4)} · peak ${microphoneSignal.peak.toFixed(4)}`}
            data-testid="microphone-signal-meter"
          >
            <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "#e4e8dc" }}>
              <div
                className="h-full rounded-full transition-[width] duration-100"
                style={{ width: `${microphoneLevelPercent}%`, backgroundColor: microphoneSignal.error ? "#9c2a2a" : "#557a38" }}
              />
            </div>
          </div>
        )}

        {!isError && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setExpanded(e => !e)}
            data-testid="button-recorder-expand"
            aria-label={expanded ? "Collapse recorder" : "Expand recorder"}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </Button>
        )}
      </div>

      {/* Body — only when expanded OR for review/error */}
      {(expanded || isReview || isError) && (
        <div className="px-3 py-2.5 space-y-2.5">
          {/* Live transcript preview */}
          {expanded && (isRecording || isTranscribing) && recording.liveTranscript && (
            <div
              className="text-[12px] leading-snug max-h-28 overflow-y-auto rounded-md px-2.5 py-2 border"
              style={{ backgroundColor: "#faf8f5", borderColor: "#ede8df", color: "#3a4630" }}
              data-testid="text-recorder-live-transcript"
            >
              {recording.liveTranscript.split("\n").slice(-6).join("\n")}
            </div>
          )}

          {expanded && isRecording && !recording.liveTranscript && (
            <div className="text-[11px] italic px-1" style={{ color: "#9aaa84" }}>
              Live transcript appears as each segment is processed (about every minute).
            </div>
          )}

          {expanded && isRecording && microphoneSignal && (
            <div
              className="rounded-md px-2.5 py-2 border space-y-1"
              style={{ backgroundColor: "#edf4e4", borderColor: "#b8c9a6", color: "#35492a" }}
              data-testid="microphone-signal-diagnostic"
            >
              <p className="text-[11px] font-semibold">
                Microphone signal — same stream as recorder
              </p>
              <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "#d9e6cc" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-100"
                  style={{ width: `${microphoneLevelPercent}%`, backgroundColor: microphoneSignal.error ? "#9c2a2a" : "#557a38" }}
                />
              </div>
              <p className="text-[10px] tabular-nums">
                RMS {microphoneSignal.rms.toFixed(4)} · peak {microphoneSignal.peak.toFixed(4)}
              </p>
              <p className="text-[10px] leading-snug">
                Track: enabled {String(microphoneSignal.trackEnabled)} · muted {String(microphoneSignal.trackMuted)} · {microphoneSignal.trackReadyState || "unknown"}
                {" · "}Stream active {String(microphoneSignal.streamActive)}
                {" · "}AudioContext {microphoneSignal.audioContextState || "unknown"}
              </p>
              {recording.captureInputDevice && (
                <p className="text-[10px] leading-snug">
                  Input: {recording.captureInputDevice.label || "browser did not expose a microphone label"}
                  {recording.captureInputDevice.deviceId ? ` · device ${recording.captureInputDevice.deviceId}` : ""}
                  {recording.captureInputDevice.sampleRate ? ` · ${recording.captureInputDevice.sampleRate} Hz` : ""}
                  {recording.captureInputDevice.channelCount ? ` · ${recording.captureInputDevice.channelCount} channel${recording.captureInputDevice.channelCount === 1 ? "" : "s"}` : ""}
                </p>
              )}
              {microphoneSignal.error && (
                <p className="text-[10px]" style={{ color: "#9c2a2a" }}>{microphoneSignal.error}</p>
              )}
              {microphoneSignal.transitions.length > 0 && (
                <div className="border-t pt-1" style={{ borderColor: "#c9d9b8" }}>
                  <p className="text-[10px] font-medium">State transitions</p>
                  {microphoneSignal.transitions.map((transition, index) => (
                    <p key={`${transition}-${index}`} className="text-[10px] leading-snug">{transition}</p>
                  ))}
                </div>
              )}
              <p className="text-[10px] leading-snug">
                This meter is browser-memory only. It does not record, upload, or store additional audio.
              </p>
            </div>
          )}

          {recording.captureDiagnostics.length > 0 && (
            <div
              className="rounded-md px-2.5 py-2 border space-y-1.5"
              style={{ backgroundColor: "#fff7e8", borderColor: "#d6a24a", color: "#5f430e" }}
              data-testid="capture-audio-diagnostic"
            >
              <p className="text-[11px] font-semibold">
                Capture diagnostic — local browser audio only
              </p>
              {recording.captureInputDevice && (
                <p className="text-[10px] leading-snug">
                  Input: {recording.captureInputDevice.label || "browser did not expose a microphone label"}
                  {recording.captureInputDevice.deviceId ? ` · device ${recording.captureInputDevice.deviceId}` : ""}
                  {recording.captureInputDevice.sampleRate ? ` · ${recording.captureInputDevice.sampleRate} Hz` : ""}
                  {recording.captureInputDevice.channelCount ? ` · ${recording.captureInputDevice.channelCount} channel${recording.captureInputDevice.channelCount === 1 ? "" : "s"}` : ""}
                </p>
              )}
              {recording.captureDiagnostics.map((diagnostic) => (
                <div key={diagnostic.url} className="border-t pt-1.5 space-y-1" style={{ borderColor: "#e6c987" }}>
                  <p className="text-[10px] leading-snug">
                    Segment {diagnostic.segmentIndex + 1} · {(diagnostic.durationMs / 1000).toFixed(1)} sec · {diagnostic.byteLength.toLocaleString()} bytes · {diagnostic.mimeType || "unknown MIME"}
                  </p>
                  <audio
                    controls
                    preload="metadata"
                    src={diagnostic.url}
                    className="w-full h-8"
                    data-testid={`audio-capture-diagnostic-player-${diagnostic.segmentIndex}`}
                  />
                  <p className="text-[10px] leading-snug">
                    STT: {diagnostic.sttStatus === "pending"
                      ? "pending"
                      : diagnostic.sttText?.trim() || diagnostic.sttStatus}
                  </p>
                </div>
              ))}
              <p className="text-[10px] leading-snug">
                Each player uses the exact assembled Blob passed to transcription. Audio stays only in this browser tab and is removed when the recording is dismissed.
              </p>
            </div>
          )}

          {isReview && (
            <p className="text-[12px]" style={{ color: "#3a4630" }}>
              The transcript was saved to this patient's encounter. You can open it now to review and generate a SOAP note.
            </p>
          )}

          {isError && (
            <p className="text-[12px]" style={{ color: "#7a2020" }}>
              {recording.errorMessage || "We couldn't save the transcript. Your audio was captured — please open the encounter and try again."}
            </p>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t" style={{ borderColor: "#ede8df", backgroundColor: "#faf8f5" }}>
        {(isRecording || isTranscribing) && !confirmDiscard && (
          <>
            <Button
              size="sm"
              onClick={recording.stop}
              disabled={!isRecording}
              data-testid="button-recorder-stop"
              className="gap-1.5"
              style={{ backgroundColor: accent, color: "#fff" }}
            >
              <Square className="w-3 h-3" fill="currentColor" />
              Stop
            </Button>
            {recording.boundEncounterId && (
              <Button
                size="sm"
                variant="outline"
                onClick={goToEncounter}
                data-testid="button-recorder-open-encounter"
                className="gap-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                Open
              </Button>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDiscard(true)}
              data-testid="button-recorder-discard"
              style={{ color: "#7a8a64" }}
            >
              Discard
            </Button>
          </>
        )}

        {(isRecording || isTranscribing) && confirmDiscard && (
          <>
            <span className="text-[11px] flex-1" style={{ color: "#7a2020" }}>
              Discard this recording?
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDiscard(false)}
              data-testid="button-recorder-discard-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => { setConfirmDiscard(false); recording.discard(); }}
              data-testid="button-recorder-discard-confirm"
              style={{ backgroundColor: "#9c2a2a", color: "#fff" }}
            >
              Discard
            </Button>
          </>
        )}

        {isReview && (
          <>
            <Button
              size="sm"
              onClick={() => { goToEncounter(); recording.dismissReview(); }}
              data-testid="button-recorder-review-open"
              className="gap-1.5"
              style={{ backgroundColor: "#2e3a20", color: "#fff" }}
            >
              <ExternalLink className="w-3 h-3" />
              Open encounter
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={recording.dismissReview}
              data-testid="button-recorder-review-dismiss"
              style={{ color: "#7a8a64" }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </>
        )}

        {isError && (
          <>
            <Button
              size="sm"
              onClick={goToEncounter}
              data-testid="button-recorder-error-open"
              className="gap-1.5"
              style={{ backgroundColor: "#9c2a2a", color: "#fff" }}
            >
              <RefreshCw className="w-3 h-3" />
              Open encounter
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={recording.dismissReview}
              data-testid="button-recorder-error-dismiss"
              style={{ color: "#7a8a64" }}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
