import { useMemo } from "react";

export type ScaleId =
  | "protein"
  | "water"
  | "fiber"
  | "processed"
  | "alcohol"
  | "sleepQuality"
  | "mood"
  | "energy"
  | "cravings"
  | "hunger"
  | "brainFog"
  | "anxiety"
  | "intensity"
  | "cramps";

type Scale = { labels: string[]; min?: number };

export const SCALES: Record<ScaleId, Scale> = {
  protein:      { labels: ["Skipped", "Light", "Moderate", "Strong", "On point"] },
  water:        { labels: ["Barely any", "Some", "Moderate", "Good", "Plenty"] },
  fiber:        { labels: ["None", "Light", "Moderate", "Strong", "Lots"] },
  processed:    { labels: ["None", "A little", "Some", "A lot", "Most meals"] },
  alcohol:      { labels: ["None", "1 drink", "2 drinks", "3 drinks", "4 drinks", "5+ drinks"], min: 0 },
  sleepQuality: { labels: ["Poor", "Restless", "Okay", "Good", "Restorative"] },
  mood:         { labels: ["Low", "Off", "Okay", "Good", "Great"] },
  energy:       { labels: ["Drained", "Low", "Okay", "Steady", "Energized"] },
  cravings:     { labels: ["None", "Mild", "Some", "Strong", "Intense"] },
  hunger:       { labels: ["Low", "Light", "Normal", "High", "Ravenous"] },
  brainFog:     { labels: ["Sharp", "Mostly clear", "Some fog", "Foggy", "Heavy fog"] },
  anxiety:      { labels: ["Calm", "Mostly calm", "A little tense", "Anxious", "On edge"] },
  intensity:    { labels: ["Easy", "Light", "Moderate", "Hard", "All-out"] },
  cramps:       { labels: ["None", "Mild", "Moderate", "Strong", "Severe"] },
};

export function LabeledChipScale({
  scale,
  value,
  onChange,
  testId,
}: {
  scale: ScaleId;
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  testId: string;
}) {
  const def = SCALES[scale];
  const min = def.min ?? 1;
  const options = useMemo(
    () => def.labels.map((label, i) => ({ label, value: min + i })),
    [def, min],
  );
  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? null,
    [options, value],
  );

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        data-testid={testId}
      >
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : o.value)}
              className="rounded-full px-4 py-2 text-sm font-medium border transition-colors hover-elevate active-elevate-2"
              style={{
                backgroundColor: selected ? "#2e3a20" : "#ffffff",
                color: selected ? "#ffffff" : "#1c2414",
                borderColor: selected ? "#2e3a20" : "#d4c9b5",
              }}
              data-testid={`${testId}-opt-${o.value}`}
              title={o.label}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {selectedLabel && (
        <p
          className="text-xs italic"
          style={{ color: "#7a8a64" }}
          data-testid={`${testId}-current`}
        >
          You picked: {selectedLabel}
        </p>
      )}
    </div>
  );
}
