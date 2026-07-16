import { useState, useRef, useEffect, useCallback } from "react";
import { localDateTimeStr, visitDateToInputStr } from "@/lib/date-utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useFloatingPanel } from "@/hooks/use-floating-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Save, Loader2, GripVertical, X, Maximize2, Minus } from "lucide-react";

interface PhoneNoteDialogProps {
  patientId: number;
  onClose: () => void;
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
  const [savedEncounterId, setSavedEncounterId] = useState<number | null>(initialEncounterId ?? null);
  const [loading, setLoading] = useState(!!initialEncounterId);

  const { panelPos, minimized, setMinimized, panelRef, startDrag, floating, zIndex, bringToFront } = useFloatingPanel();
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedEncounterIdRef = useRef<number | null>(initialEncounterId ?? null);

  useEffect(() => { savedEncounterIdRef.current = savedEncounterId; }, [savedEncounterId]);

  useEffect(() => {
    if (!initialEncounterId) return;
    (async () => {
      try {
        const res = await fetch(`/api/encounters/${initialEncounterId}`);
        if (!res.ok) return;
        const enc = await res.json();
        if (enc.visitDate) setVisitDate(visitDateToInputStr(enc.visitDate));
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

  const buildBody = useCallback(() => {
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
    return { cc, header };
  }, [chiefComplaint, direction, contactedWith, content]);

  const performAutoSave = useCallback(async () => {
    if (!content.trim()) return;
    setAutoSaveStatus("saving");
    try {
      const { cc, header } = buildBody();
      const existingId = savedEncounterIdRef.current;
      if (existingId) {
        await apiRequest("PUT", `/api/encounters/${existingId}`, {
          visitDate, visitType: "phone-call", chiefComplaint: cc,
          clinicianNotes: content, phoneContact: { contactedWith, direction },
        });
        await apiRequest("PUT", `/api/encounters/${existingId}/soap`, { soapNote: { fullNote: header } });
      } else {
        const res = await apiRequest("POST", "/api/encounters", {
          patientId, visitDate, visitType: "phone-call", noteType: "phone",
          chiefComplaint: cc, clinicianNotes: content,
          phoneContact: { contactedWith, direction },
          soapNote: { fullNote: header },
        });
        const enc = await res.json();
        savedEncounterIdRef.current = enc.id;
        setSavedEncounterId(enc.id);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "encounters"] });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/encounters`] });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      setAutoSaveStatus("saved");
    } catch {
      setAutoSaveStatus("unsaved");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, chiefComplaint, visitDate, direction, contactedWith, patientId, buildBody]);

  useEffect(() => {
    if (!content.trim()) return;
    setAutoSaveStatus("unsaved");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(performAutoSave, 4000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [content, chiefComplaint, visitDate, direction, contactedWith, performAutoSave]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { cc, header } = buildBody();
      if (savedEncounterId) {
        await apiRequest("PUT", `/api/encounters/${savedEncounterId}`, {
          visitDate, visitType: "phone-call", chiefComplaint: cc,
          clinicianNotes: content, phoneContact: { contactedWith, direction },
        });
        return apiRequest("PUT", `/api/encounters/${savedEncounterId}/soap`, { soapNote: { fullNote: header } });
      }
      if (initialEncounterId) {
        await apiRequest("PUT", `/api/encounters/${initialEncounterId}`, {
          visitDate, visitType: "phone-call", chiefComplaint: cc,
          clinicianNotes: content, phoneContact: { contactedWith, direction },
        });
        return apiRequest("PUT", `/api/encounters/${initialEncounterId}/soap`, { soapNote: { fullNote: header } });
      }
      return apiRequest("POST", "/api/encounters", {
        patientId, visitDate, visitType: "phone-call", noteType: "phone",
        chiefComplaint: cc, clinicianNotes: content,
        phoneContact: { contactedWith, direction },
        soapNote: { fullNote: header },
      });
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

  const panelClass = cn(
    "fixed flex flex-col bg-card shadow-2xl overflow-hidden",
    floating ? "rounded-lg border w-[36rem] max-w-[95vw]" : "inset-y-0 right-0 border-l w-full max-w-xl h-full"
  );
  const panelStyle: React.CSSProperties = {
    zIndex,
    ...(panelPos ? { left: panelPos.x, top: panelPos.y, height: minimized ? "auto" : "85vh", maxHeight: "90vh" } : {}),
  };

  const titleBar = (
    <div
      onMouseDown={startDrag}
      className="flex-shrink-0 px-4 py-3 border-b bg-card flex items-center justify-between gap-3 cursor-move select-none"
    >
      <div className="flex items-center gap-2 min-w-0">
        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Phone className="w-4 h-4 flex-shrink-0" />
        <span className="font-semibold text-sm truncate">
          {initialEncounterId ? "Edit Phone Note" : "Quick Phone Note"}
        </span>
        {autoSaveStatus === "saving" && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />Saving…
          </span>
        )}
        {autoSaveStatus === "saved" && savedEncounterId && (
          <span className="text-xs text-muted-foreground flex-shrink-0">Auto-saved</span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button size="icon" variant="ghost" onClick={() => setMinimized(m => !m)} title={minimized ? "Restore" : "Minimize"} data-testid="button-minimize-phone-note">
          {minimized ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-phone-note">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div ref={panelRef} onMouseDown={bringToFront} className={panelClass} style={panelStyle} data-testid="phone-note-dialog">
        {titleBar}
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading note…</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} onMouseDown={bringToFront} className={panelClass} style={panelStyle} data-testid="phone-note-dialog">
      {titleBar}

      {!minimized && (
        <>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
              <Textarea value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="What was discussed, decisions made, follow-up actions…" data-testid="textarea-phone-content" />
            </div>
          </div>

          <div className="flex-shrink-0 border-t px-4 py-3 flex justify-end gap-2 bg-card">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!content.trim() || saveMut.isPending} data-testid="button-save-phone-note">
              <Save className="w-4 h-4 mr-1.5" />{saveMut.isPending ? "Saving…" : "Save & Close"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
