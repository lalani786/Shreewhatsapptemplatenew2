/**
 * Creates an animated promo video from an image using Canvas + MediaRecorder.
 * Applies a smooth Ken Burns (zoom + pan) effect with optional text overlay.
 * Returns a direct MP4 Blob (video/mp4, H.264, yuv420p, faststart)
 * compliant with Instagram Reels, Facebook, YouTube, and other platforms.
 */

import { convertWebmToMp4 } from "./videoConverter";

interface PromoVideoOptions {
  imageUrl?: string;
  videoUrl?: string;
  videoBlob?: Blob;
  text?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  /** Zoom intensity: 0 = no zoom, 1 = subtle (~1.15x), 2 = strong (~1.45x) */
  zoomIntensity?: number;
  isRTL?: boolean;
}

export async function createPromoVideo({
  imageUrl,
  videoUrl,
  videoBlob,
  text = "",
  durationMs = 15000,
  width = 1080,
  height = 1080,
  zoomIntensity = 1,
  isRTL,
}: PromoVideoOptions): Promise<Blob> {
  let mediaSource: HTMLVideoElement | HTMLImageElement;
  let tempBlobUrl: string | null = null;

  if (videoBlob) {
    tempBlobUrl = URL.createObjectURL(videoBlob);
    mediaSource = await loadVideo(tempBlobUrl);
  } else if (videoUrl) {
    mediaSource = await loadVideo(videoUrl);
  } else if (imageUrl) {
    mediaSource = await loadImage(imageUrl);
  } else {
    throw new Error("No video or image source provided for promo video");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Setup stream capture
  const stream = canvas.captureStream(30);
  const chunks: Blob[] = [];

  const mimeCandidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  let captureMime = "video/webm";
  for (const c of mimeCandidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      captureMime = c;
      break;
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: captureMime,
    videoBitsPerSecond: 4_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (tempBlobUrl) {
        try { URL.revokeObjectURL(tempBlobUrl); } catch {}
      }
      if (mediaSource instanceof HTMLVideoElement) {
        try {
          mediaSource.pause();
          mediaSource.src = "";
          mediaSource.load();
        } catch {}
      }
    };

    const maxWaitMs = Math.max(30000, durationMs + 20000);
    const timeoutTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        try { recorder.stop(); } catch {}
        reject(new Error("Promo video rendering timed out. Please try again."));
      }
    }, maxWaitMs);

    const safeResolve = (b: Blob) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutTimer);
        cleanup();
        resolve(b);
      }
    };

    const safeReject = (err: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutTimer);
        cleanup();
        reject(err);
      }
    };

    recorder.onstop = async () => {
      try {
        const rawBlob = new Blob(chunks, { type: captureMime });
        // If already MP4 from native MediaRecorder, return immediately without unnecessary transcoding
        if (captureMime.startsWith("video/mp4") || rawBlob.type.startsWith("video/mp4")) {
          safeResolve(new Blob(chunks, { type: "video/mp4" }));
          return;
        }

        // Otherwise transcode WebM to MP4 with timeout
        const mp4File = await convertWebmToMp4(rawBlob);
        const mp4Blob = new Blob([await mp4File.arrayBuffer()], { type: "video/mp4" });
        safeResolve(mp4Blob);
      } catch (err) {
        safeReject(
          new Error(
            `Failed to generate direct MP4 promo video: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    };
    recorder.onerror = () => safeReject(new Error("Video recording failed"));

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
      drawFrame(ctx, mediaSource, width, height, progress, text, zoomIntensity, isRTL);
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

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    (video as any).defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;

    let resolved = false;
    const cleanup = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    };

    const onReady = async () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      try {
        await video.play();
      } catch (err) {
        console.warn("Video play error (can continue frame capture):", err);
      }
      resolve(video);
    };

    const onError = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error("Failed to load video element for animation"));
    };

    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);

    if (video.readyState >= 2) {
      onReady();
      return;
    }

    video.src = url;
    video.load();
  });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement,
  w: number,
  h: number,
  progress: number,
  text: string,
  zoomIntensity: number = 1,
  forceRTL?: boolean
) {
  const isVideo = source instanceof HTMLVideoElement;
  ctx.clearRect(0, 0, w, h);
  ctx.save();

  if (isVideo) {
    const video = source as HTMLVideoElement;
    const vW = video.videoWidth || w;
    const vH = video.videoHeight || h;
    const vAspect = vW / vH;
    const canvasAspect = w / h;
    let sx = 0, sy = 0, sw = vW, sh = vH;
    if (vAspect > canvasAspect) {
      sw = vH * canvasAspect;
      sx = (vW - sw) / 2;
    } else {
      sh = vW / canvasAspect;
      sy = (vH - sh) / 2;
    }
    // Render the active animated video frame directly to canvas
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    const img = source as HTMLImageElement;
    // Ken Burns: slow zoom in + slight pan; zoomIntensity scales the zoom delta
    const zoomStart = 1.0;
    const zoomEnd = 1.0 + 0.25 * Math.max(0, zoomIntensity);
    const zoom = zoomStart + (zoomEnd - zoomStart) * easeInOutCubic(progress);

    const panX = 20 * zoomIntensity * easeInOutCubic(progress);
    const panY = 10 * zoomIntensity * Math.sin(progress * Math.PI);

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
  }

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
    const rtl = forceRTL ?? /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.font = `bold ${fontSize}px 'Segoe UI', 'Noto Sans', Tahoma, sans-serif`;
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
