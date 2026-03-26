import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Leaf } from "lucide-react";

export default function PortalSetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setLocation("/portal/login");
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
      <div
        className="w-full py-5 px-8 border-b"
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
                onClick={() => setLocation("/portal/login")}
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

              <div className="text-center mb-10">
                <h1 className="text-2xl font-semibold mb-2 tracking-tight" style={{ color: "#1c2414" }}>
                  Welcome to your portal
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
                  Create a password to access your personal health portal.
                </p>
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

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium mt-2"
                  disabled={setPasswordMutation.isPending}
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
          Powered by ReAlign Health
        </p>
      </div>
    </div>
  );
}
