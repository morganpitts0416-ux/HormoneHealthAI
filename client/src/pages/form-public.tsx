import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle, RefreshCw, ClipboardList } from "lucide-react";

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

interface PublicFormData {
  form: IntakeForm;
  sections: FormSection[];
  fields: FormField[];
  publication: { id: number; mode: string };
}

export default function FormPublicPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
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
      if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
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
      const firstNameField = data.fields.find(f => f.smartFieldKey === "firstName");
      const lastNameField = data.fields.find(f => f.smartFieldKey === "lastName");
      const emailField = data.fields.find(f => f.smartFieldKey === "email");
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
      <PageShell>
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading form...</p>
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
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
      <PageShell>
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

  const hasSmartName = fields.some(f => f.smartFieldKey === "firstName" || f.smartFieldKey === "lastName");
  const hasSmartEmail = fields.some(f => f.smartFieldKey === "email");
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
    <PageShell>
      {/* Form header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Patient Form</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">{form.name}</h1>
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
          className="w-full sm:w-auto">
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

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {children}
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

      {field.fieldType === "medication_list" && (
        <Textarea
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={"Medication name, dose, frequency (one per line)"}
          rows={5}
          data-testid={`textarea-${field.fieldKey}`}
        />
      )}

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

      {field.fieldType === "multi_choice" && options.length > 0 && (
        <div className="space-y-2">
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
      )}

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
        <div className="border rounded-md p-3 bg-muted/20">
          <Input
            value={value ?? ""}
            onChange={e => onChange(e.target.value)}
            placeholder="Type your full name as your signature"
            data-testid={`input-${field.fieldKey}`}
          />
          <p className="text-xs text-muted-foreground mt-1">Typing your name here constitutes your electronic signature.</p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
