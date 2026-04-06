import { useState, useRef, useCallback, useEffect, Component, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import {
  Mic, Upload, FileText, FlaskConical, ChevronLeft, Plus,
  Sparkles, Send, CheckCircle2, Circle, AlertCircle, Trash2,
  Save, Eye, EyeOff, Calendar, User, Stethoscope, ClipboardList,
  ChevronRight, RefreshCw, X, BookOpen, Download, Clock,
  TriangleAlert, ExternalLink, Square, MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import type { Patient, LabResult, ClinicalEncounter } from "@shared/schema";

type EncounterWithPatient = ClinicalEncounter & { patientName: string };

// Error boundary to catch rendering crashes and show a message instead of a blank screen
class EncounterErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <div>
            <p className="font-semibold text-sm">Something went wrong loading this encounter</p>
            <p className="text-xs text-muted-foreground mt-1">{this.state.error}</p>
          </div>
          <button className="text-xs underline text-muted-foreground" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Safe UTC date display — avoids the off-by-one-day bug from UTC midnight
function displayDate(dateStr: string | Date, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const d = new Date(dateStr as string);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return "Unknown date";
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}

const VISIT_TYPES = [
  { value: "new-patient", label: "New Patient" },
  { value: "follow-up", label: "Follow-up" },
  { value: "acute", label: "Acute Visit" },
  { value: "wellness", label: "Wellness / Annual" },
  { value: "procedure", label: "Procedure" },
  { value: "telemedicine", label: "Telemedicine" },
  { value: "lab-review", label: "Lab Review" },
];

// ── Status helpers ─────────────────────────────────────────────────────────────
function EncounterStatusBadges({ enc }: { enc: EncounterWithPatient }) {
  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      <Badge variant="outline" className="text-[10px] py-0 h-4">
        {VISIT_TYPES.find(v => v.value === enc.visitType)?.label ?? enc.visitType}
      </Badge>
      {enc.transcription && (
        <Badge variant="outline" className="text-[10px] py-0 h-4 text-blue-600 border-blue-200">
          Transcribed
        </Badge>
      )}
      {enc.soapNote && (
        <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-200">
          SOAP
        </Badge>
      )}
      {enc.summaryPublished ? (
        <Badge variant="outline" className="text-[10px] py-0 h-4 text-violet-600 border-violet-200">
          Published
        </Badge>
      ) : enc.patientSummary ? (
        <Badge variant="outline" className="text-[10px] py-0 h-4 text-amber-600 border-amber-200">
          Draft Summary
        </Badge>
      ) : null}
    </div>
  );
}

// ── Encounter List Item ───────────────────────────────────────────────────────
function EncounterListItem({
  enc, isSelected, onClick,
}: {
  enc: EncounterWithPatient;
  isSelected: boolean;
  onClick: () => void;
}) {
  const nameParts = (enc.patientName || "Unknown Patient").split(" ");
  const initials = nameParts.map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button
      data-testid={`encounter-item-${enc.id}`}
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-md transition-colors ${isSelected ? "bg-[#e8ddd0]" : "hover-elevate"}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white mt-0.5" style={{ background: "#7a8a64" }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{enc.patientName}</div>
          <div className="text-xs text-muted-foreground">{displayDate(enc.visitDate as unknown as string)}</div>
          {enc.chiefComplaint && (
            <div className="text-xs text-muted-foreground truncate mt-0.5 italic">"{enc.chiefComplaint}"</div>
          )}
          <EncounterStatusBadges enc={enc} />
        </div>
      </div>
    </button>
  );
}

// ── Audio Recorder + Upload Component ────────────────────────────────────────
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type RecorderState = "idle" | "recording" | "transcribing";

function AudioCapture({
  onTranscribed,
  onStateChange,
}: {
  onTranscribed: (text: string) => void;
  onStateChange: (state: RecorderState) => void;
}) {
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [recState, setRecState] = useState<"idle" | "recording" | "stopped">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Keep parent in sync with recorder state
  useEffect(() => {
    if (isTranscribing) { onStateChange("transcribing"); return; }
    if (recState === "recording") { onStateChange("recording"); return; }
    onStateChange("idle");
  }, [recState, isTranscribing]);

  const sendToWhisper = async (file: File) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch("/api/encounters/transcribe", {
        method: "POST", body: formData, credentials: "include",
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Transcription failed"); }
      const data = await res.json();
      onTranscribed(data.transcription);
      setRecState("idle");
      setElapsed(0);
      setUploadFile(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Transcription failed", description: err.message || "Please try again or paste notes manually." });
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      setElapsed(0);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const ext = (mr.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `session.${ext}`, { type: blob.type });
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        sendToWhisper(file);
      };

      mr.start(1000);
      setRecState("recording");
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } catch {
      toast({ variant: "destructive", title: "Microphone access denied", description: "Please allow microphone access in your browser settings and try again." });
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecState("stopped");
  };

  const handleUploadFile = (f: File) => {
    if (!f.type.startsWith("audio/") && !f.name.match(/\.(mp3|wav|ogg|m4a|webm|mp4|flac)$/i)) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please upload an audio file (MP3, WAV, M4A, WebM, etc.)" });
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Audio files must be under 200 MB." });
      return;
    }
    setUploadFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleUploadFile(f);
  }, []);

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-md w-fit">
        <button data-testid="button-mode-record" onClick={() => setMode("record")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${mode === "record" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Mic className="w-3.5 h-3.5" />Record
        </button>
        <button data-testid="button-mode-upload" onClick={() => setMode("upload")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${mode === "upload" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Upload className="w-3.5 h-3.5" />Upload File
        </button>
      </div>

      {/* RECORD MODE */}
      {mode === "record" && (
        <div>
          {recState === "idle" && !isTranscribing && (
            <Button data-testid="button-start-recording" onClick={startRecording} className="gap-2 w-full" variant="outline">
              <Mic className="w-4 h-4 text-red-500" />
              Start Recording Session
            </Button>
          )}
          {recState === "recording" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-md border-2 border-red-400/60 bg-red-50/40 dark:bg-red-950/20">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-red-600 dark:text-red-400">Recording</span>
              <span className="text-sm font-mono tabular-nums text-foreground flex-1" data-testid="recording-timer">{formatDuration(elapsed)}</span>
              <Button data-testid="button-stop-recording" variant="destructive" size="sm" onClick={stopRecording} className="gap-1.5">
                <Square className="w-3.5 h-3.5 fill-current" />Stop
              </Button>
            </div>
          )}
          {(recState === "stopped" || isTranscribing) && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-md border bg-muted/30">
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground">Transcribing session audio — notes will appear below...</span>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD MODE */}
      {mode === "upload" && (
        <div className="space-y-2">
          <div
            data-testid="audio-drop-zone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-md p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
          >
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.mp4,.flac" className="hidden"
              data-testid="input-audio-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); e.target.value = ""; }} />
            <Upload className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drop audio file or click to browse</p>
            <p className="text-xs text-muted-foreground">MP3, WAV, M4A, WebM, OGG — up to 200 MB</p>
          </div>
          {uploadFile && (
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-md">
              <Mic className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm flex-1 truncate">{uploadFile.name}</span>
              <span className="text-xs text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</span>
              <Button size="icon" variant="ghost" onClick={() => setUploadFile(null)} data-testid="button-remove-audio">
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" onClick={() => sendToWhisper(uploadFile)} disabled={isTranscribing} data-testid="button-transcribe">
                {isTranscribing ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Transcribing...</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Transcribe</>}
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
        Audio is processed by OpenAI Whisper and never stored
      </p>
    </div>
  );
}

// ── SOAP Note Section ─────────────────────────────────────────────────────────
// fullNote = new single-block format; legacy fields kept for backward compat display
type SoapNote = {
  fullNote?: string;
  subjective?: string;
  objective?: string;
  reviewOfSystems?: string;
  assessment?: string;
  plan?: string;
};

function legacySoapToText(s: SoapNote): string {
  const parts: string[] = [];
  if (s.subjective) parts.push(`SUBJECTIVE\n${s.subjective}`);
  if (s.objective) parts.push(`OBJECTIVE\n${s.objective}`);
  if (s.reviewOfSystems) parts.push(`REVIEW OF SYSTEMS\n${s.reviewOfSystems}`);
  if (s.assessment) parts.push(`ASSESSMENT\n${s.assessment}`);
  if (s.plan) parts.push(`PLAN\n${s.plan}`);
  return parts.join("\n\n");
}

function initSoap(raw: any): SoapNote {
  if (!raw) return { fullNote: "" };
  if (raw.fullNote !== undefined) return raw as SoapNote;
  // Legacy: convert old multi-field format to fullNote
  return { fullNote: legacySoapToText(raw) };
}

// ── Main Encounter Editor ─────────────────────────────────────────────────────
function EncounterEditor({
  encounter,
  patients,
  onClose,
  onDeleted,
  initialPatientId,
}: {
  encounter: EncounterWithPatient | null;
  patients: Patient[];
  onClose: () => void;
  onDeleted: () => void;
  initialPatientId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Form state
  const [patientId, setPatientId] = useState<string>(encounter?.patientId?.toString() ?? initialPatientId ?? "");
  const [visitDate, setVisitDate] = useState<string>(
    encounter ? format(new Date(encounter.visitDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );
  const [visitType, setVisitType] = useState<string>(encounter?.visitType ?? "follow-up");
  const [chiefComplaint, setChiefComplaint] = useState<string>(encounter?.chiefComplaint ?? "");
  const [clinicianNotes, setClinicianNotes] = useState<string>(encounter?.clinicianNotes ?? "");
  const [linkedLabResultId, setLinkedLabResultId] = useState<string>(
    encounter?.linkedLabResultId?.toString() ?? ""
  );
  const [transcription, setTranscription] = useState<string>(encounter?.transcription ?? "");
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [soap, setSoap] = useState<SoapNote>(initSoap(encounter?.soapNote));
  const [patientSummary, setPatientSummary] = useState<string>(encounter?.patientSummary ?? "");
  const [activeTab, setActiveTab] = useState<"details" | "soap" | "summary">("details");
  const [savedId, setSavedId] = useState<number | null>(encounter?.id ?? null);
  const [published, setPublished] = useState<boolean>(encounter?.summaryPublished ?? false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
    if (savedId) queryClient.invalidateQueries({ queryKey: ["/api/encounters", savedId] });
  };

  // Patient's lab results (for linking)
  const selectedPatientId = patientId || encounter?.patientId?.toString();
  const { data: patientLabs = [] } = useQuery<LabResult[]>({
    queryKey: ["/api/lab-results", selectedPatientId],
    queryFn: async () => {
      if (!selectedPatientId) return [];
      const res = await fetch(`/api/patients/${selectedPatientId}/labs`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatientId,
  });

  // Save / create encounter
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error("Please select a patient");
      const body = {
        patientId: parseInt(patientId),
        visitDate,
        visitType,
        chiefComplaint: chiefComplaint || null,
        linkedLabResultId: linkedLabResultId ? parseInt(linkedLabResultId) : null,
        clinicianNotes: clinicianNotes || null,
        transcription: transcription || null,
      };
      if (savedId) {
        const res = await apiRequest("PUT", `/api/encounters/${savedId}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/encounters", body);
        const data = await res.json();
        setSavedId(data.id);
        return data;
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved", description: "Encounter saved successfully." });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e.message }),
  });

  // Generate SOAP note
  const soapMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) {
        // Auto-save first
        if (!patientId) throw new Error("Please select a patient and save first");
        const body = { patientId: parseInt(patientId), visitDate, visitType, chiefComplaint: chiefComplaint || null, linkedLabResultId: linkedLabResultId ? parseInt(linkedLabResultId) : null, transcription: transcription || null };
        const saveRes = await apiRequest("POST", "/api/encounters", body);
        const saved = await saveRes.json();
        setSavedId(saved.id);
        const res = await apiRequest("POST", `/api/encounters/${saved.id}/generate-soap`, {});
        return res.json();
      }
      // Save transcription first
      await apiRequest("PUT", `/api/encounters/${savedId}`, { transcription });
      const res = await apiRequest("POST", `/api/encounters/${savedId}/generate-soap`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setSoap(data.soapNote);
      invalidate();
      setActiveTab("soap");
      toast({ title: "SOAP note generated", description: "Review and edit each section as needed." });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Generation failed", description: e.message }),
  });

  // Save SOAP edits
  const saveSoapMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Save the encounter first");
      const res = await apiRequest("PUT", `/api/encounters/${savedId}/soap`, { soapNote: soap });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "SOAP note saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e.message }),
  });

  // Generate patient summary
  const summaryMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Save the encounter first");
      const res = await apiRequest("POST", `/api/encounters/${savedId}/generate-summary`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setPatientSummary(data.patientSummary);
      invalidate();
      setActiveTab("summary");
      toast({ title: "Patient summary generated", description: "Review and edit before publishing to the portal." });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Generation failed", description: e.message }),
  });

  // Save patient summary edits
  const saveSummaryMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Save the encounter first");
      const res = await apiRequest("PUT", `/api/encounters/${savedId}/summary`, { patientSummary });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Summary saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e.message }),
  });

  // Publish / unpublish summary
  const publishMutation = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!savedId) throw new Error("Save the encounter first");
      // Save current summary text first
      if (publish) await apiRequest("PUT", `/api/encounters/${savedId}/summary`, { patientSummary });
      const res = await apiRequest("POST", `/api/encounters/${savedId}/${publish ? "publish" : "unpublish"}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setPublished(data.summaryPublished);
      invalidate();
      toast({
        title: data.summaryPublished ? "Published to patient portal" : "Unpublished from portal",
        description: data.summaryPublished ? "The patient can now view this visit summary." : "The summary has been hidden from the patient portal.",
      });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Action failed", description: e.message }),
  });

  // Delete encounter
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) return;
      await apiRequest("DELETE", `/api/encounters/${savedId}`);
    },
    onSuccess: () => { invalidate(); onDeleted(); toast({ title: "Encounter deleted" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Delete failed", description: e.message }),
  });

  const hasTranscription = transcription.trim().length > 0;
  const hasSoap = !!(soap.fullNote?.trim() || soap.assessment || soap.subjective);
  const hasSummary = patientSummary.trim().length > 0;

  const steps = [
    { id: "details", label: "Details & Transcription", done: hasTranscription, icon: Stethoscope },
    { id: "soap", label: "SOAP Note", done: hasSoap, icon: ClipboardList },
    { id: "summary", label: "Patient Summary", done: hasSummary, icon: FileText },
  ] as const;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b">
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-back-encounters">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {savedId ? (encounter?.patientName ?? (() => { const p = patients.find(p => p.id.toString() === patientId); return p ? `${p.firstName} ${p.lastName}` : "Encounter"; })()) : "New Encounter"}
          </div>
          {savedId && <div className="text-xs text-muted-foreground">{displayDate(visitDate, { month: 'long', day: 'numeric', year: 'numeric' })} · {VISIT_TYPES.find(v => v.value === visitType)?.label}</div>}
        </div>
        <div className="flex items-center gap-2">
          {savedId && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { if (confirm("Delete this encounter? This cannot be undone.")) deleteMutation.mutate(); }}
              data-testid="button-delete-encounter"
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !patientId}
            data-testid="button-save-encounter"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-0 px-5 py-2 border-b bg-muted/20">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              data-testid={`tab-${step.id}`}
              onClick={() => setActiveTab(step.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === step.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {step.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5 opacity-40" />}
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* ── Tab: Details & Transcription ────────────────────────────── */}
        {activeTab === "details" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="patient-select" className="text-xs font-medium mb-1.5 block">Patient *</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger data-testid="select-patient" id="patient-select">
                    <SelectValue placeholder="Select patient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.firstName} {p.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="visit-date" className="text-xs font-medium mb-1.5 block">Visit Date *</Label>
                <Input
                  id="visit-date"
                  type="date"
                  value={visitDate}
                  onChange={e => setVisitDate(e.target.value)}
                  data-testid="input-visit-date"
                />
              </div>
              <div>
                <Label htmlFor="visit-type" className="text-xs font-medium mb-1.5 block">Visit Type</Label>
                <Select value={visitType} onValueChange={setVisitType}>
                  <SelectTrigger data-testid="select-visit-type" id="visit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIT_TYPES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="chief-complaint" className="text-xs font-medium mb-1.5 block">Chief Complaint</Label>
                <Input
                  id="chief-complaint"
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  placeholder="e.g., Fatigue, low energy, follow-up on labs"
                  data-testid="input-chief-complaint"
                />
              </div>
            </div>

            {/* Lab Linkage */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" />
                Link Lab Results
                <span className="text-muted-foreground font-normal">(optional — AI will reference these in SOAP)</span>
              </Label>
              {selectedPatientId && patientLabs.length > 0 ? (
                <Select value={linkedLabResultId || "none"} onValueChange={(v) => setLinkedLabResultId(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-lab-result">
                    <SelectValue placeholder="Select lab panel to reference..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lab linkage</SelectItem>
                    {patientLabs.map(lab => {
                      const d = new Date(lab.labDate as unknown as string);
                      const displayLab = !isNaN(d.getTime()) && d.getFullYear() >= 2000
                        ? d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
                        : "Unknown date";
                      return (
                        <SelectItem key={lab.id} value={lab.id.toString()}>
                          Lab panel — {displayLab}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                  {!selectedPatientId ? "Select a patient to see available lab results." : "No lab results found for this patient."}
                </div>
              )}
              {linkedLabResultId && (
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Lab results will be referenced in SOAP Assessment and Plan
                  </p>
                  {patientId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-6 px-2 gap-1 text-muted-foreground"
                      onClick={() => setLocation(`/patients?patient=${patientId}`)}
                      data-testid="button-view-lab-in-profile"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View in Patient Profile
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Session Recording + Notes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Mic className="w-4 h-4" />Session Notes
                </h3>
                {hasTranscription && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" />{transcription.split(/\s+/).filter(Boolean).length} words
                  </Badge>
                )}
              </div>

              <AudioCapture
                onTranscribed={(text) => setTranscription(prev => prev ? prev + "\n\n" + text : text)}
                onStateChange={setRecorderState}
              />

              {/* Live notes area — shows recording animation or transcript */}
              <div className="relative">
                {recorderState === "recording" && (
                  <div className="absolute inset-0 rounded-md bg-red-50/60 dark:bg-red-950/20 border-2 border-red-300/50 flex items-start gap-2 px-3 py-3 pointer-events-none z-10">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1 flex-shrink-0" />
                    <span className="text-sm text-red-600/80 dark:text-red-400/80 italic">Listening... notes will appear here when you stop recording.</span>
                  </div>
                )}
                {recorderState === "transcribing" && (
                  <div className="absolute inset-0 rounded-md bg-muted/60 flex items-center justify-center gap-2 z-10">
                    <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Transcribing...</span>
                  </div>
                )}
                <Textarea
                  value={transcription}
                  onChange={e => setTranscription(e.target.value)}
                  placeholder="Session notes will appear here after recording, or type / paste notes directly..."
                  rows={12}
                  className={`text-sm font-mono resize-y transition-opacity ${recorderState !== "idle" ? "opacity-40" : ""}`}
                  data-testid="textarea-transcription"
                  disabled={recorderState !== "idle"}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium mb-1.5 block">Private Clinician Notes</Label>
              <Textarea
                value={clinicianNotes}
                onChange={e => setClinicianNotes(e.target.value)}
                placeholder="Internal notes not visible to patient..."
                rows={3}
                className="text-sm resize-y"
                data-testid="textarea-clinician-notes"
              />
            </div>

            {/* Create SOAP Note — single action */}
            <div className="flex justify-end pt-1">
              <Button
                onClick={() => soapMutation.mutate()}
                disabled={soapMutation.isPending || !hasTranscription}
                data-testid="button-generate-soap"
                size="default"
              >
                {soapMutation.isPending
                  ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating SOAP Note...</>
                  : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Create SOAP Note</>}
              </Button>
            </div>
          </>
        )}

        {/* ── Tab: SOAP Note ──────────────────────────────────────────── */}
        {activeTab === "soap" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">SOAP Note</h3>
                <p className="text-xs text-muted-foreground mt-0.5">AI-generated from encounter transcription{linkedLabResultId ? " + linked lab results" : ""}. Edit any section as needed.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => soapMutation.mutate()}
                  disabled={soapMutation.isPending || !hasTranscription}
                  data-testid="button-regenerate-soap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${soapMutation.isPending ? "animate-spin" : ""}`} />
                  {soapMutation.isPending ? "Generating..." : "Regenerate"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveSoapMutation.mutate()}
                  disabled={saveSoapMutation.isPending || !savedId}
                  data-testid="button-save-soap"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {saveSoapMutation.isPending ? "Saving..." : "Save SOAP"}
                </Button>
              </div>
            </div>

            {!hasSoap && !soapMutation.isPending && (
              <div className="rounded-md border-2 border-dashed border-border p-8 text-center">
                <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No SOAP note yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Add session notes on the Details tab, then click "Create SOAP Note"</p>
                <Button onClick={() => setActiveTab("details")} variant="outline" size="sm">
                  <ChevronLeft className="w-3.5 h-3.5 mr-1.5" /> Go to Details
                </Button>
              </div>
            )}

            {soapMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                <div className="text-center">
                  <p className="text-sm font-medium">Creating SOAP note with GPT-4o...</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyzing session notes{linkedLabResultId ? " and lab values" : ""}</p>
                </div>
              </div>
            )}

            {hasSoap && !soapMutation.isPending && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Edit the note directly below, then save when ready.</p>
                <Textarea
                  value={soap.fullNote ?? legacySoapToText(soap)}
                  onChange={e => setSoap({ fullNote: e.target.value })}
                  rows={32}
                  className="text-sm font-mono resize-y leading-relaxed"
                  data-testid="soap-full-note"
                  spellCheck
                />
                <div className="flex justify-between items-center pt-1">
                  <p className="text-xs text-muted-foreground">All edits saved to chart.</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveSoapMutation.mutate()}
                      disabled={saveSoapMutation.isPending || !savedId}
                      data-testid="button-save-soap"
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      {saveSoapMutation.isPending ? "Saving..." : "Save Note"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => summaryMutation.mutate()}
                      disabled={summaryMutation.isPending || !savedId}
                      data-testid="button-generate-summary"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      {summaryMutation.isPending ? "Generating..." : "Generate Patient Summary"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Patient Summary ────────────────────────────────────── */}
        {activeTab === "summary" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />Patient Visit Summary
                  {published && <Badge className="text-[10px] py-0 h-4 bg-violet-600">Published to Portal</Badge>}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Plain-language summary for the patient. Edit before publishing.</p>
              </div>
              <div className="flex items-center gap-2">
                {hasSoap && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => summaryMutation.mutate()}
                    disabled={summaryMutation.isPending || !savedId}
                    data-testid="button-regenerate-summary"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${summaryMutation.isPending ? "animate-spin" : ""}`} />
                    {summaryMutation.isPending ? "Generating..." : "Regenerate"}
                  </Button>
                )}
              </div>
            </div>

            {!hasSummary && !summaryMutation.isPending && (
              <div className="rounded-md border-2 border-dashed border-border p-8 text-center">
                <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No patient summary yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Generate a SOAP note first, then create the patient summary</p>
                {hasSoap ? (
                  <Button
                    onClick={() => summaryMutation.mutate()}
                    disabled={summaryMutation.isPending}
                    data-testid="button-generate-summary-empty"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />Generate Patient Summary
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("soap")}>
                    Generate SOAP Note First
                  </Button>
                )}
              </div>
            )}

            {summaryMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <FileText className="w-10 h-10 text-primary animate-pulse" />
                <div className="text-center">
                  <p className="text-sm font-medium">Generating patient-friendly summary...</p>
                  <p className="text-xs text-muted-foreground mt-1">Converting clinical language to plain English</p>
                </div>
              </div>
            )}

            {hasSummary && !summaryMutation.isPending && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Visit Summary (patient-facing)</Label>
                  <Textarea
                    value={patientSummary}
                    onChange={e => setPatientSummary(e.target.value)}
                    rows={16}
                    className="text-sm resize-y"
                    data-testid="textarea-patient-summary"
                  />
                </div>

                {published && (
                  <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-200 rounded-md">
                    <CheckCircle2 className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <p className="text-sm text-violet-700">This summary is published to the patient portal. Save and re-publish after editing.</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveSummaryMutation.mutate()}
                      disabled={saveSummaryMutation.isPending || !savedId}
                      data-testid="button-save-summary"
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      {saveSummaryMutation.isPending ? "Saving..." : "Save Draft"}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    {published ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => publishMutation.mutate(false)}
                        disabled={publishMutation.isPending}
                        data-testid="button-unpublish-summary"
                      >
                        <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                        {publishMutation.isPending ? "..." : "Unpublish"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      onClick={() => publishMutation.mutate(true)}
                      disabled={publishMutation.isPending}
                      data-testid="button-publish-summary"
                      style={{ background: "#2e3a20" }}
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {publishMutation.isPending ? "Publishing..." : published ? "Re-publish to Portal" : "Publish to Patient Portal"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Encounters Page ──────────────────────────────────────────────────────
export default function EncountersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [initialPatientId, setInitialPatientId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const urlParamApplied = useRef(false);

  const { data: encounters = [], isLoading: encountersLoading } = useQuery<EncounterWithPatient[]>({
    queryKey: ["/api/encounters"],
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients/search"],
    queryFn: async () => {
      const res = await fetch("/api/patients/search", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load patients");
      return res.json();
    },
  });

  // Apply URL params — patientId opens a new encounter pre-filled; encounterId opens an existing one
  useEffect(() => {
    if (urlParamApplied.current) return;
    const params = new URLSearchParams(searchStr);
    const encounterId = params.get("encounterId");
    const patientIdParam = params.get("patientId");
    if (patientIdParam) {
      setInitialPatientId(patientIdParam);
      setIsNew(true);
      setSelectedId(null);
      urlParamApplied.current = true;
    } else if (encounterId && encounters.length > 0) {
      const enc = encounters.find(e => e.id === Number(encounterId));
      if (enc) { setSelectedId(enc.id); setIsNew(false); urlParamApplied.current = true; }
    }
  }, [searchStr, encounters]);

  const selectedEncounter = selectedId ? encounters.find(e => e.id === selectedId) ?? null : null;
  const showEditor = isNew || selectedId !== null;

  const filtered = encounters.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.patientName.toLowerCase().includes(q) ||
      (e.chiefComplaint?.toLowerCase().includes(q) ?? false) ||
      VISIT_TYPES.find(v => v.value === e.visitType)?.label.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f9f6f0" }}>
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b px-4 py-2.5 flex items-center gap-3" style={{ background: "#e8ddd0" }}>
        <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} data-testid="button-back-dashboard">
          <ChevronLeft className="w-4 h-4" style={{ color: "#2e3a20" }} />
        </Button>
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4" style={{ color: "#2e3a20" }} />
          <span className="font-semibold text-sm" style={{ color: "#2e3a20" }}>Encounter Documentation</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => { setSelectedId(null); setIsNew(true); }}
            data-testid="button-new-encounter"
            style={{ background: "#2e3a20", color: "white" }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Encounter
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>
        {/* Encounter List */}
        <div
          className={`flex flex-col border-r bg-background ${showEditor ? "hidden lg:flex lg:w-72 xl:w-80 flex-shrink-0" : "flex-1"}`}
        >
          <div className="p-3 border-b">
            <Input
              placeholder="Search encounters..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-sm"
              data-testid="input-search-encounters"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {encountersLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                <Stethoscope className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{search ? "No encounters match your search" : "No encounters yet"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {search ? "Try a different search term" : "Click \"New Encounter\" to document your first visit"}
                  </p>
                </div>
                {!search && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedId(null); setIsNew(true); }}
                    data-testid="button-new-encounter-empty"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />New Encounter
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map(enc => (
                  <EncounterListItem
                    key={enc.id}
                    enc={enc}
                    isSelected={selectedId === enc.id}
                    onClick={() => { setSelectedId(enc.id); setIsNew(false); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Editor Panel */}
        {showEditor ? (
          <div className="flex-1 overflow-hidden flex flex-col bg-background">
            <EncounterErrorBoundary>
              <EncounterEditor
                key={selectedId ?? `new-${initialPatientId ?? ""}`}
                encounter={selectedEncounter}
                patients={patients}
                onClose={() => { setSelectedId(null); setIsNew(false); setInitialPatientId(undefined); }}
                onDeleted={() => { setSelectedId(null); setIsNew(false); setInitialPatientId(undefined); }}
                initialPatientId={isNew ? initialPatientId : undefined}
              />
            </EncounterErrorBoundary>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center text-center p-8">
            <div>
              <Stethoscope className="w-14 h-14 mx-auto text-muted-foreground mb-4" />
              <p className="text-base font-medium">Select an encounter to view</p>
              <p className="text-sm text-muted-foreground mt-1">or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
