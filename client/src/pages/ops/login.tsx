import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";

export default function OpsLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<{ enabled: boolean; bootstrapped: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/ops/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.enabled) {
          setChecking(false);
          return;
        }
        if (!data.bootstrapped) {
          setLocation("/ops/bootstrap");
          return;
        }
        setStatus(data);
        setChecking(false);
      })
      .catch(() => setChecking(false));

    fetch("/api/ops/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.admin) setLocation("/ops/dashboard");
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/ops/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Login failed");
        return;
      }
      setLocation("/ops/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!status?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-slate-500 text-sm">Not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6 text-slate-300" />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">ClinIQ Ops</h1>
          <p className="text-slate-500 text-sm">Platform administration portal</p>
        </div>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-slate-100 text-base font-medium">Sign in</CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              Access restricted to authorized platform administrators only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-md bg-red-950/60 border border-red-900/60 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-red-300 text-xs">{error}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Email address</label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                  className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus-visible:ring-slate-500"
                  data-testid="input-ops-email"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus-visible:ring-slate-500 pr-10"
                    data-testid="input-ops-password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-slate-100 text-slate-900 hover:bg-white"
                disabled={loading || !email || !password}
                data-testid="button-ops-login"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-700">
          Every access to this portal is audit logged.
        </p>
      </div>
    </div>
  );
}
