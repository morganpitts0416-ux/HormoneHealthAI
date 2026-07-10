---
name: Floating draggable/minimizable panel pattern
description: Shared hook for chart-side panels (lab eval, SOAP note builder) that must stay open while navigating the rest of the patient chart.
---

Extracted the drag/minimize state machine (position, minimized flag, mousedown→mousemove→mouseup drag handling) into `client/src/hooks/use-floating-panel.ts` (`useFloatingPanel()`), used by both `LabDetailModal` and `ManualSoapBuilder`.

**Why:** Radix `Dialog`/`DialogContent` blocks the rest of the UI with an overlay and closes on outside-click/Escape, which is wrong for clinical workflows where the provider needs to reference other chart panels (labs, history) while writing a note — and outside-click-to-close risks silently losing in-progress work.

**How to apply:** For any new "peek at other chart data while this panel is open" UI, drop the Dialog wrapper entirely — render the panel component directly (no overlay), call `useFloatingPanel()` inside it, and wrap the panel's own header in `onMouseDown={startDrag}` plus a minimize button using `Minus`/`Maximize2` icons. Note: `panelPos` is `{x,y} | null`; always null-check it directly in JSX (not via the derived `floating` boolean) or TS narrowing fails.

For any modal/panel holding a multi-field draft (like SOAP notes), pair this with a localStorage-based autosave: debounce a `useEffect` on the draft fields (~1s) into `localStorage.setItem(key, JSON.stringify({...fields, savedAt}))`, restore on mount if present, and clear the key only on confirmed server save success — this covers accidental-close/crash without needing a server-side draft/autosave endpoint.
