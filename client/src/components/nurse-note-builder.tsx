import { useState, useRef, useEffect } from "react";
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
import type { NoteTemplate, PatientVital } from "@shared/schema";

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

interface NurseBlock {
  uid: string;
  type: string;
  label?: string;
  content?: string;
  options?: string[];
  selected?: string;
  checked?: boolean;
  vitals?: { systolicBp?: string; diastolicBp?: string; heartRate?: string; temp?: string; rr?: string; spo2?: string; weightLbs?: string };
  collapsed?: boolean;
}

function uid() { return Math.random().toString(36).substring(2, 10); }

export function NurseNoteBuilder({ patientId, onClose }: NurseNoteBuilderProps) {
  const { toast } = useToast();
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60_000;
  const [visitDate, setVisitDate] = useState(new Date(now.getTime() - tzOffset).toISOString().slice(0, 16));
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

  const { data: latestVitals = [] } = useQuery<PatientVital[]>({
    queryKey: [`/api/patients/${patientId}/vitals`],
  });
  const lastVital = latestVitals[0];

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find(t => String(t.id) === id);
    if (!tpl) return;
    const newBlocks: NurseBlock[] = (tpl.blocks ?? []).map((b: any) => ({
      uid: uid(),
      type: b.type,
      label: b.label,
      content: b.defaultValue ?? "",
      options: b.options,
      vitals: b.type === "vitals" ? {} : undefined,
    }));
    setBlocks(newBlocks);
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
      // serialize blocks to soapNote jsonb shape (.blocks array)
      const body = {
        patientId,
        visitDate: new Date(visitDate).toISOString(),
        visitType: "nurse-visit",
        noteType: "nurse",
        chiefComplaint: chiefComplaint || blocks.find(b => b.type === "chief_complaint")?.content || "Nurse visit",
        soapNote: { blocks } as any,
      };
      return apiRequest("POST", "/api/encounters", body);
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
                lastVital={lastVital}
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
  block, isFirst, isLast, lastVital, onChange, onRemove, onMove,
}: {
  block: NurseBlock;
  isFirst: boolean; isLast: boolean;
  lastVital?: PatientVital;
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
                lastVital={lastVital}
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
              <div className="flex items-center gap-2">
                <Checkbox checked={!!block.checked} onCheckedChange={(c) => onChange({ checked: !!c })} id={block.uid} />
                <Label htmlFor={block.uid} className="cursor-pointer">{block.label || "Yes"}</Label>
              </div>
            ) : block.type === "short_text" ? (
              <Input value={block.content ?? ""} onChange={e => onChange({ content: e.target.value })} />
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
  vitals, lastVital, onChange,
}: { vitals: any; lastVital?: PatientVital; onChange: (v: any) => void }) {
  const set = (k: string, v: string) => onChange({ ...vitals, [k]: v });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div><Label className="text-xs">Systolic</Label><Input value={vitals.systolicBp ?? ""} onChange={e => set("systolicBp", e.target.value)} placeholder="120" /></div>
        <div><Label className="text-xs">Diastolic</Label><Input value={vitals.diastolicBp ?? ""} onChange={e => set("diastolicBp", e.target.value)} placeholder="80" /></div>
        <div><Label className="text-xs">Heart Rate</Label><Input value={vitals.heartRate ?? ""} onChange={e => set("heartRate", e.target.value)} placeholder="bpm" /></div>
        <div><Label className="text-xs">SpO2 %</Label><Input value={vitals.spo2 ?? ""} onChange={e => set("spo2", e.target.value)} placeholder="98" /></div>
        <div><Label className="text-xs">Temp °F</Label><Input value={vitals.temp ?? ""} onChange={e => set("temp", e.target.value)} placeholder="98.6" /></div>
        <div><Label className="text-xs">Resp Rate</Label><Input value={vitals.rr ?? ""} onChange={e => set("rr", e.target.value)} placeholder="16" /></div>
        <div><Label className="text-xs">Weight (lb)</Label><Input value={vitals.weightLbs ?? ""} onChange={e => set("weightLbs", e.target.value)} placeholder="180" /></div>
      </div>
      {lastVital && (
        <p className="text-[11px] text-muted-foreground">
          Most recent on file: BP {lastVital.systolicBp ?? "—"}/{lastVital.diastolicBp ?? "—"} · HR {lastVital.heartRate ?? "—"} · Wt {lastVital.weightLbs ?? "—"} lb
        </p>
      )}
    </div>
  );
}
