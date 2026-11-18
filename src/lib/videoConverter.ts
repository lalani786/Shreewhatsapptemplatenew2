import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export type VideoConversionProgressCallback = (percent: number, statusText: string) => void;

/**
 * Checks if a byte sequence matches WebM (EBML header: 1A 45 DF A3)
 */
export async function isWebMBytes(blobOrFile: Blob): Promise<boolean> {
  try {
    const slice = blobOrFile.slice(0, 16);
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3;
  } catch {
    return false;
  }
}

/**
 * Checks if a byte sequence matches MP4 (ftyp at offset 4)
 */
export async function isMp4Bytes(blobOrFile: Blob): Promise<boolean> {
  try {
    const slice = blobOrFile.slice(0, 16);
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length < 8) return false;
    // bytes 4-7 should be 'f' 't' 'y' 'p' (0x66 0x74 0x79 0x70)
    return (
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    );
  } catch {
    return false;
  }
}

/**
 * Robust detection of whether the given target (File, Blob, or URL) is a WebM video.
 */
export async function isWebMVideo(input: File | Blob | string | null | undefined): Promise<boolean> {
  if (!input) return false;

  if (typeof input === "string") {
    const clean = input.split("?")[0].toLowerCase();
    if (clean.endsWith(".webm") || input.includes("video/webm")) return true;
    if (input.startsWith("data:video/webm") || input.startsWith("blob:")) {
      try {
        const res = await fetch(input);
        const b = await res.blob();
        return (b.type || "").toLowerCase().includes("webm") || (await isWebMBytes(b));
      } catch {
        return false;
      }
    }
    return false;
  }

  // File or Blob
  if ((input.type || "").toLowerCase().includes("webm")) return true;
  if ("name" in input && typeof (input as File).name === "string") {
    if ((input as File).name.toLowerCase().endsWith(".webm")) return true;
  }
  return await isWebMBytes(input);
}

/**
 * Robust detection of whether the given target is already a valid MP4 video.
 */
export async function isMp4Video(input: File | Blob | string | null | undefined): Promise<boolean> {
  if (!input) return false;

  if (typeof input === "string") {
    const clean = input.split("?")[0].toLowerCase();
    if (clean.endsWith(".mp4") || input.includes("video/mp4")) return true;
    if (input.startsWith("data:video/mp4") || input.startsWith("blob:")) {
      try {
        const res = await fetch(input);
        const b = await res.blob();
        return (b.type || "").toLowerCase().includes("mp4") || (await isMp4Bytes(b));
      } catch {
        return false;
      }
    }
    return false;
  }

  if ((input.type || "").toLowerCase().includes("mp4")) return true;
  if ("name" in input && typeof (input as File).name === "string") {
    if ((input as File).name.toLowerCase().endsWith(".mp4")) return true;
  }
  return await isMp4Bytes(input);
}

/**
 * Initializes and returns a singleton FFmpeg instance.
 */
export async function getFFmpeg(onProgress?: VideoConversionProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      console.debug("[FFmpeg]", message);
    });

    const candidateSources = [
      {
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      },
      {
        coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
        wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
      },
      {
        coreURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
        wasmURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
      },
    ];

    let loaded = false;
    let lastError: any = null;

    for (const src of candidateSources) {
      try {
        onProgress?.(5, "Loading video conversion engine...");
        const coreBlob = await toBlobURL(src.coreURL, "text/javascript");
        const wasmBlob = await toBlobURL(src.wasmURL, "application/wasm");
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading video converter from ${src.coreURL}`)), 10000)
        );
        await Promise.race([
          ffmpeg.load({
            coreURL: coreBlob,
            wasmURL: wasmBlob,
          }),
          timeoutPromise,
        ]);
        loaded = true;
        break;
      } catch (err) {
        console.warn(`[FFmpeg] Failed loading from ${src.coreURL}:`, err);
        lastError = err;
      }
    }

    if (!loaded) {
      loadPromise = null;
      throw new Error(`Failed to initialize video converter: ${lastError?.message || "Check network connection"}`);
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Converts a WebM video (File, Blob, or URL) to a genuine MP4 (H.264/AAC, yuv420p, faststart)
 * compatible with Instagram Reels, Facebook, YouTube, etc.
 * 
 * If the input is already an MP4, returns it directly without unnecessary re-encoding.
 */
export async function convertWebmToMp4(
  input: Blob | File | string,
  onProgress?: VideoConversionProgressCallback
): Promise<File> {
  // Check if it's a URL or string
  let inputBlob: Blob;
  let originalName = "video.mp4";

  if (typeof input === "string") {
    onProgress?.(2, "Fetching video for conversion...");
    const res = await fetch(input);
    if (!res.ok) throw new Error(`Failed to download video: HTTP ${res.status}`);
    inputBlob = await res.blob();
    const urlPath = input.split("?")[0];
    const base = urlPath.substring(urlPath.lastIndexOf("/") + 1) || "video";
    originalName = base.replace(/\.[^/.]+$/, "") + ".mp4";
  } else {
    inputBlob = input;
    if ("name" in input && typeof (input as File).name === "string") {
      const base = (input as File).name.replace(/\.[^/.]+$/, "");
      originalName = `${base}.mp4`;
    }
  }

  // Fast path: If already MP4, do not convert again
  const alreadyMp4 = await isMp4Bytes(inputBlob);
  if (alreadyMp4) {
    if (inputBlob instanceof File && inputBlob.name.toLowerCase().endsWith(".mp4")) {
      return inputBlob;
    }
    return new File([inputBlob], originalName, { type: "video/mp4" });
  }

  // Initialize FFmpeg
  const ffmpeg = await getFFmpeg(onProgress);

  const inputName = `input_${Date.now()}.webm`;
  const outputName = `output_${Date.now()}.mp4`;

  onProgress?.(15, "Reading video into memory...");
  const fileData = await fetchFile(inputBlob);
  await ffmpeg.writeFile(inputName, fileData);

  // Set up progress handler
  const progressHandler = ({ progress }: { progress: number }) => {
    // progress ranges from 0 to 1
    const pct = Math.min(95, Math.max(20, Math.round(20 + progress * 75)));
    onProgress?.(pct, `Transcoding video for Instagram: ${pct}%`);
  };
  ffmpeg.on("progress", progressHandler);

  onProgress?.(25, "Transcoding to Instagram Reels MP4 (H.264 / AAC / yuv420p)...");

  try {
    // Primary Instagram Reels transcoding arguments:
    // -c:v libx264: H.264 video codec
    // -pix_fmt yuv420p: standard 8-bit YUV 4:2:0 format required by IG
    // -preset fast -crf 23: high visual quality with reasonable speed
    // -c:a aac -b:a 128k: standard AAC audio codec
    // -movflags +faststart: moves moov atom to start so video can stream immediately
    let exitCode = await ffmpeg.exec([
      "-i",
      inputName,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputName,
    ]);

    // If transcoding with audio failed (e.g. input has no audio stream and encoder failed),
    // retry with video-only or fallback flags
    if (exitCode !== 0) {
      console.warn("[FFmpeg] Primary transcode exited with code", exitCode, "retrying with fallback flags...");
      exitCode = await ffmpeg.exec([
        "-i",
        inputName,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        outputName,
      ]);
    }

    if (exitCode !== 0) {
      throw new Error(`FFmpeg transcoding failed with exit code ${exitCode}`);
    }

    onProgress?.(96, "Finalizing MP4 file...");
    const data = await ffmpeg.readFile(outputName);
    const mp4Uint8 = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const mp4Blob = new Blob([mp4Uint8.buffer as ArrayBuffer], { type: "video/mp4" });
    const finalFile = new File([mp4Blob], originalName, { type: "video/mp4" });

    onProgress?.(100, "Video successfully converted to MP4!");
    return finalFile;
  } finally {
    // Clean up temporary files in virtual FS
    try {
      await ffmpeg.deleteFile(inputName);
    } catch { /* ignore */ }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch { /* ignore */ }
  }
}

/**
 * Validates that an AI video generation result is a genuine MP4 video file.
 * Throws a clear provider compatibility error if the output is not direct MP4.
 */
export async function assertMp4Video(
  target: Blob | string,
  providerName = "AI Video Provider"
): Promise<void> {
  const valid = await isMp4Video(target);
  if (!valid) {
    throw new Error(
      `Provider "${providerName}" failed output check: Video is not in direct MP4 format. Instagram Reels requires direct MP4 (H.264/AAC, yuv420p).`
    );
  }
}
