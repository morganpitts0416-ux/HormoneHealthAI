import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal/portal-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sun,
  Activity,
  Moon,
  Droplets,
  Drumstick,
  Sparkles,
  ChevronRight,
  Pill,
  TrendingUp,
  Zap,
  Smile,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface SnapshotResp {
  windowDays: number;
  from: string;
  to: string;
  loggedDays: number;
  days: { date: string; logged: boolean }[];
  avgSleepHours: number | null;
  avgMood: number | null;
  avgEnergy: number | null;
  latestWeight: number | null;
  movementDays: number;
  hydrationDays: number;
  proteinDays: number;
  symptomDays: number;
  medAdherencePct: number | null;
  medAdherenceTotal: number;
}

interface CheckinRow {
  date: string;
  sleepHours?: number | null;
  moodScore?: number | null;
  energyScore?: number | null;
  brainFogScore?: number | null;
}

interface InsightResp {
  insight: string;
  generated: boolean;
}

export default function PortalHealthIQ() {
  const [tab, setTab] = useState<"today" | "snapshot" | "trends">("today");

  return (
    <PortalShell activeTab="healthiq" headerSubtitle="HealthIQ">
      <div className="space-y-1 pt-1">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>
          Your weekly read
        </h1>
        <p className="text-sm" style={{ color: "#7a8a64" }}>
          A warm, daily check-in plus AI-powered patterns from your sleep, energy, hydration, and movement.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3" data-testid="tabs-healthiq">
          <TabsTrigger value="today" data-testid="tab-healthiq-today">Today</TabsTrigger>
          <TabsTrigger value="snapshot" data-testid="tab-healthiq-snapshot">Weekly snapshot</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-healthiq-trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-5">
          <TodayPanel />
        </TabsContent>
        <TabsContent value="snapshot" className="mt-5">
          <SnapshotPanel />
        </TabsContent>
        <TabsContent value="trends" className="mt-5">
          <TrendsPanel />
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

// ── Today panel ─────────────────────────────────────────────────────────────
function TodayPanel() {
  const { data: today } = useQuery<{
    moodScore?: number | null;
    energyScore?: number | null;
    sleepHours?: number | null;
    updatedAt?: string;
  }>({
    queryKey: ["/api/portal/tracking/checkins/today"],
    retry: false,
  });

  const completed = !!(today?.moodScore || today?.energyScore || today?.sleepHours || today?.updatedAt);

  return (
    <div className="space-y-4" data-testid="panel-healthiq-today">
      <Link href="/portal/check-in">
        <a
          className="block rounded-2xl border p-5 hover-elevate"
          style={{
            borderColor: completed ? "#c8dbb8" : "#ede8df",
            backgroundColor: completed ? "#edf4e4" : "#ffffff",
          }}
          data-testid="link-healthiq-start-checkin"
        >
          <div className="flex items-start gap-3.5">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: completed ? "#2e3a20" : "#edf4e4" }}
            >
              <Sun className="w-5 h-5" style={{ color: completed ? "#ffffff" : "#2e3a20" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold" style={{ color: "#1c2414" }}>
                {completed ? "Today's check-in is in" : "Start today's check-in"}
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "#5a6048" }}>
                {completed
                  ? "Tap to add or update sleep, mood, energy, hydration, food, or symptoms."
                  : "60 seconds. Sleep, mood, energy, hydration, food, and any symptoms — your pattern coach uses these to spot what's working."}
              </p>
              <div className="flex items-center gap-1.5 mt-3 text-xs font-medium" style={{ color: "#2e3a20" }}>
                {completed ? "Review or update" : "Begin"} <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </a>
      </Link>

      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: "#e8ddd0", backgroundColor: "#fffbf3" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4" style={{ color: "#5a7040" }} />
          <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>How HealthIQ works</p>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "#5a6048" }}>
          Each day you check in, HealthIQ looks for the connections between your signals. Instead of telling you "you slept 6 hours," it learns to say "your energy tends to dip on the days you sleep under 7 hours and skip protein in the morning." That's where real change starts.
        </p>
      </div>
    </div>
  );
}

// ── Snapshot panel ──────────────────────────────────────────────────────────
function SnapshotPanel() {
  const { data: snap, isLoading: snapLoading } = useQuery<SnapshotResp>({
    queryKey: ["/api/portal/healthiq/snapshot"],
    retry: false,
  });
  const { data: insightResp, isLoading: insightLoading } = useQuery<InsightResp>({
    queryKey: ["/api/portal/healthiq/insight"],
    retry: false,
  });

  return (
    <div className="space-y-5" data-testid="panel-healthiq-snapshot">
      {/* AI insight card */}
      <div
        className="rounded-2xl border p-5 sm:p-6"
        style={{ borderColor: "#c8dbb8", backgroundColor: "#edf4e4" }}
        data-testid="card-healthiq-insight"
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4" style={{ color: "#2e3a20" }} />
          <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#2e3a20" }}>
            Your pattern coach
          </p>
        </div>
        {insightLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: "#5a6048" }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Reading your week…
          </div>
        ) : (
          <p className="text-base leading-relaxed" style={{ color: "#1c2414" }} data-testid="text-healthiq-insight">
            {insightResp?.insight}
          </p>
        )}
      </div>

      {/* Stat tiles */}
      {snapLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
          ))}
        </div>
      ) : snap ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<Moon className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Avg sleep"
              value={snap.avgSleepHours !== null ? `${snap.avgSleepHours}h` : "—"}
              testId="stat-sleep"
            />
            <StatTile
              icon={<Zap className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Avg energy"
              value={snap.avgEnergy !== null ? `${snap.avgEnergy}/5` : "—"}
              testId="stat-energy"
            />
            <StatTile
              icon={<Smile className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Avg mood"
              value={snap.avgMood !== null ? `${snap.avgMood}/5` : "—"}
              testId="stat-mood"
            />
            <StatTile
              icon={<Activity className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Movement"
              value={`${snap.movementDays}/7 d`}
              testId="stat-movement"
            />
            <StatTile
              icon={<Droplets className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Hydration"
              value={`${snap.hydrationDays}/7 d`}
              testId="stat-hydration"
            />
            <StatTile
              icon={<Drumstick className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Protein"
              value={`${snap.proteinDays}/7 d`}
              testId="stat-protein"
            />
            {snap.medAdherencePct !== null && (
              <StatTile
                icon={<Pill className="w-4 h-4" style={{ color: "#5a7040" }} />}
                label="Med adherence"
                value={`${snap.medAdherencePct}%`}
                testId="stat-adherence"
              />
            )}
            <StatTile
              icon={<TrendingUp className="w-4 h-4" style={{ color: "#5a7040" }} />}
              label="Days logged"
              value={`${snap.loggedDays}/7`}
              testId="stat-logged"
            />
          </div>

          {/* Day strip */}
          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }}
            data-testid="card-healthiq-daystrip"
          >
            <p className="text-xs font-medium mb-2" style={{ color: "#7a8a64" }}>This week</p>
            <div className="flex justify-between">
              {snap.days.map((d) => {
                const date = new Date(d.date + "T00:00:00");
                const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" })[0];
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1.5 flex-1">
                    <span className="text-[10px]" style={{ color: "#a0a880" }}>{dayLabel}</span>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                      style={{
                        backgroundColor: d.logged ? "#2e3a20" : "#f0ece2",
                        color: d.logged ? "#ffffff" : "#a0a880",
                      }}
                      data-testid={`day-${d.date}-${d.logged ? "logged" : "empty"}`}
                    >
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatTile({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId: string }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-xs font-medium" style={{ color: "#7a8a64" }}>{label}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>{value}</p>
    </div>
  );
}

// ── Trends panel ────────────────────────────────────────────────────────────
function TrendsPanel() {
  // Pull last 30 days for richer trend lines.
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = today.toISOString().slice(0, 10);

  const { data, isLoading } = useQuery<CheckinRow[]>({
    queryKey: [`/api/portal/tracking/checkins?from=${fromIso}&to=${toIso}`],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="panel-healthiq-trends-loading">
        <div className="h-64 rounded-2xl animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
        <div className="h-64 rounded-2xl animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
      </div>
    );
  }

  const rows = (data ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date.slice(5), // MM-DD
      sleep: r.sleepHours ?? null,
      mood: r.moodScore ?? null,
      energy: r.energyScore ?? null,
    }));

  const hasAny = rows.some((r) => r.sleep !== null || r.mood !== null || r.energy !== null);

  if (!hasAny) {
    return (
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ borderColor: "#ede8df", borderStyle: "dashed", backgroundColor: "#fffbf3" }}
        data-testid="panel-healthiq-trends-empty"
      >
        <TrendingUp className="w-8 h-8 mx-auto mb-3" style={{ color: "#a0a880" }} />
        <p className="text-sm font-medium" style={{ color: "#1c2414" }}>No trend data yet</p>
        <p className="text-xs mt-1" style={{ color: "#7a8a64" }}>
          Log a few daily check-ins and your trend curves will start to fill in here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="panel-healthiq-trends">
      <TrendChart title="Sleep (hours)" data={rows} dataKey="sleep" color="#2e3a20" yDomain={[0, 12]} testId="chart-trend-sleep" />
      <TrendChart title="Energy (1–5)" data={rows} dataKey="energy" color="#5a7040" yDomain={[1, 5]} testId="chart-trend-energy" />
      <TrendChart title="Mood (1–5)" data={rows} dataKey="mood" color="#7a8a64" yDomain={[1, 5]} testId="chart-trend-mood" />
    </div>
  );
}

function TrendChart({
  title,
  data,
  dataKey,
  color,
  yDomain,
  testId,
}: {
  title: string;
  data: any[];
  dataKey: string;
  color: string;
  yDomain: [number, number];
  testId: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }}
      data-testid={testId}
    >
      <p className="text-sm font-semibold mb-3" style={{ color: "#1c2414" }}>{title}</p>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#f0ece2" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7a8a64" }} interval="preserveStartEnd" />
            <YAxis domain={yDomain} tick={{ fontSize: 10, fill: "#7a8a64" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e8ddd0",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
