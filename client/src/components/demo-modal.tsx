import { useState, useRef, useEffect } from "react";
import { X, Play, Sparkles, ChevronRight } from "lucide-react";
import { appUrl } from "@/lib/app-url";

export function DemoModal() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function openModal() {
    setOpen(true);
    setTimeout(() => videoRef.current?.play(), 200);
  }

  function close() {
    setOpen(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }

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
          style={{ backgroundColor: "rgba(0,0,0,0.80)" }}
          onClick={e => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className="relative w-full flex flex-col"
            style={{ maxWidth: 1040 }}
          >
            {/* Close */}
            <button
              onClick={close}
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

              {/* Video */}
              <video
                ref={videoRef}
                src="/demo.mp4"
                controls
                playsInline
                className="w-full block"
                style={{ backgroundColor: "#0e1409", maxHeight: "72vh", objectFit: "contain" }}
              />
            </div>

            {/* CTA below video */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-5">
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
                onClick={close}
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
