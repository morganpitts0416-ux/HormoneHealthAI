import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Download } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { LabResult } from "@shared/schema";

interface MarkerConfig {
  name: string;
  key: string;
  unit: string;
  color: string;
  optimalRange?: { min?: number; max?: number };
  lowerIsBetter?: boolean;
  group: 'lipids' | 'metabolic' | 'hormones' | 'thyroid' | 'inflammation' | 'cbc' | 'nutrients';
}

const markerConfigs: MarkerConfig[] = [
  { name: 'LDL', key: 'ldl', unit: 'mg/dL', color: '#ef4444', optimalRange: { max: 100 }, lowerIsBetter: true, group: 'lipids' },
  { name: 'HDL', key: 'hdl', unit: 'mg/dL', color: '#22c55e', optimalRange: { min: 40 }, lowerIsBetter: false, group: 'lipids' },
  { name: 'Triglycerides', key: 'triglycerides', unit: 'mg/dL', color: '#f97316', optimalRange: { max: 150 }, lowerIsBetter: true, group: 'lipids' },
  { name: 'Total Cholesterol', key: 'totalCholesterol', unit: 'mg/dL', color: '#8b5cf6', optimalRange: { max: 200 }, lowerIsBetter: true, group: 'lipids' },
  { name: 'ApoB', key: 'apoB', unit: 'mg/dL', color: '#ec4899', optimalRange: { max: 90 }, lowerIsBetter: true, group: 'lipids' },
  { name: 'A1c', key: 'a1c', unit: '%', color: '#f59e0b', optimalRange: { max: 5.7 }, lowerIsBetter: true, group: 'metabolic' },
  { name: 'Fasting Glucose', key: 'fastingGlucose', unit: 'mg/dL', color: '#d97706', optimalRange: { min: 70, max: 100 }, lowerIsBetter: true, group: 'metabolic' },
  { name: 'Testosterone', key: 'testosterone', unit: 'ng/dL', color: '#3b82f6', group: 'hormones' },
  { name: 'Free Testosterone', key: 'freeTestosterone', unit: 'pg/mL', color: '#6366f1', group: 'hormones' },
  { name: 'Estradiol', key: 'estradiol', unit: 'pg/mL', color: '#ec4899', group: 'hormones' },
  { name: 'SHBG', key: 'shbg', unit: 'nmol/L', color: '#14b8a6', group: 'hormones' },
  { name: 'TSH', key: 'tsh', unit: 'mIU/L', color: '#8b5cf6', optimalRange: { min: 0.45, max: 4.5 }, group: 'thyroid' },
  { name: 'Free T4', key: 'freeT4', unit: 'ng/dL', color: '#a855f7', group: 'thyroid' },
  { name: 'Free T3', key: 'freeT3', unit: 'pg/mL', color: '#d946ef', group: 'thyroid' },
  { name: 'hs-CRP', key: 'hsCRP', unit: 'mg/L', color: '#ef4444', optimalRange: { max: 1.0 }, lowerIsBetter: true, group: 'inflammation' },
  { name: 'Hemoglobin', key: 'hemoglobin', unit: 'g/dL', color: '#dc2626', group: 'cbc' },
  { name: 'Hematocrit', key: 'hematocrit', unit: '%', color: '#b91c1c', group: 'cbc' },
  { name: 'Vitamin D', key: 'vitaminD', unit: 'ng/mL', color: '#eab308', optimalRange: { min: 40, max: 80 }, lowerIsBetter: false, group: 'nutrients' },
  { name: 'Ferritin', key: 'ferritin', unit: 'ng/mL', color: '#78716c', group: 'nutrients' },
  { name: 'Vitamin B12', key: 'vitaminB12', unit: 'pg/mL', color: '#059669', lowerIsBetter: false, group: 'nutrients' },
  { name: 'PSA', key: 'psa', unit: 'ng/mL', color: '#64748b', optimalRange: { max: 4.0 }, lowerIsBetter: true, group: 'metabolic' },
];

const groupLabels: Record<string, string> = {
  lipids: 'Lipid Panel',
  metabolic: 'Metabolic',
  hormones: 'Hormones',
  thyroid: 'Thyroid',
  inflammation: 'Inflammation',
  cbc: 'Blood Count',
  nutrients: 'Vitamins & Minerals',
};

interface PatientTrendChartsProps {
  labs: LabResult[];
  patientName: string;
}

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  value: number;
}

function buildChartData(labs: LabResult[], markerKey: string): ChartDataPoint[] {
  const sorted = [...labs].sort((a, b) => new Date(a.labDate).getTime() - new Date(b.labDate).getTime());
  const points: ChartDataPoint[] = [];
  for (const lab of sorted) {
    const vals = lab.labValues as any;
    const val = vals?.[markerKey];
    if (val !== undefined && val !== null && val !== '') {
      const numVal = Number(val);
      if (Number.isFinite(numVal)) {
        points.push({
          date: new Date(lab.labDate).toISOString(),
          dateLabel: new Date(lab.labDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          value: numVal,
        });
      }
    }
  }
  return points;
}

function getAvailableMarkers(labs: LabResult[]): MarkerConfig[] {
  return markerConfigs.filter(mc => {
    return labs.some(lab => {
      const vals = lab.labValues as any;
      const v = vals?.[mc.key];
      return v !== undefined && v !== null && v !== '';
    });
  });
}

function getAvailableMarkersWithMultiplePoints(labs: LabResult[]): MarkerConfig[] {
  return markerConfigs.filter(mc => {
    let count = 0;
    for (const lab of labs) {
      const vals = lab.labValues as any;
      const v = vals?.[mc.key];
      if (v !== undefined && v !== null && v !== '') count++;
      if (count >= 2) return true;
    }
    return false;
  });
}

export function PatientTrendCharts({ labs, patientName }: PatientTrendChartsProps) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

  const availableMarkers = getAvailableMarkersWithMultiplePoints(labs);
  const allAvailableMarkers = getAvailableMarkers(labs);

  if (availableMarkers.length === 0) {
    if (allAvailableMarkers.length > 0 && labs.length < 2) {
      return (
        <Card data-testid="trend-charts-insufficient">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Lab Trend Charts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Trend charts require at least 2 lab results. This patient has {labs.length} result{labs.length === 1 ? '' : 's'} on file.
            </p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const groups = Array.from(new Set(availableMarkers.map(m => m.group)));
  const displayMarkers = selectedGroup
    ? availableMarkers.filter(m => m.group === selectedGroup)
    : availableMarkers;

  return (
    <Card data-testid="trend-charts-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Lab Trend Charts
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={selectedGroup === null ? "default" : "secondary"}
              className="cursor-pointer text-xs"
              onClick={() => setSelectedGroup(null)}
              data-testid="filter-all-groups"
            >
              All
            </Badge>
            {groups.map(g => (
              <Badge
                key={g}
                variant={selectedGroup === g ? "default" : "secondary"}
                className="cursor-pointer text-xs"
                onClick={() => setSelectedGroup(g)}
                data-testid={`filter-group-${g}`}
              >
                {groupLabels[g] || g}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartsRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayMarkers.map(marker => {
            const data = buildChartData(labs, marker.key);
            if (data.length < 2) return null;

            const values = data.map(d => d.value);
            const minVal = Math.min(...values);
            const maxVal = Math.max(...values);
            const padding = (maxVal - minVal) * 0.2 || maxVal * 0.1 || 1;
            const yMin = Math.max(0, Math.floor(minVal - padding));
            const yMax = Math.ceil(maxVal + padding);

            const latestVal = data[data.length - 1].value;
            const prevVal = data[data.length - 2].value;
            const change = latestVal - prevVal;
            const changePercent = prevVal !== 0 ? ((change / prevVal) * 100).toFixed(1) : '0';

            return (
              <div
                key={marker.key}
                className="border rounded-lg p-3 bg-card"
                data-testid={`chart-${marker.key}`}
              >
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: marker.color }} />
                    <span className="text-sm font-medium">{marker.name}</span>
                    <span className="text-xs text-muted-foreground">({marker.unit})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{latestVal}</span>
                    <span className={`text-xs ${
                      change === 0 ? 'text-muted-foreground' :
                      marker.lowerIsBetter === undefined ? 'text-muted-foreground' :
                      (marker.lowerIsBetter ? change < 0 : change > 0) ? 'text-green-600 dark:text-green-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {change > 0 ? '+' : ''}{changePercent}%
                    </span>
                  </div>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis
                        dataKey="dateLabel"
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={[yMin, yMax]}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`${value} ${marker.unit}`, marker.name]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      {marker.optimalRange?.max && (
                        <ReferenceLine
                          y={marker.optimalRange.max}
                          stroke="#22c55e"
                          strokeDasharray="4 4"
                          strokeOpacity={0.6}
                          label={{ value: 'Goal', position: 'right', fontSize: 9, fill: '#22c55e' }}
                        />
                      )}
                      {marker.optimalRange?.min && (
                        <ReferenceLine
                          y={marker.optimalRange.min}
                          stroke="#22c55e"
                          strokeDasharray="4 4"
                          strokeOpacity={0.6}
                          label={{ value: 'Min', position: 'right', fontSize: 9, fill: '#22c55e' }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={marker.color}
                        strokeWidth={2}
                        dot={{ fill: marker.color, r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function buildTrendChartDataForPDF(labs: LabResult[]): Array<{ marker: MarkerConfig; data: ChartDataPoint[] }> {
  const available = getAvailableMarkersWithMultiplePoints(labs);
  return available.map(marker => ({
    marker,
    data: buildChartData(labs, marker.key),
  })).filter(item => item.data.length >= 2);
}

export { type MarkerConfig, type ChartDataPoint };
