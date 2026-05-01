import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import {
  Leaf, LogOut, FlaskConical, Package, MessageSquare, ChevronRight,
  Activity, Stethoscope, Home as HomeIcon, UserCircle, ChefHat as RecipeIcon,
  CalendarDays, HeartPulse, Pill,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Appointment } from "@shared/schema";
import { ActiveVitalsMonitoringCard } from "@/components/portal/active-vitals-monitoring-card";
import { formatDate, type PortalLab } from "@/components/portal/portal-data";

interface PortalPatient {
  patientId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  clinicName: string;
}

interface VitalsMonitoringActive {
  episode: {
    id: number;
    vitalTypes: string[];
    frequencyPerDay: number;
    endDate: string;
  } | null;
  todayCount?: number;
  todayRequired?: number;
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const which = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${which}, ${name}`;
}

function formatVitalTypes(types: string[]): string {
  const names: Record<string, string> = {
    blood_pressure: "Blood pressure",
    heart_rate: "Heart rate",
    weight: "Weight",
  };
  return types.map(t => names[t] || t).join(" + ");
}

export default function PortalDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const unreadCount = usePortalUnreadCount();
  const [logVitalsOpen, setLogVitalsOpen] = useState(false);

  const { data: patient, isLoading: patientLoading, error: patientError } = useQuery<PortalPatient>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const { data: labs = [] } = useQuery<PortalLab[]>({
    queryKey: ["/api/portal/labs"],
    enabled: !!patient,
    retry: false,
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/portal/appointments"],
    enabled: !!patient,
    retry: false,
  });

  const { data: vitalsMonitoring } = useQuery<VitalsMonitoringActive>({
    queryKey: ["/api/portal/vitals-monitoring/active"],
    enabled: !!patient,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/login?mode=patient");
    },
  });

  useEffect(() => {
    if (patientError) setLocation("/login?mode=patient");
  }, [patientError, setLocation]);

  if (patientLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "#2e3a20" }}>
            <Leaf className="w-5 h-5" style={{ color: "#e8ddd0" }} />
          </div>
          <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your health portal…</p>
        </div>
      </div>
    );
  }

  if (!patient) return null;

  // Compute "Health at a glance" facts
  const now = new Date();
  const upcoming = appointments
    .filter(a => new Date(a.appointmentStart) >= now && a.status !== "cancelled")
    .sort((a, b) => new Date(a.appointmentStart).getTime() - new Date(b.appointmentStart).getTime());
  const nextAppt = upcoming[0];

  const latestLab = labs[0];
  const monitoringActive = !!vitalsMonitoring?.episode;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <img
            src="/cliniq-logo.png?v=2"
            alt="ClinIQ"
            className="h-12 sm:h-11 w-auto flex-shrink-0"
            style={{ mixBlendMode: "multiply" }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full hover-elevate active-elevate-2 px-1.5 py-1"
                data-testid="button-portal-avatar"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback style={{ backgroundColor: "#edf4e4", color: "#2e3a20", fontWeight: 600, fontSize: "0.85rem" }}>
                    {`${(patient?.firstName?.[0] ?? "").toUpperCase()}${(patient?.lastName?.[0] ?? "").toUpperCase()}` || "P"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                    {patient?.firstName} {patient?.lastName}
                  </span>
                  {patient?.email && (
                    <span className="text-xs font-normal truncate" style={{ color: "#7a8a64" }}>
                      {patient.email}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/portal/account">
                  <span className="flex items-center gap-2 w-full" data-testid="menu-portal-account">
                    <UserCircle className="w-4 h-4" />
                    Account
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-portal-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8 pb-28">
        {/* Hero greeting */}
        <div className="space-y-1 pt-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
            {getGreeting(patient.firstName)}
          </h1>
          <p className="text-sm" style={{ color: "#7a8a64" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {patient.clinicName && (
            <p className="text-xs pt-0.5" style={{ color: "#a0a890" }}>
              Care provided by {patient.clinicName}
            </p>
          )}
        </div>

        {/* What would you like to do today? — primary interactive grid */}
        <section data-testid="section-action-grid">
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "#7a8a64", letterSpacing: "0.08em" }}>
            What would you like to do today?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <ActionTile href="/portal/labs" Icon={FlaskConical} label="View labs" sublabel="Your most recent results" testId="action-labs" />
            <ActionTile href="/portal/visits" Icon={Stethoscope} label="Visit summaries" sublabel="Notes from your care team" testId="action-visits" />
            <ActionTile href="/portal/supplements" Icon={Package} label="My current protocol" sublabel="Supplements & dietary plan" testId="action-protocol" />
            <ActionTile href="/portal/recipes" Icon={RecipeIcon} label="Recipe book" sublabel="Meals built from your plan" testId="action-recipes" />
            <ActionTile href="/portal/messages" Icon={MessageSquare} label="Message my care team" sublabel="Get answers, share updates" testId="action-messages" badge={unreadCount} />
            <ActionTile href="/portal/healthiq" Icon={Activity} label="HealthIQ check-in" sublabel="Daily snapshot, weekly read" testId="action-healthiq" />
            <ActionTile href="/portal/refill-request" Icon={Pill} label="Request med refill" sublabel="Send a refill request to your care team" testId="action-refill-request" wide />
          </div>
        </section>

        {/* Health details at a glance */}
        <section className="space-y-3" data-testid="section-health-glance">
          <p className="text-xs uppercase tracking-wider" style={{ color: "#7a8a64", letterSpacing: "0.08em" }}>
            Health details at a glance
          </p>

          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            {/* Next appointment */}
            <GlanceRow
              icon={<CalendarDays className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Next appointment"
              value={
                nextAppt
                  ? new Date(nextAppt.appointmentStart).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                  : "None scheduled"
              }
              hint={
                nextAppt
                  ? `${new Date(nextAppt.appointmentStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${nextAppt.staffName ? ` · ${nextAppt.staffName}` : ""}`
                  : undefined
              }
              testId="glance-next-appointment"
            />

            <Divider />

            {/* Last lab date */}
            <GlanceRow
              icon={<FlaskConical className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Last lab evaluation"
              value={latestLab ? formatDate(latestLab.labDate) : "None on file"}
              hint={latestLab ? `${latestLab.interpretations?.length || 0} markers reviewed` : undefined}
              actionHref={latestLab ? "/portal/labs" : undefined}
              actionLabel={latestLab ? "View labs" : undefined}
              testId="glance-last-lab"
            />

            <Divider />

            {/* Active monitoring */}
            <GlanceRow
              icon={<HeartPulse className="w-4 h-4" style={{ color: monitoringActive ? "#8b5a10" : "#5a7040" }} />}
              label="Active monitoring"
              value={
                monitoringActive
                  ? `${formatVitalTypes(vitalsMonitoring!.episode!.vitalTypes)} · ${vitalsMonitoring!.episode!.frequencyPerDay}× daily`
                  : "None at this time"
              }
              hint={
                monitoringActive
                  ? `Through ${new Date(vitalsMonitoring!.episode!.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : undefined
              }
              testId="glance-active-monitoring"
              tone={monitoringActive ? "amber" : "default"}
              onClick={monitoringActive ? () => setLogVitalsOpen(true) : undefined}
              actionLabel={monitoringActive ? "Log reading" : undefined}
            />
          </div>

          {/* Inline rich monitoring card with the actual log-a-reading flow */}
          {monitoringActive && (
            <ActiveVitalsMonitoringCard
              controlledOpen={logVitalsOpen}
              onControlledOpenChange={setLogVitalsOpen}
            />
          )}
        </section>

        {/* Privacy footer */}
        <div className="text-center pt-4">
          <p className="text-xs" style={{ color: "#b0b8a0" }}>
            Your data is private and accessible only to you and your care team.
            <br />
            Powered by ClinIQ.
          </p>
        </div>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t z-40" style={{ backgroundColor: "#1c2414", borderColor: "#0e1208" }}>
        <div className="max-w-3xl mx-auto flex items-center justify-around">
          <Link href="/portal/dashboard" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-home">
              <HomeIcon className="w-4 h-4" style={{ color: "#ffffff" }} />
              <span className="text-xs font-semibold" style={{ color: "#ffffff" }}>Home</span>
            </button>
          </Link>
          <Link href="/portal/healthiq" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-healthiq">
              <Activity className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>HealthIQ</span>
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
              <span className="relative">
                <MessageSquare className="w-4 h-4" style={{ color: "#a0a880" }} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold leading-none text-white"
                    style={{ backgroundColor: "#c0392b" }}
                    data-testid="badge-messages-unread"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-xs" style={{ color: "#a0a880" }}>Messages</span>
            </button>
          </Link>
        </div>
      </nav>
    </div>
  );
}

// ── Glance row ─────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, backgroundColor: "#f0ebe2" }} />;
}

function GlanceRow({
  icon, label, value, hint, actionHref, onClick, actionLabel, tone = "default", testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  actionHref?: string;
  onClick?: () => void;
  actionLabel?: string;
  tone?: "default" | "amber";
  testId: string;
}) {
  const valueColor = tone === "amber" ? "#5a4010" : "#1c2414";
  const interactive = !!actionHref || !!onClick;
  const inner = (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: tone === "amber" ? "#fdf6e8" : "#edf4e4" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#7a8a64" }}>{label}</p>
        <p className="text-sm font-semibold leading-snug mt-0.5" style={{ color: valueColor }}>{value}</p>
        {hint && (
          <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{hint}</p>
        )}
      </div>
      {interactive && (
        <div className="flex items-center gap-1 flex-shrink-0 mt-1.5">
          {actionLabel && (
            <span className="text-xs font-medium" style={{ color: tone === "amber" ? "#8b5a10" : "#5a7040" }}>
              {actionLabel}
            </span>
          )}
          <ChevronRight className="w-4 h-4" style={{ color: "#a0a880" }} />
        </div>
      )}
    </div>
  );

  if (actionHref) {
    return (
      <Link href={actionHref}>
        <a className="block hover-elevate active-elevate-2 text-left w-full" data-testid={testId}>
          {inner}
        </a>
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left hover-elevate active-elevate-2"
        data-testid={testId}
      >
        {inner}
      </button>
    );
  }
  return (
    <div data-testid={testId}>{inner}</div>
  );
}

// ── Action grid tile (Home dashboard "What would you like to do today?") ──
function ActionTile({
  href, Icon, label, sublabel, testId, badge, wide,
}: {
  href: string;
  Icon: typeof Package;
  label: string;
  sublabel: string;
  testId: string;
  badge?: number;
  wide?: boolean;
}) {
  return (
    <Link href={href}>
      <a
        className={`block rounded-2xl border p-4 hover-elevate active-elevate-2 h-full ${wide ? "col-span-2" : ""}`}
        style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }}
        data-testid={testId}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative"
            style={{ backgroundColor: "#edf4e4" }}
          >
            <Icon className="w-4 h-4" style={{ color: "#2e3a20" }} />
            {badge !== undefined && badge > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] font-bold leading-none text-white"
                style={{ backgroundColor: "#c0392b" }}
                data-testid={`${testId}-badge`}
              >
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight" style={{ color: "#1c2414" }}>{label}</p>
            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "#7a8a64" }}>{sublabel}</p>
          </div>
        </div>
      </a>
    </Link>
  );
}
