import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";

export default function OpsBootstrap() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    token: "",
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
  });

  useEffect(() => {
    fetch("/api/ops/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.enabled) {
          setChecking(false);
          return;
        }
        if (data.bootstrapped) {
          setLocation("/ops");
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ops/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token: form.token,
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Bootstrap failed");
        return;
      }
      setDone(true);
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

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="bg-slate-900 border-slate-800 max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-900/50 border border-emerald-800 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-slate-100 font-semibold text-lg">Owner account created</h2>
              <p className="text-slate-500 text-sm mt-1">
                You can now sign in to the Ops portal.
              </p>
            </div>
            <Button
              className="w-full bg-slate-100 text-slate-900 hover:bg-white"
              onClick={() => setLocation("/ops")}
              data-testid="button-ops-bootstrap-done"
            >
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6 text-slate-300" />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">Ops Portal Setup</h1>
          <p className="text-slate-500 text-sm">Create the initial owner account</p>
        </div>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-slate-100 text-base font-medium">Bootstrap</CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              Requires the OPS_BOOTSTRAP_TOKEN secret. This page is disabled once an owner exists.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="flex items-start gap-2 rounded-md bg-red-950/60 border border-red-900/60 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-red-300 text-xs">{error}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Bootstrap token</label>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={form.token}
                    onChange={handleChange("token")}
                    required
                    autoComplete="off"
                    placeholder="From OPS_BOOTSTRAP_TOKEN secret"
                    className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus-visible:ring-slate-500 pr-10"
                    data-testid="input-ops-bootstrap-token"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">First name</label>
                  <Input value={form.firstName} onChange={handleChange("firstName")} required
                    className="bg-slate-800 border-slate-700 text-slate-100 focus-visible:ring-slate-500"
                    data-testid="input-ops-bootstrap-firstname" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Last name</label>
                  <Input value={form.lastName} onChange={handleChange("lastName")} required
                    className="bg-slate-800 border-slate-700 text-slate-100 focus-visible:ring-slate-500"
                    data-testid="input-ops-bootstrap-lastname" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Email address</label>
                <Input type="email" autoComplete="email" value={form.email} onChange={handleChange("email")} required
                  placeholder="you@example.com"
                  className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus-visible:ring-slate-500"
                  data-testid="input-ops-bootstrap-email" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Password <span className="text-slate-600">(min 12 chars)</span></label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} autoComplete="new-password"
                    value={form.password} onChange={handleChange("password")} required
                    className="bg-slate-800 border-slate-700 text-slate-100 focus-visible:ring-slate-500 pr-10"
                    data-testid="input-ops-bootstrap-password" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Confirm password</label>
                <Input type="password" autoComplete="new-password"
                  value={form.confirmPassword} onChange={handleChange("confirmPassword")} required
                  className="bg-slate-800 border-slate-700 text-slate-100 focus-visible:ring-slate-500"
                  data-testid="input-ops-bootstrap-confirm" />
              </div>

              <Button type="submit"
                className="w-full bg-slate-100 text-slate-900 hover:bg-white mt-1"
                disabled={loading || !form.token || !form.email || !form.password || !form.firstName || !form.lastName}
                data-testid="button-ops-bootstrap-submit">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create owner account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
