import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Package, Plus, Pencil, Trash2, Sparkles, ChevronDown, ChevronRight,
  FlaskConical, Activity, Tag, DollarSign, Save, X, CheckCircle,
  Filter, RotateCcw, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface LabMarkerDefault {
  key: string;
  displayName: string;
  unit: string;
  gender: string;
  optimalMin?: number;
  optimalMax?: number;
  normalMin?: number;
  normalMax?: number;
  notes?: string;
}

interface ClinicianSupplement {
  id: number;
  clinicianId: number;
  name: string;
  brand: string | null;
  dose: string;
  category: string;
  description: string | null;
  clinicalRationale: string | null;
  priceCents: number;
  isActive: boolean;
  gender: string;
  sortOrder: number;
  rules: ClinicianSupplementRule[];
}

interface ClinicianSupplementRule {
  id: number;
  supplementId: number;
  triggerType: string;
  labMarker: string | null;
  labMin: number | null;
  labMax: number | null;
  symptomKey: string | null;
  combinationLogic: string;
  priority: string;
  indicationText: string | null;
}

interface ClinicianLabPreference {
  id: number;
  markerKey: string;
  gender: string;
  displayName: string | null;
  unit: string | null;
  optimalMin: number | null;
  optimalMax: number | null;
  normalMin: number | null;
  normalMax: number | null;
  notes: string | null;
}

interface DiscountSettings {
  discountType: string;
  discountPercent: number;
  discountFlat: number;
}

interface DefaultsData {
  labMarkers: LabMarkerDefault[];
  symptomKeys: { key: string; label: string }[];
  supplementCategories: { value: string; label: string }[];
  labMarkerKeys: { key: string; label: string; unit: string }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: 'both', label: 'All Patients' },
  { value: 'male', label: 'Male Only' },
  { value: 'female', label: 'Female Only' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const TRIGGER_OPTIONS = [
  { value: 'lab', label: 'Lab Value' },
  { value: 'symptom', label: 'Symptom' },
  { value: 'both', label: 'Lab + Symptom' },
];

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function genderBadge(gender: string) {
  if (gender === 'male') return <Badge variant="outline" className="text-xs">Male</Badge>;
  if (gender === 'female') return <Badge variant="outline" className="text-xs">Female</Badge>;
  return null;
}

function priorityColor(priority: string) {
  if (priority === 'high') return 'text-red-600 bg-red-50 border-red-200';
  if (priority === 'medium') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-slate-500 bg-slate-50 border-slate-200';
}

// ── Supplement Form Dialog ────────────────────────────────────────────────────

function SupplementFormDialog({
  open,
  onClose,
  initial,
  categories,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ClinicianSupplement>;
  categories: { value: string; label: string }[];
  onSave: (data: Partial<ClinicianSupplement>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<{
    name: string;
    brand: string;
    dose: string;
    category: string;
    description: string;
    clinicalRationale: string;
    priceCents: string;
    gender: string;
  }>({
    name: initial?.name || '',
    brand: initial?.brand || '',
    dose: initial?.dose || '',
    category: initial?.category || 'general',
    description: initial?.description || '',
    clinicalRationale: initial?.clinicalRationale || '',
    priceCents: initial?.priceCents ? (initial.priceCents / 100).toFixed(2) : '0.00',
    gender: initial?.gender || 'both',
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!form.name || !form.dose) {
      toast({ title: "Name and dose required to generate description", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/preferences/supplements/generate-description", {
        name: form.name,
        brand: form.brand,
        dose: form.dose,
        category: form.category,
        clinicalRationale: form.clinicalRationale,
      });
      const data = await res.json();
      if (data.description) setForm(f => ({ ...f, description: data.description }));
    } catch {
      toast({ title: "Failed to generate description", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.dose.trim()) {
      toast({ title: "Name and dose are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const priceCents = Math.round(parseFloat(form.priceCents || '0') * 100) || 0;
      await onSave({
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        dose: form.dose.trim(),
        category: form.category,
        description: form.description.trim() || null,
        clinicalRationale: form.clinicalRationale.trim() || null,
        priceCents,
        gender: form.gender,
      } as any);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            {initial?.id ? "Edit Supplement" : "Add Custom Supplement"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Product Name *</label>
              <Input
                placeholder="e.g. Vitamin D3 5000 IU"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                data-testid="input-supplement-name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Brand / Manufacturer</label>
              <Input
                placeholder="e.g. Metagenics"
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                data-testid="input-supplement-brand"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Dose / Directions *</label>
              <Input
                placeholder="e.g. 2 capsules daily"
                value={form.dose}
                onChange={e => setForm(f => ({ ...f, dose: e.target.value }))}
                data-testid="input-supplement-dose"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger data-testid="select-supplement-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Applies To</label>
              <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                <SelectTrigger data-testid="select-supplement-gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Price (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.priceCents}
                  onChange={e => setForm(f => ({ ...f, priceCents: e.target.value }))}
                  className="pl-7"
                  data-testid="input-supplement-price"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Clinical Rationale (provider notes)</label>
            <Textarea
              placeholder="Internal notes about why this supplement is recommended..."
              value={form.clinicalRationale}
              onChange={e => setForm(f => ({ ...f, clinicalRationale: e.target.value }))}
              className="text-sm min-h-[80px]"
              data-testid="input-supplement-rationale"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Patient-Facing Description</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="h-7 text-xs gap-1"
                data-testid="button-generate-description"
              >
                <Sparkles className="w-3 h-3" />
                {generating ? "Generating…" : "AI Generate"}
              </Button>
            </div>
            <Textarea
              placeholder="Plain-language explanation shown to patients about this supplement..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="text-sm min-h-[80px]"
              data-testid="input-supplement-description"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-supplement">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving…" : "Save Supplement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rule Form Dialog ──────────────────────────────────────────────────────────

function RuleFormDialog({
  open,
  onClose,
  supplementId,
  initial,
  defaults,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  supplementId: number;
  initial?: Partial<ClinicianSupplementRule>;
  defaults: DefaultsData;
  onSave: (rule: Partial<ClinicianSupplementRule>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    triggerType: initial?.triggerType || 'lab',
    labMarker: initial?.labMarker || '',
    labMin: initial?.labMin !== null && initial?.labMin !== undefined ? String(initial.labMin) : '',
    labMax: initial?.labMax !== null && initial?.labMax !== undefined ? String(initial.labMax) : '',
    symptomKey: initial?.symptomKey || '',
    combinationLogic: initial?.combinationLogic || 'OR',
    priority: initial?.priority || 'medium',
    indicationText: initial?.indicationText || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if ((form.triggerType === 'lab' || form.triggerType === 'both') && !form.labMarker) {
      toast({ title: "Please select a lab marker", variant: "destructive" });
      return;
    }
    if ((form.triggerType === 'symptom' || form.triggerType === 'both') && !form.symptomKey) {
      toast({ title: "Please select a symptom", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        triggerType: form.triggerType,
        labMarker: form.labMarker || null,
        labMin: form.labMin !== '' ? parseFloat(form.labMin) : null,
        labMax: form.labMax !== '' ? parseFloat(form.labMax) : null,
        symptomKey: form.symptomKey || null,
        combinationLogic: form.combinationLogic,
        priority: form.priority,
        indicationText: form.indicationText.trim() || null,
      } as any);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const selectedMarkerInfo = defaults.labMarkerKeys.find(m => m.key === form.labMarker);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            {initial?.id ? "Edit Trigger Rule" : "Add Trigger Rule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Trigger Type</label>
            <Select value={form.triggerType} onValueChange={v => setForm(f => ({ ...f, triggerType: v }))}>
              <SelectTrigger data-testid="select-trigger-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(form.triggerType === 'lab' || form.triggerType === 'both') && (
            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lab Condition</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Lab Marker</label>
                <Select value={form.labMarker} onValueChange={v => setForm(f => ({ ...f, labMarker: v, labMin: '', labMax: '' }))}>
                  <SelectTrigger data-testid="select-lab-marker">
                    <SelectValue placeholder="Select marker…" />
                  </SelectTrigger>
                  <SelectContent>
                    {defaults.labMarkerKeys.map(m => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label} <span className="text-muted-foreground ml-1">({m.unit})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Min {selectedMarkerInfo ? `(${selectedMarkerInfo.unit})` : ''}
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="No lower bound"
                    value={form.labMin}
                    onChange={e => setForm(f => ({ ...f, labMin: e.target.value }))}
                    data-testid="input-lab-min"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Max {selectedMarkerInfo ? `(${selectedMarkerInfo.unit})` : ''}
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="No upper bound"
                    value={form.labMax}
                    onChange={e => setForm(f => ({ ...f, labMax: e.target.value }))}
                    data-testid="input-lab-max"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Recommend this supplement when the marker falls in the specified range. Leave a bound empty for no limit.
              </p>
            </div>
          )}

          {form.triggerType === 'both' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Combine Lab + Symptom with</label>
              <Select value={form.combinationLogic} onValueChange={v => setForm(f => ({ ...f, combinationLogic: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OR">OR — recommend if either condition is met</SelectItem>
                  <SelectItem value="AND">AND — recommend only if both conditions are met</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {(form.triggerType === 'symptom' || form.triggerType === 'both') && (
            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Symptom Condition</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Symptom</label>
                <Select value={form.symptomKey} onValueChange={v => setForm(f => ({ ...f, symptomKey: v }))}>
                  <SelectTrigger data-testid="select-symptom-key">
                    <SelectValue placeholder="Select symptom…" />
                  </SelectTrigger>
                  <SelectContent>
                    {defaults.symptomKeys.map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Indication Text (shown in results)</label>
            <Input
              placeholder="e.g. Vitamin D deficiency — optimal range 60-100"
              value={form.indicationText}
              onChange={e => setForm(f => ({ ...f, indicationText: e.target.value }))}
              data-testid="input-indication-text"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-rule">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving…" : "Save Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Supplement Row (with rules) ───────────────────────────────────────────────

function SupplementRow({
  supplement,
  defaults,
  onEdit,
  onDelete,
  onRuleAdd,
  onRuleEdit,
  onRuleDelete,
}: {
  supplement: ClinicianSupplement;
  defaults: DefaultsData;
  onEdit: (s: ClinicianSupplement) => void;
  onDelete: (id: number) => void;
  onRuleAdd: (s: ClinicianSupplement) => void;
  onRuleEdit: (s: ClinicianSupplement, r: ClinicianSupplementRule) => void;
  onRuleDelete: (ruleId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catLabel = defaults.supplementCategories.find(c => c.value === supplement.category)?.label || supplement.category;

  const ruleDescription = (r: ClinicianSupplementRule) => {
    const parts: string[] = [];
    if ((r.triggerType === 'lab' || r.triggerType === 'both') && r.labMarker) {
      const markerInfo = defaults.labMarkerKeys.find(m => m.key === r.labMarker);
      const markerLabel = markerInfo?.label || r.labMarker;
      const unit = markerInfo?.unit || '';
      if (r.labMin !== null && r.labMax !== null) parts.push(`${markerLabel} ${r.labMin}–${r.labMax} ${unit}`);
      else if (r.labMin !== null) parts.push(`${markerLabel} ≥${r.labMin} ${unit}`);
      else if (r.labMax !== null) parts.push(`${markerLabel} ≤${r.labMax} ${unit}`);
      else parts.push(`${markerLabel} any value`);
    }
    if (r.triggerType === 'both') parts.push(r.combinationLogic);
    if ((r.triggerType === 'symptom' || r.triggerType === 'both') && r.symptomKey) {
      const symLabel = defaults.symptomKeys.find(s => s.key === r.symptomKey)?.label || r.symptomKey;
      parts.push(symLabel);
    }
    return parts.join(' ') || '(no condition)';
  };

  return (
    <div
      className="rounded-md border bg-card"
      data-testid={`row-supplement-${supplement.id}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
          data-testid={`button-expand-supplement-${supplement.id}`}
        >
          {expanded
            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          }
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground truncate">
              {supplement.name}
              {supplement.brand && <span className="text-muted-foreground font-normal"> · {supplement.brand}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{supplement.dose} · {catLabel}</p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {genderBadge(supplement.gender)}
          {supplement.priceCents > 0 && (
            <span className="text-xs text-muted-foreground font-mono">{formatPrice(supplement.priceCents)}</span>
          )}
          {supplement.rules.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {supplement.rules.length} rule{supplement.rules.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {!supplement.isActive && (
            <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(supplement)}
            data-testid={`button-edit-supplement-${supplement.id}`}
          >
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(supplement.id)}
            data-testid={`button-delete-supplement-${supplement.id}`}
          >
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
          {supplement.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Patient Description</p>
              <p className="text-sm text-foreground">{supplement.description}</p>
            </div>
          )}
          {supplement.clinicalRationale && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Clinical Rationale</p>
              <p className="text-sm text-muted-foreground">{supplement.clinicalRationale}</p>
            </div>
          )}

          {/* Rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trigger Rules</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onRuleAdd(supplement)}
                data-testid={`button-add-rule-${supplement.id}`}
              >
                <Plus className="w-3 h-3" /> Add Rule
              </Button>
            </div>
            {supplement.rules.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No trigger rules — this supplement will always appear in recommendations.
              </p>
            ) : (
              <div className="space-y-1.5">
                {supplement.rules.map(rule => (
                  <div
                    key={rule.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                      priorityColor(rule.priority)
                    )}
                    data-testid={`row-rule-${rule.id}`}
                  >
                    <FlaskConical className="w-3 h-3 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{rule.priority.toUpperCase()}</span>
                      {' · '}
                      {ruleDescription(rule)}
                      {rule.indicationText && (
                        <div className="text-xs mt-0.5 opacity-75">{rule.indicationText}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRuleEdit(supplement, rule)}
                        className="p-1 rounded hover-elevate"
                        data-testid={`button-edit-rule-${rule.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRuleDelete(rule.id)}
                        className="p-1 rounded hover-elevate"
                        data-testid={`button-delete-rule-${rule.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lab Range Preferences Table ───────────────────────────────────────────────

function LabRangePreferences({
  preferences,
  defaults,
}: {
  preferences: ClinicianLabPreference[];
  defaults: LabMarkerDefault[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female' | 'both'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, Partial<ClinicianLabPreference>>>({});

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", "/api/preferences/lab-ranges", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/lab-ranges"] });
      toast({ title: "Lab range saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/preferences/lab-ranges/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/lab-ranges"] });
      toast({ title: "Override removed — using system defaults" });
    },
    onError: () => {
      toast({ title: "Failed to remove", variant: "destructive" });
    },
  });

  const rowKey = (key: string, gender: string) => `${key}::${gender}`;

  const filteredDefaults = defaults.filter(d => {
    if (filterGender !== 'all' && d.gender !== filterGender && d.gender !== 'both' && filterGender !== d.gender) return false;
    if (search && !d.displayName.toLowerCase().includes(search.toLowerCase()) && !d.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getPreference = (key: string, gender: string) =>
    preferences.find(p => p.markerKey === key && p.gender === gender);

  const startEdit = (key: string, gender: string) => {
    const pref = getPreference(key, gender);
    const def = defaults.find(d => d.key === key && d.gender === gender);
    const rk = rowKey(key, gender);
    setEditing(e => ({ ...e, [rk]: true }));
    setEdits(e => ({
      ...e,
      [rk]: {
        optimalMin: pref?.optimalMin ?? def?.optimalMin ?? undefined,
        optimalMax: pref?.optimalMax ?? def?.optimalMax ?? undefined,
        normalMin: pref?.normalMin ?? def?.normalMin ?? undefined,
        normalMax: pref?.normalMax ?? def?.normalMax ?? undefined,
        notes: pref?.notes ?? def?.notes ?? '',
      }
    }));
  };

  const cancelEdit = (key: string, gender: string) => {
    const rk = rowKey(key, gender);
    setEditing(e => { const next = { ...e }; delete next[rk]; return next; });
    setEdits(e => { const next = { ...e }; delete next[rk]; return next; });
  };

  const saveEdit = async (def: LabMarkerDefault) => {
    const rk = rowKey(def.key, def.gender);
    const vals = edits[rk] || {};
    await saveMutation.mutateAsync({
      markerKey: def.key,
      gender: def.gender,
      displayName: def.displayName,
      unit: def.unit,
      optimalMin: vals.optimalMin !== undefined ? Number(vals.optimalMin) : null,
      optimalMax: vals.optimalMax !== undefined ? Number(vals.optimalMax) : null,
      normalMin: vals.normalMin !== undefined ? Number(vals.normalMin) : null,
      normalMax: vals.normalMax !== undefined ? Number(vals.normalMax) : null,
      notes: vals.notes || null,
    });
    cancelEdit(def.key, def.gender);
  };

  const setEditField = (key: string, gender: string, field: string, value: any) => {
    const rk = rowKey(key, gender);
    setEdits(e => ({ ...e, [rk]: { ...(e[rk] || {}), [field]: value } }));
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search markers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
            data-testid="input-lab-search"
          />
        </div>
        <Select value={filterGender} onValueChange={v => setFilterGender(v as any)}>
          <SelectTrigger className="w-36 h-9" data-testid="select-lab-gender-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="both">Gender-Neutral</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Overrides replace the system defaults shown here. Leave fields unchanged to use system defaults. Clinician overrides affect interpretation display and AI recommendations.
      </p>

      <div className="space-y-1">
        {filteredDefaults.map(def => {
          const rk = rowKey(def.key, def.gender);
          const pref = getPreference(def.key, def.gender);
          const isEditing = editing[rk];
          const vals = edits[rk] || {};
          const hasOverride = !!pref;

          return (
            <div
              key={rk}
              className={cn(
                "rounded-md border px-4 py-3",
                hasOverride ? "bg-primary/5 border-primary/30" : "bg-card"
              )}
              data-testid={`row-lab-${def.key}-${def.gender}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{def.displayName}</span>
                    <span className="text-xs text-muted-foreground">{def.unit}</span>
                    {def.gender !== 'both' && (
                      <Badge variant="outline" className="text-xs capitalize">{def.gender}</Badge>
                    )}
                    {hasOverride && (
                      <Badge className="text-xs bg-primary/10 text-primary border-primary/30">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Customized
                      </Badge>
                    )}
                  </div>

                  {/* System defaults (always shown as reference) */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
                    {(def.optimalMin !== undefined || def.optimalMax !== undefined) && (
                      <span>
                        System optimal: {def.optimalMin ?? '—'} – {def.optimalMax ?? '—'} {def.unit}
                      </span>
                    )}
                    {(def.normalMin !== undefined || def.normalMax !== undefined) && (
                      <span>
                        Reference: {def.normalMin ?? '—'} – {def.normalMax ?? '—'} {def.unit}
                      </span>
                    )}
                  </div>

                  {/* Override values (if set, show current; if editing, show inputs) */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="space-y-0.5">
                          <label className="text-xs text-muted-foreground">Opt. Min</label>
                          <Input
                            type="number"
                            step="any"
                            value={vals.optimalMin ?? ''}
                            onChange={e => setEditField(def.key, def.gender, 'optimalMin', e.target.value)}
                            className="h-8 text-xs"
                            data-testid={`input-opt-min-${def.key}`}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-xs text-muted-foreground">Opt. Max</label>
                          <Input
                            type="number"
                            step="any"
                            value={vals.optimalMax ?? ''}
                            onChange={e => setEditField(def.key, def.gender, 'optimalMax', e.target.value)}
                            className="h-8 text-xs"
                            data-testid={`input-opt-max-${def.key}`}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-xs text-muted-foreground">Ref. Min</label>
                          <Input
                            type="number"
                            step="any"
                            value={vals.normalMin ?? ''}
                            onChange={e => setEditField(def.key, def.gender, 'normalMin', e.target.value)}
                            className="h-8 text-xs"
                            data-testid={`input-ref-min-${def.key}`}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-xs text-muted-foreground">Ref. Max</label>
                          <Input
                            type="number"
                            step="any"
                            value={vals.normalMax ?? ''}
                            onChange={e => setEditField(def.key, def.gender, 'normalMax', e.target.value)}
                            className="h-8 text-xs"
                            data-testid={`input-ref-max-${def.key}`}
                          />
                        </div>
                      </div>
                      <Input
                        placeholder="Notes (optional)"
                        value={vals.notes ?? ''}
                        onChange={e => setEditField(def.key, def.gender, 'notes', e.target.value)}
                        className="h-8 text-xs"
                        data-testid={`input-notes-${def.key}`}
                      />
                    </div>
                  ) : hasOverride ? (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {(pref.optimalMin !== null || pref.optimalMax !== null) && (
                        <span className="text-primary font-medium">
                          Your optimal: {pref.optimalMin ?? '—'} – {pref.optimalMax ?? '—'} {def.unit}
                        </span>
                      )}
                      {(pref.normalMin !== null || pref.normalMax !== null) && (
                        <span className="text-primary/70">
                          Your reference: {pref.normalMin ?? '—'} – {pref.normalMax ?? '—'} {def.unit}
                        </span>
                      )}
                      {pref.notes && <span className="text-muted-foreground italic">{pref.notes}</span>}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => saveEdit(def)}
                        disabled={saveMutation.isPending}
                        data-testid={`button-save-lab-${def.key}`}
                      >
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => cancelEdit(def.key, def.gender)}
                        data-testid={`button-cancel-lab-${def.key}`}
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(def.key, def.gender)}
                        data-testid={`button-edit-lab-${def.key}`}
                      >
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      {hasOverride && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Remove your override and revert to system defaults?')) {
                              deleteMutation.mutate(pref!.id);
                            }
                          }}
                          data-testid={`button-reset-lab-${def.key}`}
                        >
                          <RotateCcw className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredDefaults.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No markers match your filter</p>
        )}
      </div>
    </div>
  );
}

// ── Main PreferencesPanel ─────────────────────────────────────────────────────

export function PreferencesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<'discount' | 'supplements' | 'labranges'>('supplements');

  // Supplement dialog state
  const [supplementDialog, setSupplementDialog] = useState<{
    open: boolean;
    supplement?: ClinicianSupplement;
  }>({ open: false });
  const [ruleDialog, setRuleDialog] = useState<{
    open: boolean;
    supplement?: ClinicianSupplement;
    rule?: ClinicianSupplementRule;
  }>({ open: false });

  // Discount state
  const [discountType, setDiscountType] = useState('percent');
  const [discountPercent, setDiscountPercent] = useState('20');
  const [discountSaved, setDiscountSaved] = useState(false);

  // Data fetching
  const { data: defaults } = useQuery<DefaultsData>({ queryKey: ["/api/preferences/defaults"] });
  const { data: supplements = [], isLoading: supplementsLoading } = useQuery<ClinicianSupplement[]>({ queryKey: ["/api/preferences/supplements"] });
  const { data: labRangeData } = useQuery<{ preferences: ClinicianLabPreference[]; defaults: LabMarkerDefault[] }>({ queryKey: ["/api/preferences/lab-ranges"] });
  const { data: discountData } = useQuery<{ discountType: string; discountPercent: number; discountFlat: number }>({
    queryKey: ["/api/preferences/discount"],
    onSuccess: (d: any) => {
      setDiscountType(d.discountType || 'percent');
      setDiscountPercent(String(d.discountPercent ?? 20));
    },
  } as any);

  // Supplement mutations
  const createSupplementMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/preferences/supplements", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/supplements"] });
      toast({ title: "Supplement added to your library" });
    },
    onError: () => toast({ title: "Failed to add supplement", variant: "destructive" }),
  });

  const updateSupplementMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/preferences/supplements/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/supplements"] });
      toast({ title: "Supplement updated" });
    },
    onError: () => toast({ title: "Failed to update supplement", variant: "destructive" }),
  });

  const deleteSupplementMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/preferences/supplements/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/supplements"] });
      toast({ title: "Supplement removed" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  // Rule mutations
  const createRuleMutation = useMutation({
    mutationFn: async ({ supplementId, data }: { supplementId: number; data: any }) => {
      const res = await apiRequest("POST", `/api/preferences/supplements/${supplementId}/rules`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/supplements"] });
      toast({ title: "Trigger rule added" });
    },
    onError: () => toast({ title: "Failed to add rule", variant: "destructive" }),
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/preferences/supplements/rules/${ruleId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/supplements"] });
      toast({ title: "Rule updated" });
    },
    onError: () => toast({ title: "Failed to update rule", variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      const res = await apiRequest("DELETE", `/api/preferences/supplements/rules/${ruleId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/supplements"] });
      toast({ title: "Rule removed" });
    },
    onError: () => toast({ title: "Failed to remove rule", variant: "destructive" }),
  });

  // Discount save mutation
  const saveDiscountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/preferences/discount", {
        discountType,
        discountPercent: parseInt(discountPercent) || 0,
        discountFlat: 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/discount"] });
      setDiscountSaved(true);
      toast({ title: "Discount settings saved" });
      setTimeout(() => setDiscountSaved(false), 3000);
    },
    onError: () => toast({ title: "Failed to save discount", variant: "destructive" }),
  });

  // Handlers
  const handleSaveSupplement = useCallback(async (data: Partial<ClinicianSupplement>) => {
    if (supplementDialog.supplement?.id) {
      await updateSupplementMutation.mutateAsync({ id: supplementDialog.supplement.id, data });
    } else {
      await createSupplementMutation.mutateAsync(data);
    }
  }, [supplementDialog.supplement]);

  const handleSaveRule = useCallback(async (ruleData: Partial<ClinicianSupplementRule>) => {
    if (ruleDialog.rule?.id) {
      await updateRuleMutation.mutateAsync({ ruleId: ruleDialog.rule.id, data: ruleData });
    } else if (ruleDialog.supplement) {
      await createRuleMutation.mutateAsync({ supplementId: ruleDialog.supplement.id, data: ruleData });
    }
  }, [ruleDialog]);

  const navItems: { key: typeof activeSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'supplements', label: 'Supplement Library', icon: Package },
    { key: 'labranges', label: 'Lab Ranges', icon: FlaskConical },
    { key: 'discount', label: 'Pricing & Discount', icon: Tag },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Clinical Preferences
          </CardTitle>
          <CardDescription>
            Customize your supplement library, lab range targets, and patient pricing. All settings fall back to system defaults if not overridden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Section nav */}
          <div className="flex gap-1 rounded-lg border p-1 bg-muted/30 flex-wrap">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  activeSection === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`button-prefs-section-${key}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Supplement Library section ────────────────────────────────── */}
          {activeSection === 'supplements' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Your Custom Supplements</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    These supplements are appended to the AI recommendations when their trigger rules match the patient's labs or reported symptoms.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setSupplementDialog({ open: true })}
                  data-testid="button-add-supplement"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Supplement
                </Button>
              </div>

              {supplementsLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
              ) : supplements.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center space-y-2">
                  <Package className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    No custom supplements yet. Add supplements you commonly recommend and configure when they should appear in results.
                  </p>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setSupplementDialog({ open: true })}
                    data-testid="button-add-supplement-empty"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Supplement
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {supplements.map(s => (
                    <SupplementRow
                      key={s.id}
                      supplement={s}
                      defaults={defaults || { labMarkers: [], symptomKeys: [], supplementCategories: [], labMarkerKeys: [] }}
                      onEdit={(sup) => setSupplementDialog({ open: true, supplement: sup })}
                      onDelete={(id) => {
                        if (confirm('Remove this supplement from your library?')) {
                          deleteSupplementMutation.mutate(id);
                        }
                      }}
                      onRuleAdd={(sup) => setRuleDialog({ open: true, supplement: sup })}
                      onRuleEdit={(sup, rule) => setRuleDialog({ open: true, supplement: sup, rule })}
                      onRuleDelete={(ruleId) => {
                        if (confirm('Remove this trigger rule?')) {
                          deleteRuleMutation.mutate(ruleId);
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="rounded-md bg-muted/40 border p-3 flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Supplements without any trigger rules will always appear. Supplements with rules are only shown when at least one rule condition is met for that patient's labs or reported symptoms.
                </p>
              </div>
            </div>
          )}

          {/* ── Lab Ranges section ────────────────────────────────────────── */}
          {activeSection === 'labranges' && (
            <LabRangePreferences
              preferences={labRangeData?.preferences || []}
              defaults={labRangeData?.defaults || defaults?.labMarkers || []}
            />
          )}

          {/* ── Discount section ──────────────────────────────────────────── */}
          {activeSection === 'discount' && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-foreground">Supplement Patient Pricing</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set a default discount applied to all supplements ordered through the patient portal. Patients see the discounted price.
                </p>
              </div>

              <div className="rounded-md border p-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Discount Type</label>
                  <Select value={discountType} onValueChange={setDiscountType}>
                    <SelectTrigger className="w-56" data-testid="select-discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No discount</SelectItem>
                      <SelectItem value="percent">Percentage off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {discountType === 'percent' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Discount Percent</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={discountPercent}
                        onChange={e => setDiscountPercent(e.target.value)}
                        className="w-28"
                        data-testid="input-discount-percent"
                      />
                      <span className="text-sm text-muted-foreground">% off retail price</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Example: If a supplement costs $45.00, the patient pays ${((45 * (100 - parseInt(discountPercent || '0'))) / 100).toFixed(2)}.
                    </p>
                  </div>
                )}

                {discountType === 'none' && (
                  <p className="text-sm text-muted-foreground">
                    Patients will be shown the full retail price for all supplements.
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  {discountSaved && (
                    <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                      <CheckCircle className="w-4 h-4" />Saved
                    </span>
                  )}
                  <Button
                    onClick={() => saveDiscountMutation.mutate()}
                    disabled={saveDiscountMutation.isPending}
                    data-testid="button-save-discount"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveDiscountMutation.isPending ? "Saving…" : "Save Pricing Settings"}
                  </Button>
                </div>
              </div>

              <div className="rounded-md bg-muted/40 border p-3 flex gap-2 items-start">
                <DollarSign className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The discount applies to the price you set on each supplement in your library. If no price is set on a supplement, it will not show a price to the patient. Future billing integration will allow you to process orders directly.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supplement Form Dialog */}
      {defaults && supplementDialog.open && (
        <SupplementFormDialog
          open={supplementDialog.open}
          onClose={() => setSupplementDialog({ open: false })}
          initial={supplementDialog.supplement}
          categories={defaults.supplementCategories}
          onSave={handleSaveSupplement}
        />
      )}

      {/* Rule Form Dialog */}
      {defaults && ruleDialog.open && ruleDialog.supplement && (
        <RuleFormDialog
          open={ruleDialog.open}
          onClose={() => setRuleDialog({ open: false })}
          supplementId={ruleDialog.supplement.id}
          initial={ruleDialog.rule}
          defaults={defaults}
          onSave={handleSaveRule}
        />
      )}
    </>
  );
}
