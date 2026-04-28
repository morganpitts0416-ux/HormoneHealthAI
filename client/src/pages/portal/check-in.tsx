import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Apple, Moon, Activity, Smile, AlertCircle, Pill, Droplets,
  CheckCircle2, Loader2, Plus, Trash2, ChevronRight,
} from "lucide-react";
import { ActiveVitalsMonitoringCard } from "@/components/portal/active-vitals-monitoring-card";

type CheckIn = {
  date: string;
  weight?: string | null;
  foodProteinLevel?: number | null;
  waterLevel?: number | null;
  fiberVeggieLevel?: number | null;
  processedFoodLevel?: number | null;
  alcoholUse?: number | null;
  foodNotes?: string | null;
  sleepHours?: string | null;
  sleepQuality?: number | null;
  nightSweats?: boolean | null;
  wokeDuringNight?: boolean | null;
  exerciseDone?: boolean | null;
  exerciseType?: string | null;
  exerciseMinutes?: number | null;
  exerciseIntensity?: number | null;
  moodScore?: number | null;
  energyScore?: number | null;
  cravingsScore?: number | null;
  hungerScore?: number | null;
  brainFogScore?: number | null;
  anxietyIrritabilityScore?: number | null;
  giSymptoms?: string[] | null;
  unexpectedBleeding?: boolean | null;
  otherSymptoms?: string | null;
  cycleData?: { bleeding?: "none" | "spotting" | "light" | "medium" | "heavy"; cramps?: number } | null;
  notes?: string | null;
};

type Settings = {
  trackingMode: "off" | "standard" | "power";
  enabled: boolean;
  setupCompleted: boolean;
  stillHasCycle: boolean | null;
  cyclesRegular: boolean | null;
  onHormoneTherapy: boolean | null;
};

type MedicationsResponse = {
  chartMedications: Array<{ id: string; name: string; source: string }>;
  patientReported: Array<{ id: string; rowId: number; name: string; dose?: string | null; frequency?: string | null; type: string; source: string; reviewedByProvider: boolean }>;
};

type AdherenceLog = {
  id: number;
  date: string;
  medicationName: string;
  status: string;
};

const SECTIONS = [
  { id: "food", label: "Food & Drink", icon: Apple },
  { id: "sleep", label: "Sleep", icon: Moon },
  { id: "exercise", label: "Movement", icon: Activity },
  { id: "mood", label: "How You Feel", icon: Smile },
  { id: "symptoms", label: "Symptoms", icon: AlertCircle },
  { id: "cycle", label: "Cycle", icon: Droplets },
  { id: "meds", label: "Medications", icon: Pill },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }

function Rating({ value, onChange, min = 1, max = 5, lowLabel, highLabel, testId }: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  min?: number; max?: number;
  lowLabel?: string; highLabel?: string;
  testId: string;
}) {
  const opts: number[] = [];
  for (let i = min; i <= max; i++) opts.push(i);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5" data-testid={testId}>
        {opts.map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(selected ? null : n)}
              className={`min-w-10 h-10 px-3 rounded-md text-sm font-medium border transition-colors hover-elevate active-elevate-2`}
              style={{
                backgroundColor: selected ? "#2e3a20" : "#ffffff",
                color: selected ? "#ffffff" : "#1c2414",
                borderColor: selected ? "#2e3a20" : "#d4c9b5",
              }}
              data-testid={`${testId}-opt-${n}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-[11px]" style={{ color: "#7a8a64" }}>
          <span>{lowLabel}</span><span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section
      id={`section-${id}`}
      className="rounded-xl border p-4 sm:p-5 space-y-4 scroll-mt-20"
      style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}
    >
      <h2 className="text-base font-semibold" style={{ color: "#1c2414" }}>{title}</h2>
      {children}
    </section>
  );
}

function ToggleRow({ label, value, onChange, testId }: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="text-sm font-normal" style={{ color: "#1c2414" }}>{label}</Label>
      <Switch checked={!!value} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

export default function PortalCheckIn() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date] = useState(todayStr());
  const [draft, setDraft] = useState<CheckIn>({ date });
  const [activeSection, setActiveSection] = useState("food");
  const [newMedName, setNewMedName] = useState("");
  const [newMedDose, setNewMedDose] = useState("");
  const [newMedFreq, setNewMedFreq] = useState("");
  const [newMedType, setNewMedType] = useState<"medication" | "supplement">("supplement");

  // Auth check
  const { data: me, isLoading: meLoading, error: meError } = useQuery<{ id: number; firstName: string; gender?: string }>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  useEffect(() => {
    if (meError) setLocation("/portal/login");
  }, [meError, setLocation]);

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/portal/tracking/settings"],
    enabled: !!me,
  });
  const { data: today } = useQuery<CheckIn>({
    queryKey: ["/api/portal/tracking/checkins/today"],
    enabled: !!me,
  });
  const { data: meds } = useQuery<MedicationsResponse>({
    queryKey: ["/api/portal/tracking/medications"],
    enabled: !!me,
  });
  const { data: adherenceToday = [] } = useQuery<AdherenceLog[]>({
    queryKey: ["/api/portal/tracking/med-adherence", { from: date, to: date }],
    queryFn: async () => {
      const res = await fetch(`/api/portal/tracking/med-adherence?from=${date}&to=${date}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!me,
  });

  // Initialise draft from server-side today record
  useEffect(() => {
    if (today && today.date) {
      setDraft({ ...today, date: today.date });
    }
  }, [today]);

  const showCycle = useMemo(() => {
    const gender = (me as any)?.gender?.toLowerCase?.() ?? "";
    const isFemale = gender === "female" || gender === "f";
    const stillHasCycle = settings?.stillHasCycle;
    return isFemale && stillHasCycle !== false;
  }, [me, settings]);

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => s.id !== "cycle" || showCycle),
    [showCycle],
  );

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/tracking/checkins", { ...draft, date }),
    onSuccess: () => {
      toast({ title: "Check-in saved", description: "Thanks for keeping us in the loop." });
      qc.invalidateQueries({ queryKey: ["/api/portal/tracking/checkins/today"] });
      qc.invalidateQueries({ queryKey: ["/api/portal/tracking/checkins"] });
    },
    onError: () => toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" }),
  });

  const adherenceMutation = useMutation({
    mutationFn: ({ medicationName, status, source }: { medicationName: string; status: "taken" | "skipped"; source: "patient_chart" | "patient_reported" }) =>
      apiRequest("POST", "/api/portal/tracking/med-adherence", { medicationName, status, source, date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/tracking/med-adherence", { from: date, to: date }] }),
  });

  const addMedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/tracking/patient-reported-medication", {
      name: newMedName.trim(), dose: newMedDose.trim() || null, frequency: newMedFreq.trim() || null, type: newMedType,
    }),
    onSuccess: () => {
      toast({ title: `${newMedType === "medication" ? "Medication" : "Supplement"} added`, description: "Your care team has been notified for review." });
      setNewMedName(""); setNewMedDose(""); setNewMedFreq("");
      qc.invalidateQueries({ queryKey: ["/api/portal/tracking/medications"] });
    },
    onError: () => toast({ title: "Couldn't add", description: "Please try again.", variant: "destructive" }),
  });

  const deleteMedMutation = useMutation({
    mutationFn: (rowId: number) => apiRequest("DELETE", `/api/portal/tracking/patient-reported-medication/${rowId}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/tracking/medications"] }),
  });

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#2e3a20" }} />
      </div>
    );
  }

  // Tracking is off — show opt-in nudge
  if (settings && settings.trackingMode === "off") {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
        <header className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/portal/dashboard">
              <Button variant="ghost" size="sm" data-testid="link-back-dashboard">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
            </Link>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <div className="rounded-xl border p-6 space-y-4" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
            <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>Daily Check-In</h1>
            <p className="text-sm" style={{ color: "#5a6048" }}>
              Track how you're doing day-to-day so your care team can spot patterns between visits.
              This is completely optional. You can pause or stop anytime.
            </p>
            <p className="text-sm" style={{ color: "#5a6048" }}>
              Standard Mode takes about 60 seconds a day: food, sleep, mood, symptoms, and your medications.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={async () => {
                  await apiRequest("POST", "/api/portal/tracking/settings", { trackingMode: "standard", enabled: true, setupCompleted: true });
                  qc.invalidateQueries({ queryKey: ["/api/portal/tracking/settings"] });
                }}
                style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                data-testid="button-enable-tracking"
              >
                Start tracking
              </Button>
              <Link href="/portal/dashboard">
                <Button variant="outline" data-testid="button-not-now">Not now</Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const adherenceMap = new Map<string, AdherenceLog>();
  for (const log of adherenceToday) adherenceMap.set(log.medicationName, log);

  const allMeds = [
    ...(meds?.chartMedications ?? []).map((m) => ({ id: m.id, name: m.name, source: "patient_chart" as const, rowId: undefined as number | undefined })),
    ...(meds?.patientReported ?? []).map((m) => ({ id: m.id, name: m.name, source: "patient_reported" as const, rowId: m.rowId })),
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/portal/dashboard">
            <Button variant="ghost" size="sm" data-testid="link-back-dashboard">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          </Link>
          <div className="text-center min-w-0">
            <h1 className="text-base font-semibold truncate" style={{ color: "#1c2414" }}>Today's check-in</h1>
            <p className="text-xs" style={{ color: "#7a8a64" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
            data-testid="button-save-checkin"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 flex gap-6">
        {/* Left rail */}
        <aside className="hidden md:block w-44 flex-shrink-0">
          <nav className="sticky top-20 space-y-1">
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <a
                  key={s.id}
                  href={`#section-${s.id}`}
                  onClick={() => setActiveSection(s.id)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors hover-elevate"
                  style={{
                    color: active ? "#1c2414" : "#5a6048",
                    backgroundColor: active ? "#edf4e4" : "transparent",
                    fontWeight: active ? 600 : 400,
                  }}
                  data-testid={`rail-${s.id}`}
                >
                  <Icon className="w-4 h-4" /> {s.label}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6 pb-32">
          <ActiveVitalsMonitoringCard />

          <Section id="food" title="Food & drink">
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Weight (optional)</Label>
                <Input
                  type="number" step="0.1" inputMode="decimal"
                  placeholder="lbs"
                  value={draft.weight ?? ""}
                  onChange={(e) => setDraft({ ...draft, weight: e.target.value || null })}
                  className="max-w-32 mt-1.5"
                  data-testid="input-weight"
                />
              </div>
              <div>
                <Label className="text-sm">Protein at meals</Label>
                <Rating
                  value={draft.foodProteinLevel} onChange={(n) => setDraft({ ...draft, foodProteinLevel: n })}
                  lowLabel="Skipped" highLabel="Hit goal" testId="rating-protein"
                />
              </div>
              <div>
                <Label className="text-sm">Water</Label>
                <Rating
                  value={draft.waterLevel} onChange={(n) => setDraft({ ...draft, waterLevel: n })}
                  lowLabel="Barely any" highLabel="Plenty" testId="rating-water"
                />
              </div>
              <div>
                <Label className="text-sm">Fiber & vegetables</Label>
                <Rating
                  value={draft.fiberVeggieLevel} onChange={(n) => setDraft({ ...draft, fiberVeggieLevel: n })}
                  lowLabel="None" highLabel="Lots" testId="rating-fiber"
                />
              </div>
              <div>
                <Label className="text-sm">Processed / packaged food</Label>
                <Rating
                  value={draft.processedFoodLevel} onChange={(n) => setDraft({ ...draft, processedFoodLevel: n })}
                  lowLabel="None" highLabel="Most meals" testId="rating-processed"
                />
              </div>
              <div>
                <Label className="text-sm">Alcohol</Label>
                <Rating
                  value={draft.alcoholUse} onChange={(n) => setDraft({ ...draft, alcoholUse: n })}
                  min={0} max={5}
                  lowLabel="None" highLabel="5+ drinks" testId="rating-alcohol"
                />
              </div>
              <div>
                <Label className="text-sm">Notes</Label>
                <Textarea
                  rows={2}
                  placeholder="Anything notable about food today?"
                  value={draft.foodNotes ?? ""}
                  onChange={(e) => setDraft({ ...draft, foodNotes: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-food-notes"
                />
              </div>
            </div>
          </Section>

          <Section id="sleep" title="Sleep">
            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <div>
                  <Label className="text-sm">Hours slept</Label>
                  <Input
                    type="number" step="0.25" inputMode="decimal"
                    placeholder="7.5"
                    value={draft.sleepHours ?? ""}
                    onChange={(e) => setDraft({ ...draft, sleepHours: e.target.value || null })}
                    className="max-w-24 mt-1.5"
                    data-testid="input-sleep-hours"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">Sleep quality</Label>
                <Rating
                  value={draft.sleepQuality} onChange={(n) => setDraft({ ...draft, sleepQuality: n })}
                  lowLabel="Poor" highLabel="Restorative" testId="rating-sleep-quality"
                />
              </div>
              <ToggleRow label="Night sweats" value={draft.nightSweats} onChange={(v) => setDraft({ ...draft, nightSweats: v })} testId="toggle-night-sweats" />
              <ToggleRow label="Woke during the night" value={draft.wokeDuringNight} onChange={(v) => setDraft({ ...draft, wokeDuringNight: v })} testId="toggle-woke" />
            </div>
          </Section>

          <Section id="exercise" title="Movement">
            <div className="space-y-4">
              <ToggleRow label="Did you move your body today?" value={draft.exerciseDone} onChange={(v) => setDraft({ ...draft, exerciseDone: v })} testId="toggle-exercise" />
              {draft.exerciseDone && (
                <>
                  <div>
                    <Label className="text-sm">What kind?</Label>
                    <Input
                      placeholder="walk, lifting, yoga..."
                      value={draft.exerciseType ?? ""}
                      onChange={(e) => setDraft({ ...draft, exerciseType: e.target.value })}
                      className="mt-1.5"
                      data-testid="input-exercise-type"
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <Label className="text-sm">Minutes</Label>
                      <Input
                        type="number" inputMode="numeric"
                        placeholder="30"
                        value={draft.exerciseMinutes ?? ""}
                        onChange={(e) => setDraft({ ...draft, exerciseMinutes: e.target.value ? Number(e.target.value) : null })}
                        className="max-w-24 mt-1.5"
                        data-testid="input-exercise-minutes"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Intensity</Label>
                    <Rating
                      value={draft.exerciseIntensity} onChange={(n) => setDraft({ ...draft, exerciseIntensity: n })}
                      lowLabel="Easy" highLabel="All-out" testId="rating-intensity"
                    />
                  </div>
                </>
              )}
            </div>
          </Section>

          <Section id="mood" title="How you feel">
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Mood</Label>
                <Rating value={draft.moodScore} onChange={(n) => setDraft({ ...draft, moodScore: n })} lowLabel="Low" highLabel="Great" testId="rating-mood" />
              </div>
              <div>
                <Label className="text-sm">Energy</Label>
                <Rating value={draft.energyScore} onChange={(n) => setDraft({ ...draft, energyScore: n })} lowLabel="Drained" highLabel="Energized" testId="rating-energy" />
              </div>
              <div>
                <Label className="text-sm">Cravings</Label>
                <Rating value={draft.cravingsScore} onChange={(n) => setDraft({ ...draft, cravingsScore: n })} lowLabel="None" highLabel="Strong" testId="rating-cravings" />
              </div>
              <div>
                <Label className="text-sm">Hunger</Label>
                <Rating value={draft.hungerScore} onChange={(n) => setDraft({ ...draft, hungerScore: n })} lowLabel="Low" highLabel="Ravenous" testId="rating-hunger" />
              </div>
              <div>
                <Label className="text-sm">Brain fog</Label>
                <Rating value={draft.brainFogScore} onChange={(n) => setDraft({ ...draft, brainFogScore: n })} lowLabel="Sharp" highLabel="Foggy" testId="rating-brainfog" />
              </div>
              <div>
                <Label className="text-sm">Anxiety / irritability</Label>
                <Rating value={draft.anxietyIrritabilityScore} onChange={(n) => setDraft({ ...draft, anxietyIrritabilityScore: n })} lowLabel="Calm" highLabel="On edge" testId="rating-anxiety" />
              </div>
            </div>
          </Section>

          <Section id="symptoms" title="Symptoms">
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#7a8a64" }}>
                Anything notable today? Tell your team only what matters.
              </p>
              <Textarea
                rows={3}
                placeholder="Headache, joint pain, hot flashes, etc."
                value={draft.otherSymptoms ?? ""}
                onChange={(e) => setDraft({ ...draft, otherSymptoms: e.target.value })}
                data-testid="input-other-symptoms"
              />
            </div>
          </Section>

          {showCycle && (
            <Section id="cycle" title="Cycle">
              <div className="space-y-3">
                <Label className="text-sm">Bleeding today</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(["none", "spotting", "light", "medium", "heavy"] as const).map((b) => {
                    const selected = (draft.cycleData?.bleeding ?? "none") === b;
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setDraft({ ...draft, cycleData: { ...(draft.cycleData ?? {}), bleeding: b } })}
                        className="h-10 px-4 rounded-md text-sm font-medium border hover-elevate active-elevate-2 capitalize"
                        style={{
                          backgroundColor: selected ? "#2e3a20" : "#ffffff",
                          color: selected ? "#ffffff" : "#1c2414",
                          borderColor: selected ? "#2e3a20" : "#d4c9b5",
                        }}
                        data-testid={`bleeding-${b}`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
                <ToggleRow
                  label="Unexpected / breakthrough bleeding"
                  value={draft.unexpectedBleeding}
                  onChange={(v) => setDraft({ ...draft, unexpectedBleeding: v })}
                  testId="toggle-unexpected-bleeding"
                />
                {draft.unexpectedBleeding && (
                  <p className="text-xs" style={{ color: "#c0392b" }}>
                    Your care team will be notified about this.
                  </p>
                )}
              </div>
            </Section>
          )}

          <Section id="meds" title="Medications & supplements">
            <div className="space-y-4">
              {allMeds.length === 0 && (
                <p className="text-sm" style={{ color: "#7a8a64" }}>
                  No medications on file. Add anything you take below.
                </p>
              )}
              {allMeds.length > 0 && (
                <div className="space-y-1.5">
                  {allMeds.map((m) => {
                    const log = adherenceMap.get(m.name);
                    const taken = log?.status === "taken";
                    const skipped = log?.status === "skipped" || log?.status === "missed";
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border"
                        style={{ borderColor: "#e8ddd0", backgroundColor: taken ? "#edf4e4" : "#ffffff" }}
                        data-testid={`med-row-${m.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: "#1c2414" }}>{m.name}</p>
                          <p className="text-[11px]" style={{ color: "#7a8a64" }}>
                            {m.source === "patient_chart" ? "From your chart" : "Added by you"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={taken ? "default" : "outline"}
                            onClick={() => adherenceMutation.mutate({ medicationName: m.name, status: "taken", source: m.source })}
                            disabled={adherenceMutation.isPending}
                            data-testid={`button-taken-${m.id}`}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Taken
                          </Button>
                          <Button
                            size="sm"
                            variant={skipped ? "default" : "outline"}
                            onClick={() => adherenceMutation.mutate({ medicationName: m.name, status: "skipped", source: m.source })}
                            disabled={adherenceMutation.isPending}
                            data-testid={`button-skipped-${m.id}`}
                          >
                            Skipped
                          </Button>
                          {m.source === "patient_reported" && m.rowId && (
                            <Button
                              size="icon" variant="ghost"
                              onClick={() => deleteMedMutation.mutate(m.rowId!)}
                              data-testid={`button-delete-med-${m.id}`}
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#e8ddd0", backgroundColor: "#faf8f5" }}>
                <p className="text-sm font-medium" style={{ color: "#1c2414" }}>
                  Add a medication or supplement
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(["medication", "supplement"] as const).map((t) => {
                    const selected = newMedType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewMedType(t)}
                        className="h-9 px-3 rounded-md text-sm font-medium border hover-elevate capitalize"
                        style={{
                          backgroundColor: selected ? "#2e3a20" : "#ffffff",
                          color: selected ? "#ffffff" : "#1c2414",
                          borderColor: selected ? "#2e3a20" : "#d4c9b5",
                        }}
                        data-testid={`button-add-type-${t}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <Input
                  placeholder="Name (e.g. Magnesium glycinate)"
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                  data-testid="input-new-med-name"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Dose (e.g. 400 mg)"
                    value={newMedDose}
                    onChange={(e) => setNewMedDose(e.target.value)}
                    data-testid="input-new-med-dose"
                  />
                  <Input
                    placeholder="Frequency (e.g. nightly)"
                    value={newMedFreq}
                    onChange={(e) => setNewMedFreq(e.target.value)}
                    data-testid="input-new-med-freq"
                  />
                </div>
                <Button
                  onClick={() => addMedMutation.mutate()}
                  disabled={!newMedName.trim() || addMedMutation.isPending}
                  style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                  data-testid="button-add-med"
                >
                  {addMedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
                </Button>
                <p className="text-[11px]" style={{ color: "#7a8a64" }}>
                  We'll let your care team know so they can review for interactions.
                </p>
              </div>
            </div>
          </Section>

          <div className="sticky bottom-4 flex justify-end">
            <Button
              size="lg"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{ backgroundColor: "#2e3a20", color: "#ffffff", boxShadow: "0 6px 16px -4px rgba(46,58,32,0.4)" }}
              data-testid="button-save-checkin-bottom"
            >
              {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Save check-in <ChevronRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
