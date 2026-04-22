import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Inbox as InboxIcon, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function InboxPage() {
  const [, setLocation] = useLocation();

  const { data, isLoading, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
  });

  const unread = data?.unreadMessages ?? [];

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
              <h1 className="text-2xl font-semibold" style={{ color: "#1c2414" }}>
                Inbox
              </h1>
              <p className="text-sm" style={{ color: "#7a8a64" }}>
                {unread.length === 0
                  ? "All caught up — no unread patient messages"
                  : `${unread.length} patient${unread.length !== 1 ? "s" : ""} with unread messages`}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-inbox">
            Refresh
          </Button>
        </div>

        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "#d4c9b5", backgroundColor: "#ffffff" }}
        >
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg animate-pulse"
                  style={{ backgroundColor: "#f0ece5" }}
                />
              ))}
            </div>
          ) : unread.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <MessageSquare className="w-10 h-10 mb-3" style={{ color: "#c4b9a5" }} />
              <p className="text-base font-medium" style={{ color: "#1c2414" }}>
                Your inbox is empty
              </p>
              <p className="text-sm mt-1" style={{ color: "#7a8a64" }}>
                Patient replies from Spruce, the patient portal, and direct messages will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
              {unread.map((row) => (
                <button
                  key={`unread-${row.patientId}`}
                  data-testid={`row-unread-${row.patientId}`}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
                  style={{ backgroundColor: "transparent" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#f9f6f2")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  onClick={() =>
                    setLocation(`/patients?patient=${row.patientId}&tab=messages`)
                  }
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                    style={{ backgroundColor: "#2e3a20" }}
                  >
                    {row.patientFirstName?.[0] ?? ""}
                    {row.patientLastName?.[0] ?? ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: "#1c2414" }}
                    >
                      {row.patientFirstName} {row.patientLastName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                      {row.count} unread message{row.count !== 1 ? "s" : ""} · last{" "}
                      {timeAgo(row.lastAt)}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: "#c0392b" }}
                  >
                    {row.count}
                  </span>
                  <ArrowRight
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: "#c4b9a5" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-center" style={{ color: "#a0a880" }}>
          Messages sync with your configured external platform (e.g. Spruce). Open a thread
          here or in your platform — it marks read in both places.
        </p>
      </main>
    </div>
  );
}
