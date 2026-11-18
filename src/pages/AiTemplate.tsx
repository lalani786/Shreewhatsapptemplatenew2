import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Copy,
  Save,
  Loader2,
  Image,
  MessageSquare,
  ImagePlus,
  Palette,
  FileText,
  Video,
  CheckCircle,
  Wand2,
  Share2,
  Send,
  ExternalLink,
  Film,
  Mic,
  Volume2,
  Download,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Globe,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { optimizeMarketingImagePrompt } from "@/lib/promptOptimizer";
import DirectSocialPostDialog from "@/components/social/DirectSocialPostDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  VideoDuration,
  VideoAspectRatio,
  VideoQuality,
  VIDEO_DURATIONS,
  VIDEO_ASPECT_RATIOS,
  getVideoDimensions,
  SUPPORTED_LANGUAGES,
  SUPPORTED_VOICES,
  getVoicesForLanguage,
  isRtlLanguage,
  getScriptPromptGuidance,
  VoiceOption,
} from "@/types/ai.types";
import { createPromoVideo } from "@/lib/createPromoVideo";
import { createPromoVideoWithAudio } from "@/lib/createPromoVideoWithAudio";
import { assertMp4Video } from "@/lib/videoConverter";
import {
  getNvidiaAccessFailureSummary,
  hasNvidiaFluxAccess,
  hasNvidiaImageAccess,
  NVIDIA_IMAGE_MODEL_IDS,
  NvidiaModelAccess,
  runNvidiaAccessCheck,
  generateNvidiaChatCompletion,
  getStoredNvidiaApiKey,
} from "@/lib/nvidiaAccess";
import { generateNvidiaImage } from "@/lib/nvidiaService";
import {
  loadPollinationsApiKeyFromSupabase,
  getStoredPollinationsApiKey,
} from "@/lib/pollinationsKey";
import { synthesizeVoiceAudio, validateScriptForLanguage } from "@/lib/voiceSynthesis";
import {
  DEFAULT_LEGACY_POLLINATIONS_MODEL,
  POLLINATIONS_MODELS,
  PollinationsImageError,
  createPollinationsSeed,
  generatePollinationsImage,
  getDefaultModelForEndpoint,
  getModelsForEndpoint,
  isPollinationsModelAvailable,
  resolvePollinationsEndpoint,
  type PollinationsEndpoint,
  type PollinationsRequestDebug,
} from "@/lib/pollinationsImage";

type ContentType = "poster" | "prompt_only" | "video";
type ImageProvider =
  | "auto"
  | "lovable_ai"
  | "pollinations"
  | "stability"
  | "leonardo"
  | "nvidia"
  | "cosmos"
  | "pexels"
  | "runway"
  | "veo";

interface ImageProviderOption {
  id: ImageProvider;
  label: string;
  keyName: string;
  description: string;
}

const imageProviders: ImageProviderOption[] = [
  { id: "auto", label: "Automatic (Fallback)", keyName: "", description: "Tries Runway → Veo → Pexels → NVIDIA → Pollinations" },
  { id: "runway", label: "Runway Gen-3 (AI Video)", keyName: "runway_api_key", description: "Real AI Image-to-Video & 360° motion" },
  { id: "veo", label: "Google Veo 3.1 / 2 (Cinematic Video)", keyName: "gemini_api_key", description: "Google Flow quality video generation" },
  { id: "pexels", label: "Pexels Stock Video", keyName: "pexels_api_key", description: "Commercial HD/4K Video Clips" },
  { id: "pollinations", label: "Pollinations.ai", keyName: "pollinations_api_key", description: "High-quality image catalog (Flux/Turbo)" },
  { id: "nvidia", label: "NVIDIA AI (Free)", keyName: "nvidia_api_key", description: "Free NIM image generation" },
  { id: "stability", label: "Stability AI", keyName: "stability_api_key", description: "SDXL / SD3 commercial images" },
  { id: "cosmos", label: "NVIDIA Cosmos", keyName: "nvidia_api_key", description: "NVIDIA Cosmos foundation model" },
  { id: "leonardo", label: "Leonardo AI", keyName: "leonardo_api_key", description: "Creative images" },
  { id: "lovable_ai", label: "Shree AI Engine", keyName: "", description: "Built-in AI (Gemini)" },
];

/** A/B comparison result entry (dev-only debug panel). */
interface PollinationsAbResult {
  model: string;
  imageUrl?: string;
  debug?: PollinationsRequestDebug;
  error?: string;
}

/** Controlled dimensions for the Pollinations request (no provider defaults). */
function getPollinationsDimensions(platform?: string, videoAspect?: VideoAspectRatio): { width: number; height: number; aspectRatio: string } {
  if (videoAspect) {
    if (videoAspect === "16:9") return { width: 1920, height: 1080, aspectRatio: "16:9" };
    if (videoAspect === "9:16") return { width: 1080, height: 1920, aspectRatio: "9:16" };
    return { width: 1080, height: 1080, aspectRatio: "1:1" };
  }
  const landscape = platform === "facebook" || platform === "linkedin" || platform === "x";
  return landscape
    ? { width: 1536, height: 1024, aspectRatio: "3:2" }
    : { width: 1024, height: 1024, aspectRatio: "1:1" };
}

/** Interprets an A/B run: prompt-not-received vs model-quality vs wrong-model. */
function describeAbComparison(results: PollinationsAbResult[]): string {
  if (results.length < 2) return "";
  if (results.some((r) => r.debug && !r.debug.promptMatchesRequestUrl)) {
    return "Prompt fidelity check FAILED for at least one request - the URL did not carry the exact prompt.";
  }
  if (results.every((r) => r.error)) {
    return "Both models failed - see the per-model error above (rate limit or missing key access).";
  }
  if (results.every((r) => r.imageUrl) && results.every((r) => r.debug?.model === results[0].debug?.model)) {
    return "Both requests used the SAME model - pick two different models to isolate model quality.";
  }
  if (results.every((r) => r.imageUrl)) {
    return "Both models received the identical prompt, dimensions and seed. Any visual difference is model quality/instruction-following, not ShreeTemplate's request.";
  }
  return "Only one model returned an image - check the failing model's status above.";
}

const contentTypes = [
  { id: "poster" as ContentType, label: "Poster", description: "Image + message template", icon: Palette },
  { id: "prompt_only" as ContentType, label: "Prompt Only", description: "Text message template", icon: FileText },
  { id: "video" as ContentType, label: "Video Template", description: "Video promo script", icon: Video },
];

const businessTypes = [
  "Retail Store",
  "Restaurant",
  "E-commerce",
  "Healthcare",
  "Education",
  "Real Estate",
  "Fashion",
  "Electronics",
  "Jewelry",
  "Grocery",
  "Other",
];

const occasions = [
  "Diwali",
  "Holi",
  "Eid",
  "Christmas",
  "New Year",
  "Independence Day",
  "Republic Day",
  "Navratri",
  "Durga Puja",
  "Ganesh Chaturthi",
  "Raksha Bandhan",
  "Valentine's Day",
  "Mother's Day",
  "Father's Day",
  "Summer Sale",
  "Winter Sale",
  "Black Friday",
  "Flash Sale",
  "Clearance",
  "Custom",
];

export default function AiTemplate() {
  const navigate = useNavigate();
  const [socialPostOpen, setSocialPostOpen] = useState(false);
  const [socialPostMediaType, setSocialPostMediaType] = useState<"image" | "video">("image");
  const [contentType, setContentType] = useState<ContentType>("poster");
  const [imageProvider, setImageProvider] = useState<ImageProvider>("auto");
  const [textProvider, setTextProvider] = useState<"lovable_ai" | "gemini" | "nvidia">("gemini");
  const [availableKeys, setAvailableKeys] = useState<Record<string, boolean>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    businessType: "",
    productCategory: "",
    discount: [0],
    occasion: "",
    customPrompt: "",
  });
  const [generatedContent, setGeneratedContent] = useState({
    template: "",
    imagePrompt: "",
    generatedImage: "",
  });
  const [nvidiaChecking, setNvidiaChecking] = useState(false);
  const [nvidiaResults, setNvidiaResults] = useState<NvidiaModelAccess[] | null>(null);
  const [templateName, setTemplateName] = useState("");

  // Pollinations image generation: explicit model + request/debug state.
  const [pollinationsModel, setPollinationsModel] = useState<string>("");
  const [pollinationsApiKey, setPollinationsApiKey] = useState<string>("");
  const [imageDebug, setImageDebug] = useState<PollinationsRequestDebug | null>(null);
  const [abModelB, setAbModelB] = useState<string>("");
  const [abResults, setAbResults] = useState<PollinationsAbResult[]>([]);
  const [isComparingModels, setIsComparingModels] = useState(false);

  // Video Configuration & Multilingual Voiceover State
  const [videoDuration, setVideoDuration] = useState<VideoDuration>(15);
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("1080p");
  const [voiceoverLanguage, setVoiceoverLanguage] = useState<string>("hi-IN");
  const [voiceGender, setVoiceGender] = useState<"male" | "female">("female");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("hi-female-1");
  const [videoVoiceoverText, setVideoVoiceoverText] = useState<string>("");
  const [videoVoiceoverAudio, setVideoVoiceoverAudio] = useState<string | null>(null);
  const [videoVoiceoverScript, setVideoVoiceoverScript] = useState<string | null>(null);
  const [userElevenLabsKey, setUserElevenLabsKey] = useState<string>("");
  const [userRunwayKey, setUserRunwayKey] = useState<string>("");
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [isDownloadingVoice, setIsDownloadingVoice] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideoBlob, setGeneratedVideoBlob] = useState<Blob | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const hasPollinationsKey = Boolean(pollinationsApiKey);
  const pollinationsEndpoint: PollinationsEndpoint = resolvePollinationsEndpoint(hasPollinationsKey);
  const pollinationsModelOptions = getModelsForEndpoint(pollinationsEndpoint);
  // Selected model is always shown in the UI - it is never silently swapped.
  const selectedPollinationsModel = pollinationsModel || getDefaultModelForEndpoint(pollinationsEndpoint);

  const fetchAvailableKeys = useCallback(async () => {
    // 1. Immediately read client localStorage so keys show active without delay
    const localNvd = localStorage.getItem("nvidia_api_key")?.trim() || "";
    const localStability = localStorage.getItem("stability_api_key")?.trim() || "";
    const localLeonardo = localStorage.getItem("leonardo_api_key")?.trim() || "";
    const localRunway = localStorage.getItem("runway_api_key")?.trim() || "";
    const localPexels = localStorage.getItem("pexels_api_key")?.trim() || "";
    const localPoll = localStorage.getItem("pollinations_api_key")?.trim() || "";
    const localGemini = localStorage.getItem("gemini_api_key")?.trim() || "";
    const localEleven = localStorage.getItem("elevenlabs_api_key")?.trim() || "";

    if (localRunway) setUserRunwayKey(localRunway);
    if (localPoll) setPollinationsApiKey(localPoll);
    if (localEleven) setUserElevenLabsKey(localEleven);

    setAvailableKeys(prev => ({
      ...prev,
      nvidia_api_key: Boolean(localNvd || prev.nvidia_api_key),
      stability_api_key: Boolean(localStability || prev.stability_api_key),
      leonardo_api_key: Boolean(localLeonardo || prev.leonardo_api_key),
      runway_api_key: Boolean(localRunway || prev.runway_api_key),
      pexels_api_key: Boolean(localPexels || prev.pexels_api_key),
      pollinations_api_key: Boolean(localPoll || prev.pollinations_api_key),
      gemini_api_key: Boolean(localGemini || prev.gemini_api_key),
      elevenlabs_api_key: Boolean(localEleven || prev.elevenlabs_api_key),
    }));

    // 2. Fetch Pollinations key from dedicated Supabase table (ai_api_keys)
    let pollKey = localPoll;
    try {
      const fetchedPollKey = await loadPollinationsApiKeyFromSupabase();
      if (fetchedPollKey) {
        pollKey = fetchedPollKey;
        setPollinationsApiKey(fetchedPollKey);
        setAvailableKeys(prev => ({ ...prev, pollinations_api_key: true }));
      }
    } catch (e) {
      console.warn("Pollinations key fetch warning:", e);
    }

    // 3. Fetch from Supabase api_credentials with safe select("*")
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("api_credentials")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data && !error) {
        const creds = data as any;
        if (creds.elevenlabs_api_key) {
          setUserElevenLabsKey(creds.elevenlabs_api_key);
        }
        const effRunway = (creds.runway_api_key as string)?.trim() || localRunway;
        if (effRunway) {
          setUserRunwayKey(effRunway);
        }

        setAvailableKeys(prev => ({
          ...prev,
          stability_api_key: Boolean(creds.stability_api_key || localStability),
          leonardo_api_key: Boolean(creds.leonardo_api_key || localLeonardo),
          gemini_api_key: Boolean(creds.gemini_api_key),
          nvidia_api_key: Boolean(creds.nvidia_api_key || localNvd),
          elevenlabs_api_key: Boolean(creds.elevenlabs_api_key),
          runway_api_key: Boolean(effRunway),
          pexels_api_key: Boolean(creds.pexels_api_key || localPexels),
          pollinations_api_key: Boolean(creds.pollinations_api_key || pollKey || localPoll || prev.pollinations_api_key),
        }));
        setTextProvider("gemini");
      }
    } catch (err) {
      console.warn("api_credentials fetch warning:", err);
    }
  }, []);

  useEffect(() => {
    void fetchAvailableKeys();
  }, [fetchAvailableKeys]);

  useEffect(() => {
    const handleKeyRefresh = () => {
      void fetchAvailableKeys();
    };
    window.addEventListener("focus", handleKeyRefresh);
    window.addEventListener("storage", handleKeyRefresh);
    window.addEventListener("pollinations-key-updated", handleKeyRefresh);
    window.addEventListener("image-keys-updated", handleKeyRefresh);
    return () => {
      window.removeEventListener("focus", handleKeyRefresh);
      window.removeEventListener("storage", handleKeyRefresh);
      window.removeEventListener("pollinations-key-updated", handleKeyRefresh);
      window.removeEventListener("image-keys-updated", handleKeyRefresh);
    };
  }, [fetchAvailableKeys]);

  // Auto-select first available external provider
  useEffect(() => {
    if (imageProvider !== "auto") return;
    const externalProviders: { id: ImageProvider; key: string }[] = [
      { id: "nvidia", key: "nvidia_api_key" },
      { id: "stability", key: "stability_api_key" },
      { id: "leonardo", key: "leonardo_api_key" },
      { id: "pollinations", key: "pollinations_api_key" },
    ];
    const available = externalProviders.find(p => availableKeys[p.key]);
    if (available) {
      setImageProvider(available.id);
    }
  }, [availableKeys, imageProvider]);

  const handleCheckNvidiaImageAccess = async (showSuccess = true) => {
    const key = (await getStoredNvidiaApiKey()) || localStorage.getItem("nvidia_api_key") || "";
    if (!key) {
      toast.error("NVIDIA API key not configured. Add it in API Setup.");
      return false;
    }

    setNvidiaChecking(true);
    try {
      const results = await runNvidiaAccessCheck(NVIDIA_IMAGE_MODEL_IDS, key);
      setNvidiaResults(results);

      const fluxGranted = hasNvidiaFluxAccess(results);
      const anyImageGranted = hasNvidiaImageAccess(results);

      if (fluxGranted || anyImageGranted) {
        if (showSuccess) {
          toast.success("NVIDIA FLUX.1-schnell access verified and ready.");
        }
        return true;
      }

      toast.warning("NVIDIA image models unavailable", {
        description: `${getNvidiaAccessFailureSummary(results)}. Generation will use Pollinations AI fallback.`,
      });
      return false;
    } catch (err: any) {
      toast.error(err?.message || "Could not check NVIDIA model access");
      return false;
    } finally {
      setNvidiaChecking(false);
    }
  };

  const handleLanguageChange = (newLangId: string) => {
    setVoiceoverLanguage(newLangId);
    const voices = getVoicesForLanguage(newLangId, voiceGender);
    if (voices.length > 0) {
      setSelectedVoiceId(voices[0].id);
    }
    // Invalidate previous language audio and script caches! Never reuse Hindi audio for Gujarati, Urdu or Arabic!
    setVideoVoiceoverAudio(null);
    setVideoVoiceoverScript(null);
    setGeneratedVideoBlob(null);
    setGeneratedVideoUrl(null);
    if (voicePreviewAudioRef.current) {
      try {
        voicePreviewAudioRef.current.pause();
      } catch { }
      voicePreviewAudioRef.current = null;
    }
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.id === newLangId);
    toast.info(`Language set to ${langObj?.label || newLangId}. Audio & video cache cleared.`);

    // If script is present, ensure it matches native writing system
    const currentScript = (videoVoiceoverText || generatedContent.template || "").trim();
    if (currentScript) {
      const scriptCheck = validateScriptForLanguage(currentScript, newLangId);
      if (!scriptCheck.isValid) {
        // Regenerate template with authentic native writing system
        const fallback = generateSmartFallbackTemplate({
          businessType: formData.businessType || "Retail Store",
          productCategory: formData.productCategory,
          discount: formData.discount[0],
          occasion: formData.occasion || "Celebration",
          customPrompt: formData.customPrompt,
          isVideo: contentType === "video",
          videoDuration,
          aspectRatio: videoAspectRatio,
          language: newLangId,
          gender: voiceGender,
        });
        if (fallback.template) {
          setVideoVoiceoverText(fallback.template);
          setGeneratedContent((prev) => ({ ...prev, template: fallback.template }));
          toast.success(`Voiceover script updated to native ${langObj?.nativeName || newLangId}!`);
        }
      }
    }
  };

  const handleGenderChange = (newGender: "male" | "female") => {
    setVoiceGender(newGender);
    const voices = getVoicesForLanguage(voiceoverLanguage, newGender);
    if (voices.length > 0) {
      setSelectedVoiceId(voices[0].id);
    }
    // Invalidate audio cache on voice change
    setVideoVoiceoverAudio(null);
    setVideoVoiceoverScript(null);

    if (contentType === "video" && formData.businessType) {
      const fallback = generateSmartFallbackTemplate({
        businessType: formData.businessType,
        productCategory: formData.productCategory,
        discount: formData.discount[0],
        occasion: formData.occasion || "Celebration",
        customPrompt: formData.customPrompt,
        isVideo: true,
        videoDuration,
        aspectRatio: videoAspectRatio,
        language: voiceoverLanguage,
        gender: newGender,
      });
      if (fallback.template) {
        setVideoVoiceoverText(fallback.template);
        setGeneratedContent((prev) => ({ ...prev, template: fallback.template }));
      }
    }
    toast.info(`Voice persona changed to ${newGender === "male" ? "Male" : "Female"}`);
  };

  const handleAspectRatioChange = (newRatio: VideoAspectRatio) => {
    setVideoAspectRatio(newRatio);
    // Synchronize aspect ratio in imagePrompt if already generated
    setGeneratedContent((prev) => {
      if (!prev.imagePrompt) return prev;
      let updated = prev.imagePrompt;
      const newCfg = VIDEO_ASPECT_RATIOS[newRatio];
      const newLabel = `${newCfg.label} (${newCfg.width}x${newCfg.height})`;

      const oldRatios = ["16:9", "9:16", "1:1"];
      for (const r of oldRatios) {
        const rRegex = new RegExp(`aspect ratio\\s*:?\\s*${r}[^,\\.\\n]*`, "gi");
        updated = updated.replace(rRegex, `aspect ratio ${newLabel}`);
        const rRegex2 = new RegExp(`\\b${r}\\b\\s*(Landscape|Portrait|Square)?\\s*(widescreen|vertical)?\\s*(\\(\\d+x\\d+\\))?`, "gi");
        updated = updated.replace(rRegex2, newLabel);
      }
      if (!updated.includes(newCfg.id)) {
        updated += `, aspect ratio ${newLabel}`;
      }
      return { ...prev, imagePrompt: updated };
    });
    toast.info(`Aspect ratio switched to ${VIDEO_ASPECT_RATIOS[newRatio].name}`);
  };

  const handlePreviewVoiceover = async () => {
    const text = (videoVoiceoverText || generatedContent.template || "").trim();
    if (!text) {
      toast.error("Please generate or enter a voiceover script first");
      return;
    }
    if (voicePreviewAudioRef.current) {
      try {
        voicePreviewAudioRef.current.pause();
      } catch { }
      voicePreviewAudioRef.current = null;
    }
    setIsPreviewingVoice(true);
    try {
      const langObj = SUPPORTED_LANGUAGES.find((l) => l.id === voiceoverLanguage);
      const scriptCheck = validateScriptForLanguage(text, voiceoverLanguage);
      if (!scriptCheck.isValid && scriptCheck.warning) {
        toast.info(scriptCheck.warning);
      }

      toast.info(`Synthesizing voiceover (${langObj?.nativeName || voiceoverLanguage})...`);

      const synthResult = await synthesizeVoiceAudio({
        text,
        language: voiceoverLanguage,
        voiceGender,
        voiceId: selectedVoiceId,
        elevenLabsKey: userElevenLabsKey,
      });

      if (synthResult.audioBase64) {
        setVideoVoiceoverAudio(synthResult.audioBase64);
        setVideoVoiceoverScript(text);
        const audio = new Audio(`data:audio/mpeg;base64,${synthResult.audioBase64}`);
        voicePreviewAudioRef.current = audio;
        audio.onended = () => setIsPreviewingVoice(false);
        audio.onerror = () => {
          setIsPreviewingVoice(false);
          toast.error("Audio playback error");
        };
        await audio.play();
        toast.success(`Playing native ${langObj?.nativeName || "voice"} preview`);
      } else {
        throw new Error("Unable to synthesize audio. Check network connection or API Setup.");
      }
    } catch (err: any) {
      console.error("Voice preview error:", err);
      toast.error(err.message || "Failed to generate voice preview");
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  const handleDownloadVoice = async () => {
    const text = (videoVoiceoverText || generatedContent.template || "").trim();
    if (!text) {
      toast.error("Please generate or enter a voiceover script first");
      return;
    }
    setIsDownloadingVoice(true);
    try {
      let audioBase64 = videoVoiceoverAudio;
      if (!audioBase64) {
        toast.info("Synthesizing audio for download...");
        const synthResult = await synthesizeVoiceAudio({
          text,
          language: voiceoverLanguage,
          voiceGender,
          voiceId: selectedVoiceId,
          elevenLabsKey: userElevenLabsKey,
        });
        audioBase64 = synthResult.audioBase64;
        setVideoVoiceoverAudio(audioBase64);
        setVideoVoiceoverScript(text);
      }

      if (!audioBase64) {
        throw new Error("Could not synthesize audio for download");
      }

      const cleanBase64 = (audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64).replace(/\s+/g, "");
      const binary = atob(cleanBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `voiceover-${voiceoverLanguage}-${voiceGender}-${Date.now()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      toast.success("Voice audio downloaded (.mp3)");
    } catch (err: any) {
      console.error("Voice download error:", err);
      toast.error(err.message || "Failed to download voiceover");
    } finally {
      setIsDownloadingVoice(false);
    }
  };

  const getStoredRunwayKey = async (): Promise<string> => {
    if (userRunwayKey && userRunwayKey.trim()) return userRunwayKey.trim();
    const local = localStorage.getItem("runway_api_key");
    if (local && local.trim()) return local.trim();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("api_credentials")
        .select("runway_api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      const key = (data as any)?.runway_api_key;
      if (key && typeof key === "string" && key.trim()) {
        setUserRunwayKey(key.trim());
        return key.trim();
      }
    }
    return "";
  };

  const toAccessibleImageUrl = async (url: string): Promise<string> => {
    if (!url) return "";
    if (url.startsWith("https://") || url.startsWith("http://")) {
      return url;
    }
    // If it's a data URL or blob URL, attempt to upload to public storage so Runway/Veo receives a valid HTTPS URL
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      try {
        let blob: Blob;
        if (url.startsWith("blob:")) {
          const res = await fetch(url);
          blob = await res.blob();
        } else {
          const res = await fetch(url);
          blob = await res.blob();
        }

        const { data: { user } } = await supabase.auth.getUser();
        const path = `${user?.id || "public"}/frame_${Date.now()}.png`;
        const { error: upErr } = await supabase.storage.from("whatsapp-media").upload(path, blob, {
          contentType: "image/png",
          upsert: true,
        });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
          if (pub?.publicUrl) {
            return pub.publicUrl;
          }
        }
      } catch (uploadErr) {
        console.warn("Could not upload frame to public storage:", uploadErr);
      }
    }
    return url;
  };

  // Domain keywords for automatic classification & prioritization
  const SOFTWARE_KEYWORDS = [
    "pharmacy app", "medical software", "pos software", "billing software",
    "inventory management", "accounting software", "software", "app", "application",
    "pos", "crm", "billing", "erp", "saas", "dashboard", "portal", "system",
    "tally", "tallybook", "cloud software", "gst billing", "stock management", "fintech",
    "purchase bill", "medical store", "pharmacy store", "chemist"
  ];

  const FOOTWEAR_KEYWORDS = [
    "footwear", "shoe", "shoes", "sneaker", "sneakers", "sandal", "sandals",
    "boots", "slippers", "heels", "loafers", "चप्पल", "जूते"
  ];

  const GARMENT_KEYWORDS = [
    "garment", "garments", "clothing", "apparel", "dress", "saree", "shirt",
    "t-shirt", "jeans", "fabric", "textile", "fashion wear", "suit", "kurti", "कपड़े"
  ];

  interface PromptContextResolution {
    domain: "software" | "footwear" | "garments" | "general";
    brandOrProductName: string;
    productCategory: string;
    resolvedBusinessType: string;
    resolvedOccasion: string;
    isCustomOccasion: boolean;
    hasDiscount: boolean;
    discountText: string;
    featuresToHighlight: string[];
  }

  function resolvePromptContext(opts: {
    businessType?: string;
    productCategory?: string;
    occasion?: string;
    customPrompt?: string;
    discount?: number;
  }): PromptContextResolution {
    const customLower = (opts.customPrompt || "").toLowerCase();
    const categoryLower = (opts.productCategory || "").toLowerCase();
    const businessLower = (opts.businessType || "").toLowerCase();

    // Priority 1: Check Custom Instructions for domain indicators
    let domain: "software" | "footwear" | "garments" | "general" = "general";
    if (SOFTWARE_KEYWORDS.some((kw) => customLower.includes(kw) || categoryLower.includes(kw))) {
      domain = "software";
    } else if (FOOTWEAR_KEYWORDS.some((kw) => customLower.includes(kw) || categoryLower.includes(kw) || businessLower.includes(kw))) {
      domain = "footwear";
    } else if (GARMENT_KEYWORDS.some((kw) => customLower.includes(kw) || categoryLower.includes(kw) || businessLower.includes(kw))) {
      domain = "garments";
    } else if (businessLower.includes("footwear")) {
      domain = "footwear";
    } else if (businessLower.includes("clothing") || businessLower.includes("garment")) {
      domain = "garments";
    }

    // Extract brand or product name
    let brandOrProductName = "";
    const tallyMatch = (opts.customPrompt || "").match(/\b(tally\s*book\s*pos|tallybook\s*pos|tallybook|tally\s*pos)\b/i);
    if (tallyMatch) {
      brandOrProductName = "TallyBook POS";
    } else if (opts.productCategory && opts.productCategory.trim() && opts.productCategory.toLowerCase() !== "other") {
      brandOrProductName = opts.productCategory.trim();
    }

    // Extract software features to highlight from customPrompt
    const featuresToHighlight: string[] = [];
    if (opts.customPrompt) {
      if (/pharmacy\s*billing/i.test(opts.customPrompt)) featuresToHighlight.push("Fast Pharmacy Billing");
      if (/stock/i.test(opts.customPrompt)) featuresToHighlight.push("Medicine Stock Management");
      if (/batch/i.test(opts.customPrompt)) featuresToHighlight.push("Batch Number Management");
      if (/expiry/i.test(opts.customPrompt)) featuresToHighlight.push("Expiry Date Tracking");
      if (/gst/i.test(opts.customPrompt)) featuresToHighlight.push("GST Billing");
      if (/scan|1\s*click/i.test(opts.customPrompt)) featuresToHighlight.push("1-Click Purchase Bill Scanning");
      if (/purchase.*entry|purchase.*bill/i.test(opts.customPrompt)) featuresToHighlight.push("Automatic Purchase Bill Entry");
    }

    // Business Type resolution - NEVER use literal "Other"
    let resolvedBusinessType = (opts.businessType || "").trim();
    if (resolvedBusinessType.toLowerCase() === "other" || !resolvedBusinessType) {
      if (domain === "software") {
        resolvedBusinessType = brandOrProductName || (opts.productCategory ? `${opts.productCategory} Solutions` : "Smart Software Solutions");
      } else if (domain === "footwear") {
        resolvedBusinessType = "Premium Footwear Store";
      } else if (domain === "garments") {
        resolvedBusinessType = "Exclusive Fashion & Garments";
      } else {
        resolvedBusinessType = brandOrProductName || "Premium Retail Solutions";
      }
    }

    // Occasion resolution - NEVER use literal "Custom"
    const isCustomOccasion = (opts.occasion || "").toLowerCase() === "custom" || !opts.occasion?.trim();
    let resolvedOccasion = (opts.occasion || "").trim();
    if (isCustomOccasion) {
      resolvedOccasion = "Special Promotional Showcase";
    }

    const hasDiscount = Boolean(opts.discount && opts.discount > 0);
    const discountText = hasDiscount ? `${opts.discount}% OFF` : "";

    return {
      domain,
      brandOrProductName,
      productCategory: (opts.productCategory || "").trim(),
      resolvedBusinessType,
      resolvedOccasion,
      isCustomOccasion,
      hasDiscount,
      discountText,
      featuresToHighlight,
    };
  }

  function buildDomainImagePrompt(opts: {
    domain: "software" | "footwear" | "garments" | "general";
    brandOrProductName?: string;
    productCategory?: string;
    businessType?: string;
    occasion?: string;
    isCustomOccasion?: boolean;
    aspectRatio: VideoAspectRatio;
    hasDiscount?: boolean;
    discountText?: string;
  }): string {
    const aspectConfig = VIDEO_ASPECT_RATIOS[opts.aspectRatio] || VIDEO_ASPECT_RATIOS["9:16"];
    const brandName = opts.brandOrProductName || "TallyBook POS";
    const ratioLabel = `${aspectConfig.label} (${aspectConfig.width}x${aspectConfig.height})`;

    if (opts.domain === "software") {
      return [
        `Professional photorealistic commercial advertisement photography for ${brandName} Pharmacy Management Software.`,
        `Setting: Modern Indian retail pharmacy store interior with neatly organized glass medicine shelves, authentic branded medicine cartons, blister packs, and syrup bottles.`,
        `Subjects & Action: Professional Indian pharmacist in clean formal attire at the modern retail billing counter, operating a desktop computer and tablet POS terminal. Handheld laser barcode scanner actively scanning a medicine package at the counter.`,
        `Workflow Concept: Organized purchase invoice papers, medicine stock management clipboard, and clean digital billing station.`,
        `Atmosphere & Palette: Modern medical blue, clean crisp white, and subtle healthcare mint green color palette. Bright balanced commercial pharmacy lighting, natural reflections, sharp textures, high depth of field.`,
        `Composition: Premium commercial product photography with ample clean negative space in the upper and center sections for promotional text overlays. Aspect ratio: ${ratioLabel}.`,
        `STRICT NEGATIVE RESTRICTIONS: Absolutely NO festive golden curtains, NO decorative fabrics, NO floating fantasy holographic icons, NO fake unreadable gibberish text, NO shoes, NO footwear, NO clothing, NO fashion accessories. Do NOT burn Hindi or text into the image.`
      ].join(" ");
    }

    if (opts.domain === "footwear") {
      const item = opts.productCategory || "Footwear";
      return [
        `High-end commercial studio product photography showcasing premium ${item} by ${brandName}.`,
        `Setting: Minimalist contemporary studio pedestal with dramatic cinematic rim lighting and polished reflective floor.`,
        `Details: Ultra-detailed footwear craftsmanship, rich material texture, precision stitching, clean sole ergonomics, dynamic 45-degree hero angle.`,
        `Atmosphere & Palette: Elegant commercial lighting with soft gradients and realistic contact shadows.`,
        `Composition: Clean negative space for marketing text and price badges. Aspect ratio: ${ratioLabel}.`,
        `STRICT NEGATIVE RESTRICTIONS: NO cluttered backgrounds, NO deformed geometry, NO random text.`
      ].join(" ");
    }

    if (opts.domain === "garments") {
      const item = opts.productCategory || "Apparel";
      return [
        `Luxury commercial fashion advertisement photography showcasing ${item} by ${brandName}.`,
        `Setting: High-end boutique showroom or minimalist editorial studio with elegant architectural lines.`,
        `Details: Premium garment craftsmanship, rich fabric textures, natural drape, sophisticated apparel presentation.`,
        `Atmosphere & Palette: Soft diffused studio illumination, warm elegant tones, subtle natural contrast.`,
        `Composition: Clean negative space for promotional headlines. Aspect ratio: ${ratioLabel}.`
      ].join(" ");
    }

    return [
      `Cinematic 4K commercial promotional advertisement visual featuring ${brandName}.`,
      `Setting: High-end commercial studio environment with elegant pedestal and professional multi-point lighting.`,
      `Atmosphere: Crisp commercial lighting, vivid natural colors, realistic shadows, premium product photography.`,
      `Composition: Clean composition with ample negative space for text overlays. Aspect ratio: ${ratioLabel}.`
    ].join(" ");
  }

  function buildDomainVideoMotionPrompt(opts: {
    domain: "software" | "footwear" | "garments" | "general";
    brandOrProductName?: string;
    productCategory?: string;
    businessType?: string;
    occasion?: string;
    isCustomOccasion?: boolean;
    aspectRatio: VideoAspectRatio;
    durationSeconds?: VideoDuration;
    customPrompt?: string;
  }): string {
    const aspectConfig = VIDEO_ASPECT_RATIOS[opts.aspectRatio] || VIDEO_ASPECT_RATIOS["9:16"];
    const brandName = opts.brandOrProductName || "TallyBook POS";
    const duration = opts.durationSeconds || 15;
    const ratioLabel = `${aspectConfig.id} (${aspectConfig.width}x${aspectConfig.height})`;

    if (opts.domain === "software") {
      return [
        `Cinematic dynamic commercial video advertisement background demonstrating ${brandName} in a modern Indian retail pharmacy store. Ultra-high definition 4K commercial cinematography, aspect ratio ${ratioLabel}, duration ${duration} seconds.`,
        `MULTI-SCENE MOTION SEQUENCE:`,
        `Scene 1 (Store Opening & Aisle Pan): Smooth cinematic camera dolly movement gliding through modern Indian pharmacy aisles with organized medicine racks, panning smoothly toward the well-lit billing counter.`,
        `Scene 2 (Fast Barcode Billing): Pharmacist holding a laser barcode scanner, scanning a medicine box with a crisp red laser line, smoothly demonstrating fast retail pharmacy billing workflow.`,
        `Scene 3 (Stock & Batch Management): Camera tracks across medicine inventory shelves showing organized medicine cartons, batch numbers, and stock management organization.`,
        `Scene 4 (Expiry Date Tracking): Clear view of billing counter desktop and tablet interface displaying expiry date management, batch verification, and inventory control.`,
        `Scene 5 (1-Click Purchase Scan): Demonstration of 1-click purchase bill scanning where physical purchase invoice is scanned into digital automated purchase bill entry.`,
        `Scene 6 (Hero Branding & Counter Shot): Wide cinematic hero shot of the pharmacy billing counter with clean counter space and dedicated upper negative space for ${brandName} branding and animated title overlays.`,
        `MOTION DIRECTIVES:`,
        `- Camera Movement: Continuous dynamic motion with smooth dolly forward, sweeping panning shots across medicine shelves, and close-up tracking shots of barcode scanning.`,
        `- Pharmacist Hand Movements: Realistic natural hand actions picking up medicine packs, scanning barcodes, and tapping POS touchscreen.`,
        `- Lighting & Cinematography: Ambient pharmacy store lighting with clean medical illumination, soft depth of field bokeh, and subtle motion blur for cinematic realism.`,
        `- Frame Continuity: Continuous multi-frame video motion throughout the entire ${duration}s runtime with zero static freeze frames.`,
        `BACKGROUND RESTRICTIONS:`,
        `- Clean modern Indian retail pharmacy environment with authentic medicine shelves, blister packs, and syrup bottles.`,
        `- Palette: Professional medical blue, clean white, and subtle healthcare green.`,
        `- Strict Restrictions: Absolutely NO gibberish fake text on screens or walls, NO floating holographic fantasy icons, NO festive golden curtains or decorative fabrics, NO shoes, NO footwear, NO clothing. Clean negative space in upper third for superimposed text. DO NOT burn Hindi text into the background video.`
      ].join(" ");
    }

    if (opts.domain === "footwear") {
      const item = opts.productCategory || "Footwear";
      return [
        `Cinematic commercial video advertisement featuring premium ${item} by ${brandName}. Ultra-high definition 4K commercial cinematography, aspect ratio ${ratioLabel}.`,
        `MOTION DIRECTIVES:`,
        `- Continuous 360-degree turntable product rotation showcasing side profile, sole grip, stitching, and premium silhouette.`,
        `- Cinematic camera choreography: Dynamic slow zoom-in with smooth dolly tracking and orbital sweeping camera movement around the footwear.`,
        `- Lighting & Shadows: Moving commercial studio spotlight illumination, soft specular reflections gliding across leather and mesh surfaces, realistic shifting contact shadows.`,
        `- Atmospheric Motion: Subtle floating ambient particles, shallow depth of field bokeh transitions.`,
        `- Product Preservation: Strict product identity lock—preserve authentic footwear design, materials, and logo without warping or distortion.`,
        `- Zero static freeze frames; continuous fluid motion throughout ${duration}s runtime.`
      ].join(" ");
    }

    if (opts.domain === "garments") {
      const item = opts.productCategory || "Apparel";
      return [
        `Cinematic luxury fashion commercial video featuring ${item} by ${brandName}. Aspect ratio ${ratioLabel}.`,
        `MOTION DIRECTIVES:`,
        `- Smooth sweeping camera glide across elegant garment racks, close-up tracking of premium fabric weave and texture.`,
        `- Subtle natural fabric movement with gentle dynamic lighting shifts.`,
        `- Clean composition with ample negative space for text overlays. Continuous motion throughout ${duration}s runtime.`
      ].join(" ");
    }

    return [
      `Cinematic 4K commercial advertisement video featuring ${brandName}. Aspect ratio ${ratioLabel}.`,
      `Smooth camera dolly movement, dynamic commercial studio lighting, realistic reflections and continuous video motion throughout ${duration}s runtime.`
    ].join(" ");
  }

  const buildDynamicMotionPrompt = (customUserPrompt?: string): string => {
    const ctx = resolvePromptContext({
      businessType: formData.businessType,
      productCategory: formData.productCategory,
      occasion: formData.occasion,
      customPrompt: customUserPrompt || formData.customPrompt,
    });
    return buildDomainVideoMotionPrompt({
      domain: ctx.domain,
      brandOrProductName: ctx.brandOrProductName,
      productCategory: ctx.productCategory,
      businessType: ctx.resolvedBusinessType,
      occasion: ctx.resolvedOccasion,
      isCustomOccasion: ctx.isCustomOccasion,
      aspectRatio: videoAspectRatio,
      durationSeconds: videoDuration,
      customPrompt: customUserPrompt || formData.customPrompt,
    });
  };

  const generateRealAnimatedVideo = async (options: {
    imageUrl?: string;
    promptText?: string;
    durationSeconds: VideoDuration;
    aspectRatio: VideoAspectRatio;
  }): Promise<Blob | null> => {
    const { imageUrl, promptText = "", durationSeconds, aspectRatio } = options;

    const runwayKey = await getStoredRunwayKey();
    const isRunwaySelected = imageProvider === "runway";
    const isVeoSelected = imageProvider === "veo";
    const isPexelsSelected = imageProvider === "pexels";
    const isAuto = imageProvider === "auto";

    let accessibleImage = "";
    if (imageUrl) {
      accessibleImage = await toAccessibleImageUrl(imageUrl);
    }
    const motionPrompt = buildDynamicMotionPrompt(promptText);

    // 1. Primary: Use secure Supabase Edge Function image-to-video (no browser CORS restrictions)
    try {
      toast.info(`Requesting real AI video frames (${imageProvider === "auto" ? "Runway / Veo" : imageProvider})...`);
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke("image-to-video", {
        body: {
          prompt: motionPrompt,
          image: accessibleImage,
          provider: imageProvider,
          aspectRatio,
          durationSeconds,
          productCategory: formData.productCategory,
          businessType: formData.businessType,
          apiKey: runwayKey || undefined,
        },
      });

      if (!edgeErr && edgeData?.success && edgeData.videoUrl) {
        toast.info("Downloading AI-generated video frames...");
        const dlRes = await fetch(edgeData.videoUrl);
        if (dlRes.ok) {
          const videoBlob = await dlRes.blob();
          await assertMp4Video(videoBlob, edgeData.provider || "AI Video");
          return videoBlob;
        }
      } else if (edgeData?.error) {
        console.warn("image-to-video edge function reported:", edgeData.error);
        if (isRunwaySelected || isVeoSelected) {
          toast.warning(edgeData.error);
        }
      }
    } catch (edgeCallErr) {
      console.warn("image-to-video edge invoke failed, checking direct client fallback:", edgeCallErr);
    }

    // 2. Direct Runway Gen-3 Alpha Call (via Vite dev proxy or direct API)
    if (isRunwaySelected || (isAuto && runwayKey)) {
      if (runwayKey) {
        try {
          const cleanRunwayKey = runwayKey.replace(/^Bearer\s+/i, "").trim();
          toast.info("Connecting directly to Runway Gen-3 AI engine...");

          const runwayRatio = aspectRatio === "9:16" ? "768:1280" : "1280:768";
          const runwayDuration = durationSeconds >= 10 ? 10 : 5;

          const requestBody: Record<string, any> = {
            promptText: motionPrompt,
            model: "gen3a_turbo",
            duration: runwayDuration,
            ratio: runwayRatio,
          };
          if (accessibleImage && (accessibleImage.startsWith("https://") || accessibleImage.startsWith("http://"))) {
            requestBody.promptImage = accessibleImage;
          }

          const candidateBases = import.meta.env.DEV
            ? ["/api/runway-dev", "/api/runway"]
            : ["https://api.dev.runwayml.com", "https://api.runwayml.com"];

          let chosenBase = candidateBases[0];
          let res: Response | null = null;

          for (const base of candidateBases) {
            try {
              const attempt = await fetch(`${base}/v1/image_to_video`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${cleanRunwayKey}`,
                  "Content-Type": "application/json",
                  "X-Runway-Version": "2024-09-13",
                },
                body: JSON.stringify(requestBody),
              });
              if (attempt.ok) {
                res = attempt;
                chosenBase = base;
                break;
              }
              const errText = await attempt.text();
              if (errText.includes("Incorrect hostname for API key")) {
                continue;
              }
              throw new Error(`Runway API: ${errText.slice(0, 150)}`);
            } catch (err: any) {
              if (err.message?.includes("Runway API:")) throw err;
            }
          }

          if (res && res.ok) {
            const taskData = await res.json();
            const taskId = taskData.id;
            if (taskId) {
              toast.info("Runway AI video animating... Polling progress...");
              let videoUrl = "";
              for (let i = 0; i < 40; i++) {
                await new Promise((r) => setTimeout(r, 3000));
                const checkRes = await fetch(`${chosenBase}/v1/tasks/${taskId}`, {
                  headers: {
                    Authorization: `Bearer ${cleanRunwayKey}`,
                    "X-Runway-Version": "2024-09-13",
                  },
                });
                if (checkRes.ok) {
                  const checkData = await checkRes.json();
                  if (checkData.status === "SUCCEEDED" && checkData.output?.[0]) {
                    videoUrl = checkData.output[0];
                    break;
                  }
                  if (checkData.status === "FAILED") {
                    throw new Error(`Runway video failed: ${checkData.failure || "Generation failed"}`);
                  }
                  if (checkData.progress) {
                    toast.info(`Runway AI video animating... ${Math.round(checkData.progress * 100)}%`);
                  }
                }
              }

              if (videoUrl) {
                const dlRes = await fetch(videoUrl);
                if (dlRes.ok) {
                  const videoBlob = await dlRes.blob();
                  await assertMp4Video(videoBlob, "Runway Gen-3");
                  return videoBlob;
                }
              }
            }
          }
        } catch (directErr: any) {
          console.warn("Direct Runway call error:", directErr);
        }
      }
    }

    // 3. Pexels Commercial Stock Footage
    if (isPexelsSelected || (isAuto && availableKeys["pexels_api_key"])) {
      try {
        toast.info("Searching commercial stock video footage on Pexels (Direct MP4)...");
        const searchQuery = `${formData.productCategory || formData.businessType || "footwear"} commercial cinematic advertisement`;
        const { data: px, error: pxErr } = await supabase.functions.invoke("pexels-search", {
          body: { query: searchQuery.trim(), kind: "video" },
        });
        if (!pxErr && px?.videoUrl) {
          const res = await fetch(px.videoUrl);
          if (res.ok) {
            const videoBlob = await res.blob();
            await assertMp4Video(videoBlob, "Pexels");
            if (px.credit) toast.info(`Video footage by ${px.credit} on Pexels`);
            return videoBlob;
          }
        }
      } catch (pxErr: any) {
        console.warn("Pexels stock video search error:", pxErr);
      }
    }

    return null;
  };

  const handleGeneratePromoVideo = async () => {
    if (!generatedContent.generatedImage) {
      toast.error("Please generate or select a video frame image first");
      return;
    }
    setIsGeneratingVideo(true);
    try {
      const { width, height } = getVideoDimensions(videoAspectRatio, videoQuality);
      const durationMs = videoDuration * 1000;
      const isRTL = isRtlLanguage(voiceoverLanguage);
      const scriptToOverlay = (videoVoiceoverText || generatedContent.template || "").trim();

      // Step 1: Generate real animated video frames (genuine visual motion with rotation & camera moves)
      const animatedVideoBlob = await generateRealAnimatedVideo({
        imageUrl: generatedContent.generatedImage,
        promptText: generatedContent.imagePrompt || formData.customPrompt,
        durationSeconds: videoDuration,
        aspectRatio: videoAspectRatio,
      });

      if (!animatedVideoBlob && (imageProvider === "runway" || imageProvider === "veo")) {
        toast.warning(
          `Real ${imageProvider.toUpperCase()} video frames could not be retrieved. Rendering promo preview with motion framing and synchronized voiceover.`,
          { description: "Ensure your API key has active credits in API Setup for genuine AI video frames." }
        );
      }

      // Step 2: Overlay audio and text over the real animated video frames
      let videoBlob: Blob;
      if (videoVoiceoverAudio) {
        toast.info(`Compositing ${videoDuration}s ${videoAspectRatio} promo video with synchronized voiceover...`);
        videoBlob = await createPromoVideoWithAudio({
          videoBlob: animatedVideoBlob || undefined,
          imageUrl: !animatedVideoBlob ? generatedContent.generatedImage : undefined,
          text: scriptToOverlay,
          voiceAudioBase64: videoVoiceoverAudio,
          width,
          height,
          durationMs,
          minDurationMs: durationMs,
          maxDurationMs: durationMs,
          isRTL,
        });
      } else {
        toast.info(`Rendering ${videoDuration}s ${videoAspectRatio} animated promo video with text overlays...`);
        videoBlob = await createPromoVideo({
          videoBlob: animatedVideoBlob || undefined,
          imageUrl: !animatedVideoBlob ? generatedContent.generatedImage : undefined,
          text: scriptToOverlay,
          durationMs,
          width,
          height,
          isRTL,
        });
      }

      await assertMp4Video(videoBlob, imageProvider);
      setGeneratedVideoBlob(videoBlob);
      const url = URL.createObjectURL(videoBlob);
      setGeneratedVideoUrl(url);
      setIsVideoPreviewOpen(true);
      if (animatedVideoBlob) {
        toast.success(`Promo video (${videoDuration}s, ${width}×${height} MP4) generated with real animated motion!`);
      } else {
        toast.info(`Promo video preview (${videoDuration}s, ${width}×${height} MP4) generated with synchronized voiceover & text.`);
      }
    } catch (err: any) {
      console.error("Promo video generation error:", err);
      toast.error(err.message || "Failed to generate promo video");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleGenerateAIVideoWithAudio = async () => {
    setIsGeneratingVideo(true);
    try {
      let imageUrl = generatedContent.generatedImage;
      if (!imageUrl) {
        toast.info("Generating initial product frame first...");
        const { width: reqW, height: reqH } = getVideoDimensions(videoAspectRatio, "720p");
        if (imageProvider === "pollinations" || imageProvider === "auto") {
          const res = await generatePollinationsImage({
            prompt: generatedContent.imagePrompt || `${formData.businessType} ${formData.occasion} commercial promo background`,
            model: selectedPollinationsModel,
            width: reqW,
            height: reqH,
            endpoint: pollinationsEndpoint,
            seed: createPollinationsSeed(),
            apiKey: pollinationsApiKey || null,
          });
          imageUrl = res.imageUrl;
        } else if (imageProvider === "nvidia" || imageProvider === "cosmos") {
          const res = await generateNvidiaImage({
            prompt: generatedContent.imagePrompt || `${formData.businessType} ${formData.occasion} commercial promo background`,
            model: "flux-3-image-klein",
            width: reqW,
            height: reqH,
          });
          imageUrl = res.imageUrl;
        } else if (imageProvider !== "runway" && imageProvider !== "pexels" && imageProvider !== "veo") {
          const res = await supabase.functions.invoke("generate-template", {
            body: {
              type: "generate_image",
              imagePrompt: generatedContent.imagePrompt,
              imageProvider,
            },
          });
          imageUrl = res.data?.imageUrl;
        }
        if (imageUrl) {
          setGeneratedContent((prev) => ({ ...prev, generatedImage: imageUrl }));
        }
      }

      let audioBase64 = videoVoiceoverAudio;
      const scriptText = (videoVoiceoverText || generatedContent.template || "").trim();
      if (!audioBase64 && scriptText) {
        const langObj = SUPPORTED_LANGUAGES.find((l) => l.id === voiceoverLanguage);
        toast.info(`Generating ${langObj?.nativeName || voiceoverLanguage} voiceover...`);
        try {
          const synthRes = await synthesizeVoiceAudio({
            text: scriptText,
            language: voiceoverLanguage,
            voiceGender,
            voiceId: selectedVoiceId,
            elevenLabsKey: userElevenLabsKey,
          });
          if (synthRes.audioBase64) {
            audioBase64 = synthRes.audioBase64;
            setVideoVoiceoverAudio(audioBase64);
            setVideoVoiceoverScript(scriptText);
          }
        } catch (aErr) {
          console.warn("Audio synthesis error:", aErr);
        }
      }

      // Step 1: Generate real animated video frames (Runway Gen-3 Image-to-Video with 360° motion or Pexels)
      const animatedVideoBlob = await generateRealAnimatedVideo({
        imageUrl,
        promptText: generatedContent.imagePrompt || formData.customPrompt,
        durationSeconds: videoDuration,
        aspectRatio: videoAspectRatio,
      });

      if (!animatedVideoBlob && (imageProvider === "runway" || imageProvider === "veo")) {
        toast.warning(
          `Real ${imageProvider.toUpperCase()} video frames could not be retrieved. Rendering promo preview with motion framing and synchronized voiceover.`,
          { description: "Ensure your API key has active credits in API Setup for genuine AI video frames." }
        );
      }

      const { width, height } = getVideoDimensions(videoAspectRatio, videoQuality);
      const durationMs = videoDuration * 1000;
      const isRTL = isRtlLanguage(voiceoverLanguage);

      toast.info(`Mixing and rendering ${videoDuration}s ${videoAspectRatio} animated video with voiceover...`);
      let videoBlob: Blob;
      if (audioBase64) {
        videoBlob = await createPromoVideoWithAudio({
          videoBlob: animatedVideoBlob || undefined,
          imageUrl: !animatedVideoBlob ? (imageUrl || generatedContent.generatedImage) : undefined,
          text: scriptText,
          voiceAudioBase64: audioBase64,
          width,
          height,
          durationMs,
          minDurationMs: durationMs,
          maxDurationMs: durationMs,
          isRTL,
        });
      } else {
        videoBlob = await createPromoVideo({
          videoBlob: animatedVideoBlob || undefined,
          imageUrl: !animatedVideoBlob ? (imageUrl || generatedContent.generatedImage) : undefined,
          text: scriptText,
          durationMs,
          width,
          height,
          isRTL,
        });
      }

      await assertMp4Video(videoBlob, imageProvider);
      setGeneratedVideoBlob(videoBlob);
      const url = URL.createObjectURL(videoBlob);
      setGeneratedVideoUrl(url);
      setIsVideoPreviewOpen(true);
      if (animatedVideoBlob) {
        toast.success(`Video with audio (${videoDuration}s, ${width}×${height} MP4) ready with real animated motion!`);
      } else {
        toast.info(`Promo video preview (${videoDuration}s, ${width}×${height} MP4) generated with synchronized voiceover & text.`);
      }
    } catch (err: any) {
      console.error("AI Video with Audio error:", err);
      toast.error(err.message || "Failed to generate video with audio");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleVideoLanguageRemix = async (newLangId: string) => {
    handleLanguageChange(newLangId);
    const baseScript = (videoVoiceoverText || generatedContent.template || "").trim();
    if (!baseScript) {
      toast.info("Please generate a base script first");
      return;
    }
    setIsGenerating(true);
    try {
      const targetLang = SUPPORTED_LANGUAGES.find((l) => l.id === newLangId) || SUPPORTED_LANGUAGES[0];
      const guidance = getScriptPromptGuidance(newLangId, videoDuration);
      toast.info(`Remixing script for ${targetLang.label}...`);

      const remixPrompt = `Translate and culturally adapt the following promotional marketing script into genuine native ${targetLang.label} (${targetLang.nativeName}).

Original Script:
"${baseScript}"

${guidance}

CRITICAL RULES:
- Return ONLY the final translated native script.
- DO NOT add explanation, quotation marks, or English transliteration.`;

      let newScript = "";
      if (textProvider === "nvidia") {
        const res = await generateNvidiaChatCompletion({
          model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          messages: [
            { role: "system", content: "You are an expert multilingual marketing copywriter specializing in Indian and global languages." },
            { role: "user", content: remixPrompt },
          ],
          temperature: 0.6,
          maxTokens: 2048,
        });
        newScript = (res.content || "").trim();
      } else {
        const res = await supabase.functions.invoke("generate-template", {
          body: {
            type: "marketing_template",
            businessType: formData.businessType,
            productCategory: formData.productCategory,
            discount: formData.discount[0],
            occasion: formData.occasion,
            customPrompt: remixPrompt,
            textProvider,
          },
        });
        newScript = (res.data?.template || "").trim();
      }

      if (newScript) {
        setVideoVoiceoverText(newScript);
        setGeneratedContent((prev) => ({ ...prev, template: newScript }));
        toast.success(`Script remixed in ${targetLang.nativeName}! Click 'Preview Voice' or 'Generate Promo Video'.`);
      }
    } catch (err: any) {
      console.error("Language remix error:", err);
      toast.error(err.message || "Failed to remix script in target language");
    } finally {
      setIsGenerating(false);
    }
  };

  function buildDynamicAiPrompt(opts: {
    businessType: string;
    productCategory?: string;
    discount?: number;
    occasion: string;
    customPrompt?: string;
    isVideo: boolean;
    videoDuration?: VideoDuration;
    aspectRatio?: VideoAspectRatio;
    language?: string;
    gender?: "male" | "female";
    selectedVoiceId?: string;
  }) {
    const ctx = resolvePromptContext(opts);
    const isVideo = opts.isVideo;
    const duration = opts.videoDuration || 15;
    const lang = opts.language || "hi";
    const gender = opts.gender || "male";
    const aspect = opts.aspectRatio || "9:16";
    const aspectConfig = VIDEO_ASPECT_RATIOS[aspect] || VIDEO_ASPECT_RATIOS["9:16"];
    const targetWordRule = VIDEO_DURATIONS.find((d) => d.duration === duration) || VIDEO_DURATIONS[1];
    const selectedVoiceObj = SUPPORTED_VOICES.find((v) => v.id === opts.selectedVoiceId);

    const voicePersonaGuidance = isVideo
      ? `\nVOICE PERSONA & PERFORMANCE SPECIFICATIONS:
- Voice Actor Gender: ${gender.toUpperCase()}
- Voice Persona / Actor: ${selectedVoiceObj?.name || (gender === "male" ? "Aarav / Male Voice" : "Swara / Female Voice")}
- Tone & Delivery: ${gender === "male"
        ? "Bold, energetic, authoritative masculine commercial cadence with punchy, confident delivery."
        : "Warm, inviting, vibrant feminine commercial cadence with captivating, friendly delivery."
      }`
      : "";
    const scriptGuidance = isVideo
      ? `${getScriptPromptGuidance(lang, duration)}${voicePersonaGuidance}`
      : "";

    // Domain-specific system prompt
    let systemPrompt = "";
    if (ctx.domain === "software") {
      systemPrompt = `You are an expert commercial video director, technology copywriter, and software marketing specialist.
You create high-converting promotional marketing scripts and video voiceovers for software applications, POS systems, SaaS tools, and digital platforms.
CRITICAL DOMAIN DIRECTIVE:
The product being promoted is a SOFTWARE / DIGITAL APPLICATION / TECHNOLOGY SERVICE.
You must focus exclusively on software capabilities: speed, accuracy, workflow automation, inventory tracking, GST billing, and business efficiency.
STRICT NEGATIVE CONSTRAINT:
NEVER generate fashion, clothing, footwear, style, comfort, fabric, sole, or physical collection descriptions. NEVER use phrases like "लाजवाब स्टाइल और पूरा कम्फर्ट", "एक्सक्लूसिव कलेक्शन", "हर कदम पर", or "पहनें".`;
    } else if (ctx.domain === "footwear") {
      systemPrompt = `You are an expert commercial footwear marketing copywriter and video director. You create engaging, premium promotional advertisements highlighting footwear design, durability, comfort, and craftsmanship.`;
    } else if (ctx.domain === "garments") {
      systemPrompt = `You are an expert commercial fashion and apparel marketing copywriter. You create high-converting promotional advertisements highlighting fabric quality, elegance, design, and styling.`;
    } else {
      systemPrompt = `You are an expert commercial marketing copywriter specializing in high-converting promotional messages and scripts.`;
    }

    // Dynamic user prompt with strict priority hierarchy
    const userPrompt = `Generate a high-converting promotional marketing advertisement script and commercial AI image prompt according to the following strict priority hierarchy:

========================================
PRIORITY 1: CUSTOM INSTRUCTIONS (HIGHEST PRIORITY - ABSOLUTE GROUND TRUTH)
========================================
${opts.customPrompt ? opts.customPrompt.trim() : "None provided. Focus on product category and domain."}

CRITICAL RULES FOR CUSTOM INSTRUCTIONS:
- These custom instructions take absolute precedence over any default business category templates.
- Preserve EVERY specific product name, feature, and workflow mentioned by the user (e.g. brand name, billing speed, stock tracking, batch numbers, expiry dates, GST, 1-click scanning, auto purchase entry).
- Do NOT omit or generalize user-specified features.

========================================
PRIORITY 2: PRODUCT CATEGORY & DOMAIN
========================================
Product Category: ${opts.productCategory || "Not specified"}
Product Domain: ${ctx.domain.toUpperCase()} (TREAT STRICTLY AS ${ctx.domain === "software" ? "SOFTWARE / APPLICATION / TECH SERVICE" : ctx.domain.toUpperCase()})
${ctx.domain === "software" ? "- IMPORTANT: This is a digital software/application product. DO NOT describe physical wear, shoes, fabric, or fashion style." : ""}

========================================
PRIORITY 3: BUSINESS TYPE & BRAND IDENTITY
========================================
Business / Brand: ${ctx.brandOrProductName || ctx.resolvedBusinessType}
STRICT RULE: NEVER output the literal word "Other" or "अन्य" anywhere in the advertisement. If the user selected 'Other', use the brand name or product name as the identity.

========================================
PRIORITY 4: FESTIVAL / OCCASION & PROMOTIONAL CONTEXT
========================================
Occasion Context: ${ctx.resolvedOccasion}
STRICT RULE: ${ctx.isCustomOccasion ? 'The occasion is "Custom" (user-defined). NEVER output the literal phrase "इस Custom पर", "Custom Festival", "Custom Offer", or "Happy Custom". Instead, craft a powerful, professional promotional introduction (e.g., "नमस्ते दोस्तों! पेश है..." or "Attention Business Owners!").' : `Incorporate the ${opts.occasion} festive context naturally.`}

========================================
PRIORITY 5: DISCOUNT & COMMERCIAL OFFER
========================================
${ctx.hasDiscount ? `Offer: Flat ${ctx.discountText} discount available.` : "No discount offer - focus entirely on product features, value, speed, and benefits. Do NOT mention any discount, 0% off, or price drop."}

========================================
LANGUAGE & OUTPUT FORMAT SPECIFICATIONS
========================================
Target Language: ${lang}
${lang.startsWith("hi") ? `- Language Style: Natural, professional commercial Hindi (Devanagari script).
- Technical Terminology: Keep industry software terms in their standard natural usage (e.g. TallyBook POS, Pharmacy, Fast Billing, Stock, Batch Number, Expiry Date, GST, 1-Click Scan, Automatic Purchase Bill Entry).
- Flow: Fluent, confident, and professional sentence structure without broken grammar or random word mixing.` : ""}
Format: ${isVideo ? `Video Voiceover Script for ${duration}s (${targetWordRule.minWords}-${targetWordRule.maxWords} words)` : "WhatsApp Marketing Message Template"}
${isVideo ? `Voice Persona: ${gender.toUpperCase()} commercial voice actor\n${scriptGuidance}` : ""}

Format your response EXACTLY as:
TEMPLATE:
[Your promotional marketing script here]

IMAGE_PROMPT:
[Your detailed commercial ${isVideo ? "video background frame prompt" : "promotional image prompt"} here strictly matching aspect ratio ${aspectConfig.label} (${aspectConfig.width}x${aspectConfig.height}).
${ctx.domain === "software"
  ? `CRITICAL SOFTWARE / PHARMACY SPECIFICATIONS:
- Setting: Modern Indian retail pharmacy store interior with neatly organized medicine shelves, blister packs, syrup bottles.
- Subjects: Pharmacist at billing counter using desktop/tablet and laser barcode scanner scanning medicine packaging.
- Workflow: Fast pharmacy billing, purchase bills, medicine stock management.
- Palette: Modern medical blue, clean white, subtle green.
${isVideo ? `- Multi-scene motion sequence: Scene 1: Smooth camera movement through pharmacy aisles to billing counter. Scene 2: Barcode scanner scanning medicine package. Scene 3: Medicine inventory shelves, stock boxes, batch numbers. Scene 4: Expiry date management & inventory verification. Scene 5: 1-click purchase bill scan to digital entry. Scene 6: Billing counter hero shot with software branding space.` : ""}
- STRICT RESTRICTIONS: NO golden curtains, NO decorative fabrics, NO floating fantasy holographic icons, NO fake unreadable text, NO shoes/footwear, NO fashion clothing. Leave clean negative space in upper third for superimposed text. DO NOT burn Hindi text into the image.`
  : `CRITICAL PRODUCT SPECIFICATIONS:
- Subject: Premium commercial visual for ${ctx.brandOrProductName || opts.businessType} (${opts.productCategory || "products"}).
- Setting & Lighting: High-end commercial studio lighting, elegant pedestal, clean composition.
- Leave clean negative space for marketing text overlay.`
}]`;

    return {
      systemPrompt,
      userPrompt,
      resolvedBusinessType: ctx.resolvedBusinessType,
      resolvedOccasion: ctx.resolvedOccasion,
      domain: ctx.domain,
      brandOrProductName: ctx.brandOrProductName,
    };
  }

  function generateSmartFallbackTemplate(opts: {
    businessType: string;
    productCategory?: string;
    discount?: number;
    occasion: string;
    customPrompt?: string;
    isVideo: boolean;
    videoDuration: VideoDuration;
    aspectRatio: VideoAspectRatio;
    language: string;
    gender: "male" | "female";
  }): { template: string; imagePrompt: string } {
    const ctx = resolvePromptContext(opts);
    const { isVideo, videoDuration, aspectRatio, language } = opts;
    const langCode = (language || "hi").split("-")[0].toLowerCase();
    const aspectConfig = VIDEO_ASPECT_RATIOS[aspectRatio] || VIDEO_ASPECT_RATIOS["9:16"];
    const brandName = ctx.brandOrProductName || "TallyBook POS";
    const item = ctx.productCategory || ctx.brandOrProductName || (ctx.domain === "software" ? "Pharmacy Application" : "products");
    const businessName = ctx.resolvedBusinessType;
    const occasionTitle = ctx.isCustomOccasion ? "" : opts.occasion;
    const hasDisc = ctx.hasDiscount;
    const discText = ctx.discountText;

    let template = "";

    // DOMAIN 1: SOFTWARE / APPLICATION / POS / PHARMACY APP
    if (ctx.domain === "software") {
      if (langCode === "hi") {
        if (!isVideo || videoDuration === 15) {
          template = `नमस्ते दोस्तों! पेश है ${brandName} – Pharmacy Stores के लिए एक स्मार्ट Billing और Inventory Management Application।

अब करें Fast Pharmacy Billing, Manage करें Medicine Stock, Batch Number, Expiry Date और GST।

सिर्फ एक क्लिक में Purchase Bill Scan करें और आसानी से Automatic Purchase Entry करें।

अपनी Pharmacy का Billing और Stock Management बनाएं आसान और स्मार्ट।

आज ही ${brandName} अपनाएं!`;
        } else if (videoDuration === 5) {
          template = `धमाकेदार ${brandName}! अब Pharmacy Billing और Stock Management करें सिर्फ एक क्लिक में। आज ही अपनाएं!`;
        } else if (videoDuration === 30) {
          template = `नमस्ते दोस्तों! क्या आप अपनी फार्मेसी बिलिंग और इन्वेंटरी मैनेजमेंट को लेकर परेशान हैं?

पेश है ${brandName} – Pharmacy Stores के लिए एक ऑल-इन-वन स्मार्ट Billing और Inventory Management Application!

अब करें सुपरफास्ट Pharmacy Billing, आसानी से Manage करें Medicine Stock, Batch Number, Expiry Dates और GST।

सिर्फ एक क्लिक में Purchase Bill Scan करें और Automatic Purchase Bill Entry पाएं।

अपनी फार्मेसी का बिजनेस बनाएं 100% डिजिटल, आसान और तेज।

आज ही संपर्क करें और ${brandName} का फ्री डेमो लें!`;
        } else {
          template = `नमस्ते दोस्तों! पेश है ${brandName} – Pharmacy और Medical Stores के लिए भारत का सबसे भरोसेमंद स्मार्ट Billing और Inventory Management Application। अब फास्ट बिलिंग, बैच नंबर, एक्सपायरी ट्रैकिंग और जीएसटी इनवॉइसिंग बनाएं बेहद आसान। सिर्फ एक क्लिक में परचेस बिल स्कैन करें और ऑटोमैटिक एंट्री पाएं। अपनी फार्मेसी को बनाएं स्मार्ट और सफल। आज ही संपर्क करें और फ्री डेमो पाएं!`;
        }
      } else if (langCode === "gu") {
        if (!isVideo || videoDuration === 15) {
          template = `નમસ્તે મિત્રો! પ્રસ્તુત છે ${brandName} – ફાર્મસી સ્ટોર્સ માટે એક સ્માર્ટ Billing અને Inventory Management Application.

હવે કરો Fast Pharmacy Billing, Manage કરો Medicine Stock, Batch Number, Expiry Date અને GST.

માત્ર એક ક્લિકમાં Purchase Bill Scan કરો અને સરળતાથી Automatic Purchase Entry કરો.

તમારી Pharmacy નું Billing અને Stock Management બનાવો ઝડપી અને સ્માર્ટ.

આજે જ ${brandName} અપનાવો!`;
        } else if (videoDuration === 5) {
          template = `ધમાકેદાર ${brandName}! ફાર્મસી બિલિંગ અને સ્ટોક મેનેજમેન્ટ હવે માત્ર એક ક્લિકમાં. આજે જ વસાવો!`;
        } else {
          template = `નમસ્તે મિત્રો! પ્રસ્તુત છે ${brandName} – ફાર્મસી સ્ટોર્સ માટે એક સંપૂર્ણ સ્માર્ટ Billing અને Inventory Management સોલ્યુશન. હવે કરો સુપરફાસ્ટ બિલિંગ, મેડિસિન સ્ટોક, બેચ નંબર અને એક્સપાયરી ડેટ ટ્રેકિંગ. સિંગલ ક્લિકમાં પર્ચેઝ બિલ સ્કેન કરો અને આપમેળે એન્ટ્રી કરો. આજે જ ડેમો બુક કરો!`;
        }
      } else if (langCode === "ur") {
        template = `محترم دوستو! پیش ہے ${brandName} – فارمیسی اور میڈیکل اسٹورز کے لیے ایک اسمارٹ بلنگ اور انوینٹری مینجمنٹ ایپلیکیشن۔

اب کریں تیز رفتار فارمیسی بلنگ، میڈیسن اسٹاک، بیچ نمبر، ایکسپائری ڈیٹ اور جی ایس ٹی کا آسان انتظام۔

صرف ایک کلک میں پرچیز بل اسکین کریں اور آٹومیٹک پرچیز انٹری پائیں۔

अपनी فارمیسی کا نظام بنائیں جدید، تیز اور اسمارٹ۔

آج ہی ${brandName} اپنائیں!`;
      } else if (langCode === "ar") {
        template = `مرحباً بكم! نقدم لكم ${brandName} – الحل الذكي والمتكامل لإدارة الصيدليات والفواتير والمخزون.

تمتعوا بفواتير صيدلانية فائقة السرعة، إدارة ذكية لمخزون الأدوية، تتبع تواريخ الصلاحية والتشغيلات، وحسابات الضريبة بدقة.

مسح ضوئي لفواتير الشراء بنقرة واحدة مع إدخال تلقائي وسريع.

اجعل إدارة صيدليتك أكثر ذكاءً وسهولة مع ${brandName}!`;
      } else {
        template = `Hello everyone! Introducing ${brandName} – the smart Billing & Inventory Management Application for Pharmacy Stores.

Experience Fast Pharmacy Billing, effortlessly manage Medicine Stock, Batch Numbers, Expiry Dates, and GST.

Scan purchase bills with a single click for instant Automatic Purchase Bill Entry.

Make your pharmacy management accurate, efficient, and smart.

Get started with ${brandName} today!`;
      }
    }
    // DOMAIN 2 & 3: FOOTWEAR & GARMENTS & GENERAL
    else {
      const introPhraseHi = ctx.isCustomOccasion
        ? "धमाकेदार स्पेशल ऑफर!"
        : `इस ${occasionTitle} के पावन अवसर पर`;
      const greetingHi = ctx.isCustomOccasion
        ? `नमस्ते दोस्तों! ${businessName} लेकर आया है एक्सक्लूसिव कलेक्शन।`
        : `नमस्ते दोस्तों! इस ${occasionTitle} पर ${businessName} लेकर आया है धमाकेदार ऑफर।`;

      if (!isVideo) {
        template = hasDisc
          ? `🎉 ${ctx.isCustomOccasion ? "Special Exclusive Celebration" : `Special ${occasionTitle} Celebration`}! 🎉\n\nUpgrade your style with premium ${item} from ${businessName}!\n\n✨ Flat ${discText} on our entire collection!\n🚚 Express Delivery & Premium Quality Guaranteed.\n\n👉 Contact us now to claim your exclusive offer!`
          : `✨ ${ctx.isCustomOccasion ? "Special Showcase" : `Happy ${occasionTitle}`} from ${businessName}! ✨\n\nDiscover our latest collection of ${item}. Crafted for elegance and unparalleled quality.\n\n📍 Visit our store or message us today to explore!`;
      } else {
        if (langCode === "hi") {
          if (videoDuration === 5) {
            template = hasDisc
              ? `${introPhraseHi} हमारे प्रीमियम ${item} पर पाइये ${discText} की विशेष छूट। आज ही आएं!`
              : `शानदार कलेक्शन! हमारे प्रीमियम ${item} के साथ अपना स्टाइल अपग्रेड करें। आज ही पधारें!`;
          } else if (videoDuration === 15) {
            template = hasDisc
              ? `${greetingHi} हमारे प्रीमियम ${item} पर पाइये फ्लैट ${discText} की भारी छूट। बेहतरीन स्टाइल, अद्वितीय कम्फर्ट और टिकाऊ क्वालिटी। आज ही आएं और अपना मनपसंद कलेक्शन चुनें!`
              : `${greetingHi} हमारे प्रीमियम ${item} देंगे आपको लाजवाब स्टाइल और पूरा कम्फर्ट। हर कदम पर आत्मविश्वास महसूस करें। आज ही स्टोर पर पधारें या तुरंत ऑनलाइन आर्डर करें!`;
          } else {
            template = `${greetingHi} हमारे प्रीमियम ${item} में आपको मिलेगी असली मजबूती, परफेक्ट कम्फर्ट और लेटेस्ट फैशन का बेजोड़ तालमेल। अपनी पर्सनालिटी को दें एक नया निखार। आज ही हमारे स्टोर पर विजिट करें या मैसेज करके बुकिंग पक्की करें!`;
          }
        } else if (langCode === "gu") {
          template = `નમસ્તે મિત્રો! ${ctx.isCustomOccasion ? "વિશેષ ઓફર" : `આ ${occasionTitle} પર`} ${businessName} લાવ્યા છે ખાસ ઓફર. અમારા પ્રીમિયમ ${item} પર મેળવો ${hasDisc ? `ફ્લેટ ${discText} ની વિશેષ છૂટ` : "શ્રેષ્ઠ ક્વોલિટી અને ડિઝાઇન"}. આજે જ મુલાકાત લો!`;
        } else if (langCode === "ur") {
          template = `خوش آمدید! ${businessName} پیش کرتا ہے پریمیم ${item} کا شاندار نیا کلیکشن۔ ${hasDisc ? `پائیں فلیٹ ${discText} کی رعایت!` : "اعلیٰ معیار اور پائیداری۔"} آج ہی تشریف لائیں!`;
        } else if (langCode === "ar") {
          template = `أهلاً بكم! يسر ${businessName} أن يقدم لكم أرقى التشكيلات من ${item}. ${hasDisc ? `خصم حصري يصل إلى ${discText}!` : "جودة استثنائية وأناقة لا مثيل لها."} زورونا اليوم!`;
        } else {
          template = `Celebrate with ${businessName}! Discover our handcrafted collection of ${item}. ${hasDisc ? `Enjoy up to ${discText} off for a limited time!` : "Unmatched quality and timeless appeal."} Visit us or order online today!`;
        }
      }
    }

    const imagePrompt = isVideo
      ? buildDomainVideoMotionPrompt({
          domain: ctx.domain,
          brandOrProductName: ctx.brandOrProductName,
          productCategory: ctx.productCategory,
          businessType: ctx.resolvedBusinessType,
          occasion: ctx.resolvedOccasion,
          isCustomOccasion: ctx.isCustomOccasion,
          aspectRatio,
          durationSeconds: videoDuration,
          customPrompt: opts.customPrompt,
        })
      : buildDomainImagePrompt({
          domain: ctx.domain,
          brandOrProductName: ctx.brandOrProductName,
          productCategory: ctx.productCategory,
          businessType: ctx.resolvedBusinessType,
          occasion: ctx.resolvedOccasion,
          isCustomOccasion: ctx.isCustomOccasion,
          aspectRatio,
          hasDiscount: ctx.hasDiscount,
          discountText: ctx.discountText,
        });

    return { template, imagePrompt };
  }

  const handleGenerate = async () => {
    if (!formData.businessType || !formData.occasion) {
      toast.error("Please select business type and occasion");
      return;
    }

    const isVideo = contentType === "video";
    setIsGenerating(true);

    try {
      let generatedTemplate = "";
      let generatedImagePrompt = "";

      // Construct dynamic prioritized prompt
      const dynamicPrompt = buildDynamicAiPrompt({
        businessType: formData.businessType,
        productCategory: formData.productCategory,
        discount: formData.discount[0],
        occasion: formData.occasion,
        customPrompt: formData.customPrompt,
        isVideo,
        videoDuration,
        aspectRatio: videoAspectRatio,
        language: voiceoverLanguage,
        gender: voiceGender,
        selectedVoiceId,
      });

      if (textProvider === "nvidia") {
        try {
          toast.info(
            isVideo
              ? `Generating ${videoDuration}s video script & frame prompt with NVIDIA Nemotron...`
              : "Generating marketing template with NVIDIA Nemotron Reasoning..."
          );

          const res = await generateNvidiaChatCompletion({
            model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
            messages: [
              { role: "system", content: dynamicPrompt.systemPrompt },
              { role: "user", content: dynamicPrompt.userPrompt },
            ],
            temperature: 0.6,
            maxTokens: 4096,
          });

          const text = res.content || "";
          const templateMatch = text.match(/TEMPLATE:\s*([\s\S]*?)(?=IMAGE_PROMPT:|$)/i);
          const imagePromptMatch = text.match(/IMAGE_PROMPT:\s*([\s\S]*?)$/i);

          const template = templateMatch ? templateMatch[1].trim() : text;
          const rawImagePrompt = imagePromptMatch ? imagePromptMatch[1].trim() : text;
          const imagePrompt = optimizeMarketingImagePrompt(rawImagePrompt, {
            businessType: dynamicPrompt.resolvedBusinessType,
            occasion: dynamicPrompt.resolvedOccasion,
            discount: formData.discount[0],
          });

          generatedTemplate = template;
          generatedImagePrompt = imagePrompt;
        } catch (nvidiaErr) {
          console.warn("NVIDIA Nemotron generation failed, falling back to standard AI template generator:", nvidiaErr);
          toast.warning("NVIDIA reasoning unavailable, falling back to AI generator...");
        }
      }

      if (!generatedTemplate) {
        try {
          // Allow up to 35 seconds for Google Gemini / cloud edge function
          const timeoutPromise = new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 35000)
          );
          const response = await Promise.race([
            supabase.functions.invoke("generate-template", {
              body: {
                type: isVideo ? "video_template" : "marketing_template",
                businessType: dynamicPrompt.resolvedBusinessType,
                productCategory: formData.productCategory,
                discount: formData.discount[0],
                occasion: dynamicPrompt.resolvedOccasion,
                customPrompt: dynamicPrompt.userPrompt,
                textProvider: textProvider === "nvidia" ? "gemini" : textProvider,
                videoDuration,
                videoAspectRatio,
                voiceoverLanguage,
                voiceGender,
                selectedVoiceId,
              },
            }),
            timeoutPromise,
          ]);

          if (response.data?.template) {
            generatedTemplate = response.data.template;
            generatedImagePrompt = response.data.imagePrompt || "";
          } else if (response.data?.error) {
            console.warn("generate-template error:", response.data.error);
          }
        } catch (edgeCallErr) {
          console.warn("generate-template network/edge error:", edgeCallErr);
        }

        // Smart fallback synthesis if the cloud API returned an error or was unavailable
        if (!generatedTemplate) {
          const fallback = generateSmartFallbackTemplate({
            businessType: formData.businessType,
            productCategory: formData.productCategory,
            discount: formData.discount[0],
            occasion: formData.occasion,
            customPrompt: formData.customPrompt,
            isVideo,
            videoDuration,
            aspectRatio: videoAspectRatio,
            language: voiceoverLanguage,
            gender: voiceGender,
          });
          generatedTemplate = fallback.template;
          generatedImagePrompt = fallback.imagePrompt;
        }
      }

      // Ensure generatedImagePrompt strictly adheres to domain rules and selected aspect ratio
      const promptCtx = resolvePromptContext({
        businessType: formData.businessType,
        productCategory: formData.productCategory,
        occasion: formData.occasion,
        customPrompt: formData.customPrompt,
      });

      if (!generatedImagePrompt || promptCtx.domain === "software") {
        const containsForbiddenArtifacts = /curtain|fabric|shoe|footwear|sneaker|dress|garment|holographic/i.test(generatedImagePrompt);
        const missingPharmacyContext = !/pharmacy|medicine|billing|stock|tally|pos/i.test(generatedImagePrompt);
        if (containsForbiddenArtifacts || missingPharmacyContext || !generatedImagePrompt) {
          generatedImagePrompt = isVideo
            ? buildDomainVideoMotionPrompt({
                domain: promptCtx.domain,
                brandOrProductName: promptCtx.brandOrProductName,
                productCategory: promptCtx.productCategory,
                businessType: promptCtx.resolvedBusinessType,
                occasion: promptCtx.resolvedOccasion,
                isCustomOccasion: promptCtx.isCustomOccasion,
                aspectRatio: videoAspectRatio,
                durationSeconds: videoDuration,
                customPrompt: formData.customPrompt,
              })
            : buildDomainImagePrompt({
                domain: promptCtx.domain,
                brandOrProductName: promptCtx.brandOrProductName,
                productCategory: promptCtx.productCategory,
                businessType: promptCtx.resolvedBusinessType,
                occasion: promptCtx.resolvedOccasion,
                isCustomOccasion: promptCtx.isCustomOccasion,
                aspectRatio: videoAspectRatio,
                hasDiscount: promptCtx.hasDiscount,
                discountText: promptCtx.discountText,
              });
        }
      }

      setGeneratedContent({
        template: generatedTemplate,
        imagePrompt: generatedImagePrompt,
        generatedImage: "",
      });
      if (isVideo) {
        setVideoVoiceoverText(generatedTemplate);
        setVideoVoiceoverAudio(null);
        setVideoVoiceoverScript(null);
        setGeneratedVideoBlob(null);
        setGeneratedVideoUrl(null);
      }
      toast.success(isVideo ? "Video template generated successfully!" : "Template generated successfully!");
    } catch (error: any) {
      console.error("Generation error:", error);
      const msg = error?.message || "Failed to generate template. Please try again.";
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} copied to clipboard!`);
  };

  /** Dev-only A/B test: identical prompt, dimensions and seed across two models. */
  const handleCompareModels = async () => {
    const promptToGenerate = generatedContent.imagePrompt.trim();
    if (!promptToGenerate) {
      toast.error("Generate a template first to get an image prompt");
      return;
    }

    const modelA = selectedPollinationsModel;
    const modelB = abModelB || pollinationsModelOptions.find((m) => m.id !== modelA)?.id || "";
    if (!modelB || modelB === modelA) {
      toast.error("Pick two different Pollinations models to compare");
      return;
    }

    const { width, height } = getPollinationsDimensions(undefined, contentType === "video" ? videoAspectRatio : undefined);
    const seed = createPollinationsSeed(); // same seed for both models -> fair comparison
    setIsComparingModels(true);
    setAbResults([]);

    const results: PollinationsAbResult[] = [];
    for (const model of [modelA, modelB]) {
      try {
        const result = await generatePollinationsImage({
          prompt: promptToGenerate,
          model,
          width,
          height,
          endpoint: pollinationsEndpoint,
          seed,
          apiKey: pollinationsApiKey || null,
        });
        results.push({ model, imageUrl: result.imageUrl, debug: result.debug });
      } catch (error) {
        results.push({ model, error: error instanceof Error ? error.message : String(error) });
      }
      setAbResults([...results]);
    }

    setIsComparingModels(false);
    console.info(
      "[pollinations] A/B comparison",
      results.map((r) => ({
        model: r.model,
        status: r.debug?.status,
        bytes: r.debug?.bytes,
        promptMatchesRequestUrl: r.debug?.promptMatchesRequestUrl,
        error: r.error,
      }))
    );
  };

  const handleOptimizePrompt = () => {
    if (!generatedContent.imagePrompt.trim()) {
      toast.error("Enter an image prompt first");
      return;
    }
    const optimized = optimizeMarketingImagePrompt(generatedContent.imagePrompt, {
      businessType: formData.businessType,
      occasion: formData.occasion,
      discount: formData.discount[0],
    });
    setGeneratedContent(prev => ({ ...prev, imagePrompt: optimized }));
    toast.success("Prompt optimized for clean commercial image generation!");
  };

  const handleGenerateImage = async () => {
    const rawPrompt = generatedContent.imagePrompt.trim();
    if (!rawPrompt) {
      toast.error("Generate a template first to get an image prompt");
      return;
    }

    const currentPrompt = optimizeMarketingImagePrompt(rawPrompt, {
      businessType: formData.businessType,
      occasion: formData.occasion,
      discount: formData.discount[0],
    });

    setIsGeneratingImage(true);

    const providerInfo = imageProviders.find(p => p.id === imageProvider);
    const providerName = providerInfo?.label || imageProvider;

    // Pollinations.ai: send the EXACT current prompt to Pollinations with an
    // explicit model and controlled dimensions. No prompt rewriting/truncation,
    // no enhance=true, no stale React state, and no fallback to other providers.
    if (imageProvider === "pollinations") {
      const promptToGenerate = currentPrompt;
      const { width, height } = getPollinationsDimensions(undefined, contentType === "video" ? videoAspectRatio : undefined);

      setImageDebug(null);
      try {
        const result = await generatePollinationsImage({
          prompt: promptToGenerate,
          model: selectedPollinationsModel,
          width,
          height,
          endpoint: pollinationsEndpoint,
          seed: createPollinationsSeed(),
          apiKey: pollinationsApiKey || null,
        });

        // The displayed image is the exact bytes returned by Pollinations.
        setImageDebug(result.debug);
        setGeneratedContent(prev => ({
          ...prev,
          generatedImage: result.imageUrl,
        }));
        toast.success(
          `Image generated with ${result.debug.model} (${result.debug.width}x${result.debug.height})`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const kind = error instanceof PollinationsImageError ? error.kind : undefined;
        console.error("❌ Pollinations generation failed:", { kind, message });

        if (kind === "model_unavailable") {
          toast.error(message);
        } else if (kind === "unauthorized") {
          toast.error(`${message} Add your Pollinations API key in API Setup.`);
        } else if (kind === "rate_limited") {
          toast.error(message);
        } else {
          toast.error(`Pollinations image generation failed: ${message}`);
        }
      } finally {
        setIsGeneratingImage(false);
      }
      return;
    }

    if (imageProvider === "nvidia") {
      try {
        toast.info("Generating image with NVIDIA FLUX...");
        const result = await generateNvidiaImage({
          prompt: currentPrompt,
          model: "flux-3-image-klein",
          width: contentType === "video" ? VIDEO_ASPECT_RATIOS[videoAspectRatio].width : 1024,
          height: contentType === "video" ? VIDEO_ASPECT_RATIOS[videoAspectRatio].height : 1024,
          steps: 25,
        });

        if (result.imageUrl) {
          setGeneratedContent((prev) => ({
            ...prev,
            generatedImage: result.imageUrl,
          }));
          toast.success("Image generated successfully with NVIDIA FLUX!");
          setIsGeneratingImage(false);
          return;
        }
      } catch (nvidiaErr: any) {
        console.warn("NVIDIA FLUX direct generation encountered issue, attempting high-speed FLUX fallback:", nvidiaErr);
        toast.info("NVIDIA NIM server busy. Falling back to high-speed FLUX generation...");
        try {
          const { width, height } = getPollinationsDimensions(undefined, contentType === "video" ? videoAspectRatio : undefined);
          const fallbackRes = await generatePollinationsImage({
            prompt: currentPrompt,
            model: "flux",
            width,
            height,
            endpoint: pollinationsEndpoint,
            seed: createPollinationsSeed(),
            apiKey: pollinationsApiKey || null,
          });
          if (fallbackRes.imageUrl) {
            setGeneratedContent((prev) => ({
              ...prev,
              generatedImage: fallbackRes.imageUrl,
            }));
            toast.success("Image generated successfully via FLUX!");
            setIsGeneratingImage(false);
            return;
          }
        } catch {
          toast.error(`NVIDIA FLUX generation error: ${nvidiaErr?.message || "Unknown error"}`);
          setIsGeneratingImage(false);
          return;
        }
      }
    }

    if (imageProvider === "pexels") {
      try {
        toast.info("Finding high-resolution commercial stock photo on Pexels...");
        const pexelsRes = await supabase.functions.invoke("pexels-search", {
          body: { query: currentPrompt.trim(), kind: "photo" },
        });
        if (pexelsRes.error) throw pexelsRes.error;
        if (pexelsRes.data?.imageUrl) {
          setGeneratedContent(prev => ({
            ...prev,
            generatedImage: pexelsRes.data.imageUrl,
          }));
          toast.success("Stock photo found on Pexels!");
          setIsGeneratingImage(false);
          return;
        }
      } catch (err: any) {
        toast.error(`Pexels photo search failed: ${err.message || "Unknown error"}`);
        setIsGeneratingImage(false);
        return;
      }
    }

    try {
      const response = await supabase.functions.invoke("generate-template", {
        body: {
          type: "generate_image",
          imagePrompt: currentPrompt,
          imageProvider,
        },
      });

      if (response.data?.error) {
        toast.error(`${providerName} failed: ${response.data.error}`);
        return;
      }

      if (response.error) throw response.error;

      if (response.data.imageUrl) {
        setGeneratedContent(prev => ({
          ...prev,
          generatedImage: response.data.imageUrl,
        }));
        if (response.data.warning) toast.warning(response.data.warning);
        toast.success("Image generated successfully!");
      }

    } catch (error) {
      console.error("Image generation error:", error);
      toast.error(`${providerName}: Failed to generate image. Please check your API key in API Setup.`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    if (!generatedContent.template) {
      toast.error("Generate a template first");
      return;
    }

    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("templates").insert({
      user_id: user.id,
      name: templateName,
      content: generatedContent.template,
      image_prompt: generatedContent.imagePrompt,
      business_type: formData.businessType,
      category: formData.productCategory,
      occasion: formData.occasion,
    });

    if (error) {
      toast.error("Failed to save template");
    } else {
      toast.success("Template saved to library!");
      setTemplateName("");
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Template Generator</h1>
        <p className="text-muted-foreground">
          Generate marketing templates and promotional images using AI
        </p>
      </div>

      {/* Content Type Tabs */}
      <div className="grid grid-cols-3 gap-4">
        {contentTypes.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setContentType(id)}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${contentType === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
          >
            <Icon className="h-6 w-6" />
            <span className="font-semibold text-sm">{label}</span>
            <span className="text-xs opacity-70">{description}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Template Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Business Type</Label>
              <Select
                value={formData.businessType}
                onValueChange={(value) =>
                  setFormData({ ...formData, businessType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  {businessTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-category">Product Category</Label>
              <Input
                id="product-category"
                value={formData.productCategory}
                onChange={(e) =>
                  setFormData({ ...formData, productCategory: e.target.value })
                }
                placeholder="e.g., Ethnic Wear, Smartphones, Gold Jewelry"
              />
            </div>

            <div className="space-y-2">
              <Label>Discount Percentage: {formData.discount[0] === 0 ? "No discount" : `${formData.discount[0]}%`}</Label>
              <Slider
                value={formData.discount}
                onValueChange={(value) =>
                  setFormData({ ...formData, discount: value })
                }
                max={90}
                min={0}
                step={5}
                className="py-4"
              />
            </div>

            <div className="space-y-2">
              <Label>Festival / Occasion</Label>
              <Select
                value={formData.occasion}
                onValueChange={(value) =>
                  setFormData({ ...formData, occasion: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select occasion" />
                </SelectTrigger>
                <SelectContent>
                  {occasions.map((occasion) => (
                    <SelectItem key={occasion} value={occasion}>
                      {occasion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Text AI Provider</Label>
              <Select value={textProvider} onValueChange={(v) => setTextProvider(v as "lovable_ai" | "gemini" | "nvidia")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">
                    Google Gemini {availableKeys.gemini_api_key && <Badge variant="outline" className="ml-1 text-xs">Active</Badge>}
                  </SelectItem>
                  <SelectItem value="nvidia">
                    NVIDIA Nemotron Reasoning {availableKeys.nvidia_api_key && <Badge variant="outline" className="ml-1 text-xs">Active</Badge>}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Video Configuration & Multilingual Voice (when Video Template tab selected) */}
            {contentType === "video" && (
              <div className="space-y-4 rounded-lg border border-primary/25 bg-muted/20 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Film className="h-4 w-4" />
                    <span>AI Video & Multilingual Settings</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Direct MP4
                  </Badge>
                </div>

                {/* 1. Video Duration - Strictly 5s, 15s, 30s, 60s (No 90s) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Video Duration
                    </Label>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {VIDEO_DURATIONS.find((d) => d.duration === videoDuration)?.description}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {VIDEO_DURATIONS.map((dur) => (
                      <button
                        key={dur.duration}
                        type="button"
                        onClick={() => setVideoDuration(dur.duration)}
                        className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${videoDuration === dur.duration
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card hover:border-primary/50 text-muted-foreground"
                          }`}
                      >
                        {dur.duration}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Video Aspect Ratio - Strictly 16:9, 9:16, 1:1 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Aspect Ratio</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {VIDEO_ASPECT_RATIOS[videoAspectRatio].name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(VIDEO_ASPECT_RATIOS) as VideoAspectRatio[]).map((ratioKey) => {
                      const cfg = VIDEO_ASPECT_RATIOS[ratioKey];
                      return (
                        <button
                          key={ratioKey}
                          type="button"
                          onClick={() => handleAspectRatioChange(ratioKey)}
                          className={`flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs transition-colors ${videoAspectRatio === ratioKey
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-border bg-card text-muted-foreground hover:border-primary/50"
                            }`}
                        >
                          <span className="font-mono text-xs">{cfg.id}</span>
                          <span className="text-[10px] opacity-75">{cfg.width}×{cfg.height}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Multilingual Voice Support */}
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5 text-primary" /> Voiceover Language
                    </Label>
                    {isRtlLanguage(voiceoverLanguage) && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                        RTL Text Direction
                      </Badge>
                    )}
                  </div>
                  <Select value={voiceoverLanguage} onValueChange={handleLanguageChange}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.id} value={lang.id} className="text-xs">
                          {lang.flagEmoji} {lang.label} ({lang.nativeName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Voice Gender & Accent Selection */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Voice Gender</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => handleGenderChange("female")}
                          className={`rounded border py-1 text-xs font-medium ${voiceGender === "female"
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border text-muted-foreground"
                            }`}
                        >
                          Female
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenderChange("male")}
                          className={`rounded border py-1 text-xs font-medium ${voiceGender === "male"
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border text-muted-foreground"
                            }`}
                        >
                          Male
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Voice Persona</Label>
                      <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId}>
                        <SelectTrigger className="h-7 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getVoicesForLanguage(voiceoverLanguage, voiceGender).map((v) => (
                            <SelectItem key={v.id} value={v.id} className="text-xs">
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt"
                value={formData.customPrompt}
                onChange={(e) =>
                  setFormData({ ...formData, customPrompt: e.target.value })
                }
                placeholder="Add any specific requirements or tone preferences..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {contentType === "video" ? "Generate Video Script & Frame" : "Generate Template"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Output */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-0.5">
                  <CardTitle className="flex items-center gap-2">
                    {contentType === "video" ? (
                      <>
                        <Film className="h-5 w-5 text-primary" />
                        <span>Video Promo Script ({SUPPORTED_LANGUAGES.find((l) => l.id === voiceoverLanguage)?.nativeName || voiceoverLanguage})</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-5 w-5" />
                        <span>WhatsApp Message Template</span>
                      </>
                    )}
                  </CardTitle>
                  {contentType === "video" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {(videoVoiceoverText || generatedContent.template || "").trim().split(/\s+/).filter(Boolean).length} words
                      </span>
                      <span>•</span>
                      <span className="text-primary font-medium">
                        Target: {VIDEO_DURATIONS.find((d) => d.duration === videoDuration)?.minWords}–{VIDEO_DURATIONS.find((d) => d.duration === videoDuration)?.maxWords} words ({videoDuration}s)
                      </span>
                      {isRtlLanguage(voiceoverLanguage) && (
                        <Badge variant="outline" className="text-[10px]">RTL</Badge>
                      )}
                    </div>
                  )}
                </div>
                {generatedContent.template && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {contentType === "video" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs gap-1"
                          onClick={handlePreviewVoiceover}
                          disabled={isPreviewingVoice || !generatedContent.template.trim()}
                          title="Preview voiceover audio"
                        >
                          {isPreviewingVoice ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5 text-primary" />
                          )}
                          <span>Preview</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                          onClick={handleDownloadVoice}
                          disabled={isDownloadingVoice || !generatedContent.template.trim()}
                          title="Download voiceover (.mp3)"
                        >
                          {isDownloadingVoice ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          <span>Voice .mp3</span>
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSocialPostMediaType(contentType === "video" && generatedVideoUrl ? "video" : "image");
                        setSocialPostOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-xs h-8 border-primary/40 text-primary hover:bg-primary/10 shadow-sm"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Direct Social Post
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(generatedContent.template, "Template")}
                      className="h-8 w-8 p-0"
                      title="Copy template"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {generatedContent.template ? (
                <>
                  <Textarea
                    value={contentType === "video" ? (videoVoiceoverText || generatedContent.template) : generatedContent.template}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGeneratedContent({ ...generatedContent, template: val });
                      if (contentType === "video") {
                        setVideoVoiceoverText(val);
                        setVideoVoiceoverAudio(null);
                      }
                    }}
                    dir={contentType === "video" && isRtlLanguage(voiceoverLanguage) ? "rtl" : "ltr"}
                    rows={contentType === "video" ? 6 : 8}
                    className={`font-mono text-sm ${contentType === "video" && isRtlLanguage(voiceoverLanguage) ? "text-right font-sans text-base" : ""}`}
                  />
                  {contentType === "video" && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2 text-xs border border-border/60 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium text-[11px]">Remix Language:</span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <button
                            key={lang.id}
                            type="button"
                            onClick={() => handleVideoLanguageRemix(lang.id)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors border ${voiceoverLanguage === lang.id
                                ? "border-primary bg-primary text-primary-foreground font-semibold"
                                : "border-border bg-card text-muted-foreground hover:border-primary/50"
                              }`}
                          >
                            {lang.nativeName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {contentType === "video" && videoVoiceoverAudio && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                      <div className="flex items-center gap-1.5">
                        <Volume2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-medium text-[11px]">
                          Voice audio ready ({SUPPORTED_LANGUAGES.find((l) => l.id === voiceoverLanguage)?.nativeName})
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            try {
                              if (voicePreviewAudioRef.current) voicePreviewAudioRef.current.pause();
                              const audio = new Audio(`data:audio/mpeg;base64,${videoVoiceoverAudio}`);
                              voicePreviewAudioRef.current = audio;
                              audio.play();
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                        >
                          Play
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={handleDownloadVoice}
                        >
                          Save .mp3
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground text-xs">
                  {contentType === "video" ? "Generated video script will appear here" : "Generated template will appear here"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image Provider Selector */}
          {(contentType === "poster" || contentType === "video") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImagePlus className="h-5 w-5" />
                  {contentType === "video" ? "Video Background Frame Provider" : "Image Generation Provider"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {imageProviders.map(({ id, label, keyName, description }) => {
                    const isAvailable = id === "auto" || id === "lovable_ai" || id === "pollinations" || Boolean(availableKeys[keyName]);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setImageProvider(id);
                          if (!isAvailable && keyName) {
                            toast.info(`${label} requires an API key. You can add it in API Setup.`, {
                              action: {
                                label: "API Setup",
                                onClick: () => navigate("/api-setup"),
                              },
                            });
                          }
                        }}
                        className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${imageProvider === id
                            ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm"
                            : isAvailable
                              ? "border-border hover:border-primary/50"
                              : "border-border hover:border-amber-500/50 bg-muted/20"
                          }`}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-sm font-medium">{label}</span>
                          {isAvailable && id !== "lovable_ai" && id !== "pollinations" && (
                            <Badge className="text-[10px] px-1.5 py-0 ml-auto bg-success text-white">
                              <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                              Active
                            </Badge>
                          )}
                          {id === "pollinations" && (
                            <Badge className="text-[10px] px-1.5 py-0 ml-auto bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              {hasPollinationsKey || availableKeys.pollinations_api_key ? "Active (API)" : "Free HD"}
                            </Badge>
                          )}
                          {!isAvailable && keyName && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/api-setup");
                              }}
                              className="text-[10px] text-amber-500 font-medium ml-auto hover:underline cursor-pointer"
                              title="Click to configure in API Setup"
                            >
                              Key needed &rarr;
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-2.5">
                  <span>Configure Pollinations, NVIDIA, or Stability keys:</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-primary font-medium"
                    onClick={() => navigate("/api-setup")}
                  >
                    API Setup &rarr;
                  </Button>
                </div>
                {imageProvider === "pollinations" && (
                  <div className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-3">
                    <Label className="text-xs font-medium">
                      Pollinations model (sent explicitly - never auto-switched)
                    </Label>
                    <Select value={selectedPollinationsModel} onValueChange={setPollinationsModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POLLINATIONS_MODELS.map((model) => {
                          const available = isPollinationsModelAvailable(
                            model.id,
                            pollinationsEndpoint,
                            hasPollinationsKey
                          );
                          return (
                            <SelectItem key={model.id} value={model.id} disabled={!available}>
                              {model.label}
                              {model.supportsTypography ? " - poster text ready" : " - weak at poster text"}
                              {available ? "" : " (unavailable: needs a Pollinations API key)"}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {hasPollinationsKey
                        ? "Pollinations API key detected - the full model catalog (including typography-strong models) is available."
                        : `No Pollinations API key configured. Pollinations rejects key-less image requests with HTTP 403, so add POLLINATIONS_API_KEY in API Setup before generating. The legacy tier only ever served ${DEFAULT_LEGACY_POLLINATIONS_MODEL}.`}
                    </p>
                  </div>
                )}
                {imageProvider === "nvidia" && (
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">NVIDIA image model access</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleCheckNvidiaImageAccess(true)}
                        disabled={nvidiaChecking}
                      >
                        {nvidiaChecking && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {nvidiaResults ? "Re-check" : "Check Access"}
                      </Button>
                    </div>
                    {nvidiaResults && (
                      <>
                        <ul className="space-y-1.5">
                          {nvidiaResults.map((result) => (
                            <li key={result.id} className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-mono text-[11px]">{result.label}</p>
                                <p className="text-[10px] text-muted-foreground">{result.reason}</p>
                              </div>
                              <Badge variant={result.access === "granted" ? "default" : "destructive"} className={result.access === "granted" ? "bg-success" : ""}>
                                {result.access === "granted" ? "Access" : "No Access"}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                        {hasNvidiaFluxAccess(nvidiaResults) ? (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                            ✓ Primary model (flux.1-schnell) is active and ready to generate images.
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground pt-1">
                            Image generation will automatically use Pollinations AI fallback when NVIDIA models are unavailable.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  {contentType === "video"
                    ? `Video Background Frame Prompt (${VIDEO_ASPECT_RATIOS[videoAspectRatio].id})`
                    : "Poster Image Prompt"}
                </CardTitle>
                <div className="flex gap-2">
                  {generatedContent.imagePrompt && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOptimizePrompt}
                        title="Optimize prompt for studio commercial quality (removes fake UI text & formatting)"
                      >
                        <Wand2 className="h-4 w-4 mr-1 text-primary" />
                        <span>Optimize Prompt</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(generatedContent.imagePrompt, "Image prompt")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleGenerateImage}
                        disabled={isGeneratingImage || nvidiaChecking}
                      >
                        {isGeneratingImage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        <span className="ml-1">{contentType === "video" ? "Generate Frame" : "Generate Image"}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={generatedContent.imagePrompt}
                onChange={(e) =>
                  setGeneratedContent({
                    ...generatedContent,
                    imagePrompt: e.target.value,
                  })
                }
                rows={4}
                className="font-mono text-sm"
                placeholder="Type your image prompt here directly, or use 'Generate Template' to auto-generate one. e.g., 'Diwali sale poster for jewelry store, 50% off, festive gold and red theme'"
              />

              {/* Generation Debug (development only - never shows API keys) */}
              {import.meta.env.DEV && imageDebug && (
                <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Generation Debug</p>
                    <Badge variant="outline">dev only - no API keys</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                    <span>Provider:</span><span>{imageDebug.provider}</span>
                    <span>Endpoint:</span><span>{imageDebug.endpoint}</span>
                    <span>Model:</span><span className="break-all">{imageDebug.model}</span>
                    <span>Width:</span><span>{imageDebug.width}</span>
                    <span>Height:</span><span>{imageDebug.height}</span>
                    <span>Seed:</span><span>{imageDebug.seed}</span>
                    <span>Enhance:</span><span>{String(imageDebug.enhance)}</span>
                    <span>nologo:</span><span>{String(imageDebug.nologo)}</span>
                    <span>negative_prompt sent:</span><span>{String(imageDebug.negativePromptSent)}</span>
                    <span>API key:</span><span>{imageDebug.apiKeyConfigured ? "configured (hidden)" : "not configured"}</span>
                    <span>Auth mode:</span><span>{imageDebug.authMode}</span>
                    <span>Prompt in URL matches:</span>
                    <span>{imageDebug.promptMatchesRequestUrl ? "yes" : "NO"}</span>
                    <span>Response:</span>
                    <span>
                      {imageDebug.status ?? "-"} {imageDebug.contentType ?? ""} {imageDebug.bytes ?? 0}B{" "}
                      {imageDebug.durationMs ?? 0}ms
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Final Prompt (exact, {imageDebug.promptLength} chars)
                    </Label>
                    <Textarea readOnly value={imageDebug.prompt} className="h-32 font-mono text-xs" />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Image Request URL</Label>
                    <Textarea readOnly value={imageDebug.requestUrl} className="h-24 font-mono text-xs" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      Model A/B test - same prompt, same seed, two models
                    </Label>
                    <Select
                      value={
                        abModelB ||
                        pollinationsModelOptions.find((m) => m.id !== selectedPollinationsModel)?.id ||
                        ""
                      }
                      onValueChange={setAbModelB}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Second model" />
                      </SelectTrigger>
                      <SelectContent>
                        {pollinationsModelOptions
                          .filter((m) => m.id !== selectedPollinationsModel)
                          .map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isComparingModels || !generatedContent.imagePrompt.trim()}
                      onClick={handleCompareModels}
                    >
                      {isComparingModels ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="mr-2 h-4 w-4" />
                      )}
                      Run A/B comparison
                    </Button>

                    {abResults.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {abResults.map((result) => (
                          <div key={result.model} className="space-y-1 rounded border p-2 text-xs">
                            <p className="break-all font-mono">{result.model}</p>
                            {result.imageUrl ? (
                              <img
                                src={result.imageUrl}
                                alt={`A/B result for ${result.model}`}
                                className="w-full rounded border object-contain"
                              />
                            ) : (
                              <p className="text-destructive">{result.error}</p>
                            )}
                            {result.debug && (
                              <p className="text-muted-foreground">
                                HTTP {result.debug.status ?? "-"} | {result.debug.bytes ?? 0}B | seed{" "}
                                {result.debug.seed} | prompt-in-url{" "}
                                {result.debug.promptMatchesRequestUrl ? "ok" : "FAILED"}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground">{describeAbComparison(abResults)}</p>
                  </div>
                </div>
              )}

              {/* Generated Image Display */}
              {isGeneratingImage && (
                <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed bg-muted/50">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Generating image...</p>
                  </div>
                </div>
              )}

              {generatedContent.generatedImage && !isGeneratingImage && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {contentType === "video"
                        ? `Video Background Frame (${VIDEO_ASPECT_RATIOS[videoAspectRatio].id})`
                        : "Generated Poster"}
                    </p>
                    {contentType === "video" && (
                      <Badge variant="outline" className="text-xs">
                        {VIDEO_ASPECT_RATIOS[videoAspectRatio].width} × {VIDEO_ASPECT_RATIOS[videoAspectRatio].height}
                      </Badge>
                    )}
                  </div>
                  <div className="relative rounded-lg overflow-hidden border bg-black/5 max-h-[360px] flex items-center justify-center">
                    <img
                      src={generatedContent.generatedImage}
                      alt={contentType === "video" ? "Video background frame" : "Generated promotional poster"}
                      className="max-h-[360px] w-auto object-contain mx-auto"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedContent.generatedImage;
                        link.download = `${contentType === "video" ? "video-frame" : "poster"}-${formData.occasion || 'promo'}.png`;
                        link.click();
                      }}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download Frame
                    </Button>
                    {contentType === "poster" && (
                      <Button
                        size="sm"
                        className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium shadow-sm"
                        onClick={() => {
                          setSocialPostMediaType("image");
                          setSocialPostOpen(true);
                        }}
                      >
                        <Share2 className="mr-1.5 h-3.5 w-3.5" />
                        Post to Social Media
                      </Button>
                    )}
                  </div>

                  {/* Video Render Action Card */}
                  {contentType === "video" && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3 mt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Film className="h-4 w-4 text-primary" />
                          <span className="text-xs font-semibold">
                            Render Promo Video ({videoDuration}s • {VIDEO_ASPECT_RATIOS[videoAspectRatio].id})
                          </span>
                        </div>
                        {isRtlLanguage(voiceoverLanguage) && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                            RTL Subtitles
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGeneratePromoVideo}
                          disabled={isGeneratingVideo || !generatedContent.generatedImage}
                          className="w-full text-xs font-medium"
                        >
                          {isGeneratingVideo ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Film className="mr-1.5 h-3.5 w-3.5 text-primary" />
                          )}
                          Promo Video
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleGenerateAIVideoWithAudio}
                          disabled={isGeneratingVideo || !generatedContent.generatedImage}
                          className="w-full text-xs bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-sm font-medium"
                        >
                          {isGeneratingVideo ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          AI Video + Audio
                        </Button>
                      </div>

                      {/* Generated MP4 Video Player */}
                      {generatedVideoUrl && (
                        <div className="space-y-2 pt-2 border-t border-border/60">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle className="h-3.5 w-3.5" />
                              MP4 Ready ({videoDuration}s • {VIDEO_ASPECT_RATIOS[videoAspectRatio].width}×{VIDEO_ASPECT_RATIOS[videoAspectRatio].height})
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {generatedVideoBlob ? `${Math.round(generatedVideoBlob.size / 1024)} KB` : ""}
                            </span>
                          </div>
                          <div className="relative rounded-lg overflow-hidden border bg-black flex items-center justify-center">
                            <video
                              src={generatedVideoUrl}
                              controls
                              autoPlay
                              loop
                              className="max-h-[300px] w-full object-contain"
                            />
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs gap-1"
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = generatedVideoUrl;
                                link.download = `promo_${voiceoverLanguage}_${videoDuration}s_${Date.now()}.mp4`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download MP4
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium"
                              onClick={() => {
                                setSocialPostMediaType("video");
                                setSocialPostOpen(true);
                              }}
                            >
                              <Share2 className="h-3.5 w-3.5 mr-1" />
                              Post to Social Media
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {generatedContent.template && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-secondary/5 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Share2 className="h-5 w-5 text-primary" />
                  Direct Social Media Post
                </CardTitle>
                <CardDescription>
                  Publish this generated template and marketing image directly to Instagram, Facebook, LinkedIn, X, and YouTube.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <Button
                    onClick={() => {
                      setSocialPostMediaType(contentType === "video" && generatedVideoUrl ? "video" : "image");
                      setSocialPostOpen(true);
                    }}
                    className="w-full sm:flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white shadow-md font-medium"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Direct Social Media Post
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const activeType = (contentType === "video" && generatedVideoUrl) ? "video" : "image";
                      const activeMedia = activeType === "video" ? generatedVideoUrl : (generatedContent.generatedImage || null);
                      navigate("/social-media", {
                        state: {
                          content: generatedContent.template,
                          mediaUrl: activeMedia,
                          imageUrl: generatedContent.generatedImage || null,
                          videoUrl: generatedVideoUrl || null,
                          mediaType: activeType,
                          selectedMediaType: activeType,
                        },
                      });
                    }}
                    className="w-full sm:w-auto flex items-center gap-1.5"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in Studio
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {generatedContent.template && (
            <Card>
              <CardHeader>
                <CardTitle>Save to Library</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Diwali Sale 2024"
                  />
                </div>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Template
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Direct Social Media Post Dialog */}
      <DirectSocialPostDialog
        open={socialPostOpen}
        onOpenChange={setSocialPostOpen}
        initialContent={generatedContent.template}
        initialImageUrl={generatedContent.generatedImage}
        initialVideoUrl={generatedVideoUrl || undefined}
        initialMediaType={socialPostMediaType}
        templateName={templateName || formData.occasion || "Marketing Template"}
      />

      {/* Video Preview Dialog */}
      <Dialog open={isVideoPreviewOpen} onOpenChange={setIsVideoPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5 text-primary" />
              <span>Promo Video Preview ({videoDuration}s • {VIDEO_ASPECT_RATIOS[videoAspectRatio].id})</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {generatedVideoUrl && (
              <div className="relative rounded-lg overflow-hidden border bg-black flex items-center justify-center">
                <video
                  src={generatedVideoUrl}
                  controls
                  autoPlay
                  loop
                  className="max-h-[380px] w-full object-contain"
                />
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Language: {SUPPORTED_LANGUAGES.find((l) => l.id === voiceoverLanguage)?.nativeName || voiceoverLanguage}</span>
              <span>Dimensions: {VIDEO_ASPECT_RATIOS[videoAspectRatio].width} × {VIDEO_ASPECT_RATIOS[videoAspectRatio].height}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => {
                  if (generatedVideoUrl) {
                    const link = document.createElement("a");
                    link.href = generatedVideoUrl;
                    link.download = `promo_${voiceoverLanguage}_${videoDuration}s_${Date.now()}.mp4`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download MP4
              </Button>
              <Button
                className="flex-1 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                onClick={() => {
                  setIsVideoPreviewOpen(false);
                  setSocialPostMediaType("video");
                  setSocialPostOpen(true);
                }}
              >
                <Share2 className="mr-1.5 h-3.5 w-3.5" />
                Post to Social Media
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
