export interface CaptureValidationInput {
  audioByteLength: number;
  captureDurationMs: number | null;
  bytes: Buffer;
}

function looksLikeSupportedAudioContainer(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  // WebM / Matroska EBML, Ogg, WAV, MP4/M4A, and common MP3 headers.
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return true;
  if (bytes.subarray(0, 4).toString("ascii") === "OggS") return true;
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") return true;
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp") return true;
  if (bytes.subarray(0, 3).toString("ascii") === "ID3") return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/**
 * Reject only captures that are objectively empty, malformed, or implausibly
 * tiny for a multi-second claimed capture. A valid short final utterance must
 * remain eligible for STT, so duration is never used as a standalone cutoff.
 */
export function validateCapturedAudio(input: CaptureValidationInput): string | null {
  if (input.audioByteLength <= 0) return "Audio capture was empty";
  if (!looksLikeSupportedAudioContainer(input.bytes)) {
    return "Audio capture did not contain a recognized audio container";
  }
  if (
    input.captureDurationMs !== null
    && input.captureDurationMs >= 3_000
    && input.audioByteLength < 256
  ) {
    return "Audio capture was implausibly small for its recorded duration";
  }
  return null;
}