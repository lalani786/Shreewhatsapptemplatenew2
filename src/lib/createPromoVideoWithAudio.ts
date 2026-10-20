/**
 * Creates a promo video (Ken Burns animated image) WITH mixed audio:
 * an optional voiceover layered over optional background music.
 * Returns a webm Blob containing video + audio.
 */

interface PromoVideoAudioOptions {
  imageUrl: string;
  text?: string;
  voiceAudioBase64?: string; // mp3 base64
  musicAudioBase64?: string; // mp3 base64
  musicVolume?: number; // 0-1, default 0.25 when voice present, 0.7 otherwise
  voiceVolume?: number; // 0-1, default 1.0
  width?: number;
  height?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
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
  text: string
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
    ctx.font = `bold ${fontSize}px sans-serif`;
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
    minDurationMs = 6000,
    maxDurationMs = 30000,
  } = opts;

  const img = await loadImage(imageUrl);

  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();

  // Decode audio
  let voiceBuffer: AudioBuffer | null = null;
  let musicBuffer: AudioBuffer | null = null;
  if (voiceAudioBase64) {
    try {
      voiceBuffer = await audioCtx.decodeAudioData(base64ToArrayBuffer(voiceAudioBase64));
    } catch (e) {
      console.warn("Voice decode failed", e);
    }
  }
  if (musicAudioBase64) {
    try {
      musicBuffer = await audioCtx.decodeAudioData(base64ToArrayBuffer(musicAudioBase64));
    } catch (e) {
      console.warn("Music decode failed", e);
    }
  }

  // Determine duration
  const voiceDur = voiceBuffer ? voiceBuffer.duration * 1000 : 0;
  const musicDur = musicBuffer ? musicBuffer.duration * 1000 : 0;
  const targetDurMs = Math.min(
    maxDurationMs,
    Math.max(minDurationMs, voiceDur || musicDur || minDurationMs)
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
  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mimeType = MediaRecorder.isTypeSupported("video/mp4")
    ? "video/mp4"
    : MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,opus")
      ? "video/mp4;codecs=avc1,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";

  const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      try { audioCtx.close(); } catch { /* ignore */ }
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = () => reject(new Error("Recording failed"));

    recorder.start();
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
      drawFrame(ctx, img, width, height, progress, text);
      frame++;
      requestAnimationFrame(renderFrame);
    };
    renderFrame();
  });
}
