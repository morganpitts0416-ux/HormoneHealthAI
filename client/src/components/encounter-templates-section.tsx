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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, GripVertical, X, Save, FileText, Stethoscope, Phone } from "lucide-react";
import type { EncounterTemplate, TemplateField } from "@shared/schema";

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

function noteTypeLabel(nt: string) {
  return NOTE_TYPES.find(n => n.value === nt)?.label ?? nt;
}

function noteTypeBadgeVariant(nt: string) {
  if (nt === "soap") return "default";
  if (nt === "nurses_note") return "secondary";
  return "outline";
}

function nanoid(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

const EMPTY_FIELD = (): TemplateField => ({
  id: nanoid(),
  label: "",
  description: "",
  required: false,
  conditional: false,
});

const EMPTY_TEMPLATE = (): Omit<EncounterTemplate, "id" | "clinicianId" | "clinicId" | "createdAt"> => ({
  name: "",
  noteType: "soap",
  roleRestriction: "any",
  isClinicWide: false,
  fields: [],
  standingInstructions: null,
});

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

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_TEMPLATE());
    setDialogOpen(true);
  };

  const openEdit = (t: EncounterTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      noteType: t.noteType,
      roleRestriction: t.roleRestriction,
      isClinicWide: t.isClinicWide,
      fields: t.fields ? [...t.fields] : [],
      standingInstructions: t.standingInstructions ?? null,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const res = await apiRequest("PATCH", `/api/encounter-templates/${editing.id}`, form);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/encounter-templates", form);
        return res.json();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/encounter-templates"] });
      setDialogOpen(false);
      toast({ title: editing ? "Template updated" : "Template created" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/encounter-templates/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/encounter-templates"] });
      setDeleteConfirm(null);
      toast({ title: "Template deleted" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Delete failed", description: e.message }),
  });

  const addField = () => {
    setForm(f => ({ ...f, fields: [...(f.fields ?? []), EMPTY_FIELD()] }));
  };

  const removeField = (idx: number) => {
    setForm(f => ({ ...f, fields: (f.fields ?? []).filter((_, i) => i !== idx) }));
  };

  const updateField = (idx: number, patch: Partial<TemplateField>) => {
    setForm(f => ({
      ...f,
      fields: (f.fields ?? []).map((field, i) => i === idx ? { ...field, ...patch } : field),
    }));
  };

  const handleDragStart = (idx: number) => setDragging(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOver(idx);
  };
  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragging === null || dragging === idx) { setDragging(null); setDragOver(null); return; }
    const newFields = [...(form.fields ?? [])];
    const [moved] = newFields.splice(dragging, 1);
    newFields.splice(idx, 0, moved);
    setForm(f => ({ ...f, fields: newFields }));
    setDragging(null);
    setDragOver(null);
  };

  const canSave = form.name.trim().length > 0 &&
    (form.fields ?? []).every(f => f.label.trim().length > 0 && f.description.trim().length > 0);

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
          Build named templates that guide AI note generation for specific visit types. Select a template
          in any encounter to populate a structured note using fields you define.
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
                          {t.isClinicWide && (
                            <Badge variant="outline" className="text-xs">Clinic-wide</Badge>
                          )}
                          {t.roleRestriction !== "any" && (
                            <Badge variant="outline" className="text-xs capitalize">{t.roleRestriction}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {(t.fields ?? []).length} field{(t.fields ?? []).length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {t.standingInstructions && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1 italic">
                            Standing: {t.standingInstructions}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(t)}
                        data-testid={`button-edit-template-${t.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirm(t)}
                        data-testid={`button-delete-template-${t.id}`}
                      >
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
              Define fields the AI will extract from the visit transcript, and any standing instructions to include verbatim.
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
                      className={`rounded-md border p-3 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover-elevate"
                      }`}
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
                <Select
                  value={form.roleRestriction}
                  onValueChange={v => setForm(f => ({ ...f, roleRestriction: v as any }))}
                >
                  <SelectTrigger data-testid="select-role-restriction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_RESTRICTIONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
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
                  <Label htmlFor={`${switchId}-clinic-wide`} className="cursor-pointer">
                    Clinic-wide (visible to all staff)
                  </Label>
                </div>
              </div>
            </div>

            {/* Template Fields */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Template Fields</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Each field is auto-extracted from the transcript by AI. Drag to reorder.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addField}
                  disabled={(form.fields ?? []).length >= 30}
                  data-testid="button-add-field"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Field
                </Button>
              </div>

              {(form.fields ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center border rounded-md">
                  No fields yet — add fields or use standing instructions below.
                </p>
              ) : (
                <div className="space-y-2">
                  {(form.fields ?? []).map((field, idx) => (
                    <div
                      key={field.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDrop={e => handleDrop(e, idx)}
                      onDragEnd={() => { setDragging(null); setDragOver(null); }}
                      className={`rounded-md border p-3 space-y-2 bg-card transition-opacity ${
                        dragOver === idx && dragging !== idx ? "border-primary" : ""
                      } ${dragging === idx ? "opacity-50" : ""}`}
                      data-testid={`field-row-${idx}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 text-muted-foreground mt-2 cursor-grab shrink-0" />
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Field Label</Label>
                            <Input
                              value={field.label}
                              onChange={e => updateField(idx, { label: e.target.value })}
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
                              onChange={e => updateField(idx, { description: e.target.value })}
                              placeholder="e.g. Patient's weight measured at today's visit"
                              maxLength={500}
                              className="h-8 text-sm"
                              data-testid={`input-field-description-${idx}`}
                            />
                          </div>
                        </div>
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
                      <div className="flex items-center gap-4 pl-6">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={field.required}
                            onCheckedChange={v => updateField(idx, { required: v })}
                            data-testid={`switch-field-required-${idx}`}
                          />
                          <span className="text-xs text-muted-foreground">Required</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={field.conditional}
                            onCheckedChange={v => updateField(idx, { conditional: v })}
                            data-testid={`switch-field-conditional-${idx}`}
                          />
                          <span className="text-xs text-muted-foreground">Conditional (only if mentioned)</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Standing Instructions */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-standing">Standing Instructions</Label>
              <p className="text-xs text-muted-foreground">
                Text that is always included verbatim in every note generated with this template (e.g. standard disclaimers, follow-up protocols).
              </p>
              <Textarea
                id="tmpl-standing"
                value={form.standingInstructions ?? ""}
                onChange={e => setForm(f => ({ ...f, standingInstructions: e.target.value || null }))}
                placeholder="Enter any standing text to include in every note generated with this template…"
                rows={4}
                maxLength={5000}
                className="text-sm resize-y"
                data-testid="textarea-standing-instructions"
              />
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

      {/* ── Delete Confirm ──────────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Delete <strong>{deleteConfirm?.name}</strong>? This cannot be undone. Existing notes already generated with this template are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
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
