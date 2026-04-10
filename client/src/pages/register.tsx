import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { isMarketingDomain, appUrl } from "@/lib/app-url";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CheckCircle2, Shield, CreditCard, Lock, Zap } from "lucide-react";
import { PasswordStrengthIndicator } from "@/components/password-strength-indicator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  title: z.string().min(1, "Clinical title is required"),
  npi: z.string().min(10, "NPI must be 10 digits").max(10, "NPI must be 10 digits").regex(/^\d{10}$/, "NPI must be exactly 10 digits"),
  email: z.string().email("Valid email is required"),
  clinicName: z.string().min(1, "Clinic name is required"),
  phone: z.string().min(7, "Clinic phone number is required"),
  address: z.string().min(5, "Clinic address is required"),
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dots, hyphens, and underscores"),
  password: z.string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "At least one uppercase letter (A–Z)")
    .regex(/[a-z]/, "At least one lowercase letter (a–z)")
    .regex(/[0-9]/, "At least one number (0–9)")
    .regex(/[^A-Za-z0-9]/, "At least one special character (!@#$%^&*)"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

const TITLES = ["MD", "DO", "NP", "NP-C", "FNP-C", "APRN", "PA", "PA-C", "RN", "PharmD", "Other"];

const STEPS = [
  { label: "Choose Your Plan", description: "Select the plan that best fits your clinic" },
  { label: "Personal Info", description: "Your name and credentials will appear on patient reports" },
  { label: "Clinic Info", description: "Your clinic name will appear on all patient-facing reports" },
  { label: "Account Setup", description: "Choose a unique username and a strong password" },
  { label: "Agreement", description: "Review and accept our terms to complete your registration" },
  { label: "Payment", description: "Start your 14-day free trial — no charge today" },
];

const STEP_FIELDS: (keyof RegisterForm)[][] = [
  [],
  ["firstName", "lastName", "title", "npi"],
  ["clinicName", "email", "phone", "address"],
  ["username", "password", "confirmPassword"],
  [],
  [],
];

// ── Inline Stripe payment form (step 4) ─────────────────────────────────────
function PaymentForm({
  plan,
  onSuccess,
}: {
  plan: "solo" | "suite";
  onSuccess: () => void;
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
    const code = promoCode.trim().toUpperCase();
    if (code === "FOUNDER50") {
      setPromoApplied(true);
      toast({ title: "Promo code applied", description: "FOUNDER50 — your rate will be locked at $97/month." });
    } else if (code) {
      toast({ title: "Invalid code", description: "That promo code wasn't recognised.", variant: "destructive" });
    }
  }

  const monthlyRate = plan === "suite" ? "$249" : (promoApplied ? "$97" : "$149");

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
        const endpoint = plan === "suite" ? "/api/billing/subscribe-suite" : "/api/billing/subscribe";
        const body: Record<string, unknown> = { paymentMethodId: setupIntent.payment_method };
        if (plan === "solo" && promoApplied) body.promoCode = promoCode.trim().toUpperCase();
        await apiRequest("POST", endpoint, body);
        qc.invalidateQueries({ queryKey: ["/api/billing/status"] });
        qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
        const label = plan === "suite" ? "ClinIQ Suite" : "Solo ClinIQ";
        toast({ title: "Trial started!", description: `Your 14-day free trial of ${label} is active. You won't be charged until ${new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` });
        onSuccess();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Plan summary */}
      <div className="rounded-md p-4 space-y-2" style={{ backgroundColor: "#f4f8f0", border: "1px solid #c4d4a8" }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>
            {plan === "suite" ? "ClinIQ Suite" : "Solo ClinIQ"}
          </span>
          <span className="text-sm font-bold" style={{ color: "#2e3a20" }}>{monthlyRate}/mo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" style={{ color: "#5a7040" }} />
          <span className="text-xs" style={{ color: "#4a5a38" }}>
            14-day free trial — first charge on{" "}
            <strong>{new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>
          </span>
        </div>
        {plan === "solo" && (
          <p className="text-xs" style={{ color: "#7a8a64" }}>Use code <span className="font-mono font-semibold">FOUNDER50</span> to lock in $97/mo</p>
        )}
      </div>

      {/* Promo code — Solo only */}
      {plan === "solo" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Promo code (optional)</label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value); setPromoApplied(false); }}
              placeholder="e.g. FOUNDER50"
              className="flex-1 font-mono uppercase placeholder:normal-case placeholder:font-sans"
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
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Card details</label>
        <div className="rounded-md border p-3 bg-background focus-within:ring-2 focus-within:ring-ring">
          <CardElement
            onReady={() => setReady(true)}
            options={{
              style: {
                base: {
                  fontSize: "14px",
                  color: "hsl(var(--foreground))",
                  fontFamily: "Inter, sans-serif",
                  "::placeholder": { color: "hsl(var(--muted-foreground))" },
                },
              },
            }}
          />
        </div>
      </div>

      {/* Security note */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Lock className="w-3 h-3 flex-shrink-0" />
        Secured by Stripe. Your card will <strong>not</strong> be charged until after your 14-day trial ends.
      </p>

      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || !ready || submitting}
        data-testid="button-start-trial-payment"
        style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
      >
        {submitting
          ? "Starting trial…"
          : `Start 14-Day Free Trial`}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        Cancel anytime before {new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric" })} and you won't be charged.
      </p>
    </form>
  );
}

// ── Main Register page ───────────────────────────────────────────────────────
export default function Register() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Parse ?plan= from URL; default to "solo" — user can change on step 0
  const rawPlan = new URLSearchParams(search).get("plan");
  const [plan, setPlan] = useState<"solo" | "suite">(rawPlan === "suite" ? "suite" : "solo");

  const [step, setStep] = useState(0);
  const [registrationDone, setRegistrationDone] = useState(false);
  const [agreements, setAgreements] = useState({ terms: false, hipaa: false, clinical: false });
  const allAgreed = agreements.terms && agreements.hipaa && agreements.clinical;

  // Stripe setup — only needed on payment step
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const { data: billingConfig } = useQuery<{ publishableKey: string }>({
    queryKey: ["/api/billing/config"],
    enabled: registrationDone,
  });

  useEffect(() => {
    if (billingConfig?.publishableKey && !stripePromise) {
      setStripePromise(loadStripe(billingConfig.publishableKey));
    }
  }, [billingConfig, stripePromise]);

  // If someone manually navigates to /register on the marketing domain, send them to the app
  useEffect(() => {
    if (isMarketingDomain()) {
      window.location.href = appUrl(`/register?plan=${plan}`);
    }
  }, [plan]);

  // Redirect already-logged-in users to dashboard (but not while on payment step)
  useEffect(() => {
    if (!isLoading && user && !registrationDone) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, registrationDone, setLocation]);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "", lastName: "", title: "", npi: "",
      email: "", clinicName: "", phone: "", address: "",
      username: "", password: "", confirmPassword: "",
    },
    mode: "onChange",
  });

  // Local mutation — creates account and sets user in query cache WITHOUT redirecting
  const registerMutation = useMutation({
    mutationFn: async (data: Omit<RegisterForm, "confirmPassword">) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["/api/auth/me"], data);
      setRegistrationDone(true);
      setStep(5);
    },
    onError: (error: any) => {
      toast({ title: "Registration failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleNext = async () => {
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: RegisterForm) => {
    if (!allAgreed) return;
    const { confirmPassword, ...payload } = data;
    await registerMutation.mutateAsync(payload);
  };

  const planLabel = plan === "suite" ? "ClinIQ Suite — $249/mo" : "Solo ClinIQ — $149/mo";
  const planColor = plan === "suite" ? "#3d5228" : "#2e3a20";

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div
        className="hidden md:flex md:w-[38%] flex-col items-center justify-center p-12"
        style={{ backgroundColor: "#e8ddd0" }}
      >
        <div className="flex flex-col items-center text-center space-y-8 max-w-xs">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="w-60 h-auto"
            style={{ mixBlendMode: "multiply" }}
          />
          <div className="space-y-4 text-left w-full">
            {[
              "Isolated clinic workspace",
              "AI-powered lab interpretation",
              "Comprehensive patient profiles",
              "Evidence-based protocols",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#2e3a20" }} />
                <span className="text-sm" style={{ color: "#4a5e34" }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Plan badge on left panel */}
          <div className="w-full rounded-lg p-4 text-left" style={{ backgroundColor: planColor }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#a0b880" }}>You're signing up for</p>
            <p className="text-base font-bold" style={{ color: "#f9f6f0" }}>{planLabel}</p>
            <p className="text-xs mt-1" style={{ color: "#c4d4a8" }}>14-day free trial · No charge today</p>
            {plan === "solo" && (
              <p className="text-xs mt-0.5" style={{ color: "#a0b880" }}>Use <span className="font-mono font-semibold">FOUNDER50</span> for $97/mo</p>
            )}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Mobile logo */}
          <div className="md:hidden flex justify-center mb-6" style={{ backgroundColor: "#e8ddd0", borderRadius: "12px", padding: "10px 20px" }}>
            <img src="/realign-health-logo.png" alt="ReAlign Health" className="h-12 w-auto" style={{ mixBlendMode: "multiply" }} />
          </div>

          {/* Mobile plan badge */}
          <div className="md:hidden rounded-md px-3 py-2 mb-4 flex items-center gap-2" style={{ backgroundColor: planColor }}>
            <CreditCard className="w-3.5 h-3.5" style={{ color: "#a0b880" }} />
            <span className="text-xs font-semibold" style={{ color: "#f9f6f0" }}>{planLabel} · 14-day free trial</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>Create your account</h1>
            <p className="text-sm mt-1 text-muted-foreground">Set up your ReAlign Health provider workspace</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-6">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                    i < step
                      ? "text-white"
                      : i === step
                      ? "text-white ring-4"
                      : "bg-muted text-muted-foreground"
                  )}
                  style={i <= step ? { backgroundColor: planColor } : {}}
                  >
                    {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={cn(
                    "text-[10px] whitespace-nowrap hidden sm:block",
                    i === step ? "font-medium" : "text-muted-foreground"
                  )}
                  style={i === step ? { color: planColor } : {}}
                  >{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mx-1 mb-4" style={{ backgroundColor: i < step ? planColor : "#e5e7eb" }} />
                )}
              </div>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">{STEPS[step].label}</CardTitle>
              <CardDescription>{STEPS[step].description}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Steps 0–3: registration form */}
              {step < 5 && (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                    {/* Step 0 — Choose Your Plan */}
                    {step === 0 && (
                      <div className="space-y-3">
                        {[
                          {
                            id: "solo" as const,
                            name: "Solo ClinIQ",
                            price: "$149",
                            description: "Ideal for a single clinician or small practice",
                            features: ["Full AI lab interpretation", "Patient profiles & history", "SOAP note generation", "Encounter pipeline"],
                          },
                          {
                            id: "suite" as const,
                            name: "ClinIQ Suite",
                            price: "$249",
                            description: "Multi-provider clinics with advanced workflows",
                            features: ["Everything in Solo", "Multi-seat access", "Advanced reporting", "Priority support"],
                          },
                        ].map((p) => {
                          const selected = plan === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              data-testid={`card-plan-${p.id}`}
                              onClick={() => setPlan(p.id)}
                              className="w-full text-left rounded-lg border-2 p-4 transition-colors"
                              style={{
                                borderColor: selected ? planColor : "#d4c9b5",
                                backgroundColor: selected ? (plan === "suite" ? "#f0f4eb" : "#f0f4eb") : "#fdfcfb",
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-semibold text-sm" style={{ color: "#1c2414" }}>{p.name}</span>
                                    {selected && (
                                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: planColor, color: "#f9f6f0" }}>Selected</span>
                                    )}
                                  </div>
                                  <p className="text-xs mb-2" style={{ color: "#6b7a5a" }}>{p.description}</p>
                                  <ul className="space-y-1">
                                    {p.features.map((f) => (
                                      <li key={f} className="flex items-center gap-1.5 text-xs" style={{ color: "#4a5e34" }}>
                                        <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: "#2e3a20" }} />
                                        {f}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <span className="text-lg font-bold" style={{ color: "#1c2414" }}>{p.price}</span>
                                  <span className="text-xs" style={{ color: "#6b7a5a" }}>/mo</span>
                                  <p className="text-xs mt-0.5" style={{ color: "#a0b880" }}>after trial</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        <p className="text-xs text-center" style={{ color: "#6b7a5a" }}>14-day free trial — no credit card required until the end of your trial</p>
                      </div>
                    )}

                    {/* Step 1 — Personal Info */}
                    {step === 1 && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField control={form.control} name="firstName" render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input data-testid="input-firstName" placeholder="Jane" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="lastName" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input data-testid="input-lastName" placeholder="Smith" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                        <FormField control={form.control} name="title" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clinical Title <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-title"><SelectValue placeholder="Select your title" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="npi" render={({ field }) => (
                          <FormItem>
                            <FormLabel>NPI Number <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-npi" placeholder="1234567890" maxLength={10} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </>
                    )}

                    {/* Step 2 — Clinic Info */}
                    {step === 2 && (
                      <>
                        <FormField control={form.control} name="clinicName" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clinic Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-clinicName" placeholder="Optimal Health Clinic" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="email" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-email" type="email" placeholder="jane.smith@clinic.com" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clinic Phone <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-phone" placeholder="(555) 555-0100" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="address" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clinic Address <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-address" placeholder="123 Medical Dr, Nashville, TN 37201" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </>
                    )}

                    {/* Step 3 — Account Setup */}
                    {step === 3 && (
                      <>
                        <FormField control={form.control} name="username" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-username" placeholder="jane.smith" autoComplete="username" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="password" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-password" type="password" placeholder="At least 8 characters" autoComplete="new-password" {...field} /></FormControl>
                            <PasswordStrengthIndicator password={field.value || ""} />
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input data-testid="input-confirmPassword" type="password" placeholder="Re-enter your password" autoComplete="new-password" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </>
                    )}

                    {/* Step 4 — Agreement */}
                    {step === 4 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Shield className="w-4 h-4 flex-shrink-0" style={{ color: "#2e3a20" }} />
                          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#2e3a20" }}>
                            Terms &amp; Compliance
                          </span>
                        </div>

                        <div
                          className="rounded-md border text-xs leading-relaxed overflow-y-auto space-y-4 p-4"
                          style={{ maxHeight: "200px", borderColor: "#d4c9b5", backgroundColor: "#fdfcfb", color: "#3d4a30" }}
                        >
                          <div>
                            <p className="font-semibold mb-1" style={{ color: "#1c2414" }}>Terms of Service</p>
                            <p>
                              ReAlign Health is a clinical decision support tool intended solely for use by licensed healthcare professionals in authorized clinical settings. By creating an account, you agree to use the platform only for lawful clinical purposes, to maintain the confidentiality of your login credentials, and to comply with all applicable federal and state laws governing the practice of medicine and the handling of patient information. You agree not to share your account with unauthorized individuals or use the platform in any manner that could harm patients or violate professional standards of care. ReAlign Health reserves the right to suspend or terminate accounts found in violation of these terms.
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold mb-1" style={{ color: "#1c2414" }}>HIPAA &amp; Patient Data Compliance</p>
                            <p>
                              As a covered entity or business associate under the Health Insurance Portability and Accountability Act (HIPAA), you are solely responsible for ensuring that any protected health information (PHI) you enter into ReAlign Health is handled in full compliance with HIPAA Privacy and Security Rules. You acknowledge that you are authorized to access and input the patient data you submit, that you will implement appropriate administrative, physical, and technical safeguards to protect PHI, and that you will not enter PHI for patients who have not consented to its use for clinical interpretation purposes. You agree to promptly notify ReAlign Health of any suspected security breach or unauthorized disclosure involving patient data.
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold mb-1" style={{ color: "#1c2414" }}>Clinical Decision Support Disclaimer</p>
                            <p>
                              ReAlign Health provides clinical decision support only. All interpretations, recommendations, risk scores, supplement suggestions, and AI-generated content are intended to assist — not replace — the independent clinical judgment of a licensed healthcare provider. You, as the treating clinician, remain solely and entirely responsible for all diagnostic, treatment, and care decisions made for your patients. ReAlign Health does not practice medicine, does not establish a provider-patient relationship, and is not liable for any clinical outcomes resulting from the use of or reliance on information generated by the platform. No output from ReAlign Health should be acted upon without independent clinical verification.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3 pt-1">
                          {[
                            { key: "terms" as const, label: "I have read and agree to the Terms of Service." },
                            { key: "hipaa" as const, label: "I acknowledge my HIPAA compliance responsibilities and will handle all patient data accordingly." },
                            { key: "clinical" as const, label: "I understand that ReAlign Health provides decision support only and that I remain solely responsible for all clinical decisions." },
                          ].map(({ key, label }) => (
                            <label key={key} className="flex items-start gap-3 cursor-pointer group" data-testid={`checkbox-agree-${key}`}>
                              <div className="relative mt-0.5 flex-shrink-0">
                                <input
                                  type="checkbox"
                                  checked={agreements[key]}
                                  onChange={(e) => setAgreements((prev) => ({ ...prev, [key]: e.target.checked }))}
                                  className="sr-only"
                                />
                                <div
                                  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                                  style={{ borderColor: agreements[key] ? "#2e3a20" : "#d4c9b5", backgroundColor: agreements[key] ? "#2e3a20" : "white" }}
                                >
                                  {agreements[key] && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>{label}</span>
                            </label>
                          ))}
                        </div>

                        {!allAgreed && (
                          <p className="text-xs text-muted-foreground">Please check all three boxes above to continue.</p>
                        )}
                      </div>
                    )}

                    {/* Navigation */}
                    <div className="flex gap-3 pt-2">
                      {step > 0 && (
                        <Button type="button" variant="outline" onClick={handleBack} className="flex-1" data-testid="button-back">
                          <ChevronLeft className="w-4 h-4 mr-1" />Back
                        </Button>
                      )}
                      {step < 4 ? (
                        <Button type="button" onClick={handleNext} className="flex-1" data-testid="button-next">
                          Continue<ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          className="flex-1"
                          disabled={registerMutation.isPending || !allAgreed}
                          data-testid="button-register"
                          style={{ backgroundColor: planColor, color: "#f9f6f0" }}
                        >
                          {registerMutation.isPending ? "Creating account…" : "Continue to Payment"}
                          {!registerMutation.isPending && <ChevronRight className="w-4 h-4 ml-1" />}
                        </Button>
                      )}
                    </div>
                  </form>
                </Form>
              )}

              {/* Step 5 — Payment */}
              {step === 5 && (
                <>
                  {stripePromise ? (
                    <Elements stripe={stripePromise}>
                      <PaymentForm plan={plan} onSuccess={() => setLocation("/dashboard")} />
                    </Elements>
                  ) : (
                    <div className="py-8 text-center space-y-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground">Loading payment form…</p>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t text-center">
                    <p className="text-xs text-muted-foreground">
                      Want to skip for now?{" "}
                      <button
                        className="font-medium hover:underline"
                        style={{ color: "#2e3a20" }}
                        onClick={() => setLocation("/dashboard")}
                        data-testid="link-skip-payment"
                      >
                        Go to dashboard
                      </button>
                      {" "}and set up billing later in Account Settings.
                    </p>
                  </div>
                </>
              )}

              {step < 5 && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button data-testid="link-login" onClick={() => setLocation("/login")} className="font-medium hover:underline" style={{ color: "#2e3a20" }}>
                      Sign in
                    </button>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
