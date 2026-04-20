import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isFieldVisible } from "@/lib/form-conditions";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextView } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf, LogOut, CalendarDays, Clock, Package, MessageSquare, FileText,
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2,
  ArrowLeft, Plus, Minus, X, Upload,
} from "lucide-react";

interface FormField {
  id: number;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder?: string | null;
  helpText?: string | null;
  isRequired: boolean;
  optionsJson?: any;
  smartFieldKey?: string | null;
  orderIndex: number;
  layoutJson?: any;
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
      return (
        <div className="pt-2 space-y-0.5">
          <RichTextView html={field.label} className="text-base font-semibold" />
          {field.helpText && <p className="text-xs text-muted-foreground whitespace-pre-line">{field.helpText}</p>}
        </div>
      );
    case "paragraph":
      return (
        <div className="rounded-md bg-muted/30 border p-3 space-y-1">
          {(field.label || field.placeholder) && (
            field.label
              ? <RichTextView html={field.label} className="text-sm text-foreground" />
              : <p className="text-sm text-foreground whitespace-pre-line">{field.placeholder}</p>
          )}
          {field.helpText && (
            <p className="text-xs text-muted-foreground whitespace-pre-line">{field.helpText}</p>
          )}
        </div>
      );
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
    case "single_choice": {
      const cols = (field.layoutJson as any)?.optionColumns ?? 1;
      const colClass = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className={`grid gap-x-4 gap-y-2 ${colClass}`}>
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
    }
    case "symptom_checklist": {
      const symptoms: string[] = Array.isArray(field.optionsJson) ? field.optionsJson : [];
      if (symptoms.length === 0) {
        return (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
              {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "#d4c9b5" }}
              rows={4}
              value={typeof value === "string" ? value : ""}
              onChange={e => onChange(e.target.value)}
              placeholder="List any symptoms you are experiencing"
              data-testid={`portal-field-${field.id}-text`}
            />
          </div>
        );
      }
      const ratings = ["None", "Mild", "Moderate", "Severe"];
      const val: Record<string, string> = (typeof value === "object" && value !== null && !Array.isArray(value)) ? value : {};
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="border rounded-md overflow-hidden" style={{ borderColor: "#d4c9b5" }}>
            <div className="grid grid-cols-[1fr_auto] text-xs font-medium border-b" style={{ backgroundColor: "#f5f2ed", borderColor: "#d4c9b5", color: "#2e3a20" }}>
              <div className="px-3 py-2">Symptom</div>
              <div className="px-3 py-2">Severity</div>
            </div>
            {symptoms.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] border-b last:border-b-0 items-center" style={{ borderColor: "#e8ddd0" }}>
                <div className="px-3 py-2 text-sm" style={{ color: "#2e3a20" }}>{s}</div>
                <div className="px-3 py-2 flex items-center gap-1 flex-wrap">
                  {ratings.map(r => {
                    const active = val[s] === r;
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => onChange({ ...val, [s]: r })}
                        className="text-xs px-2.5 py-1 rounded-md border transition-colors"
                        style={active
                          ? { backgroundColor: "#2e3a20", color: "#f9f6f0", borderColor: "#2e3a20" }
                          : { backgroundColor: "#fff", color: "#2e3a20", borderColor: "#d4c9b5" }}
                        data-testid={`portal-field-${field.id}-symptom-${i}-${r.toLowerCase()}`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "multi_choice": {
      const cols = (field.layoutJson as any)?.optionColumns ?? 1;
      const colClass = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className={`grid gap-x-4 gap-y-2 ${colClass}`}>
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
    }
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
    case "file_upload":
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <FileUploadField value={value} onChange={onChange} fieldId={String(field.id)} />
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
    case "matrix": {
      const cfg = (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson))
        ? field.optionsJson as { rows: any[]; columns: any[] }
        : { rows: [], columns: [] };
      const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
      const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
      const matrixVal = (typeof value === "object" && value !== null && !Array.isArray(value))
        ? value as Record<string, Record<string, any>>
        : {};
      const setRowCells = (rid: string, patch: Record<string, any>) => {
        onChange({ ...matrixVal, [rid]: { ...(matrixVal[rid] ?? {}), ...patch } });
      };
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
            {field.label}{field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          <div className="border border-gray-300 rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-medium min-w-[160px]" style={{ color: "#2e3a20" }}>{field.label}</th>
                  {cols.map((c: any) => (
                    <th key={c.id} className="px-3 py-2 text-center text-xs font-medium border-l border-gray-200" style={{ color: "#2e3a20" }}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-3 py-1.5 text-sm font-medium bg-gray-50/50" style={{ color: "#2e3a20" }}>{r.label}</td>
                    {cols.map((c: any) => (
                      <td key={c.id} className="px-2 py-1 border-l border-gray-100 text-center align-middle">
                        <MatrixCellInput
                          col={c}
                          row={r}
                          value={matrixVal?.[r.id]?.[c.id]}
                          onChange={(v) => setRowCells(r.id, { [c.id]: v })}
                          matrixVal={matrixVal}
                          cols={cols}
                          setRow={(patch) => setRowCells(r.id, patch)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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

function MatrixCellInput({ col, row, value, onChange, matrixVal, cols, setRow }: {
  col: { id: string; header: string; fieldType: string; placeholder?: string };
  row: { id: string; label: string };
  value: any;
  onChange: (v: any) => void;
  matrixVal: Record<string, Record<string, any>>;
  cols: { id: string; header: string; fieldType: string }[];
  setRow: (patch: Record<string, any>) => void;
}) {
  switch (col.fieldType) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[#2e3a20]"
          data-testid={`portal-matrix-checkbox-${row.id}-${col.id}`}
        />
      );
    case "radio": {
      const selectedColId = cols.find(cc => cc.fieldType === "radio" && matrixVal?.[row.id]?.[cc.id] === true)?.id;
      const isSelected = selectedColId === col.id;
      return (
        <input
          type="radio"
          name={`matrix-${row.id}`}
          checked={isSelected}
          onChange={() => {
            const patch: Record<string, any> = {};
            cols.forEach(cc => { if (cc.fieldType === "radio") patch[cc.id] = cc.id === col.id; });
            setRow(patch);
          }}
          className="h-4 w-4 cursor-pointer accent-[#2e3a20]"
          data-testid={`portal-matrix-radio-${row.id}-${col.id}`}
        />
      );
    }
    case "textarea":
      return (
        <textarea
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={col.placeholder}
          rows={2}
          className="w-full text-sm border border-gray-200 rounded px-1.5 py-1 resize-y"
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={col.placeholder}
          className="w-full text-sm border border-gray-200 rounded px-1.5 py-1"
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded px-1.5 py-1"
        />
      );
    case "dropdown":
      return (
        <input
          type="text"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={col.placeholder}
          className="w-full text-sm border border-gray-200 rounded px-1.5 py-1"
        />
      );
    case "text":
    default:
      return (
        <input
          type="text"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={col.placeholder}
          className="w-full text-sm border border-gray-200 rounded px-1.5 py-1 text-left"
        />
      );
  }
}

interface UploadedFile { name: string; type: string; size: number; dataUrl: string }
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPTED_FILES = "image/*,application/pdf";

function FileUploadField({ value, onChange, fieldId }: { value: any; onChange: (val: any) => void; fieldId: string }) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const files: UploadedFile[] = Array.isArray(value) ? value : [];

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const incoming = Array.from(fileList);
    if (files.length + incoming.length > MAX_FILES) {
      setError(`You can upload up to ${MAX_FILES} files.`);
      return;
    }
    const next: UploadedFile[] = [...files];
    for (const f of incoming) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`"${f.name}" is larger than 10 MB.`);
        continue;
      }
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(f);
      });
      next.push({ name: f.name, type: f.type || "application/octet-stream", size: f.size, dataUrl });
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    onChange(next.length === 0 ? null : next);
  };

  return (
    <div className="space-y-2">
      <label
        className="border-2 border-dashed border-gray-300 rounded-md px-4 py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-gray-400 transition-colors bg-white"
        data-testid={`portal-field-${fieldId}-upload`}
      >
        <Upload className="h-5 w-5 text-gray-500" />
        <span className="text-sm font-medium" style={{ color: "#2e3a20" }}>Click to upload</span>
        <span className="text-xs text-muted-foreground">Images or PDFs, up to 10 MB each (max {MAX_FILES})</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILES}
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
          data-testid={`portal-field-${fieldId}-file-input`}
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded border bg-gray-50 px-2 py-1.5"
              data-testid={`portal-field-${fieldId}-file-${i}`}
            >
              {f.type.startsWith("image/") ? (
                <img src={f.dataUrl} alt={f.name} className="h-8 w-8 rounded object-cover bg-white border" />
              ) : (
                <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{f.name}</p>
                <p className="text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-xs text-red-600 hover:underline flex-shrink-0 px-1.5"
                data-testid={`portal-field-${fieldId}-remove-${i}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

function renderReadOnlyValue(field: FormField, value: any): JSX.Element {
  if (value === null || value === undefined || value === "") {
    return <p className="text-sm italic text-muted-foreground">No response</p>;
  }
  if (field.fieldType === "signature" && typeof value === "string" && value.startsWith("data:image")) {
    return <img src={value} alt="Signature" className="border rounded bg-white max-h-32" />;
  }
  if (field.fieldType === "file_upload" && Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm italic text-muted-foreground">No files uploaded</p>;
    return (
      <ul className="space-y-1.5">
        {(value as Array<{ name: string; type: string; size: number; dataUrl: string }>).map((f, i) => (
          <li key={i} className="flex items-center gap-2 rounded border bg-white px-2 py-1.5">
            {f.type?.startsWith("image/") ? (
              <a href={f.dataUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                <img src={f.dataUrl} alt={f.name} className="h-10 w-10 rounded object-cover border" />
              </a>
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            )}
            <a
              href={f.dataUrl}
              download={f.name}
              className="text-xs underline truncate flex-1 min-w-0"
              style={{ color: "#2e3a20" }}
            >
              {f.name}
            </a>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
          </li>
        ))}
      </ul>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm italic text-muted-foreground">No response</p>;
    return (
      <ul className="list-disc list-inside text-sm space-y-0.5" style={{ color: "#2e3a20" }}>
        {value.map((v, i) => <li key={i}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</li>)}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== "" && v !== null && v !== undefined);
    if (entries.length === 0) return <p className="text-sm italic text-muted-foreground">No response</p>;
    if (field.fieldType === "symptom_checklist") {
      return (
        <div className="border rounded-md overflow-hidden text-sm" style={{ borderColor: "#e8ddd0" }}>
          {entries.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[1fr_auto] border-b last:border-b-0 px-3 py-1.5" style={{ borderColor: "#e8ddd0" }}>
              <span style={{ color: "#2e3a20" }}>{k}</span>
              <span className="font-medium" style={{ color: "#2e3a20" }}>{String(v)}</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="text-sm" style={{ color: "#2e3a20" }}>
            <span className="font-medium">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "boolean") {
    return <p className="text-sm" style={{ color: "#2e3a20" }}>{value ? "Yes" : "No"}</p>;
  }
  return <p className="text-sm whitespace-pre-wrap" style={{ color: "#2e3a20" }}>{String(value)}</p>;
}

export default function PortalForms() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { unreadCount } = usePortalUnreadCount();
  const [fillingAssignmentId, setFillingAssignmentId] = useState<number | null>(null);
  const [viewingSubmissionId, setViewingSubmissionId] = useState<number | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});

  const { data: viewingDetail, isLoading: loadingView } = useQuery<{
    submission: { id: number; submittedAt: string; responses: Record<string, any>; signature: any };
    form: { id: number; name: string; description: string | null };
    fields: FormField[];
  }>({
    queryKey: ["/api/portal/forms/submission", viewingSubmissionId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/forms/submission/${viewingSubmissionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load submission");
      return res.json();
    },
    enabled: !!viewingSubmissionId,
  });

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

  const { data: formDetail, isLoading: loadingDetail } = useQuery<{ form: any; fields: FormField[]; sections: any[]; patient?: { firstName: string; lastName: string; dateOfBirth: string | null; email: string | null } | null }>({
    queryKey: ["/api/portal/forms", fillingAssignmentId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/forms/${fillingAssignmentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load form");
      return res.json();
    },
    enabled: !!fillingAssignmentId,
  });

  // Auto-populate smart demographic fields from the assigned patient profile.
  useEffect(() => {
    if (!formDetail?.patient || !formDetail.fields?.length) return;
    const p = formDetail.patient;
    const prefillBySmartKey: Record<string, string | null> = {
      patient_first_name: p.firstName ?? null,
      patient_last_name: p.lastName ?? null,
      patient_dob: p.dateOfBirth ?? null,
      patient_email: p.email ?? null,
    };
    setResponses(prev => {
      const next = { ...prev };
      let changed = false;
      for (const field of formDetail.fields) {
        if (!field.smartFieldKey) continue;
        const val = prefillBySmartKey[field.smartFieldKey];
        if (val && (next[field.id] === undefined || next[field.id] === "" || next[field.id] === null)) {
          next[field.id] = val;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [formDetail]);

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
    const missing = formDetail.fields.filter(f => {
      if (!f.isRequired || ["heading", "paragraph"].includes(f.fieldType)) return false;
      // Required only applies if conditional logic shows the field
      const logic = (f as any).conditionalLogicJson;
      if (!isFieldVisible(logic, (id) => responses[id])) return false;
      const val = responses[f.id];
      if (!val) return true;
      if (Array.isArray(val) && (val.length === 0 || val.every((v: any) => !v || !String(v).trim()))) return true;
      if (f.fieldType === "family_history_chart" && typeof val === "object" && !Array.isArray(val) && Object.values(val).every((v: any) => !v || !String(v).trim())) return true;
      if (f.fieldType === "symptom_checklist" && Array.isArray(f.optionsJson) && f.optionsJson.length > 0 && (typeof val !== "object" || Array.isArray(val) || Object.values(val).every((v: any) => !v || !String(v).trim()))) return true;
      if (f.fieldType === "matrix" && (typeof val !== "object" || Array.isArray(val) || Object.values(val).every((row: any) => !row || typeof row !== "object" || Object.values(row).every((v: any) => v === undefined || v === null || v === false || (typeof v === "string" && !v.trim()))))) return true;
      return false;
    });
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
              {formDetail.fields.map((field: FormField) => {
                const logic = (field as any).conditionalLogicJson;
                if (!isFieldVisible(logic, (id) => responses[id])) return null;
                return (
                  <PortalFormField
                    key={field.id}
                    field={field}
                    value={responses[field.id]}
                    onChange={val => setResponses(prev => ({ ...prev, [field.id]: val }))}
                  />
                );
              })}
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-xs" style={{ borderColor: "#5a7040", color: "#5a7040" }}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                          </Badge>
                          {assignment.submission?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => setViewingSubmissionId(assignment.submission!.id)}
                              data-testid={`button-view-submission-${assignment.submission.id}`}
                            >
                              View
                            </Button>
                          )}
                        </div>
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-xs" style={{ borderColor: "#5a7040", color: "#5a7040" }}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                          </Badge>
                          {item.submission?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => setViewingSubmissionId(item.submission.id)}
                              data-testid={`button-view-submission-${item.submission.id}`}
                            >
                              View
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* View completed submission modal */}
      {viewingSubmissionId !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: "#ffffff", maxHeight: "90vh" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#ede8df" }}>
              <div className="min-w-0">
                <h2 className="font-semibold text-sm truncate" style={{ color: "#1c2414" }}>
                  {viewingDetail?.form?.name ?? "Loading…"}
                </h2>
                {viewingDetail?.submission?.submittedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted {formatDate(viewingDetail.submission.submittedAt)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setViewingSubmissionId(null)}
                className="p-1 rounded text-muted-foreground"
                data-testid="button-close-view-submission"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
              {loadingView ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#5a7040" }} />
                </div>
              ) : viewingDetail ? (
                <>
                  {viewingDetail.form.description && (
                    <p className="text-sm text-muted-foreground">{viewingDetail.form.description}</p>
                  )}
                  {viewingDetail.fields.map(field => {
                    if (field.fieldType === "heading") {
                      return (
                        <div key={field.id} className="text-sm font-bold pt-1" style={{ color: "#2e3a20" }}>
                          <RichTextView html={field.label || ""} />
                        </div>
                      );
                    }
                    if (field.fieldType === "paragraph") {
                      return (
                        <div key={field.id} className="text-sm" style={{ color: "#2e3a20" }}>
                          <RichTextView html={field.label || ""} />
                        </div>
                      );
                    }
                    if (field.fieldType === "divider" || field.fieldType === "section_break") {
                      return <hr key={field.id} className="my-1" style={{ borderColor: "#ede8df" }} />;
                    }
                    if (field.fieldType === "spacer") {
                      return <div key={field.id} className="h-3" />;
                    }
                    if (field.fieldType === "signature") {
                      const responses = viewingDetail.submission.responses ?? {};
                      const fromResp = responses[field.fieldKey] ?? responses[String(field.id)];
                      const fromSig = viewingDetail.submission.signature;
                      let sigVal: any = (typeof fromResp === "string" && fromResp.startsWith("data:image"))
                        ? fromResp
                        : (typeof fromSig === "string" && fromSig.startsWith("data:image"))
                          ? fromSig
                          : null;
                      if (!sigVal && viewingDetail.submission.responses && typeof viewingDetail.submission.responses === "object") {
                        for (const v of Object.values(viewingDetail.submission.responses)) {
                          if (typeof v === "string" && v.startsWith("data:image")) { sigVal = v; break; }
                        }
                      }
                      const isImg = typeof sigVal === "string" && sigVal.startsWith("data:image");
                      return (
                        <div key={field.id} className="space-y-1.5">
                          <p className="text-sm font-medium" style={{ color: "#2e3a20" }}>{field.label}</p>
                          {isImg ? (
                            <img src={sigVal} alt="Signature" className="border rounded bg-white max-h-32" />
                          ) : (
                            <p className="text-sm italic text-muted-foreground">No signature provided</p>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={field.id} className="space-y-1.5">
                        <p className="text-sm font-medium" style={{ color: "#2e3a20" }}>{field.label}</p>
                        {renderReadOnlyValue(field, viewingDetail.submission.responses?.[field.fieldKey] ?? viewingDetail.submission.responses?.[String(field.id)])}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                  <p className="text-sm text-muted-foreground">Failed to load submission.</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t" style={{ borderColor: "#ede8df" }}>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setViewingSubmissionId(null)}
                data-testid="button-close-view-footer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

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
