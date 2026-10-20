/**
 * Creates an animated promo video from an image using Canvas + MediaRecorder.
 * Applies a smooth Ken Burns (zoom + pan) effect with optional text overlay.
 * Returns a Blob of the video (webm format).
 */

interface PromoVideoOptions {
  imageUrl: string;
  text?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  /** Zoom intensity: 0 = no zoom, 1 = subtle (~1.15x), 2 = strong (~1.45x) */
  zoomIntensity?: number;
}

export async function createPromoVideo({
  imageUrl,
  text = "",
  durationMs = 6000,
  width = 1080,
  height = 1080,
  zoomIntensity = 1,
}: PromoVideoOptions): Promise<Blob> {
  // Load image
  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Setup MediaRecorder
  const stream = canvas.captureStream(30);
  const chunks: Blob[] = [];

  const mimeType = MediaRecorder.isTypeSupported("video/mp4")
    ? "video/mp4"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
    recorder.onerror = () => reject(new Error("Video recording failed"));

    recorder.start();

    const fps = 30;
    const totalFrames = Math.floor((durationMs / 1000) * fps);
    let frame = 0;

    const renderFrame = () => {
      if (frame >= totalFrames) {
        recorder.stop();
        return;
      }

      const progress = frame / totalFrames;
      drawFrame(ctx, img, width, height, progress, text, zoomIntensity);
      frame++;
      requestAnimationFrame(renderFrame);
    };

    renderFrame();
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for video"));
    img.src = url;
  });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  progress: number,
  text: string,
  zoomIntensity: number = 1
) {
  // Ken Burns: slow zoom in + slight pan; zoomIntensity scales the zoom delta
  const zoomStart = 1.0;
  const zoomEnd = 1.0 + 0.25 * Math.max(0, zoomIntensity);
  const zoom = zoomStart + (zoomEnd - zoomStart) * easeInOutCubic(progress);

  const panX = 20 * zoomIntensity * easeInOutCubic(progress);
  const panY = 10 * zoomIntensity * Math.sin(progress * Math.PI);

  ctx.clearRect(0, 0, w, h);
  ctx.save();

  // Center, scale, and pan
  const drawW = w * zoom;
  const drawH = h * zoom;
  const offsetX = (w - drawW) / 2 + panX;
  const offsetY = (h - drawH) / 2 + panY;

  // Draw image covering the canvas
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

  // Gradient overlay at bottom for text
  if (text) {
    const textFadeIn = Math.min(1, progress * 4); // Fade in during first 25%
    const textFadeOut = Math.min(1, (1 - progress) * 4); // Fade out during last 25%
    const textOpacity = Math.min(textFadeIn, textFadeOut);

    const gradient = ctx.createLinearGradient(0, h * 0.55, 0, h);
    gradient.addColorStop(0, `rgba(0,0,0,0)`);
    gradient.addColorStop(0.4, `rgba(0,0,0,${0.6 * textOpacity})`);
    gradient.addColorStop(1, `rgba(0,0,0,${0.85 * textOpacity})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Text
    ctx.globalAlpha = textOpacity;
    const fontSize = Math.floor(w / 22);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    // Word wrap
    const maxWidth = w * 0.85;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = fontSize * 1.3;
    const startY = h - 40 - (lines.length - 1) * lineHeight;

    // Text shadow
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineHeight);
    });

    ctx.shadowColor = "transparent";
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Max 4 lines
  return lines.slice(0, 4);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
