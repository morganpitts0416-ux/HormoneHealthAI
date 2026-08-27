---
name: Audio diagnostic session gate
description: How temporary microphone diagnostics survive SPA redirects without weakening server-side test-environment authorization
---

## Rule

Capture `?audioCaptureDiagnostic=1` at application entry in browser-tab session storage, then use that latch only to request authenticated server approval after SPA redirects have removed the URL. Display the server's explicit allow/deny reason in the recorder dock.

**Why:** Protected-route and login navigation replace URLs such as `/` with `/dashboard` and discard query strings before the recording provider mounts. Reading `window.location.search` only when the provider starts silently disables an otherwise approved tagged-revision diagnostic.

**How to apply:** Treat the tab latch as a request-preservation mechanism, never as authorization. The diagnostic endpoint must continue to enforce clinician authentication, operator enablement, and tagged-host checks; clear the latch on explicit logout. Any future diagnostic gate should identify whether denial came from an absent initial request, authentication, server feature flag, or tagged-host validation.