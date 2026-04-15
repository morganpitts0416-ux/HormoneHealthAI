import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { CreditCard, AlertCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface BillingStatus {
  subscriptionStatus: string;
  freeAccount: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isClinicOwner?: boolean;
  ownerName?: string | null;
}

export function BillingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const { data: billing, isLoading, isError } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    enabled: !!user,
    staleTime: 30_000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Checking billing status...</div>
      </div>
    );
  }

  if (isError || !billing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#fef3c7" }}>
            <AlertCircle className="w-8 h-8" style={{ color: "#b45309" }} />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#1c2414" }}>Unable to verify billing</h2>
            <p className="text-sm text-muted-foreground">
              We could not verify your billing status. Please try again or contact support if this persists.
            </p>
          </div>
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => window.location.reload()}
              variant="outline"
              data-testid="button-retry-billing"
            >
              Try Again
            </Button>
            <Button
              className="w-full"
              onClick={() => setLocation("/account")}
              style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
              data-testid="button-go-to-account"
            >
              Go to Account Settings
            </Button>
            <Button
              className="w-full"
              variant="ghost"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-signout-billing-error"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {logoutMutation.isPending ? "Signing out..." : "Sign Out & Switch Account"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Need help? Contact support at support@realignhealth.com
            </p>
          </div>
        </div>
      </div>
    );
  }

  const allowedStatuses = ["trial", "active", "trialing"];
  const hasValidBilling = billing.freeAccount || (!!billing.stripeSubscriptionId && allowedStatuses.includes(billing.subscriptionStatus));
  const isCanceled = billing.subscriptionStatus === "canceled" || billing.subscriptionStatus === "past_due";
  const isNonOwner = billing.isClinicOwner === false;

  if (hasValidBilling) {
    return <>{children}</>;
  }

  if (isNonOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#fef3c7" }}>
            <AlertCircle className="w-8 h-8" style={{ color: "#b45309" }} />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#1c2414" }}>
              Account Access Issue
            </h2>
            <p className="text-sm text-muted-foreground">
              {isCanceled
                ? "Your clinic's subscription is no longer active. Please contact your clinic administrator to resolve the billing issue."
                : "There is a billing issue with your clinic's account. Please contact your clinic administrator to restore access."}
            </p>
            {billing.ownerName && (
              <p className="text-sm text-muted-foreground mt-2">
                Account owner: <span className="font-medium text-foreground">{billing.ownerName}</span>
              </p>
            )}
          </div>
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => window.location.reload()}
              variant="outline"
              data-testid="button-retry-billing"
            >
              Try Again
            </Button>
            <Button
              className="w-full"
              variant="ghost"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-signout-nonowner"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {logoutMutation.isPending ? "Signing out..." : "Sign Out & Switch Account"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Need help? Contact support at support@realignhealth.com
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#f4f8f0" }}>
          {isCanceled ? (
            <AlertCircle className="w-8 h-8" style={{ color: "#b45309" }} />
          ) : (
            <CreditCard className="w-8 h-8" style={{ color: "#2e3a20" }} />
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: "#1c2414" }}>
            {isCanceled ? "Subscription Canceled" : "Billing Setup Required"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isCanceled
              ? "Your subscription has been canceled. Please reactivate your subscription to continue using ClinIQ."
              : "Your account requires an active subscription to access the platform. Please set up billing to continue."}
          </p>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={() => setLocation("/account")}
            style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
            data-testid="button-go-to-billing"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            {isCanceled ? "Reactivate Subscription" : "Set Up Billing"}
          </Button>
          <Button
            className="w-full"
            variant="ghost"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-signout-billing-setup"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {logoutMutation.isPending ? "Signing out..." : "Sign Out & Switch Account"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Need help? Contact support at support@realignhealth.com
          </p>
        </div>
      </div>
    </div>
  );
}
