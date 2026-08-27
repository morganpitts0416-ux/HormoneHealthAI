---
name: Audio diagnostic session gate
description: How temporary microphone diagnostics survive SPA redirects without weakening server-side test-environment authorization
---

## Rule

Capture `?audioCaptureDiagnostic=1` at application entry in browser-tab session storage, then use that latch only to request authenticated server approval after SPA redirects have removed the URL. Persist a successful server approval for that authenticated tab, display the server's explicit allow/deny reason in the recorder dock, and revalidate in the background after provider remounts.

**Why:** Protected-route and login navigation replace URLs such as `/` with `/dashboard` and discard query strings before the recording provider mounts. Recording providers can also remount on route changes; holding server approval only in React state makes an approved diagnostic temporarily revert to disabled and can miss analyser setup if the user starts recording before revalidation returns.

**How to apply:** Treat the tab latches as request-preservation and previously-approved-state mechanisms, never as authorization. The diagnostic endpoint must continue to enforce clinician authentication, operator enablement, and tagged-host checks; clear both latches on explicit logout. If approval resolves after recording began, attach the analyser to the existing stream rather than waiting for another recording.