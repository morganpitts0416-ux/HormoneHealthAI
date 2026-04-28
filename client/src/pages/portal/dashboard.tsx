import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Leaf, LogOut, FlaskConical, Sparkles, ChevronRight, CalendarDays,
  TrendingUp, TrendingDown, Minus, Package, MessageSquare, Smartphone,
  Heart, Activity, Utensils, X, ChevronDown, ChevronUp, Info,
  ChefHat, Clock, Users, Loader2, ArrowLeft, Bookmark, BookmarkCheck,
  Download, Trash2, Stethoscope, FileText, Sun, CheckCircle2
} from "lucide-react";
import type { SupplementRecommendation, Appointment } from "@shared/schema";
import { generateTrendInsights } from "@/lib/clinical-trend-insights";

// ── Dietary guidance parser ────────────────────────────────────────────────
interface FoodItem { name: string; reason: string; }

function parseFoodItems(text: string): FoodItem[] {
  const lines = text.split('\n').filter(l => l.trim());
  const items: FoodItem[] = [];
  let inFoodsSection = false;

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-•*\d.]+\s*/, '');
    const lower = trimmed.toLowerCase();

    if (lower.match(/^(foods? to emphasize|key foods|focus foods|beneficial foods|foods? to include|foods? to prioritize|recommended foods)/)) {
      inFoodsSection = true; continue;
    }
    if (lower.match(/^(foods? to (avoid|limit|reduce)|limit:|avoid:|goal:|diet:|eating pattern|supplement|protein goal|carbohydrate|lifestyle)/)) {
      inFoodsSection = false;
    }
    if (!inFoodsSection || trimmed.length < 4) continue;

    // Try "Name - description" split
    const dashSplit = trimmed.split(/\s+[-–]\s+/);
    if (dashSplit.length >= 2) {
      const rawName = dashSplit[0].trim();
      // Strip leading parens from name
      const name = rawName.replace(/^\([^)]*\)\s*/, '').trim();
      if (name.length >= 3 && name.length <= 55) {
        items.push({ name, reason: dashSplit.slice(1).join(' - ').trim() });
        continue;
      }
    }
    // Try "Name: description" split
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 2 && colonIdx <= 50) {
      const name = trimmed.substring(0, colonIdx).trim();
      const reason = trimmed.substring(colonIdx + 1).trim();
      if (reason.length > 5) { items.push({ name, reason }); continue; }
    }
    // Try "Name (paren content)" — no dash
    const parenMatch = trimmed.match(/^([A-Za-z][A-Za-z\s,&/]+?)(\s*\(.+)/);
    if (parenMatch && parenMatch[1].trim().length >= 3 && parenMatch[1].trim().length <= 50) {
      items.push({ name: parenMatch[1].trim(), reason: parenMatch[2].trim() });
    }
  }
  return items;
}

// ── Recipe dialog ──────────────────────────────────────────────────────────
interface Recipe { name: string; prepTime: string; cookTime: string; servings: string; ingredients: string[]; instructions: string[]; clinicalNote: string; }

function downloadRecipe(recipe: Recipe, foodName: string) {
  const lines = [
    `${recipe.name}`,
    `Recommended food: ${foodName}`,
    ``,
    `Prep: ${recipe.prepTime || "—"}  |  Cook: ${recipe.cookTime || "—"}  |  Serves: ${recipe.servings || "—"}`,
    ``,
    recipe.clinicalNote ? `Health Note: ${recipe.clinicalNote}` : "",
    recipe.clinicalNote ? `` : "",
    `INGREDIENTS`,
    ...recipe.ingredients.map(i => `• ${i}`),
    ``,
    `INSTRUCTIONS`,
    ...recipe.instructions.map((s, i) => `${i + 1}. ${s}`),
  ].filter(l => l !== undefined);
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${recipe.name.replace(/[^a-z0-9]/gi, "_")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function RecipeDialog({ food, onClose }: { food: FoodItem; onClose: () => void }) {
  const [activeRecipe, setActiveRecipe] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    setRecipes([]);
    fetch("/api/portal/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ food: food.name, reason: food.reason }),
    })
      .then(r => r.json())
      .then(data => { if (!cancelled) { setRecipes(data.recipes || []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setFetchError(true); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.name]);

  async function handleSave(recipe: Recipe) {
    if (savedIds.has(recipe.name) || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/portal/saved-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ foodName: food.name, recipeName: recipe.name, recipeData: recipe }),
      });
      if (res.ok) {
        setSavedIds(prev => new Set([...prev, recipe.name]));
        qc.invalidateQueries({ queryKey: ["/api/portal/saved-recipes"] });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-w-lg w-full p-0 gap-0 overflow-hidden"
        style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: "#e8ddd0", backgroundColor: "#f9f6f0" }}
        >
          <button onClick={onClose} className="p-1 rounded-md" style={{ color: "#7a8a64" }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#2e3a20" }}>
              <ChefHat className="w-4 h-4" style={{ color: "#e8ddd0" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate" style={{ color: "#1c2414" }}>Recipe Ideas</p>
              <p className="text-xs truncate" style={{ color: "#7a8a64" }}>{food.name}</p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1" style={{ maxHeight: "calc(90vh - 64px)" }}>
          <div className="p-5 space-y-5">
            {/* Why your provider recommends this */}
            <div className="rounded-lg p-4" style={{ backgroundColor: "#eef3e8", border: "1px solid #d0dcc0" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#5a7040" }}>
                Why your provider recommended this
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{food.reason}</p>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#2e3a20" }} />
                <p className="text-sm font-medium" style={{ color: "#3d4a30" }}>Generating recipes just for you…</p>
                <p className="text-xs text-center max-w-xs" style={{ color: "#7a8a64" }}>
                  Your AI-powered recipes are being personalized based on your lab results. This takes about 30–40 seconds — please hold tight!
                </p>
              </div>
            )}

            {/* Error */}
            {fetchError && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Couldn't load recipes right now. Please try again.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => {
                  setFetchError(false);
                  setLoading(true);
                  fetch("/api/portal/recipes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ food: food.name, reason: food.reason }),
                  })
                    .then(r => r.json())
                    .then(data => { setRecipes(data.recipes || []); setLoading(false); })
                    .catch(() => { setFetchError(true); setLoading(false); });
                }}>
                  Try again
                </Button>
              </div>
            )}

            {/* Recipes */}
            {recipes.length > 0 && (
              <div className="space-y-4">
                {/* Recipe tabs */}
                <div className="flex gap-2 flex-wrap">
                  {recipes.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveRecipe(i)}
                      className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                      style={{
                        backgroundColor: activeRecipe === i ? "#2e3a20" : "#e8ddd0",
                        color: activeRecipe === i ? "#e8ddd0" : "#3d4a30",
                      }}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>

                {/* Active recipe */}
                {recipes[activeRecipe] && (() => {
                  const r = recipes[activeRecipe];
                  return (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e8ddd0", backgroundColor: "#ffffff" }}>
                      {/* Recipe header */}
                      <div className="px-5 py-4" style={{ backgroundColor: "#2e3a20" }}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h3 className="text-base font-semibold leading-snug" style={{ color: "#e8ddd0" }}>{r.name}</h3>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              data-testid={`button-download-recipe-${activeRecipe}`}
                              onClick={() => downloadRecipe(r, food.name)}
                              title="Download recipe"
                              className="p-1.5 rounded-md"
                              style={{ color: "#a8b88c" }}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              data-testid={`button-save-recipe-${activeRecipe}`}
                              onClick={() => handleSave(r)}
                              title={savedIds.has(r.name) ? "Saved to My Recipes" : "Save to My Recipes"}
                              className="p-1.5 rounded-md"
                              style={{ color: savedIds.has(r.name) ? "#c8d8a8" : "#a8b88c" }}
                              disabled={saving}
                            >
                              {savedIds.has(r.name)
                                ? <BookmarkCheck className="w-4 h-4" />
                                : <Bookmark className="w-4 h-4" />
                              }
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-4 flex-wrap">
                          {r.prepTime && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" style={{ color: "#a8b88c" }} />
                              <span className="text-xs" style={{ color: "#c8d8a8" }}>Prep: {r.prepTime}</span>
                            </div>
                          )}
                          {r.cookTime && (
                            <div className="flex items-center gap-1.5">
                              <ChefHat className="w-3.5 h-3.5" style={{ color: "#a8b88c" }} />
                              <span className="text-xs" style={{ color: "#c8d8a8" }}>Cook: {r.cookTime}</span>
                            </div>
                          )}
                          {r.servings && (
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" style={{ color: "#a8b88c" }} />
                              <span className="text-xs" style={{ color: "#c8d8a8" }}>{r.servings}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-5 space-y-5">
                        {/* Clinical note */}
                        {r.clinicalNote && (
                          <div className="rounded-lg px-4 py-3" style={{ backgroundColor: "#eef3e8", border: "1px solid #d0dcc0" }}>
                            <p className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>
                              <span className="font-semibold" style={{ color: "#5a7040" }}>Health note: </span>
                              {r.clinicalNote}
                            </p>
                          </div>
                        )}

                        {/* Ingredients */}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#5a7040" }}>
                            Ingredients
                          </p>
                          <ul className="space-y-2">
                            {r.ingredients.map((ing, idx) => (
                              <li key={idx} className="flex items-start gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: "#2e3a20" }} />
                                <span className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{ing}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Instructions */}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#5a7040" }}>
                            Instructions
                          </p>
                          <ol className="space-y-3">
                            {r.instructions.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <span
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                                >
                                  {idx + 1}
                                </span>
                                <span className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface PortalPatient {
  patientId: number;
  email: string;
  firstName: string;
  lastName: string;
  gender: string;
  clinicName: string;
  clinicianName: string;
}

interface PublishedProtocol {
  id: number;
  supplements: SupplementRecommendation[];
  clinicianNotes: string | null;
  dietaryGuidance: string | null;
  labDate: string | null;
  publishedAt: string;
  clinicName: string;
  clinicianName: string;
}

interface PortalLab {
  id: number;
  labDate: string;
  createdAt: string;
  labValues: any;
  interpretations: Array<{
    category: string;
    value?: number;
    unit: string;
    status: string;
    referenceRange: string;
    interpretation: string;
    recommendation?: string;
  }>;
  supplements: SupplementRecommendation[];
  patientSummary: string | null;
  preventRisk: any | null;
  insulinResistance: any | null;
  clinicianNotes: string | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  vitamin: "🌿",
  mineral: "✦",
  "hormone-support": "⚡",
  cardiovascular: "♡",
  thyroid: "⊕",
  iron: "●",
  metabolic: "◈",
  bone: "◻",
  probiotic: "◌",
  detox: "◆",
  general: "○",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#2e3a20",
  medium: "#5a6e40",
  low: "#7a8a64",
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  normal: { bg: "#f0f5ea", text: "#2e5e1a", dot: "#4a8a30" },
  borderline: { bg: "#fef8ec", text: "#7a5a10", dot: "#c9932a" },
  abnormal: { bg: "#fef0ee", text: "#8b2a1a", dot: "#c0392b" },
  critical: { bg: "#fce8e6", text: "#7a1a0a", dot: "#c0392b" },
};

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${time}, ${firstName}.`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusDot({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.normal;
  return <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: colors.dot }} />;
}

function SupplementCard({ supplement }: { supplement: SupplementRecommendation }) {
  const icon = CATEGORY_ICONS[supplement.category] || "○";
  const color = PRIORITY_COLORS[supplement.priority] || "#7a8a64";

  return (
    <div className="rounded-xl p-5 flex flex-col gap-3" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f2ede6" }}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight" style={{ color: "#1c2414" }}>{supplement.name}</p>
            <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{supplement.dose}</p>
          </div>
        </div>
        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: color }} />
      </div>
      {supplement.patientExplanation && (
        <p className="text-sm leading-relaxed" style={{ color: "#5a6a48" }}>{supplement.patientExplanation}</p>
      )}
      {supplement.caution && (
        <p className="text-xs leading-relaxed italic" style={{ color: "#9a8a70" }}>Note: {supplement.caution}</p>
      )}
    </div>
  );
}

function RiskBadge({ category }: { category: string }) {
  const configs: Record<string, { label: string; bg: string; text: string }> = {
    low: { label: "Low Risk", bg: "#edf5e6", text: "#2e5e1a" },
    borderline: { label: "Borderline Risk", bg: "#fef8ec", text: "#7a5a10" },
    intermediate: { label: "Intermediate Risk", bg: "#fef2e6", text: "#7a4010" },
    high: { label: "High Risk", bg: "#fce8e6", text: "#7a1a0a" },
  };
  const c = configs[category] || configs.low;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

function LabQuickViewDialog({ lab, dietaryGuidance, onClose }: { lab: PortalLab; dietaryGuidance?: string | null; onClose: () => void }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [quickViewFood, setQuickViewFood] = useState<FoodItem | null>(null);

  const grouped = lab.interpretations.reduce((acc: Record<string, typeof lab.interpretations>, interp) => {
    const cat = interp.category.includes(":") ? interp.category.split(":")[0].trim() : interp.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(interp);
    return acc;
  }, {});

  const hasCVRisk = !!lab.preventRisk;
  const hasIR = !!(lab.insulinResistance && lab.insulinResistance.likelihood && lab.insulinResistance.likelihood !== 'none');

  function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
    const open = expandedSection === id;
    return (
      <div className="border rounded-xl overflow-hidden" style={{ borderColor: "#ede8df" }}>
        <button
          className="w-full px-4 py-3.5 flex items-center justify-between text-left"
          style={{ backgroundColor: open ? "#f2ede6" : "#ffffff" }}
          onClick={() => setExpandedSection(open ? null : id)}
        >
          <div className="flex items-center gap-2.5">
            {icon}
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>{title}</span>
          </div>
          {open ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "#7a8a64" }} /> : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "#7a8a64" }} />}
        </button>
        {open && <div className="px-4 pb-4 pt-1">{children}</div>}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] p-0 gap-0 overflow-hidden" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "#e8ddd0" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold" style={{ color: "#1c2414" }}>
                Lab Visit Summary
              </DialogTitle>
              <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{formatDate(lab.labDate)}</p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-4 py-4 space-y-3">

            {/* 1. Lab values table */}
            {lab.interpretations.length > 0 && (
              <Section id="labs" title="Your Lab Values" icon={<FlaskConical className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                <div className="space-y-4 pt-1">
                  {Object.entries(grouped).map(([groupName, items]) => (
                    <div key={groupName}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#7a8a64" }}>{groupName}</p>
                      <div className="space-y-1.5">
                        {items.map((interp, i) => {
                          const statusConfig = STATUS_COLORS[interp.status] || STATUS_COLORS.normal;
                          const label = interp.category.includes(":") ? interp.category.split(":").slice(1).join(":").trim() : interp.category;
                          return (
                            <div key={i} className="flex items-start gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: "#f0ebe2" }}>
                              <StatusDot status={interp.status} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                  <span className="text-xs font-medium" style={{ color: "#1c2414" }}>{label}</span>
                                  {interp.value !== undefined && (
                                    <span className="text-xs font-mono font-semibold flex-shrink-0" style={{ color: statusConfig.text }}>
                                      {interp.value} {interp.unit}
                                    </span>
                                  )}
                                </div>
                                {interp.referenceRange && (
                                  <p className="text-xs mt-0.5" style={{ color: "#a0a880" }}>Ref: {interp.referenceRange}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 2. Cardiac assessment */}
            {hasCVRisk && (
              <Section id="cardiac" title="Heart Health Assessment" icon={<Heart className="w-4 h-4" style={{ color: "#c0392b" }} />}>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#5a6a48" }}>Overall risk level</span>
                    <RiskBadge category={lab.preventRisk.riskCategory} />
                  </div>
                  <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#f9f6f0" }}>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "#7a8a64" }}>10-year cardiovascular risk</span>
                      <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.tenYearCVDPercentage}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "#7a8a64" }}>10-year heart disease risk</span>
                      <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.tenYearASCVDPercentage}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "#7a8a64" }}>10-year heart failure risk</span>
                      <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.tenYearHFPercentage}</span>
                    </div>
                    {lab.preventRisk.thirtyYearCVDPercentage && (
                      <div className="flex justify-between text-xs pt-1 border-t" style={{ borderColor: "#e8ddd0" }}>
                        <span style={{ color: "#7a8a64" }}>30-year cardiovascular risk</span>
                        <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.thirtyYearCVDPercentage}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed italic" style={{ color: "#7a8a64" }}>
                    Based on the 2023 AHA PREVENT equations. These estimates are based on your lab values and help guide preventive care decisions.
                  </p>
                </div>
              </Section>
            )}

            {/* 3. Metabolic assessment */}
            {hasIR && (
              <Section id="metabolic" title="Metabolic Health Assessment" icon={<Activity className="w-4 h-4" style={{ color: "#c9932a" }} />}>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#5a6a48" }}>Metabolic balance</span>
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: lab.insulinResistance.likelihood === 'high' ? "#fce8e6" : lab.insulinResistance.likelihood === 'moderate' ? "#fef2e6" : "#fef8ec",
                        color: lab.insulinResistance.likelihood === 'high' ? "#7a1a0a" : lab.insulinResistance.likelihood === 'moderate' ? "#7a4010" : "#7a5a10",
                      }}
                    >
                      {lab.insulinResistance.likelihoodLabel || lab.insulinResistance.likelihood}
                    </span>
                  </div>
                  {lab.insulinResistance.patientSummary && (
                    <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>
                      {lab.insulinResistance.patientSummary}
                    </p>
                  )}
                  {lab.insulinResistance.phenotypes?.length > 0 && (
                    <div className="rounded-lg p-3" style={{ backgroundColor: "#f9f6f0" }}>
                      <p className="text-xs font-medium mb-1.5" style={{ color: "#5a6a48" }}>Identified patterns:</p>
                      {lab.insulinResistance.phenotypes.map((ph: any, i: number) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <p className="text-xs font-semibold" style={{ color: "#1c2414" }}>{ph.name}</p>
                          {ph.patientExplanation && (
                            <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#7a8a64" }}>{ph.patientExplanation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed italic" style={{ color: "#7a8a64" }}>
                    This assessment screens multiple metabolic markers together. Your care team will discuss what these findings mean for your health plan.
                  </p>
                </div>
              </Section>
            )}

            {/* 4. Dietary & lifestyle guidance from published protocol */}
            {dietaryGuidance && (() => {
              const qvFoodItems = parseFoodItems(dietaryGuidance);
              return (
                <Section id="dietary" title="Dietary & Lifestyle Guidance" icon={<Utensils className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                  <div className="pt-1 space-y-3">
                    <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#3d4a30" }}>{dietaryGuidance}</p>
                    <p className="text-xs italic" style={{ color: "#a0a880" }}>
                      Guidance provided by your care team at {" "}
                      <span className="not-italic font-medium">{lab.labDate ? formatDate(lab.labDate) : "your last visit"}</span>.
                    </p>
                    {qvFoodItems.length > 0 && (
                      <div className="rounded-lg p-3 mt-2" style={{ backgroundColor: "#f4efe8", border: "1px solid #e0d8cc" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <ChefHat className="w-3.5 h-3.5" style={{ color: "#2e3a20" }} />
                          <span className="text-xs font-semibold" style={{ color: "#1c2414" }}>Recipe Ideas</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {qvFoodItems.map((food, i) => (
                            <button
                              key={i}
                              data-testid={`button-qv-recipe-food-${i}`}
                              onClick={() => setQuickViewFood(food)}
                              className="flex items-center gap-2.5 text-left w-full rounded-md px-3 py-2"
                              style={{ backgroundColor: "#ffffff", border: "1px solid #e0d8cc" }}
                            >
                              <ChefHat className="w-3 h-3 flex-shrink-0" style={{ color: "#5a7040" }} />
                              <span className="text-xs font-medium flex-1 min-w-0 truncate" style={{ color: "#1c2414" }}>{food.name}</span>
                              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a0a880" }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              );
            })()}
            {quickViewFood && <RecipeDialog food={quickViewFood} onClose={() => setQuickViewFood(null)} />}

            {/* 5. Note from provider — shown when the clinician added a personal note */}
            {lab.clinicianNotes && (
              <Section id="provider-note" title="A Note from Your Provider" icon={<MessageSquare className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                <p className="text-sm leading-relaxed pt-1 whitespace-pre-wrap" style={{ color: "#3d4a30" }}>{lab.clinicianNotes}</p>
              </Section>
            )}

            {/* 6. Health summary — always last */}
            {lab.patientSummary && (
              <Section id="summary" title="Your Health Assessment" icon={<Info className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                <p className="text-sm leading-relaxed pt-1" style={{ color: "#3d4a30" }}>{lab.patientSummary}</p>
              </Section>
            )}

          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: "#e8ddd0" }}>
          <Button
            className="w-full"
            style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClinicalSnapshotSection({ labs }: { labs: PortalLab[] }) {
  if (labs.length < 2) return null;

  const labsForTrend = labs.map(l => ({
    id: l.id,
    labDate: l.labDate,
    labValues: l.labValues,
    patientId: 0,
    clinicianId: 0,
    notes: null,
    createdAt: l.createdAt,
    interpretationResult: null,
  })) as any[];

  const insights = generateTrendInsights(labsForTrend);
  if (insights.length === 0) return null;

  const improved = insights.filter(i => i.direction === 'improved');
  const monitored = insights.filter(i => i.direction === 'worsened');
  const stable = insights.filter(i => i.direction === 'stable');

  if (improved.length === 0 && monitored.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>Your Health Progress</h2>
        <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
          Comparing your two most recent lab visits
        </p>
      </div>

      <div className="space-y-2.5">
        {/* Urgent items first */}
        {insights.filter(i => i.severity === 'urgent').map((insight, i) => (
          <div key={`urgent-${i}`} className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "#fce8e6", border: "1px solid #f5cfc9" }}>
            <TrendingDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#c0392b" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#7a1a0a" }}>{insight.markerName}</p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#8b2a1a" }}>{insight.patientInsight}</p>
            </div>
          </div>
        ))}

        {/* Improvements */}
        {improved.filter(i => i.severity !== 'urgent').map((insight, i) => (
          <div key={`imp-${i}`} className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "#f0f5ea", border: "1px solid #d4e8c4" }}>
            <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#4a8a30" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#2e5e1a" }}>{insight.markerName}</p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#3a6a22" }}>{insight.patientInsight}</p>
            </div>
          </div>
        ))}

        {/* Monitored (worsened but not urgent) */}
        {monitored.filter(i => i.severity !== 'urgent').map((insight, i) => (
          <div key={`mon-${i}`} className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "#fef8ec", border: "1px solid #f0dfb0" }}>
            <TrendingDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#c9932a" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#7a5a10" }}>{insight.markerName}</p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#7a5a10" }}>{insight.patientInsight}</p>
            </div>
          </div>
        ))}

        {/* Stable summary pill */}
        {stable.length > 0 && (
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <Minus className="w-4 h-4 flex-shrink-0" style={{ color: "#7a8a64" }} />
            <p className="text-sm" style={{ color: "#5a6a48" }}>
              <span className="font-semibold">{stable.length} marker{stable.length !== 1 ? 's' : ''}</span> are holding steady:{" "}
              <span style={{ color: "#7a8a64" }}>{stable.map(s => s.markerName).join(", ")}</span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

interface SavedRecipeRow { id: number; foodName: string; recipeName: string; recipeData: Recipe; savedAt: string; }

const VISIT_TYPE_LABELS: Record<string, string> = {
  "new-patient": "New Patient", "follow-up": "Follow-up", "acute": "Acute Visit",
  "wellness": "Wellness", "procedure": "Procedure", "telemedicine": "Telemedicine", "lab-review": "Lab Review",
};

function PortalVisitSummaryCard({ vs }: {
  vs: { id: number; visitDate: string; visitType: string; chiefComplaint: string | null; patientSummary: string | null; summaryPublishedAt: string | null };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>
              {VISIT_TYPE_LABELS[vs.visitType] ?? vs.visitType}
            </span>
            <span className="text-xs" style={{ color: "#a0a880" }}>
              {formatDate(new Date(vs.visitDate).toISOString().split("T")[0])}
            </span>
          </div>
          {vs.chiefComplaint && (
            <p className="text-xs mt-0.5 italic" style={{ color: "#7a8a64" }}>"{vs.chiefComplaint}"</p>
          )}
        </div>
        <button
          className="text-xs font-medium flex items-center gap-1 flex-shrink-0"
          style={{ color: "#5a7040" }}
          onClick={() => setExpanded(e => !e)}
          data-testid={`button-toggle-visit-${vs.id}`}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Collapse" : "Read summary"}
        </button>
      </div>
      {expanded && vs.patientSummary && (
        <div className="mt-3 pt-3 border-t text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#3a3a3a", borderColor: "#e8ddd0" }}>
          {vs.patientSummary}
        </div>
      )}
    </div>
  );
}

function SavedRecipeCard({ row, onDelete }: { row: SavedRecipeRow; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const r = row.recipeData;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e8ddd0", backgroundColor: "#ffffff" }}>
      {/* Card header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen(v => !v)}
        data-testid={`button-saved-recipe-${row.id}`}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#2e3a20" }}>
          <ChefHat className="w-3.5 h-3.5" style={{ color: "#e8ddd0" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate" style={{ color: "#1c2414" }}>{r.name}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: "#7a8a64" }}>For: {row.foodName}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            data-testid={`button-download-saved-${row.id}`}
            onClick={e => { e.stopPropagation(); downloadRecipe(r, row.foodName); }}
            className="p-1.5 rounded-md"
            style={{ color: "#7a8a64" }}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid={`button-delete-saved-${row.id}`}
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-md"
            style={{ color: "#c0392b" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {open ? <ChevronUp className="w-4 h-4 ml-1" style={{ color: "#a0a880" }} /> : <ChevronDown className="w-4 h-4 ml-1" style={{ color: "#a0a880" }} />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid #f0ebe3" }}>
          <div className="flex gap-4 flex-wrap pt-3">
            {r.prepTime && <span className="text-xs" style={{ color: "#7a8a64" }}>Prep: {r.prepTime}</span>}
            {r.cookTime && <span className="text-xs" style={{ color: "#7a8a64" }}>Cook: {r.cookTime}</span>}
            {r.servings && <span className="text-xs" style={{ color: "#7a8a64" }}>{r.servings}</span>}
          </div>
          {r.clinicalNote && (
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#eef3e8", border: "1px solid #d0dcc0" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>
                <span className="font-semibold" style={{ color: "#5a7040" }}>Health note: </span>{r.clinicalNote}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#5a7040" }}>Ingredients</p>
            <ul className="space-y-1.5">
              {r.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: "#2e3a20" }} />
                  <span className="text-sm" style={{ color: "#3d4a30" }}>{ing}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#5a7040" }}>Instructions</p>
            <ol className="space-y-2">
              {r.instructions.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5" style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}>
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortalDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const unreadCount = usePortalUnreadCount();
  const [selectedLab, setSelectedLab] = useState<PortalLab | null>(null);
  const [showAllJourney, setShowAllJourney] = useState(false);

  const { data: patient, isLoading: patientLoading, error: patientError } = useQuery<PortalPatient>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const { data: protocol, isLoading: protocolLoading } = useQuery<PublishedProtocol | null>({
    queryKey: ["/api/portal/protocol"],
    enabled: !!patient,
    retry: false,
  });

  const { data: labs = [], isLoading: labsLoading } = useQuery<PortalLab[]>({
    queryKey: ["/api/portal/labs"],
    enabled: !!patient,
    retry: false,
  });

  const { data: messagingConfig } = useQuery<{
    messagingPreference: 'none' | 'in_app' | 'sms' | 'external_api';
    messagingPhone: string | null;
  }>({
    queryKey: ["/api/portal/messaging-config"],
    enabled: !!patient,
    retry: false,
  });

  const { data: savedRecipesList = [] } = useQuery<SavedRecipeRow[]>({
    queryKey: ["/api/portal/saved-recipes"],
    enabled: !!patient,
    retry: false,
  });

  const { data: visitSummaries = [] } = useQuery<{ id: number; visitDate: string; visitType: string; chiefComplaint: string | null; patientSummary: string | null; summaryPublishedAt: string | null }[]>({
    queryKey: ["/api/portal/encounters"],
    enabled: !!patient,
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/portal/encounters", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/portal/appointments"],
    enabled: !!patient,
    retry: false,
  });

  const deleteSavedRecipeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/portal/saved-recipes/${id}`, {});
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/portal/saved-recipes"] }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/login?mode=patient");
    },
  });

  useEffect(() => {
    if (patientError) setLocation("/login?mode=patient");
  }, [patientError, setLocation]);

  if (patientLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "#2e3a20" }}>
            <Leaf className="w-5 h-5" style={{ color: "#e8ddd0" }} />
          </div>
          <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your health portal…</p>
        </div>
      </div>
    );
  }

  if (!patient) return null;

  const latestLab = labs[0];
  const supplements = protocol?.supplements || [];
  const highPriority = supplements.filter((s) => s.priority === "high");
  const otherSupplements = supplements.filter((s) => s.priority !== "high");
  const journeyLabsToShow = showAllJourney ? labs : labs.slice(0, 4);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="h-12 sm:h-11 w-auto flex-shrink-0"
            style={{ mixBlendMode: "multiply" }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-portal-logout"
            className="text-xs gap-1.5 flex-shrink-0"
            style={{ color: "#7a8a64" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10 pb-28">
        {/* Hero greeting */}
        <div className="space-y-1 pt-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
            {getGreeting(patient.firstName)}
          </h1>
          <p className="text-sm" style={{ color: "#7a8a64" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {patient.clinicName && (
            <p className="text-xs pt-0.5" style={{ color: "#a0a890" }}>
              Care provided by {patient.clinicName}
            </p>
          )}
        </div>

        {/* Unread message notification banner — always visible when there are unread messages */}
        {unreadCount > 0 && (
          <Link href="/portal/messages">
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-4 cursor-pointer"
              style={{ backgroundColor: "#edf2e6", border: "1px solid #c8dbb8" }}
              data-testid="banner-unread-messages"
            >
              <div className="relative flex-shrink-0">
                <MessageSquare className="w-5 h-5" style={{ color: "#2e3a20" }} />
                <span
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                  {unreadCount === 1 ? "1 new message" : `${unreadCount} new messages`} from your care team
                </p>
                <p className="text-xs" style={{ color: "#7a8a64" }}>Tap to view and reply</p>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#a0a880" }} />
            </div>
          </Link>
        )}

        {/* Daily Check-In opt-in card / today summary */}
        <DailyCheckInCard />

        {/* Message Provider button */}
        {messagingConfig && messagingConfig.messagingPreference !== 'none' && (
          <div>
            {messagingConfig.messagingPreference === 'sms' && messagingConfig.messagingPhone ? (
              <a href={`sms:${messagingConfig.messagingPhone}`} data-testid="button-message-provider-sms">
                <button
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                >
                  <Smartphone className="w-4 h-4" />
                  Message your care team
                </button>
              </a>
            ) : (
              <Link href="/portal/messages">
                <button
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                  data-testid="button-message-provider-inapp"
                >
                  <MessageSquare className="w-4 h-4" />
                  Message your care team
                </button>
              </Link>
            )}
          </div>
        )}

        {/* Upcoming appointment card */}
        {(() => {
          const now = new Date();
          const next = appointments
            .filter(a => new Date(a.appointmentStart) >= now && a.status !== "cancelled")
            .sort((a, b) => new Date(a.appointmentStart).getTime() - new Date(b.appointmentStart).getTime())[0];
          const future = appointments.filter(a => new Date(a.appointmentStart) >= now && a.status !== "cancelled");
          if (!next) return null;
          const start = new Date(next.appointmentStart);
          const dateStr = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          const timeStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          return (
            <div className="rounded-xl px-4 py-4" style={{ backgroundColor: "#edf2e6", border: "1px solid #c8dbb8" }} data-testid="card-next-appointment">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#2e3a20" }}>
                  <CalendarDays className="w-4 h-4" style={{ color: "#e8ddd0" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#5a7040" }}>
                    {future.length > 1 ? `Next Appointment · ${future.length} upcoming` : "Next Appointment"}
                  </p>
                  <p className="text-base font-semibold leading-tight" style={{ color: "#1c2414" }}>{dateStr}</p>
                  <p className="text-sm mt-0.5" style={{ color: "#3d4a30" }}>{timeStr}{next.durationMinutes ? ` · ${next.durationMinutes} min` : ""}</p>
                  {(next.serviceType || next.staffName) && (
                    <p className="text-xs mt-1" style={{ color: "#7a8a64" }}>
                      {next.serviceType}{next.staffName ? ` · ${next.staffName}` : ""}
                    </p>
                  )}
                  {next.locationName && (
                    <p className="text-xs mt-0.5" style={{ color: "#9aaa84" }}>{next.locationName}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Quick stats strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarDays className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" style={{ color: "#7a8a64" }} />
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium leading-tight" style={{ color: "#7a8a64" }}>Last Labs</p>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: "#1c2414" }}>
              {latestLab ? formatDateShort(latestLab.labDate) : "None on file"}
            </p>
          </div>
          <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" style={{ color: "#7a8a64" }} />
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium leading-tight" style={{ color: "#7a8a64" }}>Protocol</p>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: "#1c2414" }}>
              {supplements.length > 0 ? `${supplements.length} supplement${supplements.length !== 1 ? "s" : ""}` : "Not shared"}
            </p>
          </div>
          <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <FlaskConical className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" style={{ color: "#7a8a64" }} />
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium leading-tight" style={{ color: "#7a8a64" }}>Lab Visits</p>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: "#1c2414" }}>
              {labs.length} visit{labs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Clinical snapshot (trend insights) */}
        {!labsLoading && <ClinicalSnapshotSection labs={labs} />}

        {/* Visit Summaries from clinician */}
        {visitSummaries.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4" style={{ color: "#5a7040" }} />
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>My Visit Summaries</h2>
            </div>
            <div className="space-y-3">
              {visitSummaries.map(vs => (
                <PortalVisitSummaryCard key={vs.id} vs={vs} />
              ))}
            </div>
          </section>
        )}

        {/* Lab visit history — all visits, clickable */}
        {labs.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>My Lab Evaluations</h2>
              <p className="text-xs" style={{ color: "#7a8a64" }}>Tap to view details</p>
            </div>
            <div className="space-y-2">
              {journeyLabsToShow.map((lab, i) => (
                <button
                  key={lab.id}
                  className="w-full rounded-xl px-4 py-3.5 flex items-center justify-between text-left transition-opacity active:opacity-80"
                  style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
                  onClick={() => setSelectedLab(lab)}
                  data-testid={`button-view-lab-${lab.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{ backgroundColor: i === 0 ? "#2e3a20" : "#e8ddd0", color: i === 0 ? "#e8ddd0" : "#2e3a20" }}
                    >
                      {labs.length - i}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: "#1c2414" }}>{formatDate(lab.labDate)}</p>
                      <p className="text-xs" style={{ color: "#7a8a64" }}>
                        {lab.interpretations?.length || 0} markers reviewed
                        {lab.preventRisk ? " · Heart risk calculated" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {i === 0 && (
                      <Badge variant="secondary" className="text-xs hidden sm:flex" style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}>
                        Latest
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#a0a880" }} />
                  </div>
                </button>
              ))}
              {labs.length > 4 && (
                <button
                  className="w-full py-2.5 text-sm text-center rounded-xl"
                  style={{ color: "#5a7040", backgroundColor: "transparent" }}
                  onClick={() => setShowAllJourney(v => !v)}
                >
                  {showAllJourney ? "Show less" : `Show ${labs.length - 4} more visit${labs.length - 4 !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Empty state for no labs */}
        {labs.length === 0 && !labsLoading && (
          <section>
            <div className="rounded-xl p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
              <FlaskConical className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>Your lab results will appear here</p>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Once your care team reviews your labs, your personalized health insights will be shared through this portal.
              </p>
            </div>
          </section>
        )}

        {/* Supplement protocol section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>
                Your Wellness Protocol
              </h2>
              {protocol?.publishedAt && (
                <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                  Updated {formatDate(protocol.publishedAt)}
                  {protocol.clinicianName ? ` by ${protocol.clinicianName}` : ""}
                </p>
              )}
            </div>
            {supplements.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs" style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}>
                  <Leaf className="w-3 h-3 mr-1" />
                  Active
                </Badge>
                <Link href="/portal/supplements">
                  <button className="text-xs flex items-center gap-0.5" style={{ color: "#7a8a64" }} data-testid="link-view-full-protocol">
                    View all
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </Link>
              </div>
            )}
          </div>

          {protocolLoading ? (
            <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
              <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your protocol…</p>
            </div>
          ) : supplements.length === 0 ? (
            <div className="rounded-xl p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
              <Sparkles className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>Your protocol is being prepared</p>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Your care team will share your personalized supplement recommendations here after your lab results have been reviewed.
              </p>
            </div>
          ) : (
            <>
              {highPriority.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#7a8a64" }}>Priority</p>
                  {highPriority.map((s, i) => <SupplementCard key={i} supplement={s} />)}
                </div>
              )}
              {otherSupplements.length > 0 && (
                <div className="space-y-3">
                  {highPriority.length > 0 && (
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#7a8a64" }}>Also recommended</p>
                  )}
                  {otherSupplements.map((s, i) => <SupplementCard key={i} supplement={s} />)}
                </div>
              )}
            </>
          )}
        </section>

        {/* Saved Recipes */}
        {savedRecipesList.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4" style={{ color: "#5a7040" }} />
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>My Saved Recipes</h2>
            </div>
            <div className="space-y-2">
              {savedRecipesList.map(row => (
                <SavedRecipeCard
                  key={row.id}
                  row={row}
                  onDelete={() => deleteSavedRecipeMutation.mutate(row.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Privacy footer */}
        <div className="text-center">
          <p className="text-xs" style={{ color: "#b0b8a0" }}>
            Your data is private and accessible only to you and your care team.
            <br />
            Powered by ReAlign Health.
          </p>
        </div>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t z-40" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 flex">
          <Link href="/portal/dashboard" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-home">
              <CalendarDays className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-semibold" style={{ color: "#2e3a20" }}>Overview</span>
            </button>
          </Link>
          <Link href="/portal/forms" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-forms">
              <FileText className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Forms</span>
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
                    data-testid="badge-messages-unread"
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

      {/* Lab quick view dialog */}
      {selectedLab && <LabQuickViewDialog lab={selectedLab} dietaryGuidance={protocol?.dietaryGuidance} onClose={() => setSelectedLab(null)} />}
    </div>
  );
}

// ── Daily Check-In Card ───────────────────────────────────────────────────
function DailyCheckInCard() {
  const { data: settings } = useQuery<{
    trackingMode: "off" | "standard" | "power";
    enabled: boolean;
    setupCompleted: boolean;
  }>({ queryKey: ["/api/portal/tracking/settings"], retry: false });
  const { data: today } = useQuery<{
    date?: string;
    moodScore?: number | null;
    energyScore?: number | null;
    sleepHours?: string | null;
    updatedAt?: string;
  }>({
    queryKey: ["/api/portal/tracking/checkins/today"],
    enabled: !!settings && settings.trackingMode !== "off",
    retry: false,
  });

  if (!settings) return null;

  const tracking = settings.trackingMode !== "off";
  const completedToday = !!(today?.moodScore || today?.energyScore || today?.sleepHours || today?.updatedAt);

  if (!tracking) {
    return (
      <Link href="/portal/check-in">
        <div
          className="rounded-xl border-2 border-dashed p-4 cursor-pointer hover-elevate"
          style={{ borderColor: "#c8dbb8", backgroundColor: "#f5fbef" }}
          data-testid="card-checkin-optin"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#edf4e4" }}>
              <Sun className="w-5 h-5" style={{ color: "#2e3a20" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>Try Daily Check-In</p>
              <p className="text-xs mt-0.5" style={{ color: "#5a6048" }}>
                60 seconds a day on food, sleep, mood, and meds. Helps your team connect the dots between visits.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#a0a880" }} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/portal/check-in">
      <div
        className="rounded-xl border p-4 cursor-pointer hover-elevate"
        style={{ borderColor: completedToday ? "#c8dbb8" : "#d4c9b5", backgroundColor: completedToday ? "#edf4e4" : "#ffffff" }}
        data-testid="card-checkin-today"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: completedToday ? "#2e3a20" : "#edf4e4" }}>
            {completedToday
              ? <CheckCircle2 className="w-5 h-5" style={{ color: "#ffffff" }} />
              : <Sun className="w-5 h-5" style={{ color: "#2e3a20" }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>
              {completedToday ? "Today's check-in is in" : "Open today's check-in"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#5a6048" }}>
              {completedToday ? "Tap to update or add details." : "Quick log on food, sleep, mood, and meds."}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#a0a880" }} />
        </div>
      </div>
    </Link>
  );
}
