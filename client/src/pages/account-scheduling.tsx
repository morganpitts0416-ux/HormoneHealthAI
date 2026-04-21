import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, ArrowLeft, Loader2, Clock, Calendar, ListChecks, Link2, Copy, Check, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { AppointmentType, ProviderAvailability, CalendarBlock, Provider } from "@shared/schema";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AccountSchedulingPage() {
  const { user } = useAuth();
  const adminRole = (user as any)?.adminRole;
  const isOwnerOrAdmin = !!user && (adminRole === "owner" || adminRole === "admin" || adminRole === undefined);

  if (user && !isOwnerOrAdmin) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Card className="p-6 max-w-md mx-auto">
          <div className="text-sm text-muted-foreground">You need owner or admin permissions to manage scheduling settings.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f5f2ed" }}>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/appointments">
            <Button variant="ghost" size="sm" data-testid="link-back-schedule">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to schedule
            </Button>
          </Link>
          <h1 className="text-lg font-semibold" style={{ color: "#1c2414" }}>Scheduling Settings</h1>
        </div>

        <Tabs defaultValue="types" className="w-full">
          <TabsList>
            <TabsTrigger value="types" data-testid="tab-types"><ListChecks className="h-4 w-4 mr-1" /> Appointment Types</TabsTrigger>
            <TabsTrigger value="hours" data-testid="tab-hours"><Clock className="h-4 w-4 mr-1" /> Provider Hours</TabsTrigger>
            <TabsTrigger value="timeoff" data-testid="tab-timeoff"><Calendar className="h-4 w-4 mr-1" /> Time-Off</TabsTrigger>
            <TabsTrigger value="sync" data-testid="tab-sync"><Link2 className="h-4 w-4 mr-1" /> Calendar Sync</TabsTrigger>
          </TabsList>

          <TabsContent value="types" className="mt-4"><AppointmentTypesTab /></TabsContent>
          <TabsContent value="hours" className="mt-4"><ProviderHoursTab /></TabsContent>
          <TabsContent value="timeoff" className="mt-4"><TimeOffTab /></TabsContent>
          <TabsContent value="sync" className="mt-4"><CalendarSyncTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ─── Appointment Types ────────────────────────────────────────────────────────
function AppointmentTypesTab() {
  const { toast } = useToast();
  const { data: types = [], isLoading } = useQuery<AppointmentType[]>({
    queryKey: ["/api/appointment-types"],
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentType | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [color, setColor] = useState("#5a7040");

  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/scheduling/providers"] });

  const startCreate = () => {
    setEditing(null);
    setName(""); setDescription(""); setDuration(30); setColor("#5a7040");
    setOpen(true);
  };
  const startEdit = (t: AppointmentType) => {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setDuration(t.durationMinutes);
    setColor(t.color || "#5a7040");
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name, description: description || null,
        durationMinutes: duration, color,
      };
      const r = editing
        ? await apiRequest("PATCH", `/api/appointment-types/${editing.id}`, body)
        : await apiRequest("POST", "/api/appointment-types", body);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editing ? "Type updated" : "Type created" });
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-types"] });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/appointment-types/${id}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Type deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-types"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Delete failed", description: e?.message }),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold">Appointment Types</h2>
          <p className="text-sm text-muted-foreground">Templates with name, duration, and color used when booking.</p>
        </div>
        <Button onClick={startCreate} data-testid="button-new-type"><Plus className="h-4 w-4 mr-1" /> New type</Button>
      </div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && types.length === 0 && (
        <div className="text-sm text-muted-foreground py-6 text-center">No appointment types yet.</div>
      )}
      <div className="space-y-2">
        {types.map(t => (
          <div key={t.id} className="flex items-center gap-3 border rounded-md px-3 py-2 hover-elevate" data-testid={`row-type-${t.id}`}>
            <span className="inline-block w-3 h-3 rounded" style={{ background: t.color || "#5a7040" }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.durationMinutes} min{t.description ? ` · ${t.description}` : ""}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => startEdit(t)} data-testid={`button-edit-type-${t.id}`}>Edit</Button>
            <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(t.id)} data-testid={`button-delete-type-${t.id}`}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit appointment type" : "New appointment type"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-type-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Duration (min)</Label><Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} data-testid="input-type-duration" /></div>
              <div>
                <Label>Color</Label>
                <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} data-testid="input-type-color" />
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Initial consultation" data-testid="input-type-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending} data-testid="button-save-type">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Provider Hours ───────────────────────────────────────────────────────────
function ProviderHoursTab() {
  const { toast } = useToast();
  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/scheduling/providers"] });
  const [providerId, setProviderId] = useState<string>("");

  const { data: hours = [], isLoading } = useQuery<ProviderAvailability[]>({
    queryKey: ["/api/provider-availability", providerId],
    queryFn: async () => {
      const params = providerId ? `?providerId=${providerId}` : "";
      const r = await fetch(`/api/provider-availability${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!providerId,
  });

  const addMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", "/api/provider-availability", body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider-availability"] });
      toast({ title: "Hours added" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/provider-availability/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider-availability"] });
      toast({ title: "Removed" });
    },
  });

  const [day, setDay] = useState("1");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");

  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold">Provider Hours</h2>
      <p className="text-sm text-muted-foreground mb-3">Recurring weekly working hours. Used to compute available booking slots.</p>

      <div className="mb-4">
        <Label>Provider</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger className="max-w-md" data-testid="select-hours-provider"><SelectValue placeholder="Select a provider…" /></SelectTrigger>
          <SelectContent>
            {providers.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {providerId && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end border rounded-md p-3 mb-3 bg-muted/30">
            <div>
              <Label>Day</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger data-testid="select-hours-day"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Start</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-hours-start" /></div>
            <div><Label>End</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="input-hours-end" /></div>
            <Button
              onClick={() => addMutation.mutate({ providerId: Number(providerId), dayOfWeek: Number(day), startTime: start, endTime: end })}
              disabled={addMutation.isPending}
              data-testid="button-add-hours"
            ><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>

          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && hours.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">No working hours yet.</div>
          )}
          <div className="space-y-1.5">
            {hours.sort((a, b) => a.dayOfWeek - b.dayOfWeek).map(h => (
              <div key={h.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm" data-testid={`row-hours-${h.id}`}>
                <span><span className="font-medium">{DAYS[h.dayOfWeek]}</span> · {h.startTime}–{h.endTime}</span>
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(h.id)} data-testid={`button-delete-hours-${h.id}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Time-Off ────────────────────────────────────────────────────────────────
function TimeOffTab() {
  const { toast } = useToast();
  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/scheduling/providers"] });
  const [providerId, setProviderId] = useState<string>("");

  const range = (() => {
    const start = new Date(); start.setDate(start.getDate() - 7);
    const end = new Date(); end.setDate(end.getDate() + 180);
    return { start, end };
  })();

  const { data: blocks = [], isLoading } = useQuery<CalendarBlock[]>({
    queryKey: ["/api/calendar-blocks", "settings", providerId, range.start.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      if (providerId) params.set("providerId", providerId);
      const r = await fetch(`/api/calendar-blocks?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!providerId,
  });

  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/calendar-blocks", {
        providerId: Number(providerId),
        title: title || "Time off",
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-blocks"] });
      toast({ title: "Time off added" });
      setTitle(""); setStartAt(""); setEndAt("");
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/calendar-blocks/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-blocks"] });
      toast({ title: "Removed" });
    },
  });

  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold">Time Off</h2>
      <p className="text-sm text-muted-foreground mb-3">One-off blocks where the provider is unavailable.</p>

      <div className="mb-4">
        <Label>Provider</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger className="max-w-md" data-testid="select-timeoff-provider"><SelectValue placeholder="Select a provider…" /></SelectTrigger>
          <SelectContent>
            {providers.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {providerId && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end border rounded-md p-3 mb-3 bg-muted/30">
            <div className="md:col-span-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vacation" data-testid="input-block-title" /></div>
            <div><Label>From</Label><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} data-testid="input-block-start" /></div>
            <div><Label>To</Label><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} data-testid="input-block-end" /></div>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!startAt || !endAt || addMutation.isPending}
              data-testid="button-add-block"
            ><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>

          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && blocks.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">No time-off scheduled.</div>
          )}
          <div className="space-y-1.5">
            {blocks.sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt)).map(b => (
              <div key={b.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm" data-testid={`row-block-${b.id}`}>
                <div>
                  <div className="font-medium">{b.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleString()}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(b.id)} data-testid={`button-delete-block-${b.id}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Calendar Sync (Zapier webhook URL) ──────────────────────────────────────
function CalendarSyncTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const clinicianId = (user as any)?.id;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = clinicianId ? `${origin}/api/webhooks/boulevard/${clinicianId}` : "";

  const copy = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast({ title: "Webhook URL copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the URL and copy it manually.", variant: "destructive" });
    }
  };

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: "#1c2414" }}>Sync from your scheduling platform</h2>
        <p className="text-sm text-muted-foreground">
          Push appointments from Boulevard, Jane App, Acuity, Mindbody, or any Zapier-connected platform into ClinIQ. Bookings, reschedules, and cancellations appear automatically on your calendar and the patient's portal.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Your personal webhook URL</Label>
        <div className="flex gap-2">
          <Input
            readOnly
            value={webhookUrl || "Loading…"}
            className="font-mono text-xs bg-muted"
            data-testid="input-scheduling-webhook-url"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={copy}
            disabled={!webhookUrl}
            data-testid="button-copy-scheduling-webhook"
          >
            {copied ? <><Check className="h-4 w-4 mr-1" /> Copied</> : <><Copy className="h-4 w-4 mr-1" /> Copy</>}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          This URL is unique to your account. Don't share it publicly.
        </p>
      </div>

      <div className="rounded-md p-4 flex items-start gap-3" style={{ backgroundColor: "#edf2e6", border: "1px solid #c4d4a8" }}>
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#5a7040" }} />
        <div className="text-xs space-y-1.5" style={{ color: "#3d5228" }}>
          <p className="font-semibold" style={{ color: "#1c2414" }}>Quick setup</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Copy the URL above.</li>
            <li>In Zapier, create three Zaps — New Appointment, Updated/Rescheduled, and Cancelled — each using <span className="font-mono">Webhooks by Zapier → POST</span> with this URL.</li>
            <li>For each Zap, add a Data field <span className="font-mono">event</span> set to <span className="font-mono">appointment.created</span>, <span className="font-mono">appointment.updated</span>, or <span className="font-mono">appointment.cancelled</span>.</li>
            <li>Always include the patient's email — that's how ClinIQ matches the appointment to the right patient profile.</li>
          </ol>
          <p className="pt-1">
            Full step-by-step instructions, payload reference, and troubleshooting are in the{" "}
            <Link href="/help" className="underline font-semibold">Help Center → Integrations</Link>.
          </p>
        </div>
      </div>
    </Card>
  );
}
