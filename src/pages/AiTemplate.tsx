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
function getPollinationsDimensions(platform?: string): { width: number; height: number; aspectRatio: string } {
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
      } catch {}
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

  const handlePreviewVoiceover = async () => {
    const text = (videoVoiceoverText || generatedContent.template || "").trim();
    if (!text) {
      toast.error("Please generate or enter a voiceover script first");
      return;
    }
    if (voicePreviewAudioRef.current) {
      try {
        voicePreviewAudioRef.current.pause();
      } catch {}
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

  const buildDynamicMotionPrompt = (customUserPrompt?: string): string => {
    const parts: string[] = [];
    const subject = (formData.productCategory || formData.businessType || "footwear product").trim();
    const occasion = (formData.occasion || "commercial showcase").trim();

    parts.push(`Google Flow cinematic commercial advertisement video showcasing ${subject} for ${occasion}.`);

    const details = customUserPrompt || generatedContent.imagePrompt || "";
    if (details.trim()) {
      parts.push(`Product identity & construction details: ${details.trim()}.`);
    }

    // Google Flow motion quality directives (rotation, camera tracking, dynamic lighting, product locking)
    parts.push(
      "Cinematic Camera Choreography: Continuous 360-degree turntable product rotation revealing bottom outsole tread, midsole cushioning, heel counter, side profile, and footwear upper construction.",
      "Dynamic slow zoom-in with smooth dolly tracking and orbital sweeping camera movement around the product.",
      "Lighting & Shadows: Moving commercial studio spotlight illumination, soft specular reflections gliding across product surfaces, realistic contact shadows shifting along the ground plane.",
      "Atmospheric Motion: Subtle floating ambient dust particles, gentle atmospheric haze with shallow depth of field bokeh transitions.",
      "Product Preservation: Strict product identity lock—preserve authentic footwear silhouette, color scheme, materials, stitching, shoe laces, and brand logo with zero warping or distortion.",
      "Ultra high framerate, photorealistic 4K commercial advertisement quality with fluid continuous multi-frame motion."
    );

    if (formData.customPrompt?.trim()) {
      parts.push(`Creative directives: ${formData.customPrompt.trim()}`);
    }

    return parts.join(" ");
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
  const { businessType, productCategory, discount, occasion, isVideo, videoDuration, aspectRatio, language, gender } = opts;
  const item = productCategory || businessType || "products";
  const hasDisc = discount && discount > 0;
  const discText = hasDisc ? `${discount}%` : "";
  const langCode = (language || "hi").split("-")[0].toLowerCase();
  const aspectConfig = VIDEO_ASPECT_RATIOS[aspectRatio] || VIDEO_ASPECT_RATIOS["9:16"];

  let template = "";
  if (!isVideo) {
    template = hasDisc
      ? `🎉 Special ${occasion} Celebration! 🎉\n\nUpgrade your style with exclusive ${item} from ${businessType}!\n\n✨ Flat ${discText} OFF on our entire premium collection!\n🚚 Express Delivery & Premium Quality Guaranteed.\n\n👉 Contact us now to claim your exclusive offer!`
      : `✨ Happy ${occasion} from ${businessType}! ✨\n\nDiscover our latest premium collection of ${item}. Crafted for elegance and unparalleled quality.\n\n📍 Visit our store or message us today to explore the collection!`;
  } else {
    if (langCode === "gu") {
      if (videoDuration === 5) {
        template = hasDisc
          ? `ધમાકેદાર ${occasion} ઓફર! અમારા પ્રીમિયમ ${item} પર મેળવો ${discText} ની ભારે છૂટ. આજે જ પધારો!`
          : `ખાસ ${occasion} કલેક્શન! અમારા પ્રીમિયમ ${item} સાથે તમારો અંદાજ બદલો. આજે જ મુલાકાત લો!`;
      } else if (videoDuration === 15) {
        template = hasDisc
          ? `નમસ્તે મિત્રો! આ ${occasion} પર ${businessType} લાવ્યા છે ખાસ ઓફર. અમારા પ્રીમિયમ ${item} પર મેળવો ફ્લેટ ${discText} ની વિશેષ છૂટ. શ્રેષ્ઠ ક્વોલિટી, આરામદાયક સ્ટાઇલ અને લેટેસ્ટ ડિઝાઇન. આજે જ મુલાકાત લો અને ઑફરનો લાભ ઉઠાવો!`
          : `નમસ્તે મિત્રો! આ ${occasion} પર ${businessType} લાવ્યા છે સુપ્રીમ કલેક્શન. અમારા પ્રીમિયમ ${item} આપે છે બેહતરીન કમ્ફર્ટ અને અદભુત લુક. દરેક પળમાં ચમકો નવા આત્મવિશ્વાસ સાથે. આજે જ મુલાકાત લો અથવા ઓર્ડર કરો!`;
      } else if (videoDuration === 30) {
        template = hasDisc
          ? `નમસ્તે દોસ્તો! આ ${occasion} તમારા માટે કંઈક ખાસ લઈને આવ્યું છે. ${businessType} લાવ્યા છે પ્રીમિયમ ${item} નું સુપરહિટ કલેક્શન, એ પણ ફ્લેટ ${discText} ની ધમાકેદાર છૂટ સાથે! આધુનિક ડિઝાઇન, અતૂટ ટકાઉપણું અને અલ્ટીમેટ કમ્ફર્ટ હવે તમારા બજેટમાં. લિમિટેડ સ્ટોક ઉપલબ્ધ છે, તો મોડું ના કરો. આજે જ અમારા સ્ટોરની મુલાકાત લો અથવા ઓનલાઇન ઓર્ડર બુક કરો અને ઉત્સવનો આનંદ બમણો કરો!`
          : `નમસ્તે દોસ્તો! આ ${occasion} તમારા માટે લાવ્યું છે નવી ખુશીઓ. ${businessType} પ્રસ્તુત કરે છે પ્રીમિયમ ${item} નું સૌથી નવું કલેક્શન. દરેક ઉત્પાદનમાં ઉત્કૃષ્ટ કારીગરી, શાનદાર ફિનિશિંગ અને લાંબા સમય સુધી ચાલતો આરામ. તમારા વ્યક્તિત્વને આપો એક નવી ઓળખ. સ્ટોક લિમિટેડ છે, તો આજે જ મુલાકાત લો અથવા વોટ્સએપ પર અમારો સંપર્ક કરો!`;
      } else {
        template = `નમસ્તે મિત્રો! આ ${occasion} ના પાવન પર્વે ${businessType} તરફથી હાર્દિક શુભેચ્છાઓ. અમે લાવ્યા છીએ અમારા પ્રીમિયમ ${item} ની વિશાળ શ્રેણી. અજોડ ગુણવત્તા, સુંદર ફેશન અને આકર્ષક કિંમત. ${hasDisc ? `ફ્લેટ ${discText} સ્પેશિયલ ડિસ્કાઉન્ટ ઉપલબ્ધ છે!` : "શ્રેષ્ઠ બ્રાન્ડ વેલ્યુ અને ટકાઉપણું!"} આજે જ પધારો!`;
      }
    } else if (langCode === "hi") {
      if (videoDuration === 5) {
        template = hasDisc
          ? `धमाकेदार ${occasion} ऑफर! हमारे प्रीमियम ${item} पर पाइये ${discText} की विशेष छूट। आज ही आएं!`
          : `शानदार ${occasion} कलेक्शन! हमारे प्रीमियम ${item} के साथ अपना स्टाइल अपग्रेड करें। आज ही पधारें!`;
      } else if (videoDuration === 15) {
        template = hasDisc
          ? `नमस्ते दोस्तों! इस ${occasion} के पावन अवसर पर ${businessType} लेकर आया है धमाकेदार ऑफर। हमारे प्रीमियम ${item} पर पाइये फ्लैट ${discText} की भारी छूट। बेहतरीन स्टाइल, अद्वितीय कम्फर्ट और टिकाऊ क्वालिटी। आज ही आएं और अपना मनपसंद कलेक्शन चुनें!`
          : `नमस्ते दोस्तों! इस ${occasion} पर ${businessType} पेश करता है एक्सक्लूसिव कलेक्शन। हमारे प्रीमियम ${item} देंगे आपको लाजवाब स्टाइल और पूरा कम्फर्ट। हर कदम पर आत्मविश्वास महसूस करें। आज ही स्टोर पर पधारें या तुरंत ऑनलाइन आर्डर करें!`;
      } else if (videoDuration === 30) {
        template = hasDisc
          ? `नमस्ते दोस्तों! इस ${occasion} अपने त्यौहार को बनाएं और भी खास। ${businessType} लेकर आया है प्रीमियम ${item} का सबसे नया और आकर्षक कलेक्शन, वह भी पूरे ${discText} की महा बचत के साथ! आधुनिक स्टाइल, मजबूत बनावट और बेजोड़ कम्फर्ट का बेहतरीन संगम। यह ऑफर केवल सीमित समय के लिए मान्य है, तो देर किस बात की? आज ही हमारे नजदीकी स्टोर पर आएं या दिए गए नंबर पर तुरंत संपर्क करें!`
          : `नमस्ते दोस्तों! इस ${occasion} के अवसर पर ${businessType} आपके लिए लाया है नए प्रोडक्ट्स की शानदार रेंज। हमारे प्रीमियम ${item} में आपको मिलेगी असली मजबूती, परफेक्ट कम्फर्ट और लेटेस्ट फैशन का बेजोड़ तालमेल। अपनी पर्सनालिटी को दें एक नया निखार। आज ही हमारे स्टोर पर विजिट करें या व्हाट्सएप पर मैसेज करके अपनी बुकिंग पक्की करें!`;
      } else {
        template = `नमस्ते दोस्तों! इस ${occasion} पर ${businessType} की तरफ से ढेर सारी शुभकामनाएं। हमारी प्रीमियम ${item} की रेंज अब खास कीमतों में उपलब्ध है। ${hasDisc ? `पाइये पूरे ${discText} की छूट!` : "उत्कृष्ट क्वालिटी और गारंटीड संतुष्टि!"} आज ही संपर्क करें!`;
      }
    } else if (langCode === "ur") {
      if (videoDuration === 5) {
        template = hasDisc
          ? `دھماکے دار ${occasion} آفر! ہمارے پریمیم ${item} پر پائیں ${discText} کی خصوصی رعایت۔ آج ہی تشریف لائیں!`
          : `شاندار ${occasion} کلیکشن! ہمارے پریمیم ${item} کے ساتھ اپنا نیا انداز اپنائیں۔ آج ہی تشریف لائیں!`;
      } else if (videoDuration === 15) {
        template = hasDisc
          ? `خوش آمدید! اس ${occasion} کے پرمسرت موقع پر ${businessType} لایا ہے اپنے تمام پریمیم ${item} پر فلیٹ ${discText} کی شاندار رعایت! بہترین کوالٹی، دلکش ڈیزائن اور زبردست آرام۔ آج ہی تشریف لائیں اور اس زبردست آفر سے فائدہ اٹھائیں۔`
          : `خوش آمدید! اس ${occasion} کے موقع پر ${businessType} پیش کرتا ہے پریمیم ${item} کا شاندار نیا کلیکشن۔ بہترین بناوٹ، اعلیٰ پائیداری اور لازوال نفاست۔ آج ہی تشریف لائیں یا فوری رابطہ کریں!`;
      } else if (videoDuration === 30) {
        template = hasDisc
          ? `محترم دوستو! اس ${occasion} اپنے تہوار کو بنائیں اور بھی خاص۔ ${businessType} لے کر آیا ہے پریمیم ${item} کا سب سے نیا اور دلکش کلیکشن، وہ بھی پورے ${discText} کی زبردست بچت کے ساتھ! جدید ترین انداز، مضبوط بناوٹ اور ہر قدم پر لاجواب آرام۔ یہ پیشکش محدود مدت کے لیے ہے، تو دیر نہ کیجئے۔ آج ہی ہمارے قریبی اسٹور پر تشریف لائیں یا واٹس ایپ پر فوری رابطہ کریں!`
          : `محترم دوستو! اس ${occasion} پر ${businessType} پیش کرتا ہے پریمیم ${item} کا سب سے نیا اور شاندار کلیکشن۔ بے مثال کوالٹی، مضبوط پائیداری اور ہر لمحے میں پرسکون آرام۔ اپنی شخصیت کو دیں ایک نیا اور دلکش نکھار۔ اسٹاک محدود ہے، آج ہی تشریف لائیں یا فوری آن لائن بکنگ کرائیں!`;
      } else {
        template = `محترم دوستو! اس ${occasion} کے موقع پر ${businessType} کی طرف سے دلی مبارکباد۔ ہماری پریمیم ${item} کی مکمل رینج اب خصوصی رعایت کے ساتھ دستیاب ہے۔ ${hasDisc ? `پائیں پورے ${discText} کی چھوٹ!` : "اعلیٰ ترین کوالٹی اور پائیداری کی مکمل ضمانت!"} آج ہی تشریف لائیں!`;
      }
    } else if (langCode === "ar") {
      if (videoDuration === 5) {
        template = hasDisc
          ? `أقوى عروض ${occasion}! احصل على خصم ${discText} على تشكيلتنا المميزة من ${item}. تفضل بزيارتنا اليوم!`
          : `تشكيلة ${occasion} الحصرية! ارتقِ بأناقتك مع أرقى تصاميم ${item} من ${businessType}. زورونا اليوم!`;
      } else if (videoDuration === 15) {
        template = hasDisc
          ? `أهلاً بكم! بمناسبة ${occasion} السعيدة، يسر ${businessType} أن يقدم لكم أقوى العروض! خصم حصري يصل إلى ${discText} على تشكيلتنا المميزة من ${item}. جودة استثنائية، راحة فائقة وتصاميم عصرية. تفضلوا بزيارتنا اليوم ولا تفوتوا الفرصة!`
          : `أهلاً بكم! احتفلوا بـ ${occasion} مع أحدث تشكيلات ${businessType} الفاخرة من ${item}. تصاميم أنيقة تجمع بين الراحة الفائقة والجودة العالية. تفضلوا بزيارتنا اليوم لتكتشفوا التميز والفخامة!`;
      } else if (videoDuration === 30) {
        template = hasDisc
          ? `مرحباً بكم جميعاً! اجعلوا احتفالكم بـ ${occasion} أكثر تميزاً مع ${businessType}! نقدم لكم اليوم أحدث تشكيلاتنا الفاخرة من ${item}، مع خصم خاص ومذهل قدره ${discText} لفترة محدودة! خامات متينة، راحة استثنائية وأناقة لا مثيل لها تلبي تطلعاتكم. الكمية محدودة جداً، سارعوا بزيارة معارضنا اليوم أو اطلبوا مباشرة عبر الواتساب!`
          : `مرحباً بكم جميعاً! بمناسبة ${occasion} المجيدة، تقدم لكم ${businessType} أرقى تصاميم ${item} العصرية. دقة متناهية في التصنيع، أقمشة وأنسجة فاخرة، وراحة مطلقة طوال اليوم تمنحكم ثقة كاملة في كل خطوة. زوروا أقرب فرع إليكم اليوم أو تواصلوا معنا لطلب تشكيلتكم المفضلة!`;
      } else {
        template = `أعزاءنا الكرام! يسعدنا في ${businessType} أن نهنئكم بمناسبة ${occasion}. نقدم لكم تشكيلتنا الكاملة من ${item} بأعلى معايير الجودة العالمية. ${hasDisc ? `استمتعوا بخصم ${discText} الرائع!` : "تصاميم راقية وأسعار مميزة!"} تفضلوا بزيارتنا الآن!`;
      }
    } else {
      if (videoDuration === 5) {
        template = hasDisc
          ? `Unstoppable style! Get flat ${discText} off on premium ${item} this ${occasion}. Shop now!`
          : `Elevate your look with premium ${item} from ${businessType}. Visit us today!`;
      } else if (videoDuration === 15) {
        template = hasDisc
          ? `Celebrate this ${occasion} in style! ${businessType} brings you an exclusive flat ${discText} discount across our entire premium ${item} collection. Unmatched comfort, trendsetting design, and peak durability. Grab yours today before stock runs out!`
          : `Discover the art of elegance this ${occasion}! ${businessType} presents our brand new premium ${item} line. Designed for maximum comfort and standout sophistication. Upgrade your daily style today!`;
      } else {
        template = hasDisc
          ? `Step up your presence this ${occasion} with ${businessType}! Enjoy up to ${discText} off on our handcrafted premium collection of ${item}. Engineered for luxurious comfort, superior performance, and effortless elegance. Don't wait—visit our store or order online today to claim your limited-time festive deal!`
          : `Step into pure sophistication this ${occasion} with ${businessType}! Experience our handcrafted premium collection of ${item}, meticulously designed for timeless appeal and supreme durability. Visit our showroom or message us today to explore the collection!`;
      }
    }
  }

  const imagePrompt = `Cinematic 4K promotional commercial video frame featuring ${item} by ${businessType}, ${occasion} visual celebration theme, dramatic studio spotlighting, elegant pedestals, dynamic camera angle, hyper-realistic textures, clean negative space for captions, aspect ratio ${aspectConfig.name}`;

  return { template, imagePrompt };
}

  const handleGenerate = async () => {
    if (!formData.businessType || !formData.occasion) {
      toast.error("Please select business type and occasion");
      return;
    }

    const isVideo = contentType === "video";
    const selectedVoiceObj = SUPPORTED_VOICES.find((v) => v.id === selectedVoiceId);
    const voicePersonaGuidance = isVideo
      ? `\nVOICE PERSONA & PERFORMANCE SPECIFICATIONS:
- Voice Actor Gender: ${voiceGender.toUpperCase()}
- Voice Persona / Actor: ${selectedVoiceObj?.name || (voiceGender === "male" ? "Aarav / Male Voice" : "Swara / Female Voice")}
- Tone & Delivery: ${
          voiceGender === "male"
            ? "Bold, energetic, authoritative masculine commercial cadence with punchy, confident delivery."
            : "Warm, inviting, vibrant feminine commercial cadence with captivating, friendly delivery."
        }`
      : "";
    const scriptGuidance = isVideo
      ? `${getScriptPromptGuidance(voiceoverLanguage, videoDuration)}${voicePersonaGuidance}`
      : "";
    const aspectConfig = VIDEO_ASPECT_RATIOS[videoAspectRatio];
    const targetWordRule = VIDEO_DURATIONS.find((d) => d.duration === videoDuration) || VIDEO_DURATIONS[1];

    setIsGenerating(true);
    try {
      let generatedTemplate = "";
      let generatedImagePrompt = "";

      if (textProvider === "nvidia") {
        try {
          toast.info(
            isVideo
              ? `Generating ${videoDuration}s video script & frame prompt with NVIDIA Nemotron...`
              : "Generating marketing template with NVIDIA Nemotron Reasoning..."
          );
          const systemPrompt = isVideo
            ? `You are an expert commercial video director, multilingual copywriter, and voiceover producer.
You create high-converting promotional video voiceover scripts optimized for social media marketing (Instagram Reels, YouTube Shorts, TikTok, Facebook).
You craft voiceover scripts specifically tailored for ${voiceGender === "male" ? "an energetic, confident, authoritative commercial male voice persona" : "a warm, vibrant, engaging commercial female voice persona"}.
You strictly follow target timing, word counts, and genuine native language scripts.`
            : `You are an expert Indian marketing copywriter specializing in WhatsApp Business marketing. 
You create engaging, festive, and culturally relevant marketing messages optimized for Indian audiences.
Your messages are concise, use emojis appropriately, and include clear call-to-actions.
Always maintain a professional yet friendly tone.`;

          const hasDiscount = formData.discount[0] > 0;
          const userPrompt = isVideo
            ? `Create a promotional marketing video voiceover script and video background frame image prompt for:

Business Type: ${formData.businessType}
Product Category: ${formData.productCategory || "General products"}
${hasDiscount ? `Discount: ${formData.discount[0]}% OFF` : "No discount offer - focus on brand awareness and product showcase"}
Occasion: ${formData.occasion}
${formData.customPrompt ? `Additional Instructions: ${formData.customPrompt}` : ""}

VIDEO TIMING, VOICE PERSONA & LANGUAGE SPECIFICATIONS:
- Video Duration: ${videoDuration} Seconds
- Video Aspect Ratio: ${aspectConfig.name} (${aspectConfig.width}x${aspectConfig.height})
- Script Target Word Count: EXACTLY ${targetWordRule.minWords} to ${targetWordRule.maxWords} words.
${scriptGuidance}

Please provide:
1. A video promo voiceover script (TEMPLATE) formatted strictly according to the exact duration, word count, native script, and voice persona (${voiceGender} voice actor).
2. An AI image prompt (IMAGE_PROMPT) for a cinematic commercial video background frame matching ${aspectConfig.name} (${aspectConfig.width}x${aspectConfig.height}).

Format your response exactly as:
TEMPLATE:
[Your video promo voiceover script here]

IMAGE_PROMPT:
[Your detailed video frame image prompt here]`
            : `Create a WhatsApp marketing message and promotional poster image prompt for:

Business Type: ${formData.businessType}
Product Category: ${formData.productCategory || "General products"}
${hasDiscount ? `Discount: ${formData.discount[0]}% OFF` : "No discount offer - focus on brand awareness and product showcase"}
Occasion: ${formData.occasion}
${formData.customPrompt ? `Additional Instructions: ${formData.customPrompt}` : ""}

Please provide:
1. A WhatsApp message template (max 500 characters) with:
   - Festive greeting appropriate for ${formData.occasion}
   ${hasDiscount ? "- Clear discount offer" : "- Focus on product quality and brand value"}
   - Urgency element
   - Call-to-action
   - Relevant emojis

2. A professional commercial image prompt for an AI image generator (FLUX / Midjourney style):
   - Subject: Vibrant commercial product photography or 3D promotional visual for ${formData.businessType} (${formData.productCategory || "products"})
   - Atmosphere: Festive visual theme matching ${formData.occasion} with elegant decorative elements (e.g., golden accents, warm ambient lighting, festive background)
   - Style: High-end commercial advertisement, studio lighting, hyper-realistic, 8k resolution, clean composition
   - STRICT RULES FOR IMAGE PROMPT:
     * Describe VISUAL objects, materials, and lighting — NOT mobile app screens or paragraphs of chat messages.
     * DO NOT ask the AI to draw entire phone UI chat screens, chat bubbles, or paragraphs of text (this causes distorted alien gibberish).
     ${hasDiscount ? `* Include a bold, elegant badge with "${formData.discount[0]}% OFF".` : "* ABSOLUTELY NO DISCOUNT, NO 0% OFF, and NO price badges."}
     * Include ample clean negative space for professional text overlays.
     * Format as a single flowing descriptive paragraph without markdown asterisks or bullet points.

Format your response exactly as:
TEMPLATE:
[Your WhatsApp message here]

IMAGE_PROMPT:
[Your detailed image generation prompt here]`;

          const res = await generateNvidiaChatCompletion({
            model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
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
            businessType: formData.businessType,
            occasion: formData.occasion,
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
          const timeoutPromise = new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 8000)
          );
          const response = await Promise.race([
            supabase.functions.invoke("generate-template", {
              body: {
                type: "marketing_template",
                businessType: formData.businessType,
                productCategory: formData.productCategory,
                discount: formData.discount[0],
                occasion: formData.occasion,
                customPrompt: isVideo
                  ? `CRITICAL FORMAT: Create a high-converting ${videoDuration}s promotional marketing VIDEO VOICEOVER SCRIPT and a CINEMATIC VIDEO BACKGROUND FRAME PROMPT.\n${scriptGuidance}${formData.customPrompt ? `\nAdditional Instructions: ${formData.customPrompt}` : ""}`
                  : formData.customPrompt,
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

    const { width, height } = getPollinationsDimensions();
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
      const { width, height } = getPollinationsDimensions();

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
        width: 1024,
        height: 1024,
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
        const { width, height } = getPollinationsDimensions();
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
            className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
              contentType === id
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
                        className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                          videoDuration === dur.duration
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
                          onClick={() => setVideoAspectRatio(ratioKey)}
                          className={`flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs transition-colors ${
                            videoAspectRatio === ratioKey
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
                          className={`rounded border py-1 text-xs font-medium ${
                            voiceGender === "female"
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          Female
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenderChange("male")}
                          className={`rounded border py-1 text-xs font-medium ${
                            voiceGender === "male"
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
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors border ${
                              voiceoverLanguage === lang.id
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
                        className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                          imageProvider === id
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
