const AUDIO_CAPTURE_DIAGNOSTIC_REQUEST_KEY = "cliniq.audioCaptureDiagnostic.requested";
const AUDIO_CAPTURE_DIAGNOSTIC_APPROVED_KEY = "cliniq.audioCaptureDiagnostic.approved";

function readRequestLatch(): boolean {
  try {
    return window.sessionStorage.getItem(AUDIO_CAPTURE_DIAGNOSTIC_REQUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function hasAudioCaptureDiagnosticApproval(): boolean {
  try {
    return window.sessionStorage.getItem(AUDIO_CAPTURE_DIAGNOSTIC_APPROVED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberAudioCaptureDiagnosticApproval(): void {
  try {
    window.sessionStorage.setItem(AUDIO_CAPTURE_DIAGNOSTIC_APPROVED_KEY, "1");
  } catch {
    // Best effort only; the current provider still receives the server result.
  }
}

export function clearAudioCaptureDiagnosticApproval(): void {
  try {
    window.sessionStorage.removeItem(AUDIO_CAPTURE_DIAGNOSTIC_APPROVED_KEY);
  } catch {
    // Best effort only.
  }
}

/**
 * Captures the one-time diagnostic request before client-side auth and route
 * redirects replace the URL. The server still decides whether the diagnostic
 * may run; this only preserves the user's initial request for this browser tab.
 */
export function rememberAudioCaptureDiagnosticRequest(): boolean {
  if (typeof window === "undefined") return false;

  const requestedInUrl = new URLSearchParams(window.location.search)
    .get("audioCaptureDiagnostic") === "1";

  if (requestedInUrl) {
    try {
      window.sessionStorage.setItem(AUDIO_CAPTURE_DIAGNOSTIC_REQUEST_KEY, "1");
    } catch {
      // If tab storage is unavailable, the current URL still authorizes this
      // render. A subsequent redirect cannot be preserved in that browser.
    }
  }

  return requestedInUrl || readRequestLatch();
}

export function clearAudioCaptureDiagnosticRequest(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(AUDIO_CAPTURE_DIAGNOSTIC_REQUEST_KEY);
    window.sessionStorage.removeItem(AUDIO_CAPTURE_DIAGNOSTIC_APPROVED_KEY);
  } catch {
    // Best effort only; server approval remains mandatory.
  }
}