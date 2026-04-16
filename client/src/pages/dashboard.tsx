import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useFirstVisitTour } from "@/components/product-tour";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FlaskConical,
  HeartPulse,
  ChevronRight,
  Settings,
  MessageSquare,
  ShoppingBag,
  CheckCircle2,
  Bell,
  ArrowRight,
  Package,
  Clock,
  Users,
  Stethoscope,
  Pill,
  ClipboardList,
  Download,
  FileText,
  X,
  Loader2,
} from "lucide-react";
import jsPDF from "jspdf";
import type { Patient } from "@shared/schema";

interface UnreadMessageRow {
  patientId: number;
  patientFirstName: string;
  patientLastName: string;
  count: number;
  lastAt: string;
}

interface PendingOrderRow {
  id: number;
  patientId: number;
  patientFirstName: string;
  patientLastName: string;
  items: Array<{ name: string; dose: string; quantity: number; lineTotal: number }>;
  subtotal: string;
  status: string;
  patientNotes: string | null;
  createdAt: string;
}

interface PendingSubmissionRow {
  id: number;
  formId: number;
  submitterName: string | null;
  submitterEmail: string | null;
  reviewStatus: string;
  syncStatus: string;
  submittedAt: string;
  formName?: string;
}

interface NotificationsData {
  unreadMessages: UnreadMessageRow[];
  pendingOrders: PendingOrderRow[];
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string) {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PatientInitials({ first, last, gender }: { first: string; last: string; gender?: string }) {
  const bg = gender === "female" ? "#9f4b5e" : "#2e3a20";
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
      style={{ backgroundColor: bg }}
    >
      {first[0]}{last[0]}
    </div>
  );
}

interface SubmissionField {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  sectionId: number | null;
  orderIndex: number;
}

interface SubmissionSection {
  id: number;
  title: string;
  orderIndex: number;
}

interface SubmissionDetail {
  id: number;
  formId: number;
  submitterName: string | null;
  submitterEmail: string | null;
  submittedAt: string;
  reviewStatus: string;
  syncStatus: string;
  rawSubmissionJson: Record<string, any>;
  form: { name: string; category: string; description: string | null } | null;
  fields: SubmissionField[];
  sections: SubmissionSection[];
  syncEvents: any[];
}

function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u2013/g, '-').replace(/\u2014/g, '--')
    .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"').replace(/\u201D/g, '"')
    .replace(/\u2026/g, '...').replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*').replace(/[^\x00-\xFF]/g, ' ');
}

function generateSubmissionPdf(detail: SubmissionDetail, clinicName: string) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const PAGE_W = 215.9;
  const PAGE_H = 279.4;
  const M = 20;
  const CW = PAGE_W - M * 2;
  const GREEN = "#2e3a20";
  let y = M;

  function checkPage(need: number) {
    if (y + need > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
  }

  doc.setFontSize(18);
  doc.setTextColor(GREEN);
  doc.setFont("helvetica", "bold");
  doc.text(clinicName || "ClinIQ", M, y);
  y += 8;

  doc.setFontSize(14);
  doc.text(detail.form?.name ?? "Form Submission", M, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor("#666666");
  doc.setFont("helvetica", "normal");
  const submittedDate = new Date(detail.submittedAt).toLocaleString();
  doc.text(`Submitted: ${submittedDate}`, M, y);
  y += 5;
  if (detail.submitterName) {
    doc.text(`Patient: ${sanitizeForPdf(detail.submitterName)}`, M, y);
    y += 5;
  }
  if (detail.submitterEmail) {
    doc.text(`Email: ${sanitizeForPdf(detail.submitterEmail)}`, M, y);
    y += 5;
  }

  doc.setDrawColor("#cccccc");
  doc.setLineWidth(0.4);
  doc.line(M, y, PAGE_W - M, y);
  y += 8;

  const sortedSections = [...(detail.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedFields = [...(detail.fields ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const unsectionedFields = sortedFields.filter(f => !f.sectionId);
  const data = detail.rawSubmissionJson ?? {};

  function renderFields(fields: SubmissionField[]) {
    for (const field of fields) {
      const value = data[field.fieldKey];
      if (value === undefined || value === null || value === "") continue;
      const displayValue = sanitizeForPdf(Array.isArray(value) ? value.join(", ") : String(value));

      checkPage(14);
      doc.setFontSize(8);
      doc.setTextColor("#888888");
      doc.setFont("helvetica", "bold");
      doc.text(sanitizeForPdf(field.label), M, y);
      y += 4;

      doc.setFontSize(10);
      doc.setTextColor("#222222");
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(displayValue, CW);
      doc.text(lines, M, y);
      y += lines.length * 4.5 + 4;
    }
  }

  if (unsectionedFields.length > 0) {
    renderFields(unsectionedFields);
  }

  for (const section of sortedSections) {
    const sectionFields = sortedFields.filter(f => f.sectionId === section.id);
    if (sectionFields.length === 0) continue;
    const hasValues = sectionFields.some(f => {
      const v = data[f.fieldKey];
      return v !== undefined && v !== null && v !== "";
    });
    if (!hasValues) continue;

    checkPage(14);
    doc.setDrawColor("#e0e0e0");
    doc.setLineWidth(0.2);
    doc.line(M, y, PAGE_W - M, y);
    y += 6;

    doc.setFontSize(12);
    doc.setTextColor(GREEN);
    doc.setFont("helvetica", "bold");
    doc.text(sanitizeForPdf(section.title), M, y);
    y += 7;

    renderFields(sectionFields);
  }

  const filename = `${(detail.form?.name ?? "submission").replace(/\s+/g, "_")}_${detail.submitterName?.replace(/\s+/g, "_") ?? detail.id}.pdf`;
  doc.save(filename);
}

function FormSubmissionPreviewDialog({
  submissionId,
  onClose,
  clinicName,
}: {
  submissionId: number | null;
  onClose: () => void;
  clinicName: string;
}) {
  const { data: detail, isLoading } = useQuery<SubmissionDetail>({
    queryKey: ["/api/form-submissions", submissionId],
    queryFn: () => fetch(`/api/form-submissions/${submissionId}`).then(r => r.json()),
    enabled: !!submissionId,
  });

  const sortedSections = [...(detail?.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedFields = [...(detail?.fields ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const unsectionedFields = sortedFields.filter(f => !f.sectionId);
  const data = detail?.rawSubmissionJson ?? {};

  function renderFieldGroup(fields: SubmissionField[]) {
    return fields.map(field => {
      const value = data[field.fieldKey];
      if (value === undefined || value === null || value === "") return null;
      return (
        <div key={field.id} className="py-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#7a8a64" }}>{field.label}</p>
          <p className="text-sm mt-0.5" style={{ color: "#1c2414" }}>
            {Array.isArray(value) ? value.join(", ") : String(value)}
          </p>
        </div>
      );
    });
  }

  return (
    <Dialog open={!!submissionId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-submission-preview">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" style={{ color: "#2e3a20" }} />
              <DialogTitle className="text-lg" style={{ color: "#2e3a20" }}>
                {detail?.form?.name ?? "Form Submission"}
              </DialogTitle>
            </div>
            {detail && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateSubmissionPdf(detail, clinicName)}
                data-testid="button-download-submission-pdf"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7a8a64" }} />
          </div>
        ) : detail ? (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-1 pb-2">
              <div className="flex items-center gap-4 flex-wrap text-sm" style={{ color: "#666" }}>
                <span>Submitted: {new Date(detail.submittedAt).toLocaleString()}</span>
                {detail.submitterName && <span>Patient: <strong style={{ color: "#1c2414" }}>{detail.submitterName}</strong></span>}
              </div>
              {detail.submitterEmail && (
                <p className="text-xs" style={{ color: "#999" }}>{detail.submitterEmail}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={detail.reviewStatus === "reviewed" ? "default" : "secondary"} data-testid="badge-review-status">
                  {detail.reviewStatus}
                </Badge>
                <Badge variant={detail.syncStatus === "synced" ? "default" : "outline"} data-testid="badge-sync-status">
                  {detail.syncStatus === "synced" ? "Synced" : "Not synced"}
                </Badge>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-1">
              {unsectionedFields.length > 0 && renderFieldGroup(unsectionedFields)}

              {sortedSections.map(section => {
                const sectionFields = sortedFields.filter(f => f.sectionId === section.id);
                const hasValues = sectionFields.some(f => {
                  const v = data[f.fieldKey];
                  return v !== undefined && v !== null && v !== "";
                });
                if (!hasValues) return null;
                return (
                  <div key={section.id} className="pt-3">
                    <h3 className="text-sm font-bold mb-2" style={{ color: "#2e3a20" }}>{section.title}</h3>
                    <Separator className="mb-2" />
                    {renderFieldGroup(sectionFields)}
                  </div>
                );
              })}
            </div>

            {detail.syncEvents?.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: "#2e3a20" }}>Sync Log</h3>
                  <div className="space-y-1">
                    {detail.syncEvents.map((e: any) => (
                      <div key={e.id} className="text-xs flex items-center gap-2">
                        {e.resultStatus === "success"
                          ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                          : <X className="h-3 w-3 text-amber-500" />}
                        <span style={{ color: "#888" }}>{e.targetDomain}:</span>
                        <span>{(e.detailsJson as any)?.item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </ScrollArea>
        ) : (
          <div className="py-12 text-center text-sm" style={{ color: "#999" }}>Submission not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [previewSubId, setPreviewSubId] = useState<number | null>(null);
  useFirstVisitTour();

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients/search"],
    queryFn: async () => {
      const res = await fetch("/api/patients/search", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load patients");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const { data: notifications, isLoading: notifLoading } = useQuery<NotificationsData>({
    queryKey: ["/api/clinician/notifications"],
    refetchInterval: 20 * 1000,
  });

  const fulfillOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiRequest("PATCH", `/api/supplement-orders/${orderId}/status`, { status: "fulfilled" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinician/notifications"] });
    },
  });

  const { data: pendingSubmissions = [] } = useQuery<PendingSubmissionRow[]>({
    queryKey: ["/api/intake-forms/submissions/pending"],
    refetchInterval: 30 * 1000,
  });

  const unreadMessages = notifications?.unreadMessages ?? [];
  const pendingOrders = notifications?.pendingOrders ?? [];
  const totalNotifications = unreadMessages.length + pendingOrders.length + pendingSubmissions.length;

  const goToPatient = (patientId: number, tab?: "messages" | "orders") => {
    setLocation(tab ? `/patients?patient=${patientId}&tab=${tab}` : `/patients?patient=${patientId}`);
  };

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f5f2ed" }}>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Greeting ────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>
            {getGreeting()}, {user?.title} {user?.lastName}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#7a8a64" }}>
            {patients.length} patient{patients.length !== 1 ? "s" : ""} · {user?.clinicName}
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════
            NOTIFICATION CENTER — always visible, full width
        ══════════════════════════════════════════════════════════ */}
        <div id="notifications-anchor" data-testid="notifications-panel">
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: totalNotifications > 0 ? "#2e3a20" : "#d4c9b5" }}>
                <Bell className="w-4 h-4" style={{ color: totalNotifications > 0 ? "#e8ddd0" : "#7a8a64" }} />
              </div>
              <span className="text-base font-semibold" style={{ color: "#1c2414" }}>Notifications</span>
              {totalNotifications > 0 && (
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: "#c0392b" }}
                >
                  {totalNotifications}
                </span>
              )}
            </div>
            {totalNotifications === 0 && !notifLoading && (
              <span className="text-xs" style={{ color: "#a0a880" }}>All clear</span>
            )}
          </div>

          {/* Three-column grid: Messages | Orders | Submissions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── Messages column ────────────────────────────────── */}
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}>
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#ede8df", backgroundColor: unreadMessages.length > 0 ? "#edf4e4" : "#faf8f5" }}>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" style={{ color: unreadMessages.length > 0 ? "#2e3a20" : "#a0a880" }} />
                  <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Patient Messages</span>
                  {unreadMessages.length > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}>
                      {unreadMessages.reduce((s, r) => s + r.count, 0)} unread
                    </span>
                  )}
                </div>
                <button
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: "#2e3a20" }}
                  onClick={() => setLocation("/patients")}
                >
                  All patients <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Message rows */}
              {notifLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2].map(i => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: "#f0ece5" }} />)}
                </div>
              ) : unreadMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <CheckCircle2 className="w-7 h-7 mb-2" style={{ color: "#b0c090" }} />
                  <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>No unread messages</p>
                  <p className="text-xs mt-0.5" style={{ color: "#a0a880" }}>Patient replies will appear here</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
                  {unreadMessages.map((row) => (
                    <button
                      key={`msg-${row.patientId}`}
                      data-testid={`notification-message-${row.patientId}`}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f4f8ee")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                      onClick={() => goToPatient(row.patientId, "messages")}
                    >
                      <PatientInitials first={row.patientFirstName} last={row.patientLastName} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                          {row.patientFirstName} {row.patientLastName}
                        </p>
                        <p className="text-xs" style={{ color: "#7a8a64" }}>
                          {row.count} unread message{row.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs" style={{ color: "#a0a880" }}>{timeAgo(row.lastAt)}</span>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#2e3a20" }} />
                        <ChevronRight className="w-4 h-4" style={{ color: "#c4b9a5" }} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Orders column ───────────────────────────────────── */}
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}>
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#ede8df", backgroundColor: pendingOrders.length > 0 ? "#fef8ed" : "#faf8f5" }}>
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4" style={{ color: pendingOrders.length > 0 ? "#7a5c20" : "#a0a880" }} />
                  <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Supplement Orders</span>
                  {pendingOrders.length > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#7a5c20", color: "#fef8ed" }}>
                      {pendingOrders.length} pending
                    </span>
                  )}
                </div>
                <button
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: "#7a5c20" }}
                  onClick={() => setLocation("/patients")}
                >
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Order rows */}
              {notifLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2].map(i => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: "#f0ece5" }} />)}
                </div>
              ) : pendingOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <Package className="w-7 h-7 mb-2" style={{ color: "#c4b9a5" }} />
                  <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>No pending orders</p>
                  <p className="text-xs mt-0.5" style={{ color: "#a0a880" }}>Patient supplement orders will appear here</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
                  {pendingOrders.map((order) => (
                    <div
                      key={`order-${order.id}`}
                      data-testid={`notification-order-${order.id}`}
                      className="px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <PatientInitials first={order.patientFirstName} last={order.patientLastName} />
                        <div className="flex-1 min-w-0">
                          <button
                            className="w-full text-left"
                            onClick={() => goToPatient(order.patientId, "orders")}
                          >
                            <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                              {order.patientFirstName} {order.patientLastName}
                            </p>
                            <p className="text-xs" style={{ color: "#7a8a64" }}>
                              {order.items.length} item{order.items.length !== 1 ? "s" : ""} · ${parseFloat(order.subtotal).toFixed(2)} total
                            </p>
                            {/* Item preview */}
                            <p className="text-xs truncate mt-0.5" style={{ color: "#a0a880" }}>
                              {order.items.slice(0, 2).map(i => i.name).join(", ")}
                              {order.items.length > 2 ? ` +${order.items.length - 2} more` : ""}
                            </p>
                          </button>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center gap-1 text-xs" style={{ color: "#a0a880" }}>
                              <Clock className="w-3 h-3" />
                              {formatDate(order.createdAt)}
                            </div>
                            <div className="flex-1" />
                            <Button
                              size="sm"
                              data-testid={`button-fulfill-order-${order.id}`}
                              className="h-7 px-3 text-xs gap-1.5"
                              style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                              onClick={() => fulfillOrderMutation.mutate(order.id)}
                              disabled={fulfillOrderMutation.isPending}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark fulfilled
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => goToPatient(order.patientId, "orders")}
                            >
                              View <ChevronRight className="w-3 h-3 ml-0.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Submissions column ──────────────────────────────── */}
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#ede8df", backgroundColor: pendingSubmissions.length > 0 ? "#eef0ff" : "#faf8f5" }}>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" style={{ color: pendingSubmissions.length > 0 ? "#4a5568" : "#a0a880" }} />
                  <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Form Submissions</span>
                  {pendingSubmissions.length > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#4a5568", color: "#eef0ff" }}>
                      {pendingSubmissions.length} pending
                    </span>
                  )}
                </div>
                <button
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: "#4a5568" }}
                  onClick={() => setLocation("/intake-forms")}
                >
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {notifLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2].map(i => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: "#f0ece5" }} />)}
                </div>
              ) : pendingSubmissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <ClipboardList className="w-7 h-7 mb-2" style={{ color: "#c4b9a5" }} />
                  <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>No pending submissions</p>
                  <p className="text-xs mt-0.5" style={{ color: "#a0a880" }}>Patient form submissions will appear here</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
                  {pendingSubmissions.slice(0, 5).map((sub) => (
                    <button
                      key={`sub-${sub.id}`}
                      data-testid={`notification-submission-${sub.id}`}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f4f6ff")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                      onClick={() => setPreviewSubId(sub.id)}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{ backgroundColor: "#e8e4f0", color: "#4a5568" }}
                      >
                        {(sub.submitterName ?? "A")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                          {sub.submitterName ?? "Anonymous"}
                        </p>
                        <p className="text-xs truncate" style={{ color: "#7a8a64" }}>
                          {(sub as any).formName ?? "Form submission"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs" style={{ color: "#a0a880" }}>{timeAgo(sub.submittedAt)}</span>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#4a5568" }} />
                        <ChevronRight className="w-4 h-4" style={{ color: "#c4b9a5" }} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Encounters quick link ─────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#a0a880" }}>Clinical Documentation</p>
          <button
            data-testid="card-encounters"
            className="w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
            style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#2e3a20"; (e.currentTarget as HTMLElement).style.backgroundColor = "#f4f8ee"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d4c9b5"; (e.currentTarget as HTMLElement).style.backgroundColor = "#ffffff"; }}
            onClick={() => setLocation("/encounters")}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#edf4e4" }}>
              <Stethoscope className="w-6 h-6" style={{ color: "#2e3a20" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: "#1c2414" }}>Encounter Documentation</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7a8a64" }}>Audio transcription, AI SOAP notes, patient visit summaries</p>
            </div>
            <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "#c4b9a5" }} />
          </button>
        </div>

        {/* ── Quick actions ────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#a0a880" }}>Lab Evaluations</p>
          <div data-testid="quick-actions-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Men's */}
            <button
              data-testid="card-male-eval"
              className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
              style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#2e3a20"; (e.currentTarget as HTMLElement).style.backgroundColor = "#f4f8ee"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d4c9b5"; (e.currentTarget as HTMLElement).style.backgroundColor = "#ffffff"; }}
              onClick={() => setLocation("/male")}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#edf4e4" }}>
                <FlaskConical className="w-6 h-6" style={{ color: "#2e3a20" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "#1c2414" }}>Male Lab Evaluation</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7a8a64" }}>Testosterone, metabolic, cardiovascular, PSA, thyroid</p>
              </div>
              <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "#c4b9a5" }} />
            </button>

            {/* Women's */}
            <button
              data-testid="card-female-eval"
              className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
              style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#9f4b5e"; (e.currentTarget as HTMLElement).style.backgroundColor = "#fdf0f3"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d4c9b5"; (e.currentTarget as HTMLElement).style.backgroundColor = "#ffffff"; }}
              onClick={() => setLocation("/female")}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#fce8ed" }}>
                <HeartPulse className="w-6 h-6" style={{ color: "#9f4b5e" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "#1c2414" }}>Female Lab Evaluation</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7a8a64" }}>Hormonal, SHBG, AMH, menstrual phase, thyroid, metabolic</p>
              </div>
              <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "#c4b9a5" }} />
            </button>
          </div>
        </div>

        {/* ── Recent patients strip ────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#a0a880" }}>Recent Patients</p>
            <button
              className="text-xs font-medium flex items-center gap-1"
              style={{ color: "#2e3a20" }}
              onClick={() => setLocation("/patients")}
              data-testid="button-all-patients"
            >
              <Users className="w-3 h-3" />
              All {patients.length} patients
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {patients.length === 0 ? (
            <div className="rounded-xl border py-8 text-center" style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}>
              <Users className="w-8 h-8 mx-auto mb-2" style={{ color: "#c4b9a5" }} />
              <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>No patients yet</p>
              <p className="text-xs mt-1" style={{ color: "#a0a880" }}>Patient profiles are created automatically after a lab evaluation</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}>
              {patients.slice(0, 6).map((patient, idx) => (
                <button
                  key={patient.id}
                  data-testid={`card-patient-${patient.id}`}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-t first:border-t-0"
                  style={{ borderColor: "#f0ece5", backgroundColor: "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f9f6f2")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                  onClick={() => goToPatient(patient.id)}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: patient.gender === "female" ? "#9f4b5e" : "#2e3a20" }}
                  >
                    {patient.firstName[0]}{patient.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#1c2414" }}>
                      {patient.firstName} {patient.lastName}
                    </p>
                    <p className="text-xs" style={{ color: "#a0a880" }}>
                      {patient.gender === "female" ? "Women's Clinic" : "Men's Clinic"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#c4b9a5" }} />
                </button>
              ))}
              {patients.length > 6 && (
                <button
                  className="w-full text-center py-3 text-xs font-medium border-t"
                  style={{ borderColor: "#f0ece5", color: "#7a8a64", backgroundColor: "#faf8f5" }}
                  onClick={() => setLocation("/patients")}
                >
                  View all {patients.length} patients →
                </button>
              )}
            </div>
          )}
        </div>

      </main>

      <FormSubmissionPreviewDialog
        submissionId={previewSubId}
        onClose={() => setPreviewSubId(null)}
        clinicName={(user as any)?.clinicName ?? "ClinIQ"}
      />
    </div>
  );
}
