import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Leaf, Eye, EyeOff } from "lucide-react";

export default function PortalResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token");

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/reset-password", { token, password }),
    onSuccess: () => {
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      setLocation("/portal/login");
    },
    onError: (error: any) => {
      toast({
        title: "Reset failed",
        description: error.message || "This link may have expired. Please request a new one.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please re-enter your new password.", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-base font-medium" style={{ color: "#1c2414" }}>Invalid reset link</p>
          <p className="text-sm" style={{ color: "#7a8a64" }}>
            This link is missing a reset token. Please request a new password reset from the sign-in page.
          </p>
          <Button
            variant="outline"
            onClick={() => setLocation("/portal/forgot-password")}
            data-testid="button-request-new-link"
          >
            Request new link
          </Button>
        </div>
      </div>
    );
  }

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

          <div className="text-center mb-10">
            <h1 className="text-2xl font-semibold mb-2 tracking-tight" style={{ color: "#1c2414" }}>
              Set a new password
            </h1>
            <p className="text-sm" style={{ color: "#7a8a64" }}>
              Choose a password you'll remember
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: "#7a8a64" }}
              >
                New password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  autoFocus
                  data-testid="input-portal-new-password"
                  className="bg-white border-0 shadow-sm h-11 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#a8b090" }}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                required
                data-testid="input-portal-confirm-password"
                className="bg-white border-0 shadow-sm h-11 text-sm"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-medium mt-2"
              disabled={mutation.isPending}
              data-testid="button-set-new-password"
              style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
            >
              {mutation.isPending ? "Saving…" : "Set new password"}
            </Button>
          </form>
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
