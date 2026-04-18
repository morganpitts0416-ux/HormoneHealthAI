import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { RichTextEditor, RichTextView } from "@/components/rich-text-editor";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Plus, Settings, Trash2, Copy, Eye, Link2, ChevronDown, ChevronUp,
  ClipboardList, CheckCircle2, Clock, AlertCircle, GripVertical, Tag,
  LayoutList, Edit3, Globe, Send, RefreshCw, Inbox, Zap, UserRoundSearch, ArrowRightLeft, Code,
  Type, AlignLeft, Hash, Mail, Phone, Calendar, Circle, CheckSquare, List, ToggleLeft,
  Star, PenLine, Heading, AlignJustify, Pill, Activity, ChevronLeft,
  ArrowUp, ArrowDown, Home, X, PanelLeft, SlidersHorizontal, ListChecks, Users
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
  { value: "allergy_list", label: "Allergy List" },
  { value: "medical_history_list", label: "Medical History List" },
  { value: "surgical_history_list", label: "Surgical History List" },
  { value: "family_history_chart", label: "Family History Chart" },
  { value: "symptom_checklist", label: "Symptom Checklist" },
  { value: "matrix", label: "Matrix / Grid Table" },
];

const MATRIX_COLUMN_TYPES = [
  { value: "checkbox", label: "Check Box" },
  { value: "radio", label: "Radio (single per row)" },
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
];

function defaultMatrixConfig() {
  const uid = () => Math.random().toString(36).slice(2, 8);
  return {
    rows: [
      { id: uid(), label: "Row 1" },
      { id: uid(), label: "Row 2" },
      { id: uid(), label: "Row 3" },
    ],
    columns: [
      { id: uid(), header: "YES", fieldType: "checkbox", placeholder: "" },
      { id: uid(), header: "NO", fieldType: "checkbox", placeholder: "" },
      { id: uid(), header: "Notes", fieldType: "text", placeholder: "" },
    ],
  };
}

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
  { key: "patient_preferred_pharmacy", label: "Preferred Pharmacy", fieldType: "short_text", placeholder: "Pharmacy name, address, and phone", category: "demographics", syncTarget: "patient.preferredPharmacy", helpText: "Where should we send your prescriptions?" },
  { key: "current_medications", label: "Current Medications", fieldType: "medication_list", placeholder: "List each medication, dosage, and frequency", category: "clinical", syncTarget: "chart.currentMedications", helpText: "Enter each medication on a new line" },
  { key: "allergies", label: "Allergies", fieldType: "allergy_list", placeholder: "Allergy (include reaction type if known)", category: "clinical", syncTarget: "chart.allergies", helpText: "Add each allergy individually" },
  { key: "medical_history", label: "Medical History", fieldType: "medical_history_list", placeholder: "Condition or diagnosis", category: "clinical", syncTarget: "chart.medicalHistory", helpText: "Add each condition individually" },
  { key: "surgical_history", label: "Surgical History", fieldType: "surgical_history_list", placeholder: "Surgery name and approximate date", category: "clinical", syncTarget: "chart.surgicalHistory", helpText: "Add each surgery individually" },
  { key: "family_history", label: "Family History", fieldType: "family_history_chart", placeholder: "Medical conditions by family member", category: "clinical", syncTarget: "chart.familyHistory", helpText: "Enter conditions for each family member" },
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
  const [activeFormId, setActiveFormId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("custom");
  const [filterStatus, setFilterStatus] = useState("all");
  const { toast } = useToast();

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const userAdminRole = currentUser?.adminRole;
  const canEditForms = !currentUser?.isStaff || userAdminRole === "owner" || userAdminRole === "admin" || userAdminRole === "limited_admin";

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
        canEdit={canEditForms}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="border-b px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3" style={{ backgroundColor: "#f5f2ed", borderColor: "#d4c9b5" }}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ClipboardList className="h-5 w-5 text-muted-foreground flex-shrink-0 hidden sm:block" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold">Digital Forms</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Build and manage patient intake forms</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-28 sm:w-36" data-testid="select-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Active Forms</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="active">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          {canEditForms && (
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-form" className="hidden sm:inline-flex">
              <Plus className="h-4 w-4 mr-1" /> New Form
            </Button>
          )}
          {canEditForms && (
            <Button size="icon" onClick={() => setShowCreate(true)} data-testid="button-create-form-mobile" className="sm:hidden">
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 p-3 sm:p-6">
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
            <p className="text-sm text-muted-foreground">{canEditForms ? "Create your first intake form to get started" : "No forms have been created for this clinic yet"}</p>
            {canEditForms && (
              <Button onClick={() => setShowCreate(true)} data-testid="button-create-form-empty">
                <Plus className="h-4 w-4 mr-1" /> Create Form
              </Button>
            )}
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
                      <Button size="icon" variant="ghost" title={canEditForms ? "Edit form" : "View form"}
                        onClick={() => setActiveFormId(form.id)}
                        data-testid={`button-edit-form-${form.id}`}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      {canEditForms && (
                        <>
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
                        </>
                      )}
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

// ─── Field Type Icons & Palette ──────────────────────────────────────────────

const FIELD_TYPE_ICONS: Record<string, React.ElementType> = {
  short_text: Type,
  long_text: AlignLeft,
  number: Hash,
  email: Mail,
  phone: Phone,
  date: Calendar,
  single_choice: Circle,
  multi_choice: CheckSquare,
  dropdown: List,
  yes_no: ToggleLeft,
  scale: Star,
  signature: PenLine,
  heading: Heading,
  paragraph: AlignJustify,
  medication_list: Pill,
  allergy_list: Pill,
  medical_history_list: ListChecks,
  surgical_history_list: ListChecks,
  family_history_chart: Users,
  symptom_checklist: Activity,
  matrix: ListChecks,
};

function getFieldTypeIcon(type: string) {
  const IconComp = FIELD_TYPE_ICONS[type];
  if (IconComp) return <IconComp className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

// ─── Clickable Field Type Palette ─────────────────────────────────────────────

const FIELD_PALETTE_GROUPS = [
  {
    label: "Basic",
    types: ["short_text", "long_text", "number", "email", "phone", "date"],
  },
  {
    label: "Choice",
    types: ["single_choice", "multi_choice", "dropdown", "yes_no", "scale"],
  },
  {
    label: "Clinical",
    types: ["medication_list", "allergy_list", "medical_history_list", "surgical_history_list", "family_history_chart", "symptom_checklist"],
  },
  {
    label: "Advanced",
    types: ["matrix"],
  },
  {
    label: "Layout",
    types: ["heading", "paragraph", "signature"],
  },
];

function FieldTypePalette({ onAdd, isAdding }: { onAdd: (type: string) => void; isAdding: boolean }) {
  return (
    <div className="space-y-2">
      {FIELD_PALETTE_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1">{group.label}</p>
          <div className="grid grid-cols-2 gap-1">
            {group.types.map(type => {
              const def = FIELD_TYPES.find(t => t.value === type);
              const IconComp = FIELD_TYPE_ICONS[type] ?? FileText;
              return (
                <button
                  key={type}
                  disabled={isAdding}
                  onClick={() => onAdd(type)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-left hover-elevate border border-border bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  data-testid={`button-add-field-${type}`}
                >
                  <IconComp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{def?.label ?? type}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Live Form Preview ───────────────────────────────────────────────────────

function FieldPreview({ field, isSelected, onClick, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onDragStart, onDragOver, onDragEnd, onDrop, isDragging, isDropTarget }: {
  field: FormField;
  isSelected: boolean;
  onClick: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
}) {
  const options = Array.isArray(field.optionsJson) ? field.optionsJson : [];
  const scaleOpts = (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson))
    ? field.optionsJson as { min?: number; max?: number; step?: number; labels?: { low?: string; high?: string } }
    : { min: 1, max: 5, step: 1 };

  const renderInput = () => {
    switch (field.fieldType) {
      case "heading":
        return (
          <div className="space-y-0.5">
            <RichTextView html={field.label} className="text-base font-semibold text-foreground" />
            {field.helpText && <p className="text-xs text-muted-foreground whitespace-pre-line">{field.helpText}</p>}
          </div>
        );
      case "paragraph":
        return (
          <div className="space-y-1">
            {field.label
              ? <RichTextView html={field.label} className="text-sm text-foreground" />
              : <p className="text-sm text-muted-foreground italic">{field.placeholder || "Instructions will appear here..."}</p>}
            {field.helpText && <p className="text-xs text-muted-foreground whitespace-pre-line">{field.helpText}</p>}
          </div>
        );
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
      case "single_choice": {
        const cols = (field.layoutJson as any)?.optionColumns ?? 1;
        const colClass = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
        return (
          <div className={`grid gap-x-4 gap-y-2 ${colClass}`}>
            {options.length > 0 ? options.map((opt: string, i: number) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded-full border border-border flex-shrink-0" />
                {opt}
              </label>
            )) : <span className="text-xs text-muted-foreground italic">No options defined</span>}
          </div>
        );
      }
      case "multi_choice": {
        const cols = (field.layoutJson as any)?.optionColumns ?? 1;
        const colClass = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
        return (
          <div className={`grid gap-x-4 gap-y-2 ${colClass}`}>
            {options.length > 0 ? options.map((opt: string, i: number) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded-md border border-border flex-shrink-0" />
                {opt}
              </label>
            )) : <span className="text-xs text-muted-foreground italic">No options defined</span>}
          </div>
        );
      }
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
      case "allergy_list":
        return (
          <div className="space-y-1.5">
            <div className="border rounded-md p-2 bg-muted/30 text-sm text-muted-foreground">{field.placeholder || "Allergy (include reaction type)"}</div>
            <button type="button" className="text-xs text-primary font-medium">+ Add allergy</button>
          </div>
        );
      case "medical_history_list":
        return (
          <div className="space-y-1.5">
            <div className="border rounded-md p-2 bg-muted/30 text-sm text-muted-foreground">{field.placeholder || "Condition or diagnosis"}</div>
            <button type="button" className="text-xs text-primary font-medium">+ Add condition</button>
          </div>
        );
      case "surgical_history_list":
        return (
          <div className="space-y-1.5">
            <div className="border rounded-md p-2 bg-muted/30 text-sm text-muted-foreground">{field.placeholder || "Surgery name and date"}</div>
            <button type="button" className="text-xs text-primary font-medium">+ Add surgery</button>
          </div>
        );
      case "family_history_chart":
        return (
          <div className="border rounded-md overflow-hidden text-sm">
            <div className="grid grid-cols-[120px_1fr] bg-muted/40 text-xs font-medium border-b">
              <div className="px-2 py-1.5">Family Member</div>
              <div className="px-2 py-1.5">Medical Conditions</div>
            </div>
            {["Mother", "Father", "Siblings"].map(m => (
              <div key={m} className="grid grid-cols-[120px_1fr] border-b last:border-b-0">
                <div className="px-2 py-1.5 bg-muted/20 text-xs font-medium">{m}</div>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Conditions...</div>
              </div>
            ))}
            <div className="px-2 py-1 text-xs text-muted-foreground">+ 5 more family members</div>
          </div>
        );
      case "symptom_checklist": {
        const ratings = ["None", "Mild", "Moderate", "Severe"];
        return options.length > 0 ? (
          <div className="border rounded-md overflow-hidden text-xs">
            <div className="grid grid-cols-[1fr_auto] bg-muted/40 font-medium border-b">
              <div className="px-3 py-1.5">Symptom</div>
              <div className="px-3 py-1.5">Severity</div>
            </div>
            {options.map((opt: string, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_auto] border-b last:border-b-0">
                <div className="px-3 py-1.5">{opt}</div>
                <div className="px-3 py-1.5 flex items-center gap-1">
                  {ratings.map(r => (
                    <span key={r} className="px-1.5 py-0.5 rounded border border-border text-muted-foreground">{r}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">List symptoms in the Options panel — patients will rate each as None / Mild / Moderate / Severe</span>
        );
      }
      case "matrix": {
        const cfg = (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson))
          ? field.optionsJson as { rows: any[]; columns: any[] }
          : { rows: [], columns: [] };
        const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
        const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
        if (rows.length === 0 || cols.length === 0) {
          return <span className="text-xs text-muted-foreground italic">Matrix has no rows or columns</span>;
        }
        return (
          <div className="border rounded-md overflow-x-auto text-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40 text-xs">
                  <th className="px-2 py-1.5 text-left font-medium border-b w-[180px]">{field.label}</th>
                  {cols.map(c => (
                    <th key={c.id} className="px-2 py-1.5 text-center font-medium border-b border-l">{c.header || "Column"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-2 py-1.5 text-xs font-medium bg-muted/20">{r.label}</td>
                    {cols.map(c => (
                      <td key={c.id} className="px-2 py-1.5 text-center border-l text-xs text-muted-foreground">
                        {c.fieldType === "checkbox" || c.fieldType === "radio"
                          ? <span className={`inline-block h-3.5 w-3.5 border border-border ${c.fieldType === "radio" ? "rounded-full" : "rounded-sm"}`} />
                          : <span className="italic">{c.fieldType}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return <Input disabled placeholder={field.placeholder ?? ""} className="bg-muted/30" />;
    }
  };

  const isDecorative = ["heading", "paragraph"].includes(field.fieldType);

  return (
    <div className="relative group">
      {isDropTarget && <div className="absolute -top-1 left-2 right-2 h-0.5 bg-primary rounded-full z-10" />}
      <div
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        onClick={onClick}
        className={`cursor-pointer rounded-lg p-4 transition-all border-2 ${
          isDragging ? "opacity-40 scale-[0.98]" : ""
        } ${
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : "border-transparent hover:border-border hover:bg-muted/20"
        }`}
        data-testid={`preview-field-${field.id}`}
      >
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center gap-0.5 pt-0.5 invisible group-hover:visible flex-shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
            {onMoveUp && (
              <button
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={!canMoveUp}
                className={`p-0.5 rounded transition-colors ${canMoveUp ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20"}`}
                data-testid={`button-move-up-${field.id}`}
              >
                <ArrowUp className="h-3 w-3" />
              </button>
            )}
            {onMoveDown && (
              <button
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={!canMoveDown}
                className={`p-0.5 rounded transition-colors ${canMoveDown ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20"}`}
                data-testid={`button-move-down-${field.id}`}
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
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
        </div>
      </div>
    </div>
  );
}

// ─── Form Builder View ────────────────────────────────────────────────────────

function FormBuilderView({ formId, onBack, canEdit = true }: { formId: number; onBack: () => void; canEdit?: boolean }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("fields");
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showFieldPalette, setShowFieldPalette] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"preview" | "fields" | "editor">("preview");

  const { data: form, isLoading } = useQuery<IntakeForm>({
    queryKey: ["/api/intake-forms", formId],
    queryFn: () => fetch(`/api/intake-forms/${formId}`).then(r => r.json()),
  });

  const updateFormMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/intake-forms/${formId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] }),
  });

  const addFieldMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/intake-forms/${formId}/fields`, data);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail ?? errBody.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (newField: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms"] });
      if (newField?.id) setSelectedFieldId(newField.id);
    },
    onError: (err: any) => toast({ title: "Failed to add field", description: err?.message ?? "Unknown error", variant: "destructive" }),
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: number; data: any }) =>
      apiRequest("PUT", `/api/intake-forms/${formId}/fields/${fieldId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] }),
    onError: (err: any) => toast({ title: "Failed to update field", description: err?.message ?? "Unknown error", variant: "destructive" }),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: number) => apiRequest("DELETE", `/api/intake-forms/${formId}/fields/${fieldId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] });
      setSelectedFieldId(null);
    },
    onError: (err: any) => toast({ title: "Failed to delete field", description: err?.message ?? "Unknown error", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (fieldIds: number[]) => apiRequest("PUT", `/api/intake-forms/${formId}/fields/reorder`, { fieldIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-forms", formId] }),
    onError: (err: any) => toast({ title: "Failed to reorder fields", description: err?.message ?? "Unknown error", variant: "destructive" }),
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

  const handleDragStart = (idx: number) => { setDragIdx(idx); setDragOverIdx(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null) { setDragIdx(null); setDragOverIdx(null); return; }
    if (dragIdx !== targetIdx) {
      const newOrder = [...sortedFields];
      const [moved] = newOrder.splice(dragIdx, 1);
      newOrder.splice(targetIdx, 0, moved);
      reorderMutation.mutate(newOrder.map(f => f.id));
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const moveField = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= sortedFields.length) return;
    const newOrder = [...sortedFields];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    reorderMutation.mutate(newOrder.map(f => f.id));
  };

  const handlePreviewDragStart = (idx: number) => { setDragIdx(idx); setDragOverIdx(idx); };
  const handlePreviewDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const handlePreviewDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null) { setDragIdx(null); setDragOverIdx(null); return; }
    if (dragIdx !== targetIdx) {
      moveField(dragIdx, targetIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="border-b px-3 sm:px-4 py-2 sm:py-3 space-y-2 flex-shrink-0" style={{ backgroundColor: "#f5f2ed", borderColor: "#d4c9b5" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Button size="sm" variant="ghost" onClick={onBack} className="text-xs text-muted-foreground hidden sm:inline-flex" data-testid="button-back-to-forms">
              <ChevronLeft className="h-3 w-3 mr-1" />
              Forms
            </Button>
            <Button size="icon" variant="ghost" onClick={onBack} className="sm:hidden flex-shrink-0" data-testid="button-back-to-forms-mobile">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground text-sm hidden sm:inline">/</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{form.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[form.status] ?? ""}`}>
                  {form.status}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {publicUrl && (
              <Button size="icon" variant="outline"
                onClick={() => window.open(publicUrl, "_blank")}
                data-testid="button-preview-form"
                className="sm:hidden">
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {publicUrl && (
              <Button size="sm" variant="outline"
                onClick={() => window.open(publicUrl, "_blank")}
                data-testid="button-preview-form-desktop"
                className="hidden sm:inline-flex">
                <Eye className="h-3 w-3 mr-1.5" /> Preview
              </Button>
            )}
            <Button size="sm"
              onClick={() => setShowPublishDialog(true)}
              data-testid="button-publish-form"
              className="hidden sm:inline-flex">
              <Globe className="h-3 w-3 mr-1.5" />
              {activePublication ? "Manage Link" : "Publish"}
            </Button>
            <Button size="icon"
              onClick={() => setShowPublishDialog(true)}
              data-testid="button-publish-form-mobile"
              className="sm:hidden">
              <Globe className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="h-auto p-1 w-full sm:w-auto">
              <TabsTrigger value="fields" data-testid="tab-builder" className="text-xs flex-1 sm:flex-none">Builder</TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings" className="text-xs flex-1 sm:flex-none">Settings</TabsTrigger>
              <TabsTrigger value="submissions" data-testid="tab-submissions" className="text-xs flex-1 sm:flex-none">Submissions</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Non-builder tabs */}
      {activeTab === "settings" && (
        <div className="flex-1 overflow-auto p-3 sm:p-6">
          <FormSettingsPanel form={form} onUpdate={(data) => updateFormMutation.mutate(data)} />
        </div>
      )}
      {activeTab === "submissions" && (
        <div className="flex-1 overflow-auto p-3 sm:p-6">
          <FormSubmissionsPanel formId={formId} />
        </div>
      )}

      {/* Builder: Three-panel layout (responsive) */}
      {activeTab === "fields" && (
        <div className="flex flex-1 overflow-hidden relative min-h-0">
          {/* Mobile bottom toolbar — hidden when overlay panels are active */}
          <div className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background px-2 py-1.5 flex items-center gap-1.5 ${mobilePanel !== "preview" ? "hidden" : ""}`}>
            <Button
              size="sm"
              variant={mobilePanel === "fields" ? "default" : "outline"}
              onClick={() => setMobilePanel(mobilePanel === "fields" ? "preview" : "fields")}
              className="flex-1 text-xs"
              data-testid="button-mobile-fields"
            >
              <PanelLeft className="h-3.5 w-3.5 mr-1" />
              Fields {sortedFields.length > 0 && `(${sortedFields.length})`}
            </Button>
            <Button
              size="sm"
              variant={mobilePanel === "preview" ? "default" : "outline"}
              onClick={() => setMobilePanel("preview")}
              className="flex-1 text-xs"
              data-testid="button-mobile-preview"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              Preview
            </Button>
            {selectedField && (
              <Button
                size="sm"
                variant={mobilePanel === "editor" ? "default" : "outline"}
                onClick={() => setMobilePanel(mobilePanel === "editor" ? "preview" : "editor")}
                className="flex-1 text-xs"
                data-testid="button-mobile-editor"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
          </div>

          {/* Left: Field list sidebar — desktop: always visible, mobile: full-screen overlay */}
          <div className={`${mobilePanel === "fields" ? "flex" : "hidden"} md:flex w-full md:w-64 border-r flex-col bg-muted/20 absolute md:relative inset-0 md:inset-auto z-30 md:z-auto bg-background md:bg-muted/20`}>
            {/* Mobile header with back */}
            <div className="flex md:hidden items-center justify-between px-3 py-2.5 border-b bg-background">
              <span className="text-sm font-semibold">Fields</span>
              <Button size="sm" variant="outline" onClick={() => setMobilePanel("preview")} data-testid="button-close-fields-panel">
                <Eye className="h-3.5 w-3.5 mr-1" /> Preview
              </Button>
            </div>
            {/* Panel header toggle */}
            <div className="flex border-b">
              <button
                onClick={() => setShowFieldPalette(false)}
                className={`flex-1 py-2.5 md:py-2 text-xs font-medium transition-colors ${!showFieldPalette ? "text-foreground border-b-2 border-primary bg-background" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="button-panel-fields"
              >
                Fields {sortedFields.length > 0 && `(${sortedFields.length})`}
              </button>
              <button
                onClick={() => setShowFieldPalette(true)}
                className={`flex-1 py-2.5 md:py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${showFieldPalette ? "text-foreground border-b-2 border-primary bg-background" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="button-panel-add"
              >
                <Plus className="h-3 w-3" /> Add Field
              </button>
            </div>

            {/* Field list */}
            {!showFieldPalette && (
              <>
                <ScrollArea className="flex-1">
                  <div className="p-1.5 space-y-0.5">
                    {sortedFields.length === 0 && (
                      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
                        <LayoutList className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">No fields yet.</p>
                        <button
                          onClick={() => setShowFieldPalette(true)}
                          className="text-xs text-primary font-medium"
                          data-testid="button-start-adding-fields"
                        >
                          + Add your first field
                        </button>
                      </div>
                    )}
                    {sortedFields.map((field, idx) => {
                      const IconComp = FIELD_TYPE_ICONS[field.fieldType] ?? FileText;
                      const isDragging = dragIdx === idx;
                      const isDropTarget = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
                      return (
                        <div key={field.id}>
                          {isDropTarget && (
                            <div className="h-0.5 bg-primary rounded-full mx-2 mb-0.5" />
                          )}
                          <div
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragEnd={handleDragEnd}
                            onDrop={(e) => handleDrop(e, idx)}
                            onClick={() => {
                              setSelectedFieldId(field.id === selectedFieldId ? null : field.id);
                              setMobilePanel("preview");
                            }}
                            className={`flex items-center gap-1.5 px-2 py-2 md:py-1.5 rounded-md text-xs cursor-pointer transition-all select-none
                              ${isDragging ? "opacity-40 scale-95" : ""}
                              ${selectedFieldId === field.id && !isDragging
                                ? "bg-primary/10 text-primary font-medium ring-1 ring-primary/30"
                                : !isDragging ? "hover:bg-muted" : ""}`}
                            data-testid={`button-select-field-${field.id}`}
                          >
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-muted-foreground">
                              <IconComp className="h-3 w-3" />
                            </span>
                            <span className="truncate flex-1">{field.label}</span>
                            {field.smartFieldKey && (
                              <span className="text-[9px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded px-1 flex-shrink-0">
                                {SMART_FIELDS.find(s => s.key === field.smartFieldKey)?.category === "demographics" ? "ID" : "RX"}
                              </span>
                            )}
                            {field.isRequired && <span className="text-destructive text-[10px] flex-shrink-0">*</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                {sortedFields.length > 0 && (
                  <div className="p-2 border-t mb-12 md:mb-0">
                    <SmartFieldPalette
                      existingSmartKeys={(form?.fields ?? []).map(f => f.smartFieldKey).filter(Boolean) as string[]}
                      onAdd={(sf) => { addSmartField(sf); setMobilePanel("preview"); }}
                    />
                  </div>
                )}
              </>
            )}

            {/* Add field palette */}
            {showFieldPalette && (
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3 mb-12 md:mb-0">
                  <FieldTypePalette
                    onAdd={(type) => {
                      const payload: any = {
                        fieldType: type,
                        label: FIELD_TYPES.find(t => t.value === type)?.label ?? "New Field",
                      };
                      if (type === "matrix") {
                        payload.label = "Matrix";
                        payload.optionsJson = defaultMatrixConfig();
                      }
                      addFieldMutation.mutate(payload);
                      setShowFieldPalette(false);
                      setMobilePanel("preview");
                    }}
                    isAdding={addFieldMutation.isPending}
                  />
                  <Separator />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">Smart Fields</p>
                    <SmartFieldPalette
                      existingSmartKeys={(form?.fields ?? []).map(f => f.smartFieldKey).filter(Boolean) as string[]}
                      onAdd={(sf) => { addSmartField(sf); setShowFieldPalette(false); setMobilePanel("preview"); }}
                    />
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Center: Live form preview — always in flow on desktop, conditionally shown on mobile */}
          <div className={`${mobilePanel === "preview" ? "flex" : "hidden"} md:flex flex-1 min-w-0 min-h-0 flex-col overflow-y-auto bg-muted/10 pb-14 md:pb-0`}>
            <div className="max-w-2xl mx-auto py-4 md:py-6 px-3 md:px-4 w-full">
              <div className="rounded-xl border bg-background shadow-sm">
                <div className="px-4 md:px-6 py-4 md:py-5 border-b">
                  <h2 className="text-base md:text-lg font-semibold">{form.name}</h2>
                  {form.description && <p className="text-xs md:text-sm text-muted-foreground mt-1">{form.description}</p>}
                </div>
                <div className="p-3 md:p-6">
                  {sortedFields.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center gap-3">
                      <LayoutList className="h-10 w-10 text-muted-foreground/30" />
                      <p className="font-medium text-muted-foreground">No fields yet</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="hidden md:inline">Add fields from the left panel to build your form</span>
                        <span className="md:hidden">Tap "Fields" below to add fields</span>
                      </p>
                      <Button size="sm" variant="outline" onClick={() => { setMobilePanel("fields"); setShowFieldPalette(true); }} className="md:hidden" data-testid="button-add-fields-mobile">
                        <Plus className="h-3 w-3 mr-1" /> Add Fields
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap -mx-2">
                      {sortedFields.map((field, idx) => {
                        const colWidth = (field.layoutJson as any)?.columnWidth ?? "full";
                        const widthClass = colWidth === "half" ? "w-full sm:w-1/2" : colWidth === "third" ? "w-full sm:w-1/3" : "w-full";
                        return (
                          <div key={field.id} className={`${widthClass} px-2 mb-2`}>
                            <FieldPreview
                              field={field}
                              isSelected={selectedFieldId === field.id}
                              onClick={() => {
                                const newId = field.id === selectedFieldId ? null : field.id;
                                setSelectedFieldId(newId);
                              }}
                              onMoveUp={() => moveField(idx, idx - 1)}
                              onMoveDown={() => moveField(idx, idx + 1)}
                              canMoveUp={idx > 0}
                              canMoveDown={idx < sortedFields.length - 1}
                              onDragStart={() => handlePreviewDragStart(idx)}
                              onDragOver={(e) => handlePreviewDragOver(e, idx)}
                              onDragEnd={handleDragEnd}
                              onDrop={(e) => handlePreviewDrop(e, idx)}
                              isDragging={dragIdx === idx}
                              isDropTarget={dragOverIdx === idx && dragIdx !== null && dragIdx !== idx}
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

          {/* Right: Field editor — desktop: inline, mobile: full-screen overlay */}
          {selectedField && (
            <div className={`${mobilePanel === "editor" ? "flex" : "hidden"} md:flex w-full md:w-80 border-l flex-col overflow-auto bg-background absolute md:relative inset-0 md:inset-auto z-30 md:z-auto`}>
              {/* Mobile editor header with back */}
              <div className="flex md:hidden items-center justify-between px-3 py-2.5 border-b">
                <span className="text-sm font-semibold">Edit Field</span>
                <Button size="sm" variant="outline" onClick={() => setMobilePanel("preview")} data-testid="button-close-editor-panel">
                  <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                </Button>
              </div>
              <div className="flex-1 overflow-auto pb-14 md:pb-0">
                <FieldEditor
                  field={selectedField}
                  onUpdate={(data) => updateFieldMutation.mutate({ fieldId: selectedField.id, data })}
                  onDelete={() => { deleteFieldMutation.mutate(selectedField.id); setMobilePanel("preview"); }}
                  isPending={updateFieldMutation.isPending}
                />
              </div>
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
        formId={formId}
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
  const [optionColumns, setOptionColumns] = useState<number>(
    (field.layoutJson as any)?.optionColumns ?? 1
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
    setOptionColumns((field.layoutJson as any)?.optionColumns ?? 1);
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
  const isMatrix = local.fieldType === "matrix";

  const initialMatrix = (field.fieldType === "matrix" && field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson))
    ? field.optionsJson as { rows: any[]; columns: any[] }
    : defaultMatrixConfig();
  const [matrixRows, setMatrixRows] = useState<{ id: string; label: string }[]>(
    Array.isArray(initialMatrix.rows) ? initialMatrix.rows : []
  );
  const [matrixCols, setMatrixCols] = useState<{ id: string; header: string; fieldType: string; placeholder?: string }[]>(
    Array.isArray(initialMatrix.columns) ? initialMatrix.columns : []
  );

  useEffect(() => {
    if (field.fieldType === "matrix" && field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson)) {
      const cfg = field.optionsJson as any;
      setMatrixRows(Array.isArray(cfg.rows) ? cfg.rows : []);
      setMatrixCols(Array.isArray(cfg.columns) ? cfg.columns : []);
    }
  }, [field.id]);

  const muid = () => Math.random().toString(36).slice(2, 8);
  const addMatrixRow = () => setMatrixRows(prev => [...prev, { id: muid(), label: `Row ${prev.length + 1}` }]);
  const removeMatrixRow = (id: string) => setMatrixRows(prev => prev.filter(r => r.id !== id));
  const updateMatrixRow = (id: string, label: string) => setMatrixRows(prev => prev.map(r => r.id === id ? { ...r, label } : r));
  const moveRow = (idx: number, dir: -1 | 1) => setMatrixRows(prev => {
    const next = [...prev];
    const ni = idx + dir;
    if (ni < 0 || ni >= next.length) return prev;
    [next[idx], next[ni]] = [next[ni], next[idx]];
    return next;
  });
  const addMatrixCol = () => setMatrixCols(prev => [...prev, { id: muid(), header: `Column ${prev.length + 1}`, fieldType: "checkbox", placeholder: "" }]);
  const removeMatrixCol = (id: string) => setMatrixCols(prev => prev.filter(c => c.id !== id));
  const updateMatrixCol = (id: string, patch: Partial<{ header: string; fieldType: string; placeholder: string }>) =>
    setMatrixCols(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const moveCol = (idx: number, dir: -1 | 1) => setMatrixCols(prev => {
    const next = [...prev];
    const ni = idx + dir;
    if (ni < 0 || ni >= next.length) return prev;
    [next[idx], next[ni]] = [next[ni], next[idx]];
    return next;
  });

  const handleSave = () => {
    const data: any = {
      label: local.label,
      helpText: local.helpText,
      placeholder: local.placeholder,
      isRequired: local.isRequired,
      layoutJson: { columnWidth, optionColumns },
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
    if (isMatrix) {
      data.optionsJson = { rows: matrixRows, columns: matrixCols };
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
          {local.fieldType === "paragraph" ? (
            <RichTextEditor
              value={local.label}
              onChange={(html) => setLocal(prev => ({ ...prev, label: html }))}
              rows={5}
              placeholder="Enter the text or instructions to show patients..."
              testId="textarea-field-label"
            />
          ) : local.fieldType === "heading" ? (
            <RichTextEditor
              value={local.label}
              onChange={(html) => setLocal(prev => ({ ...prev, label: html }))}
              rows={2}
              placeholder="Section heading..."
              testId="input-field-label"
            />
          ) : (
            <Input
              value={local.label}
              onChange={e => setLocal(prev => ({ ...prev, label: e.target.value }))}
              data-testid="input-field-label"
            />
          )}
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

        {isMatrix && (
          <div className="space-y-3 border-t pt-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Columns</Label>
                <Button type="button" size="sm" variant="outline" onClick={addMatrixCol} className="h-7 text-xs gap-1" data-testid="button-add-matrix-col">
                  <Plus className="h-3 w-3" /> Column
                </Button>
              </div>
              <div className="space-y-1.5">
                {matrixCols.map((c, idx) => (
                  <div key={c.id} className="border rounded-md p-2 space-y-1.5 bg-muted/20" data-testid={`matrix-col-${idx}`}>
                    <div className="flex items-center gap-1">
                      <Input
                        value={c.header}
                        onChange={e => updateMatrixCol(c.id, { header: e.target.value })}
                        placeholder="Column header"
                        className="text-xs h-7 flex-1"
                        data-testid={`input-matrix-col-header-${idx}`}
                      />
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveCol(idx, -1)} disabled={idx === 0}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveCol(idx, 1)} disabled={idx === matrixCols.length - 1}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeMatrixCol(c.id)} data-testid={`button-remove-matrix-col-${idx}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Select value={c.fieldType} onValueChange={v => updateMatrixCol(c.id, { fieldType: v })}>
                        <SelectTrigger className="text-xs h-7 flex-1" data-testid={`select-matrix-col-type-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MATRIX_COLUMN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {(c.fieldType === "text" || c.fieldType === "textarea" || c.fieldType === "number") && (
                      <Input
                        value={c.placeholder ?? ""}
                        onChange={e => updateMatrixCol(c.id, { placeholder: e.target.value })}
                        placeholder="Placeholder (optional)"
                        className="text-xs h-7"
                      />
                    )}
                  </div>
                ))}
                {matrixCols.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic">No columns defined.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Rows</Label>
                <Button type="button" size="sm" variant="outline" onClick={addMatrixRow} className="h-7 text-xs gap-1" data-testid="button-add-matrix-row">
                  <Plus className="h-3 w-3" /> Row
                </Button>
              </div>
              <div className="space-y-1">
                {matrixRows.map((r, idx) => (
                  <div key={r.id} className="flex items-center gap-1" data-testid={`matrix-row-${idx}`}>
                    <Input
                      value={r.label}
                      onChange={e => updateMatrixRow(r.id, e.target.value)}
                      placeholder="Row label"
                      className="text-xs h-7 flex-1"
                      data-testid={`input-matrix-row-${idx}`}
                    />
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveRow(idx, -1)} disabled={idx === 0}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveRow(idx, 1)} disabled={idx === matrixRows.length - 1}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeMatrixRow(r.id)} data-testid={`button-remove-matrix-row-${idx}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {matrixRows.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic">No rows defined.</p>
                )}
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

        {["multi_choice", "single_choice", "symptom_checklist"].includes(local.fieldType) && (
          <div className="space-y-1">
            <Label className="text-xs">Layout Options in Columns</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setOptionColumns(n)}
                  className={`flex-1 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                    optionColumns === n
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                  data-testid={`button-option-cols-${n}`}
                >
                  {n} {n === 1 ? "col" : "cols"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Patients can select all that apply.</p>
          </div>
        )}

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

function PublishDialog({ open, onOpenChange, publicUrl, publication, onPublish, onDeactivate, isPending, formId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  publicUrl: string | null;
  publication: FormPublication | null;
  onPublish: () => void;
  onDeactivate: () => void;
  isPending: boolean;
  formId: number | null;
}) {
  const { toast } = useToast();
  const [showEmbed, setShowEmbed] = useState(false);
  const [showSendToPatient, setShowSendToPatient] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  const { data: patients = [] } = useQuery<any[]>({
    queryKey: ["/api/patients"],
    enabled: open && showSendToPatient,
  });

  const filteredPatients = patientSearch.trim().length >= 2
    ? patients.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(patientSearch.toLowerCase()) || (p.email || "").toLowerCase().includes(patientSearch.toLowerCase()))
    : [];

  const sendToPatientMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient || !formId) return;
      const res = await apiRequest("POST", `/api/patients/${selectedPatient.id}/forms/send-link`, { formId, method: "email" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to send"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Form link sent", description: `Email sent to ${selectedPatient?.email || selectedPatient?.firstName}` });
      setSelectedPatient(null);
      setPatientSearch("");
      setShowSendToPatient(false);
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      toast({ title: "Link copied to clipboard" });
    }
  };

  const embedCode = publicUrl
    ? `<iframe src="${publicUrl}?embed=1" style="width:100%;min-height:600px;border:none;" title="Patient Form"></iframe>`
    : "";

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    toast({ title: "Embed code copied to clipboard" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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

              <div className="space-y-1.5">
                <button
                  onClick={() => setShowEmbed(!showEmbed)}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
                  data-testid="button-toggle-embed"
                >
                  <Code className="h-3.5 w-3.5" />
                  {showEmbed ? "Hide embed code" : "Show embed code"}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showEmbed ? "rotate-180" : ""}`} />
                </button>
                {showEmbed && (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <pre className="p-3 rounded-md bg-muted/50 border text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">{embedCode}</pre>
                      <Button size="sm" variant="ghost" className="absolute top-1 right-1 h-7 text-xs gap-1"
                        onClick={handleCopyEmbed} data-testid="button-copy-embed">
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Paste this code into your website HTML to embed the form. Works with any website builder, EHR portal, or custom site.
                    </p>
                  </div>
                )}
              </div>

              {/* Send to Patient */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => setShowSendToPatient(v => !v)}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
                  data-testid="button-toggle-send-patient"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send to a patient via email
                  <ChevronDown className={`h-3 w-3 transition-transform ${showSendToPatient ? "rotate-180" : ""}`} />
                </button>
                {showSendToPatient && (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    {selectedPatient ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                            <p className="text-xs text-muted-foreground">{selectedPatient.email || "No email on file"}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)} className="text-xs">Change</Button>
                        </div>
                        {!selectedPatient.email && (
                          <p className="text-xs text-destructive">This patient has no email address on file. Add an email to their profile first.</p>
                        )}
                        <Button
                          size="sm"
                          onClick={() => sendToPatientMutation.mutate()}
                          disabled={sendToPatientMutation.isPending || !selectedPatient.email}
                          data-testid="button-send-form-to-patient"
                          className="w-full"
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          {sendToPatientMutation.isPending ? "Sending…" : "Send Form Link via Email"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          placeholder="Search by name or email…"
                          value={patientSearch}
                          onChange={e => setPatientSearch(e.target.value)}
                          data-testid="input-patient-search-send"
                          autoFocus
                        />
                        {patientSearch.trim().length >= 2 && (
                          <div className="max-h-40 overflow-y-auto rounded-md border bg-background divide-y">
                            {filteredPatients.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-muted-foreground">No patients found</p>
                            ) : (
                              filteredPatients.slice(0, 8).map((p: any) => (
                                <button
                                  key={p.id}
                                  className="w-full px-3 py-2 text-left hover-elevate"
                                  onClick={() => { setSelectedPatient(p); setPatientSearch(""); }}
                                  data-testid={`button-select-patient-send-${p.id}`}
                                >
                                  <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                                  <p className="text-xs text-muted-foreground">{p.email || "No email"}</p>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">A unique token URL will be generated at <code>/f/[token]</code></span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Embed code will be available to paste into any website or EHR portal</span>
                </div>
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
