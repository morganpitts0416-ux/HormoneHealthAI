import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, CheckCircle2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Bootstrap() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [promotedUsername, setPromotedUsername] = useState("");

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auto-bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setPromotedUsername(data.user.username);
      setDone(true);
      toast({ title: "Admin access granted", description: `${data.user.username} is now an admin.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#dcefd0" }}>
              <CheckCircle2 className="w-6 h-6" style={{ color: "#2e3a20" }} />
            </div>
            <div>
              <h2 className="font-semibold text-lg" style={{ color: "#1c2414" }}>Admin access granted</h2>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>@{promotedUsername}</strong> now has admin privileges.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Log in with that account to access the Developer Dashboard.
            </p>
            <Button className="w-full" onClick={() => setLocation("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
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
              One-time setup to grant your account developer admin access. Enter the username you registered with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
                  <User className="w-3.5 h-3.5 inline mr-1" />
                  Your Username
                </label>
                <Input
                  placeholder="e.g. morgan.admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="input-bootstrap-username"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !username.trim()}
                data-testid="button-bootstrap-submit"
              >
                {loading ? "Granting access..." : "Grant Admin Access"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          This only works once — once an admin account exists, this page is permanently disabled.
        </p>
      </div>
    </div>
  );
}
