import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, ChevronDown } from "lucide-react";

type Membership = {
  clinicId: number;
  clinicName: string;
  clinicalRole: string | null;
  adminRole: string | null;
  accessScope: "full" | "chart_review_only";
  isActive: boolean;
  acceptanceStatus: string | null;
};

type MembershipsResponse = {
  activeClinicId: number | null;
  memberships: Membership[];
};

export function ClinicSwitcher() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const membershipsQuery = useQuery<MembershipsResponse>({
    queryKey: ["/api/me/memberships"],
    staleTime: 60_000,
  });

  const switchMut = useMutation({
    mutationFn: async (clinicId: number) => {
      const res = await apiRequest("POST", "/api/me/active-clinic", { clinicId });
      return res.json();
    },
    onSuccess: () => {
      // The active clinic affects almost every query — and crucially the
      // top-level <ProtectedRoute> swaps the entire workspace tree based on
      // the new accessScope returned from /api/auth/me. A hard reload is the
      // cleanest way to guarantee every component (BillingGate, RecordingProvider,
      // patient context, etc.) reads the new clinic context from a clean slate.
      queryClient.clear();
      toast({ title: "Clinic switched" });
      window.location.assign("/dashboard");
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "Could not switch clinic",
        description: e?.message ?? "Please try again.",
      });
    },
  });

  const data = membershipsQuery.data;
  const memberships = (data?.memberships ?? []).filter((m) => m.isActive && m.acceptanceStatus !== "pending_acceptance");
  const activeClinicId = data?.activeClinicId ?? null;
  const active = memberships.find((m) => m.clinicId === activeClinicId) ?? memberships[0] ?? null;

  if (!data || memberships.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 max-w-[220px]"
          style={{ color: "#2e3a20" }}
          data-testid="button-clinic-switcher"
        >
          <Building2 className="w-4 h-4" />
          <span className="truncate text-xs sm:text-sm">{active?.clinicName ?? "Choose clinic"}</span>
          <ChevronDown className="w-3 h-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch clinic</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.clinicId}
            onClick={() => switchMut.mutate(m.clinicId)}
            disabled={switchMut.isPending || m.clinicId === activeClinicId}
            data-testid={`menuitem-clinic-${m.clinicId}`}
          >
            <div className="flex items-start gap-2 w-full">
              <div className="w-4 h-4 mt-0.5 flex-shrink-0">
                {m.clinicId === activeClinicId && <Check className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{m.clinicName}</div>
                {m.accessScope === "chart_review_only" && (
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    Chart review only
                  </Badge>
                )}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
