import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText, Plus, Settings, Trash2, Copy, Eye, Link2, ChevronDown, ChevronUp,
  ClipboardList, CheckCircle2, Clock, AlertCircle, GripVertical, Tag,
  LayoutList, Edit3, Globe, Send, RefreshCw, Inbox
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface IntakeForm {
  id: number;
  name: string;
  description: string | null;
  category: string;
  status: string;
  version: number;
  allowLink: boolean;
  allowEmbed: boolean;
  allowTablet: boolean;
  isPublic: boolean;
  requiresPatientSignature: boolean;
  requiresStaffSignature: boolean;
  expirationType: string;
  updatedAt: string;
  createdAt: string;
  sections: FormSection[];
  fields: FormField[];
  publications: FormPublication[];
}

interface FormSection {
  id: number;
  formId: number;
  title: string;
  description: string | null;
  orderIndex: number;
  isRepeatable: boolean;
}

interface FormField {
  id: number;
  formId: number;
  sectionId: number | null;
  fieldKey: string;
  label: string;
  fieldType: string;
  helpText: string | null;
  placeholder: string | null;
  isRequired: boolean;
  isHidden: boolean;
  orderIndex: number;
  optionsJson: any;
  validationJson: any;
  syncConfigJson: any;
  layoutJson: any;
}

interface FormPublication {
  id: number;
  formId: number;
  publicToken: string;
  mode: string;
  status: string;
  expiresAt: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: "short_text", label: "Short Text" },
  { value: "long_text", label: "Long Text / Paragraph" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone Number" },
  { value: "date", label: "Date" },
  { value: "single_choice", label: "Single Choice (Radio)" },
  { value: "multi_choice", label: "Multiple Choice (Checkboxes)" },
  { value: "dropdown", label: "Dropdown" },
  { value: "yes_no", label: "Yes / No" },
  { value: "scale", label: "Rating Scale" },
  { value: "signature", label: "Signature" },
  { value: "heading", label: "Section Heading" },
  { value: "paragraph", label: "Paragraph / Instructions" },
  { value: "medication_list", label: "Medication List" },
  { value: "symptom_checklist", label: "Symptom Checklist" },
];

const SYNC_DOMAINS = [
  { value: "none", label: "Do not sync" },
  { value: "medications", label: "Medications" },
  { value: "allergies", label: "Allergies" },
  { value: "medical_history", label: "Medical History" },
  { value: "surgical_history", label: "Surgical History" },
  { value: "family_history", label: "Family History" },
  { value: "social_history", label: "Social History" },
];

const CATEGORIES = [
  { value: "custom", label: "Custom" },
  { value: "initial_intake", label: "Initial Intake" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "hormone", label: "Hormone Panel" },
  { value: "wellness", label: "Wellness Check" },
  { value: "surgical_history", label: "Surgical History" },
  { value: "medication_review", label: "Medication Review" },
  { value: "symptom_survey", label: "Symptom Survey" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  archived: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

// ─── Form List Page ───────────────────────────────────────────────────────────

export default function IntakeFormsPage() {
  const [, setLocation] = useLocation();
  const [activeFormId, setActiveFormId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("custom");
  const [filterStatus, setFilterStatus] = useState("all");
  const { toast } = useToast();

  const { data: forms = [], isLoading } = useQuery<IntakeForm[]>({
    queryKey: ["/api/intake-forms"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/intake-forms", data),
    onSuccess: async (res) => {
      const form = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      setShowCreate(false);
      setNewName("");
      setActiveFormId(form.id);
    },
    onError: () => toast({ title: "Failed to create form", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/intake-forms/${id}/duplicate`, {}),
    onSuccess: async (res) => {
      const form = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      toast({ title: "Form duplicated" });
      setActiveFormId(form.id);
    },
    onError: () => toast({ title: "Failed to duplicate", variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/intake-forms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      if (activeFormId) setActiveFormId(null);
      toast({ title: "Form archived" });
    },
    onError: () => toast({ title: "Failed to archive", variant: "destructive" }),
  });

  const filtered = forms.filter(f =>
    filterStatus === "all" ? f.status !== "archived" :
    filterStatus === "archived" ? f.status === "archived" :
    f.status === filterStatus
  );

  if (activeFormId) {
    return (
      <FormBuilderView
        formId={activeFormId}
        onBack={() => setActiveFormId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Digital Forms</h1>
            <p className="text-xs text-muted-foreground">Build and manage patient intake forms</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36" data-testid="select-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Active Forms</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="active">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreate(true)} data-testid="button-create-form">
            <Plus className="h-4 w-4 mr-1" /> New Form
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <ClipboardList className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No forms yet</p>
            <p className="text-sm text-muted-foreground">Create your first intake form to get started</p>
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-form-empty">
              <Plus className="h-4 w-4 mr-1" /> Create Form
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {filtered.map(form => (
              <Card key={form.id} className="hover-elevate cursor-pointer" data-testid={`card-form-${form.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0" onClick={() => setActiveFormId(form.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate" data-testid={`text-form-name-${form.id}`}>{form.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[form.status] ?? ""}`}>
                          {form.status}
                        </span>
                        <Badge variant="outline" className="text-xs">{CATEGORIES.find(c => c.value === form.category)?.label ?? form.category}</Badge>
                      </div>
                      {form.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{form.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <LayoutList className="h-3 w-3" />
                          {form.fields?.length ?? 0} fields
                        </span>
                        {form.publications?.some(p => p.status === "active") && (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <Globe className="h-3 w-3" />
                            Published
                          </span>
                        )}
                        <span>v{form.version}</span>
                        <span>Updated {new Date(form.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" title="Edit form"
                        onClick={() => setActiveFormId(form.id)}
                        data-testid={`button-edit-form-${form.id}`}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Duplicate"
                        onClick={() => duplicateMutation.mutate(form.id)}
                        data-testid={`button-duplicate-form-${form.id}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Archive"
                        onClick={() => {
                          if (confirm(`Archive "${form.name}"?`)) archiveMutation.mutate(form.id);
                        }}
                        data-testid={`button-archive-form-${form.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Create Form Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Form Name</Label>
              <Input
                placeholder="e.g. New Patient Intake"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && newName.trim() && createMutation.mutate({ name: newName, category: newCategory })}
                data-testid="input-new-form-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger data-testid="select-new-form-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({ name: newName, category: newCategory })}
              disabled={!newName.trim() || createMutation.isPending}
              data-testid="button-confirm-create-form">
              {createMutation.isPending ? "Creating..." : "Create Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Form Builder View ────────────────────────────────────────────────────────

function FormBuilderView({ formId, onBack }: { formId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("fields");
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  const { data: form, isLoading } = useQuery<IntakeForm>({
    queryKey: ["/api/intake-forms", formId],
    queryFn: () => fetch(`/api/intake-forms/${formId}`).then(r => r.json()),
  });

  const updateFormMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/intake-forms/${formId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] }),
  });

  const addFieldMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/intake-forms/${formId}/fields`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: number; data: any }) =>
      apiRequest("PUT", `/api/intake-forms/${formId}/fields/${fieldId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] }),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: number) => apiRequest("DELETE", `/api/intake-forms/${formId}/fields/${fieldId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] });
      setSelectedFieldId(null);
    },
  });

  const addSectionMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/intake-forms/${formId}/sections`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] }),
  });

  const publishMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/intake-forms/${formId}/publish`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      setShowPublishDialog(false);
      toast({ title: "Form published — link is now active" });
    },
    onError: () => toast({ title: "Failed to publish", variant: "destructive" }),
  });

  const deactivatePubMutation = useMutation({
    mutationFn: ({ pubId }: { pubId: number }) =>
      apiRequest("PUT", `/api/intake-forms/${formId}/publications/${pubId}`, { status: "inactive" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      toast({ title: "Link deactivated" });
    },
  });

  const activePublication = form?.publications?.find(p => p.status === "active");
  const publicUrl = activePublication
    ? `${window.location.origin}/f/${activePublication.publicToken}`
    : null;

  const selectedField = form?.fields?.find(f => f.id === selectedFieldId) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!form) return null;

  const sortedFields = [...(form.fields ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-to-forms">
            <ChevronDown className="h-4 w-4 rotate-90" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{form.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[form.status] ?? ""}`}>
                {form.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Form Builder · v{form.version}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {publicUrl && (
            <Button size="sm" variant="outline"
              onClick={() => window.open(publicUrl, "_blank")}
              data-testid="button-preview-form">
              <Eye className="h-3 w-3 mr-1.5" /> Preview
            </Button>
          )}
          <Button size="sm"
            onClick={() => setShowPublishDialog(true)}
            data-testid="button-publish-form">
            <Globe className="h-3 w-3 mr-1.5" />
            {activePublication ? "Manage Link" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Field list */}
        <div className="w-64 border-r flex flex-col bg-muted/20">
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fields</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" title="Add section"
                onClick={() => addSectionMutation.mutate({ title: "New Section" })}
                data-testid="button-add-section">
                <Tag className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sortedFields.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">No fields yet. Add one below.</p>
              )}
              {sortedFields.map(field => (
                <button
                  key={field.id}
                  onClick={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-md text-sm flex items-center gap-2 transition-colors
                    ${selectedFieldId === field.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted"}`}
                  data-testid={`button-select-field-${field.id}`}>
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate flex-1">{field.label}</span>
                  {(field.layoutJson as any)?.columnWidth && (field.layoutJson as any).columnWidth !== "full" && (
                    <span className="text-[10px] text-muted-foreground bg-muted rounded px-1 flex-shrink-0">
                      {(field.layoutJson as any).columnWidth === "half" ? "1/2" : "1/3"}
                    </span>
                  )}
                  {field.isRequired && <span className="text-red-500 text-xs flex-shrink-0">*</span>}
                </button>
              ))}
            </div>
          </ScrollArea>
          <div className="p-2 border-t">
            <Select
              value=""
              onValueChange={(type) => addFieldMutation.mutate({ fieldType: type, label: FIELD_TYPES.find(t => t.value === type)?.label ?? "New Field" })}>
              <SelectTrigger className="text-xs" data-testid="select-add-field-type">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Add field..." />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Center + Right: Tabs */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="mx-4 mt-3 w-auto justify-start h-auto p-1">
              <TabsTrigger value="fields" data-testid="tab-builder">Builder</TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
              <TabsTrigger value="submissions" data-testid="tab-submissions">Submissions</TabsTrigger>
            </TabsList>

            {/* Builder tab */}
            <TabsContent value="fields" className="flex-1 overflow-hidden flex m-0 mt-3">
              <div className="flex-1 overflow-auto p-4">
                {selectedField ? (
                  <FieldEditor
                    field={selectedField}
                    onUpdate={(data) => updateFieldMutation.mutate({ fieldId: selectedField.id, data })}
                    onDelete={() => deleteFieldMutation.mutate(selectedField.id)}
                    isPending={updateFieldMutation.isPending}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-muted-foreground">
                    <Edit3 className="h-10 w-10 opacity-30" />
                    <p className="font-medium">Select a field to edit</p>
                    <p className="text-sm">or add a new field from the left panel</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Settings tab */}
            <TabsContent value="settings" className="flex-1 overflow-auto m-0 mt-0 p-4">
              <FormSettingsPanel form={form} onUpdate={(data) => updateFormMutation.mutate(data)} />
            </TabsContent>

            {/* Submissions tab */}
            <TabsContent value="submissions" className="flex-1 overflow-auto m-0 mt-0 p-4">
              <FormSubmissionsPanel formId={formId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Publish Dialog */}
      <PublishDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        publicUrl={publicUrl}
        publication={activePublication ?? null}
        onPublish={() => publishMutation.mutate({ mode: "link" })}
        onDeactivate={() => activePublication && deactivatePubMutation.mutate({ pubId: activePublication.id })}
        isPending={publishMutation.isPending}
      />
    </div>
  );
}

// ─── Field Editor ─────────────────────────────────────────────────────────────

function FieldEditor({ field, onUpdate, onDelete, isPending }: {
  field: FormField;
  onUpdate: (data: any) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [local, setLocal] = useState({ ...field });
  const [optionsText, setOptionsText] = useState(
    Array.isArray(field.optionsJson) ? field.optionsJson.join("\n") : ""
  );
  const [syncDomain, setSyncDomain] = useState(
    (field.syncConfigJson as any)?.domain ?? "none"
  );
  const [columnWidth, setColumnWidth] = useState<string>(
    (field.layoutJson as any)?.columnWidth ?? "full"
  );

  useEffect(() => {
    setLocal({ ...field });
    setOptionsText(Array.isArray(field.optionsJson) ? field.optionsJson.join("\n") : "");
    setSyncDomain((field.syncConfigJson as any)?.domain ?? "none");
    setColumnWidth((field.layoutJson as any)?.columnWidth ?? "full");
  }, [field.id]);

  const hasOptions = ["single_choice", "multi_choice", "dropdown"].includes(local.fieldType);

  const handleSave = () => {
    const data: any = {
      label: local.label,
      helpText: local.helpText,
      placeholder: local.placeholder,
      isRequired: local.isRequired,
      fieldType: local.fieldType,
      layoutJson: { columnWidth },
    };
    if (hasOptions) {
      data.optionsJson = optionsText.split("\n").map(s => s.trim()).filter(Boolean);
    }
    if (syncDomain && syncDomain !== "none") {
      data.syncConfigJson = { domain: syncDomain, mode: "append" };
    } else {
      data.syncConfigJson = null;
    }
    onUpdate(data);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold">Edit Field</h3>
        <Button size="sm" variant="ghost" className="text-destructive"
          onClick={() => { if (confirm("Delete this field?")) onDelete(); }}
          data-testid="button-delete-field">
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Field Type</Label>
          <Select
            value={local.fieldType}
            onValueChange={(v) => setLocal(prev => ({ ...prev, fieldType: v }))}>
            <SelectTrigger data-testid="select-field-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Label / Question</Label>
          <Input
            value={local.label}
            onChange={e => setLocal(prev => ({ ...prev, label: e.target.value }))}
            data-testid="input-field-label"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Help Text <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            value={local.helpText ?? ""}
            onChange={e => setLocal(prev => ({ ...prev, helpText: e.target.value }))}
            placeholder="Additional instruction for the patient"
            data-testid="input-field-help"
          />
        </div>

        {!["heading", "paragraph", "signature"].includes(local.fieldType) && (
          <div className="space-y-1.5">
            <Label>Placeholder</Label>
            <Input
              value={local.placeholder ?? ""}
              onChange={e => setLocal(prev => ({ ...prev, placeholder: e.target.value }))}
              data-testid="input-field-placeholder"
            />
          </div>
        )}

        {hasOptions && (
          <div className="space-y-1.5">
            <Label>Options <span className="text-muted-foreground">(one per line)</span></Label>
            <Textarea
              value={optionsText}
              onChange={e => setOptionsText(e.target.value)}
              rows={6}
              placeholder={"Option A\nOption B\nOption C"}
              data-testid="textarea-field-options"
            />
          </div>
        )}

        <div className="flex items-center justify-between py-2 border-t">
          <Label className="cursor-pointer">Required field</Label>
          <Switch
            checked={local.isRequired}
            onCheckedChange={v => setLocal(prev => ({ ...prev, isRequired: v }))}
            data-testid="switch-field-required"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Column Width</Label>
          <p className="text-xs text-muted-foreground">Place multiple fields side-by-side on the same row</p>
          <div className="flex gap-1.5">
            {([
              { value: "full", label: "Full" },
              { value: "half", label: "1/2" },
              { value: "third", label: "1/3" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setColumnWidth(opt.value)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  columnWidth === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:text-foreground"
                }`}
                data-testid={`button-col-width-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label>Sync to Patient Chart</Label>
          <p className="text-xs text-muted-foreground">Automatically populate chart fields when a submission is synced</p>
          <Select value={syncDomain} onValueChange={setSyncDomain}>
            <SelectTrigger data-testid="select-sync-domain">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYNC_DOMAINS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={isPending} data-testid="button-save-field">
          {isPending ? "Saving..." : "Save Field"}
        </Button>
      </div>
    </div>
  );
}

// ─── Form Settings Panel ──────────────────────────────────────────────────────

function FormSettingsPanel({ form, onUpdate }: { form: IntakeForm; onUpdate: (data: any) => void }) {
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [category, setCategory] = useState(form.category);
  const [requiresSig, setRequiresSig] = useState(form.requiresPatientSignature);
  const { toast } = useToast();

  const handleSave = () => {
    onUpdate({ name, description: description || null, category, requiresPatientSignature: requiresSig });
    toast({ title: "Settings saved" });
  };

  return (
    <div className="max-w-xl space-y-5">
      <h3 className="font-semibold">Form Settings</h3>

      <div className="space-y-1.5">
        <Label>Form Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} data-testid="input-form-name-settings" />
      </div>

      <div className="space-y-1.5">
        <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Brief description shown to patients..."
          data-testid="textarea-form-description"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger data-testid="select-form-category-settings">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between py-2 border-t">
        <div>
          <Label>Require Patient Signature</Label>
          <p className="text-xs text-muted-foreground">Adds a signature field at the end of the form</p>
        </div>
        <Switch
          checked={requiresSig}
          onCheckedChange={setRequiresSig}
          data-testid="switch-require-signature"
        />
      </div>

      <Button onClick={handleSave} data-testid="button-save-settings">Save Settings</Button>
    </div>
  );
}

// ─── Form Submissions Panel ───────────────────────────────────────────────────

interface Submission {
  id: number;
  formId: number;
  patientId: number | null;
  submitterName: string | null;
  submitterEmail: string | null;
  status: string;
  reviewStatus: string;
  syncStatus: string;
  submittedAt: string;
}

function FormSubmissionsPanel({ formId }: { formId: number }) {
  const { toast } = useToast();
  const [selectedSub, setSelectedSub] = useState<number | null>(null);

  const { data: pending = [], isLoading } = useQuery<Submission[]>({
    queryKey: ["/api/form-submissions/pending"],
    queryFn: () => fetch("/api/form-submissions/pending").then(r => r.json()),
  });

  const formSubmissions = pending.filter(s => s.formId === formId);

  const { data: subDetail } = useQuery({
    queryKey: ["/api/form-submissions", selectedSub],
    queryFn: () => fetch(`/api/form-submissions/${selectedSub}`).then(r => r.json()),
    enabled: !!selectedSub,
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/form-submissions/${id}/sync`, {}),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/form-submissions/pending"] });
      const added = result.results?.filter((r: any) => !r.duplicate).length ?? 0;
      const skipped = result.results?.filter((r: any) => r.duplicate).length ?? 0;
      toast({ title: `Synced to chart: ${added} added, ${skipped} duplicates skipped` });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PUT", `/api/form-submissions/${id}/review`, { reviewStatus: status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/form-submissions/pending"] });
    },
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><RefreshCw className="h-4 w-4 animate-spin" /> Loading...</div>;

  if (formSubmissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <Inbox className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">No submissions yet</p>
        <p className="text-sm text-muted-foreground">Share the form link to start receiving responses</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <h3 className="font-semibold">Pending Submissions</h3>
      {formSubmissions.map(sub => (
        <Card key={sub.id} data-testid={`card-submission-${sub.id}`}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{sub.submitterName ?? "Anonymous"}</span>
                  {sub.submitterEmail && <span className="text-xs text-muted-foreground">{sub.submitterEmail}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <SubmissionStatusBadge status={sub.reviewStatus} type="review" />
                  <SubmissionStatusBadge status={sub.syncStatus} type="sync" />
                  <span className="text-xs text-muted-foreground">{new Date(sub.submittedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => setSelectedSub(sub.id === selectedSub ? null : sub.id)}
                  data-testid={`button-view-submission-${sub.id}`}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> {selectedSub === sub.id ? "Hide" : "View"}
                </Button>
                {sub.syncStatus !== "synced" && (
                  <Button size="sm" onClick={() => syncMutation.mutate(sub.id)}
                    disabled={syncMutation.isPending}
                    data-testid={`button-sync-submission-${sub.id}`}>
                    <Send className="h-3.5 w-3.5 mr-1" /> Sync to Chart
                  </Button>
                )}
                {sub.reviewStatus === "pending" && (
                  <Button size="sm" variant="outline"
                    onClick={() => reviewMutation.mutate({ id: sub.id, status: "reviewed" })}
                    data-testid={`button-mark-reviewed-${sub.id}`}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Reviewed
                  </Button>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {selectedSub === sub.id && subDetail && (
              <div className="mt-4 border-t pt-4 space-y-3">
                {subDetail.fields?.map((field: FormField) => {
                  const value = (subDetail.rawSubmissionJson as any)?.[field.fieldKey];
                  if (value === undefined || value === null || value === "") return null;
                  return (
                    <div key={field.id}>
                      <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                      <p className="text-sm mt-0.5">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </p>
                    </div>
                  );
                })}
                {subDetail.syncEvents?.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Sync Log</p>
                    <div className="space-y-1">
                      {subDetail.syncEvents.map((e: any) => (
                        <div key={e.id} className="text-xs flex items-center gap-2">
                          {e.resultStatus === "success"
                            ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                            : <AlertCircle className="h-3 w-3 text-amber-500" />}
                          <span className="text-muted-foreground">{e.targetDomain}:</span>
                          <span>{(e.detailsJson as any)?.item}</span>
                          {e.duplicateDetected && <Badge variant="outline" className="text-xs">duplicate</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SubmissionStatusBadge({ status, type }: { status: string; type: "review" | "sync" }) {
  if (type === "review") {
    if (status === "reviewed") return <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Reviewed</Badge>;
    return <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400"><Clock className="h-2.5 w-2.5 mr-1" />Pending Review</Badge>;
  }
  if (status === "synced") return <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Synced</Badge>;
  if (status === "not_synced") return <Badge variant="outline" className="text-xs text-muted-foreground"><AlertCircle className="h-2.5 w-2.5 mr-1" />Not Synced</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

// ─── Publish Dialog ───────────────────────────────────────────────────────────

function PublishDialog({ open, onOpenChange, publicUrl, publication, onPublish, onDeactivate, isPending }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  publicUrl: string | null;
  publication: FormPublication | null;
  onPublish: () => void;
  onDeactivate: () => void;
  isPending: boolean;
}) {
  const { toast } = useToast();

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      toast({ title: "Link copied to clipboard" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Form</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {publicUrl ? (
            <>
              <div className="flex items-center gap-1.5 p-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-700 dark:text-green-300 font-medium">Form is live</span>
              </div>
              <div className="space-y-1.5">
                <Label>Public Link</Label>
                <div className="flex gap-2">
                  <Input value={publicUrl} readOnly className="font-mono text-xs" data-testid="input-public-link" />
                  <Button size="icon" variant="outline" onClick={handleCopy} title="Copy link" data-testid="button-copy-link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => window.open(publicUrl, "_blank")} title="Open in tab" data-testid="button-open-link">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Close</Button>
                <Button variant="outline" className="flex-1 text-destructive"
                  onClick={onDeactivate} data-testid="button-deactivate-link">
                  Deactivate Link
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Publishing will generate a shareable public link. Patients can open it without logging in and submit the form.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">A unique token URL will be generated at <code>/f/[token]</code></span>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={onPublish} disabled={isPending} data-testid="button-confirm-publish">
                  <Globe className="h-3.5 w-3.5 mr-1.5" />
                  {isPending ? "Publishing..." : "Publish Form"}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
