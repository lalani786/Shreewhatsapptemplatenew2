import {
  checkNvidiaModelAccess,
  generateNvidiaChatCompletion,
  analyzeImageWithNvidiaVision,
  getStoredNvidiaApiKey,
  NVIDIA_IMAGE_MODEL_IDS,
  NVIDIA_TEXT_MODEL_IDS,
  NVIDIA_VIDEO_MODEL_IDS,
  NVIDIA_ALL_REQUIRED_MODEL_IDS,
  type NvidiaModelAccess,
  type NvidiaModelStatusState,
  type NvidiaChatMessage,
} from "./nvidiaService";

export {
  generateNvidiaChatCompletion,
  analyzeImageWithNvidiaVision,
  getStoredNvidiaApiKey,
  NVIDIA_IMAGE_MODEL_IDS,
  NVIDIA_TEXT_MODEL_IDS,
  NVIDIA_VIDEO_MODEL_IDS,
  NVIDIA_ALL_REQUIRED_MODEL_IDS,
  type NvidiaModelAccess,
  type NvidiaModelStatusState,
  type NvidiaChatMessage,
};

export async function runNvidiaAccessCheck(
  modelIds: string[] = NVIDIA_ALL_REQUIRED_MODEL_IDS,
  apiKeyOverride?: string,
): Promise<NvidiaModelAccess[]> {
  const results = await checkNvidiaModelAccess(apiKeyOverride);
  if (!modelIds || modelIds.length === 0) return results;
  const set = new Set(modelIds);
  return results.filter((r) => set.has(r.id) || set.has(r.label));
}

export function hasNvidiaFluxAccess(results: NvidiaModelAccess[]): boolean {
  return results.some(
    (r) =>
      (r.id === "flux-3-image-klein" ||
        r.id === "flux.1-schnell" ||
        r.label.toLowerCase().includes("flux")) &&
      r.access === "granted",
  );
}

export function hasNvidiaImageAccess(results: NvidiaModelAccess[]): boolean {
  return results.some(
    (r) =>
      (r.type === "Image" || r.id === "flux.1-schnell" || r.label.toLowerCase().includes("flux")) &&
      r.access === "granted",
  );
}

export function hasNvidiaVideoAccess(results: NvidiaModelAccess[]): boolean {
  return results.some((r) => r.type === "Video" && r.access === "granted");
}

export function hasNvidiaTextAccess(results: NvidiaModelAccess[]): boolean {
  return results.some(
    (r) =>
      (r.type === "Text/Reasoning" || r.id === "nemotron-3-nano-omni" || r.label.includes("nemotron")) &&
      r.access === "granted",
  );
}

export function getNvidiaAccessFailureSummary(results: NvidiaModelAccess[]) {
  const missing = results.filter((result) => result.access !== "granted");
  if (missing.length === 0) return "";

  return missing
    .map((result) => `${result.label}: ${result.reason}`)
    .join(" | ");
}