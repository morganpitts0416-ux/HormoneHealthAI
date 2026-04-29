import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChefHat, BookmarkCheck, ChevronRight, BookOpen, Sparkles } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  RecipeDialog,
  SavedRecipeCard,
  parseFoodItems,
  categorizeFood,
  RECIPE_CATEGORIES,
  type FoodItem,
  type SavedRecipeRow,
} from "@/components/portal/portal-data";

interface PublishedProtocol {
  id: number;
  dietaryGuidance: string | null;
  publishedAt: string;
  clinicianName: string;
}

export default function PortalRecipesPage() {
  const queryClient = useQueryClient();
  const [activeFood, setActiveFood] = useState<FoodItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: protocol } = useQuery<PublishedProtocol | null>({
    queryKey: ["/api/portal/protocol"],
    retry: false,
  });

  const { data: savedRecipesList = [] } = useQuery<SavedRecipeRow[]>({
    queryKey: ["/api/portal/saved-recipes"],
    retry: false,
  });

  const deleteSavedRecipeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/portal/saved-recipes/${id}`, {});
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/portal/saved-recipes"] }),
  });

  // Parse + group food items into book "chapters" by category.
  const foodItems = useMemo(
    () => (protocol?.dietaryGuidance ? parseFoodItems(protocol.dietaryGuidance) : []),
    [protocol?.dietaryGuidance],
  );

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, FoodItem[]> = {};
    for (const item of foodItems) {
      const catId = categorizeFood(item.name);
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(item);
    }
    return groups;
  }, [foodItems]);

  const visibleCategories = RECIPE_CATEGORIES.filter(c => groupedByCategory[c.id]?.length > 0);
  const otherFoods = groupedByCategory["other"] || [];

  const showAllChapters = activeCategory === "all";

  return (
    <PortalShell activeTab="home" headerSubtitle="Recipe Book">
      {/* Book cover-style hero */}
      <section
        className="rounded-2xl px-6 py-7 sm:px-8 sm:py-9 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #f4ecd8 0%, #ebe0c4 50%, #d8c69a 100%)",
          border: "1px solid #c4b380",
          boxShadow: "inset 0 0 0 6px #f4ecd8, inset 0 0 0 7px #c4b380",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
        data-testid="section-recipe-book-cover"
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#2e3a20" }}
          >
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: "#f4ecd8" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] mb-1" style={{ color: "#5a4a20" }}>
              Your Personal
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold leading-tight" style={{ color: "#2e2410" }}>
              Recipe Book
            </h1>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "#5a4a20" }}>
              {foodItems.length > 0
                ? `Built from your care team's nutrition plan${protocol?.clinicianName ? ` from ${protocol.clinicianName}` : ""}. Tap any food to generate fresh recipe ideas.`
                : "Once your care team shares your nutrition plan, ingredients will appear here as recipe inspiration."}
            </p>
          </div>
        </div>
      </section>

      {/* Saved recipes — always shown if any */}
      {savedRecipesList.length > 0 && (
        <section className="space-y-3" data-testid="section-saved-recipes">
          <ChapterHeader
            chapter="Favourites"
            title="My Saved Recipes"
            blurb="Recipes you've bookmarked for later."
            icon={<BookmarkCheck className="w-4 h-4" style={{ color: "#5a7040" }} />}
          />
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

      {/* Empty state when no protocol */}
      {foodItems.length === 0 && (
        <div className="rounded-xl p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
          <Sparkles className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
          <p className="text-sm font-medium" style={{ color: "#1c2414" }}>Your recipe book is being prepared</p>
          <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
            Your care team will share a nutrition plan after your labs are reviewed. Recommended foods will turn into recipe chapters here.
          </p>
        </div>
      )}

      {/* Chapter chips (table of contents) */}
      {visibleCategories.length > 0 && (
        <section className="space-y-3" data-testid="section-chapter-tabs">
          <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#7a8a64", letterSpacing: "0.08em" }}>
            Chapters
          </p>
          <div className="flex gap-2 flex-wrap">
            <ChapterChip
              label="All chapters"
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              testId="chip-chapter-all"
            />
            {visibleCategories.map(cat => (
              <ChapterChip
                key={cat.id}
                label={cat.label}
                count={groupedByCategory[cat.id].length}
                active={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
                testId={`chip-chapter-${cat.id}`}
              />
            ))}
            {otherFoods.length > 0 && (
              <ChapterChip
                label="More foods"
                count={otherFoods.length}
                active={activeCategory === "other"}
                onClick={() => setActiveCategory("other")}
                testId="chip-chapter-other"
              />
            )}
          </div>
        </section>
      )}

      {/* Chapters */}
      {visibleCategories.map((cat, idx) => {
        if (!showAllChapters && activeCategory !== cat.id) return null;
        return (
          <Chapter
            key={cat.id}
            chapterNumber={String(idx + 1).padStart(2, "0")}
            title={cat.label}
            blurb={cat.blurb}
            foods={groupedByCategory[cat.id]}
            onPick={setActiveFood}
          />
        );
      })}

      {otherFoods.length > 0 && (showAllChapters || activeCategory === "other") && (
        <Chapter
          chapterNumber={String(visibleCategories.length + 1).padStart(2, "0")}
          title="More foods"
          blurb="Other items from your nutrition plan."
          foods={otherFoods}
          onPick={setActiveFood}
        />
      )}

      {activeFood && <RecipeDialog food={activeFood} onClose={() => setActiveFood(null)} />}
    </PortalShell>
  );
}

// ─── Chapter helpers ──────────────────────────────────────────────────────
function ChapterHeader({
  chapter, title, blurb, icon,
}: {
  chapter?: string;
  title: string;
  blurb?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {chapter && (
        <p
          className="text-[11px] uppercase tracking-[0.2em]"
          style={{ color: "#9a8a4c" }}
        >
          Chapter · {chapter}
        </p>
      )}
      <div className="flex items-center gap-2">
        {icon}
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: "#1c2414", fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {title}
        </h2>
      </div>
      {blurb && (
        <p className="text-sm" style={{ color: "#7a8a64" }}>{blurb}</p>
      )}
    </div>
  );
}

function ChapterChip({
  label, count, active, onClick, testId,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
      style={{
        backgroundColor: active ? "#2e3a20" : "#ffffff",
        color: active ? "#e8ddd0" : "#3d4a30",
        border: `1px solid ${active ? "#2e3a20" : "#e0d8cc"}`,
      }}
    >
      {label}{count !== undefined ? ` · ${count}` : ""}
    </button>
  );
}

function Chapter({
  chapterNumber, title, blurb, foods, onPick,
}: {
  chapterNumber: string;
  title: string;
  blurb: string;
  foods: FoodItem[];
  onPick: (food: FoodItem) => void;
}) {
  return (
    <section className="space-y-3" data-testid={`chapter-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <ChapterHeader chapter={chapterNumber} title={title} blurb={blurb} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {foods.map((food, i) => (
          <button
            key={`${food.name}-${i}`}
            onClick={() => onPick(food)}
            data-testid={`button-recipe-food-${chapterNumber}-${i}`}
            className="text-left rounded-xl px-4 py-3.5 hover-elevate active-elevate-2 flex items-start gap-3"
            style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#edf4e4" }}
            >
              <ChefHat className="w-4 h-4" style={{ color: "#2e3a20" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight truncate" style={{ color: "#1c2414" }}>
                {food.name}
              </p>
              <p className="text-xs mt-0.5 line-clamp-2 leading-snug" style={{ color: "#7a8a64" }}>
                {food.reason}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "#a0a880" }} />
          </button>
        ))}
      </div>
    </section>
  );
}
