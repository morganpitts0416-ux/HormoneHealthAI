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
let _topZ = 50;
function nextZ() { return ++_topZ; }

/**
 * Shared drag + minimize + z-index behavior for floating chart panels.
 * Mount this in a component and spread the returned handlers onto your
 * outer panel div and header drag-handle.
 */
export function useFloatingPanel(): FloatingPanelState {
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [zIndex, setZIndex] = useState(() => nextZ());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const bringToFront = useCallback(() => {
    setZIndex(nextZ());
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
    zIndex,
    bringToFront,
  };
}
