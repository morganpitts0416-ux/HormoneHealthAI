import { describe, expect, test } from "vitest";
import { validateCapturedAudio } from "../../server/audio-capture-validation";

const webmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01]);

describe("captured audio validation", () => {
  test("retains a valid short final utterance", () => {
    expect(validateCapturedAudio({
      audioByteLength: webmHeader.length,
      captureDurationMs: 250,
      bytes: webmHeader,
    })).toBeNull();
  });

  test("fails closed for empty or malformed audio before STT", () => {
    expect(validateCapturedAudio({
      audioByteLength: 0,
      captureDurationMs: 10_000,
      bytes: Buffer.alloc(0),
    })).toMatch(/empty/i);
    expect(validateCapturedAudio({
      audioByteLength: 64,
      captureDurationMs: 10_000,
      bytes: Buffer.alloc(64, 0x42),
    })).toMatch(/container/i);
  });

  test("fails a container that is implausibly tiny for a multi-second capture", () => {
    expect(validateCapturedAudio({
      audioByteLength: webmHeader.length,
      captureDurationMs: 60_000,
      bytes: webmHeader,
    })).toMatch(/implausibly small/i);
  });
});