import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, Copy, Check, Clock, User, MapPin,
  Stethoscope, Link2, RefreshCw, CalendarOff
} from "lucide-react";
import { useState } from "react";
import type { Appointment } from "@shared/schema";

function statusBadge(status: string) {
  if (status === "cancelled") return <Badge className="text-[10px] py-0 bg-red-100 text-red-700 border-red-200 no-default-active-elevate">Cancelled</Badge>;
  if (status === "rescheduled") return <Badge className="text-[10px] py-0 bg-amber-100 text-amber-700 border-amber-200 no-default-active-elevate">Rescheduled</Badge>;
  if (status === "completed") return <Badge className="text-[10px] py-0 bg-emerald-100 text-emerald-700 border-emerald-200 no-default-active-elevate">Completed</Badge>;
  return <Badge className="text-[10px] py-0 bg-blue-100 text-blue-700 border-blue-200 no-default-active-elevate">Scheduled</Badge>;
}

function formatDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function groupByDate(appts: Appointment[]): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>();
  for (const a of appts) {
    const key = new Date(a.appointmentStart).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return map;
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);

  const webhookUrl = user
    ? `${window.location.origin}/api/webhooks/boulevard/${user.id}`
    : "";

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const { data: appointments = [], isLoading, refetch, isFetching } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    staleTime: 30 * 1000,
  });

  const now = new Date();
  const upcoming = appointments.filter(a => new Date(a.appointmentStart) >= now && a.status !== "cancelled");
  const past = appointments.filter(a => new Date(a.appointmentStart) < now || a.status === "cancelled");
  const upcomingGroups = groupByDate(upcoming);
  const pastGroups = groupByDate(past.slice(0, 30));

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f5f2ed" }}>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" style={{ color: "#5a7040" }} />
            <h1 className="text-lg font-semibold" style={{ color: "#1c2414" }}>Appointments</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-appointments"
            style={{ color: "#2e3a20" }}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Zapier Setup Card */}
        <div className="rounded-md border p-4 space-y-3" style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}>
          <div className="flex items-start gap-2.5">
            <Link2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#5a7040" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>Zapier Appointment Sync</p>
              <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                Paste this personal webhook URL as the action in each of your Zaps. ClinIQ accepts appointments from any scheduling platform that supports Zapier (Boulevard, Jane App, Mindbody, Acuity, etc.).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <code
              className="flex-1 text-xs rounded px-3 py-2 font-mono truncate select-all"
              style={{ backgroundColor: "#f5f2ed", color: "#2e3a20", border: "1px solid #d4c9b5" }}
              data-testid="text-webhook-url"
            >
              {webhookUrl}
            </code>
            <Button size="sm" variant="outline" onClick={copyWebhook} data-testid="button-copy-webhook">
              {copied ? <><Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />Copied</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>}
            </Button>
          </div>

        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Upcoming", value: upcoming.length, color: "#2e3a20" },
            { label: "Total on record", value: appointments.length, color: "#5a7040" },
            { label: "Cancelled", value: appointments.filter(a => a.status === "cancelled").length, color: "#9aaa84" },
          ].map((s, i) => (
            <div key={i} className="rounded-md border p-3 text-center" style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Upcoming appointments */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#1c2414" }}>Upcoming</h2>
          {isLoading ? (
            <div className="rounded-md border p-8 text-center" style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}>
              <p className="text-sm" style={{ color: "#9aaa84" }}>Loading appointments…</p>
            </div>
          ) : upcoming.length === 0 ? (
            <div className="rounded-md border p-8 text-center space-y-2" style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}>
              <CalendarOff className="w-8 h-8 mx-auto" style={{ color: "#d4c9b5" }} />
              <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>No upcoming appointments</p>
              <p className="text-xs" style={{ color: "#9aaa84" }}>Appointments will appear here once synced from Boulevard via Zapier.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(upcomingGroups.entries()).map(([dateKey, appts]) => (
                <div key={dateKey}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#5a7040" }}>
                    {formatDate(appts[0].appointmentStart)}
                  </p>
                  <div className="space-y-2">
                    {appts.map(a => (
                      <AppointmentCard key={a.id} appt={a} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Past / cancelled */}
        {past.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "#1c2414" }}>Past & Cancelled</h2>
            <div className="space-y-4">
              {Array.from(pastGroups.entries()).map(([dateKey, appts]) => (
                <div key={dateKey}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#9aaa84" }}>
                    {formatDate(appts[0].appointmentStart)}
                  </p>
                  <div className="space-y-2 opacity-70">
                    {appts.map(a => (
                      <AppointmentCard key={a.id} appt={a} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {/* Discreet integration link */}
        <div className="pt-2 text-center">
          <button
            onClick={() => setLocation("/help#integrations")}
            className="text-xs inline-flex items-center gap-1"
            style={{ color: "#9aaa84" }}
            data-testid="link-zapier-setup-instructions"
          >
            <Link2 className="w-3 h-3" />
            Zapier integration setup instructions
          </button>
        </div>
      </main>
    </div>
  );
}

function AppointmentCard({ appt }: { appt: Appointment }) {
  return (
    <div
      className="rounded-md border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ backgroundColor: "#ffffff", borderColor: "#d4c9b5" }}
      data-testid={`card-appointment-${appt.id}`}
    >
      {/* Time column */}
      <div className="flex items-center gap-1.5 sm:w-28 flex-shrink-0">
        <Clock className="w-3.5 h-3.5" style={{ color: "#9aaa84" }} />
        <span className="text-sm font-mono font-medium" style={{ color: "#2e3a20" }}>
          {formatTime(appt.appointmentStart)}
        </span>
        {appt.durationMinutes && (
          <span className="text-xs" style={{ color: "#9aaa84" }}>{appt.durationMinutes}m</span>
        )}
      </div>

      {/* Patient + details */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 flex-shrink-0" style={{ color: "#9aaa84" }} />
            <span className="text-sm font-medium" style={{ color: "#1c2414" }}>{appt.patientName}</span>
          </div>
          {statusBadge(appt.status)}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {appt.serviceType && (
            <div className="flex items-center gap-1">
              <Stethoscope className="w-3 h-3" style={{ color: "#9aaa84" }} />
              <span className="text-xs" style={{ color: "#7a8a64" }}>{appt.serviceType}</span>
            </div>
          )}
          {appt.staffName && (
            <span className="text-xs" style={{ color: "#9aaa84" }}>with {appt.staffName}</span>
          )}
          {appt.locationName && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" style={{ color: "#9aaa84" }} />
              <span className="text-xs" style={{ color: "#9aaa84" }}>{appt.locationName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
