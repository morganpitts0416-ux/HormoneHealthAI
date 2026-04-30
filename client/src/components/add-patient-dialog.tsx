import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Patient } from "@shared/schema";

interface AddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (patient: Patient) => void;
}

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "female" as "male" | "female",
  email: "",
  phone: "",
};

export function AddPatientDialog({ open, onOpenChange, onCreated }: AddPatientDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) setForm(EMPTY_FORM);
  }, [open]);

  const { data: clinicProviders = [] } = useQuery<any[]>({
    queryKey: ['/api/clinic/providers'],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const body: Record<string, string | null> = {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        gender: data.gender,
      };
      if (data.dateOfBirth) body.dateOfBirth = new Date(data.dateOfBirth).toISOString();
      if (data.email.trim()) body.email = data.email.trim().toLowerCase();
      if (data.phone.trim()) body.phone = data.phone.trim();
      const ownerProvider = (clinicProviders as any[]).find((p: any) => p.isOwner);
      if (ownerProvider) body.primaryProvider = ownerProvider.displayName;
      const res = await apiRequest("POST", "/api/patients", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create patient");
      }
      return res.json() as Promise<Patient>;
    },
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients/search', ''] });
      queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
      onOpenChange(false);
      toast({
        title: "Patient Created",
        description: `${newPatient.firstName} ${newPatient.lastName}'s profile is ready.`,
      });
      onCreated?.(newPatient);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Failed to create patient.",
      });
    },
  });

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Patient Profile
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Jane"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                data-testid="input-add-patient-first-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Smith"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                data-testid="input-add-patient-last-name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                data-testid="input-add-patient-dob"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sex</Label>
              <Select
                value={form.gender}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, gender: v as "male" | "female" }))
                }
              >
                <SelectTrigger data-testid="select-add-patient-gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              Email{" "}
              <span className="text-xs text-muted-foreground">
                (optional — used for form &amp; appointment matching)
              </span>
            </Label>
            <Input
              type="email"
              placeholder="jane@email.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              data-testid="input-add-patient-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Phone <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="tel"
              placeholder="(555) 000-0000"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              data-testid="input-add-patient-phone"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            data-testid="button-add-patient-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => createMutation.mutate(form)}
            data-testid="button-add-patient-submit"
            style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
          >
            {createMutation.isPending ? "Creating..." : "Create Patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
