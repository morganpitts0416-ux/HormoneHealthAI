import { useCallback, useRef, useState } from "react";

export interface FloatingPanelState {
  panelPos: { x: number; y: number } | null;
  minimized: boolean;
  setMinimized: (updater: boolean | ((prev: boolean) => boolean)) => void;
  panelRef: React.RefObject<HTMLDivElement>;
  startDrag: (e: React.MouseEvent) => void;
  floating: boolean;
  zIndex: number;
  bringToFront: () => void;
}

// Module-level counter so every panel gets a unique z-index and clicking
// any panel correctly brings it above all siblings.
let _topZ = 400;
function nextZ() { return ++_topZ; }

/**
 * Shared drag + minimize + z-index behavior for floating chart panels.
 * Mount this in a component and spread the returned handlers onto your
 * outer panel div and header drag-handle.
 *
 * NOTE: bringToFront intentionally uses an imperative DOM write (not setState)
 * so that it does NOT trigger a React re-render mid-click-sequence.  If it
 * caused a re-render, nested-function components like HideableSection would
 * be treated as new component types, React would unmount+remount them, the
 * original button DOM node would be removed before the browser fires "click",
 * and onClick handlers would silently never run.
 */
export function useFloatingPanel(): FloatingPanelState {
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // z-index lives in a ref — updates are applied imperatively to the DOM so
  // bringToFront never causes a React re-render (see NOTE above).
  const zRef = useRef(nextZ());

  const bringToFront = useCallback(() => {
    const newZ = nextZ();
    zRef.current = newZ;
    if (panelRef.current) {
      panelRef.current.style.zIndex = String(newZ);
    }
  }, []);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    bringToFront();
    const rect = panelRef.current?.getBoundingClientRect();
    const origX = panelPos?.x ?? rect?.left ?? 0;
    const origY = panelPos?.y ?? rect?.top ?? 0;
    dragState.current = { startX: e.clientX, startY: e.clientY, origX, origY };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 40;
      setPanelPos({
        x: Math.min(Math.max(dragState.current.origX + dx, 0), maxX),
        y: Math.min(Math.max(dragState.current.origY + dy, 0), maxY),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelPos, bringToFront]);

  return {
    panelPos,
    minimized,
    setMinimized,
    panelRef: panelRef as React.RefObject<HTMLDivElement>,
    startDrag,
    floating: panelPos !== null,
    // Return current ref value for the initial style prop on first render;
    // subsequent bringToFront calls update the DOM directly without re-render.
    zIndex: zRef.current,
    bringToFront,
  };
}
