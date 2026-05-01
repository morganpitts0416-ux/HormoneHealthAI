import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        setError(data.message || "Something went wrong. Please try again.");
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
            src="/cliniq-logo.png"
            alt="ClinIQ"
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

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden flex justify-center mb-10" style={{ backgroundColor: "#e8ddd0", borderRadius: "12px", padding: "12px 24px" }}>
            <img src="/cliniq-logo.png" alt="ClinIQ" className="h-12 w-auto" style={{ mixBlendMode: "multiply" }} />
          </div>

          <button
            onClick={() => setLocation("/login")}
            className="flex items-center gap-1.5 text-sm mb-8 hover:underline"
            style={{ color: "#7a8a64" }}
            data-testid="link-back-to-login"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </button>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="w-14 h-14" style={{ color: "#2e3a20" }} />
              </div>
              <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>Check your email</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                If <strong style={{ color: "#2e3a20" }}>{email}</strong> is registered, you'll receive a password reset link shortly.
                The link expires in 1 hour.
              </p>
              <p className="text-xs" style={{ color: "#7a8a64" }}>
                Didn't receive it? Check your spam folder or{" "}
                <button
                  className="underline"
                  style={{ color: "#2e3a20" }}
                  onClick={() => { setSent(false); setEmail(""); }}
                >
                  try again
                </button>.
              </p>
              <Button
                className="w-full mt-4"
                onClick={() => setLocation("/login")}
                data-testid="button-back-to-login"
              >
                Back to Sign In
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>Reset your password</h1>
                <p className="text-sm mt-1" style={{ color: "#7a8a64" }}>
                  Enter the email address on your account and we'll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-[#2e3a20]">Email address</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@clinic.com"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      data-testid="input-forgot-email"
                    />
                  </div>
                  {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                  data-testid="button-send-reset"
                >
                  {isSubmitting ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
