import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Leaf, ShieldCheck } from "lucide-react";

export default function PortalSetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setLocation("/login?mode=patient");
  }, [token, setLocation]);

  const setPasswordMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/portal/set-password", { token, password }),
    onSuccess: () => {
      setDone(true);
    },
    onError: (error: any) => {
      toast({
        title: "Something went wrong",
        description: error.message || "Please try again or request a new invitation.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast({ title: "Agreement required", description: "Please read and accept the portal terms before continuing.", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Please use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please make sure both fields match.", variant: "destructive" });
      return;
    }
    setPasswordMutation.mutate();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <div
        className="w-full py-5 px-8 border-b"
        style={{ borderColor: "#e8ddd0", backgroundColor: "#f9f6f0" }}
      >
        <img
          src="/cliniq-logo.png"
          alt="ClinIQ"
          className="h-9 w-auto"
          style={{ mixBlendMode: "multiply" }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {done ? (
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-6 mx-auto"
                style={{ backgroundColor: "#2e3a20" }}
              >
                <CheckCircle className="w-7 h-7" style={{ color: "#e8ddd0" }} />
              </div>
              <h1 className="text-2xl font-semibold mb-3 tracking-tight" style={{ color: "#1c2414" }}>
                You're all set.
              </h1>
              <p className="text-sm mb-8 leading-relaxed" style={{ color: "#7a8a64" }}>
                Your health portal account is ready. Sign in to begin your wellness journey.
              </p>
              <Button
                onClick={() => setLocation("/login?mode=patient")}
                className="w-full h-11 text-sm font-medium"
                data-testid="button-go-to-login"
                style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
              >
                Sign in to my portal
              </Button>
            </div>
          ) : (
            <>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-8 mx-auto"
                style={{ backgroundColor: "#2e3a20" }}
              >
                <Leaf className="w-5 h-5" style={{ color: "#e8ddd0" }} />
              </div>

              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold mb-2 tracking-tight" style={{ color: "#1c2414" }}>
                  Welcome to your portal
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                  Create a password to access your personal health portal.
                </p>
              </div>

              {/* Patient notice */}
              <div
                className="rounded-md border mb-6"
                style={{ borderColor: "#d4c9b5", backgroundColor: "#fdfcfb" }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3 border-b"
                  style={{ borderColor: "#e8ddd0" }}
                >
                  <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#2e3a20" }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#2e3a20" }}>
                    Before You Continue
                  </span>
                </div>
                <div
                  className="overflow-y-auto px-4 py-3 text-xs leading-relaxed space-y-3"
                  style={{ maxHeight: "190px", color: "#3d4a30" }}
                >
                  <div>
                    <p className="font-semibold mb-1" style={{ color: "#1c2414" }}>What this portal is</p>
                    <p>
                      This portal gives you a private, secure view of the health information your care team has chosen to share with you — including your lab results explained in plain language, personalized wellness recommendations, and any messages from your provider. It is a convenience tool to help you stay informed and engaged with your care.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1" style={{ color: "#1c2414" }}>Not a substitute for medical care</p>
                    <p>
                      The content in this portal is informational and is provided to support — not replace — direct communication with your healthcare provider. Do not make changes to your medications, supplements, or treatment plan based solely on information in this portal without first speaking with your care team. If you have questions about your results or recommendations, please contact your provider directly.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1" style={{ color: "#1c2414" }}>Your privacy</p>
                    <p>
                      Your health information is private and can only be accessed by you and the care team at your clinic. We do not sell, share, or use your data for any purpose other than supporting your care. Your account is protected by the password you create here.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1" style={{ color: "#dc2626" }}>Medical emergencies</p>
                    <p>
                      This portal is not monitored around the clock and is not appropriate for urgent medical needs. If you are experiencing a medical emergency, call <strong>911</strong> or go to your nearest emergency room immediately. Do not use this portal to report emergencies or seek urgent care.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs font-medium uppercase tracking-wider"
                    style={{ color: "#7a8a64" }}
                  >
                    Create password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    data-testid="input-portal-new-password"
                    className="bg-white border-0 shadow-sm h-11 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirm"
                    className="text-xs font-medium uppercase tracking-wider"
                    style={{ color: "#7a8a64" }}
                  >
                    Confirm password
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    data-testid="input-portal-confirm-password"
                    className="bg-white border-0 shadow-sm h-11 text-sm"
                  />
                </div>

                {/* Agreement checkbox */}
                <label className="flex items-start gap-3 cursor-pointer" data-testid="checkbox-portal-agree">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                      style={{
                        borderColor: agreed ? "#2e3a20" : "#d4c9b5",
                        backgroundColor: agreed ? "#2e3a20" : "white",
                      }}
                    >
                      {agreed && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>
                    I have read and understand the above. I know that this portal does not replace my care team, and that I should call 911 in a medical emergency.
                  </span>
                </label>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium mt-2"
                  disabled={setPasswordMutation.isPending || !agreed}
                  data-testid="button-set-portal-password"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                >
                  {setPasswordMutation.isPending ? "Setting up…" : "Create my account"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="py-5 text-center border-t" style={{ borderColor: "#e8ddd0" }}>
        <p className="text-xs" style={{ color: "#b0b8a0" }}>
          Powered by ClinIQ
        </p>
      </div>
    </div>
  );
}
