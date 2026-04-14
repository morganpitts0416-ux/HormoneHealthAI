import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Eye, EyeOff, Building2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function JoinClinicPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Extract token from URL query string
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [title, setTitle] = useState("");
  const [npi, setNpi] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data, isLoading, error } = useQuery<{ valid: boolean; invite: any; clinic: any }>({
    queryKey: ["/api/join-clinic", token],
    queryFn: async () => {
      const res = await fetch(`/api/join-clinic/${token}`, { credentials: "include" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.message || "Invalid invite link");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/join-clinic/${token}`, {
        password,
        title: title.trim() || undefined,
        npi: npi.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.message || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err: Error) => {
      toast({ title: "Account setup failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!password || password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please re-enter your password.", variant: "destructive" });
      return;
    }
    joinMutation.mutate();
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-8 pb-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
            <p className="text-base font-semibold">Invalid Invite Link</p>
            <p className="text-sm text-muted-foreground">No invite token was provided. Please check the link in your invitation email.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <p className="text-muted-foreground text-sm">Validating your invite link…</p>
      </div>
    );
  }

  if (error || !data?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-8 pb-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
            <p className="text-base font-semibold">Invite Link Expired or Invalid</p>
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || "This invite link is no longer valid. Please ask the clinic owner to send a new invite."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <CheckCircle className="w-12 h-12 mx-auto" style={{ color: "#2e3a20" }} />
            <div className="space-y-1">
              <p className="text-base font-semibold">Account Created!</p>
              <p className="text-sm text-muted-foreground">You've joined <strong>{data.clinic?.name}</strong>. Log in now to access your clinic workspace.</p>
            </div>
            <Button onClick={() => setLocation("/login")} style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }} data-testid="button-go-to-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invite = data.invite;
  const clinic = data.clinic;

  const clinicalRoleLabel: Record<string, string> = {
    provider: "Provider (MD/DO/NP/PA)",
    nurse: "RN / Nurse",
    assistant: "Medical Assistant",
    staff: "Staff",
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: "#f9f6f0" }}>
      <div className="w-full max-w-lg space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <Building2 className="w-10 h-10" style={{ color: "#2e3a20" }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: "#1c2414" }}>Join {clinic?.name}</h1>
          <p className="text-sm text-muted-foreground">You've been invited to join this clinic on ClinIQ. Complete your account setup below.</p>
        </div>

        {/* Invite summary */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Invite Details</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium text-foreground">{invite.firstName} {invite.lastName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium text-foreground truncate">{invite.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clinical Role</p>
                <Badge variant="secondary" className="text-xs mt-0.5">{clinicalRoleLabel[invite.clinicalRole] || invite.clinicalRole}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Admin Role</p>
                <Badge variant="outline" className="text-xs mt-0.5 capitalize">{invite.adminRole === "limited_admin" ? "Limited Admin" : invite.adminRole}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account setup form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="w-4 h-4" style={{ color: "#2e3a20" }} />
              Complete Your Account
            </CardTitle>
            <CardDescription className="text-xs">Set your password and optional clinical details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Password <span className="text-destructive">*</span></label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  data-testid="input-join-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Confirm Password <span className="text-destructive">*</span></label>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                data-testid="input-join-confirm-password"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Title / Credentials</label>
                <Input placeholder="MD, NP, RN…" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-join-title" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">NPI Number</label>
                <Input placeholder="1234567890" value={npi} onChange={e => setNpi(e.target.value)} data-testid="input-join-npi" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
                <Input placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-join-phone" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Your email address will be <strong>{invite.email}</strong>. Use this to log in after setup.</p>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={joinMutation.isPending || !password || !confirmPassword}
              style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
              data-testid="button-create-account"
            >
              {joinMutation.isPending ? "Creating account…" : "Create Account & Join Clinic"}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <button onClick={() => setLocation("/login")} className="underline" style={{ color: "#2e3a20" }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
