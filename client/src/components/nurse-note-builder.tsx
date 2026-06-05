import { useState, useRef, useEffect } from "react";
import { localDateTimeStr } from "@/lib/date-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Plus, X, Save, Stethoscope, Activity, GraduationCap,
  CalendarCheck, FileText, ChevronDown, ChevronUp, Heart, ListChecks,
} from "lucide-react";
import { usePhraseSearch } from "@/components/phrase-search";
import type { NoteTemplate } from "@shared/schema";
import { nurseBlocksToText } from "@/lib/soap-pdf-export";

interface NurseNoteBuilderProps {
  patientId: number;
  onClose: () => void;
}

const NURSE_BLOCK_TYPES = [
  { id: "chief_complaint", label: "Reason for Visit", icon: FileText },
  { id: "vitals", label: "Vital Signs", icon: Heart },
  { id: "assessment", label: "Nursing Assessment", icon: Stethoscope },
  { id: "intervention", label: "Intervention", icon: Activity },
  { id: "education", label: "Patient Education", icon: GraduationCap },
  { id: "follow_up", label: "Follow-Up Plan", icon: CalendarCheck },
  { id: "free_text", label: "Free Text", icon: ListChecks },
  { id: "short_text", label: "Short Text Field", icon: ListChecks },
  { id: "dropdown", label: "Dropdown", icon: ListChecks },
  { id: "checkbox", label: "Checkbox", icon: ListChecks },
  { id: "radio", label: "Radio Buttons", icon: ListChecks },
] as const;

interface NurseVitals {
  systolicBp?: string;
  diastolicBp?: string;
  heartRate?: string;
  respiratoryRate?: string;
  temperature?: string;
  oxygenSaturation?: string;
  painScore?: string;
  heightInches?: string;
  weightLbs?: string;
  bmi?: string;
}

interface NurseBlock {
  uid: string;
  type: string;
  label?: string;
  content?: string;
  fillValues?: string[];
  options?: string[];
  selected?: string;
  checked?: boolean;
  checkedValues?: string[];
  vitals?: NurseVitals;
  collapsed?: boolean;
}

interface FillSegment {
  type: "text" | "blank";
  text: string;
  index: number;
}

function hasTemplateBlanks(content?: string): boolean {
  return typeof content === "string" && /\{\{[^}]*\}\}/.test(content);
}

function parseFillSegments(content: string): FillSegment[] {
  const segments: FillSegment[] = [];
  const re = /\{\{[^}]*\}\}/g;
  let last = 0;
  let blankIdx = 0;
  let match;
  while ((match = re.exec(content)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", text: content.slice(last, match.index), index: -1 });
    }
    segments.push({ type: "blank", text: match[0], index: blankIdx++ });
    last = match.index + match[0].length;
  }
  if (last < content.length) {
    segments.push({ type: "text", text: content.slice(last), index: -1 });
  }
  return segments;
}

function flattenBlanks(content: string, fillValues: string[]): string {
  let idx = 0;
  return content.replace(/\{\{[^}]*\}\}/g, () => fillValues[idx++] ?? "");
}

function uid() { return Math.random().toString(36).substring(2, 10); }

export function NurseNoteBuilder({ patientId, onClose }: NurseNoteBuilderProps) {
  const { toast } = useToast();
  const [visitDate, setVisitDate] = useState(localDateTimeStr());
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [blocks, setBlocks] = useState<NurseBlock[]>([
    { uid: uid(), type: "chief_complaint", label: "Reason for Visit", content: "" },
    { uid: uid(), type: "vitals", label: "Vital Signs", vitals: {} },
    { uid: uid(), type: "assessment", label: "Nursing Assessment", content: "" },
    { uid: uid(), type: "intervention", label: "Intervention", content: "" },
  ]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: templates = [] } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates", { noteType: "nurse" }],
    queryFn: async () => {
      const res = await fetch("/api/note-templates?noteType=nurse");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find(t => String(t.id) === id);
    if (!tpl) return;

    // Note templates store `blocks[]` where each block has `type` (not `fieldType`)
    const tplBlocks: any[] = (tpl.blocks ?? []);
    const newBlocks: NurseBlock[] = tplBlocks
      .filter(b => b.type !== "section_header") // section headers are visual-only in the builder
      .map((b: any) => {
        const t: string = b.type ?? "free_text";
        const block: NurseBlock = {
          uid: uid(),
          type: t === "vitals"    ? "vitals"
              : t === "long_text" ? "free_text"
              : t === "dropdown"  ? "dropdown"
              : t === "radio"     ? "radio"
              : t === "checkbox"  ? "checkbox"
              : t === "short_text" ? "short_text"
              : t.startsWith("clinical_") ? "free_text"
              : "free_text",
          label: b.label ?? (t === "vitals" ? "Vital Signs" : ""),
          content: b.defaultValue ?? "",
          fillValues: hasTemplateBlanks(b.defaultValue) ? [] : undefined,
        };
        if (block.type === "vitals")                    block.vitals = {};
        if (block.type === "dropdown" ||
            block.type === "radio"    ||
            block.type === "checkbox") block.options = b.options ?? [];
        return block;
      });

    const finalBlocks: NurseBlock[] = newBlocks.length > 0 ? newBlocks : [
      { uid: uid(), type: "chief_complaint", label: "Reason for Visit", content: "" },
      { uid: uid(), type: "vitals",          label: "Vital Signs",       vitals: {} },
      { uid: uid(), type: "assessment",      label: "Nursing Assessment", content: "" },
    ];

    // Always ensure a structured vitals block exists so the nurse can enter
    // vitals that auto-save to the patient's trends. Templates built with a
    // free-text "VITAL SIGNS" section don't provide one, so we inject a blank
    // vitals block at the top.
    if (!finalBlocks.some(b => b.type === "vitals")) {
      finalBlocks.unshift({ uid: uid(), type: "vitals", label: "Vital Signs", vitals: {} });
    }

    setBlocks(finalBlocks);
    toast({ title: `Template "${tpl.name}" applied` });
  };

  const addBlock = (type: string) => {
    const meta = NURSE_BLOCK_TYPES.find(t => t.id === type);
    const b: NurseBlock = { uid: uid(), type, label: meta?.label ?? "" };
    if (type === "dropdown" || type === "radio") b.options = ["Option 1", "Option 2"];
    if (type === "vitals") b.vitals = {};
    setBlocks([...blocks, b]);
  };

  const updateBlock = (i: number, patch: Partial<NurseBlock>) => {
    setBlocks(blocks.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  };
  const removeBlock = (i: number) => setBlocks(blocks.filter((_, idx) => idx !== i));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks]; [next[i], next[j]] = [next[j], next[i]]; setBlocks(next);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const fullNote = nurseBlocksToText(blocks);
      const body = {
        patientId,
        visitDate: new Date(visitDate).toISOString(),
        visitType: "nurse-visit",
        noteType: "nurse",
        chiefComplaint: chiefComplaint || blocks.find(b => b.type === "chief_complaint")?.content || "Nurse visit",
        soapNote: { fullNote, blocks } as any,
      };
      const res = await apiRequest("POST", "/api/encounters", body);
      const encounter = await res.json();

      const vitalsBlk = blocks.find(b => b.type === "vitals");
      if (vitalsBlk?.vitals) {
        const v = vitalsBlk.vitals;
        const hasAny = [
          v.systolicBp, v.diastolicBp, v.heartRate, v.temperature,
          v.heightInches, v.weightLbs, v.respiratoryRate, v.oxygenSaturation, v.painScore,
        ].some(x => x != null && x !== "");
        if (hasAny) {
          try {
            const payload: Record<string, any> = { source: "clinic" };
            if (v.systolicBp) payload.systolicBp = parseInt(v.systolicBp);
            if (v.diastolicBp) payload.diastolicBp = parseInt(v.diastolicBp);
            if (v.heartRate) payload.heartRate = parseInt(v.heartRate);
            if (v.respiratoryRate) payload.respiratoryRate = parseInt(v.respiratoryRate);
            if (v.temperature) payload.temperature = parseFloat(v.temperature);
            if (v.oxygenSaturation) payload.oxygenSaturation = parseFloat(v.oxygenSaturation);
            if (v.painScore) payload.painScore = parseInt(v.painScore);
            if (v.heightInches) payload.heightInches = parseFloat(v.heightInches);
            if (v.weightLbs) payload.weightLbs = parseFloat(v.weightLbs);
            await apiRequest("POST", `/api/patients/${patientId}/vitals`, payload);
            queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals"] });
            queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals", "latest-height"] });
          } catch (ve: any) {
            console.warn("[Nurse Note] Vitals save failed:", ve);
            toast({
              title: "Vitals not saved to trends",
              description: ve?.message ?? "The note was saved but vitals could not be recorded. Add them via the Vitals button.",
              variant: "destructive",
            });
          }
        }
      }

      return encounter.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/encounters`] });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      toast({ title: "Nurse note saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5" />Nurse Note
            <Badge style={{ backgroundColor: "#7a8a64", color: "#fff" }}>Nursing visit</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Visit Date & Time</Label>
              <Input type="datetime-local" value={visitDate} onChange={e => setVisitDate(e.target.value)} data-testid="input-nurse-date" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Apply Template (optional)</Label>
              <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                <SelectTrigger data-testid="select-nurse-template">
                  <SelectValue placeholder={templates.length ? "Choose a template…" : "No nurse templates yet"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Chief Complaint / Reason</Label>
            <Input value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} placeholder="Why is the patient here today" data-testid="input-nurse-chief-complaint" />
          </div>

          <div className="border rounded-md p-3" style={{ borderColor: "#d4c9b5", backgroundColor: "#faf6ed" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "#2e3a20" }}>Add Block</p>
            <div className="flex flex-wrap gap-1.5">
              {NURSE_BLOCK_TYPES.map(b => (
                <Button key={b.id} type="button" size="sm" variant="outline" onClick={() => addBlock(b.id)} data-testid={`button-add-nurse-block-${b.id}`}>
                  <Plus className="w-3 h-3 mr-1" />{b.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {blocks.map((b, i) => (
              <NurseBlockEditor
                key={b.uid}
                block={b}
                isFirst={i === 0}
                isLast={i === blocks.length - 1}
                patientId={patientId}
                onChange={(patch) => updateBlock(i, patch)}
                onRemove={() => removeBlock(i)}
                onMove={(dir) => moveBlock(i, dir)}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="button-save-nurse-note">
            <Save className="w-4 h-4 mr-1.5" />{saveMut.isPending ? "Saving…" : "Save Nurse Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NurseBlockEditor({
  block, isFirst, isLast, patientId, onChange, onRemove, onMove,
}: {
  block: NurseBlock;
  isFirst: boolean; isLast: boolean;
  patientId: number;
  onChange: (p: Partial<NurseBlock>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const meta = NURSE_BLOCK_TYPES.find(t => t.id === block.type);
  const Icon = meta?.icon ?? FileText;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const phrase = usePhraseSearch({
    textareaRef: taRef,
    value: block.content ?? "",
    onChange: (v) => onChange({ content: v }),
  });

  const showFillMode = block.type !== "vitals" &&
    block.type !== "dropdown" &&
    block.type !== "radio" &&
    block.type !== "checkbox" &&
    block.type !== "short_text" &&
    hasTemplateBlanks(block.content);

  return (
    <Card data-testid={`nurse-block-${block.type}-${block.uid}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: "#5a7040" }} />
          <span className="text-sm font-semibold">{block.label || meta?.label}</span>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" onClick={() => onChange({ collapsed: !block.collapsed })}>
            {block.collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onMove(-1)} disabled={isFirst}>↑</Button>
          <Button size="icon" variant="ghost" onClick={() => onMove(1)} disabled={isLast}>↓</Button>
          <Button size="icon" variant="ghost" onClick={onRemove}><X className="w-4 h-4" /></Button>
        </div>
        {!block.collapsed && (
          <div className="space-y-2">
            {block.type === "vitals" ? (
              <VitalsBlockEditor
                vitals={block.vitals ?? {}}
                patientId={patientId}
                onChange={(v) => onChange({ vitals: v })}
              />
            ) : block.type === "dropdown" ? (
              <Select value={block.selected ?? ""} onValueChange={(v) => onChange({ selected: v })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {(block.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : block.type === "radio" ? (
              <RadioGroup value={block.selected ?? ""} onValueChange={(v) => onChange({ selected: v })}>
                {(block.options ?? []).map(o => (
                  <div key={o} className="flex items-center gap-2">
                    <RadioGroupItem value={o} id={`${block.uid}-${o}`} />
                    <Label htmlFor={`${block.uid}-${o}`} className="text-sm cursor-pointer">{o}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : block.type === "checkbox" ? (
              <div className="space-y-1.5">
                {(block.options && block.options.length > 0 ? block.options : ["Yes"]).map(opt => {
                  const isChecked = (block.checkedValues ?? []).includes(opt);
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox
                        id={`${block.uid}-${opt}`}
                        checked={isChecked}
                        onCheckedChange={(c) => {
                          const prev = block.checkedValues ?? [];
                          onChange({
                            checkedValues: c
                              ? [...prev, opt]
                              : prev.filter(v => v !== opt),
                          });
                        }}
                      />
                      <Label htmlFor={`${block.uid}-${opt}`} className="cursor-pointer text-sm">{opt}</Label>
                    </div>
                  );
                })}
              </div>
            ) : block.type === "short_text" ? (
              <Input value={block.content ?? ""} onChange={e => onChange({ content: e.target.value })} />
            ) : showFillMode ? (
              <FillModeEditor
                content={block.content ?? ""}
                fillValues={block.fillValues ?? []}
                onChange={(fillValues) => onChange({ fillValues })}
                onFlatten={(flattened) => onChange({ content: flattened, fillValues: undefined })}
              />
            ) : (
              <>
                <Textarea
                  ref={taRef}
                  value={block.content ?? ""}
                  onChange={(e) => { onChange({ content: e.target.value }); phrase.handleInput(e); }}
                  onInput={phrase.handleInput}
                  onKeyDown={phrase.handleKeyDown}
                  rows={4}
                  placeholder={`${meta?.label ?? ""}… (type /phrase to insert a saved snippet)`}
                />
                {phrase.dropdown}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VitalsBlockEditor({
  vitals, patientId, onChange,
}: { vitals: NurseVitals; patientId: number; onChange: (v: NurseVitals) => void }) {
  const { data: latestHeightData } = useQuery<{ heightInches: number | null }>({
    queryKey: ["/api/patients", patientId, "vitals", "latest-height"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/vitals/latest-height`);
      if (!res.ok) return { heightInches: null };
      return res.json();
    },
    enabled: !!patientId,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (latestHeightData?.heightInches != null && !vitals.heightInches) {
      const h = String(latestHeightData.heightInches);
      const w = vitals.weightLbs ? parseFloat(vitals.weightLbs) : null;
      const bmiVal = (w && latestHeightData.heightInches > 0)
        ? String(Math.round(((w / (latestHeightData.heightInches * latestHeightData.heightInches)) * 703) * 10) / 10)
        : "";
      onChange({ ...vitals, heightInches: h, ...(bmiVal ? { bmi: bmiVal } : {}) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestHeightData?.heightInches]);

  const set = (k: keyof NurseVitals, v: string) => {
    const updated: NurseVitals = { ...vitals, [k]: v };
    if (k === "heightInches" || k === "weightLbs") {
      const h = parseFloat(k === "heightInches" ? v : vitals.heightInches ?? "");
      const w = parseFloat(k === "weightLbs" ? v : vitals.weightLbs ?? "");
      if (!isNaN(h) && !isNaN(w) && h > 0) {
        updated.bmi = String(Math.round(((w / (h * h)) * 703) * 10) / 10);
      } else if (v === "") {
        updated.bmi = "";
      }
    }
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs font-medium">
            Blood Pressure <span className="text-muted-foreground font-normal">(mmHg)</span>
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number" step="1"
              value={vitals.systolicBp ?? ""}
              onChange={e => set("systolicBp", e.target.value)}
              placeholder="Sys" className="h-8 text-sm"
              data-testid="input-vitals-nurse-systolicBp"
            />
            <span className="text-muted-foreground text-sm font-medium shrink-0">/</span>
            <Input
              type="number" step="1"
              value={vitals.diastolicBp ?? ""}
              onChange={e => set("diastolicBp", e.target.value)}
              placeholder="Dia" className="h-8 text-sm"
              data-testid="input-vitals-nurse-diastolicBp"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Heart Rate <span className="text-muted-foreground font-normal">(bpm)</span>
          </Label>
          <Input
            type="number" step="1"
            value={vitals.heartRate ?? ""}
            onChange={e => set("heartRate", e.target.value)}
            placeholder="72" className="h-8 text-sm"
            data-testid="input-vitals-nurse-heartRate"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Resp Rate <span className="text-muted-foreground font-normal">(rpm)</span>
          </Label>
          <Input
            type="number" step="1"
            value={vitals.respiratoryRate ?? ""}
            onChange={e => set("respiratoryRate", e.target.value)}
            placeholder="16" className="h-8 text-sm"
            data-testid="input-vitals-nurse-respiratoryRate"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Temp <span className="text-muted-foreground font-normal">(°F)</span>
          </Label>
          <Input
            type="number" step="0.1"
            value={vitals.temperature ?? ""}
            onChange={e => set("temperature", e.target.value)}
            placeholder="98.6" className="h-8 text-sm"
            data-testid="input-vitals-nurse-temperature"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            SpO2 <span className="text-muted-foreground font-normal">(%)</span>
          </Label>
          <Input
            type="number" step="0.1"
            value={vitals.oxygenSaturation ?? ""}
            onChange={e => set("oxygenSaturation", e.target.value)}
            placeholder="98" className="h-8 text-sm"
            data-testid="input-vitals-nurse-oxygenSaturation"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Pain <span className="text-muted-foreground font-normal">(0–10)</span>
          </Label>
          <Input
            type="number" min="0" max="10" step="1"
            value={vitals.painScore ?? ""}
            onChange={e => set("painScore", e.target.value)}
            placeholder="0" className="h-8 text-sm"
            data-testid="input-vitals-nurse-painScore"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Height <span className="text-muted-foreground font-normal">(in)</span>
          </Label>
          <Input
            type="number" step="0.5"
            value={vitals.heightInches ?? ""}
            onChange={e => set("heightInches", e.target.value)}
            placeholder="66" className="h-8 text-sm"
            data-testid="input-vitals-nurse-heightInches"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Weight <span className="text-muted-foreground font-normal">(lbs)</span>
          </Label>
          <Input
            type="number" step="0.1"
            value={vitals.weightLbs ?? ""}
            onChange={e => set("weightLbs", e.target.value)}
            placeholder="165" className="h-8 text-sm"
            data-testid="input-vitals-nurse-weightLbs"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">
            BMI <span className="text-muted-foreground font-normal">(auto)</span>
          </Label>
          <Input
            type="text"
            value={vitals.bmi ?? ""}
            readOnly
            placeholder="Auto-calculated"
            className="h-8 text-sm bg-muted/50 cursor-not-allowed"
            data-testid="input-vitals-nurse-bmi"
          />
        </div>
      </div>
      {(() => {
        const filled = [
          vitals.systolicBp, vitals.diastolicBp, vitals.heartRate, vitals.respiratoryRate,
          vitals.temperature, vitals.oxygenSaturation, vitals.painScore,
          vitals.heightInches, vitals.weightLbs,
        ].filter(x => x != null && x !== "").length;
        return filled > 0 ? (
          <p className="text-xs text-green-700 dark:text-green-400 font-medium">
            {filled} of 9 vital field{filled !== 1 ? "s" : ""} filled — will save to trends on note save.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Fill in any measurements you have — partial entries are fine. Values save to the patient&apos;s vitals trends when the note is saved.
          </p>
        );
      })()}
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
              data-testid={`blank-input-nurse-${seg.index}`}
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
