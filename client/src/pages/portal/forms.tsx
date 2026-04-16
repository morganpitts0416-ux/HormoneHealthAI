import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf, LogOut, CalendarDays, Clock, Package, MessageSquare, FileText,
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2,
  ArrowLeft, Plus, Minus, X,
} from "lucide-react";

interface FormField {
  id: number;
  fieldType: string;
  label: string;
  placeholder?: string | null;
  helpText?: string | null;
  isRequired: boolean;
  optionsJson?: any;
  smartFieldKey?: string | null;
  orderIndex: number;
}

interface FormAssignment {
  id: number;
  formId: number;
  status: string;
  assignedAt: string;
  dueAt?: string | null;
  formName: string;
  formDescription?: string | null;
  formCategory?: string;
  submission?: {
    id: number;
    submittedAt: string;
    reviewStatus: string;
    syncStatus: string;
  } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PortalFormField({ field, value, onChange }: {
  field: FormField;
  value: any;
  onChange: (val: any) => void;
}) {
  const options = Array.isArray(field.optionsJson) ? field.optionsJson : [];
  const scaleOpts = (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson))
    ? field.optionsJson as { min?: number; max?: number; step?: number; labels?: { low?: string; high?: string } }
    : { min: 1, max: 5, step: 1 };

  switch (field.fieldType) {
    case "heading":
      return <h3 className="text-base font-semibold pt-2" style={{ color: "#2e3a20" }}>{field.label}</h3>;
    case "paragraph":
      return <p className="text-sm text-muted-foreground">{field.helpText || field.placeholder || ""}</p>;
    case "short_text":
    case "email":
    case "phone":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <Input
            type={field.fieldType === "email" ? "email" : field.fieldType === "phone" ? "tel" : "text"}
            placeholder={field.placeholder ?? ""}
            value={value ?? ""}
            onChange={e => onChange(e.target.value)}
            className="border-gray-300"
            data-testid={`portal-field-${field.id}`}
          />
        </div>
      );
    case "long_text":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <Textarea
            placeholder={field.placeholder ?? ""}
            value={value ?? ""}
            onChange={e => onChange(e.target.value)}
            rows={3}
            className="border-gray-300"
            data-testid={`portal-field-${field.id}`}
          />
        </div>
      );
    case "number":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <Input
            type="number"
            placeholder={field.placeholder ?? "0"}
            value={value ?? ""}
            onChange={e => onChange(e.target.value)}
            className="border-gray-300 max-w-[200px]"
            data-testid={`portal-field-${field.id}`}
          />
        </div>
      );
    case "date":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <Input
            type="date"
            value={value ?? ""}
            onChange={e => onChange(e.target.value)}
            className="border-gray-300 max-w-[220px]"
            data-testid={`portal-field-${field.id}`}
          />
        </div>
      );
    case "single_choice":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="space-y-2">
            {options.map((opt: string, i: number) => (
              <label key={i} className="flex items-center gap-2.5 text-sm cursor-pointer" data-testid={`portal-field-${field.id}-option-${i}`}>
                <span
                  className={`h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${value === opt ? "border-green-600" : "border-gray-300"}`}
                  onClick={() => onChange(opt)}
                >
                  {value === opt && <span className="h-2 w-2 rounded-full bg-green-600" />}
                </span>
                <span onClick={() => onChange(opt)}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );
    case "multi_choice":
    case "symptom_checklist":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="space-y-2">
            {options.map((opt: string, i: number) => {
              const selected = Array.isArray(value) ? value.includes(opt) : false;
              return (
                <label key={i} className="flex items-center gap-2.5 text-sm cursor-pointer" data-testid={`portal-field-${field.id}-option-${i}`}>
                  <span
                    className={`h-4 w-4 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected ? "border-green-600 bg-green-600" : "border-gray-300"}`}
                    onClick={() => {
                      const arr = Array.isArray(value) ? [...value] : [];
                      if (selected) onChange(arr.filter(v => v !== opt));
                      else onChange([...arr, opt]);
                    }}
                  >
                    {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </span>
                  <span onClick={() => {
                    const arr = Array.isArray(value) ? [...value] : [];
                    if (selected) onChange(arr.filter(v => v !== opt));
                    else onChange([...arr, opt]);
                  }}>{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    case "dropdown":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <select
            value={value ?? ""}
            onChange={e => onChange(e.target.value)}
            className="w-full max-w-[280px] border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            data-testid={`portal-field-${field.id}`}
          >
            <option value="">{field.placeholder || "Select..."}</option>
            {options.map((opt: string, i: number) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    case "yes_no":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="flex items-center gap-4">
            {["Yes", "No"].map(opt => (
              <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                <span
                  className={`h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${value === opt ? "border-green-600" : "border-gray-300"}`}
                  onClick={() => onChange(opt)}
                >
                  {value === opt && <span className="h-2 w-2 rounded-full bg-green-600" />}
                </span>
                <span onClick={() => onChange(opt)}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );
    case "scale": {
      const min = scaleOpts.min ?? 1;
      const max = scaleOpts.max ?? 5;
      const labels = scaleOpts.labels;
      const steps: number[] = [];
      for (let i = min; i <= max; i++) steps.push(i);
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="flex items-center gap-1.5 flex-wrap">
            {steps.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={`w-9 h-9 rounded-md border-2 flex items-center justify-center text-sm transition-colors ${
                  value === n ? "border-green-600 bg-green-600 text-white font-semibold" : "border-gray-300 text-gray-600"
                }`}
                data-testid={`portal-field-${field.id}-scale-${n}`}
              >
                {n}
              </button>
            ))}
          </div>
          {labels && (
            <div className="flex justify-between text-[11px] text-muted-foreground px-0.5">
              <span>{labels.low ?? ""}</span>
              <span>{labels.high ?? ""}</span>
            </div>
          )}
        </div>
      );
    }
    case "signature":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <SignaturePad value={value} onChange={onChange} fieldId={field.id} />
        </div>
      );
    case "medication_list":
    case "allergy_list":
    case "medical_history_list":
    case "surgical_history_list": {
      const listItems = Array.isArray(value) ? value : [];
      const listLabels: Record<string, { placeholder: string; addLabel: string }> = {
        medication_list: { placeholder: "Medication name, dosage, frequency", addLabel: "Add medication" },
        allergy_list: { placeholder: "Allergy (include reaction type if known)", addLabel: "Add allergy" },
        medical_history_list: { placeholder: "Condition or diagnosis", addLabel: "Add condition" },
        surgical_history_list: { placeholder: "Surgery name and approximate date", addLabel: "Add surgery" },
      };
      const cfg = listLabels[field.fieldType] || listLabels.medication_list;
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="space-y-2">
            {listItems.map((item: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={item}
                  onChange={e => { const arr = [...listItems]; arr[i] = e.target.value; onChange(arr); }}
                  placeholder={field.placeholder || cfg.placeholder}
                  className="border-gray-300"
                  data-testid={`portal-field-${field.id}-item-${i}`}
                />
                <Button size="icon" variant="ghost" onClick={() => { const arr = [...listItems]; arr.splice(i, 1); onChange(arr); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => onChange([...listItems, ""])}>
              <Plus className="h-3 w-3" /> {cfg.addLabel}
            </Button>
          </div>
        </div>
      );
    }
    case "family_history_chart": {
      const FAMILY_MEMBERS = [
        "Mother", "Father",
        "Maternal Grandmother", "Maternal Grandfather",
        "Paternal Grandmother", "Paternal Grandfather",
        "Siblings", "Children",
      ];
      const chart = (typeof value === "object" && value !== null && !Array.isArray(value))
        ? value as Record<string, string>
        : {} as Record<string, string>;
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="border border-gray-300 rounded-md overflow-hidden">
            <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] text-xs font-medium bg-gray-50 border-b border-gray-200" style={{ color: "#2e3a20" }}>
              <div className="px-3 py-2">Family Member</div>
              <div className="px-3 py-2">Medical Conditions</div>
            </div>
            {FAMILY_MEMBERS.map((member) => (
              <div key={member} className="grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] border-b border-gray-100 last:border-b-0">
                <div className="px-3 py-2 text-sm font-medium bg-gray-50/50 flex items-center" style={{ color: "#2e3a20" }}>
                  {member}
                </div>
                <div className="px-2 py-1.5">
                  <Input
                    value={chart[member] ?? ""}
                    onChange={e => onChange({ ...chart, [member]: e.target.value })}
                    placeholder="e.g., Diabetes, Heart Disease, Cancer"
                    className="border-gray-200 text-sm h-8"
                    data-testid={`portal-field-${field.id}-fam-${member.toLowerCase().replace(/\s+/g, "-")}`}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Enter "None" or "N/A" if not applicable. Separate multiple conditions with commas.</p>
        </div>
      );
    }
    default:
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <Input
            placeholder={field.placeholder ?? ""}
            value={value ?? ""}
            onChange={e => onChange(e.target.value)}
            className="border-gray-300"
            data-testid={`portal-field-${field.id}`}
          />
        </div>
      );
  }
}

function SignaturePad({ value, onChange, fieldId }: { value: any; onChange: (val: string) => void; fieldId: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typedCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.strokeStyle = "#2e3a20";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (value && mode === "draw") {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "type") return;
    const canvas = typedCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    if (!typedName.trim()) {
      onChange("");
      return;
    }
    ctx.fillStyle = "#2e3a20";
    ctx.font = "italic 28px 'Georgia', 'Times New Roman', serif";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, 16, canvas.offsetHeight / 2);
    onChange(canvas.toDataURL());
  }, [typedName, mode]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const end = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL());
  };

  const clear = () => {
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      setTypedName("");
    }
    onChange("");
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 mb-1">
        <button
          type="button"
          onClick={() => { setMode("draw"); clear(); }}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${mode === "draw" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"}`}
          data-testid={`portal-field-${fieldId}-sig-draw-tab`}
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => { setMode("type"); clear(); }}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${mode === "type" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"}`}
          data-testid={`portal-field-${fieldId}-sig-type-tab`}
        >
          Type
        </button>
      </div>
      {mode === "draw" ? (
        <div className="relative border-2 border-dashed border-gray-300 rounded-md bg-white">
          <canvas
            ref={canvasRef}
            className="w-full h-24 touch-none cursor-crosshair"
            onMouseDown={start}
            onMouseMove={draw}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={draw}
            onTouchEnd={end}
            data-testid={`portal-field-${fieldId}-signature`}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            placeholder="Type your full legal name"
            className="border-gray-300"
            data-testid={`portal-field-${fieldId}-sig-typed-input`}
          />
          <div className="relative border-2 border-dashed border-gray-300 rounded-md bg-white overflow-hidden">
            <canvas
              ref={typedCanvasRef}
              className="w-full h-24"
              data-testid={`portal-field-${fieldId}-sig-typed-preview`}
            />
            {!typedName.trim() && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Signature preview
              </div>
            )}
          </div>
        </div>
      )}
      <Button size="sm" variant="ghost" className="text-xs" onClick={clear} data-testid={`portal-field-${fieldId}-clear-sig`}>
        Clear signature
      </Button>
    </div>
  );
}

export default function PortalForms() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { unreadCount } = usePortalUnreadCount();
  const [fillingAssignmentId, setFillingAssignmentId] = useState<number | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});

  const { data: me } = useQuery<any>({ queryKey: ["/api/portal/me"] });

  const { data: formsData, isLoading } = useQuery<{ assignments: FormAssignment[]; standalone: any[] }>({
    queryKey: ["/api/portal/forms"],
    queryFn: async () => {
      const res = await fetch("/api/portal/forms", { credentials: "include" });
      if (res.status === 401) { navigate("/portal/login"); return { assignments: [], standalone: [] }; }
      if (!res.ok) return { assignments: [], standalone: [] };
      return res.json();
    },
  });

  const { data: formDetail, isLoading: loadingDetail } = useQuery<{ form: any; fields: FormField[]; sections: any[] }>({
    queryKey: ["/api/portal/forms", fillingAssignmentId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/forms/${fillingAssignmentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load form");
      return res.json();
    },
    enabled: !!fillingAssignmentId,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/forms/${fillingAssignmentId}/submit`, { responses, signature: responses.__signature ?? null });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Form submitted successfully" });
      setFillingAssignmentId(null);
      setResponses({});
      queryClient.invalidateQueries({ queryKey: ["/api/portal/forms"] });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to submit form", variant: "destructive" }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/logout", {}),
    onSuccess: () => navigate("/portal/login"),
  });

  const pendingAssignments = (formsData?.assignments ?? []).filter(a => a.status === "pending");
  const completedAssignments = (formsData?.assignments ?? []).filter(a => a.status === "completed");

  const handleSubmit = () => {
    if (!formDetail) return;
    const missing = formDetail.fields.filter(f => f.isRequired && !["heading", "paragraph"].includes(f.fieldType) && !responses[f.id]);
    if (missing.length > 0) {
      toast({ title: `Please fill in all required fields (${missing.length} remaining)`, variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  };

  if (fillingAssignmentId) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
        <header className="sticky top-0 z-30 border-b px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
          <button onClick={() => { setFillingAssignmentId(null); setResponses({}); }} className="flex items-center gap-1 text-sm font-medium" style={{ color: "#2e3a20" }} data-testid="button-back-forms">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="flex-1 text-sm font-semibold truncate" style={{ color: "#2e3a20" }}>
            {formDetail?.form?.name ?? "Loading..."}
          </span>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#5a7040" }} />
            </div>
          ) : formDetail ? (
            <div className="space-y-5">
              {formDetail.form.description && (
                <p className="text-sm text-muted-foreground">{formDetail.form.description}</p>
              )}
              {formDetail.fields.map((field: FormField) => (
                <PortalFormField
                  key={field.id}
                  field={field}
                  value={responses[field.id]}
                  onChange={val => setResponses(prev => ({ ...prev, [field.id]: val }))}
                />
              ))}
              <div className="pt-4">
                <Button
                  className="w-full text-white font-semibold"
                  style={{ backgroundColor: "#2e3a20" }}
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-form"
                >
                  {submitMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...</> : "Submit Form"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <p className="text-sm text-muted-foreground">Failed to load form. Please try again.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b px-4 py-3 flex items-center justify-between gap-3" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
        <div className="flex items-center gap-2.5">
          <Leaf className="w-5 h-5" style={{ color: "#5a7040" }} />
          <span className="text-base font-bold tracking-tight" style={{ color: "#2e3a20" }}>Forms</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => logoutMutation.mutate()} data-testid="button-portal-logout" className="text-xs gap-1.5">
          <LogOut className="h-3.5 w-3.5" /> Sign Out
        </Button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#5a7040" }} />
          </div>
        ) : (
          <>
            {/* Pending Forms */}
            {pendingAssignments.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" style={{ color: "#c0392b" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "#2e3a20" }}>Action Required</h2>
                  <Badge className="text-xs" style={{ backgroundColor: "#c0392b", color: "#fff" }}>
                    {pendingAssignments.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {pendingAssignments.map(assignment => (
                    <div key={assignment.id} className="rounded-lg border p-4" style={{ borderColor: "#e8ddd0", backgroundColor: "#fff" }} data-testid={`portal-form-pending-${assignment.id}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: "#2e3a20" }}>{assignment.formName}</p>
                          {assignment.formDescription && <p className="text-xs text-muted-foreground mt-0.5">{assignment.formDescription}</p>}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Assigned {formatDate(assignment.assignedAt)}
                            </span>
                            {assignment.dueAt && (
                              <span className="flex items-center gap-1 text-amber-600">
                                <AlertCircle className="w-3 h-3" /> Due {formatDate(assignment.dueAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="text-white font-medium flex-shrink-0"
                          style={{ backgroundColor: "#5a7040" }}
                          onClick={() => setFillingAssignmentId(assignment.id)}
                          data-testid={`button-fill-form-${assignment.id}`}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1.5" /> Fill Out
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Forms */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold" style={{ color: "#2e3a20" }}>Completed Forms</h2>
              {completedAssignments.length === 0 && (formsData?.standalone ?? []).length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: "#d4c9b5" }} />
                  <p className="text-sm text-muted-foreground">No completed forms yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {completedAssignments.map(assignment => (
                    <div key={assignment.id} className="rounded-lg border p-4" style={{ borderColor: "#e8ddd0", backgroundColor: "#fff" }} data-testid={`portal-form-completed-${assignment.id}`}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-medium" style={{ color: "#2e3a20" }}>{assignment.formName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Submitted {assignment.submission?.submittedAt ? formatDate(assignment.submission.submittedAt) : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0" style={{ borderColor: "#5a7040", color: "#5a7040" }}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {(formsData?.standalone ?? []).map((item: any) => (
                    <div key={`s-${item.submission?.id}`} className="rounded-lg border p-4" style={{ borderColor: "#e8ddd0", backgroundColor: "#fff" }}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-medium" style={{ color: "#2e3a20" }}>{item.formName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Submitted {item.submission?.submittedAt ? formatDate(item.submission.submittedAt) : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0" style={{ borderColor: "#5a7040", color: "#5a7040" }}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t z-40" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 flex">
          <Link href="/portal/dashboard" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-home">
              <CalendarDays className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Overview</span>
            </button>
          </Link>
          <Link href="/portal/forms" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-forms">
              <FileText className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-semibold" style={{ color: "#2e3a20" }}>Forms</span>
            </button>
          </Link>
          <Link href="/portal/supplements" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-supplements">
              <Package className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Protocol</span>
            </button>
          </Link>
          <Link href="/portal/messages" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-messages">
              <span className="relative">
                <MessageSquare className="w-4 h-4" style={{ color: "#a0a880" }} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold leading-none text-white"
                    style={{ backgroundColor: "#c0392b" }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-xs" style={{ color: "#a0a880" }}>Messages</span>
            </button>
          </Link>
        </div>
      </nav>
    </div>
  );
}
