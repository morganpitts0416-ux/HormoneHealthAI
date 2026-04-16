import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle, RefreshCw, ClipboardList, Plus, X } from "lucide-react";

interface FormField {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  helpText: string | null;
  placeholder: string | null;
  isRequired: boolean;
  orderIndex: number;
  optionsJson: any;
  sectionId: number | null;
  layoutJson: any;
  smartFieldKey: string | null;
}

interface FormSection {
  id: number;
  title: string;
  description: string | null;
  orderIndex: number;
}

interface IntakeForm {
  id: number;
  name: string;
  description: string | null;
  requiresPatientSignature: boolean;
}

interface ClinicBranding {
  clinicName?: string;
  clinicLogo?: string | null;
  phone?: string;
  address?: string;
}

interface PublicFormData {
  form: IntakeForm;
  sections: FormSection[];
  fields: FormField[];
  publication: { id: number; mode: string };
  clinic?: ClinicBranding;
}

export default function FormPublicPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const isEmbedded = (() => {
    try {
      if (new URLSearchParams(window.location.search).get("embed") === "1") return true;
      return window.self !== window.top;
    } catch { return true; }
  })();
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery<PublicFormData>({
    queryKey: ["/api/forms/public", token],
    queryFn: () => fetch(`/api/forms/public/${token}`).then(async r => {
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message ?? "Form not found");
      }
      return r.json();
    }),
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: (body: any) =>
      fetch(`/api/forms/public/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).message ?? "Submit failed");
        return r.json();
      }),
    onSuccess: () => setSubmitted(true),
  });

  const setResponse = (key: string, value: any) => {
    setResponses(prev => ({ ...prev, [key]: value }));
    if (validationErrors[key]) {
      setValidationErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const handleSubmit = () => {
    if (!data) return;
    const errors: Record<string, string> = {};
    for (const field of data.fields) {
      if (!field.isRequired) continue;
      if (["heading", "paragraph"].includes(field.fieldType)) continue;
      const val = responses[field.fieldKey];
      const isEmpty = val === undefined || val === null || val === "" ||
        (Array.isArray(val) && (val.length === 0 || val.every((v: any) => !v || !String(v).trim()))) ||
        (field.fieldType === "family_history_chart" && typeof val === "object" && !Array.isArray(val) && Object.values(val).every((v: any) => !v || !String(v).trim()));
      if (isEmpty) {
        errors[field.fieldKey] = "This field is required";
      }
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    let effectiveName = submitterName || null;
    let effectiveEmail = submitterEmail || null;
    if (data.fields.length > 0) {
      const firstNameField = data.fields.find(f => f.smartFieldKey === "patient_first_name");
      const lastNameField = data.fields.find(f => f.smartFieldKey === "patient_last_name");
      const emailField = data.fields.find(f => f.smartFieldKey === "patient_email");
      if (firstNameField || lastNameField) {
        const fn = firstNameField ? (responses[firstNameField.fieldKey] || "") : "";
        const ln = lastNameField ? (responses[lastNameField.fieldKey] || "") : "";
        effectiveName = `${fn} ${ln}`.trim() || effectiveName;
      }
      if (emailField) {
        effectiveEmail = responses[emailField.fieldKey] || effectiveEmail;
      }
    }
    submitMutation.mutate({
      responses,
      submitterName: effectiveName,
      submitterEmail: effectiveEmail,
    });
  };

  // ─── States ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageShell isEmbedded={isEmbedded}>
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading form...</p>
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell isEmbedded={isEmbedded}>
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="font-semibold text-lg">Form Not Available</p>
          <p className="text-muted-foreground text-sm max-w-sm">
            {(error as Error)?.message ?? "This form link is invalid or has expired."}
          </p>
        </div>
      </PageShell>
    );
  }

  if (submitted) {
    return (
      <PageShell isEmbedded={isEmbedded} clinic={data?.clinic}>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="font-semibold text-xl">Thank You!</p>
          <p className="text-muted-foreground text-sm max-w-sm">
            Your form has been submitted successfully. Your care team will review your responses.
          </p>
        </div>
      </PageShell>
    );
  }

  const { form, sections, fields } = data;
  const sortedFields = [...fields].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedSections = [...sections].sort((a, b) => a.orderIndex - b.orderIndex);

  const hasSmartName = fields.some(f => f.smartFieldKey === "patient_first_name" || f.smartFieldKey === "patient_last_name");
  const hasSmartEmail = fields.some(f => f.smartFieldKey === "patient_email");
  const hideSubmitterBox = hasSmartName && hasSmartEmail;

  // Group fields by section (null = no section)
  const fieldsBySectionId: Record<string | "null", FormField[]> = { null: [] };
  for (const sec of sortedSections) fieldsBySectionId[sec.id] = [];
  for (const field of sortedFields) {
    const key = field.sectionId === null ? "null" : String(field.sectionId);
    if (!fieldsBySectionId[key]) fieldsBySectionId[key] = [];
    fieldsBySectionId[key].push(field);
  }

  return (
    <PageShell isEmbedded={isEmbedded} clinic={data.clinic}>
      {/* Form header */}
      <div className="mb-8">
        {isEmbedded && (
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Patient Form</span>
          </div>
        )}
        <h1 className="text-2xl font-bold" style={{ color: "#2e3a20" }}>{form.name}</h1>
        {form.description && (
          <p className="mt-2 text-muted-foreground">{form.description}</p>
        )}
      </div>

      {!hideSubmitterBox && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 p-4 rounded-md border bg-muted/20">
          <div className="space-y-1.5">
            <Label>Your Full Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={submitterName}
              onChange={e => setSubmitterName(e.target.value)}
              placeholder="Jane Doe"
              data-testid="input-submitter-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Your Email <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              type="email"
              value={submitterEmail}
              onChange={e => setSubmitterEmail(e.target.value)}
              placeholder="jane@example.com"
              data-testid="input-submitter-email"
            />
          </div>
        </div>
      )}

      {/* Fields without section */}
      {fieldsBySectionId["null"]?.length > 0 && (
        <FieldGrid fields={fieldsBySectionId["null"]} responses={responses} setResponse={setResponse} validationErrors={validationErrors} className="mb-8" />
      )}

      {/* Sections */}
      {sortedSections.map(section => (
        <div key={section.id} className="mb-8">
          <div className="border-b pb-2 mb-5">
            <h2 className="text-base font-semibold">{section.title}</h2>
            {section.description && <p className="text-sm text-muted-foreground mt-0.5">{section.description}</p>}
          </div>
          <FieldGrid fields={fieldsBySectionId[section.id] ?? []} responses={responses} setResponse={setResponse} validationErrors={validationErrors} />
        </div>
      ))}

      {/* Validation summary */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 mb-4">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">Please complete all required fields before submitting.</p>
        </div>
      )}

      {/* Submit */}
      <div className="pt-4 border-t">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          data-testid="button-submit-form"
          className="w-full sm:w-auto"
          style={!isEmbedded ? { backgroundColor: "#2e3a20", color: "#f9f6f0" } : undefined}>
          {submitMutation.isPending ? (
            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
          ) : "Submit Form"}
        </Button>
        {submitMutation.isError && (
          <p className="text-sm text-destructive mt-2">
            {(submitMutation.error as Error)?.message ?? "Submission failed. Please try again."}
          </p>
        )}
      </div>
    </PageShell>
  );
}

// ─── Page Shell ───────────────────────────────────────────────────────────────

function PageShell({ children, clinic, isEmbedded }: {
  children: React.ReactNode;
  clinic?: ClinicBranding;
  isEmbedded?: boolean;
}) {
  if (isEmbedded) {
    return (
      <div className="bg-transparent">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {clinic?.clinicName && (
        <div style={{ backgroundColor: "#e8ddd0", borderBottom: "1px solid #d4c9b5" }}>
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              {clinic.clinicLogo && (
                <img
                  src={clinic.clinicLogo}
                  alt={clinic.clinicName}
                  className="h-10 max-w-[160px] object-contain"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "#2e3a20" }}>
                  {clinic.clinicName}
                </p>
                {(clinic.phone || clinic.address) && (
                  <p className="text-xs mt-0.5" style={{ color: "#5a7040" }}>
                    {[clinic.phone, clinic.address].filter(Boolean).join(" \u00B7 ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto px-4 py-10">
        {children}
      </div>
      <div className="border-t py-6 text-center" style={{ borderColor: "#d4c9b5" }}>
        <p className="text-xs" style={{ color: "#8a7e6b" }}>
          Powered by ClinIQ by ReAlign Health
        </p>
      </div>
    </div>
  );
}

// ─── Field Renderer ───────────────────────────────────────────────────────────

function FieldGrid({ fields, responses, setResponse, validationErrors, className = "" }: {
  fields: FormField[];
  responses: Record<string, any>;
  setResponse: (key: string, value: any) => void;
  validationErrors: Record<string, string>;
  className?: string;
}) {
  const colSpan = (f: FormField) => {
    const w = (f.layoutJson as any)?.columnWidth;
    if (w === "third") return "col-span-6 sm:col-span-3 md:col-span-2";
    if (w === "half") return "col-span-6 sm:col-span-3";
    return "col-span-6";
  };
  return (
    <div className={`grid grid-cols-6 gap-x-4 gap-y-6 ${className}`}>
      {fields.map(field => (
        <div key={field.id} className={colSpan(field)}>
          <FieldRenderer
            field={field}
            value={responses[field.fieldKey]}
            onChange={v => setResponse(field.fieldKey, v)}
            error={validationErrors[field.fieldKey]}
          />
        </div>
      ))}
    </div>
  );
}

function SignatureField({ value, onChange, fieldKey }: { value: string; onChange: (v: string) => void; fieldKey: string }) {
  const [tab, setTab] = useState<"draw" | "type">("type");
  const [typedName, setTypedName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tab !== "draw") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#222";
    const rect = () => canvas.getBoundingClientRect();
    const getPos = (e: MouseEvent | TouchEvent) => {
      const r = rect();
      const pt = "touches" in e ? e.touches[0] : e;
      return { x: pt.clientX - r.left, y: pt.clientY - r.top };
    };
    const start = (e: MouseEvent | TouchEvent) => { e.preventDefault(); isDrawingRef.current = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: MouseEvent | TouchEvent) => { if (!isDrawingRef.current) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { if (isDrawingRef.current) { isDrawingRef.current = false; onChange(canvas.toDataURL("image/png")); } };
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [tab, onChange]);

  const clearDraw = () => {
    const canvas = canvasRef.current;
    if (canvas) { const ctx = canvas.getContext("2d"); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
    onChange("");
  };

  const handleTypedName = (name: string) => {
    setTypedName(name);
    if (!name.trim()) { onChange(""); return; }
    const c = document.createElement("canvas");
    c.width = 400; c.height = 80;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 400, 80);
      ctx.font = "italic 32px 'Georgia', 'Times New Roman', serif";
      ctx.fillStyle = "#222"; ctx.textBaseline = "middle";
      ctx.fillText(name, 16, 40);
      onChange(c.toDataURL("image/png"));
    }
  };

  return (
    <div className="border rounded-md p-3 bg-muted/20 space-y-2" data-testid={`field-${fieldKey}`}>
      <div className="flex gap-2">
        <button type="button" onClick={() => { if (tab !== "draw") { setTab("draw"); setTypedName(""); onChange(""); } }} className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "draw" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Draw</button>
        <button type="button" onClick={() => { if (tab !== "type") { setTab("type"); clearDraw(); setTypedName(""); } }} className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "type" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Type</button>
      </div>
      {tab === "draw" ? (
        <div>
          <canvas ref={canvasRef} width={400} height={100} className="border rounded bg-white w-full cursor-crosshair" style={{ touchAction: "none" }} />
          <div className="flex justify-end mt-1">
            <Button size="sm" variant="ghost" type="button" onClick={clearDraw} className="text-xs">Clear</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input value={typedName} onChange={e => handleTypedName(e.target.value)} placeholder="Type your full legal name" data-testid={`input-${fieldKey}`} />
          {typedName.trim() && (
            <div className="border rounded bg-white px-4 py-3">
              <p className="text-2xl" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontStyle: "italic", color: "#222" }}>{typedName}</p>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">By signing, you acknowledge this as your electronic signature.</p>
    </div>
  );
}

function FieldRenderer({ field, value, onChange, error }: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
  error?: string;
}) {
  const options: string[] = Array.isArray(field.optionsJson) ? field.optionsJson : [];

  if (field.fieldType === "heading") {
    return (
      <div className="pt-2">
        <h3 className="text-base font-semibold">{field.label}</h3>
        {field.helpText && <p className="text-sm text-muted-foreground mt-0.5">{field.helpText}</p>}
      </div>
    );
  }

  if (field.fieldType === "paragraph") {
    return (
      <div className="rounded-md bg-muted/30 border p-3">
        <p className="text-sm text-foreground">{field.label}</p>
        {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid={`field-${field.fieldKey}`}>
      <Label>
        {field.label}
        {field.isRequired && <span className="text-destructive ml-1">*</span>}
      </Label>
      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}

      {field.fieldType === "short_text" && (
        <Input
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          data-testid={`input-${field.fieldKey}`}
        />
      )}

      {field.fieldType === "long_text" && (
        <Textarea
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          rows={4}
          data-testid={`textarea-${field.fieldKey}`}
        />
      )}

      {(field.fieldType === "medication_list" || field.fieldType === "allergy_list" || field.fieldType === "medical_history_list" || field.fieldType === "surgical_history_list") && (() => {
        const listItems = Array.isArray(value) ? value : [];
        const listLabels: Record<string, { placeholder: string; addLabel: string }> = {
          medication_list: { placeholder: "Medication name, dosage, frequency", addLabel: "Add medication" },
          allergy_list: { placeholder: "Allergy (include reaction type if known)", addLabel: "Add allergy" },
          medical_history_list: { placeholder: "Condition or diagnosis", addLabel: "Add condition" },
          surgical_history_list: { placeholder: "Surgery name and approximate date", addLabel: "Add surgery" },
        };
        const cfg = listLabels[field.fieldType] || listLabels.medication_list;
        return (
          <div className="space-y-2">
            {listItems.map((item: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={item}
                  onChange={e => { const arr = [...listItems]; arr[i] = e.target.value; onChange(arr); }}
                  placeholder={field.placeholder || cfg.placeholder}
                  data-testid={`input-${field.fieldKey}-${i}`}
                />
                <Button size="icon" variant="ghost" type="button" onClick={() => { const arr = [...listItems]; arr.splice(i, 1); onChange(arr); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" type="button" className="text-xs gap-1" onClick={() => onChange([...listItems, ""])}>
              <Plus className="h-3 w-3" /> {cfg.addLabel}
            </Button>
          </div>
        );
      })()}

      {field.fieldType === "family_history_chart" && (() => {
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
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] text-xs font-medium bg-muted/40 border-b">
              <div className="px-3 py-2">Family Member</div>
              <div className="px-3 py-2">Medical Conditions</div>
            </div>
            {FAMILY_MEMBERS.map((member) => (
              <div key={member} className="grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] border-b last:border-b-0">
                <div className="px-3 py-2 text-sm font-medium bg-muted/20 flex items-center">
                  {member}
                </div>
                <div className="px-2 py-1.5">
                  <Input
                    value={chart[member] ?? ""}
                    onChange={e => onChange({ ...chart, [member]: e.target.value })}
                    placeholder="e.g., Diabetes, Heart Disease, Cancer"
                    className="h-8 text-sm"
                    data-testid={`input-${field.fieldKey}-${member.toLowerCase().replace(/\s+/g, "-")}`}
                  />
                </div>
              </div>
            ))}
            <p className="px-3 py-1.5 text-[11px] text-muted-foreground">Enter "None" or "N/A" if not applicable. Separate multiple conditions with commas.</p>
          </div>
        );
      })()}

      {field.fieldType === "symptom_checklist" && (
        <Textarea
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={"List any symptoms you are experiencing (one per line)"}
          rows={4}
          data-testid={`textarea-${field.fieldKey}`}
        />
      )}

      {(field.fieldType === "number") && (
        <Input
          type="number"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          data-testid={`input-${field.fieldKey}`}
        />
      )}

      {field.fieldType === "email" && (
        <Input
          type="email"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          data-testid={`input-${field.fieldKey}`}
        />
      )}

      {field.fieldType === "phone" && (
        <Input
          type="tel"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? "(555) 555-5555"}
          data-testid={`input-${field.fieldKey}`}
        />
      )}

      {field.fieldType === "date" && (
        <Input
          type="date"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          data-testid={`input-${field.fieldKey}`}
        />
      )}

      {field.fieldType === "yes_no" && (
        <RadioGroup value={value ?? ""} onValueChange={onChange}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id={`${field.fieldKey}-yes`} />
              <Label htmlFor={`${field.fieldKey}-yes`} className="font-normal cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id={`${field.fieldKey}-no`} />
              <Label htmlFor={`${field.fieldKey}-no`} className="font-normal cursor-pointer">No</Label>
            </div>
          </div>
        </RadioGroup>
      )}

      {field.fieldType === "single_choice" && options.length > 0 && (
        <RadioGroup value={value ?? ""} onValueChange={onChange}>
          <div className="space-y-2">
            {options.map(opt => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${field.fieldKey}-${opt}`} />
                <Label htmlFor={`${field.fieldKey}-${opt}`} className="font-normal cursor-pointer">{opt}</Label>
              </div>
            ))}
          </div>
        </RadioGroup>
      )}

      {field.fieldType === "multi_choice" && options.length > 0 && (() => {
        const cols = (field.layoutJson as any)?.optionColumns ?? 1;
        const colClass = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";
        return (
          <div className={`grid gap-x-4 gap-y-2 ${colClass}`}>
            {options.map(opt => {
              const checked = Array.isArray(value) ? value.includes(opt) : false;
              return (
                <div key={opt} className="flex items-center gap-2">
                  <Checkbox
                    id={`${field.fieldKey}-${opt}`}
                    checked={checked}
                    onCheckedChange={c => {
                      const current = Array.isArray(value) ? value : [];
                      onChange(c ? [...current, opt] : current.filter((v: string) => v !== opt));
                    }}
                  />
                  <Label htmlFor={`${field.fieldKey}-${opt}`} className="font-normal cursor-pointer">{opt}</Label>
                </div>
              );
            })}
          </div>
        );
      })()}

      {field.fieldType === "dropdown" && options.length > 0 && (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger data-testid={`select-${field.fieldKey}`}>
            <SelectValue placeholder={field.placeholder ?? "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {field.fieldType === "scale" && (
        <div className="flex items-center gap-2 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors
                ${value === n
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"}`}
              data-testid={`scale-${field.fieldKey}-${n}`}>
              {n}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            {value ? `Selected: ${value}/10` : "1 = lowest, 10 = highest"}
          </span>
        </div>
      )}

      {field.fieldType === "signature" && (
        <SignatureField
          value={value ?? ""}
          onChange={onChange}
          fieldKey={field.fieldKey}
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
