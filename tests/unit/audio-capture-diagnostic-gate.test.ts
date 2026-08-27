import { describe, expect, test } from "vitest";
import {
  getAudioCaptureDiagnosticEnvironmentGate,
  isAudioCaptureDiagnosticEnvironment,
} from "../../server/audio-capture-diagnostic-gate";

describe("audio capture diagnostic environment gate", () => {
  test("requires an explicit operator feature flag", () => {
    expect(isAudioCaptureDiagnosticEnvironment(
      { NODE_ENV: "development" },
      "localhost:5000",
    )).toBe(false);
  });

  test("allows a deliberately enabled non-production test environment", () => {
    expect(isAudioCaptureDiagnosticEnvironment(
      { NODE_ENV: "development", AUDIO_CAPTURE_DIAGNOSTIC_ENABLED: "true" },
      "localhost:5000",
    )).toBe(true);
  });

  test("requires the named Cloud Run tag hostname in production", () => {
    const env = {
      NODE_ENV: "production",
      AUDIO_CAPTURE_DIAGNOSTIC_ENABLED: "true",
      AUDIO_CAPTURE_DIAGNOSTIC_TAG: "audio-boundary-test",
      K_REVISION: "cliniq-audio-boundary-test-00001",
    };
    expect(isAudioCaptureDiagnosticEnvironment(
      env,
      "audio-boundary-test---cliniq-abc-uc.a.run.app",
    )).toBe(true);
    expect(isAudioCaptureDiagnosticEnvironment(
      env,
      "cliniq-abc-uc.a.run.app",
    )).toBe(false);
    expect(isAudioCaptureDiagnosticEnvironment(
      { ...env, AUDIO_CAPTURE_DIAGNOSTIC_TAG: "" },
      "audio-boundary-test---cliniq-abc-uc.a.run.app",
    )).toBe(false);
  });

  test("returns an operator-visible reason for the rejected gate", () => {
    expect(getAudioCaptureDiagnosticEnvironmentGate(
      {
        NODE_ENV: "production",
        AUDIO_CAPTURE_DIAGNOSTIC_ENABLED: "true",
        AUDIO_CAPTURE_DIAGNOSTIC_TAG: "audio-boundary-test",
        K_REVISION: "cliniq-audio-boundary-test-00001",
      },
      "cliniq-abc-uc.a.run.app",
    )).toEqual({
      enabled: false,
      reason: "tagged test hostname is required",
    });
  });
});