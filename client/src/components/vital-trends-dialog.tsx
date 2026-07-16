import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, Building2, Home, Trash2, AlertTriangle, Pencil, FileText, Check, X, GripVertical, Maximize2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFloatingPanel } from "@/hooks/use-floating-panel";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PatientVital } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  patientName: string;
}

interface EditForm {
  systolicBp: string;
  diastolicBp: string;
  heartRate: string;
  weightLbs: string;
  heightInches: string;
  temperature: string;
  respiratoryRate: string;
  oxygenSaturation: string;
}

function toEditForm(v: PatientVital): EditForm {
  return {
    systolicBp: v.systolicBp != null ? String(v.systolicBp) : "",
    diastolicBp: v.diastolicBp != null ? String(v.diastolicBp) : "",
    heartRate: v.heartRate != null ? String(v.heartRate) : "",
    weightLbs: v.weightLbs != null ? String(Number(v.weightLbs)) : "",
    heightInches: v.heightInches != null ? String(Number(v.heightInches)) : "",
    temperature: v.temperature != null ? String(Number(v.temperature)) : "",
    respiratoryRate: v.respiratoryRate != null ? String(v.respiratoryRate) : "",
    oxygenSaturation: v.oxygenSaturation != null ? String(Number(v.oxygenSaturation)) : "",
  };
}

function numOrNull(s: string): number | null {
  const n = parseFloat(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}

function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });
}

function fmtDateFull(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function srcOf(v: { source?: string | null; sourceEncounterId?: number | null }): "note" | "clinic" | "patient_logged" {
  if (v.source === "patient_logged") return "patient_logged";
  if ((v as any).sourceEncounterId != null) return "note";
  return "clinic";
}

// Custom dot renderer: filled circle = clinic/note, hollow ring = patient-reported.
function makeSourceDot(stroke: string) {
  // eslint-disable-next-line react/display-name
  return (props: any) => {
    const { cx, cy, payload, key } = props;
    if (cx == null || cy == null) return <g key={key} />;
    const isPatient = payload?.source === "patient_logged";
    if (isPatient) {
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={4}
          fill="#ffffff"
          stroke={stroke}
          strokeWidth={2}
        />
      );
    }
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={3.5}
        fill={stroke}
        stroke={stroke}
      />
    );
  };
}

export function VitalTrendsDialog({ open, onOpenChange, patientId, patientName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const { data: vitalsRaw, isLoading } = useQuery<PatientVital[]>({
    queryKey: ["/api/patients", patientId, "vitals"],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/vitals`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vitals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals"] });
      setConfirmDeleteId(null);
      toast({ title: "Reading deleted", description: "The vitals entry has been removed." });
    },
    onError: () => {
      toast({ title: "Delete failed", description: "Could not remove this reading.", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, number | null> }) =>
      apiRequest("PATCH", `/api/vitals/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals"] });
      setEditingId(null);
      setEditForm(null);
      toast({ title: "Reading updated" });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save changes.", variant: "destructive" });
    },
  });

  function startEdit(v: PatientVital) {
    setConfirmDeleteId(null);
    setEditingId(v.id);
    setEditForm(toEditForm(v));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function saveEdit(id: number) {
    if (!editForm) return;
    editMutation.mutate({
      id,
      data: {
        systolicBp: numOrNull(editForm.systolicBp),
        diastolicBp: numOrNull(editForm.diastolicBp),
        heartRate: numOrNull(editForm.heartRate),
        weightLbs: numOrNull(editForm.weightLbs),
        heightInches: numOrNull(editForm.heightInches),
        temperature: numOrNull(editForm.temperature),
        respiratoryRate: numOrNull(editForm.respiratoryRate),
        oxygenSaturation: numOrNull(editForm.oxygenSaturation),
      },
    });
  }

  function setField(field: keyof EditForm, value: string) {
    setEditForm(prev => prev ? { ...prev, [field]: value } : prev);
  }

  const { panelPos, minimized, setMinimized, panelRef, startDrag, floating, zIndex, bringToFront } = useFloatingPanel();

  // Defensive normalisation
  const vitals: PatientVital[] = Array.isArray(vitalsRaw)
    ? vitalsRaw
    : ((vitalsRaw as any)?.vitals ?? []);

  const sorted = useMemo(() =>
    [...vitals].sort((a, b) => new Date(a.recordedAt as any).getTime() - new Date(b.recordedAt as any).getTime()),
    [vitals]
  );

  const series = useMemo(() => sorted.map((v) => ({
    id: v.id,
    date: fmtDate(v.recordedAt as any),
    source: srcOf(v),
    systolic: v.systolicBp ?? null,
    diastolic: v.diastolicBp ?? null,
    hr: v.heartRate ?? null,
    weight: v.weightLbs != null ? Number(v.weightLbs) : null,
    bmi: (v as any).bmi != null ? Number((v as any).bmi) : null,
  })), [sorted]);

  const tableRows = useMemo(() =>
    [...vitals].sort((a, b) => new Date(b.recordedAt as any).getTime() - new Date(a.recordedAt as any).getTime()),
    [vitals]
  );

  const hasPatientLogged = vitals.some((v) => srcOf(v) === "patient_logged");

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      onMouseDown={bringToFront}
      className={cn(
        "fixed flex flex-col bg-card shadow-2xl overflow-hidden",
        floating ? "rounded-lg border w-full max-w-3xl" : "inset-y-0 right-0 border-l w-full max-w-3xl h-full"
      )}
      style={{ zIndex, ...(panelPos ? { left: panelPos.x, top: panelPos.y, height: minimized ? "auto" : "85vh", maxHeight: "90vh" } : {}) }}
      data-testid="vital-trends-dialog"
    >
      {/* Drag-handle title bar */}
      <div
        onMouseDown={startDrag}
        className="flex-shrink-0 px-5 py-3 border-b bg-card flex items-center justify-between gap-3 cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          <TrendingUp className="w-5 h-5" />
          <span className="font-semibold text-base truncate">Vital Trends — {patientName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setMinimized(m => !m)} title={minimized ? "Restore" : "Minimize"}>
            {minimized ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!minimized && (
      <div className="flex-1 overflow-y-auto p-5 space-y-3">

        {/* Source legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2 mb-1">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>Manual entry</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>From note <span className="text-muted-foreground/70">(auto-synced)</span></span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5" />
            <span>Patient-reported <span className="text-muted-foreground/70">(hollow dot)</span></span>
          </span>
          {!hasPatientLogged && (
            <span className="text-muted-foreground/70 italic">
              No patient-reported readings yet.
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {series.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                At least two vitals readings are needed to show a trend. Add another set of vitals to see charts here.
              </div>
            ) : (
              <div className="space-y-4">
                <ChartCard title="Blood Pressure (mmHg)">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="systolic" name="Systolic" stroke="#dc2626" strokeWidth={2} dot={makeSourceDot("#dc2626")} activeDot={makeSourceDot("#dc2626")} connectNulls />
                    <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke="#2563eb" strokeWidth={2} dot={makeSourceDot("#2563eb")} activeDot={makeSourceDot("#2563eb")} connectNulls />
                  </LineChart>
                </ChartCard>

                <ChartCard title="Heart Rate (bpm)">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="hr" name="Heart Rate" stroke="#7c3aed" strokeWidth={2} dot={makeSourceDot("#7c3aed")} activeDot={makeSourceDot("#7c3aed")} connectNulls />
                  </LineChart>
                </ChartCard>

                <ChartCard title="Weight (lbs)">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="weight" name="Weight" stroke="#16a34a" strokeWidth={2} dot={makeSourceDot("#16a34a")} activeDot={makeSourceDot("#16a34a")} connectNulls />
                  </LineChart>
                </ChartCard>

                {series.some((s) => s.bmi != null) && (
                  <ChartCard title="BMI">
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="bmi" name="BMI" stroke="#ea580c" strokeWidth={2} dot={makeSourceDot("#ea580c")} activeDot={makeSourceDot("#ea580c")} connectNulls />
                    </LineChart>
                  </ChartCard>
                )}
              </div>
            )}

            {/* ── Readings table ── */}
            {tableRows.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">All Readings</p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">BP</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">HR</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Weight</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">BMI</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Source</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((v) => {
                        const isEditing = editingId === v.id;
                        const isConfirming = confirmDeleteId === v.id;
                        const isDeleting = deleteMutation.isPending && confirmDeleteId === v.id;
                        const isSaving = editMutation.isPending && editingId === v.id;
                        const src = srcOf(v);

                        if (isEditing && editForm) {
                          return (
                            <tr key={v.id} className="border-t bg-muted/30">
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {fmtDateFull(v.recordedAt as any)}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <Input
                                    data-testid={`input-edit-systolic-${v.id}`}
                                    className="h-7 w-14 text-xs font-mono px-1.5"
                                    placeholder="Sys"
                                    value={editForm.systolicBp}
                                    onChange={e => setField("systolicBp", e.target.value)}
                                  />
                                  <span className="text-muted-foreground">/</span>
                                  <Input
                                    data-testid={`input-edit-diastolic-${v.id}`}
                                    className="h-7 w-14 text-xs font-mono px-1.5"
                                    placeholder="Dia"
                                    value={editForm.diastolicBp}
                                    onChange={e => setField("diastolicBp", e.target.value)}
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  data-testid={`input-edit-hr-${v.id}`}
                                  className="h-7 w-14 text-xs font-mono px-1.5"
                                  placeholder="HR"
                                  value={editForm.heartRate}
                                  onChange={e => setField("heartRate", e.target.value)}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  data-testid={`input-edit-weight-${v.id}`}
                                  className="h-7 w-16 text-xs font-mono px-1.5"
                                  placeholder="lbs"
                                  value={editForm.weightLbs}
                                  onChange={e => setField("weightLbs", e.target.value)}
                                />
                              </td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">auto</td>
                              <td className="px-3 py-2">
                                <SourceBadge src={src} />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <span className="inline-flex items-center gap-1">
                                  <Button
                                    data-testid={`button-save-vital-${v.id}`}
                                    size="icon"
                                    variant="default"
                                    onClick={() => saveEdit(v.id)}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button
                                    data-testid={`button-cancel-edit-vital-${v.id}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={cancelEdit}
                                    disabled={isSaving}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </span>
                              </td>
                            </tr>
                          );
                        }

                        const bpStr = v.systolicBp && v.diastolicBp ? `${v.systolicBp}/${v.diastolicBp}` : v.systolicBp ? `${v.systolicBp}` : "—";
                        const hrStr = v.heartRate ? `${v.heartRate}` : "—";
                        const wtStr = v.weightLbs ? `${Number(v.weightLbs)} lbs` : "—";
                        const bmiStr = (v as any).bmi ? `${Number((v as any).bmi).toFixed(1)}` : "—";

                        return (
                          <tr key={v.id} className="border-t last:border-b-0 hover-elevate">
                            <td className="px-3 py-2 text-foreground">{fmtDateFull(v.recordedAt as any)}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{bpStr}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{hrStr}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{wtStr}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{bmiStr}</td>
                            <td className="px-3 py-2">
                              <SourceBadge src={src} />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {isConfirming ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                                  <Button
                                    data-testid={`button-confirm-delete-vital-${v.id}`}
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => deleteMutation.mutate(v.id)}
                                    disabled={isDeleting}
                                  >
                                    {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                                  </Button>
                                  <Button
                                    data-testid={`button-cancel-delete-vital-${v.id}`}
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={isDeleting}
                                  >
                                    Cancel
                                  </Button>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1" style={{ visibility: "visible" }}>
                                  <Button
                                    data-testid={`button-edit-vital-${v.id}`}
                                    size="icon"
                                    variant="ghost"
                                    className="text-muted-foreground"
                                    onClick={() => startEdit(v)}
                                    disabled={!!editingId}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    data-testid={`button-delete-vital-${v.id}`}
                                    size="icon"
                                    variant="ghost"
                                    className="text-muted-foreground"
                                    onClick={() => { cancelEdit(); setConfirmDeleteId(v.id); }}
                                    disabled={!!editingId}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

function SourceBadge({ src }: { src: "note" | "clinic" | "patient_logged" }) {
  if (src === "patient_logged") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Home className="w-3 h-3" /> Patient
      </span>
    );
  }
  if (src === "note") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <FileText className="w-3 h-3" /> From note
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Building2 className="w-3 h-3" /> Manual
    </span>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
        <div className="w-full h-48">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
