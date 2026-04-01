import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { PasswordStrengthIndicator } from "@/components/password-strength-indicator";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";

  const [status, setStatus] = useState<"validating" | "valid" | "invalid" | "success">("validating");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    fetch(`/api/auth/validate-reset-token/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setFirstName(data.firstName || "");
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
      } else {
        setError(data.message || "Failed to reset password. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
          <div className="space-y-2">
            <p className="text-[#2e3a20] text-base font-medium leading-snug">
              Clinical-grade lab interpretation
            </p>
            <p className="text-[#5a6e44] text-sm leading-relaxed">
              for hormone and primary care providers
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden flex justify-center mb-10" style={{ backgroundColor: "#e8ddd0", borderRadius: "12px", padding: "12px 24px" }}>
            <img src="/realign-health-logo.png" alt="ReAlign Health" className="h-12 w-auto" style={{ mixBlendMode: "multiply" }} />
          </div>

          {status === "validating" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#2e3a20" }} />
              <p className="text-sm" style={{ color: "#7a8a64" }}>Verifying your reset link…</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="text-center space-y-4">
              <AlertCircle className="w-14 h-14 mx-auto" style={{ color: "#c0392b" }} />
              <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>Link expired or invalid</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                This password reset link is no longer valid. It may have expired (reset links last 1 hour) or already been used.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation("/forgot-password")}
                data-testid="button-request-new-link"
              >
                Request a New Link
              </Button>
              <Button
                className="w-full"
                onClick={() => setLocation("/login")}
                data-testid="button-back-to-login"
              >
                Back to Sign In
              </Button>
            </div>
          )}

          {status === "valid" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>
                  Choose a new password
                </h1>
                <p className="text-sm mt-1" style={{ color: "#7a8a64" }}>
                  {firstName ? `Hi ${firstName} — enter` : "Enter"} your new password below.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password" className="text-[#2e3a20]">New Password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Min. 8 characters"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      data-testid="input-new-password"
                    />
                  </div>
                  <PasswordStrengthIndicator password={password} />
                </div>
                <div>
                  <Label htmlFor="confirm" className="text-[#2e3a20]">Confirm New Password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirm"
                      type="password"
                      placeholder="Re-enter password"
                      className="pl-9"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      data-testid="input-confirm-password"
                    />
                  </div>
                  {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                  data-testid="button-reset-password"
                >
                  {isSubmitting ? "Updating…" : "Update Password"}
                </Button>
              </form>
            </>
          )}

          {status === "success" && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-14 h-14 mx-auto" style={{ color: "#2e3a20" }} />
              <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>Password updated!</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Your password has been changed successfully. You can now sign in with your new password.
              </p>
              <Button
                className="w-full"
                onClick={() => setLocation("/login")}
                data-testid="button-go-to-login"
              >
                Go to Sign In
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
