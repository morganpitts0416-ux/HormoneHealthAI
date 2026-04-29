import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, ChevronRight } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  LabQuickViewDialog,
  formatDate,
  type PortalLab,
} from "@/components/portal/portal-data";

interface PublishedProtocol {
  id: number;
  dietaryGuidance: string | null;
}

export default function PortalLabsPage() {
  const [selectedLab, setSelectedLab] = useState<PortalLab | null>(null);

  const { data: labs = [], isLoading } = useQuery<PortalLab[]>({
    queryKey: ["/api/portal/labs"],
    retry: false,
  });

  const { data: protocol } = useQuery<PublishedProtocol | null>({
    queryKey: ["/api/portal/protocol"],
    retry: false,
  });

  return (
    <PortalShell activeTab="home" headerSubtitle="My Labs">
      <div className="space-y-2 pt-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
          My Lab Evaluations
        </h1>
        <p className="text-sm" style={{ color: "#7a8a64" }}>
          Tap any visit to see your values, recommendations and provider notes.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
          <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your labs…</p>
        </div>
      ) : labs.length === 0 ? (
        <div className="rounded-xl p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
          <FlaskConical className="w-7 h-7 mx-auto mb-3" style={{ color: "#c4b9a5" }} />
          <p className="text-sm font-medium" style={{ color: "#1c2414" }}>Your lab results will appear here</p>
          <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
            Once your care team reviews your labs, your personalized health insights will be shared through this portal.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {labs.map((lab, i) => (
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
        </div>
      )}

      {selectedLab && (
        <LabQuickViewDialog
          lab={selectedLab}
          dietaryGuidance={protocol?.dietaryGuidance}
          onClose={() => setSelectedLab(null)}
        />
      )}
    </PortalShell>
  );
}
