import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

const TOUR_STORAGE_KEY = "cliniq_tour_completed";
const TOUR_DISMISSED_KEY = "cliniq_tour_dismissed";

interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  route?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  spotlightPadding?: number;
  scrollTo?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to ClinIQ",
    description: "This quick tour shows you how ClinIQ streamlines clinical decision-making — from lab interpretation to AI-generated SOAP notes. It takes about 2 minutes. You can exit anytime.",
    placement: "center",
  },
  {
    id: "dashboard-overview",
    title: "Your Clinical Dashboard",
    description: "This is your home base. At a glance you can see unread patient messages, pending supplement orders, your patient roster, and quick-access links to every major workflow.",
    targetSelector: "[data-testid='notifications-panel']",
    route: "/dashboard",
    placement: "bottom",
    scrollTo: true,
  },
  {
    id: "encounters",
    title: "AI Encounter Documentation",
    description: "Record or upload audio from any visit. ClinIQ transcribes it, normalizes medical terminology, diarizes by speaker, detects medications from your custom dictionary, extracts clinical facts, and generates a complete, chart-ready SOAP note — all in one click.",
    targetSelector: "[data-testid='card-encounters']",
    route: "/dashboard",
    placement: "bottom",
    scrollTo: true,
  },
  {
    id: "soap-pipeline",
    title: "6-Stage Clinical AI Pipeline",
    description: "When you click 'Generate SOAP', the server automatically: normalizes & diarizes the transcript, runs medication detection, extracts clinical facts, matches phenotype patterns, generates the SOAP note, and prepares an evidence overlay — no manual steps needed.",
    targetSelector: "[data-testid='card-encounters']",
    route: "/dashboard",
    placement: "bottom",
    spotlightPadding: 12,
  },
  {
    id: "lab-evaluation",
    title: "AI-Powered Lab Interpretation",
    description: "Enter or upload lab values for male or female patients. ClinIQ applies gender-specific reference ranges, calculates PREVENT 2023 cardiovascular risk, runs insulin resistance screening, and identifies critical red flag values automatically.",
    targetSelector: "[data-testid='quick-actions-grid']",
    route: "/dashboard",
    placement: "top",
    scrollTo: true,
  },
  {
    id: "red-flags",
    title: "Red Flag & Clinical Alerts",
    description: "When lab values cross clinical thresholds — erythrocytosis, critical testosterone levels, dangerous lipid markers, or other standing-order triggers — ClinIQ surfaces them prominently so nothing gets missed. PDF upload auto-extracts values from lab PDFs.",
    targetSelector: "[data-testid='card-male-eval']",
    route: "/dashboard",
    placement: "top",
    scrollTo: true,
  },
  {
    id: "patients",
    title: "Patient Profiles & Lab History",
    description: "Every patient has a persistent profile with searchable lab history, trend charts across 21 markers, and trend insights generated for both the clinician and patient-facing views.",
    targetSelector: "[data-testid='button-all-patients']",
    route: "/dashboard",
    placement: "top",
    scrollTo: true,
  },
  {
    id: "supplements",
    title: "Custom Supplement Catalog",
    description: "Build your own supplement catalog with lab-value trigger rules. ClinIQ recommends supplements based on detected lab patterns and phenotypes. Clinicians curate the list, then patients view and order directly through their portal.",
    targetSelector: "[data-testid='button-all-patients']",
    route: "/dashboard",
    placement: "top",
  },
  {
    id: "patient-portal",
    title: "Secure Patient Portal",
    description: "Each patient gets a branded wellness portal with their lab report, supplement protocol, and a HIPAA-compliant messaging system. Messaging supports in-app, SMS link, or two-way API integration with platforms like Spruce or Klara.",
    targetSelector: "[data-testid='button-all-patients']",
    route: "/dashboard",
    placement: "top",
  },
  {
    id: "hipaa",
    title: "HIPAA-Ready by Design",
    description: "ClinIQ includes audit logging, login lockout after 5 failed attempts, client-side session timeouts, strong password enforcement, a signed BAA, and all required HIPAA technical safeguards out of the box.",
    targetSelector: "[data-testid='button-account']",
    route: "/dashboard",
    placement: "bottom",
  },
  {
    id: "done",
    title: "You're All Set",
    description: "That's the full ClinIQ workflow. Start by adding your first patient, then run a lab evaluation or record an encounter. The Help Center is always one click away if you need it.",
    placement: "center",
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

    const tw = tooltipRef.current?.offsetWidth ?? 360;
    const th = tooltipRef.current?.offsetHeight ?? 220;
    setTooltipPos(computeTooltipPosition(sl, step.placement, tw, th));
  }, [step]);

  useEffect(() => {
    if (!isActive) return;

    if (step.scrollTo && step.targetSelector) {
      const el = document.querySelector(step.targetSelector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(updatePositions, 350);
        return () => clearTimeout(t);
      }
    }

    const t = setTimeout(updatePositions, 120);
    return () => clearTimeout(t);
  }, [isActive, step, updatePositions]);

  useEffect(() => {
    window.addEventListener("resize", updatePositions);
    return () => window.removeEventListener("resize", updatePositions);
  }, [updatePositions]);

  if (!isActive) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

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
          // Only close if clicking backdrop, not spotlight area
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
          fill="rgba(0,0,0,0.55)"
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
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          ...tooltipPos,
        }}
      >
        <div
          className="rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: "#1c2414", border: "1px solid #3d5228" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#5a7040" }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-semibold leading-snug" style={{ color: "#e8ddd0" }}>
                {step.title}
              </h3>
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
          <div className="px-5 pb-4">
            <p className="text-sm leading-relaxed" style={{ color: "#aab898" }}>
              {step.description}
            </p>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: "1px solid #2e3a20" }}
          >
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: i === currentStep ? 20 : 6,
                    height: 6,
                    backgroundColor: i === currentStep ? "#8fa870" : "#3d5228",
                  }}
                />
              ))}
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
                className="flex items-center gap-1 text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors"
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

        {/* Arrow pointer for non-center placements */}
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
  const tooltipWidth = 360;

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
    localStorage.setItem(TOUR_COMPLETED_KEY, "1");
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

const TOUR_COMPLETED_KEY = TOUR_STORAGE_KEY;

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
