export interface AudioCaptureDiagnosticEnvironment {
  NODE_ENV?: string;
  AUDIO_CAPTURE_DIAGNOSTIC_ENABLED?: string;
  AUDIO_CAPTURE_DIAGNOSTIC_TAG?: string;
  K_REVISION?: string;
}

export interface AudioCaptureDiagnosticGateResult {
  enabled: boolean;
  reason: string;
}

export function getAudioCaptureDiagnosticEnvironmentGate(
  env: AudioCaptureDiagnosticEnvironment,
  host: string | undefined,
): AudioCaptureDiagnosticGateResult {
  if (env.AUDIO_CAPTURE_DIAGNOSTIC_ENABLED !== "true") {
    return { enabled: false, reason: "server diagnostic gate is off" };
  }
  if (env.NODE_ENV !== "production") {
    return { enabled: true, reason: "server approved enabled test environment" };
  }

  const tag = env.AUDIO_CAPTURE_DIAGNOSTIC_TAG?.trim().toLowerCase();
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  if (!env.K_REVISION?.trim()) {
    return { enabled: false, reason: "tagged revision identity is unavailable" };
  }
  if (!tag) {
    return { enabled: false, reason: "server diagnostic tag is not configured" };
  }
  if (!hostname.startsWith(`${tag}---`)) {
    return { enabled: false, reason: "tagged test hostname is required" };
  }
  return { enabled: true, reason: "server approved tagged test revision" };
}

/**
 * The capture player is intentionally unavailable unless a deployment operator
 * has explicitly enabled it. Production also requires the request to arrive at
 * the dedicated Cloud Run tag hostname, never the ordinary traffic hostname.
 */
export function isAudioCaptureDiagnosticEnvironment(
  env: AudioCaptureDiagnosticEnvironment,
  host: string | undefined,
): boolean {
  return getAudioCaptureDiagnosticEnvironmentGate(env, host).enabled;
}