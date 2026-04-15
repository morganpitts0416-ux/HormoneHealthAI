import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, CheckCircle2, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function Bootstrap() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [promotedUsername, setPromotedUsername] = useState("");

  const handleAutoBootstrap = async (e: React.FormEvent) => {
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

  const handleTokenBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bootstrapToken.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: bootstrapToken.trim() }),
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
              {user ? "You can now access the Admin Dashboard." : "Log in with that account to access the Admin Dashboard."}
            </p>
            <Button className="w-full" onClick={() => setLocation(user ? "/admin" : "/login")} data-testid="button-go-after-bootstrap">
              {user ? "Go to Admin Dashboard" : "Go to Login"}
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

        {user ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e8ddd0" }}>
                  <Key className="w-4 h-4" style={{ color: "#2e3a20" }} />
                </div>
                <CardTitle className="text-base">Promote to Admin</CardTitle>
              </div>
              <CardDescription>
                Enter the admin bootstrap token to grant your current account (<strong>{user.email}</strong>) admin privileges.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTokenBootstrap} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
                    Bootstrap Token
                  </label>
                  <Input
                    type="password"
                    placeholder="Enter token"
                    value={bootstrapToken}
                    onChange={(e) => setBootstrapToken(e.target.value)}
                    data-testid="input-bootstrap-token"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !bootstrapToken.trim()}
                  data-testid="button-bootstrap-token-submit"
                >
                  {loading ? "Granting access..." : "Grant Admin Access"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e8ddd0" }}>
                  <ShieldCheck className="w-4 h-4" style={{ color: "#2e3a20" }} />
                </div>
                <CardTitle className="text-base">Admin Bootstrap</CardTitle>
              </div>
              <CardDescription>
                First-time setup: enter your username to grant admin access. If an admin already exists, <a href="/login" className="underline">log in first</a> and return here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAutoBootstrap} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" style={{ color: "#2e3a20" }}>
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
        )}
        <p className="text-center text-xs text-muted-foreground">
          {user
            ? "This requires a valid bootstrap token configured on the server."
            : "If an admin already exists, log in first, then revisit this page to use the token-based promotion."
          }
        </p>
      </div>
    </div>
  );
}
