import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Heart, Calculator, Loader2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Patient, PREVENTRiskResult, AdjustedRiskAssessment } from "@shared/schema";

interface PreventCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  defaults?: {
    systolicBP?: number;
    weightLbs?: number;
    heightInches?: number;
    bmi?: number;
  };
}

function calcAge(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function categoryColor(cat: string): string {
  if (cat === "high") return "#dc2626";
  if (cat === "intermediate") return "#ea580c";
  if (cat === "borderline") return "#ca8a04";
  return "#16a34a";
}

export function PreventCalculatorDialog({ open, onOpenChange, patient, defaults }: PreventCalculatorDialogProps) {
  const { toast } = useToast();
  const initialAge = calcAge(patient?.dateOfBirth as any);
  const initialSex = (patient?.gender === "female" || patient?.gender === "male") ? patient.gender : "male";

  const [age, setAge] = useState<string>(initialAge ? String(initialAge) : "");
  const [sex, setSex] = useState<"male" | "female">(initialSex as any);
  const [systolicBP, setSystolicBP] = useState<string>(defaults?.systolicBP ? String(defaults.systolicBP) : "");
  const [totalCholesterol, setTotalCholesterol] = useState("");
  const [hdl, setHdl] = useState("");
  const [ldl, setLdl] = useState("");
  const [egfr, setEgfr] = useState("");
  const [bmi, setBmi] = useState<string>(defaults?.bmi ? String(defaults.bmi) : "");
  const [diabetic, setDiabetic] = useState(false);
  const [smoker, setSmoker] = useState(false);
  const [onBPMeds, setOnBPMeds] = useState(false);
  const [onStatins, setOnStatins] = useState(false);
  const [apoB, setApoB] = useState("");
  const [lpa, setLpa] = useState("");

  const [result, setResult] = useState<PREVENTRiskResult | null>(null);
  const [adjusted, setAdjusted] = useState<AdjustedRiskAssessment | null>(null);

  // Reset when re-opened with a new patient
  useEffect(() => {
    if (open) {
      setAge(initialAge ? String(initialAge) : "");
      setSex(initialSex as any);
      setSystolicBP(defaults?.systolicBP ? String(defaults.systolicBP) : "");
      setBmi(defaults?.bmi ? String(defaults.bmi) : "");
      setResult(null);
      setAdjusted(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient?.id]);

  const calcMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        age: parseInt(age),
        sex,
        systolicBP: parseInt(systolicBP),
        totalCholesterol: parseFloat(totalCholesterol),
        hdl: parseFloat(hdl),
        egfr: parseFloat(egfr),
        bmi: parseFloat(bmi),
        diabetic, smoker, onBPMeds, onStatins,
      };
      if (ldl) payload.ldl = parseFloat(ldl);
      if (apoB) payload.apoB = parseFloat(apoB);
      if (lpa) payload.lpa = parseFloat(lpa);
      const res = await apiRequest("POST", "/api/prevent-quick-calc", payload);
      return res.json() as Promise<{ result: PREVENTRiskResult; adjusted: AdjustedRiskAssessment | null }>;
    },
    onSuccess: (d) => {
      setResult(d.result);
      setAdjusted(d.adjusted);
    },
    onError: (e: any) => toast({ title: "Calculation failed", description: e.message, variant: "destructive" }),
  });

  const canCalc = useMemo(() => age && systolicBP && totalCholesterol && hdl && egfr && bmi, [age, systolicBP, totalCholesterol, hdl, egfr, bmi]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            AHA PREVENT Risk Calculator
            {patient && <span className="text-sm text-muted-foreground font-normal">— {patient.firstName} {patient.lastName}</span>}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
              Validated for ages 30–79. 30-year risk only for ages 30–59. Race-free; uses sex, kidney function, and BMI to predict ASCVD, total CVD, and heart failure.
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Age (years)</Label>
                <Input type="number" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} data-testid="input-prevent-age" />
              </div>
              <div>
                <Label className="text-xs">Sex</Label>
                <Select value={sex} onValueChange={(v: any) => setSex(v)}>
                  <SelectTrigger data-testid="select-prevent-sex"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Systolic BP (mmHg)</Label>
                <Input type="number" inputMode="numeric" value={systolicBP} onChange={e => setSystolicBP(e.target.value)} data-testid="input-prevent-sbp" />
              </div>
              <div>
                <Label className="text-xs">Total Cholesterol (mg/dL)</Label>
                <Input type="number" inputMode="decimal" value={totalCholesterol} onChange={e => setTotalCholesterol(e.target.value)} data-testid="input-prevent-tc" />
              </div>
              <div>
                <Label className="text-xs">HDL (mg/dL)</Label>
                <Input type="number" inputMode="decimal" value={hdl} onChange={e => setHdl(e.target.value)} data-testid="input-prevent-hdl" />
              </div>
              <div>
                <Label className="text-xs">LDL (mg/dL) <span className="text-muted-foreground">opt</span></Label>
                <Input type="number" inputMode="decimal" value={ldl} onChange={e => setLdl(e.target.value)} data-testid="input-prevent-ldl" />
              </div>
              <div>
                <Label className="text-xs">eGFR (mL/min/1.73m²)</Label>
                <Input type="number" inputMode="decimal" value={egfr} onChange={e => setEgfr(e.target.value)} data-testid="input-prevent-egfr" />
              </div>
              <div>
                <Label className="text-xs">BMI (kg/m²)</Label>
                <Input type="number" inputMode="decimal" value={bmi} onChange={e => setBmi(e.target.value)} data-testid="input-prevent-bmi" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between border rounded-md p-2"><span className="text-sm">Diabetes</span>
                <Switch checked={diabetic} onCheckedChange={setDiabetic} data-testid="switch-prevent-diabetic" />
              </label>
              <label className="flex items-center justify-between border rounded-md p-2"><span className="text-sm">Current smoker</span>
                <Switch checked={smoker} onCheckedChange={setSmoker} data-testid="switch-prevent-smoker" />
              </label>
              <label className="flex items-center justify-between border rounded-md p-2"><span className="text-sm">On BP medications</span>
                <Switch checked={onBPMeds} onCheckedChange={setOnBPMeds} data-testid="switch-prevent-bpmeds" />
              </label>
              <label className="flex items-center justify-between border rounded-md p-2"><span className="text-sm">On statin</span>
                <Switch checked={onStatins} onCheckedChange={setOnStatins} data-testid="switch-prevent-statin" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ApoB (mg/dL) <span className="text-muted-foreground">opt — risk enhancer</span></Label>
                <Input type="number" inputMode="decimal" value={apoB} onChange={e => setApoB(e.target.value)} data-testid="input-prevent-apob" />
              </div>
              <div>
                <Label className="text-xs">Lp(a) (mg/dL or nmol/L) <span className="text-muted-foreground">opt</span></Label>
                <Input type="number" inputMode="decimal" value={lpa} onChange={e => setLpa(e.target.value)} data-testid="input-prevent-lpa" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => calcMut.mutate()} disabled={!canCalc || calcMut.isPending} data-testid="button-calculate-prevent">
                {calcMut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Calculate Risk
              </Button>
            </div>

            {result && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4" style={{ color: categoryColor(result.riskCategory) }} />
                  <span className="font-semibold">Risk Category:</span>
                  <Badge style={{ backgroundColor: categoryColor(result.riskCategory), color: "#fff" }}>
                    {result.riskCategory.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Card><CardContent className="p-3 text-center">
                    <div className="text-xs text-muted-foreground">10-yr ASCVD</div>
                    <div className="text-2xl font-mono font-semibold mt-1" data-testid="result-ascvd">{result.tenYearASCVDPercentage}</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <div className="text-xs text-muted-foreground">10-yr Total CVD</div>
                    <div className="text-2xl font-mono font-semibold mt-1" data-testid="result-cvd">{result.tenYearCVDPercentage}</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <div className="text-xs text-muted-foreground">10-yr Heart Failure</div>
                    <div className="text-2xl font-mono font-semibold mt-1" data-testid="result-hf">{result.tenYearHFPercentage}</div>
                  </CardContent></Card>
                </div>

                {result.ageValidFor30Year && result.thirtyYearASCVDPercentage && (
                  <div className="grid grid-cols-3 gap-2">
                    <Card><CardContent className="p-3 text-center">
                      <div className="text-xs text-muted-foreground">30-yr ASCVD</div>
                      <div className="text-xl font-mono font-semibold mt-1">{result.thirtyYearASCVDPercentage}</div>
                    </CardContent></Card>
                    <Card><CardContent className="p-3 text-center">
                      <div className="text-xs text-muted-foreground">30-yr Total CVD</div>
                      <div className="text-xl font-mono font-semibold mt-1">{result.thirtyYearCVDPercentage}</div>
                    </CardContent></Card>
                    <Card><CardContent className="p-3 text-center">
                      <div className="text-xs text-muted-foreground">30-yr Heart Failure</div>
                      <div className="text-xl font-mono font-semibold mt-1">{result.thirtyYearHFPercentage}</div>
                    </CardContent></Card>
                  </div>
                )}

                {result.statinRecommendation && (
                  <div className="border rounded-md p-3 bg-muted/30">
                    <div className="text-xs font-semibold flex items-center gap-1 mb-1"><AlertCircle className="w-3 h-3" /> Statin Recommendation</div>
                    <div className="text-sm">{result.statinRecommendation}</div>
                  </div>
                )}
                {result.ldlGoal && (
                  <div className="text-sm"><span className="font-semibold">LDL Goal: </span>{result.ldlGoal}</div>
                )}
                {result.recommendations && (
                  <div className="border rounded-md p-3">
                    <div className="text-xs font-semibold mb-1">Clinical Notes</div>
                    <div className="text-sm whitespace-pre-line">{result.recommendations}</div>
                  </div>
                )}

                {adjusted && (
                  <div className="border rounded-md p-3" style={{ borderColor: "#c4b9a5", backgroundColor: "#faf6ed" }}>
                    <div className="text-xs font-semibold mb-1">Adjusted Risk (ApoB / Lp(a))</div>
                    <div className="text-sm">
                      Base ASCVD: {adjusted.baseASCVDRisk.toFixed(1)}% — Reclassification:{" "}
                      <Badge style={{ backgroundColor: categoryColor(adjusted.adjustedCategory === "reclassified_upward" ? "high" : adjusted.adjustedCategory), color: "#fff" }}>
                        {adjusted.adjustedCategory.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>
                    {adjusted.clinicalGuidance && <div className="text-sm mt-2">{adjusted.clinicalGuidance}</div>}
                    {adjusted.statinGuidance && <div className="text-sm mt-1"><span className="font-semibold">Statin: </span>{adjusted.statinGuidance}</div>}
                    {adjusted.cacRecommendation && <div className="text-sm mt-1"><span className="font-semibold">CAC: </span>{adjusted.cacRecommendation}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
