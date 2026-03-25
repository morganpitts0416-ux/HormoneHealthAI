import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
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

const TITLES = [
  "MD",
  "DO",
  "NP",
  "NP-C",
  "FNP-C",
  "APRN",
  "PA",
  "PA-C",
  "RN",
  "PharmD",
  "Other",
];

const STEPS = [
  { label: "Personal Info", fields: ["firstName", "lastName", "title", "npi"] },
  { label: "Clinic Info", fields: ["clinicName", "email", "phone", "address"] },
  { label: "Account Setup", fields: ["username", "password", "confirmPassword"] },
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
    const fields = STEPS[stepIndex].fields as (keyof RegisterForm)[];
    const result = await form.trigger(fields);
    return result;
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
              <Activity className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create Your Clinic Account</h1>
          <p className="text-slate-500 text-sm mt-1">Set up your ClinIQ provider account</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                i < step ? "bg-blue-600 text-white" :
                i === step ? "bg-blue-600 text-white ring-4 ring-blue-100" :
                "bg-slate-200 text-slate-500"
              )}>
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-8 h-0.5", i < step ? "bg-blue-600" : "bg-slate-200")} />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-sm font-medium text-slate-600 mb-6">{STEPS[step].label}</p>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-slate-800">
              {step === 0 && "Tell us about yourself"}
              {step === 1 && "Your clinic information"}
              {step === 2 && "Create your login credentials"}
            </CardTitle>
            <CardDescription>
              {step === 0 && "Your name and credentials will appear on patient reports"}
              {step === 1 && "Your clinic name will appear on all patient-facing reports"}
              {step === 2 && "Choose a unique username and a strong password"}
            </CardDescription>
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
                            <FormLabel>First Name <span className="text-red-500">*</span></FormLabel>
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
                            <FormLabel>Last Name <span className="text-red-500">*</span></FormLabel>
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
                          <FormLabel>Clinical Title <span className="text-red-500">*</span></FormLabel>
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
                          <FormLabel>NPI Number <span className="text-slate-400 font-normal">(optional)</span></FormLabel>
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
                          <FormLabel>Clinic Name <span className="text-red-500">*</span></FormLabel>
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
                          <FormLabel>Email Address <span className="text-red-500">*</span></FormLabel>
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
                          <FormLabel>Phone <span className="text-slate-400 font-normal">(optional)</span></FormLabel>
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
                          <FormLabel>Clinic Address <span className="text-slate-400 font-normal">(optional)</span></FormLabel>
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
                          <FormLabel>Username <span className="text-red-500">*</span></FormLabel>
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
                          <FormLabel>Password <span className="text-red-500">*</span></FormLabel>
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
                          <FormLabel>Confirm Password <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input data-testid="input-confirmPassword" type="password" placeholder="Re-enter your password" autoComplete="new-password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Navigation buttons */}
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
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      data-testid="button-next"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
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
              <p className="text-sm text-slate-500">
                Already have an account?{" "}
                <button
                  data-testid="link-login"
                  onClick={() => setLocation("/login")}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Sign in
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
