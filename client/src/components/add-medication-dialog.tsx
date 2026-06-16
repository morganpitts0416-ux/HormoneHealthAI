import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type PatientMedication = {
  id: number;
  patientId: number;
  clinicId: number;
  drugName: string;
  genericName: string | null;
  strength: string | null;
  strengthUnit: string | null;
  form: string | null;
  route: string | null;
  sig: string | null;
  quantity: string | null;
  daysSupply: number | null;
  refills: number | null;
  prescribingProvider: string | null;
  startDate: string | null;
  indication: string | null;
  status: string;
  discontinuedAt: string | null;
  discontinuedReason: string | null;
  source: string;
  reviewedByProvider: boolean;
  createdAt: string;
};

export function formatMedSig(med: PatientMedication): string {
  const parts: string[] = [med.drugName];
  if (med.strength && med.strengthUnit) parts.push(`${med.strength} ${med.strengthUnit}`);
  else if (med.strength) parts.push(med.strength);
  if (med.form) parts.push(med.form);
  if (med.sig) parts.push(`— ${med.sig}`);
  return parts.join(" ");
}

const STRENGTH_UNITS = ["MCG", "MG", "MG/ML", "MEQ", "Units", "IU", "G", "%"];
const FORMS = ["Tab", "Cap", "Liquid", "Patch", "Injection", "Cream", "Gel", "Ointment", "Spray", "Drops", "Powder", "Suppository", "Other"];
const ROUTES = ["Oral", "Sublingual", "Topical", "Transdermal", "Subcutaneous", "Intramuscular", "Intravenous", "Intranasal", "Ophthalmic", "Otic", "Rectal", "Vaginal", "Other"];

const EMPTY_FORM = {
  drugName: "",
  genericName: "",
  strength: "",
  strengthUnit: "MG",
  form: "Tab",
  route: "Oral",
  sig: "",
  quantity: "",
  daysSupply: "",
  refills: "",
  prescribingProvider: "",
  startDate: "",
  indication: "",
};

interface AddMedicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  editing?: PatientMedication | null;
  onSaved: () => void;
}

export function AddMedicationDialog({ open, onOpenChange, patientId, editing, onSaved }: AddMedicationDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<typeof EMPTY_FORM>(() =>
    editing
      ? {
          drugName: editing.drugName,
          genericName: editing.genericName ?? "",
          strength: editing.strength ?? "",
          strengthUnit: editing.strengthUnit ?? "MG",
          form: editing.form ?? "Tab",
          route: editing.route ?? "Oral",
          sig: editing.sig ?? "",
          quantity: editing.quantity ?? "",
          daysSupply: editing.daysSupply != null ? String(editing.daysSupply) : "",
          refills: editing.refills != null ? String(editing.refills) : "",
          prescribingProvider: editing.prescribingProvider ?? "",
          startDate: editing.startDate ? editing.startDate.slice(0, 10) : "",
          indication: editing.indication ?? "",
        }
      : EMPTY_FORM
  );

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        drugName: form.drugName.trim(),
        genericName: form.genericName.trim() || null,
        strength: form.strength.trim() || null,
        strengthUnit: form.strengthUnit || null,
        form: form.form || null,
        route: form.route || null,
        sig: form.sig.trim() || null,
        quantity: form.quantity.trim() || null,
        daysSupply: form.daysSupply ? parseInt(form.daysSupply) : null,
        refills: form.refills !== "" ? parseInt(form.refills) : null,
        prescribingProvider: form.prescribingProvider.trim() || null,
        startDate: form.startDate || null,
        indication: form.indication.trim() || null,
      };
      if (editing) {
        const res = await apiRequest("PATCH", `/api/patients/${patientId}/medications/${editing.id}`, body);
        if (!res.ok) throw new Error("Failed to update medication");
      } else {
        const res = await apiRequest("POST", `/api/patients/${patientId}/medications`, body);
        if (!res.ok) throw new Error("Failed to add medication");
      }
    },
    onSuccess: () => {
      toast({ title: editing ? "Medication updated" : "Medication added" });
      onSaved();
      onOpenChange(false);
      setForm(EMPTY_FORM);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to save medication" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(editing ? form : EMPTY_FORM); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Medication" : "Add Medication"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1 overflow-y-auto max-h-[calc(100vh-14rem)]">
          <div className="space-y-1.5">
            <Label>Drug Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Synthroid"
              value={form.drugName}
              onChange={e => set("drugName", e.target.value)}
              data-testid="input-med-drug-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Generic Name</Label>
            <Input
              placeholder="e.g. Levothyroxine"
              value={form.genericName}
              onChange={e => set("genericName", e.target.value)}
              data-testid="input-med-generic-name"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-1">
              <Label>Strength</Label>
              <Input
                placeholder="200"
                value={form.strength}
                onChange={e => set("strength", e.target.value)}
                data-testid="input-med-strength"
              />
            </div>
            <div className="space-y-1.5 col-span-1">
              <Label>Unit</Label>
              <Select value={form.strengthUnit} onValueChange={v => set("strengthUnit", v)}>
                <SelectTrigger data-testid="select-med-strength-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRENGTH_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-1">
              <Label>Form</Label>
              <Select value={form.form} onValueChange={v => set("form", v)}>
                <SelectTrigger data-testid="select-med-form"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Route</Label>
            <Select value={form.route} onValueChange={v => set("route", v)}>
              <SelectTrigger data-testid="select-med-route"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUTES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sig / Directions</Label>
            <Textarea
              placeholder="e.g. Take 1 tablet by oral route every day"
              value={form.sig}
              onChange={e => set("sig", e.target.value)}
              className="text-sm"
              rows={2}
              data-testid="textarea-med-sig"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input
                placeholder="30"
                value={form.quantity}
                onChange={e => set("quantity", e.target.value)}
                data-testid="input-med-quantity"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Days Supply</Label>
              <Input
                type="number"
                placeholder="30"
                value={form.daysSupply}
                onChange={e => set("daysSupply", e.target.value)}
                data-testid="input-med-days-supply"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Refills</Label>
              <Input
                type="number"
                placeholder="3"
                value={form.refills}
                onChange={e => set("refills", e.target.value)}
                data-testid="input-med-refills"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={e => set("startDate", e.target.value)}
                data-testid="input-med-start-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prescribing Provider</Label>
              <Input
                placeholder="Provider name"
                value={form.prescribingProvider}
                onChange={e => set("prescribingProvider", e.target.value)}
                data-testid="input-med-prescribing-provider"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Indication / Diagnosis</Label>
            <Input
              placeholder="e.g. Hypothyroidism"
              value={form.indication}
              onChange={e => set("indication", e.target.value)}
              data-testid="input-med-indication"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!form.drugName.trim() || saveMutation.isPending}
            data-testid="button-save-medication"
          >
            {saveMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : editing ? "Save Changes" : "Add Medication"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
