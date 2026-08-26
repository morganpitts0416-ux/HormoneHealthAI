import { describe, expect, test } from "vitest";
import { buildWhisperPrompt } from "../../server/clinical-lexicon";
import {
  assembleVerifiedRawTranscript,
  resolveTranscriptSource,
  type ProvenanceSegment,
} from "../../server/transcript-source";

const segment = (overrides: Partial<ProvenanceSegment>): ProvenanceSegment => ({
  id: 1,
  transcriptionSessionId: 1,
  segmentIndex: 0,
  rawSttText: "default",
  audioSha256: "a".repeat(64),
  sttResponseSha256: "b".repeat(64),
  sttModel: "gpt-4o-transcribe",
  usedFallback: false,
  attemptCount: 1,
  status: "completed",
  failureReason: null,
  derivedTranscriptSha256: null,
  createdAt: new Date(),
  finalizedAt: new Date(),
  sessionSequence: 0,
  clientSessionId: "session-a",
  ...overrides,
});

describe("authoritative transcript source", () => {
  test("assembles out-of-order STT completions by reserved session and segment sequence", () => {
    const result = assembleVerifiedRawTranscript([
      segment({ id: 3, sessionSequence: 1, segmentIndex: 0, rawSttText: "third" }),
      segment({ id: 2, sessionSequence: 0, segmentIndex: 1, rawSttText: "second" }),
      segment({ id: 1, sessionSequence: 0, segmentIndex: 0, rawSttText: "first" }),
    ]);
    expect(result.text).toBe("first\nsecond\nthird");
    expect(result.kind).toBe("verified_raw");
  });

  test("keeps failed and empty source segments explicit rather than silently dropping them", () => {
    const result = assembleVerifiedRawTranscript([
      segment({ segmentIndex: 0, status: "failed", rawSttText: null }),
      segment({ segmentIndex: 1, status: "empty", rawSttText: null }),
    ]);
    expect(result.hasGaps).toBe(true);
    expect(result.text).toContain("[AUDIO GAP");
    expect(result.text).toContain("[UNINTELLIGIBLE");
  });

  test("uses legacy editable text only when no immutable source segments exist", () => {
    expect(resolveTranscriptSource({ transcription: "legacy note" } as any, []).kind)
      .toBe("legacy_unverified");
    expect(resolveTranscriptSource({ transcription: "edited text" } as any, [
      segment({ rawSttText: "immutable raw" }),
    ]).text).toBe("immutable raw");
  });
});

describe("STT prompt safety", () => {
  test("does not prime the transcription model with clinical vocabulary", () => {
    const prompt = buildWhisperPrompt("follow-up");
    expect(prompt).toContain("Transcribe exactly what is spoken");
    expect(prompt).not.toMatch(/semaglutide|estradiol|HRT|ApoB/i);
  });
});