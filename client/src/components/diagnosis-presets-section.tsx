import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  X,
  Sparkles,
  ClipboardList,
  Loader2,
} from "lucide-react";

interface CodeEntry {
  code: string;
  name: string;
}

interface DiagnosisPreset {
  id: number;
  clinicId: number;
  createdByUserId: number | null;
  title: string;
  codes: CodeEntry[];
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

interface BuiltInDx {
  code: string;
  name: string;
  aliases?: string[];
  isPreset?: false;
}

export function DiagnosisPresetsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiagnosisPreset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiagnosisPreset | null>(null);
  const [filter, setFilter] = useState("");

  const { data: presets = [], isLoading } = useQuery<DiagnosisPreset[]>({
    queryKey: ["/api/diagnosis-presets"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/diagnosis-presets/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/diagnosis-presets"] });
      qc.invalidateQueries({ queryKey: ["/api/diagnoses/search"] });
      toast({ title: "Preset deleted" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to delete preset",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter((p) => {
      const codesStr = (p.codes ?? []).map((c) => `${c.code} ${c.name}`).join(" ");
      const aliasesStr = (p.aliases ?? []).join(" ");
      return (
        p.title.toLowerCase().includes(q) ||
        codesStr.toLowerCase().includes(q) ||
        aliasesStr.toLowerCase().includes(q)
      );
    });
  }, [presets, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3
            className="text-base font-semibold"
            style={{ color: "#1c2414" }}
          >
            Diagnosis Presets
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Create shared clinic-wide shortcuts that show up when anyone in your clinic
            types <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">/dx</code>{" "}
            in a SOAP note. A preset can be a single ICD-10 code or a bundle of multiple codes
            under a custom title you write yourself.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          data-testid="button-new-diagnosis-preset"
          style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Preset
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter presets..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-8"
          data-testid="input-filter-presets"
        />
      </div>

      {isLoading ? (
        <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading presets…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {presets.length === 0
                ? "No presets yet. Click New Preset to create your first one."
                : "No presets match your filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={p.id} data-testid={`preset-row-${p.id}`}>
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className="text-sm font-semibold leading-snug"
                      style={{ color: "#1c2414" }}
                    >
                      {p.title}
                    </p>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-semibold uppercase tracking-wide"
                    >
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                      Custom
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(p.codes ?? []).map((c, i) => (
                      <span
                        key={`${p.id}-c-${i}`}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono rounded border px-1.5 py-0.5 bg-muted/40"
                        title={c.name}
                      >
                        <span className="font-semibold text-primary/80">
                          {c.code}
                        </span>
                        <span className="text-muted-foreground truncate max-w-[260px]">
                          {c.name}
                        </span>
                      </span>
                    ))}
                  </div>
                  {p.aliases && p.aliases.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium">Search aliases:</span>{" "}
                      {p.aliases.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(p);
                      setDialogOpen(true);
                    }}
                    data-testid={`button-edit-preset-${p.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(p)}
                    data-testid={`button-delete-preset-${p.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PresetEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete diagnosis preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-semibold">{deleteTarget?.title}</span> from{" "}
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">
                /dx
              </code>{" "}
              search for everyone in your clinic. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Editor Dialog ────────────────────────────────────────────────────────
function PresetEditorDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: DiagnosisPreset | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [codes, setCodes] = useState<CodeEntry[]>([]);
  const [aliasesText, setAliasesText] = useState("");
  const [codeSearch, setCodeSearch] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualName, setManualName] = useState("");

  // Reset on open/initial change
  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setCodes(initial?.codes ? [...initial.codes] : []);
      setAliasesText(initial?.aliases?.join(", ") ?? "");
      setCodeSearch("");
      setManualCode("");
      setManualName("");
    }
  }, [open, initial]);

  const { data: searchResults = [] } = useQuery<(BuiltInDx & { isPreset?: boolean })[]>({
    queryKey: ["/api/diagnoses/search", codeSearch],
    queryFn: async () => {
      const res = await fetch(
        `/api/diagnoses/search?q=${encodeURIComponent(codeSearch)}`,
      );
      if (!res.ok) return [];
      const rows = await res.json();
      // Only offer built-in codes for adding to a preset (not other presets)
      return (rows as any[]).filter((r) => !r.isPreset);
    },
    enabled: open && codeSearch.trim().length > 0,
    staleTime: 10000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        codes,
        aliases: aliasesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (initial) {
        const res = await apiRequest(
          "PATCH",
          `/api/diagnosis-presets/${initial.id}`,
          payload,
        );
        return res.json();
      }
      const res = await apiRequest("POST", "/api/diagnosis-presets", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/diagnosis-presets"] });
      qc.invalidateQueries({ queryKey: ["/api/diagnoses/search"] });
      toast({
        title: initial ? "Preset updated" : "Preset created",
        description: "Available everywhere /dx is used in your clinic.",
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save preset",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const canSave = title.trim().length > 0 && codes.length > 0;
  const addedCodeSet = new Set(codes.map((c) => c.code.toLowerCase()));

  function addCode(c: CodeEntry) {
    if (!c.code || !c.name) return;
    if (addedCodeSet.has(c.code.toLowerCase())) return;
    setCodes((prev) => [...prev, { code: c.code, name: c.name }]);
    setCodeSearch("");
  }

  function removeCode(idx: number) {
    setCodes((prev) => prev.filter((_, i) => i !== idx));
  }

  function addManualCode() {
    const code = manualCode.trim();
    const name = manualName.trim();
    if (!code || !name) return;
    if (addedCodeSet.has(code.toLowerCase())) return;
    setCodes((prev) => [...prev, { code, name }]);
    setManualCode("");
    setManualName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit Diagnosis Preset" : "New Diagnosis Preset"}
          </DialogTitle>
          <DialogDescription>
            Give this preset a custom title and bundle one or more ICD-10 codes.
            Everyone in your clinic will see it when they type{" "}
            <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">
              /dx
            </code>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Custom title</label>
            <Textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Estrogen dominance perimenopausal pattern with associated vasomotor symptoms (based on her labs)"
              className="text-sm min-h-[60px]"
              data-testid="input-preset-title"
            />
            <p className="text-[11px] text-muted-foreground">
              This is what gets inserted into the note followed by the code list.
            </p>
          </div>

          {/* Codes — current selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              ICD-10 codes in this preset
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                {codes.length} {codes.length === 1 ? "code" : "codes"}
              </span>
            </label>
            {codes.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic border border-dashed rounded-md py-3 px-3">
                No codes added yet. Add at least one below.
              </div>
            ) : (
              <div className="space-y-1.5">
                {codes.map((c, i) => (
                  <div
                    key={`${c.code}-${i}`}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5"
                    data-testid={`preset-code-${c.code}`}
                  >
                    <span className="font-mono text-xs font-semibold text-primary/80 min-w-[70px]">
                      {c.code}
                    </span>
                    <span className="text-xs flex-1 truncate">{c.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeCode(i)}
                      data-testid={`button-remove-code-${c.code}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search + add from built-in */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Add code from ICD-10 library</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                placeholder="Search by code or description (e.g. N95.1, menopause, hypothyroid)..."
                className="pl-8 text-sm"
                data-testid="input-search-icd10"
              />
            </div>
            {codeSearch.trim().length > 0 && (
              <div className="max-h-[220px] overflow-y-auto rounded-md border divide-y">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-muted-foreground text-center">
                    No matches. Not in the library? Add it manually below.
                  </div>
                ) : (
                  searchResults.map((r, i) => {
                    const alreadyAdded = addedCodeSet.has(
                      (r.code ?? "").toLowerCase(),
                    );
                    return (
                      <button
                        key={`${r.code}-${i}`}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() =>
                          addCode({ code: r.code ?? "", name: r.name ?? "" })
                        }
                        data-testid={`button-add-icd10-${r.code}`}
                        className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm transition-colors ${
                          alreadyAdded
                            ? "opacity-50 cursor-not-allowed"
                            : "hover-elevate cursor-pointer"
                        }`}
                      >
                        <span className="font-mono text-[11px] font-semibold text-primary/80 mt-0.5 flex-shrink-0 min-w-[70px]">
                          {r.code}
                        </span>
                        <span className="text-xs text-foreground leading-snug flex-1">
                          {r.name}
                        </span>
                        {alreadyAdded && (
                          <span className="text-[10px] text-muted-foreground">
                            added
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Manual entry */}
          <div className="space-y-1.5 rounded-md border border-dashed p-3">
            <label className="text-sm font-medium">
              Or add a code manually
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                (for codes not yet in our library)
              </span>
            </label>
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Code (e.g. N95.9)"
                className="text-sm font-mono sm:max-w-[140px]"
                data-testid="input-manual-code"
              />
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Description"
                className="text-sm flex-1"
                data-testid="input-manual-name"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addManualCode}
                disabled={!manualCode.trim() || !manualName.trim()}
                data-testid="button-add-manual-code"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Aliases */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Search aliases
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                optional
              </span>
            </label>
            <Input
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
              placeholder="Comma-separated extra keywords (e.g. estrogen dominance, vasomotor, perimenopause pattern)"
              className="text-sm"
              data-testid="input-preset-aliases"
            />
            <p className="text-[11px] text-muted-foreground">
              These help the preset show up in <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">/dx</code> search.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            data-testid="button-save-preset"
            style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
          >
            {saveMutation.isPending
              ? "Saving…"
              : initial
                ? "Save Changes"
                : "Create Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
