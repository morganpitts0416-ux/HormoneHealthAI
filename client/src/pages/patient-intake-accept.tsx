import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// This standalone, development-only page is intentionally not part of portal
// navigation. The exchange endpoint places the short-lived flow token in a
// fragment, which is removed before any UI is rendered or analytics can see it.
export default function PatientIntakeAccept() {
  const [flowToken, setFlowToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("flow") || "";
    setFlowToken(token);
    window.history.replaceState(null, "", "/patient-intake/accept");
  }, []);

  async function accept() {
    setWorking(true); setError("");
    try {
      const auth = await fetch("/api/patient-intake/flow/authenticate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowToken, email, password }),
      });
      if (!auth.ok) throw new Error("This invitation is unavailable.");
      const accepted = await fetch("/api/patient-intake/flow/accept", { method: "POST" });
      if (!accepted.ok) throw new Error("This invitation is unavailable.");
      setComplete(true);
    } catch (e: any) {
      setError(e.message || "This invitation is unavailable.");
    } finally { setWorking(false); setFlowToken(""); }
  }

  if (complete) return <main className="mx-auto max-w-md p-6"><h1 className="text-2xl font-semibold">Intake access confirmed</h1><p className="mt-2 text-sm text-muted-foreground">You may now continue with your assigned forms.</p></main>;
  return <main className="mx-auto max-w-md p-6">
    <h1 className="text-2xl font-semibold">Complete your intake</h1>
    <p className="mt-2 text-sm text-muted-foreground">Confirm the email address used for this invitation.</p>
    <Label className="mt-6 block" htmlFor="intake-email">Email address</Label>
    <Input id="intake-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
    <Label className="mt-4 block" htmlFor="intake-password">Synthetic test password</Label>
    <Input id="intake-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    <Button className="mt-5" disabled={!flowToken || !email || !password || working} onClick={accept}>Continue</Button>
  </main>;
}