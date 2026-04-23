import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Save } from "lucide-react";

interface PhoneNoteDialogProps {
  patientId: number;
  onClose: () => void;
}

const CONTACT_OPTIONS = ["Patient", "Family member", "Pharmacy", "Insurance", "Other provider", "Other"];

export function PhoneNoteDialog({ patientId, onClose }: PhoneNoteDialogProps) {
  const { toast } = useToast();
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60_000;
  const localISO = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);

  const [visitDate, setVisitDate] = useState(localISO);
  const [contactedWith, setContactedWith] = useState("Patient");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("incoming");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [content, setContent] = useState("");

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        patientId,
        visitDate: new Date(visitDate).toISOString(),
        visitType: "phone-call",
        noteType: "phone",
        chiefComplaint: chiefComplaint || `Phone call (${direction === "incoming" ? "incoming" : "outgoing"} - ${contactedWith.toLowerCase()})`,
        clinicianNotes: content,
        phoneContact: { contactedWith, direction },
      };
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

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Phone className="w-4 h-4" />Quick Phone Note</DialogTitle>
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
