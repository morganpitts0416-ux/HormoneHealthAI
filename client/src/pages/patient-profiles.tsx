import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, User, Calendar, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Activity, FileText, ArrowLeft,
  BarChart3, ClipboardList, Heart, Download, Trash2
} from "lucide-react";
import { Link } from "wouter";
import { PatientTrendCharts } from "@/components/patient-trend-charts";
import { generateTrendInsights, generateClinicalSnapshot, type TrendInsight } from "@/lib/clinical-trend-insights";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generateMalePatientWellnessPDF, type MaleWellnessPlan } from "@/lib/patient-pdf-export-male";
import { generatePatientWellnessPDF } from "@/lib/patient-pdf-export";
import { labsApi, femaleLabsApi, type WellnessPlan } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Patient, LabResult, InterpretationResult, LabValues, FemaleLabValues } from "@shared/schema";

function PatientSearch({ onSelect }: { onSelect: (patient: Patient) => void }) {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: allPatients = [], isLoading: loadingAll } = useQuery<Patient[]>({
    queryKey: ['/api/patients/search', ''],
    queryFn: async () => {
      const res = await fetch('/api/patients/search');
      if (!res.ok) throw new Error('Failed to load patients');
      return res.json();
    },
  });

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery<Patient[]>({
    queryKey: ['/api/patients/search', searchTerm],
    queryFn: async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(searchTerm)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: searchTerm.length >= 2,
  });

  const displayPatients = searchTerm.length >= 2 ? searchResults : allPatients;
  const isLoading = searchTerm.length >= 2 ? loadingSearch : loadingAll;
  const showResults = searchTerm.length >= 2 || allPatients.length > 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search patients by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="input-patient-profile-search"
        />
      </div>
      {showResults && (
        <div className="space-y-1">
          {isLoading && <p className="text-sm text-muted-foreground px-2">Loading...</p>}
          {!isLoading && displayPatients.length === 0 && searchTerm.length >= 2 && (
            <p className="text-sm text-muted-foreground px-2">No patients found matching "{searchTerm}"</p>
          )}
          {!isLoading && displayPatients.length === 0 && searchTerm.length < 2 && (
            <p className="text-sm text-muted-foreground px-2">No patient profiles yet. Save a lab interpretation to create one.</p>
          )}
          {displayPatients.map(patient => (
            <button
              key={patient.id}
              onClick={() => { onSelect(patient); setSearchTerm(""); }}
              className="w-full text-left p-3 rounded-md border hover-elevate flex items-center gap-3"
              data-testid={`button-select-patient-${patient.id}`}
            >
              <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">{patient.firstName} {patient.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  {patient.gender === 'male' ? "Men's Clinic" : "Women's Clinic"}
                  {patient.dateOfBirth && ` · DOB: ${new Date(patient.dateOfBirth).toLocaleDateString()}`}
                  {patient.mrn && ` · MRN: ${patient.mrn}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClinicalSnapshot({ labs, patient }: { labs: LabResult[]; patient: Patient }) {
  const insights = generateTrendInsights(labs);
  const snapshot = generateClinicalSnapshot(labs, `${patient.firstName} ${patient.lastName}`);

  if (insights.length === 0) {
    return (
      <Card data-testid="clinical-snapshot-empty">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Clinical Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {labs.length < 2
              ? "Need at least 2 lab results to generate a clinical snapshot comparing trends."
              : "No comparable markers found between the last two lab results."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const improvements = insights.filter(i => i.direction === 'improved');
  const concerns = insights.filter(i => i.direction === 'worsened');
  const urgents = insights.filter(i => i.severity === 'urgent');
  const stables = insights.filter(i => i.direction === 'stable');

  return (
    <Card data-testid="clinical-snapshot-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Clinical Snapshot
          <Badge variant="secondary" className="text-xs ml-auto">
            {insights.length} markers compared
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {urgents.length > 0 && (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 space-y-2" data-testid="snapshot-urgent">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Requires Attention</span>
            </div>
            {urgents.map(u => (
              <div key={u.markerKey} className="text-sm text-red-700 dark:text-red-300 pl-6">
                <p className="font-medium">{u.markerName}: {u.previousValue} {u.unit} → {u.currentValue} {u.unit}</p>
                <p>{u.clinicianInsight}</p>
                {u.recommendation && <p className="mt-1 text-xs italic">{u.recommendation}</p>}
              </div>
            ))}
          </div>
        )}

        {improvements.length > 0 && (
          <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 space-y-2" data-testid="snapshot-improvements">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                Improvements ({improvements.length})
              </span>
            </div>
            {improvements.map(i => (
              <div key={i.markerKey} className="text-sm text-green-700 dark:text-green-300 pl-6">
                <p className="font-medium">{i.markerName}: {i.previousValue} → {i.currentValue} {i.unit}</p>
                <p>{i.clinicianInsight}</p>
              </div>
            ))}
          </div>
        )}

        {concerns.filter(c => c.severity !== 'urgent').length > 0 && (
          <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2" data-testid="snapshot-concerns">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Areas to Monitor ({concerns.filter(c => c.severity !== 'urgent').length})
              </span>
            </div>
            {concerns.filter(c => c.severity !== 'urgent').map(c => (
              <div key={c.markerKey} className="text-sm text-amber-700 dark:text-amber-300 pl-6">
                <p className="font-medium">{c.markerName}: {c.previousValue} → {c.currentValue} {c.unit}</p>
                <p>{c.clinicianInsight}</p>
                {c.recommendation && <p className="mt-1 text-xs italic">{c.recommendation}</p>}
              </div>
            ))}
          </div>
        )}

        {stables.length > 0 && (
          <div className="rounded-md border p-3" data-testid="snapshot-stable">
            <div className="flex items-center gap-2 mb-1">
              <Minus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">
                Stable ({stables.length}): {stables.map(s => s.markerName).join(', ')}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LabHistoryList({ labs, onViewLab, onDeleteLab, deletingId }: { labs: LabResult[]; onViewLab: (lab: LabResult) => void; onDeleteLab: (lab: LabResult) => void; deletingId: number | null }) {
  return (
    <Card data-testid="lab-history-list">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Lab History
          <Badge variant="secondary" className="text-xs ml-auto">{labs.length} result{labs.length !== 1 ? 's' : ''}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {labs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lab results on file yet.</p>
        ) : (
          <div className="space-y-2">
            {labs.map((lab, idx) => {
              const interp = lab.interpretationResult as InterpretationResult | null;
              const redFlagCount = interp?.redFlags?.length || 0;
              const abnormalCount = interp?.interpretations?.filter(
                (i: any) => i.status === 'abnormal' || i.status === 'critical'
              ).length || 0;

              return (
                <div
                  key={lab.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border hover-elevate flex-wrap"
                  data-testid={`lab-history-item-${lab.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium">
                        {new Date(lab.labDate).toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric'
                        })}
                      </span>
                      {idx === 0 && <Badge variant="default" className="text-xs">Latest</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {redFlagCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {redFlagCount} Red Flag{redFlagCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {abnormalCount > 0 && !redFlagCount && (
                      <Badge variant="secondary" className="text-xs">
                        {abnormalCount} Abnormal
                      </Badge>
                    )}
                    {!redFlagCount && !abnormalCount && interp && (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Normal
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewLab(lab)}
                      data-testid={`button-view-lab-${lab.id}`}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      View Details
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); onDeleteLab(lab); }}
                      disabled={deletingId === lab.id}
                      data-testid={`button-delete-lab-${lab.id}`}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LabDetailModal({ lab, onClose, patient, allLabs, onDelete }: { lab: LabResult; onClose: () => void; patient: Patient; allLabs: LabResult[]; onDelete: () => void }) {
  const { toast } = useToast();
  const interp = lab.interpretationResult as InterpretationResult | null;
  const vals = lab.labValues as any;
  const patientName = `${patient.firstName} ${patient.lastName}`.trim();
  const isFemale = patient.gender === 'female';

  const wellnessPlanMutation = useMutation({
    mutationFn: async () => {
      if (!interp) throw new Error('No interpretation available');
      if (isFemale) {
        return femaleLabsApi.generateWellnessPlan(
          vals as FemaleLabValues,
          interp.interpretations,
          interp.supplements,
          interp.preventRisk
        );
      } else {
        return labsApi.generateWellnessPlan(
          vals as LabValues,
          interp.interpretations,
          interp.supplements,
          interp.preventRisk
        );
      }
    },
    onSuccess: async (wellnessPlan: WellnessPlan) => {
      if (interp) {
        const patientLabs = allLabs.length >= 2 ? allLabs : undefined;
        if (isFemale) {
          await generatePatientWellnessPDF(vals as FemaleLabValues, interp, wellnessPlan, patientName, patientLabs);
        } else {
          await generateMalePatientWellnessPDF(vals as LabValues, interp, wellnessPlan as MaleWellnessPlan, patientName, patientLabs);
        }
        toast({ title: "Patient Report Generated", description: "The personalized wellness report has been downloaded." });
      }
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: "Failed to generate patient report. Please try again." });
    },
  });

  const handleProviderPDF = () => {
    if (interp) {
      const clinicName = isFemale ? "Women's Hormone & Primary Care Clinic" : undefined;
      generateLabReportPDF(vals as LabValues, interp, patientName, clinicName);
      toast({ title: "Provider Report Generated", description: "The provider report has been downloaded." });
    }
  };

  const handlePatientReport = () => {
    if (interp) {
      wellnessPlanMutation.mutate();
    }
  };

  const markerOrder = [
    { label: 'Total Cholesterol', key: 'totalCholesterol', unit: 'mg/dL' },
    { label: 'LDL', key: 'ldl', unit: 'mg/dL' },
    { label: 'HDL', key: 'hdl', unit: 'mg/dL' },
    { label: 'Triglycerides', key: 'triglycerides', unit: 'mg/dL' },
    { label: 'ApoB', key: 'apoB', unit: 'mg/dL' },
    { label: 'A1c', key: 'a1c', unit: '%' },
    { label: 'Fasting Glucose', key: 'fastingGlucose', unit: 'mg/dL' },
    { label: 'Testosterone', key: 'testosterone', unit: 'ng/dL' },
    { label: 'Free Testosterone', key: 'freeTestosterone', unit: 'pg/mL' },
    { label: 'Estradiol', key: 'estradiol', unit: 'pg/mL' },
    { label: 'SHBG', key: 'shbg', unit: 'nmol/L' },
    { label: 'TSH', key: 'tsh', unit: 'mIU/L' },
    { label: 'Free T4', key: 'freeT4', unit: 'ng/dL' },
    { label: 'Free T3', key: 'freeT3', unit: 'pg/mL' },
    { label: 'hs-CRP', key: 'hsCRP', unit: 'mg/L' },
    { label: 'Hemoglobin', key: 'hemoglobin', unit: 'g/dL' },
    { label: 'Hematocrit', key: 'hematocrit', unit: '%' },
    { label: 'Vitamin D', key: 'vitaminD', unit: 'ng/mL' },
    { label: 'Ferritin', key: 'ferritin', unit: 'ng/mL' },
    { label: 'Vitamin B12', key: 'vitaminB12', unit: 'pg/mL' },
    { label: 'PSA', key: 'psa', unit: 'ng/mL' },
    { label: 'AST', key: 'ast', unit: 'U/L' },
    { label: 'ALT', key: 'alt', unit: 'U/L' },
    { label: 'eGFR', key: 'egfr', unit: 'mL/min' },
    { label: 'BUN', key: 'bun', unit: 'mg/dL' },
    { label: 'Creatinine', key: 'creatinine', unit: 'mg/dL' },
  ];

  const filledMarkers = markerOrder.filter(m => vals?.[m.key] != null && vals[m.key] !== '');

  const interpMap = new Map<string, any>();
  if (interp?.interpretations) {
    for (const item of interp.interpretations) {
      const key = (item as any).marker?.toLowerCase().replace(/[\s-]/g, '') ||
                  item.category?.toLowerCase().replace(/[\s-]/g, '');
      if (key) interpMap.set(key, item);
    }
  }

  function getStatus(markerKey: string): string | null {
    const normalizedKey = markerKey.toLowerCase();
    const entries = Array.from(interpMap.entries());
    for (const [k, v] of entries) {
      if (k.includes(normalizedKey) || normalizedKey.includes(k)) {
        return v.status;
      }
    }
    return null;
  }

  function statusColor(status: string | null) {
    switch (status) {
      case 'critical': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
      case 'abnormal': return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30';
      case 'borderline': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30';
      case 'normal': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30';
      default: return '';
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="lab-detail-modal">
      <Card className="w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4">
        <CardHeader className="pb-3 sticky top-0 bg-card z-10 border-b">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg">
              Lab Results - {new Date(lab.labDate).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
              })}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {interp && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handlePatientReport}
                    disabled={wellnessPlanMutation.isPending}
                    data-testid="button-patient-report-modal"
                  >
                    <Heart className="w-4 h-4 mr-1" />
                    {wellnessPlanMutation.isPending ? 'Generating...' : 'Patient Report'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleProviderPDF}
                    data-testid="button-provider-pdf-modal"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Provider PDF
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="text-muted-foreground"
                data-testid="button-delete-lab-modal"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
              <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-lab-detail">
                Close
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {interp?.redFlags && interp.redFlags.length > 0 && (
            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Red Flags
              </p>
              {interp.redFlags.map((rf: any, i: number) => (
                <p key={i} className="text-sm text-red-600 dark:text-red-300">
                  {rf.marker}: {rf.message}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {filledMarkers.map(m => {
              const status = getStatus(m.key);
              return (
                <div
                  key={m.key}
                  className={`flex items-center justify-between p-2 rounded-md border text-sm ${statusColor(status)}`}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="font-mono">{vals[m.key]} {m.unit}</span>
                </div>
              );
            })}
          </div>

          {interp?.aiRecommendations && (
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm font-semibold flex items-center gap-1">
                <Heart className="h-4 w-4 text-blue-600 dark:text-blue-400" /> AI Recommendations
              </p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{interp.aiRecommendations}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EnrichedTrendInsights({ insights }: { insights: TrendInsight[] }) {
  if (insights.length === 0) return null;

  const grouped = {
    urgent: insights.filter(i => i.severity === 'urgent'),
    concern: insights.filter(i => i.severity === 'concern'),
    positive: insights.filter(i => i.severity === 'positive'),
    neutral: insights.filter(i => i.severity === 'neutral'),
  };

  return (
    <Card data-testid="enriched-trend-insights">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Detailed Trend Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {grouped.urgent.map(i => (
          <div key={i.markerKey} className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <span className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {i.markerName}
              </span>
              <span className="text-xs font-mono text-red-600 dark:text-red-300">
                {i.previousValue} → {i.currentValue} {i.unit} ({i.changePercent > 0 ? '+' : ''}{i.changePercent.toFixed(1)}%)
              </span>
            </div>
            <p className="text-sm text-red-700 dark:text-red-300">{i.clinicianInsight}</p>
            {i.recommendation && (
              <p className="text-xs mt-1 italic text-red-600 dark:text-red-400">{i.recommendation}</p>
            )}
          </div>
        ))}
        {grouped.concern.map(i => (
          <div key={i.markerKey} className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{i.markerName}</span>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-300">
                {i.previousValue} → {i.currentValue} {i.unit} ({i.changePercent > 0 ? '+' : ''}{i.changePercent.toFixed(1)}%)
              </span>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300">{i.clinicianInsight}</p>
            {i.recommendation && (
              <p className="text-xs mt-1 italic text-amber-600 dark:text-amber-400">{i.recommendation}</p>
            )}
          </div>
        ))}
        {grouped.positive.map(i => (
          <div key={i.markerKey} className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <span className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {i.markerName}
              </span>
              <span className="text-xs font-mono text-green-600 dark:text-green-300">
                {i.previousValue} → {i.currentValue} {i.unit} ({i.changePercent > 0 ? '+' : ''}{i.changePercent.toFixed(1)}%)
              </span>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300">{i.clinicianInsight}</p>
          </div>
        ))}
        {grouped.neutral.length > 0 && (
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium text-muted-foreground mb-2">Stable Markers</p>
            <div className="grid grid-cols-2 gap-2">
              {grouped.neutral.map(i => (
                <div key={i.markerKey} className="text-sm text-muted-foreground">
                  <span className="font-medium">{i.markerName}:</span> {i.currentValue} {i.unit}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PatientProfiles() {
  const { toast } = useToast();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [viewingLab, setViewingLab] = useState<LabResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LabResult | null>(null);

  const { data: labs = [], isLoading: labsLoading } = useQuery<LabResult[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'labs'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/labs`);
      if (!res.ok) throw new Error('Failed to fetch labs');
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const deleteMutation = useMutation({
    mutationFn: async (labId: number) => {
      const res = await fetch(`/api/lab-results/${labId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      if (selectedPatient) {
        queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient.id, 'labs'] });
      }
      if (viewingLab && confirmDelete && viewingLab.id === confirmDelete.id) {
        setViewingLab(null);
      }
      setConfirmDelete(null);
      toast({ title: "Lab Result Deleted", description: "The lab result has been removed from this patient's history." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete lab result. Please try again." });
    },
  });

  const handleDeleteLab = (lab: LabResult) => {
    setConfirmDelete(lab);
  };

  const insights = labs.length >= 2 ? generateTrendInsights(labs) : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back-to-labs">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Labs
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Patient Profiles</h1>
          </div>
          {selectedPatient && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{selectedPatient.firstName} {selectedPatient.lastName}</span>
              <Badge variant="secondary" className="text-xs">
                {selectedPatient.gender === 'male' ? "Men's Clinic" : "Women's Clinic"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSelectedPatient(null); setViewingLab(null); }}
                data-testid="button-change-patient"
              >
                Change
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {!selectedPatient ? (
          <div className="max-w-lg mx-auto space-y-6">
            <div className="text-center space-y-2">
              <User className="h-12 w-12 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">Select a Patient</h2>
              <p className="text-sm text-muted-foreground">
                Search for a patient to view their clinical profile, lab history, and trend analysis.
              </p>
            </div>
            <PatientSearch onSelect={setSelectedPatient} />
          </div>
        ) : labsLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading patient data...</div>
        ) : (
          <div className="space-y-6">
            <ClinicalSnapshot labs={labs} patient={selectedPatient} />

            <LabHistoryList labs={labs} onViewLab={setViewingLab} onDeleteLab={handleDeleteLab} deletingId={deleteMutation.isPending && confirmDelete ? confirmDelete.id : null} />

            {labs.length >= 2 && (
              <PatientTrendCharts
                labs={labs}
                patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
              />
            )}

            {insights.length > 0 && (
              <EnrichedTrendInsights insights={insights} />
            )}
          </div>
        )}
      </div>

      {viewingLab && selectedPatient && (
        <LabDetailModal
          lab={viewingLab}
          onClose={() => setViewingLab(null)}
          patient={selectedPatient}
          allLabs={labs}
          onDelete={() => handleDeleteLab(viewingLab)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" data-testid="delete-confirm-modal">
          <Card className="w-full max-w-md m-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Delete Lab Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete the lab result from{' '}
                <span className="font-medium text-foreground">
                  {new Date(confirmDelete.labDate).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric'
                  })}
                </span>
                ? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-cancel-delete"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(confirmDelete.id)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-confirm-delete"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
