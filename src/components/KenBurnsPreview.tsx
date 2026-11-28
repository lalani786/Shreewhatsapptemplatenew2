import { useEffect, useRef, useState } from "react";

interface Props {
  imageUrl?: string;
  durationSec: number;
  zoomIntensity: number;
  resolution: number;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function KenBurnsPreview({ imageUrl, durationSec, zoomIntensity, resolution }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);
  const startRef = useRef<number>(performance.now());
  const rafRef = useRef<number>();

  // Reset loop when settings change
  useEffect(() => {
    startRef.current = performance.now();
  }, [durationSec, zoomIntensity, resolution, imageUrl]);

  useEffect(() => {
    if (!imageUrl) {
      setImg(null);
      setError(false);
      return;
    }
    setError(false);
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.onerror = () => setError(true);
    i.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const progress = (elapsed % durationSec) / durationSec;

      ctx.clearRect(0, 0, w, h);

      if (!img) {
        ctx.fillStyle = "hsl(210 20% 92%)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "hsl(210 11% 45%)";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(error ? "Preview unavailable" : "Generate an image to preview", w / 2, h / 2);
      } else {
        const zoom = 1 + 0.25 * Math.max(0, zoomIntensity) * easeInOutCubic(progress);
        const panX = 20 * zoomIntensity * easeInOutCubic(progress) * (w / 1080);
        const panY = 10 * zoomIntensity * Math.sin(progress * Math.PI) * (h / 1080);

        const drawW = w * zoom;
        const drawH = h * zoom;
        const offsetX = (w - drawW) / 2 + panX;
        const offsetY = (h - drawH) / 2 + panY;

        const imgAspect = img.width / img.height;
        const canvasAspect = w / h;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (imgAspect > canvasAspect) {
          sw = img.height * canvasAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / canvasAspect;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, offsetX, offsetY, drawW, drawH);
      }

      // Progress bar
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, h - 3, w, 3);
      ctx.fillStyle = "hsl(142 70% 45%)";
      const prog = img ? ((performance.now() - startRef.current) / 1000 % durationSec) / durationSec : 0;
      ctx.fillRect(0, h - 3, w * prog, 3);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [img, error, durationSec, zoomIntensity]);

  return (
    <div className="space-y-1">
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="w-full aspect-square rounded-md border border-border bg-muted"
      />
      <p className="text-[10px] text-muted-foreground text-center">
        Live preview · {resolution}×{resolution} output · {durationSec}s loop
      </p>
    </div>
  );
}
