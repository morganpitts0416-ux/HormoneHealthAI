import { useQuery } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  PortalVisitSummaryCard,
  type PortalVisitSummary,
} from "@/components/portal/portal-data";

export default function PortalVisitsPage() {
  const { data: visitSummaries = [], isLoading } = useQuery<PortalVisitSummary[]>({
    queryKey: ["/api/portal/encounters"],
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/portal/encounters", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <PortalShell activeTab="home" headerSubtitle="Visit Summaries">
      <div className="space-y-2 pt-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
          My Visit Summaries
        </h1>
        <p className="text-sm" style={{ color: "#7a8a64" }}>
          Notes shared from your care team after each encounter.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
          <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your visits…</p>
        </div>
      ) : visitSummaries.length === 0 ? (
        <div className="rounded-xl p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
          <Stethoscope className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
          <p className="text-sm font-medium" style={{ color: "#1c2414" }}>No visit summaries yet</p>
          <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
            After your visits, summaries from your care team will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visitSummaries.map(vs => (
            <PortalVisitSummaryCard key={vs.id} vs={vs} />
          ))}
        </div>
      )}
    </PortalShell>
  );
}
