import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { NoteTemplate, PatientChart } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, X, GripVertical, ChevronDown, ChevronUp, Save, FileText,
  Stethoscope, Pill, Heart, Brain, ClipboardList, Activity, Users,
  Scissors, AlertTriangle, ListChecks, CalendarCheck, ToggleLeft, ToggleRight,
  Search, Loader2, Download, Upload,
} from "lucide-react";
import { useDiagnosisSearch } from "@/components/diagnosis-search";
import { usePhraseSearch } from "@/components/phrase-search";
import { useSlashMenu } from "@/components/slash-menu";
import { SlashShortcutsHelp } from "@/components/slash-shortcuts-help";
import {
  BUILTIN_BY_ID, type BuiltinBlockId, type ChartDomainKey,
  ROS_SYSTEMS, PE_SYSTEMS,
  createChartData,
  chartDataToText as sharedChartDataToText,
  mergeChartItems,
  resolveDefaultFindings,
  resolveSystemList,
  type ClinicalBlockOverrides,
  buildBulletSection, buildParagraphSection,
  type VitalsData,
} from "@shared/note-builtin-blocks";

const BLOCK_TYPES = [
  { id: "hpi", label: "HPI", icon: FileText, category: "subjective" },
  { id: "medical_history", label: "Medical History", icon: Heart, category: "subjective" },
  { id: "surgical_history", label: "Surgical History", icon: Scissors, category: "subjective" },
  { id: "family_history", label: "Family History", icon: Users, category: "subjective" },
  { id: "social_history", label: "Social History", icon: Brain, category: "subjective" },
  { id: "current_medications", label: "Current Medications", icon: Pill, category: "subjective" },
  { id: "allergies", label: "Allergies", icon: AlertTriangle, category: "subjective" },
  { id: "vitals", label: "Vital Signs", icon: Activity, category: "objective" },
  { id: "ros", label: "Review of Systems", icon: ClipboardList, category: "objective" },
  { id: "physical_exam", label: "Physical Assessment / Exam", icon: Stethoscope, category: "objective" },
  { id: "assessment_plan", label: "Assessment / Plan", icon: ListChecks, category: "assessment" },
  { id: "care_plan", label: "Care Plan", icon: CalendarCheck, category: "plan" },
  { id: "follow_up", label: "Follow-Up", icon: CalendarCheck, category: "plan" },
  { id: "custom_text", label: "Custom Note", icon: FileText, category: "custom" },
] as const;

type BlockTypeId = typeof BLOCK_TYPES[number]["id"];

interface SoapBlock {
  uid: string;
  type: BlockTypeId;
  content: string;
  mode: "freetext" | "chart";
  chartData?: Record<string, { status: string; notes: string; visible: boolean }>;
  assessmentItems?: AssessmentItem[];
  assessmentSummary?: string;
  collapsed?: boolean;
  listItems?: string[];
  /**
   * For history list blocks (PMH/PSH/SH/FH/Meds/Allergies). When true (default)
   * the block renders as a bullet list (one input per item). When false the
   * block renders as a free-text textarea with full slash/dx/phrase support.
   */
  bulletMode?: boolean;
  /** Structured vitals data for the vitals block type. */
  vitalsData?: VitalsData;
  /**
   * For custom_text blocks (non-standard template sections). Shown as the
   * section header in place of the generic "Custom Note" label.
   */
  customLabel?: string;
  /**
   * Filled values for {{blank}} markers in the block content. Index matches
   * the order of {{blank}} markers in `content`. Cleared when the block is
   * flattened to plain text.
   */
  fillValues?: string[];
}

interface AssessmentItem {
  uid: string;
  diagnosis: string;
  icd10: string;
  supportingFactors: string;
  plan: string;
}


// ── Template blank helpers ─────────────────────────────────────────────────
function hasTemplateBlanks(content: string): boolean {
  return /\{\{[^}]+\}\}/.test(content);
}

type FillSegment =
  | { type: "text"; text: string }
  | { type: "blank"; index: number };

function parseFillSegments(content: string): FillSegment[] {
  const parts = content.split(/(\{\{[^}]*\}\})/g);
  let blankIndex = 0;
  const segments: FillSegment[] = [];
  for (const part of parts) {
    if (/^\{\{[^}]*\}\}$/.test(part)) {
      segments.push({ type: "blank", index: blankIndex++ });
    } else if (part) {
      segments.push({ type: "text", text: part });
    }
  }
  return segments;
}

function flattenBlanks(content: string, fillValues: string[]): string {
  let idx = 0;
  return content.replace(/\{\{[^}]*\}\}/g, () => fillValues[idx++] ?? "");
}

function resolveBlockContent(block: SoapBlock): string {
  if (block.fillValues && hasTemplateBlanks(block.content)) {
    return flattenBlanks(block.content, block.fillValues);
  }
  return block.content;
}

function uid(): string {
  return Math.random().toString(36).substring(2, 10);
}

function localDateStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function ChartModeEditor({
  systems,
  chartData,
  onChange,
}: {
  systems: string[];
  chartData: Record<string, { status: string; notes: string; visible: boolean }>;
  onChange: (data: Record<string, { status: string; notes: string; visible: boolean }>) => void;
}) {
  const update = (system: string, field: string, value: any) => {
    const next = { ...chartData };
    next[system] = { ...next[system], [field]: value };
    onChange(next);
  };

  const visibleSystems = systems.filter(s => chartData[s]?.visible !== false);
  const hiddenSystems = systems.filter(s => chartData[s]?.visible === false);

  return (
    <div className="space-y-1">
      {visibleSystems.map(system => (
        <div key={system} className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
          <div className="min-w-[140px] flex items-center gap-1.5 pt-1">
            <span className="text-xs font-medium text-foreground">{system}</span>
          </div>
          <Select
            value={chartData[system]?.status ?? "normal"}
            onValueChange={v => update(system, "status", v)}
          >
            <SelectTrigger className="h-7 text-xs w-[110px] flex-shrink-0" data-testid={`select-ros-status-${system}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="abnormal">Abnormal</SelectItem>
              <SelectItem value="not-examined">Not examined</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={chartData[system]?.notes ?? ""}
            onChange={e => update(system, "notes", e.target.value)}
            placeholder="Notes..."
            className="h-7 text-xs flex-1"
            data-testid={`input-ros-notes-${system}`}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 flex-shrink-0 text-muted-foreground"
            onClick={() => update(system, "visible", false)}
            data-testid={`button-hide-system-${system}`}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
      {hiddenSystems.length > 0 && (
        <div className="pt-2 flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground mr-1 pt-1">Hidden:</span>
          {hiddenSystems.map(system => (
            <Badge
              key={system}
              variant="outline"
              className="text-[10px] cursor-pointer"
              onClick={() => update(system, "visible", true)}
              data-testid={`badge-restore-system-${system}`}
            >
              + {system}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function DxAwareTextarea({
  value,
  onChange,
  rows,
  placeholder,
  className,
  testId,
  patientId,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  testId?: string;
  /** Optional: enables the universal `/` slash menu and chart pulls. */
  patientId?: number | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const dxSearch = useDiagnosisSearch({
    textareaRef: ref,
    value,
    onChange,
  });
  const phraseSearch = usePhraseSearch({
    textareaRef: ref,
    value,
    onChange,
  });
  // Universal slash menu (built-ins + templates + phrases). It yields to /dx
  // and /phrase, so wiring all three handlers in series is safe — the slash
  // hook returns early for those reserved prefixes.
  const slashSearch = useSlashMenu({
    textareaRef: ref,
    value,
    onChange,
    patientId: patientId ?? null,
    noteType: "soap_provider",
  });
  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          dxSearch.handleInput(e);
          phraseSearch.handleInput(e);
          slashSearch.handleInput(e);
        }}
        onKeyDown={(e) => {
          slashSearch.handleKeyDown(e);
          if (!e.defaultPrevented) phraseSearch.handleKeyDown(e);
          if (!e.defaultPrevented) dxSearch.handleKeyDown(e);
        }}
        rows={rows}
        placeholder={placeholder}
        className={className}
        data-testid={testId}
      />
      {dxSearch.dropdown}
      {phraseSearch.dropdown}
      {slashSearch.dropdown}
    </div>
  );
}

function AssessmentPlanEditor({
  items,
  summary,
  onItemsChange,
  onSummaryChange,
  patientId,
}: {
  items: AssessmentItem[];
  summary: string;
  onItemsChange: (items: AssessmentItem[]) => void;
  onSummaryChange: (s: string) => void;
  /** Forwarded to DxAwareTextarea so the universal `/` menu has chart context. */
  patientId?: number | null;
}) {
  const addItem = () => {
    onItemsChange([...items, { uid: uid(), diagnosis: "", icd10: "", supportingFactors: "", plan: "" }]);
  };

  const updateItem = (idx: number, field: keyof AssessmentItem, value: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    onItemsChange(next);
  };

  const removeItem = (idx: number) => {
    onItemsChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Summary (optional)</label>
        <DxAwareTextarea
          value={summary}
          onChange={onSummaryChange}
          rows={2}
          placeholder="Brief clinical summary... (type / for templates, /dx for diagnoses, /phrase for snippets)"
          className="text-sm resize-y"
          testId="textarea-assessment-summary"
          patientId={patientId}
        />
      </div>

      {items.map((item, idx) => (
        <Card key={item.uid} className="border-border/60">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Dx #{idx + 1}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeItem(idx)} data-testid={`button-remove-dx-${idx}`}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex gap-2">
              <DxSearchInput
                value={item.diagnosis}
                icd10={item.icd10}
                onSelect={(name, code) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], diagnosis: name, icd10: code };
                  onItemsChange(next);
                }}
                onChange={(val) => updateItem(idx, "diagnosis", val)}
                index={idx}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Supporting Factors</label>
              <DxAwareTextarea
                value={item.supportingFactors}
                onChange={v => updateItem(idx, "supportingFactors", v)}
                rows={2}
                placeholder="Clinical reasoning, lab findings, symptoms... (type / for templates, /dx to search)"
                className="text-xs resize-y"
                testId={`textarea-supporting-${idx}`}
                patientId={patientId}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Plan</label>
              <DxAwareTextarea
                value={item.plan}
                onChange={v => updateItem(idx, "plan", v)}
                rows={2}
                placeholder="- Treatment actions&#10;- Medications&#10;- Follow-up&#10;(type / for templates, /dx for diagnoses)"
                className="text-xs resize-y"
                testId={`textarea-plan-${idx}`}
                patientId={patientId}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" size="sm" onClick={addItem} className="text-xs gap-1.5" data-testid="button-add-diagnosis">
        <Plus className="w-3 h-3" />
        Add Diagnosis
      </Button>
    </div>
  );
}

function DxSearchInput({
  value,
  icd10,
  onSelect,
  onChange,
  index,
}: {
  value: string;
  icd10: string;
  onSelect: (name: string, code: string) => void;
  onChange: (val: string) => void;
  index: number;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<{ code: string; name: string }[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    try {
      const res = await fetch(`/api/diagnoses/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setSelectedIdx(0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isOpen || !query) return;
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, isOpen, search]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div className="flex-1 relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={value}
            onChange={e => {
              onChange(e.target.value);
              setQuery(e.target.value);
              if (e.target.value.length > 0) setIsOpen(true);
            }}
            onFocus={() => { if (value.length > 0) { setQuery(value); setIsOpen(true); } }}
            placeholder="Search diagnosis or type name..."
            className="text-xs h-8 pr-8"
            data-testid={`input-diagnosis-${index}`}
            onKeyDown={e => {
              if (!isOpen || !results.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") {
                if (results[selectedIdx]) {
                  e.preventDefault();
                  onSelect(results[selectedIdx].name, results[selectedIdx].code);
                  setIsOpen(false);
                }
              } else if (e.key === "Escape") { setIsOpen(false); }
            }}
          />
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <Input
          value={icd10}
          readOnly
          placeholder="ICD-10"
          className="text-xs h-8 w-[90px] font-mono bg-muted/50"
          data-testid={`input-icd10-${index}`}
        />
      </div>
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full mt-1 left-0 w-full max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-lg"
          data-testid={`dx-search-results-${index}`}
        >
          {results.map((dx, i) => (
            <button
              key={`${dx.code}-${i}`}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer ${
                i === selectedIdx ? "bg-accent" : "hover-elevate"
              }`}
              onMouseDown={e => {
                e.preventDefault();
                onSelect(dx.name, dx.code);
                setIsOpen(false);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className="font-mono font-semibold text-primary/80 flex-shrink-0 min-w-[55px]">{dx.code}</span>
              <span className="text-foreground truncate">{dx.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VitalsBlockEditor({
  block,
  patientId,
  onChange,
}: {
  block: SoapBlock;
  patientId?: number;
  onChange: (patch: Partial<SoapBlock>) => void;
}) {
  const v: VitalsData = block.vitalsData ?? {};

  const { data: latestHeightData } = useQuery<{ heightInches: number | null }>({
    queryKey: ["/api/patients", patientId, "vitals", "latest-height"],
    queryFn: async () => {
      if (!patientId) return { heightInches: null };
      const res = await fetch(`/api/patients/${patientId}/vitals/latest-height`);
      if (!res.ok) return { heightInches: null };
      return res.json();
    },
    enabled: !!patientId,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (latestHeightData?.heightInches != null && !v.heightInches) {
      const updated: VitalsData = { ...v, heightInches: latestHeightData.heightInches };
      if (updated.weightLbs) {
        updated.bmi = calcBmi(updated.heightInches, updated.weightLbs);
      }
      onChange({ vitalsData: updated });
    }
    // Only run when latestHeightData arrives, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestHeightData?.heightInches]);

  function calcBmi(h?: number | null, w?: number | null): number | null {
    if (!h || !w || h <= 0) return null;
    return Math.round(((w / (h * h)) * 703) * 10) / 10;
  }

  function setField(field: keyof VitalsData, rawValue: string) {
    const value = rawValue === "" ? null : parseFloat(rawValue);
    const updated: VitalsData = { ...v, [field]: isNaN(value as number) ? null : value };
    if (field === "heightInches" || field === "weightLbs") {
      const h = field === "heightInches" ? (value as number | null) : v.heightInches;
      const w = field === "weightLbs" ? (value as number | null) : v.weightLbs;
      updated.bmi = calcBmi(h, w);
    }
    onChange({ vitalsData: updated });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs font-medium">
            Blood Pressure <span className="text-muted-foreground font-normal">(mmHg)</span>
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="1"
              value={v.systolicBp ?? ""}
              onChange={e => setField("systolicBp", e.target.value)}
              placeholder="Sys"
              className="h-8 text-sm"
              data-testid="input-vitals-systolicBp"
            />
            <span className="text-muted-foreground text-sm font-medium shrink-0">/</span>
            <Input
              type="number"
              step="1"
              value={v.diastolicBp ?? ""}
              onChange={e => setField("diastolicBp", e.target.value)}
              placeholder="Dia"
              className="h-8 text-sm"
              data-testid="input-vitals-diastolicBp"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Heart Rate <span className="text-muted-foreground font-normal">(bpm)</span>
          </Label>
          <Input
            type="number"
            step="1"
            value={v.heartRate ?? ""}
            onChange={e => setField("heartRate", e.target.value)}
            placeholder="e.g. 72"
            className="h-8 text-sm"
            data-testid="input-vitals-heartRate"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Temp <span className="text-muted-foreground font-normal">(°F)</span>
          </Label>
          <Input
            type="number"
            step="0.1"
            value={v.temperature ?? ""}
            onChange={e => setField("temperature", e.target.value)}
            placeholder="e.g. 98.6"
            className="h-8 text-sm"
            data-testid="input-vitals-temperature"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Height <span className="text-muted-foreground font-normal">(in)</span>
          </Label>
          <Input
            type="number"
            step="0.5"
            value={v.heightInches ?? ""}
            onChange={e => setField("heightInches", e.target.value)}
            placeholder="e.g. 66"
            className="h-8 text-sm"
            data-testid="input-vitals-heightInches"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Weight <span className="text-muted-foreground font-normal">(lbs)</span>
          </Label>
          <Input
            type="number"
            step="0.1"
            value={v.weightLbs ?? ""}
            onChange={e => setField("weightLbs", e.target.value)}
            placeholder="e.g. 165"
            className="h-8 text-sm"
            data-testid="input-vitals-weightLbs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            BMI <span className="text-muted-foreground font-normal">(auto)</span>
          </Label>
          <Input
            type="text"
            value={v.bmi != null ? String(v.bmi) : ""}
            readOnly
            placeholder="Auto-calculated"
            className="h-8 text-sm bg-muted/50 cursor-not-allowed"
            data-testid="input-vitals-bmi"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Height pre-fills from this patient's most recent visit. BMI is auto-calculated from height + weight.
        All values are saved to the patient's vitals record when the note is saved.
      </p>
    </div>
  );
}

function BlockEditor({
  block,
  onUpdate,
  onRemove,
  onToggleCollapse,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  patientId,
  patientChart,
  blockDefaults,
}: {
  block: SoapBlock;
  onUpdate: (updates: Partial<SoapBlock>) => void;
  onRemove: () => void;
  onToggleCollapse: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  patientId?: number;
  patientChart?: PatientChart | null;
  blockDefaults?: ClinicalBlockOverrides | null;
}) {
  const blockDef = BLOCK_TYPES.find(b => b.id === block.type)!;
  const Icon = blockDef.icon;
  const supportsChart = block.type === "ros" || block.type === "physical_exam";
  const chartKind: "ros" | "physical_exam" | null = supportsChart ? (block.type as "ros" | "physical_exam") : null;
  const resolvedSystems = chartKind ? resolveSystemList(chartKind, blockDefaults ?? null) : [];
  const isAssessment = block.type === "assessment_plan";
  const isVitals = block.type === "vitals";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDraggable, setIsDraggable] = useState(false);

  // Keep chartData in sync with the resolved system list. If overrides arrive
  // *after* a chart-mode block was initialized (e.g. from a template apply),
  // chartData may carry stale shipped-system keys that would otherwise leak
  // into the rendered note via `chartDataToText`. Add any missing rows and
  // drop rows whose system is no longer in the resolved list.
  useEffect(() => {
    if (!chartKind || block.mode !== "chart") return;
    const cd = block.chartData ?? {};
    const desired = new Set(resolvedSystems);
    const existing = Object.keys(cd);
    const missing = resolvedSystems.filter(s => !cd[s]);
    const stale = existing.filter(s => !desired.has(s));
    if (missing.length === 0 && stale.length === 0) return;
    const next: Record<string, { status: string; notes: string; visible: boolean }> = {};
    for (const sys of resolvedSystems) {
      next[sys] = cd[sys] ?? { status: "normal", notes: "", visible: true };
    }
    onUpdate({ chartData: next });
    // Intentionally exclude `onUpdate` from deps to avoid re-firing on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartKind, block.mode, resolvedSystems.join("|")]);

  const dxSearch = useDiagnosisSearch({
    textareaRef,
    value: block.content,
    onChange: (newValue: string) => onUpdate({ content: newValue }),
  });
  const phraseSearch = usePhraseSearch({
    textareaRef,
    value: block.content,
    onChange: (newValue: string) => onUpdate({ content: newValue }),
  });
  const slashSearch = useSlashMenu({
    textareaRef,
    value: block.content,
    onChange: (newValue: string) => onUpdate({ content: newValue }),
    patientId: patientId ?? null,
    noteType: "soap_provider",
  });

  // SOAP block type → patient chart key. HPI has no chart-stored field but
  // is included in the eligibility check so it shows the "No chart data"
  // badge consistently with the other history-style blocks.
  const chartKeyForBlock: Partial<Record<BlockTypeId, ChartDomainKey>> = {
    medical_history: "medicalHistory",
    surgical_history: "surgicalHistory",
    social_history: "socialHistory",
    family_history: "familyHistory",
    current_medications: "currentMedications",
    allergies: "allergies",
  };
  const chartKey = chartKeyForBlock[block.type];
  const canPullFromChart = isHistoryStyleBlock(block.type) && !!patientChart;
  const chartItemsForBlock: string[] = canPullFromChart && chartKey
    ? ((patientChart![chartKey] as string[] | undefined) ?? [])
    : [];
  // Eligible to push edits BACK to the chart? Same set as the list-style
  // chart-key blocks (Med Hx, Surg Hx, Soc Hx, Allergies, Meds, Family Hx).
  const canSaveToChart = !!patientId && !!chartKey;
  const { toast } = useToast();
  const saveToChartMutation = useMutation({
    mutationFn: async (items: string[]) => {
      if (!patientId || !chartKey) throw new Error("No patient context");
      await apiRequest("PUT", `/api/patients/${patientId}/chart`, {
        [chartKey]: items,
      });
      return items;
    },
    onSuccess: (items) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "chart"] });
      toast({
        title: "Chart updated",
        description: items.length === 0
          ? `${blockDef.label} cleared on the patient's chart.`
          : `${items.length} item${items.length === 1 ? "" : "s"} saved to ${blockDef.label}.`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Save to chart failed", description: err.message });
    },
  });

  // Bullet/free-text toggle defaults: list blocks start in bullet mode; HPI
  // starts in free text. Templates can override via tb.bulletMode.
  const supportsBulletToggle = isHistoryStyleBlock(block.type);
  const defaultBullet = isListBlock(block.type);
  const bulletMode = supportsBulletToggle ? (block.bulletMode ?? defaultBullet) : false;

  const pullFromChart = () => {
    if (!canPullFromChart || !chartKey) return;
    if (bulletMode) {
      const existing = block.listItems ?? (block.content ? block.content.split("\n").map(s => s.trim()).filter(Boolean) : []);
      const merged = mergeChartItems(existing, chartItemsForBlock);
      onUpdate({ listItems: merged, content: merged.join("\n") });
    } else {
      // Free-text mode renders a comma-joined paragraph that round-trips
      // cleanly when re-pulled.
      const existing = block.content
        ? block.content
            .split(/[\n,;]+/)
            .map(s => s.replace(/^[-*•]\s*/, "").trim().replace(/\.$/, "").trim())
            .filter(Boolean)
        : [];
      const merged = mergeChartItems(existing, chartItemsForBlock);
      const ends = merged.length > 0 ? "." : "";
      onUpdate({ content: merged.join(", ") + ends });
    }
  };

  // Parse the items currently shown in this block for the chart-save action.
  // Bullet mode: prefer the typed listItems; free-text mode: split the
  // textarea on newlines/commas/semicolons (the inverse of `pullFromChart`).
  const collectItemsForChart = (): string[] => {
    let raw: string[] = [];
    if (bulletMode) {
      raw = block.listItems ?? (block.content
        ? block.content.split("\n")
        : []);
    } else {
      raw = block.content ? block.content.split(/[\n,;]+/) : [];
    }
    const cleaned = raw
      .map(s => s.replace(/^[-*•]\s*/, "").trim().replace(/\.$/, "").trim())
      .filter(Boolean);
    // De-dupe case-insensitively, preserving first-seen order.
    const seen = new Set<string>();
    return cleaned.filter(i => {
      const k = i.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  return (
    <div
      className={`border rounded-md bg-card transition-all ${isDragOver ? "ring-2 ring-primary/40 border-primary/40" : ""} ${isDragging ? "opacity-40" : ""}`}
      data-testid={`block-${block.type}-${block.uid}`}
      data-block-uid={block.uid}
      draggable={isDraggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart?.(); }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver?.(); }}
      onDragLeave={() => onDragLeave?.()}
      onDrop={(e) => { e.preventDefault(); onDrop?.(); }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <GripVertical
          className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 cursor-grab active:cursor-grabbing"
          onMouseDown={() => setIsDraggable(true)}
          onMouseUp={() => setIsDraggable(false)}
          onMouseLeave={() => { if (!isDragging) setIsDraggable(false); }}
        />
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold flex-1">
          {block.type === "custom_text" && block.customLabel ? block.customLabel : blockDef.label}
        </span>
        {canPullFromChart && chartItemsForBlock.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={pullFromChart}
            data-testid={`button-pull-chart-${block.uid}`}
            title={`Add ${chartItemsForBlock.length} item${chartItemsForBlock.length === 1 ? "" : "s"} from patient chart`}
          >
            <Download className="w-3 h-3" />
            Pull from chart ({chartItemsForBlock.length})
          </Button>
        )}
        {canPullFromChart && chartItemsForBlock.length === 0 && (
          <span
            className="inline-flex items-center gap-1 h-6 px-2 text-[10px] rounded-sm text-muted-foreground/70"
            data-testid={`badge-no-chart-data-${block.uid}`}
            title="The patient's chart has no entries for this section yet."
          >
            <Download className="w-3 h-3 opacity-60" />
            No chart data
          </span>
        )}
        {canSaveToChart && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => saveToChartMutation.mutate(collectItemsForChart())}
            disabled={saveToChartMutation.isPending}
            data-testid={`button-save-to-chart-${block.uid}`}
            title={`Overwrite the patient's chart ${blockDef.label} with the items currently in this block`}
          >
            {saveToChartMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Upload className="w-3 h-3" />}
            Save edits to chart
          </Button>
        )}
        {supportsBulletToggle && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => onUpdate({ bulletMode: !bulletMode })}
            data-testid={`button-toggle-bullet-${block.uid}`}
            title={bulletMode ? "Switch to free text" : "Switch to bullet list"}
          >
            {bulletMode ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
            {bulletMode ? "Bullets" : "Free Text"}
          </Button>
        )}
        {supportsChart && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => {
              const systems = resolvedSystems;
              if (block.mode === "freetext") {
                onUpdate({ mode: "chart", chartData: block.chartData ?? createChartData(systems) });
              } else {
                onUpdate({ mode: "freetext" });
              }
            }}
            data-testid={`button-toggle-mode-${block.uid}`}
          >
            {block.mode === "chart" ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
            {block.mode === "chart" ? "Chart" : "Free Text"}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={onToggleCollapse}
          data-testid={`button-collapse-${block.uid}`}
        >
          {block.collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground"
          onClick={onRemove}
          data-testid={`button-remove-block-${block.uid}`}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      {!block.collapsed && (
        <div className="p-3">
          {isAssessment ? (
            <AssessmentPlanEditor
              items={block.assessmentItems ?? []}
              summary={block.assessmentSummary ?? ""}
              onItemsChange={items => onUpdate({ assessmentItems: items })}
              onSummaryChange={s => onUpdate({ assessmentSummary: s })}
              patientId={patientId}
            />
          ) : isVitals ? (
            <VitalsBlockEditor
              block={block}
              patientId={patientId}
              onChange={onUpdate}
            />
          ) : supportsBulletToggle && bulletMode ? (
            <ListItemsEditor
              items={block.listItems ?? (block.content ? block.content.split("\n").map(s => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean) : [])}
              placeholder={getListItemPlaceholder(block.type)}
              onChange={items => onUpdate({ listItems: items, content: items.join("\n") })}
            />
          ) : supportsChart && block.mode === "chart" ? (
            <ChartModeEditor
              systems={resolvedSystems}
              chartData={block.chartData ?? createChartData(resolvedSystems)}
              onChange={chartData => onUpdate({ chartData })}
            />
          ) : hasTemplateBlanks(block.content) ? (
            <FillModeEditor
              content={block.content}
              fillValues={block.fillValues ?? []}
              onChange={fillValues => onUpdate({ fillValues })}
              onFlatten={flattened => onUpdate({ content: flattened, fillValues: undefined })}
            />
          ) : (
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={block.content}
                onChange={e => {
                  onUpdate({ content: e.target.value });
                  dxSearch.handleInput(e);
                  phraseSearch.handleInput(e);
                  slashSearch.handleInput(e);
                }}
                onKeyDown={(e) => {
                  slashSearch.handleKeyDown(e);
                  if (!e.defaultPrevented) phraseSearch.handleKeyDown(e);
                  if (!e.defaultPrevented) dxSearch.handleKeyDown(e);
                }}
                rows={block.type === "hpi" ? 6 : 3}
                placeholder={getPlaceholder(block.type)}
                className="text-sm resize-y"
                data-testid={`textarea-block-${block.uid}`}
              />
              {dxSearch.dropdown}
              {phraseSearch.dropdown}
              {slashSearch.dropdown}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FillModeEditor({
  content,
  fillValues,
  onChange,
  onFlatten,
}: {
  content: string;
  fillValues: string[];
  onChange: (vals: string[]) => void;
  onFlatten: (flattened: string) => void;
}) {
  const segments = parseFillSegments(content);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const blankCount = segments.filter(s => s.type === "blank").length;

  const update = (index: number, val: string) => {
    const next = [...fillValues];
    next[index] = val;
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, blankIndex: number) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const next = inputRefs.current[blankIndex + 1];
      if (next) next.focus();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium">
          {blankCount} fill-in-the-blank field{blankCount !== 1 ? "s" : ""} — Tab to advance
        </span>
      </div>
      <div className="p-3 bg-muted/20 rounded-md text-sm leading-8">
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i} className="whitespace-pre-wrap">{seg.text}</span>
          ) : (
            <input
              key={i}
              ref={el => { inputRefs.current[seg.index] = el; }}
              type="text"
              value={fillValues[seg.index] ?? ""}
              onChange={e => update(seg.index, e.target.value)}
              onKeyDown={e => handleKeyDown(e, seg.index)}
              className="inline-block border-0 border-b-2 border-primary bg-primary/5 rounded-none px-1 mx-0.5 text-sm focus:outline-none focus:border-primary focus:bg-primary/10 min-w-[3rem] transition-colors"
              style={{ width: Math.max(48, ((fillValues[seg.index]?.length ?? 0) + 3) * 8) }}
              placeholder="___"
              data-testid={`blank-input-${seg.index}`}
            />
          )
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-3 text-xs gap-1.5"
        onClick={() => onFlatten(flattenBlanks(content, fillValues))}
      >
        Done — Convert to plain text
      </Button>
    </div>
  );
}

function isListBlock(type: BlockTypeId): boolean {
  return (
    type === "medical_history" ||
    type === "surgical_history" ||
    type === "social_history" ||
    type === "family_history" ||
    type === "current_medications" ||
    type === "allergies"
  );
}

// Superset of isListBlock — HPI also supports the bullet/free-text toggle.
function isHistoryStyleBlock(type: BlockTypeId): boolean {
  return type === "hpi" || isListBlock(type);
}

function getListItemPlaceholder(type: BlockTypeId): string {
  switch (type) {
    case "hpi": return "e.g., Onset: 2 days ago";
    case "medical_history": return "e.g., Hypertension";
    case "surgical_history": return "e.g., Appendectomy 2018";
    case "social_history": return "e.g., Non-smoker";
    case "family_history": return "e.g., Father - CAD";
    case "current_medications": return "e.g., Lisinopril 10mg daily";
    case "allergies": return "e.g., Penicillin — rash";
    default: return "Add item...";
  }
}

function ListItemsEditor({ items, placeholder, onChange }: { items: string[]; placeholder: string; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const addItem = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  const updateItem = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };
  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={e => updateItem(i, e.target.value)}
                className="text-sm flex-1"
                data-testid={`input-list-item-${i}`}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeItem(i)}
                data-testid={`button-remove-list-item-${i}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
          className="text-sm flex-1"
          data-testid="input-list-item-new"
        />
        <Button
          type="button"
          size="sm"
          onClick={addItem}
          disabled={!draft.trim()}
          data-testid="button-add-list-item"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

function getPlaceholder(type: BlockTypeId): string {
  switch (type) {
    case "hpi": return "Document the history of present illness...";
    case "medical_history": return "Past medical history...";
    case "surgical_history": return "Past surgical history...";
    case "family_history": return "Family history...";
    case "social_history": return "Social history (smoking, alcohol, exercise, occupation)...";
    case "current_medications": return "List current medications with doses...";
    case "allergies": return "Known allergies and reactions...";
    case "ros": return "Review of systems — document positive and pertinent negatives...";
    case "physical_exam": return "Physical exam findings...";
    case "assessment_plan": return "Assessment and plan...";
    case "care_plan": return "Care plan details...";
    case "follow_up": return "Follow-up instructions and timeline...";
    case "custom_text": return "Enter content...";
    default: return "Enter documentation...";
  }
}

// Render chart-mode data using the shared helper which strips hidden rows AND
// "not-examined" rows that have no notes — those carry no clinical info and
// would otherwise clutter the saved note.
const chartDataToText = sharedChartDataToText;

function blocksToFullNote(
  chiefComplaint: string,
  blocks: SoapBlock[],
  visitDate: string,
  patientName: string,
  overrides?: ClinicalBlockOverrides | null,
): string {
  const rosFindings = resolveDefaultFindings("ros", overrides);
  const peFindings = resolveDefaultFindings("physical_exam", overrides);
  const lines: string[] = [];
  lines.push("SUBJECTIVE");
  lines.push("");
  if (chiefComplaint.trim()) {
    lines.push(`CC/Reason: ${chiefComplaint.trim()}`);
    lines.push("");
  }

  const sectionOrder: BlockTypeId[] = [
    "hpi", "medical_history", "surgical_history", "family_history",
    "social_history", "current_medications", "allergies",
  ];

  const sectionLabels: Record<string, string> = {
    hpi: "HPI",
    medical_history: "Past Medical History",
    surgical_history: "Past Surgical History",
    family_history: "Family History",
    social_history: "Social History",
    current_medications: "Current Medications",
    allergies: "Allergies",
  };

  for (const sectionId of sectionOrder) {
    const block = blocks.find(b => b.type === sectionId);
    if (!block) continue;
    const content = resolveBlockContent(block).trim();
    if (!content) continue;
    if (sectionId === "hpi") {
      lines.push(content);
    } else if (isListBlock(sectionId)) {
      // List blocks (PMH/PSH/SH/FH/Meds/Allergies): render as proper bullets
      // when in bullet mode, paragraph otherwise. Both formats are recognised
      // by `parseChartSectionItems` so the chart-save toolbar round-trips.
      const bulletMode = block.bulletMode ?? true;
      const items = (block.listItems ?? content.split(/\r?\n/))
        .map(s => s.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean);
      lines.push(bulletMode
        ? buildBulletSection(sectionLabels[sectionId], items)
        : buildParagraphSection(sectionLabels[sectionId], items));
    } else {
      lines.push(`${sectionLabels[sectionId]}: ${content}`);
    }
    lines.push("");
  }

  lines.push("OBJECTIVE");
  lines.push("");

  const vitalsBlock = blocks.find(b => b.type === "vitals");
  if (vitalsBlock?.vitalsData) {
    const vd = vitalsBlock.vitalsData;
    const parts: string[] = [];
    if (vd.systolicBp != null && vd.diastolicBp != null) parts.push(`BP: ${vd.systolicBp}/${vd.diastolicBp} mmHg`);
    else if (vd.systolicBp != null) parts.push(`BP: ${vd.systolicBp}/— mmHg`);
    if (vd.heartRate != null) parts.push(`HR: ${vd.heartRate} bpm`);
    if (vd.temperature != null) parts.push(`Temp: ${vd.temperature}°F`);
    if (vd.heightInches != null) parts.push(`Ht: ${vd.heightInches} in`);
    if (vd.weightLbs != null) parts.push(`Wt: ${vd.weightLbs} lbs`);
    if (vd.bmi != null) parts.push(`BMI: ${vd.bmi}`);
    if (parts.length > 0) {
      lines.push(`Vital Signs: ${parts.join("  |  ")}`);
      lines.push("");
    }
  }

  const rosBlock = blocks.find(b => b.type === "ros");
  if (rosBlock) {
    if (rosBlock.mode === "chart" && rosBlock.chartData) {
      lines.push(chartDataToText("Review of Systems", rosBlock.chartData, rosFindings));
    } else {
      const c = resolveBlockContent(rosBlock).trim();
      if (c) lines.push(`Review of Systems: ${c}`);
    }
    lines.push("");
  }

  const peBlock = blocks.find(b => b.type === "physical_exam");
  if (peBlock) {
    if (peBlock.mode === "chart" && peBlock.chartData) {
      lines.push(chartDataToText("Physical Examination", peBlock.chartData, peFindings));
    } else {
      const c = resolveBlockContent(peBlock).trim();
      if (c) lines.push(`Physical Examination: ${c}`);
    }
    lines.push("");
  }

  const apBlock = blocks.find(b => b.type === "assessment_plan");
  if (apBlock) {
    lines.push("ASSESSMENT/PLAN");
    lines.push("");
    if (apBlock.assessmentSummary?.trim()) {
      lines.push(apBlock.assessmentSummary.trim());
      lines.push("");
    }
    if (apBlock.assessmentItems?.length) {
      apBlock.assessmentItems.forEach((item, idx) => {
        const dxLine = item.icd10
          ? `${idx + 1}. ${item.diagnosis} (${item.icd10})`
          : `${idx + 1}. ${item.diagnosis}`;
        lines.push(dxLine);
        if (item.supportingFactors.trim()) {
          lines.push(item.supportingFactors.trim());
        }
        if (item.plan.trim()) {
          lines.push("Plan:");
          item.plan.trim().split("\n").forEach(l => {
            const trimmedLine = l.trim();
            if (trimmedLine) {
              lines.push(trimmedLine.startsWith("-") ? trimmedLine : `- ${trimmedLine}`);
            }
          });
        }
        lines.push("");
      });
    }
  }

  const cpBlock = blocks.find(b => b.type === "care_plan");
  if (cpBlock) {
    const c = resolveBlockContent(cpBlock).trim();
    if (c) {
      lines.push("CARE PLAN");
      lines.push("");
      lines.push(c);
      lines.push("");
    }
  }

  const fuBlock = blocks.find(b => b.type === "follow_up");
  if (fuBlock) {
    const c = resolveBlockContent(fuBlock).trim();
    if (c) {
      lines.push("FOLLOW-UP");
      lines.push("");
      lines.push(c);
      lines.push("");
    }
  }

  // Custom text blocks — template-specific sections not in the standard SOAP schema.
  // Rendered in the order they appear in the blocks array, after all standard sections.
  for (const cb of blocks.filter(b => b.type === "custom_text")) {
    const c = resolveBlockContent(cb).trim();
    if (!c) continue;
    const header = (cb.customLabel ?? "Notes").toUpperCase();
    lines.push(header);
    lines.push("");
    lines.push(c);
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

interface ManualSoapBuilderProps {
  patientId: number;
  patientName: string;
  clinicianId: number;
  onClose: () => void;
  onSaved: () => void;
}

export function ManualSoapBuilder({ patientId, patientName, clinicianId, onClose, onSaved }: ManualSoapBuilderProps) {
  const { toast } = useToast();
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [visitDate, setVisitDate] = useState(localDateStr);
  const [visitType, setVisitType] = useState("follow-up");
  const [blocks, setBlocks] = useState<SoapBlock[]>([
    { uid: uid(), type: "hpi", content: "", mode: "freetext" },
    { uid: uid(), type: "assessment_plan", content: "", mode: "freetext", assessmentItems: [{ uid: uid(), diagnosis: "", icd10: "", supportingFactors: "", plan: "" }], assessmentSummary: "" },
  ]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [savedEncounterId, setSavedEncounterId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const addMenuRef = useRef<HTMLDivElement>(null);

  const { data: templates = [] } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates", { noteType: "soap_provider" }],
    queryFn: async () => {
      const res = await fetch("/api/note-templates?noteType=soap_provider");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: patientChart = null } = useQuery<PatientChart | null>({
    queryKey: ["/api/patients", patientId, "chart"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/chart`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  // Per-clinician ROS / PE overrides drive default chart text formatting
  // (replacing "Normal/Negative" with the clinician's preferred finding).
  const { data: blockDefaults = null } = useQuery<ClinicalBlockOverrides | null>({
    queryKey: ["/api/clinical-block-defaults"],
    staleTime: 60_000,
  });

  const applyTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => String(t.id) === templateId);
    if (!tpl) return;

    // Map template block labels → SOAP block ids by fuzzy match against BLOCK_TYPES.label
    const mapLabelToType = (label: string): BlockTypeId | null => {
      const norm = label.toLowerCase().trim();
      // Skip custom_text — it's a fallback type, never a fuzzy-match target
      for (const bt of BLOCK_TYPES) {
        if (bt.id === "custom_text") continue;
        const btLabel = bt.label.toLowerCase();
        if (norm === btLabel) return bt.id;
        if (norm.includes(btLabel) || btLabel.includes(norm)) return bt.id;
      }
      // Common abbreviations + SOAP section vocabulary
      if (/^hpi\b|^subjective\b/.test(norm)) return "hpi";
      if (/^ros\b/.test(norm)) return "ros";
      if (/^pe\b|^physical\b|^exam\b|^objective\b/.test(norm)) return "physical_exam";
      if (/^a\/p\b|^assessment\b/.test(norm)) return "assessment_plan";
      if (/^pmh\b|^medical hx\b/.test(norm)) return "medical_history";
      if (/^psh\b|^surgical hx\b/.test(norm)) return "surgical_history";
      if (/^fh\b|^family hx\b/.test(norm)) return "family_history";
      if (/^sh\b|^social hx\b/.test(norm)) return "social_history";
      if (/^meds?\b|^medications?\b/.test(norm)) return "current_medications";
      if (/^allerg/.test(norm)) return "allergies";
      if (/^plan\b|^care plan\b/.test(norm)) return "care_plan";
      if (/^procedure\b|^procedures\b/.test(norm)) return "care_plan";
      if (/follow.?up/.test(norm)) return "follow_up";
      return null;
    };

    const tplBlocks = (tpl.blocks ?? []) as Array<{
      uid?: string; type: string; label?: string; defaultValue?: string;
      builtinId?: BuiltinBlockId; bulletMode?: boolean; systems?: string[];
    }>;
    const newSoapBlocks: SoapBlock[] = [];
    const claimed = new Set<BlockTypeId>();

    // Map a built-in block id (HPI, ROS, etc.) directly to a SOAP block id —
    // the two enums share the same vocabulary for clinical sections.
    const builtinIdToBlockType = (id: BuiltinBlockId): BlockTypeId | null => {
      const all = BLOCK_TYPES.map(b => b.id);
      return (all as readonly string[]).includes(id) ? (id as BlockTypeId) : null;
    };

    for (const tb of tplBlocks) {
      if (tb.type === "section_header") continue; // headers are visual-only in templates

      // Clinical block coming straight from the template builder's clinical
      // group. Use its builtinId for an exact mapping rather than fuzzy label.
      let mapped: BlockTypeId | null = null;
      if (tb.type.startsWith("clinical_")) {
        const id = (tb.builtinId ?? tb.type.slice("clinical_".length)) as BuiltinBlockId;
        mapped = builtinIdToBlockType(id);
      }
      if (!mapped) mapped = mapLabelToType(tb.label ?? "");

      const value = (tb.defaultValue ?? "").trim();

      if (mapped && !claimed.has(mapped)) {
        const block: SoapBlock = {
          uid: uid(), type: mapped, content: value, mode: "freetext",
          ...(hasTemplateBlanks(value) ? { fillValues: [] } : {}),
        };
        if (mapped === "assessment_plan") {
          // Start with one empty diagnosis item so the provider can fill it in;
          // any default text from the template lives in the summary so it doesn't
          // render as a blank numbered diagnosis line.
          block.assessmentItems = [{ uid: uid(), diagnosis: "", icd10: "", supportingFactors: "", plan: "" }];
          block.assessmentSummary = value;
          block.content = "";
        } else if (mapped === "ros" || mapped === "physical_exam") {
          // Clinical chart blocks pre-fill in chart mode so the provider can
          // jump straight to per-system editing. Honor the template's chosen
          // subset of systems if set; otherwise fall back to the canonical
          // full list.
          if (tb.type.startsWith("clinical_")) {
            const fallback = resolveSystemList(mapped === "ros" ? "ros" : "physical_exam", blockDefaults);
            const systems = tb.systems && tb.systems.length > 0 ? tb.systems : fallback;
            block.mode = "chart";
            block.chartData = createChartData(systems);
            block.content = "";
          }
        } else if (isListBlock(mapped) && tb.type.startsWith("clinical_")) {
          // For history list blocks: split default value into bullet items if
          // present, leave list empty otherwise — the provider can then click
          // "Pull from chart" to populate from the patient's chart. Honor the
          // template's bulletMode preference (default true for chart-mapped
          // lists, since they are inherently lists).
          const items = value
            ? value.split(/\r?\n/).map(s => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean)
            : [];
          block.listItems = items;
          block.content = items.join("\n");
          block.bulletMode = tb.bulletMode ?? true;
        } else if (mapped === "hpi" && tb.type.startsWith("clinical_")) {
          // HPI is a narrative by default but a template may opt in to bullet
          // mode (e.g. OPQRST). Honor tb.bulletMode (default false).
          const items = value
            ? value.split(/\r?\n/).map(s => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean)
            : [];
          block.bulletMode = tb.bulletMode ?? false;
          if (block.bulletMode) {
            block.listItems = items;
            block.content = items.join("\n");
          }
        }
        newSoapBlocks.push(block);
        claimed.add(mapped);
      } else if (value || tb.label) {
        // No SOAP mapping — each unmapped field becomes its own labeled
        // custom_text block so content stays visually separated (not jammed
        // into HPI). Multiple custom_text blocks are allowed.
        newSoapBlocks.push({
          uid: uid(),
          type: "custom_text",
          content: value,
          mode: "freetext",
          customLabel: tb.label || "Notes",
          ...(hasTemplateBlanks(value) ? { fillValues: [] } : {}),
        });
        // Note: do NOT add "custom_text" to `claimed` — multiple are allowed
      }
    }

    // Always ensure assessment_plan exists at end
    if (!claimed.has("assessment_plan")) {
      newSoapBlocks.push({
        uid: uid(),
        type: "assessment_plan",
        content: "",
        mode: "freetext",
        assessmentItems: [{ uid: uid(), diagnosis: "", icd10: "", supportingFactors: "", plan: "" }],
        assessmentSummary: "",
      });
    }

    setBlocks(newSoapBlocks);
    toast({ title: `Template "${tpl.name}" applied`, description: `${newSoapBlocks.length} block${newSoapBlocks.length === 1 ? "" : "s"} loaded.` });
  }, [templates, toast]);

  useEffect(() => {
    if (!showAddMenu) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddMenu]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [dragOverUid, setDragOverUid] = useState<string | null>(null);

  const addBlock = (type: BlockTypeId) => {
    let newUid: string | null = null;
    setBlocks(prev => {
      const existing = prev.find(b => b.type === type);
      if (existing) {
        toast({ title: "Block exists", description: `${BLOCK_TYPES.find(b => b.id === type)!.label} is already in the note.` });
        newUid = existing.uid;
        return prev;
      }
      newUid = uid();
      const newBlock: SoapBlock = {
        uid: newUid,
        type,
        content: "",
        mode: "freetext",
      };
      if (type === "assessment_plan") {
        newBlock.assessmentItems = [{ uid: uid(), diagnosis: "", icd10: "", supportingFactors: "", plan: "" }];
        newBlock.assessmentSummary = "";
      }
      // ROS and Physical Exam open in chart mode by default — the body-systems
      // grid is the primary way clinicians fill these out.
      if (type === "ros" || type === "physical_exam") {
        const kind = type === "ros" ? "ros" : "physical_exam";
        const systems = resolveSystemList(kind, blockDefaults ?? null);
        newBlock.mode = "chart";
        newBlock.chartData = createChartData(systems);
      }
      return [...prev, newBlock];
    });
    setShowAddMenu(false);
    setTimeout(() => {
      if (newUid) {
        const el = document.querySelector(`[data-block-uid="${newUid}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const reorderBlocks = (sourceUid: string, targetUid: string) => {
    if (sourceUid === targetUid) return;
    setBlocks(prev => {
      const sourceIdx = prev.findIndex(b => b.uid === sourceUid);
      const targetIdx = prev.findIndex(b => b.uid === targetUid);
      if (sourceIdx < 0 || targetIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };

  const updateBlock = (blockUid: string, updates: Partial<SoapBlock>) => {
    setBlocks(prev => prev.map(b => b.uid === blockUid ? { ...b, ...updates } : b));
  };

  const removeBlock = (blockUid: string) => {
    setBlocks(prev => prev.filter(b => b.uid !== blockUid));
  };

  const toggleCollapse = (blockUid: string) => {
    setBlocks(prev => prev.map(b => b.uid === blockUid ? { ...b, collapsed: !b.collapsed } : b));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fullNote = blocksToFullNote(chiefComplaint, blocks, visitDate, patientName, blockDefaults);
      if (!fullNote.trim()) throw new Error("Note is empty");

      let encId = savedEncounterId;

      if (!encId) {
        const createRes = await apiRequest("POST", "/api/encounters", {
          patientId,
          visitDate,
          visitType,
          chiefComplaint: chiefComplaint || null,
          transcription: null,
          clinicianNotes: "Manual SOAP Note",
        });
        const encounter = await createRes.json();
        encId = encounter.id;
        setSavedEncounterId(encId);
      } else {
        await apiRequest("PUT", `/api/encounters/${encId}`, {
          visitDate,
          visitType,
          chiefComplaint: chiefComplaint || null,
        });
      }

      await apiRequest("PUT", `/api/encounters/${encId}/soap`, {
        soapNote: { fullNote },
      });

      // Save vitals block data to the patient's vitals record (non-fatal)
      const vitalsBlk = blocks.find(b => b.type === "vitals");
      if (vitalsBlk?.vitalsData) {
        const vd = vitalsBlk.vitalsData;
        const hasAny = [vd.systolicBp, vd.diastolicBp, vd.heartRate, vd.temperature, vd.heightInches, vd.weightLbs].some(x => x != null);
        if (hasAny) {
          try {
            await apiRequest("POST", `/api/patients/${patientId}/vitals`, {
              systolicBp: vd.systolicBp ?? null,
              diastolicBp: vd.diastolicBp ?? null,
              heartRate: vd.heartRate ?? null,
              temperature: vd.temperature ?? null,
              heightInches: vd.heightInches ?? null,
              weightLbs: vd.weightLbs ?? null,
              source: "clinic",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals"] });
          } catch (ve) {
            console.warn("[Manual SOAP] Vitals save failed (non-fatal):", ve);
          }
        }
      }

      return encId;
    },
    onSuccess: () => {
      toast({ title: "Note saved", description: "Manual SOAP note has been saved to the patient's encounter history." });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", patientId] });
      onSaved();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    },
  });

  const usedBlockTypes = new Set(blocks.map(b => b.type));
  const availableBlocks = BLOCK_TYPES.filter(bt => bt.id !== "custom_text" && !usedBlockTypes.has(bt.id));

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="manual-soap-builder">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "#2e3a20" }} />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">Manual SOAP Note</h2>
            <p className="text-[10px] text-muted-foreground truncate">{patientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="text-xs gap-1.5"
            style={{ backgroundColor: "#2e3a20", color: "#fff" }}
            data-testid="button-save-manual-soap"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {savedEncounterId ? "Update" : "Save Note"}
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-manual-soap">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Visit Date</label>
            <Input
              type="date"
              value={visitDate}
              onChange={e => setVisitDate(e.target.value)}
              className="text-sm h-8"
              data-testid="input-manual-visit-date"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Visit Type</label>
            <Select value={visitType} onValueChange={setVisitType}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-manual-visit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new-patient">New Patient</SelectItem>
                <SelectItem value="follow-up">Follow-up</SelectItem>
                <SelectItem value="acute">Acute Visit</SelectItem>
                <SelectItem value="wellness">Wellness / Annual</SelectItem>
                <SelectItem value="procedure">Procedure</SelectItem>
                <SelectItem value="telemedicine">Telemedicine</SelectItem>
                <SelectItem value="lab-review">Lab Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Chief Complaint / Reason</label>
            <Input
              value={chiefComplaint}
              onChange={e => setChiefComplaint(e.target.value)}
              placeholder="Reason for visit..."
              className="text-sm h-8"
              data-testid="input-manual-chief-complaint"
            />
          </div>
        </div>

        {templates.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap p-2 rounded-md border" style={{ borderColor: "#d4c9b5", backgroundColor: "#faf6ed" }}>
            <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
            <span className="text-xs font-medium" style={{ color: "#2e3a20" }}>Apply template:</span>
            <Select value={selectedTemplateId} onValueChange={applyTemplate}>
              <SelectTrigger className="h-7 text-xs w-[260px]" data-testid="select-soap-template">
                <SelectValue placeholder="Choose a SOAP template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={String(t.id)} data-testid={`option-template-${t.id}`}>
                    {t.name}{t.isShared ? " (clinic)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplateId && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 px-2"
                onClick={() => setSelectedTemplateId("")}
                data-testid="button-clear-template"
              >
                Clear
              </Button>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">Replaces current blocks. Type <code>/phrase</code> in any field to insert a saved phrase.</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" ref={addMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="text-xs gap-1.5"
              disabled={availableBlocks.length === 0}
              data-testid="button-add-block"
            >
              <Plus className="w-3 h-3" />
              Add Block
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showAddMenu && availableBlocks.length > 0 && (
              <div className="absolute top-full mt-1 left-0 z-50 w-[240px] rounded-md border bg-popover shadow-lg py-1" data-testid="add-block-menu">
                {["subjective", "objective", "assessment", "plan"].map(cat => {
                  const catBlocks = availableBlocks.filter(b => b.category === cat);
                  if (catBlocks.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className="px-3 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {cat === "assessment" ? "Assessment" : cat === "plan" ? "Plan" : cat === "objective" ? "Objective" : "Subjective"}
                        </span>
                      </div>
                      {catBlocks.map(bt => {
                        const BIcon = bt.icon;
                        return (
                          <button
                            key={bt.id}
                            className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs hover-elevate cursor-pointer"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              addBlock(bt.id);
                            }}
                            data-testid={`add-block-${bt.id}`}
                          >
                            <BIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            {bt.label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-[10px] text-muted-foreground">
              Type <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">/</kbd> in any field for templates &amp; built-ins (HPI, ROS, PE, etc.) ·{" "}
              <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">/dx</kbd> for diagnoses ·{" "}
              <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">/phrase</kbd> for snippets
            </p>
            <SlashShortcutsHelp
              noteType="soap_provider"
              triggerTestId="button-slash-shortcuts-help-manual"
            />
          </div>
        </div>

        <div className="space-y-3 pb-8">
          {blocks.map(block => (
            <BlockEditor
              key={block.uid}
              block={block}
              onUpdate={updates => updateBlock(block.uid, updates)}
              onRemove={() => removeBlock(block.uid)}
              onToggleCollapse={() => toggleCollapse(block.uid)}
              isDragging={dragUid === block.uid}
              isDragOver={dragOverUid === block.uid && dragUid !== block.uid}
              onDragStart={() => setDragUid(block.uid)}
              onDragEnd={() => { setDragUid(null); setDragOverUid(null); }}
              onDragOver={() => { if (dragUid && dragUid !== block.uid) setDragOverUid(block.uid); }}
              onDragLeave={() => { if (dragOverUid === block.uid) setDragOverUid(null); }}
              onDrop={() => { if (dragUid) reorderBlocks(dragUid, block.uid); setDragUid(null); setDragOverUid(null); }}
              patientId={patientId}
              patientChart={patientChart}
              blockDefaults={blockDefaults}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
