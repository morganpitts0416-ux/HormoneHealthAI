import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  title: z.string().min(1, "Clinical title is required"),
  npi: z.string().optional(),
  email: z.string().email("Valid email is required"),
  clinicName: z.string().min(1, "Clinic name is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dots, hyphens, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

const TITLES = ["MD", "DO", "NP", "NP-C", "FNP-C", "APRN", "PA", "PA-C", "RN", "PharmD", "Other"];

const STEPS = [
  { label: "Personal Info", description: "Your name and credentials will appear on patient reports" },
  { label: "Clinic Info", description: "Your clinic name will appear on all patient-facing reports" },
  { label: "Account Setup", description: "Choose a unique username and a strong password" },
];

export default function Register() {
  const { user, isLoading, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

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

  const validateStep = async (stepIndex: number) => {
    const fields = STEPS[stepIndex]
      ? (stepIndex === 0
          ? ["firstName", "lastName", "title", "npi"]
          : stepIndex === 1
          ? ["clinicName", "email", "phone", "address"]
          : ["username", "password", "confirmPassword"]) as (keyof RegisterForm)[]
      : [];
    return await form.trigger(fields);
  };

  const handleNext = async () => {
    const valid = await validateStep(step);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: RegisterForm) => {
    try {
      const { confirmPassword, ...payload } = data;
      await registerMutation.mutateAsync({
        ...payload,
        npi: payload.npi || undefined,
        phone: payload.phone || undefined,
        address: payload.address || undefined,
      });
    } catch (error: any) {
      const message = error?.message || "Registration failed. Please try again.";
      toast({ title: "Registration failed", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden md:flex md:w-[38%] flex-col items-center justify-center bg-[#2e3a20] p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 80%, #c8b89a 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8a9e6a 0%, transparent 50%)"
          }}
        />
        <div className="relative z-10 flex flex-col items-center text-center space-y-8 max-w-xs">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="w-56 h-auto"
            style={{ mixBlendMode: "screen" }}
          />
          <div className="space-y-4 text-left w-full">
            {["Isolated clinic workspace", "AI-powered lab interpretation", "Comprehensive patient profiles", "Evidence-based protocols"].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#c8b89a] flex-shrink-0" />
                <span className="text-[#a8b898] text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Mobile logo */}
          <div className="md:hidden flex justify-center mb-8">
            <div className="bg-[#2e3a20] rounded-lg px-6 py-3">
              <img
                src="/realign-health-logo.png"
                alt="ReAlign Health"
                className="h-10 w-auto"
                style={{ mixBlendMode: "screen" }}
              />
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
            <p className="text-muted-foreground text-sm mt-1">Set up your ReAlign Health provider workspace</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-0 mb-6">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                    i < step ? "bg-primary text-primary-foreground" :
                    i === step ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={cn(
                    "text-xs whitespace-nowrap",
                    i === step ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    "flex-1 h-px mx-2 mb-4",
                    i < step ? "bg-primary" : "bg-border"
                  )} />
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
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Step 0: Personal Info */}
                  {step === 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                              <FormControl>
                                <Input data-testid="input-firstName" placeholder="Jane" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                              <FormControl>
                                <Input data-testid="input-lastName" placeholder="Smith" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clinical Title <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-title">
                                  <SelectValue placeholder="Select your title" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TITLES.map((t) => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="npi"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>NPI Number <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-npi" placeholder="1234567890" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {/* Step 1: Clinic Info */}
                  {step === 1 && (
                    <>
                      <FormField
                        control={form.control}
                        name="clinicName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clinic Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-clinicName" placeholder="Optimal Health Clinic" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-email" type="email" placeholder="jane.smith@clinic.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-phone" placeholder="(555) 555-0100" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clinic Address <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-address" placeholder="123 Medical Dr, Nashville, TN 37201" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {/* Step 2: Account Setup */}
                  {step === 2 && (
                    <>
                      <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-username" placeholder="jane.smith" autoComplete="username" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-password" type="password" placeholder="At least 8 characters" autoComplete="new-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input data-testid="input-confirmPassword" type="password" placeholder="Re-enter your password" autoComplete="new-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-3 pt-2">
                    {step > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleBack}
                        className="flex-1"
                        data-testid="button-back"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Back
                      </Button>
                    )}
                    {step < STEPS.length - 1 ? (
                      <Button
                        type="button"
                        onClick={handleNext}
                        className="flex-1"
                        data-testid="button-next"
                      >
                        Continue
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={registerMutation.isPending}
                        data-testid="button-register"
                      >
                        {registerMutation.isPending ? "Creating account..." : "Create Account"}
                      </Button>
                    )}
                  </div>
                </form>
              </Form>

              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    data-testid="link-login"
                    onClick={() => setLocation("/login")}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
