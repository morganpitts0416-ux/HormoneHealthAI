import { useState, useMemo, useRef, useEffect } from "react";
import { usePatientContext } from "@/hooks/use-patient-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, User, Calendar, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Activity, FileText, ArrowLeft,
  BarChart3, ClipboardList, Heart, Download, Trash2, Users,
  Mail, Globe, Send, Share2, Leaf, MessageSquare, Copy, ExternalLink, RefreshCw,
  Loader2, Sparkles, ShoppingBag, CheckCircle, XCircle, Stethoscope, ChevronRight, Plus,
  ChevronLeft, Pill, Shield, Scissors, X, Pencil, Lock, ChevronDown, FileDown, Check, BookOpen, PenLine, ArrowRightLeft,
  Link2, Clock, Building2, Eye,
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { PatientTrendCharts } from "@/components/patient-trend-charts";
import { generateTrendInsights, generateClinicalSnapshot, type TrendInsight } from "@/lib/clinical-trend-insights";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generateMalePatientWellnessPDF, type MaleWellnessPlan } from "@/lib/patient-pdf-export-male";
import { generatePatientWellnessPDF } from "@/lib/patient-pdf-export";
import { exportSoapPdf } from "@/lib/soap-pdf-export";
import { labsApi, femaleLabsApi, type WellnessPlan } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { Patient, LabResult, InterpretationResult, LabValues, FemaleLabValues, ClinicalEncounter, PatientChart, PatientChartDraft } from "@shared/schema";
import { ResultsDisplay } from "@/components/results-display";
import { PatientSummary } from "@/components/patient-summary";
import { SOAPNote } from "@/components/soap-note";
import { RedFlagAlert } from "@/components/red-flag-alert";
import { SoapNoteViewer } from "@/components/soap-note-viewer";
import { ManualSoapBuilder } from "@/components/manual-soap-builder";
import { FormSubmissionPreviewDialog } from "@/components/form-submission-preview";

// ── Safe date display utility ─────────────────────────────────────────────────
// Dates from the DB are stored as UTC midnight. Using { timeZone: 'UTC' } prevents
// the off-by-one-day rendering bug in US timezones. Also guards against epoch dates.
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

function LabHistoryList({ labs, onViewLab, onDeleteLab, deletingId, onPublishLab, hasPortalAccount, publishingId, publishedLabResultIds }: {
  labs: LabResult[];
  onViewLab: (lab: LabResult) => void;
  onDeleteLab: (lab: LabResult) => void;
  deletingId: number | null;
  onPublishLab?: (lab: LabResult) => void;
  hasPortalAccount?: boolean;
  publishingId?: number | null;
  publishedLabResultIds?: number[];
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
                        {safeDate(lab.labDate)}
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
                    {hasPortalAccount && onPublishLab && (interp?.supplements?.length ?? 0) > 0 && (() => {
                      const alreadyPublished = publishedLabResultIds?.includes(lab.id) ?? false;
                      return alreadyPublished ? (
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className="text-xs gap-1 no-default-active-elevate"
                            style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "1px solid #c4d9b0" }}
                            data-testid={`badge-published-${lab.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Published
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
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
                      );
                    })()}
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
    onError: () => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="lab-detail-modal">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col m-4 rounded-lg border bg-card shadow-xl overflow-hidden">
        {/* Sticky header */}
        <div className="flex-shrink-0 px-5 py-3 border-b bg-card flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold">
              Full Evaluation — {safeDate(lab.labDate)}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{patientName} · {isFemale ? "Women's Clinic" : "Men's Clinic"}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {interp && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => wellnessPlanMutation.mutate()}
                  disabled={wellnessPlanMutation.isPending}
                  data-testid="button-patient-report-modal"
                >
                  <Heart className="w-3.5 h-3.5 mr-1" />
                  {wellnessPlanMutation.isPending ? 'Generating...' : 'Patient Report'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleProviderPDF}
                  data-testid="button-provider-pdf-modal"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
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
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-lab-detail">
              Close
            </Button>
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
              {/* Red Flags */}
              {interp.redFlags && interp.redFlags.length > 0 && (
                <RedFlagAlert redFlags={interp.redFlags} />
              )}

              {/* Full Lab Results + PREVENT CVD Risk + Insulin Resistance */}
              <ResultsDisplay
                interpretations={interp.interpretations || []}
                aiRecommendations={interp.aiRecommendations || ''}
                recheckWindow={interp.recheckWindow || ''}
                redFlags={interp.redFlags || []}
                ascvdAssessment={interp.ascvdRisk || null}
                preventAssessment={interp.preventRisk}
                adjustedRiskAssessment={interp.adjustedRisk}
                insulinResistance={interp.insulinResistance}
              />

              {/* Clinical Phenotypes (female hormone patterns) */}
              {interp.clinicalPhenotypes && interp.clinicalPhenotypes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-600" />
                      Clinical Phenotype Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {interp.clinicalPhenotypes.map((phenotype, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-md border ${
                            phenotype.confidence === 'high'
                              ? 'border-purple-300 bg-purple-50/50 dark:bg-purple-950/20'
                              : phenotype.confidence === 'moderate'
                              ? 'border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20'
                              : 'border-muted bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="text-sm font-semibold">{phenotype.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              phenotype.confidence === 'high'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200'
                                : phenotype.confidence === 'moderate'
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'
                                : 'bg-muted text-muted-foreground'
                            }`}>{phenotype.confidence} confidence</span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1.5">{phenotype.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {phenotype.supportingFindings.map((f, fi) => (
                              <span key={fi} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Supplement Protocol (read-only historical view) */}
              {interp.supplements && interp.supplements.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-primary" />
                      Supplement Protocol ({interp.supplements.length} recommended)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {interp.supplements.map((supp, idx) => (
                        <div key={idx} className={`p-3 rounded-md border ${priorityColor(supp.priority)}`}>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="text-sm font-semibold">{supp.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${priorityBadge(supp.priority)}`}>
                                  {supp.priority} priority
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground font-mono">{supp.dose}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{supp.indication}</p>
                              {supp.rationale && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic">{supp.rationale}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Patient Summary */}
              {interp.patientSummary && (
                <PatientSummary summary={interp.patientSummary} labValues={vals} />
              )}

              {/* SOAP Note */}
              {interp.soapNote && (
                <SOAPNote soapNote={interp.soapNote} />
              )}
            </div>
          )}
        </div>
      </div>
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
}: {
  patientId: number;
  chart: PatientChart | null;
  encounters: ClinicalEncounter[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>("");
  const [extracting, setExtracting] = useState(false);

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

  return (
    <>
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
  const [viewingLab, setViewingLab] = useState<LabResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LabResult | null>(null);
  const [confirmDeletePatient, setConfirmDeletePatient] = useState(false);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [editPatientForm, setEditPatientForm] = useState({ firstName: "", lastName: "", email: "", dateOfBirth: "", phone: "", primaryProvider: "", preferredPharmacy: "" });
  const [showNewPatientDialog, setShowNewPatientDialog] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({ firstName: "", lastName: "", dateOfBirth: "", gender: "female" as "male" | "female", email: "", phone: "" });
  const [showFullDemographics, setShowFullDemographics] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState<boolean | null>(null);
  const [publishingLabId, setPublishingLabId] = useState<number | null>(null);
  const [publishDialogLab, setPublishDialogLab] = useState<LabResult | null>(null);
  const [publishNotes, setPublishNotes] = useState("");
  const [publishDietaryGuidance, setPublishDietaryGuidance] = useState("");
  const [isDietaryGenerating, setIsDietaryGenerating] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [showMessages, setShowMessages] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showEncounters, setShowEncounters] = useState(false);
  const [showForms, setShowForms] = useState(true);
  const [showAssignFormDialog, setShowAssignFormDialog] = useState(false);
  const [showSendEmailDialog, setShowSendEmailDialog] = useState(false);
  const [sendEmailFormId, setSendEmailFormId] = useState<number | null>(null);
  const [sendEmailAddress, setSendEmailAddress] = useState("");
  const [sendEmailName, setSendEmailName] = useState("");
  const [sendLinkFormId, setSendLinkFormId] = useState<number | null>(null);
  const [showManualSoap, setShowManualSoap] = useState(false);
  const [previewSubId, setPreviewSubId] = useState<number | null>(null);
  const [expandedEncounterId, setExpandedEncounterId] = useState<number | null>(null);
  const [pdfExportingEncounterId, setPdfExportingEncounterId] = useState<number | null>(null);
  const [copiedEncounterId, setCopiedEncounterId] = useState<number | null>(null);
  const [amendingEncounterId, setAmendingEncounterId] = useState<number | null>(null);
  const [amendText, setAmendText] = useState("");
  const [savingAmend, setSavingAmend] = useState(false);
  const [evidenceOpenId, setEvidenceOpenId] = useState<number | null>(null);
  const [summaryOpenId, setSummaryOpenId] = useState<number | null>(null);
  const [summaryTextMap, setSummaryTextMap] = useState<Record<number, string>>({});
  const [generatingSummaryId, setGeneratingSummaryId] = useState<number | null>(null);
  const [savingSummaryId, setSavingSummaryId] = useState<number | null>(null);
  const [publishingSummaryId, setPublishingSummaryId] = useState<number | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeKeepId, setMergeKeepId] = useState<number | null>(null);
  const [mergeDiscardId, setMergeDiscardId] = useState<number | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const messageBottomRef = useRef<HTMLDivElement>(null);
  const urlParamApplied = useRef(false);

  // Auto-generate dietary guidance when publish dialog opens for a lab with AI recommendations
  useEffect(() => {
    if (!publishDialogLab) return;
    const aiRecommendations = (publishDialogLab.interpretationResult as any)?.aiRecommendations;
    if (!aiRecommendations || publishDietaryGuidance) return; // skip if no AI data or already filled

    let cancelled = false;
    setIsDietaryGenerating(true);
    apiRequest("POST", "/api/generate-dietary-guidance", { labResultId: publishDialogLab.id })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.dietaryGuidance) {
          setPublishDietaryGuidance(data.dietaryGuidance);
        }
      })
      .catch(() => {}) // silently fail — clinician can fill in manually
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
  });

  // Auto-select patient from URL param (e.g. ?patient=123&tab=encounters)
  useEffect(() => {
    if (urlParamApplied.current || allPatients.length === 0) return;
    const params = new URLSearchParams(searchStr);
    const patientId = params.get("patient");
    const tab = params.get("tab");
    if (!patientId) return;
    const found = allPatients.find(p => p.id === Number(patientId));
    if (!found) return;
    urlParamApplied.current = true;
    setSelectedPatient(found);
    if (tab === "messages") setShowMessages(true);
    if (tab === "orders") setShowOrders(true);
    if (tab === "encounters") setShowEncounters(true);
    if (tab === "forms") setShowForms(true);
  }, [allPatients, searchStr]);

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
    publishedLabResultIds: number[];
    portalStatus: 'not_invited' | 'invite_pending' | 'active';
    lastLoginAt: string | null;
    latestReportViewedAt: string | null;
    latestReportPublishedAt: string | null;
    inviteSentAt: string | null;
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
    enabled: !!selectedPatient && showMessages,
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

  const assignFormMutation = useMutation({
    mutationFn: async ({ patientId, formId, notes }: { patientId: number; formId: number; notes?: string }) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/form-assignments`, { formId, notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient?.id, 'form-assignments'] });
      toast({ title: "Form assigned to patient" });
    },
    onError: () => toast({ title: "Failed to assign form", variant: "destructive" }),
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
    mutationFn: async ({ lab, notes, dietaryGuidance }: { lab: LabResult; notes: string; dietaryGuidance: string }) => {
      const interp = lab.interpretationResult as any;
      const supplements = interp?.supplements || [];
      const res = await apiRequest("POST", "/api/protocols/publish", {
        patientId: lab.patientId,
        labResultId: lab.id,
        supplements,
        clinicianNotes: notes || null,
        dietaryGuidance: dietaryGuidance || null,
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
    mutationFn: async (data: { id: number; firstName: string; lastName: string; email: string; dateOfBirth: string; phone: string; primaryProvider: string; preferredPharmacy: string }) => {
      const { id, ...fields } = data;
      const body: Record<string, string | null> = {
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email || null,
        phone: fields.phone || null,
        dateOfBirth: fields.dateOfBirth || null,
        primaryProvider: fields.primaryProvider || null,
        preferredPharmacy: fields.preferredPharmacy || null,
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

  const handleEditPatientOpen = () => {
    if (!selectedPatient) return;
    const dob = selectedPatient.dateOfBirth
      ? new Date(selectedPatient.dateOfBirth as unknown as string).toISOString().split("T")[0]
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
      primaryProvider: defaultProvider,
      preferredPharmacy: (selectedPatient as any).preferredPharmacy ?? "",
    });
    setShowEditPatient(true);
  };

  const handleDeleteLab = (lab: LabResult) => setConfirmDelete(lab);
  const insights = labs.length >= 2 ? generateTrendInsights(labs, selectedPatient?.gender as 'male' | 'female') : [];
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
              ? "hidden md:flex md:flex-col md:w-10"
              : "hidden md:flex md:flex-col md:w-72"
            : "flex flex-col w-full md:w-72"
        )}>
          {/* Collapsed state — just a toggle strip */}
          {listCollapsed && selectedPatient && (
            <div className="flex flex-col items-center pt-3 flex-1">
              <button
                onClick={() => setListCollapsed(false)}
                className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground"
                title="Expand patient list"
                data-testid="button-expand-patient-list"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
          </>)}
        </div>

        {/* Right panel: patient detail — hidden on mobile when no patient selected */}
        <div className={selectedPatient
          ? "flex flex-col flex-1 overflow-y-auto min-w-0"
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
            <div className="p-6 space-y-6">
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
                  <PatientAvatar patient={selectedPatient} size="md" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold leading-tight">
                      {selectedPatient.firstName} {selectedPatient.lastName}
                    </h2>

                    {/* Always-visible: clinic type badge + DOB + phone + provider */}
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {selectedPatient.gender === 'male' ? "Men's Clinic" : "Women's Clinic"}
                      </Badge>
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
                        {(selectedPatient as any).preferredPharmacy && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> Pharmacy: <span className="font-medium text-foreground">{(selectedPatient as any).preferredPharmacy}</span>
                          </span>
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
                  <Button
                    size="sm"
                    onClick={() => {
                      const route = selectedPatient.gender === 'female' ? '/female' : '/male';
                      setLocation(`${route}?patientId=${selectedPatient.id}`);
                    }}
                    data-testid="button-new-lab-interpretation"
                    className="text-xs gap-1.5"
                    style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                  >
                    <Activity className="h-3 w-3" />
                    New Lab Interpretation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/encounters?patientId=${selectedPatient.id}`)}
                    data-testid="button-start-encounter"
                    className="text-xs gap-1.5"
                    style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                  >
                    <Stethoscope className="h-3 w-3" />
                    New Encounter
                  </Button>
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
                    onClick={handleEditPatientOpen}
                    data-testid="button-edit-patient"
                    className="text-xs gap-1.5"
                    style={{ color: "#2e3a20", borderColor: "#c4b9a5" }}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
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

              {/* ── Portal Engagement Panel (with inline messages) ────── */}
              {portalStatus && (
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
                    {portalStatus.hasPortalAccount && (
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
                        Messages
                        {(unreadData?.count ?? 0) > 0 && (
                          <span
                            className="inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 min-w-[16px] h-4"
                            style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                          >
                            {unreadData!.count}
                          </span>
                        )}
                      </button>
                    )}
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

                  {/* Inline message thread — appears when Messages button toggled */}
                  {showMessages && portalStatus.hasPortalAccount && (
                    <div className="border-t px-4 pt-3 pb-3 space-y-3" style={{ borderColor: "#d4c9b5" }}>
                      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                        {messages.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            No messages yet. Send the first message below.
                          </p>
                        ) : (
                          messages.map((msg) => {
                            const isClinician = msg.senderType === 'clinician';
                            return (
                              <div key={msg.id} className={`flex ${isClinician ? "justify-end" : "justify-start"}`}>
                                <div className={cn("max-w-[75%] rounded-xl px-3 py-2 text-xs", isClinician ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                                  {!isClinician && (
                                    <p className="text-[10px] font-medium text-muted-foreground mb-1">{selectedPatient!.firstName}</p>
                                  )}
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                  <p className={cn("text-[10px] mt-1", isClinician ? "text-primary-foreground/60" : "text-muted-foreground")}>
                                    {new Date(msg.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                    {!isClinician && !msg.readAt && <span className="ml-2 text-amber-600 font-medium">Unread</span>}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={messageBottomRef} />
                      </div>
                      <div className="flex items-end gap-2 border-t pt-2.5" style={{ borderColor: "#d4c9b5" }}>
                        <textarea
                          className="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs min-h-[32px] max-h-20 outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Message this patient…"
                          rows={1}
                          value={messageDraft}
                          onChange={(e) => setMessageDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (messageDraft.trim()) sendMessageMutation.mutate(messageDraft.trim()); }
                          }}
                          data-testid="input-clinician-message"
                        />
                        <Button size="icon" onClick={() => { if (messageDraft.trim()) sendMessageMutation.mutate(messageDraft.trim()); }} disabled={!messageDraft.trim() || sendMessageMutation.isPending} data-testid="button-clinician-send-message">
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Patient Chart ─────────────────────────────────────── */}
              <PatientChartPanel
                patientId={selectedPatient.id}
                chart={patientChart ?? null}
                encounters={patientEncounters as unknown as ClinicalEncounter[]}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/patients', selectedPatient.id, 'chart'] });
                  refetchChart();
                }}
              />

              {/* ── Clinical Snapshot (collapsible) ─────────────────────── */}
              <ClinicalSnapshot labs={labs} patient={selectedPatient} />

              {/* ── Clinical Encounters ─────────────────────────────────── */}
              <Card data-testid="card-encounters">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-muted-foreground" />
                      Clinical Encounters
                      {patientEncounters.length > 0 && (
                        <Badge variant="secondary" className="text-xs">{patientEncounters.length}</Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {patientEncounters.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowEncounters(!showEncounters)}
                          className="text-xs"
                          data-testid="button-toggle-encounters"
                        >
                          {showEncounters ? "Hide" : "View visits"}
                        </Button>
                      )}
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
                      <Button
                        size="sm"
                        onClick={() => setLocation(`/encounters?patientId=${selectedPatient.id}`)}
                        data-testid="button-new-encounter-from-profile"
                        className="text-xs gap-1.5"
                        style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
                      >
                        <Plus className="h-3 w-3" />
                        New Encounter
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {patientEncounters.length === 0 && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">No encounters documented yet. Start one above to create an audio-transcribed SOAP note for this patient.</p>
                  </CardContent>
                )}
                {showEncounters && patientEncounters.length > 0 && (
                  <CardContent className="space-y-2">
                    {patientEncounters.map(enc => {
                      const VISIT_LABELS: Record<string, string> = {
                        "new-patient": "New Patient", "follow-up": "Follow-up", "acute": "Acute Visit",
                        "wellness": "Wellness / Annual", "procedure": "Procedure", "telemedicine": "Telemedicine", "lab-review": "Lab Review",
                      };
                      const isSigned = !!enc.signedAt;
                      const hasSoap = !!enc.soapNote;
                      const isExpanded = expandedEncounterId === enc.id;
                      const isAmending = amendingEncounterId === enc.id;
                      const isEvidenceOpen = evidenceOpenId === enc.id;
                      const isSummaryOpen = summaryOpenId === enc.id;
                      const evidenceSuggestions = (enc as any).evidenceSuggestions?.suggestions ?? [];
                      const soapText = typeof enc.soapNote === 'string' ? enc.soapNote : ((enc.soapNote as any)?.fullNote ?? '');

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
                            clinicLogo: (user as any)?.clinicLogo ?? null,
                            signedAt: isSigned ? (enc.signedAt as unknown as string) : null,
                            signedBy: enc.signedBy ?? null,
                            signatureImage: isSigned ? ((user as any)?.signatureImage ?? null) : null,
                            isAmended: !!enc.isAmended,
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
                        <div key={enc.id} className="rounded-md border overflow-hidden">
                          {/* ── Encounter row header ── */}
                          <div
                            data-testid={`encounter-row-${enc.id}`}
                            className="w-full text-left p-3 hover-elevate transition-colors cursor-pointer"
                            onClick={handleClick}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm font-medium">{safeDate(enc.visitDate as unknown as string)}</span>
                                <Badge variant="outline" className="text-[10px] py-0 h-4">
                                  {VISIT_LABELS[enc.visitType] ?? enc.visitType}
                                </Badge>
                                {isSigned && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-700 border-emerald-300 flex items-center gap-0.5">
                                    <Lock className="w-2.5 h-2.5" />
                                    {enc.isAmended ? "Amended" : "Signed"}
                                  </Badge>
                                )}
                                {enc.summaryPublished && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-violet-600 border-violet-200">Published</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
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
                                        } else {
                                          setAmendText(soapText);
                                          setAmendingEncounterId(enc.id);
                                          setExpandedEncounterId(enc.id);
                                        }
                                      }}
                                      data-testid={`button-amend-encounter-${enc.id}`}
                                      title="Amend / Edit"
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
                                  <p className="text-[11px] text-amber-700 font-medium">Amendment in progress — edit the note below, then re-sign to lock.</p>
                                  <Textarea
                                    value={amendText}
                                    onChange={(e) => setAmendText(e.target.value)}
                                    className="text-xs font-sans min-h-[16rem] resize-y"
                                    data-testid={`textarea-amend-${enc.id}`}
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
                                          await apiRequest("POST", `/api/encounters/${enc.id}/amend`);
                                          await apiRequest("PATCH", `/api/encounters/${enc.id}`, { soapNote: { fullNote: amendText } });
                                          await apiRequest("POST", `/api/encounters/${enc.id}/sign`);
                                          await queryClient.invalidateQueries({ queryKey: ['/api/encounters', selectedPatient?.id] });
                                          setAmendingEncounterId(null);
                                          setAmendText("");
                                          toast({ title: "Amendment saved", description: "The note has been re-signed and locked." });
                                        } catch (err: any) {
                                          toast({ variant: "destructive", title: "Save failed", description: err?.message });
                                        } finally {
                                          setSavingAmend(false);
                                        }
                                      }}
                                      data-testid={`button-resignlock-amend-${enc.id}`}
                                    >
                                      {savingAmend ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving...</> : <><Lock className="w-3 h-3 mr-1.5" />Re-sign and Lock</>}
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

              {/* ── Lab History ──────────────────────────────────────────── */}
              <LabHistoryList
                labs={labs}
                onViewLab={setViewingLab}
                onDeleteLab={handleDeleteLab}
                deletingId={deleteMutation.isPending && confirmDelete ? confirmDelete.id : null}
                onPublishLab={handlePublishLab}
                hasPortalAccount={portalStatus?.hasPortalAccount}
                publishingId={publishingLabId}
                publishedLabResultIds={portalStatus?.publishedLabResultIds}
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
                    </div>
                  </div>
                </CardHeader>
                {showForms && (
                  <CardContent className="space-y-4">
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
                                          if (data.formUrl && newTab) { newTab.location.href = data.formUrl; }
                                          else if (data.formUrl) { window.open(data.formUrl, "_blank"); }
                                        },
                                        onError: () => { if (newTab) newTab.close(); }
                                      });
                                    }}
                                    disabled={sendFormLinkMutation.isPending}
                                    data-testid={`button-fill-in-clinic-${assignment.id}`}>
                                    <Eye className="h-3 w-3 mr-1" /> Fill In Clinic
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

              {/* Assign Form Dialog */}
              <Dialog open={showAssignFormDialog} onOpenChange={setShowAssignFormDialog}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Assign Form to Patient</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Select a form to assign to {selectedPatient?.firstName} {selectedPatient?.lastName}. They will see it in their portal and can also receive it via email.
                    </p>
                    <ScrollArea className="h-72">
                      <div className="space-y-2 pr-2">
                        {availableForms.filter((f: any) => f.status === "published").length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-6">No published forms available. Create and publish a form from the Forms page.</p>
                        )}
                        {availableForms.filter((f: any) => f.status === "published").map((form: any) => {
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
                                        assignFormMutation.mutate({ patientId: selectedPatient.id, formId: form.id });
                                        setShowAssignFormDialog(false);
                                      }
                                    }}
                                    disabled={assignFormMutation.isPending}
                                    data-testid={`button-assign-form-${form.id}`}>
                                    <Plus className="h-3 w-3 mr-1" /> Assign
                                  </Button>
                                  {selectedPatient?.email && (
                                    <Button size="sm" variant="outline" className="text-xs"
                                      onClick={() => {
                                        if (selectedPatient) {
                                          sendFormLinkMutation.mutate({ patientId: selectedPatient.id, formId: form.id, method: "email" });
                                          setShowAssignFormDialog(false);
                                        }
                                      }}
                                      disabled={sendFormLinkMutation.isPending}
                                      data-testid={`button-assign-send-email-${form.id}`}>
                                      <Send className="h-3 w-3 mr-1" /> Send Email
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="text-xs"
                                    onClick={() => {
                                      if (selectedPatient) {
                                        const newTab = window.open("about:blank", "_blank");
                                        sendFormLinkMutation.mutate({ patientId: selectedPatient.id, formId: form.id, method: "link" }, {
                                          onSuccess: (data: any) => {
                                            if (data.formUrl && newTab) { newTab.location.href = data.formUrl; }
                                            else if (data.formUrl) { window.open(data.formUrl, "_blank"); }
                                            setShowAssignFormDialog(false);
                                          },
                                          onError: () => { if (newTab) newTab.close(); }
                                        });
                                      }
                                    }}
                                    disabled={sendFormLinkMutation.isPending}
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
                        {availableForms.filter((f: any) => f.status === "published").map((f: any) => (
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

              {showManualSoap && selectedPatient && (
                <Dialog open={showManualSoap} onOpenChange={setShowManualSoap}>
                  <DialogContent className="max-w-3xl h-[85vh] p-0 overflow-hidden [&>button:last-child]:hidden" data-testid="dialog-manual-soap">
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

              <FormSubmissionPreviewDialog
                submissionId={previewSubId}
                onClose={() => setPreviewSubId(null)}
                clinic={{
                  clinicName: (user as any)?.clinicName ?? "ClinIQ",
                  clinicLogo: (user as any)?.clinicLogo ?? null,
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
          <div className="space-y-4 py-2">
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
              <Input
                id="edit-pharmacy"
                placeholder="Pharmacy name, address, or phone"
                value={editPatientForm.preferredPharmacy}
                onChange={e => setEditPatientForm(f => ({ ...f, preferredPharmacy: e.target.value }))}
                data-testid="input-edit-patient-pharmacy"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEditPatient(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!editPatientForm.firstName.trim() || !editPatientForm.lastName.trim() || updatePatientMutation.isPending}
              onClick={() => {
                if (!selectedPatient) return;
                updatePatientMutation.mutate({ id: selectedPatient.id, ...editPatientForm });
              }}
              data-testid="button-save-edit-patient"
              style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
            >
              {updatePatientMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
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
        <Dialog open onOpenChange={() => { setPublishDialogLab(null); setPublishNotes(""); setPublishDietaryGuidance(""); }}>
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
                    ) : publishDietaryGuidance ? (
                      <span className="flex items-center gap-1 font-normal" style={{ color: "#5a7040" }}>
                        <Sparkles className="w-3 h-3" />
                        AI-generated — review before publishing
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-normal">(shown in patient portal)</span>
                    )}
                  </Label>
                  {publishDietaryGuidance && !isDietaryGenerating && (
                    <button
                      type="button"
                      data-testid="button-regenerate-dietary"
                      onClick={() => {
                        setPublishDietaryGuidance("");
                        setIsDietaryGenerating(true);
                        apiRequest("POST", "/api/generate-dietary-guidance", { labResultId: publishDialogLab!.id })
                          .then(res => res.json())
                          .then(data => { if (data.dietaryGuidance) setPublishDietaryGuidance(data.dietaryGuidance); })
                          .catch(() => {})
                          .finally(() => setIsDietaryGenerating(false));
                      }}
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "#7a8a64" }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
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

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPublishDialogLab(null); setPublishNotes(""); setPublishDietaryGuidance(""); setIsDietaryGenerating(false); }}
                disabled={publishProtocolMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={publishProtocolMutation.isPending}
                onClick={() => {
                  setPublishingLabId(publishDialogLab.id);
                  publishProtocolMutation.mutate({ lab: publishDialogLab, notes: publishNotes, dietaryGuidance: publishDietaryGuidance });
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
