import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, KeyRound, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function Bootstrap() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Admin access granted", description: `${data.user.username} is now an admin.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-sm w-full">
          <CardHeader>
            <CardTitle className="text-base">Sign in required</CardTitle>
            <CardDescription>You must be logged in to use this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setLocation("/login")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if ((user as any).role === "admin" || done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#dcefd0" }}>
              <CheckCircle2 className="w-6 h-6" style={{ color: "#2e3a20" }} />
            </div>
            <div>
              <h2 className="font-semibold text-lg" style={{ color: "#1c2414" }}>Admin access active</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your account <strong>@{user.username}</strong> has admin privileges.
              </p>
            </div>
            <Button className="w-full" onClick={() => setLocation("/admin")}>
              Go to Developer Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-2">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="h-12 w-auto mx-auto mb-4"
            style={{ mixBlendMode: "multiply" }}
          />
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e8ddd0" }}>
                <ShieldCheck className="w-4 h-4" style={{ color: "#2e3a20" }} />
              </div>
              <CardTitle className="text-base">Admin Bootstrap</CardTitle>
            </div>
            <CardDescription>
              Enter the <code className="text-xs bg-muted px-1 py-0.5 rounded">ADMIN_BOOTSTRAP_TOKEN</code> from your
              Replit Secrets tab to grant your account admin privileges.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>Signed in as</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">@{user.username}</span>
                  <span>— {user.title} {user.firstName} {user.lastName}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
                  <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                  Bootstrap Token
                </label>
                <Input
                  type="password"
                  placeholder="Paste token from Replit Secrets"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  data-testid="input-bootstrap-token"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Find it in the Replit Secrets tab as <code className="bg-muted px-1 rounded">ADMIN_BOOTSTRAP_TOKEN</code>
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token.trim()} data-testid="button-bootstrap-submit">
                {loading ? "Granting access..." : "Grant Admin Access"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          This page is only useful once. After your account is promoted, you can ignore this URL.
        </p>
      </div>
    </div>
  );
}
