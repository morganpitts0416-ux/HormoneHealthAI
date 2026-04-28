import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Inbox as InboxIcon, MessageSquare, ArrowRight, Bell, AlertCircle,
  Pill, Droplet, Trash2, CheckCheck, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

interface UnreadMessageRow {
  patientId: number;
  patientFirstName: string;
  patientLastName: string;
  count: number;
  lastAt: string;
}

interface NotificationsData {
  unreadMessages: UnreadMessageRow[];
  pendingOrders: unknown[];
}

interface InboxNotification {
  id: number;
  clinicId: number;
  patientId: number | null;
  providerId: number | null;
  type: string;
  title: string;
  message: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  severity: string;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

interface InboxResponse {
  notifications: InboxNotification[];
  unreadCount: number;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function iconForType(type: string) {
  if (type === "patient_added_med_or_supplement") return Pill;
  if (type === "unexpected_bleeding_reported") return Droplet;
  return AlertCircle;
}

function colorForSeverity(severity: string) {
  if (severity === "urgent") return "#c0392b";
  if (severity === "warning") return "#d4862c";
  return "#2e3a20";
}

export default function InboxPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading: messagesLoading, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/clinician/notifications"],
    refetchInterval: 30_000,
  });

  const { data: inbox, isLoading: notifLoading } = useQuery<InboxResponse>({
    queryKey: ["/api/clinician/inbox-notifications"],
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/clinician/inbox-notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications/unread-count"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/clinician/inbox-notifications/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/clinician/inbox-notifications/mark-all-read", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications/unread-count"] });
    },
  });

  const unread = data?.unreadMessages ?? [];
  const notifications = inbox?.notifications ?? [];
  const unreadNotifs = notifications.filter((n) => !n.readAt);

  const openNotification = (n: InboxNotification) => {
    if (!n.readAt) markReadMutation.mutate(n.id);
    if (n.patientId) setLocation(`/patients?patient=${n.patientId}`);
  };

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f5f2ed" }}>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "#edf4e4" }}
            >
              <InboxIcon className="w-5 h-5" style={{ color: "#2e3a20" }} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>Inbox</h1>
              <p className="text-sm" style={{ color: "#7a8a64" }}>
                Patient messages and care alerts
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["/api/clinician/inbox-notifications"] }); }} data-testid="button-refresh-inbox">
            Refresh
          </Button>
        </div>

        {/* ── Notifications ─────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#5a6048" }}>
                Notifications
              </h2>
              {unreadNotifs.length > 0 && (
                <Badge
                  className="text-white"
                  style={{ backgroundColor: "#c0392b" }}
                  data-testid="badge-notif-unread-count"
                >
                  {unreadNotifs.length} unread
                </Badge>
              )}
            </div>
            {unreadNotifs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="w-4 h-4 mr-1.5" /> Mark all read
              </Button>
            )}
          </div>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}
          >
            {notifLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: "#f0ece5" }} />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Bell className="w-8 h-8 mb-2" style={{ color: "#c4b9a5" }} />
                <p className="text-sm font-medium" style={{ color: "#1c2414" }}>No notifications</p>
                <p className="text-xs mt-1" style={{ color: "#7a8a64" }}>
                  You'll see patient-added medications, unexpected bleeding reports, and other care alerts here.
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
                {notifications.map((n) => {
                  const Icon = iconForType(n.type);
                  const color = colorForSeverity(n.severity);
                  const unread = !n.readAt;
                  return (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-5 py-3.5"
                      style={{ backgroundColor: unread ? "#fbf9f4" : "transparent" }}
                      data-testid={`row-notif-${n.id}`}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}1a`, color }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <button
                        type="button"
                        onClick={() => openNotification(n)}
                        className="flex-1 min-w-0 text-left hover-elevate rounded-md p-1 -m-1"
                        data-testid={`button-open-notif-${n.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                            {n.title}
                          </p>
                          {unread && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: "#c0392b" }}
                              aria-label="unread"
                            />
                          )}
                        </div>
                        {n.message && (
                          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "#5a6048" }}>{n.message}</p>
                        )}
                        <p className="text-[11px] mt-0.5" style={{ color: "#a0a880" }}>{timeAgo(n.createdAt)}</p>
                      </button>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {unread && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => markReadMutation.mutate(n.id)}
                            title="Mark read"
                            data-testid={`button-mark-read-${n.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => dismissMutation.mutate(n.id)}
                          title="Delete"
                          data-testid={`button-dismiss-${n.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── Patient Messages ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" style={{ color: "#2e3a20" }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#5a6048" }}>
              Patient Messages
            </h2>
            {unread.length > 0 && (
              <Badge className="text-white" style={{ backgroundColor: "#c0392b" }}>
                {unread.length} {unread.length === 1 ? "thread" : "threads"}
              </Badge>
            )}
          </div>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}
          >
            {messagesLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: "#f0ece5" }} />
                ))}
              </div>
            ) : unread.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <MessageSquare className="w-8 h-8 mb-2" style={{ color: "#c4b9a5" }} />
                <p className="text-sm font-medium" style={{ color: "#1c2414" }}>No unread patient messages</p>
                <p className="text-xs mt-1" style={{ color: "#7a8a64" }}>
                  Replies from Spruce, the patient portal, and direct messages will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
                {unread.map((row) => (
                  <button
                    key={`unread-${row.patientId}`}
                    data-testid={`row-unread-${row.patientId}`}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover-elevate"
                    onClick={() => setLocation(`/patients?patient=${row.patientId}&tab=messages`)}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                      style={{ backgroundColor: "#2e3a20" }}
                    >
                      {row.patientFirstName?.[0] ?? ""}
                      {row.patientLastName?.[0] ?? ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                        {row.patientFirstName} {row.patientLastName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                        {row.count} unread message{row.count !== 1 ? "s" : ""} · last {timeAgo(row.lastAt)}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: "#c0392b" }}
                    >
                      {row.count}
                    </span>
                    <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "#c4b9a5" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <p className="text-xs text-center" style={{ color: "#a0a880" }}>
          Care alerts and patient-reported changes appear in Notifications. Messages sync with your configured platform.
        </p>
      </main>
    </div>
  );
}
