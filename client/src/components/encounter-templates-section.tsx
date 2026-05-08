import { useState, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, GripVertical, X, Save, FileText, Stethoscope, Phone,
  CheckSquare, AlignLeft, Heading2, ChevronDown, ListChecks,
} from "lucide-react";
import type { EncounterTemplate, TemplateField, TemplateFieldType } from "@shared/schema";

// ── Field type config ────────────────────────────────────────────────────────
const FIELD_TYPES: {
  value: TemplateFieldType;
  label: string;
  icon: typeof FileText;
  description: string;
  color: string;
}[] = [
  {
    value: "extract",
    label: "Extract Field",
    icon: AlignLeft,
    description: "AI finds a specific value from the transcript (e.g. current weight, chief complaint)",
    color: "text-blue-600",
  },
  {
    value: "checklist",
    label: "Checklist",
    icon: CheckSquare,
    description: "A list of items AI checks off based on what was discussed (e.g. symptoms reviewed, labs ordered)",
    color: "text-green-600",
  },
  {
    value: "instruction",
    label: "AI Instruction",
    icon: ListChecks,
    description: "Direct instructions telling the AI what to document and how — what to always include, what language to use, what to never omit",
    color: "text-amber-600",
  },
  {
    value: "heading",
    label: "Section Heading",
    icon: Heading2,
    description: "A labeled divider that structures the note into named sections",
    color: "text-purple-600",
  },
];

const NOTE_TYPES: { value: EncounterTemplate["noteType"]; label: string; icon: typeof FileText; description: string }[] = [
  { value: "soap", label: "SOAP Note", icon: Stethoscope, description: "Standard Subjective / Objective / Assessment / Plan format" },
  { value: "nurses_note", label: "Nurses Note", icon: FileText, description: "Clinical nursing documentation with structured sections" },
  { value: "non_visit", label: "Non-Visit Note", icon: Phone, description: "Phone calls, portal messages, and other non-encounter contacts" },
];

const ROLE_RESTRICTIONS: { value: EncounterTemplate["roleRestriction"]; label: string }[] = [
  { value: "any", label: "All users" },
  { value: "nurse", label: "Nurses only" },
  { value: "provider", label: "Providers only" },
];

function noteTypeLabel(nt: string) { return NOTE_TYPES.find(n => n.value === nt)?.label ?? nt; }
function noteTypeBadgeVariant(nt: string): "default" | "secondary" | "outline" {
  if (nt === "soap") return "default";
  if (nt === "nurses_note") return "secondary";
  return "outline";
}
function fieldTypeConfig(ft: TemplateFieldType) {
  return FIELD_TYPES.find(f => f.value === ft) ?? FIELD_TYPES[0];
}

function nanoid(len = 8) { return Math.random().toString(36).slice(2, 2 + len); }

const makeField = (fieldType: TemplateFieldType): TemplateField => ({
  id: nanoid(),
  fieldType,
  label: "",
  description: "",
  required: false,
  conditional: false,
  checklistItems: fieldType === "checklist" ? [""] : undefined,
});

const EMPTY_TEMPLATE = (): Omit<EncounterTemplate, "id" | "clinicianId" | "clinicId" | "createdAt"> => ({
  name: "",
  noteType: "soap",
  roleRestriction: "any",
  isClinicWide: false,
  fields: [],
  standingInstructions: null,
});

// ── Field summary counts for the template card ────────────────────────────────
function fieldSummary(fields: TemplateField[]) {
  const counts: Record<TemplateFieldType, number> = { extract: 0, checklist: 0, instruction: 0, heading: 0 };
  (fields ?? []).forEach(f => { counts[f.fieldType ?? "extract"]++; });
  const parts: string[] = [];
  if (counts.extract) parts.push(`${counts.extract} extract`);
  if (counts.checklist) parts.push(`${counts.checklist} checklist`);
  if (counts.instruction) parts.push(`${counts.instruction} instruction`);
  if (counts.heading) parts.push(`${counts.heading} heading`);
  return parts.length ? parts.join(" · ") : "no fields";
}

// ── Add-field type picker ─────────────────────────────────────────────────────
function AddFieldMenu({ onAdd, disabled }: { onAdd: (type: TemplateFieldType) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        data-testid="button-add-field"
      >
        <Plus className="w-3 h-3 mr-1" />
        Add Field
        <ChevronDown className="w-3 h-3 ml-1" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-popover border rounded-md shadow-md p-1 space-y-0.5">
            {FIELD_TYPES.map(ft => {
              const Icon = ft.icon;
              return (
                <button
                  key={ft.value}
                  type="button"
                  className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded hover-elevate text-left"
                  onClick={() => { onAdd(ft.value); setOpen(false); }}
                  data-testid={`menu-add-field-${ft.value}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${ft.color}`} />
                  <div>
                    <p className="text-xs font-semibold">{ft.label}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{ft.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Per-field editors ─────────────────────────────────────────────────────────
function ExtractFieldEditor({ field, idx, onChange }: {
  field: TemplateField; idx: number; onChange: (patch: Partial<TemplateField>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Field Label</Label>
          <Input
            value={field.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder="e.g. Current Weight"
            maxLength={120}
            className="h-8 text-sm"
            data-testid={`input-field-label-${idx}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">AI Extraction Hint</Label>
          <Input
            value={field.description}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="e.g. Patient's weight measured at today's visit"
            maxLength={500}
            className="h-8 text-sm"
            data-testid={`input-field-description-${idx}`}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch
            checked={field.required}
            onCheckedChange={v => onChange({ required: v })}
            data-testid={`switch-field-required-${idx}`}
          />
          <span className="text-xs text-muted-foreground">Required</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch
            checked={field.conditional}
            onCheckedChange={v => onChange({ conditional: v })}
            data-testid={`switch-field-conditional-${idx}`}
          />
          <span className="text-xs text-muted-foreground">Only if mentioned</span>
        </label>
      </div>
    </div>
  );
}

function ChecklistFieldEditor({ field, idx, onChange }: {
  field: TemplateField; idx: number; onChange: (patch: Partial<TemplateField>) => void;
}) {
  const items = field.checklistItems ?? [""];

  const setItem = (i: number, val: string) => {
    const next = [...items];
    next[i] = val;
    onChange({ checklistItems: next });
  };
  const addItem = () => onChange({ checklistItems: [...items, ""] });
  const removeItem = (i: number) => onChange({ checklistItems: items.filter((_, j) => j !== i) });

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Checklist Title</Label>
        <Input
          value={field.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="e.g. Symptoms Reviewed, Labs Ordered, Education Provided"
          maxLength={120}
          className="h-8 text-sm"
          data-testid={`input-field-label-${idx}`}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Checklist Items <span className="text-muted-foreground font-normal">(AI checks which were addressed)</span></Label>
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={item}
                onChange={e => setItem(i, e.target.value)}
                placeholder={`Item ${i + 1}…`}
                maxLength={200}
                className="h-7 text-sm flex-1"
                data-testid={`input-checklist-item-${idx}-${i}`}
              />
              {items.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeItem(i)}
                  data-testid={`button-remove-item-${idx}-${i}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
          {items.length < 50 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={addItem}
              className="h-7 text-xs"
              data-testid={`button-add-item-${idx}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add item
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch
            checked={field.required}
            onCheckedChange={v => onChange({ required: v })}
            data-testid={`switch-field-required-${idx}`}
          />
          <span className="text-xs text-muted-foreground">Required</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch
            checked={field.conditional}
            onCheckedChange={v => onChange({ conditional: v })}
            data-testid={`switch-field-conditional-${idx}`}
          />
          <span className="text-xs text-muted-foreground">Only if mentioned</span>
        </label>
      </div>
    </div>
  );
}

function InstructionFieldEditor({ field, idx, onChange }: {
  field: TemplateField; idx: number; onChange: (patch: Partial<TemplateField>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Section Name <span className="text-muted-foreground font-normal">(labels this section in the note)</span></Label>
        <Input
          value={field.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="e.g. Plan, Review of Systems, Injection Site, Energy & Appetite"
          maxLength={120}
          className="h-8 text-sm"
          data-testid={`input-field-label-${idx}`}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          Instructions for AI
          <span className="text-muted-foreground font-normal ml-1">— tell the AI exactly what to document and what to always include</span>
        </Label>
        <Textarea
          value={field.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder={`e.g. Document the current plan discussed with the patient at today's visit. Include the current medication and dose. Always include lifestyle and dietary plan: balanced diet, 80–100 oz of water intake daily, and a goal of 150 minutes per week of resistance training. Include any custom relevant details from the encounter that should be included in this patient's plan.`}
          rows={5}
          maxLength={5000}
          className="text-sm resize-y"
          data-testid={`input-field-description-${idx}`}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The AI follows these instructions when writing this section — weaving in specifics from the transcript alongside anything you've told it to always include.
      </p>
    </div>
  );
}

function HeadingFieldEditor({ field, idx, onChange }: {
  field: TemplateField; idx: number; onChange: (patch: Partial<TemplateField>) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Section Heading Text</Label>
      <Input
        value={field.label}
        onChange={e => onChange({ label: e.target.value })}
        placeholder="e.g. Review of Systems, Vital Signs, Assessment & Plan"
        maxLength={120}
        className="h-8 text-sm font-semibold"
        data-testid={`input-field-label-${idx}`}
      />
      <p className="text-xs text-muted-foreground">
        This heading will appear as a titled section in the generated note. AI fills in content beneath it from the transcript.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function EncounterTemplatesSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const switchId = useId();

  const { data: templates = [], isLoading } = useQuery<EncounterTemplate[]>({
    queryKey: ["/api/encounter-templates"],
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EncounterTemplate | null>(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE());
  const [deleteConfirm, setDeleteConfirm] = useState<EncounterTemplate | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const openCreate = () => { setEditing(null); setForm(EMPTY_TEMPLATE()); setDialogOpen(true); };

  const openEdit = (t: EncounterTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      noteType: t.noteType,
      roleRestriction: t.roleRestriction,
      isClinicWide: t.isClinicWide,
      fields: t.fields ? t.fields.map(f => ({
        ...f,
        fieldType: (f as any).fieldType ?? "extract",
      })) : [],
      standingInstructions: t.standingInstructions ?? null,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const res = await apiRequest("PATCH", `/api/encounter-templates/${editing.id}`, form);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/encounter-templates", form);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/encounter-templates"] });
      setDialogOpen(false);
      toast({ title: editing ? "Template updated" : "Template created" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/encounter-templates/${id}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/encounter-templates"] });
      setDeleteConfirm(null);
      toast({ title: "Template deleted" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Delete failed", description: e.message }),
  });

  const addField = (type: TemplateFieldType) => {
    setForm(f => ({ ...f, fields: [...(f.fields ?? []), makeField(type)] }));
  };
  const removeField = (idx: number) => setForm(f => ({ ...f, fields: (f.fields ?? []).filter((_, i) => i !== idx) }));
  const updateField = (idx: number, patch: Partial<TemplateField>) =>
    setForm(f => ({ ...f, fields: (f.fields ?? []).map((field, i) => i === idx ? { ...field, ...patch } : field) }));

  const handleDragStart = (idx: number) => setDragging(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOver(idx); };
  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragging === null || dragging === idx) { setDragging(null); setDragOver(null); return; }
    const next = [...(form.fields ?? [])];
    const [moved] = next.splice(dragging, 1);
    next.splice(idx, 0, moved);
    setForm(f => ({ ...f, fields: next }));
    setDragging(null); setDragOver(null);
  };

  // Validation: extract/checklist need label; instruction needs label + description; heading needs label
  const canSave = form.name.trim().length > 0 && (form.fields ?? []).every(f => {
    const ft = (f as any).fieldType ?? "extract";
    if (!f.label.trim()) return false;
    if (ft === "extract" && !f.description.trim()) return false;
    if (ft === "instruction" && !f.description.trim()) return false;
    if (ft === "checklist") {
      const items = f.checklistItems ?? [];
      if (items.length === 0) return false;
      if (items.some(it => !it.trim())) return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted rounded-md animate-pulse w-40" />
        <div className="h-24 bg-muted rounded-md animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Encounter Templates</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Build named templates that guide AI note generation for specific visit types. Mix extract fields,
          checklists, instruction blocks, and section headings to shape exactly how the note is structured.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={openCreate} size="sm" data-testid="button-create-encounter-template">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
            <FileText className="w-9 h-9 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No templates yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first encounter template to speed up documentation for recurring visit types.
              </p>
            </div>
            <Button size="sm" onClick={openCreate} data-testid="button-create-first-template">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create a Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const Icon = NOTE_TYPES.find(n => n.value === t.noteType)?.icon ?? FileText;
            return (
              <Card key={t.id} data-testid={`card-encounter-template-${t.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant={noteTypeBadgeVariant(t.noteType)} className="text-xs">
                            {noteTypeLabel(t.noteType)}
                          </Badge>
                          {t.isClinicWide && <Badge variant="outline" className="text-xs">Clinic-wide</Badge>}
                          {t.roleRestriction !== "any" && (
                            <Badge variant="outline" className="text-xs capitalize">{t.roleRestriction}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{fieldSummary(t.fields ?? [])}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} data-testid={`button-edit-template-${t.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(t)} data-testid={`button-delete-template-${t.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Template" : "New Encounter Template"}</DialogTitle>
            <DialogDescription>
              Mix field types to shape how the AI documents each visit. Drag rows to reorder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-name">Template Name</Label>
              <Input
                id="tmpl-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. HRT Follow-Up, Initial Consult, Phone Check-In"
                maxLength={120}
                data-testid="input-template-name"
              />
            </div>

            {/* Note Type */}
            <div className="space-y-1.5">
              <Label>Note Type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {NOTE_TYPES.map(nt => {
                  const Icon = nt.icon;
                  const active = form.noteType === nt.value;
                  return (
                    <button
                      key={nt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, noteType: nt.value }))}
                      className={`rounded-md border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                      data-testid={`button-notetype-${nt.value}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-xs font-semibold ${active ? "text-primary" : ""}`}>{nt.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-tight">{nt.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Role Restriction + Clinic-Wide */}
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5 min-w-40">
                <Label>Visible to</Label>
                <Select value={form.roleRestriction} onValueChange={v => setForm(f => ({ ...f, roleRestriction: v as any }))}>
                  <SelectTrigger data-testid="select-role-restriction"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_RESTRICTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`${switchId}-clinic-wide`}
                    checked={form.isClinicWide}
                    onCheckedChange={v => setForm(f => ({ ...f, isClinicWide: v }))}
                    data-testid="switch-clinic-wide"
                  />
                  <Label htmlFor={`${switchId}-clinic-wide`} className="cursor-pointer">Clinic-wide</Label>
                </div>
              </div>
            </div>

            {/* Field list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Template Content</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add fields, checklists, instructions, and headings. Drag to reorder.
                  </p>
                </div>
                <AddFieldMenu onAdd={addField} disabled={(form.fields ?? []).length >= 40} />
              </div>

              {(form.fields ?? []).length === 0 ? (
                <div className="border rounded-md py-6 text-center space-y-3">
                  <p className="text-xs text-muted-foreground">No content yet — use the "Add Field" button to get started.</p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {FIELD_TYPES.map(ft => {
                      const Icon = ft.icon;
                      return (
                        <button
                          key={ft.value}
                          type="button"
                          onClick={() => addField(ft.value)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover-elevate rounded px-2 py-1.5 border"
                          data-testid={`empty-add-${ft.value}`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${ft.color}`} />
                          {ft.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {(form.fields ?? []).map((field, idx) => {
                    const ft: TemplateFieldType = (field as any).fieldType ?? "extract";
                    const cfg = fieldTypeConfig(ft);
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDrop={e => handleDrop(e, idx)}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        className={`rounded-md border p-3 space-y-2.5 bg-card transition-opacity ${dragOver === idx && dragging !== idx ? "border-primary" : ""} ${dragging === idx ? "opacity-50" : ""}`}
                        data-testid={`field-row-${idx}`}
                      >
                        {/* Row header */}
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                          <div className="flex-1" />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeField(idx)}
                            data-testid={`button-remove-field-${idx}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Type-specific editor */}
                        <div className="pl-6">
                          {ft === "extract" && (
                            <ExtractFieldEditor field={field} idx={idx} onChange={p => updateField(idx, p)} />
                          )}
                          {ft === "checklist" && (
                            <ChecklistFieldEditor field={field} idx={idx} onChange={p => updateField(idx, p)} />
                          )}
                          {ft === "instruction" && (
                            <InstructionFieldEditor field={field} idx={idx} onChange={p => updateField(idx, p)} />
                          )}
                          {ft === "heading" && (
                            <HeadingFieldEditor field={field} idx={idx} onChange={p => updateField(idx, p)} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-template">
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              data-testid="button-save-template"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Delete <strong>{deleteConfirm?.name}</strong>? This cannot be undone. Existing notes already generated with this template are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-template"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
