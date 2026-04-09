import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Clock, CreditCard, AlertTriangle, XCircle, ShieldCheck, Zap, ArrowUpCircle, Users } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface BillingStatus {
  subscriptionStatus: string;
  freeAccount: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
  clinicPlan: string;
  clinicMaxProviders: number;
  clinicBaseProviderLimit: number;
  clinicExtraSeats: number;
}

interface BillingConfig {
  publishableKey: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    trial: { label: "Free Trial", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
    active: { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    past_due: { label: "Past Due", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
    canceled: { label: "Canceled", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
    incomplete: { label: "Incomplete", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  };
  const v = variants[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  );
}

// ── Card form (inside Elements provider) ─────────────────────────────────────
// plan='solo'  → calls /api/billing/subscribe (14-day trial, $149/mo, FOUNDER50 promo eligible)
// plan='suite' → calls /api/billing/subscribe-suite (14-day trial, $249/mo, no promo)

function CardSetupForm({
  onSuccess,
  plan = "solo",
}: {
  onSuccess: () => void;
  plan?: "solo" | "suite";
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);

  function handlePromoCheck() {
    if (plan !== "solo") return;
    const code = promoCode.trim().toUpperCase();
    if (code === "FOUNDER50") {
      setPromoApplied(true);
      toast({ title: "Promo code applied", description: "FOUNDER50 — your rate will be locked at $97/month." });
    } else if (code) {
      toast({ title: "Invalid code", description: "That promo code wasn't recognised.", variant: "destructive" });
    }
  }

  const subscribeMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const endpoint = plan === "suite" ? "/api/billing/subscribe-suite" : "/api/billing/subscribe";
      const body: Record<string, unknown> = { paymentMethodId };
      if (plan === "solo" && promoApplied) body.promoCode = promoCode.trim().toUpperCase();
      return apiRequest("POST", endpoint, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/billing/status"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      const label = plan === "suite" ? "ClinIQ Suite" : "Solo ClinIQ";
      toast({ title: "Subscription started", description: `Your 14-day free trial of ${label} is now active.` });
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Subscription failed", description: err.message, variant: "destructive" });
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    try {
      const configRes = await apiRequest("POST", "/api/billing/create-setup-intent", {});
      const { clientSecret } = await configRes.json();

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (error) {
        toast({ title: "Card error", description: error.message, variant: "destructive" });
        return;
      }

      if (setupIntent?.payment_method) {
        await subscribeMutation.mutateAsync(setupIntent.payment_method as string);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const monthlyRate = plan === "suite" ? "$249" : (promoApplied ? "$97" : "$149");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Promo code — Solo only */}
      {plan === "solo" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Promo code (optional)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value); setPromoApplied(false); }}
              placeholder="e.g. FOUNDER50"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="input-promo-code"
            />
            <Button type="button" variant="outline" onClick={handlePromoCheck} data-testid="button-apply-promo">
              Apply
            </Button>
          </div>
          {promoApplied && (
            <p className="text-xs font-semibold" style={{ color: "#5a7040" }}>
              FOUNDER50 applied — locked at $97/month
            </p>
          )}
        </div>
      )}

      {/* Card element */}
      <div className="rounded-md border p-3 bg-background">
        <CardElement
          onReady={() => setReady(true)}
          options={{
            style: {
              base: {
                fontSize: "14px",
                color: "hsl(var(--foreground))",
                fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                "::placeholder": { color: "hsl(var(--muted-foreground))" },
              },
              invalid: { color: "hsl(var(--destructive))" },
            },
          }}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span>Secured by Stripe. Your card will not be charged until after your 14-day trial ends.</span>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || !ready || submitting || subscribeMutation.isPending}
        data-testid={plan === "suite" ? "button-start-suite-trial" : "button-start-trial"}
      >
        {submitting || subscribeMutation.isPending
          ? "Processing…"
          : `Start Free Trial — ${monthlyRate}/month after`}
      </Button>
    </form>
  );
}

// ── Main billing page ─────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [showSuiteCardForm, setShowSuiteCardForm] = useState(false);

  const { data: billingConfig } = useQuery<BillingConfig>({
    queryKey: ["/api/billing/config"],
  });

  const { data: status, isLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
  });

  useEffect(() => {
    if (billingConfig?.publishableKey && !stripePromise) {
      setStripePromise(loadStripe(billingConfig.publishableKey));
    }
  }, [billingConfig?.publishableKey]);

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/billing/cancel", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/billing/status"] });
      toast({ title: "Cancellation scheduled", description: "Your subscription will end at the current period end." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/billing/reactivate", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/billing/status"] });
      toast({ title: "Subscription reactivated", description: "Your subscription will continue as normal." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/billing/upgrade-to-suite", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/billing/status"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Upgraded to ClinIQ Suite",
        description: "Your clinic now supports 2 included providers. Additional providers are $79/month each.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Upgrade failed", description: err.message, variant: "destructive" });
    },
  });

  const isFreeAccount = status?.freeAccount === true;
  const hasSubscription = !!(status?.stripeSubscriptionId);
  const isTrial = status?.subscriptionStatus === "trial";
  const isActive = status?.subscriptionStatus === "active";
  const isPastDue = status?.subscriptionStatus === "past_due";
  const isCanceled = status?.subscriptionStatus === "canceled";
  const cancelAtEnd = status?.stripeCancelAtPeriodEnd;
  const daysLeft = daysUntil(status?.stripeCurrentPeriodEnd ?? null);

  const clinicPlan = status?.clinicPlan ?? "solo";
  const isOnSuite = clinicPlan === "suite";
  const isOnSolo = !isOnSuite;
  // Upgrade button shows when user has an active/trial Solo sub and wants to move to Suite
  const canOneClickUpgrade = isOnSolo && hasSubscription && !isCanceled;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your ClinIQ subscription and payment method.
          </p>
        </div>

        {/* ── Current plan card ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base font-semibold">
                {isOnSuite ? "ClinIQ Suite" : "Solo ClinIQ Plan"}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {isOnSuite && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Current Plan
                  </span>
                )}
                {status && <StatusBadge status={status.subscriptionStatus} />}
              </div>
            </div>
            <CardDescription>ClinIQ Clinical Intelligence Platform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-16 animate-pulse rounded-md bg-muted" />
            ) : isFreeAccount ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md p-3 text-sm" style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}>
                  <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "#5a7040" }} />
                  <div>
                    <p className="font-semibold">Complimentary Access</p>
                    <p className="text-xs mt-0.5" style={{ color: "#5a7040" }}>
                      This account has been granted full access at no charge. No payment method is required.
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  For questions about your account, please contact your administrator.
                </div>
              </div>
            ) : (
              <>
                {/* Plan details row */}
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-bold">{isOnSuite ? "$249" : "$149"}</span>
                    <span className="text-muted-foreground text-sm ml-1">/ month</span>
                    {isOnSuite && status && (status.clinicExtraSeats ?? 0) > 0 && (
                      <span className="text-muted-foreground text-xs ml-2">
                        + ${(status.clinicExtraSeats ?? 0) * 79}/mo ({status.clinicExtraSeats} extra seat{status.clinicExtraSeats !== 1 ? "s" : ""})
                      </span>
                    )}
                  </div>
                  {isTrial && daysLeft !== null && (
                    <div className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                      <Clock className="h-4 w-4" />
                      <span>{daysLeft} day{daysLeft !== 1 ? "s" : ""} left in trial</span>
                    </div>
                  )}
                  {cancelAtEnd && daysLeft !== null && (
                    <div className="flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Cancels {formatDate(status?.stripeCurrentPeriodEnd ?? null)}</span>
                    </div>
                  )}
                </div>

                {/* Suite provider capacity indicator */}
                {isOnSuite && (
                  <div className="flex items-center gap-2 text-sm rounded-md bg-muted/40 px-3 py-2">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Provider capacity: <strong className="text-foreground">{status?.clinicMaxProviders ?? 2}</strong>
                      {" "}({status?.clinicBaseProviderLimit ?? 2} included + {status?.clinicExtraSeats ?? 0} add-on seat{status?.clinicExtraSeats !== 1 ? "s" : ""})
                    </span>
                  </div>
                )}

                <Separator />

                {/* Period info */}
                {hasSubscription && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Next billing date</p>
                      <p className="font-medium mt-0.5" data-testid="text-billing-period-end">
                        {cancelAtEnd
                          ? `Access until ${formatDate(status?.stripeCurrentPeriodEnd ?? null)}`
                          : formatDate(status?.stripeCurrentPeriodEnd ?? null)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Billing email</p>
                      <p className="font-medium mt-0.5 truncate">{user?.email}</p>
                    </div>
                  </div>
                )}

                {/* Status-specific messages */}
                {isPastDue && (
                  <div className="flex items-start gap-2 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3 text-sm text-orange-800 dark:text-orange-300">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Your last payment failed. Please update your payment method to restore full access.</span>
                  </div>
                )}

                {isCanceled && (
                  <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-300">
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Your subscription has been canceled. Subscribe again to restore access.</span>
                  </div>
                )}

                {isActive && !cancelAtEnd && (
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Subscription is active and renewing automatically.</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col gap-2 pt-1">
                  {/* Not yet subscribed — show card form */}
                  {!hasSubscription && (
                    <>
                      {!showCardForm ? (
                        <Button
                          onClick={() => setShowCardForm(true)}
                          className="w-full"
                          data-testid="button-add-payment"
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Add Payment Method &amp; Start Trial
                        </Button>
                      ) : stripePromise ? (
                        <Elements stripe={stripePromise}>
                          <CardSetupForm plan="solo" onSuccess={() => setShowCardForm(false)} />
                        </Elements>
                      ) : (
                        <div className="h-10 animate-pulse rounded-md bg-muted" />
                      )}
                    </>
                  )}

                  {/* Reactivate if scheduled to cancel */}
                  {hasSubscription && cancelAtEnd && !isCanceled && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => reactivateMutation.mutate()}
                      disabled={reactivateMutation.isPending}
                      data-testid="button-reactivate"
                    >
                      {reactivateMutation.isPending ? "Reactivating…" : "Keep Subscription"}
                    </Button>
                  )}

                  {/* Cancel if active/trial and not already canceling */}
                  {hasSubscription && (isActive || isTrial) && !cancelAtEnd && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full text-muted-foreground"
                          data-testid="button-cancel-subscription"
                        >
                          Cancel Subscription
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your access will continue until{" "}
                            <strong>{formatDate(status?.stripeCurrentPeriodEnd ?? null)}</strong>.
                            After that date, you will lose access to ClinIQ. You can reactivate at any time before then.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => cancelMutation.mutate()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Yes, Cancel
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── ClinIQ Suite upgrade / subscribe card ── */}
        {!isFreeAccount && !isOnSuite && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ArrowUpCircle className="h-4 w-4" style={{ color: "#5a7040" }} />
                  ClinIQ Suite
                </CardTitle>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                  Upgrade
                </span>
              </div>
              <CardDescription>Multi-provider clinic platform — everything in Solo plus team billing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">$249</span>
                <span className="text-muted-foreground text-sm">/ month</span>
                <span className="text-xs text-muted-foreground ml-1">· additional providers $79/mo each</span>
              </div>

              {/* Suite feature highlights */}
              <ul className="space-y-1.5">
                {[
                  "2 providers included (vs. 1 on Solo)",
                  "Add unlimited additional providers at $79/mo each",
                  "All Solo ClinIQ features included",
                  "Shared patient records across providers",
                ].map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "#5a7040" }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Separator />

              {/* Upgrade path */}
              {canOneClickUpgrade ? (
                /* User has an active Solo sub — swap the price, no new card needed */
                <div className="space-y-3">
                  <div className="rounded-md bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                    Your existing card on file will be used. A prorated adjustment will be applied to your next invoice.
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => upgradeMutation.mutate()}
                    disabled={upgradeMutation.isPending}
                    data-testid="button-upgrade-to-suite"
                  >
                    {upgradeMutation.isPending ? (
                      "Upgrading…"
                    ) : (
                      <>
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                        Upgrade to ClinIQ Suite — $249/month
                      </>
                    )}
                  </Button>
                </div>
              ) : !hasSubscription ? (
                /* No subscription yet — full card collect for Suite */
                <>
                  {!showSuiteCardForm ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowSuiteCardForm(true)}
                      data-testid="button-start-suite-setup"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Subscribe to Suite &amp; Start Free Trial
                    </Button>
                  ) : stripePromise ? (
                    <Elements stripe={stripePromise}>
                      <CardSetupForm plan="suite" onSuccess={() => setShowSuiteCardForm(false)} />
                    </Elements>
                  ) : (
                    <div className="h-10 animate-pulse rounded-md bg-muted" />
                  )}
                </>
              ) : (
                /* Subscription exists but is canceled — can't upgrade, must reactivate first */
                <p className="text-sm text-muted-foreground text-center py-2">
                  Reactivate your subscription above before upgrading to Suite.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── What's included ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">What's Included</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                "AI-powered lab interpretation for male & female hormones",
                "PREVENT cardiovascular risk assessment (2023 AHA)",
                "7-stage Clinical AI Pipeline with SOAP note generation",
                "Insulin resistance screening & phenotype detection",
                "Patient portal with wellness PDF reports",
                "Metagenics supplement recommendations",
                "HIPAA-compliant audit logging & session controls",
                "Unlimited patients & lab evaluations",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* HIPAA / security note */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Payment processing is handled by Stripe. ClinIQ never stores your card number.
            Your subscription renews monthly. Cancel anytime before your next billing date.
          </span>
        </div>
      </div>
    </div>
  );
}
