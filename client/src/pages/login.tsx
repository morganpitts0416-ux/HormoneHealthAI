import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await loginMutation.mutateAsync(data);
    } catch (error: any) {
      const message = error?.message || "Invalid username or password";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden md:flex md:w-[45%] flex-col items-center justify-center bg-[#2e3a20] p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 80%, #c8b89a 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8a9e6a 0%, transparent 50%)"
          }}
        />
        <div className="relative z-10 flex flex-col items-center text-center space-y-6 max-w-xs">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="w-64 h-auto"
            style={{ mixBlendMode: "screen" }}
          />
          <p className="text-[#c8b89a] text-base font-light leading-relaxed">
            Clinical-grade lab interpretation for hormone and primary care providers
          </p>
          <div className="w-12 h-px bg-[#c8b89a] opacity-40" />
          <p className="text-[#8a9e6a] text-sm">
            Secure · Evidence-based · Provider-first
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
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

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">Sign in</h1>
            <p className="text-muted-foreground text-sm mt-1">Access your clinic workspace</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          data-testid="input-username"
                          placeholder="your.username"
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
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
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

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              New to ReAlign Health?{" "}
              <button
                data-testid="link-register"
                onClick={() => setLocation("/register")}
                className="text-primary font-medium hover:underline"
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
