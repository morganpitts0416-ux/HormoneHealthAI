import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  FlaskConical, Plus, Trash2, ChevronDown, ChevronUp,
  Sparkles, CheckCircle2, ArrowLeft, User, CalendarDays, Loader2,
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
  const [labDate, setLabDate] = useState(new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<LabEntry[]>([emptyEntry()]);
  const [notes, setNotes] = useState("");
  const [showCommonLabs, setShowCommonLabs] = useState(false);
  const [savedResult, setSavedResult] = useState<SimpleLabUpload | null>(null);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const res = await fetch("/api/patients", { credentials: "include" });
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
  };

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
            Upload More Labs
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
            Quick Lab Upload
          </h1>
          <p className="text-sm text-muted-foreground">
            Add labs to a patient's chart for trending — no full evaluation needed
          </p>
        </div>
      </div>

      {/* Patient + Date row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="patient-select">Patient</Label>
          <Select
            value={selectedPatientId ? String(selectedPatientId) : ""}
            onValueChange={(v) => setSelectedPatientId(parseInt(v))}
          >
            <SelectTrigger id="patient-select" data-testid="select-patient">
              <SelectValue placeholder="Select patient…" />
            </SelectTrigger>
            <SelectContent>
              {patients.map((p) => (
                <SelectItem key={p.id} value={String(p.id)} data-testid={`option-patient-${p.id}`}>
                  {p.firstName} {p.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="grid grid-cols-12 gap-2 px-1">
          <span className="col-span-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Lab Name</span>
          <span className="col-span-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Value</span>
          <span className="col-span-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit</span>
          <span className="col-span-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ref Range</span>
          <span className="col-span-1" />
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
          placeholder="Context about these labs — e.g. follow-up after supplementation, fasting sample, etc."
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
          disabled={saveMutation.isPending}
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
