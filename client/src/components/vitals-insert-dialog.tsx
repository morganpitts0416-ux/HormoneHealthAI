import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";
import { buildVitalSignsText, type VitalsData } from "@shared/note-builtin-blocks";

interface VitalsInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number | null;
  onInsert: (formattedText: string, vitalsData: VitalsData | null) => void;
}

function calcBmi(h?: number | null, w?: number | null): number | null {
  if (!h || !w || h <= 0) return null;
  return Math.round(((w / (h * h)) * 703) * 10) / 10;
}

export function VitalsInsertDialog({
  open,
  onOpenChange,
  patientId,
  onInsert,
}: VitalsInsertDialogProps) {
  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightLbs, setWeightLbs] = useState("");

  const bmi = calcBmi(
    heightInches ? parseFloat(heightInches) : null,
    weightLbs ? parseFloat(weightLbs) : null,
  );

  const { data: latestHeightData, isLoading: heightLoading } = useQuery<{ heightInches: number | null }>({
    queryKey: ["/api/patients", patientId, "vitals", "latest-height"],
    queryFn: async () => {
      if (!patientId) return { heightInches: null };
      const res = await fetch(`/api/patients/${patientId}/vitals/latest-height`);
      if (!res.ok) return { heightInches: null };
      return res.json();
    },
    enabled: open && !!patientId,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!open) return;
    setSystolicBp("");
    setDiastolicBp("");
    setHeartRate("");
    setTemperature("");
    setWeightLbs("");
  }, [open]);

  useEffect(() => {
    if (latestHeightData?.heightInches != null && open && !heightInches) {
      setHeightInches(String(latestHeightData.heightInches));
    }
  }, [latestHeightData?.heightInches, open]);

  const hasAnyValue = systolicBp || diastolicBp || heartRate || temperature || heightInches || weightLbs;

  function buildVitalsData(): VitalsData {
    const n = (s: string) => s === "" ? null : parseFloat(s);
    return {
      systolicBp: n(systolicBp) ? Math.round(n(systolicBp)!) : null,
      diastolicBp: n(diastolicBp) ? Math.round(n(diastolicBp)!) : null,
      heartRate: n(heartRate) ? Math.round(n(heartRate)!) : null,
      temperature: n(temperature),
      heightInches: n(heightInches),
      weightLbs: n(weightLbs),
      bmi,
    };
  }

  function handleInsertAndSave() {
    const vd = buildVitalsData();
    const text = hasAnyValue ? buildVitalSignsText(vd) : "Vital Signs:";
    onInsert(text + "\n", hasAnyValue ? vd : null);
    onOpenChange(false);
  }

  function handleInsertHeaderOnly() {
    onInsert("Vital Signs:\n", null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="vitals-insert-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Enter Vital Signs
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-medium">
                Blood Pressure <span className="text-muted-foreground font-normal">(mmHg)</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  step="1"
                  value={systolicBp}
                  onChange={e => setSystolicBp(e.target.value)}
                  placeholder="Systolic"
                  className="text-sm"
                  data-testid="input-vitals-insert-systolicBp"
                  autoFocus
                />
                <span className="text-muted-foreground font-medium shrink-0">/</span>
                <Input
                  type="number"
                  step="1"
                  value={diastolicBp}
                  onChange={e => setDiastolicBp(e.target.value)}
                  placeholder="Diastolic"
                  className="text-sm"
                  data-testid="input-vitals-insert-diastolicBp"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                Heart Rate <span className="text-muted-foreground font-normal">(bpm)</span>
              </Label>
              <Input
                type="number"
                step="1"
                value={heartRate}
                onChange={e => setHeartRate(e.target.value)}
                placeholder="e.g. 72"
                className="text-sm"
                data-testid="input-vitals-insert-heartRate"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                Temperature <span className="text-muted-foreground font-normal">(°F)</span>
              </Label>
              <Input
                type="number"
                step="0.1"
                value={temperature}
                onChange={e => setTemperature(e.target.value)}
                placeholder="e.g. 98.6"
                className="text-sm"
                data-testid="input-vitals-insert-temperature"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                Height <span className="text-muted-foreground font-normal">(inches)</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  value={heightInches}
                  onChange={e => setHeightInches(e.target.value)}
                  placeholder="e.g. 66"
                  className="text-sm"
                  data-testid="input-vitals-insert-heightInches"
                />
                {heightLoading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                Weight <span className="text-muted-foreground font-normal">(lbs)</span>
              </Label>
              <Input
                type="number"
                step="0.1"
                value={weightLbs}
                onChange={e => setWeightLbs(e.target.value)}
                placeholder="e.g. 165"
                className="text-sm"
                data-testid="input-vitals-insert-weightLbs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                BMI <span className="text-muted-foreground font-normal">(auto)</span>
              </Label>
              <Input
                type="text"
                value={bmi != null ? String(bmi) : ""}
                readOnly
                placeholder="Auto-calculated"
                className="text-sm bg-muted/50 cursor-not-allowed"
                data-testid="input-vitals-insert-bmi"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Height pre-fills from this patient's most recent visit record.
            Values are inserted into the note and saved to the patient's vitals trends.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleInsertHeaderOnly}
            className="sm:mr-auto"
            data-testid="btn-vitals-insert-header-only"
          >
            Insert header only
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="btn-vitals-insert-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleInsertAndSave}
            data-testid="btn-vitals-insert-save"
          >
            Insert &amp; Save to Trends
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
