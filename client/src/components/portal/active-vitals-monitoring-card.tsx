import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Activity, AlertTriangle, CheckCircle2, Clock, Heart, Loader2, Scale } from "lucide-react";

type Episode = {
  id: number;
  patientId: number;
  vitalTypes: string[];
  startDate: string;
  endDate: string;
  frequencyPerDay: number;
  instructions: string | null;
  status: "active" | "completed" | "ended_early";
};

type RecentVital = {
  id: number;
  recordedAt: string;
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  weightLbs: number | null;
  symptoms?: string[] | null;
};

type ActiveResponse = {
  episode: Episode | null;
  todayCount?: number;
  todayRequired?: number;
  recent?: RecentVital[];
};

const SYMPTOMS: Array<{ value: string; label: string }> = [
  { value: "headache", label: "Headache" },
  { value: "chest_pain", label: "Chest pain" },
  { value: "shortness_of_breath", label: "Shortness of breath" },
  { value: "dizziness", label: "Dizziness" },
  { value: "vision_changes", label: "Vision changes" },
  { value: "weakness", label: "Weakness" },
  { value: "confusion", label: "Confusion" },
  { value: "none", label: "None of these" },
];

const SEVERE_WARNING =
  "This reading is very high. Please recheck after sitting quietly for 5 minutes. " +
  "If it remains this high or you have chest pain, shortness of breath, severe headache, " +
  "weakness, confusion, or vision changes, seek urgent/emergency care.";

function isSevere(sbp: number, dbp: number): boolean {
  return sbp >= 180 || dbp >= 120;
}

function formatVitalTypes(types: string[]): string {
  const names: Record<string, string> = {
    blood_pressure: "Blood Pressure",
    heart_rate: "Heart Rate",
    weight: "Weight",
  };
  return types.map((t) => names[t] || t).join(" + ");
}

interface ActiveVitalsMonitoringCardProps {
  /** Optional controlled open state for the log-reading dialog. */
  controlledOpen?: boolean;
  /** Optional handler for controlled open changes. */
  onControlledOpenChange?: (open: boolean) => void;
}

export function ActiveVitalsMonitoringCard(props: ActiveVitalsMonitoringCardProps = {}) {
  const { data, isLoading } = useQuery<ActiveResponse>({
    queryKey: ["/api/portal/vitals-monitoring/active"],
  });

  if (isLoading) return null;
  if (!data?.episode) return null;

  return <ActiveCard data={data} {...props} />;
}

function ActiveCard({ data, controlledOpen, onControlledOpenChange }: { data: ActiveResponse } & ActiveVitalsMonitoringCardProps) {
  const ep = data.episode!;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onControlledOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [systolic, setSystolic] = useState<string>("");
  const [diastolic, setDiastolic] = useState<string>("");
  const [heartRate, setHeartRate] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [timeOfDay, setTimeOfDay] = useState<string>(() =>
    new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })
  );
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [showSevereWarning, setShowSevereWarning] = useState(false);

  const includesBp = ep.vitalTypes.includes("blood_pressure");
  const includesHr = ep.vitalTypes.includes("heart_rate");
  const includesWt = ep.vitalTypes.includes("weight");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body: any = { timeOfDay, notes: notes.trim() || undefined };
      if (includesBp) {
        body.systolicBp = systolic ? Number(systolic) : null;
        body.diastolicBp = diastolic ? Number(diastolic) : null;
        body.symptoms = symptoms;
      }
      if (includesHr && heartRate) body.heartRate = Number(heartRate);
      if (includesWt && weight) body.weightLbs = Number(weight);
      return apiRequest("POST", `/api/portal/vitals-monitoring/${ep.id}/log`, body);
    },
    onSuccess: async (res: any) => {
      // Re-read body if it's a Response (apiRequest returns Response)
      let payload: any = res;
      try {
        if (res?.json) payload = await res.json();
      } catch { /* ignore */ }

      qc.invalidateQueries({ queryKey: ["/api/portal/vitals-monitoring/active"] });

      const sbp = Number(systolic);
      const dbp = Number(diastolic);
      if (includesBp && Number.isFinite(sbp) && Number.isFinite(dbp) && isSevere(sbp, dbp)) {
        // Show severe warning modal — keeps form open so they can log a recheck.
        setShowSevereWarning(true);
        toast({ title: "Reading saved", description: "We've notified your care team." });
      } else {
        toast({ title: "Reading saved", description: "Thanks for keeping us updated." });
        setOpen(false);
      }
      // Reset form fields (but keep modal open if severe)
      setSystolic(""); setDiastolic(""); setHeartRate(""); setWeight("");
      setSymptoms([]); setNotes("");
    },
    onError: async (err: any) => {
      // Surface the server's actual message (e.g. "Weight is required.") so the
      // patient knows what to fix instead of a vague generic error.
      let description = "Please check your entries and try again.";
      try {
        const msg = typeof err?.message === "string" ? err.message : "";
        // apiRequest throws errors of the form "<status>: <body>" — pull the body.
        const colonIdx = msg.indexOf(":");
        const tail = colonIdx > -1 ? msg.slice(colonIdx + 1).trim() : msg.trim();
        if (tail.startsWith("{")) {
          const parsed = JSON.parse(tail);
          if (parsed?.message) description = String(parsed.message);
        } else if (tail) {
          description = tail;
        }
      } catch { /* fall through to default */ }
      toast({ title: "Couldn't save reading", description, variant: "destructive" });
    },
  });

  const todayCount = data.todayCount ?? 0;
  const todayRequired = data.todayRequired ?? ep.frequencyPerDay;
  const isComplete = todayCount >= todayRequired;
  const remainingLabel = useMemo(() => {
    if (isComplete) return "All set for today";
    if (todayRequired === 1) return "1 reading needed today";
    return `${todayCount} of ${todayRequired} logged today`;
  }, [todayCount, todayRequired, isComplete]);

  function toggleSymptom(value: string) {
    setSymptoms((prev) => {
      // "None of these" is exclusive
      if (value === "none") return prev.includes("none") ? [] : ["none"];
      const next = prev.filter((s) => s !== "none");
      return next.includes(value) ? next.filter((s) => s !== value) : [...next, value];
    });
  }

  function canSubmit(): boolean {
    // Every vital type requested by the provider must have a valid number entered.
    if (includesBp) {
      const sbp = Number(systolic);
      const dbp = Number(diastolic);
      if (!systolic || !diastolic || !Number.isFinite(sbp) || !Number.isFinite(dbp)) return false;
      if (sbp <= 0 || dbp <= 0) return false;
    }
    if (includesHr) {
      const hr = Number(heartRate);
      if (!heartRate || !Number.isFinite(hr) || hr <= 0) return false;
    }
    if (includesWt) {
      const wt = Number(weight);
      if (!weight || !Number.isFinite(wt) || wt <= 0) return false;
    }
    return true;
  }

  return (
    <>
      <div
        className="rounded-xl px-4 py-4"
        data-testid="card-vitals-monitoring"
        style={{ backgroundColor: "#fdf6e8", border: "1px solid #f0d8a4" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#8b5a10" }}
          >
            {includesBp ? <Heart className="w-4 h-4" style={{ color: "#fdf6e8" }} />
              : includesWt ? <Scale className="w-4 h-4" style={{ color: "#fdf6e8" }} />
              : <Activity className="w-4 h-4" style={{ color: "#fdf6e8" }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#8b5a10" }}>
              Vitals Check-in from Your Provider
            </p>
            <p className="text-base font-semibold leading-tight" style={{ color: "#1c2414" }}>
              {formatVitalTypes(ep.vitalTypes)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#7a5510" }}>
              {ep.frequencyPerDay}× daily · through {new Date(ep.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
            {ep.instructions && (
              <p className="text-xs mt-2 leading-relaxed" style={{ color: "#5a4010" }}>
                {ep.instructions}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs flex items-center gap-1.5" style={{ color: "#7a5510" }}>
                {isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {remainingLabel}
              </span>
              <Button
                size="sm"
                onClick={() => setOpen(true)}
                style={{ backgroundColor: "#8b5a10", color: "#fdf6e8" }}
                data-testid="button-log-vitals"
              >
                Log a reading
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!submitMutation.isPending) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log {formatVitalTypes(ep.vitalTypes)}</DialogTitle>
            <DialogDescription>
              {ep.instructions || "Take your reading and enter the values below."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {includesBp && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="vit-sbp" className="text-sm">Systolic (top)</Label>
                  <Input
                    id="vit-sbp" type="number" inputMode="numeric"
                    placeholder="e.g. 122"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    data-testid="input-systolic"
                  />
                </div>
                <div>
                  <Label htmlFor="vit-dbp" className="text-sm">Diastolic (bottom)</Label>
                  <Input
                    id="vit-dbp" type="number" inputMode="numeric"
                    placeholder="e.g. 78"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    data-testid="input-diastolic"
                  />
                </div>
              </div>
            )}

            {includesHr && (
              <div>
                <Label htmlFor="vit-hr" className="text-sm">Heart rate (bpm)</Label>
                <Input
                  id="vit-hr" type="number" inputMode="numeric"
                  placeholder="e.g. 72"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  data-testid="input-heart-rate"
                />
              </div>
            )}

            {includesWt && (
              <div>
                <Label htmlFor="vit-wt" className="text-sm">Weight (lbs)</Label>
                <Input
                  id="vit-wt" type="number" step="0.1" inputMode="decimal"
                  placeholder="e.g. 168.4"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  data-testid="input-weight-vitals"
                />
              </div>
            )}

            <div>
              <Label htmlFor="vit-time" className="text-sm">Time of reading</Label>
              <Input
                id="vit-time" type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                data-testid="input-time-of-day"
              />
            </div>

            {includesBp && (
              <div className="space-y-2">
                <Label className="text-sm">Any symptoms right now?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SYMPTOMS.map((s) => (
                    <label
                      key={s.value}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      data-testid={`label-symptom-${s.value}`}
                    >
                      <Checkbox
                        checked={symptoms.includes(s.value)}
                        onCheckedChange={() => toggleSymptom(s.value)}
                        data-testid={`checkbox-symptom-${s.value}`}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="vit-notes" className="text-sm">Notes (optional)</Label>
              <Textarea
                id="vit-notes" rows={2}
                placeholder="Anything your provider should know?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-vitals-notes"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-row gap-2 sm:gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitMutation.isPending}
              data-testid="button-cancel-log"
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!canSubmit() || submitMutation.isPending}
              data-testid="button-submit-log"
            >
              {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save reading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSevereWarning} onOpenChange={setShowSevereWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Important: very high reading
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm leading-relaxed">{SEVERE_WARNING}</p>
            <p className="text-xs mt-3 text-muted-foreground">
              Your care team has been notified about this reading. This message is informational
              only and not a diagnosis or medication advice.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => { setShowSevereWarning(false); setOpen(false); }}
              data-testid="button-acknowledge-severe"
            >
              I understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
