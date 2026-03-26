import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Leaf, LogOut, ChevronLeft, Send, MessageSquare, CalendarDays, Package } from "lucide-react";

interface PortalPatient {
  patientId: number;
  email: string;
  firstName: string;
  lastName: string;
  gender: string;
  clinicName: string;
  clinicianName: string;
}

interface PortalMessage {
  id: number;
  patientId: number;
  clinicianId: number;
  senderType: 'patient' | 'clinician';
  content: string;
  readAt: string | null;
  createdAt: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function PortalMessages() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: patient, error: patientError } = useQuery<PortalPatient>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const { data: messagingConfig } = useQuery<{
    messagingPreference: 'none' | 'in_app' | 'sms' | 'external_api';
    messagingPhone: string | null;
  }>({
    queryKey: ["/api/portal/messaging-config"],
    enabled: !!patient,
    retry: false,
  });

  // Both 'in_app' and 'external_api' show the in-app thread to patients
  const isInApp = messagingConfig?.messagingPreference === 'in_app' ||
    messagingConfig?.messagingPreference === 'external_api';

  const { data: messages = [], isLoading: messagesLoading } = useQuery<PortalMessage[]>({
    queryKey: ["/api/portal/messages"],
    enabled: !!patient && isInApp,
    refetchInterval: 15000,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/portal/login");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", "/api/portal/messages", { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/messages"] });
      setDraft("");
    },
  });

  useEffect(() => {
    if (patientError) setLocation("/portal/login");
  }, [patientError, setLocation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim() || sendMutation.isPending) return;
    sendMutation.mutate(draft.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!patient) return null;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/portal/dashboard">
            <button
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "#7a8a64" }}
              data-testid="button-portal-back"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          </Link>
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
            <p className="text-sm font-semibold leading-tight" style={{ color: "#1c2414" }}>
              {patient.clinicName || "Your Care Team"}
            </p>
            {patient.clinicianName && (
              <p className="text-xs" style={{ color: "#7a8a64" }}>{patient.clinicianName}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-portal-logout-msgs"
            className="text-xs gap-1.5"
            style={{ color: "#7a8a64" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Message thread */}
      <main className="flex-1 overflow-y-auto pb-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-3">
          {/* SMS mode */}
          {messagingConfig?.messagingPreference === 'sms' && messagingConfig.messagingPhone && (
            <div className="text-center py-16 space-y-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: "#edf2e6" }}
              >
                <MessageSquare className="w-6 h-6" style={{ color: "#2e3a20" }} />
              </div>
              <p className="text-base font-semibold" style={{ color: "#1c2414" }}>
                Text your care team
              </p>
              <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "#7a8a64" }}>
                Your clinic communicates via text message. Tap the button below to open your messaging app.
              </p>
              <a href={`sms:${messagingConfig.messagingPhone}`}>
                <button
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium"
                  style={{ backgroundColor: "#2e3a20", color: "#e8ddd0" }}
                  data-testid="button-open-sms"
                >
                  <MessageSquare className="w-4 h-4" />
                  Open text message
                </button>
              </a>
            </div>
          )}

          {/* 'none' mode */}
          {messagingConfig?.messagingPreference === 'none' && (
            <div className="text-center py-16 space-y-3">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: "#f0ece5" }}
              >
                <MessageSquare className="w-6 h-6" style={{ color: "#a0a880" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
                Messaging not available
              </p>
              <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "#7a8a64" }}>
                Your care team has not enabled portal messaging. Please contact your clinic directly.
              </p>
            </div>
          )}

          {/* in_app mode */}
          {isInApp && messagesLoading ? (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: "#7a8a64" }}>Loading messages…</p>
            </div>
          ) : isInApp && messages.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: "#edf2e6" }}
              >
                <MessageSquare className="w-5 h-5" style={{ color: "#2e3a20" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
                Send your care team a message
              </p>
              <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "#7a8a64" }}>
                Questions about your labs, supplements, or protocol? Your care team will reply here.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isPatient = msg.senderType === 'patient';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isPatient ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-xs sm:max-w-sm rounded-2xl px-4 py-3 space-y-1"
                    style={
                      isPatient
                        ? { backgroundColor: "#2e3a20", color: "#e8ddd0" }
                        : { backgroundColor: "#ffffff", color: "#1c2414", border: "1px solid #ede8df" }
                    }
                  >
                    {!isPatient && (
                      <p className="text-xs font-medium mb-1" style={{ color: "#7a8a64" }}>
                        {patient.clinicianName || patient.clinicName || "Care Team"}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className="text-xs mt-1"
                      style={{ color: isPatient ? "#a8b890" : "#a0a880" }}
                    >
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Compose area — fixed above bottom nav (in_app mode only) */}
      {isInApp && <div
        className="fixed bottom-16 left-0 right-0 border-t px-4 py-3 z-30"
        style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}
      >
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm outline-none min-h-[42px] max-h-32"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e0d8cc",
              color: "#1c2414",
              lineHeight: "1.5",
            }}
            placeholder="Write a message…"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="input-portal-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim() || sendMutation.isPending}
            data-testid="button-portal-send-message"
            style={{ backgroundColor: "#2e3a20", color: "#e8ddd0", flexShrink: 0 }}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-xs mt-2" style={{ color: "#b0b8a0" }}>
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>}

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 border-t z-40"
        style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}
      >
        <div className="max-w-3xl mx-auto px-4 flex">
          <Link href="/portal/dashboard" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-home">
              <CalendarDays className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Overview</span>
            </button>
          </Link>
          <Link href="/portal/supplements" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-supplements">
              <Package className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Protocol</span>
            </button>
          </Link>
          <Link href="/portal/messages" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-messages">
              <MessageSquare className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-semibold" style={{ color: "#2e3a20" }}>Messages</span>
            </button>
          </Link>
        </div>
      </nav>
    </div>
  );
}
