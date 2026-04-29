import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
import {
  Activity,
  Heart,
  Weight,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Home,
  Building2,
  AlertTriangle,
  Settings2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PatientVital } from "@shared/schema";
import { ConfigureVitalsMonitoringDialog } from "./configure-vitals-monitoring-dialog";

interface VitalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  patientName: string;
  /**
   * Optional callback that, when provided, renders a "View Trends" button in
   * the dialog footer. The parent is responsible for closing this dialog and
   * opening the Vital Trends dialog.
   */
  onShowTrends?: () => void;
}

// ── Source styling ─────────────────────────────────────────────────────────
// Clinic vs patient-logged are color-coded throughout this dialog.
const SRC = {
  clinic: { label: "In-clinic", color: "#2e3a20", bg: "#f0f5ea", border: "#d4d9c5", Icon: Building2 },
  patient_logged: { label: "Patient-reported", color: "#8b5a10", bg: "#fdf6e8", border: "#f0d8a4", Icon: Home },
} as const;

function srcOf(v: { source?: string | null }): "clinic" | "patient_logged" {
  return v.source === "patient_logged" ? "patient_logged" : "clinic";
}

function SourceBadge({ source, size = "sm" }: { source: "clinic" | "patient_logged"; size?: "sm" | "xs" }) {
  const s = SRC[source];
  const Icon = s.Icon;
  const px = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${px}`}
      style={{ backgroundColor: s.bg, color: s.color, borderColor: s.border }}
      data-testid={`source-badge-${source}`}
    >
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

// ── Clinical category helpers ──────────────────────────────────────────────
function bpCategory(sys?: number | null, dia?: number | null): { label: string; color: string } | null {
  if (!sys || !dia) return null;
  if (sys >= 180 || dia >= 120) return { label: "Hypertensive Crisis", color: "#b91c1c" };
  if (sys >= 140 || dia >= 90) return { label: "Stage 2", color: "#dc2626" };
  if (sys >= 130 || dia >= 80) return { label: "Stage 1", color: "#ea580c" };
  if (sys >= 120) return { label: "Elevated", color: "#ca8a04" };
  return { label: "Normal", color: "#16a34a" };
}

function bmiCategory(bmi?: number | null): { label: string; color: string } | null {
  if (!bmi) return null;
  if (bmi >= 40) return { label: "Class III Obesity", color: "#b91c1c" };
  if (bmi >= 35) return { label: "Class II Obesity", color: "#dc2626" };
  if (bmi >= 30) return { label: "Obese", color: "#ea580c" };
  if (bmi >= 25) return { label: "Overweight", color: "#ca8a04" };
  if (bmi >= 18.5) return { label: "Normal", color: "#16a34a" };
  return { label: "Underweight", color: "#0891b2" };
}

function trend(curr: number | null | undefined, prev: number | null | undefined) {
  if (curr == null || prev == null) return null;
  const diff = curr - prev;
  const pct = prev !== 0 ? (diff / prev) * 100 : 0;
  if (Math.abs(pct) < 1) return { icon: Minus, label: "—", color: "#64748b" };
  if (diff > 0) return { icon: TrendingUp, label: `+${diff.toFixed(1)}`, color: "#dc2626" };
  return { icon: TrendingDown, label: diff.toFixed(1), color: "#16a34a" };
}

// ── Flowsheet types + builder ──────────────────────────────────────────────
// EMR-style flowsheet: rows = vital metrics, columns = visits (oldest→newest).
// Each cell knows its source so styling can stay declarative.

type FlowMetricKey = "bp" | "hr" | "wt" | "ht" | "bmi";
type AbnormalLevel = "none" | "mild" | "severe";
type FlowCell = {
  display: string; // pre-formatted string ("132/86", "127.8", "—")
  numeric: number | null; // primary value used by sparkline + drilldown
  src: "clinic" | "patient_logged" | null; // null when no reading on that visit
  abnormal: AbnormalLevel;
  vitalId: number | null; // for testid + drilldown lookups
};
type FlowRow = {
  key: FlowMetricKey;
  label: string;
  unit: string;
  cells: FlowCell[]; // aligned 1:1 with sortedVitals
  // Series for sparkline + drilldown (skips empty cells)
  series: Array<{ x: number; y: number; src: "clinic" | "patient_logged"; date: string }>;
  color: string; // line color for charts
};

// Per-metric abnormal classifiers — kept loose so a real "—" stays "none".
function classifyBp(sys: number | null, dia: number | null): AbnormalLevel {
  if (sys == null || dia == null) return "none";
  if (sys >= 180 || dia >= 120) return "severe"; // crisis / stage 2 high
  if (sys >= 140 || dia >= 90) return "severe"; // stage 2
  if (sys >= 130 || dia >= 80) return "mild"; // stage 1
  return "none";
}
function classifyHr(hr: number | null): AbnormalLevel {
  if (hr == null) return "none";
  if (hr >= 120 || hr <= 40) return "severe";
  if (hr >= 100 || hr < 50) return "mild";
  return "none";
}
function classifyBmi(bmi: number | null): AbnormalLevel {
  if (bmi == null) return "none";
  if (bmi >= 35 || bmi < 16) return "severe";
  if (bmi >= 30 || bmi < 18.5) return "mild";
  return "none";
}

function buildFlowsheet(vitals: PatientVital[]): FlowRow[] {
  const metrics: Array<Omit<FlowRow, "cells" | "series"> & {
    extract: (v: PatientVital) => { display: string; numeric: number | null; abnormal: AbnormalLevel } | null;
  }> = [
    {
      key: "bp",
      label: "BP",
      unit: "mmHg",
      color: "#dc2626",
      extract: (v) => {
        if (v.systolicBp == null && v.diastolicBp == null) return null;
        return {
          display: `${v.systolicBp ?? "—"}/${v.diastolicBp ?? "—"}`,
          numeric: v.systolicBp ?? null,
          abnormal: classifyBp(v.systolicBp, v.diastolicBp),
        };
      },
    },
    {
      key: "hr",
      label: "HR",
      unit: "bpm",
      color: "#7c3aed",
      extract: (v) => {
        if (v.heartRate == null) return null;
        return { display: String(v.heartRate), numeric: v.heartRate, abnormal: classifyHr(v.heartRate) };
      },
    },
    {
      key: "wt",
      label: "WT",
      unit: "lbs",
      color: "#16a34a",
      extract: (v) => {
        if (v.weightLbs == null) return null;
        const n = Number(v.weightLbs);
        return { display: n.toFixed(1), numeric: n, abnormal: "none" };
      },
    },
    {
      key: "ht",
      label: "HT",
      unit: "in",
      color: "#0891b2",
      extract: (v) => {
        if (v.heightInches == null) return null;
        const n = Number(v.heightInches);
        return { display: n.toFixed(1), numeric: n, abnormal: "none" };
      },
    },
    {
      key: "bmi",
      label: "BMI",
      unit: "kg/m²",
      color: "#ea580c",
      extract: (v) => {
        if (v.bmi == null) return null;
        const n = Number(v.bmi);
        return { display: n.toFixed(2), numeric: n, abnormal: classifyBmi(n) };
      },
    },
  ];

  return metrics
    .map(({ extract, ...meta }) => {
      const cells: FlowCell[] = vitals.map((v) => {
        const r = extract(v);
        if (!r) return { display: "—", numeric: null, src: null, abnormal: "none", vitalId: v.id };
        return { ...r, src: srcOf(v), vitalId: v.id };
      });
      const series = cells
        .map((c, i) => ({ c, v: vitals[i] }))
        .filter(({ c }) => c.numeric != null)
        .map(({ c, v }) => ({
          x: new Date(v.recordedAt as any).getTime(),
          y: c.numeric as number,
          src: c.src as "clinic" | "patient_logged",
          date: new Date(v.recordedAt as any).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "2-digit",
            timeZone: "UTC",
          }),
        }));
      return { ...meta, cells, series };
    })
    // Hide rows with no readings in the visible window.
    .filter((row) => row.series.length > 0);
}

// ── Monitoring episode types (mirrors panel previously in patient-profiles) ──
type _Episode = {
  id: number;
  patientId: number;
  vitalTypes: string[];
  startDate: string;
  endDate: string;
  frequencyPerDay: number;
  instructions: string | null;
  status: "active" | "completed" | "ended_early";
  completedAt: string | null;
  endedEarlyReason: string | null;
  createdAt: string;
};
type _Log = {
  id: number;
  recordedAt: string;
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  weightLbs: number | null;
  symptoms?: string[] | null;
  timeOfDay?: string | null;
};
type _Alert = { id: number; episodeId: number; alertType: string; createdAt: string };
type _MonitoringResp = {
  episodes: _Episode[];
  logsPerEpisode: Record<string, _Log[]>;
  alertsPerEpisode: Record<string, _Alert[]>;
};

export function VitalsDialog({ open, onOpenChange, patientId, patientName, onShowTrends }: VitalsDialogProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [form, setForm] = useState({
    systolicBp: "",
    diastolicBp: "",
    heartRate: "",
    weightLbs: "",
    heightInches: "",
    notes: "",
  });

  // All vitals (clinic + patient-logged) come from one endpoint.
  const { data: vitals = [], isLoading } = useQuery<PatientVital[]>({
    queryKey: ["/api/patients", patientId, "vitals"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/vitals`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
  });

  // Active monitoring episode info (separate endpoint — episodes are config, not readings).
  const { data: monitoring } = useQuery<_MonitoringResp>({
    queryKey: ["/api/patients", patientId, "vitals-monitoring"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/vitals-monitoring`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const payload: any = { source: "clinic" };
      if (form.systolicBp) payload.systolicBp = parseInt(form.systolicBp);
      if (form.diastolicBp) payload.diastolicBp = parseInt(form.diastolicBp);
      if (form.heartRate) payload.heartRate = parseInt(form.heartRate);
      if (form.weightLbs) payload.weightLbs = parseFloat(form.weightLbs);
      if (form.heightInches) payload.heightInches = parseFloat(form.heightInches);
      if (form.notes) payload.notes = form.notes;
      const res = await apiRequest("POST", `/api/patients/${patientId}/vitals`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals"] });
      setShowForm(false);
      setForm({ systolicBp: "", diastolicBp: "", heartRate: "", weightLbs: "", heightInches: "", notes: "" });
      toast({ title: "Vitals recorded" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/vitals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals"] });
      toast({ title: "Entry removed" });
    },
  });

  const endEpisodeMut = useMutation({
    mutationFn: (episodeId: number) =>
      apiRequest("PATCH", `/api/vitals-monitoring/${episodeId}/end`, { reason: "Ended by clinician" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals-monitoring"] });
      toast({ title: "Monitoring episode ended" });
    },
    onError: () => toast({ title: "Failed to end episode", variant: "destructive" }),
  });

  // Defensive: TanStack Query default `= []` should always give us an array,
  // but legacy/error responses occasionally return non-array shapes. Normalize
  // here so every downstream `.find` / `.filter` is safe.
  const safeVitals: PatientVital[] = Array.isArray(vitals) ? vitals : [];

  // Pre-fill height from most recent entry that has it
  const lastHeight = safeVitals.find((v) => v.heightInches)?.heightInches;
  const handleOpenForm = () => {
    setForm((f) => ({ ...f, heightInches: f.heightInches || (lastHeight ? String(lastHeight) : "") }));
    setShowForm(true);
  };

  const latest = safeVitals[0];
  const previous = safeVitals[1];
  const latestSrc = latest ? srcOf(latest) : "clinic";

  const activeEpisodes = monitoring?.episodes.filter((e) => e.status === "active") ?? [];
  const alertsPerEpisode = monitoring?.alertsPerEpisode ?? {};
  const totalAlerts = Object.values(alertsPerEpisode).reduce((sum, list) => sum + list.length, 0);

  const clinicCount = safeVitals.filter((v) => srcOf(v) === "clinic").length;
  const patientCount = safeVitals.filter((v) => srcOf(v) === "patient_logged").length;

  // ── Flowsheet state + derived data ───────────────────────────────────────
  // Time window in months; 0 = "all data".
  const [windowMonths, setWindowMonths] = useState<6 | 12 | 0>(6);
  const [expandedRow, setExpandedRow] = useState<FlowMetricKey | null>(null);

  // Filter to the chosen window then sort chronologically (oldest → newest)
  // so each visit reads left-to-right like a paper flowsheet.
  const sortedVitals = useMemo(() => {
    const cutoff = windowMonths > 0 ? Date.now() - windowMonths * 30 * 86400000 : 0;
    const inWindow = windowMonths > 0
      ? safeVitals.filter((v) => new Date(v.recordedAt as any).getTime() >= cutoff)
      : safeVitals;
    return [...inWindow].sort(
      (a, b) => new Date(a.recordedAt as any).getTime() - new Date(b.recordedAt as any).getTime()
    );
  }, [safeVitals, windowMonths]);

  // Build the flowsheet: one row per metric that has at least one value in
  // the visible window. Each cell carries the formatted value plus styling
  // hints (source + abnormal severity) so rendering is dumb.
  const flowRows = useMemo(() => buildFlowsheet(sortedVitals), [sortedVitals]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Vital Signs — {patientName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {/* Active monitoring episode banner(s) */}
          {activeEpisodes.length > 0 && (
            <div className="space-y-2 mb-4">
              {activeEpisodes.map((ep) => {
                const logs = monitoring?.logsPerEpisode[String(ep.id)] ?? [];
                const alerts = alertsPerEpisode[String(ep.id)] ?? [];
                const start = new Date(ep.startDate);
                const end = new Date(ep.endDate);
                const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
                const daysElapsed = Math.max(0, Math.round((Date.now() - start.getTime()) / 86400000));
                const expected = Math.min(totalDays, daysElapsed + 1) * ep.frequencyPerDay;
                const pct = Math.min(100, Math.round((logs.length / Math.max(1, expected)) * 100));
                return (
                  <div
                    key={ep.id}
                    className="rounded-md border p-3"
                    style={{ borderColor: SRC.patient_logged.border, backgroundColor: SRC.patient_logged.bg }}
                    data-testid={`active-monitoring-${ep.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Home className="w-4 h-4" style={{ color: SRC.patient_logged.color }} />
                          <p className="text-sm font-semibold" style={{ color: SRC.patient_logged.color }}>
                            At-home monitoring active: {ep.vitalTypes.map((t) => t.replace(/_/g, " ")).join(" + ")}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {ep.frequencyPerDay}× daily
                          </Badge>
                          {alerts.length > 0 && (
                            <Badge className="text-white text-[10px]" style={{ backgroundColor: "#c0392b" }}>
                              <AlertTriangle className="w-3 h-3 mr-0.5" />
                              {alerts.length} alert{alerts.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] mt-1" style={{ color: "#5a6048" }}>
                          {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} →{" "}
                          {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {" · "}
                          {logs.length} of ~{expected} logged ({pct}%)
                        </p>
                        {ep.instructions && (
                          <p className="text-[11px] mt-1 italic" style={{ color: "#5a6048" }}>
                            "{ep.instructions}"
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("End this monitoring episode?")) endEpisodeMut.mutate(ep.id);
                        }}
                        disabled={endEpisodeMut.isPending}
                        data-testid={`button-end-episode-${ep.id}`}
                      >
                        End early
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Latest snapshot */}
          {latest && !showForm && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Latest reading
                </p>
                <SourceBadge source={latestSrc} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(latest.systolicBp || latest.diastolicBp) && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Heart className="w-3 h-3" /> Blood Pressure
                      </div>
                      <div className="text-2xl font-mono font-semibold mt-1" data-testid="latest-bp">
                        {latest.systolicBp ?? "—"}/{latest.diastolicBp ?? "—"}
                      </div>
                      {bpCategory(latest.systolicBp, latest.diastolicBp) && (
                        <Badge
                          className="mt-1 text-xs"
                          style={{
                            backgroundColor: bpCategory(latest.systolicBp, latest.diastolicBp)!.color,
                            color: "#fff",
                          }}
                        >
                          {bpCategory(latest.systolicBp, latest.diastolicBp)!.label}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )}
                {latest.heartRate && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Heart Rate
                      </div>
                      <div className="text-2xl font-mono font-semibold mt-1" data-testid="latest-hr">
                        {latest.heartRate} <span className="text-sm text-muted-foreground">bpm</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {latest.weightLbs && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Weight className="w-3 h-3" /> Weight
                      </div>
                      <div className="text-2xl font-mono font-semibold mt-1" data-testid="latest-weight">
                        {latest.weightLbs} <span className="text-sm text-muted-foreground">lbs</span>
                      </div>
                      {previous?.weightLbs && trend(latest.weightLbs, previous.weightLbs) && (
                        <div
                          className="text-xs flex items-center gap-1 mt-1"
                          style={{ color: trend(latest.weightLbs, previous.weightLbs)!.color }}
                        >
                          {(() => {
                            const T = trend(latest.weightLbs, previous.weightLbs)!;
                            const I = T.icon;
                            return (
                              <>
                                <I className="w-3 h-3" /> {T.label} lbs
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
                {latest.bmi && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground">BMI</div>
                      <div className="text-2xl font-mono font-semibold mt-1" data-testid="latest-bmi">
                        {latest.bmi}
                      </div>
                      {bmiCategory(latest.bmi) && (
                        <Badge
                          className="mt-1 text-xs"
                          style={{ backgroundColor: bmiCategory(latest.bmi)!.color, color: "#fff" }}
                        >
                          {bmiCategory(latest.bmi)!.label}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Form */}
          {showForm && (
            <Card className="mb-4">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <SourceBadge source="clinic" />
                  <span className="text-xs text-muted-foreground">Recording vitals captured in clinic.</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Systolic BP</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="120"
                      value={form.systolicBp}
                      onChange={(e) => setForm((f) => ({ ...f, systolicBp: e.target.value }))}
                      data-testid="input-systolic"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Diastolic BP</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="80"
                      value={form.diastolicBp}
                      onChange={(e) => setForm((f) => ({ ...f, diastolicBp: e.target.value }))}
                      data-testid="input-diastolic"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Heart Rate (bpm)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="72"
                      value={form.heartRate}
                      onChange={(e) => setForm((f) => ({ ...f, heartRate: e.target.value }))}
                      data-testid="input-heart-rate"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Weight (lbs)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="180"
                      value={form.weightLbs}
                      onChange={(e) => setForm((f) => ({ ...f, weightLbs: e.target.value }))}
                      data-testid="input-weight"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Height (inches)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="68"
                      value={form.heightInches}
                      onChange={(e) => setForm((f) => ({ ...f, heightInches: e.target.value }))}
                      data-testid="input-height"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-xs text-muted-foreground">BMI auto-calculates from weight + height.</div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    rows={2}
                    placeholder="Position, time of day, anything noteworthy..."
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    data-testid="input-vitals-notes"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => createMut.mutate()}
                    disabled={createMut.isPending}
                    data-testid="button-save-vitals"
                  >
                    {createMut.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                    Save Vitals
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!showForm && (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3 h-3" style={{ color: SRC.clinic.color }} />
                  {clinicCount} in-clinic
                </span>
                <span className="inline-flex items-center gap-1">
                  <Home className="w-3 h-3" style={{ color: SRC.patient_logged.color }} />
                  {patientCount} patient-reported
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfigOpen(true)}
                  data-testid="button-configure-monitoring"
                  className="gap-1"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  {activeEpisodes.length > 0 ? "Add monitoring" : "Configure at-home monitoring"}
                </Button>
                <Button size="sm" onClick={handleOpenForm} data-testid="button-add-vitals">
                  <Plus className="w-4 h-4 mr-1" /> Record Vitals
                </Button>
              </div>
            </div>
          )}

          {/* Total alerts banner */}
          {totalAlerts > 0 && (
            <div
              className="rounded-md border p-2.5 mb-3 flex items-center gap-2 text-xs"
              style={{ borderColor: "#e8c1ba", backgroundColor: "#fdf2f0", color: "#7a1a0a" }}
              data-testid="banner-monitoring-alerts"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>
                <strong>{totalAlerts}</strong> monitoring alert{totalAlerts > 1 ? "s" : ""} fired across active
                episodes — see clinical inbox for details.
              </span>
            </div>
          )}

          {/* History — EMR-style flowsheet (rows = metrics, cols = visits) */}
          <div data-testid="vitals-flowsheet-section">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-sm font-semibold">
                History{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({sortedVitals.length} {sortedVitals.length === 1 ? "result" : "results"})
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Label htmlFor="vitals-window" className="text-xs text-muted-foreground">
                  Time Window:
                </Label>
                <Select
                  value={String(windowMonths)}
                  onValueChange={(v) => {
                    setWindowMonths(Number(v) as 6 | 12 | 0);
                    setExpandedRow(null); // collapse drilldown when range changes
                  }}
                >
                  <SelectTrigger
                    id="vitals-window"
                    className="h-8 w-[150px] text-xs"
                    data-testid="select-vitals-window"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Last 6 months</SelectItem>
                    <SelectItem value="12">Last 12 months</SelectItem>
                    <SelectItem value="0">All Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}

            {!isLoading && safeVitals.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No vitals recorded yet. Click "Record Vitals" to start tracking, or "Configure at-home
                monitoring" to ask the patient to log readings from home.
              </div>
            )}

            {!isLoading && safeVitals.length > 0 && sortedVitals.length === 0 && (
              <div
                className="text-sm text-muted-foreground text-center py-8 border rounded-md bg-muted/20"
                data-testid="vitals-window-empty"
              >
                No readings in the last {windowMonths} months.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setWindowMonths(0)}
                  data-testid="link-show-all-vitals"
                >
                  Show all data
                </button>
                .
              </div>
            )}

            {sortedVitals.length > 0 && flowRows.length === 0 && (
              <div
                className="text-sm text-muted-foreground text-center py-6 border rounded-md bg-muted/20 mb-3"
                data-testid="vitals-flowsheet-no-metrics"
              >
                {sortedVitals.length} reading{sortedVitals.length === 1 ? "" : "s"} on file but no
                tracked metrics (BP, HR, weight, height, BMI) recorded yet. Use{" "}
                <span className="font-medium">Manage entries</span> below to review or remove them.
              </div>
            )}

            {sortedVitals.length > 0 && flowRows.length > 0 && (
              <div className="border rounded-md overflow-x-auto" data-testid="vitals-flowsheet-table">
                  <table className="text-sm border-collapse">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="sticky left-0 z-10 bg-muted/40 text-left p-2 text-[11px] font-semibold border-r border-b min-w-[64px]">
                          {/* corner cell */}
                        </th>
                        {sortedVitals.map((v) => {
                          const d = new Date(v.recordedAt as any);
                          return (
                            <th
                              key={v.id}
                              className="p-2 text-[11px] font-semibold text-center whitespace-nowrap border-r border-b"
                              data-testid={`flowsheet-col-${v.id}`}
                            >
                              <div className="leading-tight">
                                {d.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" })}
                              </div>
                              <div className="leading-tight font-normal text-muted-foreground">
                                {d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", timeZone: "UTC" })}
                              </div>
                            </th>
                          );
                        })}
                        <th className="p-2 text-[11px] font-semibold text-center sticky right-[44px] bg-muted/40 border-l border-b min-w-[100px]">
                          Trend
                        </th>
                        <th className="p-2 text-[11px] font-semibold text-left sticky right-0 bg-muted/40 border-l border-b min-w-[44px]">
                          {/* unit column — sticky-right offset matches body */}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {flowRows.flatMap((row) => {
                        const expanded = expandedRow === row.key;
                        const rows: JSX.Element[] = [
                          <tr
                            key={row.key}
                            className="border-t hover-elevate cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            onClick={() => setExpandedRow(expanded ? null : row.key)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setExpandedRow(expanded ? null : row.key);
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            aria-expanded={expanded}
                            aria-controls={`flowsheet-detail-${row.key}`}
                            aria-label={`${row.label} row — ${expanded ? "collapse" : "expand"} trend chart`}
                            data-testid={`flowsheet-row-${row.key}`}
                          >
                              <td className="sticky left-0 z-10 bg-background p-2 border-r font-semibold text-xs whitespace-nowrap">
                                <span className="inline-flex items-center gap-1">
                                  {expanded ? (
                                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                  )}
                                  {row.label}
                                </span>
                              </td>
                              {row.cells.map((cell, i) => {
                                const isPatient = cell.src === "patient_logged";
                                const colorByAbn =
                                  cell.abnormal === "severe"
                                    ? "#dc2626"
                                    : cell.abnormal === "mild"
                                    ? "#b45309"
                                    : isPatient
                                    ? SRC.patient_logged.color
                                    : "inherit";
                                const bg =
                                  cell.abnormal === "severe"
                                    ? "#fdf2f0"
                                    : isPatient
                                    ? SRC.patient_logged.bg
                                    : undefined;
                                const visitId = sortedVitals[i]?.id;
                                return (
                                  <td
                                    key={`${row.key}-${visitId}`}
                                    className="p-2 text-right font-mono text-xs whitespace-nowrap border-r"
                                    style={{
                                      backgroundColor: bg,
                                      color: colorByAbn,
                                      fontStyle: isPatient ? "italic" : "normal",
                                      fontWeight: cell.abnormal !== "none" ? 600 : 400,
                                    }}
                                    title={
                                      cell.src
                                        ? `${cell.display} · ${
                                            isPatient ? "Patient-reported" : "In-clinic"
                                          }`
                                        : undefined
                                    }
                                    data-testid={`flowsheet-cell-${row.key}-${visitId}`}
                                  >
                                    {cell.display}
                                  </td>
                                );
                              })}
                              <td className="p-1 sticky right-[44px] bg-background border-l">
                                <div className="w-[90px] h-[24px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                      data={row.series}
                                      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
                                    >
                                      <Line
                                        type="monotone"
                                        dataKey="y"
                                        stroke={row.color}
                                        strokeWidth={1.5}
                                        dot={false}
                                        isAnimationActive={false}
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </td>
                              <td className="p-2 sticky right-0 bg-background border-l text-[10px] text-muted-foreground whitespace-nowrap">
                                {row.unit}
                              </td>
                          </tr>,
                        ];
                        if (expanded) {
                          rows.push(
                            <tr key={`${row.key}-detail`} data-testid={`flowsheet-detail-${row.key}`}>
                                <td
                                  colSpan={sortedVitals.length + 3}
                                  className="p-3 border-t bg-muted/10"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                      {row.label} Trend ({row.unit})
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedRow(null);
                                      }}
                                      data-testid={`button-collapse-${row.key}`}
                                    >
                                      Hide
                                    </Button>
                                  </div>
                                  <div className="w-full h-40">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart
                                        data={row.series}
                                        margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                          dataKey="date"
                                          tick={{ fontSize: 10 }}
                                          interval="preserveStartEnd"
                                        />
                                        <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                                        <RechartsTooltip
                                          contentStyle={{ fontSize: 11 }}
                                          formatter={(val: any) => [`${val} ${row.unit}`, row.label]}
                                          labelFormatter={(l: string) => `Visit: ${l}`}
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="y"
                                          stroke={row.color}
                                          strokeWidth={2}
                                          dot={(props: any) => {
                                            const { cx, cy, payload, key } = props;
                                            if (cx == null || cy == null) return <g key={key} />;
                                            const isPatient = payload?.src === "patient_logged";
                                            return isPatient ? (
                                              <circle
                                                key={key}
                                                cx={cx}
                                                cy={cy}
                                                r={4}
                                                fill="#ffffff"
                                                stroke={row.color}
                                                strokeWidth={2}
                                              />
                                            ) : (
                                              <circle
                                                key={key}
                                                cx={cx}
                                                cy={cy}
                                                r={3.5}
                                                fill={row.color}
                                                stroke={row.color}
                                              />
                                            );
                                          }}
                                          isAnimationActive={false}
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                              </td>
                            </tr>
                          );
                        }
                        return rows;
                      })}
                    </tbody>
                  </table>
                </div>
            )}

            {sortedVitals.length > 0 && flowRows.length > 0 && (
              <div
                className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]"
                data-testid="flowsheet-color-key"
              >
                  <span className="font-semibold text-muted-foreground">Source:</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-3 h-3 rounded-sm border"
                      style={{ backgroundColor: "#ffffff", borderColor: SRC.clinic.border }}
                    />
                    <Building2 className="w-3 h-3" style={{ color: SRC.clinic.color }} />
                    <span style={{ color: SRC.clinic.color }}>In-clinic</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-3 h-3 rounded-sm border"
                      style={{
                        backgroundColor: SRC.patient_logged.bg,
                        borderColor: SRC.patient_logged.border,
                      }}
                    />
                    <Home className="w-3 h-3" style={{ color: SRC.patient_logged.color }} />
                    <span style={{ color: SRC.patient_logged.color, fontStyle: "italic" }}>
                      Patient-reported
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-3 h-3 rounded-sm border"
                      style={{ backgroundColor: "#fdf2f0", borderColor: "#e8c1ba" }}
                    />
                    <span style={{ color: "#dc2626", fontWeight: 600 }}>Abnormal</span>
                  </span>
                <span className="text-muted-foreground/80">
                  Click any row to expand the trend chart.
                </span>
              </div>
            )}

            {sortedVitals.length > 0 && (
              <details className="mt-2 text-xs" data-testid="flowsheet-manage-details">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Manage entries
                  </summary>
                  <div className="mt-2 border rounded-md divide-y">
                    {sortedVitals
                      .slice()
                      .reverse()
                      .map((v) => {
                        const src = srcOf(v);
                        return (
                          <div
                            key={v.id}
                            className="flex items-center justify-between gap-2 p-2"
                            data-testid={`manage-row-${v.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <SourceBadge source={src} size="xs" />
                              <span className="text-xs">
                                {new Date(v.recordedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  timeZone: "UTC",
                                })}
                                {v.timeOfDay ? (
                                  <span className="text-muted-foreground"> {v.timeOfDay}</span>
                                ) : null}
                              </span>
                            </div>
                            {src === "clinic" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteMut.mutate(v.id)}
                                data-testid={`button-delete-vital-${v.id}`}
                                className="text-xs gap-1 h-7"
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
                                Delete
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">audit-locked</span>
                            )}
                          </div>
                        );
                      })}
                </div>
              </details>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:justify-between">
          {onShowTrends ? (
            <Button variant="outline" onClick={onShowTrends} data-testid="button-view-vital-trends" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              View Trends
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-vitals">
            Close
          </Button>
        </DialogFooter>

        <ConfigureVitalsMonitoringDialog
          open={configOpen}
          onOpenChange={setConfigOpen}
          patientId={patientId}
          hasActive={activeEpisodes.length > 0}
        />
      </DialogContent>
    </Dialog>
  );
}
