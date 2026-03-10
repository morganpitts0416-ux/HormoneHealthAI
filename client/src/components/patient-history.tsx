import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus, FileText } from "lucide-react";
import { PatientTrendCharts } from "@/components/patient-trend-charts";
import type { Patient, LabResult, InterpretationResult, LabValues, FemaleLabValues } from "@shared/schema";

interface PatientHistoryProps {
  patient: Patient;
  onLoadResult: (labValues: LabValues | FemaleLabValues, interpretation: InterpretationResult) => void;
}

interface TrendItem {
  name: string;
  current: number;
  previous: number;
  unit: string;
  direction: 'up' | 'down' | 'stable';
  favorable: boolean;
}

const trackedMarkers: Array<{ name: string; key: string; unit: string; lowerIsBetter?: boolean }> = [
  { name: 'LDL', key: 'ldl', unit: 'mg/dL', lowerIsBetter: true },
  { name: 'HDL', key: 'hdl', unit: 'mg/dL', lowerIsBetter: false },
  { name: 'Triglycerides', key: 'triglycerides', unit: 'mg/dL', lowerIsBetter: true },
  { name: 'A1c', key: 'a1c', unit: '%', lowerIsBetter: true },
  { name: 'Testosterone', key: 'testosterone', unit: 'ng/dL' },
  { name: 'Estradiol', key: 'estradiol', unit: 'pg/mL' },
  { name: 'Vitamin D', key: 'vitaminD', unit: 'ng/mL', lowerIsBetter: false },
  { name: 'Ferritin', key: 'ferritin', unit: 'ng/mL' },
  { name: 'hs-CRP', key: 'hsCRP', unit: 'mg/L', lowerIsBetter: true },
  { name: 'ApoB', key: 'apoB', unit: 'mg/dL', lowerIsBetter: true },
  { name: 'TSH', key: 'tsh', unit: 'mIU/L' },
];

function computeTrends(current: any, previous: any): TrendItem[] {
  const trends: TrendItem[] = [];
  for (const marker of trackedMarkers) {
    const c = current[marker.key];
    const p = previous[marker.key];
    if (c !== undefined && c !== null && p !== undefined && p !== null) {
      const diff = Number(c) - Number(p);
      const direction: 'up' | 'down' | 'stable' = Math.abs(diff) < 0.1 ? 'stable' : diff > 0 ? 'up' : 'down';
      let favorable = direction === 'stable';
      if (marker.lowerIsBetter !== undefined && direction !== 'stable') {
        favorable = marker.lowerIsBetter ? direction === 'down' : direction === 'up';
      }
      trends.push({
        name: marker.name,
        current: Number(c),
        previous: Number(p),
        unit: marker.unit,
        direction,
        favorable,
      });
    }
  }
  return trends;
}

function getResultSummary(interpretation: InterpretationResult | null) {
  if (!interpretation) return { label: 'Pending', variant: 'secondary' as const };
  const redFlagCount = interpretation.redFlags?.length || 0;
  const abnormalCount = interpretation.interpretations?.filter(i => i.status === 'abnormal' || i.status === 'critical').length || 0;
  if (redFlagCount > 0) return { label: `${redFlagCount} Red Flag${redFlagCount > 1 ? 's' : ''}`, variant: 'destructive' as const };
  if (abnormalCount > 0) return { label: `${abnormalCount} Abnormal`, variant: 'secondary' as const };
  return { label: 'Normal', variant: 'secondary' as const };
}

export function PatientHistory({ patient, onLoadResult }: PatientHistoryProps) {
  const { data: labs = [], isLoading } = useQuery<LabResult[]>({
    queryKey: [`/api/patients/${patient.id}/labs`],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Loading patient history...
        </CardContent>
      </Card>
    );
  }

  if (labs.length === 0) {
    return (
      <Card data-testid="patient-history-empty">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Lab History - {patient.firstName} {patient.lastName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No prior lab results on file. This interpretation will be saved as the first record.</p>
        </CardContent>
      </Card>
    );
  }

  const mostRecent = labs[0];
  const currentLabVals = mostRecent.labValues as any;
  const secondMostRecent = labs.length > 1 ? labs[1] : null;
  const trends = secondMostRecent
    ? computeTrends(currentLabVals, (secondMostRecent.labValues as any))
    : [];

  return (
    <>
    <Card data-testid="patient-history-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Lab History - {patient.firstName} {patient.lastName}
          <Badge variant="secondary" className="text-xs ml-auto">{labs.length} result{labs.length > 1 ? 's' : ''}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {trends.length > 0 && (
          <div data-testid="trend-summary">
            <p className="text-sm font-medium mb-2">Key Trends (Last 2 Results)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {trends.map((t) => (
                <div key={t.name} className="flex items-center gap-1.5 text-sm p-1.5 rounded bg-muted/50" data-testid={`trend-${t.name.toLowerCase().replace(/\s+/g, '-')}`}>
                  {t.direction === 'up' && <TrendingUp className={`h-3.5 w-3.5 flex-shrink-0 ${t.favorable ? 'text-green-600' : 'text-red-600'}`} />}
                  {t.direction === 'down' && <TrendingDown className={`h-3.5 w-3.5 flex-shrink-0 ${t.favorable ? 'text-green-600' : 'text-red-600'}`} />}
                  {t.direction === 'stable' && <Minus className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                  <span className="truncate">{t.name}: {t.previous} {'->'} {t.current}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-2">Previous Results</p>
          <div className="space-y-2">
            {labs.map((lab, idx) => {
              const summary = getResultSummary(lab.interpretationResult as InterpretationResult | null);
              const date = new Date(lab.labDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
              return (
                <div key={lab.id} className="flex items-center gap-2 p-2 rounded border" data-testid={`lab-history-${lab.id}`}>
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{date}</span>
                    {idx === 0 && <Badge variant="secondary" className="ml-2 text-xs">Most Recent</Badge>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {summary.label.includes('Red') ? (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {summary.label}
                      </Badge>
                    ) : summary.label === 'Normal' ? (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {summary.label}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">{summary.label}</Badge>
                    )}
                    {lab.interpretationResult && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onLoadResult(lab.labValues as LabValues | FemaleLabValues, lab.interpretationResult as InterpretationResult)}
                        data-testid={`button-load-history-${lab.id}`}
                      >
                        View
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>

    {labs.length >= 2 && (
      <PatientTrendCharts
        labs={labs}
        patientName={`${patient.firstName} ${patient.lastName}`}
      />
    )}
    </>
  );
}
