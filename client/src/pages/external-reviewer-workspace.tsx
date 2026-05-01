import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChartReviewSection } from "@/components/chart-review/chart-review-section";
import { ShieldCheck, Info, LogOut } from "lucide-react";

/**
 * Stripped-down workspace shown to external collaborating physicians whose
 * membership in the active clinic is `chart_review_only`. They see ONLY the
 * chart-review queue — no patients, no scheduling, no billing, no inbox.
 *
 * Users may be a full provider in their own clinic and chart-review-only in
 * another clinic; the clinic switcher in the header lets them flip context.
 */
export default function ExternalReviewerWorkspace() {
  const { user, logoutMutation } = useAuth();

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6" data-testid="page-external-reviewer-workspace">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" style={{ color: "#7a8a64" }} />
              <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }} data-testid="text-workspace-title">
                Chart Review Workspace
              </h1>
              <Badge variant="outline" data-testid="badge-access-scope">Chart review only</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome, {user?.title} {user?.firstName} {user?.lastName}. You are a collaborating physician
              for <span className="font-medium">{user?.clinicName}</span>.
            </p>
          </div>
        </div>

        <Alert data-testid="alert-scope-info">
          <Info className="w-4 h-4" />
          <AlertTitle>Limited access</AlertTitle>
          <AlertDescription>
            For HIPAA minimum-necessary purposes, you can only see notes that have been
            routed to you on this agreement. Patient charts, schedules, billing, and the
            broader EHR are not available in this clinic.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="pt-6">
            <ChartReviewSection />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutateAsync()}
            disabled={logoutMutation.isPending}
            className="text-destructive"
            data-testid="button-external-logout"
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
