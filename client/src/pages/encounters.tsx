import { useState, useRef, useCallback, useEffect, Component, type ReactNode, type ReactElement } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import {
  Mic, Upload, FileText, FlaskConical, ChevronLeft, Plus,
  Sparkles, Send, CheckCircle2, Circle, AlertCircle, Trash2,
  Save, Eye, EyeOff, Calendar, User, Stethoscope, ClipboardList,
  ChevronRight, RefreshCw, X, BookOpen, Download, Clock,
  TriangleAlert, ExternalLink, Square, MicOff, ShieldCheck, Copy, Check,
  Layers, Pill,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import type { Patient, LabResult, ClinicalEncounter, DiarizedUtterance, ClinicalExtraction, EvidenceOverlay, EvidenceSuggestion, ValidationResult, PatternMatchResult, PatternMatch } from "@shared/schema";
import { useGlobalLoading } from "@/hooks/use-global-loading";

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

// ── Transcript formatter ───────────────────────────────────────────────────────
// Converts a raw running-paragraph transcription into readable note paragraphs.
// Splits on sentence endings, groups ~3 sentences per paragraph.
function formatTranscriptAsNotes(text: string): string[] {
  if (!text?.trim()) return [];
  // Split on sentence-ending punctuation, keeping the delimiter
  const sentences = text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  const SENTENCES_PER_PARA = 3;
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
    paragraphs.push(sentences.slice(i, i + SENTENCES_PER_PARA).join(" "));
  }
  return paragraphs;
}

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
      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors relative ${isSelected ? "bg-accent" : "hover-elevate"}`}
    >
      {isSelected && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" />}
      <div className="flex items-start gap-2.5 pl-1.5">
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5 ${isSelected ? "ring-2 ring-primary/30" : ""}`} style={{ background: "#7a8a64" }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate leading-snug">{enc.patientName}</div>
          <div className="text-[11px] text-muted-foreground leading-tight">{displayDate(enc.visitDate as unknown as string)}</div>
          {enc.chiefComplaint && (
            <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5 italic">"{enc.chiefComplaint}"</div>
          )}
          <EncounterStatusBadges enc={enc} />
        </div>
      </div>
    </button>
  );
}

// ── SOAP Note Rendered Viewer ─────────────────────────────────────────────────
const MAJOR_SECTIONS = /^(SUBJECTIVE|OBJECTIVE|ASSESSMENT\/PLAN|CARE PLAN|FOLLOW-UP|FOLLOW UP)$/i;
const ASSESSMENT_SECTION = /^(ASSESSMENT\/PLAN|ASSESSMENT)$/i;
const CC_LINE = /^CC\/Reason:\s*(.*)/i;
const SUB_LABEL = /^([A-Z][A-Za-z\s\/\-]+):(\s*.*)$/;

const guidelineClassBadge: Record<string, string> = {
  "I":   "bg-emerald-50 border-emerald-200 text-emerald-800",
  "IIa": "bg-blue-50 border-blue-200 text-blue-800",
  "IIb": "bg-amber-50 border-amber-200 text-amber-800",
  "III": "bg-red-50 border-red-200 text-red-800",
};

// ── Resolvable review item — lets clinician save a medication alias from a flagged term ──
function ResolvableReviewItem({ text, icon }: { text: string; icon: ReactElement }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [spokenAs, setSpokenAs] = useState(() => {
    const m = text.match(/['"]([^'"]{2,50})['"]/);
    return m ? m[1] : "";
  });
  const [correctName, setCorrectName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!correctName.trim() || !spokenAs.trim()) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/medication-dictionary/entry", {
        genericName: correctName.trim().toLowerCase(),
        brandNames: [],
        commonSpokenVariants: [spokenAs.trim().toLowerCase()],
        commonMisspellings: [],
        drugClass: "",
      });
      setSaved(true);
      setOpen(false);
      toast({ title: "Alias saved", description: `"${spokenAs}" will now resolve to ${correctName} in future transcriptions.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to save alias", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <li className="text-xs flex items-start gap-1.5">
        <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-500" />
        <span className="line-through text-muted-foreground">{text}</span>
        <span className="text-emerald-700 ml-1 no-underline">alias saved</span>
      </li>
    );
  }

  return (
    <li className="text-xs text-amber-900 space-y-2">
      <div className="flex items-start gap-1.5">
        <span className="flex-shrink-0 mt-0.5">{icon}</span>
        <span className="flex-1">{text}</span>
        <button
          className="text-[10px] font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 flex-shrink-0 ml-2 whitespace-nowrap"
          onClick={() => setOpen(v => !v)}
          data-testid="button-toggle-alias-form"
        >
          {open ? "Cancel" : "Save alias"}
        </button>
      </div>
      {open && (
        <div className="ml-4 rounded-md border border-amber-200 bg-card p-3 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Teach the system — save as medication alias</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">As spoken / heard</label>
              <Input
                value={spokenAs}
                onChange={e => setSpokenAs(e.target.value)}
                placeholder="e.g. liz sartan"
                className="h-7 text-xs"
                data-testid="input-spoken-as"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Correct medication name</label>
              <Input
                value={correctName}
                onChange={e => setCorrectName(e.target.value)}
                placeholder="e.g. losartan"
                className="h-7 text-xs"
                data-testid="input-correct-medication"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={!spokenAs.trim() || !correctName.trim() || saving}
              data-testid="button-save-alias"
            >
              {saving ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Saving…</> : "Save alias"}
            </Button>
            <p className="text-[10px] text-muted-foreground">Auto-corrects in future transcriptions.</p>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Evidence card (used in both popover and the Evidence tab) ─────────────────
function EvidenceCard({ sug }: { sug: EvidenceSuggestion }) {
  const strengthColors: Record<string, string> = {
    strong:       "bg-emerald-50 text-emerald-700 border-emerald-200",
    moderate:     "bg-blue-50 text-blue-700 border-blue-200",
    limited:      "bg-amber-50 text-amber-700 border-amber-200",
    mixed:        "bg-orange-50 text-orange-700 border-orange-200",
    insufficient: "bg-slate-50 text-slate-600 border-slate-200",
  };
  const alignmentIcons: Record<string, string> = {
    aligned:            "✓ Aligned",
    gap_identified:     "△ Gap identified",
    potential_conflict: "⚠ Potential conflict",
    not_applicable:     "— Not applicable",
  };
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground leading-snug">{sug.title}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {sug.guideline_class && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${guidelineClassBadge[sug.guideline_class] ?? guidelineClassBadge["III"]}`}>
              Class {sug.guideline_class}
            </span>
          )}
          {sug.level_of_evidence && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-muted-foreground/30 text-muted-foreground">
              LOE {sug.level_of_evidence}
            </span>
          )}
        </div>
      </div>

      {sug.strength_of_support && (
        <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded border ${strengthColors[sug.strength_of_support] ?? strengthColors.limited}`}>
          {sug.strength_of_support.charAt(0).toUpperCase() + sug.strength_of_support.slice(1)} evidence
        </span>
      )}

      <p className="text-xs text-foreground/80 leading-relaxed">{sug.summary}</p>

      {sug.plan_alignment && sug.plan_alignment !== "not_applicable" && (
        <p className={`text-[10px] font-medium ${sug.plan_alignment === "aligned" ? "text-emerald-600" : sug.plan_alignment === "potential_conflict" ? "text-red-600" : "text-amber-600"}`}>
          {alignmentIcons[sug.plan_alignment]}
          {sug.plan_alignment_note ? ` — ${sug.plan_alignment_note}` : ""}
        </p>
      )}

      {sug.cautions?.length > 0 && (
        <div className="rounded bg-amber-50/60 border border-amber-100 px-2 py-1.5">
          {sug.cautions.map((c, i) => (
            <p key={i} className="text-[10px] text-amber-800 leading-snug">{i === 0 ? "⚠ " : "  "}{c}</p>
          ))}
        </div>
      )}

      {sug.citations?.length > 0 && (
        <div className="space-y-0.5 pt-0.5 border-t border-muted/40">
          {sug.citations.map((cit, i) => (
            <p key={i} className="text-[10px] text-muted-foreground leading-snug">
              {cit.source}{cit.year ? ` (${cit.year})` : ""}
              {cit.doi ? (
                <a href={`https://doi.org/${cit.doi}`} target="_blank" rel="noopener noreferrer"
                  className="ml-1 text-primary/70 hover:text-primary underline-offset-2 hover:underline">DOI ↗</a>
              ) : null}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline evidence flag — shows in SOAP "View" mode ─────────────────────────
function EvidenceFlagButton({ suggestions }: { suggestions: EvidenceSuggestion[] }) {
  const [open, setOpen] = useState(false);
  const count = suggestions.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="evidence-flag-btn"
          className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-semibold cursor-pointer align-middle select-none border border-primary/25 bg-primary/8 text-primary/75 hover:bg-primary/15 hover:border-primary/40 hover:text-primary transition-all duration-150"
          style={{ verticalAlign: "middle", lineHeight: 1 }}
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        >
          <Sparkles className="w-2.5 h-2.5 flex-shrink-0" />
          {count > 1 ? `${count} citations` : "Evidence"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] p-0 shadow-lg"
        side="right"
        align="start"
        sideOffset={8}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary/5">
          <Sparkles className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Clinical Evidence</p>
            <p className="text-[10px] text-muted-foreground">Informational — not auto-inserted into chart</p>
          </div>
        </div>
        <div className="divide-y divide-muted/40 max-h-[420px] overflow-y-auto">
          {suggestions.map((sug, i) => (
            <div key={i} className="px-3 py-2.5">
              <EvidenceCard sug={sug} />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Legacy callout (used in "With Evidence" expanded view) ────────────────────
function EvidenceCallout({ sug }: { sug: EvidenceSuggestion }) {
  return (
    <div className="ml-4 mr-1 my-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
      <EvidenceCard sug={sug} />
    </div>
  );
}

function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 4 && !["about","which","these","their","there","should","would","could","after","before","since","where","while","other","every","using","based"].includes(w));
}

// mode="flags"    → inline EvidenceFlagButton chips anchored to numbered diagnosis lines (default)
// mode="callouts" → EvidenceCallout blocks below each matched numbered line
function SoapNoteViewer({ text, evidence, mode = "flags" }: {
  text: string;
  evidence?: EvidenceSuggestion[];
  mode?: "flags" | "callouts";
}) {
  const lines = text.split("\n");
  const nodes: ReactElement[] = [];
  let inAssessmentPlan = false;
  // Track whether we have passed the first numbered diagnosis in the Assessment.
  // Evidence pills only anchor to numbered items and their sub-content,
  // NOT to the Assessment Summary paragraph that precedes them.
  let inNumberedItem = false;
  const usedIndices = new Set<number>();

  function matchEvidence(lineText: string): EvidenceSuggestion[] {
    if (!evidence?.length) return [];
    const words = extractKeywords(lineText);
    const matched: EvidenceSuggestion[] = [];
    evidence.forEach((sug, idx) => {
      if (usedIndices.has(idx)) return;
      const haystack = extractKeywords(sug.title + " " + sug.relevance_to_visit + " " + sug.summary);
      if (words.some(w => haystack.includes(w))) {
        usedIndices.add(idx);
        matched.push(sug);
      }
    });
    return matched;
  }

  function renderEvidenceFor(lineText: string, key: string): ReactElement[] {
    const matched = matchEvidence(lineText);
    if (!matched.length) return [];
    if (mode === "flags") {
      return [<EvidenceFlagButton key={`${key}-flag`} suggestions={matched} />];
    }
    return matched.map((sug, si) => <EvidenceCallout key={`${key}-${si}`} sug={sug} />);
  }

  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed) { nodes.push(<div key={i} className="h-1" />); return; }

    const ccMatch = trimmed.match(CC_LINE);
    if (ccMatch) {
      nodes.push(
        <div key={i} className="soap-cc">
          <span className="soap-label">Chief Complaint / Reason for Visit — </span>
          {ccMatch[1]}
        </div>
      );
      return;
    }

    if (MAJOR_SECTIONS.test(trimmed)) {
      inAssessmentPlan = ASSESSMENT_SECTION.test(trimmed);
      inNumberedItem = false; // reset on new major section
      nodes.push(<span key={i} className="soap-section-major">{trimmed}</span>);
      return;
    }

    const subMatch = trimmed.match(SUB_LABEL);
    if (subMatch && subMatch[1].length < 32) {
      nodes.push(
        <p key={i} className="soap-body">
          <span className="soap-label">{subMatch[1]}: </span>
          {subMatch[2].trim()}
        </p>
      );
      return;
    }

    if (trimmed.startsWith("-") || trimmed.startsWith("•")) {
      const bulletText = trimmed.slice(1).trim();
      // Only attach evidence to bullets that are under a numbered diagnosis item,
      // not to top-level bulleted lists elsewhere in the note.
      const evNodes = (inAssessmentPlan && inNumberedItem) ? renderEvidenceFor(bulletText, `b${i}`) : [];
      nodes.push(
        <p key={i} className="soap-body pl-4">
          <span className="text-primary/60 mr-1 select-none">·</span>
          {bulletText}
          {mode === "flags" && evNodes}
        </p>
      );
      if (mode === "callouts") nodes.push(...evNodes);
      return;
    }

    if (/^\d+\./.test(trimmed)) {
      inNumberedItem = true; // from here on, prose belongs to a specific diagnosis
      const evNodes = inAssessmentPlan ? renderEvidenceFor(trimmed, `n${i}`) : [];
      nodes.push(
        <p key={i} className="soap-body font-semibold mt-1">
          {trimmed}
          {mode === "flags" && evNodes}
        </p>
      );
      if (mode === "callouts") nodes.push(...evNodes);
      return;
    }

    // Plain prose: only attach evidence if we're inside a specific numbered diagnosis.
    // The Assessment Summary paragraph (before item 1) is plain prose but inNumberedItem
    // is false there, so it correctly gets no pills.
    const evNodes = (inAssessmentPlan && inNumberedItem) ? renderEvidenceFor(trimmed, `p${i}`) : [];
    nodes.push(
      <p key={i} className="soap-body">
        {trimmed}
        {mode === "flags" && evNodes}
      </p>
    );
    if (mode === "callouts") nodes.push(...evNodes);
  });

  // Unmatched suggestions appended at end
  if (evidence?.length) {
    const unmatched = evidence.filter((_, idx) => !usedIndices.has(idx));
    if (unmatched.length) {
      if (mode === "callouts") {
        nodes.push(
          <div key="ev-unmatched-header" className="mt-3 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Additional Evidence</span>
          </div>
        );
        unmatched.forEach((sug, i) =>
          nodes.push(<EvidenceCallout key={`ev-um-${i}`} sug={sug} />)
        );
      }
      // In "flags" mode unmatched evidence is accessible via the Evidence tab
    }
  }

  return <div className="soap-rendered">{nodes}</div>;
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

// How long each recording segment runs before being sent to Whisper (60 seconds)
const SEGMENT_MS = 60 * 1000;

function AudioCapture({
  onTranscribed,
  onPartialTranscription,
  onStateChange,
  visitType = "follow-up",
}: {
  onTranscribed: (text: string, utterances: DiarizedUtterance[] | null) => void;
  onPartialTranscription?: (accumulatedText: string) => void;
  onStateChange: (state: RecorderState) => void;
  visitType?: string;
}) {
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [recState, setRecState] = useState<"idle" | "recording" | "stopped">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  // Progress for chunked recording
  const [segmentsDone, setSegmentsDone] = useState(0);
  const [segmentsTotal, setSegmentsTotal] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("");
  const segmentIndexRef = useRef(0);
  // Map of segment index → transcription text (ordered)
  const transcribedSegmentsRef = useRef<Map<number, string>>(new Map());
  const transcribedUtterancesRef = useRef<Map<number, DiarizedUtterance[] | null>>(new Map());
  const pendingSegmentsRef = useRef(0);
  const recordingStoppedRef = useRef(false);
  const finalizedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const { toast } = useToast();

  // Request screen wake lock so the phone doesn't suspend the mic during recording
  const acquireWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
    } catch {
      // Wake lock not granted — not a fatal error, recording continues
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  // Re-acquire wake lock if the page becomes visible again while still recording
  // (mobile browsers release wake locks when the tab goes to the background)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && recState === "recording") {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [recState]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      releaseWakeLock();
    };
  }, []);

  // Keep parent in sync with recorder state
  useEffect(() => {
    if (isTranscribing) { onStateChange("transcribing"); return; }
    if (recState === "recording") { onStateChange("recording"); return; }
    onStateChange("idle");
  }, [recState, isTranscribing]);

  // Called when ALL segments have been transcribed and recording has stopped
  const finalizeTranscription = () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    // Collect segment indices in ascending order from the map
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
    const fullText = allText.join(" ").trim();
    const utterances = allUtterances.length > 0 ? allUtterances : null;
    onTranscribed(fullText, utterances);
    setIsTranscribing(false);
    setRecState("idle");
    setElapsed(0);
    setSegmentsDone(0);
    setSegmentsTotal(0);
    transcribedSegmentsRef.current.clear();
    transcribedUtterancesRef.current.clear();
    segmentIndexRef.current = 0;
    pendingSegmentsRef.current = 0;
  };

  // Transcribe a single segment blob. segIdx is used to keep ordering correct.
  const transcribeSegment = async (blob: Blob, segIdx: number) => {
    const ext = (blob.type || "audio/webm").includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `seg-${segIdx}.${ext}`, { type: blob.type || "audio/webm" });
    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("visitType", visitType);
      const res = await fetch("/api/encounters/transcribe", {
        method: "POST", body: formData, credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Transcription failed");
      }
      const data = await res.json();
      transcribedSegmentsRef.current.set(segIdx, data.transcription ?? "");
      transcribedUtterancesRef.current.set(segIdx, data.utterances ?? null);
      setSegmentsDone(d => d + 1);
      // If recording is still live, surface accumulated text so far
      if (!recordingStoppedRef.current && onPartialTranscription) {
        const partialIndices = Array.from(transcribedSegmentsRef.current.keys()).sort((a, b) => a - b);
        const partialText = partialIndices.map(i => transcribedSegmentsRef.current.get(i) ?? "").filter(Boolean).join(" ").trim();
        if (partialText) onPartialTranscription(partialText);
      }
    } catch (err: any) {
      // Store empty string so segment doesn't block finalization
      transcribedSegmentsRef.current.set(segIdx, "");
      transcribedUtterancesRef.current.set(segIdx, null);
      setSegmentsDone(d => d + 1);
      toast({
        variant: "destructive",
        title: `Segment ${segIdx + 1} failed`,
        description: err.message || "One recording segment could not be transcribed.",
      });
    } finally {
      pendingSegmentsRef.current -= 1;
      // If recording has stopped and all segments are done, finalize
      if (recordingStoppedRef.current && pendingSegmentsRef.current === 0) {
        finalizeTranscription();
      }
    }
  };

  // Flush: stop the current recorder (which triggers onstop → queues transcription),
  // then start a fresh recorder on the same stream.
  const flushSegment = (stream: MediaStream) => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;

    // Advance the segment index so the new recorder gets the next index
    segmentIndexRef.current += 1;

    mr.stop(); // fires onstop which queues this segment for transcription

    setTimeout(() => {
      if (!recordingStoppedRef.current && streamRef.current) {
        startSegmentRecorder(stream);
      }
    }, 150);
  };

  const startSegmentRecorder = (stream: MediaStream) => {
    const segIdx = segmentIndexRef.current; // captured in closure for this segment
    const localChunks: Blob[] = [];
    const mimeType = mimeTypeRef.current;
    const mr = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 16000,
    });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data.size > 0) localChunks.push(e.data); };
    mr.onstop = () => {
      if (localChunks.length === 0) {
        // Nothing recorded — check if we should finalize
        if (recordingStoppedRef.current && pendingSegmentsRef.current === 0) {
          finalizeTranscription();
        }
        return;
      }
      const blob = new Blob(localChunks, { type: mimeType || "audio/webm" });
      // Only now do we count this as a pending segment
      pendingSegmentsRef.current += 1;
      setSegmentsTotal(t => t + 1);
      transcribeSegment(blob, segIdx);
    };

    mr.start(1000);
  };

  const sendToWhisper = async (file: File) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("visitType", visitType);
      const res = await fetch("/api/encounters/transcribe", {
        method: "POST", body: formData, credentials: "include",
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Transcription failed"); }
      const data = await res.json();
      onTranscribed(data.transcription, data.utterances ?? null);
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
      setSegmentsDone(0);
      setSegmentsTotal(0);
      segmentIndexRef.current = 0;
      pendingSegmentsRef.current = 0;
      recordingStoppedRef.current = false;
      finalizedRef.current = false;
      transcribedSegmentsRef.current.clear();
      transcribedUtterancesRef.current.clear();

      mimeTypeRef.current = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";

      startSegmentRecorder(stream);
      setRecState("recording");

      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
      // Every SEGMENT_MS, flush the current segment and start a new one
      segmentTimerRef.current = setInterval(() => {
        if (!recordingStoppedRef.current && streamRef.current) {
          flushSegment(streamRef.current);
        }
      }, SEGMENT_MS);

      acquireWakeLock();
    } catch {
      toast({ variant: "destructive", title: "Microphone access denied", description: "Please allow microphone access in your browser settings and try again." });
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null; }
    releaseWakeLock();
    recordingStoppedRef.current = true;
    setRecState("stopped");
    setIsTranscribing(true);

    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      // onstop handler will queue the final segment for transcription
      mr.stop();
    } else if (pendingSegmentsRef.current === 0) {
      // Nothing pending — finalize immediately
      finalizeTranscription();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
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
            <div className="space-y-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-md border-2 border-red-400/60 bg-red-50/40 dark:bg-red-950/20">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">Recording</span>
                <span className="text-sm font-mono tabular-nums text-foreground flex-1" data-testid="recording-timer">{formatDuration(elapsed)}</span>
                <Button data-testid="button-stop-recording" variant="destructive" size="sm" onClick={stopRecording} className="gap-1.5">
                  <Square className="w-3.5 h-3.5 fill-current" />Stop
                </Button>
              </div>
              {segmentsDone > 0 && (
                <p className="text-xs text-muted-foreground px-1">
                  <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-500" />
                  {segmentsDone} segment{segmentsDone !== 1 ? "s" : ""} transcribed · continuing to record…
                </p>
              )}
            </div>
          )}
          {(recState === "stopped" || (isTranscribing && recState !== "recording")) && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-md border bg-muted/30">
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground">
                {segmentsTotal > 1
                  ? `Transcribing ${segmentsDone} of ${segmentsTotal} segments…`
                  : "Transcribing session audio — notes will appear below…"}
              </span>
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

  // Inline new-patient form state
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [npFirst, setNpFirst] = useState("");
  const [npLast, setNpLast] = useState("");
  const [npGender, setNpGender] = useState("male");
  const [npDob, setNpDob] = useState("");
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
  // Captures what was in the textarea before a recording session starts, so partial
  // transcription updates can be prepended correctly without doubling text.
  const preRecordingTranscriptionRef = useRef<string>("");
  const [soap, setSoap] = useState<SoapNote>(initSoap(encounter?.soapNote));
  const [patientSummary, setPatientSummary] = useState<string>(encounter?.patientSummary ?? "");
  const [activeTab, setActiveTab] = useState<"details" | "transcript" | "soap" | "evidence" | "summary">("details");
  const [savedId, setSavedId] = useState<number | null>(encounter?.id ?? null);
  const [published, setPublished] = useState<boolean>(encounter?.summaryPublished ?? false);

  // Pipeline state — clinical AI stages
  const [rawUtterances, setRawUtterances] = useState<DiarizedUtterance[] | null>(
    (encounter?.diarizedTranscript as DiarizedUtterance[] | null) ?? null
  );
  const [diarizedTranscript, setDiarizedTranscript] = useState<DiarizedUtterance[] | null>(
    (encounter?.diarizedTranscript as DiarizedUtterance[] | null) ?? null
  );
  const [clinicalExtraction, setClinicalExtraction] = useState<ClinicalExtraction | null>(
    (encounter?.clinicalExtraction as ClinicalExtraction | null) ?? null
  );
  const [evidenceOverlay, setEvidenceOverlay] = useState<EvidenceOverlay | null>(
    (encounter?.evidenceSuggestions as EvidenceOverlay | null) ?? null
  );
  const [patternMatch, setPatternMatch] = useState<PatternMatchResult | null>(
    (encounter?.patternMatch as PatternMatchResult | null) ?? null
  );
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState<"normalizing" | "extracting" | "matching" | "evidence" | "validating" | null>(null);
  const [medMatches, setMedMatches] = useState<import("@shared/schema").MedicationMatch[] | null>(null);
  const [medDetecting, setMedDetecting] = useState(false);
  const [confirmingTermIdx, setConfirmingTermIdx] = useState<number | null>(null);
  const [soapViewMode, setSoapViewMode] = useState<"view" | "edit">("view");
  const [copiedSoap, setCopiedSoap] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState<"soap" | "evidence" | "both" | null>(null);

  // Sync JSONB states when detail fetch arrives after initial mount
  // (list query strips these fields; detail fetch brings them in asynchronously)
  useEffect(() => {
    if (!encounter) return;
    if (encounter.evidenceSuggestions && !evidenceOverlay) {
      setEvidenceOverlay(encounter.evidenceSuggestions as EvidenceOverlay);
    }
    if (encounter.soapNote && !(soap as any).fullNote?.trim()) {
      setSoap(initSoap(encounter.soapNote));
    }
    if (encounter.transcription && !transcription) {
      setTranscription(encounter.transcription);
    }
    if (encounter.diarizedTranscript && !diarizedTranscript?.length) {
      setDiarizedTranscript(encounter.diarizedTranscript as DiarizedUtterance[]);
    }
    if (encounter.clinicalExtraction && !clinicalExtraction) {
      setClinicalExtraction(encounter.clinicalExtraction as ClinicalExtraction);
    }
    if (encounter.patternMatch && !patternMatch) {
      setPatternMatch(encounter.patternMatch as PatternMatchResult);
    }
  }, [encounter?.id, encounter?.evidenceSuggestions, encounter?.soapNote, encounter?.transcription,
      encounter?.diarizedTranscript, encounter?.clinicalExtraction, encounter?.patternMatch]);

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

  // Create new patient inline from encounter form
  const createPatientMutation = useMutation({
    mutationFn: async () => {
      if (!npFirst.trim() || !npLast.trim()) throw new Error("First and last name are required");
      const body: Record<string, unknown> = {
        firstName: npFirst.trim(),
        lastName: npLast.trim(),
        gender: npGender,
      };
      if (npDob) body.dateOfBirth = new Date(npDob).toISOString();
      const res = await apiRequest("POST", "/api/patients", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to create patient");
      }
      return res.json();
    },
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/search"] });
      setPatientId(newPatient.id.toString());
      setShowNewPatient(false);
      setNpFirst(""); setNpLast(""); setNpGender("male"); setNpDob("");
      toast({ title: "Patient added", description: `${newPatient.firstName} ${newPatient.lastName} has been created and selected.` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Could not create patient", description: e.message }),
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
      if (!patientId) throw new Error("Please select a patient first");

      let encounterId = savedId;

      if (!encounterId) {
        // No encounter saved yet — create one, including transcription in the body
        const body = {
          patientId: parseInt(patientId), visitDate, visitType,
          chiefComplaint: chiefComplaint || null,
          linkedLabResultId: linkedLabResultId ? parseInt(linkedLabResultId) : null,
          clinicianNotes: clinicianNotes || null,
          transcription: transcription || null,
        };
        const saveRes = await apiRequest("POST", "/api/encounters", body);
        const saved = await saveRes.json();
        setSavedId(saved.id);
        encounterId = saved.id;
      }

      // Always persist the current transcription to the encounter before generating SOAP.
      // This ensures the server reads the latest text even if the encounter was created
      // without it (e.g. save → record → generate) or diarizedTranscript was set instead.
      await apiRequest("PUT", `/api/encounters/${encounterId}`, { transcription: transcription || null });

      const res = await apiRequest("POST", `/api/encounters/${encounterId}/generate-soap`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setSoap(data.soapNote);
      if (data.diarizedTranscript?.length) setDiarizedTranscript(data.diarizedTranscript);
      if (data.clinicalExtraction) setClinicalExtraction(data.clinicalExtraction);
      invalidate();
      setActiveTab("soap");
      if (data.medicationMatches?.length) {
        setMedMatches(data.medicationMatches);
        const needsReview = data.medicationMatches.filter((m: any) => m.needsReview).length;
        toast({
          title: "SOAP note generated",
          description: `${data.medicationMatches.length} medication${data.medicationMatches.length !== 1 ? "s" : ""} detected${needsReview ? ` · ${needsReview} flagged for review` : ""}. Switch to Transcript tab to review.`,
        });
      } else {
        toast({ title: "SOAP note generated", description: "Review and edit each section as needed." });
      }
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Generation failed", description: e.message }),
  });

  // Auto-generate SOAP + evidence in parallel after ensuring transcript is saved
  const autoGenerateAll = async () => {
    if (!patientId) { toast({ variant: "destructive", title: "Select a patient first" }); return; }
    const hasContent = transcription.trim().length > 0 || (diarizedTranscript?.length ?? 0) > 0;
    if (!hasContent) { toast({ variant: "destructive", title: "No transcript", description: "Record or paste a transcript before generating." }); return; }

    setAutoGenerating("both");
    try {
      let encounterId = savedId;

      // Step 1: Ensure encounter exists and transcript is persisted
      if (!encounterId) {
        const body = {
          patientId: parseInt(patientId), visitDate, visitType,
          chiefComplaint: chiefComplaint || null,
          linkedLabResultId: linkedLabResultId ? parseInt(linkedLabResultId) : null,
          clinicianNotes: clinicianNotes || null,
          transcription: transcription || null,
        };
        const saveRes = await apiRequest("POST", "/api/encounters", body);
        const saved = await saveRes.json();
        setSavedId(saved.id);
        encounterId = saved.id;
      } else {
        await apiRequest("PUT", `/api/encounters/${encounterId}`, { transcription: transcription || null });
      }

      // Step 2: Fire SOAP and evidence simultaneously
      toast({ title: "Generating…", description: "SOAP note and evidence running in parallel." });

      const [soapResult, evidenceResult] = await Promise.allSettled([
        apiRequest("POST", `/api/encounters/${encounterId}/generate-soap`, {}).then(r => r.json()),
        apiRequest("POST", `/api/encounters/${encounterId}/evidence`, {}).then(r => r.json()),
      ]);

      if (soapResult.status === "fulfilled") {
        setSoap(soapResult.value.soapNote);
        if (soapResult.value.diarizedTranscript?.length) setDiarizedTranscript(soapResult.value.diarizedTranscript);
        if (soapResult.value.clinicalExtraction) setClinicalExtraction(soapResult.value.clinicalExtraction);
        if (soapResult.value.medicationMatches?.length) setMedMatches(soapResult.value.medicationMatches);
        setActiveTab("soap");
      } else {
        toast({ variant: "destructive", title: "SOAP generation failed", description: (soapResult.reason as any)?.message });
      }

      if (evidenceResult.status === "fulfilled") {
        setEvidenceOverlay(evidenceResult.value.evidenceSuggestions);
        // Evidence pills appear automatically in View mode — no mode switch needed
      } else {
        toast({ variant: "destructive", title: "Evidence generation failed", description: (evidenceResult.reason as any)?.message });
      }

      invalidate();

      if (soapResult.status === "fulfilled") {
        const evidenceOk = evidenceResult.status === "fulfilled";
        toast({
          title: "Done",
          description: evidenceOk
            ? "SOAP note ready with evidence overlay. Switch to View for a clean copy."
            : "SOAP note ready. Evidence generation failed — try again from the Evidence tab.",
        });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Auto-generation failed", description: e.message });
    } finally {
      setAutoGenerating(null);
    }
  };

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

  // ── Global loading overlay sync ───────────────────────────────────────────
  const { setLoading: setGlobalLoading, clearLoading: clearGlobalLoading } = useGlobalLoading();

  useEffect(() => {
    if (recorderState === "transcribing") {
      setGlobalLoading("Transcribing audio…");
    } else if (autoGenerating !== null) {
      setGlobalLoading("Analyzing encounter…");
    } else if (soapMutation.isPending) {
      setGlobalLoading("Generating SOAP note…");
    } else if (summaryMutation.isPending) {
      setGlobalLoading("Generating patient summary…");
    } else if (pipelineLoading === "normalizing") {
      setGlobalLoading("Normalizing transcript…");
    } else if (pipelineLoading === "extracting") {
      setGlobalLoading("Extracting clinical facts…");
    } else if (pipelineLoading === "matching") {
      setGlobalLoading("Identifying clinical patterns…");
    } else if (pipelineLoading === "evidence") {
      setGlobalLoading("Searching clinical evidence…");
    } else if (pipelineLoading === "validating") {
      setGlobalLoading("Validating SOAP note…");
    } else {
      clearGlobalLoading();
    }
  }, [recorderState, autoGenerating, soapMutation.isPending, summaryMutation.isPending, pipelineLoading]);

  // Ensure overlay clears on unmount
  useEffect(() => () => { clearGlobalLoading(); }, []);

  // ── Recording activity heartbeat ──────────────────────────────────────────
  // Prevent the session-timeout idle timer from firing during an active
  // recording. Every 60 s we dispatch a synthetic activity event so the
  // modal's idle clock stays reset for as long as the mic is live.
  useEffect(() => {
    if (recorderState !== "recording") return;
    const id = setInterval(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    }, 60_000);
    return () => clearInterval(id);
  }, [recorderState]);

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

  // ── Pipeline action helpers ──────────────────────────────────────────────────

  const runNormalize = async () => {
    if (!savedId) { toast({ variant: "destructive", title: "Save first", description: "Save the encounter before running normalization." }); return; }
    setPipelineLoading("normalizing");
    try {
      const body: any = {};
      if (rawUtterances?.length) body.utterances = rawUtterances;
      else body.transcription = transcription;
      const res = await apiRequest("POST", `/api/encounters/${savedId}/normalize`, body);
      const data = await res.json();
      setDiarizedTranscript(data.diarizedTranscript);
      invalidate();
      setActiveTab("transcript");
      toast({ title: "Transcript normalized", description: "Speaker labels and medical terms corrected." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Normalization failed", description: e.message });
    } finally {
      setPipelineLoading(null);
    }
  };

  const runExtract = async () => {
    if (!savedId) { toast({ variant: "destructive", title: "Save first", description: "Save before running extraction." }); return; }
    setPipelineLoading("extracting");
    try {
      const res = await apiRequest("POST", `/api/encounters/${savedId}/extract`, {});
      const data = await res.json();
      setClinicalExtraction(data.clinicalExtraction);
      invalidate();
      toast({ title: "Clinical facts extracted", description: "Review extracted data in the Transcript tab." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Extraction failed", description: e.message });
    } finally {
      setPipelineLoading(null);
    }
  };

  const runMatchPatterns = async () => {
    if (!savedId) { toast({ variant: "destructive", title: "Save first", description: "Save before running pattern matching." }); return; }
    if (!diarizedTranscript?.length && !transcription.trim()) {
      toast({ variant: "destructive", title: "No transcript", description: "Add a transcript before running pattern matching." }); return;
    }
    setPipelineLoading("matching");
    try {
      const res = await apiRequest("POST", `/api/encounters/${savedId}/match-patterns`, {});
      const data = await res.json();
      setPatternMatch(data.patternMatch);
      invalidate();
      toast({
        title: "Pattern matching complete",
        description: data.patternMatch.mode === "context_linked"
          ? "Patterns identified using transcript + linked lab context."
          : "Patterns identified from transcript symptoms only. Lab linkage optional.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Pattern matching failed", description: e.message });
    } finally {
      setPipelineLoading(null);
    }
  };

  const runEvidence = async () => {
    if (!savedId) { toast({ variant: "destructive", title: "Save first", description: "Save before running evidence lookup." }); return; }
    if (!transcription.trim() && !diarizedTranscript?.length) { toast({ variant: "destructive", title: "No transcript", description: "Add a transcript before running evidence lookup." }); return; }
    setPipelineLoading("evidence");
    try {
      const res = await apiRequest("POST", `/api/encounters/${savedId}/evidence`, {});
      const data = await res.json();
      setEvidenceOverlay(data.evidenceSuggestions);
      invalidate();
      setActiveTab("evidence");
      toast({ title: "Evidence overlay ready", description: "Review citations. These are informational only — not auto-inserted into your chart." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Evidence lookup failed", description: e.message });
    } finally {
      setPipelineLoading(null);
    }
  };

  const runValidate = async () => {
    if (!savedId) { toast({ variant: "destructive", title: "Save first" }); return; }
    if (!hasSoap) { toast({ variant: "destructive", title: "No SOAP note", description: "Generate a SOAP note before running validation." }); return; }
    setPipelineLoading("validating");
    try {
      const res = await apiRequest("POST", `/api/encounters/${savedId}/validate`, {});
      const data = await res.json();
      setValidationResult(data.validation);
      invalidate();
      setActiveTab("soap");
      const status = data.validation?.overall_status;
      toast({
        title: status === "pass" ? "Validation passed" : status === "fail" ? "Validation found errors" : "Validation complete — review flags",
        description: status === "pass" ? "No unsupported claims detected in SOAP note." : "Review flagged items in the SOAP Note tab.",
        variant: status === "fail" ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Validation failed", description: e.message });
    } finally {
      setPipelineLoading(null);
    }
  };

  // Delete encounter
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) return;
      await apiRequest("DELETE", `/api/encounters/${savedId}`);
    },
    onSuccess: () => { invalidate(); onDeleted(); toast({ title: "Encounter deleted" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Delete failed", description: e.message }),
  });

  const hasTranscription = transcription.trim().length > 0 || (diarizedTranscript?.length ?? 0) > 0;
  const hasSoap = !!(soap.fullNote?.trim() || soap.assessment || soap.subjective);
  const hasSummary = patientSummary.trim().length > 0;
  const hasExtraction = !!clinicalExtraction;
  const hasPatternMatch = (patternMatch?.matched_patterns?.length ?? 0) > 0;
  const hasEvidence = (evidenceOverlay?.suggestions?.length ?? 0) > 0;

  const steps = [
    { id: "details",    label: "Details",    done: hasTranscription, icon: Stethoscope },
    { id: "transcript", label: "Transcript", done: hasExtraction,    icon: FileText },
    { id: "soap",       label: "SOAP Note",  done: hasSoap,          icon: ClipboardList },
    { id: "evidence",   label: "Evidence",   done: hasEvidence,      icon: BookOpen },
    { id: "summary",    label: "Summary",    done: hasSummary,       icon: User },
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
      <div className="flex items-center gap-0 px-4 border-b bg-background">
        {steps.map((step) => {
          const Icon = step.icon;
          const isActive = activeTab === step.id;
          return (
            <button
              key={step.id}
              data-testid={`tab-${step.id}`}
              onClick={() => setActiveTab(step.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
            >
              {step.done ? <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" /> : <Circle className="w-3 h-3 opacity-30 flex-shrink-0" />}
              <Icon className="w-3 h-3 flex-shrink-0" />
              <span className="hidden sm:inline">{step.label}</span>
              {step.id === "transcript" && medMatches && medMatches.length > 0 && (
                <span className={`ml-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold leading-none px-1.5 py-0.5 ${medMatches.some(m => m.needsReview) ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"}`}>
                  {medMatches.length}
                </span>
              )}
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
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="patient-select" className="text-xs font-medium">Patient *</Label>
                  {!initialPatientId && !encounter && (
                    <button
                      type="button"
                      onClick={() => setShowNewPatient(v => !v)}
                      className={`flex items-center gap-1 text-xs font-medium transition-colors ${showNewPatient ? "text-muted-foreground" : "text-primary hover:text-primary/80"}`}
                      data-testid="button-toggle-new-patient"
                    >
                      {showNewPatient
                        ? <><X className="w-3 h-3" />Cancel</>
                        : <><Plus className="w-3 h-3" />New Patient</>}
                    </button>
                  )}
                </div>

                {/* When opened from a patient profile, lock the patient field */}
                {initialPatientId && !encounter ? (
                  <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-muted/30 text-sm">
                    <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 font-medium">
                      {(() => { const p = patients.find(pt => pt.id.toString() === patientId); return p ? `${p.firstName} ${p.lastName}` : "Loading patient..."; })()}
                    </span>
                    <button
                      onClick={() => setLocation(`/patients?patient=${patientId}`)}
                      className="text-xs text-primary hover:underline flex items-center gap-0.5 flex-shrink-0"
                      data-testid="button-back-to-profile"
                    >
                      <ExternalLink className="w-3 h-3" />Profile
                    </button>
                  </div>
                ) : showNewPatient ? (
                  /* ── Inline new-patient form ── */
                  <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">New Patient</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs mb-1 block">First Name *</Label>
                        <Input
                          value={npFirst}
                          onChange={e => setNpFirst(e.target.value)}
                          placeholder="First"
                          data-testid="input-new-patient-first"
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Last Name *</Label>
                        <Input
                          value={npLast}
                          onChange={e => setNpLast(e.target.value)}
                          placeholder="Last"
                          data-testid="input-new-patient-last"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs mb-1 block">Date of Birth</Label>
                        <Input
                          type="date"
                          value={npDob}
                          onChange={e => setNpDob(e.target.value)}
                          data-testid="input-new-patient-dob"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Biological Sex *</Label>
                        <Select value={npGender} onValueChange={setNpGender}>
                          <SelectTrigger data-testid="select-new-patient-gender">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => createPatientMutation.mutate()}
                        disabled={createPatientMutation.isPending || !npFirst.trim() || !npLast.trim()}
                        data-testid="button-create-patient"
                        className="flex-1"
                      >
                        {createPatientMutation.isPending ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Creating…</> : <><Plus className="w-3 h-3 mr-1.5" />Add Patient</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={patientId || "none"}
                    onValueChange={(v) => setPatientId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger data-testid="select-patient" id="patient-select">
                      <SelectValue placeholder="Select patient..." />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.filter(p => p.id != null).map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.firstName} {p.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
                visitType={visitType}
                onTranscribed={(text, utterances) => {
                  // Use the pre-recording snapshot so we don't double-append partial text
                  const base = preRecordingTranscriptionRef.current;
                  const updated = base ? base + "\n\n" + text : text;
                  setTranscription(updated);
                  preRecordingTranscriptionRef.current = "";
                  if (utterances?.length) {
                    setRawUtterances(utterances);
                    setDiarizedTranscript(utterances);
                  }
                  // Auto-save transcript to encounter immediately if already saved
                  if (savedId) {
                    apiRequest("PUT", `/api/encounters/${savedId}`, { transcription: updated })
                      .catch(() => {}); // silent — user can manually save if this fails
                  }
                }}
                onPartialTranscription={(accumulatedText) => {
                  // Prepend pre-existing text so the box shows old + new live text
                  const base = preRecordingTranscriptionRef.current;
                  setTranscription(base ? base + "\n\n" + accumulatedText : accumulatedText);
                }}
                onStateChange={(state) => {
                  if (state === "recording") {
                    // Snapshot whatever is already in the box before this recording session
                    preRecordingTranscriptionRef.current = transcription;
                  }
                  setRecorderState(state);
                }}
              />

              {/* Live notes area — shows transcript building in real time */}
              <div className="relative">
                {recorderState === "recording" && !transcription && (
                  <div className="absolute inset-0 rounded-md bg-red-50/60 dark:bg-red-950/20 border-2 border-red-300/50 flex items-start gap-2 px-3 py-3 pointer-events-none z-10">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1 flex-shrink-0" />
                    <span className="text-sm text-red-600/80 dark:text-red-400/80 italic">Recording… transcript will appear here in about 60 seconds.</span>
                  </div>
                )}
                {recorderState === "transcribing" && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-background/90 rounded-md px-2 py-1 z-10 pointer-events-none border text-xs text-muted-foreground">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Finalizing…
                  </div>
                )}
                <Textarea
                  value={transcription}
                  onChange={e => setTranscription(e.target.value)}
                  placeholder="Session notes will appear here as you record, or type / paste notes directly..."
                  rows={12}
                  className={`text-sm font-mono resize-y transition-opacity ${recorderState === "transcribing" ? "opacity-60" : ""}`}
                  data-testid="textarea-transcription"
                  disabled={recorderState === "transcribing"}
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

            {/* Generate SOAP + Evidence in parallel */}
            <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
              {/* Secondary: SOAP only */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => soapMutation.mutate()}
                disabled={soapMutation.isPending || autoGenerating !== null || !hasTranscription}
                data-testid="button-generate-soap"
              >
                {soapMutation.isPending
                  ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />SOAP only…</>
                  : <><FileText className="w-3 h-3 mr-1.5" />SOAP only</>}
              </Button>
              {/* Primary: SOAP + Evidence in parallel */}
              <Button
                onClick={autoGenerateAll}
                disabled={autoGenerating !== null || soapMutation.isPending || !hasTranscription}
                data-testid="button-auto-generate-all"
                size="default"
              >
                {autoGenerating === "both"
                  ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating SOAP &amp; Evidence…</>
                  : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generate SOAP &amp; Evidence</>}
              </Button>
            </div>
          </>
        )}

        {/* ── Tab: Transcript & Pipeline ─────────────────────────────── */}
        {activeTab === "transcript" && (
          <>
            {/* Pipeline buttons */}
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Clinical AI Pipeline</h3>
                <span className="text-xs text-muted-foreground ml-1">Run stages in order</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runNormalize}
                  disabled={(!hasTranscription) || pipelineLoading !== null}
                  data-testid="button-normalize"
                >
                  {pipelineLoading === "normalizing"
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Normalizing…</>
                    : <><CheckCircle2 className="w-3 h-3 mr-1.5" />2 · Normalize</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runExtract}
                  disabled={!diarizedTranscript?.length || pipelineLoading !== null}
                  data-testid="button-extract"
                >
                  {pipelineLoading === "extracting"
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Extracting…</>
                    : <><FlaskConical className="w-3 h-3 mr-1.5" />3 · Extract Facts</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runMatchPatterns}
                  disabled={!hasTranscription || pipelineLoading !== null}
                  data-testid="button-match-patterns"
                >
                  {pipelineLoading === "matching"
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Matching…</>
                    : <><Sparkles className="w-3 h-3 mr-1.5" />4 · Match Patterns</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { soapMutation.mutate(); setActiveTab("soap"); }}
                  disabled={!hasTranscription || soapMutation.isPending}
                  data-testid="button-generate-soap-pipeline"
                >
                  {soapMutation.isPending
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Generating…</>
                    : <><ClipboardList className="w-3 h-3 mr-1.5" />5 · Generate SOAP</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runEvidence}
                  disabled={!hasTranscription || pipelineLoading !== null}
                  data-testid="button-evidence"
                >
                  {pipelineLoading === "evidence"
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Loading…</>
                    : <><BookOpen className="w-3 h-3 mr-1.5" />6 · Evidence</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runValidate}
                  disabled={!hasSoap || pipelineLoading !== null}
                  data-testid="button-validate-soap"
                >
                  {pipelineLoading === "validating"
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Validating…</>
                    : <><CheckCircle2 className="w-3 h-3 mr-1.5" />Validate SOAP</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const text = transcription?.trim();
                    if (!text) return;
                    setMedDetecting(true);
                    setMedMatches(null);
                    try {
                      const res = await apiRequest("POST", "/api/medication-dictionary/normalize", { text });
                      const data = await res.json();
                      setMedMatches(data.matches ?? []);
                    } catch {
                      toast({ title: "Detection failed", variant: "destructive" });
                    } finally {
                      setMedDetecting(false);
                    }
                  }}
                  disabled={!hasTranscription || medDetecting || pipelineLoading !== null}
                  data-testid="button-detect-medications"
                >
                  {medDetecting
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Detecting…</>
                    : <><Pill className="w-3 h-3 mr-1.5" />Detect Medications</>}
                </Button>
              </div>
            </div>

            {/* Diarized transcript view */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Transcript</h3>
              {diarizedTranscript?.length ? (
                <div className="space-y-2 max-h-[380px] overflow-y-auto rounded-md border p-3 bg-background">
                  {diarizedTranscript.map((u, i) => {
                    const isClinicianSpeaker = u.speaker.toLowerCase().includes("clinician") || u.speaker.toLowerCase().includes("provider") || u.speaker.toLowerCase() === "speaker 0" || u.speaker.toLowerCase() === "a";
                    return (
                      <div key={i} className={`flex gap-2.5 ${isClinicianSpeaker ? "" : "justify-end"}`}>
                        {isClinicianSpeaker && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                            <Stethoscope className="w-3 h-3 text-primary" />
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${isClinicianSpeaker ? "bg-muted/40" : "bg-primary/5 text-right"}`}>
                          <div className="text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">
                            {u.speaker}
                            {u.start != null && <span className="ml-1.5 font-normal">{Math.floor(u.start / 60)}:{String(Math.round(u.start % 60)).padStart(2, "0")}</span>}
                          </div>
                          <p className="leading-relaxed">{u.normalizedText ?? u.text}</p>
                          {u.normalizedText && u.normalizedText !== u.text && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 italic">Original: {u.text}</p>
                          )}
                        </div>
                        {!isClinicianSpeaker && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center mt-0.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : transcription ? (
                <div className="rounded-md border p-4 bg-background max-h-[340px] overflow-y-auto space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Raw Transcript — run Normalize to add speaker labels</span>
                    <span className="text-[10px] text-muted-foreground">{transcription.split(/\s+/).filter(Boolean).length} words</span>
                  </div>
                  {formatTranscriptAsNotes(transcription).map((para, i) => (
                    <p key={i} className="text-sm leading-relaxed text-foreground">{para}</p>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No transcript yet. Record or upload audio in the Details tab, then run Normalize.
                </div>
              )}
            </div>

            {/* Medication Recognition Panel */}
            {medMatches !== null && (
              <div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Pill className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Medications Identified</h3>
                  {medMatches.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{medMatches.length}</Badge>
                  )}
                  {medMatches.some(m => m.needsReview) && (
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                      {medMatches.filter(m => m.needsReview).length} to verify
                    </Badge>
                  )}
                  <button
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setMedMatches(null)}
                  >
                    Dismiss
                  </button>
                </div>

                {medMatches.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No medications were identified in this transcript.
                  </div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">As Spoken</th>
                          <th className="text-left px-3 py-2 font-semibold">Generic Name</th>
                          <th className="text-left px-3 py-2 font-semibold">Drug Class</th>
                          <th className="text-left px-3 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {medMatches.map((m, i) => (
                          <tr key={i} data-testid={`row-med-match-${i}`} className={`border-t ${m.needsReview ? "bg-amber-50/40 dark:bg-amber-950/10" : i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{m.originalTerm}</td>
                            <td className="px-3 py-2.5 font-medium">{m.canonicalName}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{m.drugClass ?? "—"}</td>
                            <td className="px-3 py-2.5">
                              {m.needsReview ? (
                                <button
                                  data-testid={`button-confirm-term-${i}`}
                                  disabled={confirmingTermIdx === i}
                                  onClick={async () => {
                                    setConfirmingTermIdx(i);
                                    try {
                                      await apiRequest("POST", "/api/medication-dictionary/entry", {
                                        genericName: m.canonicalName,
                                        commonSpokenVariants: [m.originalTerm],
                                        drugClass: m.drugClass ?? undefined,
                                      });
                                      setMedMatches(prev => prev
                                        ? prev.map((match, idx) =>
                                            idx === i ? { ...match, needsReview: false, confidence: 0.85, matchType: "spoken_variant" as const } : match
                                          )
                                        : prev
                                      );
                                      toast({ title: "Term saved", description: `"${m.originalTerm}" will be recognized as ${m.canonicalName} in future visits.` });
                                    } catch {
                                      toast({ title: "Could not save term", variant: "destructive" });
                                    } finally {
                                      setConfirmingTermIdx(null);
                                    }
                                  }}
                                  className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
                                >
                                  {confirmingTermIdx === i
                                    ? <><RefreshCw className="w-3 h-3 animate-spin" /><span>Saving…</span></>
                                    : <><AlertCircle className="w-3 h-3" /><span>Verify — confirm as {m.canonicalName}</span></>}
                                </button>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Recognized
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {medMatches.some(m => m.needsReview) && (
                      <div className="px-3 py-2 bg-muted/30 border-t text-[11px] text-muted-foreground">
                        Click "Verify" on any uncertain term to confirm it — the system will recognize it automatically in future encounters.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Pattern / Phenotype Match results */}
            {pipelineLoading === "matching" && (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                <div className="text-center">
                  <p className="text-sm font-medium">Identifying clinical patterns…</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyzing symptoms{encounter?.linkedLabResultId ? ", labs," : ""} and visit context</p>
                </div>
              </div>
            )}

            {patternMatch && pipelineLoading !== "matching" && (
              <div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Pattern / Phenotype Matching</h3>
                  <Badge variant="secondary" className="text-[10px]">Stage 4</Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${patternMatch.mode === "context_linked" ? "border-emerald-300 text-emerald-700" : "border-blue-300 text-blue-700"}`}
                  >
                    {patternMatch.mode === "context_linked" ? "Transcript + Labs" : "Transcript Only"}
                  </Badge>
                  {patternMatch.matched_patterns.length === 0 && (
                    <span className="text-xs text-muted-foreground ml-1">No clear patterns identified</span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 px-2 text-xs text-muted-foreground gap-1"
                    onClick={runMatchPatterns}
                    disabled={!hasTranscription || pipelineLoading !== null}
                    data-testid="button-refresh-patterns"
                  >
                    <RefreshCw className="w-3 h-3" />Re-run
                  </Button>
                </div>

                {/* Mode note */}
                <div className={`rounded-md px-3 py-2 text-xs mb-3 flex items-start gap-2 ${patternMatch.mode === "context_linked" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    {patternMatch.mode === "context_linked"
                      ? "Analysis incorporates linked lab results alongside transcript context."
                      : "Operating in transcript-only mode. Link a lab set to this encounter for lab-backed pattern confirmation."}
                  </span>
                </div>

                {/* Pattern cards */}
                {patternMatch.matched_patterns.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {patternMatch.matched_patterns.map((p: PatternMatch, i: number) => {
                      const basisColors: Record<string, string> = {
                        symptom_based:  "border-blue-200 bg-blue-50/40",
                        lab_backed:     "border-emerald-200 bg-emerald-50/40",
                        combined:       "border-violet-200 bg-violet-50/40",
                        insufficient:   "border-border bg-muted/20",
                      };
                      const basisBadge: Record<string, string> = {
                        symptom_based:  "text-blue-700 border-blue-300",
                        lab_backed:     "text-emerald-700 border-emerald-300",
                        combined:       "text-violet-700 border-violet-300",
                        insufficient:   "text-muted-foreground border-border",
                      };
                      const confidenceColors: Record<string, string> = {
                        possible:   "text-amber-700 bg-amber-50 border-amber-200",
                        probable:   "text-blue-700 bg-blue-50 border-blue-200",
                        confirmed:  "text-emerald-700 bg-emerald-50 border-emerald-200",
                      };
                      const cardClass = basisColors[p.evidence_basis] ?? "border-border";
                      const badgeClass = basisBadge[p.evidence_basis] ?? "text-muted-foreground border-border";
                      const confClass  = confidenceColors[p.confidence] ?? "text-muted-foreground border-border";
                      const basisLabel: Record<string, string> = {
                        symptom_based:  "Symptom-Based",
                        lab_backed:     "Lab-Backed",
                        combined:       "Combined",
                        insufficient:   "Insufficient Data",
                      };
                      return (
                        <div key={i} className={`rounded-md border p-4 space-y-2.5 ${cardClass}`}>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold leading-snug">{p.pattern_name}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{p.category.replace(/_/g, " ")}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] border ${confClass}`}>
                                {p.confidence}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] border ${badgeClass}`}>
                                {basisLabel[p.evidence_basis] ?? p.evidence_basis}
                              </Badge>
                            </div>
                          </div>

                          {p.supporting_evidence.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Supporting Evidence</p>
                              <ul className="space-y-0.5">
                                {p.supporting_evidence.map((ev, ei) => (
                                  <li key={ei} className="text-xs flex items-start gap-1.5">
                                    <span className="text-emerald-600 mt-0.5">·</span><span>{ev}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {p.contradicting_evidence.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">Contradicting Evidence</p>
                              <ul className="space-y-0.5">
                                {p.contradicting_evidence.map((ev, ei) => (
                                  <li key={ei} className="text-xs flex items-start gap-1.5">
                                    <TriangleAlert className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" /><span>{ev}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {p.recommended_considerations.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Considerations</p>
                              <ul className="space-y-0.5">
                                {p.recommended_considerations.map((rc, ri) => (
                                  <li key={ri} className="text-xs flex items-start gap-1.5">
                                    <ChevronRight className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" /><span>{rc}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {p.requires_lab_confirmation && p.lab_markers_to_evaluate && p.lab_markers_to_evaluate.length > 0 && (
                            <div className="pt-1 border-t">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Lab Confirmation Recommended</p>
                              <div className="flex flex-wrap gap-1">
                                {p.lab_markers_to_evaluate.map((m, mi) => (
                                  <Badge key={mi} variant="outline" className="text-[10px]">{m}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {p.notes && (
                            <p className="text-[10px] text-muted-foreground italic border-t pt-1.5">{p.notes}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Symptom clusters + unmatched concerns */}
                {(patternMatch.symptom_clusters.length > 0 || patternMatch.unmatched_concerns.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {patternMatch.symptom_clusters.length > 0 && (
                      <div className="rounded-md border p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Symptom Clusters</p>
                        <ul className="space-y-0.5">
                          {patternMatch.symptom_clusters.map((s, si) => (
                            <li key={si} className="text-xs flex items-start gap-1.5">
                              <span className="text-muted-foreground mt-0.5">·</span><span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {patternMatch.unmatched_concerns.length > 0 && (
                      <div className="rounded-md border p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Unmatched Concerns</p>
                        <ul className="space-y-0.5">
                          {patternMatch.unmatched_concerns.map((c, ci) => (
                            <li key={ci} className="text-xs flex items-start gap-1.5">
                              <span className="text-muted-foreground mt-0.5">·</span><span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Clinical extraction results */}
            {clinicalExtraction && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Extracted Clinical Facts</h3>
                  <Badge variant="secondary" className="text-[10px]">Stage 3</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: "chief_concerns", label: "Chief Concerns" },
                    { key: "symptoms_reported", label: "Symptoms Reported" },
                    { key: "symptoms_denied", label: "Symptoms Denied" },
                    { key: "medications_current", label: "Current Medications" },
                    { key: "medication_changes_discussed", label: "Medication Changes" },
                    { key: "labs_reviewed", label: "Labs Reviewed" },
                    { key: "diagnoses_discussed", label: "Diagnoses Discussed" },
                    { key: "assessment_candidates", label: "Assessment Candidates" },
                    { key: "plan_candidates", label: "Plan Items" },
                    { key: "follow_up_items", label: "Follow-Up" },
                    { key: "red_flags", label: "Red Flags" },
                    { key: "uncertain_items", label: "Uncertain Items" },
                  ].map(({ key, label }) => {
                    const items = (clinicalExtraction as any)[key] as string[] | undefined;
                    if (!items?.length) return null;
                    const isRedFlag = key === "red_flags";
                    const isUncertain = key === "uncertain_items";
                    return (
                      <div key={key} className="rounded-md border p-3">
                        <div className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${isRedFlag ? "text-destructive" : isUncertain ? "text-amber-600" : "text-muted-foreground"}`}>
                          {isRedFlag && <TriangleAlert className="w-3 h-3 inline mr-1" />}
                          {label}
                        </div>
                        <ul className="space-y-0.5">
                          {items.map((item, idx) => (
                            <li key={idx} className="text-xs flex items-start gap-1.5">
                              <span className="text-muted-foreground mt-0.5">·</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Evidence Overlay ─────────────────────────────────────── */}
        {activeTab === "evidence" && (
          <>
            {/* Safety banner — always visible */}
            <div className="rounded-md border border-blue-200 bg-blue-50/60 px-4 py-2.5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-800">Evidence Overlay — Clinician Review Only</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  These evidence suggestions are informational and <strong>never auto-inserted</strong> into the signed chart. All treatment decisions require clinician judgement.
                </p>
              </div>
            </div>

            {/* Header + refresh button */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Evidence-Based Suggestions</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generated from {evidenceOverlay?.clinical_questions?.length ?? 0} focused clinical question{evidenceOverlay?.clinical_questions?.length === 1 ? "" : "s"} derived from today's visit.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={runEvidence}
                disabled={!hasTranscription || pipelineLoading !== null}
                data-testid="button-refresh-evidence"
              >
                {pipelineLoading === "evidence"
                  ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Generating…</>
                  : <><RefreshCw className="w-3 h-3 mr-1.5" />Regenerate</>}
              </Button>
            </div>

            {!hasTranscription ? (
              <div className="rounded-md border border-dashed p-8 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium mb-1">Transcript required</p>
                <p className="text-xs text-muted-foreground mb-4">Record or paste a session transcript in the Details tab, then click Generate SOAP &amp; Evidence.</p>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("details")}>
                  Go to Details tab
                </Button>
              </div>
            ) : pipelineLoading === "evidence" ? (
              <div className="flex flex-col items-center justify-center py-14 gap-4">
                <BookOpen className="w-9 h-9 text-primary animate-pulse" />
                <div className="text-center">
                  <p className="text-sm font-medium">Generating clinical questions and searching evidence…</p>
                  <p className="text-xs text-muted-foreground mt-1">This may take 15–30 seconds</p>
                </div>
              </div>
            ) : !evidenceOverlay ? (
              <div className="rounded-md border border-dashed p-8 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">Click <strong>Regenerate</strong> to generate evidence-based suggestions for this visit.</p>
              </div>
            ) : (
              <>
                {/* Clinical questions panel */}
                {evidenceOverlay.clinical_questions?.length > 0 && (
                  <div className="rounded-md border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FlaskConical className="w-3.5 h-3.5 text-primary" />
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clinical Questions Generated</h4>
                    </div>
                    <ol className="space-y-1.5">
                      {evidenceOverlay.clinical_questions.map((q, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-xs font-mono text-muted-foreground flex-shrink-0 mt-0.5 w-4">{i + 1}.</span>
                          <span className="italic text-foreground/80">{q}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* ── Guideline Validations ──────────────────────────────── */}
                {(evidenceOverlay.guideline_validations?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guideline Validation</h4>
                      <span className="text-[10px] text-muted-foreground">— plan checked against applicable clinical guidelines</span>
                    </div>
                    {evidenceOverlay.guideline_validations!.map((gv, gi) => {
                      const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
                        aligned:       { color: "border-emerald-200 bg-emerald-50/60", icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />, label: "Aligned" },
                        gap:           { color: "border-amber-200 bg-amber-50/60",    icon: <TriangleAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />, label: "Gap identified" },
                        conflict:      { color: "border-red-200 bg-red-50/60",        icon: <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />,    label: "Potential conflict" },
                        not_addressed: { color: "border-border bg-muted/20",          icon: <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />, label: "Not addressed" },
                      };
                      const cfg = statusConfig[gv.current_plan_status] ?? statusConfig.not_addressed;
                      return (
                        <div key={gi} className={`rounded-md border px-4 py-3 space-y-1.5 ${cfg.color}`}>
                          <div className="flex items-start gap-2">
                            {cfg.icon}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-foreground/90">{gv.guideline}</span>
                                <Badge variant="outline" className={`text-[10px] ${
                                  gv.current_plan_status === "aligned" ? "border-emerald-300 text-emerald-700" :
                                  gv.current_plan_status === "gap" ? "border-amber-300 text-amber-700" :
                                  gv.current_plan_status === "conflict" ? "border-red-300 text-red-700" :
                                  "text-muted-foreground"
                                }`}>{cfg.label}</Badge>
                                {gv.clinician_decision_needed && (
                                  <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">Decision needed</Badge>
                                )}
                              </div>
                              <p className="text-xs text-foreground/70 mt-0.5 leading-snug"><span className="font-medium">Finding:</span> {gv.finding}</p>
                              <p className="text-xs text-foreground/70 leading-snug"><span className="font-medium">Guideline recommends:</span> {gv.recommendation}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Evidence Suggestion Cards ───────────────────────────── */}
                {evidenceOverlay.suggestions?.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center">
                    <p className="text-sm text-muted-foreground">No evidence suggestions with verified citations were returned. Try regenerating or adding more clinical context in the Transcript tab.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {evidenceOverlay.suggestions.map((ev, i) => {
                      const strengthColors: Record<string, string> = {
                        strong: "text-emerald-700 bg-emerald-50 border-emerald-200",
                        moderate: "text-blue-700 bg-blue-50 border-blue-200",
                        limited: "text-amber-700 bg-amber-50 border-amber-200",
                        mixed: "text-orange-700 bg-orange-50 border-orange-200",
                        insufficient: "text-muted-foreground bg-muted border-border",
                      };
                      const guidelineClassColors: Record<string, string> = {
                        "I":   "bg-emerald-100 text-emerald-800 border-emerald-300",
                        "IIa": "bg-blue-100 text-blue-800 border-blue-300",
                        "IIb": "bg-sky-100 text-sky-800 border-sky-300",
                        "III": "bg-muted text-muted-foreground border-border",
                      };
                      const levelColors: Record<string, string> = {
                        A: "bg-violet-100 text-violet-800 border-violet-300",
                        B: "bg-indigo-100 text-indigo-800 border-indigo-300",
                        C: "bg-slate-100 text-slate-700 border-slate-300",
                        E: "bg-muted text-muted-foreground border-border",
                      };
                      const alignmentConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
                        aligned:          { color: "text-emerald-700", label: "Plan aligned", icon: <CheckCircle2 className="w-3 h-3" /> },
                        gap_identified:   { color: "text-amber-700",   label: "Gap identified", icon: <TriangleAlert className="w-3 h-3" /> },
                        potential_conflict: { color: "text-red-700",   label: "Potential conflict", icon: <AlertCircle className="w-3 h-3" /> },
                        not_applicable:   { color: "text-muted-foreground", label: "Not applicable", icon: <Circle className="w-3 h-3" /> },
                      };
                      const strengthColor = strengthColors[ev.strength_of_support] ?? strengthColors.insufficient;
                      const alignCfg = ev.plan_alignment ? alignmentConfig[ev.plan_alignment] : null;
                      return (
                        <div key={i} className="rounded-md border p-4 space-y-3">
                          {/* Card header */}
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="text-sm font-semibold">{ev.title}</h4>
                                {ev.is_evidence_informed_consideration && (
                                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                    Possible consideration
                                  </Badge>
                                )}
                              </div>
                              {/* Guideline class + level of evidence badges */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {ev.guideline_class && (
                                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${guidelineClassColors[ev.guideline_class] ?? guidelineClassColors["III"]}`}>
                                    Class {ev.guideline_class}
                                  </span>
                                )}
                                {ev.level_of_evidence && (
                                  <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${levelColors[ev.level_of_evidence] ?? levelColors["E"]}`}>
                                    Level {ev.level_of_evidence}
                                  </span>
                                )}
                                <Badge variant="outline" className={`text-[10px] border ${strengthColor}`}>
                                  {ev.strength_of_support ?? "unknown"} evidence
                                </Badge>
                              </div>
                            </div>
                            {/* Plan alignment indicator */}
                            {alignCfg && (
                              <div className={`flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 ${alignCfg.color}`}>
                                {alignCfg.icon}
                                {alignCfg.label}
                              </div>
                            )}
                          </div>

                          {/* Summary */}
                          <p className="text-sm text-foreground/80 leading-relaxed">{ev.summary}</p>

                          {/* Plan alignment note */}
                          {ev.plan_alignment_note && ev.plan_alignment !== "not_applicable" && (
                            <div className={`text-xs rounded px-3 py-2 flex items-start gap-1.5 ${
                              ev.plan_alignment === "aligned" ? "bg-emerald-50 text-emerald-800" :
                              ev.plan_alignment === "gap_identified" ? "bg-amber-50 text-amber-800" :
                              ev.plan_alignment === "potential_conflict" ? "bg-red-50 text-red-800" :
                              "bg-muted/30 text-muted-foreground"
                            }`}>
                              {ev.plan_alignment === "aligned" ? <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" /> :
                               ev.plan_alignment === "gap_identified" ? <TriangleAlert className="w-3 h-3 flex-shrink-0 mt-0.5" /> :
                               <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />}
                              <span>{ev.plan_alignment_note}</span>
                            </div>
                          )}

                          {/* Relevance to visit */}
                          {ev.relevance_to_visit && (
                            <div className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
                              <span className="font-medium text-foreground/70">Relevance to this visit: </span>
                              {ev.relevance_to_visit}
                            </div>
                          )}

                          {/* Cautions */}
                          {ev.cautions?.length > 0 && (
                            <div className="space-y-1">
                              {ev.cautions.map((c, ci) => (
                                <div key={ci} className="flex items-start gap-1.5 text-xs text-amber-800">
                                  <TriangleAlert className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500" />
                                  <span>{c}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Citations */}
                          {ev.citations?.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">References</div>
                              {ev.citations.map((cite, ci) => (
                                <div key={ci} className="text-xs flex items-start gap-2 bg-muted/20 rounded px-2.5 py-2">
                                  <BookOpen className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-foreground/80 leading-snug">{cite.title}</div>
                                    <div className="text-muted-foreground mt-0.5">
                                      {cite.source}{cite.year ? ` · ${cite.year}` : ""}
                                    </div>
                                    {cite.url && (
                                      <a
                                        href={cite.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline flex items-center gap-0.5 mt-0.5"
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        View source
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
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
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runValidate}
                  disabled={!hasSoap || pipelineLoading === "validating"}
                  data-testid="button-validate-soap-header"
                >
                  {pipelineLoading === "validating"
                    ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Validating…</>
                    : <><CheckCircle2 className={`w-3.5 h-3.5 mr-1.5 ${validationResult?.overall_status === "pass" ? "text-emerald-500" : validationResult?.overall_status === "fail" ? "text-destructive" : ""}`} />Validate</>}
                </Button>
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

            {/* Clinician review flags from AI pipeline */}
            {hasSoap && (() => {
              const soapData = soap as any;
              const uncertainItems: string[] = soapData.uncertain_items ?? [];
              const reviewFlags: string[] = soapData.needs_clinician_review ?? [];
              if (!uncertainItems.length && !reviewFlags.length) return null;
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <h4 className="text-sm font-semibold text-amber-800">Clinician Review Required</h4>
                  </div>
                  {reviewFlags.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1.5">Flagged for Review</p>
                      <ul className="space-y-2">
                        {reviewFlags.map((f, i) => (
                          <ResolvableReviewItem
                            key={i}
                            text={f}
                            icon={<AlertCircle className="w-3 h-3 text-amber-600" />}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                  {uncertainItems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1.5">Uncertain / Unresolved</p>
                      <ul className="space-y-2">
                        {uncertainItems.map((u, i) => (
                          <ResolvableReviewItem
                            key={i}
                            text={u}
                            icon={<Circle className="w-3 h-3 text-amber-500" />}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Validation results panel */}
            {validationResult && hasSoap && (
              <div className={`rounded-md border p-4 space-y-3 ${validationResult.overall_status === "fail" ? "border-destructive/40 bg-destructive/5" : validationResult.overall_status === "flag" ? "border-amber-200 bg-amber-50/40" : "border-emerald-200 bg-emerald-50/40"}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {validationResult.overall_status === "pass" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : validationResult.overall_status === "fail" ? (
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                    ) : (
                      <TriangleAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    )}
                    <h4 className={`text-sm font-semibold ${validationResult.overall_status === "pass" ? "text-emerald-800" : validationResult.overall_status === "fail" ? "text-destructive" : "text-amber-800"}`}>
                      SOAP Validation — {validationResult.overall_status === "pass" ? "No issues found" : validationResult.overall_status === "fail" ? "Errors require attention" : "Review flags present"}
                    </h4>
                  </div>
                  <button
                    onClick={() => setValidationResult(null)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                    data-testid="button-dismiss-validation"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {validationResult.soap_flags?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">SOAP Flags ({validationResult.soap_flags.length})</p>
                    <div className="space-y-2">
                      {validationResult.soap_flags.map((flag, i) => (
                        <div key={i} className={`rounded px-3 py-2 text-xs ${flag.severity === "error" ? "bg-destructive/10 border border-destructive/20" : "bg-amber-50 border border-amber-200"}`}>
                          <div className="flex items-start gap-1.5">
                            {flag.severity === "error"
                              ? <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-destructive" />
                              : <TriangleAlert className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-600" />}
                            <div>
                              <span className={`font-semibold ${flag.severity === "error" ? "text-destructive" : "text-amber-800"}`}>
                                {flag.type.replace(/_/g, " ")}:
                              </span>
                              <span className="ml-1 text-foreground/70">{flag.item}</span>
                              {flag.detail && <p className="mt-0.5 text-muted-foreground">{flag.detail}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {validationResult.evidence_flags?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Evidence Flags ({validationResult.evidence_flags.length})</p>
                    <div className="space-y-2">
                      {validationResult.evidence_flags.map((flag, i) => (
                        <div key={i} className="rounded px-3 py-2 text-xs bg-amber-50 border border-amber-200">
                          <div className="flex items-start gap-1.5">
                            <TriangleAlert className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-600" />
                            <div>
                              <span className="font-semibold text-amber-800">{flag.type.replace(/_/g, " ")}:</span>
                              <span className="ml-1 text-foreground/70">{flag.item}</span>
                              {flag.detail && <p className="mt-0.5 text-muted-foreground">{flag.detail}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                {/* View / Edit toggle row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-0.5 rounded-md border p-0.5 bg-muted/40">
                    <button
                      data-testid="soap-view-toggle"
                      onClick={() => setSoapViewMode("view")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${soapViewMode === "view" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Eye className="w-3 h-3" /> View
                    </button>
                    <button
                      data-testid="soap-edit-toggle"
                      onClick={() => setSoapViewMode("edit")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${soapViewMode === "edit" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <ClipboardList className="w-3 h-3" /> Edit
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="button-copy-soap"
                      onClick={() => {
                        const text = soap.fullNote ?? legacySoapToText(soap);
                        navigator.clipboard.writeText(text).then(() => {
                          setCopiedSoap(true);
                          setTimeout(() => setCopiedSoap(false), 2000);
                        });
                      }}
                    >
                      {copiedSoap
                        ? <><Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />Copied!</>
                        : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy Note</>}
                    </Button>
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
                      {summaryMutation.isPending ? "Generating..." : "Patient Summary"}
                    </Button>
                  </div>
                </div>

                {soapViewMode === "view" && (evidenceOverlay?.suggestions?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 px-1 py-0.5">
                    <Sparkles className="w-3 h-3 text-primary/60 flex-shrink-0" />
                    <p className="text-[10px] text-muted-foreground">
                      Evidence flags are embedded in the Assessment — click any <span className="font-semibold text-primary/70">Evidence</span> pill to view supporting citations. Full citations are in the Evidence tab.
                    </p>
                  </div>
                )}

                {soapViewMode === "view" ? (
                  <div className="rounded-md border bg-card px-5 py-4 min-h-[24rem]">
                    <SoapNoteViewer
                      text={soap.fullNote ?? legacySoapToText(soap)}
                      evidence={evidenceOverlay?.suggestions}
                      mode="flags"
                    />
                  </div>
                ) : (
                  <Textarea
                    value={soap.fullNote ?? legacySoapToText(soap)}
                    onChange={e => setSoap({ fullNote: e.target.value })}
                    rows={32}
                    className="text-sm font-mono resize-y leading-relaxed"
                    data-testid="soap-full-note"
                    spellCheck
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  {soapViewMode === "edit"
                    ? "Editing raw note — save when ready. This is what will be copied and pasted into your EHR."
                    : "Use Copy Note to paste the clean note into your EHR. Evidence pills on each diagnosis open guideline citations inline."}
                </p>
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

  // Fetch full encounter detail (includes evidenceSuggestions, diarizedTranscript,
  // clinicalExtraction, patternMatch — stripped from the list query for performance)
  const { data: selectedEncounterDetail } = useQuery<ClinicalEncounter>({
    queryKey: ["/api/encounters", selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/encounters/${selectedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load encounter");
      return res.json();
    },
    enabled: selectedId !== null,
    staleTime: 0, // always re-fetch when selected to catch updates from other devices
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

  // Merge list entry (has patientName) with detail fetch (has JSONB columns: evidenceSuggestions, etc.)
  const selectedEncounterBase = selectedId ? encounters.find(e => e.id === selectedId) ?? null : null;
  const selectedEncounter: EncounterWithPatient | null = selectedEncounterBase && selectedEncounterDetail
    ? { ...selectedEncounterDetail, patientName: selectedEncounterBase.patientName } as EncounterWithPatient
    : selectedEncounterBase;
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
