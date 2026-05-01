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
import { ChevronLeft, ChevronRight, CheckCircle2, CreditCard, Lock, Zap, AlertCircle } from "lucide-react";
import { PasswordStrengthIndicator } from "@/components/password-strength-indicator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  title: z.string().min(1, "Clinical title is required"),
  npi: z.string().min(10, "NPI must be 10 digits").max(10, "NPI must be 10 digits").regex(/^\d{10}$/, "NPI must be exactly 10 digits"),
  clinicName: z.string().min(1, "Clinic name is required"),
  phone: z.string().min(7, "Clinic phone number is required"),
  address: z.string().min(5, "Clinic address is required"),
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dots, hyphens, and underscores"),
  password: z.string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "At least one uppercase letter (A-Z)")
    .regex(/[a-z]/, "At least one lowercase letter (a-z)")
    .regex(/[0-9]/, "At least one number (0-9)")
    .regex(/[^A-Za-z0-9]/, "At least one special character (!@#$%^&*)"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

const TITLES = ["MD", "DO", "NP", "NP-C", "FNP-C", "APRN", "PA", "PA-C", "RN", "PharmD", "Other"];

const STEPS = [
  { label: "Plan", description: "Select the plan that best fits your clinic" },
  { label: "Personal & Payment", description: "Your information and payment method" },
  { label: "Clinic Details", description: "Your clinical credentials and clinic information" },
  { label: "Account Setup", description: "Create your login credentials" },
];

const STEP_FIELDS: (keyof RegisterForm)[][] = [
  [],
  ["firstName", "lastName", "email"],
  ["title", "npi", "clinicName", "phone", "address"],
  ["username", "password", "confirmPassword"],
];

function PersonalPaymentStep({
  plan,
  form,
  onSuccess,
  onBack,
}: {
  plan: "solo" | "suite";
  form: any;
  onSuccess: (pmId: string, promo: string | null, billingPhone: string, billingAddress: string) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [billingConsent, setBillingConsent] = useState(false);
  const [billingPhone, setBillingPhone] = useState("");
  const [billingAddress, setBillingAddress] = useState("");

  function handlePromoCheck() {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoApplied(true);
    if (code === "FOUNDER50") {
      toast({ title: "Promo code entered", description: "FOUNDER50 — your rate will be locked at $97/month." });
    } else {
      toast({ title: "Promo code entered", description: "Your code will be validated and applied at checkout." });
    }
  }

  const monthlyRate = plan === "suite" ? "$249" : (promoApplied ? "$97" : "$149");
  const trialEndDate = new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = await form.trigger(["firstName", "lastName", "email"]);
    if (!valid) return;
    if (!billingPhone.trim() || billingPhone.trim().length < 7) {
      toast({ title: "Phone required", description: "Please enter a valid phone number.", variant: "destructive" });
      return;
    }
    if (!billingAddress.trim() || billingAddress.trim().length < 5) {
      toast({ title: "Address required", description: "Please enter your billing address.", variant: "destructive" });
      return;
    }
    if (!stripe || !elements || !billingConsent) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/guest-setup-intent", { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error("Failed to initialize payment setup");
      const { clientSecret } = await res.json();

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const formValues = form.getValues();
      const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: `${formValues.firstName} ${formValues.lastName}`,
            email: formValues.email,
            phone: billingPhone,
            address: { line1: billingAddress },
          },
        },
      });

      if (error) {
        toast({ title: "Card error", description: error.message, variant: "destructive" });
        return;
      }

      if (setupIntent?.payment_method) {
        const appliedPromo = promoApplied && promoCode.trim() ? promoCode.trim().toUpperCase() : null;
        onSuccess(setupIntent.payment_method as string, appliedPromo, billingPhone.trim(), billingAddress.trim());
      }
    } catch (err: any) {
      toast({ title: "Payment setup failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      <FormField control={form.control} name="email" render={({ field }) => (
        <FormItem>
          <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
          <FormControl><Input data-testid="input-email" type="email" placeholder="jane.smith@clinic.com" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Phone Number <span className="text-destructive">*</span></label>
          <Input
            data-testid="input-billingPhone"
            placeholder="(555) 555-0100"
            value={billingPhone}
            onChange={(e) => setBillingPhone(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium">Billing Address <span className="text-destructive">*</span></label>
          <Input
            data-testid="input-billingAddress"
            placeholder="123 Main St, Nashville, TN 37201"
            value={billingAddress}
            onChange={(e) => setBillingAddress(e.target.value)}
          />
        </div>
      </div>

      <div className="pt-2 border-t" style={{ borderColor: "#e5e2dc" }}>
        <div className="rounded-md p-3 space-y-2 mb-3" style={{ backgroundColor: "#f4f8f0", border: "1px solid #c4d4a8" }}>
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>
              {plan === "suite" ? "ClinIQ Suite" : "Solo ClinIQ"}
            </span>
            <span className="text-sm font-bold" style={{ color: "#2e3a20" }}>{monthlyRate}/mo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
            <span className="text-xs" style={{ color: "#4a5a38" }}>
              14-day free trial — first charge on <strong>{trialEndDate}</strong>
            </span>
          </div>
          {plan === "solo" && (
            <p className="text-xs" style={{ color: "#7a8a64" }}>Use code <span className="font-mono font-semibold">FOUNDER50</span> to lock in $97/mo</p>
          )}
        </div>

        <div className="space-y-1.5 mb-3">
          <label className="text-xs font-medium text-muted-foreground">Promo code (optional)</label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value); setPromoApplied(false); }}
              placeholder="Enter promo code"
              className="flex-1 font-mono uppercase placeholder:normal-case placeholder:font-sans"
              data-testid="input-promo-code"
            />
            <Button type="button" variant="outline" onClick={handlePromoCheck} data-testid="button-apply-promo">
              Apply
            </Button>
          </div>
          {promoApplied && (
            <p className="text-xs font-semibold" style={{ color: "#5a7040" }}>
              {promoCode.trim().toUpperCase() === "FOUNDER50"
                ? "FOUNDER50 applied — locked at $97/month"
                : `${promoCode.trim().toUpperCase()} entered — discount will be applied at checkout`}
            </p>
          )}
        </div>

        <div className="mb-3">
          <label className="text-sm font-medium block mb-1.5">Card Details <span className="text-destructive">*</span></label>
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

        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3">
          <Lock className="w-3 h-3 flex-shrink-0" />
          Secured by Stripe. Card details are encrypted end-to-end.
        </p>

        <div className="rounded-md p-3 space-y-2 mb-3" style={{ backgroundColor: "#fdfcfb", border: "1px solid #d4c9b5" }}>
          <p className="text-xs font-semibold" style={{ color: "#1c2414" }}>Billing Disclosure</p>
          <ul className="text-xs space-y-1.5" style={{ color: "#3d4a30" }}>
            <li>You are starting a <strong>14-day free trial</strong>. No charge is made today.</li>
            <li>Your payment method will be stored securely by Stripe.</li>
            <li>Your subscription will <strong>automatically convert</strong> to a paid monthly subscription of <strong>{monthlyRate}/month</strong> at the end of the 14-day trial unless cancelled.</li>
            <li>Your first charge of <strong>{monthlyRate}</strong> will occur on <strong>{trialEndDate}</strong>.</li>
            <li>To avoid being charged, cancel before <strong>{trialEndDate}</strong> in your Account Settings.</li>
          </ul>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-4" data-testid="checkbox-billing-consent">
          <div className="relative mt-0.5 flex-shrink-0">
            <input
              type="checkbox"
              checked={billingConsent}
              onChange={(e) => setBillingConsent(e.target.checked)}
              className="sr-only"
            />
            <div
              className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
              style={{ borderColor: billingConsent ? "#2e3a20" : "#d4c9b5", backgroundColor: billingConsent ? "#2e3a20" : "white" }}
            >
              {billingConsent && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>
            I understand that my 14-day free trial will automatically convert to a paid monthly subscription of {monthlyRate}/month unless I cancel before the trial ends.
          </span>
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" data-testid="button-back">
          <ChevronLeft className="w-4 h-4 mr-1" />Back
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!stripe || !ready || submitting || !billingConsent}
          data-testid="button-confirm-payment"
          style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
        >
          {submitting ? "Processing..." : "Confirm & Continue"}
        </Button>
      </div>
    </form>
  );
}

export default function Register() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();

  const rawPlan = new URLSearchParams(search).get("plan");
  const [plan, setPlan] = useState<"solo" | "suite">(rawPlan === "suite" ? "suite" : "solo");

  const [step, setStep] = useState(0);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [billingPhone, setBillingPhone] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [sameAsBA, setSameAsBA] = useState(true);

  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const { data: billingConfig, isError: billingConfigError } = useQuery<{ publishableKey: string; configured: boolean }>({
    queryKey: ["/api/billing/config"],
    retry: 3,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (billingConfig?.publishableKey && billingConfig.configured && !stripePromise) {
      setStripePromise(loadStripe(billingConfig.publishableKey));
    }
  }, [billingConfig?.publishableKey, billingConfig?.configured]);

  useEffect(() => {
    if (isMarketingDomain()) {
      window.location.href = appUrl(`/register?plan=${plan}`);
    } else {
      window.history.replaceState(null, "", `/register?plan=${plan}`);
    }
  }, [plan]);

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "", lastName: "", title: "", npi: "",
      email: "", clinicName: "", phone: "", address: "",
      username: "", password: "", confirmPassword: "",
    },
    mode: "onChange",
  });

  const registerMutation = useMutation({
    mutationFn: async (data: Omit<RegisterForm, "confirmPassword"> & { paymentMethodId: string; plan: string; promoCode?: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const e: any = new Error(err.message || "Registration failed");
        e.billingError = err.billingError || null;
        throw e;
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["/api/auth/me"], data);
      const label = plan === "suite" ? "ClinIQ Suite" : "Solo ClinIQ";
      toast({ title: "Account created!", description: `Your ${label} trial is active. Please review the agreements to continue.` });
      setLocation("/dashboard");
    },
    onError: (error: any) => {
      const billingErr: string = error?.billingError ?? "";
      const isPmReused = billingErr.toLowerCase().includes("previously used") || billingErr.toLowerCase().includes("detached");
      if (isPmReused) {
        setPaymentMethodId(null);
        setStep(1);
        toast({
          title: "New payment method required",
          description: "Your saved card could not be reused. Please enter a new payment method to complete registration.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Registration failed", description: error?.message || "Please try again.", variant: "destructive" });
      }
    },
  });

  const handlePaymentSuccess = (pmId: string, appliedPromo: string | null, phone: string, addr: string) => {
    setPaymentMethodId(pmId);
    setPromoCode(appliedPromo);
    setBillingPhone(phone);
    setBillingAddress(addr);
    form.setValue("phone", phone);
    form.setValue("address", addr);
    toast({ title: "Card verified", description: "Your payment method has been confirmed." });
    setStep(2);
  };

  const handleNext = async () => {
    if (step === 1) return;
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (!valid) return;
    if (step === 3) {
      if (!paymentMethodId) {
        toast({ title: "Payment required", description: "Please complete payment setup first.", variant: "destructive" });
        setStep(1);
        return;
      }
      const data = form.getValues();
      const { confirmPassword, ...payload } = data;
      registerMutation.mutate({
        ...payload,
        paymentMethodId,
        plan,
        ...(promoCode ? { promoCode } : {}),
      });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    if (step === 2 && !paymentMethodId) {
      setStep(1);
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  };

  const planLabel = plan === "suite" ? "ClinIQ Suite — $249/mo" : "Solo ClinIQ — $149/mo";
  const planColor = plan === "suite" ? "#3d5228" : "#2e3a20";
  const trialEndDate = new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="min-h-screen flex">
      <div
        className="hidden md:flex md:w-[38%] flex-col items-center justify-center p-12"
        style={{ backgroundColor: "#e8ddd0" }}
      >
        <div className="flex flex-col items-center text-center space-y-8 max-w-xs">
          <img
            src="/cliniq-logo.png"
            alt="ClinIQ"
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

          <div className="w-full rounded-lg p-4 text-left" style={{ backgroundColor: planColor }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#a0b880" }}>You're signing up for</p>
            <p className="text-base font-bold" style={{ color: "#f9f6f0" }}>{planLabel}</p>
            <p className="text-xs mt-1" style={{ color: "#c4d4a8" }}>14-day free trial · Card required today</p>
            {plan === "solo" && (
              <p className="text-xs mt-0.5" style={{ color: "#a0b880" }}>Use <span className="font-mono font-semibold">FOUNDER50</span> for $97/mo</p>
            )}
          </div>

          {paymentMethodId && (
            <div className="w-full rounded-md p-3 flex items-center gap-2" style={{ backgroundColor: "#e0ebd0", border: "1px solid #b8cca0" }}>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-medium" style={{ color: "#2e3a20" }}>Payment method verified</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-md py-8">
          <div className="md:hidden flex justify-center mb-6" style={{ backgroundColor: "#e8ddd0", borderRadius: "12px", padding: "10px 20px" }}>
            <img src="/cliniq-logo.png" alt="ClinIQ" className="h-12 w-auto" style={{ mixBlendMode: "multiply" }} />
          </div>

          <div className="md:hidden rounded-md px-3 py-2 mb-4 flex items-center gap-2" style={{ backgroundColor: planColor }}>
            <CreditCard className="w-3.5 h-3.5" style={{ color: "#a0b880" }} />
            <span className="text-xs font-semibold" style={{ color: "#f9f6f0" }}>{planLabel} · 14-day free trial</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>Create your account</h1>
            <p className="text-sm mt-1 text-muted-foreground">Set up your ClinIQ provider workspace</p>
          </div>

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
              {step === 0 && (
                <Form {...form}>
                  <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
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
                              backgroundColor: selected ? "#f0f4eb" : "#fdfcfb",
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
                      <p className="text-xs text-center" style={{ color: "#6b7a5a" }}>14-day free trial · Card required to start</p>
                    </div>

                    <Button
                      type="button"
                      onClick={handleNext}
                      className="w-full"
                      data-testid="button-next"
                      style={{ backgroundColor: planColor, color: "#f9f6f0" }}
                    >
                      Continue<ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </form>
                </Form>
              )}

              {step === 1 && (
                <>
                  {stripePromise ? (
                    <Elements stripe={stripePromise}>
                      <Form {...form}>
                        <PersonalPaymentStep
                          plan={plan}
                          form={form}
                          onSuccess={handlePaymentSuccess}
                          onBack={() => setStep(0)}
                        />
                      </Form>
                    </Elements>
                  ) : billingConfigError || (billingConfig && !billingConfig.configured) ? (
                    <div className="py-8 text-center space-y-3">
                      <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
                      <p className="text-sm font-medium text-destructive">Payment system not configured.</p>
                      <p className="text-xs text-muted-foreground">Please contact support. Payment setup is required to create an account.</p>
                      <Button type="button" variant="outline" onClick={() => setStep(0)} className="mt-2" data-testid="button-back">
                        <ChevronLeft className="w-4 h-4 mr-1" />Back
                      </Button>
                    </div>
                  ) : (
                    <div className="py-8 text-center space-y-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground">Loading payment form...</p>
                    </div>
                  )}
                </>
              )}

              {step === 2 && !paymentMethodId && (
                <div className="py-8 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
                  <p className="text-sm font-medium text-destructive">Payment setup is required before continuing.</p>
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="mt-2" data-testid="button-return-payment">
                    <ChevronLeft className="w-4 h-4 mr-1" />Return to Payment
                  </Button>
                </div>
              )}

              {step === 2 && paymentMethodId && (
                <Form {...form}>
                  <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                    <div className="rounded-md p-3 flex items-center gap-2" style={{ backgroundColor: "#e0ebd0", border: "1px solid #b8cca0" }}>
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#2e3a20" }} />
                      <span className="text-xs font-medium" style={{ color: "#2e3a20" }}>Payment method verified — card on file</span>
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
                    <FormField control={form.control} name="clinicName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinic Name <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input data-testid="input-clinicName" placeholder="Optimal Health Clinic" {...field} /></FormControl>
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

                    <label className="flex items-center gap-2 cursor-pointer" data-testid="checkbox-same-address">
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={sameAsBA}
                          onChange={(e) => {
                            setSameAsBA(e.target.checked);
                            if (e.target.checked) {
                              form.setValue("address", billingAddress);
                            } else {
                              form.setValue("address", "");
                            }
                          }}
                          className="sr-only"
                        />
                        <div
                          className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                          style={{ borderColor: sameAsBA ? "#2e3a20" : "#d4c9b5", backgroundColor: sameAsBA ? "#2e3a20" : "white" }}
                        >
                          {sameAsBA && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className="text-xs" style={{ color: "#3d4a30" }}>Clinic address is the same as billing address</span>
                    </label>

                    {!sameAsBA && (
                      <FormField control={form.control} name="address" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clinic Address <span className="text-destructive">*</span></FormLabel>
                          <FormControl><Input data-testid="input-address" placeholder="456 Medical Dr, Nashville, TN 37201" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button type="button" variant="outline" onClick={handleBack} className="flex-1" data-testid="button-back">
                        <ChevronLeft className="w-4 h-4 mr-1" />Back
                      </Button>
                      <Button
                        type="button"
                        onClick={handleNext}
                        className="flex-1"
                        data-testid="button-next"
                        style={{ backgroundColor: planColor, color: "#f9f6f0" }}
                      >
                        Continue<ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </form>
                </Form>
              )}

              {step === 3 && !paymentMethodId && (
                <div className="py-8 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
                  <p className="text-sm font-medium text-destructive">Payment setup is required before creating your account.</p>
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="mt-2" data-testid="button-return-payment">
                    <ChevronLeft className="w-4 h-4 mr-1" />Return to Payment
                  </Button>
                </div>
              )}

              {step === 3 && paymentMethodId && (
                <Form {...form}>
                  <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                    <div className="rounded-md p-3 flex items-center gap-2" style={{ backgroundColor: "#e0ebd0", border: "1px solid #b8cca0" }}>
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#2e3a20" }} />
                      <span className="text-xs font-medium" style={{ color: "#2e3a20" }}>Payment method verified — card on file</span>
                    </div>

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

                    <div className="flex gap-3 pt-2">
                      <Button type="button" variant="outline" onClick={handleBack} className="flex-1" data-testid="button-back">
                        <ChevronLeft className="w-4 h-4 mr-1" />Back
                      </Button>
                      <Button
                        type="button"
                        onClick={handleNext}
                        className="flex-1"
                        disabled={registerMutation.isPending}
                        data-testid="button-create-account"
                        style={{ backgroundColor: planColor, color: "#f9f6f0" }}
                      >
                        {registerMutation.isPending ? "Creating account..." : "Create Account"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}

              {step < 2 && (
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
