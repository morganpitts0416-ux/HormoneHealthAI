import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search, User, Calendar, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Activity, FileText, ArrowLeft,
  BarChart3, ClipboardList, Heart, Download, Trash2, Users,
  Mail, Globe, Send, Share2, Leaf, MessageSquare
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { PatientTrendCharts } from "@/components/patient-trend-charts";
import { generateTrendInsights, generateClinicalSnapshot, type TrendInsight } from "@/lib/clinical-trend-insights";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generateMalePatientWellnessPDF, type MaleWellnessPlan } from "@/lib/patient-pdf-export-male";
import { generatePatientWellnessPDF } from "@/lib/patient-pdf-export";
import { labsApi, femaleLabsApi, type WellnessPlan } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { Patient, LabResult, InterpretationResult, LabValues, FemaleLabValues } from "@shared/schema";

function ClinicalSnapshot({ labs, patient }: { labs: LabResult[]; patient: Patient }) {
  const insights = generateTrendInsights(labs);
  const snapshot = generateClinicalSnapshot(labs, `${patient.firstName} ${patient.lastName}`);

  if (insights.length === 0) {
    return (
      <Card data-testid="clinical-snapshot-empty">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary dark:text-primary" />
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
          <Activity className="h-5 w-5 text-primary dark:text-primary" />
          Clinical Snapshot
          <Badge variant="secondary" className="text-xs ml-auto">
            {insights.length} markers compared
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {urgents.length > 0 && (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 space-y-2" data-testid="snapshot-urgent" >
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

function LabHistoryList({ labs, onViewLab, onDeleteLab, deletingId, onPublishLab, hasPortalAccount, publishingId }: {
  labs: LabResult[];
  onViewLab: (lab: LabResult) => void;
  onDeleteLab: (lab: LabResult) => void;
  deletingId: number | null;
  onPublishLab?: (lab: LabResult) => void;
  hasPortalAccount?: boolean;
  publishingId?: number | null;
}) {
  return (
    <Card data-testid="lab-history-list">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary dark:text-primary" />
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
                    {hasPortalAccount && onPublishLab && (interp?.supplements?.length ?? 0) > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onPublishLab(lab); }}
                        disabled={publishingId === lab.id}
                        data-testid={`button-publish-protocol-${lab.id}`}
                        className="text-xs gap-1.5"
                        style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                      >
                        <Leaf className="h-3 w-3" />
                        {publishingId === lab.id ? "Publishing…" : "Publish to Portal"}
                      </Button>
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
  const { user } = useAuth();
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
          await generatePatientWellnessPDF(vals as FemaleLabValues, interp, wellnessPlan, patientName, patientLabs, undefined, user?.clinicName);
        } else {
          await generateMalePatientWellnessPDF(vals as LabValues, interp, wellnessPlan as MaleWellnessPlan, patientName, patientLabs, undefined, user?.clinicName);
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
      const historyForPdf = allLabs.length >= 2 ? allLabs : undefined;
      generateLabReportPDF(vals as LabValues, interp, patientName, user?.clinicName, historyForPdf);
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
                <Heart className="h-4 w-4 text-primary dark:text-primary" /> AI Recommendations
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
          <TrendingUp className="h-5 w-5 text-primary dark:text-primary" />
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

function PatientAvatar({ patient, size = "md" }: { patient: Patient; size?: "sm" | "md" }) {
  const initials = `${patient.firstName[0] ?? ''}${patient.lastName[0] ?? ''}`.toUpperCase();
  const isMale = patient.gender === 'male';
  const sizeClasses = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={cn(
      "rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0",
      isMale ? "bg-blue-600" : "bg-rose-500",
      sizeClasses
    )}>
      {initials}
    </div>
  );
}

export default function PatientProfiles() {
  const { toast } = useToast();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [viewingLab, setViewingLab] = useState<LabResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LabResult | null>(null);
  const [confirmDeletePatient, setConfirmDeletePatient] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [publishingLabId, setPublishingLabId] = useState<number | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [showMessages, setShowMessages] = useState(false);
  const messageBottomRef = useRef<HTMLDivElement>(null);

  const { data: allPatients = [], isLoading: patientsLoading } = useQuery<Patient[]>({
    queryKey: ['/api/patients/search', ''],
    queryFn: async () => {
      const res = await fetch('/api/patients/search', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load patients');
      return res.json();
    },
  });

  const { data: labs = [], isLoading: labsLoading } = useQuery<LabResult[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'labs'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/labs`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch labs');
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: portalStatus } = useQuery<{
    hasPortalAccount: boolean;
    hasPassword: boolean;
    email: string | null;
    lastProtocolPublished: string | null;
  }>({
    queryKey: ['/api/portal/status', selectedPatient?.id],
    queryFn: async () => {
      const res = await fetch(`/api/portal/status/${selectedPatient!.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch portal status');
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const { user } = useAuth();
  const messagingPreference = (user as any)?.messagingPreference;
  const messagingEnabled = messagingPreference === 'in_app' || messagingPreference === 'external_api';

  interface PortalMessage {
    id: number;
    patientId: number;
    clinicianId: number;
    senderType: 'patient' | 'clinician';
    content: string;
    readAt: string | null;
    createdAt: string;
  }

  const { data: messages = [] } = useQuery<PortalMessage[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'messages'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/messages`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient && messagingEnabled && showMessages,
    refetchInterval: showMessages ? 15000 : false,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/patients', selectedPatient?.id, 'messages', 'unread'],
    queryFn: async () => {
      if (!selectedPatient) return { count: 0 };
      const res = await fetch(`/api/patients/${selectedPatient.id}/messages/unread`, { credentials: 'include' });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!selectedPatient && messagingEnabled,
    refetchInterval: 30000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/patients/${selectedPatient!.id}/messages`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'messages'] });
      setMessageDraft("");
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (showMessages) {
      messageBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showMessages]);

  const inviteMutation = useMutation({
    mutationFn: async ({ patientId, email }: { patientId: number; email: string }) => {
      const res = await apiRequest("POST", `/api/portal/invite/${patientId}`, { email });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal/status', selectedPatient?.id] });
      setShowInviteModal(false);
      setInviteEmail("");
      toast({ title: "Invitation sent", description: "The patient will receive an email with a link to set up their portal account." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send invitation", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const publishProtocolMutation = useMutation({
    mutationFn: async ({ lab }: { lab: LabResult }) => {
      const interp = lab.interpretationResult as any;
      const supplements = interp?.supplements || [];
      const res = await apiRequest("POST", "/api/protocols/publish", {
        patientId: lab.patientId,
        labResultId: lab.id,
        supplements,
        labDate: lab.labDate,
      });
      return res;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal/status', selectedPatient?.id] });
      setPublishingLabId(null);
      toast({
        title: "Protocol published",
        description: `${((variables.lab.interpretationResult as any)?.supplements?.length || 0)} supplements are now visible to the patient in their portal.`,
      });
    },
    onError: (error: any) => {
      setPublishingLabId(null);
      toast({ title: "Failed to publish protocol", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const handlePublishLab = (lab: LabResult) => {
    setPublishingLabId(lab.id);
    publishProtocolMutation.mutate({ lab });
  };

  const filteredPatients = useMemo(() => {
    let list = allPatients;
    if (genderFilter !== "all") list = list.filter(p => p.gender === genderFilter);
    if (searchTerm.trim().length > 0) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        (p.mrn ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allPatients, genderFilter, searchTerm]);

  const alphabeticalGroups = useMemo(() => {
    const sorted = [...filteredPatients].sort((a, b) =>
      a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
    );
    const groups: { letter: string; patients: Patient[] }[] = [];
    for (const patient of sorted) {
      const letter = (patient.lastName[0] ?? '#').toUpperCase();
      const existing = groups.find(g => g.letter === letter);
      if (existing) { existing.patients.push(patient); }
      else { groups.push({ letter, patients: [patient] }); }
    }
    return groups;
  }, [filteredPatients]);

  const deleteMutation = useMutation({
    mutationFn: async (labId: number) => {
      const res = await fetch(`/api/lab-results/${labId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      if (selectedPatient) {
        queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient.id, 'labs'] });
      }
      if (viewingLab && confirmDelete && viewingLab.id === confirmDelete.id) setViewingLab(null);
      setConfirmDelete(null);
      toast({ title: "Lab Result Deleted", description: "The lab result has been removed from this patient's history." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete lab result. Please try again." });
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: async (patientId: number) => {
      const res = await fetch(`/api/patients/${patientId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete patient');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients/search', ''] });
      setSelectedPatient(null);
      setConfirmDeletePatient(false);
      setViewingLab(null);
      toast({ title: "Patient Deleted", description: "The patient profile and all associated lab data have been permanently removed." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete patient. Please try again." });
    },
  });

  const handleDeleteLab = (lab: LabResult) => setConfirmDelete(lab);
  const insights = labs.length >= 2 ? generateTrendInsights(labs) : [];
  const maleCount = allPatients.filter(p => p.gender === 'male').length;
  const femaleCount = allPatients.filter(p => p.gender === 'female').length;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-50 border-b" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
        <div className="px-3 sm:px-4 h-16 flex items-center gap-2 sm:gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-labs" style={{ color: "#2e3a20" }} title="Dashboard">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Dashboard</span>
            </Button>
          </Link>
          <div className="h-4 w-px" style={{ backgroundColor: "#c4b9a5" }} />
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="h-12 sm:h-14 w-auto flex-shrink-0"
            style={{ mixBlendMode: "multiply" }}
          />
          <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: "#c4b9a5" }} />
          <div className="hidden sm:flex items-center gap-2">
            <h1 className="text-sm font-semibold" style={{ color: "#1c2414" }}>Patient Profiles</h1>
            {!patientsLoading && (
              <Badge variant="secondary" className="text-xs">
                {allPatients.length} patient{allPatients.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Split panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel: patient list */}
        <div className="w-72 border-r flex flex-col flex-shrink-0 bg-background">
          {/* Search + filter controls */}
          <div className="p-3 border-b space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name or MRN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8 text-sm"
                data-testid="input-patient-profile-search"
              />
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={genderFilter === "all" ? "default" : "ghost"}
                className="flex-1 text-xs h-7"
                onClick={() => setGenderFilter("all")}
                data-testid="filter-all-patients"
              >
                All ({allPatients.length})
              </Button>
              <Button
                size="sm"
                variant={genderFilter === "male" ? "default" : "ghost"}
                className="flex-1 text-xs h-7"
                onClick={() => setGenderFilter("male")}
                data-testid="filter-male-patients"
              >
                Men ({maleCount})
              </Button>
              <Button
                size="sm"
                variant={genderFilter === "female" ? "default" : "ghost"}
                className="flex-1 text-xs h-7"
                onClick={() => setGenderFilter("female")}
                data-testid="filter-female-patients"
              >
                Women ({femaleCount})
              </Button>
            </div>
          </div>

          {/* Patient list */}
          <div className="flex-1 overflow-y-auto">
            {patientsLoading && (
              <p className="text-xs text-muted-foreground p-4">Loading patients...</p>
            )}
            {!patientsLoading && allPatients.length === 0 && (
              <div className="p-6 text-center space-y-3">
                <User className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No patients yet. Save a lab interpretation to create a patient profile.
                </p>
              </div>
            )}
            {!patientsLoading && allPatients.length > 0 && filteredPatients.length === 0 && (
              <p className="text-xs text-muted-foreground p-4 text-center">No patients match your search.</p>
            )}
            {alphabeticalGroups.map(group => (
              <div key={group.letter}>
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 sticky top-0 z-10">
                  {group.letter}
                </div>
                {group.patients.map(patient => {
                  const isSelected = selectedPatient?.id === patient.id;
                  return (
                    <button
                      key={patient.id}
                      onClick={() => { setSelectedPatient(patient); setViewingLab(null); setShowMessages(false); setMessageDraft(""); }}
                      className={cn(
                        "w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 border-r-2 border-primary"
                          : "hover:bg-muted/50"
                      )}
                      data-testid={`button-select-patient-${patient.id}`}
                    >
                      <PatientAvatar patient={patient} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {patient.gender === 'male' ? "Men's" : "Women's"}
                          {patient.mrn ? ` · MRN: ${patient.mrn}` : ''}
                          {patient.dateOfBirth
                            ? ` · ${new Date(patient.dateOfBirth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                            : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: patient detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedPatient ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
              <div className="rounded-full bg-muted p-4">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-base font-semibold">Select a Patient</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Choose a patient from the list on the left to view their clinical profile, lab history, and trend analysis.
              </p>
            </div>
          ) : labsLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Loading patient data...
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Patient header */}
              <div className="flex items-start gap-4 pb-2">
                <PatientAvatar patient={selectedPatient} size="md" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold">
                    {selectedPatient.firstName} {selectedPatient.lastName}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <Badge variant="secondary" className="text-xs">
                      {selectedPatient.gender === 'male' ? "Men's Clinic" : "Women's Clinic"}
                    </Badge>
                    {selectedPatient.mrn && (
                      <span className="text-xs text-muted-foreground">MRN: {selectedPatient.mrn}</span>
                    )}
                    {selectedPatient.dateOfBirth && (
                      <span className="text-xs text-muted-foreground">
                        DOB: {new Date(selectedPatient.dateOfBirth).toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric'
                        })}
                      </span>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {labs.length} lab result{labs.length !== 1 ? 's' : ''}
                    </Badge>
                    {portalStatus?.hasPortalAccount && (
                      <Badge className="text-xs gap-1" style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "1px solid #c4d4a8" }}>
                        <Leaf className="w-2.5 h-2.5" />
                        Portal Active
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInviteEmail(portalStatus?.email || (selectedPatient as any).email || "");
                      setShowInviteModal(true);
                    }}
                    data-testid="button-invite-to-portal"
                    className="text-xs gap-1.5"
                    style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                  >
                    <Mail className="h-3 w-3" />
                    {portalStatus?.hasPortalAccount ? "Resend Invite" : "Invite to Portal"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDeletePatient(true)}
                    data-testid="button-delete-patient"
                    className="text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Patient
                  </Button>
                </div>
              </div>

              <ClinicalSnapshot labs={labs} patient={selectedPatient} />
              <LabHistoryList
                labs={labs}
                onViewLab={setViewingLab}
                onDeleteLab={handleDeleteLab}
                deletingId={deleteMutation.isPending && confirmDelete ? confirmDelete.id : null}
                onPublishLab={handlePublishLab}
                hasPortalAccount={portalStatus?.hasPortalAccount}
                publishingId={publishingLabId}
              />
              {labs.length >= 2 && (
                <PatientTrendCharts
                  labs={labs}
                  patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                  patientId={selectedPatient.id}
                  gender={selectedPatient.gender === 'female' ? 'female' : 'male'}
                />
              )}
              {insights.length > 0 && <EnrichedTrendInsights insights={insights} />}

              {/* Messaging panel — only visible when clinician has in-app messaging enabled */}
              {messagingEnabled && portalStatus?.hasPortalAccount && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        Portal Messages
                        {(unreadData?.count ?? 0) > 0 && !showMessages && (
                          <Badge className="text-xs" style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}>
                            {unreadData!.count} new
                          </Badge>
                        )}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMessages(!showMessages)}
                        className="text-xs"
                        data-testid="button-toggle-messages"
                      >
                        {showMessages ? "Hide" : "View messages"}
                      </Button>
                    </div>
                  </CardHeader>
                  {showMessages && (
                    <CardContent className="space-y-4">
                      {/* Thread */}
                      <div className="space-y-3 max-h-72 overflow-y-auto px-1">
                        {messages.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            No messages yet. Send the first message to this patient.
                          </p>
                        ) : (
                          messages.map((msg) => {
                            const isClinician = msg.senderType === 'clinician';
                            return (
                              <div key={msg.id} className={`flex ${isClinician ? "justify-end" : "justify-start"}`}>
                                <div
                                  className={cn(
                                    "max-w-xs rounded-xl px-3 py-2 text-sm",
                                    isClinician
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-foreground"
                                  )}
                                >
                                  {!isClinician && (
                                    <p className="text-xs font-medium text-muted-foreground mb-1">
                                      {selectedPatient!.firstName}
                                    </p>
                                  )}
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                  <p className={cn("text-xs mt-1", isClinician ? "text-primary-foreground/60" : "text-muted-foreground")}>
                                    {new Date(msg.createdAt).toLocaleString("en-US", {
                                      month: "short", day: "numeric",
                                      hour: "numeric", minute: "2-digit"
                                    })}
                                    {!isClinician && !msg.readAt && (
                                      <span className="ml-2 text-amber-600 font-medium">Unread</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={messageBottomRef} />
                      </div>

                      {/* Compose */}
                      <div className="flex items-end gap-2 border-t pt-3">
                        <textarea
                          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[36px] max-h-24 outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Write a message to this patient…"
                          rows={1}
                          value={messageDraft}
                          onChange={(e) => setMessageDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (messageDraft.trim()) sendMessageMutation.mutate(messageDraft.trim());
                            }
                          }}
                          data-testid="input-clinician-message"
                        />
                        <Button
                          size="icon"
                          onClick={() => { if (messageDraft.trim()) sendMessageMutation.mutate(messageDraft.trim()); }}
                          disabled={!messageDraft.trim() || sendMessageMutation.isPending}
                          data-testid="button-clinician-send-message"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Press Enter to send · Shift+Enter for new line</p>
                    </CardContent>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
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

      {/* Invite to Portal Modal */}
      {showInviteModal && selectedPatient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" data-testid="invite-portal-modal">
          <Card className="w-full max-w-md m-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Leaf className="h-5 w-5" style={{ color: "#2e3a20" }} />
                Invite to Patient Portal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Send <strong>{selectedPatient.firstName} {selectedPatient.lastName}</strong> an invitation to their private health portal where they can view their lab results, wellness protocol, and health journey.
              </p>
              {portalStatus?.hasPortalAccount && (
                <div className="rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}>
                  This patient already has a portal account. Sending a new invite will let them reset access.
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="invite-email" className="text-sm">Patient email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="patient@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowInviteModal(false); setInviteEmail(""); }}
                  disabled={inviteMutation.isPending}
                  data-testid="button-cancel-invite"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => inviteMutation.mutate({ patientId: selectedPatient.id, email: inviteEmail })}
                  disabled={inviteMutation.isPending || !inviteEmail}
                  data-testid="button-send-invite"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {inviteMutation.isPending ? "Sending…" : "Send Invitation"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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

      {/* Delete Patient confirmation dialog */}
      {confirmDeletePatient && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete Patient Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to permanently delete{' '}
                <span className="font-semibold text-foreground">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </span>
                ? This will remove all their lab results, portal access, messages, and clinical data. This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDeletePatient(false)}
                  disabled={deletePatientMutation.isPending}
                  data-testid="button-cancel-delete-patient"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deletePatientMutation.mutate(selectedPatient.id)}
                  disabled={deletePatientMutation.isPending}
                  data-testid="button-confirm-delete-patient"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {deletePatientMutation.isPending ? 'Deleting...' : 'Delete Patient'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
