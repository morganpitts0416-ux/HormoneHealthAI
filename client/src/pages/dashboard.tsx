import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Users,
  Pill,
  ClipboardList,
  FileText,
  X,
  Calendar,
  Clock,
} from "lucide-react";
import type { Patient } from "@shared/schema";
import { FormSubmissionPreviewDialog } from "@/components/form-submission-preview";
import { PatientSearchBar } from "@/components/patient-search-bar";

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

  const markReviewedMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("PATCH", `/api/intake-forms/submissions/${submissionId}/review`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/all"] });
    },
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

        {/* ── Greeting + Patient Search ────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>
              {getGreeting()}, {user?.title} {user?.lastName}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#7a8a64" }}>
              {patients.length} patient{patients.length !== 1 ? "s" : ""} · {user?.clinicName}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <PatientSearchBar className="w-full sm:w-80" />
            <Button
              variant="outline"
              onClick={() => setLocation("/patients")}
              data-testid="button-all-patients-header"
              className="flex-shrink-0"
            >
              <Users className="w-4 h-4 mr-2" />
              All Patients
            </Button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            TODAY'S APPOINTMENTS — standalone block, NOT a notification.
            Kept separate so the Notifications count badge below cannot
            be mistaken for an alert on this widget.
        ══════════════════════════════════════════════════════════ */}
        <TodaysAppointmentsWidget />

        {/* ══════════════════════════════════════════════════════════
            NOTIFICATION CENTER — always visible, full width.
            The header's total badge is intentionally a quiet summary;
            each column below has its own count badge in its header so
            the visual cue lands on the box that actually needs action.
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
                  className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: "#e8ddd0", color: "#2e3a20" }}
                  data-testid="badge-notifications-total"
                >
                  {totalNotifications} total
                </span>
              )}
            </div>
            {totalNotifications === 0 && !notifLoading && (
              <span className="text-xs" style={{ color: "#a0a880" }}>All clear</span>
            )}
          </div>

          {/* Three-column grid: Messages | Orders | Submissions
              Each column header carries its OWN count badge in brand-
              specific colors (green / amber / blue). That is where the
              attention should land — not on the section-level total. */}
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
                  onClick={() => setLocation("/form-submissions")}
                  data-testid="button-view-all-submissions"
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
                    <div
                      key={`sub-${sub.id}`}
                      data-testid={`notification-submission-${sub.id}`}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f4f6ff")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                      onClick={() => setPreviewSubId(sub.id)}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{ backgroundColor: "#e8e4f0", color: "#4a5568" }}
                      >
                        {(sub.submitterName?.trim()?.[0] ?? "A").toUpperCase()}
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
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid={`button-dismiss-submission-${sub.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            markReviewedMutation.mutate(sub.id);
                          }}
                          disabled={markReviewedMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Quick Actions ────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#a0a880" }}>Quick Actions</p>
          <div data-testid="quick-actions-grid" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7a8a64" }}>Testosterone, metabolic, PSA, thyroid</p>
              </div>
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
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7a8a64" }}>Hormonal, AMH, thyroid, metabolic</p>
              </div>
            </button>

          </div>
        </div>

      </main>

      <FormSubmissionPreviewDialog
        submissionId={previewSubId}
        onClose={() => setPreviewSubId(null)}
        clinic={{
          clinicName: (user as any)?.clinicName ?? "ClinIQ",
          clinicLogo: (user as any)?.clinicLogo ?? null,
          phone: (user as any)?.phone ?? null,
          address: (user as any)?.address ?? null,
          email: (user as any)?.email ?? null,
        }}
      />
    </div>
  );
}

function TodaysAppointmentsWidget() {
  const [, setLocation] = useLocation();
  const { start, end } = (() => {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  })();
  const { data: appts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/appointments/range", "today", start.toDateString()],
    queryFn: async () => {
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      const r = await fetch(`/api/appointments/range?${params}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const sorted = [...appts]
    .filter(a => a.status !== "cancelled" && a.status !== "no_show")
    .sort((a, b) => +new Date(a.appointmentStart) - +new Date(b.appointmentStart));

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#ede8df", backgroundColor: "#faf8f5" }}>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" style={{ color: sorted.length > 0 ? "#2e3a20" : "#a0a880" }} />
          <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Today's Appointments</span>
          {sorted.length > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}>
              {sorted.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setLocation("/appointments")}
          className="text-xs font-medium hover:underline"
          style={{ color: "#5a7040" }}
          data-testid="link-view-schedule"
        >
          View schedule →
        </button>
      </div>
      <div className="p-3">
        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!isLoading && sorted.length === 0 && (
          <div className="text-sm text-muted-foreground py-4 text-center">No appointments today.</div>
        )}
        {sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sorted.slice(0, 9).map((a: any) => {
              const t = new Date(a.appointmentStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              return (
                <div key={a.id} className="border rounded-md px-3 py-2 hover-elevate cursor-pointer" onClick={() => setLocation("/appointments")} data-testid={`row-today-appt-${a.id}`}>
                  <div className="text-xs font-semibold" style={{ color: "#5a7040" }}>{t}</div>
                  <div className="text-sm font-medium truncate" style={{ color: "#1c2414" }}>
                    {a.patientName || a.serviceType || "Appointment"}
                  </div>
                  {a.serviceType && a.patientName && (
                    <div className="text-xs text-muted-foreground truncate">{a.serviceType}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
