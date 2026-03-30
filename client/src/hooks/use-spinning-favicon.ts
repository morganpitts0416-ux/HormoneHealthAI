import { useEffect, useRef } from "react";

const FAVICON_PATH = "/favicon.png";
const SIZE = 64;

export function useSpinningFavicon(isActive: boolean) {
  const rafRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Pre-load the image once
    if (!imgRef.current) {
      const img = new Image();
      img.src = FAVICON_PATH;
      imgRef.current = img;
    }
    if (!canvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      canvasRef.current = canvas;
    }
  }, []);

  useEffect(() => {
    const getFaviconEl = (): HTMLLinkElement | null =>
      document.querySelector("link[rel~='icon']");

    if (!isActive) {
      // Stop animation and restore original favicon
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      angleRef.current = 0;
      const el = getFaviconEl();
      if (el) el.href = FAVICON_PATH;
      return;
    }

    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      angleRef.current = (angleRef.current + 3) % 360;
      const rad = (angleRef.current * Math.PI) / 180;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -SIZE / 2, -SIZE / 2, SIZE, SIZE);
      ctx.restore();

      const el = getFaviconEl();
      if (el) el.href = canvas.toDataURL("image/png");

      rafRef.current = requestAnimationFrame(draw);
    };

    // Wait for image to load if needed
    if (img.complete) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      img.onload = () => {
        rafRef.current = requestAnimationFrame(draw);
      };
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isActive]);
}
