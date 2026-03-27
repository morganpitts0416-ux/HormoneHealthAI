import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Lock, User, Mail, Stethoscope, Leaf } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const clinicianSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const patientSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type ClinicianForm = z.infer<typeof clinicianSchema>;
type PatientForm = z.infer<typeof patientSchema>;

export default function Login() {
  const { user, isLoading, loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const initialMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "patient" ? "patient" : "clinician";
  const [mode, setMode] = useState<"clinician" | "patient">(initialMode);

  useEffect(() => {
    if (!isLoading && user) setLocation("/dashboard");
  }, [user, isLoading, setLocation]);

  const clinicianForm = useForm<ClinicianForm>({
    resolver: zodResolver(clinicianSchema),
    defaultValues: { username: "", password: "" },
  });

  const patientForm = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: { email: "", password: "" },
  });

  const patientLoginMutation = useMutation({
    mutationFn: (data: PatientForm) =>
      apiRequest("POST", "/api/portal/login", data),
    onSuccess: () => setLocation("/portal/dashboard"),
    onError: (error: any) => {
      toast({
        title: "Unable to sign in",
        description: error?.message || "Please check your email and password.",
        variant: "destructive",
      });
    },
  });

  const onClinicianSubmit = async (data: ClinicianForm) => {
    try {
      await loginMutation.mutateAsync(data);
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error?.message || "Invalid username or password",
        variant: "destructive",
      });
    }
  };

  const onPatientSubmit = (data: PatientForm) => {
    patientLoginMutation.mutate(data);
  };

  const switchMode = (newMode: "clinician" | "patient") => {
    setMode(newMode);
    clinicianForm.reset();
    patientForm.reset();
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div
        className="hidden md:flex md:w-[44%] flex-col items-center justify-center p-14"
        style={{ backgroundColor: "#e8ddd0" }}
      >
        <div className="flex flex-col items-center text-center space-y-8 max-w-xs">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="w-64 h-auto"
            style={{ mixBlendMode: "multiply" }}
          />
          {mode === "clinician" ? (
            <div className="space-y-2">
              <p className="text-[#2e3a20] text-base font-medium leading-snug">
                Clinical-grade lab interpretation
              </p>
              <p className="text-[#5a6e44] text-sm leading-relaxed">
                for hormone and primary care providers
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[#2e3a20] text-base font-medium leading-snug">
                Your personal health portal
              </p>
              <p className="text-[#5a6e44] text-sm leading-relaxed">
                View your lab results, supplements, and wellness journey
              </p>
            </div>
          )}
          <div className="w-10 h-px bg-[#2e3a20] opacity-20" />
          <p className="text-[#7a8a64] text-xs tracking-wide uppercase">
            Secure · Evidence-based · Private
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div
            className="md:hidden flex justify-center mb-8"
            style={{ backgroundColor: "#e8ddd0", borderRadius: "12px", padding: "12px 24px" }}
          >
            <img
              src="/realign-health-logo.png"
              alt="ReAlign Health"
              className="h-12 w-auto"
              style={{ mixBlendMode: "multiply" }}
            />
          </div>

          {/* Mode toggle */}
          <div
            className="flex p-1 rounded-lg mb-8"
            style={{ backgroundColor: "#f0ece4" }}
          >
            <button
              type="button"
              onClick={() => switchMode("clinician")}
              data-testid="tab-clinician-login"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all"
              style={
                mode === "clinician"
                  ? { backgroundColor: "#fff", color: "#1c2414", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
                  : { color: "#7a8a64" }
              }
            >
              <Stethoscope className="w-3.5 h-3.5" />
              Clinician
            </button>
            <button
              type="button"
              onClick={() => switchMode("patient")}
              data-testid="tab-patient-login"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all"
              style={
                mode === "patient"
                  ? { backgroundColor: "#fff", color: "#1c2414", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
                  : { color: "#7a8a64" }
              }
            >
              <Leaf className="w-3.5 h-3.5" />
              Patient Portal
            </button>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>
              {mode === "clinician" ? "Welcome back" : "Your health portal"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "#7a8a64" }}>
              {mode === "clinician"
                ? "Sign in to your clinic workspace"
                : "Sign in to view your wellness journey"}
            </p>
          </div>

          {/* Clinician form */}
          {mode === "clinician" && (
            <>
              <Form {...clinicianForm}>
                <form onSubmit={clinicianForm.handleSubmit(onClinicianSubmit)} className="space-y-4">
                  <FormField
                    control={clinicianForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel style={{ color: "#2e3a20" }}>Username</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              data-testid="input-username"
                              placeholder="Username or email"
                              className="pl-9"
                              autoComplete="username"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={clinicianForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel style={{ color: "#2e3a20" }}>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              data-testid="input-password"
                              type="password"
                              placeholder="••••••••"
                              className="pl-9"
                              autoComplete="current-password"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    data-testid="button-login"
                    type="submit"
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </Form>

              <div className="mt-4 text-center">
                <button
                  data-testid="link-forgot-password"
                  onClick={() => setLocation("/forgot-password")}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "#2e3a20" }}
                >
                  Forgot your password?
                </button>
              </div>

              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  New to ReAlign Health?{" "}
                  <button
                    data-testid="link-register"
                    onClick={() => setLocation("/register")}
                    className="font-medium hover:underline"
                    style={{ color: "#2e3a20" }}
                  >
                    Create an account
                  </button>
                </p>
              </div>
            </>
          )}

          {/* Patient form */}
          {mode === "patient" && (
            <>
              <Form {...patientForm}>
                <form onSubmit={patientForm.handleSubmit(onPatientSubmit)} className="space-y-4">
                  <FormField
                    control={patientForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel style={{ color: "#2e3a20" }}>Email address</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              data-testid="input-portal-email"
                              type="email"
                              placeholder="your@email.com"
                              className="pl-9"
                              autoComplete="email"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={patientForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel style={{ color: "#2e3a20" }}>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              data-testid="input-portal-password"
                              type="password"
                              placeholder="••••••••"
                              className="pl-9"
                              autoComplete="current-password"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    data-testid="button-portal-login"
                    type="submit"
                    className="w-full"
                    disabled={patientLoginMutation.isPending}
                    style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                  >
                    {patientLoginMutation.isPending ? "Signing in…" : "Sign In"}
                  </Button>
                </form>
              </Form>

              <div className="mt-4 text-center">
                <Link href="/portal/forgot-password">
                  <button
                    data-testid="link-portal-forgot-password"
                    className="text-sm font-medium hover:underline"
                    style={{ color: "#2e3a20" }}
                  >
                    Forgot your password?
                  </button>
                </Link>
              </div>

              <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
                Your portal access is provided by your clinic.
                <br />
                Contact your care team if you need help signing in.
              </p>
            </>
          )}

          <p className="text-center text-xs text-muted-foreground mt-8">
            Protected health information is encrypted and stored securely.
          </p>
        </div>
      </div>
    </div>
  );
}
