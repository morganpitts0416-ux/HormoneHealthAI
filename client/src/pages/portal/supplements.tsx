import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Leaf, LogOut, ChevronLeft, CalendarDays, Clock, Package, Sparkles,
  ChevronDown, ChevronUp, MessageSquare
} from "lucide-react";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import { useState } from "react";
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

const CATEGORY_ICONS: Record<string, string> = {
  vitamin: "◈",
  mineral: "✦",
  "hormone-support": "⚡",
  cardiovascular: "♡",
  thyroid: "⊕",
  iron: "●",
  metabolic: "◆",
  bone: "◻",
  probiotic: "◌",
  detox: "◈",
  general: "○",
};

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "Priority", color: "#2e3a20", bg: "#edf2e6" },
  medium: { label: "Recommended", color: "#5a4a20", bg: "#f5f0e6" },
  low: { label: "Optional", color: "#6a7a64", bg: "#f2f0ec" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function SupplementRow({ supplement, index }: { supplement: SupplementRecommendation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const icon = CATEGORY_ICONS[supplement.category] || "○";
  const priority = PRIORITY_LABELS[supplement.priority] || PRIORITY_LABELS.low;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid #ede8df", backgroundColor: "#ffffff" }}
    >
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-supplement-${index}`}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0"
          style={{ backgroundColor: "#f2ede6" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: "#1c2414" }}>
              {supplement.name}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: priority.bg, color: priority.color }}
            >
              {priority.label}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
            {supplement.dose}
          </p>
        </div>
        <div className="flex-shrink-0 ml-2" style={{ color: "#b0b8a0" }}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t" style={{ borderColor: "#f0ebe2" }}>
          {supplement.patientExplanation && (
            <div className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "#a0a880" }}>
                Why this supplement
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>
                {supplement.patientExplanation}
              </p>
            </div>
          )}
          {supplement.caution && (
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#faf7f2" }}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "#9a8a70" }}>
                Note
              </p>
              <p className="text-xs leading-relaxed italic" style={{ color: "#7a7060" }}>
                {supplement.caution}
              </p>
            </div>
          )}
          {supplement.timing && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a0a880" }} />
              <p className="text-xs" style={{ color: "#7a8a64" }}>
                {supplement.timing}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProtocolBlock({ protocol, isLatest }: { protocol: PublishedProtocol; isLatest: boolean }) {
  const highPriority = protocol.supplements.filter((s) => s.priority === "high");
  const medium = protocol.supplements.filter((s) => s.priority === "medium");
  const low = protocol.supplements.filter((s) => s.priority === "low");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold" style={{ color: "#1c2414" }}>
              Protocol from {protocol.labDate ? formatDate(protocol.labDate) : formatDate(protocol.publishedAt)}
            </h2>
            {isLatest && (
              <Badge
                className="text-xs"
                style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}
              >
                <Leaf className="w-3 h-3 mr-1" />
                Current
              </Badge>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#a0a880" }}>
            Shared {formatDate(protocol.publishedAt)}
            {protocol.clinicianName ? ` · ${protocol.clinicianName}` : ""}
          </p>
        </div>
        <div
          className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
          style={{ backgroundColor: "#f0ebe2", color: "#7a6a50" }}
        >
          {protocol.supplements.length} supplement{protocol.supplements.length !== 1 ? "s" : ""}
        </div>
      </div>

      {protocol.clinicianNotes && (
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
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Priority</p>
          {highPriority.map((s, i) => (
            <SupplementRow key={i} supplement={s} index={i} />
          ))}
        </div>
      )}

      {medium.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Recommended</p>
          {medium.map((s, i) => (
            <SupplementRow key={i} supplement={s} index={highPriority.length + i} />
          ))}
        </div>
      )}

      {low.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Optional</p>
          {low.map((s, i) => (
            <SupplementRow key={i} supplement={s} index={highPriority.length + medium.length + i} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortalSupplements() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const unreadCount = usePortalUnreadCount();

  const { data: patient, isLoading: patientLoading, error: patientError } = useQuery<PortalPatient>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const { data: protocols = [], isLoading: protocolsLoading } = useQuery<PublishedProtocol[]>({
    queryKey: ["/api/portal/protocols"],
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
          <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your protocol…</p>
        </div>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/portal/dashboard">
            <button
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "#7a8a64" }}
              data-testid="button-portal-back"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          </Link>
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="h-8 w-auto flex-shrink-0 absolute left-1/2 -translate-x-1/2"
            style={{ mixBlendMode: "multiply" }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-portal-logout-supps"
            className="text-xs gap-1.5"
            style={{ color: "#7a8a64" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Page title */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" style={{ color: "#2e3a20" }} />
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
              Your Supplement Protocols
            </h1>
          </div>
          <p className="text-sm" style={{ color: "#7a8a64" }}>
            All supplement protocols shared by your care team, from most recent to earliest.
          </p>
        </div>

        {/* Protocol list */}
        {protocolsLoading ? (
          <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your protocols…</p>
          </div>
        ) : protocols.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center space-y-3"
            style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
          >
            <Sparkles className="w-8 h-8 mx-auto" style={{ color: "#c4b9a5" }} />
            <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
              No protocols published yet
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
              Your care team will publish your personalized supplement protocol here after reviewing your lab results.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {protocols.map((protocol, i) => (
              <div key={protocol.id}>
                <ProtocolBlock protocol={protocol} isLatest={i === 0} />
                {i < protocols.length - 1 && (
                  <div className="mt-12 border-t" style={{ borderColor: "#e8ddd0" }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <div className="pb-6 text-center">
          <p className="text-xs" style={{ color: "#b0b8a0" }}>
            These recommendations are personalized to your lab results.
            <br />
            Always consult your care team before making changes.
          </p>
        </div>
      </main>

      {/* Bottom nav */}
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
              <CalendarDays className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Overview</span>
            </button>
          </Link>
          <Link href="/portal/supplements" className="flex-1">
            <button
              className="w-full py-3.5 flex flex-col items-center gap-1"
              data-testid="nav-portal-supplements"
            >
              <Package className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-semibold" style={{ color: "#2e3a20" }}>Protocol</span>
            </button>
          </Link>
          <Link href="/portal/messages" className="flex-1">
            <button
              className="w-full py-3.5 flex flex-col items-center gap-1"
              data-testid="nav-portal-messages"
            >
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

      {/* Spacer for bottom nav */}
      <div className="h-20" />
    </div>
  );
}
