import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function PortalForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/forgot-password", { email }),
    onSuccess: () => setSent(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    mutation.mutate();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f9f6f0" }}>
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

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-8 mx-auto"
            style={{ backgroundColor: "#2e3a20" }}
          >
            <Leaf className="w-5 h-5" style={{ color: "#e8ddd0" }} />
          </div>

          {sent ? (
            <div className="text-center space-y-5">
              <CheckCircle2 className="w-10 h-10 mx-auto" style={{ color: "#2e3a20" }} />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: "#1c2414" }}>
                  Check your email
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                  If <strong>{email}</strong> is registered, you'll receive a password reset link shortly. It expires in 1 hour.
                </p>
              </div>
              <p className="text-xs" style={{ color: "#a8b090" }}>
                Didn't get it? Check your spam folder or contact your clinic to resend your portal invitation.
              </p>
              <Link href="/login?mode=patient">
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  data-testid="button-back-to-login"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <h1 className="text-2xl font-semibold mb-2 tracking-tight" style={{ color: "#1c2414" }}>
                  Reset your password
                </h1>
                <p className="text-sm" style={{ color: "#7a8a64" }}>
                  Enter your portal email and we'll send you a reset link
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-xs font-medium uppercase tracking-wider"
                    style={{ color: "#7a8a64" }}
                  >
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    autoFocus
                    data-testid="input-portal-reset-email"
                    className="bg-white border-0 shadow-sm h-11 text-sm"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium"
                  disabled={mutation.isPending}
                  data-testid="button-send-reset-link"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                >
                  {mutation.isPending ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <div className="text-center mt-8">
                <Link href="/login?mode=patient">
                  <button
                    className="text-sm inline-flex items-center gap-1"
                    style={{ color: "#7a8a64" }}
                    data-testid="link-back-to-login"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back to sign in
                  </button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="py-5 text-center border-t" style={{ borderColor: "#e8ddd0" }}>
        <p className="text-xs" style={{ color: "#b0b8a0" }}>
          Powered by ReAlign Health
        </p>
      </div>
    </div>
  );
}
