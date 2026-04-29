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

// Distinct color/style per metric × source so trends are unambiguous at a glance.
// Clinic = solid, Patient-logged = dashed, with hollow dots.
const STYLE = {
  clinic: { dash: undefined as string | undefined, dot: { r: 3 } as any },
  patient_logged: { dash: "5 4", dot: { r: 4, fill: "#ffffff", strokeWidth: 2 } as any },
};

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

  // Build a single, time-sorted series with separate keys per source so each
  // line shows only its own source's points (gaps where the other source was
  // recorded). Recharts `connectNulls` bridges those gaps visually.
  const series = useMemo(() => {
    return [...vitals]
      .sort((a, b) => new Date(a.recordedAt as any).getTime() - new Date(b.recordedAt as any).getTime())
      .map((v) => {
        const src = srcOf(v);
        const isClinic = src === "clinic";
        return {
          date: fmtDate(v.recordedAt as any),
          systolic_clinic: isClinic ? v.systolicBp ?? null : null,
          systolic_patient: !isClinic ? v.systolicBp ?? null : null,
          diastolic_clinic: isClinic ? v.diastolicBp ?? null : null,
          diastolic_patient: !isClinic ? v.diastolicBp ?? null : null,
          hr_clinic: isClinic ? v.heartRate ?? null : null,
          hr_patient: !isClinic ? v.heartRate ?? null : null,
          weight_clinic: isClinic && v.weightLbs != null ? Number(v.weightLbs) : null,
          weight_patient: !isClinic && v.weightLbs != null ? Number(v.weightLbs) : null,
          bmi_clinic: isClinic && (v as any).bmi != null ? Number((v as any).bmi) : null,
          bmi_patient: !isClinic && (v as any).bmi != null ? Number((v as any).bmi) : null,
        };
      });
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

        {/* Source legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground -mt-2 mb-1">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" style={{ color: "#2e3a20" }} />
            <span>
              In-clinic <span className="text-muted-foreground/70">(solid)</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5" style={{ color: "#8b5a10" }} />
            <span>
              Patient-reported <span className="text-muted-foreground/70">(dashed)</span>
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
                  dataKey="systolic_clinic"
                  name="Systolic (clinic)"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={STYLE.clinic.dot}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="systolic_patient"
                  name="Systolic (patient)"
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray={STYLE.patient_logged.dash}
                  dot={STYLE.patient_logged.dot}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="diastolic_clinic"
                  name="Diastolic (clinic)"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={STYLE.clinic.dot}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="diastolic_patient"
                  name="Diastolic (patient)"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray={STYLE.patient_logged.dash}
                  dot={STYLE.patient_logged.dot}
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
                  dataKey="hr_clinic"
                  name="Heart Rate (clinic)"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={STYLE.clinic.dot}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="hr_patient"
                  name="Heart Rate (patient)"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  strokeDasharray={STYLE.patient_logged.dash}
                  dot={STYLE.patient_logged.dot}
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
                  dataKey="weight_clinic"
                  name="Weight (clinic)"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={STYLE.clinic.dot}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="weight_patient"
                  name="Weight (patient)"
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray={STYLE.patient_logged.dash}
                  dot={STYLE.patient_logged.dot}
                  connectNulls
                />
              </LineChart>
            </ChartCard>

            {series.some((s) => s.bmi_clinic != null || s.bmi_patient != null) && (
              <ChartCard title="BMI">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="bmi_clinic"
                    name="BMI (clinic)"
                    stroke="#ea580c"
                    strokeWidth={2}
                    dot={STYLE.clinic.dot}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="bmi_patient"
                    name="BMI (patient)"
                    stroke="#ea580c"
                    strokeWidth={2}
                    strokeDasharray={STYLE.patient_logged.dash}
                    dot={STYLE.patient_logged.dot}
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
