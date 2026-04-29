import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, ArrowRight, Apple, Moon, Activity, Smile, Heart, Pill, Droplets,
  CheckCircle2, Loader2, Plus, Trash2, Sparkles, Sun, ChevronDown, X,
} from "lucide-react";
import { ActiveVitalsMonitoringCard } from "@/components/portal/active-vitals-monitoring-card";
import { LabeledChipScale, SCALES, type ScaleId } from "@/components/portal/labeled-chip-scale";

/* ------------------------------- types ------------------------------- */

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
  cycleData?: {
    bleeding?: "none" | "spotting" | "light" | "medium" | "heavy"; // legacy
    status?: "none" | "started_today" | "on_period" | "breakthrough";
    flow?: "spotting" | "light" | "medium" | "heavy" | "flooding";
    cramps?: number;
    symptoms?: string[];
  } | null;
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
  patientReported: Array<{
    id: string; rowId: number; name: string; dose?: string | null;
    frequency?: string | null; type: string; source: string; reviewedByProvider: boolean;
  }>;
};

type AdherenceLog = {
  id: number;
  date: string;
  medicationName: string;
  status: string;
};

type ActiveVitalsResponse = {
  episode: { id: number; vitalTypes: string[]; status: string } | null;
};

/* ------------------------------- helpers ------------------------------- */

function todayStr() { return new Date().toISOString().slice(0, 10); }

const PALETTE = {
  bg: "#f9f6f0",
  card: "#ffffff",
  cardBorder: "#ede8df",
  ink: "#1c2414",
  inkSoft: "#5a6048",
  inkMuted: "#7a8a64",
  brand: "#2e3a20",
  brandSoft: "#edf4e4",
  brandSoftBorder: "#c8dbb8",
  divider: "#f0ebe2",
  warmAccent: "#8b5a10",
  warmAccentSoft: "#fdf6e8",
  warmAccentBorder: "#f0d8a4",
  rose: "#a0405c",
} as const;

/* small atoms ------------------------------------------------------------ */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium" style={{ color: PALETTE.ink }}>{label}</Label>
        {hint && <p className="text-xs" style={{ color: PALETTE.inkMuted }}>{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function SoftToggle({ label, hint, value, onChange, testId }: {
  label: string;
  hint?: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3"
      style={{ backgroundColor: PALETTE.card, borderColor: PALETTE.cardBorder }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: PALETTE.ink }}>{label}</p>
        {hint && <p className="text-xs mt-0.5" style={{ color: PALETTE.inkMuted }}>{hint}</p>}
      </div>
      <Switch checked={!!value} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

function Disclosure({
  summary, defaultOpen, children, testId,
}: { summary: string; defaultOpen?: boolean; children: React.ReactNode; testId: string }) {
  const [open, setOpen] = useState(!!defaultOpen);
  // Sync when defaultOpen flips from false→true after async settings hydrate
  // (e.g. Power Mode arrives after first render). Only opens; never auto-closes.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  return (
    <div className="rounded-xl border" style={{ backgroundColor: PALETTE.card, borderColor: PALETTE.cardBorder }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover-elevate rounded-xl"
        data-testid={testId}
      >
        <span className="text-sm font-medium" style={{ color: PALETTE.ink }}>{summary}</span>
        <ChevronDown
          className="w-4 h-4 transition-transform"
          style={{ color: PALETTE.inkMuted, transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

function StepHeading({ icon: Icon, eyebrow, title, subtitle }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-3">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: PALETTE.brandSoft }}
      >
        <Icon className="w-6 h-6" style={{ color: PALETTE.brand }} />
      </div>
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.inkMuted }}>
          {eyebrow}
        </p>
      )}
      <div>
        <h2 className="text-2xl font-semibold leading-tight" style={{ color: PALETTE.ink }}>{title}</h2>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: PALETTE.inkSoft }}>{subtitle}</p>
      </div>
    </div>
  );
}

/* -------------------- main component -------------------- */

type StepId =
  | "welcome"
  | "feeling"
  | "body"
  | "sleep"
  | "fuel"
  | "movement"
  | "meds"
  | "vitals"
  | "reflection"
  | "done";

export default function PortalCheckIn() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date] = useState(todayStr());
  const [draft, setDraft] = useState<CheckIn>({ date });
  const [stepIndex, setStepIndex] = useState(0);
  const [showAddMed, setShowAddMed] = useState(false);

  // ---- queries ----
  const { data: me, isLoading: meLoading, error: meError } = useQuery<{ id: number; firstName: string; gender?: string }>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  useEffect(() => { if (meError) setLocation("/portal/login"); }, [meError, setLocation]);

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
  const { data: activeVitals } = useQuery<ActiveVitalsResponse>({
    queryKey: ["/api/portal/vitals-monitoring/active"],
    enabled: !!me,
  });

  useEffect(() => {
    if (today && today.date) setDraft({ ...today, date: today.date });
  }, [today]);

  const showCycle = useMemo(() => {
    const gender = (me as any)?.gender?.toLowerCase?.() ?? "";
    const isFemale = gender === "female" || gender === "f";
    return isFemale && settings?.stillHasCycle !== false;
  }, [me, settings]);
  const hasActiveVitals = !!activeVitals?.episode && activeVitals.episode.status === "active";

  // ---- step list (built dynamically) ----
  const steps = useMemo<StepId[]>(() => {
    const s: StepId[] = ["welcome", "feeling", "body", "sleep", "fuel", "movement", "meds"];
    if (hasActiveVitals) s.push("vitals");
    s.push("reflection", "done");
    return s;
  }, [hasActiveVitals]);

  const totalDataSteps = steps.filter((s) => s !== "welcome" && s !== "done").length;
  const currentDataStepIndex = useMemo(() => {
    let count = 0;
    for (let i = 0; i <= stepIndex && i < steps.length; i++) {
      const id = steps[i];
      if (id !== "welcome" && id !== "done") count++;
    }
    return count;
  }, [steps, stepIndex]);
  const currentStep = steps[stepIndex] ?? "welcome";
  const isLastDataStep = stepIndex === steps.length - 2; // last one before "done"
  const isCompletion = currentStep === "done";

  // ---- mutations ----
  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/tracking/checkins", { ...draft, date }),
    onSuccess: () => {
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

  // ---- guards ----
  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PALETTE.bg }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: PALETTE.brand }} />
      </div>
    );
  }

  // Tracking is OFF — opt-in nudge (kept; just polished)
  if (settings && settings.trackingMode === "off") {
    return <OptInScreen onEnable={async () => {
      await apiRequest("POST", "/api/portal/tracking/settings", { trackingMode: "standard", enabled: true, setupCompleted: true });
      qc.invalidateQueries({ queryKey: ["/api/portal/tracking/settings"] });
    }} />;
  }

  /* ------------------ navigation handlers ------------------ */
  const goBack = () => {
    if (stepIndex === 0) {
      setLocation("/portal/dashboard");
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goNext = () => {
    if (isLastDataStep) {
      // Save then advance to completion
      saveMutation.mutate(undefined, {
        onSuccess: () => {
          setStepIndex((i) => i + 1);
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        },
      });
      return;
    }
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const saveAndExit = () => {
    saveMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Saved for now", description: "We kept what you've added so far." });
        setLocation("/portal/dashboard");
      },
    });
  };

  /* ------------------ render ------------------ */

  if (isCompletion) {
    return <CompletionScreen draft={draft} firstName={me?.firstName} />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: PALETTE.bg }}>
      {/* Sticky header with progress + save & exit */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: PALETTE.bg, borderColor: PALETTE.cardBorder }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <Link href="/portal/dashboard">
              <Button variant="ghost" size="sm" data-testid="link-back-dashboard">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Dashboard
              </Button>
            </Link>
            <div className="text-center min-w-0 flex-1">
              <p className="text-xs font-medium" style={{ color: PALETTE.inkMuted }}>
                {currentStep === "welcome"
                  ? "Today's check-in"
                  : `Step ${currentDataStepIndex} of ${totalDataSteps}`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={saveAndExit}
              disabled={saveMutation.isPending}
              data-testid="button-save-exit"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & exit"}
            </Button>
          </div>

          {currentStep !== "welcome" && (
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "#e8ddd0" }}
              role="progressbar"
              aria-valuenow={currentDataStepIndex}
              aria-valuemin={1}
              aria-valuemax={totalDataSteps}
              data-testid="progress-checkin"
            >
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${(currentDataStepIndex / totalDataSteps) * 100}%`,
                  backgroundColor: PALETTE.brand,
                }}
              />
            </div>
          )}
        </div>
      </header>

      {/* Step content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 pb-32">
        {currentStep === "welcome" && (
          <WelcomeStep firstName={me?.firstName} hasVitals={hasActiveVitals} totalSteps={totalDataSteps} />
        )}
        {currentStep === "feeling" && (
          <FeelingStep draft={draft} setDraft={setDraft} />
        )}
        {currentStep === "body" && (
          <BodyStep draft={draft} setDraft={setDraft} showCycle={showCycle} />
        )}
        {currentStep === "sleep" && (
          <SleepStep draft={draft} setDraft={setDraft} />
        )}
        {currentStep === "fuel" && (
          <FuelStep draft={draft} setDraft={setDraft} powerMode={settings?.trackingMode === "power"} />
        )}
        {currentStep === "movement" && (
          <MovementStep draft={draft} setDraft={setDraft} />
        )}
        {currentStep === "meds" && (
          <MedsStep
            meds={meds}
            adherenceToday={adherenceToday}
            adherenceMutation={adherenceMutation}
            onOpenAddMed={() => setShowAddMed(true)}
          />
        )}
        {currentStep === "vitals" && <VitalsStep />}
        {currentStep === "reflection" && (
          <ReflectionStep draft={draft} setDraft={setDraft} />
        )}
      </main>

      {/* Sticky footer with Back / Continue */}
      <div
        className="sticky bottom-0 z-30 border-t"
        style={{ backgroundColor: PALETTE.bg, borderColor: PALETTE.cardBorder }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={saveMutation.isPending}
            data-testid="button-step-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <Button
            size="lg"
            onClick={goNext}
            disabled={saveMutation.isPending}
            style={{ backgroundColor: PALETTE.brand, color: "#ffffff" }}
            data-testid="button-step-continue"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLastDataStep ? (
              <>Finish check-in <CheckCircle2 className="w-4 h-4 ml-1.5" /></>
            ) : currentStep === "welcome" ? (
              <>Let's begin <ArrowRight className="w-4 h-4 ml-1.5" /></>
            ) : (
              <>Continue <ArrowRight className="w-4 h-4 ml-1.5" /></>
            )}
          </Button>
        </div>
      </div>

      <AddMedDialog open={showAddMed} onOpenChange={setShowAddMed} />
    </div>
  );
}

/* ============================================================
                          STEPS
   ============================================================ */

function WelcomeStep({ firstName, hasVitals, totalSteps }: {
  firstName?: string; hasVitals: boolean; totalSteps: number;
}) {
  const greeting = firstName ? `Good to see you, ${firstName}.` : "Good to see you.";
  return (
    <div className="space-y-6" data-testid="step-welcome">
      <div className="space-y-3">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: PALETTE.brandSoft }}
        >
          <Sun className="w-7 h-7" style={{ color: PALETTE.brand }} />
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight" style={{ color: PALETTE.ink }}>
            {greeting}
          </h1>
          <p className="text-base mt-2 leading-relaxed" style={{ color: PALETTE.inkSoft }}>
            A quick check-in helps your care team see how you're really doing
            between visits — energy, sleep, fuel, and how things feel.
          </p>
        </div>
      </div>
      <div
        className="rounded-2xl border p-5 space-y-3"
        style={{ backgroundColor: PALETTE.card, borderColor: PALETTE.cardBorder }}
      >
        <p className="text-sm font-medium" style={{ color: PALETTE.ink }}>Today's flow</p>
        <ul className="space-y-2 text-sm" style={{ color: PALETTE.inkSoft }}>
          <li className="flex items-center gap-2.5"><Smile className="w-4 h-4" style={{ color: PALETTE.brand }} /> How you're feeling</li>
          <li className="flex items-center gap-2.5"><Heart className="w-4 h-4" style={{ color: PALETTE.brand }} /> Body &amp; symptoms</li>
          <li className="flex items-center gap-2.5"><Moon className="w-4 h-4" style={{ color: PALETTE.brand }} /> Sleep</li>
          <li className="flex items-center gap-2.5"><Apple className="w-4 h-4" style={{ color: PALETTE.brand }} /> Fuel & hydration</li>
          <li className="flex items-center gap-2.5"><Activity className="w-4 h-4" style={{ color: PALETTE.brand }} /> Movement</li>
          <li className="flex items-center gap-2.5"><Pill className="w-4 h-4" style={{ color: PALETTE.brand }} /> Today's medications & supplements</li>
          {hasVitals && (
            <li className="flex items-center gap-2.5"><Heart className="w-4 h-4" style={{ color: PALETTE.warmAccent }} /> Vitals — requested by your care team</li>
          )}
          <li className="flex items-center gap-2.5"><Sparkles className="w-4 h-4" style={{ color: PALETTE.brand }} /> A short reflection</li>
        </ul>
        <p className="text-xs pt-1" style={{ color: PALETTE.inkMuted }}>
          About 60 seconds across {totalSteps} short moments. You can save & exit any time.
        </p>
      </div>
    </div>
  );
}

function FeelingStep({ draft, setDraft }: { draft: CheckIn; setDraft: (d: CheckIn) => void }) {
  return (
    <div className="space-y-6" data-testid="step-feeling">
      <StepHeading
        icon={Smile}
        eyebrow="Moment 1"
        title="How are you feeling today?"
        subtitle="A quick check helps your care team see patterns over time. There are no wrong answers."
      />
      <div className="space-y-5">
        <Field label="Mood">
          <LabeledChipScale scale="mood" value={draft.moodScore} onChange={(n) => setDraft({ ...draft, moodScore: n })} testId="rating-mood" />
        </Field>
        <Field label="Energy">
          <LabeledChipScale scale="energy" value={draft.energyScore} onChange={(n) => setDraft({ ...draft, energyScore: n })} testId="rating-energy" />
        </Field>
        <Disclosure summary="Track a bit more (cravings, hunger, focus, anxiety)" testId="disclosure-feeling-more">
          <Field label="Cravings">
            <LabeledChipScale scale="cravings" value={draft.cravingsScore} onChange={(n) => setDraft({ ...draft, cravingsScore: n })} testId="rating-cravings" />
          </Field>
          <Field label="Hunger">
            <LabeledChipScale scale="hunger" value={draft.hungerScore} onChange={(n) => setDraft({ ...draft, hungerScore: n })} testId="rating-hunger" />
          </Field>
          <Field label="Focus / brain fog">
            <LabeledChipScale scale="brainFog" value={draft.brainFogScore} onChange={(n) => setDraft({ ...draft, brainFogScore: n })} testId="rating-brainfog" />
          </Field>
          <Field label="Anxiety / irritability">
            <LabeledChipScale scale="anxiety" value={draft.anxietyIrritabilityScore} onChange={(n) => setDraft({ ...draft, anxietyIrritabilityScore: n })} testId="rating-anxiety" />
          </Field>
        </Disclosure>
      </div>
    </div>
  );
}

/* ---- hormone-related body symptoms (checkbox grid) ---- */

const BODY_SYMPTOMS_FEMALE: { id: string; label: string }[] = [
  { id: "breast_tenderness", label: "Breast tenderness" },
  { id: "bloating", label: "Bloating" },
  { id: "vaginal_dryness", label: "Vaginal dryness or irritation" },
  { id: "hot_flashes", label: "Hot flashes" },
  { id: "headaches", label: "Headaches" },
  { id: "mood_swings", label: "Mood swings" },
  { id: "joint_aches", label: "Joint or muscle aches" },
  { id: "acne_skin", label: "Acne or skin changes" },
  { id: "water_retention", label: "Water retention / puffiness" },
  { id: "low_libido", label: "Low libido" },
  { id: "fatigue", label: "Unusual fatigue" },
];

const BODY_SYMPTOMS_GENERAL: { id: string; label: string }[] = [
  { id: "bloating", label: "Bloating" },
  { id: "hot_flashes", label: "Hot flashes" },
  { id: "headaches", label: "Headaches" },
  { id: "mood_swings", label: "Mood swings" },
  { id: "joint_aches", label: "Joint or muscle aches" },
  { id: "acne_skin", label: "Acne or skin changes" },
  { id: "water_retention", label: "Water retention / puffiness" },
  { id: "low_libido", label: "Low libido" },
  { id: "fatigue", label: "Unusual fatigue" },
];

function CheckboxChip({
  label, selected, onToggle, testId,
}: { label: string; selected: boolean; onToggle: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-full px-4 py-2 text-sm font-medium border hover-elevate active-elevate-2 transition-colors"
      style={{
        backgroundColor: selected ? PALETTE.brand : PALETTE.card,
        color: selected ? "#ffffff" : PALETTE.ink,
        borderColor: selected ? PALETTE.brand : "#d4c9b5",
      }}
      data-testid={testId}
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}

function BodyStep({ draft, setDraft, showCycle }: {
  draft: CheckIn; setDraft: (d: CheckIn) => void; showCycle: boolean;
}) {
  // Symptoms list — fuller for cycling-female patients, slimmer otherwise.
  const symptomList = showCycle ? BODY_SYMPTOMS_FEMALE : BODY_SYMPTOMS_GENERAL;
  const selectedSymptoms = draft.cycleData?.symptoms ?? [];
  const toggleSymptom = (id: string) => {
    const next = selectedSymptoms.includes(id)
      ? selectedSymptoms.filter((s) => s !== id)
      : [...selectedSymptoms, id];
    setDraft({ ...draft, cycleData: { ...(draft.cycleData ?? {}), symptoms: next } });
  };

  // Menstrual tracker — derive status with back-compat from legacy `bleeding` field.
  type CycleStatus = "none" | "started_today" | "on_period" | "breakthrough";
  const legacyBleeding = draft.cycleData?.bleeding;
  const derivedStatus: CycleStatus =
    draft.cycleData?.status ??
    (legacyBleeding && legacyBleeding !== "none" ? "on_period" : "none");
  const isBleeding = derivedStatus !== "none";

  const setCycleStatus = (status: CycleStatus) => {
    const next = { ...(draft.cycleData ?? {}), status };
    if (status === "none") {
      // Clear the related fields so we don't carry stale flow/cramps for a non-bleeding day.
      delete (next as any).flow;
      delete (next as any).cramps;
      next.bleeding = "none";
    } else {
      // Keep `bleeding` (legacy) in sync with `flow` for older clinician views.
      next.bleeding = (next.flow as any) ?? "light";
    }
    setDraft({
      ...draft,
      cycleData: next,
      // Synchronize the inbox-notification flag strictly with the current status.
      // Setting this true ONLY for "breakthrough" — and explicitly false for every
      // other status — prevents a stale `true` from a prior breakthrough click
      // generating false urgent care-team alerts after the patient corrects to
      // "On my period" or "No bleeding today".
      unexpectedBleeding: status === "breakthrough",
    });
  };

  const setFlow = (flow: "spotting" | "light" | "medium" | "heavy" | "flooding") => {
    setDraft({
      ...draft,
      cycleData: {
        ...(draft.cycleData ?? {}),
        flow,
        // mirror legacy column where possible
        bleeding: (flow === "flooding" ? "heavy" : flow) as any,
      },
    });
  };

  const STATUS_OPTIONS: { id: CycleStatus; label: string; testId: string }[] = [
    { id: "none",           label: "No bleeding today",                   testId: "cycle-status-none" },
    { id: "started_today",  label: "Started my period today",             testId: "cycle-status-started" },
    { id: "on_period",      label: "On my period",                        testId: "cycle-status-on" },
    { id: "breakthrough",   label: "Breakthrough / unexpected bleeding",  testId: "cycle-status-breakthrough" },
  ];

  const FLOW_OPTIONS: { id: "spotting" | "light" | "medium" | "heavy" | "flooding"; label: string }[] = [
    { id: "spotting", label: "Spotting" },
    { id: "light",    label: "Light" },
    { id: "medium",   label: "Medium" },
    { id: "heavy",    label: "Heavy" },
    { id: "flooding", label: "Flooding" },
  ];

  return (
    <div className="space-y-6" data-testid="step-body">
      <StepHeading
        icon={Heart}
        eyebrow="Moment 2"
        title="How's your body today?"
        subtitle="Tap anything you're noticing. The more your team sees, the better they can tailor your care."
      />
      <div className="space-y-5">
        <Field
          label="Symptoms you're noticing today"
          hint="Tap all that apply. Skip if nothing stands out."
        >
          <div className="flex flex-wrap gap-2" role="group" data-testid="symptom-chip-grid">
            {symptomList.map((s) => (
              <CheckboxChip
                key={s.id}
                label={s.label}
                selected={selectedSymptoms.includes(s.id)}
                onToggle={() => toggleSymptom(s.id)}
                testId={`symptom-${s.id}`}
              />
            ))}
          </div>
        </Field>

        {showCycle && (
          <Field
            label="Menstrual cycle"
            hint="Tracking this helps your team connect symptoms to your cycle."
          >
            <div className="flex flex-wrap gap-2" role="radiogroup" data-testid="cycle-status-group">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={derivedStatus === s.id}
                  onClick={() => setCycleStatus(s.id)}
                  className="rounded-full px-4 py-2 text-sm font-medium border hover-elevate active-elevate-2 transition-colors"
                  style={{
                    backgroundColor: derivedStatus === s.id
                      ? (s.id === "breakthrough" ? PALETTE.rose : PALETTE.brand)
                      : PALETTE.card,
                    color: derivedStatus === s.id ? "#ffffff" : PALETTE.ink,
                    borderColor: derivedStatus === s.id
                      ? (s.id === "breakthrough" ? PALETTE.rose : PALETTE.brand)
                      : "#d4c9b5",
                  }}
                  data-testid={s.testId}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {isBleeding && (
              <div
                className="mt-3 rounded-2xl border p-4 space-y-4"
                style={{
                  backgroundColor: "#fdf3f5",
                  borderColor: "#f0d4dc",
                }}
                data-testid="cycle-detail-panel"
              >
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: PALETTE.ink }}>
                    Flow today
                  </Label>
                  <div className="flex flex-wrap gap-2" role="radiogroup" data-testid="cycle-flow-group">
                    {FLOW_OPTIONS.map((f) => {
                      const selected = (draft.cycleData?.flow ?? null) === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setFlow(f.id)}
                          className="rounded-full px-4 py-2 text-sm font-medium border hover-elevate active-elevate-2 transition-colors"
                          style={{
                            backgroundColor: selected ? PALETTE.rose : "#ffffff",
                            color: selected ? "#ffffff" : PALETTE.ink,
                            borderColor: selected ? PALETTE.rose : "#e8c8d0",
                          }}
                          data-testid={`cycle-flow-${f.id}`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: PALETTE.ink }}>
                    Cramps
                  </Label>
                  <LabeledChipScale
                    scale="cramps"
                    value={draft.cycleData?.cramps ?? null}
                    onChange={(n) => setDraft({
                      ...draft,
                      cycleData: { ...(draft.cycleData ?? {}), cramps: n ?? undefined },
                    })}
                    testId="rating-cramps"
                  />
                </div>

                {derivedStatus === "breakthrough" && (
                  <p className="text-xs" style={{ color: PALETTE.rose }} data-testid="text-breakthrough-notice">
                    Your care team will be notified about today's unexpected bleeding.
                  </p>
                )}
              </div>
            )}
          </Field>
        )}

        <Disclosure summary="Log today's weight (optional)" testId="disclosure-weight">
          <Field label="Weight (lbs)">
            <Input
              type="number" step="0.1" inputMode="decimal"
              placeholder="lbs"
              value={draft.weight ?? ""}
              onChange={(e) => setDraft({ ...draft, weight: e.target.value || null })}
              className="max-w-32"
              data-testid="input-weight"
            />
          </Field>
        </Disclosure>
      </div>
    </div>
  );
}

function SleepStep({ draft, setDraft }: { draft: CheckIn; setDraft: (d: CheckIn) => void }) {
  return (
    <div className="space-y-6" data-testid="step-sleep">
      <StepHeading
        icon={Moon}
        eyebrow="Moment 3"
        title="How did you sleep?"
        subtitle="Sleep shapes energy, mood, and cravings the next day. A quick snapshot of last night is enough."
      />
      <div className="space-y-5">
        <Field label="Sleep quality" hint="How restorative did last night feel?">
          <LabeledChipScale scale="sleepQuality" value={draft.sleepQuality} onChange={(n) => setDraft({ ...draft, sleepQuality: n })} testId="rating-sleep-quality" />
        </Field>
        <Field label="Hours slept" hint="A rough estimate is fine.">
          <Input
            type="number" step="0.25" inputMode="decimal"
            placeholder="7.5"
            value={draft.sleepHours ?? ""}
            onChange={(e) => setDraft({ ...draft, sleepHours: e.target.value || null })}
            className="max-w-32"
            data-testid="input-sleep-hours"
          />
        </Field>
        <SoftToggle
          label="Night sweats"
          hint="Tap if you woke up sweaty or warm last night."
          value={draft.nightSweats}
          onChange={(v) => setDraft({ ...draft, nightSweats: v })}
          testId="toggle-night-sweats"
        />
        <SoftToggle
          label="Woke during the night"
          value={draft.wokeDuringNight}
          onChange={(v) => setDraft({ ...draft, wokeDuringNight: v })}
          testId="toggle-woke"
        />
      </div>
    </div>
  );
}

function FuelStep({ draft, setDraft, powerMode }: {
  draft: CheckIn; setDraft: (d: CheckIn) => void; powerMode: boolean;
}) {
  return (
    <div className="space-y-6" data-testid="step-fuel">
      <StepHeading
        icon={Apple}
        eyebrow="Moment 3"
        title="Fuel & hydration"
        subtitle="What you eat and drink can affect energy, cravings, sleep, and progress. Big picture is enough — no calorie counting needed."
      />
      <div className="space-y-5">
        <Field label="Protein at meals" hint="Most patients do best with a protein source at each meal.">
          <LabeledChipScale scale="protein" value={draft.foodProteinLevel} onChange={(n) => setDraft({ ...draft, foodProteinLevel: n })} testId="rating-protein" />
        </Field>
        <Field label="Water">
          <LabeledChipScale scale="water" value={draft.waterLevel} onChange={(n) => setDraft({ ...draft, waterLevel: n })} testId="rating-water" />
        </Field>
        <Field label="Fiber & vegetables">
          <LabeledChipScale scale="fiber" value={draft.fiberVeggieLevel} onChange={(n) => setDraft({ ...draft, fiberVeggieLevel: n })} testId="rating-fiber" />
        </Field>
        <Disclosure
          summary={powerMode ? "Processed food, alcohol & notes" : "Add more detail (processed food, alcohol, notes)"}
          defaultOpen={powerMode}
          testId="disclosure-fuel-more"
        >
          <Field label="Processed / packaged food">
            <LabeledChipScale scale="processed" value={draft.processedFoodLevel} onChange={(n) => setDraft({ ...draft, processedFoodLevel: n })} testId="rating-processed" />
          </Field>
          <Field label="Alcohol today">
            <LabeledChipScale scale="alcohol" value={draft.alcoholUse} onChange={(n) => setDraft({ ...draft, alcoholUse: n })} testId="rating-alcohol" />
          </Field>
          <Field label="Notes" hint="Anything you'd like your team to know about food or drinks today?">
            <Textarea
              rows={3}
              placeholder="A note about today's meals (optional)"
              value={draft.foodNotes ?? ""}
              onChange={(e) => setDraft({ ...draft, foodNotes: e.target.value })}
              data-testid="input-food-notes"
            />
          </Field>
        </Disclosure>
      </div>
    </div>
  );
}

function MovementStep({ draft, setDraft }: { draft: CheckIn; setDraft: (d: CheckIn) => void }) {
  return (
    <div className="space-y-6" data-testid="step-movement">
      <StepHeading
        icon={Activity}
        eyebrow="Moment 4"
        title="Did you move today?"
        subtitle="Even a short walk counts. We're tracking the rhythm, not the workout."
      />
      <div className="space-y-5">
        <SoftToggle
          label="I moved my body today"
          hint="Walks, errands on foot, lifting, yoga, sports — anything intentional."
          value={draft.exerciseDone}
          onChange={(v) => setDraft({ ...draft, exerciseDone: v })}
          testId="toggle-exercise"
        />
        {draft.exerciseDone && (
          <div className="space-y-4 pl-1">
            <Field label="What kind?">
              <Input
                placeholder="walk, lifting, yoga..."
                value={draft.exerciseType ?? ""}
                onChange={(e) => setDraft({ ...draft, exerciseType: e.target.value })}
                data-testid="input-exercise-type"
              />
            </Field>
            <Field label="Roughly how long? (minutes)">
              <Input
                type="number" inputMode="numeric"
                placeholder="30"
                value={draft.exerciseMinutes ?? ""}
                onChange={(e) => setDraft({ ...draft, exerciseMinutes: e.target.value ? Number(e.target.value) : null })}
                className="max-w-28"
                data-testid="input-exercise-minutes"
              />
            </Field>
            <Field label="Intensity">
              <LabeledChipScale scale="intensity" value={draft.exerciseIntensity} onChange={(n) => setDraft({ ...draft, exerciseIntensity: n })} testId="rating-intensity" />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

function MedsStep({
  meds, adherenceToday, adherenceMutation, onOpenAddMed,
}: {
  meds: MedicationsResponse | undefined;
  adherenceToday: AdherenceLog[];
  adherenceMutation: any;
  onOpenAddMed: () => void;
}) {
  const adherenceMap = new Map<string, AdherenceLog>();
  for (const log of adherenceToday) adherenceMap.set(log.medicationName, log);

  const allMeds = [
    ...(meds?.chartMedications ?? []).map((m) => ({
      id: m.id, name: m.name, source: "patient_chart" as const,
      sourceLabel: "From chart", rowId: undefined as number | undefined,
    })),
    ...(meds?.patientReported ?? []).map((m) => ({
      id: m.id, name: m.name, dose: m.dose, frequency: m.frequency,
      source: "patient_reported" as const, sourceLabel: "Added by you", rowId: m.rowId,
    })),
  ];

  return (
    <div className="space-y-6" data-testid="step-meds">
      <StepHeading
        icon={Pill}
        eyebrow="Moment 5"
        title="Today's medications & supplements"
        subtitle="Consistency helps us understand what's working — and what may need adjusting."
      />
      <div className="space-y-3">
        {allMeds.length === 0 && (
          <div
            className="rounded-xl border p-5 text-center space-y-1"
            style={{ backgroundColor: PALETTE.card, borderColor: PALETTE.cardBorder }}
          >
            <p className="text-sm" style={{ color: PALETTE.inkSoft }}>
              No medications or supplements on file yet.
            </p>
            <p className="text-xs" style={{ color: PALETTE.inkMuted }}>
              You can add what you take below.
            </p>
          </div>
        )}
        {allMeds.map((m: any) => {
          const log = adherenceMap.get(m.name);
          const taken = log?.status === "taken";
          const skipped = log?.status === "skipped" || log?.status === "missed";
          return (
            <div
              key={m.id}
              className="rounded-xl border px-4 py-3.5 space-y-2.5"
              style={{
                backgroundColor: taken ? PALETTE.brandSoft : PALETTE.card,
                borderColor: taken ? PALETTE.brandSoftBorder : PALETTE.cardBorder,
              }}
              data-testid={`med-row-${m.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: PALETTE.ink }}>{m.name}</p>
                  {(m.dose || m.frequency) && (
                    <p className="text-xs mt-0.5" style={{ color: PALETTE.inkSoft }}>
                      {[m.dose, m.frequency].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <span
                  className="text-[10px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{
                    color: m.source === "patient_chart" ? PALETTE.brand : PALETTE.warmAccent,
                    backgroundColor: m.source === "patient_chart" ? PALETTE.brandSoft : PALETTE.warmAccentSoft,
                  }}
                >
                  {m.sourceLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={taken ? "default" : "outline"}
                  onClick={() => adherenceMutation.mutate({ medicationName: m.name, status: "taken", source: m.source })}
                  disabled={adherenceMutation.isPending}
                  className="flex-1"
                  style={taken ? { backgroundColor: PALETTE.brand, color: "#ffffff" } : undefined}
                  data-testid={`button-taken-${m.id}`}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Taken
                </Button>
                <Button
                  size="sm"
                  variant={skipped ? "default" : "outline"}
                  onClick={() => adherenceMutation.mutate({ medicationName: m.name, status: "skipped", source: m.source })}
                  disabled={adherenceMutation.isPending}
                  className="flex-1"
                  data-testid={`button-skipped-${m.id}`}
                >
                  Skipped
                </Button>
              </div>
            </div>
          );
        })}

        <Button
          variant="outline"
          onClick={onOpenAddMed}
          className="w-full"
          data-testid="button-open-add-med"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add something not listed
        </Button>
        <p className="text-[11px] text-center" style={{ color: PALETTE.inkMuted }}>
          Anything you add here is sent to your care team for review.
        </p>
      </div>
    </div>
  );
}

function VitalsStep() {
  return (
    <div className="space-y-6" data-testid="step-vitals">
      <StepHeading
        icon={Heart}
        eyebrow="Requested by your care team"
        title="Today's vitals"
        subtitle="Your provider has asked us to keep an eye on your readings. Take it sitting quietly for a moment, then log."
      />
      <ActiveVitalsMonitoringCard />
    </div>
  );
}

function ReflectionStep({ draft, setDraft }: {
  draft: CheckIn; setDraft: (d: CheckIn) => void;
}) {
  return (
    <div className="space-y-6" data-testid="step-reflection">
      <StepHeading
        icon={Sparkles}
        eyebrow="Last moment"
        title="Anything else?"
        subtitle="A few sentences your team should see — wins, worries, questions for your next visit."
      />
      <div className="space-y-5">
        <Field label="Notes for your care team" hint="Optional — even one sentence is helpful.">
          <Textarea
            rows={5}
            placeholder="What's on your mind today?"
            value={draft.otherSymptoms ?? ""}
            onChange={(e) => setDraft({ ...draft, otherSymptoms: e.target.value })}
            data-testid="input-other-symptoms"
          />
        </Field>
      </div>
      <p
        className="text-xs italic text-center pt-1"
        style={{ color: PALETTE.inkMuted }}
      >
        No perfection needed. Just a quick snapshot.
      </p>
    </div>
  );
}

/* ============================================================
                  Completion + Opt-in screens
   ============================================================ */

/* ----- Today's snapshot helpers ----- */

function labelFor(scale: ScaleId, value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const def = SCALES[scale];
  if (!def) return null;
  const min = def.min ?? 1;
  return def.labels[value - min] ?? null;
}

type SnapshotItem = { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string };

function buildSnapshot(draft: CheckIn): SnapshotItem[] {
  const items: SnapshotItem[] = [];
  const mood = labelFor("mood", draft.moodScore);
  if (mood) items.push({ icon: Smile, label: "Mood", value: mood });
  const energy = labelFor("energy", draft.energyScore);
  if (energy) items.push({ icon: Sparkles, label: "Energy", value: energy });
  const sleep = labelFor("sleepQuality", draft.sleepQuality);
  if (sleep) items.push({ icon: Moon, label: "Sleep", value: draft.sleepHours ? `${sleep} · ${draft.sleepHours}h` : sleep });
  const water = labelFor("water", draft.waterLevel);
  if (water) items.push({ icon: Droplets, label: "Water", value: water });
  const protein = labelFor("protein", draft.foodProteinLevel);
  if (protein) items.push({ icon: Apple, label: "Protein", value: protein });
  if (draft.exerciseDone) {
    const intensity = labelFor("intensity", draft.exerciseIntensity);
    items.push({
      icon: Activity,
      label: "Movement",
      value: [draft.exerciseType, draft.exerciseMinutes ? `${draft.exerciseMinutes}m` : null, intensity]
        .filter(Boolean)
        .join(" · ") || "Logged",
    });
  }
  return items;
}

function buildInsight(draft: CheckIn, firstName?: string): { headline: string; body: string } {
  const sleep = draft.sleepQuality ?? null;
  const mood = draft.moodScore ?? null;
  const energy = draft.energyScore ?? null;
  const protein = draft.foodProteinLevel ?? null;
  const water = draft.waterLevel ?? null;
  const moved = !!draft.exerciseDone;
  const symptoms = draft.cycleData?.symptoms ?? [];
  const breakthrough = draft.cycleData?.status === "breakthrough" || !!draft.unexpectedBleeding;
  void firstName; // reserved for future personalized copy

  if (breakthrough) {
    return {
      headline: "Flagged for your care team",
      body: `We've notified your team about today's unexpected bleeding so they can reach out if needed. Rest, hydrate, and log again tomorrow.`,
    };
  }
  if (sleep !== null && sleep <= 2) {
    return {
      headline: "Sleep was light last night",
      body: `Short sleep often shows up as cravings and lower energy by mid-afternoon. Try a glass of water now, protein at your next meal, and an earlier bedtime tonight — and see how tomorrow's check-in compares.`,
    };
  }
  if (mood !== null && mood <= 2 && energy !== null && energy <= 2) {
    return {
      headline: "Be gentle today",
      body: `Mood and energy both came in low. A short walk outside and a protein-forward meal are two tiny resets that tend to help — no pressure to do more.`,
    };
  }
  if (symptoms.length >= 3) {
    return {
      headline: `${symptoms.length} symptoms noted today`,
      body: `Patterns across days are what your team looks for, so today's detail is a real help. Tomorrow's check-in will start to reveal what's connected.`,
    };
  }
  if (protein !== null && protein <= 2) {
    return {
      headline: "Protein ran light today",
      body: `Adding a clear protein anchor (eggs, yogurt, fish, chicken, beans) at your next meal usually steadies energy and curbs cravings within a few hours.`,
    };
  }
  if (water !== null && water <= 2) {
    return {
      headline: "Hydration was on the lighter side",
      body: `A tall glass of water right now is the easiest next best step — it tends to lift energy more than people expect.`,
    };
  }
  if (moved && (energy ?? 3) >= 3) {
    return {
      headline: "Movement + steady energy",
      body: `That's a combo your team loves to see — keep this rhythm going and the trends in your chart will reflect it.`,
    };
  }
  if (mood !== null && mood >= 4 && energy !== null && energy >= 4) {
    return {
      headline: "Today's a strong day",
      body: `Mood and energy both came in high — note what's working (sleep, food, movement, meds) so you can lean on it again.`,
    };
  }
  return {
    headline: "Thanks for checking in",
    body: `Patterns over time are what your team uses to fine-tune your care. Today's snapshot is now part of that picture.`,
  };
}

function CompletionScreen({ draft, firstName }: { draft: CheckIn; firstName?: string }) {
  const insight = useMemo(() => buildInsight(draft, firstName), [draft, firstName]);
  const snapshot = useMemo(() => buildSnapshot(draft), [draft]);
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: PALETTE.bg }}>
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-12 space-y-7" data-testid="step-done">
        <div className="space-y-3 text-center">
          <div
            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
            style={{ backgroundColor: PALETTE.brand }}
          >
            <CheckCircle2 className="w-8 h-8" style={{ color: "#ffffff" }} />
          </div>
          <h1 className="text-3xl font-semibold leading-tight" style={{ color: PALETTE.ink }}>
            {firstName ? `Nicely done, ${firstName}.` : "Nicely done."}
          </h1>
          <p className="text-base leading-relaxed" style={{ color: PALETTE.inkSoft }}>
            Today's check-in is saved and on its way to your care team.
          </p>
        </div>

        {/* Today's snapshot */}
        {snapshot.length > 0 && (
          <div
            className="rounded-2xl border p-5 space-y-3"
            style={{ backgroundColor: PALETTE.card, borderColor: PALETTE.cardBorder }}
            data-testid="panel-snapshot"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.inkMuted }}>
              Today's snapshot
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {snapshot.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div
                    key={`${s.label}-${i}`}
                    className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 min-w-0"
                    style={{ backgroundColor: PALETTE.brandSoft, borderColor: PALETTE.brandSoftBorder }}
                    data-testid={`snapshot-${s.label.toLowerCase()}`}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "#ffffff" }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: PALETTE.brand }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.inkMuted }}>
                        {s.label}
                      </p>
                      <p className="text-sm font-medium truncate" style={{ color: PALETTE.ink }}>{s.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Today's insight */}
        <div
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: PALETTE.card, borderColor: PALETTE.cardBorder }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: PALETTE.brand }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.inkMuted }}>
              Today's insight
            </p>
          </div>
          <p className="text-base font-semibold leading-snug" style={{ color: PALETTE.ink }} data-testid="text-insight-headline">
            {insight.headline}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: PALETTE.inkSoft }} data-testid="text-todays-insight">
            {insight.body}
          </p>
          <p className="text-[11px] italic pt-1" style={{ color: PALETTE.inkMuted }}>
            Informational only — not medical advice. Your care team reviews these notes alongside your chart.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2.5">
          <Link href="/portal/messages" className="flex-1">
            <Button variant="outline" className="w-full" data-testid="button-message-team">
              Message my care team
            </Button>
          </Link>
          <Link href="/portal/dashboard" className="flex-1">
            <Button
              className="w-full"
              style={{ backgroundColor: PALETTE.brand, color: "#ffffff" }}
              data-testid="button-back-dashboard-done"
            >
              Back to dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>

        <p className="text-xs text-center pt-2" style={{ color: PALETTE.inkMuted }}>
          See you tomorrow — small daily snapshots become the trends that move your care forward.
        </p>
      </main>
    </div>
  );
}

function OptInScreen({ onEnable }: { onEnable: () => Promise<any> | void }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: PALETTE.bg }}>
      <header className="border-b" style={{ backgroundColor: PALETTE.bg, borderColor: PALETTE.cardBorder }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/portal/dashboard">
            <Button variant="ghost" size="sm" data-testid="link-back-dashboard">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="space-y-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: PALETTE.brandSoft }}
          >
            <Sun className="w-7 h-7" style={{ color: PALETTE.brand }} />
          </div>
          <h1 className="text-3xl font-semibold leading-tight" style={{ color: PALETTE.ink }}>
            Daily Check-In
          </h1>
          <p className="text-base leading-relaxed" style={{ color: PALETTE.inkSoft }}>
            Take 60 seconds a day to help your care team understand what's happening
            between visits — energy, sleep, fuel, mood, and the medications you're on.
          </p>
        </div>
        <div
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: PALETTE.card, borderColor: PALETTE.cardBorder }}
        >
          <p className="text-sm" style={{ color: PALETTE.inkSoft }}>
            This is completely optional. You can pause or stop at any time, and you only share what feels useful.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() => onEnable()}
              style={{ backgroundColor: PALETTE.brand, color: "#ffffff" }}
              data-testid="button-enable-tracking"
            >
              Start check-in
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

/* ============================================================
                       Add-Med Dialog
   ============================================================ */

function AddMedDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [why, setWhy] = useState("");
  const [type, setType] = useState<"medication" | "supplement">("supplement");

  const reset = () => { setName(""); setDose(""); setFrequency(""); setWhy(""); setType("supplement"); };

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/tracking/patient-reported-medication", {
      name: name.trim(),
      dose: dose.trim() || null,
      frequency: frequency.trim() || null,
      type,
      // backend may ignore `why` today, but harmless to send for future use
      reasonForUse: why.trim() || undefined,
    }),
    onSuccess: () => {
      toast({
        title: "Added",
        description: "We'll let your care team know so they can review it.",
      });
      qc.invalidateQueries({ queryKey: ["/api/portal/tracking/medications"] });
      reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Couldn't add", description: "Please try again.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!addMutation.isPending) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add something you take</DialogTitle>
          <DialogDescription>
            Tell us what you take and we'll share it with your care team for review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            {(["medication", "supplement"] as const).map((t) => {
              const selected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="rounded-full px-4 py-1.5 text-sm font-medium border hover-elevate capitalize"
                  style={{
                    backgroundColor: selected ? PALETTE.brand : PALETTE.card,
                    color: selected ? "#ffffff" : PALETTE.ink,
                    borderColor: selected ? PALETTE.brand : "#d4c9b5",
                  }}
                  data-testid={`button-add-type-${t}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <Field label="Name">
            <Input
              placeholder="e.g. Magnesium glycinate"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-new-med-name"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dose">
              <Input
                placeholder="e.g. 400 mg"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                data-testid="input-new-med-dose"
              />
            </Field>
            <Field label="Frequency">
              <Input
                placeholder="e.g. nightly"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                data-testid="input-new-med-freq"
              />
            </Field>
          </div>
          <Field label="Why are you taking it?" hint="Optional, but helpful context for your team.">
            <Textarea
              rows={2}
              placeholder="e.g. for sleep / cramps / energy"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              data-testid="input-new-med-why"
            />
          </Field>
        </div>
        <DialogFooter className="flex-row gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); reset(); }}
            disabled={addMutation.isPending}
            data-testid="button-cancel-add-med"
          >
            <X className="w-4 h-4 mr-1.5" /> Cancel
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!name.trim() || addMutation.isPending}
            style={{ backgroundColor: PALETTE.brand, color: "#ffffff" }}
            data-testid="button-add-med"
          >
            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
