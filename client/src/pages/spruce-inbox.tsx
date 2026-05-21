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
  Filter,
  Send,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AddPatientDialog } from "@/components/add-patient-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
}

interface ConvState {
  state: string;
  aiMutedAt: string | null;
}

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

function getDisplayName(conv: SpruceConversation): string {
  if (conv.patientFirstName && conv.patientLastName) return `${conv.patientFirstName} ${conv.patientLastName}`;
  if (conv.spruceContactName) return conv.spruceContactName;
  return conv.fromPhone ?? conv.spruceConversationId ?? "Unknown contact";
}

function parseNameParts(name: string | null): { firstName: string; lastName: string } | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ── ConversationRow ────────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  selected,
  onClick,
}: {
  conv: SpruceConversation;
  selected: boolean;
  onClick: () => void;
}) {
  const name = getDisplayName(conv);
  const initials = getInitials(conv.patientFirstName, conv.patientLastName, conv.fromPhone);
  const isPatient = !!conv.patientId;

  return (
    <button
      className={`w-full text-left px-4 py-3 flex gap-3 transition-colors border-b border-[#eeeae4] ${
        selected ? "bg-[#eaf3ec]" : "hover:bg-[#f5f2ee]"
      }`}
      onClick={onClick}
      data-testid={`conv-row-${conv.conversationKey}`}
    >
      <div
        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold text-white"
        style={{ backgroundColor: isPatient ? "#2e7d52" : "#5c4a7a" }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold text-[#1c2414] truncate">{name}</span>
          <span className="text-xs text-[#7a8060] flex-shrink-0">{formatTime(conv.lastMessageAt)}</span>
        </div>
        <p className="text-xs text-[#5a6040] truncate leading-relaxed">
          {conv.lastMessageDirection === "outbound_staff" && (
            <span className="text-[#2e7d52] font-medium">You: </span>
          )}
          {conv.lastMessage ?? <span className="italic text-[#9a9a8a]">No message text</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ msg, optimistic }: { msg: SpruceMessage; optimistic?: boolean }) {
  const isStaff = msg.messageDirection === "outbound_staff";

  if (isStaff) {
    return (
      <div className={`flex justify-end mb-3 px-4 ${optimistic ? "opacity-60" : ""}`} data-testid={`msg-${msg.id}`}>
        <div className="max-w-[72%]">
          <div
            className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white leading-relaxed"
            style={{ backgroundColor: "#2e7d52" }}
          >
            {msg.messageBody}
          </div>
          <p className="text-[10px] text-[#8a8a7a] mt-1 text-right flex items-center justify-end gap-1">
            {optimistic && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
            {formatMessageTime(msg.receivedAt)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3 px-4" data-testid={`msg-${msg.id}`}>
      <div className="max-w-[72%]">
        {(msg.patientFirstName || msg.fromPhone) && (
          <p className="text-[10px] text-[#6a6a5a] font-medium mb-1 ml-1">
            {msg.patientFirstName && msg.patientLastName
              ? `${msg.patientFirstName} ${msg.patientLastName}`
              : msg.fromPhone ?? "Contact"}
          </p>
        )}
        <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed bg-white border border-[#e5e2dc] text-[#1c2414]">
          {msg.messageBody ?? <span className="italic text-[#9a9a8a]">— non-text event —</span>}
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
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "patients" | "unmatched">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [addPatientInit, setAddPatientInit] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});
  const [replyText, setReplyText] = useState("");
  // Optimistic messages shown while send is in flight
  const [optimisticMsgs, setOptimisticMsgs] = useState<SpruceMessage[]>([]);
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
      // Optimistic insert
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

  // Scroll to bottom when thread loads or new message arrives
  useEffect(() => {
    if ((!msgsLoading && messages.length > 0) || optimisticMsgs.length > 0) {
      setTimeout(() => threadBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [selectedKey, msgsLoading, messages.length, optimisticMsgs.length]);

  // Clear optimistic messages when selectedKey changes
  useEffect(() => {
    setOptimisticMsgs([]);
    setReplyText("");
  }, [selectedKey]);

  // Auto-select first conversation when list loads
  useEffect(() => {
    if (!selectedKey && conversations.length > 0) {
      setSelectedKey(conversations[0].conversationKey);
    }
  }, [conversations, selectedKey]);

  // ── Filtering + sorting ─────────────────────────────────────────────────
  const filtered = conversations
    .filter((c) => {
      if (filter === "patients" && !c.patientId) return false;
      if (filter === "unmatched" && c.patientId) return false;
      const name = getDisplayName(c).toLowerCase();
      const phone = (c.fromPhone ?? "").toLowerCase();
      const q = search.toLowerCase();
      return !q || name.includes(q) || phone.includes(q);
    })
    .sort((a, b) => {
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
    if (!body || sendReply.isPending) return;
    sendReply.mutate(body);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
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

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="w-[300px] flex-shrink-0 flex flex-col bg-white border-r border-[#e5e2dc]">
        {/* Panel header */}
        <div className="px-4 py-3 border-b border-[#eeeae4] bg-[#faf8f5]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={() => setLocation("/dashboard")} data-testid="button-back-dashboard">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold text-[#1c2414]">Spruce Inbox</span>
            </div>
            <Button size="icon" variant="ghost" onClick={() => { refetchConvs(); if (selectedKey) refetchMsgs(); }} data-testid="button-refresh-inbox">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9a8a]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="pl-8 text-xs h-8 bg-[#f0ede8] border-[#e0dcd4]"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0 border-b border-[#eeeae4] px-4 py-1.5">
          {(["all", "patients", "unmatched"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                filter === f ? "bg-[#e6f4ec] text-[#2e7d52] font-semibold" : "text-[#6a6a5a] hover:text-[#1c2414]"
              }`}
              data-testid={`filter-${f}`}
            >
              {f === "all" ? "All" : f === "patients" ? "Patients" : "Unmatched"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <Filter className="w-3 h-3 text-[#9a9a8a]" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
              className="text-xs text-[#6a6a5a] bg-transparent border-none outline-none cursor-pointer"
              data-testid="select-sort"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-[#e5e2dc] flex-shrink-0" />
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
              <MessageCircle className="w-8 h-8 text-[#c4b9a5] mb-2" />
              <p className="text-sm font-medium text-[#6a6a5a]">
                {conversations.length === 0 ? "No conversations yet" : "No matches"}
              </p>
              <p className="text-xs text-[#9a9a8a] mt-0.5">
                {conversations.length === 0
                  ? "Inbound Spruce messages will appear here"
                  : "Try adjusting your search or filter"}
              </p>
            </div>
          ) : (
            filtered.map((conv) => (
              <ConversationRow
                key={conv.conversationKey}
                conv={conv}
                selected={selectedKey === conv.conversationKey}
                onClick={() => setSelectedKey(conv.conversationKey)}
              />
            ))
          )}
        </div>

        {!convsLoading && conversations.length > 0 && (
          <div className="px-4 py-2 border-t border-[#eeeae4] bg-[#faf8f5]">
            <p className="text-[10px] text-[#9a9a8a]">
              {filtered.length} of {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Thread header */}
          <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-[#e5e2dc] flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                style={{ backgroundColor: selectedConv.patientId ? "#2e7d52" : "#5c4a7a" }}
              >
                {getInitials(selectedConv.patientFirstName, selectedConv.patientLastName, selectedConv.fromPhone)}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#1c2414] leading-tight">
                  {getDisplayName(selectedConv)}
                </h2>
                {selectedConv.fromPhone && (
                  <p className="text-xs text-[#7a8060] font-mono leading-tight">{selectedConv.fromPhone}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isStaffTakeover && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#92400e] bg-[#fef3c7] px-2 py-1 rounded-full border border-[#f6d860]">
                  <Lock className="w-2.5 h-2.5" />
                  Staff takeover
                </span>
              )}
              {selectedConv.patientId && (
                <Link href={`/patients/${selectedConv.patientId}`}>
                  <Button size="sm" variant="outline" data-testid="button-open-chart">
                    <User className="w-3.5 h-3.5 mr-1.5" />
                    Open chart
                  </Button>
                </Link>
              )}
              {spruceUrl && (
                <a href={spruceUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" data-testid="button-open-spruce">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Open in Spruce
                  </Button>
                </a>
              )}
              <div className="flex items-center gap-1.5 text-xs text-[#7a8060]">
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
                <Link href={`/patients/${selectedConv.patientId}`} className="font-semibold underline underline-offset-2">
                  {selectedConv.patientFirstName} {selectedConv.patientLastName}
                </Link>
                {" "}— click their name to open their chart.
              </p>
            </div>
          ) : (
            <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-[#f0ecf8] border border-[#d4c8ee] flex items-center gap-2 flex-wrap">
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
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[#5c4a7a] border-[#c4b2e8] flex-shrink-0"
                  onClick={() => openAddPatient(selectedConv)}
                  data-testid="button-add-as-new-patient"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Add as new patient
                </Button>
              )}
            </div>
          )}

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
                {messageGroups.map((group) => (
                  <div key={group.dateLabel}>
                    <DateDivider label={group.dateLabel} />
                    {group.messages.map((msg) => (
                      <MessageBubble key={msg.id} msg={msg} />
                    ))}
                  </div>
                ))}
                {/* Optimistic messages */}
                {optimisticMsgs.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} optimistic />
                ))}
              </>
            )}
            <div ref={threadBottomRef} />
          </div>

          {/* ── Compose / Reply footer ──────────────────────────────────── */}
          {/* pb-[72px] creates clearance above the fixed "Ask June" bubble (bottom-6 right-6) */}
          <div className="border-t border-[#e5e2dc] bg-white px-4 pt-3 pb-[72px]">
            <div className="rounded-lg border border-[#e0dcd4] bg-[#fafaf8] overflow-hidden">
              <Textarea
                ref={textareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply… (⌘↵ to send)"
                className="resize-none border-0 rounded-none text-sm bg-transparent focus-visible:ring-0 min-h-[80px] max-h-[160px]"
                data-testid="textarea-reply"
              />
              <div className="flex items-center justify-between px-3 py-2 border-t border-[#eeeae4]">
                {hasSpruceToken ? (
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
                  disabled={!replyText.trim() || sendReply.isPending}
                  onClick={handleSend}
                  style={{ backgroundColor: "#2e7d52" }}
                  className="text-white flex-shrink-0 ml-2"
                  data-testid="button-send-reply"
                >
                  {sendReply.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {sendReply.isPending ? "Sending…" : "Send"}
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
              <MessageCircle className="w-8 h-8 text-[#2e7d52]" />
            </div>
            <h3 className="text-base font-semibold text-[#1c2414] mb-1">Spruce Messaging Inbox</h3>
            <p className="text-sm text-[#7a8060] leading-relaxed">
              {convsLoading
                ? "Loading conversations…"
                : conversations.length === 0
                  ? "No inbound Spruce messages yet."
                  : "Select a conversation from the left to view the thread."}
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
