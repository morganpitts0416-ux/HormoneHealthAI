import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useClinicBranding } from "@/hooks/use-clinic-branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFirstVisitTour } from "@/components/product-tour";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FlaskConical,
  HeartPulse,
  ChevronRight,
  ChevronDown,
  Settings,
  ShoppingBag,
  CheckCircle2,
  Bell,
  ArrowRight,
  Users,
  Pill,
  ClipboardList,
  FileText,
  X,
  Calendar,
  Clock,
  Loader2,
  UserPlus,
  Upload,
  MessageCircle,
  ExternalLink,
  AlertCircle,
  Stethoscope,
  UserCheck,
  UserX,
} from "lucide-react";
import type { Patient } from "@shared/schema";
import { FormSubmissionPreviewDialog } from "@/components/form-submission-preview";
import { PatientSearchBar } from "@/components/patient-search-bar";
import { AddPatientDialog } from "@/components/add-patient-dialog";

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

interface PendingRefillRequestRow {
  id: number;
  patientId: number | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  title: string;
  message: string;
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

interface SpruceWorkflowRequestRow {
  id: number;
  clinicId: number;
  spruceMessageId: number | null;
  patientId: number | null;
  workflow: string;
  status: string;
  patientPhone: string | null;
  patientNameExtracted: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  requestSummary: string | null;
  spruceConversationUrl: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface NotificationsData {
  unreadMessages: UnreadMessageRow[];
  pendingOrders: PendingOrderRow[];
  pendingRefillRequests: PendingRefillRequestRow[];
  pendingSpruceRequests: SpruceWorkflowRequestRow[];
}

interface OpenEncounterRow {
  kind: "encounter";
  id: number;
  clinicianId: number;
  patientId: number;
  visitDate: string;
  visitType: string;
  noteType: string | null;
  chiefComplaint: string | null;
  soapGeneratedAt: string | null;
  updatedAt: string;
  patientFirstName: string;
  patientLastName: string;
}

interface OpenDraftRow {
  kind: "draft";
  id: number;
  clinicianId: number;
  transcription: string;
  visitDate: string;
  visitType: string;
  createdAt: string;
}

type OpenNoteItem = OpenEncounterRow | OpenDraftRow;

interface ClinicUser {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  kind: "provider" | "staff";
  displayName: string;
}


const SPRUCE_WORKFLOW_LABELS: Record<string, string> = {
  medication_refill: "Medication refill request",
  intake_form: "Intake form request",
  new_patient: "New patient inquiry",
  appointment: "Appointment request",
  lab_question: "Lab question",
  billing: "Billing / membership",
  urgent_safety: "Urgent — safety concern",
  unclassified: "Inbound message",
};

// ── CollapsibleQueueTile ──────────────────────────────────────────────────────
// Dashboard workflow queue tile. All tiles start collapsed by default.
// Count badge is always visible in the header — even when collapsed.
// Clicking the header row toggles expand/collapse; "View all" link is separate.

function CollapsibleQueueTile({
  icon,
  label,
  count,
  countLabel,
  accentColor,
  accentBg,
  viewAllLabel,
  onViewAll,
  isLoading,
  testId,
  isEmpty,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  countLabel?: string;
  accentColor: string;
  accentBg: string;
  viewAllLabel: string;
  onViewAll: () => void;
  isLoading: boolean;
  testId: string;
  isEmpty: boolean;
  emptyLabel: string;
  children?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}
      data-testid={testId}
    >
      {/* Tile header — click anywhere to toggle */}
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
        style={{ backgroundColor: !isEmpty ? accentBg : "#faf8f5" }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: !isEmpty ? accentColor : "#a0a880" }} className="flex-shrink-0">{icon}</span>
          <span className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>{label}</span>
          {count > 0 && (
            <span
              className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: accentColor, color: accentBg }}
            >
              {count}
            </span>
          )}
          {countLabel && count > 0 && (
            <span className="text-xs hidden sm:inline flex-shrink-0" style={{ color: accentColor }}>{countLabel}</span>
          )}
        </div>
        <div
          className="flex items-center gap-2 flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <button
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: accentColor }}
            onClick={onViewAll}
          >
            {viewAllLabel} <ArrowRight className="w-3 h-3" />
          </button>
          <ChevronDown
            className="w-4 h-4 transition-transform"
            style={{
              color: accentColor,
              transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
            }}
          />
        </div>
      </div>

      {/* Body — hidden when collapsed */}
      {!collapsed && (
        isLoading ? (
          <div className="space-y-2 p-3">
            {[1, 2].map(i => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ backgroundColor: "#f0ece5" }} />)}
          </div>
        ) : isEmpty ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#b0c090" }} />
            <p className="text-sm" style={{ color: "#a0a880" }}>{emptyLabel}</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
            {children}
          </div>
        )
      )}
    </div>
  );
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
  const { data: clinicBrandingFull } = useClinicBranding();
  const [, setLocation] = useLocation();
  const [previewSubId, setPreviewSubId] = useState<number | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  useFirstVisitTour();

  const [selectedSpruceRequest, setSelectedSpruceRequest] = useState<SpruceWorkflowRequestRow | null>(null);
  const [notesCollapsed, setNotesCollapsed] = useState(true);

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

  const updateSpruceRequestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/spruce-requests/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinician/notifications"] });
      setSelectedSpruceRequest(null);
    },
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

  // Mark a med-refill request "handled" by dismissing the underlying inbox
  // notification. Same endpoint the inbox page uses, so the two views stay in
  // sync.
  const dismissRefillMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await apiRequest("DELETE", `/api/clinician/inbox-notifications/${notificationId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinician/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications/unread-count"] });
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

  const pendingOrders = notifications?.pendingOrders ?? [];
  const pendingRefillRequests = notifications?.pendingRefillRequests ?? [];
  const pendingSpruceRequests = notifications?.pendingSpruceRequests ?? [];

  // ── Categorize Spruce requests by workflow so each tile gets only its items ──
  const medicationSpruceRequests = pendingSpruceRequests.filter(r => r.workflow === "medication_refill");
  const appointmentSpruceRequests = pendingSpruceRequests.filter(r => r.workflow === "appointment");
  const urgentSpruceRequests = pendingSpruceRequests.filter(r => r.workflow === "urgent_safety");
  // Medication & Supplement tile: orders + portal refills + Spruce medication_refill only.
  type CombinedRequestRow =
    | { kind: "order"; sortAt: number; row: PendingOrderRow }
    | { kind: "refill"; sortAt: number; row: PendingRefillRequestRow }
    | { kind: "spruce"; sortAt: number; row: SpruceWorkflowRequestRow };
  const combinedRequests: CombinedRequestRow[] = [
    ...pendingOrders.map(o => ({
      kind: "order" as const,
      sortAt: new Date(o.createdAt).getTime() || 0,
      row: o,
    })),
    ...pendingRefillRequests.map(r => ({
      kind: "refill" as const,
      sortAt: new Date(r.createdAt).getTime() || 0,
      row: r,
    })),
    ...medicationSpruceRequests.map(s => ({
      kind: "spruce" as const,
      sortAt: new Date(s.createdAt).getTime() || 0,
      row: s,
    })),
  ].sort((a, b) => b.sortAt - a.sortAt);

  const totalNotifications =
    combinedRequests.length +
    appointmentSpruceRequests.length + urgentSpruceRequests.length +
    pendingSubmissions.length;

  // ── Open SOAP Notes (unsigned encounters) — provider-scoped, switchable.
  // Defaults to the signed-in user; the Select lets you view another
  // clinician's open notes (e.g. an MA reviewing a provider's queue).
  const [openNotesProviderId, setOpenNotesProviderId] = useState<number | null>(null);
  const effectiveOpenNotesProviderId = openNotesProviderId ?? user?.id ?? null;

  const { data: clinicUsers = [] } = useQuery<ClinicUser[]>({
    queryKey: ["/api/clinic/users"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: openNotes = [], isLoading: openNotesLoading } = useQuery<OpenNoteItem[]>({
    queryKey: ["/api/encounters/open", effectiveOpenNotesProviderId],
    queryFn: async () => {
      const url = effectiveOpenNotesProviderId
        ? `/api/encounters/open?providerId=${effectiveOpenNotesProviderId}`
        : `/api/encounters/open`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load open notes");
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 60 * 1000,
  });

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
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <PatientSearchBar className="w-full sm:w-80" />
            <Button
              onClick={() => setShowAddPatient(true)}
              data-testid="button-add-patient-header"
              className="flex-shrink-0"
              style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              New Patient
            </Button>
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

        <AddPatientDialog
          open={showAddPatient}
          onOpenChange={setShowAddPatient}
          onCreated={(p) => setLocation(`/patients?patient=${p.id}`)}
        />

        {/* ══════════════════════════════════════════════════════════
            TODAY'S APPOINTMENTS — standalone block, NOT a notification.
            Kept separate so the Notifications count badge below cannot
            be mistaken for an alert on this widget.
        ══════════════════════════════════════════════════════════ */}
        <TodaysAppointmentsWidget />

        {/* ══════════════════════════════════════════════════════════
            OPEN SOAP NOTES — collapsible, collapsed by default.
        ══════════════════════════════════════════════════════════ */}
        <div
          className="rounded-xl overflow-hidden border"
          style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}
          data-testid="open-notes-panel"
        >
          {/* Collapsible header */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
            style={{ backgroundColor: openNotes.length > 0 ? "#edf4e4" : "#faf8f5" }}
            onClick={() => setNotesCollapsed(c => !c)}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 flex-shrink-0" style={{ color: openNotes.length > 0 ? "#2e3a20" : "#a0a880" }} />
              <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Open SOAP Notes</span>
              {openNotes.length > 0 && (
                <span
                  className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: "#c0392b", color: "#ffffff" }}
                  data-testid="badge-open-notes-count"
                >
                  {openNotes.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <span className="text-xs" style={{ color: "#7a8a64" }}>Provider</span>
              <Select
                value={String(effectiveOpenNotesProviderId ?? "")}
                onValueChange={(v) => setOpenNotesProviderId(v ? Number(v) : null)}
              >
                <SelectTrigger
                  className="w-44 h-8 text-xs"
                  style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5", color: "#1c2414" }}
                  data-testid="select-open-notes-provider"
                >
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {clinicUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)} data-testid={`option-provider-${u.id}`}>
                      {u.displayName}
                      {u.kind === "staff" ? " · Staff" : ""}
                      {u.id === user?.id ? " (you)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ChevronDown
                className="w-4 h-4 transition-transform"
                style={{
                  color: "#5a7040",
                  transform: notesCollapsed ? "rotate(0deg)" : "rotate(180deg)",
                }}
              />
            </div>
          </div>

          {/* Expandable body */}
          {!notesCollapsed && (
            openNotesLoading ? (
              <div className="flex items-center justify-center py-10" style={{ color: "#7a8a64" }}>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading open notes…
              </div>
            ) : openNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <CheckCircle2 className="w-7 h-7 mb-2" style={{ color: "#a0a880" }} />
                <p className="text-sm" style={{ color: "#1c2414" }}>No open notes</p>
                <p className="text-xs mt-1" style={{ color: "#7a8a64" }}>All encounters for this provider have been signed.</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y" style={{ borderColor: "#f0ece5" }}>
                {openNotes.map((item) => {
                  if (item.kind === "draft") {
                    const created = new Date(item.createdAt);
                    const createdLabel = created.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    const preview = item.transcription.replace(/\s+/g, " ").slice(0, 140);
                    return (
                      <button
                        key={`draft-${item.id}`}
                        type="button"
                        onClick={() => setLocation(`/encounters?draft=${item.id}`)}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate active-elevate-2"
                        style={{ backgroundColor: "#fffaed" }}
                        data-testid={`item-open-draft-${item.id}`}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#fef0c7" }}>
                          <ClipboardList className="w-4 h-4" style={{ color: "#a06a08" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: "#7a5c20" }}>Transcription draft</span>
                            <span className="text-xs" style={{ color: "#a08456" }}>· {createdLabel}</span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize" style={{ borderColor: "#e0c990", color: "#7a5c20", backgroundColor: "#fef0c7" }}>{item.visitType}</Badge>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: "#e0c990", color: "#7a5c20" }}>Needs patient</Badge>
                          </div>
                          <p className="text-xs mt-1 truncate" style={{ color: "#a08456" }}>{preview}{item.transcription.length > 140 ? "…" : ""}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#c4a75a" }} />
                      </button>
                    );
                  }
                  const enc = item;
                  const visitLabel = new Date(enc.visitDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <button
                      key={`enc-${enc.id}`}
                      type="button"
                      onClick={() => {
                        // Nurse and phone notes are written inline in the patient profile
                        // encounters tab. All other encounters (including recordings that
                        // need SOAP generation — soapGeneratedAt may still be null) open
                        // in the encounter editor where SOAP can be generated/reviewed.
                        const isInlineNote = enc.noteType === "nurse" || enc.noteType === "phone";
                        if (isInlineNote) {
                          setLocation(`/patients?patient=${enc.patientId}&tab=encounters`);
                        } else {
                          setLocation(`/encounters?encounterId=${enc.id}`);
                        }
                      }}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate active-elevate-2"
                      data-testid={`item-open-encounter-${enc.id}`}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#edf4e4" }}>
                        <FileText className="w-4 h-4" style={{ color: "#2e3a20" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold truncate" style={{ color: "#1c2414" }} data-testid={`text-patient-${enc.id}`}>{enc.patientFirstName} {enc.patientLastName}</span>
                          <span className="text-xs" style={{ color: "#7a8a64" }}>· {visitLabel}</span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize" style={{ borderColor: "#d4c9b5", color: "#5a7040" }}>{enc.visitType}</Badge>
                          {enc.soapGeneratedAt ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: "#d4c9b5", color: "#5a7040" }}>SOAP drafted · unsigned</Badge>
                          ) : enc.noteType === "nurse" ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: "#f5cba4", color: "#7a4a14", backgroundColor: "#fef3e8" }}>Nurse note · unsigned</Badge>
                          ) : enc.noteType === "phone" ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: "#aac4e8", color: "#1d3a66", backgroundColor: "#edf3fc" }}>Phone note · unsigned</Badge>
                          ) : enc.noteType === "soap_provider" ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: "#d4c9b5", color: "#5a7040" }}>Manual note · unsigned</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: "#e0c990", color: "#7a5c20", backgroundColor: "#fef0c7" }}>Awaiting SOAP</Badge>
                          )}
                        </div>
                        {enc.chiefComplaint && (
                          <p className="text-xs mt-1 truncate" style={{ color: "#7a8a64" }}>{enc.chiefComplaint}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#c4b9a5" }} />
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════
            WORKFLOW QUEUES — categorized, collapsible tiles.
            Each tile starts collapsed; count badge is always visible.
            Urgent safety concerns pin to the top as a persistent alert.
        ══════════════════════════════════════════════════════════ */}
        <div id="notifications-anchor" data-testid="notifications-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: totalNotifications > 0 ? "#2e3a20" : "#d4c9b5" }}>
                <Bell className="w-4 h-4" style={{ color: totalNotifications > 0 ? "#e8ddd0" : "#7a8a64" }} />
              </div>
              <span className="text-base font-semibold" style={{ color: "#1c2414" }}>Workflow Queues</span>
              {totalNotifications > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: "#e8ddd0", color: "#2e3a20" }}
                  data-testid="badge-notifications-total"
                >
                  {totalNotifications}
                </span>
              )}
            </div>
            {totalNotifications === 0 && !notifLoading && (
              <span className="text-xs" style={{ color: "#a0a880" }}>All clear</span>
            )}
          </div>

          {/* ── Urgent / Safety — pinned full-width alert, always expanded ── */}
          {urgentSpruceRequests.length > 0 && (
            <div
              className="rounded-xl border mb-3 overflow-hidden"
              style={{ borderColor: "#fca5a5", backgroundColor: "#fff5f5" }}
              data-testid="tile-urgent-queue"
            >
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid #fca5a5" }}>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#b91c1c" }} />
                  <span className="text-sm font-bold" style={{ color: "#7f1d1d" }}>Urgent — Safety Concerns</span>
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#b91c1c", color: "#fff" }}>
                    {urgentSpruceRequests.length}
                  </span>
                </div>
                <button
                  className="text-xs font-semibold flex items-center gap-1"
                  style={{ color: "#b91c1c" }}
                  onClick={() => setLocation("/spruce-inbox")}
                >
                  Open Inbox <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: "#fecaca" }}>
                {urgentSpruceRequests.slice(0, 3).map((req) => {
                  const name = req.patientFirstName && req.patientLastName
                    ? `${req.patientFirstName} ${req.patientLastName}`
                    : req.patientNameExtracted ?? req.patientPhone ?? "Unknown";
                  return (
                    <button
                      key={req.id}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover-elevate"
                      onClick={() => setSelectedSpruceRequest(req)}
                      data-testid={`notification-urgent-${req.id}`}
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: "#fca5a5", color: "#7f1d1d" }}>{name[0]}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate block" style={{ color: "#7f1d1d" }}>{name}</span>
                        {req.requestSummary && <span className="text-xs truncate block" style={{ color: "#991b1b" }}>{req.requestSummary}</span>}
                      </div>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#b91c1c" }}>{timeAgo(req.createdAt)}</span>
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#fca5a5" }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 3-column collapsible queue tiles ────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* ① Medication & Supplement Requests */}
            <CollapsibleQueueTile
              icon={<ShoppingBag className="w-4 h-4" />}
              label="Medication & Supplement Requests"
              count={combinedRequests.length}
              countLabel={combinedRequests.length > 0
                ? [
                    pendingOrders.length > 0 ? `${pendingOrders.length} order${pendingOrders.length !== 1 ? "s" : ""}` : "",
                    (pendingRefillRequests.length + medicationSpruceRequests.length) > 0
                      ? `${pendingRefillRequests.length + medicationSpruceRequests.length} refill${(pendingRefillRequests.length + medicationSpruceRequests.length) !== 1 ? "s" : ""}`
                      : "",
                  ].filter(Boolean).join(", ")
                : ""}
              accentColor="#7a5c20"
              accentBg="#fef8ed"
              viewAllLabel="View all"
              onViewAll={() => setLocation("/patients")}
              isLoading={notifLoading}
              testId="tile-med-requests"
              isEmpty={combinedRequests.length === 0}
              emptyLabel="No pending requests"
            >
              {combinedRequests.slice(0, 3).map((entry) => {
                if (entry.kind === "order") {
                  const order = entry.row;
                  return (
                    <div key={`order-${order.id}`} data-testid={`notification-order-${order.id}`} className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <PatientInitials first={order.patientFirstName} last={order.patientLastName} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <ShoppingBag className="w-3 h-3 flex-shrink-0" style={{ color: "#7a5c20" }} />
                            <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>{order.patientFirstName} {order.patientLastName}</p>
                          </div>
                          <p className="text-xs" style={{ color: "#7a8a64" }}>{order.items.length} item{order.items.length !== 1 ? "s" : ""} · ${parseFloat(order.subtotal).toFixed(2)}</p>
                        </div>
                        <Button size="sm" data-testid={`button-fulfill-order-${order.id}`} className="h-7 px-2 text-xs gap-1" style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                          onClick={() => fulfillOrderMutation.mutate(order.id)} disabled={fulfillOrderMutation.isPending}>
                          <CheckCircle2 className="w-3 h-3" /> Fulfill
                        </Button>
                      </div>
                    </div>
                  );
                }
                if (entry.kind === "refill") {
                  const refill = entry.row;
                  const firstName = refill.patientFirstName ?? "";
                  const lastName = refill.patientLastName ?? "";
                  return (
                    <div key={`refill-${refill.id}`} data-testid={`notification-refill-${refill.id}`} className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <PatientInitials first={firstName || "P"} last={lastName || "t"} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Pill className="w-3 h-3 flex-shrink-0" style={{ color: "#2e5a7a" }} />
                            <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>{(firstName || lastName) ? `${firstName} ${lastName}`.trim() : "Patient"}</p>
                          </div>
                          <p className="text-xs truncate" style={{ color: "#7a8a64" }} data-testid={`text-refill-message-${refill.id}`}>{refill.message}</p>
                        </div>
                        <Button size="sm" data-testid={`button-handle-refill-${refill.id}`} className="h-7 px-2 text-xs gap-1" style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                          onClick={() => dismissRefillMutation.mutate(refill.id)} disabled={dismissRefillMutation.isPending}>
                          <CheckCircle2 className="w-3 h-3" /> Done
                        </Button>
                      </div>
                    </div>
                  );
                }
                const spruceReq = entry.row as SpruceWorkflowRequestRow;
                const sprucePatientName = spruceReq.patientFirstName && spruceReq.patientLastName
                  ? `${spruceReq.patientFirstName} ${spruceReq.patientLastName}`
                  : spruceReq.patientNameExtracted ?? spruceReq.patientPhone ?? "Unknown";
                return (
                  <button key={`spruce-rx-${spruceReq.id}`} data-testid={`notification-spruce-${spruceReq.id}`}
                    className="w-full text-left px-4 py-2 flex items-center gap-2.5 hover-elevate"
                    onClick={() => setSelectedSpruceRequest(spruceReq)}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: "#7a5c20" }}>{sprucePatientName[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>{sprucePatientName}</p>
                      <p className="text-xs truncate" style={{ color: "#7a8a64" }}>Medication refill · Spruce</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#c4b9a5" }} />
                  </button>
                );
              })}
              {combinedRequests.length > 3 && (
                <p className="text-xs px-4 py-2" style={{ color: "#7a8a64" }}>+{combinedRequests.length - 3} more</p>
              )}
            </CollapsibleQueueTile>

            {/* ③ Appointment Requests — Spruce appointment workflow */}
            <CollapsibleQueueTile
              icon={<Calendar className="w-4 h-4" />}
              label="Appointment Requests"
              count={appointmentSpruceRequests.length}
              accentColor="#2e5a7a"
              accentBg="#e8f0f8"
              viewAllLabel="Open Inbox"
              onViewAll={() => setLocation("/spruce-inbox")}
              isLoading={notifLoading}
              testId="tile-appointment-requests"
              isEmpty={appointmentSpruceRequests.length === 0}
              emptyLabel="No pending appointment requests"
            >
              {appointmentSpruceRequests.slice(0, 3).map((req) => {
                const name = req.patientFirstName && req.patientLastName
                  ? `${req.patientFirstName} ${req.patientLastName}`
                  : req.patientNameExtracted ?? req.patientPhone ?? "Unknown";
                return (
                  <button key={`appt-${req.id}`} data-testid={`notification-appt-request-${req.id}`}
                    className="w-full text-left px-4 py-2 flex items-center gap-2.5 hover-elevate"
                    onClick={() => setSelectedSpruceRequest(req)}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: "#2e5a7a" }}>{name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>{name}</p>
                      <p className="text-xs truncate" style={{ color: "#7a8a64" }}>{req.requestSummary ?? "Appointment request"}</p>
                    </div>
                    <span className="text-[10px] flex-shrink-0" style={{ color: "#a0a880" }}>{timeAgo(req.createdAt)}</span>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#c4b9a5" }} />
                  </button>
                );
              })}
            </CollapsibleQueueTile>

            {/* ④ Form Submissions */}
            <CollapsibleQueueTile
              icon={<ClipboardList className="w-4 h-4" />}
              label="Form Submissions"
              count={pendingSubmissions.length}
              countLabel="pending review"
              accentColor="#4a5568"
              accentBg="#eef0ff"
              viewAllLabel="View all"
              onViewAll={() => setLocation("/form-submissions")}
              isLoading={notifLoading}
              testId="tile-form-submissions"
              isEmpty={pendingSubmissions.length === 0}
              emptyLabel="No pending submissions"
            >
              {pendingSubmissions.slice(0, 3).map((sub) => (
                <div key={`sub-${sub.id}`} data-testid={`notification-submission-${sub.id}`}
                  className="px-4 py-2 flex items-center gap-2.5 cursor-pointer hover-elevate"
                  onClick={() => setPreviewSubId(sub.id)}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ backgroundColor: "#e8e4f0", color: "#4a5568" }}>
                    {(sub.submitterName?.trim()?.[0] ?? "A").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>{sub.submitterName ?? "Anonymous"}</p>
                    <p className="text-xs truncate" style={{ color: "#7a8a64" }}>{(sub as any).formName ?? "Form submission"}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs" style={{ color: "#a0a880" }}>{timeAgo(sub.submittedAt)}</span>
                    <Button size="icon" variant="ghost" data-testid={`button-dismiss-submission-${sub.id}`}
                      onClick={(e) => { e.stopPropagation(); markReviewedMutation.mutate(sub.id); }}
                      disabled={markReviewedMutation.isPending}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {pendingSubmissions.length > 3 && (
                <p className="text-xs px-4 py-2" style={{ color: "#7a8a64" }}>
                  +{pendingSubmissions.length - 3} more — <button className="underline" onClick={() => setLocation("/form-submissions")}>view all</button>
                </p>
              )}
            </CollapsibleQueueTile>


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

            {/* Quick Upload */}
            <button
              data-testid="card-quick-lab-upload"
              className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
              style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#4a72b8"; (e.currentTarget as HTMLElement).style.backgroundColor = "#f0f4fd"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d4c9b5"; (e.currentTarget as HTMLElement).style.backgroundColor = "#ffffff"; }}
              onClick={() => setLocation("/simple-labs")}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#e8eef8" }}>
                <Upload className="w-6 h-6" style={{ color: "#4a72b8" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "#1c2414" }}>Quick Lab Upload</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7a8a64" }}>Chart any labs for trending — no full eval</p>
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
          clinicLogo: clinicBrandingFull?.clinicLogo ?? (user as any)?.clinicLogo ?? null,
          phone: (user as any)?.phone ?? null,
          address: (user as any)?.address ?? null,
          email: (user as any)?.email ?? null,
        }}
      />

      {/* ── Spruce workflow request detail drawer ─────────────────────── */}
      {selectedSpruceRequest && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedSpruceRequest(null); }}>
          <DialogContent className="max-w-md" data-testid="dialog-spruce-request">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" style={{ color: "#4a3a6e" }} />
                {SPRUCE_WORKFLOW_LABELS[selectedSpruceRequest.workflow] ?? selectedSpruceRequest.workflow}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              {/* Caller / patient info */}
              {(() => {
                const req = selectedSpruceRequest;
                const resolvedName =
                  req.patientFirstName && req.patientLastName
                    ? `${req.patientFirstName} ${req.patientLastName}`
                    : req.patientNameExtracted ?? null;
                const isMatched = !!(req.patientId && resolvedName);
                return (
                  <div className="rounded-md p-3 space-y-2" style={{ backgroundColor: isMatched ? "#f0f5eb" : "#f5f3fa" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: "#4a3a6e" }}>via Spruce</span>
                      {isMatched ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "#d4e8c4", color: "#2e3a20" }}>
                          <UserCheck className="w-3 h-3" /> Patient matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "#ede8df", color: "#7a6a54" }}>
                          <UserX className="w-3 h-3" /> Unmatched contact
                        </span>
                      )}
                    </div>

                    {isMatched && resolvedName ? (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: "#7a8a64" }}>Patient</p>
                          <p className="text-sm font-semibold" style={{ color: "#1c2414" }} data-testid="text-spruce-drawer-patient-name">
                            {resolvedName}
                          </p>
                        </div>
                        <Link
                          href={`/patients?patient=${req.patientId}`}
                          onClick={() => setSelectedSpruceRequest(null)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded border"
                          style={{ color: "#2e3a20", borderColor: "#b0c898", backgroundColor: "#ffffff" }}
                          data-testid="link-spruce-drawer-open-chart"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open patient chart
                        </Link>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: "#7a8a64" }}>Caller</p>
                        <p className="text-sm font-mono" style={{ color: "#1c2414" }} data-testid="text-spruce-drawer-unmatched-phone">
                          {req.patientPhone ?? "Unknown number"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "#a0a880" }}>
                          This phone number was not found in your patient list. You can look them up manually or add them as a new patient.
                        </p>
                      </div>
                    )}

                    {req.patientPhone && isMatched && (
                      <div className="text-xs font-mono" style={{ color: "#7a8a64" }}>
                        {req.patientPhone}
                      </div>
                    )}

                    <div className="text-xs" style={{ color: "#a0a880" }}>
                      Received {timeAgo(req.createdAt)}
                    </div>
                  </div>
                );
              })()}

              {/* Message text */}
              {selectedSpruceRequest.requestSummary && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "#7a8a64" }}>Message</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#1c2414" }}
                    data-testid="text-spruce-drawer-summary">
                    {selectedSpruceRequest.requestSummary}
                  </p>
                </div>
              )}

              {/* ClinIQ Inbox deep-link — opens the conversation inside ClinIQ */}
              {selectedSpruceRequest.spruceConversationUrl && (() => {
                const convKey = selectedSpruceRequest.spruceConversationUrl.split('/conversations/')[1] ?? null;
                if (!convKey) return null;
                return (
                  <button
                    className="flex items-center gap-2 text-sm font-medium rounded-md px-3 py-2 border w-full text-left"
                    style={{ color: "#4a3a6e", borderColor: "#c4b8e0", backgroundColor: "#f8f5ff" }}
                    data-testid="link-open-spruce-conversation"
                    onClick={() => {
                      setSelectedSpruceRequest(null);
                      setLocation(`/spruce-inbox?key=${encodeURIComponent(convKey)}`);
                    }}
                  >
                    <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Open conversation in ClinIQ Inbox
                  </button>
                );
              })()}

              {/* Action buttons */}
              <div className="border-t pt-3" style={{ borderColor: "#ede8df" }}>
                <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "#7a8a64" }}>Staff action</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    data-testid="button-spruce-complete"
                    className="gap-1.5"
                    style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                    onClick={() => updateSpruceRequestMutation.mutate({ id: selectedSpruceRequest.id, status: "complete" })}
                    disabled={updateSpruceRequestMutation.isPending}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-spruce-needs-info"
                    className="gap-1.5"
                    onClick={() => updateSpruceRequestMutation.mutate({ id: selectedSpruceRequest.id, status: "needs_more_info" })}
                    disabled={updateSpruceRequestMutation.isPending}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Needs more info
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-spruce-visit-required"
                    className="gap-1.5 col-span-2"
                    onClick={() => updateSpruceRequestMutation.mutate({ id: selectedSpruceRequest.id, status: "visit_required" })}
                    disabled={updateSpruceRequestMutation.isPending}
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    Visit required
                  </Button>
                </div>
                <p className="text-xs mt-2" style={{ color: "#a0a880" }}>
                  "Mark complete" removes this from the dashboard. All actions are preserved in audit history.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function TodaysAppointmentsWidget() {
  const [, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(true);
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
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        style={{ backgroundColor: "#faf8f5" }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: sorted.length > 0 ? "#2e3a20" : "#a0a880" }} />
          <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Today's Appointments</span>
          {sorted.length > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}>
              {sorted.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setLocation("/appointments")}
            className="text-xs font-medium"
            style={{ color: "#5a7040" }}
            data-testid="link-view-schedule"
          >
            View schedule →
          </button>
          <ChevronDown
            className="w-4 h-4 transition-transform"
            style={{ color: "#5a7040", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
          />
        </div>
      </div>
      {!collapsed && (
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
                    <div className="text-sm font-medium truncate" style={{ color: "#1c2414" }}>{a.patientName || a.serviceType || "Appointment"}</div>
                    {a.serviceType && a.patientName && (
                      <div className="text-xs text-muted-foreground truncate">{a.serviceType}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
