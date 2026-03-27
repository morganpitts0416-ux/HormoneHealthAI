import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Leaf } from "lucide-react";

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/portal/login", { email, password }),
    onSuccess: () => {
      setLocation("/portal/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Unable to sign in",
        description: error.message || "Please check your email and password.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate();
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#f9f6f0" }}
    >
      {/* Minimal top bar */}
      <div
        className="w-full py-5 px-8 flex items-center justify-between border-b"
        style={{ borderColor: "#e8ddd0", backgroundColor: "#f9f6f0" }}
      >
        <img
          src="/realign-health-logo.png"
          alt="ReAlign Health"
          className="h-9 w-auto"
          style={{ mixBlendMode: "multiply" }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          {/* Leaf icon */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-8 mx-auto"
            style={{ backgroundColor: "#2e3a20" }}
          >
            <Leaf className="w-5 h-5" style={{ color: "#e8ddd0" }} />
          </div>

          <div className="text-center mb-10">
            <h1
              className="text-2xl font-semibold mb-2 tracking-tight"
              style={{ color: "#1c2414" }}
            >
              Your Health Portal
            </h1>
            <p className="text-sm" style={{ color: "#7a8a64" }}>
              Sign in to view your wellness journey
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: "#7a8a64" }}
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                data-testid="input-portal-email"
                className="bg-white border-0 shadow-sm h-11 text-sm"
                style={{ borderColor: "#e0d8cc" }}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: "#7a8a64" }}
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                data-testid="input-portal-password"
                className="bg-white border-0 shadow-sm h-11 text-sm"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-medium mt-2"
              disabled={loginMutation.isPending}
              data-testid="button-portal-login"
              style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
            >
              {loginMutation.isPending ? "Signing in…" : "Sign in"}
            </Button>

            <div className="text-center">
              <Link href="/portal/forgot-password">
                <button
                  type="button"
                  className="text-xs"
                  style={{ color: "#7a8a64" }}
                  data-testid="link-portal-forgot-password"
                >
                  Forgot your password?
                </button>
              </Link>
            </div>
          </form>

          <p
            className="text-center text-xs mt-10 leading-relaxed"
            style={{ color: "#a8b090" }}
          >
            This portal is private and secure.
            <br />
            Only you and your care team can access your health data.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div
        className="py-5 text-center border-t"
        style={{ borderColor: "#e8ddd0" }}
      >
        <p className="text-xs" style={{ color: "#b0b8a0" }}>
          Powered by ReAlign Health
        </p>
      </div>
    </div>
  );
}
