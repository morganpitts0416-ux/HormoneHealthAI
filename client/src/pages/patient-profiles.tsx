import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { usePatientContext } from "@/hooks/use-patient-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { utcDateStr } from "@/lib/date-utils";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, User, Calendar, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Activity, FileText, ArrowLeft,
  BarChart3, ClipboardList, Heart, Download, Trash2, Users,
  Mail, Globe, Send, Share2, Leaf, MessageSquare, Copy, ExternalLink, RefreshCw,
  Loader2, Sparkles, ShoppingBag, CheckCircle, XCircle, Stethoscope, ChevronRight, Plus,
  ChevronLeft, Pill, Shield, Scissors, X, Pencil, Lock, ChevronDown, FileDown, Check, BookOpen, PenLine, ArrowRightLeft,
  Link2, Clock, Building2, Eye, EyeOff, CalendarDays, Phone, Paperclip,
  LayoutDashboard, FolderOpen, FlaskConical, Home, Archive, Save, Zap, ListChecks,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { PatientTrendCharts } from "@/components/patient-trend-charts";
import { generateTrendInsights, generateClinicalSnapshot, type TrendInsight } from "@/lib/clinical-trend-insights";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generateMalePatientWellnessPDF, type MaleWellnessPlan } from "@/lib/patient-pdf-export-male";
import { generatePatientWellnessPDF } from "@/lib/patient-pdf-export";
import { exportSoapPdf, nurseBlocksToText } from "@/lib/soap-pdf-export";
import { useClinicBrandingPartial, useClinicBranding } from "@/hooks/use-clinic-branding";
import { labsApi, femaleLabsApi, type WellnessPlan } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { Patient, LabResult, InterpretationResult, LabValues, FemaleLabValues, ClinicalEncounter, PatientChart, PatientChartDraft, Appointment, SimpleLabUpload, ProviderOverrides, SupplementRecommendation, ClinicianSupplement, PatientVital } from "@shared/schema";
import { ResultsDisplay } from "@/components/results-display";
import { LabComparisonDialog } from "@/components/lab-comparison-dialog";
import {
  PreventAssessmentCard,
  PreventNotCalculatedCard,
  AdvancedLipidsCard,
  StopBangCard,
  InsulinResistanceCard,
  FemaleHormonePatternCard,
  FemaleHormoneAssessmentCard,
  MaleHormoneAssessmentCard,
} from "@/components/lab-assessment-cards";
import { PatientSummary } from "@/components/patient-summary";
import PatientDocumentsCard from "@/components/patient-documents-card";
import { SOAPNote } from "@/components/soap-note";
import { RedFlagAlert } from "@/components/red-flag-alert";
import { SoapNoteViewer } from "@/components/soap-note-viewer";
import { ManualSoapBuilder } from "@/components/manual-soap-builder";
import { NurseNoteBuilder } from "@/components/nurse-note-builder";
import { PhoneNoteDialog } from "@/components/phone-note-dialog";
import { FormSubmissionPreviewDialog } from "@/components/form-submission-preview";
import { VitalsDialog } from "@/components/vitals-dialog";
import { VitalTrendsDialog } from "@/components/vital-trends-dialog";
import { PreventCalculatorPanel } from "@/components/prevent-calculator-dialog";
import { usePhraseSearch } from "@/components/phrase-search";
import { EncounterEditor, EncounterErrorBoundary, type EncounterWithPatient } from "@/pages/encounters";
import { PharmacyLookup, pharmacyValueFromRecord, pharmacyValueToPatch, type PharmacyLookupValue } from "@/components/pharmacy-lookup";
import { PharmacyDisplay } from "@/components/pharmacy-display";
import { PatientOrdersTab } from "@/components/clinical-orders-panel";

// ── Safe date display utility ─────────────────────────────────────────────────
// Dates from the DB are stored as UTC midnight. Using { timeZone: 'UTC' } prevents
// the off-by-one-day rendering bug in US timezones. Also guards against epoch dates.
function AmendTextarea({ value, onChange, encounterId }: { value: string; onChange: (v: string) => void; encounterId: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const phrase = usePhraseSearch({ textareaRef: ref, value, onChange });
  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); phrase.handleInput(e); }}
        onKeyDown={phrase.handleKeyDown}
        className="text-xs font-sans min-h-[16rem] resize-y"
        data-testid={`textarea-amend-${encounterId}`}
        placeholder="Edit the note… (type /phrase to insert a saved snippet)"
      />
      {phrase.dropdown}
    </div>
  );
}

function safeDate(dateStr: string | Date, opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }) {
  const d = new Date(dateStr as string);
  if (isNaN(d.getTime()) || d.getFullYear() < 1910) return "Unknown date";
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}

function ClinicalSnapshot({ labs, patient }: { labs: LabResult[]; patient: Patient }) {
  const [collapsed, setCollapsed] = useState(false);
  const insights = generateTrendInsights(labs, patient.gender as 'male' | 'female');
  const snapshot = generateClinicalSnapshot(labs, `${patient.firstName} ${patient.lastName}`, patient.gender as 'male' | 'female');

  if (insights.length === 0) {
    return (
      <Card data-testid="clinical-snapshot-empty">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary dark:text-primary" />
              Clinical Snapshot
            </CardTitle>
            <button onClick={() => setCollapsed(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-toggle-snapshot">
              <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
            </button>
          </div>
        </CardHeader>
        {!collapsed && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {labs.length < 2
                ? "Need at least 2 lab results to generate a clinical snapshot comparing trends."
                : "No comparable markers found between the last two lab results."}
            </p>
          </CardContent>
        )}
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
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary dark:text-primary" />
            Clinical Snapshot
            <Badge variant="secondary" className="text-xs">
              {insights.length} markers
            </Badge>
            {urgents.length > 0 && (
              <Badge className="text-xs bg-red-100 text-red-700 border-red-200 border">
                {urgents.length} urgent
              </Badge>
            )}
          </CardTitle>
          <button onClick={() => setCollapsed(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-toggle-snapshot">
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          </button>
        </div>
      </CardHeader>
      {!collapsed && <CardContent className="space-y-4">
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
      </CardContent>}
    </Card>
  );
}

// Maps common free-text lab names (used in Quick Uploads) to the structured keys
// used by PatientTrendCharts and generateTrendInsights.
const SIMPLE_LAB_KEY_MAP: Record<string, string> = {
  'LDL': 'ldl',
  'HDL': 'hdl',
  'Triglycerides': 'triglycerides',
  'Total Cholesterol': 'totalCholesterol',
  'ApoB': 'apoB',
  'HbA1c': 'a1c', 'A1c': 'a1c',
  'Fasting Glucose': 'fastingGlucose',
  'Fasting Insulin': 'fastingInsulin',
  'Testosterone Total': 'testosterone',
  'Testosterone Free': 'freeTestosterone',
  'Free Testosterone': 'freeTestosterone',
  'Estradiol': 'estradiol',
  'SHBG': 'shbg',
  'LH': 'lh', 'FSH': 'fsh',
  'DHEA-S': 'dheas', 'DHEA': 'dheas',
  'Prolactin': 'prolactin',
  'TSH': 'tsh',
  'Free T4': 'freeT4',
  'Free T3': 'freeT3',
  'Reverse T3': 'reverseT3',
  'hs-CRP': 'hsCRP', 'CRP': 'hsCRP',
  'PSA': 'psa',
  'Hemoglobin': 'hemoglobin',
  'Hematocrit': 'hematocrit',
  'Vitamin D (25-OH)': 'vitaminD', 'Vitamin D': 'vitaminD',
  'Ferritin': 'ferritin',
  'Vitamin B12': 'vitaminB12',
  'Homocysteine': 'homocysteine',
  'IGF-1': 'igf1',
  'Cortisol (AM)': 'cortisol', 'Cortisol': 'cortisol',
};

// Convert quick lab uploads into synthetic LabResult-shaped objects so they
// can be fed into PatientTrendCharts and generateTrendInsights.
function simpleLabsToSynthetic(uploads: SimpleLabUpload[]): LabResult[] {
  return uploads.map(u => {
    const labValues: Record<string, string> = {};
    for (const e of (u.entries as Array<{ name: string; value: string; unit: string }>) ) {
      const key = SIMPLE_LAB_KEY_MAP[e.name];
      if (key && e.value) labValues[key] = e.value;
    }
    return {
      id: -(u.id),
      patientId: u.patientId,
      labDate: u.labDate,
      labValues,
      interpretationResult: null,
      notes: u.notes ?? null,
    } as unknown as LabResult;
  });
}

type CombinedLabItem =
  | { kind: 'full'; lab: LabResult; sortMs: number }
  | { kind: 'quick'; upload: SimpleLabUpload; sortMs: number };

function LabHistoryList({ labs, simpleUploads = [], onViewLab, onDeleteLab, deletingId, onDeleteSimpleUpload, deletingSimpleUploadId, onPublishLab, hasPortalAccount, publishingId, publishedLabResultIds, patientName = "" }: {
  labs: LabResult[];
  simpleUploads?: SimpleLabUpload[];
  onViewLab: (lab: LabResult) => void;
  onDeleteLab: (lab: LabResult) => void;
  deletingId: number | null;
  onDeleteSimpleUpload?: (id: number) => void;
  deletingSimpleUploadId?: number | null;
  onPublishLab?: (lab: LabResult) => void;
  hasPortalAccount?: boolean;
  publishingId?: number | null;
  publishedLabResultIds?: number[];
  patientName?: string;
}) {
  const [showComparison, setShowComparison] = useState(false);
  const combined: CombinedLabItem[] = [
    ...labs.map(lab => ({ kind: 'full' as const, lab, sortMs: new Date(lab.labDate).getTime() })),
    ...simpleUploads.map(u => ({ kind: 'quick' as const, upload: u, sortMs: new Date(u.labDate).getTime() })),
  ].sort((a, b) => b.sortMs - a.sortMs);

  const totalCount = combined.length;

  return (
    <Card data-testid="lab-history-list">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
          <ClipboardList className="h-5 w-5 text-primary dark:text-primary" />
          Lab History
          <Badge variant="secondary" className="text-xs">{totalCount} record{totalCount !== 1 ? 's' : ''}</Badge>
          {totalCount >= 2 && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-xs gap-1.5"
              onClick={() => setShowComparison(true)}
              data-testid="button-lab-comparison-view"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Comparison View
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <p className="text-sm text-muted-foreground">No lab results on file yet.</p>
        ) : (
          <div className="space-y-2">
            {combined.map((item, idx) => {
              if (item.kind === 'full') {
                const lab = item.lab;
                const interp = lab.interpretationResult as InterpretationResult | null;
                const redFlagCount = interp?.redFlags?.length || 0;
                const abnormalCount = interp?.interpretations?.filter(
                  (i: any) => i.status === 'abnormal' || i.status === 'critical'
                ).length || 0;
                return (
                  <div
                    key={`full-${lab.id}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-md border hover-elevate flex-wrap"
                    data-testid={`lab-history-item-${lab.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium">{safeDate(lab.labDate)}</span>
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
                        <Badge variant="secondary" className="text-xs">{abnormalCount} Abnormal</Badge>
                      )}
                      {!redFlagCount && !abnormalCount && interp && (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />Normal
                        </Badge>
                      )}
                      {hasPortalAccount && onPublishLab && (() => {
                        const alreadyPublished = publishedLabResultIds?.includes(lab.id) ?? false;
                        return alreadyPublished ? (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className="text-xs gap-1 no-default-active-elevate"
                              style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "1px solid #c4d9b0" }}
                              data-testid={`badge-published-${lab.id}`}
                            >
                              <CheckCircle2 className="h-3 w-3" />Published
                            </Badge>
                            <Button
                              variant="outline" size="sm"
                              onClick={(e) => { e.stopPropagation(); onPublishLab(lab); }}
                              disabled={publishingId === lab.id}
                              data-testid={`button-republish-protocol-${lab.id}`}
                              className="text-xs gap-1.5 text-amber-700 border-amber-300"
                            >
                              <RefreshCw className="h-3 w-3" />
                              {publishingId === lab.id ? "Publishing…" : "Re-publish"}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline" size="sm"
                            onClick={(e) => { e.stopPropagation(); onPublishLab(lab); }}
                            disabled={publishingId === lab.id}
                            data-testid={`button-publish-protocol-${lab.id}`}
                            className="text-xs gap-1.5"
                            style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                          >
                            <Leaf className="h-3 w-3" />
                            {publishingId === lab.id ? "Publishing…" : "Publish to Portal"}
                          </Button>
                        );
                      })()}
                      <Button variant="outline" size="sm" onClick={() => onViewLab(lab)} data-testid={`button-view-lab-${lab.id}`}>
                        <FileText className="h-3.5 w-3.5 mr-1" />View Details
                      </Button>
                      <Button
                        variant="outline" size="icon"
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
              }

              // Quick upload row
              const upload = item.upload;
              const entries = upload.entries as Array<{ name: string; value: string; unit: string; referenceRange?: string }>;
              const valueSummary = entries.map(e => `${e.name}: ${e.value}${e.unit ? ' ' + e.unit : ''}`).join(' · ');
              return (
                <div
                  key={`quick-${upload.id}`}
                  className="p-3 rounded-md border space-y-1.5"
                  data-testid={`lab-history-item-quick-${upload.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium">{safeDate(upload.labDate)}</span>
                      {idx === 0 && <Badge variant="default" className="text-xs">Latest</Badge>}
                      <Badge variant="outline" className="text-xs">Quick Upload</Badge>
                    </div>
                    <Button
                      variant="outline" size="icon"
                      onClick={() => onDeleteSimpleUpload?.(upload.id)}
                      disabled={deletingSimpleUploadId === upload.id}
                      data-testid={`button-delete-simple-lab-${upload.id}`}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">{valueSummary}</p>
                  {upload.aiInsight && (
                    <div className="flex gap-1.5 pt-1 border-t">
                      <Sparkles className="h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{upload.aiInsight}</p>
                    </div>
                  )}
                  {upload.notes && (
                    <p className="text-xs text-muted-foreground italic">{upload.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <LabComparisonDialog
        open={showComparison}
        onClose={() => setShowComparison(false)}
        labs={labs}
        simpleUploads={simpleUploads}
        patientName={patientName}
      />
    </Card>
  );
}

function LabDetailModal({ lab, onClose, patient, allLabs, onDelete }: { lab: LabResult; onClose: () => void; patient: Patient; allLabs: LabResult[]; onDelete: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const clinicBranding = useClinicBrandingPartial();
  const { data: clinicBrandingFull } = useClinicBranding();
  const interp = lab.interpretationResult as InterpretationResult | null;
  const vals = lab.labValues as any;
  const patientName = `${patient.firstName} ${patient.lastName}`.trim();
  const isFemale = patient.gender === 'female';

  // ── Provider override state ───────────────────────────────────────────────
  const [overrides, setOverrides] = useState<ProviderOverrides>(() =>
    (lab.providerOverrides as ProviderOverrides) || {}
  );
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAddSuppDialog, setShowAddSuppDialog] = useState(false);

  const { data: suppLibrary = [] } = useQuery<ClinicianSupplement[]>({
    queryKey: ['/api/clinician/supplements'],
  });

  const saveOverridesMutation = useMutation({
    mutationFn: async (data: ProviderOverrides) => {
      const res = await apiRequest("PATCH", `/api/patients/${patient.id}/labs/${lab.id}/provider-overrides`, data);
      return res.json();
    },
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patient.id, 'labs'] });
    },
    onError: () => setSaveStatus('unsaved'),
  });

  const updateOverrides = useCallback((updater: (prev: ProviderOverrides) => ProviderOverrides) => {
    setOverrides(prev => {
      const next = updater(prev);
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        saveOverridesMutation.mutate(next);
      }, 900);
      return next;
    });
  }, []);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // Helpers
  const isSectionHidden = (key: string) => (overrides.hiddenSections || []).includes(key);
  const isSuppHidden = (name: string) => (overrides.hiddenSupplementNames || []).includes(name);

  const toggle = <K extends keyof ProviderOverrides>(field: K, val: string) => {
    updateOverrides(prev => {
      const arr: string[] = (prev[field] as string[] | undefined) || [];
      return { ...prev, [field]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] };
    });
  };

  const effectiveSupplements = useMemo((): SupplementRecommendation[] => {
    const autoSupps: SupplementRecommendation[] = interp?.supplements || [];
    return [
      ...autoSupps.filter(s => !isSuppHidden(s.name)),
      ...(overrides.addedSupplements || []),
    ];
  }, [interp?.supplements, overrides.hiddenSupplementNames, overrides.addedSupplements]);

  const hiddenCount = useMemo(() => [
    overrides.hiddenSections,
    overrides.hiddenInterpretationCategories,
    overrides.hiddenPhenotypeNames,
    overrides.hiddenPatternNames,
    overrides.hiddenHormonePatternCategories,
    overrides.hiddenSupplementNames,
  ].reduce((acc, arr) => acc + (arr?.length || 0), 0), [overrides]);

  // Section-level visibility wrapper
  function HideableSection({ sectionKey, children }: { sectionKey: string; children: React.ReactNode }) {
    const hidden = isSectionHidden(sectionKey);
    return (
      <div className="space-y-1">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => toggle('hiddenSections', sectionKey)}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border transition-colors select-none",
              hidden
                ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400"
                : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{hidden ? "Hidden from patient" : "Visible to patient"}</span>
          </button>
        </div>
        <div className={cn("rounded-lg transition-all", hidden && "opacity-60 ring-1 ring-amber-300 dark:ring-amber-700")}>
          {children}
        </div>
      </div>
    );
  }

  // ── Patient Report PDF (respects overrides) ───────────────────────────────
  const wellnessPlanMutation = useMutation({
    mutationFn: async () => {
      if (!interp) throw new Error('No interpretation available');
      if (isFemale) {
        return femaleLabsApi.generateWellnessPlan(vals as FemaleLabValues, interp.interpretations, interp.supplements, interp.preventRisk);
      } else {
        return labsApi.generateWellnessPlan(vals as LabValues, interp.interpretations, interp.supplements, interp.preventRisk);
      }
    },
    onSuccess: async (wellnessPlan: WellnessPlan) => {
      if (interp) {
        const patientLabs = allLabs.length >= 2 ? allLabs : undefined;
        const pdfSupps = effectiveSupplements.map(s => ({ name: s.name, dose: s.dose, indication: s.indication }));
        const clinicLogo = clinicBrandingFull?.clinicLogo ?? null;
        const footerText = clinicBrandingFull?.footerText ?? null;
        const hiddenSections = overrides.hiddenSections || [];
        const hiddenInterpCats = overrides.hiddenInterpretationCategories || [];
        if (isFemale) {
          // hiddenInterpCats covers both regular lab rows and hormone-pattern rows —
          // the PDF splits them internally using isHormonePatternRowPdf().
          await generatePatientWellnessPDF(vals as FemaleLabValues, interp, wellnessPlan, patientName, patientLabs, pdfSupps, user?.clinicName, clinicBranding, clinicLogo, hiddenSections, hiddenInterpCats, hiddenInterpCats, footerText);
        } else {
          await generateMalePatientWellnessPDF(vals as LabValues, interp, wellnessPlan as MaleWellnessPlan, patientName, patientLabs, pdfSupps, user?.clinicName, clinicBranding, clinicLogo, hiddenSections, hiddenInterpCats, footerText);
        }
        toast({ title: "Patient Report Generated", description: "The personalized wellness report has been downloaded." });
      }
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to generate patient report. Please try again." });
    },
  });

  const handleProviderPDF = () => {
    if (interp) {
      const historyForPdf = allLabs.length >= 2 ? allLabs : undefined;
      generateLabReportPDF(vals as LabValues, interp, patientName, user?.clinicName, historyForPdf, clinicBranding, clinicBrandingFull?.clinicLogo ?? null);
      toast({ title: "Provider Report Generated", description: "The provider report has been downloaded." });
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800';
      case 'medium': return 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800';
      default: return 'bg-muted/40 border-muted';
    }
  };

  const priorityBadge = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const summaryText = typeof overrides.patientSummaryDraft === 'string'
    ? overrides.patientSummaryDraft
    : (interp?.patientSummary || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="lab-detail-modal">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col m-4 rounded-lg border bg-card shadow-xl overflow-hidden">
        {/* Sticky header */}
        <div className="flex-shrink-0 px-5 py-3 border-b bg-card flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold">Full Evaluation — {safeDate(lab.labDate)}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground">{patientName}{user?.clinicName ? ` · ${user.clinicName}` : ''}</p>
              {hiddenCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400">
                  <EyeOff className="w-2.5 h-2.5" />
                  {hiddenCount} hidden from patient
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Saving...
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {interp && (
              <>
                <Button variant="default" size="sm" onClick={() => wellnessPlanMutation.mutate()} disabled={wellnessPlanMutation.isPending} data-testid="button-patient-report-modal">
                  <Heart className="w-3.5 h-3.5 mr-1" />
                  {wellnessPlanMutation.isPending ? 'Generating...' : 'Patient Report'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleProviderPDF} data-testid="button-provider-pdf-modal">
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Provider PDF
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={onDelete} className="text-muted-foreground" data-testid="button-delete-lab-modal">
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-lab-detail">Close</Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {!interp ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              No interpretation data saved for this lab result.
            </div>
          ) : (
            <div className="p-5 space-y-6">
              {/* Red Flags — never hidden */}
              {interp.redFlags && interp.redFlags.length > 0 && (
                <RedFlagAlert redFlags={interp.redFlags} />
              )}

              {/* Full Lab Results — section + row-level toggles */}
              <HideableSection sectionKey="labResults">
                <ResultsDisplay
                  interpretations={interp.interpretations || []}
                  aiRecommendations={interp.aiRecommendations || ''}
                  recheckWindow={interp.recheckWindow || ''}
                  redFlags={interp.redFlags || []}
                  hiddenCategories={overrides.hiddenInterpretationCategories || []}
                  onToggleCategory={(cat) => toggle('hiddenInterpretationCategories', cat)}
                />
              </HideableSection>

              {/* PREVENT Cardiovascular Risk */}
              <HideableSection sectionKey="preventRisk">
                {interp.preventRisk ? (
                  <PreventAssessmentCard preventAssessment={interp.preventRisk} />
                ) : (
                  <PreventNotCalculatedCard missingFields={(interp as any).preventMissingFields || []} />
                )}
              </HideableSection>

              {/* Advanced Lipid */}
              {interp.adjustedRisk && (
                <HideableSection sectionKey="adjustedRisk">
                  <AdvancedLipidsCard adjustedRiskAssessment={interp.adjustedRisk} />
                </HideableSection>
              )}

              {/* STOP-BANG */}
              {interp.stopBangRisk && (
                <HideableSection sectionKey="stopBang">
                  <StopBangCard stopBangRisk={interp.stopBangRisk} />
                </HideableSection>
              )}

              {/* Insulin Resistance */}
              {interp.insulinResistance && interp.insulinResistance.likelihood !== 'none' && (
                <HideableSection sectionKey="insulinResistance">
                  <InsulinResistanceCard insulinResistance={interp.insulinResistance} />
                </HideableSection>
              )}

              {/* Female Hormone Pattern Assessment — section + row toggles */}
              {interp.interpretations && (
                <HideableSection sectionKey="hormonePatterns">
                  <FemaleHormonePatternCard
                    interpretations={interp.interpretations}
                    hiddenCategories={overrides.hiddenHormonePatternCategories || []}
                    onToggleCategory={(cat) => toggle('hiddenHormonePatternCategories', cat)}
                  />
                </HideableSection>
              )}

              {/* Clinical Phenotype Assessment — section + item toggles */}
              {interp.clinicalPhenotypes && interp.clinicalPhenotypes.length > 0 && (
                <HideableSection sectionKey="clinicalPhenotypes">
                  <FemaleHormoneAssessmentCard
                    phenotypes={interp.clinicalPhenotypes}
                    hiddenPhenotypeNames={overrides.hiddenPhenotypeNames || []}
                    onTogglePhenotype={(name) => toggle('hiddenPhenotypeNames', name)}
                  />
                </HideableSection>
              )}

              {/* Male Hormone Patterns — section + item toggles */}
              {interp.maleHormonePatterns && interp.maleHormonePatterns.length > 0 && (
                <HideableSection sectionKey="maleHormonePatterns">
                  <MaleHormoneAssessmentCard
                    patterns={interp.maleHormonePatterns}
                    hiddenPatternNames={overrides.hiddenPatternNames || []}
                    onTogglePattern={(name) => toggle('hiddenPatternNames', name)}
                  />
                </HideableSection>
              )}

              {/* Supplement Protocol — per-item toggle + add from library */}
              {interp.supplements !== undefined && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-primary" />
                        Supplement Protocol
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <span>{effectiveSupplements.length} shown to patient</span>
                        {(overrides.hiddenSupplementNames?.length || 0) > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            · {overrides.hiddenSupplementNames!.length} hidden
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(interp.supplements || []).map((supp, idx) => {
                        const hidden = isSuppHidden(supp.name);
                        return (
                          <div key={idx} className={cn(
                            `p-3 rounded-md border flex items-start gap-3 ${priorityColor(supp.priority)}`,
                            hidden && "opacity-50"
                          )}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className={cn("text-sm font-semibold", hidden && "line-through text-muted-foreground")}>{supp.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${priorityBadge(supp.priority)}`}>{supp.priority} priority</span>
                                {hidden && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Hidden</span>}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono">{supp.dose}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{supp.indication}</p>
                              {supp.rationale && !hidden && <p className="text-xs text-muted-foreground mt-0.5 italic">{supp.rationale}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggle('hiddenSupplementNames', supp.name)}
                              title={hidden ? "Show to patient" : "Hide from patient"}
                              className={cn("flex-shrink-0 p-1 rounded transition-colors mt-0.5", hidden ? "text-amber-600 hover:text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground")}
                            >
                              {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        );
                      })}

                      {(overrides.addedSupplements || []).map((supp, idx) => (
                        <div key={`added-${idx}`} className={`p-3 rounded-md border flex items-start gap-3 ${priorityColor(supp.priority)}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-sm font-semibold">{supp.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${priorityBadge(supp.priority)}`}>{supp.priority} priority</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">Added</span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{supp.dose}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{supp.indication}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateOverrides(prev => ({ ...prev, addedSupplements: (prev.addedSupplements || []).filter((_, i) => i !== idx) }))}
                            title="Remove"
                            className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      <Button variant="outline" size="sm" onClick={() => setShowAddSuppDialog(true)} className="w-full mt-1" data-testid="button-add-supplement-from-library">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add supplement from library
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Patient Communication Summary */}
              <PatientSummary
                summary={summaryText}
                labValues={vals}
                onSummaryChange={(val) => updateOverrides(prev => ({ ...prev, patientSummaryDraft: val }))}
                saveStatus={saveStatus}
              />

              {/* SOAP Note */}
              {interp.soapNote && <SOAPNote soapNote={interp.soapNote} />}
            </div>
          )}
        </div>
      </div>

      {/* Add Supplement from Library Dialog */}
      {showAddSuppDialog && (
        <Dialog open onOpenChange={() => setShowAddSuppDialog(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Supplement from Library</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto py-1 pr-1">
              {suppLibrary.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No custom supplements in your library yet. Add supplements in Settings → Supplement Library.
                </p>
              ) : (
                suppLibrary.filter(s => s.isActive).map((s) => {
                  const alreadyAdded = (overrides.addedSupplements || []).some(a => a.name === s.name);
                  return (
                    <div key={s.id} className="flex items-start gap-3 p-3 rounded-md border hover-elevate">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold">{s.name}</span>
                          {s.brand && <span className="text-xs text-muted-foreground">{s.brand}</span>}
                          {alreadyAdded && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">Added</span>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{s.dose}</p>
                        {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant={alreadyAdded ? "outline" : "default"}
                        disabled={alreadyAdded}
                        onClick={() => {
                          if (alreadyAdded) return;
                          const newSupp: SupplementRecommendation = {
                            name: s.name,
                            dose: s.dose,
                            indication: s.description || s.name,
                            rationale: s.clinicalRationale || '',
                            priority: 'medium',
                            category: (s.category as SupplementRecommendation['category']) || 'general',
                            patientExplanation: s.description || '',
                          };
                          updateOverrides(prev => ({ ...prev, addedSupplements: [...(prev.addedSupplements || []), newSupp] }));
                        }}
                      >
                        {alreadyAdded ? 'Added' : 'Add'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowAddSuppDialog(false)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
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

// ── Patient Chart ─────────────────────────────────────────────────────────────

const CHART_SECTIONS_META = [
  { key: "currentMedications" as const, label: "Current Medications", icon: Pill },
  { key: "medicalHistory" as const, label: "Medical History", icon: FileText },
  { key: "familyHistory" as const, label: "Family History", icon: Users },
  { key: "socialHistory" as const, label: "Social History", icon: Activity },
  { key: "allergies" as const, label: "Allergies & Sensitivities", icon: Shield },
  { key: "surgicalHistory" as const, label: "Surgical History", icon: Scissors },
];

type ChartSectionKey = "currentMedications" | "medicalHistory" | "familyHistory" | "socialHistory" | "allergies" | "surgicalHistory";

function PatientChartPanel({
  patientId,
  chart,
  encounters,
  onSaved,
  accordionMode = false,
}: {
  patientId: number;
  chart: PatientChart | null;
  encounters: ClinicalEncounter[];
  onSaved: () => void;
  accordionMode?: boolean;
}) {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>("");
  const [extracting, setExtracting] = useState(false);
  const [openSections, setOpenSections] = useState<Set<ChartSectionKey>>(
    new Set(["currentMedications", "allergies"] as ChartSectionKey[])
  );

  const toList = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

  const [local, setLocal] = useState<Record<ChartSectionKey, string[]>>({
    currentMedications: toList(chart?.currentMedications),
    medicalHistory: toList(chart?.medicalHistory),
    familyHistory: toList(chart?.familyHistory),
    socialHistory: toList(chart?.socialHistory),
    allergies: toList(chart?.allergies),
    surgicalHistory: toList(chart?.surgicalHistory),
  });

  const [addInputs, setAddInputs] = useState<Record<ChartSectionKey, string>>({
    currentMedications: "", medicalHistory: "", familyHistory: "",
    socialHistory: "", allergies: "", surgicalHistory: "",
  });

  const draft = (chart?.draftExtraction as PatientChartDraft | null | undefined) ?? null;

  const [draftChecked, setDraftChecked] = useState<Record<ChartSectionKey, Record<number, boolean>>>({
    currentMedications: {}, medicalHistory: {}, familyHistory: {},
    socialHistory: {}, allergies: {}, surgicalHistory: {},
  });

  useEffect(() => {
    setLocal({
      currentMedications: toList(chart?.currentMedications),
      medicalHistory: toList(chart?.medicalHistory),
      familyHistory: toList(chart?.familyHistory),
      socialHistory: toList(chart?.socialHistory),
      allergies: toList(chart?.allergies),
      surgicalHistory: toList(chart?.surgicalHistory),
    });
  }, [chart]);

  useEffect(() => {
    if (!draft) return;
    const checked: Record<ChartSectionKey, Record<number, boolean>> = {
      currentMedications: {}, medicalHistory: {}, familyHistory: {},
      socialHistory: {}, allergies: {}, surgicalHistory: {},
    };
    for (const sec of CHART_SECTIONS_META) {
      const items = (draft[sec.key] ?? []) as string[];
      items.forEach((_: string, i: number) => { checked[sec.key][i] = true; });
    }
    setDraftChecked(checked);
  }, [draft]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Record<ChartSectionKey, string[] | null>> & { draftExtraction?: null; lastReviewedAt?: string }) => {
      const res = await apiRequest("PUT", `/api/patients/${patientId}/chart`, data);
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      setEditMode(false);
      onSaved();
      toast({ title: "Chart saved" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to save chart" }),
  });

  const handleSaveEdit = () => saveMutation.mutate({ ...local });

  const handleExtract = async () => {
    if (!selectedEncounterId) return;
    setExtracting(true);
    try {
      const res = await apiRequest("POST", `/api/patients/${patientId}/chart/extract`, {
        encounterId: parseInt(selectedEncounterId),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Extraction failed");
      }
      const data = await res.json();
      onSaved();
      setExtractOpen(false);
      setReviewOpen(true);
      toast({
        title: "AI extraction complete",
        description: `Extracted from ${data.draft?.visitType ?? "encounter"} — review and approve below.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ variant: "destructive", title: "Extraction failed", description: msg });
    } finally {
      setExtracting(false);
    }
  };

  const handleApproveDraft = () => {
    if (!draft) return;
    const merged: Record<ChartSectionKey, string[]> = { ...local };
    for (const sec of CHART_SECTIONS_META) {
      const draftItems = (draft[sec.key] ?? []) as string[];
      const approvedItems = draftItems.filter((_: string, i: number) => draftChecked[sec.key][i] !== false);
      const combined = [...local[sec.key]];
      for (const item of approvedItems) {
        if (!combined.map((x: string) => x.toLowerCase()).includes(item.toLowerCase())) {
          combined.push(item);
        }
      }
      merged[sec.key] = combined;
    }
    saveMutation.mutate({ ...merged, draftExtraction: null, lastReviewedAt: new Date().toISOString() });
    setReviewOpen(false);
  };

  const addItem = (key: ChartSectionKey) => {
    const val = addInputs[key].trim();
    if (!val) return;
    setLocal(prev => ({ ...prev, [key]: [...prev[key], val] }));
    setAddInputs(prev => ({ ...prev, [key]: "" }));
  };

  const removeItem = (key: ChartSectionKey, idx: number) => {
    setLocal(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  };

  const hasAnyData = CHART_SECTIONS_META.some(s => (local[s.key]?.length ?? 0) > 0);

  const toggleSection = (key: ChartSectionKey) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <>
      {accordionMode ? (
        <div className="flex flex-col h-full">
          {/* Compact accordion header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b flex-wrap gap-2 flex-shrink-0" style={{ borderColor: "#e8ddd0", backgroundColor: "#fdfaf7" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
              <span className="text-xs font-semibold" style={{ color: "#1c2414" }}>Patient Chart</span>
              {chart?.lastReviewedAt && (
                <span className="text-[10px] text-muted-foreground">
                  · Reviewed {new Date(chart.lastReviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                style={{ color: "#5a7040" }}
                title="Extract chart data from encounter"
                onClick={() => {
                  if (encounters.length === 0) {
                    toast({ title: "No encounters", description: "This patient has no clinical encounters yet." });
                    return;
                  }
                  setSelectedEncounterId(String(encounters[0].id));
                  setExtractOpen(true);
                }}
                data-testid="button-chart-extract-accordion"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </Button>
              {!editMode ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => setEditMode(true)}
                  title="Edit chart"
                  data-testid="button-chart-edit-accordion"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs h-7 px-2"
                    style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                    onClick={handleSaveEdit}
                    disabled={saveMutation.isPending}
                    data-testid="button-chart-save-accordion"
                  >
                    {saveMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Save"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Draft banner */}
          {draft && !reviewOpen && (
            <div className="px-3 py-2 flex items-center justify-between gap-2 flex-wrap border-b flex-shrink-0" style={{ backgroundColor: "#f0f5ea", borderColor: "#c8dbb8" }}>
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3 h-3 flex-shrink-0" style={{ color: "#5a7040" }} />
                <span className="text-xs truncate" style={{ color: "#3d5228" }}>AI draft ready</span>
              </div>
              <Button
                size="sm"
                className="text-xs h-6 px-2 shrink-0"
                style={{ backgroundColor: "#5a7040", color: "#fff", border: "none" }}
                onClick={() => setReviewOpen(true)}
                data-testid="button-chart-review-draft-accordion"
              >
                Review
              </Button>
            </div>
          )}

          {/* Accordion sections */}
          <div className="divide-y overflow-y-auto flex-1" style={{ borderColor: "#ede8e0" }}>
            {CHART_SECTIONS_META.map(({ key, label, icon: Icon }) => {
              const items = local[key];
              const isOpen = openSections.has(key);
              const isAllergies = key === "allergies";
              return (
                <div key={key}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover-elevate"
                    onClick={() => toggleSection(key)}
                    data-testid={`chart-section-toggle-${key}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isAllergies ? "#b91c1c" : "#5a7040" }} />
                      <span className="text-xs font-medium truncate" style={{ color: "#1c2414" }}>{label}</span>
                      {items.length > 0 && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">({items.length})</span>
                      )}
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((item: string, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: isAllergies ? "#fde8e8" : "#edf2e6",
                              color: isAllergies ? "#c0392b" : "#2e3a20",
                              border: `1px solid ${isAllergies ? "#f5c6c6" : "#c4d4a8"}`,
                            }}
                          >
                            {item}
                            {editMode && (
                              <button
                                onClick={() => removeItem(key, idx)}
                                className="ml-0.5 opacity-50 hover:opacity-100"
                                aria-label="Remove"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        ))}
                        {items.length === 0 && !editMode && (
                          <span className="text-xs text-muted-foreground italic">None recorded</span>
                        )}
                        {editMode && (
                          <div className="flex items-center gap-1 w-full mt-1.5">
                            <Input
                              className="h-6 text-xs flex-1"
                              placeholder={`Add ${label.toLowerCase()}…`}
                              value={addInputs[key]}
                              onChange={e => setAddInputs(prev => ({ ...prev, [key]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(key); } }}
                              data-testid={`input-chart-add-${key}`}
                            />
                            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => addItem(key)}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border" style={{ borderColor: "#d4c9b5", backgroundColor: "#fdfaf7" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b flex-wrap gap-2" style={{ borderColor: "#e8ddd0" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-4 h-4 flex-shrink-0" style={{ color: "#5a7040" }} />
              <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Patient Chart</span>
            {chart?.lastReviewedAt && (
              <span className="text-xs text-muted-foreground">
                · Reviewed {new Date(chart.lastReviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              style={{ color: "#5a7040", borderColor: "#c4d4a8" }}
              onClick={() => {
                if (encounters.length === 0) {
                  toast({ title: "No encounters", description: "This patient has no clinical encounters yet." });
                  return;
                }
                setSelectedEncounterId(String(encounters[0].id));
                setExtractOpen(true);
              }}
              data-testid="button-chart-extract"
            >
              <Sparkles className="w-3 h-3" />
              Extract from Encounter
            </Button>
            {!editMode ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs gap-1.5"
                onClick={() => setEditMode(true)}
                data-testid="button-chart-edit"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="text-xs gap-1"
                  style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                  onClick={handleSaveEdit}
                  disabled={saveMutation.isPending}
                  data-testid="button-chart-save"
                >
                  {saveMutation.isPending ? <><RefreshCw className="w-3 h-3 animate-spin" />Saving…</> : "Save Chart"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Draft pending banner */}
        {draft && !reviewOpen && (
          <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
            style={{ backgroundColor: "#f0f5ea", borderBottom: "1px solid #c8dbb8" }}>
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
              <span className="text-xs truncate" style={{ color: "#3d5228" }}>
                AI draft from <strong>{draft.visitType}</strong> on {draft.encounterDate} — awaiting your review
              </span>
            </div>
            <Button
              size="sm"
              className="text-xs shrink-0"
              style={{ backgroundColor: "#5a7040", color: "#fff", border: "none" }}
              onClick={() => setReviewOpen(true)}
              data-testid="button-chart-review-draft"
            >
              Review Draft
            </Button>
          </div>
        )}

        {/* Sections grid */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          {CHART_SECTIONS_META.map(({ key, label, icon: Icon }) => {
            const items = local[key];
            const isAllergies = key === "allergies";
            return (
              <div key={key}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "#5a7040" }}>
                  <Icon className="w-3 h-3" />
                  {label}
                  <span className="font-normal normal-case tracking-normal text-muted-foreground ml-0.5">({items.length})</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item: string, idx: number) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: isAllergies ? "#fde8e8" : "#edf2e6",
                        color: isAllergies ? "#c0392b" : "#2e3a20",
                        border: `1px solid ${isAllergies ? "#f5c6c6" : "#c4d4a8"}`,
                      }}
                    >
                      {item}
                      {editMode && (
                        <button
                          onClick={() => removeItem(key, idx)}
                          className="ml-0.5 opacity-50 hover:opacity-100"
                          aria-label="Remove"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {items.length === 0 && !editMode && (
                    <span className="text-xs text-muted-foreground italic">None recorded</span>
                  )}
                  {editMode && (
                    <div className="flex items-center gap-1 w-full mt-1">
                      <Input
                        className="h-6 text-xs flex-1"
                        placeholder={`Add ${label.toLowerCase()}…`}
                        value={addInputs[key]}
                        onChange={e => setAddInputs(prev => ({ ...prev, [key]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(key); } }}
                        data-testid={`input-chart-add-${key}`}
                      />
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => addItem(key)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!hasAnyData && !editMode && (
          <div className="px-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground">
              No chart data yet. Use "Extract from Encounter" to populate automatically, or click Edit to enter manually.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Extract Dialog */}
      <Dialog open={extractOpen} onOpenChange={setExtractOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extract Chart Data from Encounter</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select a clinical encounter. ClinIQ will analyze the transcript and SOAP note to extract medications, diagnoses, family history, social history, allergies, and surgical history. You'll review and approve each item before it's saved.
          </p>
          <div className="space-y-2 mt-2">
            <Label className="text-sm">Encounter</Label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={selectedEncounterId}
              onChange={e => setSelectedEncounterId(e.target.value)}
              data-testid="select-extract-encounter"
            >
              {encounters.map(enc => (
                <option key={enc.id} value={String(enc.id)}>
                  {new Date(enc.visitDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {" — "}{enc.visitType}
                  {(enc as any).chiefComplaint ? ` (${(enc as any).chiefComplaint})` : ""}
                  {!enc.transcription && !(enc as any).soapNote ? " [no transcript]" : ""}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setExtractOpen(false)}>Cancel</Button>
            <Button
              style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
              onClick={handleExtract}
              disabled={extracting || !selectedEncounterId}
              data-testid="button-extract-confirm"
            >
              {extracting
                ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Extracting…</>
                : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Extract & Draft</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Draft Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review AI-Extracted Chart Data</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Check the items you'd like to add to the patient chart. Items already in the chart are shown as already recorded.
          </p>
          {draft && (
            <div className="space-y-5">
              {CHART_SECTIONS_META.map(({ key, label, icon: Icon }) => {
                const items = (draft[key] ?? []) as string[];
                return (
                  <div key={key}>
                    <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: "#5a7040" }}>
                      <Icon className="w-3 h-3" />{label}
                      <span className="font-normal normal-case tracking-normal text-muted-foreground">({items.length} extracted)</span>
                    </p>
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">None extracted</p>
                    ) : (
                      <div className="space-y-1.5">
                        {items.map((item: string, idx: number) => {
                          const alreadyInChart = local[key].map((x: string) => x.toLowerCase()).includes(item.toLowerCase());
                          const isChecked = draftChecked[key][idx] !== false;
                          return (
                            <label
                              key={idx}
                              className={cn(
                                "flex items-start gap-2.5 rounded-md px-3 py-2 cursor-pointer",
                                alreadyInChart ? "opacity-50 cursor-default" : "hover:bg-muted/40"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked && !alreadyInChart}
                                disabled={alreadyInChart}
                                onChange={e => setDraftChecked(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], [idx]: e.target.checked },
                                }))}
                                className="mt-0.5 flex-shrink-0"
                              />
                              <span className="text-sm">{item}</span>
                              {alreadyInChart && (
                                <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">already in chart</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter className="mt-6 gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              variant="outline"
              onClick={async () => {
                await apiRequest("PUT", `/api/patients/${patientId}/chart`, { draftExtraction: null });
                onSaved();
                setReviewOpen(false);
                toast({ title: "Draft discarded" });
              }}
            >
              Discard Draft
            </Button>
            <Button
              style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
              onClick={handleApproveDraft}
              disabled={saveMutation.isPending}
              data-testid="button-approve-draft"
            >
              {saveMutation.isPending
                ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                : "Approve & Save to Chart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Patient context rail (right panel) ──────────────────────────────────────
type ContextRailTab = "labs" | "vitals";

// ── helpers ────────────────────────────────────────────────────────────────
const RAIL_NAME_W = 86;   // px — sticky label column
const RAIL_VAL_W  = 50;   // px — each date-value column

function railStatusColor(status: string): string {
  if (status === "normal")   return "#15803d";
  if (status === "borderline") return "#b45309";
  if (status === "abnormal" || status === "critical") return "#b91c1c";
  return "#1c2414";
}

function RailRow({
  label,
  cells,
  rowIndex,
  colCount,
}: {
  label: string;
  cells: React.ReactNode[];
  rowIndex: number;
  colCount: number;
}) {
  const evenBg  = "#ffffff";
  const oddBg   = "#faf8f5";
  const bg      = rowIndex % 2 === 0 ? evenBg : oddBg;
  const totalW  = RAIL_NAME_W + RAIL_VAL_W * colCount;
  return (
    <div className="flex items-center" style={{ minWidth: totalW, backgroundColor: bg }}>
      <div
        className="shrink-0 px-2 py-1 text-[10px] text-muted-foreground overflow-hidden"
        style={{
          width: RAIL_NAME_W,
          backgroundColor: bg,
          position: "sticky",
          left: 0,
          zIndex: 2,
          borderRight: "1px solid #e8ddd0",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
        title={label}
      >
        {label}
      </div>
      {cells.map((cell, ci) => (
        <div
          key={ci}
          className="shrink-0 text-right px-1 py-1 text-[10px] tabular-nums font-medium"
          style={{ width: RAIL_VAL_W }}
        >
          {cell}
        </div>
      ))}
    </div>
  );
}

function RailHeaderRow({
  cols,
  colCount,
  onClickCol,
  headerLabel = "Biomarker",
}: {
  cols: { label: string; clickable?: boolean; colIndex: number; src?: "clinic" | "patient_logged" }[];
  colCount: number;
  onClickCol?: (i: number) => void;
  headerLabel?: string;
}) {
  const totalW = RAIL_NAME_W + RAIL_VAL_W * colCount;
  return (
    <div
      className="flex items-center"
      style={{
        minWidth: totalW,
        backgroundColor: "#f5f2ed",
        borderBottom: "1px solid #e8ddd0",
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      <div
        className="shrink-0 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground"
        style={{
          width: RAIL_NAME_W,
          position: "sticky",
          left: 0,
          zIndex: 2,
          backgroundColor: "#f5f2ed",
          borderRight: "1px solid #e8ddd0",
        }}
      >
        {headerLabel}
      </div>
      {cols.map(({ label, clickable, colIndex, src }) => (
        <div
          key={colIndex}
          className="shrink-0 text-right px-1 py-1.5 text-[10px] font-semibold"
          style={{ width: RAIL_VAL_W, color: "#5a7040" }}
        >
          {clickable && onClickCol ? (
            <button
              className="hover:underline"
              onClick={() => onClickCol(colIndex)}
              data-testid={`context-rail-date-col-${colIndex}`}
            >
              {label}
            </button>
          ) : (
            <span className="flex flex-col items-end gap-0.5">
              {src === "patient_logged" && (
                <Home className="w-2.5 h-2.5 text-amber-500" title="Home reading" />
              )}
              {label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function PatientContextRail({
  labs,
  simpleLabs,
  patientId,
  rightPanelTab,
  setRightPanelTab,
  onCollapse,
  onOpenLab,
}: {
  labs: LabResult[];
  simpleLabs: SimpleLabUpload[];
  patientId: number;
  rightPanelTab: ContextRailTab;
  setRightPanelTab: (tab: ContextRailTab) => void;
  onCollapse: () => void;
  onOpenLab?: (lab: LabResult) => void;
}) {
  // Fetch patient vitals (separate table)
  const { data: rawVitals = [] } = useQuery<PatientVital[]>({
    queryKey: ["/api/patients", patientId, "vitals"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/vitals`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  // Sort labs newest-first, take up to 5 for comparison columns
  const sortedLabs = useMemo(() => [...labs].sort((a, b) => {
    const dateA = new Date((a as any).labDate || (a as any).createdAt || 0).getTime();
    const dateB = new Date((b as any).labDate || (b as any).createdAt || 0).getTime();
    return dateB - dateA;
  }), [labs]);

  const recentLabs = useMemo(() => sortedLabs.slice(0, 5), [sortedLabs]);

  // ── Labs comparison matrix ────────────────────────────────────────────────
  const { allBiomarkers, labCols } = useMemo(() => {
    const cols = recentLabs.map(lab => ({
      lab,
      dateLabel: (lab as any).labDate
        ? (() => {
            const parts = String((lab as any).labDate).split("T")[0].split("-");
            return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
          })()
        : "—",
      values: new Map<string, { value: string; unit: string; status: string }>(),
    }));

    const biomarkerOrder: string[] = [];
    const biomarkerSeen = new Set<string>();

    cols.forEach(col => {
      const interp = (col.lab as any).interpretationResult;
      if (Array.isArray(interp?.interpretations)) {
        interp.interpretations.forEach((item: any) => {
          // LabInterpretation uses `category` as the biomarker name
          const name: string = item.category ?? item.biomarker ?? "";
          if (!name) return;
          if (!biomarkerSeen.has(name)) {
            biomarkerOrder.push(name);
            biomarkerSeen.add(name);
          }
          col.values.set(name, {
            value: item.value != null ? String(item.value) : "",
            unit: item.unit ?? "",
            status: item.status ?? "normal",
          });
        });
      }
    });

    return { allBiomarkers: biomarkerOrder, labCols: cols };
  }, [recentLabs]);

  // ── Vitals comparison matrix ──────────────────────────────────────────────
  type VitalRowDef = { key: keyof PatientVital; label: string; warnHigh: number; critHigh: number; decimals?: number };
  const VITAL_ROWS: VitalRowDef[] = [
    { key: "systolicBp",  label: "Systolic BP",   warnHigh: 120, critHigh: 130 },
    { key: "diastolicBp", label: "Diastolic BP",  warnHigh: 80,  critHigh: 90  },
    { key: "heartRate",   label: "Heart Rate",    warnHigh: 100, critHigh: 110 },
    { key: "weightLbs",   label: "Weight (lbs)",  warnHigh: 9999, critHigh: 9999, decimals: 1 },
    { key: "bmi",         label: "BMI",           warnHigh: 25,  critHigh: 30,  decimals: 1 },
  ];

  // Take 5 most recent vitals entries as columns
  const recentVitals = useMemo(() =>
    [...rawVitals]
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .slice(0, 5),
    [rawVitals]
  );

  const vitalCols = useMemo(() => recentVitals.map(v => ({
    vital: v,
    src: (v.source === "patient_logged" ? "patient_logged" : "clinic") as "clinic" | "patient_logged",
    dateLabel: new Date(v.recordedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
    values: new Map<string, number | null>(
      VITAL_ROWS.map(r => [r.key as string, (v[r.key] as number | null | undefined) ?? null])
    ),
  })), [recentVitals]);

  const hasAnyVitals = vitalCols.length > 0 && VITAL_ROWS.some(row =>
    vitalCols.some(col => col.values.get(row.key as string) !== null)
  );

  const tabs = [
    { id: "labs"   as ContextRailTab, label: "Labs",   Icon: FlaskConical },
    { id: "vitals" as ContextRailTab, label: "Vitals", Icon: Heart },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b flex-shrink-0"
        style={{ borderColor: "#e8ddd0", backgroundColor: "#fdfaf7" }}
      >
        <span className="text-xs font-semibold" style={{ color: "#5a7040" }}>Clinical Context</span>
        <button
          onClick={onCollapse}
          className="rounded p-0.5 hover-elevate"
          title="Collapse context panel"
          data-testid="button-collapse-context-rail"
        >
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Mini tab bar */}
      <div className="flex border-b flex-shrink-0" style={{ borderColor: "#e8ddd0" }}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium border-b-2 transition-colors",
              rightPanelTab === id
                ? "border-[#2e3a20] text-[#2e3a20]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setRightPanelTab(id)}
            data-testid={`button-context-rail-tab-${id}`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Labs comparison grid ─────────────────────────────────────────── */}
      {rightPanelTab === "labs" && (
        <div className="flex-1 overflow-auto">
          {labCols.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground text-center italic">No lab results yet</p>
          ) : (
            <div style={{ minWidth: RAIL_NAME_W + RAIL_VAL_W * labCols.length + 12, paddingBottom: 72 }}>
              <RailHeaderRow
                colCount={labCols.length}
                cols={labCols.map((col, i) => ({ label: col.dateLabel, clickable: true, colIndex: i }))}
                onClickCol={i => onOpenLab && onOpenLab(labCols[i].lab)}
              />
              {allBiomarkers.map((bio, ri) => (
                <RailRow
                  key={bio}
                  label={bio}
                  rowIndex={ri}
                  colCount={labCols.length}
                  cells={labCols.map(col => {
                    const entry = col.values.get(bio);
                    return entry ? (
                      <span style={{ color: railStatusColor(entry.status) }}>{entry.value}</span>
                    ) : (
                      <span style={{ color: "#c8c0b4" }}>—</span>
                    );
                  })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Vitals comparison grid ───────────────────────────────────────── */}
      {rightPanelTab === "vitals" && (
        <div className="flex-1 overflow-auto">
          {!hasAnyVitals ? (
            <p className="p-4 text-xs text-muted-foreground text-center italic">
              No vitals recorded yet
            </p>
          ) : (
            <div style={{ minWidth: RAIL_NAME_W + RAIL_VAL_W * vitalCols.length + 12, paddingBottom: 72 }}>
              <RailHeaderRow
                headerLabel="Vital"
                colCount={vitalCols.length}
                cols={vitalCols.map((col, i) => ({ label: col.dateLabel, clickable: false, colIndex: i, src: col.src }))}
              />
              {VITAL_ROWS.filter(row =>
                vitalCols.some(col => col.values.get(row.key as string) !== null)
              ).map((row, ri) => (
                <RailRow
                  key={row.key as string}
                  label={row.label}
                  rowIndex={ri}
                  colCount={vitalCols.length}
                  cells={vitalCols.map(col => {
                    const val = col.values.get(row.key as string);
                    if (val === null || val === undefined) return <span style={{ color: "#c8c0b4" }}>—</span>;
                    const color = val >= row.critHigh ? "#b91c1c" : val >= row.warnHigh ? "#b45309" : "#15803d";
                    const display = row.decimals != null ? Number(val).toFixed(row.decimals) : val;
                    return <span style={{ color }}>{display}</span>;
                  })}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── June Memo "Mark complete" button — own component so it can use hooks ──
function JuneMemoCompleteButton({ requestId, patientId }: { requestId: number; patientId: number }) {
  const { toast } = useToast();
  const completeMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/spruce-requests/${requestId}/status`, { status: "complete" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "communication-timeline"] });
      toast({ title: "Marked complete", description: "June memo resolved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not mark memo complete.", variant: "destructive" });
    },
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 px-2 text-[9px] flex items-center gap-1"
      style={{ color: "#4a3a6e", borderColor: "#c4b8e0" }}
      disabled={completeMutation.isPending}
      onClick={() => completeMutation.mutate()}
      data-testid={`button-june-memo-complete-${requestId}`}
    >
      {completeMutation.isPending ? (
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
      ) : (
        <Check className="w-2.5 h-2.5" />
      )}
      Mark complete
    </Button>
  );
}

// Serialize a NoteTemplate's blocks[] into plain text for insertion into the
// plain-text amend editor. Works for both SOAP sections and nurse field blocks.
function templateBlocksToText(blocks: any[]): string {
  if (!blocks?.length) return "";
  const SOAP_LABELS: Record<string, string> = {
    subjective: "SUBJECTIVE",
    objective: "OBJECTIVE",
    assessment: "ASSESSMENT",
    plan: "PLAN",
  };
  const lines: string[] = [];
  for (const b of blocks) {
    const label = SOAP_LABELS[b.type] ?? (b.label || b.type || "").toUpperCase();
    const value = (b.defaultValue ?? "").trim();
    lines.push(label);
    lines.push("");
    if (value) lines.push(value);
    lines.push("");
  }
  return lines.join("\n");
}

export default function PatientProfiles() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const { setCurrentPatient } = usePatientContext();
  useEffect(() => {
    if (selectedPatient) {
      setCurrentPatient({ id: selectedPatient.id, name: `${selectedPatient.firstName ?? ""} ${selectedPatient.lastName ?? ""}`.trim() });
    } else {
      setCurrentPatient(null);
    }
  }, [selectedPatient, setCurrentPatient]);
  useEffect(() => {
    return () => {
      setCurrentPatient(null);
    };
  }, [setCurrentPatient]);
  const [viewingLab, setViewingLab] = useState<LabResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LabResult | null>(null);
  const [confirmDeletePatient, setConfirmDeletePatient] = useState(false);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [editPatientForm, setEditPatientForm] = useState({ firstName: "", lastName: "", email: "", dateOfBirth: "", phone: "", address: "", gender: "female" as "male" | "female", primaryProvider: "", ssn: "", driversLicense: "", insuranceCarrier: "", insuranceMemberId: "" });
  const [editPatientPharmacy, setEditPatientPharmacy] = useState<PharmacyLookupValue>({ text: "", details: null });
  const [showNewPatientDialog, setShowNewPatientDialog] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({ firstName: "", lastName: "", dateOfBirth: "", gender: "female" as "male" | "female", email: "", phone: "" });
  const [showFullDemographics, setShowFullDemographics] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkGender, setBulkGender] = useState<"male" | "female">("female");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [showUpcomingApptsDialog, setShowUpcomingApptsDialog] = useState(false);
  const [showVitalsDialog, setShowVitalsDialog] = useState(false);
  const [showVitalTrendsDialog, setShowVitalTrendsDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState<boolean | null>(null);
  const [publishingLabId, setPublishingLabId] = useState<number | null>(null);
  const [publishDialogLab, setPublishDialogLab] = useState<LabResult | null>(null);
  const [publishNotes, setPublishNotes] = useState("");
  const [publishDietaryGuidance, setPublishDietaryGuidance] = useState("");
  const [publishPatientSummary, setPublishPatientSummary] = useState("");
  const [isDietaryGenerating, setIsDietaryGenerating] = useState(false);
  const [isDietaryError, setIsDietaryError] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [composerTab, setComposerTab] = useState<'reply' | 'note'>('reply');
  const [activeChannel, setActiveChannel] = useState<'portal' | 'spruce'>('portal');
  const [showMessages, setShowMessages] = useState(false);
  const [showTimelineSystemEvents, setShowTimelineSystemEvents] = useState(false);
  const [showSpruceHistory, setShowSpruceHistory] = useState(false);
  const [showPortalSection, setShowPortalSection] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showEncounters, setShowEncounters] = useState(false);
  const [showForms, setShowForms] = useState(true);
  const [showAssignFormDialog, setShowAssignFormDialog] = useState(false);
  const [assignDeliveryMode, setAssignDeliveryMode] = useState<"portal" | "in_clinic">("portal");
  const [showAssignPacketDialog, setShowAssignPacketDialog] = useState(false);
  const [assigningPacketBundleId, setAssigningPacketBundleId] = useState<number | null>(null);
  const [lastAssignedPacketUrl, setLastAssignedPacketUrl] = useState<string | null>(null);
  const [showSendEmailDialog, setShowSendEmailDialog] = useState(false);
  const [sendEmailFormId, setSendEmailFormId] = useState<number | null>(null);
  const [sendEmailAddress, setSendEmailAddress] = useState("");
  const [sendEmailName, setSendEmailName] = useState("");
  const [sendLinkFormId, setSendLinkFormId] = useState<number | null>(null);
  const [showManualSoap, setShowManualSoap] = useState(false);
  const [showNurseNote, setShowNurseNote] = useState(false);
  const [showPhoneNote, setShowPhoneNote] = useState(false);
  // Edit-existing modes: reopen a saved block-based note in its original builder.
  const [editingManualSoapId, setEditingManualSoapId] = useState<number | null>(null);
  const [editingNurseNoteId, setEditingNurseNoteId] = useState<number | null>(null);
  const [editingPhoneNoteId, setEditingPhoneNoteId] = useState<number | null>(null);
  const [previewSubId, setPreviewSubId] = useState<number | null>(null);
  const [expandedEncounterId, setExpandedEncounterId] = useState<number | null>(null);
  // INLINE ENCOUNTER EDITOR — when set, the Encounters sub-section renders the
  // full EncounterEditor in place of the encounter list. This lets clinicians
  // start / edit a SOAP note without leaving the patient profile (no route
  // change), preserving the patient context and the left sub-nav.
  const [inlineEncounter, setInlineEncounter] = useState<
    | { mode: "new" }
    | { mode: "edit"; encounterId: number }
    | null
  >(null);
  const [pdfExportingEncounterId, setPdfExportingEncounterId] = useState<number | null>(null);
  const [copiedEncounterId, setCopiedEncounterId] = useState<number | null>(null);
  const [amendingEncounterId, setAmendingEncounterId] = useState<number | null>(null);
  const [amendText, setAmendText] = useState("");
  const [savingAmend, setSavingAmend] = useState(false);
  const [signingEncounterId, setSigningEncounterId] = useState<number | null>(null);
  const [deletingEncounterId, setDeletingEncounterId] = useState<number | null>(null);
  const [isDeletingEncounter, setIsDeletingEncounter] = useState(false);
  const [templatePickerEncounterId, setTemplatePickerEncounterId] = useState<number | null>(null);
  const [templatePickerNoteType, setTemplatePickerNoteType] = useState<string>("");
  const [evidenceOpenId, setEvidenceOpenId] = useState<number | null>(null);
  const [summaryOpenId, setSummaryOpenId] = useState<number | null>(null);
  const [summaryTextMap, setSummaryTextMap] = useState<Record<number, string>>({});
  const [generatingSummaryId, setGeneratingSummaryId] = useState<number | null>(null);
  const [savingSummaryId, setSavingSummaryId] = useState<number | null>(null);
  const [publishingSummaryId, setPublishingSummaryId] = useState<number | null>(null);
  // Default the patient list to COLLAPSED so a selected patient gets the full
  // canvas. The rail with an obvious expand affordance lets clinicians jump to
  // another patient in one click.
  const [listCollapsed, setListCollapsed] = useState(true);
  // Sub-section navigation (account-style left rail) for everything below the
  // Patient Chart panel.
  type ProfileSection =
    | "overview"
    | "portal"
    | "monitoring"
    | "encounters"
    | "labs"
    | "prevent"
    | "documents"
    | "orders";
  const [profileSection, setProfileSection] = useState<ProfileSection>("overview");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<ContextRailTab>("labs");
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeKeepId, setMergeKeepId] = useState<number | null>(null);
  const [mergeDiscardId, setMergeDiscardId] = useState<number | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const messageBottomRef = useRef<HTMLDivElement>(null);
  const urlParamApplied = useRef<string | null>(null);
  // Tracks the lab ID we have already auto-opened from the URL ?lab= param so
  // we don't re-open it each time `labs` or `selectedPatient` changes.
  const urlLabOpened = useRef<number | null>(null);

  // Auto-generate patient-specific dietary guidance when the publish dialog opens.
  // The endpoint pulls directly from this lab's interpretations + lab values, so
  // we trigger generation as long as the lab has any interpretation data —
  // not gated on the staff-facing aiRecommendations text (which often lacks
  // dietary content and led to identical guidance across patients).
  useEffect(() => {
    if (!publishDialogLab) return;
    const interp = (publishDialogLab.interpretationResult as any) || {};
    const hasInterpretations = Array.isArray(interp.interpretations) && interp.interpretations.length > 0;
    const hasLabValues = publishDialogLab.labValues && Object.keys(publishDialogLab.labValues as any).length > 0;
    if ((!hasInterpretations && !hasLabValues) || publishDietaryGuidance) return;

    let cancelled = false;
    setIsDietaryGenerating(true);
    setIsDietaryError(false);
    apiRequest("POST", "/api/generate-dietary-guidance", { labResultId: publishDialogLab.id })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.dietaryGuidance) {
          setPublishDietaryGuidance(data.dietaryGuidance);
        } else if (!cancelled) {
          setIsDietaryError(true);
        }
      })
      .catch(() => { if (!cancelled) setIsDietaryError(true); })
      .finally(() => { if (!cancelled) setIsDietaryGenerating(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishDialogLab?.id]);

  const { data: allPatients = [], isLoading: patientsLoading } = useQuery<Patient[]>({
    queryKey: ['/api/patients/search', ''],
    queryFn: async () => {
      const res = await fetch('/api/patients/search', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load patients');
      return res.json();
    },
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  // Auto-select patient from URL param (e.g. ?patient=123&tab=encounters&lab=456)
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const patientId = params.get("patient");
    const tab = params.get("tab");
    const labId = params.get("lab");
    if (!patientId) return;

    const patientAlreadyApplied = urlParamApplied.current === patientId;

    // When a ?lab= param is present (deep-link from lab-interpretation), always
    // invalidate the patient's labs cache so the newly-saved evaluation is
    // fetched — whether the patient was already selected or this is a fresh
    // navigation.  The URL-driven modal-open effect below handles the actual
    // opening once the data arrives.
    if (labId) {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', Number(patientId), 'labs'] });
    }

    if (patientAlreadyApplied) return;

    // Skip only if this exact patient ID was already applied — not a blanket latch.
    // This lets the search bar navigate to different patients in the same session.
    if (allPatients.length === 0) return;
    const found = allPatients.find(p => p.id === Number(patientId));
    if (!found) {
      // Patient not yet in local list (e.g. just added by another team member).
      // Force a cache refresh so the background refetch includes the new patient.
      queryClient.invalidateQueries({ queryKey: ['/api/patients/search', ''] });
      return;
    }
    urlParamApplied.current = patientId;
    setSelectedPatient(found);
    if (tab === "messages") setShowMessages(true);
    if (tab === "orders") setShowOrders(true);
    if (tab === "encounters") setShowEncounters(true);
    if (tab === "forms") setShowForms(true);
  }, [allPatients, searchStr]);

  // PATIENT-SAFETY: When the user switches patients in the rail while an
  // inline encounter editor is open, close it so we never end up showing
  // Patient A's encounter while the chart is on Patient B. The server
  // tripwire (expectedPatientId) would block any cross-patient write
  // anyway, but this prevents the visual ghost-editor in the first place.
  useEffect(() => {
    setInlineEncounter(null);
  }, [selectedPatient?.id]);

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

  // URL-driven lab modal opening — fires whenever selectedPatient, labs, or the
  // search string changes.  Reads the ?lab= param directly from the URL so
  // there is no ref-ordering dependency.  urlLabOpened guards against
  // re-opening the same lab on every labs update.
  useEffect(() => {
    if (!selectedPatient || labsLoading) return;
    const params = new URLSearchParams(searchStr);
    const labIdStr = params.get("lab");
    if (!labIdStr) return;
    const labId = Number(labIdStr);
    if (isNaN(labId)) return;
    if (urlLabOpened.current === labId) return; // already opened this lab
    const labToOpen = labs.find(l => l.id === labId);
    if (labToOpen) {
      urlLabOpened.current = labId;
      setViewingLab(labToOpen);
    }
    // If the lab isn't in the list yet (stale cache / in-flight refetch),
    // the effect will re-run when `labs` updates with the fresh server data.
  }, [selectedPatient, labs, labsLoading, searchStr]);

  const { data: simpleLabs = [] } = useQuery<SimpleLabUpload[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'simple-labs'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/simple-labs`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch quick lab uploads');
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const deleteSimpleLabMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/simple-labs/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      if (selectedPatient) {
        queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient.id, 'simple-labs'] });
      }
      toast({ title: "Quick upload deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const { data: portalStatus, isError: portalStatusError, isFetching: portalStatusFetching, refetch: refetchPortalStatus } = useQuery<{
    hasPortalAccount: boolean;
    hasPassword: boolean;
    email: string | null;
    lastProtocolPublished: string | null;
    publishedLabResultIds: number[];
    portalStatus: 'not_invited' | 'invite_pending' | 'active';
    lastLoginAt: string | null;
    latestReportViewedAt: string | null;
    latestReportPublishedAt: string | null;
    inviteSentAt: string | null;
  }>({
    queryKey: ['/api/portal/status', selectedPatient?.id],
    queryFn: async () => {
      if (!selectedPatient?.id) throw new Error('No patient selected');
      const res = await fetch(`/api/portal/status/${selectedPatient.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch portal status`);
      return res.json();
    },
    enabled: !!(selectedPatient?.id),
    staleTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const { user } = useAuth();
  const clinicBranding = useClinicBrandingPartial();
  const { data: clinicBrandingFull } = useClinicBranding();

  interface PortalMessage {
    id: number;
    patientId: number;
    clinicianId: number;
    senderType: 'patient' | 'clinician';
    content: string;
    readAt: string | null;
    createdAt: string;
  }

  interface TimelineItem {
    id: string;
    source: 'portal' | 'spruce';
    direction: 'inbound' | 'outbound' | 'system';
    senderLabel: string;
    body: string | null;
    timestamp: string;
    conversationKey: string | null;
    patientId: number;
    clinicianId: number | null;
    userId: number | null;
    readAt: string | null;
    sentByAI: boolean;
    eventType: string | null;
    spruceMessageId: string | null;
    spruceConversationId: string | null;
    spruceDeliveryId: string | null;
    messageType: string;
    visibility: string;
    deliveryChannel: string | null;
    mentionedUserIds: number[];
    spruceWorkflowRequestId: number | null;
    spruceWorkflowRequestStatus: string | null;
  }

  interface ReplyContext {
    availableChannels: Array<'portal' | 'spruce'>;
    activeChannel: 'portal' | 'spruce' | null;
    hasPortalAccount: boolean;
    hasSpruceConversation: boolean;
    spruceConversationKey: string | null;
    primaryCommunicationChannel: 'portal' | 'spruce' | null;
  }

  const { data: messages = [] } = useQuery<PortalMessage[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'messages'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/messages`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient && showMessages,
    refetchInterval: showMessages ? 15000 : false,
  });

  const { data: timeline = [], isLoading: timelineLoading } = useQuery<TimelineItem[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'communication-timeline'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/communication-timeline`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient && showMessages,
    refetchInterval: showMessages ? 20000 : false,
  });

  const { data: replyContext } = useQuery<ReplyContext>({
    queryKey: ['/api/patients', selectedPatient?.id, 'reply-context'],
    queryFn: async () => {
      if (!selectedPatient) return null;
      const res = await fetch(`/api/patients/${selectedPatient.id}/reply-context`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedPatient && showMessages,
  });

  // Active workflow runs for the patient banner
  interface ActiveWorkflowRun {
    id: number;
    status: string;
    workflowName: string;
    startedAt: string | null;
    createdAt: string;
  }
  const { data: activeWorkflows = [] } = useQuery<ActiveWorkflowRun[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'active-workflows'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/active-workflows`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient,
    refetchInterval: 30000,
  });

  // Spruce conversation history for this patient (shown in portal section)
  interface SpruceConvSummary {
    conversationKey: string;
    spruceConversationId: string | null;
    fromPhone: string | null;
    patientFirstName: string | null;
    patientLastName: string | null;
    spruceContactName: string | null;
    lastMessage: string | null;
    lastMessageDirection: string | null;
    lastMessageAt: string;
    messageCount: number;
    hasStaffReply: boolean;
    isArchived?: boolean;
    archivedAt?: string | null;
  }
  const { data: spruceConvs = [], isLoading: spruceConvsLoading } = useQuery<SpruceConvSummary[]>({
    queryKey: ['/api/spruce/patients', selectedPatient?.id, 'conversations'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/spruce/patients/${selectedPatient.id}/conversations`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient && showSpruceHistory,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/patients', selectedPatient?.id, 'messages', 'unread'],
    queryFn: async () => {
      if (!selectedPatient) return { count: 0 };
      const res = await fetch(`/api/patients/${selectedPatient.id}/messages/unread`, { credentials: 'include' });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!selectedPatient,
    refetchInterval: 30000,
  });

  interface SupplementOrderItem { name: string; dose: string; quantity: number; lineTotal: number; }
  interface SupplementOrderRecord {
    id: number;
    patientId: number;
    clinicianId: number;
    items: SupplementOrderItem[];
    subtotal: string;
    status: string;
    patientNotes: string | null;
    createdAt: string;
  }

  const { data: patientOrders = [] } = useQuery<SupplementOrderRecord[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'supplement-orders'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/supplement-orders`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientFormSubmissions = [] } = useQuery<any[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'form-submissions'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/form-submissions`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: availableForms = [] } = useQuery<any[]>({
    queryKey: ['/api/intake-forms'],
    enabled: !!selectedPatient,
  });

  const { data: clinicProviders = [] } = useQuery<any[]>({
    queryKey: ['/api/clinic/providers'],
  });

  const { data: patientFormAssignments = [] } = useQuery<any[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'form-assignments'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/form-assignments`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientPackets = [] } = useQuery<any[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'packets'],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/packets`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  // Note templates — fetched on-demand when the template picker is open
  const { data: amendNoteTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/note-templates"],
    enabled: !!templatePickerEncounterId,
    staleTime: 60_000,
  });

  const { data: formBundles = [] } = useQuery<any[]>({
    queryKey: ['/api/form-bundles'],
    enabled: !!selectedPatient,
  });

  const assignFormMutation = useMutation({
    mutationFn: async ({ patientId, formId, notes, deliveryMode }: { patientId: number; formId: number; notes?: string; deliveryMode?: "portal" | "in_clinic" }) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/form-assignments`, { formId, notes, deliveryMode });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'form-assignments'] });
      toast({
        title: vars.deliveryMode === "in_clinic" ? "Form assigned (in-clinic only)" : "Form pushed to patient portal",
        description: vars.deliveryMode === "in_clinic"
          ? "This form will not appear in the patient's portal. Use 'Fill In Clinic' to complete it."
          : "The patient has been notified to complete it.",
      });
    },
    onError: () => toast({ title: "Failed to assign form", variant: "destructive" }),
  });

  const assignPacketMutation = useMutation({
    mutationFn: async ({ patientId, bundleId }: { patientId: number; bundleId: number }) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/assign-packet`, { bundleId });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'packets'] });
      setLastAssignedPacketUrl(data.packetUrl);
      setShowAssignPacketDialog(false);
      setAssigningPacketBundleId(null);
      toast({ title: `Packet assigned — ${data.formCount} form${data.formCount !== 1 ? "s" : ""}` });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to assign packet", variant: "destructive" }),
  });

  const sendFormToEmailMutation = useMutation({
    mutationFn: async ({ formId, recipientEmail, recipientName }: { formId: number; recipientEmail: string; recipientName?: string }) => {
      const res = await apiRequest("POST", "/api/forms/send-to-email", { formId, recipientEmail, recipientName });
      return res.json();
    },
    onSuccess: (data: any) => {
      setShowSendEmailDialog(false);
      setSendEmailAddress("");
      setSendEmailName("");
      setSendEmailFormId(null);
      if (data.method === "email") {
        toast({ title: "Form sent", description: `Email sent to ${data.formUrl ? "recipient" : "the provided address"}` });
      } else if (data.formUrl) {
        navigator.clipboard.writeText(data.formUrl);
        toast({ title: "Link copied", description: data.note || "Form link copied to clipboard" });
      }
    },
    onError: () => toast({ title: "Failed to send form", variant: "destructive" }),
  });

  function buildPrefillUrl(baseUrl: string, prefill?: Record<string, string | null> | null): string {
    if (!prefill) return baseUrl;
    const params = new URLSearchParams();
    if (prefill.firstName)   params.set("pf_fn",    prefill.firstName);
    if (prefill.lastName)    params.set("pf_ln",    prefill.lastName);
    if (prefill.dateOfBirth) params.set("pf_dob",   prefill.dateOfBirth);
    if (prefill.email)       params.set("pf_email", prefill.email);
    if (prefill.phone)       params.set("pf_phone", prefill.phone);
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  }

  const sendFormLinkMutation = useMutation({
    mutationFn: async ({ patientId, formId, method }: { patientId: number; formId: number; method: string }) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/forms/send-link`, { formId, method });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'form-assignments'] });
      if (data.method === "email") {
        toast({ title: "Form sent via email", description: `Email sent to ${selectedPatient?.email || "patient"}` });
      } else if (data.method === "email_skipped") {
        if (data.formUrl) navigator.clipboard.writeText(data.formUrl);
        toast({ title: "Email not configured", description: "Link copied to clipboard instead. Set up email integration to send directly.", variant: "destructive" });
      } else if (data.method === "email_failed") {
        if (data.formUrl) navigator.clipboard.writeText(data.formUrl);
        toast({ title: "Email failed to send", description: "Link copied to clipboard instead.", variant: "destructive" });
      } else if (data.formUrl) {
        navigator.clipboard.writeText(data.formUrl);
        toast({ title: "Form link copied to clipboard" });
      } else {
        toast({ title: "Form link sent" });
      }
    },
    onError: () => toast({ title: "Failed to send form link", variant: "destructive" }),
  });

  const deleteSubmissionMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("DELETE", `/api/form-submissions/${submissionId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'form-submissions'] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/all"] });
      toast({ title: "Form submission deleted" });
    },
    onError: () => toast({ title: "Failed to delete submission", variant: "destructive" }),
  });

  const deletePacketMutation = useMutation({
    mutationFn: async (packetId: number) => {
      const res = await apiRequest("DELETE", `/api/patients/${selectedPatient!.id}/packets/${packetId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'packets'] });
      toast({ title: "Packet removed" });
    },
    onError: () => toast({ title: "Failed to remove packet", variant: "destructive" }),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await apiRequest("DELETE", `/api/patients/${selectedPatient!.id}/form-assignments/${assignmentId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'form-assignments'] });
      toast({ title: "Form assignment removed" });
    },
    onError: () => toast({ title: "Failed to remove form assignment", variant: "destructive" }),
  });

  const fulfillOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiRequest("PATCH", `/api/supplement-orders/${orderId}/status`, { status: "fulfilled" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'supplement-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clinician/notifications'] });
    },
  });

  type EncounterSummary = Pick<ClinicalEncounter, 'id' | 'patientId' | 'visitDate' | 'visitType' | 'chiefComplaint' | 'transcription' | 'soapNote' | 'patientSummary' | 'summaryPublished'> & {
    patientName: string;
    signedAt?: string | Date | null;
    signedBy?: string | null;
    isAmended?: boolean;
    evidenceSuggestions?: { suggestions?: Array<{ title: string; rationale?: string; strength_of_support?: string; level_of_evidence?: string; citations?: Array<{ doi?: string; pmid?: string; journal?: string; year?: number; authors?: string }> }> } | null;
  };

  const { data: patientEncounters = [] } = useQuery<EncounterSummary[]>({
    queryKey: ['/api/encounters', selectedPatient?.id],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/encounters?patientId=${selectedPatient.id}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientChart, refetch: refetchChart } = useQuery<PatientChart | null>({
    queryKey: ['/api/patients', selectedPatient?.id, 'chart'],
    queryFn: async () => {
      if (!selectedPatient) return null;
      const res = await fetch(`/api/patients/${selectedPatient.id}/chart`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  // Sync activeChannel from server-derived context whenever it changes
  useEffect(() => {
    if (replyContext?.activeChannel) {
      setActiveChannel(replyContext.activeChannel);
    }
  }, [replyContext?.activeChannel]);

  const replyMutation = useMutation({
    mutationFn: async ({ body, channel }: { body: string; channel: 'portal' | 'spruce' }) => {
      const res = await apiRequest("POST", `/api/patients/${selectedPatient!.id}/reply`, { body, channel });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'communication-timeline'] });
      setMessageDraft("");
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const internalNoteMutation = useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      const res = await apiRequest("POST", `/api/patients/${selectedPatient!.id}/internal-note`, {
        content,
        messageType: 'internal_note',
        mentionedUserIds: [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'communication-timeline'] });
      setNoteDraft("");
    },
    onError: () => {
      toast({ title: "Failed to save note", variant: "destructive" });
    },
  });

  // Keep legacy mutation around for any remaining callers
  const sendMessageMutation = replyMutation;

  useEffect(() => {
    if (showMessages) {
      messageBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [timeline, showMessages]);

  const inviteMutation = useMutation({
    mutationFn: async ({ patientId, email }: { patientId: number; email: string }) => {
      const res = await apiRequest("POST", `/api/portal/invite/${patientId}`, { email });
      return res.json() as Promise<{ message: string; inviteUrl?: string; emailSent?: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal/status', selectedPatient?.id] });
      setInviteLink(data?.inviteUrl || null);
      setInviteEmailSent(data?.emailSent ?? null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to send invitation", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const publishProtocolMutation = useMutation({
    mutationFn: async ({ lab, notes, dietaryGuidance, patientSummary }: { lab: LabResult; notes: string; dietaryGuidance: string; patientSummary: string }) => {
      const interp = lab.interpretationResult as any;
      const ov = (lab.providerOverrides as ProviderOverrides) || {};
      const hiddenSuppNames: string[] = ov.hiddenSupplementNames || [];
      const addedSupplements: SupplementRecommendation[] = ov.addedSupplements || [];
      const autoSupps: any[] = interp?.supplements || [];
      const supplements = [
        ...autoSupps.filter((s: any) => !hiddenSuppNames.includes(s.name || '')),
        ...addedSupplements,
      ];
      const res = await apiRequest("POST", "/api/protocols/publish", {
        patientId: lab.patientId,
        labResultId: lab.id,
        supplements,
        clinicianNotes: notes || null,
        dietaryGuidance: dietaryGuidance || null,
        patientSummary: patientSummary || null,
        labDate: lab.labDate,
      });
      return res;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal/status', selectedPatient?.id] });
      setPublishingLabId(null);
      setPublishDialogLab(null);
      setPublishNotes("");
      setPublishDietaryGuidance("");
      setPublishPatientSummary("");
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
    setPublishDialogLab(lab);
    setPublishNotes("");
    setPublishDietaryGuidance("");
    setIsDietaryError(false);
    const interp = (lab.interpretationResult as any) || {};
    const ov = (lab.providerOverrides as ProviderOverrides) || {};
    setPublishPatientSummary(
      typeof ov.patientSummaryDraft === 'string' ? ov.patientSummaryDraft : (interp.patientSummary || "")
    );
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

  const updatePatientMutation = useMutation({
    mutationFn: async (data: { id: number; firstName: string; lastName: string; email: string; dateOfBirth: string; phone: string; address: string; gender: string; primaryProvider: string; ssn: string; driversLicense: string; insuranceCarrier: string; insuranceMemberId: string; pharmacy: PharmacyLookupValue }) => {
      const { id, pharmacy, ...fields } = data;
      const body: Record<string, string | null> = {
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email || null,
        phone: fields.phone || null,
        address: fields.address || null,
        dateOfBirth: fields.dateOfBirth || null,
        gender: fields.gender,
        primaryProvider: fields.primaryProvider || null,
        ssn: fields.ssn || null,
        driversLicense: fields.driversLicense || null,
        insuranceCarrier: fields.insuranceCarrier || null,
        insuranceMemberId: fields.insuranceMemberId || null,
        ...pharmacyValueToPatch(pharmacy),
      };
      const res = await apiRequest("PATCH", `/api/patients/${id}`, body);
      if (!res.ok) throw new Error("Failed to update patient");
      return res.json() as Promise<Patient>;
    },
    onSuccess: (updated) => {
      setSelectedPatient(updated);
      queryClient.invalidateQueries({ queryKey: ['/api/patients/search', ''] });
      setShowEditPatient(false);
      toast({ title: "Patient Updated", description: "Profile details have been saved." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to update patient. Please try again." });
    },
  });

  const createNewPatientMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; gender: string; dateOfBirth: string; email: string; phone: string }) => {
      const body: Record<string, string | null> = {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        gender: data.gender,
      };
      if (data.dateOfBirth) body.dateOfBirth = new Date(data.dateOfBirth).toISOString();
      if (data.email.trim()) body.email = data.email.trim().toLowerCase();
      if (data.phone.trim()) body.phone = data.phone.trim();
      // Assign primary provider to clinic owner
      const ownerProvider = (clinicProviders as any[]).find((p: any) => p.isOwner);
      if (ownerProvider) body.primaryProvider = ownerProvider.displayName;
      const res = await apiRequest("POST", "/api/patients", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create patient");
      }
      return res.json() as Promise<Patient>;
    },
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients/search', ''] });
      queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
      setSelectedPatient(newPatient);
      setShowNewPatientDialog(false);
      setNewPatientForm({ firstName: "", lastName: "", dateOfBirth: "", gender: "female", email: "", phone: "" });
      toast({ title: "Patient Created", description: `${newPatient.firstName} ${newPatient.lastName}'s profile is ready.` });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to create patient." });
    },
  });

  const mergePatientsMutation = useMutation({
    mutationFn: async ({ keepId, discardId }: { keepId: number; discardId: number }) => {
      const res = await apiRequest("POST", "/api/patients/merge", { keepId, discardId });
      if (!res.ok) throw new Error("Merge failed");
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients/search', ''] });
      queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
      setShowMergeDialog(false);
      setMergeKeepId(null);
      setMergeDiscardId(null);
      setMergeSearch("");
      const kept = allPatients.find(p => p.id === result.keptPatientId);
      if (kept) setSelectedPatient(kept);
      toast({ title: "Patients Merged", description: `All records consolidated into ${kept?.firstName ?? ""} ${kept?.lastName ?? ""}` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Merge Failed", description: "Could not merge patients. Please try again." });
    },
  });

  const bulkGenderMutation = useMutation({
    mutationFn: async ({ patientIds, gender }: { patientIds: number[]; gender: "male" | "female" }) => {
      const res = await apiRequest("PATCH", "/api/patients/bulk-gender", { patientIds, gender });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to update"); }
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/search", ""] });
      setBulkEditMode(false);
      setSelectedIds(new Set());
      toast({ title: "Gender updated", description: `${result.updated} patient${result.updated !== 1 ? "s" : ""} updated successfully.` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    },
  });

  const handleEditPatientOpen = () => {
    if (!selectedPatient) return;
    const dob = selectedPatient.dateOfBirth
      ? utcDateStr(new Date(selectedPatient.dateOfBirth as unknown as string))
      : "";
    // Default primary provider to clinic owner if not set
    const existingProvider = (selectedPatient as any).primaryProvider ?? "";
    const ownerProvider = (clinicProviders as any[]).find((p: any) => p.isOwner);
    const defaultProvider = existingProvider || (ownerProvider ? ownerProvider.displayName : "");
    setEditPatientForm({
      firstName: selectedPatient.firstName,
      lastName: selectedPatient.lastName,
      email: (selectedPatient as any).email ?? "",
      dateOfBirth: dob,
      phone: (selectedPatient as any).phone ?? "",
      address: (selectedPatient as any).address ?? "",
      gender: (selectedPatient.gender === "male" ? "male" : "female") as "male" | "female",
      primaryProvider: defaultProvider,
      ssn: (selectedPatient as any).ssn ?? "",
      driversLicense: (selectedPatient as any).driversLicense ?? "",
      insuranceCarrier: (selectedPatient as any).insuranceCarrier ?? "",
      insuranceMemberId: (selectedPatient as any).insuranceMemberId ?? "",
    });
    setEditPatientPharmacy(pharmacyValueFromRecord(selectedPatient as any));
    setShowEditPatient(true);
  };

  const handleDeleteLab = (lab: LabResult) => setConfirmDelete(lab);
  const syntheticFromSimple = simpleLabsToSynthetic(simpleLabs);
  const allLabsForTrending = [...labs, ...syntheticFromSimple].sort(
    (a, b) => new Date(b.labDate).getTime() - new Date(a.labDate).getTime()
  );
  const insights = allLabsForTrending.length >= 2 ? generateTrendInsights(allLabsForTrending, selectedPatient?.gender as 'male' | 'female') : [];
  const maleCount = allPatients.filter(p => p.gender === 'male').length;
  const femaleCount = allPatients.filter(p => p.gender === 'female').length;

  return (
    <div className="flex flex-col flex-1 bg-background overflow-hidden">
      {/* Page sub-header */}
      <div className="flex-shrink-0 border-b px-3 sm:px-4 py-2 flex items-center gap-2" style={{ backgroundColor: "#f5f2ed", borderColor: "#d4c9b5" }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold" style={{ color: "#1c2414" }}>Patient Profiles</h1>
          {!patientsLoading && (
            <Badge variant="secondary" className="text-xs">
              {allPatients.length} patient{allPatients.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Split panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel: patient list */}
        <div className={cn(
          "flex-shrink-0 border-r bg-background transition-all duration-200",
          selectedPatient
            ? listCollapsed
              ? "hidden md:flex md:flex-col md:w-12"
              : "hidden md:flex md:flex-col md:w-72"
            : "flex flex-col w-full md:w-72"
        )}>
          {/* Collapsed state — wider rail with an obvious expand affordance:
              chevron + vertical "PATIENTS" label + count badge so clinicians
              know they can switch patients in one click. */}
          {listCollapsed && selectedPatient && (
            <button
              onClick={() => setListCollapsed(false)}
              className="flex flex-col items-center justify-start pt-3 pb-3 gap-3 flex-1 hover-elevate active-elevate-2 group"
              title="Expand patient list — search & switch patients"
              aria-label="Expand patient list to search and switch patients"
              aria-expanded={false}
              aria-controls="patient-list-panel"
              data-testid="button-expand-patient-list"
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
                style={{ backgroundColor: "#edf4e4", color: "#2e3a20" }}
              >
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </div>
              {!patientsLoading && allPatients.length > 0 && (
                <span
                  className="inline-flex items-center justify-center rounded-full px-1.5 min-w-[22px] h-5 text-[10px] font-bold"
                  style={{ backgroundColor: "#2e3a20", color: "#f5f2ed" }}
                >
                  {allPatients.length}
                </span>
              )}
              <div
                className="flex items-center justify-center"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "#5a6048" }}
                >
                  Patients
                </span>
              </div>
              <Search className="w-3.5 h-3.5 mt-1" style={{ color: "#7a8a64" }} />
            </button>
          )}

          {/* Full panel — search + filter controls + list */}
          {(!listCollapsed || !selectedPatient) && (<>
          <div className="p-3 border-b space-y-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or MRN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 text-sm"
                  data-testid="input-patient-profile-search"
                />
              </div>
              <Button
                size="sm"
                className="h-8 px-2 shrink-0 text-xs font-medium"
                onClick={() => setShowNewPatientDialog(true)}
                data-testid="button-new-patient-profile"
                style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />New
              </Button>
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
            {allPatients.length >= 2 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={() => { setShowMergeDialog(true); setMergeKeepId(null); setMergeDiscardId(null); setMergeSearch(""); }}
                data-testid="button-open-merge"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" /> Merge Duplicate Patients
              </Button>
            )}
            {allPatients.length > 0 && (
              <Button
                size="sm"
                variant={bulkEditMode ? "default" : "outline"}
                className="w-full text-xs"
                onClick={() => { setBulkEditMode(v => !v); setSelectedIds(new Set()); }}
                data-testid="button-bulk-edit-toggle"
              >
                <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                {bulkEditMode ? "Exit Bulk Edit" : "Bulk Edit Gender"}
              </Button>
            )}
            {bulkEditMode && (
              <div className="rounded-md border border-amber-300/70 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    {selectedIds.size} patient{selectedIds.size !== 1 ? "s" : ""} selected
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="text-[11px] text-amber-700 dark:text-amber-300 underline underline-offset-2"
                      onClick={() => setSelectedIds(new Set(filteredPatients.map(p => p.id)))}
                      data-testid="button-bulk-select-all"
                    >
                      Select all ({filteredPatients.length})
                    </button>
                    {selectedIds.size > 0 && (
                      <>
                        <span className="text-amber-400">·</span>
                        <button
                          className="text-[11px] text-amber-700 dark:text-amber-300 underline underline-offset-2"
                          onClick={() => setSelectedIds(new Set())}
                          data-testid="button-bulk-deselect-all"
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Select value={bulkGender} onValueChange={(v) => setBulkGender(v as "male" | "female")}>
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid="select-bulk-gender">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Women's</SelectItem>
                      <SelectItem value="male">Men's</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-7 text-xs px-2.5 shrink-0"
                    disabled={selectedIds.size === 0 || bulkGenderMutation.isPending}
                    onClick={() => bulkGenderMutation.mutate({ patientIds: Array.from(selectedIds), gender: bulkGender })}
                    data-testid="button-bulk-apply-gender"
                    style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                  >
                    {bulkGenderMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Apply
                  </Button>
                </div>
              </div>
            )}
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
                  No patients yet. Click <strong>New</strong> to add a patient manually, or save a lab evaluation to auto-create a profile.
                </p>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowNewPatientDialog(true)} data-testid="button-new-patient-empty-state">
                  <Plus className="h-3 w-3 mr-1" />Add First Patient
                </Button>
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
                  const isBulkChecked = selectedIds.has(patient.id);
                  return (
                    <button
                      key={patient.id}
                      onClick={() => {
                        if (bulkEditMode) {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(patient.id)) next.delete(patient.id);
                            else next.add(patient.id);
                            return next;
                          });
                        } else {
                          setSelectedPatient(patient); setViewingLab(null); setShowMessages(false); setMessageDraft(""); setProfileSection("overview"); setListCollapsed(true);
                        }
                      }}
                      className={cn(
                        "w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors",
                        bulkEditMode
                          ? isBulkChecked
                            ? "bg-amber-50/70 dark:bg-amber-950/25"
                            : "hover:bg-muted/50"
                          : isSelected
                            ? "bg-primary/10 border-r-2 border-primary"
                            : "hover:bg-muted/50"
                      )}
                      data-testid={`button-select-patient-${patient.id}`}
                    >
                      {bulkEditMode ? (
                        <span className={cn(
                          "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          isBulkChecked
                            ? "bg-amber-600 border-amber-600"
                            : "border-muted-foreground/40 bg-background"
                        )}>
                          {isBulkChecked && <Check className="h-2.5 w-2.5 text-white" />}
                        </span>
                      ) : (
                        <PatientAvatar patient={patient} size="sm" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          bulkEditMode
                            ? isBulkChecked ? "text-amber-900 dark:text-amber-100" : "text-foreground"
                            : isSelected ? "text-primary" : "text-foreground"
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
          </>)}
        </div>

        {/* Right panel: patient detail — hidden on mobile when no patient selected */}
        <div className={selectedPatient
          ? "flex flex-col flex-1 overflow-hidden min-w-0"
          : "hidden md:flex md:flex-col md:flex-1 md:overflow-y-auto md:min-w-0"
        }>
          {/* Mobile back button */}
          {selectedPatient && (
            <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedPatient(null); setViewingLab(null); }}
                className="h-8 text-xs gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to patients
              </Button>
            </div>
          )}
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
            // pb-32 leaves room for the fixed "Ask ClinIQ" floating button so
            // it never covers the bottom of the last clinical card.
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* ── Fixed header: patient name, demographics, actions ── */}
              <div className="flex-shrink-0 px-5 pt-4 pb-3 space-y-3 border-b" style={{ borderColor: "#e8ddd0" }}>
              {/* Mobile-only back to patient list */}
              <div className="md:hidden -mt-2 -mx-2 mb-0">
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded"
                  data-testid="button-back-patient-list-mobile"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  All Patients
                </button>
              </div>

              {/* Patient header */}
              <div className="pb-2 space-y-3">
                {/* Name + avatar row */}
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={handleEditPatientOpen}
                    className="flex-shrink-0 rounded-full hover-elevate active-elevate-2"
                    title="Edit patient details"
                    data-testid="button-edit-patient-avatar"
                  >
                    <PatientAvatar patient={selectedPatient} size="md" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={handleEditPatientOpen}
                      className="group inline-flex items-center gap-1.5 text-left -ml-1 px-1 py-0.5 rounded hover-elevate active-elevate-2"
                      title="Edit patient details"
                      data-testid="button-edit-patient-name"
                    >
                      <h2 className="text-lg font-semibold leading-tight">
                        {selectedPatient.firstName} {selectedPatient.lastName}
                      </h2>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-50" />
                    </button>

                    {/* Always-visible: sex + DOB + phone + provider */}
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className="text-xs text-muted-foreground">
                        Sex: <span className="font-medium text-foreground capitalize">{selectedPatient.gender}</span>
                      </span>
                      {selectedPatient.dateOfBirth && (
                        <span className="text-xs text-muted-foreground">
                          DOB: <span className="font-medium text-foreground">{safeDate(selectedPatient.dateOfBirth as unknown as string)}</span>
                        </span>
                      )}
                      {(selectedPatient as any).phone && (
                        <span className="text-xs text-muted-foreground">
                          Ph: <span className="font-medium text-foreground">{(selectedPatient as any).phone}</span>
                        </span>
                      )}
                      {(selectedPatient as any).primaryProvider && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" /> <span className="font-medium text-foreground">{(selectedPatient as any).primaryProvider}</span>
                        </span>
                      )}
                      <button
                        onClick={() => setShowFullDemographics(v => !v)}
                        className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="button-toggle-demographics"
                      >
                        {showFullDemographics ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {showFullDemographics ? "Less" : "More"}
                      </button>
                    </div>

                    {/* Collapsible: email, MRN, pharmacy, portal status, lab count */}
                    {showFullDemographics && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 pl-0">
                        {(selectedPatient as any).email && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {(selectedPatient as any).email}
                          </span>
                        )}
                        {selectedPatient.mrn && (
                          <span className="text-xs text-muted-foreground">MRN: {selectedPatient.mrn}</span>
                        )}
                        {(selectedPatient as any).insuranceCarrier && (
                          <span className="text-xs text-muted-foreground">
                            Ins: <span className="font-medium text-foreground">{(selectedPatient as any).insuranceCarrier}</span>
                            {(selectedPatient as any).insuranceMemberId && <span className="text-foreground"> #{(selectedPatient as any).insuranceMemberId}</span>}
                          </span>
                        )}
                        {(selectedPatient as any).driversLicense && (
                          <span className="text-xs text-muted-foreground">
                            DL: <span className="font-medium text-foreground">{(selectedPatient as any).driversLicense}</span>
                          </span>
                        )}
                        {((selectedPatient as any).pharmacyName || (selectedPatient as any).preferredPharmacy) && (
                          <PharmacyDisplay
                            legacyText={(selectedPatient as any).preferredPharmacy}
                            pharmacyName={(selectedPatient as any).pharmacyName}
                            pharmacyAddress={(selectedPatient as any).pharmacyAddress}
                            pharmacyPhone={(selectedPatient as any).pharmacyPhone}
                            pharmacyFax={(selectedPatient as any).pharmacyFax}
                            pharmacyNcpdpId={(selectedPatient as any).pharmacyNcpdpId}
                            variant="inline"
                          />
                        )}
                        <Badge variant="outline" className="text-xs">
                          {labs.length} lab result{labs.length !== 1 ? 's' : ''}
                        </Badge>
                        {portalStatus?.portalStatus === 'active' && (
                          <Badge className="text-xs gap-1" style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "1px solid #c4d4a8" }}>
                            <Leaf className="w-2.5 h-2.5" />
                            Portal Active
                          </Badge>
                        )}
                        {portalStatus?.portalStatus === 'invite_pending' && (
                          <Badge className="text-xs gap-1" style={{ backgroundColor: "#fef9e7", color: "#7a5c20", border: "1px solid #f0d060" }}>
                            <Mail className="w-2.5 h-2.5" />
                            Invite Pending
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Desktop-only collapse toggle */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="hidden md:flex flex-shrink-0"
                    title={listCollapsed ? "Expand patient list" : "Collapse patient list"}
                    onClick={() => setListCollapsed(v => !v)}
                    data-testid="button-toggle-patient-list"
                  >
                    {listCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Action buttons — always below name, wraps on mobile */}
                <div className="flex flex-wrap gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="sm"
                        data-testid="button-lab-entry-dropdown"
                        className="text-xs gap-1.5"
                        style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                      >
                        <FlaskConical className="h-3 w-3" />
                        Lab Entry
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-1" align="start">
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-muted transition-colors text-left"
                        onClick={() => {
                          const route = selectedPatient.gender === 'female' ? '/female' : '/male';
                          setLocation(`${route}?patientId=${selectedPatient.id}`);
                        }}
                        data-testid="button-new-lab-interpretation"
                      >
                        <Activity className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <div className="font-medium">Lab Evaluation</div>
                          <div className="text-xs text-muted-foreground">Full panel interpretation + AI</div>
                        </div>
                      </button>
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-muted transition-colors text-left"
                        onClick={() => setLocation(`/simple-labs?patientId=${selectedPatient.id}`)}
                        data-testid="button-quick-lab-entry"
                      >
                        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <div className="font-medium">Quick Entry</div>
                          <div className="text-xs text-muted-foreground">Manual entry or PDF upload</div>
                        </div>
                      </button>
                    </PopoverContent>
                  </Popover>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setProfileSection("encounters");
                      setExpandedEncounterId(null);
                      setInlineEncounter({ mode: "new" });
                    }}
                    data-testid="button-start-encounter"
                    className="text-xs gap-1.5"
                    style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                  >
                    <Stethoscope className="h-3 w-3" />
                    New Encounter
                  </Button>
                  {portalStatusError ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchPortalStatus()}
                      data-testid="button-portal-status-retry"
                      className="text-xs gap-1.5 opacity-70"
                      style={{ color: "#b45309", borderColor: "#d6b57a" }}
                      title="Portal status is loading — retrying automatically"
                      disabled={portalStatusFetching}
                    >
                      <Mail className="h-3 w-3" />
                      {portalStatusFetching ? "Checking portal…" : "Check Portal Status"}
                    </Button>
                  ) : (
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
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowVitalsDialog(true)}
                    data-testid="button-vitals"
                    className="text-xs gap-1.5"
                    style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                  >
                    <Heart className="h-3 w-3" />
                    Vitals
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUpcomingApptsDialog(true)}
                    data-testid="button-appointments"
                    className="text-xs gap-1.5"
                    style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                  >
                    <CalendarDays className="h-3 w-3" />
                    Appointments
                  </Button>
                </div>
              </div>

              {/* ── Active workflow runs banner ───────────────────────── */}
              {activeWorkflows.length > 0 && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 flex-wrap"
                  data-testid="banner-active-workflows"
                >
                  <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <p className="text-xs text-blue-800 dark:text-blue-300 font-medium flex-1 min-w-0">
                    {activeWorkflows.length === 1
                      ? `1 workflow running: ${activeWorkflows[0].workflowName}`
                      : `${activeWorkflows.length} workflows running`}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeWorkflows.map(run => (
                      <Badge
                        key={run.id}
                        variant="outline"
                        className={`text-xs capitalize ${
                          run.status === "paused"
                            ? "text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700"
                            : run.status === "waiting"
                            ? "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                            : "text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700"
                        }`}
                        data-testid={`badge-workflow-run-${run.id}`}
                      >
                        {activeWorkflows.length > 1 ? run.workflowName : run.status}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              </div>{/* /header section */}

              {/* ── Horizontal tab nav ─────────────────────────────────── */}
              <div className="flex-shrink-0 border-b overflow-x-auto" style={{ borderColor: "#e8ddd0" }}>
                <div className="flex min-w-max px-1">
                  {([
                    { id: "overview" as ProfileSection, label: "Overview", Icon: LayoutDashboard, badge: null as number | null },
                    { id: "portal" as ProfileSection, label: "Portal", Icon: MessageSquare,
                      badge: ((unreadData?.count ?? 0) > 0 ? (unreadData?.count ?? 0) : null) as number | null },
                    { id: "monitoring" as ProfileSection, label: "Monitoring", Icon: TrendingUp, badge: null as number | null },
                    { id: "encounters" as ProfileSection, label: "Encounters", Icon: Stethoscope,
                      badge: (patientEncounters.length > 0 ? patientEncounters.length : null) as number | null },
                    { id: "labs" as ProfileSection, label: "Labs", Icon: FlaskConical,
                      badge: (labs.length > 0 ? labs.length : null) as number | null },
                    { id: "prevent" as ProfileSection, label: "PREVENT", Icon: Activity, badge: null as number | null },
                    { id: "documents" as ProfileSection, label: "Documents", Icon: FolderOpen,
                      badge: ((
                        patientFormAssignments.filter((a: any) => a.status === "pending").length +
                        patientFormSubmissions.filter((s: any) => s.reviewStatus === "pending").length +
                        patientOrders.filter(o => o.status === 'pending').length
                      ) || null) as number | null },
                    { id: "orders" as ProfileSection, label: "Orders", Icon: ClipboardList, badge: null as number | null },
                  ]).map(({ id, label, Icon, badge }) => {
                    const active = profileSection === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setProfileSection(id as ProfileSection);
                          if (id === "portal") {
                            setShowPortalSection(true);
                            if (portalStatus?.hasPortalAccount) setShowMessages(true);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                          active
                            ? "border-[#2e3a20] text-[#2e3a20]"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                        data-testid={`nav-section-${id}`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {label}
                        {badge != null && (
                          <span
                            className="inline-flex items-center justify-center rounded-full px-1.5 min-w-[16px] h-4 text-[9px] font-bold"
                            style={active ? { backgroundColor: "#2e3a20", color: "#f5f2ed" } : { backgroundColor: "#7a5c20", color: "#fdf8ee" }}
                          >
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Three-column body ───────────────────────────────────── */}
              <div className="flex flex-1 overflow-hidden">

                {/* Left col: Patient Chart (accordion) */}
                <div className="hidden md:flex md:flex-col w-64 xl:w-72 flex-shrink-0 border-r overflow-y-auto" style={{ borderColor: "#e8ddd0" }}>
                  <PatientChartPanel
                    patientId={selectedPatient.id}
                    chart={patientChart ?? null}
                    encounters={patientEncounters as unknown as ClinicalEncounter[]}
                    onSaved={() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient.id, 'chart'] });
                      refetchChart();
                    }}
                    accordionMode
                  />
                </div>{/* /left col */}

                {/* Middle col: section content */}
                <div className="flex-1 overflow-y-auto min-w-0 p-4 sm:p-6 pb-44 space-y-6">

              {/* ── Portal & Messages inline panel (sub-section) ─── */}
              {profileSection === "portal" && showPortalSection && portalStatus && (
                <div
                  className="rounded-xl border"
                  style={{ borderColor: "#d4c9b5", backgroundColor: "#faf8f5" }}
                  data-testid="portal-engagement-panel"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#a0a880" }}>
                      Patient Portal Engagement
                    </p>
                    <button
                        onClick={() => setShowMessages(v => !v)}
                        data-testid="button-toggle-messages"
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                        style={{
                          color: showMessages ? "#2e3a20" : "#5a7040",
                          backgroundColor: showMessages ? "#e0d8c8" : "transparent",
                          border: "1px solid #c4b9a5",
                        }}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {showMessages ? "Hide messages" : "Show messages"}
                        {(unreadData?.count ?? 0) > 0 && (
                          <span
                            className="inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 min-w-[16px] h-4"
                            style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                          >
                            {unreadData!.count}
                          </span>
                        )}
                      </button>
                  </div>

                  {/* Engagement stats row */}
                  <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-3">
                    <div className="flex items-center gap-2">
                      {portalStatus.portalStatus === 'active' ? (
                        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#2e7d32" }} />
                      ) : portalStatus.portalStatus === 'invite_pending' ? (
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#b45309" }} />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#c4b9a5" }} />
                      )}
                      <span className="text-xs" style={{ color: "#4a5568" }}>
                        {portalStatus.portalStatus === 'active'
                          ? 'Account activated'
                          : portalStatus.portalStatus === 'invite_pending'
                            ? `Invite sent${portalStatus.inviteSentAt ? ' ' + new Date(portalStatus.inviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} — awaiting signup`
                            : 'Not invited to portal'}
                      </span>
                    </div>

                    {portalStatus.portalStatus === 'active' && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#7a8a64" }} />
                        <span className="text-xs" style={{ color: "#4a5568" }}>
                          {portalStatus.lastLoginAt
                            ? `Last login: ${new Date(portalStatus.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : 'Never logged in'}
                        </span>
                      </div>
                    )}

                    {portalStatus.latestReportPublishedAt && (
                      <div className="flex items-center gap-2">
                        {portalStatus.latestReportViewedAt ? (
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#2e7d32" }} />
                        ) : (
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#b45309" }} />
                        )}
                        <span className="text-xs" style={{ color: "#4a5568" }}>
                          {portalStatus.latestReportViewedAt
                            ? `Latest report opened ${new Date(portalStatus.latestReportViewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : 'Latest report not yet opened'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Unified Communication Timeline ───────────────── */}
                  {showMessages && (
                    <div className="border-t" style={{ borderColor: "#d4c9b5" }}>
                      {/* Timeline scroll area */}
                      <div className="max-h-80 overflow-y-auto px-4 pt-3 pb-2 space-y-2" data-testid="communication-timeline">
                        {timelineLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: "#a0a880" }} />
                          </div>
                        ) : timeline.length === 0 ? (
                          <p className="text-xs text-center py-6" style={{ color: "#9a9a8a" }}>
                            No messages yet across any channel.
                          </p>
                        ) : (
                          <>
                            {/* System events toggle — shown only when there are hideable system events */}
                            {(() => {
                              const hiddenCount = timeline.filter(
                                (i) => i.direction === 'system' && (i.messageType ?? '') !== 'internal_note'
                              ).length;
                              if (hiddenCount === 0) return null;
                              return (
                                <div className="flex justify-center pb-1">
                                  <button
                                    onClick={() => setShowTimelineSystemEvents((v) => !v)}
                                    className="text-[10px] underline-offset-2 hover:underline transition-colors"
                                    style={{ color: "#9a9a8a" }}
                                    data-testid="button-toggle-timeline-system-events"
                                  >
                                    {showTimelineSystemEvents
                                      ? "Hide system events"
                                      : `${hiddenCount} system event${hiddenCount !== 1 ? "s" : ""} hidden · Show`}
                                  </button>
                                </div>
                              );
                            })()}
                            {timeline.map((item) => {
                              const isOutbound = item.direction === 'outbound';
                              const isSystem = item.direction === 'system';
                              const isInternalNote = (item.messageType ?? '') === 'internal_note';

                              // Hide system events (non-internal-note) unless toggled on
                              if (isSystem && !isInternalNote && !showTimelineSystemEvents) return null;
                              const ts = new Date(item.timestamp).toLocaleString("en-US", {
                                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                              });

                              // Helper: highlight @mention tokens in text
                              const renderWithMentions = (text: string | null) => {
                                if (!text) return null;
                                const parts = text.split(/(@\S+)/g);
                                return parts.map((part, i) =>
                                  part.startsWith('@') ? (
                                    <span
                                      key={i}
                                      className="font-semibold rounded px-0.5"
                                      style={{ backgroundColor: "#fde68a", color: "#92400e" }}
                                    >
                                      {part}
                                    </span>
                                  ) : part
                                );
                              };

                              // ── June memo — full-width purple AI card with "Mark complete" ──
                              const isJuneMemo = (item.messageType ?? '') === 'june_memo';
                              if (isJuneMemo) {
                                const isAlreadyComplete = item.spruceWorkflowRequestStatus === 'complete';
                                return (
                                  <div key={item.id} className="flex justify-center" data-testid={`timeline-item-${item.id}`}>
                                    <div
                                      className="w-full rounded-lg px-3 py-2 text-xs"
                                      style={{ backgroundColor: "#f3f0fb", color: "#3b2a6e", border: "1px solid #c4b8e0" }}
                                    >
                                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Sparkles className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "#7c5cbf" }} />
                                          <span className="text-[9px] font-semibold px-1.5 py-0 rounded leading-[1.6]" style={{ backgroundColor: "#e0d8f8", color: "#4a3a8a" }}>
                                            June Memo
                                          </span>
                                          {item.eventType && (
                                            <span className="text-[9px] font-medium px-1.5 py-0 rounded leading-[1.6]" style={{ backgroundColor: "#ede8ff", color: "#5a4a8a" }}>
                                              {item.eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                            </span>
                                          )}
                                          {isAlreadyComplete && (
                                            <span className="text-[9px] font-medium px-1.5 py-0 rounded leading-[1.6]" style={{ backgroundColor: "#d4e8c4", color: "#2a4018" }}>
                                              Completed
                                            </span>
                                          )}
                                        </div>
                                        {!isAlreadyComplete && item.spruceWorkflowRequestId && (
                                          <JuneMemoCompleteButton requestId={item.spruceWorkflowRequestId} patientId={item.patientId} />
                                        )}
                                      </div>
                                      <p className="whitespace-pre-wrap leading-snug">{item.body}</p>
                                      <div className="flex items-center justify-between mt-1.5">
                                        <span className="text-[10px]" style={{ opacity: 0.6 }}>{ts}</span>
                                        {item.conversationKey && (
                                          <Link href={`/spruce-inbox?key=${encodeURIComponent(item.conversationKey)}`}>
                                            <span className="text-[9px] flex items-center gap-0.5 hover:underline" style={{ color: "#7c5cbf" }}>
                                              <FolderOpen className="w-2.5 h-2.5" /> Open in Inbox
                                            </span>
                                          </Link>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              // ── Internal staff note — full-width amber card ───────
                              if (isInternalNote) {
                                return (
                                  <div key={item.id} className="flex justify-center" data-testid={`timeline-item-${item.id}`}>
                                    <div
                                      className="w-full rounded-lg px-3 py-2 text-xs"
                                      style={{ backgroundColor: "#fef3c7", color: "#78350f", border: "1px solid #fde68a" }}
                                    >
                                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                        <Lock className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "#b45309" }} />
                                        <span
                                          className="text-[9px] font-semibold px-1.5 py-0 rounded leading-[1.6]"
                                          style={{ backgroundColor: "#fde68a", color: "#92400e" }}
                                        >
                                          Internal Note
                                        </span>
                                        <span className="text-[10px] font-medium" style={{ opacity: 0.8 }}>
                                          {item.senderLabel}
                                        </span>
                                      </div>
                                      <p className="whitespace-pre-wrap leading-snug">{renderWithMentions(item.body)}</p>
                                      <div className="mt-1 text-[10px]" style={{ opacity: 0.6 }}>{ts}</div>
                                    </div>
                                  </div>
                                );
                              }

                              if (isSystem) {
                                return (
                                  <div key={item.id} className="flex justify-center" data-testid={`timeline-item-${item.id}`}>
                                    <span
                                      className="text-[10px] italic px-2.5 py-0.5 rounded-full"
                                      style={{ backgroundColor: "#f0ede8", color: "#8a8878" }}
                                    >
                                      {item.eventType ?? 'Non-text event'} · {ts}
                                    </span>
                                  </div>
                                );
                              }

                              const isPortal = item.source === 'portal';
                              // For portal items, use deliveryChannel if present
                              const deliveryCh = item.deliveryChannel;
                              const effectivelyViaPortal = isPortal && deliveryCh !== 'spruce';
                              const channelBadgeStyle = effectivelyViaPortal
                                ? { backgroundColor: "#d4e8c8", color: "#2a4018" }
                                : { backgroundColor: "#c8dcf0", color: "#1a3a5a" };
                              const channelLabel = effectivelyViaPortal
                                ? "ClinIQ Portal"
                                : deliveryCh === 'spruce' ? "Spruce SMS" : "Spruce SMS";

                              // Derive 1-2 letter initials from senderLabel
                              const initials = (() => {
                                const label = item.senderLabel ?? '';
                                if (!label || label === 'Staff' || label === 'System') return 'ST';
                                if (label === 'June AI') return 'AI';
                                if (label === 'Patient') return 'PT';
                                const parts = label.replace(/^(Dr\.|NP|PA|RN|MD|DO)\s*/i, '').trim().split(/\s+/);
                                return parts.length >= 2
                                  ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                                  : label.slice(0, 2).toUpperCase();
                              })();

                              const avatarBg = isOutbound
                                ? effectivelyViaPortal ? "#2a4a1a" : item.sentByAI ? "#3a2a5a" : "#1a3a5a"
                                : "#a08060";

                              return (
                                <div
                                  key={item.id}
                                  className={`flex items-end gap-1.5 ${isOutbound ? "justify-end" : "justify-start"}`}
                                  data-testid={`timeline-item-${item.id}`}
                                >
                                  {/* Inbound: avatar left */}
                                  {!isOutbound && (
                                    <div
                                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                                      style={{ backgroundColor: avatarBg, color: "#f5f0e8" }}
                                      title={item.senderLabel ?? ''}
                                    >
                                      {initials}
                                    </div>
                                  )}

                                  <div className="flex flex-col max-w-[74%]" style={{ alignItems: isOutbound ? 'flex-end' : 'flex-start' }}>
                                    <div
                                      className="rounded-xl px-3 py-2 text-xs w-full"
                                      style={
                                        isOutbound
                                          ? effectivelyViaPortal
                                            ? { backgroundColor: "#3a5a2a", color: "#f0ede8" }
                                            : item.sentByAI
                                              ? { backgroundColor: "#5a3a7a", color: "#f5f0ff" }
                                              : { backgroundColor: "#2a4a6a", color: "#e8f0f8" }
                                          : effectivelyViaPortal
                                            ? { backgroundColor: "#f0ede8", color: "#1c1c14" }
                                            : { backgroundColor: "#e4eef8", color: "#1a2a3a" }
                                      }
                                    >
                                      {/* Channel badge */}
                                      <div className="flex items-center gap-1 mb-1 flex-wrap">
                                        <span
                                          className="text-[9px] font-semibold px-1.5 py-0 rounded leading-[1.6]"
                                          style={channelBadgeStyle}
                                        >
                                          {channelLabel}
                                        </span>
                                        {item.sentByAI && (
                                          <span className="text-[9px] font-semibold px-1 py-0 rounded leading-[1.6]" style={{ backgroundColor: "#e8d8f8", color: "#5a3a7a" }}>
                                            June AI
                                          </span>
                                        )}
                                      </div>
                                      {/* Body */}
                                      <p className="whitespace-pre-wrap leading-snug">{item.body}</p>
                                      {/* Timestamp + unread */}
                                      <div className="flex items-center justify-between gap-2 mt-1">
                                        <span className="text-[10px]" style={{ opacity: 0.6 }}>
                                          {ts}
                                          {!isOutbound && !item.readAt && isPortal && (
                                            <span className="ml-1.5 font-medium" style={{ color: "#c07020", opacity: 1 }}>Unread</span>
                                          )}
                                        </span>
                                        {item.source === 'spruce' && item.conversationKey && (
                                          <Link href={`/spruce-inbox?key=${encodeURIComponent(item.conversationKey)}`}>
                                            <span
                                              className="text-[9px] flex items-center gap-0.5 hover:underline"
                                              style={{ opacity: 0.7 }}
                                              title="Open in Spruce Inbox"
                                            >
                                              <FolderOpen className="w-2.5 h-2.5" />
                                              Inbox
                                            </span>
                                          </Link>
                                        )}
                                      </div>
                                    </div>
                                    {/* Sender name below bubble */}
                                    <span
                                      className="text-[9px] mt-0.5 px-1"
                                      style={{ color: "#9a9a8a" }}
                                    >
                                      {item.senderLabel}
                                    </span>
                                  </div>

                                  {/* Outbound: avatar right */}
                                  {isOutbound && (
                                    <div
                                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                                      style={{ backgroundColor: avatarBg, color: "#f5f0e8" }}
                                      title={item.senderLabel ?? ''}
                                    >
                                      {initials}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div ref={messageBottomRef} />
                          </>
                        )}
                      </div>

                      {/* Composer — Reply to patient OR Internal staff note */}
                      <div className="border-t px-4 pt-2.5 pb-3" style={{ borderColor: "#d4c9b5" }}>
                        {/* Tab bar */}
                        <div className="flex items-center gap-0 mb-2.5" style={{ borderBottom: "1px solid #e5e0d8" }}>
                          <button
                            className="text-[10px] font-semibold px-3 py-1 -mb-px transition-colors"
                            style={composerTab === 'reply'
                              ? { color: "#3a5a2a", borderBottom: "2px solid #3a5a2a" }
                              : { color: "#9a9a8a", borderBottom: "2px solid transparent" }}
                            onClick={() => setComposerTab('reply')}
                            data-testid="tab-composer-reply"
                          >
                            <span className="flex items-center gap-1">
                              <Send className="w-2.5 h-2.5" />
                              Reply to Patient
                            </span>
                          </button>
                          <button
                            className="text-[10px] font-semibold px-3 py-1 -mb-px transition-colors"
                            style={composerTab === 'note'
                              ? { color: "#b45309", borderBottom: "2px solid #b45309" }
                              : { color: "#9a9a8a", borderBottom: "2px solid transparent" }}
                            onClick={() => setComposerTab('note')}
                            data-testid="tab-composer-internal-note"
                          >
                            <span className="flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              Internal Note
                            </span>
                          </button>
                        </div>

                        {composerTab === 'reply' ? (
                          <>
                            {/* Channel picker + availability indicators */}
                            {(replyContext?.availableChannels ?? []).length > 0 && (
                              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                <span className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: "#9a9a8a" }}>Send via</span>
                                {(['portal', 'spruce'] as const).map((ch) => {
                                  const available = (replyContext?.availableChannels ?? []).includes(ch);
                                  const label = ch === 'portal' ? 'ClinIQ Portal' : 'Spruce SMS';
                                  const isSelected = activeChannel === ch;
                                  return (
                                    <button
                                      key={ch}
                                      disabled={!available}
                                      onClick={() => available && setActiveChannel(ch)}
                                      className="text-[9px] font-semibold px-2 py-0.5 rounded transition-colors"
                                      style={
                                        isSelected && available
                                          ? ch === 'portal'
                                            ? { backgroundColor: "#3a5a2a", color: "#f0ede8" }
                                            : { backgroundColor: "#2a4a6a", color: "#e8f0f8" }
                                          : available
                                            ? { backgroundColor: "#f0ede8", color: "#5a5a4a" }
                                            : { backgroundColor: "#f5f5f0", color: "#b0b0a0", cursor: "not-allowed" }
                                      }
                                      title={!available ? `${label} not linked` : undefined}
                                      data-testid={`button-channel-${ch}`}
                                    >
                                      {label}{!available ? ' (not linked)' : ''}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {/* Message input — always visible; channel picker appears once replyContext loads */}
                            {replyContext && (replyContext.availableChannels ?? []).length === 0 ? (
                              <p className="text-[10px] italic py-1" style={{ color: "#9a9a8a" }}>
                                No messaging channel linked. Invite the patient to the portal or connect a Spruce conversation.
                              </p>
                            ) : (
                              <div className="flex items-end gap-2">
                                <textarea
                                  className="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs min-h-[52px] max-h-28 outline-none focus:ring-1 focus:ring-ring"
                                  placeholder={activeChannel === 'spruce' ? "Message via Spruce SMS…" : "Message this patient…"}
                                  rows={2}
                                  value={messageDraft}
                                  onChange={(e) => setMessageDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      if (messageDraft.trim()) replyMutation.mutate({ body: messageDraft.trim(), channel: activeChannel });
                                    }
                                  }}
                                  data-testid="input-clinician-message"
                                />
                                <Button
                                  size="icon"
                                  onClick={() => { if (messageDraft.trim()) replyMutation.mutate({ body: messageDraft.trim(), channel: activeChannel }); }}
                                  disabled={!messageDraft.trim() || replyMutation.isPending}
                                  data-testid="button-clinician-send-message"
                                >
                                  {replyMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          /* Internal Note composer */
                          <>
                            <div
                              className="text-[9px] mb-1.5 flex items-center gap-1 font-medium"
                              style={{ color: "#b45309" }}
                            >
                              <Lock className="w-2.5 h-2.5" />
                              Visible to staff only — never sent to patient
                            </div>
                            <div className="flex items-end gap-2">
                              <textarea
                                className="flex-1 resize-none rounded-md border px-2.5 py-1.5 text-xs min-h-[32px] max-h-20 outline-none focus:ring-1"
                                style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb", color: "#78350f" }}
                                placeholder="Add a staff note…"
                                rows={1}
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (noteDraft.trim()) internalNoteMutation.mutate({ content: noteDraft.trim() });
                                  }
                                }}
                                data-testid="input-internal-note"
                              />
                              <Button
                                size="icon"
                                onClick={() => { if (noteDraft.trim()) internalNoteMutation.mutate({ content: noteDraft.trim() }); }}
                                disabled={!noteDraft.trim() || internalNoteMutation.isPending}
                                data-testid="button-save-internal-note"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Overview: clinical snapshot only ─────────────────────
                  Appointments now live in the top action bar; portal & check-ins
                  have dedicated left-nav sections. The Overview tab focuses on
                  the clinical snapshot. */}
              {profileSection === "overview" && (
                <ClinicalSnapshot labs={labs} patient={selectedPatient} />
              )}

              {/* ── Active Monitoring (vitals episodes + alerts) ───────── */}
              {profileSection === "monitoring" && (
                <MonitoringPanel patientId={selectedPatient.id} />
              )}

              {/* ── PREVENT Calculator (inline panel) ──────────────────── */}
              {profileSection === "prevent" && (
                <Card data-testid="card-prevent-section">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        AHA PREVENT Risk Calculator
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowVitalsDialog(true)}
                        className="text-xs gap-1.5"
                        data-testid="button-open-vitals-from-prevent"
                      >
                        <Heart className="h-3 w-3" />
                        Open Vitals
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PreventCalculatorPanel patient={selectedPatient} />
                  </CardContent>
                </Card>
              )}

              {/* ── Clinical Encounters ─────────────────────────────────── */}
              {profileSection === "encounters" && (
              <>
              <Card data-testid="card-encounters">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-muted-foreground" />
                      Clinical Encounters
                      {patientEncounters.length > 0 && (
                        <Badge variant="secondary" className="text-xs">{patientEncounters.length}</Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => {
                          setExpandedEncounterId(null);
                          setInlineEncounter({ mode: "new" });
                        }}
                        data-testid="button-new-encounter-from-profile"
                        className="text-xs gap-1.5"
                        style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                      >
                        <Plus className="h-3 w-3" />
                        New Encounter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPhoneNote(true)}
                        data-testid="button-new-phone-note"
                        className="text-xs gap-1.5"
                      >
                        <Phone className="h-3 w-3" />
                        + Phone Note
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowNurseNote(true)}
                        data-testid="button-new-nurse-note"
                        className="text-xs gap-1.5"
                      >
                        <Stethoscope className="h-3 w-3" />
                        + Nurse Note
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowManualSoap(true)}
                        data-testid="button-manual-soap-from-profile"
                        className="text-xs gap-1.5"
                      >
                        <FileText className="h-3 w-3" />
                        + Manual SOAP
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {/* INLINE ENCOUNTER EDITOR — when the user clicks "New Encounter"
                    or opens an existing one for editing, the editor renders here
                    in place of the list. They never leave the patient profile. */}
                {inlineEncounter && (
                  <CardContent className="p-0">
                    <div
                      className="px-4 py-2 flex items-center gap-2 border-b"
                      style={{ borderColor: "#e8e0d2", background: "#f9f6f0" }}
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setInlineEncounter(null)}
                        data-testid="button-close-inline-encounter"
                        className="text-xs gap-1.5"
                        style={{ color: "#2e3a20" }}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to encounters
                      </Button>
                      <span className="text-xs ml-2" style={{ color: "#7a8a64" }}>
                        {inlineEncounter.mode === "new" ? "New encounter" : "Editing encounter"} for{" "}
                        <span style={{ color: "#1c2414", fontWeight: 600 }}>
                          {selectedPatient.firstName} {selectedPatient.lastName}
                        </span>
                      </span>
                    </div>
                    <div
                      className="bg-background"
                      style={{ minHeight: "60vh" }}
                      data-testid="inline-encounter-editor"
                    >
                      <EncounterErrorBoundary>
                        <EncounterEditor
                          key={
                            inlineEncounter.mode === "edit"
                              ? `edit-${inlineEncounter.encounterId}`
                              : `new-${selectedPatient.id}`
                          }
                          encounter={
                            inlineEncounter.mode === "edit"
                              ? ((patientEncounters.find(e => e.id === inlineEncounter.encounterId) ?? null) as unknown as EncounterWithPatient | null)
                              : null
                          }
                          patients={allPatients}
                          onClose={() => {
                            setInlineEncounter(null);
                            queryClient.invalidateQueries({ queryKey: ['/api/encounters'] });
                            queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                          }}
                          onDeleted={() => {
                            setInlineEncounter(null);
                            queryClient.invalidateQueries({ queryKey: ['/api/encounters'] });
                            queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                          }}
                          initialPatientId={
                            inlineEncounter.mode === "new" ? String(selectedPatient.id) : undefined
                          }
                        />
                      </EncounterErrorBoundary>
                    </div>
                  </CardContent>
                )}
                {!inlineEncounter && patientEncounters.length === 0 && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">No encounters documented yet. Start one above to create an audio-transcribed SOAP note for this patient.</p>
                  </CardContent>
                )}
                {!inlineEncounter && patientEncounters.length > 0 && (
                  <CardContent className="space-y-2">
                    {patientEncounters.map(enc => {
                      const VISIT_LABELS: Record<string, string> = {
                        "new-patient": "New Patient", "follow-up": "Follow-up", "acute": "Acute Visit",
                        "wellness": "Wellness / Annual", "procedure": "Procedure", "telemedicine": "Telemedicine", "lab-review": "Lab Review",
                        "phone-call": "Phone Call", "nurse-visit": "Nurse Visit",
                      };
                      const noteType = (enc as any).noteType ?? "soap_provider";
                      const NOTE_STYLE: Record<string, { bg: string; fg: string; label: string; Icon: any }> = {
                        soap_provider: { bg: "#e8eedf", fg: "#2e3a20", label: "SOAP", Icon: FileText },
                        nurse:         { bg: "#fde9d3", fg: "#7a4a14", label: "Nurse", Icon: Stethoscope },
                        phone:         { bg: "#dde7f5", fg: "#1d3a66", label: "Phone", Icon: Phone },
                      };
                      const ns = NOTE_STYLE[noteType] ?? NOTE_STYLE.soap_provider;
                      const NoteIcon = ns.Icon;
                      const isSigned = !!enc.signedAt;
                      const hasSoap = !!enc.soapNote;
                      const isExpanded = expandedEncounterId === enc.id;
                      const isAmending = amendingEncounterId === enc.id;
                      const isEvidenceOpen = evidenceOpenId === enc.id;
                      const isSummaryOpen = summaryOpenId === enc.id;
                      const evidenceSuggestions = (enc as any).evidenceSuggestions?.suggestions ?? [];
                      const soapNote = enc.soapNote as any;
                      let soapText: string;
                      if (noteType === "nurse" && Array.isArray(soapNote?.blocks)) {
                        soapText = nurseBlocksToText(soapNote.blocks);
                      } else {
                        soapText = typeof enc.soapNote === 'string' ? enc.soapNote : (soapNote?.fullNote ?? '');
                      }
                      const noteTypeLabel = noteType === "nurse"
                        ? "NURSING ENCOUNTER NOTE"
                        : noteType === "phone"
                          ? "NON-VISIT CONTACT NOTE"
                          : undefined;
                      const noteFilenamePrefix = noteType === "nurse" ? "NURSE"
                        : noteType === "phone" ? "PHONE"
                        : "SOAP";

                      const handleClick = () => {
                        if (isExpanded) {
                          setExpandedEncounterId(null);
                          setAmendingEncounterId(null);
                          setEvidenceOpenId(null);
                          setSummaryOpenId(null);
                        } else {
                          setExpandedEncounterId(enc.id);
                        }
                      };

                      const handlePrintPdf = async (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setPdfExportingEncounterId(enc.id);
                        try {
                          await exportSoapPdf({
                            soapText,
                            patientName: `${selectedPatient?.firstName ?? ''} ${selectedPatient?.lastName ?? ''}`.trim(),
                            visitDate: enc.visitDate as unknown as string,
                            providerName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
                            providerTitle: (user as any)?.title ?? '',
                            providerNpi: (user as any)?.npi ?? null,
                            clinicName: (user as any)?.clinicName ?? 'Clinic',
                            clinicAddress: (user as any)?.address ?? null,
                            clinicPhone: (user as any)?.phone ?? null,
                            clinicLogo: clinicBrandingFull?.clinicLogo ?? null,
                            signedAt: isSigned ? (enc.signedAt as unknown as string) : null,
                            signedBy: enc.signedBy ?? null,
                            signatureImage: isSigned ? ((user as any)?.signatureImage ?? null) : null,
                            isAmended: !!enc.isAmended,
                            branding: clinicBranding,
                            footerText: clinicBrandingFull?.footerText ?? null,
                          });
                        } catch { } finally {
                          setPdfExportingEncounterId(null);
                        }
                      };

                      const summaryText = summaryTextMap[enc.id] ?? "";

                      const handleGenerateSummary = async (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setGeneratingSummaryId(enc.id);
                        setSummaryOpenId(enc.id);
                        try {
                          const res = await apiRequest("POST", `/api/encounters/${enc.id}/generate-summary`);
                          const data = await res.json();
                          const text = data.summary ?? data.patientSummary ?? "";
                          setSummaryTextMap(prev => ({ ...prev, [enc.id]: text }));
                        } catch (err: any) {
                          toast({ variant: "destructive", title: "Summary generation failed", description: err?.message });
                        } finally {
                          setGeneratingSummaryId(null);
                        }
                      };

                      const handleSaveSummary = async () => {
                        setSavingSummaryId(enc.id);
                        try {
                          await apiRequest("PUT", `/api/encounters/${enc.id}/summary`, { patientSummary: summaryText });
                          await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                          toast({ title: "Summary saved" });
                        } catch (err: any) {
                          toast({ variant: "destructive", title: "Save failed", description: err?.message });
                        } finally {
                          setSavingSummaryId(null);
                        }
                      };

                      const handlePublishSummary = async () => {
                        setPublishingSummaryId(enc.id);
                        try {
                          if (summaryText !== (enc.patientSummary ?? "")) {
                            await apiRequest("PUT", `/api/encounters/${enc.id}/summary`, { patientSummary: summaryText });
                          }
                          await apiRequest("POST", `/api/encounters/${enc.id}/publish`);
                          await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                          toast({ title: "Summary published", description: "The patient can now view this summary in their portal." });
                        } catch (err: any) {
                          toast({ variant: "destructive", title: "Publish failed", description: err?.message });
                        } finally {
                          setPublishingSummaryId(null);
                        }
                      };

                      return (
                        <div key={enc.id} className="rounded-md border overflow-hidden" style={{ borderLeft: `4px solid ${ns.fg}` }}>
                          {/* ── Encounter row header ── */}
                          <div
                            data-testid={`encounter-row-${enc.id}`}
                            className="w-full text-left p-3 hover-elevate transition-colors cursor-pointer"
                            onClick={handleClick}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm font-medium whitespace-nowrap">{safeDate(enc.visitDate as unknown as string)}</span>
                                <Badge className="text-[10px] py-0 h-4 gap-0.5 border-0" style={{ backgroundColor: ns.bg, color: ns.fg }}>
                                  <NoteIcon className="w-2.5 h-2.5" />
                                  {ns.label}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] py-0 h-4">
                                  {VISIT_LABELS[enc.visitType] ?? enc.visitType}
                                </Badge>
                                {enc.chiefComplaint && (
                                  <span
                                    className="text-xs text-muted-foreground truncate min-w-0"
                                    title={enc.chiefComplaint}
                                    data-testid={`text-encounter-cc-${enc.id}`}
                                  >
                                    <span className="font-medium text-foreground/80">CC:</span>{" "}
                                    {enc.chiefComplaint}
                                  </span>
                                )}
                                {isSigned && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-700 border-emerald-300 flex items-center gap-0.5">
                                    <Lock className="w-2.5 h-2.5" />
                                    {enc.isAmended ? "Amended" : "Signed"}
                                  </Badge>
                                )}
                                {enc.summaryPublished && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-violet-600 border-violet-200">Published</Badge>
                                )}
                                {enc.summaryPublished && enc.patientSummary && (
                                  <Popover>
                                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 text-violet-600 hover:text-violet-700"
                                        data-testid={`button-pinned-summary-${enc.id}`}
                                        title="View published patient summary"
                                      >
                                        <Paperclip className="w-3.5 h-3.5 -rotate-12" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      align="start"
                                      className="w-80 p-0 border-0 shadow-lg"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div
                                        className="rounded-md overflow-hidden"
                                        style={{
                                          backgroundColor: "#fffbe6",
                                          backgroundImage: "repeating-linear-gradient(transparent, transparent 22px, #e8dca6 22px, #e8dca6 23px)",
                                          boxShadow: "0 6px 16px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.06)",
                                        }}
                                      >
                                        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "#e8dca6", backgroundColor: "#fff7d4" }}>
                                          <Paperclip className="w-3.5 h-3.5 text-violet-600 -rotate-12" />
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Published Summary</p>
                                          <span className="text-[10px] text-amber-700 ml-auto">{safeDate(enc.visitDate as unknown as string)}</span>
                                        </div>
                                        <div className="px-3 py-2 max-h-72 overflow-y-auto">
                                          <pre className="text-[11px] text-gray-800 whitespace-pre-wrap font-sans leading-[22px]">
{enc.patientSummary}
                                          </pre>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {!hasSoap && !isSigned && noteType === "soap_provider" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLocation(`/encounters?encounterId=${enc.id}`);
                                    }}
                                    data-testid={`button-generate-soap-${enc.id}`}
                                    title="Open encounter editor to generate SOAP note"
                                  >
                                    <FileText className="w-3 h-3" />
                                    Generate SOAP
                                  </Button>
                                )}
                                {hasSoap && !isSigned && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] gap-1"
                                    disabled={signingEncounterId === enc.id}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!confirm("Sign and lock this chart note? You can amend it later if needed.")) return;
                                      setSigningEncounterId(enc.id);
                                      try {
                                        await apiRequest("POST", `/api/encounters/${enc.id}/sign`);
                                        await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                                        toast({ title: "Note signed and locked", description: "The chart note has been co-signed and locked for the record." });
                                      } catch (err: any) {
                                        toast({ variant: "destructive", title: "Sign failed", description: err?.message });
                                      } finally {
                                        setSigningEncounterId(null);
                                      }
                                    }}
                                    data-testid={`button-sign-encounter-${enc.id}`}
                                  >
                                    {signingEncounterId === enc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                                    Sign
                                  </Button>
                                )}
                                {hasSoap && (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isAmending) {
                                          setAmendingEncounterId(null);
                                          setAmendText("");
                                        } else if (!isSigned) {
                                          // For unsigned block-based notes, reopen in the original builder
                                          // so the template structure is preserved.
                                          const sn = enc.soapNote as any;
                                          const hasBlocks = Array.isArray(sn?.blocks);
                                          if (noteType === "nurse" && hasBlocks) {
                                            setEditingNurseNoteId(enc.id);
                                          } else if (noteType === "soap_provider" && hasBlocks) {
                                            setEditingManualSoapId(enc.id);
                                          } else if (noteType === "phone") {
                                            setEditingPhoneNoteId(enc.id);
                                          } else {
                                            setAmendText(soapText);
                                            setAmendingEncounterId(enc.id);
                                            setExpandedEncounterId(enc.id);
                                          }
                                        } else {
                                          if (!confirm("Open this note for amendment? A copy of the current signed version will be preserved in the audit trail.")) return;
                                          setAmendText(soapText);
                                          setAmendingEncounterId(enc.id);
                                          setExpandedEncounterId(enc.id);
                                        }
                                      }}
                                      data-testid={`button-amend-encounter-${enc.id}`}
                                      title={isSigned ? "Amend" : "Edit"}
                                    >
                                      <PenLine className={`w-3.5 h-3.5 ${isAmending ? "text-amber-600" : "text-muted-foreground"}`} />
                                    </Button>
                                    {evidenceSuggestions.length > 0 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEvidenceOpenId(isEvidenceOpen ? null : enc.id);
                                          setExpandedEncounterId(enc.id);
                                        }}
                                        data-testid={`button-evidence-encounter-${enc.id}`}
                                        title="Evidence"
                                      >
                                        <BookOpen className={`w-3.5 h-3.5 ${isEvidenceOpen ? "text-primary" : "text-muted-foreground"}`} />
                                      </Button>
                                    )}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isSummaryOpen) {
                                          setSummaryOpenId(null);
                                        } else {
                                          setSummaryOpenId(enc.id);
                                          setExpandedEncounterId(enc.id);
                                          if (enc.patientSummary) {
                                            setSummaryTextMap(prev => ({ ...prev, [enc.id]: enc.patientSummary ?? "" }));
                                          } else {
                                            handleGenerateSummary(e);
                                          }
                                        }
                                      }}
                                      data-testid={`button-summary-encounter-${enc.id}`}
                                      title="Patient Summary"
                                    >
                                      <Sparkles className={`w-3.5 h-3.5 ${isSummaryOpen ? "text-primary" : "text-muted-foreground"}`} />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      disabled={pdfExportingEncounterId === enc.id}
                                      onClick={handlePrintPdf}
                                      data-testid={`button-print-pdf-encounter-${enc.id}`}
                                      title="Print PDF"
                                    >
                                      {pdfExportingEncounterId === enc.id
                                        ? <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                                        : <FileDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!hasSoap && !isSigned) {
                                          try {
                                            await apiRequest("DELETE", `/api/encounters/${enc.id}`);
                                            await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                                            toast({ title: "Encounter deleted" });
                                          } catch {
                                            toast({ variant: "destructive", title: "Delete failed" });
                                          }
                                        } else if (!isSigned) {
                                          if (!confirm("Delete this unsigned note? This cannot be undone.")) return;
                                          try {
                                            await apiRequest("DELETE", `/api/encounters/${enc.id}`);
                                            await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                                            toast({ title: "Encounter deleted" });
                                          } catch {
                                            toast({ variant: "destructive", title: "Delete failed" });
                                          }
                                        } else {
                                          setDeletingEncounterId(enc.id);
                                        }
                                      }}
                                      title="Delete encounter"
                                      data-testid={`button-delete-encounter-${enc.id}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                                    </Button>
                                  </>
                                )}
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </div>
                            </div>
                            {enc.chiefComplaint && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">{enc.chiefComplaint}</p>
                            )}
                            {isSigned && enc.signedBy && (
                              <p className="text-[10px] text-emerald-600/80 mt-0.5">
                                {enc.isAmended ? "Amended and signed" : "Signed"} by {enc.signedBy}
                                {enc.signedAt ? ` · ${new Date(enc.signedAt as string).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ""}
                              </p>
                            )}
                          </div>

                          {/* ── Expanded content ── */}
                          {isExpanded && !hasSoap && (
                            <div className="border-t bg-muted/10 px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>No SOAP note documented for this visit.</span>
                            </div>
                          )}
                          {isExpanded && hasSoap && (
                            <div className="border-t bg-muted/10">
                              {/* Inline Evidence Panel */}
                              {isEvidenceOpen && evidenceSuggestions.length > 0 && (
                                <div className="border-b bg-primary/5 px-4 py-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wide">Evidence-Based Suggestions</p>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEvidenceOpenId(null)} data-testid={`button-close-evidence-${enc.id}`}>
                                      <X className="w-3 h-3 text-muted-foreground" />
                                    </Button>
                                  </div>
                                  {evidenceSuggestions.map((s: any, idx: number) => (
                                    <div key={idx} className="rounded-md border bg-background px-3 py-2 space-y-1">
                                      <div className="flex items-start gap-2">
                                        <span className="text-xs font-medium text-foreground leading-snug flex-1">{s.title}</span>
                                        {s.strength_of_support && (
                                          <span className="text-[10px] text-primary/70 bg-primary/10 rounded px-1.5 py-0.5 flex-shrink-0">{s.strength_of_support}</span>
                                        )}
                                      </div>
                                      {s.rationale && <p className="text-[11px] text-muted-foreground leading-snug">{s.rationale}</p>}
                                      {s.citations && s.citations.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-0.5">
                                          {s.citations.map((c: any, ci: number) => (
                                            <span key={ci} className="text-[10px] text-muted-foreground">
                                              {c.authors ? `${c.authors.split(',')[0]} et al.` : ""}{c.journal ? ` · ${c.journal}` : ""}{c.year ? ` (${c.year})` : ""}
                                              {c.doi && <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">DOI</a>}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Inline Patient Summary Panel */}
                              {isSummaryOpen && (
                                <div className="border-b bg-violet-50/40 px-4 py-3 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-semibold text-violet-700/70 uppercase tracking-wide">Patient Summary</p>
                                    <div className="flex items-center gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-xs text-muted-foreground gap-1"
                                        disabled={generatingSummaryId === enc.id}
                                        onClick={handleGenerateSummary}
                                        data-testid={`button-regenerate-summary-${enc.id}`}
                                      >
                                        <RefreshCw className={`w-3 h-3 ${generatingSummaryId === enc.id ? "animate-spin" : ""}`} />
                                        {enc.patientSummary ? "Regenerate" : "Generate"}
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSummaryOpenId(null)} data-testid={`button-close-summary-${enc.id}`}>
                                        <X className="w-3 h-3 text-muted-foreground" />
                                      </Button>
                                    </div>
                                  </div>
                                  {generatingSummaryId === enc.id ? (
                                    <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
                                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                      Generating patient summary...
                                    </div>
                                  ) : (
                                    <>
                                      <Textarea
                                        value={summaryText}
                                        onChange={(e) => setSummaryTextMap(prev => ({ ...prev, [enc.id]: e.target.value }))}
                                        className="text-xs min-h-[12rem] resize-y"
                                        data-testid={`textarea-summary-${enc.id}`}
                                      />
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-1.5">
                                          {enc.summaryPublished && (
                                            <Badge variant="outline" className="text-[10px] py-0 h-4 text-violet-600 border-violet-200">Published to portal</Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-xs"
                                            disabled={savingSummaryId === enc.id || !summaryText.trim()}
                                            onClick={handleSaveSummary}
                                            data-testid={`button-save-summary-${enc.id}`}
                                          >
                                            {savingSummaryId === enc.id ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving...</> : "Save Draft"}
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="text-xs gap-1.5"
                                            style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                                            disabled={publishingSummaryId === enc.id || !summaryText.trim()}
                                            onClick={handlePublishSummary}
                                            data-testid={`button-publish-summary-${enc.id}`}
                                          >
                                            {publishingSummaryId === enc.id ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Publishing...</> : <><Send className="w-3 h-3" />Publish to Portal</>}
                                          </Button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                              {/* SOAP note body — editable when amending, read-only otherwise */}
                              {isAmending ? (
                                <div className="px-4 py-3 space-y-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] text-amber-700 font-medium">{isSigned ? "Amendment in progress — edit the note below, then re-sign to lock." : "Edit the note below, then sign to lock."}</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-[10px] gap-1 flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTemplatePickerEncounterId(enc.id);
                                        setTemplatePickerNoteType(enc.noteType ?? "");
                                      }}
                                      data-testid={`button-insert-template-${enc.id}`}
                                    >
                                      <FileText className="w-3 h-3" />Insert template
                                    </Button>
                                  </div>
                                  <AmendTextarea
                                    value={amendText}
                                    onChange={setAmendText}
                                    encounterId={enc.id}
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => { e.stopPropagation(); setAmendingEncounterId(null); setAmendText(""); }}
                                      data-testid={`button-cancel-amend-${enc.id}`}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={savingAmend || !amendText.trim()}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setSavingAmend(true);
                                        try {
                                          if (isSigned) {
                                            await apiRequest("POST", `/api/encounters/${enc.id}/amend`);
                                          }
                                          await apiRequest("PUT", `/api/encounters/${enc.id}/soap`, { soapNote: { fullNote: amendText } });
                                          await apiRequest("POST", `/api/encounters/${enc.id}/sign`);
                                          await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                                          setAmendingEncounterId(null);
                                          setAmendText("");
                                          toast({
                                            title: isSigned ? "Amendment saved" : "Note signed and locked",
                                            description: isSigned ? "The note has been re-signed and locked." : "The chart note has been co-signed and locked for the record.",
                                          });
                                        } catch (err: any) {
                                          toast({ variant: "destructive", title: "Save failed", description: err?.message });
                                        } finally {
                                          setSavingAmend(false);
                                        }
                                      }}
                                      data-testid={`button-resignlock-amend-${enc.id}`}
                                    >
                                      {savingAmend ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving...</> : <><Lock className="w-3 h-3 mr-1.5" />{isSigned ? "Re-sign and Lock" : "Save and Sign"}</>}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="px-5 py-4 max-h-96 overflow-y-auto">
                                  <SoapNoteViewer
                                    text={soapText}
                                    evidence={evidenceSuggestions}
                                    mode="flags"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>

              {/* ── Template picker dialog (insert template into edit/amend) ── */}
              {templatePickerEncounterId && (
                <Dialog open onOpenChange={(o) => { if (!o) setTemplatePickerEncounterId(null); }}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />Insert template into note
                      </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground -mt-1">
                      Select a template to append its structure to the note you're editing. Existing content is preserved.
                    </p>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {amendNoteTemplates
                        .filter((t: any) => {
                          if (!templatePickerNoteType) return true;
                          const nt = t.noteType ?? "";
                          if (templatePickerNoteType === "nurse") return nt === "nurse";
                          if (templatePickerNoteType === "phone") return nt === "phone";
                          return nt === "soap_provider" || nt === "soap" || nt === "";
                        })
                        .map((t: any) => (
                          <button
                            key={t.id}
                            className="w-full text-left px-3 py-2.5 rounded-md border hover-elevate"
                            onClick={() => {
                              const text = templateBlocksToText(t.blocks ?? []);
                              if (!text.trim()) return;
                              setAmendText(prev => prev ? `${prev}\n\n${text}` : text);
                              setTemplatePickerEncounterId(null);
                              toast({ title: "Template inserted", description: t.name });
                            }}
                            data-testid={`template-option-${t.id}`}
                          >
                            <p className="text-sm font-medium">{t.name}</p>
                            {t.description && <p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p>}
                          </button>
                        ))}
                      {amendNoteTemplates.filter((t: any) => {
                        if (!templatePickerNoteType) return true;
                        const nt = t.noteType ?? "";
                        if (templatePickerNoteType === "nurse") return nt === "nurse";
                        if (templatePickerNoteType === "phone") return nt === "phone";
                        return nt === "soap_provider" || nt === "soap" || nt === "";
                      }).length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">No templates found for this note type.</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setTemplatePickerEncounterId(null)}>Cancel</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {/* ── Delete signed encounter confirmation ── */}
              <AlertDialog
                open={!!deletingEncounterId}
                onOpenChange={(o) => { if (!o) setDeletingEncounterId(null); }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete signed encounter?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This encounter note has been signed and is part of the clinical record. Deleting it will remove it from the patient's chart. This action is permanent and will be recorded in the audit log.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeletingEncounterId(null)}>Keep note</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground"
                      disabled={isDeletingEncounter}
                      onClick={async () => {
                        if (!deletingEncounterId) return;
                        setIsDeletingEncounter(true);
                        try {
                          await apiRequest("DELETE", `/api/encounters/${deletingEncounterId}`);
                          await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                          toast({ title: "Encounter deleted", description: "The signed encounter has been removed from the record." });
                          setDeletingEncounterId(null);
                        } catch {
                          toast({ variant: "destructive", title: "Delete failed" });
                        } finally {
                          setIsDeletingEncounter(false);
                        }
                      }}
                      data-testid="button-confirm-delete-signed-encounter"
                    >
                      {isDeletingEncounter ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Deleting…</> : "Delete encounter"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              </>
              )}

              {/* ── Lab History ──────────────────────────────────────────── */}
              {profileSection === "labs" && (
                <>
                  <LabHistoryList
                    labs={labs}
                    simpleUploads={simpleLabs}
                    onViewLab={setViewingLab}
                    onDeleteLab={handleDeleteLab}
                    deletingId={deleteMutation.isPending && confirmDelete ? confirmDelete.id : null}
                    onDeleteSimpleUpload={(id) => deleteSimpleLabMutation.mutate(id)}
                    deletingSimpleUploadId={deleteSimpleLabMutation.isPending ? (deleteSimpleLabMutation.variables as number) : null}
                    onPublishLab={handlePublishLab}
                    hasPortalAccount={portalStatus?.hasPortalAccount}
                    publishingId={publishingLabId}
                    publishedLabResultIds={portalStatus?.publishedLabResultIds}
                    patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`.trim()}
                  />
                  {allLabsForTrending.length >= 2 && (
                    <PatientTrendCharts
                      labs={allLabsForTrending}
                      patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                      patientId={selectedPatient.id}
                      gender={selectedPatient.gender === 'female' ? 'female' : 'male'}
                    />
                  )}
                  {insights.length > 0 && <EnrichedTrendInsights insights={insights} />}
                </>
              )}

              {/* ── Clinical Orders & Referrals ──────────────────────── */}
              {profileSection === "orders" && selectedPatient && (
                <PatientOrdersTab
                  patientId={selectedPatient.id}
                  patientName={`${selectedPatient.firstName ?? ""} ${selectedPatient.lastName ?? ""}`.trim()}
                />
              )}

              {/* ── Documents: supplement orders + forms & consents ────── */}
              {profileSection === "documents" && (
                <>
              {/* ── Supplement Orders ─────────────────────────────────────── */}
              {patientOrders.length > 0 && (
                <Card data-testid="card-supplement-orders">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                        Supplement Orders
                        {patientOrders.filter(o => o.status === 'pending').length > 0 && (
                          <Badge className="text-xs" style={{ backgroundColor: "#7a5c20", color: "#fdf8ee" }}>
                            {patientOrders.filter(o => o.status === 'pending').length} pending
                          </Badge>
                        )}
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setShowOrders(!showOrders)} className="text-xs" data-testid="button-toggle-orders">
                        {showOrders ? "Hide" : "View orders"}
                      </Button>
                    </div>
                  </CardHeader>
                  {showOrders && (
                    <CardContent className="space-y-3">
                      {patientOrders.map((order) => (
                        <div key={order.id} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "#e0d4b8", backgroundColor: order.status === 'pending' ? "#fdfaf3" : "transparent" }}>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {order.status === 'pending' ? (
                                <Badge className="text-xs" style={{ backgroundColor: "#7a5c20", color: "#fdf8ee" }}>Pending</Badge>
                              ) : order.status === 'fulfilled' ? (
                                <Badge variant="secondary" className="text-xs">Fulfilled</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Cancelled</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">${parseFloat(order.subtotal).toFixed(2)}</span>
                              {order.status === 'pending' && (
                                <Button size="sm" variant="ghost" className="text-xs h-7 px-2 gap-1" onClick={() => fulfillOrderMutation.mutate(order.id)} disabled={fulfillOrderMutation.isPending} data-testid={`button-fulfill-${order.id}`}>
                                  <CheckCircle className="w-3 h-3" />
                                  Mark fulfilled
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {order.items.map((item, i) => (
                              <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{item.name} ({item.dose}) × {item.quantity}</span>
                                <span>${item.lineTotal.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          {order.patientNotes && (
                            <p className="text-xs text-muted-foreground italic border-t pt-2 mt-1">"{order.patientNotes}"</p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* ── Forms & Consents ──────────────────────────────────────── */}
              <Card data-testid="card-patient-forms">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      Forms & Consents
                      {patientFormAssignments.filter((a: any) => a.status === "pending").length > 0 && (
                        <Badge className="text-xs" style={{ backgroundColor: "#c0392b", color: "#fff" }}>
                          {patientFormAssignments.filter((a: any) => a.status === "pending").length} pending
                        </Badge>
                      )}
                      {patientFormSubmissions.filter((s: any) => s.reviewStatus === "pending").length > 0 && (
                        <Badge className="text-xs" style={{ backgroundColor: "#5a7040", color: "#fff" }}>
                          {patientFormSubmissions.filter((s: any) => s.reviewStatus === "pending").length} to review
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowForms(!showForms)} className="text-xs" data-testid="button-toggle-forms">
                        {showForms ? "Hide" : "Show"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setShowAssignFormDialog(true)}
                        data-testid="button-assign-form"
                      >
                        <Plus className="h-3 w-3" /> Assign Form
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setShowSendEmailDialog(true)}
                        data-testid="button-send-form-email"
                      >
                        <Send className="h-3 w-3" /> Send to Email
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => { setShowAssignPacketDialog(true); setLastAssignedPacketUrl(null); }}
                        data-testid="button-assign-packet"
                      >
                        <ClipboardList className="h-3 w-3" /> Assign Packet
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {showForms && (
                  <CardContent className="space-y-4">
                    {/* Pending Packets */}
                    {patientPackets.filter((p: any) => p.status !== "completed").length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Pending Packets</p>
                        {patientPackets.filter((p: any) => p.status !== "completed").map((packet: any) => {
                          const forms = (packet.formOrderJson as any[]) ?? [];
                          const completedCount = forms.filter((f: any) => f.completed).length;
                          return (
                            <div key={packet.id} className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3" data-testid={`packet-pending-${packet.id}`}>
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div>
                                  <p className="text-sm font-medium">{packet.bundleName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {completedCount}/{forms.length} forms complete · Assigned {new Date(packet.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400">
                                    <ClipboardList className="h-2.5 w-2.5 mr-1" />In-Clinic Packet
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs gap-1"
                                    onClick={() => window.open(`/packet/${packet.packetToken}`, "_blank")}
                                    data-testid={`button-open-packet-${packet.id}`}
                                  >
                                    <Eye className="h-3 w-3" /> Open Packet
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`${window.location.origin}/packet/${packet.packetToken}`);
                                      toast({ title: "Packet link copied" });
                                    }}
                                    data-testid={`button-copy-packet-link-${packet.id}`}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      if (window.confirm("Remove this packet assignment? This cannot be undone.")) {
                                        deletePacketMutation.mutate(packet.id);
                                      }
                                    }}
                                    disabled={deletePacketMutation.isPending}
                                    data-testid={`button-delete-packet-${packet.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Completed Packets (collapsed summary) */}
                    {patientPackets.filter((p: any) => p.status === "completed").length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed Packets</p>
                        {patientPackets.filter((p: any) => p.status === "completed").map((packet: any) => (
                          <div key={packet.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1" data-testid={`packet-completed-${packet.id}`}>
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            <span>{packet.bundleName}</span>
                            <span>·</span>
                            <span>{packet.completedAt ? new Date(packet.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Completed"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Last assigned packet quick-open */}
                    {lastAssignedPacketUrl && (
                      <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3 flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">Packet ready</p>
                          <p className="text-xs text-muted-foreground">Hand device to patient or open in a new tab</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => window.open(lastAssignedPacketUrl, "_blank")} data-testid="button-open-new-packet">
                            <Eye className="h-3 w-3 mr-1" /> Open Packet
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setLastAssignedPacketUrl(null)} data-testid="button-dismiss-packet-banner">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                    {/* Pending Assignments */}
                    {patientFormAssignments.filter((a: any) => a.status === "pending").length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Pending Forms</p>
                        {patientFormAssignments.filter((a: any) => a.status === "pending").map((assignment: any) => {
                          const formDef = availableForms.find((f: any) => f.id === assignment.formId);
                          const formName = formDef?.name ?? "Unknown Form";
                          return (
                            <div key={assignment.id} className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3" data-testid={`form-assignment-pending-${assignment.id}`}>
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div>
                                  <p className="text-sm font-medium">{formName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Assigned {new Date(assignment.assignedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    {assignment.dueAt && ` — Due ${new Date(assignment.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
                                    <Clock className="h-2.5 w-2.5 mr-1" />Awaiting Patient
                                  </Badge>
                                  {selectedPatient?.email && (
                                    <Button size="sm" variant="outline" className="text-xs"
                                      onClick={() => sendFormLinkMutation.mutate({ patientId: selectedPatient!.id, formId: assignment.formId, method: "email" })}
                                      disabled={sendFormLinkMutation.isPending}
                                      data-testid={`button-send-form-email-${assignment.id}`}>
                                      <Send className="h-3 w-3 mr-1" /> Send Email
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="text-xs"
                                    onClick={() => sendFormLinkMutation.mutate({ patientId: selectedPatient!.id, formId: assignment.formId, method: "link" })}
                                    disabled={sendFormLinkMutation.isPending}
                                    data-testid={`button-copy-form-link-${assignment.id}`}>
                                    <Copy className="h-3 w-3 mr-1" /> Copy Link
                                  </Button>
                                  <Button size="sm" variant="outline" className="text-xs"
                                    onClick={() => {
                                      const newTab = window.open("about:blank", "_blank");
                                      sendFormLinkMutation.mutate({ patientId: selectedPatient!.id, formId: assignment.formId, method: "link" }, {
                                        onSuccess: (data: any) => {
                                          const url = data.formUrl ? buildPrefillUrl(data.formUrl, data.prefill) : null;
                                          if (url && newTab) { newTab.location.href = url; }
                                          else if (url) { window.open(url, "_blank"); }
                                        },
                                        onError: () => { if (newTab) newTab.close(); }
                                      });
                                    }}
                                    disabled={sendFormLinkMutation.isPending}
                                    data-testid={`button-fill-in-clinic-${assignment.id}`}>
                                    <Eye className="h-3 w-3 mr-1" /> Fill In Clinic
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      if (window.confirm("Remove this form assignment? This cannot be undone.")) {
                                        deleteAssignmentMutation.mutate(assignment.id);
                                      }
                                    }}
                                    disabled={deleteAssignmentMutation.isPending}
                                    data-testid={`button-delete-assignment-${assignment.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Completed Submissions */}
                    {patientFormSubmissions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed Submissions</p>
                        {patientFormSubmissions.map((sub: any) => (
                          <div key={sub.id} className="rounded-md border p-3 space-y-1.5" data-testid={`form-submission-row-${sub.id}`}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <p className="text-sm font-medium">{sub.formName}</p>
                                <p className="text-xs text-muted-foreground">{new Date(sub.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs gap-1"
                                  onClick={() => setPreviewSubId(sub.id)}
                                  data-testid={`button-view-submission-${sub.id}`}
                                >
                                  <Eye className="h-3 w-3" />
                                  View
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (window.confirm("Delete this form submission? This cannot be undone.")) {
                                      deleteSubmissionMutation.mutate(sub.id);
                                    }
                                  }}
                                  disabled={deleteSubmissionMutation.isPending}
                                  data-testid={`button-delete-submission-${sub.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                                {sub.reviewStatus === "reviewed" ? (
                                  <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400">Reviewed</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">Pending Review</Badge>
                                )}
                                {sub.syncStatus === "synced" ? (
                                  <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400">Synced</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">Not Synced</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {patientFormAssignments.length === 0 && patientFormSubmissions.length === 0 && (
                      <p className="text-sm text-muted-foreground">No forms assigned or submitted yet. Use "Assign Form" to send a digital form to this patient.</p>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* ── Uploaded Documents (drag-drop + camera scan) ─────────── */}
              {selectedPatient?.id && (
                <PatientDocumentsCard patientId={selectedPatient.id} />
              )}
                </>
              )}

                </div>{/* /middle col */}

                {/* Right col: context rail */}
                {rightPanelOpen ? (
                  <div className="hidden md:flex md:flex-col w-64 xl:w-72 flex-shrink-0 border-l overflow-hidden" style={{ borderColor: "#e8ddd0" }}>
                    <PatientContextRail
                      labs={labs}
                      simpleLabs={simpleLabs}
                      patientId={selectedPatient.id}
                      rightPanelTab={rightPanelTab}
                      setRightPanelTab={setRightPanelTab}
                      onCollapse={() => setRightPanelOpen(false)}
                      onOpenLab={(lab) => setViewingLab(lab)}
                    />
                  </div>
                ) : (
                  <div className="hidden md:flex flex-col flex-shrink-0 border-l" style={{ borderColor: "#e8ddd0" }}>
                    <button
                      onClick={() => setRightPanelOpen(true)}
                      className="flex-1 flex items-start pt-3 justify-center px-1.5 hover-elevate active-elevate-2"
                      title="Expand context rail"
                      data-testid="button-expand-context-rail"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                )}
              </div>{/* /three-column body */}

              {/* Assign Form Dialog */}
              <Dialog open={showAssignFormDialog} onOpenChange={setShowAssignFormDialog}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Assign Form to Patient</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Select a form to assign to {selectedPatient?.firstName} {selectedPatient?.lastName}.
                    </p>

                    {/* Delivery mode selector */}
                    <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                      <p className="text-xs font-medium">Delivery mode</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAssignDeliveryMode("portal")}
                          className={`text-left rounded-md border p-2 text-xs hover-elevate ${assignDeliveryMode === "portal" ? "border-[#2e3a20] bg-background ring-1 ring-[#2e3a20]" : "bg-background/40"}`}
                          data-testid="button-delivery-portal"
                        >
                          <div className="font-medium text-sm">Push to Patient Portal</div>
                          <div className="text-muted-foreground mt-0.5">Patient can complete it ahead of their appointment. They will be notified by email + portal message.</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignDeliveryMode("in_clinic")}
                          className={`text-left rounded-md border p-2 text-xs hover-elevate ${assignDeliveryMode === "in_clinic" ? "border-[#2e3a20] bg-background ring-1 ring-[#2e3a20]" : "bg-background/40"}`}
                          data-testid="button-delivery-in-clinic"
                        >
                          <div className="font-medium text-sm">In-Clinic Only</div>
                          <div className="text-muted-foreground mt-0.5">Hidden from the portal. Use for consent forms or anything requiring a witness signature.</div>
                        </button>
                      </div>
                    </div>

                    <ScrollArea className="h-64">
                      <div className="space-y-2 pr-2">
                        {availableForms.filter((f: any) => f.status === "active").length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-6">No published forms available. Create and publish a form from the Forms page.</p>
                        )}
                        {availableForms.filter((f: any) => f.status === "active").map((form: any) => {
                          const alreadyPending = patientFormAssignments.some((a: any) => a.formId === form.id && a.status === "pending");
                          return (
                            <div key={form.id} className="rounded-md border p-3 space-y-2" data-testid={`assign-form-option-${form.id}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">{form.name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{form.category} · {form.status}</p>
                                </div>
                                {alreadyPending && (
                                  <Badge variant="outline" className="text-xs text-amber-600 flex-shrink-0">Already assigned</Badge>
                                )}
                              </div>
                              {!alreadyPending && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Button size="sm" className="text-xs"
                                    onClick={() => {
                                      if (selectedPatient) {
                                        assignFormMutation.mutate({ patientId: selectedPatient.id, formId: form.id, deliveryMode: assignDeliveryMode });
                                        setShowAssignFormDialog(false);
                                      }
                                    }}
                                    disabled={assignFormMutation.isPending}
                                    data-testid={`button-assign-form-${form.id}`}>
                                    <Plus className="h-3 w-3 mr-1" /> {assignDeliveryMode === "in_clinic" ? "Assign (in-clinic)" : "Assign & Notify"}
                                  </Button>
                                  {assignDeliveryMode === "portal" && selectedPatient?.email && (
                                    <Button size="sm" variant="outline" className="text-xs"
                                      onClick={() => {
                                        if (selectedPatient) {
                                          sendFormLinkMutation.mutate({ patientId: selectedPatient.id, formId: form.id, method: "email" });
                                          setShowAssignFormDialog(false);
                                        }
                                      }}
                                      disabled={sendFormLinkMutation.isPending}
                                      data-testid={`button-assign-send-email-${form.id}`}>
                                      <Send className="h-3 w-3 mr-1" /> Send Email Only
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="text-xs"
                                    onClick={() => {
                                      if (selectedPatient) {
                                        const newTab = window.open("about:blank", "_blank");
                                        // Always create the assignment in the chosen mode, then open the form to fill in clinic
                                        assignFormMutation.mutate(
                                          { patientId: selectedPatient.id, formId: form.id, deliveryMode: assignDeliveryMode },
                                          {
                                            onSettled: () => {
                                              sendFormLinkMutation.mutate({ patientId: selectedPatient.id, formId: form.id, method: "link" }, {
                                                onSuccess: (data: any) => {
                                                  const url = data.formUrl ? buildPrefillUrl(data.formUrl, data.prefill) : null;
                                                  if (url && newTab) { newTab.location.href = url; }
                                                  else if (url) { window.open(url, "_blank"); }
                                                  setShowAssignFormDialog(false);
                                                },
                                                onError: () => { if (newTab) newTab.close(); }
                                              });
                                            },
                                          }
                                        );
                                      }
                                    }}
                                    disabled={sendFormLinkMutation.isPending || assignFormMutation.isPending}
                                    data-testid={`button-assign-fill-clinic-${form.id}`}>
                                    <Eye className="h-3 w-3 mr-1" /> Fill In Clinic
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Assign Packet Dialog */}
              <Dialog open={showAssignPacketDialog} onOpenChange={(v) => { if (!v) { setShowAssignPacketDialog(false); setAssigningPacketBundleId(null); } }}>
                <DialogContent className="max-w-md" data-testid="dialog-assign-packet">
                  <DialogHeader>
                    <DialogTitle>Assign Packet to Patient</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Select a form bundle to assign as an in-clinic packet for{" "}
                      <strong>{selectedPatient?.firstName} {selectedPatient?.lastName}</strong>.
                      The patient will complete all forms sequentially on a shared device.
                    </p>
                    {formBundles.length === 0 ? (
                      <div className="rounded-md border bg-muted/30 p-4 text-center space-y-2">
                        <p className="text-sm text-muted-foreground">No form bundles yet.</p>
                        <p className="text-xs text-muted-foreground">Create bundles in <strong>Digital Forms → Bundles</strong>.</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-72">
                        <div className="space-y-2 pr-2">
                          {formBundles.map((b: any) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setAssigningPacketBundleId(b.id)}
                              className={`w-full text-left rounded-md border p-3 transition-colors hover-elevate ${assigningPacketBundleId === b.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background/60"}`}
                              data-testid={`button-select-bundle-${b.id}`}
                            >
                              <p className="text-sm font-medium">{b.name}</p>
                              {b.description && <p className="text-xs text-muted-foreground mt-0.5">{b.description}</p>}
                              <p className="text-xs text-muted-foreground mt-1">
                                {b.items?.length ?? 0} form{(b.items?.length ?? 0) !== 1 ? "s" : ""}
                                {b.items?.length > 0 && ` · ${b.items.map((item: any, _i: number) => item.formId).join(", ")}`}
                              </p>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAssignPacketDialog(false)}>Cancel</Button>
                    <Button
                      onClick={() => {
                        if (selectedPatient && assigningPacketBundleId) {
                          assignPacketMutation.mutate({ patientId: selectedPatient.id, bundleId: assigningPacketBundleId });
                        }
                      }}
                      disabled={!assigningPacketBundleId || assignPacketMutation.isPending}
                      data-testid="button-confirm-assign-packet"
                    >
                      {assignPacketMutation.isPending ? "Assigning..." : "Assign & Get Link"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={showSendEmailDialog} onOpenChange={(v) => { if (!v) { setShowSendEmailDialog(false); setSendEmailFormId(null); setSendEmailAddress(""); setSendEmailName(""); } }}>
                <DialogContent className="max-w-md" data-testid="dialog-send-form-email">
                  <DialogHeader>
                    <DialogTitle>Send Form to Email</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Send a form link to any email address. If the recipient is a new patient, their profile will be created automatically when they submit the form using smart fields.
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Form</label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={sendEmailFormId ?? ""}
                        onChange={(e) => setSendEmailFormId(e.target.value ? parseInt(e.target.value) : null)}
                        data-testid="select-send-email-form"
                      >
                        <option value="">Select a form...</option>
                        {availableForms.filter((f: any) => f.status === "active").map((f: any) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Recipient Name (optional)</label>
                      <input
                        type="text"
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="Jane Smith"
                        value={sendEmailName}
                        onChange={(e) => setSendEmailName(e.target.value)}
                        data-testid="input-send-email-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Email Address</label>
                      <input
                        type="email"
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="patient@example.com"
                        value={sendEmailAddress}
                        onChange={(e) => setSendEmailAddress(e.target.value)}
                        data-testid="input-send-email-address"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowSendEmailDialog(false); setSendEmailFormId(null); setSendEmailAddress(""); setSendEmailName(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!sendEmailFormId || !sendEmailAddress || sendFormToEmailMutation.isPending}
                      onClick={() => {
                        if (sendEmailFormId && sendEmailAddress) {
                          sendFormToEmailMutation.mutate({
                            formId: sendEmailFormId,
                            recipientEmail: sendEmailAddress,
                            recipientName: sendEmailName || undefined,
                          });
                        }
                      }}
                      style={{ backgroundColor: "#2e3a20", color: "#fff" }}
                      data-testid="button-send-email-submit"
                    >
                      {sendFormToEmailMutation.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Sending...</> : <><Send className="h-3 w-3 mr-1" /> Send Form</>}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {showNurseNote && selectedPatient && (
                <NurseNoteBuilder
                  patientId={selectedPatient.id}
                  onClose={() => {
                    setShowNurseNote(false);
                    queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                    setShowEncounters(true);
                  }}
                />
              )}

              {editingNurseNoteId !== null && selectedPatient && (
                <NurseNoteBuilder
                  patientId={selectedPatient.id}
                  initialEncounterId={editingNurseNoteId}
                  onClose={() => {
                    setEditingNurseNoteId(null);
                    queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                  }}
                />
              )}

              {showPhoneNote && selectedPatient && (
                <PhoneNoteDialog
                  patientId={selectedPatient.id}
                  onClose={() => {
                    setShowPhoneNote(false);
                    queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                    setShowEncounters(true);
                  }}
                />
              )}

              {editingPhoneNoteId !== null && selectedPatient && (
                <PhoneNoteDialog
                  patientId={selectedPatient.id}
                  initialEncounterId={editingPhoneNoteId}
                  onClose={() => {
                    setEditingPhoneNoteId(null);
                    queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                  }}
                />
              )}

              {showManualSoap && selectedPatient && (
                <Dialog open={showManualSoap} onOpenChange={setShowManualSoap}>
                  <DialogContent className="max-w-3xl h-[85vh] p-0 overflow-hidden !flex flex-col [&>button:last-child]:hidden" data-testid="dialog-manual-soap">
                    <ManualSoapBuilder
                      patientId={selectedPatient.id}
                      patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                      clinicianId={(user as any)?.id ?? 0}
                      onClose={() => setShowManualSoap(false)}
                      onSaved={() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                        setShowManualSoap(false);
                        setShowEncounters(true);
                      }}
                    />
                  </DialogContent>
                </Dialog>
              )}

              {editingManualSoapId !== null && selectedPatient && (
                <Dialog open onOpenChange={(o) => { if (!o) setEditingManualSoapId(null); }}>
                  <DialogContent className="max-w-3xl h-[85vh] p-0 overflow-hidden !flex flex-col [&>button:last-child]:hidden" data-testid="dialog-edit-manual-soap">
                    <ManualSoapBuilder
                      patientId={selectedPatient.id}
                      patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                      clinicianId={(user as any)?.id ?? 0}
                      initialEncounterId={editingManualSoapId}
                      onClose={() => setEditingManualSoapId(null)}
                      onSaved={() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient.id] });
                        setEditingManualSoapId(null);
                      }}
                    />
                  </DialogContent>
                </Dialog>
              )}

              <FormSubmissionPreviewDialog
                submissionId={previewSubId}
                onClose={() => setPreviewSubId(null)}
                clinic={{
                  clinicName: (user as any)?.clinicName ?? "ClinIQ",
                  clinicLogo: clinicBrandingFull?.clinicLogo ?? (user as any)?.clinicLogo ?? null,
                  phone: (user as any)?.phone ?? null,
                  address: (user as any)?.address ?? null,
                  email: (user as any)?.email ?? null,
                }}
              />

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

      {/* Book Appointment Dialog */}
      <AppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
        defaultPatientId={selectedPatient?.id ?? null}
      />

      {/* Upcoming Appointments Dialog (opened from top action bar) */}
      {selectedPatient && (
        <Dialog open={showUpcomingApptsDialog} onOpenChange={setShowUpcomingApptsDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-upcoming-appointments">
            <DialogHeader>
              <DialogTitle>Upcoming Appointments</DialogTitle>
            </DialogHeader>
            <UpcomingAppointmentsCard
              patientId={selectedPatient.id}
              onBook={() => {
                setShowUpcomingApptsDialog(false);
                setShowAppointmentDialog(true);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Vitals Dialog */}
      {selectedPatient && (
        <VitalsDialog
          open={showVitalsDialog}
          onOpenChange={setShowVitalsDialog}
          patientId={selectedPatient.id}
          patientName={`${selectedPatient.firstName ?? ''} ${selectedPatient.lastName ?? ''}`.trim()}
          onShowTrends={() => {
            setShowVitalsDialog(false);
            setShowVitalTrendsDialog(true);
          }}
        />
      )}

      {selectedPatient && (
        <VitalTrendsDialog
          open={showVitalTrendsDialog}
          onOpenChange={setShowVitalTrendsDialog}
          patientId={selectedPatient.id}
          patientName={`${selectedPatient.firstName ?? ''} ${selectedPatient.lastName ?? ''}`.trim()}
        />
      )}

      {/* Invite to Portal Modal */}
      {showInviteModal && selectedPatient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" data-testid="invite-portal-modal">
          <Card className="w-full max-w-md m-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Leaf className="h-5 w-5" style={{ color: "#2e3a20" }} />
                {inviteLink ? "Invitation Sent" : "Invite to Patient Portal"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inviteLink ? (
                <>
                  <div className="rounded-md px-3 py-2.5 text-sm flex items-start gap-2.5" style={{ backgroundColor: "#edf2e6" }}>
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#2e3a20" }} />
                    <div>
                      <p className="font-medium" style={{ color: "#1c2414" }}>
                        {inviteEmailSent === false
                          ? "Portal account created — email could not be sent"
                          : `Invite email sent to ${inviteEmail}`}
                      </p>
                      {inviteEmailSent === false && (
                        <p className="text-xs mt-0.5" style={{ color: "#5a6a48" }}>
                          Share the link below directly with {selectedPatient.firstName}.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Portal setup link — share if email doesn't arrive
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={inviteLink}
                        className="text-xs font-mono h-9"
                        data-testid="input-invite-link"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-shrink-0 h-9 gap-1.5"
                        data-testid="button-copy-invite-link"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteLink);
                          toast({ title: "Link copied", description: "Paste it in a text or email to the patient." });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This link expires in 72 hours. Have {selectedPatient.firstName} check spam if they don't see the email.
                    </p>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={() => { setShowInviteModal(false); setInviteEmail(""); setInviteLink(null); setInviteEmailSent(null); }}
                      style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                      data-testid="button-done-invite"
                    >
                      Done
                    </Button>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
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
                  {safeDate(confirmDelete.labDate)}
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

      {/* New Patient dialog */}
      <Dialog open={showNewPatientDialog} onOpenChange={setShowNewPatientDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Patient Profile
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Jane"
                  value={newPatientForm.firstName}
                  onChange={e => setNewPatientForm(f => ({ ...f, firstName: e.target.value }))}
                  data-testid="input-new-patient-first-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Smith"
                  value={newPatientForm.lastName}
                  onChange={e => setNewPatientForm(f => ({ ...f, lastName: e.target.value }))}
                  data-testid="input-new-patient-last-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={newPatientForm.dateOfBirth}
                  onChange={e => setNewPatientForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  data-testid="input-new-patient-dob"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sex</Label>
                <Select value={newPatientForm.gender} onValueChange={v => setNewPatientForm(f => ({ ...f, gender: v as "male" | "female" }))}>
                  <SelectTrigger data-testid="select-new-patient-gender"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-xs text-muted-foreground">(optional — used for form & appointment matching)</span></Label>
              <Input
                type="email"
                placeholder="jane@email.com"
                value={newPatientForm.email}
                onChange={e => setNewPatientForm(f => ({ ...f, email: e.target.value }))}
                data-testid="input-new-patient-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                type="tel"
                placeholder="(555) 000-0000"
                value={newPatientForm.phone}
                onChange={e => setNewPatientForm(f => ({ ...f, phone: e.target.value }))}
                data-testid="input-new-patient-phone"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNewPatientDialog(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!newPatientForm.firstName.trim() || !newPatientForm.lastName.trim() || createNewPatientMutation.isPending}
              onClick={() => createNewPatientMutation.mutate(newPatientForm)}
              data-testid="button-create-new-patient"
              style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
            >
              {createNewPatientMutation.isPending ? "Creating..." : "Create Patient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Patient dialog */}
      <Dialog open={showEditPatient} onOpenChange={setShowEditPatient}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Patient Profile
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto max-h-[calc(100vh-14rem)]">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-first-name">First Name</Label>
                <Input
                  id="edit-first-name"
                  value={editPatientForm.firstName}
                  onChange={e => setEditPatientForm(f => ({ ...f, firstName: e.target.value }))}
                  data-testid="input-edit-patient-first-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-last-name">Last Name</Label>
                <Input
                  id="edit-last-name"
                  value={editPatientForm.lastName}
                  onChange={e => setEditPatientForm(f => ({ ...f, lastName: e.target.value }))}
                  data-testid="input-edit-patient-last-name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="patient@example.com"
                value={editPatientForm.email}
                onChange={e => setEditPatientForm(f => ({ ...f, email: e.target.value }))}
                data-testid="input-edit-patient-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-dob">Date of Birth</Label>
                <Input
                  id="edit-dob"
                  type="date"
                  value={editPatientForm.dateOfBirth}
                  onChange={e => setEditPatientForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  data-testid="input-edit-patient-dob"
                />
                <p className="text-xs text-muted-foreground">Used to auto-calculate age on lab panels</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  placeholder="(555) 000-0000"
                  value={editPatientForm.phone}
                  onChange={e => setEditPatientForm(f => ({ ...f, phone: e.target.value }))}
                  data-testid="input-edit-patient-phone"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                placeholder="123 Main St, City, ST 12345"
                value={editPatientForm.address}
                onChange={e => setEditPatientForm(f => ({ ...f, address: e.target.value }))}
                data-testid="input-edit-patient-address"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-gender">Sex</Label>
              <Select value={editPatientForm.gender} onValueChange={v => setEditPatientForm(f => ({ ...f, gender: v as "male" | "female" }))}>
                <SelectTrigger id="edit-gender" data-testid="select-edit-patient-gender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Determines which clinical reference ranges are used for lab panels</p>
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Insurance & ID</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-insurance-carrier">Insurance Carrier</Label>
                  <Input
                    id="edit-insurance-carrier"
                    placeholder="e.g. Blue Cross"
                    value={editPatientForm.insuranceCarrier}
                    onChange={e => setEditPatientForm(f => ({ ...f, insuranceCarrier: e.target.value }))}
                    data-testid="input-edit-patient-insurance-carrier"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-insurance-member-id">Member ID</Label>
                  <Input
                    id="edit-insurance-member-id"
                    placeholder="Member / Policy #"
                    value={editPatientForm.insuranceMemberId}
                    onChange={e => setEditPatientForm(f => ({ ...f, insuranceMemberId: e.target.value }))}
                    data-testid="input-edit-patient-insurance-member-id"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-drivers-license">Driver's License</Label>
                  <Input
                    id="edit-drivers-license"
                    placeholder="DL number"
                    value={editPatientForm.driversLicense}
                    onChange={e => setEditPatientForm(f => ({ ...f, driversLicense: e.target.value }))}
                    data-testid="input-edit-patient-drivers-license"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-ssn">SSN</Label>
                  <Input
                    id="edit-ssn"
                    placeholder="XXX-XX-XXXX"
                    value={editPatientForm.ssn}
                    onChange={e => setEditPatientForm(f => ({ ...f, ssn: e.target.value }))}
                    data-testid="input-edit-patient-ssn"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-provider">Primary Provider</Label>
              {clinicProviders.length > 1 ? (
                <Select
                  value={editPatientForm.primaryProvider}
                  onValueChange={v => setEditPatientForm(f => ({ ...f, primaryProvider: v }))}
                >
                  <SelectTrigger id="edit-provider" data-testid="select-edit-patient-provider">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clinicProviders as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={p.displayName}>
                        {p.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="edit-provider"
                  value={editPatientForm.primaryProvider}
                  readOnly
                  className="bg-muted/40 cursor-default"
                  data-testid="input-edit-patient-provider"
                />
              )}
              <p className="text-xs text-muted-foreground">Defaults to clinic owner. Will become a dropdown when multiple providers are in the clinic.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-pharmacy">Preferred Pharmacy</Label>
              <PharmacyLookup
                inputId="edit-pharmacy"
                value={editPatientPharmacy}
                onChange={setEditPatientPharmacy}
                placeholder="Search pharmacy by name or city"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowEditPatient(false);
                setConfirmDeletePatient(true);
              }}
              data-testid="button-delete-patient"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Patient
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEditPatient(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!editPatientForm.firstName.trim() || !editPatientForm.lastName.trim() || updatePatientMutation.isPending}
                onClick={() => {
                  if (!selectedPatient) return;
                  updatePatientMutation.mutate({ id: selectedPatient.id, ...editPatientForm, pharmacy: editPatientPharmacy });
                }}
                data-testid="button-save-edit-patient"
                style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
              >
                {updatePatientMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Publish Protocol Dialog */}
      {publishDialogLab && (
        <Dialog open onOpenChange={() => { setPublishDialogLab(null); setPublishNotes(""); setPublishDietaryGuidance(""); setPublishPatientSummary(""); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {(portalStatus?.publishedLabResultIds ?? []).includes(publishDialogLab.id) ? (
                  <RefreshCw className="h-4 w-4 text-amber-600" />
                ) : (
                  <Leaf className="h-4 w-4" style={{ color: "#2e3a20" }} />
                )}
                {(portalStatus?.publishedLabResultIds ?? []).includes(publishDialogLab.id)
                  ? "Re-publish Protocol to Portal"
                  : "Publish Protocol to Portal"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              {(portalStatus?.publishedLabResultIds ?? []).includes(publishDialogLab.id) && (
                <div className="rounded-md px-3 py-2.5 flex items-start gap-2.5 text-sm" style={{ backgroundColor: "#fef9ec", border: "1px solid #f5d97a" }}>
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800">These labs have already been published</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Re-publishing will add a new entry to the patient's portal history. The previous version remains visible.
                    </p>
                  </div>
                </div>
              )}
              <div className="rounded-lg p-3 text-sm space-y-0.5" style={{ backgroundColor: "#edf2e6" }}>
                <p className="font-medium" style={{ color: "#2e3a20" }}>
                  {((publishDialogLab.interpretationResult as any)?.supplements?.length || 0)} supplements will be published
                </p>
                <p className="text-xs" style={{ color: "#5a7040" }}>
                  Lab date: {publishDialogLab.labDate ? safeDate(publishDialogLab.labDate) : 'Unknown'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Note to patient <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  placeholder="E.g. 'Take all supplements with food. We'll recheck your labs in 8 weeks.'"
                  value={publishNotes}
                  onChange={(e) => setPublishNotes(e.target.value)}
                  className="text-sm min-h-[80px] resize-none"
                  data-testid="input-publish-clinician-notes"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    Dietary guidance
                    {isDietaryGenerating ? (
                      <span className="flex items-center gap-1 text-muted-foreground font-normal">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating from lab results…
                      </span>
                    ) : isDietaryError ? (
                      <span className="flex items-center gap-1 font-normal text-destructive">
                        Generation failed — enter manually or retry
                      </span>
                    ) : publishDietaryGuidance ? (
                      <span className="flex items-center gap-1 font-normal" style={{ color: "#5a7040" }}>
                        <Sparkles className="w-3 h-3" />
                        AI-generated — review before publishing
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-normal">(shown in patient portal)</span>
                    )}
                  </Label>
                  {(publishDietaryGuidance || isDietaryError) && !isDietaryGenerating && (
                    <button
                      type="button"
                      data-testid="button-regenerate-dietary"
                      onClick={() => {
                        setPublishDietaryGuidance("");
                        setIsDietaryError(false);
                        setIsDietaryGenerating(true);
                        apiRequest("POST", "/api/generate-dietary-guidance", { labResultId: publishDialogLab!.id })
                          .then(res => res.json())
                          .then(data => {
                            if (data.dietaryGuidance) setPublishDietaryGuidance(data.dietaryGuidance);
                            else setIsDietaryError(true);
                          })
                          .catch(() => setIsDietaryError(true))
                          .finally(() => setIsDietaryGenerating(false));
                      }}
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "#7a8a64" }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      {isDietaryError ? "Retry" : "Regenerate"}
                    </button>
                  )}
                </div>
                <Textarea
                  placeholder={isDietaryGenerating ? "Generating dietary recommendations from this patient's lab results…" : "E.g.:\nFocus on whole foods — lean proteins, colorful vegetables, and healthy fats.\n\nProtein goal: Aim for 0.8–1g per pound of lean body mass daily.\n\nLimit: Alcohol, refined sugar, processed oils."}
                  value={publishDietaryGuidance}
                  onChange={(e) => setPublishDietaryGuidance(e.target.value)}
                  className="text-sm min-h-[160px] resize-none"
                  disabled={isDietaryGenerating}
                  data-testid="input-publish-dietary-guidance"
                />
                {!isDietaryGenerating && (
                  <p className="text-xs text-muted-foreground">
                    Editable before publishing. Appears as a dedicated dietary guidance section in the patient's portal, with clickable recipe ideas for each food.
                  </p>
                )}
              </div>
            </div>

              {/* Health Assessment (patient summary) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  Health Assessment
                  <span className="text-muted-foreground font-normal">(shown as "Your Health Assessment" in patient portal)</span>
                </Label>
                <Textarea
                  placeholder="The patient-friendly summary of their lab results. Edit before publishing — this is exactly what the patient will read."
                  value={publishPatientSummary}
                  onChange={(e) => setPublishPatientSummary(e.target.value)}
                  className="text-sm min-h-[120px] resize-none"
                  data-testid="input-publish-patient-summary"
                />
                {!publishPatientSummary && (
                  <p className="text-xs text-muted-foreground">
                    No patient summary found. Generate an interpretation first, or type one above.
                  </p>
                )}
              </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPublishDialogLab(null); setPublishNotes(""); setPublishDietaryGuidance(""); setPublishPatientSummary(""); setIsDietaryGenerating(false); setIsDietaryError(false); }}
                disabled={publishProtocolMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={publishProtocolMutation.isPending || isDietaryGenerating}
                onClick={() => {
                  setPublishingLabId(publishDialogLab.id);
                  publishProtocolMutation.mutate({ lab: publishDialogLab, notes: publishNotes, dietaryGuidance: publishDietaryGuidance, patientSummary: publishPatientSummary });
                }}
                style={(portalStatus?.publishedLabResultIds ?? []).includes(publishDialogLab.id)
                  ? { backgroundColor: "#92400e", color: "#fef3c7" }
                  : { backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                data-testid="button-confirm-publish-protocol"
              >
                {(portalStatus?.publishedLabResultIds ?? []).includes(publishDialogLab.id) ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                  <Leaf className="h-3.5 w-3.5 mr-1.5" />
                )}
                {publishProtocolMutation.isPending
                  ? "Publishing…"
                  : (portalStatus?.publishedLabResultIds ?? []).includes(publishDialogLab.id)
                    ? "Re-publish to Portal"
                    : "Publish to Portal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Merge Patients Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={(v) => { if (!v) { setShowMergeDialog(false); setMergeKeepId(null); setMergeDiscardId(null); setMergeSearch(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge Duplicate Patients</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Select two patient profiles to merge. All labs, encounters, submissions, and chart data from the discarded profile will be transferred to the kept profile.
            </p>

            <div className="space-y-1.5">
              <Label>Keep (primary profile)</Label>
              <select
                value={mergeKeepId ?? ""}
                onChange={e => setMergeKeepId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                data-testid="select-merge-keep"
              >
                <option value="">Select patient to keep...</option>
                {allPatients.filter(p => p.id !== mergeDiscardId).map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.email ? ` (${p.email})` : ""}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Discard (merge into primary)</Label>
              <select
                value={mergeDiscardId ?? ""}
                onChange={e => setMergeDiscardId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                data-testid="select-merge-discard"
              >
                <option value="">Select patient to discard...</option>
                {allPatients.filter(p => p.id !== mergeKeepId).map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.email ? ` (${p.email})` : ""}</option>
                ))}
              </select>
            </div>

            {mergeKeepId && mergeDiscardId && (
              <div className="rounded-md border p-3 space-y-2 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs space-y-1">
                    <p className="font-medium text-amber-800 dark:text-amber-300">This action cannot be undone</p>
                    <p className="text-amber-700 dark:text-amber-400">
                      All records from <strong>{allPatients.find(p => p.id === mergeDiscardId)?.firstName} {allPatients.find(p => p.id === mergeDiscardId)?.lastName}</strong> will
                      be transferred to <strong>{allPatients.find(p => p.id === mergeKeepId)?.firstName} {allPatients.find(p => p.id === mergeKeepId)?.lastName}</strong>,
                      and the discarded profile will be permanently deleted.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)} data-testid="button-cancel-merge">Cancel</Button>
            <Button
              variant="destructive"
              disabled={!mergeKeepId || !mergeDiscardId || mergePatientsMutation.isPending}
              onClick={() => {
                if (mergeKeepId && mergeDiscardId) {
                  mergePatientsMutation.mutate({ keepId: mergeKeepId, discardId: mergeDiscardId });
                }
              }}
              data-testid="button-confirm-merge"
            >
              {mergePatientsMutation.isPending ? "Merging..." : "Merge Patients"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Upcoming Appointments Mini-Card ─────────────────────────────────────────
function UpcomingAppointmentsCard({
  patientId,
  onBook,
}: {
  patientId: number;
  onBook: () => void;
}) {
  const { data: upcoming = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/patients", patientId, "upcoming-appointments"],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/upcoming-appointments`, {
        credentials: "include",
      });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${date} · ${time}`;
  };

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: "#d4c9b5", backgroundColor: "#faf8f5" }}
      data-testid="card-upcoming-appointments"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5" style={{ color: "#5a7040" }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#a0a880" }}>
            Upcoming Appointments
          </p>
        </div>
        <button
          type="button"
          onClick={onBook}
          data-testid="button-book-appointment-card"
          className="text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: "#2e3a20" }}
        >
          + Book new
        </button>
      </div>
      <div className="px-4 pb-3">
        {isLoading ? (
          <div className="text-xs" style={{ color: "#7a8a64" }}>Loading…</div>
        ) : upcoming.length === 0 ? (
          <div className="text-xs" style={{ color: "#7a8a64" }}>
            No upcoming appointments scheduled.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "#e8ddd0" }}>
            {upcoming.slice(0, 5).map((a) => (
              <li
                key={a.id}
                className="py-1.5 flex items-center justify-between gap-3"
                data-testid={`row-upcoming-appt-${a.id}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "#1c2414" }}>
                    {fmt(a.appointmentStart as unknown as string)}
                  </div>
                  <div className="text-xs truncate" style={{ color: "#7a8a64" }}>
                    {a.serviceType || "Appointment"}
                    {a.staffName ? ` · ${a.staffName}` : ""}
                    {a.source === "boulevard" ? " · Boulevard" : ""}
                  </div>
                </div>
                <span
                  className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: a.status === "confirmed" ? "#dbe8c8" : "#e8ddd0",
                    color: "#2e3a20",
                  }}
                >
                  {a.status || "scheduled"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Monitoring & Check-Ins panel (Daily Check-In Phase 1) ─────────────────
type _CheckinRow = {
  id: number;
  date: string;
  weight?: number | string | null;
  moodScore?: number | null;
  energyScore?: number | null;
  cravingsScore?: number | null;
  hungerScore?: number | null;
  brainFogScore?: number | null;
  anxietyIrritabilityScore?: number | null;
  sleepHours?: number | string | null;
  sleepQuality?: number | null;
  nightSweats?: boolean | null;
  wokeDuringNight?: boolean | null;
  foodProteinLevel?: string | null;
  waterLevel?: string | null;
  fiberVeggieLevel?: string | null;
  processedFoodLevel?: string | null;
  alcoholUse?: boolean | null;
  foodNotes?: string | null;
  proteinGrams?: number | null;
  calories?: number | null;
  fiberGrams?: number | null;
  waterOunces?: number | null;
  exerciseDone?: boolean | null;
  exerciseType?: string | null;
  exerciseMinutes?: number | null;
  exerciseIntensity?: string | null;
  giSymptoms?: string[] | null;
  unexpectedBleeding?: boolean | null;
  otherSymptoms?: string | null;
  cycleData?: Record<string, unknown> | null;
  notes?: string | null;
  updatedAt: string;
};
type _AdherenceRow = {
  id: number;
  date: string;
  medicationName: string;
  status: "taken" | "skipped" | "missed" | "backfilled";
  source: string;
  reason?: string | null;
};
type _MonitoringSummary = {
  settings: {
    trackingMode: "off" | "standard" | "power";
    enabled: boolean;
    setupCompleted: boolean;
    lastActivityAt: string | null;
  };
  recentCheckins: _CheckinRow[];
  adherence: _AdherenceRow[];
  reportedMeds: Array<{
    id: number;
    name: string;
    dose?: string | null;
    frequency?: string | null;
    type: string;
    status: string;
    reviewedByProvider: boolean;
    createdAt: string;
  }>;
  summary: {
    windowDays: number;
    adherencePct: number | null;
    totalCheckins: number;
    unreviewedReportedMedCount: number;
    lastActivityAt: string | null;
  };
};

const _MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const _DOW_LABELS = ["S","M","T","W","T","F","S"];

function _formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function _checkinSeverity(c: _CheckinRow): "normal" | "amber" | "rose" {
  if (c.unexpectedBleeding) return "rose";
  const sleep = c.sleepHours == null ? null : Number(c.sleepHours);
  if (sleep !== null && !Number.isNaN(sleep) && sleep > 0 && sleep < 5) return "amber";
  let load = 0;
  if (c.cravingsScore && c.cravingsScore >= 4) load++;
  if (c.hungerScore && c.hungerScore >= 4) load++;
  if (c.brainFogScore && c.brainFogScore >= 4) load++;
  if (c.anxietyIrritabilityScore && c.anxietyIrritabilityScore >= 4) load++;
  if (Array.isArray(c.giSymptoms) && c.giSymptoms.length >= 2) load++;
  if (c.nightSweats) load++;
  if (load >= 3) return "amber";
  return "normal";
}

function _severityColors(s: "normal" | "amber" | "rose"): { bg: string; ring: string } {
  if (s === "rose") return { bg: "#c0392b", ring: "#fdf2f0" };
  if (s === "amber") return { bg: "#c98b1f", ring: "#fdf6e6" };
  return { bg: "#2e7a3a", ring: "#ecf6ee" };
}

function _adherenceStreak(adherence: _AdherenceRow[], today: Date): number {
  if (adherence.length === 0) return 0;
  // Group statuses by date
  const byDay = new Map<string, _AdherenceRow[]>();
  for (const a of adherence) {
    if (!byDay.has(a.date)) byDay.set(a.date, []);
    byDay.get(a.date)!.push(a);
  }
  let streak = 0;
  // Walk back from yesterday so we don't penalize a not-yet-logged today
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 60; i++) {
    const key = _formatDateYmd(cursor);
    const day = byDay.get(key);
    if (!day || day.length === 0) break;
    const skipped = day.some((d) => d.status === "skipped" || d.status === "missed");
    if (skipped) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function MonitoringPanel({ patientId }: { patientId: number }) {
  const [open, setOpen] = useState(true);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery<_MonitoringSummary>({
    queryKey: ['/api/patients', patientId, 'tracking-summary'],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/tracking-summary`, { credentials: 'include' });
      if (!res.ok) throw new Error('failed');
      return res.json();
    },
  });

  const markReviewedMutation = useMutation({
    mutationFn: (medId: number) =>
      fetch(`/api/patients/${patientId}/patient-reported-medications/${medId}/mark-reviewed`, {
        method: 'POST', credentials: 'include',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'tracking-summary'] }),
  });

  // Patient-logged vitals for the same calendar (so a small heart appears on
  // days the patient self-reported BP/HR/weight from the portal).
  // Uses a distinct query key segment ('vitals', 'all') to avoid cache-shape
  // conflicts with the context-rail and VitalTrendsDialog queries that return
  // a raw PatientVital[] array.
  const { data: patientVitalsData } = useQuery<Array<{ id: number; recordedAt: string; source: string }>>({
    queryKey: ['/api/patients', patientId, 'vitals', 'all'],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/vitals`, { credentials: 'include' });
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j) ? j : (j?.vitals ?? []);
    },
  });

  // Phase 2: Vitals Monitoring Episodes — a patient may be enrolled in
  // clinician-directed BP/HR/weight monitoring even if Daily Check-In tracking
  // is off. We surface that here so this section never goes blank for those
  // patients.
  type _Episode = {
    id: number;
    status: string;
    vitalTypes: string[];
    frequencyPerDay: number;
    startDate: string;
    endDate: string;
    endedEarlyReason?: string | null;
  };
  const { data: episodesData, isLoading: epLoading } = useQuery<{ episodes: _Episode[] }>({
    queryKey: ['/api/patients', patientId, 'vitals-monitoring'],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/vitals-monitoring`, { credentials: 'include' });
      if (!res.ok) return { episodes: [] };
      return res.json();
    },
  });
  const episodes = episodesData?.episodes ?? [];
  const activeEpisode = episodes.find((e) => e.status === "active") ?? null;

  if (isLoading || epLoading || !data) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "#d4c9b5", backgroundColor: "#faf8f5" }}
        data-testid="monitoring-loading"
      >
        <div className="h-4 w-40 rounded bg-muted/40 animate-pulse mb-3" />
        <div className="h-3 w-56 rounded bg-muted/30 animate-pulse" />
      </div>
    );
  }
  const checkinTrackingActive = data.settings.trackingMode !== "off" && data.settings.enabled;
  const trackingActive = checkinTrackingActive || activeEpisode != null || episodes.length > 0;
  if (!trackingActive) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "#d4c9b5", backgroundColor: "#faf8f5" }}
        data-testid="monitoring-empty"
      >
        <div className="flex items-start gap-3">
          <div
            className="rounded-md p-2 flex-shrink-0"
            style={{ backgroundColor: "#eef0e6", color: "#2e3a20" }}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base" style={{ color: "#1c2414" }}>
              Active Monitoring is not enabled for this patient
            </h3>
            <p className="text-sm mt-1" style={{ color: "#5a6048" }}>
              This view shows two kinds of active monitoring:
            </p>
            <ul className="text-sm mt-2 space-y-1 list-disc pl-5" style={{ color: "#5a6048" }}>
              <li>
                <strong>Vitals Monitoring Episodes</strong> — clinician-directed BP, heart rate, or weight
                tracking. Start one from the Vitals dialog.
              </li>
              <li>
                <strong>Daily Check-In tracking</strong> — patient-logged mood, sleep, food, movement,
                symptoms, cycle, and medication adherence. The patient enables it from their portal, or you
                can enable it for them under Portal &amp; Messages.
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const recent = data.recentCheckins ?? [];
  const adherence = data.adherence ?? [];
  const reportedMeds = data.reportedMeds ?? [];
  const unreviewedMeds = reportedMeds.filter((m) => !m.reviewedByProvider && m.status === "active");
  const recentBleeding = recent.find((c) => c.unexpectedBleeding === true);
  const streak = _adherenceStreak(adherence, today);

  // Index check-ins, adherence, and patient-vitals by YYYY-MM-DD for the
  // calendar.
  const checkinByDay = new Map<string, _CheckinRow>();
  for (const c of recent) checkinByDay.set(c.date, c);
  const adherenceByDay = new Map<string, _AdherenceRow[]>();
  for (const a of adherence) {
    if (!adherenceByDay.has(a.date)) adherenceByDay.set(a.date, []);
    adherenceByDay.get(a.date)!.push(a);
  }
  const patientVitalDays = new Set<string>();
  for (const v of patientVitalsData ?? []) {
    if (v.source !== "patient_logged") continue;
    patientVitalDays.add(_formatDateYmd(new Date(v.recordedAt)));
  }

  // Build the calendar grid (always render a 6-row grid so layout is stable).
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startDow = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startDow);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const goPrev = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const goNext = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  const isThisMonth = today.getFullYear() === viewMonth.getFullYear() && today.getMonth() === viewMonth.getMonth();

  const openDayCheckin = openDayKey ? checkinByDay.get(openDayKey) : null;
  const openDayAdherence = openDayKey ? adherenceByDay.get(openDayKey) ?? [] : [];

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: "#d4c9b5", backgroundColor: "#faf8f5" }}
      data-testid="monitoring-checkins-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 pt-3 pb-2.5 hover-elevate rounded-t-xl"
        data-testid="button-toggle-monitoring"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4" style={{ color: "#2e3a20" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#1c2414" }}>
            Monitoring & Check-Ins
          </h3>
          <Badge variant="outline" className="text-xs">
            {data.settings.trackingMode === "power" ? "Power Mode" : "Standard"}
          </Badge>
          {unreviewedMeds.length > 0 && (
            <Badge className="text-white text-xs" style={{ backgroundColor: "#c0392b" }}>
              {unreviewedMeds.length} to review
            </Badge>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "#7a8a64" }} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "#e8ddd0" }}>
          {/* Stat tiles — replaced "Patient-added" with the more useful
              "Adherence streak" so the number isn't duplicated below. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4">
            <div className="rounded-md border p-3" style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }} data-testid="stat-last-activity">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Last activity</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: "#1c2414" }}>
                {data.summary.lastActivityAt
                  ? new Date(data.summary.lastActivityAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—"}
              </p>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }} data-testid="stat-checkins-30d">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Check-ins (30d)</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: "#1c2414" }}>
                {data.summary.totalCheckins}
              </p>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }} data-testid="stat-adherence">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Med adherence</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: "#1c2414" }}>
                {data.summary.adherencePct === null ? "—" : `${data.summary.adherencePct}%`}
              </p>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }} data-testid="stat-streak">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Adherence streak</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: "#1c2414" }}>
                {streak === 0 ? "—" : `${streak} day${streak === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          {/* ── Active vitals monitoring episode banner ─────────────── */}
          {activeEpisode && (
            <div
              className="rounded-md border p-3 flex items-start gap-3"
              style={{ borderColor: "#c4b9a5", backgroundColor: "#faf6ed" }}
              data-testid="active-episode-banner"
            >
              <div
                className="rounded-md p-2 flex-shrink-0"
                style={{ backgroundColor: "#eef0e6", color: "#2e3a20" }}
              >
                <Activity className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                  Active vitals monitoring episode
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#5a6048" }}>
                  Tracking {(activeEpisode.vitalTypes ?? []).map((t) => t.replace("_", " ")).join(", ") || "vitals"} —{" "}
                  {activeEpisode.frequencyPerDay}× per day
                  {activeEpisode.startDate && ` (started ${new Date(activeEpisode.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} through ${new Date(activeEpisode.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`}
                  .
                </p>
                {activeEpisode.endedEarlyReason && (
                  <p className="text-xs mt-1 italic" style={{ color: "#7a8a64" }}>
                    Ended early: {activeEpisode.endedEarlyReason}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Hint when only Phase 2 is active ─────────────────────── */}
          {!checkinTrackingActive && (
            <div className="text-xs px-1" style={{ color: "#7a8a64" }} data-testid="text-no-checkin-hint">
              Daily Check-In tracking is off, so the calendar below is empty. Patient-logged vitals from the
              monitoring episode will still appear with a heart marker on the days they're recorded.
            </div>
          )}

          {recentBleeding && (
            <div
              className="rounded-md border p-3 flex items-start gap-2"
              style={{ borderColor: "#e8c1ba", backgroundColor: "#fdf2f0" }}
              data-testid="alert-bleeding"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#c0392b" }} />
              <div className="text-sm" style={{ color: "#1c2414" }}>
                <p className="font-semibold">Unexpected bleeding reported on {recentBleeding.date}</p>
                <p className="text-xs mt-0.5" style={{ color: "#5a6048" }}>
                  Notes: {recentBleeding.notes ?? recentBleeding.otherSymptoms ?? "no additional notes"}
                </p>
              </div>
            </div>
          )}

          {/* ── Calendar ───────────────────────────────────────────────── */}
          <div className="rounded-md border bg-white" style={{ borderColor: "#e8ddd0" }} data-testid="monitoring-calendar">
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "#e8ddd0" }}>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={goPrev}
                data-testid="button-calendar-prev"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                  {_MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                </p>
                {!isThisMonth && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                    data-testid="button-calendar-today"
                  >
                    Today
                  </Button>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={goNext}
                data-testid="button-calendar-next"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-px px-1.5 pt-1.5 text-[10px] uppercase tracking-wider text-center" style={{ color: "#7a8a64" }}>
              {_DOW_LABELS.map((d, i) => (
                <div key={i} className="py-0.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px p-1.5">
              {days.map((d, idx) => {
                const key = _formatDateYmd(d);
                const inMonth = d.getMonth() === viewMonth.getMonth();
                const isToday = d.getTime() === today.getTime();
                const ci = checkinByDay.get(key);
                const sev = ci ? _checkinSeverity(ci) : null;
                const sevColors = sev ? _severityColors(sev) : null;
                const hasVital = patientVitalDays.has(key);
                const hasMeds = (adherenceByDay.get(key)?.length ?? 0) > 0;
                const isFuture = d.getTime() > today.getTime();
                const clickable = !!ci || hasMeds || hasVital;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && setOpenDayKey(key)}
                    className={`relative min-h-[40px] rounded-sm border text-[11px] flex items-center justify-between px-1.5 py-1 ${clickable ? "hover-elevate cursor-pointer" : "cursor-default"}`}
                    style={{
                      borderColor: isToday ? "#2e3a20" : "#eadfd0",
                      backgroundColor: !inMonth ? "#fbf7f0" : (sev ? sevColors!.ring : "#ffffff"),
                      opacity: !inMonth || isFuture ? 0.55 : 1,
                    }}
                    data-testid={`calendar-day-${key}`}
                  >
                    <span
                      className="font-medium leading-none"
                      style={{ color: isToday ? "#2e3a20" : (inMonth ? "#1c2414" : "#a89c87") }}
                    >
                      {d.getDate()}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {sev && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: sevColors!.bg }}
                          aria-hidden
                        />
                      )}
                      {hasVital && (
                        <Heart className="w-2.5 h-2.5" style={{ color: "#c0392b" }} aria-label="patient-logged vital" />
                      )}
                      {hasMeds && (
                        <Pill className="w-2.5 h-2.5" style={{ color: "#2e7a3a" }} aria-label="meds logged" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 px-3 py-2 border-t text-[10px]" style={{ borderColor: "#e8ddd0", color: "#5a6048" }}>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#2e7a3a" }} /> Normal</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#c98b1f" }} /> Concerning</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#c0392b" }} /> Bleeding</span>
              <span className="flex items-center gap-1"><Heart className="w-2.5 h-2.5" style={{ color: "#c0392b" }} /> Patient vital</span>
              <span className="flex items-center gap-1"><Pill className="w-2.5 h-2.5" style={{ color: "#2e7a3a" }} /> Meds logged</span>
            </div>
          </div>

          {/* ── Patient-reported medications (needs review) ───────────── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#5a6048" }}>
              Patient-added medications & supplements
            </h4>
            {reportedMeds.length === 0 ? (
              <p className="text-sm" style={{ color: "#7a8a64" }} data-testid="text-no-reported-meds">None reported.</p>
            ) : (
              <div className="space-y-1.5">
                {reportedMeds.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border"
                    style={{
                      borderColor: m.reviewedByProvider ? "#e8ddd0" : "#e8c1ba",
                      backgroundColor: m.reviewedByProvider ? "#ffffff" : "#fdf2f0",
                    }}
                    data-testid={`reported-med-${m.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate" style={{ color: "#1c2414" }}>{m.name}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">{m.type}</Badge>
                        {!m.reviewedByProvider && (
                          <Badge className="text-[10px] text-white" style={{ backgroundColor: "#c0392b" }}>Needs review</Badge>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: "#7a8a64" }}>
                        {[m.dose, m.frequency].filter(Boolean).join(" · ") || "no dose / frequency"}
                        {" · added "}
                        {new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    {!m.reviewedByProvider && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markReviewedMutation.mutate(m.id)}
                        disabled={markReviewedMutation.isPending}
                        data-testid={`button-mark-reviewed-${m.id}`}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> Mark reviewed
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Per-day detail dialog ───────────────────────────────────── */}
      <Dialog open={!!openDayKey} onOpenChange={(v) => { if (!v) setOpenDayKey(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-day-detail">
          <DialogHeader>
            <DialogTitle className="text-base">
              {openDayKey
                ? new Date(openDayKey + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric", year: "numeric",
                  })
                : ""}
            </DialogTitle>
          </DialogHeader>

          {openDayKey && (
            <DayDetailContent
              checkin={openDayCheckin ?? null}
              adherence={openDayAdherence}
              hasPatientVital={patientVitalDays.has(openDayKey)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Per-day detail card body ──────────────────────────────────────────────
function DayDetailContent({
  checkin,
  adherence,
  hasPatientVital,
}: {
  checkin: _CheckinRow | null;
  adherence: _AdherenceRow[];
  hasPatientVital: boolean;
}) {
  const c = checkin;
  const sev = c ? _checkinSeverity(c) : null;
  const sevColors = sev ? _severityColors(sev) : null;
  const cycle = (c?.cycleData ?? null) as Record<string, any> | null;

  const sleepText = c?.sleepHours != null ? `${c.sleepHours}h` : "—";
  const sleepQ = c?.sleepQuality != null ? `quality ${c.sleepQuality}/5` : null;
  const sleepBits: string[] = [];
  if (c?.nightSweats) sleepBits.push("night sweats");
  if (c?.wokeDuringNight) sleepBits.push("woke during night");

  const renderScore = (label: string, val?: number | null) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24" style={{ color: "#7a8a64" }}>{label}</span>
      <span className="font-medium" style={{ color: "#1c2414" }}>
        {val == null ? "—" : `${val}/5`}
      </span>
    </div>
  );

  if (!c && adherence.length === 0 && !hasPatientVital) {
    return (
      <p className="text-sm py-4" style={{ color: "#7a8a64" }}>
        No patient activity recorded on this day.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sev && (
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: sevColors!.bg }}
          />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: sevColors!.bg }}>
            {sev === "rose" ? "Bleeding reported" : sev === "amber" ? "Concerning" : "Normal day"}
          </span>
        </div>
      )}

      {c && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Mood / Energy / etc. */}
            <div className="rounded-md border p-3 space-y-1.5" style={{ borderColor: "#e8ddd0" }} data-testid="day-mood">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Mood &amp; Energy</p>
              {renderScore("Mood", c.moodScore)}
              {renderScore("Energy", c.energyScore)}
              {renderScore("Brain fog", c.brainFogScore)}
              {renderScore("Anxiety", c.anxietyIrritabilityScore)}
              {renderScore("Cravings", c.cravingsScore)}
              {renderScore("Hunger", c.hungerScore)}
            </div>

            {/* Sleep */}
            <div className="rounded-md border p-3 space-y-1.5" style={{ borderColor: "#e8ddd0" }} data-testid="day-sleep">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Sleep</p>
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
                {sleepText}{sleepQ ? ` · ${sleepQ}` : ""}
              </p>
              {sleepBits.length > 0 && (
                <p className="text-xs" style={{ color: "#5a6048" }}>{sleepBits.join(" · ")}</p>
              )}
            </div>

            {/* Food */}
            <div className="rounded-md border p-3 space-y-1.5" style={{ borderColor: "#e8ddd0" }} data-testid="day-food">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Food</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span style={{ color: "#7a8a64" }}>Protein</span><span style={{ color: "#1c2414" }}>{c.foodProteinLevel ?? "—"}</span>
                <span style={{ color: "#7a8a64" }}>Water</span><span style={{ color: "#1c2414" }}>{c.waterLevel ?? "—"}</span>
                <span style={{ color: "#7a8a64" }}>Fiber/veg</span><span style={{ color: "#1c2414" }}>{c.fiberVeggieLevel ?? "—"}</span>
                <span style={{ color: "#7a8a64" }}>Processed</span><span style={{ color: "#1c2414" }}>{c.processedFoodLevel ?? "—"}</span>
                <span style={{ color: "#7a8a64" }}>Alcohol</span><span style={{ color: "#1c2414" }}>{c.alcoholUse == null ? "—" : (c.alcoholUse ? "yes" : "no")}</span>
                {c.proteinGrams != null && (<><span style={{ color: "#7a8a64" }}>Protein g</span><span style={{ color: "#1c2414" }}>{c.proteinGrams}g</span></>)}
                {c.calories != null && (<><span style={{ color: "#7a8a64" }}>Calories</span><span style={{ color: "#1c2414" }}>{c.calories}</span></>)}
                {c.fiberGrams != null && (<><span style={{ color: "#7a8a64" }}>Fiber g</span><span style={{ color: "#1c2414" }}>{c.fiberGrams}g</span></>)}
                {c.waterOunces != null && (<><span style={{ color: "#7a8a64" }}>Water oz</span><span style={{ color: "#1c2414" }}>{c.waterOunces}</span></>)}
              </div>
              {c.foodNotes && (
                <p className="text-xs italic mt-1" style={{ color: "#5a6048" }}>"{c.foodNotes}"</p>
              )}
            </div>

            {/* Movement */}
            <div className="rounded-md border p-3 space-y-1.5" style={{ borderColor: "#e8ddd0" }} data-testid="day-exercise">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Movement</p>
              {c.exerciseDone ? (
                <p className="text-sm" style={{ color: "#1c2414" }}>
                  {[c.exerciseType, c.exerciseMinutes ? `${c.exerciseMinutes} min` : null, c.exerciseIntensity]
                    .filter(Boolean).join(" · ") || "Recorded"}
                </p>
              ) : (
                <p className="text-sm" style={{ color: "#7a8a64" }}>No exercise reported.</p>
              )}
            </div>

            {/* Symptoms / Cycle */}
            <div className="rounded-md border p-3 space-y-1.5 sm:col-span-2" style={{ borderColor: "#e8ddd0" }} data-testid="day-symptoms">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Symptoms &amp; Cycle</p>
              {c.unexpectedBleeding && (
                <p className="text-xs font-semibold" style={{ color: "#c0392b" }}>Unexpected bleeding reported.</p>
              )}
              {Array.isArray(c.giSymptoms) && c.giSymptoms.length > 0 && (
                <p className="text-xs" style={{ color: "#1c2414" }}>
                  <span style={{ color: "#7a8a64" }}>GI: </span>{c.giSymptoms.join(", ")}
                </p>
              )}
              {cycle && Object.keys(cycle).length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {Object.entries(cycle).map(([k, v]) => {
                    const display = Array.isArray(v) ? v.join(", ") : (typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
                    return (
                      <div key={k} className="contents">
                        <span style={{ color: "#7a8a64" }}>{k}</span>
                        <span style={{ color: "#1c2414" }}>{display || "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {c.otherSymptoms && (
                <p className="text-xs italic" style={{ color: "#5a6048" }}>"{c.otherSymptoms}"</p>
              )}
            </div>

            {/* Weight + patient vitals */}
            {(c.weight != null || hasPatientVital) && (
              <div className="rounded-md border p-3 space-y-1.5" style={{ borderColor: "#e8ddd0" }} data-testid="day-weight">
                <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Weight &amp; Vitals</p>
                {c.weight != null && (
                  <p className="text-sm" style={{ color: "#1c2414" }}>{c.weight} lb</p>
                )}
                {hasPatientVital && (
                  <p className="text-xs flex items-center gap-1" style={{ color: "#5a6048" }}>
                    <Heart className="w-3 h-3" style={{ color: "#c0392b" }} />
                    Patient logged a vital sign — see Vitals workspace.
                  </p>
                )}
              </div>
            )}

            {c.notes && (
              <div className="rounded-md border p-3 sm:col-span-2" style={{ borderColor: "#e8ddd0" }} data-testid="day-notes">
                <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7a8a64" }}>Patient notes</p>
                <p className="text-sm mt-1" style={{ color: "#1c2414" }}>{c.notes}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Med adherence list ─────────────────────────────────────── */}
      <div className="rounded-md border p-3" style={{ borderColor: "#e8ddd0" }} data-testid="day-adherence">
        <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "#7a8a64" }}>Medication Adherence</p>
        {adherence.length === 0 ? (
          <p className="text-xs" style={{ color: "#7a8a64" }}>No medications logged on this day.</p>
        ) : (
          <ul className="space-y-1">
            {adherence.map((a) => {
              const color =
                a.status === "taken" ? "#2e7a3a" :
                a.status === "skipped" ? "#c98b1f" :
                a.status === "missed" ? "#c0392b" : "#7a8a64";
              const Icon =
                a.status === "taken" ? CheckCircle :
                a.status === "skipped" ? AlertTriangle :
                a.status === "missed" ? XCircle : Pill;
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 text-xs"
                  data-testid={`adherence-${a.id}`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                    <span className="truncate" style={{ color: "#1c2414" }}>{a.medicationName}</span>
                  </span>
                  <span className="capitalize flex-shrink-0" style={{ color }}>
                    {a.status}{a.reason ? ` — ${a.reason}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

