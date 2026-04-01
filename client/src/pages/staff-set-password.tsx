import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";
import { PasswordStrengthIndicator } from "@/components/password-strength-indicator";

export default function StaffSetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "invalid">("idle");

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-8">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="w-14 h-14 mx-auto" style={{ color: "#c0392b" }} />
          <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>Invalid invite link</h1>
          <p className="text-sm" style={{ color: "#7a8a64" }}>
            This invite link is missing a token. Please use the link from your invite email.
          </p>
          <Button className="w-full" onClick={() => setLocation("/login")} data-testid="button-back-to-login">
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

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
      const res = await fetch("/api/auth/staff-set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
      } else if (res.status === 400 && data.message?.includes("expired")) {
        setStatus("invalid");
      } else {
        setError(data.message || "Failed to set password. Please try again.");
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
          <div
            className="md:hidden flex justify-center mb-10"
            style={{ backgroundColor: "#e8ddd0", borderRadius: "12px", padding: "12px 24px" }}
          >
            <img
              src="/realign-health-logo.png"
              alt="ReAlign Health"
              className="h-12 w-auto"
              style={{ mixBlendMode: "multiply" }}
            />
          </div>

          {status === "invalid" && (
            <div className="text-center space-y-4">
              <AlertCircle className="w-14 h-14 mx-auto" style={{ color: "#c0392b" }} />
              <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>Invite link expired</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                This staff invite link has expired (invite links last 72 hours). Please ask your clinician to send a new invite.
              </p>
              <Button
                className="w-full"
                onClick={() => setLocation("/login")}
                data-testid="button-back-to-login"
              >
                Back to Sign In
              </Button>
            </div>
          )}

          {status === "success" && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-14 h-14 mx-auto" style={{ color: "#2e3a20" }} />
              <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>Password set!</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                Your staff account is active. Sign in with your email address and new password to access the workspace.
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

          {status === "idle" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>
                  Set your password
                </h1>
                <p className="text-sm mt-1" style={{ color: "#7a8a64" }}>
                  Create a password to activate your staff account.
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
                  <Label htmlFor="confirm" className="text-[#2e3a20]">Confirm Password</Label>
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
                  data-testid="button-set-password"
                >
                  {isSubmitting ? "Activating account…" : "Set Password & Activate Account"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
