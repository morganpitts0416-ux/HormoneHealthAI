import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

let initialInviteToken = "";
if (typeof window !== "undefined" && window.location.pathname === "/patient-intake/accept") {
  initialInviteToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
  // This module is imported before React mounts, so bearer material is removed
  // before the first component render or any component-level instrumentation.
  window.history.replaceState(null, "", "/patient-intake/accept");
}

function consumeInitialInviteToken() {
  const token = initialInviteToken;
  initialInviteToken = "";
  return token;
}

// This standalone, development-only page is intentionally not part of portal
// navigation. The exchange endpoint places the short-lived flow token in a
// fragment, which is removed before any UI is rendered or analytics can see it.
export default function PatientIntakeAccept() {
  const flowTokenRef = useRef("");
  const [flowReady, setFlowReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const token = consumeInitialInviteToken();
    if (!token) return;
    fetch("/api/patient-intake/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("This invitation is unavailable.");
      const payload = await response.json();
      if (typeof payload.flowToken !== "string") throw new Error("This invitation is unavailable.");
      flowTokenRef.current = payload.flowToken;
      setFlowReady(true);
    }).catch((e: any) => setError(e.message || "This invitation is unavailable."));
  }, []);

  async function accept() {
    setWorking(true); setError("");
    try {
      const flowToken = flowTokenRef.current;
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
    } finally { setWorking(false); flowTokenRef.current = ""; }
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
     <Button className="mt-5" disabled={!flowReady || !email || !password || working} onClick={accept}>Continue</Button>
  </main>;
}