import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Sparkles, ChevronRight } from "lucide-react";
import { appUrl } from "@/lib/app-url";

/**
 * Timed annotation bubbles that overlay the demo video.
 *
 * Timestamps are in seconds (convert MM:SS → M*60+SS).
 * start/end bracket the visible annotation; end = next annotation's start.
 *
 * User-supplied timestamps (MM.SS notation → seconds):
 *  0.00 → 0s   0.01 → 1s   0.03 → 3s   0.04 → 4s   0.10 → 10s
 *  0.15 → 15s  0.19 → 19s  0.41 → 41s  0.50 → 50s  1.14 → 74s
 *  1.17 → 77s  1.32 → 92s  1.54 → 114s 2.00 → 120s 2.24 → 144s
 *  2.27 → 147s 2.32 → 152s 2.36 → 156s 2.38 → 158s 2.46 → 166s
 */
interface Annotation {
  start: number;
  end: number;
  label: string;
  text: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const ANNOTATIONS: Annotation[] = [
  // 0:00 – 0:01
  {
    start: 0,
    end: 1,
    label: "Provider Dashboard",
    text: "Your clinical command center — patient alerts, supplement orders, and full visit history at a glance.",
    position: "top-left",
  },
  // 0:01 – 0:04
  {
    start: 1,
    end: 4,
    label: "New Encounter",
    text: "Start a new patient encounter in seconds. ClinIQ links it to the patient profile and pre-fills visit context automatically.",
    position: "top-left",
  },
  // 0:04 – 0:10
  {
    start: 4,
    end: 10,
    label: "Live Recording",
    text: "Record directly in the browser or upload an existing audio file — no external tools, no integrations required.",
    position: "top-left",
  },
  // 0:10 – 0:15
  {
    start: 10,
    end: 15,
    label: "Transcription",
    text: "Audio is transcribed, diarized by speaker, and normalized for medical terminology — all in seconds.",
    position: "top-left",
  },
  // 0:15 – 0:19
  {
    start: 15,
    end: 19,
    label: "SOAP Note",
    text: "One click generates a complete, chart-ready SOAP note with ICD-10 codes directly from your transcript.",
    position: "top-left",
  },
  // 0:19 – 0:41
  {
    start: 19,
    end: 41,
    label: "Evidence",
    text: "The Evidence tab surfaces confidence-rated guideline citations for every diagnosis — so you can validate clinical decisions without leaving the chart.",
    position: "top-left",
  },
  // 0:41 – 0:50
  {
    start: 41,
    end: 50,
    label: "Patient Summary",
    text: "Generate a plain-language patient summary and publish it to their secure portal with one click — they see it instantly.",
    position: "top-left",
  },
  // 0:50 – 1:14
  {
    start: 50,
    end: 74,
    label: "Lab Interpretation",
    text: "Upload a lab PDF and ClinIQ auto-extracts every value. Add demographics and symptom context for deeper, more personalized analysis.",
    position: "top-left",
  },
  // 1:14 – 1:17
  {
    start: 74,
    end: 77,
    label: "Patient Profile",
    text: "Persistent patient profiles store full lab history, trend charts across 21 markers, and visit summaries side by side.",
    position: "top-left",
  },
  // 1:17 – 1:32
  {
    start: 77,
    end: 92,
    label: "Lab Results",
    text: "Every marker is color-coded against gender-specific optimal ranges — with clinical guidance, standing-order alerts, and red flag detection built in.",
    position: "top-left",
  },
  // 1:32 – 1:54
  {
    start: 92,
    end: 114,
    label: "PREVENT & Lipids",
    text: "PREVENT 2023 cardiovascular risk is calculated automatically. ApoB, Lp(a), and advanced lipid markers are layered in for comprehensive risk stratification.",
    position: "top-left",
  },
  // 1:54 – 2:00
  {
    start: 114,
    end: 120,
    label: "Supplements",
    text: "Supplement recommendations are generated automatically based on detected lab patterns, phenotypes, and patient-reported symptoms.",
    position: "top-left",
  },
  // 2:00 – 2:24
  {
    start: 120,
    end: 144,
    label: "Lab Review Note",
    text: "Copy the AI-generated lab review note directly into your EHR — already formatted for clinical documentation, nothing to reformat.",
    position: "top-left",
  },
  // 2:24 – 2:27
  {
    start: 144,
    end: 147,
    label: "Account Settings",
    text: "Account Settings let you configure every aspect of your clinical workflow and patient-facing experience in one place.",
    position: "top-left",
  },
  // 2:27 – 2:32
  {
    start: 147,
    end: 152,
    label: "Messaging Routes",
    text: "Choose how patients reach you: no portal messaging, in-app two-way chat, pass-through SMS — or an external platform bridge (coming soon).",
    position: "top-left",
  },
  // 2:32 – 2:36
  {
    start: 152,
    end: 156,
    label: "Staff Access",
    text: "Invite staff members to your workspace with role-based permissions — they operate fully within your clinical environment.",
    position: "top-left",
  },
  // 2:36 – 2:38
  {
    start: 156,
    end: 158,
    label: "Supplement Library",
    text: "Upload your own supplement catalog with patient-facing descriptions, dosing details, and lab-value trigger rules.",
    position: "top-left",
  },
  // 2:38 – 2:46
  {
    start: 158,
    end: 166,
    label: "Lab Range Prefs",
    text: "Override optimal or reference ranges for any of 60+ markers, per gender — your targets apply to every interpretation automatically.",
    position: "top-left",
  },
  // 2:46 – 2:55
  {
    start: 166,
    end: 175,
    label: "Patient Discounts",
    text: "Set percentage or flat-rate discounts on supplement orders — offered directly to patients or members through the portal.",
    position: "top-left",
  },
];

const POSITION_STYLES: Record<NonNullable<Annotation["position"]>, React.CSSProperties> = {
  "top-left":     { top: 14, left: 14 },
  "top-right":    { top: 14, right: 14 },
  "bottom-left":  { bottom: 60, left: 14 },
  "bottom-right": { bottom: 60, right: 14 },
};

export function DemoModal() {
  const [open, setOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Keyboard close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Track video time
  const onTimeUpdate = useCallback(() => {
    setCurrentTime(videoRef.current?.currentTime ?? 0);
  }, []);

  function openModal() {
    setOpen(true);
    setTimeout(() => videoRef.current?.play(), 200);
  }

  function closeModal() {
    setOpen(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setCurrentTime(0);
  }

  // Active annotation for the current timestamp
  const active = ANNOTATIONS.find(a => currentTime >= a.start && currentTime < a.end) ?? null;

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        onClick={openModal}
        data-testid="button-watch-demo"
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
        <Play className="w-3.5 h-3.5" style={{ color: "#5a7040", fill: "#5a7040" }} />
        Watch 3-min demo
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.82)" }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="relative w-full flex flex-col"
            style={{ maxWidth: 1040 }}
          >
            {/* Close */}
            <button
              onClick={closeModal}
              data-testid="button-demo-close"
              className="absolute -top-10 right-0 flex items-center gap-1.5 text-sm transition-colors z-10"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
            >
              <X className="w-4 h-4" />
              Close
            </button>

            {/* Browser chrome frame */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {/* Chrome bar */}
              <div
                className="flex items-center gap-1.5 px-4 py-2.5"
                style={{ backgroundColor: "#1c2414" }}
              >
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#ff5f57" }} />
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#febc2e" }} />
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#28c840" }} />
                <div
                  className="flex-1 mx-3 rounded px-3 py-0.5 text-[11px] flex items-center gap-1.5"
                  style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.40)" }}
                >
                  <Sparkles className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "#8fa870" }} />
                  app.realignlabeval.com — ClinIQ by ReAlign Health
                </div>
              </div>

              {/* Video + annotation overlay */}
              <div className="relative" style={{ backgroundColor: "#0e1409" }}>
                <video
                  ref={videoRef}
                  src="/demo.mp4"
                  controls
                  playsInline
                  onTimeUpdate={onTimeUpdate}
                  className="w-full block"
                  style={{ maxHeight: "72vh", objectFit: "contain", display: "block" }}
                />

                {/* Annotation bubble */}
                {ANNOTATIONS.map(a => {
                  const isActive = a === active;
                  const pos = POSITION_STYLES[a.position ?? "top-left"];
                  return (
                    <div
                      key={`${a.start}-${a.label}`}
                      style={{
                        position: "absolute",
                        ...pos,
                        maxWidth: 340,
                        pointerEvents: "none",
                        opacity: isActive ? 1 : 0,
                        transform: isActive ? "translateY(0)" : "translateY(-6px)",
                        transition: "opacity 0.35s ease, transform 0.35s ease",
                        zIndex: 10,
                      }}
                    >
                      {/* Bubble card */}
                      <div
                        style={{
                          backgroundColor: "rgba(18, 26, 10, 0.92)",
                          border: "1px solid rgba(143, 168, 112, 0.45)",
                          borderRadius: 10,
                          padding: "10px 14px 11px",
                          backdropFilter: "blur(8px)",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.55)",
                        }}
                      >
                        {/* Label badge */}
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            backgroundColor: "#5a7040",
                            borderRadius: 6,
                            padding: "2px 8px",
                            marginBottom: 6,
                          }}
                        >
                          <Sparkles style={{ width: 10, height: 10, color: "#c4d4a8", flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#e8f0d8", textTransform: "uppercase", fontFamily: "IBM Plex Sans, Inter, sans-serif" }}>
                            {a.label}
                          </span>
                        </div>
                        {/* Description */}
                        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: "#c8d8b0", fontFamily: "IBM Plex Sans, Inter, sans-serif" }}>
                          {a.text}
                        </p>
                      </div>

                      {/* Tail triangle pointing down-left */}
                      {(a.position === "top-left" || !a.position) && (
                        <div style={{
                          position: "absolute",
                          bottom: -7,
                          left: 18,
                          width: 0,
                          height: 0,
                          borderLeft: "7px solid transparent",
                          borderRight: "7px solid transparent",
                          borderTop: "7px solid rgba(18, 26, 10, 0.92)",
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chapter bar — click to jump */}
            <div
              className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {ANNOTATIONS.map(a => {
                const isActive = a === active;
                return (
                  <button
                    key={`${a.start}-btn`}
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = a.start + 0.5;
                        videoRef.current.play();
                      }
                    }}
                    style={{
                      flexShrink: 0,
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      backgroundColor: isActive ? "#5a7040" : "rgba(255,255,255,0.07)",
                      borderColor: isActive ? "#8fa870" : "rgba(255,255,255,0.15)",
                      color: isActive ? "#e8f0d8" : "rgba(255,255,255,0.50)",
                      fontFamily: "IBM Plex Sans, Inter, sans-serif",
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>

            {/* CTA below */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
              <a
                href={appUrl("/register")}
                data-testid="link-demo-trial"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: "#5a7040", color: "#ffffff" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#6b854f")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#5a7040")}
              >
                Start your 14-day free trial
                <ChevronRight className="w-4 h-4" />
              </a>
              <button
                onClick={closeModal}
                className="text-sm transition-colors"
                style={{ color: "rgba(255,255,255,0.45)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
              >
                Continue exploring
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
