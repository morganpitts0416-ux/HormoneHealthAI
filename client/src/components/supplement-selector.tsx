import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, Plus, X, Pill, FlaskConical } from "lucide-react";
import type { SupplementRecommendation } from "@shared/schema";

export interface CustomSupplement {
  id: string;
  name: string;
  dose: string;
  indication: string;
}

interface SupplementSelectorProps {
  supplements: SupplementRecommendation[];
  selectedNames: Set<string>;
  onSelectionChange: (names: Set<string>) => void;
  customSupplements: CustomSupplement[];
  onCustomChange: (customs: CustomSupplement[]) => void;
}

const PRIORITY_STYLES: Record<string, { badge: string; border: string }> = {
  high:   { badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",   border: "border-red-200 dark:border-red-800" },
  medium: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  low:    { badge: "bg-muted text-muted-foreground",                                  border: "" },
};

export function SupplementSelector({
  supplements,
  selectedNames,
  onSelectionChange,
  customSupplements,
  onCustomChange,
}: SupplementSelectorProps) {
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDose, setNewDose] = useState("");
  const [newIndication, setNewIndication] = useState("");

  const toggleExpanded = (name: string) => {
    setExpandedNames(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleSelected = (name: string) => {
    const next = new Set(selectedNames);
    next.has(name) ? next.delete(name) : next.add(name);
    onSelectionChange(next);
  };

  const handleAddCustom = () => {
    if (!newName.trim() || !newDose.trim()) return;
    const newEntry: CustomSupplement = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      dose: newDose.trim(),
      indication: newIndication.trim() || "Provider-selected supplement.",
    };
    onCustomChange([...customSupplements, newEntry]);
    setNewName("");
    setNewDose("");
    setNewIndication("");
    setShowAddForm(false);
  };

  const removeCustom = (id: string) => {
    onCustomChange(customSupplements.filter(c => c.id !== id));
  };

  const selectedCount = selectedNames.size + customSupplements.length;

  return (
    <Card data-testid="card-supplement-selector">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-primary" />
            <CardTitle>Supplement Protocol</CardTitle>
          </div>
          <Badge variant="outline" data-testid="badge-selected-count">
            {selectedCount} selected for patient report
          </Badge>
        </div>
        <CardDescription>
          Review the protocol ranked by lab evidence. Select which supplements to include on the patient report, or add a custom recommendation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">

        {supplements.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No protocol-based supplements generated for this result.</p>
        )}

        {/* Standard Recommended Supplements */}
        {supplements.map((supp, index) => {
          const isSelected = selectedNames.has(supp.name);
          const isExpanded = expandedNames.has(supp.name);
          const styles = PRIORITY_STYLES[supp.priority] || PRIORITY_STYLES.low;

          return (
            <div
              key={supp.name}
              className={`rounded-md border transition-colors ${isSelected ? styles.border || "border-border" : "border-border opacity-60"}`}
              data-testid={`supplement-row-${index}`}
            >
              {/* Main row */}
              <div className="flex items-start gap-3 p-3">
                <div className="pt-0.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelected(supp.name)}
                    data-testid={`checkbox-supplement-${index}`}
                    aria-label={`Include ${supp.name} on patient report`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold text-sm ${!isSelected ? "text-muted-foreground" : ""}`}>
                      {supp.name}
                    </span>
                    <span className={`px-2 py-0 text-xs rounded-full font-medium ${styles.badge}`}>
                      {supp.priority}
                    </span>
                    {supp.confidenceLevel && (
                      <span className="px-2 py-0 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {supp.confidenceLevel} confidence
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">{supp.dose}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{supp.indication}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 h-7 w-7"
                  onClick={() => toggleExpanded(supp.name)}
                  data-testid={`button-expand-supplement-${index}`}
                  aria-label={isExpanded ? "Collapse details" : "Expand details"}
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />
                  }
                </Button>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/50">
                  <div className="pt-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Clinical Rationale</p>
                    <p className="text-sm">{supp.rationale}</p>
                  </div>
                  {supp.supportingFindings && supp.supportingFindings.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Supporting Findings</p>
                      <div className="flex flex-wrap gap-1">
                        {supp.supportingFindings.map((f, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {supp.phenotypes && supp.phenotypes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Linked Phenotypes</p>
                      <div className="flex flex-wrap gap-1">
                        {supp.phenotypes.map((ph, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{ph}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {supp.caution && (
                    <div className="rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400 mb-0.5">Caution</p>
                      <p className="text-xs text-amber-800 dark:text-amber-300">{supp.caution}</p>
                    </div>
                  )}
                  {supp.patientExplanation && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Patient-Facing Description</p>
                      <p className="text-xs text-muted-foreground italic">{supp.patientExplanation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Custom Supplements */}
        {customSupplements.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Additions</p>
              {customSupplements.map(custom => (
                <div
                  key={custom.id}
                  className="flex items-start gap-3 p-3 rounded-md border border-primary/30 bg-primary/5"
                  data-testid={`custom-supplement-${custom.id}`}
                >
                  <FlaskConical className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{custom.name}</span>
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary">Custom</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">{custom.dose}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{custom.indication}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 h-7 w-7"
                    onClick={() => removeCustom(custom.id)}
                    data-testid={`button-remove-custom-${custom.id}`}
                    aria-label={`Remove ${custom.name}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Add Custom Supplement Form */}
        {showAddForm ? (
          <>
            {(supplements.length > 0 || customSupplements.length > 0) && <Separator />}
            <div className="space-y-3 p-3 rounded-md border border-primary/30 bg-primary/5" data-testid="form-add-custom">
              <p className="text-sm font-semibold">Add Custom Supplement</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="custom-supp-name" className="text-xs font-medium">
                    Supplement Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="custom-supp-name"
                    placeholder="e.g. Berberine HCl"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    data-testid="input-custom-supp-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="custom-supp-dose" className="text-xs font-medium">
                    Dose & Timing <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="custom-supp-dose"
                    placeholder="e.g. 500 mg twice daily with meals"
                    value={newDose}
                    onChange={e => setNewDose(e.target.value)}
                    data-testid="input-custom-supp-dose"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="custom-supp-indication" className="text-xs font-medium">
                  Patient-Facing Description
                </Label>
                <Textarea
                  id="custom-supp-indication"
                  placeholder="Brief description for the patient report (e.g. Supports healthy blood sugar and insulin sensitivity)"
                  value={newIndication}
                  onChange={e => setNewIndication(e.target.value)}
                  data-testid="input-custom-supp-indication"
                  className="resize-none text-sm"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleAddCustom}
                  disabled={!newName.trim() || !newDose.trim()}
                  data-testid="button-confirm-add-custom"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add to Report
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewName("");
                    setNewDose("");
                    setNewIndication("");
                  }}
                  data-testid="button-cancel-add-custom"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              data-testid="button-add-custom-supplement"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Custom Supplement
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
