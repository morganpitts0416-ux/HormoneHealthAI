import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  MessageCircle,
  User,
  UserCheck,
  ExternalLink,
  ChevronLeft,
  Search,
  RefreshCw,
  UserPlus,
  CheckCircle2,
  Send,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Settings,
  Inbox,
  BookUser,
  UserX,
  ShieldAlert,
  Archive,
  ArchiveRestore,
  Users,
  ClipboardList,
  MailCheck,
  AtSign,
  FileText,
  Package,
  Bell,
  StickyNote,
  PenLine,
  CheckCheck,
  X as XIcon,
  Tag,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AddPatientDialog } from "@/components/add-patient-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Patient } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SpruceConversation {
  conversationKey: string;
  spruceConversationId: string | null;
  fromPhone: string | null;
  toPhone: string | null;
  patientId: number | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  spruceContactName: string | null;
  lastMessage: string | null;
  lastMessageDirection: string | null;
  lastMessageAt: string;
  messageCount: number;
  hasStaffReply: boolean;
  hasOpenUrgentRequest?: boolean;
  // Archive state (Phase 3)
  isArchived?: boolean;
  archivedAt?: string | null;
  // Viewed / assigned tracking (Phase 4)
  staffLastViewedAt?: string | null;
  taggedClinicianId?: number | null;
}

interface SpruceMessage {
  id: number;
  spruceConversationId: string | null;
  fromPhone: string | null;
  toPhone: string | null;
  messageBody: string | null;
  messageDirection: string | null;
  eventType: string | null;
  staffRepliedAt: string | null;
  receivedAt: string;
  patientId: number | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  spruceContactName: string | null;
  source?: 'spruce' | 'portal' | 'form_submitted' | 'supplement' | 'notification';
  portalMessageType?: string | null;
  authorName?: string | null;
}

interface AssignedToMeItem {
  id: string;
  kind: 'mention' | 'notification';
  patientId: number | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  reason: string;
  snippet: string;
  timestamp: string;
  conversationKey: string | null;
  acknowledgedAt: string | null;
}

interface ClinicMember {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  role: string | null;
}

interface ConvState {
  state: string;
  aiMutedAt: string | null;
}

interface WorkflowRequest {
  id: number;
  workflow: string;
  status: string;
  requestSummary: string | null;
  juneMemoText: string | null;
  juneAckSentAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  spruceConversationUrl: string | null;
}

// ── Sidebar view type ──────────────────────────────────────────────────────────

type SidebarView = "all" | "unread" | "assigned" | "unmatched" | "urgent" | "archived";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 24) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 24) return `Today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString([], opts);
}

function getInitials(firstName: string | null, lastName: string | null, phone: string | null): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName[0].toUpperCase();
  if (phone) return phone.slice(-2);
  return "?";
}

/** Returns true if the string looks like a phone number / E.164 value.
 *  Used to prevent an internal endpoint (clinic number) from leaking into
 *  the patient-facing display name. */
function looksLikePhone(s: string): boolean {
  // E.164 (+12223334444), formatted (222-333-4444), or bare digits ≥7 chars
  return /^\+?[\d\s\-().]{7,}$/.test(s.trim());
}

function getDisplayName(conv: SpruceConversation): string {
  if (conv.patientFirstName && conv.patientLastName) return `${conv.patientFirstName} ${conv.patientLastName}`;
  if (conv.patientFirstName) return conv.patientFirstName;
  // spruceContactName may be a staff sender name on outbound rows — skip if it
  // looks like a phone number (clinic's internal endpoint leaking through).
  if (conv.spruceContactName && !looksLikePhone(conv.spruceContactName)) return conv.spruceContactName;
  // fromPhone here is always the *patient* phone after the storage fix.
  if (conv.fromPhone) return conv.fromPhone;
  return "Unknown contact";
}

function parseNameParts(name: string | null): { firstName: string; lastName: string } | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function isUrgent(conv: SpruceConversation): boolean {
  // Primary: conversation has a pending urgent_safety workflow request — this is
  // the same data source the dashboard urgent tile uses, so both stay in sync.
  if (conv.hasOpenUrgentRequest) return true;
  // Fallback: keyword match on last message text (catches messages before June
  // processes them or when no workflow request was created).
  const msg = (conv.lastMessage ?? "").toLowerCase();
  return msg.includes("urgent") || msg.includes("emergency") || msg.includes("chest pain") || msg.includes("safety");
}

// ── Sidebar nav item ───────────────────────────────────────────────────────────

function NavItem({
  icon: Icon,
  label,
  count,
  active,
  urgent,
  onClick,
  testId,
}: {
  icon: React.ElementType;
  label: string;
  count?: number;
  active: boolean;
  urgent?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${
        active
          ? "bg-[#e6f4ec] text-[#1a5c38]"
          : "text-[#4a5a40] hover:bg-[#f0ede8] hover:text-[#1c2414]"
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-[#2e7d52]" : urgent ? "text-[#b91c1c]" : "text-[#7a8a64]"}`} />
      <span className={`text-sm flex-1 ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
            urgent
              ? "bg-[#fee2e2] text-[#b91c1c]"
              : active
              ? "bg-[#2e7d52] text-white"
              : "bg-[#e5e2dc] text-[#5a6040]"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── ConversationRow ────────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  selected,
  onClick,
  selectMode = false,
  isChecked = false,
  onToggle,
}: {
  conv: SpruceConversation;
  selected: boolean;
  onClick: () => void;
  selectMode?: boolean;
  isChecked?: boolean;
  onToggle?: (key: string) => void;
}) {
  const name = getDisplayName(conv);
  const initials = getInitials(conv.patientFirstName, conv.patientLastName, conv.fromPhone);
  const isPatient = !!conv.patientId;

  const handleClick = () => {
    if (selectMode && onToggle) {
      onToggle(conv.conversationKey);
    } else {
      onClick();
    }
  };

  return (
    <button
      className={`w-full text-left px-3 py-3 flex gap-3 transition-colors border-b border-[#eeeae4] ${
        isChecked ? "bg-[#eaf3ec]" : selected && !selectMode ? "bg-[#eaf3ec]" : "hover:bg-[#f5f2ee]"
      }`}
      onClick={handleClick}
      data-testid={`conv-row-${conv.conversationKey}`}
    >
      {selectMode ? (
        <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center mt-0.5">
          {isChecked
            ? <CheckSquare className="w-5 h-5 text-[#2e7d52]" />
            : <Square className="w-5 h-5 text-[#c0bdb5]" />
          }
        </div>
      ) : (
      <div
        className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white mt-0.5"
        style={{ backgroundColor: isPatient ? "#2e7d52" : "#5c4a7a" }}
      >
        {initials}
      </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold text-[#1c2414] truncate">{name}</span>
          <span className="text-[10px] text-[#7a8060] flex-shrink-0">{formatTime(conv.lastMessageAt)}</span>
        </div>
        <p className="text-xs text-[#5a6040] truncate leading-relaxed">
          {conv.lastMessageDirection === "outbound_staff" && (
            <span className="text-[#2e7d52] font-medium">You: </span>
          )}
          {conv.lastMessage ?? <span className="italic text-[#9a9a8a]">No message text</span>}
        </p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {isPatient && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#2e7d52] bg-[#e6f4ec] px-1.5 py-0.5 rounded">
              <UserCheck className="w-2.5 h-2.5" />
              Patient
            </span>
          )}
          {conv.hasStaffReply && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#1d4ed8] bg-[#eff6ff] px-1.5 py-0.5 rounded">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Replied
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#7a8060] bg-[#f0ede8] px-1.5 py-0.5 rounded">
            via Spruce
          </span>
        </div>
      </div>
    </button>
  );
}

// ── InternalNoteBubble ────────────────────────────────────────────────────────
// Staff-only internal note — always internal_only visibility, never shown to patients.

function InternalNoteBubble({ msg }: { msg: SpruceMessage }) {
  const authorDisplay = msg.spruceContactName ?? msg.authorName ?? "Staff";
  return (
    <div className="flex justify-end mb-3 px-4" data-testid={`msg-note-${msg.id}`}>
      <div className="max-w-[76%]">
        <div className="flex items-center justify-end gap-1.5 mb-1">
          <span
            className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
            style={{ backgroundColor: "#ede9fe", color: "#5b21b6" }}
          >
            <StickyNote className="w-2.5 h-2.5" />
            Internal note
          </span>
          <p className="text-[11px] font-semibold" style={{ color: "#5b21b6" }}>
            {authorDisplay}
          </p>
        </div>
        <div
          className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed"
          style={{
            backgroundColor: "#f5f3ff",
            border: "1px solid #ddd6fe",
            color: "#2e1065",
          }}
        >
          <span style={{ whiteSpace: "pre-line" }}>{msg.messageBody ?? ""}</span>
        </div>
        <p className="text-[10px] mt-1 text-right" style={{ color: "#8b5cf6" }}>
          {formatMessageTime(msg.receivedAt)} · staff only
        </p>
      </div>
    </div>
  );
}

// ── MilestoneEvent ────────────────────────────────────────────────────────────
// Center-aligned event card for form submissions, supplement orders, notifications.

function MilestoneEvent({ msg }: { msg: SpruceMessage }) {
  const eventType = msg.eventType ?? "";
  const source = msg.source ?? "";

  let Icon = Bell;
  let label = "Event";
  let chipBg = "#f0f9ff";
  let chipBorder = "#bae6fd";
  let chipColor = "#0369a1";
  let iconColor = "#0369a1";

  if (source === "form_submitted" || eventType === "form_submitted") {
    Icon = FileText;
    label = `Form submitted: ${msg.messageBody ?? "Form"}`;
    chipBg = "#f0fdf4"; chipBorder = "#bbf7d0"; chipColor = "#15803d"; iconColor = "#15803d";
  } else if (source === "supplement") {
    if (eventType === "supplement_fulfilled") {
      Icon = CheckCheck;
      label = `Supplement fulfilled: ${msg.messageBody ?? ""}`;
      chipBg = "#f0fdf4"; chipBorder = "#bbf7d0"; chipColor = "#15803d"; iconColor = "#15803d";
    } else {
      Icon = Package;
      label = `Supplement ordered: ${msg.messageBody ?? ""}`;
      chipBg = "#fff7ed"; chipBorder = "#fed7aa"; chipColor = "#c2410c"; iconColor = "#c2410c";
    }
  } else if (source === "notification" || eventType === "notification") {
    Icon = Bell;
    const title = msg.spruceContactName ?? "Notification";
    label = `${title}: ${msg.messageBody ?? ""}`;
    chipBg = "#fefce8"; chipBorder = "#fde68a"; chipColor = "#b45309"; iconColor = "#b45309";
  }

  return (
    <div className="flex justify-center my-2 px-4" data-testid={`milestone-${msg.id}`}>
      <div
        className="inline-flex items-center gap-2 text-[11px] font-medium px-3 py-1.5 rounded-full max-w-[90%]"
        style={{
          backgroundColor: chipBg,
          border: `1px solid ${chipBorder}`,
          color: chipColor,
        }}
      >
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: iconColor }} />
        <span className="truncate">{label}</span>
        <span className="text-[9px] opacity-70 flex-shrink-0">
          {formatMessageTime(msg.receivedAt)}
        </span>
      </div>
    </div>
  );
}

// ── ThreadEvent ───────────────────────────────────────────────────────────────
// Dispatch wrapper — picks the right component for each event type.

function ThreadEvent({ msg, optimistic }: { msg: SpruceMessage; optimistic?: boolean }) {
  if (msg.messageDirection === "internal_note") {
    return <InternalNoteBubble msg={msg} />;
  }
  if (
    msg.source === "form_submitted" ||
    msg.source === "supplement" ||
    msg.source === "notification"
  ) {
    return <MilestoneEvent msg={msg} />;
  }
  return <MessageBubble msg={msg} optimistic={optimistic} />;
}

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ msg, optimistic }: { msg: SpruceMessage; optimistic?: boolean }) {
  const isStaff = msg.messageDirection === "outbound_staff";
  const isSystem =
    msg.messageDirection === "spruce_system_event" ||
    msg.messageDirection === "unknown" ||
    !msg.messageDirection;

  const isPortal = msg.source === "portal";
  const isRefillRequest =
    isPortal && typeof msg.messageBody === "string" &&
    msg.messageBody.startsWith("[Portal Refill Request]");

  // Strip the label prefix for display — keep only the medication list
  const displayBody = isRefillRequest
    ? msg.messageBody?.replace(/^\[Portal Refill Request\]\n\n/, "") ?? null
    : msg.messageBody;

  if (isSystem) {
    return (
      <div className="flex justify-center my-1 px-4" data-testid={`msg-${msg.id}`}>
        <span
          className="text-[10px] italic px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: "#f0ede8", color: "#8a8878" }}
        >
          {msg.messageBody ?? msg.eventType ?? "System event"} · {formatMessageTime(msg.receivedAt)}
        </span>
      </div>
    );
  }

  if (isStaff) {
    const senderName = msg.spruceContactName ?? null;
    return (
      <div className={`flex justify-end mb-3 px-4 ${optimistic ? "opacity-60" : ""}`} data-testid={`msg-${msg.id}`}>
        <div className="max-w-[72%]">
          <div className="flex items-center justify-end gap-1.5 mb-1">
            {senderName && (
              <p className="text-[11px] font-semibold text-[#2e7d52]">{senderName}</p>
            )}
            {isPortal && (
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                style={{ backgroundColor: "#dbeafe", color: "#1d4ed8" }}
              >
                Portal
              </span>
            )}
          </div>
          <div
            className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white leading-relaxed"
            style={{ backgroundColor: "#2e7d52" }}
          >
            {displayBody}
          </div>
          <p className="text-[10px] text-[#8a8a7a] mt-1 text-right flex items-center justify-end gap-1.5">
            {optimistic && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
            {formatMessageTime(msg.receivedAt)}
          </p>
        </div>
      </div>
    );
  }

  // Inbound patient message
  return (
    <div className="flex justify-start mb-3 px-4" data-testid={`msg-${msg.id}`}>
      <div className="max-w-[72%]">
        <div className="flex items-center gap-1.5 mb-1 ml-1">
          {(msg.patientFirstName || msg.fromPhone) && (
            <p className="text-[10px] text-[#6a6a5a] font-medium">
              {msg.patientFirstName && msg.patientLastName
                ? `${msg.patientFirstName} ${msg.patientLastName}`
                : msg.fromPhone ?? "Contact"}
            </p>
          )}
          {isPortal && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
              style={{ backgroundColor: "#dbeafe", color: "#1d4ed8" }}
            >
              Portal
            </span>
          )}
          {isRefillRequest && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
              style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
            >
              Refill Request
            </span>
          )}
        </div>
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed text-[#1c2414]"
          style={{
            backgroundColor: isRefillRequest ? "#fefce8" : "#ffffff",
            border: isRefillRequest ? "1px solid #fde68a" : "1px solid #e5e2dc",
          }}
        >
          {displayBody
            ? <span style={{ whiteSpace: "pre-line" }}>{displayBody}</span>
            : <span className="italic text-[#9a9a8a]">— non-text event —</span>}
        </div>
        <p className="text-[10px] text-[#8a8a7a] mt-1 ml-1">{formatMessageTime(msg.receivedAt)}</p>
      </div>
    </div>
  );
}

// ── DateDivider ───────────────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="flex-1 h-px bg-[#e5e2dc]" />
      <span className="text-[10px] text-[#8a8a7a] font-medium uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#e5e2dc]" />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SpruceInboxPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    // Pre-seed from ?key= so the conversation is selected on first render
    const qs = typeof window !== "undefined" ? window.location.search : location.split("?")[1] ?? "";
    return new URLSearchParams(qs).get("key") ?? null;
  });
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<SidebarView>("all");
  const [sort] = useState<"newest" | "oldest">("newest");
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [addPatientInit, setAddPatientInit] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});
  const [showLinkPatient, setShowLinkPatient] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [optimisticMsgs, setOptimisticMsgs] = useState<SpruceMessage[]>([]);
  const [showSystemEvents, setShowSystemEvents] = useState(false);
  const [composeMode, setComposeMode] = useState<"reply" | "note">("reply");
  const [mentionedUsers, setMentionedUsers] = useState<ClinicMember[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const threadBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Clinic Spruce settings (to know if API token is configured) ────────
  const { data: spruceSettings } = useQuery<{ apiTokenConfigured: boolean } | null>({
    queryKey: ["/api/clinic/spruce-settings"],
  });
  const hasSpruceToken = spruceSettings?.apiTokenConfigured === true;

  // ── Conversations list ──────────────────────────────────────────────────
  const {
    data: conversations = [],
    isLoading: convsLoading,
    refetch: refetchConvs,
  } = useQuery<SpruceConversation[]>({
    queryKey: ["/api/spruce/conversations"],
    refetchInterval: 30_000,
  });

  // ── Thread messages ─────────────────────────────────────────────────────
  const {
    data: messages = [],
    isLoading: msgsLoading,
    refetch: refetchMsgs,
  } = useQuery<SpruceMessage[]>({
    queryKey: ["/api/spruce/conversations", selectedKey, "messages"],
    queryFn: async () => {
      if (!selectedKey) return [];
      const res = await fetch(
        `/api/spruce/conversations/${encodeURIComponent(selectedKey)}/messages`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedKey,
  });

  // ── Assigned-to-me queue (ClinIQ-native @mentions + notifications) ───────
  const {
    data: assignedItems = [],
    refetch: refetchAssigned,
  } = useQuery<AssignedToMeItem[]>({
    queryKey: ["/api/inbox/assigned-to-me"],
    refetchInterval: 30_000,
  });

  // ── Clinic member list for @mention picker ─────────────────────────────
  const { data: clinicMembers = [] } = useQuery<ClinicMember[]>({
    queryKey: ["/api/clinic/members"],
    enabled: composeMode === "note" || showMentionPicker,
  });

  // ── Workflow request (June task) for selected conversation ─────────────
  const { data: workflowRequest, refetch: refetchWorkflow } = useQuery<WorkflowRequest | null>({
    queryKey: ["/api/spruce/conversations", selectedKey, "workflow-request"],
    queryFn: async () => {
      if (!selectedKey) return null;
      const res = await fetch(
        `/api/spruce/conversations/${encodeURIComponent(selectedKey)}/workflow-request`,
        { credentials: "include" },
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedKey,
  });

  // ── Conversation state ──────────────────────────────────────────────────
  const { data: convState, refetch: refetchState } = useQuery<ConvState>({
    queryKey: ["/api/spruce/conversations", selectedKey, "state"],
    queryFn: async () => {
      if (!selectedKey) return { state: "open", aiMutedAt: null };
      const res = await fetch(
        `/api/spruce/conversations/${encodeURIComponent(selectedKey)}/state`,
        { credentials: "include" },
      );
      if (!res.ok) return { state: "open", aiMutedAt: null };
      return res.json();
    },
    enabled: !!selectedKey,
  });

  // ── Send reply mutation ─────────────────────────────────────────────────
  const sendReply = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedKey) throw new Error("No conversation selected");
      const res = await apiRequest("POST", `/api/spruce/conversations/${encodeURIComponent(selectedKey)}/reply`, {
        messageBody: body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send");
      }
      return res.json();
    },
    onMutate: (body) => {
      const parts = [user?.title, user?.firstName, user?.lastName].filter(Boolean);
      const optimisticSender = parts.join(" ") || null;

      const fake: SpruceMessage = {
        id: Date.now(),
        spruceConversationId: null,
        fromPhone: null,
        toPhone: null,
        messageBody: body,
        messageDirection: "outbound_staff",
        eventType: "cliniq_staff_reply",
        staffRepliedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        patientId: null,
        patientFirstName: null,
        patientLastName: null,
        spruceContactName: optimisticSender,
      };
      setOptimisticMsgs((prev) => [...prev, fake]);
      setReplyText("");
    },
    onSuccess: () => {
      setOptimisticMsgs([]);
      refetchMsgs();
      refetchConvs();
      refetchState();
    },
    onError: (err: Error) => {
      setOptimisticMsgs([]);
      toast({ variant: "destructive", title: "Send failed", description: err.message });
    },
  });

  // ── Mark conversation replied (dismiss from "Unreplied" without sending) ──
  const markRepliedMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", `/api/spruce/conversations/${encodeURIComponent(key)}/mark-replied`, {});
      if (!res.ok) throw new Error("Failed to mark as replied");
      return res.json();
    },
    onSuccess: () => {
      refetchConvs();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to mark as replied" });
    },
  });

  // ── Send internal note mutation ──────────────────────────────────────────
  const sendInternalNote = useMutation({
    mutationFn: async ({ content, mentionedUserIds }: { content: string; mentionedUserIds: number[] }) => {
      if (!selectedKey) throw new Error("No conversation selected");
      const res = await apiRequest(
        "POST",
        `/api/spruce/conversations/${encodeURIComponent(selectedKey)}/internal-note`,
        { content, mentionedUserIds },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to save note");
      }
      return res.json();
    },
    onMutate: ({ content }) => {
      const parts = [user?.title, user?.firstName, user?.lastName].filter(Boolean);
      const fake: SpruceMessage = {
        id: Date.now(),
        spruceConversationId: null,
        fromPhone: null,
        toPhone: null,
        messageBody: content,
        messageDirection: "internal_note",
        eventType: "internal_note",
        staffRepliedAt: null,
        receivedAt: new Date().toISOString(),
        patientId: null,
        patientFirstName: null,
        patientLastName: null,
        spruceContactName: parts.join(" ") || "Staff",
        source: "portal",
        portalMessageType: "internal_note",
      };
      setOptimisticMsgs(prev => [...prev, fake]);
      setReplyText("");
      setMentionedUsers([]);
    },
    onSuccess: () => {
      setOptimisticMsgs([]);
      refetchMsgs();
      qc.invalidateQueries({ queryKey: ["/api/inbox/assigned-to-me"] });
    },
    onError: (err: Error) => {
      setOptimisticMsgs([]);
      toast({ variant: "destructive", title: "Failed to save note", description: err.message });
    },
  });

  // ── Acknowledge @mention (dismiss from queue) ─────────────────────────────
  const acknowledgeMention = useMutation({
    mutationFn: async (mentionId: string) => {
      const id = mentionId.replace("mention-", "");
      const res = await apiRequest("PATCH", `/api/inbox/mentions/${id}/acknowledge`, {});
      if (!res.ok) throw new Error("Failed to acknowledge");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inbox/assigned-to-me"] });
    },
  });

  // ── Dismiss a provider inbox notification ─────────────────────────────────
  const dismissNotification = useMutation({
    mutationFn: async (notifId: string) => {
      const id = notifId.replace("notification-", "");
      const res = await apiRequest("DELETE", `/api/clinician/inbox-notifications/${id}`, {});
      if (!res.ok) throw new Error("Failed to dismiss notification");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inbox/assigned-to-me"] });
    },
  });

  // ── Mark June workflow task complete ────────────────────────────────────
  const markWorkflowCompleteMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await apiRequest("PATCH", `/api/spruce-requests/${requestId}/status`, { status: "complete" });
      if (!res.ok) throw new Error("Failed to mark task complete");
      return res.json();
    },
    onSuccess: () => {
      refetchWorkflow();
      // Refetch conversations so the completed task is removed from the
      // "Unreplied" and "Urgent" folders immediately (server also stamps
      // staffRepliedAt on the conversation when status → complete).
      refetchConvs();
      qc.invalidateQueries({ queryKey: ["/api/clinician/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/spruce/conversations/unreplied-summary"] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to mark task complete" });
    },
  });

  // Scroll to bottom when thread loads or new message arrives
  useEffect(() => {
    if ((!msgsLoading && messages.length > 0) || optimisticMsgs.length > 0) {
      setTimeout(() => threadBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [selectedKey, msgsLoading, messages.length, optimisticMsgs.length]);

  // Mark conversation as viewed when a clinician opens it
  useEffect(() => {
    if (!selectedKey) return;
    apiRequest("POST", `/api/spruce/conversations/${encodeURIComponent(selectedKey)}/mark-viewed`)
      .catch(() => { /* non-fatal — silently ignore */ });
  }, [selectedKey]);

  // Clear optimistic messages + compose state when selectedKey changes
  useEffect(() => {
    setOptimisticMsgs([]);
    setReplyText("");
    setComposeMode("reply");
    setMentionedUsers([]);
    setShowMentionPicker(false);
    setMentionSearch("");
  }, [selectedKey]);

  // Auto-select first conversation when list loads — desktop only.
  // On mobile the two-panel layout doesn't exist: the list and thread
  // alternate full-screen, so we must NOT auto-select or the back button
  // (which calls setSelectedKey(null)) would immediately re-select
  // conversations[0] and trap the user in the thread view.
  useEffect(() => {
    if (!selectedKey && conversations.length > 0 && window.innerWidth >= 768) {
      setSelectedKey(conversations[0].conversationKey);
    }
  }, [conversations, selectedKey]);

  // ── Patient search for manual linking ───────────────────────────────────
  interface PatientSearchResult {
    id: number;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    phone: string | null;
  }
  const { data: patientSearchResults = [] } = useQuery<PatientSearchResult[]>({
    queryKey: ["/api/patients/search", linkSearch],
    queryFn: async () => {
      const q = linkSearch.trim();
      if (q.length < 2) return [];
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showLinkPatient && linkSearch.trim().length >= 2,
  });

  // ── Link-patient mutation ────────────────────────────────────────────────
  const linkPatientMutation = useMutation({
    mutationFn: async ({ key, patientId }: { key: string; patientId: number }) => {
      const res = await apiRequest(
        "POST",
        `/api/spruce/conversations/${encodeURIComponent(key)}/link-patient`,
        { patientId },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to link patient");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/spruce/conversations"] });
      setShowLinkPatient(false);
      setLinkSearch("");
      toast({ title: "Patient linked", description: `${data.updatedMessages} message${data.updatedMessages !== 1 ? "s" : ""} updated.` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Link failed", description: err.message });
    },
  });

  // ── Archive mutation ────────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest(
        "POST",
        `/api/spruce/conversations/${encodeURIComponent(key)}/archive`,
        {},
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to archive");
      }
      return res.json() as Promise<{ ok: boolean; archivedAt: string; spruceArchived: boolean; spruceArchiveError: string | null }>;
    },
    onSuccess: (data, key) => {
      qc.invalidateQueries({ queryKey: ["/api/spruce/conversations"] });
      // If we were viewing the now-archived thread, clear selection
      if (selectedKey === key && activeView !== "archived") {
        setSelectedKey(null);
      }
      if (data.spruceArchiveError) {
        toast({
          title: "Archived in ClinIQ",
          description: `Note: Spruce sync failed — ${data.spruceArchiveError}. The conversation is archived locally.`,
        });
      } else if (data.spruceArchived) {
        toast({ title: "Archived", description: "Conversation archived in ClinIQ and Spruce." });
      } else {
        toast({ title: "Archived", description: "Conversation archived in ClinIQ." });
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Archive failed", description: err.message });
    },
  });

  // ── Unarchive single conversation ─────────────────────────────────────
  const unarchiveMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest(
        "POST",
        `/api/spruce/conversations/${encodeURIComponent(key)}/unarchive`,
        {},
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to unarchive");
      }
      return res.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/spruce/conversations"] });
      toast({ title: "Restored", description: "Conversation moved back to inbox." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Restore failed", description: err.message });
    },
  });

  // ── Bulk unarchive (restore all) ──────────────────────────────────────
  const bulkUnarchiveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/spruce/conversations/bulk-unarchive", {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to restore conversations");
      }
      return res.json() as Promise<{ ok: boolean; restoredCount: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/spruce/conversations"] });
      setSelectedKey(null);
      toast({
        title: "All conversations restored",
        description: `${data.restoredCount} conversation${data.restoredCount !== 1 ? "s" : ""} moved back to inbox.`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Restore failed", description: err.message });
    },
  });

  // ── Bulk archive selected conversations ───────────────────────────────
  const bulkArchiveMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      const results = await Promise.allSettled(
        keys.map((key) =>
          apiRequest("POST", `/api/spruce/conversations/${encodeURIComponent(key)}/archive`, {})
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed: ${key}`))))
        ),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      qc.invalidateQueries({ queryKey: ["/api/spruce/conversations"] });
      setSelectedKeys(new Set());
      setSelectMode(false);
      if (selectedKey && selectedKeys.has(selectedKey) && activeView !== "archived") {
        setSelectedKey(null);
      }
      if (failed > 0) {
        toast({
          title: `Archived ${succeeded}`,
          description: `${failed} conversation${failed !== 1 ? "s" : ""} could not be archived.`,
        });
      } else {
        toast({
          title: `Archived ${succeeded} conversation${succeeded !== 1 ? "s" : ""}`,
          description: "Conversations moved to archive.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Archive failed", description: err.message });
    },
  });

  // helper: toggle one key in the selection set
  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── View filtering ──────────────────────────────────────────────────────
  // Non-archived views exclude archived conversations; archived view shows only archived.
  const activeConvs = conversations.filter((c) => !c.isArchived);
  const urgentConvs = activeConvs.filter(isUrgent);
  const unmatchedConvs = activeConvs.filter((c) => !c.patientId);
  // "Assigned to Me" = conversations where Spruce assigned this specific clinician
  const assignedToMeConvs = activeConvs.filter((c) => c.taggedClinicianId != null && c.taggedClinicianId === user?.id);
  const archivedConvs = conversations.filter((c) => c.isArchived);

  const filtered = conversations
    .filter((c) => {
      // Archive view — show only archived
      if (activeView === "archived") return !!c.isArchived;
      // All other views — never show archived conversations
      if (c.isArchived) return false;
      if (activeView === "unmatched" && c.patientId) return false;
      if (activeView === "urgent" && !isUrgent(c)) return false;
      // "assigned" = tagged to the current clinician in Spruce
      if (activeView === "assigned" && (c.taggedClinicianId == null || c.taggedClinicianId !== user?.id)) return false;
      // "unread" = last real message is from the patient (inbound_patient) — awaiting reply
      if (activeView === "unread" && c.lastMessageDirection !== "inbound_patient") return false;
      const name = getDisplayName(c).toLowerCase();
      const phone = (c.fromPhone ?? "").toLowerCase();
      const q = search.toLowerCase();
      return !q || name.includes(q) || phone.includes(q);
    })
    .sort((a, b) => {
      // Pure recency: newest last-message at the top, regardless of direction.
      // Any activity (patient reply, staff reply, anything) bumps the thread up.
      // Prioritised sub-buckets (e.g. "unread first") belong in the Unreplied
      // tab — not here where they buried active today conversations below old
      // unanswered threads from months ago.
      const diff = new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime();
      return sort === "newest" ? -diff : diff;
    });

  const selectedConv = conversations.find((c) => c.conversationKey === selectedKey) ?? null;
  const spruceUrl = selectedConv?.spruceConversationId
    ? `https://app.sprucehealth.com/conversations/${selectedConv.spruceConversationId}`
    : null;
  const isStaffTakeover = convState?.state === "staff_takeover";

  function openAddPatient(conv: SpruceConversation) {
    const nameParts = parseNameParts(conv.spruceContactName);
    setAddPatientInit({
      firstName: nameParts?.firstName ?? "",
      lastName: nameParts?.lastName ?? "",
      phone: conv.fromPhone ?? "",
    });
    setShowAddPatient(true);
  }

  function handlePatientCreated(_patient: Patient) {
    setShowAddPatient(false);
    refetchConvs();
  }

  function handleSend() {
    const body = replyText.trim();
    if (!body || sendReply.isPending || sendInternalNote.isPending) return;
    if (composeMode === "note") {
      sendInternalNote.mutate({
        content: body,
        mentionedUserIds: mentionedUsers.map(m => m.id),
      });
    } else {
      sendReply.mutate(body);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // A message is a Spruce system/action event (archive events, tag changes, etc.)
  // that renders as a small muted chip — toggled by the "Show system events" button.
  // Internal notes and milestone events (form_submitted, supplement, notification)
  // are always visible and never hidden by the system-events toggle.
  function isSpruceSystemEvent(msg: SpruceMessage): boolean {
    if (
      msg.messageDirection === "internal_note" ||
      msg.source === "form_submitted" ||
      msg.source === "supplement" ||
      msg.source === "notification"
    ) {
      return false;
    }
    return (
      msg.messageDirection === "spruce_system_event" ||
      msg.messageDirection === "unknown" ||
      !msg.messageDirection
    );
  }

  function groupMessagesByDate(msgs: SpruceMessage[]) {
    const groups: { dateLabel: string; messages: SpruceMessage[] }[] = [];
    for (const msg of msgs) {
      const label = new Date(msg.receivedAt).toLocaleDateString([], {
        weekday: "long", month: "long", day: "numeric",
      });
      const last = groups[groups.length - 1];
      if (!last || last.dateLabel !== label) groups.push({ dateLabel: label, messages: [msg] });
      else last.messages.push(msg);
    }
    return groups;
  }

  const systemEvents = messages.filter(isSpruceSystemEvent);
  const realMessages = messages.filter((m) => !isSpruceSystemEvent(m));
  const messageGroups = groupMessagesByDate(showSystemEvents ? messages : realMessages);

  // View labels for the empty state
  const viewLabel: Record<SidebarView, string> = {
    all: "All Conversations",
    unread: "Unreplied",
    assigned: "Assigned to Me",
    unmatched: "Unmatched",
    urgent: "Urgent",
    archived: "Archived",
  };

  return (
    <div className="flex flex-1 min-h-0">

      {/* ══ Left nav sidebar — hidden on mobile ════════════════════════════ */}
      <div className="w-[220px] flex-shrink-0 hidden md:flex flex-col border-r border-[#e5e2dc] bg-[#faf8f5]">
        {/* Header */}
        <div className="px-3 pt-4 pb-3 border-b border-[#eeeae4]">
          <div className="flex items-center justify-between mb-3">
            <Button size="icon" variant="ghost" onClick={() => setLocation("/dashboard")} data-testid="button-back-dashboard">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => { refetchConvs(); if (selectedKey) refetchMsgs(); }} data-testid="button-refresh-inbox">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2 px-1 mb-1">
            <Inbox className="w-4 h-4 text-[#2e7d52]" />
            <span className="text-sm font-bold text-[#1c2414] tracking-tight">Inbox</span>
          </div>
          <p className="text-[10px] text-[#9a9a8a] px-1 leading-snug">
            Clinic communication workspace
          </p>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {/* Urgent — pinned at top, always visible when non-zero */}
          {urgentConvs.length > 0 && (
            <NavItem
              icon={ShieldAlert}
              label="Urgent"
              count={urgentConvs.length}
              active={activeView === "urgent"}
              urgent
              onClick={() => { setActiveView("urgent"); setSelectedKey(null); }}
              testId="nav-urgent"
            />
          )}

          <NavItem
            icon={Inbox}
            label="All Conversations"
            active={activeView === "all"}
            onClick={() => { setActiveView("all"); }}
            testId="nav-all"
          />
          <NavItem
            icon={MessageCircle}
            label="Unreplied"
            count={activeConvs.filter((c) => c.lastMessageDirection === "inbound_patient").length}
            active={activeView === "unread"}
            onClick={() => { setActiveView("unread"); setSelectedKey(null); }}
            testId="nav-unread"
          />
          <NavItem
            icon={BookUser}
            label="Assigned to Me"
            count={assignedItems.length + assignedToMeConvs.length || undefined}
            active={activeView === "assigned"}
            onClick={() => { setActiveView("assigned"); setSelectedKey(null); }}
            testId="nav-assigned"
          />
          <NavItem
            icon={UserX}
            label="Unmatched"
            count={unmatchedConvs.length}
            active={activeView === "unmatched"}
            onClick={() => { setActiveView("unmatched"); setSelectedKey(null); }}
            testId="nav-unmatched"
          />

          <div className="mt-3 mb-1 px-1">
            <span className="text-[9px] uppercase tracking-widest font-semibold text-[#b0b8a0]">Sources</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-[#2e7d52] flex-shrink-0" />
            <span className="text-xs text-[#5a6a50] font-medium">Spruce</span>
            <span className="ml-auto text-[10px] text-[#9a9a8a]">{conversations.length}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 opacity-40 cursor-not-allowed select-none">
            <div className="w-2 h-2 rounded-full bg-[#c4b9a5] flex-shrink-0" />
            <span className="text-xs text-[#9a9a8a] font-medium">Portal</span>
            <span className="ml-auto text-[10px] text-[#b0b8a0]">soon</span>
          </div>

          <div className="mt-3 mb-1 px-1">
            <span className="text-[9px] uppercase tracking-widest font-semibold text-[#b0b8a0]">Other</span>
          </div>
          <NavItem
            icon={Archive}
            label="Archived"
            active={activeView === "archived"}
            onClick={() => { setActiveView("archived"); setSelectedKey(null); }}
            testId="nav-archived"
          />
        </div>

        {/* Channel source legend footer */}
        {!convsLoading && (
          <div className="px-3 py-2 border-t border-[#eeeae4]">
            <p className="text-[10px] text-[#9a9a8a]">
              {filtered.length} of {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* ══ Conversation list panel ══════════════════════════════════════════ */}
      {/* Mobile: full-width, hidden once a conversation is open.
          Desktop: fixed 280px, always visible. */}
      <div className={`flex-col bg-white border-r border-[#e5e2dc] md:w-[280px] md:flex-shrink-0 ${selectedKey ? "hidden md:flex" : "flex w-full"}`}>
        {/* Mobile-only filter chip row — replaces the hidden sidebar nav */}
        <div className="flex md:hidden items-center gap-1.5 px-3 py-2 border-b border-[#eeeae4] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setLocation("/dashboard")}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-[#f0ede8] text-[#4a5a40] flex-shrink-0"
            data-testid="button-back-dashboard-mobile"
          >
            <ChevronLeft className="w-3 h-3" />
            Back
          </button>
          {(["all", "unread", "urgent", "assigned", "unmatched", "archived"] as SidebarView[]).map((v) => {
            const counts: Record<SidebarView, number | undefined> = {
              all: activeConvs.length,
              unread: activeConvs.filter((c) => c.lastMessageDirection === "inbound_patient").length,
              urgent: urgentConvs.length,
              assigned: (assignedItems.length + assignedToMeConvs.length) || undefined,
              unmatched: unmatchedConvs.length,
              archived: archivedConvs.length || undefined,
            };
            const labels: Record<SidebarView, string> = {
              all: "All", unread: "Unreplied", urgent: "Urgent",
              assigned: "Assigned", unmatched: "Unmatched", archived: "Archived",
            };
            const cnt = counts[v];
            if (v === "urgent" && !urgentConvs.length) return null;
            return (
              <button
                key={v}
                onClick={() => { setActiveView(v); }}
                className={`flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 transition-colors ${
                  activeView === v
                    ? "bg-[#2e7d52] text-white"
                    : "bg-[#f0ede8] text-[#4a5a40]"
                }`}
                data-testid={`mobile-filter-${v}`}
              >
                {labels[v]}
                {cnt !== undefined && cnt > 0 && (
                  <span className={`text-[9px] font-bold ${activeView === v ? "text-white/80" : "text-[#7a8060]"}`}>{cnt}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel header */}
        <div className="px-3 py-2.5 border-b border-[#eeeae4] bg-[#fdfcfa]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#3a4a30]">{viewLabel[activeView]}</span>
            <div className="flex items-center gap-1">
              {activeView !== "archived" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelectedKeys(new Set());
                  }}
                  data-testid="button-toggle-select-mode"
                  className={`h-6 text-[10px] px-2 ${selectMode ? "text-[#2e7d52] bg-[#e6f4ec]" : "text-[#7a8060]"}`}
                  title={selectMode ? "Exit selection mode" : "Select conversations to bulk archive"}
                >
                  {selectMode ? (
                    <><XIcon className="w-3 h-3 mr-1" />Cancel</>
                  ) : (
                    <><CheckSquare className="w-3 h-3 mr-1" />Select</>
                  )}
                </Button>
              )}
              {activeView === "all" && !selectMode && (
                <Users className="w-3.5 h-3.5 text-[#a0a880]" />
              )}
              {activeView === "archived" && archivedConvs.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkUnarchiveMutation.isPending}
                  onClick={() => bulkUnarchiveMutation.mutate()}
                  data-testid="button-restore-all-archived"
                  className="h-6 text-[10px] px-2 text-[#2e7d52] border-[#b6d9c3]"
                  title="Restore all archived conversations to inbox"
                >
                  {bulkUnarchiveMutation.isPending ? (
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <ArchiveRestore className="w-3 h-3 mr-1" />
                  )}
                  Restore all
                </Button>
              )}
            </div>
          </div>
          {/* Bulk action toolbar — shown when one or more conversations are selected */}
          {selectMode && (
            <div className="flex items-center gap-1.5 mb-2 px-1 py-1.5 rounded-md bg-[#f0f9f4] border border-[#b6d9c3]">
              <button
                className="text-[10px] text-[#2e7d52] font-medium hover:underline flex-shrink-0"
                onClick={() => setSelectedKeys(new Set(filtered.map((c) => c.conversationKey)))}
                data-testid="button-select-all"
              >
                All
              </button>
              <span className="text-[#c4b9a5] text-[10px]">·</span>
              <button
                className="text-[10px] text-[#7a8060] hover:underline flex-shrink-0"
                onClick={() => setSelectedKeys(new Set())}
                data-testid="button-select-none"
              >
                None
              </button>
              <span className="flex-1" />
              {selectedKeys.size > 0 && (
                <>
                  <span className="text-[10px] text-[#4a5a40] font-medium flex-shrink-0">
                    {selectedKeys.size} selected
                  </span>
                  <Button
                    size="sm"
                    disabled={bulkArchiveMutation.isPending}
                    onClick={() => bulkArchiveMutation.mutate(Array.from(selectedKeys))}
                    data-testid="button-bulk-archive"
                    className="h-6 text-[10px] px-2 bg-[#2e7d52] text-white"
                  >
                    {bulkArchiveMutation.isPending ? (
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Archive className="w-3 h-3 mr-1" />
                    )}
                    Archive
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9a8a]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 text-xs h-8 bg-[#f0ede8] border-[#e0dcd4]"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-[#e5e2dc] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-[#e5e2dc] rounded w-3/4" />
                    <div className="h-2 bg-[#e5e2dc] rounded w-full" />
                    <div className="h-2 bg-[#e5e2dc] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageCircle className="w-7 h-7 text-[#c4b9a5] mb-2" />
              <p className="text-sm font-medium text-[#6a6a5a]">
                {activeView === "archived"
                  ? "No archived conversations"
                  : conversations.length === 0
                  ? "No conversations yet"
                  : `No ${viewLabel[activeView].toLowerCase()}`}
              </p>
              <p className="text-xs text-[#9a9a8a] mt-0.5">
                {conversations.length === 0
                  ? "Inbound Spruce messages will appear here"
                  : search
                  ? "Try adjusting your search"
                  : activeView === "archived"
                  ? "Archived conversations will appear here"
                  : ""}
              </p>
              {/* Recovery hint: if All view is empty but archived conversations exist */}
              {activeView === "all" && !search && archivedConvs.length > 0 && (
                <div className="mt-4 p-3 rounded-md bg-[#fef9f0] border border-[#f6e4b8] max-w-[220px]">
                  <p className="text-xs text-[#92700a] font-medium mb-1.5">
                    {archivedConvs.length} conversation{archivedConvs.length !== 1 ? "s" : ""} in archive
                  </p>
                  <p className="text-[10px] text-[#9a8060] mb-2">
                    Conversations may have been auto-archived. Restore them to see them here.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkUnarchiveMutation.isPending}
                    onClick={() => bulkUnarchiveMutation.mutate()}
                    data-testid="button-restore-all-empty-state"
                    className="h-7 text-[11px] w-full text-[#2e7d52] border-[#b6d9c3]"
                  >
                    {bulkUnarchiveMutation.isPending ? (
                      <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                      <ArchiveRestore className="w-3 h-3 mr-1.5" />
                    )}
                    Restore all conversations
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ClinIQ-native @mention / notification items — shown only in assigned view */}
              {activeView === "assigned" && assignedItems.length > 0 && (
                <div className="py-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#9a9a8a]">
                    Needs your attention
                  </p>
                  {assignedItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => item.conversationKey && setSelectedKey(item.conversationKey)}
                      className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-[#f5f3ff] transition-colors border-b border-[#f0ede8] last:border-0"
                      data-testid={`assigned-item-${item.id}`}
                    >
                      <span
                        className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: item.kind === "mention" ? "#ede9fe" : "#fef3c7" }}
                      >
                        {item.kind === "mention"
                          ? <AtSign className="w-3 h-3" style={{ color: "#5b21b6" }} />
                          : <Bell className="w-3 h-3" style={{ color: "#b45309" }} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#1c2414] truncate">
                          {[item.patientFirstName, item.patientLastName].filter(Boolean).join(" ") || "Unknown Patient"}
                        </p>
                        <p className="text-[11px] text-[#6a6a5a] truncate">{item.snippet || item.reason}</p>
                        <p className="text-[10px] text-[#9a9a8a] mt-0.5">
                          {new Date(item.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (item.kind === "mention") {
                            acknowledgeMention.mutate(item.id);
                          } else {
                            dismissNotification.mutate(item.id);
                          }
                        }}
                        className="flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity mt-0.5"
                        title="Dismiss"
                        data-testid={`button-dismiss-${item.id}`}
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-[#4a5a40]" />
                      </button>
                    </button>
                  ))}
                </div>
              )}

              {/* Spruce-tagged conversations — label only when both sections are present */}
              {activeView === "assigned" && assignedItems.length > 0 && filtered.length > 0 && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#9a9a8a]">
                  Tagged conversations
                </p>
              )}

              {filtered.map((conv) => (
                <ConversationRow
                  key={conv.conversationKey}
                  conv={conv}
                  selected={selectedKey === conv.conversationKey}
                  onClick={() => setSelectedKey(conv.conversationKey)}
                  selectMode={selectMode}
                  isChecked={selectedKeys.has(conv.conversationKey)}
                  onToggle={toggleSelectKey}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Thread / right panel ─────────────────────────────────────────────────── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Thread header */}
          <div className="flex items-center justify-between px-3 md:px-5 py-3 bg-white border-b border-[#e5e2dc] flex-wrap gap-2">
            <div className="flex items-center gap-2 md:gap-3">
              {/* Mobile back-to-list button */}
              <button
                className="flex md:hidden items-center justify-center w-8 h-8 rounded-full hover:bg-[#f0ede8] transition-colors flex-shrink-0"
                onClick={() => setSelectedKey(null)}
                data-testid="button-back-conversations-mobile"
                aria-label="Back to conversations"
              >
                <ChevronLeft className="w-4 h-4 text-[#4a5a40]" />
              </button>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                style={{ backgroundColor: selectedConv.patientId ? "#2e7d52" : "#5c4a7a" }}
              >
                {getInitials(selectedConv.patientFirstName, selectedConv.patientLastName, selectedConv.fromPhone)}
              </div>
              <div>
                {convsLoading ? (
                  <>
                    <div className="h-3.5 w-32 rounded bg-[#e5e2dc] animate-pulse mb-1" />
                    <div className="h-2.5 w-24 rounded bg-[#eceae5] animate-pulse" />
                  </>
                ) : (
                  <>
                    <h2 className="text-sm font-semibold text-[#1c2414] leading-tight">
                      {getDisplayName(selectedConv)}
                    </h2>
                    {selectedConv.fromPhone && (
                      <p className="text-xs text-[#7a8060] font-mono leading-tight">{selectedConv.fromPhone}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedConv.isArchived && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#78716c] bg-[#f5f5f4] px-2 py-1 rounded-full border border-[#e7e5e4]">
                  <Archive className="w-2.5 h-2.5" />
                  Archived
                  {selectedConv.archivedAt && (
                    <span className="ml-0.5 text-[#a8a29e]">
                      · {new Date(selectedConv.archivedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  )}
                </span>
              )}
              {isStaffTakeover && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#92400e] bg-[#fef3c7] px-2 py-1 rounded-full border border-[#f6d860]">
                  <Lock className="w-2.5 h-2.5" />
                  Staff takeover
                </span>
              )}
              {selectedConv.patientId && (
                <Link href={`/patients?patient=${selectedConv.patientId}`}>
                  {/* Desktop: show label; Mobile: icon-only */}
                  <Button size="sm" variant="outline" data-testid="button-open-chart" title="Open chart">
                    <User className="w-3.5 h-3.5 md:mr-1.5" />
                    <span className="hidden md:inline">Open chart</span>
                  </Button>
                </Link>
              )}
              {spruceUrl && (
                <a href={spruceUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" data-testid="button-open-spruce" title="Open in Spruce">
                    <ExternalLink className="w-3.5 h-3.5 md:mr-1.5" />
                    <span className="hidden md:inline">Open in Spruce</span>
                  </Button>
                </a>
              )}
              {!selectedConv.hasStaffReply && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markRepliedMutation.isPending}
                  onClick={() => markRepliedMutation.mutate(selectedConv.conversationKey)}
                  data-testid="button-mark-replied"
                  className="text-[#2e7d52] border-[#b6d9c3]"
                  title="Mark as replied — remove from Unreplied view"
                >
                  {markRepliedMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 md:mr-1.5 animate-spin" />
                  ) : (
                    <MailCheck className="w-3.5 h-3.5 md:mr-1.5" />
                  )}
                  <span className="hidden md:inline">Mark replied</span>
                </Button>
              )}
              {selectedConv.isArchived ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unarchiveMutation.isPending}
                  onClick={() => unarchiveMutation.mutate(selectedConv.conversationKey)}
                  data-testid="button-unarchive-conversation"
                  className="text-[#2e7d52] border-[#b6d9c3]"
                  title="Restore conversation to inbox"
                >
                  {unarchiveMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 md:mr-1.5 animate-spin" />
                  ) : (
                    <ArchiveRestore className="w-3.5 h-3.5 md:mr-1.5" />
                  )}
                  <span className="hidden md:inline">{unarchiveMutation.isPending ? "Restoring…" : "Restore"}</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate(selectedConv.conversationKey)}
                  data-testid="button-archive-conversation"
                  className="text-[#78716c] border-[#d6d3d1]"
                  title="Archive conversation"
                >
                  {archiveMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 md:mr-1.5 animate-spin" />
                  ) : (
                    <Archive className="w-3.5 h-3.5 md:mr-1.5" />
                  )}
                  <span className="hidden md:inline">{archiveMutation.isPending ? "Archiving…" : "Archive"}</span>
                </Button>
              )}
              {/* Message count — hidden on smallest screens to save space */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#7a8060]">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{selectedConv.messageCount} message{selectedConv.messageCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>

          {/* Patient match / unmatched info bar */}
          {selectedConv.patientId ? (
            <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-[#eaf4ec] border border-[#c3e6cc] flex items-center gap-2">
              <UserCheck className="w-3.5 h-3.5 text-[#2e7d52] flex-shrink-0" />
              <p className="text-xs text-[#1a6b3c] flex-1">
                Matched to{" "}
                <Link href={`/patients?patient=${selectedConv.patientId}`} className="font-semibold underline underline-offset-2">
                  {selectedConv.patientFirstName} {selectedConv.patientLastName}
                </Link>
                {" "}— click their name to open their chart.
              </p>
            </div>
          ) : (
            <div className="mx-4 mt-3 rounded-md bg-[#f0ecf8] border border-[#d4c8ee]">
              {/* Unmatched status row */}
              <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                <User className="w-3.5 h-3.5 text-[#5c4a7a] flex-shrink-0" />
                <p className="text-xs text-[#3d2e6b] flex-1 min-w-0">
                  {selectedConv.fromPhone ? (
                    <>
                      <span className="font-mono font-semibold">{selectedConv.fromPhone}</span>
                      {selectedConv.spruceContactName ? (
                        <> — <span className="font-medium">{selectedConv.spruceContactName}</span></>
                      ) : null}
                      {" "}not matched to any patient.
                    </>
                  ) : (
                    "No phone number — cannot match to a patient."
                  )}
                </p>
                {selectedConv.fromPhone && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[#5c4a7a] border-[#c4b2e8]"
                      onClick={() => { setShowLinkPatient(v => !v); setLinkSearch(""); }}
                      data-testid="button-link-existing-patient"
                    >
                      <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                      Link existing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[#5c4a7a] border-[#c4b2e8]"
                      onClick={() => openAddPatient(selectedConv)}
                      data-testid="button-add-as-new-patient"
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                      New patient
                    </Button>
                  </div>
                )}
              </div>

              {/* Inline patient search — shown when "Link existing" is active */}
              {showLinkPatient && (
                <div className="border-t border-[#d4c8ee] px-3 py-2.5 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9a8a]" />
                    <input
                      autoFocus
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Search by name or phone…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-[#c4b2e8] bg-white outline-none focus:ring-1 focus:ring-[#9a7ed0]"
                      data-testid="input-link-patient-search"
                    />
                  </div>
                  {linkSearch.trim().length < 2 ? (
                    <p className="text-[10px] text-[#9a9a8a] text-center py-1">Type at least 2 characters to search</p>
                  ) : patientSearchResults.length === 0 ? (
                    <p className="text-[10px] text-[#9a9a8a] text-center py-1">No patients found</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {patientSearchResults.slice(0, 8).map((p) => (
                        <button
                          key={p.id}
                          disabled={linkPatientMutation.isPending}
                          onClick={() => linkPatientMutation.mutate({ key: selectedConv.conversationKey, patientId: p.id })}
                          data-testid={`button-link-patient-${p.id}`}
                          className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-[#e8dff4] transition-colors disabled:opacity-50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-[#7c5cb4] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                              {((p.firstName?.[0] ?? "") + (p.lastName?.[0] ?? "")).toUpperCase() || "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#2d1f4a] truncate">
                                {[p.firstName, p.lastName].filter(Boolean).join(" ") || "Unnamed patient"}
                              </p>
                              {p.phone && <p className="text-[10px] text-[#7a6a9a] font-mono truncate">{p.phone}</p>}
                            </div>
                          </div>
                          {linkPatientMutation.isPending ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-[#7c5cb4] flex-shrink-0" />
                          ) : (
                            <span className="text-[10px] text-[#7c5cb4] font-medium flex-shrink-0">Link</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── June task card (pending only — disappears when marked complete) ── */}
          {workflowRequest && workflowRequest.status !== "complete" && (() => {
            const workflowLabels: Record<string, string> = {
              medication_refill: "Medication Refill",
              intake_form: "Intake Form",
              new_patient: "New Patient",
              appointment: "Appointment",
              lab_question: "Lab Question",
              billing: "Billing",
              urgent_safety: "Urgent / Safety",
              unclassified: "General Request",
            };
            const label = workflowLabels[workflowRequest.workflow] ?? workflowRequest.workflow;
            return (
              <div className="mx-4 mt-2 rounded-md border px-3 py-2.5 bg-[#fffbeb] border-[#f6d860]">
                <div className="flex items-start gap-2">
                  <ClipboardList className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#92400e]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#92400e]">
                        June Task · {label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Pending
                      </span>
                    </div>
                    {(workflowRequest.juneMemoText || workflowRequest.requestSummary) && (
                      <p className="text-[11px] text-[#3a4630] mt-1 leading-snug">
                        {workflowRequest.juneMemoText || workflowRequest.requestSummary}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={markWorkflowCompleteMutation.isPending}
                    onClick={() => markWorkflowCompleteMutation.mutate(workflowRequest.id)}
                    data-testid="button-mark-task-complete"
                    className="flex-shrink-0 text-[11px]"
                    style={{ backgroundColor: "#2e7d52", color: "#fff" }}
                  >
                    {markWorkflowCompleteMutation.isPending ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    )}
                    {markWorkflowCompleteMutation.isPending ? "Saving…" : "Mark complete"}
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto py-4">
            {msgsLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-5 h-5 text-[#9a9a8a] animate-spin" />
              </div>
            ) : messages.length === 0 && optimisticMsgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <MessageCircle className="w-8 h-8 text-[#c4b9a5] mb-2" />
                <p className="text-sm text-[#7a8060]">No messages in this conversation</p>
              </div>
            ) : (
              <>
                {/* System events toggle — shown only when there are system events */}
                {systemEvents.length > 0 && (
                  <div className="flex justify-center mb-1 px-4">
                    <button
                      onClick={() => setShowSystemEvents((v) => !v)}
                      className="text-[10px] text-[#9a9a8a] hover:text-[#6a6a5a] underline-offset-2 hover:underline transition-colors"
                      data-testid="button-toggle-system-events"
                    >
                      {showSystemEvents
                        ? "Hide system events"
                        : `${systemEvents.length} system event${systemEvents.length !== 1 ? "s" : ""} hidden · Show`}
                    </button>
                  </div>
                )}
                {messageGroups.map((group) => (
                  <div key={group.dateLabel}>
                    <DateDivider label={group.dateLabel} />
                    {group.messages.map((msg) => (
                      <ThreadEvent key={msg.id} msg={msg} />
                    ))}
                  </div>
                ))}
                {optimisticMsgs.map((msg) => (
                  <ThreadEvent key={msg.id} msg={msg} optimistic />
                ))}
              </>
            )}
            <div ref={threadBottomRef} />
          </div>

          {/* ── Compose / Reply footer ──────────────────────────────────── */}
          <div className="border-t border-[#e5e2dc] bg-white px-3 md:px-4 pt-2 pb-20 md:pb-[72px]">

            {/* Mode toggle row */}
            <div className="flex items-center gap-1 mb-2">
              <button
                onClick={() => { setComposeMode("reply"); setMentionedUsers([]); setShowMentionPicker(false); }}
                data-testid="button-compose-reply"
                className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full transition-colors ${
                  composeMode === "reply"
                    ? "bg-[#2e7d52] text-white"
                    : "bg-[#f0ede8] text-[#5a6a50] hover:bg-[#e5e2dc]"
                }`}
              >
                <Send className="w-3 h-3" />
                Message patient
              </button>
              <button
                onClick={() => setComposeMode("note")}
                data-testid="button-compose-note"
                className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full transition-colors ${
                  composeMode === "note"
                    ? "bg-[#5b21b6] text-white"
                    : "bg-[#f0ede8] text-[#5a6a50] hover:bg-[#e5e2dc]"
                }`}
              >
                <StickyNote className="w-3 h-3" />
                Internal note
              </button>
            </div>

            {/* @mention pills — shown only in note mode */}
            {composeMode === "note" && (
              <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
                {mentionedUsers.map(m => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "#ede9fe", color: "#5b21b6" }}
                  >
                    <AtSign className="w-2.5 h-2.5" />
                    {[m.firstName, m.lastName].filter(Boolean).join(" ")}
                    <button
                      onClick={() => setMentionedUsers(prev => prev.filter(u => u.id !== m.id))}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                    >
                      <XIcon className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setShowMentionPicker(v => !v)}
                  data-testid="button-add-mention"
                  className="flex items-center gap-1 text-[11px] text-[#5b21b6] hover:text-[#3b0764] px-2 py-0.5 rounded-full hover:bg-[#ede9fe] transition-colors"
                >
                  <AtSign className="w-3 h-3" />
                  Mention
                </button>
                {showMentionPicker && (
                  <div className="relative">
                    <div
                      className="absolute bottom-7 left-0 z-50 bg-white rounded-lg border border-[#ddd6fe] shadow-lg w-52 overflow-hidden"
                    >
                      <div className="p-1.5 border-b border-[#f0ede8]">
                        <input
                          autoFocus
                          value={mentionSearch}
                          onChange={e => setMentionSearch(e.target.value)}
                          placeholder="Search staff…"
                          className="w-full text-xs px-2 py-1 rounded border border-[#e0dcd4] outline-none focus:ring-1 focus:ring-[#8b5cf6]"
                          data-testid="input-mention-search"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto py-1">
                        {clinicMembers
                          .filter(m => {
                            const q = mentionSearch.toLowerCase();
                            const name = [m.firstName, m.lastName].filter(Boolean).join(" ").toLowerCase();
                            return !q || name.includes(q);
                          })
                          .filter(m => !mentionedUsers.find(mu => mu.id === m.id))
                          .slice(0, 8)
                          .map(m => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setMentionedUsers(prev => [...prev, m]);
                                setShowMentionPicker(false);
                                setMentionSearch("");
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5f3ff] transition-colors"
                            >
                              <span className="font-medium text-[#2d1f4a]">
                                {[m.title, m.firstName, m.lastName].filter(Boolean).join(" ")}
                              </span>
                              {m.role && (
                                <span className="ml-1 text-[10px] text-[#9a8a9a]">{m.role}</span>
                              )}
                            </button>
                          ))}
                        {clinicMembers.length === 0 && (
                          <p className="text-[10px] text-[#9a9a8a] text-center py-2">No staff found</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div
              className="rounded-lg border overflow-hidden"
              style={{
                borderColor: composeMode === "note" ? "#ddd6fe" : "#e0dcd4",
                backgroundColor: composeMode === "note" ? "#faf8ff" : "#fafaf8",
              }}
            >
              <Textarea
                ref={textareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={composeMode === "note" ? "Write a staff-only internal note… (⌘↵ to save)" : "Type a reply… (⌘↵ to send)"}
                className="resize-none border-0 rounded-none text-sm bg-transparent focus-visible:ring-0 min-h-[80px] max-h-[160px]"
                style={{ color: composeMode === "note" ? "#2e1065" : undefined }}
                data-testid="textarea-reply"
              />
              <div
                className="flex items-center justify-between px-3 py-2 border-t"
                style={{ borderColor: composeMode === "note" ? "#ddd6fe" : "#eeeae4" }}
              >
                {composeMode === "note" ? (
                  <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "#7c3aed" }}>
                    <StickyNote className="w-3 h-3 flex-shrink-0" />
                    <span>Staff only · never visible to patient</span>
                  </div>
                ) : hasSpruceToken ? (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#9a9a8a]">
                    <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                    <span>Sends via Spruce · logged for audit</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#b45309] flex-wrap">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>Stored in ClinIQ only — Spruce API token not configured.</span>
                    <Link href="/account?tab=spruce" className="underline underline-offset-2 inline-flex items-center gap-0.5">
                      <Settings className="w-2.5 h-2.5" />
                      Configure
                    </Link>
                  </div>
                )}
                <Button
                  size="sm"
                  disabled={!replyText.trim() || sendReply.isPending || sendInternalNote.isPending}
                  onClick={handleSend}
                  style={{ backgroundColor: composeMode === "note" ? "#5b21b6" : "#2e7d52" }}
                  className="text-white flex-shrink-0 ml-2"
                  data-testid="button-send-reply"
                >
                  {(sendReply.isPending || sendInternalNote.isPending) ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : composeMode === "note" ? (
                    <StickyNote className="w-3.5 h-3.5 mr-1.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {sendReply.isPending || sendInternalNote.isPending
                    ? composeMode === "note" ? "Saving…" : "Sending…"
                    : composeMode === "note" ? "Save note" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center bg-[#f5f2ee]">
          <div className="text-center max-w-xs">
            <div className="w-16 h-16 rounded-full bg-[#e6f4ec] flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-[#2e7d52]" />
            </div>
            <h3 className="text-base font-semibold text-[#1c2414] mb-1">
              {viewLabel[activeView]}
            </h3>
            <p className="text-sm text-[#7a8060] leading-relaxed">
              {convsLoading
                ? "Loading conversations…"
                : filtered.length === 0 && conversations.length > 0
                  ? `No conversations in this view.`
                  : conversations.length === 0
                  ? "No inbound messages yet."
                  : "Select a conversation to view the thread."}
            </p>
          </div>
        </div>
      )}

      {/* Add patient dialog */}
      <AddPatientDialog
        open={showAddPatient}
        onOpenChange={setShowAddPatient}
        onCreated={handlePatientCreated}
        initialValues={addPatientInit}
      />
    </div>
  );
}
