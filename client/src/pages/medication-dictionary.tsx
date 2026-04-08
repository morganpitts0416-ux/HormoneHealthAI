import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Upload, Trash2, ChevronLeft, FileText, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, BookOpen, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import type { MedicationDictionary } from "@shared/schema";

const EXPECTED_COLUMNS = [
  { col: "generic_name", required: true, desc: "Canonical generic drug name (e.g. tirzepatide)" },
  { col: "brand_names", required: false, desc: "Brand names — pipe-separated (e.g. Mounjaro|Zepbound)" },
  { col: "common_spoken_variants", required: false, desc: "How clinicians say it aloud (e.g. tirza|tirzep)" },
  { col: "common_misspellings", required: false, desc: "Common transcription errors (e.g. tersapeptide)" },
  { col: "drug_class", required: false, desc: "Pharmacological class (e.g. GLP-1 Receptor Agonist)" },
  { col: "subclass", required: false, desc: "Subclass (e.g. GIP/GLP-1 Dual Agonist)" },
  { col: "route", required: false, desc: "Route of administration (e.g. subcutaneous)" },
  { col: "notes", required: false, desc: "Clinical notes or context" },
];

function formatDate(ts: string | Date) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MedicationDictionaryPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: dictionaries = [], isLoading } = useQuery<MedicationDictionary[]>({
    queryKey: ["/api/medication-dictionary"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/medication-dictionary/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/medication-dictionary"] });
      toast({ title: "Dictionary uploaded", description: `${data.entryCount} medication entries imported from ${data.filename}.` });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/medication-dictionary/${id}`);
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/medication-dictionary"] });
      toast({ title: "Dictionary deleted" });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast({ title: "CSV files only", description: "Please upload a .csv file.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const totalEntries = dictionaries.reduce((s, d) => s + d.entryCount, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/dashboard")} data-testid="button-back-med-dict">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Medication Dictionary</h1>
          <p className="text-sm text-muted-foreground">
            Upload a curated CSV to improve transcription normalization.
            {totalEntries > 0 && <span className="ml-1">{totalEntries} entries across {dictionaries.length} {dictionaries.length === 1 ? "file" : "files"}.</span>}
          </p>
        </div>
      </div>

      {/* Upload area */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            data-testid="drop-zone-med-csv"
            className={`border-2 border-dashed rounded-md p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              data-testid="input-csv-file"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Parsing and importing…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="w-8 h-8 opacity-40" />
                <div>
                  <p className="text-sm font-medium">Drop a CSV file here or click to browse</p>
                  <p className="text-xs mt-0.5">Max 5 MB · Must include a <code className="font-mono bg-muted px-1 rounded">generic_name</code> column</p>
                </div>
              </div>
            )}
          </div>

          {/* Column reference */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Expected CSV Columns</p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Column</th>
                    <th className="text-left px-3 py-2 font-semibold">Description</th>
                    <th className="text-left px-3 py-2 font-semibold">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPECTED_COLUMNS.map((c, i) => (
                    <tr key={c.col} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-3 py-1.5 font-mono text-primary/80">{c.col}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{c.desc}</td>
                      <td className="px-3 py-1.5">
                        {c.required
                          ? <Badge variant="secondary" className="text-[10px] py-0">Required</Badge>
                          : <span className="text-muted-foreground/60">Optional</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Array fields (brand_names, common_spoken_variants, common_misspellings) can be pipe-separated
              <span className="font-mono mx-1">|</span> or semicolon-separated within a quoted cell.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded dictionaries */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Uploaded Dictionaries</h2>

        {isLoading && (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
        )}

        {!isLoading && dictionaries.length === 0 && (
          <div className="rounded-md border border-dashed py-8 text-center">
            <BookOpen className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No dictionaries uploaded yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Upload a CSV to enable medication recognition in encounter transcripts.</p>
          </div>
        )}

        {dictionaries.map(dict => (
          <Card key={dict.id} data-testid={`card-med-dict-${dict.id}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3 flex-wrap">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{dict.filename}</p>
                  <p className="text-xs text-muted-foreground">{dict.entryCount} entries · uploaded {formatDate(dict.uploadedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setExpandedId(expandedId === dict.id ? null : dict.id)}
                    data-testid={`button-expand-dict-${dict.id}`}
                    title={expandedId === dict.id ? "Collapse" : "Expand details"}
                  >
                    {expandedId === dict.id
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { if (confirm("Delete this dictionary and all its entries?")) deleteMutation.mutate(dict.id); }}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-dict-${dict.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {expandedId === dict.id && (
                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground space-y-1">
                  <p><span className="font-medium text-foreground">{dict.entryCount}</span> medication entries imported.</p>
                  <p>These entries are scanned whenever you run medication detection in the Encounters workflow.</p>
                  <p>To update this dictionary, delete it and re-upload an updated CSV.</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* How it works */}
      <Card>
        <CardContent className="py-4 px-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How Medication Recognition Works</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>Exact matches on generic names score 100% confidence.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>Brand name matches score 95% — spoken variants 85% — misspellings 75%.</span></div>
            <div className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" /><span>Fuzzy matches (off-by-1 or 2 characters) score below 75% and are flagged for clinician review — the app never silently assumes.</span></div>
            <div className="flex gap-2"><Plus className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" /><span>Upload multiple dictionaries — all entries are combined and scanned together.</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
