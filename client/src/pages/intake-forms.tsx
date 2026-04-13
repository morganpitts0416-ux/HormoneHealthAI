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
  LayoutList, Edit3, Globe, Send, RefreshCw, Inbox, Zap, UserRoundSearch, ArrowRightLeft
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
  smartFieldKey: string | null;
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

interface SmartFieldDef {
  key: string;
  label: string;
  fieldType: string;
  placeholder: string;
  category: "demographics" | "clinical";
  syncTarget: string;
  helpText?: string;
  optionsJson?: string[];
  isRequired?: boolean;
}

const SMART_FIELDS: SmartFieldDef[] = [
  { key: "patient_first_name", label: "First Name", fieldType: "short_text", placeholder: "First name", category: "demographics", syncTarget: "patient.firstName", isRequired: true },
  { key: "patient_last_name", label: "Last Name", fieldType: "short_text", placeholder: "Last name", category: "demographics", syncTarget: "patient.lastName", isRequired: true },
  { key: "patient_dob", label: "Date of Birth", fieldType: "date", placeholder: "MM/DD/YYYY", category: "demographics", syncTarget: "patient.dateOfBirth" },
  { key: "patient_gender", label: "Gender", fieldType: "dropdown", placeholder: "Select gender", category: "demographics", syncTarget: "patient.gender", optionsJson: ["Male", "Female", "Non-binary", "Other", "Prefer not to say"] },
  { key: "patient_email", label: "Email Address", fieldType: "email", placeholder: "patient@example.com", category: "demographics", syncTarget: "patient.email" },
  { key: "patient_phone", label: "Phone Number", fieldType: "phone", placeholder: "(555) 000-0000", category: "demographics", syncTarget: "patient.phone" },
  { key: "patient_address", label: "Address", fieldType: "short_text", placeholder: "Street, City, State ZIP", category: "demographics", syncTarget: "patient.address" },
  { key: "current_medications", label: "Current Medications", fieldType: "medication_list", placeholder: "List each medication, dosage, and frequency", category: "clinical", syncTarget: "chart.currentMedications", helpText: "Enter each medication on a new line" },
  { key: "allergies", label: "Allergies", fieldType: "long_text", placeholder: "List any known allergies (medications, foods, environmental)", category: "clinical", syncTarget: "chart.allergies", helpText: "Include the type of reaction if known" },
  { key: "medical_history", label: "Medical History", fieldType: "long_text", placeholder: "List any past or current medical conditions", category: "clinical", syncTarget: "chart.medicalHistory", helpText: "Include diagnoses, chronic conditions, and hospitalizations" },
  { key: "surgical_history", label: "Surgical History", fieldType: "long_text", placeholder: "List any past surgeries with approximate dates", category: "clinical", syncTarget: "chart.surgicalHistory" },
  { key: "family_history", label: "Family History", fieldType: "long_text", placeholder: "List significant family medical history", category: "clinical", syncTarget: "chart.familyHistory", helpText: "Include relationship and condition (e.g., Mother - Diabetes)" },
  { key: "social_history", label: "Social History", fieldType: "long_text", placeholder: "Tobacco, alcohol, exercise, occupation, etc.", category: "clinical", syncTarget: "chart.socialHistory" },
];

const SMART_FIELD_CATEGORIES = [
  { key: "demographics", label: "Demographics", description: "Auto-link to patient profile" },
  { key: "clinical", label: "Clinical History", description: "Auto-link to patient chart" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  archived: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

// ─── Form List Page ───────────────────────────────────────────────────────────

function SmartFieldPalette({ existingSmartKeys, onAdd }: {
  existingSmartKeys: string[];
  onAdd: (sf: SmartFieldDef) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-full text-xs"
        onClick={() => setOpen(true)}
        data-testid="button-open-smart-fields"
      >
        <Zap className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
        Add Smart Field
      </Button>
    );
  }

  return (
    <div className="rounded-md border bg-blue-50/50 dark:bg-blue-950/20 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
          <Zap className="h-3 w-3" /> Smart Fields
        </span>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      {SMART_FIELD_CATEGORIES.map(cat => {
        const fields = SMART_FIELDS.filter(f => f.category === cat.key);
        return (
          <div key={cat.key}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{cat.label}</p>
            <div className="space-y-0.5">
              {fields.map(sf => {
                const alreadyAdded = existingSmartKeys.includes(sf.key);
                return (
                  <button
                    key={sf.key}
                    disabled={alreadyAdded}
                    onClick={() => { onAdd(sf); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                      alreadyAdded
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    }`}
                    data-testid={`button-add-smart-${sf.key}`}
                  >
                    <Link2 className="h-3 w-3 text-blue-500 flex-shrink-0" />
                    <span className="flex-1">{sf.label}</span>
                    {alreadyAdded && <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

// ─── Field Type Icons ─────────────────────────────────────────────────────────

function getFieldTypeIcon(type: string) {
  const iconMap: Record<string, any> = {
    short_text: "Aa",
    long_text: "Pg",
    number: "#",
    email: "@",
    phone: "Ph",
    date: "Cal",
    single_choice: "Rad",
    multi_choice: "Chk",
    dropdown: "Sel",
    yes_no: "Y/N",
    scale: "Scl",
    signature: "Sig",
    heading: "H",
    paragraph: "P",
    medication_list: "Rx",
    symptom_checklist: "Sx",
  };
  return iconMap[type] ?? "?";
}

// ─── Live Form Preview ───────────────────────────────────────────────────────

function FieldPreview({ field, isSelected, onClick }: { field: FormField; isSelected: boolean; onClick: () => void }) {
  const options = Array.isArray(field.optionsJson) ? field.optionsJson : [];
  const scaleOpts = (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson))
    ? field.optionsJson as { min?: number; max?: number; step?: number; labels?: { low?: string; high?: string } }
    : { min: 1, max: 5, step: 1 };

  const renderInput = () => {
    switch (field.fieldType) {
      case "heading":
        return <h3 className="text-base font-semibold text-foreground">{field.label}</h3>;
      case "paragraph":
        return <p className="text-sm text-muted-foreground">{field.helpText || field.placeholder || "Instructions will appear here..."}</p>;
      case "short_text":
      case "email":
      case "phone":
        return <Input disabled placeholder={field.placeholder ?? ""} className="bg-muted/30" />;
      case "long_text":
        return <Textarea disabled placeholder={field.placeholder ?? ""} className="bg-muted/30" rows={3} />;
      case "number":
        return <Input disabled type="number" placeholder={field.placeholder ?? "0"} className="bg-muted/30 max-w-[200px]" />;
      case "date":
        return <Input disabled type="date" className="bg-muted/30 max-w-[220px]" />;
      case "single_choice":
        return (
          <div className="space-y-2">
            {options.length > 0 ? options.map((opt: string, i: number) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded-full border border-border flex-shrink-0" />
                {opt}
              </label>
            )) : <span className="text-xs text-muted-foreground italic">No options defined</span>}
          </div>
        );
      case "multi_choice":
        return (
          <div className="space-y-2">
            {options.length > 0 ? options.map((opt: string, i: number) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded-md border border-border flex-shrink-0" />
                {opt}
              </label>
            )) : <span className="text-xs text-muted-foreground italic">No options defined</span>}
          </div>
        );
      case "dropdown":
        return (
          <div className="max-w-[280px]">
            <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30 text-sm text-muted-foreground">
              <span>{field.placeholder || "Select..."}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </div>
          </div>
        );
      case "yes_no":
        return (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><span className="h-4 w-4 rounded-full border border-border" /> Yes</label>
            <label className="flex items-center gap-2 text-sm"><span className="h-4 w-4 rounded-full border border-border" /> No</label>
          </div>
        );
      case "scale": {
        const min = scaleOpts.min ?? 1;
        const max = scaleOpts.max ?? 5;
        const labels = scaleOpts.labels;
        const steps = [];
        for (let i = min; i <= max; i++) steps.push(i);
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {steps.map(n => (
                <span key={n} className="w-9 h-9 rounded-md border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/30">{n}</span>
              ))}
            </div>
            {labels && (
              <div className="flex justify-between text-[11px] text-muted-foreground px-1">
                <span>{labels.low ?? ""}</span>
                <span>{labels.high ?? ""}</span>
              </div>
            )}
          </div>
        );
      }
      case "signature":
        return (
          <div className="border-2 border-dashed border-border rounded-md h-20 flex items-center justify-center text-sm text-muted-foreground bg-muted/10">
            Sign here
          </div>
        );
      case "medication_list":
        return (
          <div className="space-y-1.5">
            <div className="border rounded-md p-2 bg-muted/30 text-sm text-muted-foreground">{field.placeholder || "Medication name, dosage, frequency"}</div>
            <button type="button" className="text-xs text-primary font-medium">+ Add medication</button>
          </div>
        );
      case "symptom_checklist":
        return (
          <div className="space-y-2">
            {options.length > 0 ? options.map((opt: string, i: number) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded-md border border-border flex-shrink-0" />
                {opt}
              </label>
            )) : <span className="text-xs text-muted-foreground italic">No symptom items defined</span>}
          </div>
        );
      default:
        return <Input disabled placeholder={field.placeholder ?? ""} className="bg-muted/30" />;
    }
  };

  const isDecorative = ["heading", "paragraph"].includes(field.fieldType);

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg p-4 transition-all border-2 ${
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-transparent hover:border-border hover:bg-muted/20"
      }`}
      data-testid={`preview-field-${field.id}`}
    >
      {!isDecorative && (
        <label className="block text-sm font-medium mb-1.5">
          {field.label}
          {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {!isDecorative && field.helpText && (
        <p className="text-xs text-muted-foreground mb-2">{field.helpText}</p>
      )}
      {renderInput()}
    </div>
  );
}

// ─── Form Builder View ────────────────────────────────────────────────────────

function FormBuilderView({ formId, onBack }: { formId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("fields");
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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

  const reorderMutation = useMutation({
    mutationFn: (fieldIds: number[]) => apiRequest("PUT", `/api/intake-forms/${formId}/fields/reorder`, { fieldIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] }),
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

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const newOrder = [...sortedFields];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    reorderMutation.mutate(newOrder.map(f => f.id));
    setDragIdx(null);
  };

  const addSmartField = (sf: SmartFieldDef) => {
    const chartDomainMap: Record<string, string> = {
      "chart.currentMedications": "medications",
      "chart.allergies": "allergies",
      "chart.medicalHistory": "medical_history",
      "chart.surgicalHistory": "surgical_history",
      "chart.familyHistory": "family_history",
      "chart.socialHistory": "social_history",
    };
    addFieldMutation.mutate({
      fieldType: sf.fieldType,
      label: sf.label,
      smartFieldKey: sf.key,
      placeholder: sf.placeholder,
      helpText: sf.helpText || null,
      isRequired: sf.isRequired || false,
      optionsJson: sf.optionsJson || null,
      syncConfigJson: chartDomainMap[sf.syncTarget]
        ? { domain: chartDomainMap[sf.syncTarget], mode: "append", smartTarget: sf.syncTarget }
        : { domain: "none", smartTarget: sf.syncTarget },
    });
  };

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
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto p-1">
              <TabsTrigger value="fields" data-testid="tab-builder" className="text-xs">Builder</TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings" className="text-xs">Settings</TabsTrigger>
              <TabsTrigger value="submissions" data-testid="tab-submissions" className="text-xs">Submissions</TabsTrigger>
            </TabsList>
          </Tabs>
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

      {/* Non-builder tabs */}
      {activeTab === "settings" && (
        <div className="flex-1 overflow-auto p-6">
          <FormSettingsPanel form={form} onUpdate={(data) => updateFormMutation.mutate(data)} />
        </div>
      )}
      {activeTab === "submissions" && (
        <div className="flex-1 overflow-auto p-6">
          <FormSubmissionsPanel formId={formId} />
        </div>
      )}

      {/* Builder: Three-panel layout */}
      {activeTab === "fields" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Field list sidebar */}
          <div className="w-60 border-r flex flex-col bg-muted/20">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fields ({sortedFields.length})</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-1.5 space-y-0.5">
                {sortedFields.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-4 text-center">No fields yet. Add one below.</p>
                )}
                {sortedFields.map((field, idx) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onClick={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors select-none
                      ${selectedFieldId === field.id
                        ? "bg-primary/10 text-primary font-medium ring-1 ring-primary/30"
                        : "hover:bg-muted"}`}
                    data-testid={`button-select-field-${field.id}`}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0 cursor-grab" />
                    <span className="w-6 h-5 rounded text-[10px] font-mono flex items-center justify-center bg-muted text-muted-foreground flex-shrink-0">
                      {getFieldTypeIcon(field.fieldType)}
                    </span>
                    <span className="truncate flex-1">{field.label}</span>
                    {field.smartFieldKey && (
                      <span className="text-[9px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded px-1 flex-shrink-0">
                        {SMART_FIELDS.find(s => s.key === field.smartFieldKey)?.category === "demographics" ? "ID" : "Rx"}
                      </span>
                    )}
                    {field.isRequired && <span className="text-red-500 text-[10px] flex-shrink-0">*</span>}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-2 border-t space-y-1.5">
              <Select
                value="placeholder_add"
                onValueChange={(type) => {
                  if (type !== "placeholder_add") addFieldMutation.mutate({ fieldType: type, label: FIELD_TYPES.find(t => t.value === type)?.label ?? "New Field" });
                }}>
                <SelectTrigger className="text-xs" data-testid="select-add-field-type">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <SelectValue placeholder="Add field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder_add" disabled>Choose type...</SelectItem>
                  {FIELD_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <SmartFieldPalette
                existingSmartKeys={(form?.fields ?? []).map(f => f.smartFieldKey).filter(Boolean) as string[]}
                onAdd={addSmartField}
              />
            </div>
          </div>

          {/* Center: Live form preview */}
          <div className="flex-1 overflow-auto bg-muted/10">
            <div className="max-w-2xl mx-auto py-6 px-4">
              <div className="rounded-xl border bg-background shadow-sm">
                <div className="px-6 py-5 border-b">
                  <h2 className="text-lg font-semibold">{form.name}</h2>
                  {form.description && <p className="text-sm text-muted-foreground mt-1">{form.description}</p>}
                </div>
                <div className="p-6">
                  {sortedFields.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                      <LayoutList className="h-10 w-10 text-muted-foreground/30" />
                      <p className="font-medium text-muted-foreground">No fields yet</p>
                      <p className="text-sm text-muted-foreground">Add fields from the left panel to build your form</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap -mx-2">
                      {sortedFields.map(field => {
                        const colWidth = (field.layoutJson as any)?.columnWidth ?? "full";
                        const widthClass = colWidth === "half" ? "w-1/2" : colWidth === "third" ? "w-1/3" : "w-full";
                        return (
                          <div key={field.id} className={`${widthClass} px-2 mb-2`}>
                            <FieldPreview
                              field={field}
                              isSelected={selectedFieldId === field.id}
                              onClick={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Field editor (conditional) */}
          {selectedField && (
            <div className="w-80 border-l overflow-auto bg-background">
              <FieldEditor
                field={selectedField}
                onUpdate={(data) => updateFieldMutation.mutate({ fieldId: selectedField.id, data })}
                onDelete={() => deleteFieldMutation.mutate(selectedField.id)}
                isPending={updateFieldMutation.isPending}
              />
            </div>
          )}
        </div>
      )}

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
  const [scaleMin, setScaleMin] = useState<number>(
    (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson)) ? (field.optionsJson as any).min ?? 1 : 1
  );
  const [scaleMax, setScaleMax] = useState<number>(
    (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson)) ? (field.optionsJson as any).max ?? 5 : 5
  );
  const [scaleLowLabel, setScaleLowLabel] = useState<string>(
    (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson)) ? (field.optionsJson as any).labels?.low ?? "" : ""
  );
  const [scaleHighLabel, setScaleHighLabel] = useState<string>(
    (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson)) ? (field.optionsJson as any).labels?.high ?? "" : ""
  );

  useEffect(() => {
    setLocal({ ...field });
    setOptionsText(Array.isArray(field.optionsJson) ? field.optionsJson.join("\n") : "");
    setSyncDomain((field.syncConfigJson as any)?.domain ?? "none");
    setColumnWidth((field.layoutJson as any)?.columnWidth ?? "full");
    const opts = field.optionsJson;
    if (opts && typeof opts === "object" && !Array.isArray(opts)) {
      setScaleMin((opts as any).min ?? 1);
      setScaleMax((opts as any).max ?? 5);
      setScaleLowLabel((opts as any).labels?.low ?? "");
      setScaleHighLabel((opts as any).labels?.high ?? "");
    } else {
      setScaleMin(1); setScaleMax(5); setScaleLowLabel(""); setScaleHighLabel("");
    }
  }, [field.id]);

  const smartDef = field.smartFieldKey ? SMART_FIELDS.find(s => s.key === field.smartFieldKey) : null;
  const isSmart = !!smartDef;
  const hasOptions = ["single_choice", "multi_choice", "dropdown", "symptom_checklist"].includes(local.fieldType);
  const isScale = local.fieldType === "scale";
  const isDecorative = ["heading", "paragraph"].includes(local.fieldType);

  const handleSave = () => {
    const data: any = {
      label: local.label,
      helpText: local.helpText,
      placeholder: local.placeholder,
      isRequired: local.isRequired,
      layoutJson: { columnWidth },
    };
    if (!isSmart) {
      data.fieldType = local.fieldType;
    }
    if (hasOptions && !isSmart) {
      data.optionsJson = optionsText.split("\n").map(s => s.trim()).filter(Boolean);
    }
    if (isScale) {
      data.optionsJson = {
        min: scaleMin,
        max: scaleMax,
        step: 1,
        labels: { low: scaleLowLabel || undefined, high: scaleHighLabel || undefined },
      };
    }
    if (!isSmart) {
      if (syncDomain && syncDomain !== "none") {
        data.syncConfigJson = { domain: syncDomain, mode: "append" };
      } else {
        data.syncConfigJson = null;
      }
    }
    onUpdate(data);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Edit Field</h3>
          {isSmart && (
            <Badge variant="outline" className="text-[10px] py-0 h-5 border-blue-300 text-blue-700 dark:text-blue-300">
              <Zap className="h-2.5 w-2.5 mr-1" />
              Smart
            </Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" className="text-destructive"
          onClick={() => { if (confirm("Delete this field?")) onDelete(); }}
          data-testid="button-delete-field">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isSmart && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2.5 space-y-0.5">
          <p className="text-[11px] font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            Auto-links to: {smartDef.syncTarget.split(".")[1]}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400">
            {smartDef.category === "demographics" ? "Used to identify/create patient." : "Synced to patient chart."}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {!isSmart && (
          <div className="space-y-1">
            <Label className="text-xs">Field Type</Label>
            <Select
              value={local.fieldType}
              onValueChange={(v) => setLocal(prev => ({ ...prev, fieldType: v }))}>
              <SelectTrigger className="text-xs" data-testid="select-field-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {isSmart && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Field Type</Label>
            <Input value={FIELD_TYPES.find(t => t.value === local.fieldType)?.label ?? local.fieldType} disabled className="text-xs" />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">{isDecorative ? "Text Content" : "Label / Question"}</Label>
          <Input
            value={local.label}
            onChange={e => setLocal(prev => ({ ...prev, label: e.target.value }))}
            data-testid="input-field-label"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Help Text <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            value={local.helpText ?? ""}
            onChange={e => setLocal(prev => ({ ...prev, helpText: e.target.value }))}
            placeholder="Additional instruction"
            data-testid="input-field-help"
          />
        </div>

        {!isDecorative && !["signature", "yes_no", "scale"].includes(local.fieldType) && (
          <div className="space-y-1">
            <Label className="text-xs">Placeholder</Label>
            <Input
              value={local.placeholder ?? ""}
              onChange={e => setLocal(prev => ({ ...prev, placeholder: e.target.value }))}
              data-testid="input-field-placeholder"
            />
          </div>
        )}

        {hasOptions && !isSmart && (
          <div className="space-y-1">
            <Label className="text-xs">
              {local.fieldType === "symptom_checklist" ? "Symptom Items" : "Options"} <span className="text-muted-foreground">(one per line)</span>
            </Label>
            <Textarea
              value={optionsText}
              onChange={e => setOptionsText(e.target.value)}
              rows={5}
              placeholder={local.fieldType === "symptom_checklist"
                ? "Fatigue\nInsomnia\nWeight gain\nMood changes"
                : "Option A\nOption B\nOption C"}
              data-testid="textarea-field-options"
            />
          </div>
        )}

        {isScale && (
          <div className="space-y-2">
            <Label className="text-xs">Scale Range</Label>
            <div className="flex gap-2">
              <div className="flex-1 space-y-0.5">
                <span className="text-[10px] text-muted-foreground">Min</span>
                <Input type="number" value={scaleMin} onChange={e => setScaleMin(parseInt(e.target.value) || 0)} className="text-xs" data-testid="input-scale-min" />
              </div>
              <div className="flex-1 space-y-0.5">
                <span className="text-[10px] text-muted-foreground">Max</span>
                <Input type="number" value={scaleMax} onChange={e => setScaleMax(parseInt(e.target.value) || 5)} className="text-xs" data-testid="input-scale-max" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-0.5">
                <span className="text-[10px] text-muted-foreground">Low Label</span>
                <Input value={scaleLowLabel} onChange={e => setScaleLowLabel(e.target.value)} className="text-xs" placeholder="e.g. Poor" data-testid="input-scale-low" />
              </div>
              <div className="flex-1 space-y-0.5">
                <span className="text-[10px] text-muted-foreground">High Label</span>
                <Input value={scaleHighLabel} onChange={e => setScaleHighLabel(e.target.value)} className="text-xs" placeholder="e.g. Excellent" data-testid="input-scale-high" />
              </div>
            </div>
          </div>
        )}

        {!isDecorative && (
          <div className="flex items-center justify-between py-2 border-t">
            <Label className="text-xs cursor-pointer">Required field</Label>
            <Switch
              checked={local.isRequired}
              onCheckedChange={v => setLocal(prev => ({ ...prev, isRequired: v }))}
              data-testid="switch-field-required"
            />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Column Width</Label>
          <div className="flex gap-1">
            {([
              { value: "full", label: "Full" },
              { value: "half", label: "1/2" },
              { value: "third", label: "1/3" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setColumnWidth(opt.value)}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  columnWidth === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border"
                }`}
                data-testid={`button-col-width-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!isSmart && (
          <>
            <Separator />
            <div className="space-y-1">
              <Label className="text-xs">Sync to Patient Chart</Label>
              <Select value={syncDomain} onValueChange={setSyncDomain}>
                <SelectTrigger className="text-xs" data-testid="select-sync-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNC_DOMAINS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={isPending} className="w-full" data-testid="button-save-field">
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
  const [reassignSubId, setReassignSubId] = useState<number | null>(null);
  const [reassignSearch, setReassignSearch] = useState("");

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

  const { data: patients = [] } = useQuery<any[]>({
    queryKey: ["/api/patients"],
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

  const reassignMutation = useMutation({
    mutationFn: ({ subId, patientId }: { subId: number; patientId: number }) =>
      apiRequest("PATCH", `/api/form-submissions/${subId}/reassign`, { patientId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/form-submissions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-submissions", reassignSubId] });
      setReassignSubId(null);
      setReassignSearch("");
      toast({ title: "Submission reassigned" });
    },
    onError: () => toast({ title: "Reassignment failed", variant: "destructive" }),
  });

  const filteredPatients = patients.filter((p: any) => {
    if (!reassignSearch) return true;
    const search = reassignSearch.toLowerCase();
    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(search)
      || (p.email ?? "").toLowerCase().includes(search);
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
                <Button size="sm" variant="outline"
                  onClick={() => { setReassignSubId(sub.id); setReassignSearch(""); }}
                  data-testid={`button-reassign-${sub.id}`}>
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Reassign
                </Button>
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

      <Dialog open={reassignSubId !== null} onOpenChange={(v) => { if (!v) { setReassignSubId(null); setReassignSearch(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Select a patient to reassign this submission to:</p>
            <Input
              placeholder="Search patients..."
              value={reassignSearch}
              onChange={e => setReassignSearch(e.target.value)}
              data-testid="input-reassign-search"
            />
            <ScrollArea className="h-60">
              <div className="space-y-1">
                {filteredPatients.slice(0, 50).map((p: any) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 hover:bg-muted transition-colors"
                    onClick={() => {
                      if (reassignSubId) reassignMutation.mutate({ subId: reassignSubId, patientId: p.id });
                    }}
                    data-testid={`button-reassign-patient-${p.id}`}
                  >
                    <div>
                      <span className="font-medium">{p.firstName} {p.lastName}</span>
                      {p.email && <span className="text-xs text-muted-foreground ml-2">{p.email}</span>}
                    </div>
                    <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
                {filteredPatients.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No patients found</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
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
