import { useState, useMemo, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Plus, Settings, Users } from "lucide-react";
import { Link } from "wouter";
import { AppointmentDialog } from "@/components/appointment-dialog";
import type { Appointment, AppointmentType, Provider, CalendarBlock } from "@shared/schema";

const ALL_PROVIDERS = "__all__";

function pickColor(type: AppointmentType | undefined, source: string): string {
  if (source === "boulevard") return "#7a8a64";
  return type?.color || "#5a7040";
}

export default function SchedulingPage() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [view, setView] = useState<"timeGridDay" | "timeGridWeek" | "resourceTimeGridDay">("timeGridWeek");
  const [providerFilter, setProviderFilter] = useState<string>(ALL_PROVIDERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [defaultStart, setDefaultStart] = useState<Date | null>(null);
  const [defaultProviderId, setDefaultProviderId] = useState<number | null>(null);
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 7);
    const end = new Date(now); end.setDate(now.getDate() + 30);
    return { start, end };
  });

  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/scheduling/providers"] });
  const { data: types = [] } = useQuery<AppointmentType[]>({ queryKey: ["/api/appointment-types"] });

  const apptsKey = [
    "/api/appointments/range",
    range.start.toISOString(),
    range.end.toISOString(),
    providerFilter,
  ];
  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: apptsKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });
      if (providerFilter !== ALL_PROVIDERS) params.set("providerId", providerFilter);
      const r = await fetch(`/api/appointments/range?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const { data: blocks = [] } = useQuery<CalendarBlock[]>({
    queryKey: ["/api/calendar-blocks", range.start.toISOString(), range.end.toISOString(), providerFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });
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
      const color = pickColor(type, a.source);
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
        classNames: a.source === "boulevard" ? ["fc-event-boulevard"] : [],
      };
    });
    const blockEvents: EventInput[] = blocks.map(b => ({
      id: `block-${b.id}`,
      title: b.title || "Time off",
      start: b.startAt as any,
      end: b.endAt as any,
      display: "background",
      backgroundColor: "#d4c9b5",
      resourceId: String(b.providerId),
      extendedProps: { isBlock: true, block: b },
    }));
    return [...apptEvents, ...blockEvents];
  }, [appointments, blocks, typeMap, providerMap]);

  const resources = useMemo(() => providers.map(p => ({
    id: String(p.id),
    title: p.displayName,
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
  };

  const onNew = () => {
    setEditing(null);
    setDefaultStart(new Date());
    setDefaultProviderId(providerFilter !== ALL_PROVIDERS ? Number(providerFilter) : providers[0]?.id ?? null);
    setDialogOpen(true);
  };

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f5f2ed" }}>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" style={{ color: "#5a7040" }} />
            <h1 className="text-lg font-semibold" style={{ color: "#1c2414" }}>Schedule</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-48" data-testid="select-provider-filter">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROVIDERS}>All providers</SelectItem>
                {providers.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={view} onValueChange={(v) => setView(v as any)}>
              <SelectTrigger className="w-40" data-testid="select-view"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="timeGridDay">Day</SelectItem>
                <SelectItem value="timeGridWeek">Week</SelectItem>
                <SelectItem value="resourceTimeGridDay">Day · per provider</SelectItem>
              </SelectContent>
            </Select>
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

        <Card className="p-2">
          <FullCalendar
            ref={calendarRef as any}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, resourceTimeGridPlugin]}
            initialView={view}
            key={view}
            schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
            headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
            allDaySlot={false}
            slotMinTime="06:00:00"
            slotMaxTime="21:00:00"
            slotDuration="00:15:00"
            slotLabelInterval="01:00:00"
            nowIndicator
            selectable
            selectMirror
            editable={false}
            eventDisplay="block"
            height="auto"
            events={events}
            resources={view === "resourceTimeGridDay" ? resources : undefined}
            select={handleSelect}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            eventContent={(arg) => {
              const isBlock = arg.event.extendedProps?.isBlock;
              if (isBlock) return undefined;
              const source = arg.event.extendedProps?.source;
              return (
                <div className="px-1 py-0.5 text-xs leading-tight overflow-hidden">
                  <div className="font-semibold truncate">{arg.timeText}</div>
                  <div className="truncate flex items-center gap-1">
                    {arg.event.title}
                    {source === "boulevard" && <span className="opacity-80">·B</span>}
                  </div>
                </div>
              );
            }}
          />
        </Card>

        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ background: "#5a7040" }} /> Native
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ background: "#7a8a64" }} /> Boulevard (read-only)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ background: "#d4c9b5" }} /> Time off
          </span>
          {isLoading && <span>Loading…</span>}
        </div>
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
