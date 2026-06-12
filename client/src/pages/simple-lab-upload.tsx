import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { parseDateOnlyStr } from "@/lib/date-utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import {
  FlaskConical, Plus, Trash2, ChevronDown, ChevronUp,
  Sparkles, CheckCircle2, ArrowLeft, User, CalendarDays, Loader2,
  Upload, FileText, X, ChevronsUpDown, Check,
} from "lucide-react";
import type { Patient, SimpleLabUpload } from "@shared/schema";

const COMMON_LABS = [
  "Vitamin D (25-OH)", "Vitamin B12", "Folate", "Ferritin", "Iron", "TIBC",
  "TSH", "Free T4", "Free T3", "Reverse T3", "Anti-TPO",
  "HbA1c", "Fasting Glucose", "Fasting Insulin",
  "Total Cholesterol", "LDL", "HDL", "Triglycerides", "ApoB",
  "ALT", "AST", "ALP", "GGT", "Total Bilirubin",
  "BUN", "Creatinine", "eGFR",
  "Sodium", "Potassium", "Calcium", "Magnesium", "Phosphorus",
  "WBC", "RBC", "Hemoglobin", "Hematocrit", "Platelets",
  "CRP", "hs-CRP", "ESR", "Homocysteine", "Fibrinogen",
  "Testosterone Total", "Testosterone Free", "PSA", "SHBG", "LH", "FSH",
  "Estradiol", "Progesterone", "DHEA-S", "Cortisol (AM)", "Prolactin",
  "IGF-1", "Uric Acid", "Vitamin A", "Zinc", "Copper",
];

// Maps the camelCase keys returned by /api/extract-pdf-labs to
// human-readable lab names + default units for the entry table.
const EXTRACTED_FIELD_MAP: Record<string, { name: string; unit: string }> = {
  hemoglobin:          { name: "Hemoglobin",         unit: "g/dL" },
  hematocrit:          { name: "Hematocrit",          unit: "%" },
  rbc:                 { name: "RBC",                 unit: "M/µL" },
  wbc:                 { name: "WBC",                 unit: "K/µL" },
  platelets:           { name: "Platelets",           unit: "K/µL" },
  mcv:                 { name: "MCV",                 unit: "fL" },
  ast:                 { name: "AST",                 unit: "U/L" },
  alt:                 { name: "ALT",                 unit: "U/L" },
  bilirubin:           { name: "Total Bilirubin",     unit: "mg/dL" },
  alkalinePhosphatase: { name: "ALP",                 unit: "U/L" },
  creatinine:          { name: "Creatinine",          unit: "mg/dL" },
  egfr:                { name: "eGFR",                unit: "mL/min/1.73m²" },
  bun:                 { name: "BUN",                 unit: "mg/dL" },
  sodium:              { name: "Sodium",              unit: "mEq/L" },
  potassium:           { name: "Potassium",           unit: "mEq/L" },
  chloride:            { name: "Chloride",            unit: "mEq/L" },
  co2:                 { name: "CO2",                 unit: "mEq/L" },
  glucose:             { name: "Fasting Glucose",     unit: "mg/dL" },
  calcium:             { name: "Calcium",             unit: "mg/dL" },
  magnesium:           { name: "Magnesium",           unit: "mg/dL" },
  albumin:             { name: "Albumin",             unit: "g/dL" },
  totalProtein:        { name: "Total Protein",       unit: "g/dL" },
  ldl:                 { name: "LDL",                 unit: "mg/dL" },
  hdl:                 { name: "HDL",                 unit: "mg/dL" },
  totalCholesterol:    { name: "Total Cholesterol",   unit: "mg/dL" },
  triglycerides:       { name: "Triglycerides",       unit: "mg/dL" },
  apoB:                { name: "ApoB",                unit: "mg/dL" },
  lpa:                 { name: "Lp(a)",               unit: "nmol/L" },
  testosterone:        { name: "Testosterone Total",  unit: "ng/dL" },
  freeTestosterone:    { name: "Testosterone Free",   unit: "pg/mL" },
  bioavailableTestosterone: { name: "Testosterone Bioavailable", unit: "ng/dL" },
  estradiol:           { name: "Estradiol",           unit: "pg/mL" },
  progesterone:        { name: "Progesterone",        unit: "ng/mL" },
  lh:                  { name: "LH",                  unit: "mIU/mL" },
  fsh:                 { name: "FSH",                 unit: "mIU/mL" },
  prolactin:           { name: "Prolactin",           unit: "ng/mL" },
  shbg:                { name: "SHBG",                unit: "nmol/L" },
  dheas:               { name: "DHEA-S",              unit: "µg/dL" },
  amh:                 { name: "AMH",                 unit: "ng/mL" },
  tsh:                 { name: "TSH",                 unit: "mIU/L" },
  freeT4:              { name: "Free T4",             unit: "ng/dL" },
  freeT3:              { name: "Free T3",             unit: "pg/mL" },
  tpoAntibodies:       { name: "Anti-TPO",            unit: "IU/mL" },
  iron:                { name: "Iron",                unit: "µg/dL" },
  tibc:                { name: "TIBC",                unit: "µg/dL" },
  ironSaturation:      { name: "Iron Saturation",     unit: "%" },
  ferritin:            { name: "Ferritin",            unit: "ng/mL" },
  vitaminD:            { name: "Vitamin D (25-OH)",   unit: "ng/mL" },
  vitaminB12:          { name: "Vitamin B12",         unit: "pg/mL" },
  folate:              { name: "Folate",              unit: "ng/mL" },
  hsCRP:               { name: "hs-CRP",             unit: "mg/L" },
  a1c:                 { name: "HbA1c",              unit: "%" },
  psa:                 { name: "PSA",                 unit: "ng/mL" },
};

type LabEntry = { name: string; value: string; unit: string; referenceRange: string };
const emptyEntry = (): LabEntry => ({ name: "", value: "", unit: "", referenceRange: "" });

export default function SimpleLabUpload() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const initialPatientId = new URLSearchParams(search).get("patientId");
  const { toast } = useToast();

  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    initialPatientId ? parseInt(initialPatientId) : null
  );
  const [patientComboOpen, setPatientComboOpen] = useState(false);
  const [labDate, setLabDate] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dy}`;
  });
  const [entries, setEntries] = useState<LabEntry[]>([emptyEntry()]);
  const [notes, setNotes] = useState("");
  const [showCommonLabs, setShowCommonLabs] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [savedResult, setSavedResult] = useState<SimpleLabUpload | null>(null);

  // PDF upload state
  const [isDragging, setIsDragging] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedCount, setExtractedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients/search"],
    queryFn: async () => {
      const res = await fetch("/api/patients/search", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch patients");
      return res.json();
    },
  });

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;

  const saveMutation = useMutation({
    mutationFn: async (data: { labDate: string; entries: LabEntry[]; notes: string | null }) => {
      const res = await apiRequest("POST", `/api/patients/${selectedPatientId}/simple-labs`, data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      return res.json() as Promise<SimpleLabUpload>;
    },
    onSuccess: (data) => {
      setSavedResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatientId, "simple-labs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Lab values saved", description: "Added to patient chart for trending." });
    },
    onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!selectedPatientId) {
      toast({ title: "Select a patient first", variant: "destructive" });
      return;
    }
    const valid = entries.filter((e) => e.name.trim() && e.value.trim());
    if (valid.length === 0) {
      toast({ title: "Add at least one lab value", description: "Name and value are required.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ labDate: new Date(labDate + "T12:00:00").toISOString(), entries: valid, notes: notes.trim() || null });
  };

  const addEntry = () => setEntries((e) => [...e, emptyEntry()]);
  const removeEntry = (i: number) => setEntries((e) => e.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, field: keyof LabEntry, val: string) =>
    setEntries((e) => e.map((entry, idx) => (idx === i ? { ...entry, [field]: val } : entry)));

  const addCommonLab = (name: string) => {
    const existing = entries.findIndex((e) => e.name === name);
    if (existing >= 0) return;
    setEntries((e) => {
      const blank = e.findIndex((row) => !row.name.trim());
      if (blank >= 0) return e.map((row, i) => (i === blank ? { ...row, name } : row));
      return [...e, { name, value: "", unit: "", referenceRange: "" }];
    });
  };

  const handleAddAnother = () => {
    setSavedResult(null);
    setEntries([emptyEntry()]);
    setNotes("");
    setExtractedCount(null);
    setPdfFile(null);
  };

  // ── PDF extraction ──────────────────────────────────────────────────────────
  const handlePdfFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10 MB.", variant: "destructive" });
      return;
    }
    setPdfFile(file);
    setExtracting(true);
    setExtractedCount(null);

    try {
      const fd = new FormData();
      fd.append("pdf", file);
      if (selectedPatientId) fd.append("patientId", String(selectedPatientId));
      const res = await fetch("/api/extract-pdf-labs", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Extraction failed");
      }
      const { data } = await res.json();

      // Map extracted values → LabEntry rows
      const extracted: LabEntry[] = Object.entries(data as Record<string, unknown>)
        .filter(([key, val]) =>
          typeof val === "number" &&
          !["patientName", "dateOfBirth", "collectionDate"].includes(key) &&
          EXTRACTED_FIELD_MAP[key]
        )
        .map(([key, val]) => ({
          name: EXTRACTED_FIELD_MAP[key].name,
          value: String(val),
          unit: EXTRACTED_FIELD_MAP[key].unit,
          referenceRange: "",
        }));

      if (extracted.length === 0) {
        toast({ title: "No values found", description: "The AI couldn't identify lab values in this PDF. Try entering them manually.", variant: "destructive" });
        setExtracting(false);
        return;
      }

      // Auto-fill lab date if the PDF contained a collection date.
      // collectionDate arrives as YYYY-MM-DD or MM/DD/YYYY from the AI.
      // parseDateOnlyStr handles both formats without going through Date
      // local getters, which would shift YYYY-MM-DD strings one day back
      // in US timezones (those strings parse as UTC midnight in JS).
      if (data.collectionDate) {
        const parsed = parseDateOnlyStr(String(data.collectionDate));
        if (parsed) {
          setLabDate(parsed);
        }
      }

      // Merge with any existing manually-entered rows (keep non-blank ones)
      setEntries((prev) => {
        const manual = prev.filter((e) => e.name.trim());
        const names = new Set(manual.map((e) => e.name));
        const fresh = extracted.filter((e) => !names.has(e.name));
        return manual.length > 0 ? [...manual, ...fresh] : fresh;
      });

      setExtractedCount(extracted.length);
      setShowUploadZone(false);
      toast({ title: `${extracted.length} values extracted`, description: "Review and edit below, then save." });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePdfFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handlePdfFile(file);
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (savedResult) {
    const patientName = selectedPatient
      ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
      : "Patient";
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <div>
            <h2 className="text-lg font-semibold">Saved to {patientName}'s chart</h2>
            <p className="text-sm text-muted-foreground">
              {savedResult.entries.length} value{savedResult.entries.length !== 1 ? "s" : ""} added ·{" "}
              {new Date(savedResult.labDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        {savedResult.aiInsight && (
          <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                Brief Insight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{savedResult.aiInsight}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4">
            <div className="space-y-1">
              {(savedResult.entries as LabEntry[]).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-muted-foreground">
                    {e.value}{e.unit ? ` ${e.unit}` : ""}
                    {e.referenceRange ? ` (ref: ${e.referenceRange})` : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleAddAnother} variant="outline" data-testid="button-add-another-upload">
            <Plus className="h-4 w-4 mr-2" />
            Add More Labs
          </Button>
          <Button
            onClick={() => setLocation(`/patients?patientId=${selectedPatientId}`)}
            data-testid="button-go-to-patient"
          >
            <User className="h-4 w-4 mr-2" />
            View Patient Chart
          </Button>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/dashboard")} data-testid="button-back-dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Point of Care Lab Entry
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter labs manually or upload a PDF report to extract values automatically
          </p>
        </div>
      </div>

      {/* Patient + Date row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="patient-combo-trigger">Patient</Label>
          <Popover open={patientComboOpen} onOpenChange={setPatientComboOpen}>
            <PopoverTrigger asChild>
              <Button
                id="patient-combo-trigger"
                variant="outline"
                role="combobox"
                aria-expanded={patientComboOpen}
                className="w-full justify-between font-normal"
                data-testid="select-patient"
              >
                <span className="truncate">
                  {selectedPatient
                    ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                    : "Search patient…"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Type a name to search…" data-testid="input-patient-search" />
                <CommandList>
                  <CommandEmpty>No patients found.</CommandEmpty>
                  <CommandGroup>
                    {patients.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.firstName} ${p.lastName}`}
                        onSelect={() => {
                          setSelectedPatientId(p.id);
                          setPatientComboOpen(false);
                        }}
                        data-testid={`option-patient-${p.id}`}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${selectedPatientId === p.id ? "opacity-100" : "opacity-0"}`}
                        />
                        {p.firstName} {p.lastName}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-date">Lab Date</Label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              id="lab-date"
              type="date"
              value={labDate}
              onChange={(e) => setLabDate(e.target.value)}
              className="pl-9"
              data-testid="input-lab-date"
            />
          </div>
        </div>
      </div>

      {/* Extracted-from-PDF banner */}
      {extractedCount !== null && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2">
          <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300 flex-1">
            <span className="font-medium">{extractedCount} values extracted</span> from {pdfFile?.name ?? "PDF"} — review and edit below before saving.
          </p>
          <button
            onClick={() => { setExtractedCount(null); setPdfFile(null); }}
            className="text-blue-500 hover:text-blue-700"
            data-testid="button-dismiss-extract-banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Upload PDF section */}
      <div className="rounded-md border">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/40 transition-colors"
          onClick={() => setShowUploadZone((v) => !v)}
          data-testid="button-toggle-upload-zone"
        >
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            Upload lab report PDF
            <span className="text-xs font-normal text-muted-foreground">— AI extracts values automatically</span>
          </span>
          {showUploadZone ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showUploadZone && (
          <div className="px-4 pb-4 border-t pt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={onFileInputChange}
              data-testid="input-pdf-file"
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => !extracting && fileInputRef.current?.click()}
              data-testid="dropzone-pdf"
              className={`
                flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed
                p-8 text-center cursor-pointer transition-colors
                ${isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
                }
                ${extracting ? "pointer-events-none opacity-70" : ""}
              `}
            >
              {extracting ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm font-medium">Extracting lab values…</p>
                  <p className="text-xs text-muted-foreground">AI is reading the report — this takes a few seconds</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Drop a PDF here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports standard lab report PDFs from LabCorp, Quest, and most reference labs · Max 10 MB
                    </p>
                  </div>
                  {pdfFile && (
                    <Badge variant="outline" className="gap-1.5">
                      <FileText className="h-3 w-3" />
                      {pdfFile.name}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Common labs quick-add */}
      <div className="rounded-md border">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/40 transition-colors"
          onClick={() => setShowCommonLabs((v) => !v)}
          data-testid="button-toggle-common-labs"
        >
          <span className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            Quick-add common labs
          </span>
          {showCommonLabs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showCommonLabs && (
          <div className="px-4 pb-4 border-t">
            <div className="flex flex-wrap gap-1.5 mt-3">
              {COMMON_LABS.map((lab) => {
                const already = entries.some((e) => e.name === lab);
                return (
                  <button
                    key={lab}
                    onClick={() => addCommonLab(lab)}
                    disabled={already}
                    data-testid={`button-common-lab-${lab.replace(/\s+/g, "-")}`}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      already
                        ? "opacity-40 cursor-not-allowed bg-muted"
                        : "hover:bg-primary hover:text-primary-foreground hover:border-primary"
                    }`}
                  >
                    {already ? <CheckCircle2 className="inline h-3 w-3 mr-1" /> : null}
                    {lab}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Lab entry table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="grid grid-cols-12 gap-2 flex-1">
            <span className="col-span-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Lab Name</span>
            <span className="col-span-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Value</span>
            <span className="col-span-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit</span>
            <span className="col-span-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ref Range</span>
            <span className="col-span-1" />
          </div>
        </div>
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`lab-entry-row-${i}`}>
              <Input
                className="col-span-4 text-sm"
                placeholder="e.g. Vitamin D"
                value={entry.name}
                onChange={(e) => updateEntry(i, "name", e.target.value)}
                data-testid={`input-lab-name-${i}`}
              />
              <Input
                className="col-span-2 text-sm font-mono"
                placeholder="42"
                value={entry.value}
                onChange={(e) => updateEntry(i, "value", e.target.value)}
                data-testid={`input-lab-value-${i}`}
              />
              <Input
                className="col-span-2 text-sm"
                placeholder="ng/mL"
                value={entry.unit}
                onChange={(e) => updateEntry(i, "unit", e.target.value)}
                data-testid={`input-lab-unit-${i}`}
              />
              <Input
                className="col-span-3 text-sm"
                placeholder="30–100"
                value={entry.referenceRange}
                onChange={(e) => updateEntry(i, "referenceRange", e.target.value)}
                data-testid={`input-lab-ref-${i}`}
              />
              <Button
                size="icon"
                variant="ghost"
                className="col-span-1"
                onClick={() => removeEntry(i)}
                disabled={entries.length === 1}
                data-testid={`button-remove-entry-${i}`}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addEntry} className="mt-1" data-testid="button-add-entry-row">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Row
        </Button>
      </div>

      <Separator />

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          id="notes"
          placeholder="Context about these labs — e.g. follow-up after supplementation, fasting sample, point-of-care, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="resize-none"
          rows={2}
          data-testid="textarea-notes"
        />
      </div>

      {/* Action */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending || !selectedPatientId}
          data-testid="button-save-quick-labs"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving & generating insight…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Save & Get Insight
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          A brief AI comparison to previous values will be generated automatically.
        </p>
      </div>
    </div>
  );
}
