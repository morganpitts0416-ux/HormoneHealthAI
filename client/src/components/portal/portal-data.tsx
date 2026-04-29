import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FlaskConical, ChevronRight, Heart, Activity, Utensils, ChevronDown, ChevronUp,
  Info, ChefHat, Clock, Users, Loader2, ArrowLeft, Bookmark, BookmarkCheck,
  Download, Trash2, MessageSquare,
} from "lucide-react";
import type { SupplementRecommendation } from "@shared/schema";

// ───── Types ───────────────────────────────────────────────────────────────
export interface FoodItem { name: string; reason: string; }

export interface Recipe {
  name: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  ingredients: string[];
  instructions: string[];
  clinicalNote: string;
}

export interface PortalLab {
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

export interface SavedRecipeRow {
  id: number;
  foodName: string;
  recipeName: string;
  recipeData: Recipe;
  savedAt: string;
}

// ───── Format helpers ──────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ───── Status / colour maps ────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  normal:     { bg: "#f0f5ea", text: "#2e5e1a", dot: "#4a8a30" },
  borderline: { bg: "#fef8ec", text: "#7a5a10", dot: "#c9932a" },
  abnormal:   { bg: "#fef0ee", text: "#8b2a1a", dot: "#c0392b" },
  critical:   { bg: "#fce8e6", text: "#7a1a0a", dot: "#c0392b" },
};

function StatusDot({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.normal;
  return <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: c.dot }} />;
}

function RiskBadge({ category }: { category: string }) {
  const configs: Record<string, { label: string; bg: string; text: string }> = {
    low:          { label: "Low Risk",          bg: "#edf5e6", text: "#2e5e1a" },
    borderline:   { label: "Borderline Risk",   bg: "#fef8ec", text: "#7a5a10" },
    intermediate: { label: "Intermediate Risk", bg: "#fef2e6", text: "#7a4010" },
    high:         { label: "High Risk",         bg: "#fce8e6", text: "#7a1a0a" },
  };
  const c = configs[category] || configs.low;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

// ───── Dietary guidance parser ─────────────────────────────────────────────
export function parseFoodItems(text: string): FoodItem[] {
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

    const dashSplit = trimmed.split(/\s+[-–]\s+/);
    if (dashSplit.length >= 2) {
      const rawName = dashSplit[0].trim();
      const name = rawName.replace(/^\([^)]*\)\s*/, '').trim();
      if (name.length >= 3 && name.length <= 55) {
        items.push({ name, reason: dashSplit.slice(1).join(' - ').trim() });
        continue;
      }
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 2 && colonIdx <= 50) {
      const name = trimmed.substring(0, colonIdx).trim();
      const reason = trimmed.substring(colonIdx + 1).trim();
      if (reason.length > 5) { items.push({ name, reason }); continue; }
    }
    const parenMatch = trimmed.match(/^([A-Za-z][A-Za-z\s,&/]+?)(\s*\(.+)/);
    if (parenMatch && parenMatch[1].trim().length >= 3 && parenMatch[1].trim().length <= 50) {
      items.push({ name: parenMatch[1].trim(), reason: parenMatch[2].trim() });
    }
  }
  return items;
}

// ───── Recipe categorisation (book chapters) ───────────────────────────────
export const RECIPE_CATEGORIES: Array<{
  id: string;
  label: string;
  blurb: string;
  keywords: string[];
}> = [
  {
    id: "proteins",
    label: "Proteins",
    blurb: "Hormone- and muscle-supporting building blocks.",
    keywords: ["salmon", "chicken", "turkey", "fish", "egg", "beef", "lamb", "pork", "tofu", "tempeh", "sardine", "anchovy", "shrimp", "tuna", "cod", "halibut", "trout", "bison"],
  },
  {
    id: "vegetables",
    label: "Vegetables & Greens",
    blurb: "Fibre, micronutrients, and the foundation of every plate.",
    keywords: ["spinach", "kale", "broccoli", "cabbage", "brussels", "asparagus", "cauliflower", "arugula", "lettuce", "chard", "collard", "beet", "carrot", "pepper", "onion", "garlic", "mushroom", "tomato", "celery", "cucumber", "zucchini", "squash", "pumpkin", "sweet potato", "potato", "leek", "fennel", "bok choy", "watercress"],
  },
  {
    id: "fruits",
    label: "Fruits",
    blurb: "Naturally sweet, antioxidant-rich, easy to grab.",
    keywords: ["berry", "berries", "apple", "pear", "orange", "lemon", "lime", "grapefruit", "banana", "pomegranate", "cherry", "peach", "plum", "mango", "papaya", "pineapple", "kiwi", "fig", "date", "raisin", "watermelon", "melon", "grape", "apricot"],
  },
  {
    id: "grains",
    label: "Grains & Legumes",
    blurb: "Slow carbs and plant protein for steady energy.",
    keywords: ["oat", "quinoa", "rice", "barley", "buckwheat", "millet", "lentil", "bean", "chickpea", "garbanzo", "pea", "hummus", "edamame", "amaranth", "farro", "bulgur"],
  },
  {
    id: "fats",
    label: "Healthy Fats, Nuts & Seeds",
    blurb: "Hormone- and brain-supporting fats your body needs.",
    keywords: ["avocado", "olive", "nut", "almond", "walnut", "cashew", "pistachio", "pecan", "macadamia", "seed", "chia", "flax", "hemp", "coconut", "ghee", "butter", "tahini", "sesame"],
  },
  {
    id: "ferments",
    label: "Beverages & Ferments",
    blurb: "Hydration, gut support, and warming sips.",
    keywords: ["tea", "kombucha", "water", "coffee", "kefir", "yogurt", "cheese", "milk", "bone broth", "broth", "sauerkraut", "kimchi", "miso"],
  },
];

export function categorizeFood(name: string): string {
  const lower = name.toLowerCase();
  for (const cat of RECIPE_CATEGORIES) {
    if (cat.keywords.some(k => lower.includes(k))) return cat.id;
  }
  return "other";
}

// ───── Recipe download ─────────────────────────────────────────────────────
export function downloadRecipe(recipe: Recipe, foodName: string) {
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

// ───── Recipe dialog ───────────────────────────────────────────────────────
export function RecipeDialog({ food, onClose }: { food: FoodItem; onClose: () => void }) {
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
        setSavedIds(prev => {
          const next = new Set(prev);
          next.add(recipe.name);
          return next;
        });
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
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: "#e8ddd0", backgroundColor: "#f9f6f0" }}
        >
          <button onClick={onClose} className="p-1 rounded-md" style={{ color: "#7a8a64" }} data-testid="button-close-recipe">
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
            <div className="rounded-lg p-4" style={{ backgroundColor: "#eef3e8", border: "1px solid #d0dcc0" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#5a7040" }}>
                Why your provider recommended this
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{food.reason}</p>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#2e3a20" }} />
                <p className="text-sm font-medium" style={{ color: "#3d4a30" }}>Generating recipes just for you…</p>
                <p className="text-xs text-center max-w-xs" style={{ color: "#7a8a64" }}>
                  Your AI-powered recipes are being personalized based on your lab results. This takes about 30–40 seconds — please hold tight!
                </p>
              </div>
            )}

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

            {recipes.length > 0 && (
              <div className="space-y-4">
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
                      data-testid={`button-recipe-tab-${i}`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>

                {recipes[activeRecipe] && (() => {
                  const r = recipes[activeRecipe];
                  return (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e8ddd0", backgroundColor: "#ffffff" }}>
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
                                : <Bookmark className="w-4 h-4" />}
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
                        {r.clinicalNote && (
                          <div className="rounded-lg px-4 py-3" style={{ backgroundColor: "#eef3e8", border: "1px solid #d0dcc0" }}>
                            <p className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>
                              <span className="font-semibold" style={{ color: "#5a7040" }}>Health note: </span>
                              {r.clinicalNote}
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#5a7040" }}>Ingredients</p>
                          <ul className="space-y-2">
                            {r.ingredients.map((ing, idx) => (
                              <li key={idx} className="flex items-start gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: "#2e3a20" }} />
                                <span className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{ing}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#5a7040" }}>Instructions</p>
                          <ol className="space-y-3">
                            {r.instructions.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5" style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}>
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

// ───── Lab quick-view dialog ───────────────────────────────────────────────
export function LabQuickViewDialog({
  lab, dietaryGuidance, onClose,
}: { lab: PortalLab; dietaryGuidance?: string | null; onClose: () => void }) {
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
          data-testid={`button-lab-section-${id}`}
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
                    Based on the 2023 AHA PREVENT equations. These estimates help guide preventive care decisions.
                  </p>
                </div>
              </Section>
            )}

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
                </div>
              </Section>
            )}

            {dietaryGuidance && (() => {
              const qvFoodItems = parseFoodItems(dietaryGuidance);
              return (
                <Section id="dietary" title="Dietary & Lifestyle Guidance" icon={<Utensils className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                  <div className="pt-1 space-y-3">
                    <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#3d4a30" }}>{dietaryGuidance}</p>
                    <p className="text-xs italic" style={{ color: "#a0a880" }}>
                      Guidance provided by your care team at{" "}
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

            {lab.clinicianNotes && (
              <Section id="provider-note" title="A Note from Your Provider" icon={<MessageSquare className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                <p className="text-sm leading-relaxed pt-1 whitespace-pre-wrap" style={{ color: "#3d4a30" }}>{lab.clinicianNotes}</p>
              </Section>
            )}

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
            data-testid="button-close-lab-summary"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───── Visit summary card ──────────────────────────────────────────────────
const VISIT_TYPE_LABELS: Record<string, string> = {
  "new-patient": "New Patient", "follow-up": "Follow-up", "acute": "Acute Visit",
  "wellness": "Wellness", "procedure": "Procedure", "telemedicine": "Telemedicine", "lab-review": "Lab Review",
};

export interface PortalVisitSummary {
  id: number;
  visitDate: string;
  visitType: string;
  chiefComplaint: string | null;
  patientSummary: string | null;
  summaryPublishedAt: string | null;
}

export function PortalVisitSummaryCard({ vs }: { vs: PortalVisitSummary }) {
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

// ───── Saved recipe card ───────────────────────────────────────────────────
export function SavedRecipeCard({ row, onDelete }: { row: SavedRecipeRow; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const r = row.recipeData;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e8ddd0", backgroundColor: "#ffffff" }}>
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

      {open && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid #f0ebe3" }}>
          <div className="flex gap-4 flex-wrap pt-3">
            {r.prepTime && <span className="text-xs" style={{ color: "#7a8a64" }}>Prep: {r.prepTime}</span>}
            {r.cookTime && <span className="text-xs" style={{ color: "#7a8a64" }}>Cook: {r.cookTime}</span>}
            {r.servings && <span className="text-xs" style={{ color: "#7a8a64" }}>{r.servings}</span>}
          </div>
          {r.clinicalNote && (
            <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "#eef3e8", border: "1px solid #d0dcc0" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>
                <span className="font-semibold" style={{ color: "#5a7040" }}>Health note: </span>
                {r.clinicalNote}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#5a7040" }}>Ingredients</p>
            <ul className="space-y-1.5">
              {r.ingredients.map((ing, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: "#2e3a20" }} />
                  <span className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>{ing}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#5a7040" }}>Instructions</p>
            <ol className="space-y-2">
              {r.instructions.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}>
                    {idx + 1}
                  </span>
                  <span className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
