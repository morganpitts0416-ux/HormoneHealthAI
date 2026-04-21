import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import resourceTimeGridPlugin from "@fullcalendar/resource-timegrid";
import type { EventInput, EventClickArg, DateSelectArg, DatesSetArg } from "@fullcalendar/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, Settings, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { AppointmentDialog } from "@/components/appointment-dialog";
import type { Appointment, AppointmentType, Provider, CalendarBlock } from "@shared/schema";

const ALL_PROVIDERS = "__all__";

// Stable, calm palette — one color per provider for column headers + chips.
const PROVIDER_PALETTE = [
  "#6b8e54", "#5b8aa0", "#a06a8a", "#c08a3e", "#7a6da8",
  "#3e8a8a", "#a85f5f", "#8a8a3e", "#5a7a9a", "#a87f5b",
];
function colorFor(id: number | string): string {
  const n = typeof id === "number" ? id : Array.from(String(id)).reduce((a, c) => a + c.charCodeAt(0), 0);
  return PROVIDER_PALETTE[Math.abs(n) % PROVIDER_PALETTE.length];
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pickColor(type: AppointmentType | undefined, source: string, providerId: number | null): string {
  if (type?.color) return type.color;
  if (providerId != null) return colorFor(providerId);
  if (source === "boulevard") return "#7a8a64";
  return "#5a7040";
}

type ViewKey = "timeGridDay" | "timeGridWeek" | "resourceTimeGridDay";

export default function SchedulingPage() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [userView, setUserView] = useState<"day" | "week">("week");
  const [providerFilter, setProviderFilter] = useState<string>(ALL_PROVIDERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [defaultStart, setDefaultStart] = useState<Date | null>(null);
  const [defaultProviderId, setDefaultProviderId] = useState<number | null>(null);
  const [title, setTitle] = useState<string>("");
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 7);
    const end = new Date(now); end.setDate(now.getDate() + 30);
    return { start, end };
  });

  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/scheduling/providers"] });
  const { data: types = [] } = useQuery<AppointmentType[]>({ queryKey: ["/api/appointment-types"] });

  // Day + All providers ⇒ resource (per-provider) view, like Boulevard.
  const view: ViewKey = useMemo(() => {
    if (userView === "week") return "timeGridWeek";
    return providerFilter === ALL_PROVIDERS && providers.length > 1
      ? "resourceTimeGridDay"
      : "timeGridDay";
  }, [userView, providerFilter, providers.length]);

  const apptsKey = ["/api/appointments/range", range.start.toISOString(), range.end.toISOString(), providerFilter];
  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: apptsKey,
    queryFn: async () => {
      const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      if (providerFilter !== ALL_PROVIDERS) params.set("providerId", providerFilter);
      const r = await fetch(`/api/appointments/range?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const { data: blocks = [] } = useQuery<CalendarBlock[]>({
    queryKey: ["/api/calendar-blocks", range.start.toISOString(), range.end.toISOString(), providerFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      if (providerFilter !== ALL_PROVIDERS) params.set("providerId", providerFilter);
      const r = await fetch(`/api/calendar-blocks?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const typeMap = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);
  const providerMap = useMemo(() => new Map(providers.map(p => [p.id, p])), [providers]);

  const events: EventInput[] = useMemo(() => {
    const apptEvents: EventInput[] = appointments.map(a => {
      const type = a.appointmentTypeId ? typeMap.get(a.appointmentTypeId) : undefined;
      const provider = a.providerId ? providerMap.get(a.providerId) : undefined;
      const color = pickColor(type, a.source, a.providerId ?? null);
      const titleParts: string[] = [];
      if (a.patientName) titleParts.push(a.patientName);
      else if (a.serviceType) titleParts.push(a.serviceType);
      else titleParts.push("Appointment");
      if (type) titleParts.push(`· ${type.name}`);
      else if (a.serviceType && a.patientName) titleParts.push(`· ${a.serviceType}`);
      return {
        id: `appt-${a.id}`,
        title: titleParts.join(" "),
        start: a.appointmentStart as any,
        end: a.appointmentEnd as any || undefined,
        backgroundColor: color,
        borderColor: color,
        textColor: "#ffffff",
        resourceId: a.providerId ? String(a.providerId) : undefined,
        extendedProps: { appointment: a, providerName: provider?.displayName, source: a.source },
      };
    });
    const blockEvents: EventInput[] = blocks.map(b => ({
      id: `block-${b.id}`,
      title: b.title || "Time off",
      start: b.startAt as any,
      end: b.endAt as any,
      display: "background",
      backgroundColor: "rgba(120,120,120,0.10)",
      resourceId: String(b.providerId),
      extendedProps: { isBlock: true, block: b },
    }));
    return [...apptEvents, ...blockEvents];
  }, [appointments, blocks, typeMap, providerMap]);

  const resources = useMemo(() => providers.map(p => ({
    id: String(p.id),
    title: p.displayName,
    extendedProps: { color: colorFor(p.id), initials: initialsOf(p.displayName) },
  })), [providers]);

  const handleSelect = (info: DateSelectArg) => {
    setEditing(null);
    setDefaultStart(info.start);
    setDefaultProviderId(
      info.resource ? Number(info.resource.id)
      : providerFilter !== ALL_PROVIDERS ? Number(providerFilter)
      : providers[0]?.id ?? null
    );
    setDialogOpen(true);
  };
  const handleEventClick = (info: EventClickArg) => {
    const appt = info.event.extendedProps?.appointment as Appointment | undefined;
    if (!appt) return;
    setEditing(appt);
    setDefaultStart(null);
    setDefaultProviderId(null);
    setDialogOpen(true);
  };
  const handleDatesSet = (arg: DatesSetArg) => {
    setRange({ start: arg.start, end: arg.end });
    setTitle(arg.view.title);
  };
  const onNew = () => {
    setEditing(null);
    setDefaultStart(new Date());
    setDefaultProviderId(providerFilter !== ALL_PROVIDERS ? Number(providerFilter) : providers[0]?.id ?? null);
    setDialogOpen(true);
  };
  const api = () => calendarRef.current?.getApi();
  const goPrev = () => api()?.prev();
  const goNext = () => api()?.next();
  const goToday = () => api()?.today();

  // Re-sync FC when view changes (key swap below also helps).
  useEffect(() => { api()?.changeView(view); }, [view]);

  return (
    <div className="flex-1 overflow-auto bg-background">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-base font-semibold">Schedule</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-44" data-testid="select-provider-filter">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROVIDERS}>All providers</SelectItem>
                {providers.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-md border bg-card p-0.5" role="tablist">
              <button
                type="button"
                onClick={() => setUserView("day")}
                data-testid="button-view-day"
                className={`px-3 h-8 text-sm rounded ${userView === "day" ? "bg-foreground text-background" : "text-muted-foreground hover-elevate"}`}
              >Day</button>
              <button
                type="button"
                onClick={() => setUserView("week")}
                data-testid="button-view-week"
                className={`px-3 h-8 text-sm rounded ${userView === "week" ? "bg-foreground text-background" : "text-muted-foreground hover-elevate"}`}
              >Week</button>
            </div>
            <Link href="/account/scheduling">
              <Button variant="outline" size="default" data-testid="link-scheduling-settings">
                <Settings className="h-4 w-4 mr-1" /> Settings
              </Button>
            </Link>
            <Button onClick={onNew} data-testid="button-new-appointment">
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>
        </div>

        {providers.length === 0 && (
          <Card className="p-4 flex items-start gap-3">
            <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">No providers yet</div>
              <div className="text-muted-foreground">Add providers to your clinic, then set their working hours in Settings before booking.</div>
            </div>
          </Card>
        )}

        {/* Date controller row */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={goPrev} data-testid="button-prev"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={goNext} data-testid="button-next"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="default" onClick={goToday} className="ml-1" data-testid="button-today">Today</Button>
          </div>
          <div className="text-base font-medium">{title}</div>
          <div className="w-[136px]" />
        </div>

        <Card className="p-0 overflow-hidden cliniq-fc">
          <FullCalendar
            ref={calendarRef as any}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, resourceTimeGridPlugin]}
            initialView={view}
            key={view}
            schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
            headerToolbar={false}
            allDaySlot={false}
            slotMinTime="06:00:00"
            slotMaxTime="21:00:00"
            slotDuration="00:30:00"
            slotLabelInterval="01:00:00"
            slotLabelFormat={{ hour: "numeric", meridiem: "short" }}
            nowIndicator
            selectable
            selectMirror
            editable={false}
            eventDisplay="block"
            expandRows
            height="auto"
            stickyHeaderDates
            firstDay={1}
            dayHeaderFormat={view === "timeGridWeek" ? { weekday: "short", day: "numeric" } : { weekday: "long", month: "short", day: "numeric" }}
            events={events}
            resources={view === "resourceTimeGridDay" ? resources : undefined}
            resourceLabelContent={(arg) => {
              const color = (arg.resource.extendedProps as any).color as string;
              const initials = (arg.resource.extendedProps as any).initials as string;
              return (
                <div className="flex flex-col items-center gap-1 py-2">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ background: color }}
                  >{initials}</div>
                  <div className="text-xs font-medium text-foreground truncate max-w-[120px]">{arg.resource.title}</div>
                </div>
              );
            }}
            select={handleSelect}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            eventContent={(arg) => {
              const isBlock = arg.event.extendedProps?.isBlock;
              if (isBlock) return undefined;
              const source = arg.event.extendedProps?.source;
              return (
                <div className="px-1.5 py-1 text-[11px] leading-tight overflow-hidden h-full">
                  <div className="font-semibold truncate opacity-95">{arg.timeText}</div>
                  <div className="truncate">
                    {arg.event.title}
                    {source === "boulevard" && <span className="ml-1 opacity-80">·B</span>}
                  </div>
                </div>
              );
            }}
          />
        </Card>

        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
      </main>

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editing}
        defaultStart={defaultStart}
        defaultProviderId={defaultProviderId}
      />
    </div>
  );
}
