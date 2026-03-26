import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { user, isLoading, loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && user) setLocation("/dashboard");
  }, [user, isLoading, setLocation]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await loginMutation.mutateAsync(data);
    } catch (error: any) {
      toast({ title: "Login failed", description: error?.message || "Invalid username or password", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel — tan/warm cream */}
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
          <div className="space-y-2">
            <p className="text-[#2e3a20] text-base font-medium leading-snug">
              Clinical-grade lab interpretation
            </p>
            <p className="text-[#5a6e44] text-sm leading-relaxed">
              for hormone and primary care providers
            </p>
          </div>
          <div className="w-10 h-px bg-[#2e3a20] opacity-20" />
          <p className="text-[#7a8a64] text-xs tracking-wide uppercase">
            Secure · Evidence-based · Provider-first
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden flex justify-center mb-10" style={{ backgroundColor: "#e8ddd0", borderRadius: "12px", padding: "12px 24px" }}>
            <img
              src="/realign-health-logo.png"
              alt="ReAlign Health"
              className="h-12 w-auto"
              style={{ mixBlendMode: "multiply" }}
            />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>Welcome back</h1>
            <p className="text-sm mt-1" style={{ color: "#7a8a64" }}>Sign in to your clinic workspace</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#2e3a20]">Username</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input data-testid="input-username" placeholder="your.username" className="pl-9" autoComplete="username" {...field} />
                      </div>
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
                    <FormLabel className="text-[#2e3a20]">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input data-testid="input-password" type="password" placeholder="••••••••" className="pl-9" autoComplete="current-password" {...field} />
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

          <p className="text-center text-xs text-muted-foreground mt-8">
            Protected health information is encrypted and stored securely.
          </p>
        </div>
      </div>
    </div>
  );
}
