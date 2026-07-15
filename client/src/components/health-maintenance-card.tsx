import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, ChevronDown, AlertTriangle, Plus, Check, Send, X, Cigarette } from "lucide-react";

interface PatientChartSmoking {
  smokingStatus: string | null;
  smokingPackYears: number | null;
  smokingQuitDate: string | null;
}

interface ScreeningRow {
  screeningKey: string;
  label: string;
  criteriaLabel: string;
  eligible: boolean;
  addedManually: boolean;
  status: "due" | "overdue" | "ordered" | "completed" | "not_applicable";
  flagVisible: boolean;
  nextDueDate: string | null;
  lastCompletedDate: string | null;
  lastOrderedBy: string | null;
  lastFacility: string | null;
  lastResultSummary: string | null;
  lastLinkedDocumentId: number | null;
  linkedOrderId: number | null;
  id: number | null;
}

interface PatientDocumentSummary {
  id: number;
  fileName: string;
  category: string;
}

const ALL_SCREENING_KEYS: { key: string; label: string }[] = [
  { key: "mammogram", label: "Mammogram" },
  { key: "pap_smear", label: "Pap Smear" },
  { key: "dexa", label: "DEXA Scan" },
  { key: "psa", label: "PSA Discussion" },
  { key: "colonoscopy", label: "Colonoscopy" },
  { key: "lung_ct", label: "Low-Dose Lung CT" },
];

function statusBadge(row: ScreeningRow) {
  if (row.status === "overdue" && row.flagVisible) {
    return <Badge variant="destructive" data-testid={`badge-status-${row.screeningKey}`}>Overdue</Badge>;
  }
  if (row.status === "ordered") return <Badge variant="secondary" data-testid={`badge-status-${row.screeningKey}`}>Ordered</Badge>;
  if (row.status === "completed") return <Badge variant="outline" data-testid={`badge-status-${row.screeningKey}`}>Up to date</Badge>;
  if (row.status === "overdue") return <Badge variant="outline" data-testid={`badge-status-${row.screeningKey}`}>Overdue (dismissed)</Badge>;
  return <Badge variant="outline" data-testid={`badge-status-${row.screeningKey}`}>Due</Badge>;
}

export function HealthMaintenanceCard({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [manualKey, setManualKey] = useState("");

  const [smokingOpen, setSmokingOpen] = useState(false);
  const [smokingStatus, setSmokingStatus] = useState<string>("");
  const [smokingPackYears, setSmokingPackYears] = useState<string>("");
  const [smokingQuitDate, setSmokingQuitDate] = useState<string>("");

  const { data: screenings = [], isLoading } = useQuery<ScreeningRow[]>({
    queryKey: ["/api/patients", patientId, "screenings"],
  });

  const { data: chart } = useQuery<PatientChartSmoking>({
    queryKey: ["/api/patients", patientId, "chart"],
  });

  const smokingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/patients/${patientId}/chart`, {
        smokingStatus: smokingStatus || null,
        smokingPackYears: smokingPackYears ? parseFloat(smokingPackYears) : null,
        smokingQuitDate: smokingStatus === "former" ? (smokingQuitDate || null) : null,
      });
      if (!res.ok) throw new Error("Failed to save smoking history");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "chart"] });
      invalidate();
      setSmokingOpen(false);
      toast({ title: "Smoking history saved" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to save smoking history" }),
  });

  const openSmokingEditor = () => {
    setSmokingStatus(chart?.smokingStatus ?? "");
    setSmokingPackYears(chart?.smokingPackYears != null ? String(chart.smokingPackYears) : "");
    setSmokingQuitDate(chart?.smokingQuitDate ?? "");
    setSmokingOpen(true);
  };

  const { data: documents = [] } = useQuery<PatientDocumentSummary[]>({
    queryKey: ["/api/patients", patientId, "documents"],
    enabled: !!detailKey,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "screenings"] });

  const dismissMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/screenings/${key}/dismiss`, {});
      if (!res.ok) throw new Error("Failed to dismiss");
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Flag dismissed", description: "Will reappear in 30 days unless resolved." }); },
    onError: () => toast({ variant: "destructive", title: "Failed to dismiss flag" }),
  });

  const addManualMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/screenings/${key}/manual`, {});
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => { invalidate(); setAddManualOpen(false); setManualKey(""); toast({ title: "Screening added" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to add screening" }),
  });

  const activeRows = screenings.filter(r => r.status !== "not_applicable");
  const overdueCount = activeRows.filter(r => r.status === "overdue" && r.flagVisible).length;
  const availableManualKeys = ALL_SCREENING_KEYS.filter(k => !screenings.some(s => s.screeningKey === k.key));
  const detailRow = activeRows.find(r => r.screeningKey === detailKey) ?? null;

  return (
    <div className="border-t" style={{ borderColor: "#e8ddd0" }}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover-elevate"
        onClick={() => setOpen(v => !v)}
        data-testid="chart-section-toggle-healthMaintenance"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
          <span className="text-xs font-medium truncate" style={{ color: "#1c2414" }}>Health Maintenance</span>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px]" data-testid="badge-overdue-count">{overdueCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Smoking history"
            onClick={(e) => { e.stopPropagation(); openSmokingEditor(); }}
            data-testid="button-edit-smoking-history"
          >
            <Cigarette className="w-3 h-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Add screening manually"
            onClick={(e) => { e.stopPropagation(); setAddManualOpen(true); }}
            data-testid="button-add-manual-screening"
          >
            <Plus className="w-3 h-3" />
          </Button>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {chart?.smokingStatus && (
            <div className="text-[10px] text-muted-foreground" data-testid="text-smoking-summary">
              Smoking: {chart.smokingStatus}
              {chart.smokingPackYears ? ` · ${chart.smokingPackYears} pack-years` : ""}
              {chart.smokingStatus === "former" && chart.smokingQuitDate ? ` · quit ${chart.smokingQuitDate}` : ""}
            </div>
          )}
          {isLoading && <span className="text-xs text-muted-foreground italic">Loading…</span>}
          {!isLoading && activeRows.length === 0 && (
            <span className="text-xs text-muted-foreground italic">No screenings applicable</span>
          )}
          {activeRows.map(row => (
            <button
              key={row.screeningKey}
              type="button"
              className="w-full text-left rounded-md px-2 py-1.5 hover-elevate"
              style={{
                backgroundColor: row.status === "overdue" && row.flagVisible ? "#fde8e8" : "#edf2e6",
                border: `1px solid ${row.status === "overdue" && row.flagVisible ? "#f5c6c6" : "#c4d4a8"}`,
              }}
              onClick={() => setDetailKey(row.screeningKey)}
              data-testid={`row-screening-${row.screeningKey}`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-medium truncate" style={{ color: "#2e3a20" }}>
                  {row.status === "overdue" && row.flagVisible && <AlertTriangle className="w-3 h-3 inline mr-1 text-destructive" />}
                  {row.label}
                </span>
                {statusBadge(row)}
              </div>
              {row.nextDueDate && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {row.status === "completed" ? "Next due" : "Due"}: {row.nextDueDate}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detail / entry dialog */}
      <Dialog open={!!detailRow} onOpenChange={(v) => { if (!v) setDetailKey(null); }}>
        {detailRow && (
          <ScreeningDetailDialog
            patientId={patientId}
            row={detailRow}
            documents={documents}
            onClose={() => setDetailKey(null)}
            onChanged={invalidate}
            onDismiss={() => dismissMutation.mutate(detailRow.screeningKey)}
          />
        )}
      </Dialog>

      {/* Add manual screening dialog */}
      <Dialog open={addManualOpen} onOpenChange={setAddManualOpen}>
        <DialogContent data-testid="dialog-add-manual-screening">
          <DialogHeader>
            <DialogTitle>Add Health Maintenance Screening</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Screening type</Label>
            <Select value={manualKey} onValueChange={setManualKey}>
              <SelectTrigger data-testid="select-manual-screening-key">
                <SelectValue placeholder="Select a screening…" />
              </SelectTrigger>
              <SelectContent>
                {availableManualKeys.map(k => (
                  <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddManualOpen(false)}>Cancel</Button>
            <Button
              disabled={!manualKey || addManualMutation.isPending}
              onClick={() => addManualMutation.mutate(manualKey)}
              data-testid="button-confirm-add-manual-screening"
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={smokingOpen} onOpenChange={setSmokingOpen}>
        <DialogContent data-testid="dialog-smoking-history">
          <DialogHeader>
            <DialogTitle>Smoking History</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={smokingStatus} onValueChange={setSmokingStatus}>
                <SelectTrigger data-testid="select-smoking-status">
                  <SelectValue placeholder="Select status…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never smoker</SelectItem>
                  <SelectItem value="former">Former smoker</SelectItem>
                  <SelectItem value="current">Current smoker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(smokingStatus === "former" || smokingStatus === "current") && (
              <div className="space-y-1.5">
                <Label>Pack-years</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={smokingPackYears}
                  onChange={(e) => setSmokingPackYears(e.target.value)}
                  placeholder="e.g. 30"
                  data-testid="input-smoking-pack-years"
                />
              </div>
            )}
            {smokingStatus === "former" && (
              <div className="space-y-1.5">
                <Label>Quit date</Label>
                <Input
                  type="date"
                  value={smokingQuitDate}
                  onChange={(e) => setSmokingQuitDate(e.target.value)}
                  data-testid="input-smoking-quit-date"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmokingOpen(false)}>Cancel</Button>
            <Button
              disabled={smokingMutation.isPending}
              onClick={() => smokingMutation.mutate()}
              data-testid="button-save-smoking-history"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScreeningDetailDialog({
  patientId, row, documents, onClose, onChanged, onDismiss,
}: {
  patientId: number;
  row: ScreeningRow;
  documents: PatientDocumentSummary[];
  onClose: () => void;
  onChanged: () => void;
  onDismiss: () => void;
}) {
  const { toast } = useToast();
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [orderedBy, setOrderedBy] = useState(row.lastOrderedBy ?? "");
  const [facility, setFacility] = useState(row.lastFacility ?? "");
  const [resultSummary, setResultSummary] = useState("");
  const [linkedDocumentId, setLinkedDocumentId] = useState<string>("");

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/screenings/${row.screeningKey}/complete`, {
        eventDate,
        orderedBy: orderedBy || null,
        facility: facility || null,
        resultSummary: resultSummary || null,
        linkedDocumentId: linkedDocumentId ? parseInt(linkedDocumentId) : null,
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => { onChanged(); onClose(); toast({ title: "Screening recorded" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to record screening" }),
  });

  const orderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/screenings/${row.screeningKey}/order`, {});
      if (!res.ok) throw new Error("Failed to send order");
      return res.json();
    },
    onSuccess: () => { onChanged(); onClose(); toast({ title: "Order sent" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to send order" }),
  });

  return (
    <DialogContent data-testid={`dialog-screening-detail-${row.screeningKey}`}>
      <DialogHeader>
        <DialogTitle>{row.label}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{row.criteriaLabel}</p>
        {row.lastCompletedDate && (
          <p className="text-xs">Last completed: <span className="font-medium">{row.lastCompletedDate}</span></p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Completion date</Label>
            <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} data-testid={`input-completed-date-${row.screeningKey}`} />
          </div>
          <div>
            <Label className="text-xs">Ordered by</Label>
            <Input value={orderedBy} onChange={e => setOrderedBy(e.target.value)} data-testid={`input-ordered-by-${row.screeningKey}`} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Facility</Label>
          <Input value={facility} onChange={e => setFacility(e.target.value)} data-testid={`input-facility-${row.screeningKey}`} />
        </div>
        <div>
          <Label className="text-xs">Result summary</Label>
          <Textarea value={resultSummary} onChange={e => setResultSummary(e.target.value)} rows={2} data-testid={`input-result-${row.screeningKey}`} />
        </div>
        {documents.length > 0 && (
          <div>
            <Label className="text-xs">Link a document</Label>
            <Select value={linkedDocumentId} onValueChange={setLinkedDocumentId}>
              <SelectTrigger data-testid={`select-linked-document-${row.screeningKey}`}>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {documents.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.fileName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <DialogFooter className="flex-wrap gap-1.5">
        {row.status === "overdue" && (
          <Button variant="outline" size="sm" onClick={onDismiss} data-testid={`button-dismiss-flag-${row.screeningKey}`}>
            <X className="w-3.5 h-3.5 mr-1" /> Dismiss flag
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => orderMutation.mutate()} disabled={orderMutation.isPending} data-testid={`button-send-order-${row.screeningKey}`}>
          <Send className="w-3.5 h-3.5 mr-1" /> Send order
        </Button>
        <Button size="sm" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} data-testid={`button-record-results-${row.screeningKey}`}>
          <Check className="w-3.5 h-3.5 mr-1" /> Record results
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
