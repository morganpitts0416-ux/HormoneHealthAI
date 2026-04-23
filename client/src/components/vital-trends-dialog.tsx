import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";
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

  const series = useMemo(() => {
    return [...vitals]
      .sort((a, b) => new Date(a.recordedAt as any).getTime() - new Date(b.recordedAt as any).getTime())
      .map(v => ({
        date: fmtDate(v.recordedAt as any),
        systolic: v.systolicBp ?? null,
        diastolic: v.diastolicBp ?? null,
        hr: v.heartRate ?? null,
        weight: v.weightLbs != null ? Number(v.weightLbs) : null,
        bmi: (v as any).bmi != null ? Number((v as any).bmi) : null,
      }));
  }, [vitals]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Vital Trends — {patientName}
          </DialogTitle>
        </DialogHeader>

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
                <Legend />
                <Line type="monotone" dataKey="systolic" stroke="#dc2626" strokeWidth={2} dot connectNulls />
                <Line type="monotone" dataKey="diastolic" stroke="#2563eb" strokeWidth={2} dot connectNulls />
              </LineChart>
            </ChartCard>

            <ChartCard title="Heart Rate (bpm)">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="hr" stroke="#7c3aed" strokeWidth={2} dot connectNulls name="Heart Rate" />
              </LineChart>
            </ChartCard>

            <ChartCard title="Weight (lbs)">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="#16a34a" strokeWidth={2} dot connectNulls name="Weight" />
              </LineChart>
            </ChartCard>

            {series.some(s => s.bmi != null) && (
              <ChartCard title="BMI">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="bmi" stroke="#ea580c" strokeWidth={2} dot connectNulls name="BMI" />
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
