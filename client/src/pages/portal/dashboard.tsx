import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Leaf, LogOut, FlaskConical, Sparkles, ChevronRight, CalendarDays,
  TrendingUp, TrendingDown, Minus, Package, MessageSquare, Smartphone,
  Heart, Activity, Utensils, X, ChevronDown, ChevronUp, Info
} from "lucide-react";
import type { SupplementRecommendation } from "@shared/schema";
import { generateTrendInsights } from "@/lib/clinical-trend-insights";

interface PortalPatient {
  patientId: number;
  email: string;
  firstName: string;
  lastName: string;
  gender: string;
  clinicName: string;
  clinicianName: string;
}

interface PublishedProtocol {
  id: number;
  supplements: SupplementRecommendation[];
  clinicianNotes: string | null;
  dietaryGuidance: string | null;
  labDate: string | null;
  publishedAt: string;
  clinicName: string;
  clinicianName: string;
}

interface PortalLab {
  id: number;
  labDate: string;
  createdAt: string;
  labValues: any;
  interpretations: Array<{
    category: string;
    value?: number;
    unit: string;
    status: string;
    referenceRange: string;
    interpretation: string;
    recommendation?: string;
  }>;
  supplements: SupplementRecommendation[];
  patientSummary: string | null;
  preventRisk: any | null;
  insulinResistance: any | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  vitamin: "🌿",
  mineral: "✦",
  "hormone-support": "⚡",
  cardiovascular: "♡",
  thyroid: "⊕",
  iron: "●",
  metabolic: "◈",
  bone: "◻",
  probiotic: "◌",
  detox: "◆",
  general: "○",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#2e3a20",
  medium: "#5a6e40",
  low: "#7a8a64",
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  normal: { bg: "#f0f5ea", text: "#2e5e1a", dot: "#4a8a30" },
  borderline: { bg: "#fef8ec", text: "#7a5a10", dot: "#c9932a" },
  abnormal: { bg: "#fef0ee", text: "#8b2a1a", dot: "#c0392b" },
  critical: { bg: "#fce8e6", text: "#7a1a0a", dot: "#c0392b" },
};

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${time}, ${firstName}.`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusDot({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.normal;
  return <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: colors.dot }} />;
}

function SupplementCard({ supplement }: { supplement: SupplementRecommendation }) {
  const icon = CATEGORY_ICONS[supplement.category] || "○";
  const color = PRIORITY_COLORS[supplement.priority] || "#7a8a64";

  return (
    <div className="rounded-xl p-5 flex flex-col gap-3" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f2ede6" }}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight" style={{ color: "#1c2414" }}>{supplement.name}</p>
            <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{supplement.dose}</p>
          </div>
        </div>
        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: color }} />
      </div>
      {supplement.patientExplanation && (
        <p className="text-sm leading-relaxed" style={{ color: "#5a6a48" }}>{supplement.patientExplanation}</p>
      )}
      {supplement.caution && (
        <p className="text-xs leading-relaxed italic" style={{ color: "#9a8a70" }}>Note: {supplement.caution}</p>
      )}
    </div>
  );
}

function RiskBadge({ category }: { category: string }) {
  const configs: Record<string, { label: string; bg: string; text: string }> = {
    low: { label: "Low Risk", bg: "#edf5e6", text: "#2e5e1a" },
    borderline: { label: "Borderline Risk", bg: "#fef8ec", text: "#7a5a10" },
    intermediate: { label: "Intermediate Risk", bg: "#fef2e6", text: "#7a4010" },
    high: { label: "High Risk", bg: "#fce8e6", text: "#7a1a0a" },
  };
  const c = configs[category] || configs.low;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

function LabQuickViewDialog({ lab, dietaryGuidance, onClose }: { lab: PortalLab; dietaryGuidance?: string | null; onClose: () => void }) {
  const [expandedSection, setExpandedSection] = useState<string | null>("labs");

  const grouped = lab.interpretations.reduce((acc: Record<string, typeof lab.interpretations>, interp) => {
    const cat = interp.category.includes(":") ? interp.category.split(":")[0].trim() : interp.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(interp);
    return acc;
  }, {});

  const hasCVRisk = !!lab.preventRisk;
  const hasIR = !!(lab.insulinResistance && lab.insulinResistance.likelihood && lab.insulinResistance.likelihood !== 'none');

  function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
    const open = expandedSection === id;
    return (
      <div className="border rounded-xl overflow-hidden" style={{ borderColor: "#ede8df" }}>
        <button
          className="w-full px-4 py-3.5 flex items-center justify-between text-left"
          style={{ backgroundColor: open ? "#f2ede6" : "#ffffff" }}
          onClick={() => setExpandedSection(open ? null : id)}
        >
          <div className="flex items-center gap-2.5">
            {icon}
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>{title}</span>
          </div>
          {open ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "#7a8a64" }} /> : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "#7a8a64" }} />}
        </button>
        {open && <div className="px-4 pb-4 pt-1">{children}</div>}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] p-0 gap-0 overflow-hidden" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "#e8ddd0" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold" style={{ color: "#1c2414" }}>
                Lab Visit Summary
              </DialogTitle>
              <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{formatDate(lab.labDate)}</p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-4 py-4 space-y-3">

            {/* 1. Lab values table */}
            {lab.interpretations.length > 0 && (
              <Section id="labs" title="Your Lab Values" icon={<FlaskConical className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                <div className="space-y-4 pt-1">
                  {Object.entries(grouped).map(([groupName, items]) => (
                    <div key={groupName}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#7a8a64" }}>{groupName}</p>
                      <div className="space-y-1.5">
                        {items.map((interp, i) => {
                          const statusConfig = STATUS_COLORS[interp.status] || STATUS_COLORS.normal;
                          const label = interp.category.includes(":") ? interp.category.split(":").slice(1).join(":").trim() : interp.category;
                          return (
                            <div key={i} className="flex items-start gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: "#f0ebe2" }}>
                              <StatusDot status={interp.status} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                  <span className="text-xs font-medium" style={{ color: "#1c2414" }}>{label}</span>
                                  {interp.value !== undefined && (
                                    <span className="text-xs font-mono font-semibold flex-shrink-0" style={{ color: statusConfig.text }}>
                                      {interp.value} {interp.unit}
                                    </span>
                                  )}
                                </div>
                                {interp.referenceRange && (
                                  <p className="text-xs mt-0.5" style={{ color: "#a0a880" }}>Ref: {interp.referenceRange}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 2. Cardiac assessment */}
            {hasCVRisk && (
              <Section id="cardiac" title="Heart Health Assessment" icon={<Heart className="w-4 h-4" style={{ color: "#c0392b" }} />}>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#5a6a48" }}>Overall risk level</span>
                    <RiskBadge category={lab.preventRisk.riskCategory} />
                  </div>
                  <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#f9f6f0" }}>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "#7a8a64" }}>10-year cardiovascular risk</span>
                      <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.tenYearCVDPercentage}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "#7a8a64" }}>10-year heart disease risk</span>
                      <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.tenYearASCVDPercentage}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "#7a8a64" }}>10-year heart failure risk</span>
                      <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.tenYearHFPercentage}</span>
                    </div>
                    {lab.preventRisk.thirtyYearCVDPercentage && (
                      <div className="flex justify-between text-xs pt-1 border-t" style={{ borderColor: "#e8ddd0" }}>
                        <span style={{ color: "#7a8a64" }}>30-year cardiovascular risk</span>
                        <span className="font-semibold" style={{ color: "#1c2414" }}>{lab.preventRisk.thirtyYearCVDPercentage}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed italic" style={{ color: "#7a8a64" }}>
                    Based on the 2023 AHA PREVENT equations. These estimates are based on your lab values and help guide preventive care decisions.
                  </p>
                </div>
              </Section>
            )}

            {/* 3. Metabolic assessment */}
            {hasIR && (
              <Section id="metabolic" title="Metabolic Health Assessment" icon={<Activity className="w-4 h-4" style={{ color: "#c9932a" }} />}>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#5a6a48" }}>Metabolic balance</span>
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: lab.insulinResistance.likelihood === 'high' ? "#fce8e6" : lab.insulinResistance.likelihood === 'moderate' ? "#fef2e6" : "#fef8ec",
                        color: lab.insulinResistance.likelihood === 'high' ? "#7a1a0a" : lab.insulinResistance.likelihood === 'moderate' ? "#7a4010" : "#7a5a10",
                      }}
                    >
                      {lab.insulinResistance.likelihoodLabel || lab.insulinResistance.likelihood}
                    </span>
                  </div>
                  {lab.insulinResistance.patientSummary && (
                    <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>
                      {lab.insulinResistance.patientSummary}
                    </p>
                  )}
                  {lab.insulinResistance.phenotypes?.length > 0 && (
                    <div className="rounded-lg p-3" style={{ backgroundColor: "#f9f6f0" }}>
                      <p className="text-xs font-medium mb-1.5" style={{ color: "#5a6a48" }}>Identified patterns:</p>
                      {lab.insulinResistance.phenotypes.map((ph: any, i: number) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <p className="text-xs font-semibold" style={{ color: "#1c2414" }}>{ph.name}</p>
                          {ph.patientExplanation && (
                            <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#7a8a64" }}>{ph.patientExplanation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed italic" style={{ color: "#7a8a64" }}>
                    This assessment screens multiple metabolic markers together. Your care team will discuss what these findings mean for your health plan.
                  </p>
                </div>
              </Section>
            )}

            {/* 4. Dietary & lifestyle guidance from published protocol */}
            {dietaryGuidance && (
              <Section id="dietary" title="Dietary & Lifestyle Guidance" icon={<Utensils className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                <div className="pt-1 space-y-2">
                  <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#3d4a30" }}>{dietaryGuidance}</p>
                  <p className="text-xs italic" style={{ color: "#a0a880" }}>
                    Guidance provided by your care team at {" "}
                    <span className="not-italic font-medium">{lab.labDate ? formatDate(lab.labDate) : "your last visit"}</span>.
                  </p>
                </div>
              </Section>
            )}

            {/* 5. Health summary — always last */}
            {lab.patientSummary && (
              <Section id="summary" title="Your Health Assessment" icon={<Info className="w-4 h-4" style={{ color: "#5a7040" }} />}>
                <p className="text-sm leading-relaxed pt-1" style={{ color: "#3d4a30" }}>{lab.patientSummary}</p>
              </Section>
            )}

          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: "#e8ddd0" }}>
          <Button
            className="w-full"
            style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClinicalSnapshotSection({ labs }: { labs: PortalLab[] }) {
  if (labs.length < 2) return null;

  const labsForTrend = labs.map(l => ({
    id: l.id,
    labDate: l.labDate,
    labValues: l.labValues,
    patientId: 0,
    clinicianId: 0,
    notes: null,
    createdAt: l.createdAt,
    interpretationResult: null,
  })) as any[];

  const insights = generateTrendInsights(labsForTrend);
  if (insights.length === 0) return null;

  const improved = insights.filter(i => i.direction === 'improved');
  const monitored = insights.filter(i => i.direction === 'worsened');
  const stable = insights.filter(i => i.direction === 'stable');

  if (improved.length === 0 && monitored.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>Your Health Progress</h2>
        <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
          Comparing your two most recent lab visits
        </p>
      </div>

      <div className="space-y-2.5">
        {/* Urgent items first */}
        {insights.filter(i => i.severity === 'urgent').map((insight, i) => (
          <div key={`urgent-${i}`} className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "#fce8e6", border: "1px solid #f5cfc9" }}>
            <TrendingDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#c0392b" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#7a1a0a" }}>{insight.markerName}</p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#8b2a1a" }}>{insight.patientInsight}</p>
            </div>
          </div>
        ))}

        {/* Improvements */}
        {improved.filter(i => i.severity !== 'urgent').map((insight, i) => (
          <div key={`imp-${i}`} className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "#f0f5ea", border: "1px solid #d4e8c4" }}>
            <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#4a8a30" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#2e5e1a" }}>{insight.markerName}</p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#3a6a22" }}>{insight.patientInsight}</p>
            </div>
          </div>
        ))}

        {/* Monitored (worsened but not urgent) */}
        {monitored.filter(i => i.severity !== 'urgent').map((insight, i) => (
          <div key={`mon-${i}`} className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "#fef8ec", border: "1px solid #f0dfb0" }}>
            <TrendingDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#c9932a" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#7a5a10" }}>{insight.markerName}</p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#7a5a10" }}>{insight.patientInsight}</p>
            </div>
          </div>
        ))}

        {/* Stable summary pill */}
        {stable.length > 0 && (
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <Minus className="w-4 h-4 flex-shrink-0" style={{ color: "#7a8a64" }} />
            <p className="text-sm" style={{ color: "#5a6a48" }}>
              <span className="font-semibold">{stable.length} marker{stable.length !== 1 ? 's' : ''}</span> are holding steady:{" "}
              <span style={{ color: "#7a8a64" }}>{stable.map(s => s.markerName).join(", ")}</span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function PortalDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const unreadCount = usePortalUnreadCount();
  const [selectedLab, setSelectedLab] = useState<PortalLab | null>(null);
  const [showAllJourney, setShowAllJourney] = useState(false);

  const { data: patient, isLoading: patientLoading, error: patientError } = useQuery<PortalPatient>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const { data: protocol, isLoading: protocolLoading } = useQuery<PublishedProtocol | null>({
    queryKey: ["/api/portal/protocol"],
    enabled: !!patient,
    retry: false,
  });

  const { data: labs = [], isLoading: labsLoading } = useQuery<PortalLab[]>({
    queryKey: ["/api/portal/labs"],
    enabled: !!patient,
    retry: false,
  });

  const { data: messagingConfig } = useQuery<{
    messagingPreference: 'none' | 'in_app' | 'sms' | 'external_api';
    messagingPhone: string | null;
  }>({
    queryKey: ["/api/portal/messaging-config"],
    enabled: !!patient,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/login?mode=patient");
    },
  });

  useEffect(() => {
    if (patientError) setLocation("/login?mode=patient");
  }, [patientError, setLocation]);

  if (patientLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "#2e3a20" }}>
            <Leaf className="w-5 h-5" style={{ color: "#e8ddd0" }} />
          </div>
          <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your health portal…</p>
        </div>
      </div>
    );
  }

  if (!patient) return null;

  const latestLab = labs[0];
  const supplements = protocol?.supplements || [];
  const highPriority = supplements.filter((s) => s.priority === "high");
  const otherSupplements = supplements.filter((s) => s.priority !== "high");
  const journeyLabsToShow = showAllJourney ? labs : labs.slice(0, 4);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="h-12 sm:h-11 w-auto flex-shrink-0"
            style={{ mixBlendMode: "multiply" }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-portal-logout"
            className="text-xs gap-1.5 flex-shrink-0"
            style={{ color: "#7a8a64" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10 pb-28">
        {/* Hero greeting */}
        <div className="space-y-1 pt-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
            {getGreeting(patient.firstName)}
          </h1>
          <p className="text-sm" style={{ color: "#7a8a64" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {patient.clinicName && (
            <p className="text-xs pt-0.5" style={{ color: "#a0a890" }}>
              Care provided by {patient.clinicName}
            </p>
          )}
        </div>

        {/* Message Provider button */}
        {messagingConfig && messagingConfig.messagingPreference !== 'none' && (
          <div>
            {messagingConfig.messagingPreference === 'sms' && messagingConfig.messagingPhone ? (
              <a href={`sms:${messagingConfig.messagingPhone}`} data-testid="button-message-provider-sms">
                <button
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                >
                  <Smartphone className="w-4 h-4" />
                  Message your care team
                </button>
              </a>
            ) : (
              <Link href="/portal/messages">
                <button
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                  data-testid="button-message-provider-inapp"
                >
                  <MessageSquare className="w-4 h-4" />
                  Message your care team
                </button>
              </Link>
            )}
          </div>
        )}

        {/* Quick stats strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarDays className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" style={{ color: "#7a8a64" }} />
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium leading-tight" style={{ color: "#7a8a64" }}>Last Labs</p>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: "#1c2414" }}>
              {latestLab ? formatDateShort(latestLab.labDate) : "None on file"}
            </p>
          </div>
          <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" style={{ color: "#7a8a64" }} />
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium leading-tight" style={{ color: "#7a8a64" }}>Protocol</p>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: "#1c2414" }}>
              {supplements.length > 0 ? `${supplements.length} supplement${supplements.length !== 1 ? "s" : ""}` : "Not shared"}
            </p>
          </div>
          <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <FlaskConical className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" style={{ color: "#7a8a64" }} />
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium leading-tight" style={{ color: "#7a8a64" }}>Lab Visits</p>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: "#1c2414" }}>
              {labs.length} visit{labs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Clinical snapshot (trend insights) */}
        {!labsLoading && <ClinicalSnapshotSection labs={labs} />}

        {/* Supplement protocol section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>
                Your Wellness Protocol
              </h2>
              {protocol?.publishedAt && (
                <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                  Updated {formatDate(protocol.publishedAt)}
                  {protocol.clinicianName ? ` by ${protocol.clinicianName}` : ""}
                </p>
              )}
            </div>
            {supplements.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs" style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}>
                  <Leaf className="w-3 h-3 mr-1" />
                  Active
                </Badge>
                <Link href="/portal/supplements">
                  <button className="text-xs flex items-center gap-0.5" style={{ color: "#7a8a64" }} data-testid="link-view-full-protocol">
                    View all
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </Link>
              </div>
            )}
          </div>

          {protocolLoading ? (
            <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
              <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your protocol…</p>
            </div>
          ) : supplements.length === 0 ? (
            <div className="rounded-xl p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
              <Sparkles className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>Your protocol is being prepared</p>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Your care team will share your personalized supplement recommendations here after your lab results have been reviewed.
              </p>
            </div>
          ) : (
            <>
              {protocol?.clinicianNotes && (
                <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}>
                  <p className="font-medium text-xs uppercase tracking-wider mb-1.5" style={{ color: "#5a7040" }}>Note from your care team</p>
                  {protocol.clinicianNotes}
                </div>
              )}
              {highPriority.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#7a8a64" }}>Priority</p>
                  {highPriority.map((s, i) => <SupplementCard key={i} supplement={s} />)}
                </div>
              )}
              {otherSupplements.length > 0 && (
                <div className="space-y-3">
                  {highPriority.length > 0 && (
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#7a8a64" }}>Also recommended</p>
                  )}
                  {otherSupplements.map((s, i) => <SupplementCard key={i} supplement={s} />)}
                </div>
              )}
            </>
          )}
        </section>

        {/* Dietary guidance section */}
        {protocol?.dietaryGuidance && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4" style={{ color: "#5a7040" }} />
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>
                Your Dietary Guidance
              </h2>
            </div>
            <div className="rounded-xl p-5" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
              <div className="prose prose-sm max-w-none">
                {protocol.dietaryGuidance.split('\n').filter(Boolean).map((line, i) => {
                  const isHeader = line.startsWith('#') || (line === line.toUpperCase() && line.length < 60);
                  if (isHeader) {
                    const text = line.replace(/^#+\s*/, '').replace(/:$/, '');
                    return (
                      <p key={i} className="text-xs font-semibold uppercase tracking-wider mt-4 first:mt-0 mb-1.5" style={{ color: "#5a7040" }}>
                        {text}
                      </p>
                    );
                  }
                  return (
                    <p key={i} className="text-sm leading-relaxed mb-2" style={{ color: "#3d4a30" }}>
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>
          </section>
        )}


        {/* Lab visit history — all visits, clickable */}
        {labs.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>Your Health Journey</h2>
              <p className="text-xs" style={{ color: "#7a8a64" }}>Tap to view details</p>
            </div>
            <div className="space-y-2">
              {journeyLabsToShow.map((lab, i) => (
                <button
                  key={lab.id}
                  className="w-full rounded-xl px-4 py-3.5 flex items-center justify-between text-left transition-opacity active:opacity-80"
                  style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
                  onClick={() => setSelectedLab(lab)}
                  data-testid={`button-view-lab-${lab.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{ backgroundColor: i === 0 ? "#2e3a20" : "#e8ddd0", color: i === 0 ? "#e8ddd0" : "#2e3a20" }}
                    >
                      {labs.length - i}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: "#1c2414" }}>{formatDate(lab.labDate)}</p>
                      <p className="text-xs" style={{ color: "#7a8a64" }}>
                        {lab.interpretations?.length || 0} markers reviewed
                        {lab.preventRisk ? " · Heart risk calculated" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {i === 0 && (
                      <Badge variant="secondary" className="text-xs hidden sm:flex" style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}>
                        Latest
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#a0a880" }} />
                  </div>
                </button>
              ))}
              {labs.length > 4 && (
                <button
                  className="w-full py-2.5 text-sm text-center rounded-xl"
                  style={{ color: "#5a7040", backgroundColor: "transparent" }}
                  onClick={() => setShowAllJourney(v => !v)}
                >
                  {showAllJourney ? "Show less" : `Show ${labs.length - 4} more visit${labs.length - 4 !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Empty state for no labs */}
        {labs.length === 0 && !labsLoading && (
          <section>
            <div className="rounded-xl p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
              <FlaskConical className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>Your lab results will appear here</p>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Once your care team reviews your labs, your personalized health insights will be shared through this portal.
              </p>
            </div>
          </section>
        )}

        {/* Privacy footer */}
        <div className="text-center">
          <p className="text-xs" style={{ color: "#b0b8a0" }}>
            Your data is private and accessible only to you and your care team.
            <br />
            Powered by ReAlign Health.
          </p>
        </div>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t z-40" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 flex">
          <Link href="/portal/dashboard" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-home">
              <CalendarDays className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-semibold" style={{ color: "#2e3a20" }}>Overview</span>
            </button>
          </Link>
          <Link href="/portal/supplements" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-supplements">
              <Package className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Protocol</span>
            </button>
          </Link>
          <Link href="/portal/messages" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-messages">
              <span className="relative">
                <MessageSquare className="w-4 h-4" style={{ color: "#a0a880" }} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold leading-none text-white"
                    style={{ backgroundColor: "#c0392b" }}
                    data-testid="badge-messages-unread"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-xs" style={{ color: "#a0a880" }}>Messages</span>
            </button>
          </Link>
        </div>
      </nav>

      {/* Lab quick view dialog */}
      {selectedLab && <LabQuickViewDialog lab={selectedLab} dietaryGuidance={protocol?.dietaryGuidance} onClose={() => setSelectedLab(null)} />}
    </div>
  );
}
