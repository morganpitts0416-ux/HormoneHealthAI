import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles, FlaskConical, Stethoscope, Package, MessageSquare, Settings } from "lucide-react";

const TOUR_STORAGE_KEY = "cliniq_tour_completed";
const TOUR_DISMISSED_KEY = "cliniq_tour_dismissed";

interface TourStep {
  id: string;
  title: string;
  description: string | React.ReactNode;
  targetSelector?: string;
  route?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  spotlightPadding?: number;
  scrollTo?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const TOUR_STEPS: TourStep[] = [
  // ── 1. Welcome ───────────────────────────────────────────────────────────────
  {
    id: "welcome",
    title: "Welcome to ClinIQ",
    description: "This 2-minute tour walks you through every major feature — from AI lab interpretation to SOAP note generation, patient portal publishing, and your clinical settings. You can exit anytime and restart from the Help menu.",
    placement: "center",
    icon: Sparkles,
    badge: "Get Started",
  },

  // ── 2. Dashboard ─────────────────────────────────────────────────────────────
  {
    id: "dashboard",
    title: "Your Clinical Dashboard",
    description: "Your home base shows unread patient messages, pending supplement orders, your patient roster, and quick-access links to every workflow. Supplement order notifications update in real time.",
    targetSelector: "[data-testid='notifications-panel']",
    route: "/dashboard",
    placement: "bottom",
    scrollTo: true,
    icon: Sparkles,
    badge: "Dashboard",
  },

  // ── 3. Patient Profiles ───────────────────────────────────────────────────────
  {
    id: "patients",
    title: "Patient Profiles & Lab History",
    description: "Every patient has a persistent profile with searchable lab history, trend charts across 21 markers, and AI-generated trend insights for both you and your patient. Click 'All Patients' to browse or add a new profile.",
    targetSelector: "[data-testid='button-all-patients']",
    route: "/dashboard",
    placement: "top",
    scrollTo: true,
    icon: Sparkles,
    badge: "Patients",
  },

  // ── 4. Lab Interpretation ─────────────────────────────────────────────────────
  {
    id: "lab-interpretation",
    title: "Lab Interpretation",
    description: "Select Male or Female from the dashboard to open the interpretation form. Enter values manually or upload a PDF — ClinIQ auto-extracts every lab value using AI so there's no manual entry required.",
    targetSelector: "[data-testid='tabs-navigation']",
    route: "/male",
    placement: "bottom",
    scrollTo: true,
    icon: FlaskConical,
    badge: "Labs",
  },

  // ── 5. PDF Upload ─────────────────────────────────────────────────────────────
  {
    id: "lab-pdf-upload",
    title: "PDF Lab Upload — Auto-Extract Values",
    description: "Upload a Pathgroup or hospital lab PDF and ClinIQ extracts every value automatically. Values are pre-filled into the form instantly — saving you several minutes per patient visit.",
    targetSelector: "[data-testid='button-upload-pdf']",
    route: "/male",
    placement: "bottom",
    scrollTo: true,
    icon: FlaskConical,
    badge: "Labs",
  },

  // ── 6. Results, Red Flags & Risk ─────────────────────────────────────────────
  {
    id: "lab-results",
    title: "Results, Red Flags & Risk Scores",
    description: "The Results tab shows every marker color-coded (optimal / borderline / abnormal / critical), any triggered red flag alerts, PREVENT 2023 cardiovascular risk, and insulin resistance phenotyping. From here you can generate and export the full patient wellness report.",
    targetSelector: "[data-testid='button-patient-report']",
    route: "/male",
    placement: "left",
    scrollTo: true,
    icon: FlaskConical,
    badge: "Labs",
  },

  // ── 7. New Encounter ──────────────────────────────────────────────────────────
  {
    id: "encounters",
    title: "Encounter Documentation",
    description: "Click the 'New Encounter' button on the left to open a visit. Record live audio directly in the browser, or upload an existing recording. ClinIQ runs a 6-stage AI pipeline automatically: transcription → normalization & diarization → medication detection → clinical fact extraction → SOAP note → patient summary.",
    route: "/encounters",
    placement: "center",
    icon: Stethoscope,
    badge: "Encounters",
  },

  // ── 8. SOAP Note ─────────────────────────────────────────────────────────────
  {
    id: "soap-note",
    title: "AI SOAP Note — One Click",
    description: "Once your transcript is ready in the Transcript tab, click 'Auto-Generate All' to run the full pipeline at once, or use the individual pipeline buttons to step through each stage. The SOAP note is fully editable, chart-ready, and includes ICD-10 codes for every diagnosis.",
    route: "/encounters",
    placement: "center",
    icon: Stethoscope,
    badge: "Encounters",
  },

  // ── 9. Evidence Tab ───────────────────────────────────────────────────────────
  {
    id: "evidence-tab",
    title: "Evidence Tab — Guideline Citations",
    description: "The Evidence tab surfaces clinical guideline citations for every diagnosis in the SOAP note. Each entry includes a confidence level and the source guideline — so you can validate every clinical decision at a glance without leaving the chart.",
    route: "/encounters",
    placement: "center",
    icon: Stethoscope,
    badge: "Encounters",
  },

  // ── 10. Patient Summary + Publish ────────────────────────────────────────────
  {
    id: "patient-summary",
    title: "Patient Summary → Publish to Portal",
    description: "The Summary tab generates a plain-language, patient-facing version of the visit. Review and edit it, then click 'Publish to Patient Portal.' Your patient immediately sees the summary — along with their lab insights, supplement recommendations, and messaging — inside their secure portal.",
    route: "/encounters",
    placement: "center",
    icon: Stethoscope,
    badge: "Encounters",
  },

  // ── 11. Supplement Library ────────────────────────────────────────────────────
  {
    id: "supplement-library",
    title: "Your Custom Supplement Library",
    description: "Under Account → Supplement Library, build and manage your own catalog. Assign lab-value trigger rules (e.g., 'recommend when Vitamin D < 30') or symptom-based rules. ClinIQ recommends matching supplements automatically when you run a lab interpretation.",
    targetSelector: "[data-testid='button-prefs-section-supplements']",
    route: "/account",
    placement: "right",
    scrollTo: true,
    icon: Package,
    badge: "Settings",
  },

  // ── 12. Lab Range Preferences ─────────────────────────────────────────────────
  {
    id: "lab-ranges",
    title: "Preferred Optimized Lab Ranges",
    description: "Under Account → Lab Ranges, override the optimal or reference range for any of 60+ markers on a per-gender basis. Your targets appear on every interpretation page and fall back to system defaults for any marker you haven't customized.",
    targetSelector: "[data-testid='button-prefs-section-labranges']",
    route: "/account",
    placement: "right",
    scrollTo: true,
    icon: FlaskConical,
    badge: "Settings",
  },

  // ── 13. Communication Preferences ────────────────────────────────────────────
  {
    id: "messaging",
    title: "Patient Communication Preferences",
    description: (
      <span>
        Choose how patients can contact you under Account → Messaging Preferences:
        <br /><br />
        <strong style={{ color: "#c8d8b0" }}>In-App</strong> — built-in secure messaging inside ClinIQ.<br />
        <strong style={{ color: "#c8d8b0" }}>SMS Link</strong> — sends patients a text link to open a conversation.<br />
        <strong style={{ color: "#c8d8b0" }}>External Platform</strong> — two-way API bridge for platforms like Spruce or Klara.
        <br /><br />
        <span style={{ color: "#8fa870" }}>Note: Spruce, Klara, and other platform integrations are <em>coming soon</em>. In-App and SMS Link are available today.</span>
      </span>
    ),
    targetSelector: "[data-testid='messaging-option-none']",
    route: "/account",
    placement: "top",
    scrollTo: true,
    icon: MessageSquare,
    badge: "Settings",
  },

  // ── 14. Done ─────────────────────────────────────────────────────────────────
  {
    id: "done",
    title: "You're All Set",
    description: "That's the full ClinIQ platform. Start by adding your first patient and running a lab evaluation — or open a new encounter and record your first visit note. You can restart this tour anytime from the Help Center.",
    placement: "center",
    icon: Sparkles,
    badge: "Done",
  },
];

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  startTour: () => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  step: TourStep;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

function getSpotlightRect(selector?: string): DOMRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

interface SpotlightStyle {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  transform?: string;
}

function computeTooltipPosition(
  rect: SpotlightStyle | null,
  placement: TourStep["placement"],
  tooltipW: number,
  tooltipH: number
): TooltipPosition {
  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect || placement === "center") {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  let top: number;
  let left: number;

  if (placement === "bottom") {
    top = rect.top + rect.height + pad;
    left = rect.left + rect.width / 2 - tooltipW / 2;
  } else if (placement === "top") {
    top = rect.top - tooltipH - pad;
    left = rect.left + rect.width / 2 - tooltipW / 2;
  } else if (placement === "right") {
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.left + rect.width + pad;
  } else {
    // left
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.left - tooltipW - pad;
  }

  // Clamp to viewport
  left = Math.max(pad, Math.min(left, vw - tooltipW - pad));
  top = Math.max(pad, Math.min(top, vh - tooltipH - pad));

  return { top, left };
}

function TourOverlay({ ctx }: { ctx: TourContextValue }) {
  const { isActive, currentStep, totalSteps, step, nextStep, prevStep, endTour } = ctx;
  const [spotlight, setSpotlight] = useState<SpotlightStyle | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });

  const updatePositions = useCallback(() => {
    if (!step.targetSelector) {
      setSpotlight(null);
      setTooltipPos({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
      return;
    }
    const rect = getSpotlightRect(step.targetSelector);
    if (!rect) {
      setSpotlight(null);
      setTooltipPos({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
      return;
    }
    const pad = step.spotlightPadding ?? 8;
    const sl: SpotlightStyle = {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
    setSpotlight(sl);

    const tw = tooltipRef.current?.offsetWidth ?? 380;
    const th = tooltipRef.current?.offsetHeight ?? 240;
    setTooltipPos(computeTooltipPosition(sl, step.placement, tw, th));
  }, [step]);

  useEffect(() => {
    if (!isActive) return;

    if (step.scrollTo && step.targetSelector) {
      const el = document.querySelector(step.targetSelector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(updatePositions, 380);
        return () => clearTimeout(t);
      }
    }

    const t = setTimeout(updatePositions, 150);
    return () => clearTimeout(t);
  }, [isActive, step, updatePositions]);

  useEffect(() => {
    window.addEventListener("resize", updatePositions);
    return () => window.removeEventListener("resize", updatePositions);
  }, [updatePositions]);

  if (!isActive) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const StepIcon = step.icon ?? Sparkles;
  const progressPct = Math.round(((currentStep + 1) / totalSteps) * 100);

  return (
    <div
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: "none" }}
    >
      {/* Overlay mask with spotlight cutout */}
      <svg
        className="absolute inset-0"
        width="100%"
        height="100%"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => {
          if (spotlight) {
            const { clientX: x, clientY: y } = e;
            const { top, left, width, height } = spotlight;
            if (x >= left && x <= left + width && y >= top && y <= top + height) return;
          }
        }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx={8}
                ry={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.58)"
          mask="url(#tour-mask)"
        />
        {/* Spotlight border glow */}
        {spotlight && (
          <rect
            x={spotlight.left}
            y={spotlight.top}
            width={spotlight.width}
            height={spotlight.height}
            rx={8}
            ry={8}
            fill="none"
            stroke="#8fa870"
            strokeWidth={2}
            strokeOpacity={0.9}
          />
        )}
      </svg>

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          pointerEvents: "auto",
          width: 390,
          maxWidth: "calc(100vw - 32px)",
          ...tooltipPos,
        }}
      >
        <div
          className="rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: "#1c2414", border: "1px solid #3d5228" }}
        >
          {/* Progress bar */}
          <div style={{ height: 3, backgroundColor: "#2e3a20" }}>
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                backgroundColor: "#8fa870",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#5a7040" }}
              >
                <StepIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                {step.badge && (
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "#8fa870" }}>
                    {step.badge}
                  </div>
                )}
                <h3 className="text-sm font-semibold leading-snug" style={{ color: "#e8ddd0" }}>
                  {step.title}
                </h3>
              </div>
            </div>
            <button
              onClick={endTour}
              className="ml-3 flex-shrink-0 rounded-md p-1 transition-colors"
              style={{ color: "#7a8a64" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e8ddd0")}
              onMouseLeave={e => (e.currentTarget.style.color = "#7a8a64")}
              data-testid="tour-close"
              title="Exit tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 pb-3">
            <div className="text-sm leading-relaxed" style={{ color: "#aab898" }}>
              {step.description}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: "1px solid #2e3a20" }}
          >
            {/* Step counter */}
            <div className="text-xs" style={{ color: "#5a7040" }}>
              Step {currentStep + 1} of {totalSteps}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: "#7a8a64", backgroundColor: "#2e3a20" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#3d5228")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#2e3a20")}
                  data-testid="tour-prev"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              )}
              <button
                onClick={isLast ? endTour : nextStep}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors"
                style={{ backgroundColor: "#5a7040", color: "#ffffff" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#6b854f")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#5a7040")}
                data-testid="tour-next"
              >
                {isLast ? "Get Started" : "Next"}
                {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Arrow pointer */}
        {spotlight && step.placement && step.placement !== "center" && (
          <ArrowPointer placement={step.placement} spotlight={spotlight} tooltipPos={tooltipPos} />
        )}
      </div>
    </div>
  );
}

function ArrowPointer({
  placement,
  spotlight,
  tooltipPos,
}: {
  placement: TourStep["placement"];
  spotlight: SpotlightStyle;
  tooltipPos: TooltipPosition;
}) {
  if (typeof tooltipPos.top === "string" || typeof tooltipPos.left === "string") return null;

  const tooltipLeft = tooltipPos.left as number;
  const tooltipTop = tooltipPos.top as number;
  const tooltipWidth = 390;

  const arrowSize = 10;

  if (placement === "bottom") {
    const spotlightCenterX = spotlight.left + spotlight.width / 2;
    const arrowLeft = spotlightCenterX - tooltipLeft - arrowSize;
    const clampedLeft = Math.max(16, Math.min(arrowLeft, tooltipWidth - 32));
    return (
      <div
        style={{
          position: "absolute",
          top: -arrowSize,
          left: clampedLeft,
          width: 0,
          height: 0,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid #1c2414`,
        }}
      />
    );
  }

  if (placement === "top") {
    const spotlightCenterX = spotlight.left + spotlight.width / 2;
    const arrowLeft = spotlightCenterX - tooltipLeft - arrowSize;
    const clampedLeft = Math.max(16, Math.min(arrowLeft, tooltipWidth - 32));
    return (
      <div
        style={{
          position: "absolute",
          bottom: -arrowSize,
          left: clampedLeft,
          width: 0,
          height: 0,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderTop: `${arrowSize}px solid #1c2414`,
        }}
      />
    );
  }

  if (placement === "right") {
    const spotlightCenterY = spotlight.top + spotlight.height / 2;
    const arrowTop = spotlightCenterY - tooltipTop - arrowSize;
    const clampedTop = Math.max(16, Math.min(arrowTop, 200));
    return (
      <div
        style={{
          position: "absolute",
          top: clampedTop,
          left: -arrowSize,
          width: 0,
          height: 0,
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid #1c2414`,
        }}
      />
    );
  }

  if (placement === "left") {
    const spotlightCenterY = spotlight.top + spotlight.height / 2;
    const arrowTop = spotlightCenterY - tooltipTop - arrowSize;
    const clampedTop = Math.max(16, Math.min(arrowTop, 200));
    return (
      <div
        style={{
          position: "absolute",
          top: clampedTop,
          right: -arrowSize,
          width: 0,
          height: 0,
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderLeft: `${arrowSize}px solid #1c2414`,
        }}
      />
    );
  }

  return null;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [, setLocation] = useLocation();

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
    localStorage.removeItem(TOUR_DISMISSED_KEY);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
  }, []);

  const goToStep = useCallback((idx: number) => {
    const step = TOUR_STEPS[idx];
    if (step?.route) setLocation(step.route);
    setCurrentStep(idx);
  }, [setLocation]);

  const nextStep = useCallback(() => {
    const next = currentStep + 1;
    if (next < TOUR_STEPS.length) {
      goToStep(next);
    } else {
      endTour();
    }
  }, [currentStep, goToStep, endTour]);

  const prevStep = useCallback(() => {
    const prev = currentStep - 1;
    if (prev >= 0) goToStep(prev);
  }, [currentStep, goToStep]);

  const ctx: TourContextValue = {
    isActive,
    currentStep,
    totalSteps: TOUR_STEPS.length,
    startTour,
    endTour,
    nextStep,
    prevStep,
    step: TOUR_STEPS[currentStep],
  };

  return (
    <TourContext.Provider value={ctx}>
      {children}
      <TourOverlay ctx={ctx} />
    </TourContext.Provider>
  );
}

export function TourLauncher() {
  const { startTour } = useTour();
  return (
    <button
      onClick={startTour}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
      style={{ color: "#5a7040", backgroundColor: "transparent" }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#e8ddd0")}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
      data-testid="button-start-tour"
      title="Take a guided tour"
    >
      <Sparkles className="w-3.5 h-3.5" />
      <span>Tour</span>
    </button>
  );
}

export function useFirstVisitTour() {
  const { startTour } = useTour();
  useEffect(() => {
    const done = localStorage.getItem(TOUR_STORAGE_KEY);
    const dismissed = localStorage.getItem(TOUR_DISMISSED_KEY);
    if (!done && !dismissed) {
      const t = setTimeout(() => {
        startTour();
        localStorage.setItem(TOUR_DISMISSED_KEY, "1");
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [startTour]);
}
