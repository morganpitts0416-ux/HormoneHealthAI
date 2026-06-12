import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Building2, Home, Trash2, AlertTriangle } from "lucide-react";
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

function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });
}

function fmtDateFull(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function srcOf(v: { source?: string | null }): "clinic" | "patient_logged" {
  return v.source === "patient_logged" ? "patient_logged" : "clinic";
}

// Custom dot renderer: filled circle = clinic, hollow ring = patient-reported.
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

  // Defensive normalisation: accept both a raw PatientVital[] and the legacy
  // wrapped shape { vitals: PatientVital[] } so a stale cache entry from the
  // monitoring panel never renders the dialog blank.
  const vitals: PatientVital[] = Array.isArray(vitalsRaw)
    ? vitalsRaw
    : ((vitalsRaw as any)?.vitals ?? []);

  // One row per reading, sorted oldest → newest for charts.
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

  // Table rows newest-first
  const tableRows = useMemo(() =>
    [...vitals].sort((a, b) => new Date(b.recordedAt as any).getTime() - new Date(a.recordedAt as any).getTime()),
    [vitals]
  );

  const hasPatientLogged = vitals.some((v) => srcOf(v) === "patient_logged");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Vital Trends — {patientName}
          </DialogTitle>
        </DialogHeader>

        {/* Source legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2 mb-1">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" style={{ color: "#2e3a20" }} />
            <span>In-clinic <span className="text-muted-foreground/70">(filled dot)</span></span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5" style={{ color: "#8b5a10" }} />
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
                        const isConfirming = confirmDeleteId === v.id;
                        const isDeleting = deleteMutation.isPending && confirmDeleteId === v.id;
                        const bpStr = v.systolicBp && v.diastolicBp ? `${v.systolicBp}/${v.diastolicBp}` : v.systolicBp ? `${v.systolicBp}` : "—";
                        const hrStr = v.heartRate ? `${v.heartRate}` : "—";
                        const wtStr = v.weightLbs ? `${Number(v.weightLbs)} lbs` : "—";
                        const bmiStr = (v as any).bmi ? `${Number((v as any).bmi).toFixed(1)}` : "—";
                        const src = srcOf(v);
                        return (
                          <tr key={v.id} className="border-t last:border-b-0 hover-elevate">
                            <td className="px-3 py-2 text-foreground">{fmtDateFull(v.recordedAt as any)}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{bpStr}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{hrStr}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{wtStr}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{bmiStr}</td>
                            <td className="px-3 py-2">
                              {src === "patient_logged" ? (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <Home className="w-3 h-3" /> Patient
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <Building2 className="w-3 h-3" /> Clinic
                                </span>
                              )}
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
                                <Button
                                  data-testid={`button-delete-vital-${v.id}`}
                                  size="icon"
                                  variant="ghost"
                                  className="text-muted-foreground"
                                  onClick={() => setConfirmDeleteId(v.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
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
      </DialogContent>
    </Dialog>
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
