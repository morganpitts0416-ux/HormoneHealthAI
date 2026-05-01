import { useGlobalLoading } from "@/hooks/use-global-loading";

export function GlobalLoadingOverlay() {
  const { isLoading, message } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
      aria-live="polite"
      aria-busy="true"
      aria-label={message || "Loading"}
      data-testid="global-loading-overlay"
    >
      {/* Emblem + orbiting rings */}
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>

        {/* Outer orbit ring — clockwise */}
        <svg
          className="absolute inset-0 realign-orbit-cw"
          width="160"
          height="160"
          viewBox="0 0 160 160"
          style={{ transformOrigin: "80px 80px" }}
        >
          <circle
            cx="80" cy="80" r="72"
            fill="none"
            stroke="hsl(var(--primary) / 0.10)"
            strokeWidth="1"
          />
          <circle
            cx="80" cy="80" r="72"
            fill="none"
            stroke="hsl(var(--primary) / 0.55)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="90 362"
            style={{ transformOrigin: "80px 80px" }}
          />
        </svg>

        {/* Inner orbit ring — counter-clockwise */}
        <svg
          className="absolute realign-orbit-ccw"
          width="112"
          height="112"
          viewBox="0 0 112 112"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            transformOrigin: "56px 56px",
          }}
        >
          <circle
            cx="56" cy="56" r="48"
            fill="none"
            stroke="hsl(var(--primary) / 0.08)"
            strokeWidth="1"
          />
          <circle
            cx="56" cy="56" r="48"
            fill="none"
            stroke="hsl(var(--primary) / 0.35)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeDasharray="40 261"
            style={{ transformOrigin: "56px 56px" }}
          />
        </svg>

        {/* ReAlign emblem — breathing */}
        <div className="relative realign-breathe" style={{ width: 68, height: 68 }}>
          {/* Soft radial glow behind emblem */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, hsl(var(--primary) / 0.12) 0%, transparent 70%)",
              transform: "scale(2.2)",
            }}
          />
          <img
            src="/cliniq-logo.png"
            alt="ClinIQ"
            width={120}
            height={68}
            style={{ objectFit: "contain", position: "relative", zIndex: 1, mixBlendMode: "multiply" }}
          />
        </div>
      </div>

      {/* Message */}
      <div className="mt-6 text-center space-y-1.5">
        <p className="text-sm font-medium text-foreground tracking-wide">{message}</p>
        {/* Animated dot ellipsis */}
        <p className="text-xs text-muted-foreground realign-dot-pulse">Processing</p>
      </div>
    </div>
  );
}
