import type { ClinicalEncounter, EncounterTranscriptionSegment } from "@shared/schema";

export type ProvenanceSegment = EncounterTranscriptionSegment & {
  sessionSequence: number;
  clientSessionId: string;
};

export type TranscriptSourceKind = "verified_raw" | "legacy_unverified";

export interface TranscriptSource {
  text: string;
  kind: TranscriptSourceKind;
  hasGaps: boolean;
  segmentCount: number;
}

function markerFor(segment: ProvenanceSegment): string {
  const label = `session ${segment.sessionSequence + 1}, segment ${segment.segmentIndex + 1}`;
  if (segment.status === "empty" || segment.status === "unintelligible") {
    return `[UNINTELLIGIBLE — ${label} produced no usable speech]`;
  }
  return `[AUDIO GAP — ${label} could not be transcribed]`;
}

/**
 * Assemble immutable STT artifacts in the recording order reserved by the
 * server. Do not sort by completion time, retry timing, insertion time, or ID.
 */
export function assembleVerifiedRawTranscript(segments: ProvenanceSegment[]): TranscriptSource {
  const ordered = [...segments].sort(
    (a, b) => a.sessionSequence - b.sessionSequence || a.segmentIndex - b.segmentIndex,
  );
  const parts = ordered.map((segment) => {
    if (segment.status === "completed" && segment.rawSttText?.trim()) {
      return segment.rawSttText.trim();
    }
    return markerFor(segment);
  });
  const text = parts.join("\n").trim();
  return {
    text,
    kind: "verified_raw",
    hasGaps: ordered.some((segment) => segment.status !== "completed" || !segment.rawSttText?.trim()),
    segmentCount: ordered.length,
  };
}

/**
 * Verified segment-backed STT is the only automatic authoritative source.
 * Existing encounters keep their old editable text, but are explicitly legacy
 * rather than being retroactively represented as verified raw evidence.
 */
export function resolveTranscriptSource(
  encounter: Pick<ClinicalEncounter, "transcription">,
  segments: ProvenanceSegment[],
): TranscriptSource {
  if (segments.length > 0) return assembleVerifiedRawTranscript(segments);
  return {
    text: encounter.transcription?.trim() ?? "",
    kind: "legacy_unverified",
    hasGaps: false,
    segmentCount: 0,
  };
}
