import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, AlertCircle } from "lucide-react";
import { PatientSearchBar } from "@/components/patient-search-bar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Appointment, AppointmentType, Provider, Patient } from "@shared/schema";

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  defaultStart?: Date | null;
  defaultProviderId?: number | null;
  defaultPatientId?: number | null;
  onSaved?: () => void;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentDialog({
  open, onOpenChange, appointment, defaultStart, defaultProviderId, defaultPatientId, onSaved,
}: AppointmentDialogProps) {
  const { toast } = useToast();
  const isEdit = !!appointment;
  const isReadOnly = appointment?.source === "boulevard";

  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientLabel, setPatientLabel] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  const [appointmentTypeId, setAppointmentTypeId] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [status, setStatus] = useState<string>("scheduled");
  const [notes, setNotes] = useState<string>("");
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ["/api/scheduling/providers"], enabled: open,
  });
  const { data: types = [] } = useQuery<AppointmentType[]>({
    queryKey: ["/api/appointment-types"], enabled: open,
  });
  const { data: patientResp } = useQuery<{ patient: Patient }>({
    queryKey: ["/api/patients", patientId],
    enabled: open && !!patientId,
  });

  // Initialize form
  useEffect(() => {
    if (!open) return;
    setConflictWarning(null);
    if (appointment) {
      setPatientId(appointment.patientId ?? null);
      setPatientLabel(appointment.patientName ?? "");
      setProviderId(appointment.providerId ? String(appointment.providerId) : "");
      setAppointmentTypeId(appointment.appointmentTypeId ? String(appointment.appointmentTypeId) : "");
      setStartsAt(toLocalInputValue(new Date(appointment.appointmentStart)));
      setDurationMinutes(appointment.durationMinutes ?? 30);
      setStatus(appointment.status ?? "scheduled");
      setNotes(appointment.notes ?? "");
    } else {
      setPatientId(defaultPatientId ?? null);
      setPatientLabel("");
      setProviderId(defaultProviderId ? String(defaultProviderId) : "");
      setAppointmentTypeId("");
      setStartsAt(toLocalInputValue(defaultStart ?? new Date()));
      setDurationMinutes(30);
      setStatus("scheduled");
      setNotes("");
    }
  }, [open, appointment, defaultStart, defaultProviderId, defaultPatientId]);

  // When patient is loaded, update label
  useEffect(() => {
    if (patientResp?.patient) {
      setPatientLabel(`${patientResp.patient.firstName} ${patientResp.patient.lastName}`);
    }
  }, [patientResp]);

  // When type changes, default duration
  useEffect(() => {
    if (!appointmentTypeId) return;
    const t = types.find(x => String(x.id) === appointmentTypeId);
    if (t && !appointment) setDurationMinutes(t.durationMinutes);
  }, [appointmentTypeId, types, appointment]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      const body = {
        patientId: patientId || undefined,
        providerId: providerId ? Number(providerId) : undefined,
        appointmentTypeId: appointmentTypeId ? Number(appointmentTypeId) : undefined,
        appointmentStart: start.toISOString(),
        appointmentEnd: end.toISOString(),
        durationMinutes,
        status,
        notes: notes.trim() || undefined,
      };
      if (isEdit) {
        const r = await apiRequest("PATCH", `/api/appointments/${appointment!.id}`, body);
        return r.json();
      } else {
        const r = await apiRequest("POST", "/api/appointments", body);
        return r.json();
      }
    },
    onSuccess: (data: any) => {
      if (data?.conflictWarning) {
        toast({ title: "Saved with warning", description: data.conflictWarning });
      } else {
        toast({ title: isEdit ? "Appointment updated" : "Appointment booked" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/range"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e?.message ?? "Try again." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!appointment) throw new Error("Nothing to delete");
      const r = await apiRequest("DELETE", `/api/appointments/${appointment.id}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Appointment deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/range"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Delete failed", description: e?.message ?? "Try again." });
    },
  });

  const canSave = !!startsAt && !!providerId && !isReadOnly;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-appointment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? "Edit appointment" : "New appointment"}
            {isReadOnly && <Badge variant="outline">Boulevard · Read-only</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Patient</Label>
            {patientId ? (
              <div className="mt-1 flex items-center justify-between border rounded-md px-3 py-2">
                <span className="text-sm font-medium" data-testid="text-selected-patient">{patientLabel || `Patient #${patientId}`}</span>
                {!isReadOnly && (
                  <Button variant="ghost" size="sm" onClick={() => { setPatientId(null); setPatientLabel(""); }} data-testid="button-clear-patient">Change</Button>
                )}
              </div>
            ) : (
              <PatientSearchBarPicker onSelect={(p) => { setPatientId(p.id); setPatientLabel(`${p.firstName} ${p.lastName}`); }} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Provider</Label>
              <Select value={providerId} onValueChange={setProviderId} disabled={isReadOnly}>
                <SelectTrigger data-testid="select-appt-provider"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Appointment type</Label>
              <Select value={appointmentTypeId} onValueChange={setAppointmentTypeId} disabled={isReadOnly}>
                <SelectTrigger data-testid="select-appt-type"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {types.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name} · {t.durationMinutes}m</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Starts</Label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={isReadOnly}
                data-testid="input-appt-start"
              />
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={5} step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                disabled={isReadOnly}
                data-testid="input-appt-duration"
              />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus} disabled={isReadOnly}>
              <SelectTrigger data-testid="select-appt-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="checked_in">Checked in</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No-show</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={isReadOnly} data-testid="input-appt-notes" />
          </div>

          {conflictWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5" />
              <span>{conflictWarning}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          {isEdit && !isReadOnly && (
            <Button
              variant="outline"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="mr-auto text-destructive"
              data-testid="button-delete-appt"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-1">Delete</span>
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-appt">Cancel</Button>
          {!isReadOnly && (
            <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} data-testid="button-save-appt">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {isEdit ? "Save changes" : "Book appointment"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Inline patient picker that wraps PatientSearchBar to deliver a Patient instead of navigating.
function PatientSearchBarPicker({ onSelect }: { onSelect: (p: Patient) => void }) {
  // We render the existing search bar but intercept navigation by listening to
  // global click on dropdown buttons via a ref-less pattern. Simpler: build a tiny inline picker.
  const [q, setQ] = useState("");
  const trimmed = q.trim();
  const { data: results = [], isFetching } = useQuery<Patient[]>({
    queryKey: [`/api/patients/search?q=${encodeURIComponent(trimmed)}`],
    enabled: trimmed.length >= 2,
  });
  return (
    <div className="mt-1 space-y-1">
      <Input
        placeholder="Search patient by name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="input-appt-patient-search"
      />
      {trimmed.length >= 2 && (
        <div className="border rounded-md max-h-40 overflow-y-auto">
          {isFetching && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {!isFetching && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No patients found.</div>
          )}
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(p); setQ(""); }}
              className="w-full text-left px-3 py-2 hover-elevate text-sm"
              data-testid={`button-pick-patient-${p.id}`}
            >
              <div className="font-medium">{p.firstName} {p.lastName}</div>
              {(p.email || p.dateOfBirth) && (
                <div className="text-xs text-muted-foreground">
                  {[p.email, p.dateOfBirth ? new Date(p.dateOfBirth as any).toLocaleDateString() : null].filter(Boolean).join(" · ")}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
