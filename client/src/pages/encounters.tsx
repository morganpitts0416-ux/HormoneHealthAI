import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  Mic, Upload, FileText, FlaskConical, ChevronLeft, Plus,
  Sparkles, Send, CheckCircle2, Circle, AlertCircle, Trash2,
  Save, Eye, EyeOff, Calendar, User, Stethoscope, ClipboardList,
  ChevronRight, RefreshCw, X, BookOpen, Download, Clock,
  TriangleAlert,
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
          <div className="text-xs text-muted-foreground">{format(new Date(enc.visitDate), "MMM d, yyyy")}</div>
          {enc.chiefComplaint && (
            <div className="text-xs text-muted-foreground truncate mt-0.5 italic">"{enc.chiefComplaint}"</div>
          )}
          <EncounterStatusBadges enc={enc} />
        </div>
      </div>
    </button>
  );
}

// ── Audio Upload Component ────────────────────────────────────────────────────
function AudioUploader({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (f: File) => {
    if (!f.type.startsWith("audio/") && !f.name.match(/\.(mp3|wav|ogg|m4a|webm|mp4|flac)$/i)) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please upload an audio file (MP3, WAV, M4A, WebM, etc.)" });
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Audio files must be under 200 MB." });
      return;
    }
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const transcribe = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch("/api/encounters/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Transcription failed");
      }
      const data = await res.json();
      onTranscribed(data.transcription);
      setFile(null);
      toast({ title: "Transcription complete", description: "Audio transcribed successfully. Review and edit as needed." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Transcription failed", description: err.message || "Please try again or paste text manually." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        data-testid="audio-drop-zone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.mp4,.flac"
          className="hidden"
          data-testid="input-audio-file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        <Mic className="w-8 h-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">Drop audio file here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-0.5">MP3, WAV, M4A, WebM, OGG — up to 200 MB</p>
        </div>
      </div>
      {file && (
        <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-md">
          <Mic className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm flex-1 truncate">{file.name}</span>
          <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          <Button size="icon" variant="ghost" onClick={() => setFile(null)} data-testid="button-remove-audio">
            <X className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={transcribe}
            disabled={uploading}
            data-testid="button-transcribe"
          >
            {uploading ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Transcribing...</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Transcribe</>}
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
        Audio is processed by OpenAI Whisper and deleted immediately — never stored
      </p>
    </div>
  );
}

// ── SOAP Note Section ─────────────────────────────────────────────────────────
type SoapNote = { subjective: string; objective: string; reviewOfSystems: string; assessment: string; plan: string };

const SOAP_FIELDS: { key: keyof SoapNote; label: string; rows: number; description: string }[] = [
  { key: "subjective", label: "Subjective", rows: 5, description: "Patient-reported symptoms, history, and concerns" },
  { key: "objective", label: "Objective", rows: 4, description: "Vital signs, physical exam findings" },
  { key: "reviewOfSystems", label: "Review of Systems", rows: 5, description: "Systematic review by organ system" },
  { key: "assessment", label: "Assessment", rows: 5, description: "Clinical impressions, diagnoses, lab interpretation" },
  { key: "plan", label: "Plan", rows: 6, description: "Treatment, medications, labs, referrals, follow-up" },
];

// ── Main Encounter Editor ─────────────────────────────────────────────────────
function EncounterEditor({
  encounter,
  patients,
  onClose,
  onDeleted,
}: {
  encounter: EncounterWithPatient | null;
  patients: Patient[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [patientId, setPatientId] = useState<string>(encounter?.patientId?.toString() ?? "");
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
  const [soap, setSoap] = useState<SoapNote>(
    encounter?.soapNote ? (encounter.soapNote as SoapNote) : { subjective: "", objective: "", reviewOfSystems: "", assessment: "", plan: "" }
  );
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
  const hasSoap = !!(soap.assessment || soap.plan || soap.subjective);
  const hasSummary = patientSummary.trim().length > 0;

  const steps = [
    { id: "details", label: "Details & Transcription", done: hasTranscription, icon: Stethoscope },
    { id: "soap", label: "SOAP Note", done: hasSoap, icon: ClipboardList },
    { id: "summary", label: "Patient Summary", done: hasSummary, icon: FileText },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b">
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-back-encounters">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {savedId ? (encounter?.patientName ?? (() => { const p = patients.find(p => p.id.toString() === patientId); return p ? `${p.firstName} ${p.lastName}` : "Encounter"; })()) : "New Encounter"}
          </div>
          {savedId && <div className="text-xs text-muted-foreground">{format(new Date(visitDate), "MMMM d, yyyy")} · {VISIT_TYPES.find(v => v.value === visitType)?.label}</div>}
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
                <Select value={linkedLabResultId} onValueChange={setLinkedLabResultId}>
                  <SelectTrigger data-testid="select-lab-result">
                    <SelectValue placeholder="Select lab panel to reference..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No lab linkage</SelectItem>
                    {patientLabs.map(lab => (
                      <SelectItem key={lab.id} value={lab.id.toString()}>
                        Lab panel — {format(new Date(lab.labDate), "MMM d, yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                  {!selectedPatientId ? "Select a patient to see available lab results." : "No lab results found for this patient."}
                </div>
              )}
              {linkedLabResultId && (
                <p className="text-xs text-emerald-700 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Lab results will be referenced in SOAP Assessment and Plan
                </p>
              )}
            </div>

            <Separator />

            {/* Transcription */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5"><Mic className="w-4 h-4" />Encounter Transcription</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Upload audio to auto-transcribe, or paste/type the encounter notes below</p>
                </div>
                {hasTranscription && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" />{transcription.split(/\s+/).length} words
                  </Badge>
                )}
              </div>

              <AudioUploader onTranscribed={(text) => setTranscription(prev => prev ? prev + "\n\n" + text : text)} />

              <div className="mt-3">
                <Label className="text-xs font-medium mb-1.5 block">Transcription / Notes</Label>
                <Textarea
                  value={transcription}
                  onChange={e => setTranscription(e.target.value)}
                  placeholder="Paste encounter notes or transcription here, or upload audio above to auto-generate..."
                  rows={10}
                  className="text-sm font-mono resize-y"
                  data-testid="textarea-transcription"
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

            {hasTranscription && (
              <div className="flex justify-end">
                <Button
                  onClick={() => soapMutation.mutate()}
                  disabled={soapMutation.isPending}
                  data-testid="button-generate-soap"
                >
                  {soapMutation.isPending
                    ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating SOAP Note...</>
                    : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generate SOAP Note</>}
                </Button>
              </div>
            )}
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
                <p className="text-xs text-muted-foreground mt-1 mb-4">Add a transcription on the Details tab, then generate the SOAP note</p>
                <Button
                  onClick={() => setActiveTab("details")}
                  variant="outline"
                  size="sm"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1.5" /> Go to Details
                </Button>
              </div>
            )}

            {soapMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                <div className="text-center">
                  <p className="text-sm font-medium">Generating SOAP note with GPT-4o...</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyzing transcription and lab values</p>
                </div>
              </div>
            )}

            {hasSoap && !soapMutation.isPending && (
              <div className="space-y-4">
                {SOAP_FIELDS.map((field) => (
                  <div key={field.key}>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-primary mb-1 block">
                      {field.label}
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-1.5">{field.description}</p>
                    <Textarea
                      value={soap[field.key]}
                      onChange={e => setSoap(prev => ({ ...prev, [field.key]: e.target.value }))}
                      rows={field.rows}
                      className="text-sm resize-y"
                      data-testid={`soap-${field.key}`}
                    />
                  </div>
                ))}

                <div className="flex justify-between items-center pt-2">
                  <p className="text-xs text-muted-foreground">All sections saved to chart. Edit freely.</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveSoapMutation.mutate()}
                      disabled={saveSoapMutation.isPending || !savedId}
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      {saveSoapMutation.isPending ? "Saving..." : "Save Changes"}
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");

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
            <EncounterEditor
              key={selectedId ?? "new"}
              encounter={selectedEncounter}
              patients={patients}
              onClose={() => { setSelectedId(null); setIsNew(false); }}
              onDeleted={() => { setSelectedId(null); setIsNew(false); }}
            />
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
