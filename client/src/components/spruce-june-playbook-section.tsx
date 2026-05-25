import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  BookOpen,
  Workflow,
  Save,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
  Clock,
  Info,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface BusinessDayHours {
  open: string;
  close: string;
}

type BusinessHours = Record<string, BusinessDayHours | null>;

interface ClinicJunePlaybook {
  id?: number;
  playbookEnabled: boolean;
  clinicDisplayName: string | null;
  timezone: string | null;
  businessHours: BusinessHours | null;
  afterHoursEnabled: boolean;
  afterHoursInstructions: string | null;
  emergencyLanguage: string | null;
  voiceStyle: string | null;
  additionalToneGuidance: string | null;
  expectedResponseTime: string | null;
  generalHandoffLanguage: string | null;
  providerNamingPreference: string | null;
}

interface ClinicKnowledgeEntry {
  id: number;
  topicKey: string;
  topicLabel: string;
  content: string;
  link: string | null;
  linkLabel: string | null;
  isEnabled: boolean;
  sortOrder: number;
}

interface SpruceWorkflowPlaybook {
  id?: number;
  workflow: string;
  isEnabled: boolean;
  playbookInstructions: string | null;
  customLinks: Array<{ label: string; url: string }> | null;
  expectedNextStep: string | null;
  handoffNotes: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const VOICE_STYLES = [
  { value: "warm_boutique",       label: "Warm & Boutique",       desc: "Personal and unhurried — like a trusted concierge who knows each patient" },
  { value: "professional_clinical", label: "Professional Clinical", desc: "Precise and clear, with clinical context-awareness" },
  { value: "concierge",           label: "Concierge",             desc: "Premium service feel — attentive, polished, and responsive" },
  { value: "direct_efficient",    label: "Direct & Efficient",    desc: "Respectful and to-the-point — no filler, just answers" },
  { value: "family_practice",     label: "Family Practice",       desc: "Warm, approachable, community-oriented — for broad-spectrum care" },
];

const TIMEZONES = [
  { value: "America/New_York",   label: "Eastern (ET)" },
  { value: "America/Chicago",    label: "Central (CT)" },
  { value: "America/Denver",     label: "Mountain (MT)" },
  { value: "America/Los_Angeles",label: "Pacific (PT)" },
  { value: "America/Phoenix",    label: "Arizona (no DST)" },
  { value: "America/Anchorage",  label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",   label: "Hawaii (HST)" },
];

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const WORKFLOW_META: Record<string, { label: string; description: string }> = {
  medication_refill: { label: "Medication Refill",       description: "Patient requests a prescription refill" },
  appointment:       { label: "Appointment Request",     description: "Patient wants to schedule or reschedule a visit" },
  lab_question:      { label: "Lab / Results Question",  description: "Patient asks about lab work or test results" },
  new_patient:       { label: "New Patient Inquiry",     description: "New patient reaching out for the first time" },
  intake_form:       { label: "Intake Form",             description: "Questions about patient intake or onboarding forms" },
  billing:           { label: "Billing / Insurance",     description: "Questions about bills, payments, or insurance" },
  urgent_safety:     { label: "Urgent / Safety",         description: "Patient reports urgent symptoms or a safety concern" },
};

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: null,
  sun: null,
};

// ── Tab: Playbook ──────────────────────────────────────────────────────────

function PlaybookTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: playbook, isLoading } = useQuery<ClinicJunePlaybook | null>({
    queryKey: ["/api/clinic/june-playbook"],
  });

  const [enabled, setEnabled]           = useState(false);
  const [displayName, setDisplayName]   = useState("");
  const [timezone, setTimezone]         = useState("America/Chicago");
  const [hours, setHours]               = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [afterHoursOn, setAfterHoursOn] = useState(false);
  const [afterHoursInstr, setAfterHoursInstr] = useState("");
  const [emergency, setEmergency]       = useState("");
  const [voiceStyle, setVoiceStyle]     = useState("warm_boutique");
  const [toneGuidance, setToneGuidance] = useState("");
  const [responseTime, setResponseTime] = useState("");
  const [handoffLang, setHandoffLang]   = useState("");
  const [providerNaming, setProviderNaming] = useState("");
  const [saveWarning, setSaveWarning]   = useState<string | null>(null);

  useEffect(() => {
    if (!playbook) return;
    setEnabled(playbook.playbookEnabled);
    setDisplayName(playbook.clinicDisplayName ?? "");
    setTimezone(playbook.timezone ?? "America/Chicago");
    setHours(playbook.businessHours ?? DEFAULT_BUSINESS_HOURS);
    setAfterHoursOn(playbook.afterHoursEnabled);
    setAfterHoursInstr(playbook.afterHoursInstructions ?? "");
    setEmergency(playbook.emergencyLanguage ?? "");
    setVoiceStyle(playbook.voiceStyle ?? "warm_boutique");
    setToneGuidance(playbook.additionalToneGuidance ?? "");
    setResponseTime(playbook.expectedResponseTime ?? "");
    setHandoffLang(playbook.generalHandoffLanguage ?? "");
    setProviderNaming(playbook.providerNamingPreference ?? "");
  }, [playbook]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/clinic/june-playbook", {
        playbookEnabled: enabled,
        clinicDisplayName: displayName.trim() || null,
        timezone: timezone || null,
        businessHours: hours,
        afterHoursEnabled: afterHoursOn,
        afterHoursInstructions: afterHoursInstr.trim() || null,
        emergencyLanguage: emergency.trim() || null,
        voiceStyle: voiceStyle || null,
        additionalToneGuidance: toneGuidance.trim() || null,
        expectedResponseTime: responseTime.trim() || null,
        generalHandoffLanguage: handoffLang.trim() || null,
        providerNamingPreference: providerNaming.trim() || null,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to save playbook");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/june-playbook"] });
      const warnText = data.warnings?.length ? data.warnings.join(" | ") : null;
      setSaveWarning(warnText);
      toast({ title: warnText ? "Saved with notice" : "Playbook saved", description: warnText ?? undefined });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    },
  });

  function setDay(dayKey: string, field: "open" | "close", value: string) {
    setHours(prev => ({
      ...prev,
      [dayKey]: prev[dayKey] ? { ...(prev[dayKey] as BusinessDayHours), [field]: value } : { open: "09:00", close: "17:00" },
    }));
  }

  function toggleDay(dayKey: string, open: boolean) {
    setHours(prev => ({
      ...prev,
      [dayKey]: open ? { open: "09:00", close: "17:00" } : null,
    }));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master switch */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Enable June Playbook</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">
                When on, June uses your clinic's voice, knowledge base, and workflow instructions instead of default behavior. All settings below take effect only when this is enabled.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="toggle-playbook-enabled"
            />
          </div>

          {/* Safety notice — always visible */}
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2.5 mt-4">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Global safety rules are <strong>always enforced</strong> and cannot be overridden by playbook settings. June will never diagnose, prescribe, or give clinical advice regardless of what is configured here.
            </p>
          </div>

          {saveWarning && (
            <div className="flex items-start gap-2 rounded-md bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 px-3 py-2.5 mt-3">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-800 dark:text-orange-300 leading-relaxed">{saveWarning}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voice & Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Voice & Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Voice Style</Label>
            <Select value={voiceStyle} onValueChange={setVoiceStyle}>
              <SelectTrigger data-testid="select-voice-style">
                <SelectValue placeholder="Select a voice style" />
              </SelectTrigger>
              <SelectContent>
                {VOICE_STYLES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="font-medium">{s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {voiceStyle && (
              <p className="text-xs text-muted-foreground">
                {VOICE_STYLES.find(s => s.value === voiceStyle)?.desc}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="display-name" className="text-xs font-medium">Clinic Display Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={`e.g. "the Women's Wellness team"`}
              className="text-sm"
              data-testid="input-clinic-display-name"
            />
            <p className="text-xs text-muted-foreground">How June refers to your clinic in messages (e.g. "The Women's Wellness team will follow up").</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Additional Tone Guidance</Label>
            <Textarea
              value={toneGuidance}
              onChange={e => setToneGuidance(e.target.value)}
              placeholder={`e.g. "Always use the patient's first name. Keep messages under 3 sentences."`}
              className="text-sm resize-none"
              rows={2}
              maxLength={300}
              data-testid="input-tone-guidance"
            />
            <p className="text-xs text-muted-foreground">{toneGuidance.length}/300 characters</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-naming" className="text-xs font-medium">Provider Naming Preference</Label>
            <Input
              id="provider-naming"
              value={providerNaming}
              onChange={e => setProviderNaming(e.target.value)}
              placeholder='e.g. "refer to providers by first name only" or "always use Dr. [LastName]"'
              className="text-sm"
              data-testid="input-provider-naming"
            />
          </div>
        </CardContent>
      </Card>

      {/* Response Expectations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Response Expectations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="response-time" className="text-xs font-medium">Expected Response Time</Label>
            <Input
              id="response-time"
              value={responseTime}
              onChange={e => setResponseTime(e.target.value)}
              placeholder='e.g. "within 1 business day"'
              className="text-sm"
              data-testid="input-response-time"
            />
            <p className="text-xs text-muted-foreground">June mentions this naturally when relevant — sets accurate patient expectations.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="handoff-lang" className="text-xs font-medium">Preferred Handoff Language</Label>
            <Input
              id="handoff-lang"
              value={handoffLang}
              onChange={e => setHandoffLang(e.target.value)}
              placeholder={`e.g. "The Women's Wellness team will be in touch shortly."`}
              className="text-sm"
              data-testid="input-handoff-language"
            />
            <p className="text-xs text-muted-foreground">The closing line June uses when handing off to staff.</p>
          </div>
        </CardContent>
      </Card>

      {/* Business Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Business Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Clinic Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger data-testid="select-timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used to determine whether inbound messages arrive within business hours.</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium mb-2">Weekly Schedule</p>
            {DAYS.map(day => {
              const dayHours = hours[day.key];
              const isOpen = dayHours !== null && dayHours !== undefined;
              return (
                <div key={day.key} className="flex items-center gap-3 py-1.5" data-testid={`row-hours-${day.key}`}>
                  <div className="w-24 flex items-center gap-2">
                    <Switch
                      checked={isOpen}
                      onCheckedChange={v => toggleDay(day.key, v)}
                      data-testid={`toggle-day-${day.key}`}
                    />
                    <span className="text-xs font-medium">{day.label.slice(0, 3)}</span>
                  </div>
                  {isOpen ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={dayHours?.open ?? "09:00"}
                        onChange={e => setDay(day.key, "open", e.target.value)}
                        className="text-xs h-8 w-28"
                        data-testid={`input-${day.key}-open`}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={dayHours?.close ?? "17:00"}
                        onChange={e => setDay(day.key, "close", e.target.value)}
                        className="text-xs h-8 w-28"
                        data-testid={`input-${day.key}-close`}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* After-Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">After-Hours Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Send after-hours acknowledgment</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                When on, June sends a brief after-hours message to patients who message outside business hours. One message per conversation per 24 hours — no repeat sends.
              </p>
            </div>
            <Switch
              checked={afterHoursOn}
              onCheckedChange={setAfterHoursOn}
              data-testid="toggle-after-hours-enabled"
            />
          </div>

          {afterHoursOn && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">After-Hours Instructions</Label>
              <Textarea
                value={afterHoursInstr}
                onChange={e => setAfterHoursInstr(e.target.value)}
                placeholder='e.g. "Remind patients that the office re-opens Monday at 9 AM CT. Encourage portal messaging for non-urgent questions."'
                className="text-sm resize-none"
                rows={3}
                maxLength={500}
                data-testid="input-after-hours-instructions"
              />
              <p className="text-xs text-muted-foreground">{afterHoursInstr.length}/500 characters — guidance for June's tone and content after hours.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="emergency-lang" className="text-xs font-medium">Emergency Language</Label>
            <Textarea
              id="emergency-lang"
              value={emergency}
              onChange={e => setEmergency(e.target.value)}
              placeholder='Leave blank to use default: "If this is an emergency, please call 911 or go to your nearest ER right away."'
              className="text-sm resize-none"
              rows={2}
              data-testid="input-emergency-language"
            />
            <div className="flex items-start gap-2 mt-1">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Overrides June's built-in 911 language. Must reference emergency escalation (phone number or ER). Leave blank to keep the default.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        data-testid="button-save-playbook"
      >
        {saveMutation.isPending
          ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Saving…</>
          : <><Save className="w-3.5 h-3.5 mr-2" />Save Playbook Settings</>
        }
      </Button>
    </div>
  );
}

// ── Tab: Knowledge Base ────────────────────────────────────────────────────

interface EntryFormState {
  topicKey: string;
  topicLabel: string;
  content: string;
  link: string;
  linkLabel: string;
  isEnabled: boolean;
  sortOrder: number;
}

const BLANK_ENTRY: EntryFormState = {
  topicKey: "", topicLabel: "", content: "",
  link: "", linkLabel: "", isEnabled: true, sortOrder: 0,
};

function KnowledgeBaseTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery<ClinicKnowledgeEntry[]>({
    queryKey: ["/api/clinic/knowledge-entries"],
  });

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<EntryFormState>(BLANK_ENTRY);

  function startNew() {
    setEditingId("new");
    setForm(BLANK_ENTRY);
  }

  function startEdit(e: ClinicKnowledgeEntry) {
    setEditingId(e.id);
    setForm({
      topicKey: e.topicKey,
      topicLabel: e.topicLabel,
      content: e.content,
      link: e.link ?? "",
      linkLabel: e.linkLabel ?? "",
      isEnabled: e.isEnabled,
      sortOrder: e.sortOrder,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(BLANK_ENTRY);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.topicKey.trim() || !form.topicLabel.trim() || !form.content.trim()) {
        throw new Error("Topic key, label, and content are required");
      }
      const body = {
        topicKey: form.topicKey.trim(),
        topicLabel: form.topicLabel.trim(),
        content: form.content.trim(),
        link: form.link.trim() || null,
        linkLabel: form.linkLabel.trim() || null,
        isEnabled: form.isEnabled,
        sortOrder: Number(form.sortOrder),
      };
      if (editingId === "new") {
        const res = await apiRequest("POST", "/api/clinic/knowledge-entries", body);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "Failed to save");
        }
        return res.json();
      } else {
        const res = await apiRequest("PUT", `/api/clinic/knowledge-entries/${editingId}`, body);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "Failed to save");
        }
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/knowledge-entries"] });
      cancelEdit();
      toast({ title: editingId === "new" ? "Entry added" : "Entry updated" });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/clinic/knowledge-entries/${id}`, undefined);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/knowledge-entries"] });
      toast({ title: "Entry deleted" });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      const entry = entries.find(e => e.id === id);
      if (!entry) throw new Error("Entry not found");
      const res = await apiRequest("PUT", `/api/clinic/knowledge-entries/${id}`, {
        topicKey: entry.topicKey,
        topicLabel: entry.topicLabel,
        content: entry.content,
        link: entry.link,
        linkLabel: entry.linkLabel,
        isEnabled,
        sortOrder: entry.sortOrder,
      });
      if (!res.ok) throw new Error("Failed to toggle");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/knowledge-entries"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Update failed", description: e.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Clinic Knowledge Base</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">
            Topics June references when patients ask operational questions — new patient process, programs, policies, refill procedures. Capped at 8 enabled entries injected per conversation.
          </p>
        </div>
        {editingId === null && (
          <Button size="sm" onClick={startNew} data-testid="button-add-knowledge-entry">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Entry
          </Button>
        )}
      </div>

      {/* Add / Edit form */}
      {editingId !== null && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{editingId === "new" ? "New Knowledge Entry" : "Edit Entry"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Topic Key <span className="text-muted-foreground">(machine name)</span></Label>
                <Input
                  value={form.topicKey}
                  onChange={e => setForm(f => ({ ...f, topicKey: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                  placeholder="e.g. new_patient_process"
                  className="text-sm font-mono"
                  disabled={editingId !== "new"}
                  data-testid="input-topic-key"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Topic Label <span className="text-muted-foreground">(display name)</span></Label>
                <Input
                  value={form.topicLabel}
                  onChange={e => setForm(f => ({ ...f, topicLabel: e.target.value }))}
                  placeholder="e.g. New Patient Process"
                  className="text-sm"
                  data-testid="input-topic-label"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Content <span className="text-muted-foreground">(max 2000 chars)</span></Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Describe what June should know about this topic. Be specific — June uses this verbatim to answer patient questions."
                className="text-sm resize-none"
                rows={4}
                maxLength={2000}
                data-testid="input-topic-content"
              />
              <p className="text-xs text-muted-foreground">{form.content.length}/2000</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Link URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  value={form.link}
                  onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                  placeholder="https://…"
                  className="text-sm"
                  data-testid="input-topic-link"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Link Label <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  value={form.linkLabel}
                  onChange={e => setForm(f => ({ ...f, linkLabel: e.target.value }))}
                  placeholder='e.g. "New Patient Packet"'
                  className="text-sm"
                  data-testid="input-topic-link-label"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={v => setForm(f => ({ ...f, isEnabled: v }))}
                  data-testid="toggle-entry-enabled"
                />
                <Label className="text-xs">Enabled</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Sort order</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                  className="text-xs h-8 w-16"
                  min={0}
                  data-testid="input-sort-order"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-entry"
              >
                {saveMutation.isPending
                  ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving…</>
                  : <><Save className="w-3 h-3 mr-1.5" />Save Entry</>
                }
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEdit} data-testid="button-cancel-entry">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entry list */}
      {entries.length === 0 && editingId === null ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center rounded-md border bg-muted/20">
          <BookOpen className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm font-medium">No knowledge entries yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Add topics June can reference when patients ask operational questions — programs, policies, processes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <Card key={entry.id} className={!entry.isEnabled ? "opacity-60" : ""} data-testid={`card-entry-${entry.id}`}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{entry.topicLabel}</p>
                      <code className="text-xs text-muted-foreground font-mono bg-muted px-1 rounded">{entry.topicKey}</code>
                      {!entry.isEnabled && <Badge variant="outline" className="text-xs">Disabled</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.content}</p>
                    {entry.link && (
                      <a
                        href={entry.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {entry.linkLabel ?? entry.link}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      checked={entry.isEnabled}
                      onCheckedChange={v => toggleMutation.mutate({ id: entry.id, isEnabled: v })}
                      disabled={toggleMutation.isPending}
                      data-testid={`toggle-entry-enabled-${entry.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => startEdit(entry)}
                      disabled={editingId !== null}
                      data-testid={`button-edit-entry-${entry.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(entry.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-entry-${entry.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2.5">
        <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          Up to 8 enabled entries are injected per conversation in sort-order. Entries only appear in June's responses when <strong>Playbook is enabled</strong> in the Playbook tab.
        </p>
      </div>
    </div>
  );
}

// ── Tab: Workflow Playbooks ────────────────────────────────────────────────

interface LinkItem { label: string; url: string }

function WorkflowPlaybookCard({
  workflow,
  meta,
  initial,
}: {
  workflow: string;
  meta: { label: string; description: string };
  initial: SpruceWorkflowPlaybook | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [isEnabled, setIsEnabled]         = useState(initial?.isEnabled ?? false);
  const [instructions, setInstructions]   = useState(initial?.playbookInstructions ?? "");
  const [nextStep, setNextStep]           = useState(initial?.expectedNextStep ?? "");
  const [handoffNotes, setHandoffNotes]   = useState(initial?.handoffNotes ?? "");
  const [links, setLinks]                 = useState<LinkItem[]>(
    (initial?.customLinks as LinkItem[] | null) ?? []
  );
  const [newLinkLabel, setNewLinkLabel]   = useState("");
  const [newLinkUrl, setNewLinkUrl]       = useState("");

  useEffect(() => {
    if (!initial) return;
    setIsEnabled(initial.isEnabled);
    setInstructions(initial.playbookInstructions ?? "");
    setNextStep(initial.expectedNextStep ?? "");
    setHandoffNotes(initial.handoffNotes ?? "");
    setLinks((initial.customLinks as LinkItem[] | null) ?? []);
  }, [initial]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/spruce/settings/workflow-playbooks/${workflow}`, {
        isEnabled,
        playbookInstructions: instructions.trim() || null,
        customLinks: links.length > 0 ? links : null,
        expectedNextStep: nextStep.trim() || null,
        handoffNotes: handoffNotes.trim() || null,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spruce/settings/workflow-playbooks"] });
      const warnText = data.warnings?.length ? data.warnings.join(" | ") : null;
      if (warnText) {
        toast({ title: "Saved with notice", description: warnText });
      } else {
        toast({ title: `${meta.label} playbook saved` });
      }
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    },
  });

  function addLink() {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    setLinks(prev => [...prev, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }]);
    setNewLinkLabel("");
    setNewLinkUrl("");
  }

  function removeLink(i: number) {
    setLinks(prev => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Card data-testid={`card-workflow-${workflow}`}>
      <CardContent className="pt-3 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <button
            type="button"
            className="flex items-center gap-2 text-left flex-1 min-w-0"
            onClick={() => setOpen(v => !v)}
            data-testid={`button-expand-workflow-${workflow}`}
          >
            {open
              ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            }
            <div className="min-w-0">
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {isEnabled && <Badge variant="outline" className="text-xs text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">Active</Badge>}
            <Switch
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              data-testid={`toggle-workflow-enabled-${workflow}`}
            />
          </div>
        </div>

        {/* Expanded body */}
        {open && (
          <div className="space-y-4 mt-4 pt-4 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Playbook Instructions for June</Label>
              <Textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder={`e.g. "For ${meta.label.toLowerCase()} messages, always confirm the patient's pharmacy name and preferred contact time before routing to staff."`}
                className="text-sm resize-none"
                rows={3}
                maxLength={1000}
                data-testid={`input-instructions-${workflow}`}
              />
              <p className="text-xs text-muted-foreground">{instructions.length}/1000 — guidance for June's response to this workflow type</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Expected Next Step</Label>
              <Input
                value={nextStep}
                onChange={e => setNextStep(e.target.value)}
                placeholder={`e.g. "The team will follow up within 1 business day to confirm scheduling."`}
                className="text-sm"
                data-testid={`input-next-step-${workflow}`}
              />
              <p className="text-xs text-muted-foreground">What June tells the patient will happen next — sets accurate expectations.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Handoff Notes for Staff Memo</Label>
              <Textarea
                value={handoffNotes}
                onChange={e => setHandoffNotes(e.target.value)}
                placeholder={`e.g. "Route all ${meta.label.toLowerCase()} requests to the MA team first. Flag urgent requests to the on-call provider."`}
                className="text-sm resize-none"
                rows={2}
                data-testid={`input-handoff-notes-${workflow}`}
              />
              <p className="text-xs text-muted-foreground">Added verbatim to the RECOMMENDED ACTION section of the staff memo — never shown to patients.</p>
            </div>

            {/* Custom links */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Custom Links</Label>
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`row-link-${workflow}-${i}`}>
                  <div className="flex-1 flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                    <span className="font-medium truncate">{link.label}</span>
                    <span className="text-muted-foreground">—</span>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 truncate flex items-center gap-0.5">
                      {link.url} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeLink(i)} data-testid={`button-remove-link-${workflow}-${i}`}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-5 gap-2">
                <Input
                  value={newLinkLabel}
                  onChange={e => setNewLinkLabel(e.target.value)}
                  placeholder="Label"
                  className="text-xs col-span-2"
                  data-testid={`input-new-link-label-${workflow}`}
                />
                <Input
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="text-xs col-span-2"
                  data-testid={`input-new-link-url-${workflow}`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addLink}
                  disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
                  data-testid={`button-add-link-${workflow}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Links are embedded naturally in-sentence — June never dumps raw URLs in a list.</p>
            </div>

            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid={`button-save-workflow-${workflow}`}
            >
              {saveMutation.isPending
                ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving…</>
                : <><Save className="w-3 h-3 mr-1.5" />Save</>
              }
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkflowPlaybooksTab() {
  const { data: playbooksData, isLoading } = useQuery<{ playbooks: Record<string, SpruceWorkflowPlaybook> }>({
    queryKey: ["/api/spruce/settings/workflow-playbooks"],
  });

  const playbooks = playbooksData?.playbooks ?? {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Workflow Playbooks</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">
          Per-workflow instructions that shape how June responds to each message type — custom language, links, next-step messaging, and staff handoff notes. Expand a workflow to configure it.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2.5">
        <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          Workflow playbooks only apply when the <strong>Playbook is enabled</strong> in the Playbook tab AND the corresponding workflow acknowledgment is enabled in <strong>Integrations → Spruce → June Acknowledgments</strong>.
        </p>
      </div>

      <div className="space-y-2">
        {Object.entries(WORKFLOW_META).map(([workflow, meta]) => (
          <WorkflowPlaybookCard
            key={workflow}
            workflow={workflow}
            meta={meta}
            initial={playbooks[workflow] ?? null}
          />
        ))}
      </div>
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────

type PlaybookTab = "playbook" | "knowledge" | "workflows";

export function SpruceJunePlaybookSection() {
  const [activeTab, setActiveTab] = useState<PlaybookTab>("playbook");

  const tabs: { id: PlaybookTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "playbook",   label: "Playbook",        icon: Bot },
    { id: "knowledge",  label: "Knowledge Base",  icon: BookOpen },
    { id: "workflows",  label: "Workflow Playbooks", icon: Workflow },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">June Playbook</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure how June speaks, what she knows, and how she handles each workflow — for your clinic's Spruce integration.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-md bg-muted/40 p-1 border">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-playbook-${tab.id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors flex-1 justify-center"
              style={{
                backgroundColor: activeTab === tab.id ? "white" : "transparent",
                color: activeTab === tab.id ? "#111" : "#666",
                boxShadow: activeTab === tab.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      {activeTab === "playbook"  && <PlaybookTab />}
      {activeTab === "knowledge" && <KnowledgeBaseTab />}
      {activeTab === "workflows" && <WorkflowPlaybooksTab />}
    </div>
  );
}
