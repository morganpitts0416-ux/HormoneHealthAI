import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Search, Printer } from "lucide-react";
import {
  ClipboardList, Plus, X, Clock, AlertCircle,
  Activity, Heart, FlaskConical, Loader2, Check,
  ChevronDown, ChevronRight, RotateCcw, User, Phone,
  CalendarDays, MapPin, FileText, CheckCircle2, Circle,
} from "lucide-react";
import { useClinicBranding } from "@/hooks/use-clinic-branding";
import { generateOrderPDF } from "@/lib/order-pdf-export";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TaskCompletion {
  id: number;
  orderId: number;
  taskKey: string;
  completedByUserId: number | null;
  completedByStaffId: number | null;
  completedAt: string;
  note: string | null;
}

interface OrderingProvider {
  firstName: string;
  lastName: string;
  title: string | null;
  npi: string | null;
  signatureImage: string | null;
}

interface ClinicalOrderData {
  id: number;
  clinicId: number;
  patientId: number;
  patientFirstName?: string;
  patientLastName?: string;
  createdByUserId: number;
  orderingProviderUserId: number | null;
  orderingProvider: OrderingProvider | null;
  orderType: string;
  subtype: string;
  referringTo: string | null;
  facilityAddress: string | null;
  facilityFax: string | null;
  reason: string | null;
  priority: string;
  targetDate: string | null;
  recurrenceMonths: number | null;
  assignedToUserId: number | null;
  assignedToStaffId: number | null;
  status: string;
  notes: string | null;
  diagnosisCode: string | null;
  diagnosisName: string | null;
  cptCode: string | null;
  cptDescription: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  taskCompletions: TaskCompletion[];
}

interface TeamMember {
  id: string;
  label: string;
  kind: "provider" | "staff";
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const ORDER_TASK_WORKFLOWS: Record<string, string[]> = {
  referral: ["order_sent", "appointment_scheduled", "patient_notified"],
  imaging: ["order_sent", "appointment_scheduled", "patient_notified", "results_received", "provider_notified"],
  health_maintenance: ["order_sent", "appointment_scheduled", "patient_notified", "results_received", "provider_notified"],
  lab: ["labs_drawn", "results_received", "provider_notified"],
};

const TASK_LABELS: Record<string, string> = {
  order_sent: "Order sent / faxed",
  appointment_scheduled: "Appointment scheduled",
  patient_notified: "Patient notified",
  results_received: "Results received",
  provider_notified: "Provider notified of results",
  labs_drawn: "Labs drawn",
};

const ORDER_TYPE_CONFIG: Record<string, { label: string; shortLabel: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
  referral: { label: "Referral", shortLabel: "Referral", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", Icon: ClipboardList },
  imaging: { label: "Imaging Order", shortLabel: "Imaging", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", Icon: Activity },
  health_maintenance: { label: "Health Maintenance", shortLabel: "Health Maint.", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", Icon: Heart },
  lab: { label: "Lab Order", shortLabel: "Lab", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", Icon: FlaskConical },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  routine: { label: "Routine", color: "bg-muted text-muted-foreground" },
  urgent: { label: "Urgent", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  stat: { label: "STAT", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function getTaskProgress(order: ClinicalOrderData) {
  const tasks = ORDER_TASK_WORKFLOWS[order.orderType] ?? [];
  const doneKeys = new Set(order.taskCompletions.map((c) => c.taskKey));
  return { done: doneKeys.size, total: tasks.length };
}

function formatDate(str: string | null | undefined) {
  if (!str) return null;
  return new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(str: string | null | undefined) {
  if (!str) return null;
  return new Date(str).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── Order Detail Drawer ───────────────────────────────────────────────────────
function OrderDetailDrawer({
  order,
  onClose,
  patientName,
  onOrderChange,
}: {
  order: ClinicalOrderData;
  onClose: () => void;
  patientName?: string;
  onOrderChange: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expandingTask, setExpandingTask] = useState<string | null>(null);
  const [taskNote, setTaskNote] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [editNotes, setEditNotes] = useState(order.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [editDiagnosis, setEditDiagnosis] = useState<{ code: string; label: string } | null>(
    order.diagnosisCode ? { code: order.diagnosisCode, label: order.diagnosisName ?? "" } : null
  );
  const [editCpt, setEditCpt] = useState<{ code: string; label: string } | null>(
    order.cptCode ? { code: order.cptCode, label: order.cptDescription ?? "" } : null
  );
  const [savingCodes, setSavingCodes] = useState(false);

  const { data: clinicBranding } = useClinicBranding();
  const printEnabled = ["referral", "imaging", "health_maintenance"].includes(order.orderType);
  const { data: patientData } = useQuery<any>({
    queryKey: ["/api/patients", order.patientId],
    enabled: printEnabled,
    staleTime: 5 * 60 * 1000,
  });
  const { data: chartData } = useQuery<any>({
    queryKey: ["/api/patients", order.patientId, "chart"],
    enabled: printEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const canPrint = printEnabled;

  async function handlePrint() {
    setPrinting(true);
    try {
      // Always fetch patient + chart data fresh at print time — avoids stale cache
      const [freshPatientRes, freshChartRes] = await Promise.allSettled([
        apiRequest("GET", `/api/patients/${order.patientId}`),
        apiRequest("GET", `/api/patients/${order.patientId}/chart`),
      ]);
      const freshPatient = (freshPatientRes.status === "fulfilled" && freshPatientRes.value.ok)
        ? (await freshPatientRes.value.json())?.patient ?? null
        : patientData?.patient ?? null;
      const freshChart = (freshChartRes.status === "fulfilled" && freshChartRes.value.ok)
        ? await freshChartRes.value.json()
        : chartData ?? null;

      await generateOrderPDF({
        order: {
          orderType: order.orderType,
          subtype: order.subtype,
          referringTo: order.referringTo,
          facilityAddress: order.facilityAddress,
          facilityFax: order.facilityFax,
          reason: order.reason,
          priority: order.priority,
          targetDate: order.targetDate,
          // Prefer live drawer state (editDiagnosis/editCpt) — it reflects
          // any codes the user has typed or selected since opening the drawer,
          // even if they haven't clicked "Save codes" yet.
          diagnosisCode: editDiagnosis?.code ?? order.diagnosisCode,
          diagnosisName: editDiagnosis?.label ?? order.diagnosisName,
          cptCode: editCpt?.code ?? order.cptCode,
          cptDescription: editCpt?.label ?? order.cptDescription,
          notes: order.notes,
          createdAt: order.createdAt,
        },
        patient: {
          firstName: freshPatient?.firstName ?? order.patientFirstName ?? "Patient",
          lastName: freshPatient?.lastName ?? order.patientLastName ?? "",
          dateOfBirth: freshPatient?.dateOfBirth ?? null,
          gender: freshPatient?.gender ?? null,
          mrn: freshPatient?.mrn ?? null,
          phone: freshPatient?.phone ?? null,
          email: freshPatient?.email ?? null,
          address: freshPatient?.address ?? null,
          insuranceCarrier: freshPatient?.insuranceCarrier ?? null,
          insuranceMemberId: freshPatient?.insuranceMemberId ?? null,
        },
        providerName: order.orderingProvider
          ? `${order.orderingProvider.firstName} ${order.orderingProvider.lastName}`.trim()
          : ((user as any)?.name ?? (user as any)?.username ?? ""),
        providerTitle: order.orderingProvider?.title ?? (user as any)?.title ?? null,
        providerNpi: order.orderingProvider?.npi ?? (user as any)?.npi ?? null,
        signatureImage: order.orderingProvider?.signatureImage ?? (user as any)?.signatureImage ?? null,
        clinicName: (user as any)?.clinicName ?? "Clinic",
        clinicAddress: (user as any)?.address ?? null,
        clinicPhone: (user as any)?.phone ?? null,
        clinicFax: clinicBranding?.clinicFax ?? null,
        clinicLogo: clinicBranding?.clinicLogo ?? null,
        footerText: clinicBranding?.footerText ?? null,
        branding: clinicBranding ?? null,
        medications: freshChart?.currentMedications ?? null,
        medicalHistory: freshChart?.medicalHistory ?? null,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to generate PDF" });
    } finally {
      setPrinting(false);
    }
  }

  const tasks = ORDER_TASK_WORKFLOWS[order.orderType] ?? [];
  const completionMap = Object.fromEntries(order.taskCompletions.map((c) => [c.taskKey, c]));
  const typeConfig = ORDER_TYPE_CONFIG[order.orderType] ?? ORDER_TYPE_CONFIG.referral;
  const priorityCfg = PRIORITY_CONFIG[order.priority] ?? PRIORITY_CONFIG.routine;

  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskKey, note }: { taskKey: string; note: string | null }) => {
      const res = await apiRequest("POST", `/api/clinical-orders/${order.id}/tasks/${taskKey}/complete`, { note });
      if (!res.ok) throw new Error("Failed to complete task");
      return res.json();
    },
    onSuccess: (data) => {
      onOrderChange();
      setExpandingTask(null);
      setTaskNote("");
      if (data.orderCompleted) {
        toast({ title: "Order complete", description: "All tasks finished — order marked complete." });
        onClose();
      }
    },
    onError: () => toast({ variant: "destructive", title: "Failed to complete task" }),
  });

  const uncompleteTaskMutation = useMutation({
    mutationFn: async (taskKey: string) => {
      const res = await apiRequest("DELETE", `/api/clinical-orders/${order.id}/tasks/${taskKey}/complete`);
      if (!res.ok) throw new Error("Failed to undo task");
      return res.json();
    },
    onSuccess: () => { onOrderChange(); toast({ title: "Task undone" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to undo task" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/clinical-orders/${order.id}`, { reason: cancelReason || null });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onSuccess: () => { onOrderChange(); onClose(); toast({ title: "Order cancelled" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to cancel order" }),
  });

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await apiRequest("PATCH", `/api/clinical-orders/${order.id}`, { notes: editNotes || null });
      onOrderChange();
      toast({ title: "Notes saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save notes" });
    } finally {
      setSavingNotes(false);
    }
  }

  async function saveCodes() {
    setSavingCodes(true);
    try {
      await apiRequest("PATCH", `/api/clinical-orders/${order.id}`, {
        diagnosisCode: editDiagnosis?.code ?? null,
        diagnosisName: editDiagnosis?.label ?? null,
        cptCode: editCpt?.code ?? null,
        cptDescription: editCpt?.label ?? null,
      });
      onOrderChange();
      toast({ title: "Codes saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save codes" });
    } finally {
      setSavingCodes(false);
    }
  }

  const codesChanged =
    (editDiagnosis?.code ?? null) !== (order.diagnosisCode ?? null) ||
    (editCpt?.code ?? null) !== (order.cptCode ?? null);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-background border-l shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <typeConfig.Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{order.subtype}</p>
              <p className="text-xs text-muted-foreground">{patientName ?? `Patient #${order.patientId}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={cn("text-xs", typeConfig.color)}>{typeConfig.shortLabel}</Badge>
            <Badge className={cn("text-xs", priorityCfg.color)}>{priorityCfg.label}</Badge>
            {canPrint && (
              <Button
                size="icon"
                variant="ghost"
                onClick={handlePrint}
                disabled={printing}
                title="Print / Download PDF"
                data-testid="button-print-order"
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              </Button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1" data-testid="button-close-order-drawer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Order details */}
          <div className="space-y-2">
            {order.referringTo && (
              <div className="flex items-start gap-2 text-sm">
                <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">To:</span>
                <span className="font-medium">{order.referringTo}</span>
              </div>
            )}
            {order.facilityFax && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Fax:</span>
                <span className="font-mono">{order.facilityFax}</span>
              </div>
            )}
            {order.facilityAddress && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground leading-snug">{order.facilityAddress}</span>
              </div>
            )}
            {order.reason && (
              <div className="flex items-start gap-2 text-sm">
                <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">{order.reason}</span>
              </div>
            )}
            {order.orderingProvider && (
              <div className="flex items-center gap-2 text-sm">
                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Ordering provider:</span>
                <span className="font-medium">
                  {[order.orderingProvider.title, order.orderingProvider.firstName, order.orderingProvider.lastName].filter(Boolean).join(" ")}
                </span>
              </div>
            )}
            {/* ICD-10 / CPT — always editable so codes can be added after creation */}
            <div className="space-y-1.5 pt-0.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing Codes</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">ICD-10 Diagnosis</p>
                  <CodeSearchCombobox
                    fetchUrl="/api/diagnoses/search"
                    value={editDiagnosis}
                    onChange={setEditDiagnosis}
                    placeholder="Search ICD-10…"
                    data-testid="input-drawer-icd10"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">CPT Procedure</p>
                  <CodeSearchCombobox
                    fetchUrl="/api/cpt/search"
                    value={editCpt}
                    onChange={setEditCpt}
                    placeholder="Search CPT…"
                    data-testid="input-drawer-cpt"
                  />
                </div>
              </div>
              {codesChanged && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={saveCodes}
                  disabled={savingCodes}
                  data-testid="button-save-order-codes"
                >
                  {savingCodes ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save codes
                </Button>
              )}
            </div>
            {order.targetDate && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Target:</span>
                <span>{formatDate(order.targetDate)}</span>
              </div>
            )}
            {order.recurrenceMonths && (
              <div className="flex items-center gap-2 text-sm">
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Recurs every {order.recurrenceMonths} month{order.recurrenceMonths !== 1 ? "s" : ""}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              Created {formatDate(order.createdAt)} · {daysSince(order.createdAt)} day{daysSince(order.createdAt) !== 1 ? "s" : ""} ago
            </div>
          </div>

          {/* Task checklist */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Task Checklist</p>
            {tasks.map((taskKey) => {
              const completion = completionMap[taskKey];
              const isDone = !!completion;
              const isExpanding = expandingTask === taskKey;

              return (
                <div key={taskKey} className={cn(
                  "rounded-md border transition-colors",
                  isDone ? "border-green-200/60 bg-green-50/40 dark:border-green-800/40 dark:bg-green-950/20" : "border-border bg-background",
                )}>
                  <div className="flex items-start gap-2.5 p-2.5">
                    <button
                      className="mt-0.5 flex-shrink-0"
                      onClick={() => {
                        if (isDone) {
                          if (confirm("Undo this task completion?")) uncompleteTaskMutation.mutate(taskKey);
                        } else {
                          setExpandingTask(isExpanding ? null : taskKey);
                          setTaskNote("");
                        }
                      }}
                      disabled={completeTaskMutation.isPending || uncompleteTaskMutation.isPending}
                      data-testid={`button-task-${taskKey}`}
                    >
                      {isDone
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                        : <Circle className="w-4 h-4 text-muted-foreground/50 hover:text-primary transition-colors" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", isDone ? "text-muted-foreground line-through" : "text-foreground")}>
                        {TASK_LABELS[taskKey] ?? taskKey}
                      </p>
                      {isDone && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(completion.completedAt)}
                          {completion.note && <span className="ml-1 italic">· {completion.note}</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Inline expansion for completing task */}
                  {isExpanding && !isDone && (
                    <div className="px-2.5 pb-2.5 pt-0 space-y-2 border-t border-dashed border-border/60 mt-0">
                      <Input
                        placeholder="Optional note (e.g. Faxed to Dr. Smith at 555-1234)"
                        value={taskNote}
                        onChange={(e) => setTaskNote(e.target.value)}
                        className="text-xs h-8"
                        autoFocus
                        data-testid={`input-task-note-${taskKey}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs flex-1"
                          onClick={() => completeTaskMutation.mutate({ taskKey, note: taskNote.trim() || null })}
                          disabled={completeTaskMutation.isPending}
                          data-testid={`button-confirm-task-${taskKey}`}
                        >
                          {completeTaskMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                          Mark complete
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpandingTask(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Order notes */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add internal notes…"
              className="text-xs min-h-[70px] resize-none"
              data-testid="textarea-order-notes"
            />
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={saveNotes}
              disabled={savingNotes || editNotes === (order.notes ?? "")}
              data-testid="button-save-order-notes"
            >
              {savingNotes ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Save notes
            </Button>
          </div>
        </div>

        {/* Footer actions */}
        {order.status === "active" && (
          <div className="flex-shrink-0 px-4 py-3 border-t bg-muted/20">
            {!showCancelConfirm ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive w-full"
                onClick={() => setShowCancelConfirm(true)}
                data-testid="button-cancel-order"
              >
                Cancel this order
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">Reason for cancellation (optional)</p>
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Patient declined, duplicate order"
                  className="text-xs h-8"
                  data-testid="input-cancel-reason"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="flex-1 text-xs h-7" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} data-testid="button-confirm-cancel">
                    {cancelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm cancel"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowCancelConfirm(false)}>Keep</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable code-search combobox (ICD-10 + CPT) ─────────────────────────────
interface CodeValue { code: string; label: string; }

function CodeSearchCombobox({
  fetchUrl,
  value,
  onChange,
  placeholder,
  "data-testid": testId,
}: {
  fetchUrl: string;
  value: CodeValue | null;
  onChange: (v: CodeValue | null) => void;
  placeholder?: string;
  "data-testid"?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ code: string; description?: string; name?: string }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    const res = await fetch(`${fetchUrl}?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults(await res.json());
  }, [fetchUrl]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, open, doSearch]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (value) {
    return (
      <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border bg-muted/40 text-xs">
        <span className="font-mono font-semibold text-foreground flex-shrink-0">{value.code}</span>
        <span className="text-muted-foreground truncate flex-1">{value.label}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-1"
          data-testid={testId ? `${testId}-clear` : undefined}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        <Input
          className="h-8 text-xs pl-6"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); if (!query) doSearch(""); }}
          data-testid={testId}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-52 overflow-y-auto">
          {results.map((r) => {
            const code = r.code;
            const label = r.description ?? r.name ?? "";
            return (
              <button
                key={code}
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-accent text-xs flex items-start gap-2"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange({ code, label });
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="font-mono font-semibold text-foreground flex-shrink-0 mt-0.5 w-14">{code}</span>
                <span className="text-muted-foreground leading-snug">{label}</span>
              </button>
            );
          })}
        </div>
      )}
      {open && query.length > 0 && results.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md">
          <p className="text-xs text-muted-foreground px-3 py-2">No results found</p>
        </div>
      )}
    </div>
  );
}

function NewOrderDialog({
  patientId,
  patientName,
  open,
  onClose,
  onCreated,
}: {
  patientId: number;
  patientName: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orderType, setOrderType] = useState("referral");
  const [subtype, setSubtype] = useState("");
  const [priority, setPriority] = useState("routine");
  const [referringTo, setReferringTo] = useState("");
  const [facilityFax, setFacilityFax] = useState("");
  const [facilityAddress, setFacilityAddress] = useState("");
  const [reason, setReason] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [orderingProviderId, setOrderingProviderId] = useState<string>("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceMonths, setRecurrenceMonths] = useState("12");
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState<{ code: string; label: string } | null>(null);
  const [cpt, setCpt] = useState<{ code: string; label: string } | null>(null);

  const { data: team = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/clinical-orders/team"],
    enabled: open,
  });

  // Default ordering provider to current user (if they appear as a provider in the team list)
  const providers = team.filter((m) => m.kind === "provider");
  const selfKey = `user:${user?.id}`;
  const effectiveOrderingProvider = orderingProviderId || (providers.some((p) => p.id === selfKey) ? selfKey : "");

  const createMutation = useMutation({
    mutationFn: async () => {
      let assignedToUserId: number | null = null;
      let assignedToStaffId: number | null = null;
      if (assignedTo.startsWith("user:")) assignedToUserId = parseInt(assignedTo.slice(5));
      else if (assignedTo.startsWith("staff:")) assignedToStaffId = parseInt(assignedTo.slice(6));

      const orderingProviderUserId = effectiveOrderingProvider.startsWith("user:")
        ? parseInt(effectiveOrderingProvider.slice(5))
        : null;

      const res = await apiRequest("POST", `/api/patients/${patientId}/clinical-orders`, {
        orderType,
        subtype: subtype.trim(),
        referringTo: referringTo.trim() || null,
        facilityFax: facilityFax.trim() || null,
        facilityAddress: facilityAddress.trim() || null,
        reason: reason.trim() || null,
        priority,
        targetDate: targetDate || null,
        recurrenceMonths: recurring ? parseInt(recurrenceMonths) : null,
        assignedToUserId,
        assignedToStaffId,
        orderingProviderUserId,
        notes: notes.trim() || null,
        diagnosisCode: diagnosis?.code ?? null,
        diagnosisName: diagnosis?.label ?? null,
        cptCode: cpt?.code ?? null,
        cptDescription: cpt?.label ?? null,
      });
      if (!res.ok) throw new Error("Failed to create order");
      return res.json();
    },
    onSuccess: () => {
      onCreated();
      onClose();
      toast({ title: "Order created", description: `${ORDER_TYPE_CONFIG[orderType]?.label} for ${patientName} created successfully.` });
      // Reset
      setOrderType("referral"); setSubtype(""); setPriority("routine");
      setReferringTo(""); setFacilityFax(""); setFacilityAddress("");
      setReason(""); setTargetDate(""); setAssignedTo(""); setOrderingProviderId("");
      setRecurring(false); setRecurrenceMonths("12"); setNotes("");
      setDiagnosis(null); setCpt(null);
    },
    onError: () => toast({ variant: "destructive", title: "Failed to create order" }),
  });

  const showFacility = ["referral", "imaging", "health_maintenance", "lab"].includes(orderType);
  const showRecurrence = orderType === "health_maintenance";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-new-order">
        <DialogHeader>
          <DialogTitle className="text-base">New Order — {patientName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Order Type *</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-order-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="imaging">Imaging</SelectItem>
                  <SelectItem value="lab">Lab Order</SelectItem>
                  <SelectItem value="health_maintenance">Health Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-order-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {orderType === "referral" ? "Specialty / Service *" : orderType === "imaging" ? "Imaging Study *" : orderType === "lab" ? "Panel / Test *" : "Screening / Service *"}
            </Label>
            <Input
              placeholder={orderType === "referral" ? "e.g. Physical Therapy" : orderType === "imaging" ? "e.g. MRI — Lumbar Spine" : orderType === "lab" ? "e.g. CBC with Differential, CMP, Lipid Panel" : "e.g. Mammogram"}
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-order-subtype"
            />
          </div>

          {showFacility && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">{orderType === "referral" ? "Referring To (Provider / Facility)" : orderType === "lab" ? "Lab / Draw Location" : "Facility / Imaging Center"}</Label>
                <Input
                  placeholder={orderType === "referral" ? "e.g. Dr. Jane Smith, PT" : orderType === "lab" ? "e.g. Quest Diagnostics, LabCorp, In-house" : "e.g. Memorial Radiology Center"}
                  value={referringTo}
                  onChange={(e) => setReferringTo(e.target.value)}
                  className="h-8 text-xs"
                  data-testid="input-referring-to"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Fax Number</Label>
                  <Input
                    placeholder="555-555-5555"
                    value={facilityFax}
                    onChange={(e) => setFacilityFax(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-facility-fax"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Target Date</Label>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-target-date"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Facility Address (optional)</Label>
                <Input
                  placeholder="123 Main St, City, State"
                  value={facilityAddress}
                  onChange={(e) => setFacilityAddress(e.target.value)}
                  className="h-8 text-xs"
                  data-testid="input-facility-address"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Clinical Indication / Reason</Label>
            <Textarea
              placeholder="e.g. Chronic low back pain, failed conservative management"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs min-h-[60px] resize-none"
              data-testid="textarea-order-reason"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Diagnosis Code (ICD-10)</Label>
              <CodeSearchCombobox
                fetchUrl="/api/diagnoses/search"
                value={diagnosis}
                onChange={setDiagnosis}
                placeholder="Search diagnosis…"
                data-testid="input-order-icd10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Procedure Code (CPT)</Label>
              <CodeSearchCombobox
                fetchUrl="/api/cpt/search"
                value={cpt}
                onChange={setCpt}
                placeholder="Search CPT code…"
                data-testid="input-order-cpt"
              />
            </div>
          </div>

          {showRecurrence && (
            <div className="rounded-md border border-green-200/60 bg-green-50/40 dark:border-green-800/40 dark:bg-green-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="rounded"
                  data-testid="checkbox-recurring"
                />
                <Label htmlFor="recurring" className="text-xs font-medium cursor-pointer">Auto-schedule next order when this one is complete</Label>
              </div>
              {recurring && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Repeat every</Label>
                  <Select value={recurrenceMonths} onValueChange={setRecurrenceMonths}>
                    <SelectTrigger className="h-7 text-xs w-28" data-testid="select-recurrence-months">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 6, 9, 12, 18, 24].map((m) => (
                        <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Ordering Provider *</Label>
            <Select value={effectiveOrderingProvider} onValueChange={setOrderingProviderId}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-ordering-provider">
                <SelectValue placeholder="Select ordering provider…" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((m) => (
                  <SelectItem key={m.id} value={m.id} data-testid={`option-ordering-provider-${m.id}`}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Name and signature that will appear on the printed order.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-assigned-to">
                <SelectValue placeholder="Select team member…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id} data-testid={`option-team-${m.id}`}>
                    {m.label}
                    <span className="ml-1.5 text-muted-foreground text-xs">· {m.kind === "provider" ? "Provider" : "Staff"}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Internal Notes (optional)</Label>
            <Textarea
              placeholder="Any additional context…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[50px] resize-none"
              data-testid="textarea-new-order-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={!subtype.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            data-testid="button-submit-new-order"
          >
            {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Create Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Order Row (shared between tab and widget) ──────────────────────────────────
function OrderRow({ order, patientName, onClick }: { order: ClinicalOrderData; patientName?: string; onClick: () => void }) {
  const typeConfig = ORDER_TYPE_CONFIG[order.orderType] ?? ORDER_TYPE_CONFIG.referral;
  const priorityCfg = PRIORITY_CONFIG[order.priority] ?? PRIORITY_CONFIG.routine;
  const { done, total } = getTaskProgress(order);
  const days = daysSince(order.createdAt);

  return (
    <button
      className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover-elevate rounded-md transition-colors"
      onClick={onClick}
      data-testid={`button-order-row-${order.id}`}
    >
      <typeConfig.Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {patientName && <span className="text-sm font-medium">{patientName}</span>}
          <Badge className={cn("text-[10px] px-1.5 py-0", typeConfig.color)}>{typeConfig.shortLabel}</Badge>
          {order.priority !== "routine" && (
            <Badge className={cn("text-[10px] px-1.5 py-0", priorityCfg.color)}>{priorityCfg.label}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{order.subtype}{order.referringTo ? ` · ${order.referringTo}` : ""}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-xs font-medium">{done}/{total}</p>
        <p className="text-[10px] text-muted-foreground">{days}d</p>
      </div>
    </button>
  );
}

// ── Patient Orders Tab ─────────────────────────────────────────────────────────
export function PatientOrdersTab({ patientId, patientName }: { patientId: number; patientName: string }) {
  const [showNew, setShowNew] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ClinicalOrderData | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: orders = [], refetch } = useQuery<ClinicalOrderData[]>({
    queryKey: ["/api/patients", patientId, "clinical-orders"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/clinical-orders`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!patientId,
  });

  const active = orders.filter((o) => o.status === "active");
  const completed = orders.filter((o) => o.status === "completed");
  const cancelled = orders.filter((o) => o.status === "cancelled");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "clinical-orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/clinical-orders/active"] });
    if (selectedOrder) {
      refetch().then((r) => {
        const updated = r.data?.find((o) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
        else setSelectedOrder(null);
      });
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Orders & Referrals</h3>
          <p className="text-xs text-muted-foreground">{active.length} active</p>
        </div>
        <Button size="sm" className="text-xs gap-1" onClick={() => setShowNew(true)} data-testid="button-new-clinical-order">
          <Plus className="w-3.5 h-3.5" /> New Order
        </Button>
      </div>

      {/* Active orders */}
      {active.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No active orders. Click <strong>New Order</strong> to create one.
        </div>
      ) : (
        <Card>
          <CardContent className="p-2 space-y-0.5">
            {active.map((order) => (
              <OrderRow key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Completed / Cancelled */}
      {(completed.length > 0 || cancelled.length > 0) && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowCompleted((v) => !v)}
            data-testid="button-toggle-completed-orders"
          >
            {showCompleted ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {completed.length + cancelled.length} completed / cancelled
          </button>
          {showCompleted && (
            <Card className="mt-2">
              <CardContent className="p-2 space-y-0.5">
                {[...completed, ...cancelled].map((order) => (
                  <div key={order.id} className="opacity-60">
                    <OrderRow order={order} onClick={() => setSelectedOrder(order)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* New order dialog */}
      <NewOrderDialog
        patientId={patientId}
        patientName={patientName}
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={invalidate}
      />

      {/* Detail drawer */}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          patientName={patientName}
          onClose={() => setSelectedOrder(null)}
          onOrderChange={invalidate}
        />
      )}
    </div>
  );
}

// ── Dashboard Active Orders Widget ─────────────────────────────────────────────
export function ActiveOrdersWidget() {
  const [selectedOrder, setSelectedOrder] = useState<ClinicalOrderData | null>(null);

  const { data: orders = [], isLoading, refetch } = useQuery<ClinicalOrderData[]>({
    queryKey: ["/api/clinical-orders/active"],
    refetchInterval: 30_000,
  });

  const [collapsed, setCollapsed] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/clinical-orders/active"] });
    if (selectedOrder) {
      refetch().then((r) => {
        const updated = r.data?.find((o) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
        else setSelectedOrder(null);
      });
    }
  }

  return (
    <div className="rounded-lg border shadow-sm" style={{ borderColor: "#d4c9b5", backgroundColor: "#fdfaf3" }}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setCollapsed((v) => !v)}
        data-testid="button-toggle-orders-widget"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Active Orders & Referrals</span>
          {orders.length > 0 && (
            <span
              className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: "#5a7040", color: "#ffffff" }}
              data-testid="badge-active-orders-count"
            >
              {orders.length}
            </span>
          )}
        </div>
        <ChevronDown
          className="w-4 h-4 transition-transform"
          style={{ color: "#5a7040", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
        />
      </button>

      {!collapsed && (
        <div className="border-t" style={{ borderColor: "#d4c9b5" }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm" style={{ color: "#7a8a64" }}>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : orders.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "#7a8a64" }}>
              <ClipboardList className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
              No active orders or referrals
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "#e8dfc8" }}>
              {orders.map((order) => {
                const typeConfig = ORDER_TYPE_CONFIG[order.orderType] ?? ORDER_TYPE_CONFIG.referral;
                const { done, total } = getTaskProgress(order);
                const days = daysSince(order.createdAt);
                const pctDone = total > 0 ? (done / total) * 100 : 0;

                return (
                  <button
                    key={order.id}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-black/[0.02] transition-colors"
                    onClick={() => setSelectedOrder(order)}
                    data-testid={`button-dashboard-order-${order.id}`}
                  >
                    <typeConfig.Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#5a7040" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-sm font-medium" style={{ color: "#1c2414" }}>
                          {order.patientFirstName} {order.patientLastName}
                        </span>
                        <Badge className={cn("text-[10px] px-1.5 py-0", typeConfig.color)}>{typeConfig.shortLabel}</Badge>
                        {order.priority !== "routine" && (
                          <Badge className={cn("text-[10px] px-1.5 py-0", PRIORITY_CONFIG[order.priority]?.color)}>
                            {PRIORITY_CONFIG[order.priority]?.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs truncate" style={{ color: "#7a8a64" }}>
                        {order.subtype}{order.referringTo ? ` · ${order.referringTo}` : ""}
                      </p>
                      {/* Progress bar */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-black/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pctDone}%`, backgroundColor: pctDone === 100 ? "#2e7d32" : "#5a7040" }}
                          />
                        </div>
                        <span className="text-[10px] whitespace-nowrap" style={{ color: "#7a8a64" }}>
                          {done}/{total} · {days}d
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          patientName={`${selectedOrder.patientFirstName ?? ""} ${selectedOrder.patientLastName ?? ""}`.trim()}
          onClose={() => setSelectedOrder(null)}
          onOrderChange={invalidate}
        />
      )}
    </div>
  );
}
