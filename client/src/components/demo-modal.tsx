import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Sparkles, ChevronRight } from "lucide-react";
import { appUrl } from "@/lib/app-url";

/**
 * Timed annotation bubbles that overlay the demo video.
 *
 * Each entry defines:
 *   start / end  — seconds in the video timeline
 *   label        — short badge text (section name)
 *   text         — one-line callout description
 *   position     — which corner of the video to render in
 *
 * ── HOW TO ADJUST TIMESTAMPS ──────────────────────────────────────────
 * Watch the video, note the seconds shown in the native video scrubber,
 * and update start/end below to match what's actually visible.
 * The label and text can say anything — keep them short (≤ 60 chars).
 * ──────────────────────────────────────────────────────────────────────
 */
interface Annotation {
  start: number;
  end: number;
  label: string;
  text: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const ANNOTATIONS: Annotation[] = [
  {
    start: 2,
    end: 20,
    label: "Provider Dashboard",
    text: "Your clinical command center — patients, alerts, and quick actions all in one view.",
    position: "top-left",
  },
  {
    start: 23,
    end: 43,
    label: "Patient Profiles",
    text: "Browse your full patient roster, view lab history, and track trends over time.",
    position: "top-left",
  },
  {
    start: 46,
    end: 70,
    label: "Lab Interpretation",
    text: "60+ markers color-coded instantly — optimal, borderline, abnormal, and critical red flags.",
    position: "top-left",
  },
  {
    start: 73,
    end: 98,
    label: "Clinical Intelligence",
    text: "PREVENT cardiovascular risk, insulin resistance phenotyping, and hormone patterns — automatic.",
    position: "top-left",
  },
  {
    start: 101,
    end: 125,
    label: "Encounter Documentation",
    text: "Upload or record visit audio. ClinIQ transcribes, normalizes, and diarizes in seconds.",
    position: "top-left",
  },
  {
    start: 128,
    end: 152,
    label: "AI SOAP Note",
    text: "Full chart-ready SOAP note generated from the transcript — one click, no manual typing.",
    position: "top-left",
  },
  {
    start: 155,
    end: 170,
    label: "Evidence Tab",
    text: "Guideline citations and clinical evidence surfaced for every diagnosis — confidence rated.",
    position: "top-left",
  },
  {
    start: 172,
    end: 175,
    label: "Patient Portal",
    text: "What your patient sees — personalized lab insights, supplements, and wellness guidance.",
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
