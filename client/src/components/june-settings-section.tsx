import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  BrainCircuit, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Zap, BookOpen, MessageSquare, Sparkles, Volume2, ArrowRight, FlaskConical,
} from "lucide-react";

type Category = "instruction" | "trigger" | "snippet" | "clinical_protocol" | "pronunciation";

interface JunePreference {
  id: number;
  category: Category;
  label: string;
  instruction: string;
  triggerPhrases: string | null;
  isActive: boolean;
  createdAt: string;
}

const CATEGORY_META: Record<Exclude<Category, "pronunciation">, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; description: string }> = {
  clinical_protocol: {
    label: "Clinical Protocol",
    icon: FlaskConical,
    color: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    description: "Clinic's lab philosophy and treatment protocols — June treats these as highest authority",
  },
  instruction: {
    label: "Always-on",
    icon: MessageSquare,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    description: "June follows this rule in every response",
  },
  trigger: {
    label: "Trigger",
    icon: Zap,
    color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    description: "Activates when you use specific phrases",
  },
  snippet: {
    label: "Snippet",
    icon: BookOpen,
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    description: "Saved text block — triggers can reference this",
  },
};

const EXAMPLES: { category: Exclude<Category, "pronunciation">; label: string; instruction: string; triggerPhrases?: string }[] = [
  {
    category: "clinical_protocol",
    label: "Testosterone optimization targets",
    instruction: "Our clinic targets Total Testosterone 800–1100 ng/dL + Free Testosterone >150 pg/mL with symptoms. We do NOT use the lab reference range of 300 ng/dL as a treatment threshold. If a patient is symptomatic below 600 ng/dL, that warrants a clinical conversation regardless of the lab flag.",
  },
  {
    category: "clinical_protocol",
    label: "Ferritin optimal range",
    instruction: "We treat ferritin <70 ng/mL as functionally low in any patient with fatigue, hair loss, brain fog, or poor exercise recovery — regardless of hemoglobin or conventional anemia thresholds. Optimal target is 80–120 ng/mL. Always investigate the root cause before supplementing: check CRP, dietary intake, H. pylori antibody, and consider celiac if indicated.",
  },
  {
    category: "clinical_protocol",
    label: "Thyroid optimization philosophy",
    instruction: "We do not treat by TSH alone. We interpret Free T3 + Free T4 together with TSH. Optimal TSH for our symptomatic patients is 1.0–2.0 mIU/L. A T3/T4 ratio <0.25 indicates poor conversion and warrants a conversation about combination therapy or desiccated thyroid. We also check TPO antibodies routinely — Hashimoto's changes the management conversation.",
  },
  {
    category: "clinical_protocol",
    label: "Vitamin D targets",
    instruction: "Our clinic targets Vitamin D3 (25-OH) at 60–80 ng/mL for optimal immune, hormonal, and metabolic function. Levels <40 ng/mL are treated as functionally deficient. Standard dosing starts at 5,000 IU/day with K2 100 mcg to prevent arterial calcification. Recheck at 90 days.",
  },
  {
    category: "instruction",
    label: "No note summarizing",
    instruction: "Never summarize or repeat my SOAP note content back to me. Jump straight to your point.",
  },
  {
    category: "instruction",
    label: "Always include patient education",
    instruction: "Always include a patient education section in the Plan when you draft or suggest A/P language.",
  },
  {
    category: "instruction",
    label: "Show drug dosing",
    instruction: "Always include dose, frequency, and monitoring parameters when recommending a medication.",
  },
  {
    category: "trigger",
    label: "GLP-1 start trigger",
    instruction: "Include my GLP Education snippet in the A/P. Also add standard monitoring: baseline HbA1c, LFTs, lipase, and 3-month follow-up.",
    triggerPhrases: "start GLP, let's begin semaglutide, let's start tirzepatide, start sema, start tirz, start Ozempic, start Wegovy, start Mounjaro, start Zepbound",
  },
  {
    category: "trigger",
    label: "TRT start trigger",
    instruction: "Include TRT baseline labs (total T, free T, SHBG, hematocrit, PSA, estradiol) and note my TRT education snippet in the plan.",
    triggerPhrases: "start TRT, start testosterone, initiate testosterone, let's start T, begin TRT",
  },
  {
    category: "snippet",
    label: "GLP Education",
    instruction: "GLP-1 receptor agonists like semaglutide and tirzepatide work by mimicking the hormone GLP-1, which helps control blood sugar and appetite. Common side effects include nausea, vomiting, and constipation — these usually improve over time. Take the injection once weekly on the same day. Do not increase the dose faster than instructed. Contact us if you experience severe abdominal pain.",
  },
];

interface PrefFormState {
  category: Exclude<Category, "pronunciation">;
  label: string;
  instruction: string;
  triggerPhrases: string;
}

const DEFAULT_FORM: PrefFormState = {
  category: "instruction",
  label: "",
  instruction: "",
  triggerPhrases: "",
};

// ── Pronunciation Guide sub-component ────────────────────────────────────────
function PronunciationGuide({ prefs, onAdd, onDelete }: {
  prefs: JunePreference[];
  onAdd: (label: string, phonetic: string) => void;
  onDelete: (id: number) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [word, setWord] = useState("");
  const [phonetic, setPhonetic] = useState("");

  const handleAdd = () => {
    if (!word.trim() || !phonetic.trim()) return;
    onAdd(word.trim(), phonetic.trim());
    setWord(""); setPhonetic(""); setAddOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Pronunciation Guide · How June says medication names out loud
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          data-testid="button-june-add-pronunciation"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add pronunciation
        </Button>
      </div>

      {prefs.length === 0 ? (
        <Card>
          <CardContent className="py-5 flex flex-col items-center text-center gap-2">
            <Volume2 className="w-6 h-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground max-w-sm">
              June already knows how to pronounce most common medications. Add an entry here to override how she says a specific name — useful for brand names, compounds, or anything she gets wrong.
            </p>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="button-pronunciation-add-first">
              <Plus className="w-3 h-3 mr-1" />
              Add first pronunciation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-3 pb-3 px-4 space-y-0">
            {prefs.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 py-2 ${i < prefs.length - 1 ? "border-b" : ""}`}
                data-testid={`row-pronunciation-${p.id}`}
              >
                <span className="text-sm font-medium w-40 truncate shrink-0">{p.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground flex-1 font-mono">{p.instruction}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(p.id)}
                  className="shrink-0"
                  data-testid={`button-pronunciation-delete-${p.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <div className="pt-2">
              <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)} className="h-7 text-xs" data-testid="button-pronunciation-add-more">
                <Plus className="w-3 h-3 mr-1" />
                Add another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add pronunciation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Medication or term</label>
              <Input
                value={word}
                onChange={e => setWord(e.target.value)}
                placeholder="e.g. Levothyroxine"
                maxLength={80}
                data-testid="input-pronunciation-word"
              />
              <p className="text-xs text-muted-foreground">Exactly as it would appear in the text June speaks.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">How June should say it</label>
              <Input
                value={phonetic}
                onChange={e => setPhonetic(e.target.value)}
                placeholder="e.g. lee-vo-thy-ROX-een"
                maxLength={200}
                data-testid="input-pronunciation-phonetic"
              />
              <p className="text-xs text-muted-foreground">
                Write it out phonetically — use hyphens between syllables and caps for the stressed syllable.
                For acronyms, space out the letters: <span className="font-mono">T-S-H</span>.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setWord(""); setPhonetic(""); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!word.trim() || !phonetic.trim()}
              data-testid="button-pronunciation-save"
              style={{ backgroundColor: "#2e3a20", color: "white" }}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function JuneSettingsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PrefFormState>(DEFAULT_FORM);
  const [showExamples, setShowExamples] = useState(false);

  const { data: prefs = [], isLoading } = useQuery<JunePreference[]>({
    queryKey: ["/api/june-preferences"],
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/june-preferences", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/june-preferences"] });
      setDialogOpen(false);
      setForm(DEFAULT_FORM);
      toast({ title: "Preference saved", description: "June will follow this from now on." });
    },
    onError: () => toast({ title: "Save failed", description: "Something went wrong.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiRequest("PATCH", `/api/june-preferences/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/june-preferences"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
      toast({ title: "Preference updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/june-preferences/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/june-preferences"] });
      toast({ title: "Preference removed" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const toggleActive = (pref: JunePreference) => {
    updateMutation.mutate({ id: pref.id, data: { isActive: !pref.isActive } });
  };

  const openNew = (prefill?: typeof EXAMPLES[0]) => {
    setEditingId(null);
    setForm(prefill
      ? { category: prefill.category, label: prefill.label, instruction: prefill.instruction, triggerPhrases: prefill.triggerPhrases ?? "" }
      : DEFAULT_FORM
    );
    setShowExamples(false);
    setDialogOpen(true);
  };

  const openEdit = (pref: JunePreference) => {
    setEditingId(pref.id);
    setForm({
      category: pref.category as Exclude<Category, "pronunciation">,
      label: pref.label,
      instruction: pref.instruction,
      triggerPhrases: pref.triggerPhrases ?? "",
    });
    setShowExamples(false);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.label.trim() || !form.instruction.trim()) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }
    const payload = {
      category: form.category,
      label: form.label.trim(),
      instruction: form.instruction.trim(),
      triggerPhrases: form.category === "trigger" && form.triggerPhrases.trim() ? form.triggerPhrases.trim() : null,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleAddPronunciation = (label: string, phonetic: string) => {
    createMutation.mutate({ category: "pronunciation", label, instruction: phonetic, isActive: true });
  };

  const nonPronunciationPrefs = prefs.filter(p => p.category !== "pronunciation");
  const pronunciationPrefs = prefs.filter(p => p.category === "pronunciation");

  const grouped = {
    clinical_protocol: nonPronunciationPrefs.filter(p => p.category === "clinical_protocol"),
    instruction: nonPronunciationPrefs.filter(p => p.category === "instruction"),
    trigger: nonPronunciationPrefs.filter(p => p.category === "trigger"),
    snippet: nonPronunciationPrefs.filter(p => p.category === "snippet"),
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#2e3a20" }}>
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Teach June</h3>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-lg">
              Tell June how you like to work. These preferences are saved and injected into every conversation — she'll follow them automatically without you having to repeat yourself.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => { setShowExamples(true); setEditingId(null); setForm(DEFAULT_FORM); setDialogOpen(true); }} data-testid="button-june-examples">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Examples
          </Button>
          <Button size="sm" onClick={() => openNew()} data-testid="button-june-add-pref" style={{ backgroundColor: "#2e3a20", color: "white" }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add preference
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4">Loading your preferences…</div>
      ) : nonPronunciationPrefs.length === 0 && pronunciationPrefs.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <BrainCircuit className="w-8 h-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-foreground">June doesn't know your preferences yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Add an always-on instruction, a trigger rule, or a snippet — and she'll follow them in every future conversation.
              </p>
            </div>
            <div className="flex gap-2 mt-1">
              <Button variant="outline" size="sm" onClick={() => { setShowExamples(true); setDialogOpen(true); }} data-testid="button-june-see-examples">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                See examples
              </Button>
              <Button size="sm" onClick={() => openNew()} style={{ backgroundColor: "#2e3a20", color: "white" }} data-testid="button-june-add-first">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add first preference
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {(["clinical_protocol", "instruction", "trigger", "snippet"] as Exclude<Category, "pronunciation">[]).map(cat => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{meta.label} · {meta.description}</span>
                </div>
                <div className="space-y-2">
                  {items.map(pref => (
                    <Card key={pref.id} className={pref.isActive ? "" : "opacity-50"} data-testid={`card-june-pref-${pref.id}`}>
                      <CardContent className="py-3 px-4 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{pref.label}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.color} border-0`}>
                              {meta.label}
                            </Badge>
                            {!pref.isActive && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Paused</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pref.instruction}</p>
                          {pref.triggerPhrases && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                              <span className="font-medium">Triggers on:</span> {pref.triggerPhrases}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleActive(pref)}
                            title={pref.isActive ? "Pause this preference" : "Resume this preference"}
                            data-testid={`button-june-toggle-${pref.id}`}
                          >
                            {pref.isActive
                              ? <ToggleRight className="w-4 h-4 text-emerald-600" />
                              : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                            }
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(pref)} data-testid={`button-june-edit-${pref.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(pref.id)}
                            className="text-destructive"
                            data-testid={`button-june-delete-${pref.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pronunciation Guide — always visible below preferences */}
      <div className="border-t pt-5">
        <PronunciationGuide
          prefs={pronunciationPrefs}
          onAdd={handleAddPronunciation}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </div>

      {/* Add / Edit / Examples Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(DEFAULT_FORM); setShowExamples(false); } }}>
        <DialogContent className="max-w-lg">
          {showExamples ? (
            <>
              <DialogHeader>
                <DialogTitle>Example preferences</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground -mt-1 mb-2">Click any example to pre-fill the form, then customise it for your practice.</p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {EXAMPLES.map((ex, i) => {
                  const meta = CATEGORY_META[ex.category];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => openNew(ex)}
                      className="w-full text-left rounded-md border p-3 hover-elevate transition-colors"
                      data-testid={`button-june-example-${i}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium">{ex.label}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.color} border-0`}>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{ex.instruction}</p>
                      {ex.triggerPhrases && (
                        <p className="text-[11px] text-amber-700 mt-1"><span className="font-medium">Triggers on:</span> {ex.triggerPhrases}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{editingId !== null ? "Edit preference" : "Add preference"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as Exclude<Category, "pronunciation"> }))}>
                    <SelectTrigger data-testid="select-june-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clinical_protocol">
                        <div className="flex items-center gap-2">
                          <FlaskConical className="w-3.5 h-3.5" />
                          <span>Clinical protocol</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="instruction">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Always-on instruction</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="trigger">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5" />
                          <span>Trigger rule</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="snippet">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Context snippet</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{CATEGORY_META[form.category].description}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Label <span className="text-destructive">*</span></label>
                  <Input
                    placeholder={
                      form.category === "clinical_protocol" ? "e.g. Testosterone optimization targets"
                      : form.category === "instruction" ? "e.g. No note summarizing"
                      : form.category === "trigger" ? "e.g. GLP-1 start trigger"
                      : "e.g. GLP Education"
                    }
                    value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    data-testid="input-june-label"
                    maxLength={120}
                  />
                </div>

                {form.category === "trigger" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Trigger phrases</label>
                    <Input
                      placeholder="e.g. start GLP, let's begin semaglutide, start tirz"
                      value={form.triggerPhrases}
                      onChange={e => setForm(f => ({ ...f, triggerPhrases: e.target.value }))}
                      data-testid="input-june-triggers"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated. June activates this rule when you use any of these phrases.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {form.category === "snippet" ? "Content" : form.category === "clinical_protocol" ? "Protocol" : "Instruction"} <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    placeholder={
                      form.category === "clinical_protocol"
                        ? "e.g. Our clinic targets Total Testosterone 800–1100 ng/dL. We do not use the lab reference range of 300 ng/dL as a treatment threshold..."
                        : form.category === "instruction"
                        ? "e.g. Never summarize my SOAP note back to me. Jump straight to your point."
                        : form.category === "trigger"
                        ? "e.g. Include my GLP Education snippet in the A/P and add standard monitoring labs."
                        : "e.g. GLP-1 receptor agonists like semaglutide work by mimicking GLP-1..."
                    }
                    value={form.instruction}
                    onChange={e => setForm(f => ({ ...f, instruction: e.target.value }))}
                    rows={form.category === "snippet" ? 5 : 3}
                    data-testid="textarea-june-instruction"
                    maxLength={4000}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">{form.instruction.length}/4000</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); setShowExamples(false); setEditingId(null); setForm(DEFAULT_FORM); }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isPending || !form.label.trim() || !form.instruction.trim()}
                  data-testid="button-june-pref-save"
                  style={{ backgroundColor: "#2e3a20", color: "white" }}
                >
                  {isPending ? "Saving…" : editingId !== null ? "Save changes" : "Add to June"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
