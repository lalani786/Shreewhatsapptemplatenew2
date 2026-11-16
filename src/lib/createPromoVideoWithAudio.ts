/**
 * Creates a promo video (Ken Burns animated image) WITH mixed audio:
 * an optional voiceover layered over optional background music.
 * Returns a direct MP4 Blob (video/mp4, H.264, AAC, yuv420p, faststart)
 * compliant with Instagram Reels, Facebook, YouTube, and other platforms.
 */

import { convertWebmToMp4 } from "./videoConverter";

interface PromoVideoAudioOptions {
  imageUrl: string;
  text?: string;
  voiceAudioBase64?: string; // mp3 base64 or data URI or URL
  musicAudioBase64?: string; // mp3 base64 or data URI or URL
  musicVolume?: number; // 0-1, default 0.25 when voice present, 0.7 otherwise
  voiceVolume?: number; // 0-1, default 1.0
  width?: number;
  height?: number;
  durationMs?: number; // Explicit duration in ms
  minDurationMs?: number;
  maxDurationMs?: number;
  isRTL?: boolean;
}

async function audioSourceToArrayBuffer(src: string): Promise<ArrayBuffer> {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:")) {
    const res = await fetch(src);
    return await res.arrayBuffer();
  }
  // Strip data URI header if present (e.g. data:audio/mpeg;base64,) and clean whitespace
  const clean = (src.includes(",") ? src.split(",")[1] : src).replace(/[^A-Za-z0-9+/=]/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  progress: number,
  text: string,
  forceRTL?: boolean
) {
  const zoom = 1.0 + 0.25 * easeInOutCubic(progress);
  const panX = 20 * easeInOutCubic(progress);
  const panY = 10 * Math.sin(progress * Math.PI);

  ctx.clearRect(0, 0, w, h);
  ctx.save();

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

  if (text) {
    const fadeIn = Math.min(1, progress * 4);
    const fadeOut = Math.min(1, (1 - progress) * 4);
    const opacity = Math.min(fadeIn, fadeOut);

    const grad = ctx.createLinearGradient(0, h * 0.55, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.4, `rgba(0,0,0,${0.6 * opacity})`);
    grad.addColorStop(1, `rgba(0,0,0,${0.85 * opacity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = opacity;
    const fontSize = Math.floor(w / 22);
    const rtl = forceRTL ?? /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.font = `bold ${fontSize}px 'Segoe UI', 'Noto Sans', Tahoma, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const lines = wrapText(ctx, text, w * 0.85);
    const lineHeight = fontSize * 1.3;
    const startY = h - 40 - (lines.length - 1) * lineHeight;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lineHeight));
    ctx.shadowColor = "transparent";
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export async function createPromoVideoWithAudio(opts: PromoVideoAudioOptions): Promise<Blob> {
  const {
    imageUrl,
    text = "",
    voiceAudioBase64,
    musicAudioBase64,
    width = 1080,
    height = 1080,
    durationMs,
    minDurationMs = 5000,
    maxDurationMs = 60000,
    isRTL,
  } = opts;

  const img = await loadImage(imageUrl);

  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch (e) {
      console.warn("AudioContext resume error:", e);
    }
  }

  // Decode audio
  let voiceBuffer: AudioBuffer | null = null;
  let musicBuffer: AudioBuffer | null = null;

  if (voiceAudioBase64) {
    try {
      const buf = await audioSourceToArrayBuffer(voiceAudioBase64);
      if (buf.byteLength > 0) {
        voiceBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          audioCtx.decodeAudioData(buf.slice(0), resolve, reject);
        });
        console.log("Voice audio decoded successfully. Duration:", voiceBuffer.duration.toFixed(2), "s");
      }
    } catch (e) {
      console.warn("Voice decode failed with callback, trying Promise:", e);
      try {
        const buf = await audioSourceToArrayBuffer(voiceAudioBase64);
        voiceBuffer = await audioCtx.decodeAudioData(buf);
      } catch (e2) {
        console.error("AudioContext decodeAudioData error for voice:", e2);
      }
    }
  }

  if (musicAudioBase64) {
    try {
      const buf = await audioSourceToArrayBuffer(musicAudioBase64);
      if (buf.byteLength > 0) {
        musicBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          audioCtx.decodeAudioData(buf.slice(0), resolve, reject);
        });
        console.log("Music audio decoded successfully. Duration:", musicBuffer.duration.toFixed(2), "s");
      }
    } catch (e) {
      try {
        const buf = await audioSourceToArrayBuffer(musicAudioBase64);
        musicBuffer = await audioCtx.decodeAudioData(buf);
      } catch (e2) {
        console.warn("AudioContext decodeAudioData error for music:", e2);
      }
    }
  }

  // Determine duration
  const voiceDur = voiceBuffer ? voiceBuffer.duration * 1000 : 0;
  const musicDur = musicBuffer ? musicBuffer.duration * 1000 : 0;
  const targetDurMs = durationMs
    ? durationMs
    : Math.min(
        maxDurationMs,
        Math.max(minDurationMs, voiceDur ? Math.ceil(voiceDur + 800) : (musicDur || minDurationMs))
      );

  // Audio graph -> MediaStreamDestination
  const dest = audioCtx.createMediaStreamDestination();
  const hasVoice = !!voiceBuffer;
  const musicVolume = opts.musicVolume ?? (hasVoice ? 0.25 : 0.7);
  const voiceVolume = opts.voiceVolume ?? 1.0;

  if (musicBuffer) {
    const src = audioCtx.createBufferSource();
    src.buffer = musicBuffer;
    src.loop = musicBuffer.duration * 1000 < targetDurMs;
    const gain = audioCtx.createGain();
    gain.gain.value = musicVolume;
    src.connect(gain).connect(dest);
    src.start(0);
    src.stop(audioCtx.currentTime + targetDurMs / 1000);
  }

  if (voiceBuffer) {
    const src = audioCtx.createBufferSource();
    src.buffer = voiceBuffer;
    const gain = audioCtx.createGain();
    gain.gain.value = voiceVolume;
    src.connect(gain).connect(dest);
    src.start(0);
  }

  // Canvas + recorder
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const fps = 30;
  const videoStream = canvas.captureStream(fps);
  const audioTracks = dest.stream.getAudioTracks();
  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioTracks,
  ]);

  const mimeCandidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1,opus",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  let mimeType = "video/webm";
  for (const c of mimeCandidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      mimeType = c;
      break;
    }
  }

  const recorder = new MediaRecorder(combined, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const maxWaitMs = Math.max(35000, targetDurMs + 25000);
    const timeoutTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { audioCtx.close(); } catch {}
        try { recorder.stop(); } catch {}
        reject(new Error("AI video with audio rendering timed out. Please try again."));
      }
    }, maxWaitMs);

    const safeResolve = (b: Blob) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutTimer);
        try { audioCtx.close(); } catch {}
        resolve(b);
      }
    };

    const safeReject = (err: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutTimer);
        try { audioCtx.close(); } catch {}
        reject(err);
      }
    };

    recorder.onstop = async () => {
      try {
        const rawBlob = new Blob(chunks, { type: mimeType });
        // If native MediaRecorder recorded MP4 directly, return immediately without unnecessary transcoding
        if (mimeType.startsWith("video/mp4") || rawBlob.type.startsWith("video/mp4")) {
          safeResolve(new Blob(chunks, { type: "video/mp4" }));
          return;
        }

        // Transcode WebM to Instagram-compliant MP4 (H.264 / AAC / yuv420p / faststart)
        const mp4File = await convertWebmToMp4(rawBlob);
        const mp4Blob = new Blob([await mp4File.arrayBuffer()], { type: "video/mp4" });
        safeResolve(mp4Blob);
      } catch (err) {
        safeReject(
          new Error(
            `Failed to generate direct MP4 video with audio: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    };
    recorder.onerror = () => safeReject(new Error("Video recording failed"));

    recorder.start(250);
    const totalFrames = Math.floor((targetDurMs / 1000) * fps);
    let frame = 0;
    const startTime = performance.now();

    const renderFrame = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= targetDurMs || frame >= totalFrames) {
        try { recorder.stop(); } catch { /* ignore */ }
        return;
      }
      const progress = Math.min(1, elapsed / targetDurMs);
      drawFrame(ctx, img, width, height, progress, text, isRTL);
      frame++;
      requestAnimationFrame(renderFrame);
    };
    renderFrame();
  });
}
