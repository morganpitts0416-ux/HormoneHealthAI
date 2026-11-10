import type { EncounterVersion } from "@shared/schema";
import { encounterDay } from "@shared/encounter-date";

export function EncounterSignatureHistory({ versions }: { versions?: EncounterVersion[] | null }) {
  if (!versions?.length) return null;
  return (
    <details className="text-xs p-3" data-testid="encounter-signature-history">
      <summary className="cursor-pointer font-medium">Signature history</summary>
      <ol className="space-y-2 mt-2">
        {versions.map((version, index) => (
          <li key={index}>
            <span>Version {version.version} · Encounter date: {version.visitDate
              ? encounterDay(version.visitDate) : "Not recorded in this legacy version"}</span>
            <br />
            <span>Signed by {version.signedBy} · Signed on {new Date(version.signedAt).toLocaleString("en-US")}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
