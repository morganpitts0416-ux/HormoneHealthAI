import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { CreditCard, AlertCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface BillingStatus {
  subscriptionStatus: string;
  freeAccount: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isClinicOwner?: boolean;
  ownerName?: string | null;
}

function forceSignOut() {
  fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    .catch(() => {})
    .finally(() => {
      document.cookie.split(";").forEach((c) => {
        const name = c.split("=")[0].trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      });
      window.location.href = "/auth";
    });
}

function SignOutButton({ testId }: { testId: string }) {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <Button
      className="w-full"
      variant="ghost"
      onClick={() => {
        setSigningOut(true);
        forceSignOut();
      }}
      disabled={signingOut}
      data-testid={testId}
    >
      <LogOut className="w-4 h-4 mr-2" />
      {signingOut ? "Signing out..." : "Sign Out & Switch Account"}
    </Button>
  );
}

export function BillingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

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
            <SignOutButton testId="button-signout-billing-error" />
            <p className="text-xs text-muted-foreground">
              Need help? Contact support at support@realignhealth.com
            </p>
          </div>
        </div>
      </div>
    );
  }

  const allowedStatuses = ["trial", "active", "trialing"];
  const isNonOwner = billing.isClinicOwner === false;
  const hasValidBilling =
    billing.freeAccount ||
    (!!billing.stripeSubscriptionId && allowedStatuses.includes(billing.subscriptionStatus)) ||
    (isNonOwner && allowedStatuses.includes(billing.subscriptionStatus));
  const isCanceled = billing.subscriptionStatus === "canceled" || billing.subscriptionStatus === "past_due";

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
            <SignOutButton testId="button-signout-nonowner" />
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
          <SignOutButton testId="button-signout-billing-setup" />
          <p className="text-xs text-muted-foreground">
            Need help? Contact support at support@realignhealth.com
          </p>
        </div>
      </div>
    </div>
  );
}
