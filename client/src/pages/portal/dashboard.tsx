import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Leaf, LogOut, FlaskConical, Sparkles, ChevronRight, CalendarDays, TrendingUp, TrendingDown, Minus, Package, MessageSquare, Smartphone } from "lucide-react";
import type { SupplementRecommendation } from "@shared/schema";

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
  labDate: string | null;
  publishedAt: string;
  clinicName: string;
  clinicianName: string;
}

interface PortalLab {
  id: number;
  labDate: string;
  createdAt: string;
  interpretations: Array<{ category: string; value?: number; unit: string; status: string; referenceRange: string; interpretation: string }>;
  patientSummary: string | null;
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

function StatusTrend({ status }: { status: string }) {
  if (status === "normal") return <TrendingUp className="w-3.5 h-3.5" style={{ color: "#2e3a20" }} />;
  if (status === "critical" || status === "abnormal") return <TrendingDown className="w-3.5 h-3.5" style={{ color: "#c0392b" }} />;
  return <Minus className="w-3.5 h-3.5" style={{ color: "#7a8a64" }} />;
}

function SupplementCard({ supplement }: { supplement: SupplementRecommendation }) {
  const icon = CATEGORY_ICONS[supplement.category] || "○";
  const color = PRIORITY_COLORS[supplement.priority] || "#7a8a64";

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 mt-0.5"
            style={{ backgroundColor: "#f2ede6" }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight" style={{ color: "#1c2414" }}>
              {supplement.name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
              {supplement.dose}
            </p>
          </div>
        </div>
        <div
          className="w-2 h-2 rounded-full flex-shrink-0 mt-2"
          style={{ backgroundColor: color }}
        />
      </div>
      {supplement.patientExplanation && (
        <p className="text-sm leading-relaxed" style={{ color: "#5a6a48" }}>
          {supplement.patientExplanation}
        </p>
      )}
      {supplement.caution && (
        <p className="text-xs leading-relaxed italic" style={{ color: "#9a8a70" }}>
          Note: {supplement.caution}
        </p>
      )}
    </div>
  );
}

export default function PortalDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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
    messagingPreference: 'none' | 'in_app' | 'sms';
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
      setLocation("/portal/login");
    },
  });

  useEffect(() => {
    if (patientError) {
      setLocation("/portal/login");
    }
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
  const recentInterpretations = latestLab?.interpretations?.slice(0, 6) || [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="h-9 w-auto flex-shrink-0"
            style={{ mixBlendMode: "multiply" }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-portal-logout"
            className="text-xs gap-1.5"
            style={{ color: "#7a8a64" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Hero greeting */}
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
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
              <a
                href={`sms:${messagingConfig.messagingPhone}`}
                data-testid="button-message-provider-sms"
              >
                <button
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                >
                  <Smartphone className="w-4 h-4" />
                  Message your care team
                </button>
              </a>
            ) : messagingConfig.messagingPreference === 'in_app' ? (
              <Link href="/portal/messages">
                <button
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                  data-testid="button-message-provider-inapp"
                >
                  <MessageSquare className="w-4 h-4" />
                  Message your care team
                </button>
              </Link>
            ) : null}
          </div>
        )}

        {/* Quick stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-3.5 h-3.5" style={{ color: "#7a8a64" }} />
              <p className="text-xs uppercase tracking-wider font-medium" style={{ color: "#7a8a64" }}>Last Labs</p>
            </div>
            <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>
              {latestLab ? formatDate(latestLab.labDate) : "None on file"}
            </p>
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-3.5 h-3.5" style={{ color: "#7a8a64" }} />
              <p className="text-xs uppercase tracking-wider font-medium" style={{ color: "#7a8a64" }}>Protocol</p>
            </div>
            <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>
              {supplements.length > 0 ? `${supplements.length} supplement${supplements.length !== 1 ? "s" : ""}` : "Not yet shared"}
            </p>
          </div>

          <div className="rounded-xl p-4 col-span-2 sm:col-span-1" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-3.5 h-3.5" style={{ color: "#7a8a64" }} />
              <p className="text-xs uppercase tracking-wider font-medium" style={{ color: "#7a8a64" }}>Lab Visits</p>
            </div>
            <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>
              {labs.length} visit{labs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Supplement protocol section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
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
                <Badge
                  variant="secondary"
                  className="text-xs"
                  style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  Active
                </Badge>
                <Link href="/portal/supplements">
                  <button
                    className="text-xs flex items-center gap-0.5"
                    style={{ color: "#7a8a64" }}
                    data-testid="link-view-full-protocol"
                  >
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
            <div
              className="rounded-xl p-8 text-center space-y-2"
              style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
            >
              <Sparkles className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
                Your protocol is being prepared
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Your care team will share your personalized supplement recommendations here after your lab results have been reviewed.
              </p>
            </div>
          ) : (
            <>
              {protocol?.clinicianNotes && (
                <div
                  className="rounded-xl p-4 text-sm leading-relaxed"
                  style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}
                >
                  <p className="font-medium text-xs uppercase tracking-wider mb-1.5" style={{ color: "#5a7040" }}>
                    Note from your care team
                  </p>
                  {protocol.clinicianNotes}
                </div>
              )}

              {highPriority.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#7a8a64" }}>
                    Priority
                  </p>
                  {highPriority.map((s, i) => (
                    <SupplementCard key={i} supplement={s} />
                  ))}
                </div>
              )}

              {otherSupplements.length > 0 && (
                <div className="space-y-3">
                  {highPriority.length > 0 && (
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#7a8a64" }}>
                      Also recommended
                    </p>
                  )}
                  {otherSupplements.map((s, i) => (
                    <SupplementCard key={i} supplement={s} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Latest lab summary */}
        {latestLab && latestLab.patientSummary && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>
              Your Most Recent Labs
            </h2>
            <div
              className="rounded-xl p-5 space-y-4"
              style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
            >
              <div className="flex items-center gap-2 text-xs" style={{ color: "#7a8a64" }}>
                <CalendarDays className="w-3.5 h-3.5" />
                <span>{formatDate(latestLab.labDate)}</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>
                {latestLab.patientSummary}
              </p>
              {recentInterpretations.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {recentInterpretations.map((interp, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ backgroundColor: "#f9f6f0" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate" style={{ color: "#1c2414" }}>
                          {interp.category}
                        </p>
                        {interp.value !== undefined && (
                          <p className="text-xs" style={{ color: "#7a8a64" }}>
                            {interp.value} {interp.unit}
                          </p>
                        )}
                      </div>
                      <StatusTrend status={interp.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Lab visit history */}
        {labs.length > 1 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#1c2414" }}>
              Your Health Journey
            </h2>
            <div className="space-y-2">
              {labs.map((lab, i) => (
                <div
                  key={lab.id}
                  className="rounded-xl px-4 py-3.5 flex items-center justify-between"
                  style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{ backgroundColor: i === 0 ? "#2e3a20" : "#e8ddd0", color: i === 0 ? "#e8ddd0" : "#2e3a20" }}
                    >
                      {labs.length - i}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
                        {formatDate(lab.labDate)}
                      </p>
                      <p className="text-xs" style={{ color: "#7a8a64" }}>
                        {lab.interpretations?.length || 0} markers reviewed
                      </p>
                    </div>
                  </div>
                  {i === 0 && (
                    <Badge
                      variant="secondary"
                      className="text-xs"
                      style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}
                    >
                      Latest
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state for no labs */}
        {labs.length === 0 && !labsLoading && (
          <section>
            <div
              className="rounded-xl p-8 text-center space-y-2"
              style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
            >
              <FlaskConical className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
                Your lab results will appear here
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Once your care team reviews your labs, your personalized health insights will be shared through this portal.
              </p>
            </div>
          </section>
        )}

        {/* Powered by footer note */}
        <div className="pb-6 text-center">
          <p className="text-xs" style={{ color: "#b0b8a0" }}>
            Your data is private and accessible only to you and your care team.
            <br />
            Powered by ReAlign Health.
          </p>
        </div>
      </main>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 border-t z-40"
        style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}
      >
        <div className="max-w-3xl mx-auto px-4 flex">
          <Link href="/portal/dashboard" className="flex-1">
            <button
              className="w-full py-3.5 flex flex-col items-center gap-1"
              data-testid="nav-portal-home"
            >
              <CalendarDays className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-semibold" style={{ color: "#2e3a20" }}>Overview</span>
            </button>
          </Link>
          <Link href="/portal/supplements" className="flex-1">
            <button
              className="w-full py-3.5 flex flex-col items-center gap-1"
              data-testid="nav-portal-supplements"
            >
              <Package className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Protocol</span>
            </button>
          </Link>
          <Link href="/portal/messages" className="flex-1">
            <button
              className="w-full py-3.5 flex flex-col items-center gap-1"
              data-testid="nav-portal-messages"
            >
              <MessageSquare className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Messages</span>
            </button>
          </Link>
        </div>
      </nav>

      {/* Spacer for bottom nav */}
      <div className="h-20" />
    </div>
  );
}
