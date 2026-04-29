import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function ConfigureVitalsMonitoringDialog({
  open,
  onOpenChange,
  patientId,
  hasActive,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: number;
  hasActive: boolean;
}) {
  const { toast } = useToast();
  const [vitalTypes, setVitalTypes] = useState<string[]>(["blood_pressure"]);
  const [duration, setDuration] = useState<string>("7");
  const [frequency, setFrequency] = useState<string>("1");
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [instructions, setInstructions] = useState<string>(
    "Take your reading each morning before medication, after sitting quietly for 5 minutes."
  );

  const startMutation = useMutation({
    mutationFn: () => {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + Math.max(1, Number(duration)) - 1);
      const endStr = end.toISOString().slice(0, 10);
      return apiRequest("POST", `/api/patients/${patientId}/vitals-monitoring`, {
        vitalTypes,
        startDate,
        endDate: endStr,
        frequencyPerDay: Number(frequency),
        instructions: instructions.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "vitals-monitoring"] });
      toast({ title: "Monitoring started", description: "The patient will see the request on their portal." });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to start monitoring", variant: "destructive" }),
  });

  function toggleType(t: string) {
    setVitalTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const canSubmit =
    vitalTypes.length > 0 &&
    Number(duration) >= 1 &&
    Number(duration) <= 60 &&
    [1, 2, 3].includes(Number(frequency));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure At-Home Vitals Monitoring</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {hasActive && (
            <div
              className="rounded-md border p-3 text-xs"
              style={{ borderColor: "#f0d8a4", backgroundColor: "#fdf6e8", color: "#8b5a10" }}
            >
              This patient already has an active monitoring episode. Starting a new one will run alongside it.
            </div>
          )}

          <div>
            <Label className="text-sm">Vital types</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {(["blood_pressure", "heart_rate", "weight"] as const).map((t) => {
                const selected = vitalTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className="px-3 py-2 rounded-md border text-xs font-medium hover-elevate active-elevate-2"
                    style={{
                      borderColor: selected ? "#8b5a10" : "#d4c9b5",
                      backgroundColor: selected ? "#fdf6e8" : "#ffffff",
                      color: selected ? "#8b5a10" : "#1c2414",
                    }}
                    data-testid={`button-vital-type-${t}`}
                  >
                    {t === "blood_pressure" ? "Blood Pressure" : t === "heart_rate" ? "Heart Rate" : "Weight"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dur" className="text-sm">Duration (days)</Label>
              <Input
                id="dur"
                type="number"
                min={1}
                max={60}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                data-testid="input-duration"
              />
            </div>
            <div>
              <Label htmlFor="freq" className="text-sm">Times per day</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="freq" data-testid="select-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1× daily</SelectItem>
                  <SelectItem value="2">2× daily</SelectItem>
                  <SelectItem value="3">3× daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="start" className="text-sm">Start date</Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="input-start-date"
            />
          </div>

          <div>
            <Label htmlFor="instr" className="text-sm">Instructions to patient (optional)</Label>
            <Textarea
              id="instr"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              data-testid="input-instructions"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={startMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => startMutation.mutate()}
            disabled={!canSubmit || startMutation.isPending}
            style={{ backgroundColor: "#8b5a10", color: "#ffffff" }}
            data-testid="button-start-monitoring"
          >
            {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start monitoring"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
