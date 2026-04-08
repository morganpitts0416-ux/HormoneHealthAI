import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Upload, Trash2, ChevronLeft, FileText, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, BookOpen, Plus, Search, X, Pencil,
  Pill, Tag, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import type { MedicationDictionary, MedicationEntry } from "@shared/schema";

type EnrichedEntry = MedicationEntry & { dictFilename: string; isManual: boolean };

const MATCH_TYPE_LABELS: Record<string, string> = {
  spoken_variant: "Spoken variant",
  brand: "Brand name",
  misspelling: "Misspelling",
};

const ALIAS_FIELDS = [
  { key: "commonSpokenVariants", label: "Spoken Variants", placeholder: "e.g. estrogen patch, thyroid pill, fluid pill", type: "spoken_variant" },
  { key: "brandNames", label: "Brand Names", placeholder: "e.g. Synthroid, Lasix, Ventolin", type: "brand" },
  { key: "commonMisspellings", label: "Common Misspellings", placeholder: "e.g. levothyroxin, furosimide", type: "misspelling" },
] as const;

function formatDate(ts: string | Date) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function AliasBadges({ items, className }: { items: string[]; className?: string }) {
  if (!items.length) return <span className="text-muted-foreground/50 text-[10px]">—</span>;
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {items.map((item, i) => (
        <span key={i} className="inline-block bg-muted rounded px-1.5 py-0.5 text-[10px] font-mono">{item}</span>
      ))}
    </div>
  );
}

export default function MedicationDictionaryPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedDictId, setExpandedDictId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [search, setSearch] = useState("");

  // Quick Add state
  const [qaAlias, setQaAlias] = useState("");
  const [qaGeneric, setQaGeneric] = useState("");
  const [qaType, setQaType] = useState<"spoken_variant" | "brand" | "misspelling">("spoken_variant");
  const [qaClass, setQaClass] = useState("");

  // Add Full Entry dialog
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newGeneric, setNewGeneric] = useState("");
  const [newBrands, setNewBrands] = useState("");
  const [newSpoken, setNewSpoken] = useState("");
  const [newMisspellings, setNewMisspellings] = useState("");
  const [newClass, setNewClass] = useState("");
  const [newRoute, setNewRoute] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Edit Entry dialog
  const [editEntry, setEditEntry] = useState<EnrichedEntry | null>(null);
  const [editBrands, setEditBrands] = useState("");
  const [editSpoken, setEditSpoken] = useState("");
  const [editMisspellings, setEditMisspellings] = useState("");
  const [editClass, setEditClass] = useState("");
  const [editRoute, setEditRoute] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const openEdit = (e: EnrichedEntry) => {
    setEditEntry(e);
    setEditBrands(e.brandNames.join(", "));
    setEditSpoken(e.commonSpokenVariants.join(", "));
    setEditMisspellings(e.commonMisspellings.join(", "));
    setEditClass(e.drugClass ?? "");
    setEditRoute(e.route ?? "");
    setEditNotes(e.notes ?? "");
  };

  const { data: dictionaries = [], isLoading: loadingDicts } = useQuery<MedicationDictionary[]>({
    queryKey: ["/api/medication-dictionary"],
  });

  const { data: entriesData, isLoading: loadingEntries } = useQuery<{ entries: EnrichedEntry[]; total: number }>({
    queryKey: ["/api/medication-dictionary/entries"],
  });
  const allEntries = entriesData?.entries ?? [];

  const filteredEntries = search.trim()
    ? allEntries.filter(e => {
        const q = search.toLowerCase();
        return (
          e.genericName.toLowerCase().includes(q) ||
          e.brandNames.some(b => b.toLowerCase().includes(q)) ||
          e.commonSpokenVariants.some(s => s.toLowerCase().includes(q)) ||
          e.commonMisspellings.some(m => m.toLowerCase().includes(q)) ||
          (e.drugClass ?? "").toLowerCase().includes(q)
        );
      })
    : allEntries;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/medication-dictionary"] });
    qc.invalidateQueries({ queryKey: ["/api/medication-dictionary/entries"] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/medication-dictionary/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Upload failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAll();
      toast({ title: "Dictionary uploaded", description: `${data.entryCount} entries imported from ${data.filename}.` });
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const deleteDictMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/medication-dictionary/${id}`);
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Dictionary deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const quickAddMutation = useMutation({
    mutationFn: async () => {
      if (!qaAlias.trim() || !qaGeneric.trim()) throw new Error("Both fields are required");
      const body: Record<string, any> = { genericName: qaGeneric.trim() };
      if (qaType === "spoken_variant") body.commonSpokenVariants = [qaAlias.trim()];
      else if (qaType === "brand") body.brandNames = [qaAlias.trim()];
      else body.commonMisspellings = [qaAlias.trim()];
      if (qaClass.trim()) body.drugClass = qaClass.trim();

      // Check if entry already exists for this generic name — if so, patch it
      const existing = allEntries.find(e => e.genericName.toLowerCase() === qaGeneric.trim().toLowerCase());
      if (existing) {
        const fieldMap = { spoken_variant: "commonSpokenVariants", brand: "brandNames", misspelling: "commonMisspellings" } as const;
        const field = fieldMap[qaType];
        const current = (existing[field] as string[]) ?? [];
        if (!current.map(v => v.toLowerCase()).includes(qaAlias.trim().toLowerCase())) {
          const res = await apiRequest("PATCH", `/api/medication-dictionary/entry/${existing.id}`, {
            [field]: [...current, qaAlias.trim()],
            ...(qaClass.trim() && !existing.drugClass ? { drugClass: qaClass.trim() } : {}),
          });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed"); }
          return res.json();
        }
        return { alreadyExists: true };
      }
      const res = await apiRequest("POST", "/api/medication-dictionary/entry", body);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAll();
      if (data?.alreadyExists) {
        toast({ title: "Already exists", description: `That alias is already in the "${qaGeneric}" entry.` });
      } else {
        toast({ title: "Alias added", description: `"${qaAlias}" → ${qaGeneric} saved.` });
      }
      setQaAlias(""); setQaGeneric(""); setQaClass("");
    },
    onError: (err: Error) => toast({ title: "Failed to add alias", description: err.message, variant: "destructive" }),
  });

  const addEntryMutation = useMutation({
    mutationFn: async () => {
      if (!newGeneric.trim()) throw new Error("Generic name is required");
      const split = (s: string) => s.split(",").map(v => v.trim()).filter(Boolean);
      const body = {
        genericName: newGeneric.trim(),
        brandNames: split(newBrands),
        commonSpokenVariants: split(newSpoken),
        commonMisspellings: split(newMisspellings),
        drugClass: newClass.trim() || null,
        route: newRoute.trim() || null,
        notes: newNotes.trim() || null,
      };
      const res = await apiRequest("POST", "/api/medication-dictionary/entry", body);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Entry added" });
      setShowAddEntry(false);
      setNewGeneric(""); setNewBrands(""); setNewSpoken(""); setNewMisspellings("");
      setNewClass(""); setNewRoute(""); setNewNotes("");
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const updateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!editEntry) throw new Error("No entry selected");
      const split = (s: string) => s.split(",").map(v => v.trim()).filter(Boolean);
      const res = await apiRequest("PATCH", `/api/medication-dictionary/entry/${editEntry.id}`, {
        brandNames: split(editBrands),
        commonSpokenVariants: split(editSpoken),
        commonMisspellings: split(editMisspellings),
        drugClass: editClass.trim() || null,
        route: editRoute.trim() || null,
        notes: editNotes.trim() || null,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Entry updated" });
      setEditEntry(null);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/medication-dictionary/entry/${id}`);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Entry deleted" }); setEditEntry(null); },
    onError: (err: Error) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast({ title: "CSV files only", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  };

  const displayDicts = dictionaries.filter(d => d.filename !== "__manual__");
  const manualDict = dictionaries.find(d => d.filename === "__manual__");
  const totalEntries = entriesData?.total ?? 0;
  const manualCount = allEntries.filter(e => e.isManual).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/dashboard")} data-testid="button-back-med-dict">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">Medication Dictionary</h1>
          <p className="text-sm text-muted-foreground">
            Teach the AI how your patients refer to medications — "estrogen patch," "thyroid pill," "rescue inhaler," and more.
            {totalEntries > 0 && <span className="ml-1">{totalEntries} entries total{manualCount > 0 ? ` · ${manualCount} manual` : ""}.</span>}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddEntry(true)} data-testid="button-add-full-entry">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Entry
        </Button>
      </div>

      {/* Quick Add Alias */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            Quick Add Alias
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Map a spoken phrase a patient uses to the correct canonical drug name. The SOAP generator will always use the canonical name in the chart.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-end">
            <div>
              <Label className="text-xs mb-1.5 block">Spoken / heard phrase</Label>
              <Input
                value={qaAlias}
                onChange={e => setQaAlias(e.target.value)}
                placeholder='e.g. "estrogen patch"'
                data-testid="input-qa-alias"
              />
            </div>
            <div className="flex items-center justify-center pb-2 text-muted-foreground">
              <span className="text-sm font-medium">→</span>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Canonical generic name</Label>
              <Input
                value={qaGeneric}
                onChange={e => setQaGeneric(e.target.value)}
                placeholder="e.g. estradiol"
                data-testid="input-qa-generic"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Alias type</Label>
              <Select value={qaType} onValueChange={(v: any) => setQaType(v)}>
                <SelectTrigger className="w-36" data-testid="select-qa-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spoken_variant">Spoken variant</SelectItem>
                  <SelectItem value="brand">Brand name</SelectItem>
                  <SelectItem value="misspelling">Misspelling</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => quickAddMutation.mutate()}
                disabled={quickAddMutation.isPending || !qaAlias.trim() || !qaGeneric.trim()}
                data-testid="button-qa-submit"
              >
                {quickAddMutation.isPending ? "Saving…" : "Add"}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Spoken variant</strong> (85% confidence) — casual phrasing like "fluid pill" or "hormone cream."
              {" "}<strong>Brand name</strong> (95%) — trade names like Synthroid or Mounjaro.
              {" "}<strong>Misspelling</strong> (75%) — transcription errors.
              {" "}Fuzzy matching catches off-by-one-letter typos automatically below 75% and always flags them for review.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* All Entries */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, alias, brand, or drug class…"
              className="pl-8"
              data-testid="input-entry-search"
            />
            {search && (
              <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filteredEntries.length} of {totalEntries}
          </span>
        </div>

        {(loadingEntries || loadingDicts) && (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading entries…</div>
        )}

        {!loadingEntries && totalEntries === 0 && (
          <div className="rounded-md border border-dashed py-10 text-center">
            <BookOpen className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No entries yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Use Quick Add Alias above or upload a CSV to get started.</p>
          </div>
        )}

        {filteredEntries.length > 0 && (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Generic Name</th>
                  <th className="text-left px-3 py-2 font-semibold">Spoken Variants</th>
                  <th className="text-left px-3 py-2 font-semibold">Brands</th>
                  <th className="text-left px-3 py-2 font-semibold">Drug Class</th>
                  <th className="text-left px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, i) => (
                  <tr key={entry.id} data-testid={`row-entry-${entry.id}`} className={`border-t ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                    <td className="px-3 py-2 font-medium font-mono">{entry.genericName}</td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <AliasBadges items={entry.commonSpokenVariants} />
                    </td>
                    <td className="px-3 py-2 max-w-[140px]">
                      <AliasBadges items={entry.brandNames} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{entry.drugClass ?? "—"}</td>
                    <td className="px-3 py-2">
                      {entry.isManual
                        ? <Badge variant="outline" className="text-[10px]">Manual</Badge>
                        : <Badge variant="secondary" className="text-[10px]">CSV</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(entry)}
                        data-testid={`button-edit-entry-${entry.id}`}
                        title="Edit aliases"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {search && filteredEntries.length === 0 && totalEntries > 0 && (
          <div className="text-center text-sm text-muted-foreground py-6">
            No entries match "{search}". <button className="underline" onClick={() => setSearch("")}>Clear search</button>
          </div>
        )}
      </div>

      {/* Upload CSV */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Bulk Import via CSV
          </CardTitle>
          <p className="text-xs text-muted-foreground">Upload a full medication dictionary at once. Use the Quick Add form above for one-off additions.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            data-testid="drop-zone-med-csv"
            className={`border-2 border-dashed rounded-md p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" data-testid="input-csv-file"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Parsing and importing…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="w-8 h-8 opacity-40" />
                <div>
                  <p className="text-sm font-medium">Drop a CSV here or click to browse</p>
                  <p className="text-xs mt-0.5">Must include a <code className="font-mono bg-muted px-1 rounded">generic_name</code> column</p>
                </div>
              </div>
            )}
          </div>

          {/* Column reference */}
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-muted-foreground uppercase tracking-wide mb-2 select-none">CSV Column Reference</summary>
            <div className="rounded-md border overflow-hidden mt-2">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Column</th>
                    <th className="text-left px-3 py-2 font-semibold">Description</th>
                    <th className="text-left px-3 py-2 font-semibold">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { col: "generic_name", desc: "Canonical generic name (e.g. tirzepatide)", req: true },
                    { col: "brand_names", desc: "Brand names — pipe-separated (e.g. Mounjaro|Zepbound)", req: false },
                    { col: "common_spoken_variants", desc: "How patients say it aloud (e.g. tirza|tirzep|Mounjaro shot)", req: false },
                    { col: "common_misspellings", desc: "Common transcription errors (e.g. tersapeptide)", req: false },
                    { col: "drug_class", desc: "Pharmacological class (e.g. GLP-1 Receptor Agonist)", req: false },
                    { col: "subclass", desc: "Subclass (e.g. GIP/GLP-1 Dual Agonist)", req: false },
                    { col: "route", desc: "Route of administration (e.g. subcutaneous)", req: false },
                    { col: "notes", desc: "Clinical notes or context", req: false },
                  ].map((c, i) => (
                    <tr key={c.col} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-3 py-1.5 font-mono text-primary/80">{c.col}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{c.desc}</td>
                      <td className="px-3 py-1.5">
                        {c.req ? <Badge variant="secondary" className="text-[10px] py-0">Required</Badge>
                          : <span className="text-muted-foreground/60">Optional</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-2">
              Array fields can be pipe-separated <code className="font-mono bg-muted px-1 rounded">|</code> or semicolon-separated within a quoted cell.
            </p>
          </details>
        </CardContent>
      </Card>

      {/* CSV Dictionaries */}
      {displayDicts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Uploaded CSV Files</h2>
          {displayDicts.map(dict => (
            <Card key={dict.id} data-testid={`card-med-dict-${dict.id}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{dict.filename}</p>
                    <p className="text-xs text-muted-foreground">{dict.entryCount} entries · uploaded {formatDate(dict.uploadedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost"
                      onClick={() => setExpandedDictId(expandedDictId === dict.id ? null : dict.id)}
                      data-testid={`button-expand-dict-${dict.id}`}>
                      {expandedDictId === dict.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                    <Button size="icon" variant="ghost"
                      onClick={() => { if (confirm("Delete this dictionary and all its entries?")) deleteDictMutation.mutate(dict.id); }}
                      disabled={deleteDictMutation.isPending}
                      data-testid={`button-delete-dict-${dict.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {expandedDictId === dict.id && (
                  <div className="mt-3 pt-3 border-t text-xs text-muted-foreground space-y-1">
                    <p><span className="font-medium text-foreground">{dict.entryCount}</span> medication entries imported.</p>
                    <p>You can add individual aliases from any entry in the table above without re-uploading the CSV.</p>
                    <p>To replace this dictionary entirely, delete it and re-upload an updated CSV.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* How it works */}
      <Card>
        <CardContent className="py-4 px-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How Confidence Tiers Work</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <div className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">100%</strong> — Exact generic name match. Used as-is in SOAP.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">95%</strong> — Brand name. AI uses the canonical generic in the SOAP.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">85%</strong> — Spoken variant. Confirmed — canonical name used in SOAP.</span></div>
            <div className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">75%</strong> — Misspelling. Confirmed — canonical name used in SOAP.</span></div>
            <div className="flex gap-2"><AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Below 75%</strong> — Fuzzy / uncertain. Flagged for review. <em>Never silently inserted into the chart.</em></span></div>
          </div>
        </CardContent>
      </Card>

      {/* Add Full Entry Dialog */}
      <Dialog open={showAddEntry} onOpenChange={setShowAddEntry}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="w-4 h-4" />
              Add Medication Entry
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label className="text-xs mb-1.5 block">Generic Name <span className="text-destructive">*</span></Label>
              <Input value={newGeneric} onChange={e => setNewGeneric(e.target.value)} placeholder="e.g. levothyroxine" data-testid="input-new-generic" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Brand Names <span className="text-muted-foreground">(comma-separated)</span></Label>
              <Input value={newBrands} onChange={e => setNewBrands(e.target.value)} placeholder="e.g. Synthroid, Levoxyl, Tirosint" data-testid="input-new-brands" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Spoken Variants <span className="text-muted-foreground">(comma-separated)</span></Label>
              <Input value={newSpoken} onChange={e => setNewSpoken(e.target.value)} placeholder='e.g. thyroid pill, thyroid medication, T4' data-testid="input-new-spoken" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Common Misspellings <span className="text-muted-foreground">(comma-separated)</span></Label>
              <Input value={newMisspellings} onChange={e => setNewMisspellings(e.target.value)} placeholder="e.g. levothyroxin, levothyoxine" data-testid="input-new-misspellings" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Drug Class</Label>
                <Input value={newClass} onChange={e => setNewClass(e.target.value)} placeholder="e.g. Thyroid Hormone" data-testid="input-new-class" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Route</Label>
                <Input value={newRoute} onChange={e => setNewRoute(e.target.value)} placeholder="e.g. oral" data-testid="input-new-route" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEntry(false)}>Cancel</Button>
            <Button onClick={() => addEntryMutation.mutate()} disabled={addEntryMutation.isPending || !newGeneric.trim()} data-testid="button-add-entry-submit">
              {addEntryMutation.isPending ? "Saving…" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editEntry} onOpenChange={open => { if (!open) setEditEntry(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit: <span className="font-mono">{editEntry?.genericName}</span>
            </DialogTitle>
          </DialogHeader>
          {editEntry && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Enter multiple values comma-separated. The generic name cannot be changed here — delete and re-add if needed.</span>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Spoken Variants <span className="text-muted-foreground text-[10px]">(85% confidence)</span></Label>
                <Input value={editSpoken} onChange={e => setEditSpoken(e.target.value)}
                  placeholder='e.g. estrogen patch, hormone cream, bio-identical estrogen'
                  data-testid="input-edit-spoken" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Brand Names <span className="text-muted-foreground text-[10px]">(95% confidence)</span></Label>
                <Input value={editBrands} onChange={e => setEditBrands(e.target.value)}
                  placeholder="e.g. Estrace, Vivelle-Dot, Climara"
                  data-testid="input-edit-brands" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Misspellings <span className="text-muted-foreground text-[10px]">(75% confidence)</span></Label>
                <Input value={editMisspellings} onChange={e => setEditMisspellings(e.target.value)}
                  placeholder="e.g. estradol, oestradiol"
                  data-testid="input-edit-misspellings" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Drug Class</Label>
                  <Input value={editClass} onChange={e => setEditClass(e.target.value)}
                    placeholder="e.g. Estrogen" data-testid="input-edit-class" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Route</Label>
                  <Input value={editRoute} onChange={e => setEditRoute(e.target.value)}
                    placeholder="e.g. transdermal" data-testid="input-edit-route" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" size="sm" className="text-destructive"
              onClick={() => { if (editEntry && confirm(`Delete the entry for "${editEntry.genericName}"?`)) deleteEntryMutation.mutate(editEntry.id); }}
              disabled={deleteEntryMutation.isPending}
              data-testid="button-delete-entry">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Entry
            </Button>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
              <Button onClick={() => updateEntryMutation.mutate()} disabled={updateEntryMutation.isPending} data-testid="button-save-entry">
                {updateEntryMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
