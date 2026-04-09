import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, ArrowRight } from "lucide-react";
import { appUrl } from "@/lib/app-url";

interface LandingTourStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  spotlightPadding?: number;
  scrollTo?: boolean;
  badge?: string;
}

const LANDING_STEPS: LandingTourStep[] = [
  {
    id: "welcome",
    title: "See ClinIQ in 2 minutes",
    description: "This quick tour walks through the full platform — what clinicians see, what patients see, and why it saves hours every week. Click Next to begin.",
    placement: "center",
  },
  {
    id: "app-preview",
    title: "Lab Results at a Glance",
    description: "This is the main lab results view. Every marker is color-coded — green for optimal, yellow for borderline, red for abnormal, with critical red flag alerts surfaced immediately. ClinIQ interprets 60+ markers across hormonal, metabolic, cardiovascular, and thyroid panels.",
    targetSelector: "[data-tour='app-preview']",
    placement: "bottom",
    scrollTo: true,
    badge: "Lab Engine",
  },
  {
    id: "how-it-works",
    title: "Three Roles. One Platform.",
    description: "ClinIQ serves the clinician, the patient, and the practice simultaneously. Lab patterns for the clinician, clear explanations for the patient, and AI documentation tools for the practice — all connected in one workflow.",
    targetSelector: "[data-tour='how-it-works']",
    placement: "bottom",
    scrollTo: true,
    badge: "Platform Overview",
  },
  {
    id: "clinician-features",
    title: "What the Clinician Sees",
    description: "PREVENT 2023 cardiovascular risk, insulin resistance phenotyping, testosterone optimization flags, erythrocytosis alerts, FIB-4 scoring, perimenopause pattern recognition, and evidence-backed guideline flags — all running automatically from the lab values you enter.",
    targetSelector: "[data-tour='clinician-features']",
    placement: "bottom",
    scrollTo: true,
    badge: "Clinical Intelligence",
  },
  {
    id: "patient-portal",
    title: "A Patient Portal That Actually Gets Used",
    description: "Every patient gets a branded wellness portal: plain-English lab explanations, clinician-curated supplement protocols, diet and lifestyle recommendations, and a HIPAA-compliant messaging system. Integrates with Spruce, Klara, or any webhook-compatible platform.",
    targetSelector: "[data-tour='patient-portal']",
    placement: "top",
    scrollTo: true,
    badge: "Patient Portal",
  },
  {
    id: "pricing",
    title: "Everything Included. One Flat Price.",
    description: "Unlimited patients, all lab panels, AI SOAP note generation, encounter documentation, evidence overlays, patient portal, supplement catalog, trend charts, and all HIPAA controls — no per-patient fees, no feature tiers. First 50 clinicians lock in $97/mo forever with code FOUNDER50.",
    targetSelector: "[data-tour='pricing']",
    placement: "top",
    scrollTo: true,
    badge: "Pricing",
  },
  {
    id: "done",
    title: "Ready to Try It?",
    description: "Your 14-day free trial starts immediately — no charge for 14 days, cancel anytime. Built by a practicing Nurse Practitioner specifically for hormone and primary care clinics.",
    placement: "center",
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPos {
  top?: number | string;
  left?: number | string;
  transform?: string;
}

function getRect(selector?: string): DOMRect | null {
  if (!selector) return null;
  return document.querySelector(selector)?.getBoundingClientRect() ?? null;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(val, max));
}

function computeTooltipPos(
  sl: SpotlightRect | null,
  placement: LandingTourStep["placement"],
  tw: number,
  th: number
): TooltipPos {
  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!sl || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  let top: number, left: number;

  if (placement === "bottom") {
    top = sl.top + sl.height + pad;
    left = sl.left + sl.width / 2 - tw / 2;
  } else if (placement === "top") {
    top = sl.top - th - pad;
    left = sl.left + sl.width / 2 - tw / 2;
  } else if (placement === "right") {
    top = sl.top + sl.height / 2 - th / 2;
    left = sl.left + sl.width + pad;
  } else {
    top = sl.top + sl.height / 2 - th / 2;
    left = sl.left - tw - pad;
  }

  left = clamp(left, pad, vw - tw - pad);
  top = clamp(top, pad, vh - th - pad);

  return { top, left };
}

export function LandingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const current = LANDING_STEPS[step];
  const total = LANDING_STEPS.length;

  const updatePositions = useCallback(() => {
    const s = LANDING_STEPS[step];
    if (!s.targetSelector) {
      setSpotlight(null);
      setTooltipPos({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
      return;
    }
    const rect = getRect(s.targetSelector);
    if (!rect) {
      setSpotlight(null);
      setTooltipPos({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
      return;
    }
    const p = s.spotlightPadding ?? 12;
    const sl: SpotlightRect = { top: rect.top - p, left: rect.left - p, width: rect.width + p * 2, height: rect.height + p * 2 };
    setSpotlight(sl);
    const tw = tooltipRef.current?.offsetWidth ?? 380;
    const th = tooltipRef.current?.offsetHeight ?? 240;
    setTooltipPos(computeTooltipPos(sl, s.placement, tw, th));
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const s = LANDING_STEPS[step];
    if (s.scrollTo && s.targetSelector) {
      const el = document.querySelector(s.targetSelector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(updatePositions, 400);
        return () => clearTimeout(t);
      }
    }
    const t = setTimeout(updatePositions, 100);
    return () => clearTimeout(t);
  }, [active, step, updatePositions]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", updatePositions);
    window.addEventListener("scroll", updatePositions, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions);
    };
  }, [active, updatePositions]);

  const start = () => { setStep(0); setActive(true); };
  const end = () => setActive(false);
  const next = () => { if (step + 1 < total) setStep(s => s + 1); else end(); };
  const prev = () => { if (step > 0) setStep(s => s - 1); };

  const isFirst = step === 0;
  const isLast = step === total - 1;

  return (
    <>
      {/* ── Trigger button (inline in hero) ── */}
      <button
        onClick={start}
        data-testid="button-landing-tour"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
        style={{
          backgroundColor: "transparent",
          border: "1.5px solid #a0b880",
          color: "#3d4a30",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "#edf2e6";
          (e.currentTarget as HTMLElement).style.borderColor = "#5a7040";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
          (e.currentTarget as HTMLElement).style.borderColor = "#a0b880";
        }}
      >
        <Sparkles className="w-4 h-4" style={{ color: "#5a7040" }} />
        See how it works
        <ArrowRight className="w-3.5 h-3.5" />
      </button>

      {/* ── Overlay ── */}
      {active && (
        <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "none" }}>
          {/* SVG mask */}
          <svg
            className="absolute inset-0"
            width="100%"
            height="100%"
            style={{ pointerEvents: "auto" }}
          >
            <defs>
              <mask id="landing-tour-mask">
                <rect width="100%" height="100%" fill="white" />
                {spotlight && (
                  <rect
                    x={spotlight.left}
                    y={spotlight.top}
                    width={spotlight.width}
                    height={spotlight.height}
                    rx={10}
                    ry={10}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.58)" mask="url(#landing-tour-mask)" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx={10}
                ry={10}
                fill="none"
                stroke="#8fa870"
                strokeWidth={2}
              />
            )}
          </svg>

          {/* Tooltip */}
          <div
            ref={tooltipRef}
            style={{
              position: "absolute",
              pointerEvents: "auto",
              width: 380,
              maxWidth: "calc(100vw - 24px)",
              ...tooltipPos,
            }}
          >
            <div
              className="rounded-xl shadow-2xl overflow-hidden"
              style={{ backgroundColor: "#1c2414", border: "1px solid #3d5228" }}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "#5a7040" }}
                  >
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    {current.badge && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#8fa870" }}>
                        {current.badge}
                      </p>
                    )}
                    <h3 className="text-sm font-semibold leading-snug" style={{ color: "#e8ddd0" }}>
                      {current.title}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={end}
                  className="ml-3 flex-shrink-0 rounded-md p-1 transition-colors"
                  style={{ color: "#7a8a64" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#e8ddd0")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#7a8a64")}
                  data-testid="landing-tour-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 pb-4">
                <p className="text-sm leading-relaxed" style={{ color: "#aab898" }}>
                  {current.description}
                </p>
              </div>

              {/* Footer */}
              <div className="px-5 py-3" style={{ borderTop: "1px solid #2e3a20" }}>
                {isLast ? (
                  /* Final step — CTA */
                  <div className="flex flex-col gap-2">
                    <a
                      href={appUrl("/register")}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
                      style={{ backgroundColor: "#5a7040", color: "#ffffff" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#6b854f")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#5a7040")}
                      data-testid="landing-tour-start-trial"
                    >
                      Start your free 14-day trial
                      <ChevronRight className="w-4 h-4" />
                    </a>
                    <button
                      onClick={end}
                      className="text-xs text-center py-1 transition-colors"
                      style={{ color: "#5a6a4a" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#8fa870")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#5a6a4a")}
                    >
                      Maybe later
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    {/* Progress dots */}
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: total }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-full transition-all"
                          style={{
                            width: i === step ? 20 : 6,
                            height: 6,
                            backgroundColor: i === step ? "#8fa870" : "#3d5228",
                          }}
                        />
                      ))}
                    </div>
                    {/* Nav buttons */}
                    <div className="flex items-center gap-2">
                      {!isFirst && (
                        <button
                          onClick={prev}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
                          style={{ color: "#7a8a64", backgroundColor: "#2e3a20" }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#3d5228")}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#2e3a20")}
                          data-testid="landing-tour-prev"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          Back
                        </button>
                      )}
                      <button
                        onClick={next}
                        className="flex items-center gap-1 text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors"
                        style={{ backgroundColor: "#5a7040", color: "#ffffff" }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#6b854f")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#5a7040")}
                        data-testid="landing-tour-next"
                      >
                        Next
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Arrow pointer */}
            {spotlight && current.placement && current.placement !== "center" && (
              <TourArrow
                placement={current.placement}
                spotlight={spotlight}
                tooltipPos={tooltipPos}
                tooltipWidth={380}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function TourArrow({
  placement,
  spotlight,
  tooltipPos,
  tooltipWidth,
}: {
  placement: LandingTourStep["placement"];
  spotlight: SpotlightRect;
  tooltipPos: TooltipPos;
  tooltipWidth: number;
}) {
  if (typeof tooltipPos.top === "string" || typeof tooltipPos.left === "string") return null;
  const tooltipLeft = tooltipPos.left as number;
  const size = 10;

  if (placement === "bottom") {
    const cx = spotlight.left + spotlight.width / 2;
    const al = clamp(cx - tooltipLeft - size, 16, tooltipWidth - 32);
    return (
      <div style={{
        position: "absolute", top: -size, left: al,
        width: 0, height: 0,
        borderLeft: `${size}px solid transparent`,
        borderRight: `${size}px solid transparent`,
        borderBottom: `${size}px solid #1c2414`,
      }} />
    );
  }
  if (placement === "top") {
    const cx = spotlight.left + spotlight.width / 2;
    const al = clamp(cx - tooltipLeft - size, 16, tooltipWidth - 32);
    return (
      <div style={{
        position: "absolute", bottom: -size, left: al,
        width: 0, height: 0,
        borderLeft: `${size}px solid transparent`,
        borderRight: `${size}px solid transparent`,
        borderTop: `${size}px solid #1c2414`,
      }} />
    );
  }
  return null;
}
