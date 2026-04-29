import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, TrendingUp, Building2, Home } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
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

function srcOf(v: { source?: string | null }): "clinic" | "patient_logged" {
  return v.source === "patient_logged" ? "patient_logged" : "clinic";
}

// Custom dot renderer: filled circle = clinic, hollow ring = patient-reported.
// Same dot rule for every metric so the source convention is consistent.
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
  const { data: vitals = [], isLoading } = useQuery<PatientVital[]>({
    queryKey: ["/api/patients", patientId, "vitals"],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/vitals`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: open,
  });

  // One row per reading. Both clinic + patient_logged readings live on the SAME
  // series — source is conveyed via dot shape (filled vs hollow), not by
  // splitting into separate lines. This keeps the systolic/diastolic pair
  // visually connected per reading and avoids 4-line legend clutter.
  const series = useMemo(() => {
    return [...vitals]
      .sort((a, b) => new Date(a.recordedAt as any).getTime() - new Date(b.recordedAt as any).getTime())
      .map((v) => ({
        date: fmtDate(v.recordedAt as any),
        source: srcOf(v),
        systolic: v.systolicBp ?? null,
        diastolic: v.diastolicBp ?? null,
        hr: v.heartRate ?? null,
        weight: v.weightLbs != null ? Number(v.weightLbs) : null,
        bmi: (v as any).bmi != null ? Number((v as any).bmi) : null,
      }));
  }, [vitals]);

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

        {/* Source legend — applies to every chart below */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2 mb-1">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" style={{ color: "#2e3a20" }} />
            <span>
              In-clinic <span className="text-muted-foreground/70">(filled dot)</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5" style={{ color: "#8b5a10" }} />
            <span>
              Patient-reported <span className="text-muted-foreground/70">(hollow dot)</span>
            </span>
          </span>
          {!hasPatientLogged && (
            <span className="text-muted-foreground/70 italic">
              No patient-reported readings yet — start at-home monitoring from the Vitals dialog.
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : series.length < 2 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
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
                <Line
                  type="monotone"
                  dataKey="systolic"
                  name="Systolic"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={makeSourceDot("#dc2626")}
                  activeDot={makeSourceDot("#dc2626")}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="diastolic"
                  name="Diastolic"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={makeSourceDot("#2563eb")}
                  activeDot={makeSourceDot("#2563eb")}
                  connectNulls
                />
              </LineChart>
            </ChartCard>

            <ChartCard title="Heart Rate (bpm)">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="hr"
                  name="Heart Rate"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={makeSourceDot("#7c3aed")}
                  activeDot={makeSourceDot("#7c3aed")}
                  connectNulls
                />
              </LineChart>
            </ChartCard>

            <ChartCard title="Weight (lbs)">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="weight"
                  name="Weight"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={makeSourceDot("#16a34a")}
                  activeDot={makeSourceDot("#16a34a")}
                  connectNulls
                />
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
                  <Line
                    type="monotone"
                    dataKey="bmi"
                    name="BMI"
                    stroke="#ea580c"
                    strokeWidth={2}
                    dot={makeSourceDot("#ea580c")}
                    activeDot={makeSourceDot("#ea580c")}
                    connectNulls
                  />
                </LineChart>
              </ChartCard>
            )}
          </div>
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
