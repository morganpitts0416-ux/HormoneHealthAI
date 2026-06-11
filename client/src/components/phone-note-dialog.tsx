import { useState, useEffect } from "react";
import { localDateTimeStr } from "@/lib/date-utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Save, Loader2 } from "lucide-react";

interface PhoneNoteDialogProps {
  patientId: number;
  onClose: () => void;
  /** When set, re-opens this existing encounter for editing instead of creating a new one. */
  initialEncounterId?: number;
}

const CONTACT_OPTIONS = ["Patient", "Family member", "Pharmacy", "Insurance", "Other provider", "Other"];

export function PhoneNoteDialog({ patientId, onClose, initialEncounterId }: PhoneNoteDialogProps) {
  const { toast } = useToast();
  const [visitDate, setVisitDate] = useState(localDateTimeStr());
  const [contactedWith, setContactedWith] = useState("Patient");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("incoming");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(!!initialEncounterId);

  // Load existing encounter data when re-opening for editing.
  useEffect(() => {
    if (!initialEncounterId) return;
    (async () => {
      try {
        const res = await fetch(`/api/encounters/${initialEncounterId}`);
        if (!res.ok) return;
        const enc = await res.json();
        if (enc.visitDate) setVisitDate(new Date(enc.visitDate).toISOString().slice(0, 16));
        const pc = enc.phoneContact ?? {};
        if (pc.contactedWith) setContactedWith(pc.contactedWith);
        if (pc.direction) setDirection(pc.direction);
        if (enc.chiefComplaint) setChiefComplaint(enc.chiefComplaint);
        if (enc.clinicianNotes) setContent(enc.clinicianNotes);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEncounterId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const cc = chiefComplaint || `Phone call (${direction === "incoming" ? "incoming" : "outgoing"} - ${contactedWith.toLowerCase()})`;
      const header = [
        `NON-VISIT CONTACT NOTE`,
        ``,
        `Contact type: ${direction === "incoming" ? "Incoming" : "Outgoing"} call`,
        `Spoke with: ${contactedWith}`,
        `Reason: ${cc}`,
        ``,
        `NOTES`,
        ``,
        content.trim(),
      ].join("\n");
      const body = {
        patientId,
        visitDate: new Date(visitDate).toISOString(),
        visitType: "phone-call",
        noteType: "phone",
        chiefComplaint: cc,
        clinicianNotes: content,
        phoneContact: { contactedWith, direction },
        soapNote: { fullNote: header },
      };
      if (initialEncounterId) {
        await apiRequest("PUT", `/api/encounters/${initialEncounterId}`, {
          visitDate: body.visitDate,
          visitType: body.visitType,
          chiefComplaint: body.chiefComplaint,
          clinicianNotes: body.clinicianNotes,
          phoneContact: body.phoneContact,
        });
        return apiRequest("PUT", `/api/encounters/${initialEncounterId}/soap`, {
          soapNote: body.soapNote,
        });
      }
      return apiRequest("POST", "/api/encounters", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "encounters"] });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/encounters`] });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      toast({ title: "Phone note saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (loading) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-xl">
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading note…</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Phone className="w-4 h-4" />{initialEncounterId ? "Edit Phone Note" : "Quick Phone Note"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={visitDate} onChange={e => setVisitDate(e.target.value)} data-testid="input-phone-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
                <SelectTrigger data-testid="select-phone-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">Incoming call</SelectItem>
                  <SelectItem value="outgoing">Outgoing call</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Spoke with</Label>
            <Select value={contactedWith} onValueChange={setContactedWith}>
              <SelectTrigger data-testid="select-phone-contact"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason / Topic (optional)</Label>
            <Input value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} placeholder="Brief reason for the call" data-testid="input-phone-reason" />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} rows={6} placeholder="What was discussed, decisions made, follow-up actions…" data-testid="textarea-phone-content" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!content.trim() || saveMut.isPending} data-testid="button-save-phone-note">
            <Save className="w-4 h-4 mr-1.5" />{saveMut.isPending ? "Saving…" : "Save Phone Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
