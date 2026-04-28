import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { NoteTemplate } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, X, GripVertical, ChevronDown, ChevronUp, Save, FileText,
  Stethoscope, Pill, Heart, Brain, ClipboardList, Activity, Users,
  Scissors, AlertTriangle, ListChecks, CalendarCheck, ToggleLeft, ToggleRight,
  Search, Loader2,
} from "lucide-react";
import { useDiagnosisSearch } from "@/components/diagnosis-search";
import { usePhraseSearch } from "@/components/phrase-search";

const BLOCK_TYPES = [
  { id: "hpi", label: "HPI", icon: FileText, category: "subjective" },
  { id: "medical_history", label: "Medical History", icon: Heart, category: "subjective" },
  { id: "surgical_history", label: "Surgical History", icon: Scissors, category: "subjective" },
  { id: "family_history", label: "Family History", icon: Users, category: "subjective" },
  { id: "social_history", label: "Social History", icon: Brain, category: "subjective" },
  { id: "current_medications", label: "Current Medications", icon: Pill, category: "subjective" },
  { id: "allergies", label: "Allergies", icon: AlertTriangle, category: "subjective" },
  { id: "ros", label: "Review of Systems", icon: ClipboardList, category: "objective" },
  { id: "physical_exam", label: "Physical Assessment / Exam", icon: Stethoscope, category: "objective" },
  { id: "assessment_plan", label: "Assessment / Plan", icon: ListChecks, category: "assessment" },
  { id: "care_plan", label: "Care Plan", icon: Activity, category: "plan" },
  { id: "follow_up", label: "Follow-Up", icon: CalendarCheck, category: "plan" },
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
}

interface AssessmentItem {
  uid: string;
  diagnosis: string;
  icd10: string;
  supportingFactors: string;
  plan: string;
}

const ROS_SYSTEMS = [
  "Constitutional", "Eyes", "ENT", "Cardiovascular", "Respiratory",
  "Gastrointestinal", "Genitourinary", "Musculoskeletal", "Integumentary",
  "Neurological", "Psychiatric", "Endocrine", "Hematologic/Lymphatic",
  "Allergic/Immunologic",
];

const PE_SYSTEMS = [
  "General Appearance", "Head", "Eyes", "ENT", "Neck", "Cardiovascular",
  "Respiratory", "Abdomen", "Musculoskeletal", "Neurological", "Skin",
  "Psychiatric", "Lymphatic",
];

function createChartData(systems: string[]): Record<string, { status: string; notes: string; visible: boolean }> {
  const data: Record<string, { status: string; notes: string; visible: boolean }> = {};
  systems.forEach(s => { data[s] = { status: "normal", notes: "", visible: true }; });
  return data;
}

function uid(): string {
  return Math.random().toString(36).substring(2, 10);
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
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  testId?: string;
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
  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          dxSearch.handleInput(e);
          phraseSearch.handleInput(e);
        }}
        onKeyDown={(e) => { phraseSearch.handleKeyDown(e); if (!e.defaultPrevented) dxSearch.handleKeyDown(e); }}
        rows={rows}
        placeholder={placeholder}
        className={className}
        data-testid={testId}
      />
      {dxSearch.dropdown}
      {phraseSearch.dropdown}
    </div>
  );
}

function AssessmentPlanEditor({
  items,
  summary,
  onItemsChange,
  onSummaryChange,
}: {
  items: AssessmentItem[];
  summary: string;
  onItemsChange: (items: AssessmentItem[]) => void;
  onSummaryChange: (s: string) => void;
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
          placeholder="Brief clinical summary... (type /dx for diagnoses, /phrase for snippets)"
          className="text-sm resize-y"
          testId="textarea-assessment-summary"
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
                placeholder="Clinical reasoning, lab findings, symptoms... (type /dx to search)"
                className="text-xs resize-y"
                testId={`textarea-supporting-${idx}`}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Plan</label>
              <DxAwareTextarea
                value={item.plan}
                onChange={v => updateItem(idx, "plan", v)}
                rows={2}
                placeholder="- Treatment actions&#10;- Medications&#10;- Follow-up&#10;(type /dx to search diagnoses)"
                className="text-xs resize-y"
                testId={`textarea-plan-${idx}`}
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
}) {
  const blockDef = BLOCK_TYPES.find(b => b.id === block.type)!;
  const Icon = blockDef.icon;
  const supportsChart = block.type === "ros" || block.type === "physical_exam";
  const isAssessment = block.type === "assessment_plan";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDraggable, setIsDraggable] = useState(false);

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
        <span className="text-xs font-semibold flex-1">{blockDef.label}</span>
        {supportsChart && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => {
              const systems = block.type === "ros" ? ROS_SYSTEMS : PE_SYSTEMS;
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
            />
          ) : isListBlock(block.type) ? (
            <ListItemsEditor
              items={block.listItems ?? (block.content ? block.content.split("\n").map(s => s.trim()).filter(Boolean) : [])}
              placeholder={getListItemPlaceholder(block.type)}
              onChange={items => onUpdate({ listItems: items, content: items.join("\n") })}
            />
          ) : supportsChart && block.mode === "chart" ? (
            <ChartModeEditor
              systems={block.type === "ros" ? ROS_SYSTEMS : PE_SYSTEMS}
              chartData={block.chartData ?? createChartData(block.type === "ros" ? ROS_SYSTEMS : PE_SYSTEMS)}
              onChange={chartData => onUpdate({ chartData })}
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
                }}
                onKeyDown={(e) => { phraseSearch.handleKeyDown(e); if (!e.defaultPrevented) dxSearch.handleKeyDown(e); }}
                rows={block.type === "hpi" ? 6 : 3}
                placeholder={getPlaceholder(block.type)}
                className="text-sm resize-y"
                data-testid={`textarea-block-${block.uid}`}
              />
              {dxSearch.dropdown}
              {phraseSearch.dropdown}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isListBlock(type: BlockTypeId): boolean {
  return type === "medical_history" || type === "surgical_history" || type === "current_medications" || type === "allergies";
}

function getListItemPlaceholder(type: BlockTypeId): string {
  switch (type) {
    case "medical_history": return "e.g., Hypertension";
    case "surgical_history": return "e.g., Appendectomy 2018";
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
    default: return "Enter documentation...";
  }
}

function chartDataToText(
  label: string,
  chartData: Record<string, { status: string; notes: string; visible: boolean }>,
): string {
  const lines: string[] = [`${label}:`];
  Object.entries(chartData).forEach(([system, data]) => {
    if (!data.visible) return;
    const statusLabel = data.status === "normal" ? "Normal/Negative" : data.status === "abnormal" ? "Abnormal/Positive" : "Not examined";
    const notePart = data.notes ? ` — ${data.notes}` : "";
    lines.push(`  ${system}: ${statusLabel}${notePart}`);
  });
  return lines.join("\n");
}

function blocksToFullNote(
  chiefComplaint: string,
  blocks: SoapBlock[],
  visitDate: string,
  patientName: string,
): string {
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
    const content = block.content.trim();
    if (!content) continue;
    if (sectionId === "hpi") {
      lines.push(content);
    } else {
      lines.push(`${sectionLabels[sectionId]}: ${content}`);
    }
    lines.push("");
  }

  lines.push("OBJECTIVE");
  lines.push("");

  const rosBlock = blocks.find(b => b.type === "ros");
  if (rosBlock) {
    if (rosBlock.mode === "chart" && rosBlock.chartData) {
      lines.push(chartDataToText("Review of Systems", rosBlock.chartData));
    } else if (rosBlock.content.trim()) {
      lines.push(`Review of Systems: ${rosBlock.content.trim()}`);
    }
    lines.push("");
  }

  const peBlock = blocks.find(b => b.type === "physical_exam");
  if (peBlock) {
    if (peBlock.mode === "chart" && peBlock.chartData) {
      lines.push(chartDataToText("Physical Examination", peBlock.chartData));
    } else if (peBlock.content.trim()) {
      lines.push(`Physical Examination: ${peBlock.content.trim()}`);
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
  if (cpBlock?.content.trim()) {
    lines.push("CARE PLAN");
    lines.push("");
    lines.push(cpBlock.content.trim());
    lines.push("");
  }

  const fuBlock = blocks.find(b => b.type === "follow_up");
  if (fuBlock?.content.trim()) {
    lines.push("FOLLOW-UP");
    lines.push("");
    lines.push(fuBlock.content.trim());
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
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
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

  const applyTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => String(t.id) === templateId);
    if (!tpl) return;

    // Map template block labels → SOAP block ids by fuzzy match against BLOCK_TYPES.label
    const mapLabelToType = (label: string): BlockTypeId | null => {
      const norm = label.toLowerCase().trim();
      for (const bt of BLOCK_TYPES) {
        const btLabel = bt.label.toLowerCase();
        if (norm === btLabel) return bt.id;
        if (norm.includes(btLabel) || btLabel.includes(norm)) return bt.id;
      }
      // Common abbreviations
      if (/^hpi\b/.test(norm)) return "hpi";
      if (/^ros\b/.test(norm)) return "ros";
      if (/^pe\b|^physical\b|^exam\b/.test(norm)) return "physical_exam";
      if (/^a\/p\b|^assessment\b/.test(norm)) return "assessment_plan";
      if (/^pmh\b|^medical hx\b/.test(norm)) return "medical_history";
      if (/^psh\b|^surgical hx\b/.test(norm)) return "surgical_history";
      if (/^fh\b|^family hx\b/.test(norm)) return "family_history";
      if (/^sh\b|^social hx\b/.test(norm)) return "social_history";
      if (/^meds?\b|^medications?\b/.test(norm)) return "current_medications";
      if (/^allerg/.test(norm)) return "allergies";
      if (/^plan\b/.test(norm)) return "care_plan";
      if (/follow.?up/.test(norm)) return "follow_up";
      return null;
    };

    const tplBlocks = (tpl.blocks ?? []) as Array<{ uid?: string; type: string; label?: string; defaultValue?: string }>;
    const newSoapBlocks: SoapBlock[] = [];
    const claimed = new Set<BlockTypeId>();
    let unmappedHpiBuffer = "";

    for (const tb of tplBlocks) {
      if (tb.type === "section_header") continue; // headers are visual-only in templates
      const mapped = mapLabelToType(tb.label ?? "");
      const value = (tb.defaultValue ?? "").trim();

      if (mapped && !claimed.has(mapped)) {
        const block: SoapBlock = { uid: uid(), type: mapped, content: value, mode: "freetext" };
        if (mapped === "assessment_plan") {
          // Start with one empty diagnosis item so the provider can fill it in;
          // any default text from the template lives in the summary so it doesn't
          // render as a blank numbered diagnosis line.
          block.assessmentItems = [{ uid: uid(), diagnosis: "", icd10: "", supportingFactors: "", plan: "" }];
          block.assessmentSummary = value;
          block.content = "";
        }
        newSoapBlocks.push(block);
        claimed.add(mapped);
      } else if (value || tb.label) {
        // No mapping – append to HPI as labelled free-text
        const labelLine = tb.label ? `[${tb.label}]\n` : "";
        unmappedHpiBuffer += `${labelLine}${value}\n\n`;
      }
    }

    // If HPI not in template and we have unmapped content, prepend an HPI block
    if (unmappedHpiBuffer.trim() && !claimed.has("hpi")) {
      newSoapBlocks.unshift({ uid: uid(), type: "hpi", content: unmappedHpiBuffer.trim(), mode: "freetext" });
    } else if (unmappedHpiBuffer.trim()) {
      // Append unmapped to existing HPI
      const hpi = newSoapBlocks.find(b => b.type === "hpi");
      if (hpi) hpi.content = (hpi.content ? hpi.content + "\n\n" : "") + unmappedHpiBuffer.trim();
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
      const fullNote = blocksToFullNote(chiefComplaint, blocks, visitDate, patientName);
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
  const availableBlocks = BLOCK_TYPES.filter(bt => !usedBlockTypes.has(bt.id));

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
          <p className="text-[10px] text-muted-foreground">
            Type <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">/dx</kbd> in any text field to search diagnoses
          </p>
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
