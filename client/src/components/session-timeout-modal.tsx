import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Clock } from "lucide-react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 25 * 60 * 1000;       // warn at 25 minutes
const TICK_INTERVAL_MS = 1000;

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

export function SessionTimeoutModal() {
  const [, setLocation] = useLocation();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5 * 60);
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) setShowWarning(false);
  }, [showWarning]);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (_) {}
    queryClient.clear();
    setShowWarning(false);
    setLocation("/login");
  }, [setLocation]);

  const stayLoggedIn = useCallback(async () => {
    try {
      // Touch the session to keep it alive server-side
      await fetch("/api/auth/me", { credentials: "include" });
    } catch (_) {}
    resetActivity();
  }, [resetActivity]);

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetActivity));
  }, [resetActivity]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_TIMEOUT_MS) {
        clearInterval(timerRef.current!);
        logout();
      } else if (idle >= WARNING_MS) {
        const remaining = Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000);
        setSecondsLeft(remaining);
        setShowWarning(true);
      }
    }, TICK_INTERVAL_MS);
    return () => clearInterval(timerRef.current!);
  }, [logout]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="modal-session-timeout"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Session Expiring Soon
          </DialogTitle>
          <DialogDescription className="pt-1">
            Your session will expire in{" "}
            <span className="font-semibold text-foreground">
              {minutes}:{String(seconds).padStart(2, "0")}
            </span>{" "}
            due to inactivity. For security, you will be logged out automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1"
            onClick={stayLoggedIn}
            data-testid="button-stay-logged-in"
          >
            Stay Logged In
          </Button>
          <Button
            variant="outline"
            onClick={logout}
            data-testid="button-logout-now"
          >
            Log Out Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
