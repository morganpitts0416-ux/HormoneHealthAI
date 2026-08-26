export interface AudioCaptureDiagnosticEnvironment {
  NODE_ENV?: string;
  AUDIO_CAPTURE_DIAGNOSTIC_ENABLED?: string;
  AUDIO_CAPTURE_DIAGNOSTIC_TAG?: string;
  K_REVISION?: string;
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
  if (env.AUDIO_CAPTURE_DIAGNOSTIC_ENABLED !== "true") return false;
  if (env.NODE_ENV !== "production") return true;

  const tag = env.AUDIO_CAPTURE_DIAGNOSTIC_TAG?.trim().toLowerCase();
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  return Boolean(
    env.K_REVISION?.trim()
    && tag
    && hostname.startsWith(`${tag}---`),
  );
}