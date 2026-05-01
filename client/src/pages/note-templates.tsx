import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, FileText, MessageSquare, Lock, Users, Save, X, GripVertical, Stethoscope } from "lucide-react";
import type { NoteTemplate, NotePhrase } from "@shared/schema";
import { BUILTIN_BLOCKS, ROS_SYSTEMS, PE_SYSTEMS, type BuiltinBlockId } from "@shared/note-builtin-blocks";

const NOTE_TYPES = [
  { value: "soap_provider", label: "Provider SOAP Note" },
  { value: "nurse", label: "Nurse Note" },
  { value: "phone", label: "Phone Note" },
] as const;

const FIELD_BLOCK_TYPES = [
  { id: "section_header", label: "Section Header" },
  { id: "free_text", label: "Free Text Block" },
  { id: "short_text", label: "Short Text Field" },
  { id: "long_text", label: "Long Text Field" },
  { id: "dropdown", label: "Dropdown" },
  { id: "checkbox", label: "Checkbox" },
  { id: "radio", label: "Radio Buttons" },
] as const;

// Built-in clinical blocks shown in their own group inside the template editor.
// `type` here is `clinical_<id>` so the renderer can distinguish them from the
// generic field types and apply special UI (bullet toggle, chart prompt).
const CLINICAL_BLOCK_OPTIONS = BUILTIN_BLOCKS.map(b => ({
  id: `clinical_${b.id}` as const,
  builtinId: b.id,
  label: b.label,
  list: b.list,
  chart: b.chart,
}));

interface TemplateBlock {
  uid: string;
  type: string;
  label?: string;
  defaultValue?: string;
  options?: string[]; // for dropdown/radio
  builtinId?: BuiltinBlockId;        // present for clinical_* blocks
  bulletMode?: boolean;              // true → render as bullet list (history blocks)
  systems?: string[];                // ROS/PE: which systems this template uses
}

function uid() { return Math.random().toString(36).substring(2, 10); }

// Reusable content (also rendered embedded inside the Account page).
export function NoteTemplatesContent({ embedded = false }: { embedded?: boolean }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className={embedded ? "text-xl font-semibold" : "text-2xl font-semibold"} data-testid="text-page-title">
          Note Templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Build reusable note templates and quick phrases for SOAP, nurse, and phone notes.
        </p>
      </div>
      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates" data-testid="tab-templates"><FileText className="w-4 h-4 mr-1.5" />Templates</TabsTrigger>
          <TabsTrigger value="phrases" data-testid="tab-phrases"><MessageSquare className="w-4 h-4 mr-1.5" />Phrase Library</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="phrases" className="mt-4"><PhrasesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

export default function NoteTemplatesPage() {
  // Templates now live inside the Account → Note Templates section. Redirect
  // legacy `/note-templates` URLs (bookmarks, old emails) to the new location
  // so the sidebar/Settings menu stays consistent.
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/account?section=notes", { replace: true });
  }, [setLocation]);
  return null;
}

function TemplatesTab() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<NoteTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: templates = [], isLoading } = useQuery<NoteTemplate[]>({ queryKey: ["/api/note-templates"] });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/note-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (e: any) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{templates.length} template{templates.length === 1 ? "" : "s"}</p>
        <Button onClick={() => setCreating(true)} data-testid="button-new-template"><Plus className="w-4 h-4 mr-1.5" />New Template</Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No templates yet. Click "New Template" to build one.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {templates.map(t => (
            <Card key={t.id} data-testid={`card-template-${t.id}`}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium" data-testid={`text-template-name-${t.id}`}>{t.name}</span>
                    <Badge variant="outline">{NOTE_TYPES.find(n => n.value === t.noteType)?.label ?? t.noteType}</Badge>
                    {t.isShared
                      ? <Badge className="bg-emerald-100 text-emerald-900"><Users className="w-3 h-3 mr-1" />Clinic-wide</Badge>
                      : <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" />Private</Badge>}
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">{(t.blocks?.length ?? 0)} block{(t.blocks?.length ?? 0) === 1 ? "" : "s"}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(t)} data-testid={`button-edit-template-${t.id}`}><Edit className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMut.mutate(t.id); }} data-testid={`button-delete-template-${t.id}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {(creating || editing) && (
        <TemplateEditorDialog
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TemplateEditorDialog({ template, onClose }: { template: NoteTemplate | null; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [shortcut, setShortcut] = useState(template?.shortcut ?? "");
  const [noteType, setNoteType] = useState<string>(template?.noteType ?? "soap_provider");
  const [isShared, setIsShared] = useState(template?.isShared ?? false);
  const [blocks, setBlocks] = useState<TemplateBlock[]>(
    (template?.blocks as TemplateBlock[] | undefined) ?? [],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { name, description, shortcut: shortcut.trim() || null, noteType, isShared, blocks };
      if (template) return apiRequest("PATCH", `/api/note-templates/${template.id}`, body);
      return apiRequest("POST", "/api/note-templates", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
      toast({ title: template ? "Template updated" : "Template created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const addBlock = (type: string) => {
    const b: TemplateBlock = { uid: uid(), type, label: "" };
    if (type === "dropdown" || type === "radio") b.options = ["Option 1", "Option 2"];
    setBlocks([...blocks, b]);
  };

  const addClinicalBlock = (opt: typeof CLINICAL_BLOCK_OPTIONS[number]) => {
    const block: TemplateBlock = {
      uid: uid(),
      type: opt.id,
      builtinId: opt.builtinId,
      label: opt.label,
      // History list blocks default to bullets; HPI defaults to free text
      // (narrative) but providers can flip it to bullets (OPQRST etc.).
      bulletMode: opt.list ? true : (opt.builtinId === "hpi" ? false : undefined),
    };
    if (opt.chart) {
      // Default ROS/PE charts ship with every canonical system selected.
      // Providers can untick the ones their specialty doesn't need.
      block.systems = opt.builtinId === "ros" ? [...ROS_SYSTEMS] : [...PE_SYSTEMS];
    }
    setBlocks([...blocks, block]);
  };

  const updateBlock = (i: number, patch: Partial<TemplateBlock>) => {
    setBlocks(blocks.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  };

  const removeBlock = (i: number) => setBlocks(blocks.filter((_, idx) => idx !== i));

  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks]; [next[i], next[j]] = [next[j], next[i]]; setBlocks(next);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Annual Wellness Visit" data-testid="input-template-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Note Type</Label>
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger data-testid="select-template-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input value={description ?? ""} onChange={e => setDescription(e.target.value)} placeholder="Short description" />
            </div>
            <div className="space-y-1.5">
              <Label>Slash shortcut (optional)</Label>
              <Input
                value={shortcut ?? ""}
                onChange={e => setShortcut(e.target.value)}
                placeholder="e.g. wellness — type /wellness in any note"
                data-testid="input-template-shortcut"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isShared} onCheckedChange={setIsShared} data-testid="switch-template-shared" />
            <Label className="cursor-pointer" onClick={() => setIsShared(!isShared)}>
              {isShared ? "Shared with entire clinic" : "Private to me"}
            </Label>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" /> Clinical Blocks
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Built-in sections that map to standard SOAP fields. History blocks default to bullet lists; ROS/PE drop in a per-system chart.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CLINICAL_BLOCK_OPTIONS.map(b => (
                  <Button
                    key={b.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addClinicalBlock(b)}
                    data-testid={`button-add-clinical-${b.builtinId}`}
                  >
                    <Plus className="w-3 h-3 mr-1" />{b.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold">Generic Field Blocks</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {FIELD_BLOCK_TYPES.map(b => (
                  <Button key={b.id} type="button" size="sm" variant="outline" onClick={() => addBlock(b.id)} data-testid={`button-add-block-${b.id}`}>
                    <Plus className="w-3 h-3 mr-1" />{b.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {blocks.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Add blocks above to start building your template.</p>
            )}
            {blocks.map((b, i) => {
              const isClinical = b.type.startsWith("clinical_");
              const clinicalDef = isClinical ? CLINICAL_BLOCK_OPTIONS.find(c => c.id === b.type) : null;
              const typeLabel = clinicalDef
                ? `Clinical · ${clinicalDef.label}`
                : (FIELD_BLOCK_TYPES.find(t => t.id === b.type)?.label ?? b.type);
              return (
                <Card key={b.uid}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="outline" className="font-mono text-[10px]">{typeLabel}</Badge>
                      <div className="flex-1" />
                      <Button size="icon" variant="ghost" onClick={() => moveBlock(i, -1)} disabled={i === 0}>↑</Button>
                      <Button size="icon" variant="ghost" onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}>↓</Button>
                      <Button size="icon" variant="ghost" onClick={() => removeBlock(i)} data-testid={`button-remove-block-${i}`}><X className="w-4 h-4" /></Button>
                    </div>
                    <Input
                      placeholder={b.type === "section_header" ? "Section heading" : "Field label"}
                      value={b.label ?? ""}
                      onChange={e => updateBlock(i, { label: e.target.value })}
                      data-testid={`input-block-label-${i}`}
                    />
                    {(clinicalDef?.list || clinicalDef?.builtinId === "hpi") && (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          checked={b.bulletMode ?? (clinicalDef?.builtinId === "hpi" ? false : true)}
                          onCheckedChange={(v) => updateBlock(i, { bulletMode: v })}
                          data-testid={`switch-bullet-${i}`}
                        />
                        <Label className="text-xs cursor-pointer">
                          {(b.bulletMode ?? (clinicalDef?.builtinId === "hpi" ? false : true))
                            ? (clinicalDef?.builtinId === "hpi" ? "Bullet list (OPQRST etc.)" : "Bullet list (recommended)")
                            : (clinicalDef?.builtinId === "hpi" ? "Free text (narrative)" : "Free text")}
                        </Label>
                      </div>
                    )}
                    {clinicalDef?.chart && (
                      <ChartSystemPicker
                        kind={clinicalDef.builtinId as "ros" | "physical_exam"}
                        selected={b.systems ?? (clinicalDef.builtinId === "ros" ? ROS_SYSTEMS : PE_SYSTEMS)}
                        onChange={(systems) => updateBlock(i, { systems })}
                        blockIndex={i}
                      />
                    )}
                    {clinicalDef && !clinicalDef.chart && (
                      <Textarea
                        placeholder={`Default ${clinicalDef.label.toLowerCase()} content (optional)`}
                        value={b.defaultValue ?? ""}
                        onChange={e => updateBlock(i, { defaultValue: e.target.value })}
                        rows={3}
                      />
                    )}
                    {(b.type === "free_text" || b.type === "long_text") && (
                      <Textarea
                        placeholder="Default content (optional)"
                        value={b.defaultValue ?? ""}
                        onChange={e => updateBlock(i, { defaultValue: e.target.value })}
                        rows={3}
                      />
                    )}
                    {b.type === "short_text" && (
                      <Input
                        placeholder="Default value (optional)"
                        value={b.defaultValue ?? ""}
                        onChange={e => updateBlock(i, { defaultValue: e.target.value })}
                      />
                    )}
                    {b.type === "checkbox" && (
                      <p className="text-xs text-muted-foreground">Single checkbox (yes/no). Label above.</p>
                    )}
                    {(b.type === "dropdown" || b.type === "radio") && (
                      <div className="space-y-1">
                        <Label className="text-xs">Options (one per line)</Label>
                        <Textarea
                          rows={3}
                          value={(b.options ?? []).join("\n")}
                          onChange={e => updateBlock(i, { options: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending} data-testid="button-save-template">
            <Save className="w-4 h-4 mr-1.5" />{saveMut.isPending ? "Saving…" : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Multi-select for which systems a ROS/PE template should include. Lets a
 * specialist trim ROS down to (e.g.) Cardio + Resp + Constitutional, or add a
 * Skin row to a derm PE template. Works as a checkbox grid that always
 * preserves the canonical system order regardless of click order.
 */
function ChartSystemPicker({
  kind, selected, onChange, blockIndex,
}: {
  kind: "ros" | "physical_exam";
  selected: string[];
  onChange: (systems: string[]) => void;
  blockIndex: number;
}) {
  const all = kind === "ros" ? ROS_SYSTEMS : PE_SYSTEMS;
  const selectedSet = new Set(selected);
  const toggle = (s: string) => {
    const next = selectedSet.has(s)
      ? selected.filter(x => x !== s)
      : all.filter(x => selectedSet.has(x) || x === s); // preserve canonical order
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">
          Systems included in this {kind === "ros" ? "Review of Systems" : "Physical Exam"} chart
        </Label>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => onChange([...all])}
            data-testid={`button-systems-all-${blockIndex}`}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => onChange([])}
            data-testid={`button-systems-none-${blockIndex}`}
          >
            None
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {all.map(system => {
          const checked = selectedSet.has(system);
          return (
            <label
              key={system}
              className="flex items-center gap-1.5 text-xs cursor-pointer hover-elevate rounded-sm px-1.5 py-1"
              data-testid={`label-system-${kind}-${system.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${blockIndex}`}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={checked}
                onChange={() => toggle(system)}
                data-testid={`checkbox-system-${kind}-${system.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${blockIndex}`}
              />
              <span className="truncate">{system}</span>
            </label>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {selected.length} of {all.length} systems · empty rows are stripped on save.
      </p>
    </div>
  );
}

function PhrasesTab() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<NotePhrase | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: phrases = [], isLoading } = useQuery<NotePhrase[]>({ queryKey: ["/api/note-phrases"] });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/note-phrases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-phrases"] });
      toast({ title: "Phrase deleted" });
    },
    onError: (e: any) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{phrases.length} phrase{phrases.length === 1 ? "" : "s"}. Insert any phrase in any note by typing <code className="text-xs bg-muted px-1 rounded">/phrase</code>.</p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-new-phrase"><Plus className="w-4 h-4 mr-1.5" />New Phrase</Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : phrases.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No phrases yet. Add common documentation snippets here.
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {phrases.map(p => (
            <Card key={p.id} data-testid={`card-phrase-${p.id}`}>
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{p.title}</span>
                    {p.shortcut && <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">.{p.shortcut}</code>}
                    {p.isShared
                      ? <Badge className="bg-emerald-100 text-emerald-900"><Users className="w-3 h-3 mr-1" />Clinic</Badge>
                      : <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" />Private</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{p.content}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(p)} data-testid={`button-edit-phrase-${p.id}`}><Edit className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${p.title}"?`)) deleteMut.mutate(p.id); }} data-testid={`button-delete-phrase-${p.id}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {(creating || editing) && <PhraseEditorDialog phrase={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </div>
  );
}

function PhraseEditorDialog({ phrase, onClose }: { phrase: NotePhrase | null; onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(phrase?.title ?? "");
  const [shortcut, setShortcut] = useState(phrase?.shortcut ?? "");
  const [content, setContent] = useState(phrase?.content ?? "");
  const [isShared, setIsShared] = useState(phrase?.isShared ?? false);
  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { title, shortcut: shortcut || undefined, content, isShared };
      if (phrase) return apiRequest("PATCH", `/api/note-phrases/${phrase.id}`, body);
      return apiRequest("POST", "/api/note-phrases", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-phrases"] });
      toast({ title: phrase ? "Phrase updated" : "Phrase created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{phrase ? "Edit Phrase" : "New Phrase"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. HTN counseling" data-testid="input-phrase-title" />
            </div>
            <div className="space-y-1.5">
              <Label>Shortcut (optional)</Label>
              <Input value={shortcut ?? ""} onChange={e => setShortcut(e.target.value)} placeholder="htn" data-testid="input-phrase-shortcut" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="Type the snippet that should be inserted…" data-testid="textarea-phrase-content" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isShared} onCheckedChange={setIsShared} data-testid="switch-phrase-shared" />
            <Label className="cursor-pointer" onClick={() => setIsShared(!isShared)}>
              {isShared ? "Shared with entire clinic" : "Private to me"}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!title.trim() || !content.trim() || saveMut.isPending} data-testid="button-save-phrase">
            <Save className="w-4 h-4 mr-1.5" />{saveMut.isPending ? "Saving…" : "Save Phrase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
