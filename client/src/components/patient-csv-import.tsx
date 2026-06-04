import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, CheckCircle2, XCircle, AlertTriangle,
  ArrowRight, Users, SkipForward,
} from "lucide-react";

// ── Patient fields available for CSV mapping ──────────────────────────────────
const PATIENT_FIELDS: { value: string; label: string; required?: boolean }[] = [
  { value: "firstName",        label: "First Name",        required: true },
  { value: "lastName",         label: "Last Name",         required: true },
  { value: "dateOfBirth",      label: "Date of Birth" },
  { value: "gender",           label: "Sex / Gender" },
  { value: "mrn",              label: "MRN / Chart #" },
  { value: "email",            label: "Email" },
  { value: "phone",            label: "Phone" },
  { value: "ssn",              label: "SSN" },
  { value: "insuranceCarrier", label: "Insurance Carrier" },
  { value: "insuranceMemberId",label: "Insurance Member ID" },
  { value: "driversLicense",   label: "Driver's License" },
  { value: "primaryProvider",  label: "Primary Provider" },
];

// ── Auto-suggest mapping from common CSV header names ────────────────────────
function autoSuggestField(header: string): string {
  const h = header.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
  if (/^first/.test(h) || h === "fname" || h === "given name")     return "firstName";
  if (/^last/.test(h) || h === "lname" || h === "surname" || h === "family name") return "lastName";
  if (/dob|date.?of.?birth|birthdate|birth.?date/.test(h))         return "dateOfBirth";
  if (/^(sex|gender)/.test(h))                                      return "gender";
  if (/mrn|medical.?record|chart.?(num|no|number|#)|patient.?id/.test(h)) return "mrn";
  if (/e.?mail/.test(h))                                            return "email";
  if (/phone|mobile|cell|telephone/.test(h))                        return "phone";
  if (/ssn|social.?security/.test(h))                               return "ssn";
  if (/insurance.?carrier|payer|ins\.?$/.test(h))                   return "insuranceCarrier";
  if (/member.?(id|no|num|#)|insurance.?(id|no|num|#)/.test(h))    return "insuranceMemberId";
  if (/driver|d\.?l\.?/.test(h))                                    return "driversLicense";
  if (/provider|physician|clinician|doctor/.test(h))                return "primaryProvider";
  return "__skip__";
}

// ── Import result type ────────────────────────────────────────────────────────
interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// ── Steps ─────────────────────────────────────────────────────────────────────
type Step = "upload" | "map" | "preview" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PatientCsvImport({ open, onClose }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // csvHeader → patientField
  const [result, setResult] = useState<ImportResult | null>(null);

  // ── Reset when dialog closes ────────────────────────────────────────────────
  function reset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── Parse uploaded CSV ──────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Invalid file", description: "Please upload a .csv file.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const hdrs = result.meta.fields ?? [];
        const parsedRows = result.data as Record<string, string>[];
        setHeaders(hdrs);
        setRows(parsedRows);
        // Auto-suggest column mapping
        const autoMap: Record<string, string> = {};
        hdrs.forEach(h => { autoMap[h] = autoSuggestField(h); });
        setMapping(autoMap);
        setStep("map");
      },
      error: (err) => {
        toast({ title: "Parse error", description: err.message, variant: "destructive" });
      },
    });
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Import mutation ─────────────────────────────────────────────────────────
  const importMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/patients/import", { rows, mapping });
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/patients/search"] });
      if (data.imported > 0) {
        toast({ title: `Import complete`, description: `${data.imported} patient${data.imported !== 1 ? "s" : ""} added.` });
      }
    },
    onError: () => {
      toast({ title: "Import failed", description: "Something went wrong. Please try again.", variant: "destructive" });
    },
  });

  // ── Derived state ───────────────────────────────────────────────────────────
  const mappedFields = Object.values(mapping).filter(v => v !== "__skip__");
  const hasFirstName = mappedFields.includes("firstName");
  const hasLastName  = mappedFields.includes("lastName");
  const canImport    = hasFirstName && hasLastName;

  // Deduplicate mapped fields for validation (each patient field can only be mapped once)
  const usedFields = Object.values(mapping).filter(v => v !== "__skip__");
  const fieldUsedBy: Record<string, string[]> = {};
  Object.entries(mapping).forEach(([hdr, field]) => {
    if (field !== "__skip__") {
      if (!fieldUsedBy[field]) fieldUsedBy[field] = [];
      fieldUsedBy[field].push(hdr);
    }
  });
  const hasDuplicateMapping = Object.values(fieldUsedBy).some(hdrs => hdrs.length > 1);

  // Preview rows (first 5)
  const previewRows = rows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Import Patients from CSV
          </DialogTitle>
        </DialogHeader>

        {/* ── Step indicator ────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
          {(["upload","map","preview","done"] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <ArrowRight className="w-3 h-3" />}
              <span className={step === s ? "font-semibold text-foreground" : ""}>
                {s === "upload" ? "1. Upload" : s === "map" ? "2. Map Columns" : s === "preview" ? "3. Preview" : "4. Done"}
              </span>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1">

          {/* ── Step 1: Upload ─────────────────────────────────────────── */}
          {step === "upload" && (
            <div
              className="border-2 border-dashed rounded-md p-12 flex flex-col items-center gap-3 cursor-pointer hover-elevate transition-colors"
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-csv-import"
            >
              <Upload className="w-10 h-10 text-muted-foreground" />
              <p className="font-medium">Drop a CSV file here, or click to browse</p>
              <p className="text-sm text-muted-foreground text-center">
                Export patients from your current system as a .csv file, then upload it here.
                <br />Column names will be auto-detected — you'll confirm the mapping before anything is imported.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                data-testid="input-csv-file"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* ── Step 2: Map Columns ────────────────────────────────────── */}
          {step === "map" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4 shrink-0" />
                <span><span className="font-medium text-foreground">{fileName}</span> — {rows.length.toLocaleString()} rows detected</span>
              </div>

              {!canImport && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Map at least <strong>First Name</strong> and <strong>Last Name</strong> to continue.
                  </span>
                </div>
              )}

              {hasDuplicateMapping && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Each patient field can only be mapped to one column.</span>
                </div>
              )}

              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-2 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground gap-4">
                  <span>CSV Column</span>
                  <span>Map to Patient Field</span>
                </div>
                <div className="divide-y">
                  {headers.map(hdr => {
                    const currentVal = mapping[hdr] ?? "__skip__";
                    const isDuplicate = currentVal !== "__skip__" &&
                      fieldUsedBy[currentVal] &&
                      fieldUsedBy[currentVal].length > 1;
                    return (
                      <div
                        key={hdr}
                        className={`grid grid-cols-2 items-center gap-4 px-3 py-2 ${isDuplicate ? "bg-destructive/5" : ""}`}
                      >
                        <div className="text-sm font-mono truncate" title={hdr}>
                          {hdr}
                          {hdr && rows[0]?.[hdr] && (
                            <span className="ml-2 text-xs text-muted-foreground font-sans">
                              e.g. "{String(rows[0][hdr]).slice(0, 30)}"
                            </span>
                          )}
                        </div>
                        <Select
                          value={currentVal}
                          onValueChange={val => setMapping(m => ({ ...m, [hdr]: val }))}
                        >
                          <SelectTrigger className="text-sm" data-testid={`select-map-${hdr}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">
                              <span className="flex items-center gap-2 text-muted-foreground">
                                <SkipForward className="w-3.5 h-3.5" /> Skip this column
                              </span>
                            </SelectItem>
                            {PATIENT_FIELDS.map(f => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}{f.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">* Required fields</p>
            </div>
          )}

          {/* ── Step 3: Preview ────────────────────────────────────────── */}
          {step === "preview" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Showing the first {Math.min(5, rows.length)} of{" "}
                <strong>{rows.length}</strong> rows. Existing patients with the
                same name and date of birth (or same MRN) will be skipped automatically.
              </p>

              <div className="border rounded-md overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {PATIENT_FIELDS
                        .filter(f => usedFields.includes(f.value))
                        .map(f => (
                          <th key={f.value} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {f.label}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewRows.map((row, ri) => {
                      // Build a display row from the mapping
                      const mapped: Record<string, string> = {};
                      Object.entries(mapping).forEach(([hdr, field]) => {
                        if (field !== "__skip__") mapped[field] = row[hdr] ?? "";
                      });
                      return (
                        <tr key={ri} className="hover:bg-muted/50">
                          {PATIENT_FIELDS
                            .filter(f => usedFields.includes(f.value))
                            .map(f => (
                              <td key={f.value} className="px-2 py-1.5 font-mono text-foreground">
                                {mapped[f.value] || <span className="text-muted-foreground italic">—</span>}
                              </td>
                            ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {rows.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  …and {rows.length - 5} more row{rows.length - 5 !== 1 ? "s" : ""}
                </p>
              )}

              <div className="rounded-md bg-muted/60 px-3 py-2 text-sm space-y-1">
                <p className="font-medium">Before you import:</p>
                <ul className="text-muted-foreground space-y-0.5 list-disc list-inside text-xs">
                  <li>This will only <strong>add</strong> new patients — existing profiles are never changed.</li>
                  <li>Duplicates (matched by name + DOB, or MRN) will be skipped and reported.</li>
                  <li>Any column you marked "Skip" will simply be left blank on the new profile.</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ───────────────────────────────────────────── */}
          {step === "done" && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border bg-card p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                  <p className="text-xs text-muted-foreground mt-1">Patients imported</p>
                </div>
                <div className="rounded-md border bg-card p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
                  <p className="text-xs text-muted-foreground mt-1">Skipped (duplicates)</p>
                </div>
                <div className="rounded-md border bg-card p-4 text-center">
                  <p className="text-2xl font-bold text-destructive">{result.errors.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Errors</p>
                </div>
              </div>

              {result.imported > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-800 dark:text-green-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{result.imported} patient profile{result.imported !== 1 ? "s" : ""} added to your clinic.</span>
                </div>
              )}

              {result.skipped > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped — already exist in your patient list.</span>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" /> Rows with errors
                  </p>
                  <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground shrink-0">Row {e.row}</span>
                        <span className="text-destructive">{e.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer buttons ─────────────────────────────────────────────── */}
        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}

          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={!canImport || hasDuplicateMapping}
                data-testid="button-csv-next-preview"
              >
                Preview Import
              </Button>
            </>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
              <Button
                onClick={() => importMut.mutate()}
                disabled={importMut.isPending}
                data-testid="button-csv-run-import"
              >
                {importMut.isPending ? "Importing…" : `Import ${rows.length.toLocaleString()} Patients`}
              </Button>
            </>
          )}

          {step === "done" && (
            <Button onClick={handleClose} data-testid="button-csv-done">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
