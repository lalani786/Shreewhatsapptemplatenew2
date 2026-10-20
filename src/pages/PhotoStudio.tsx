import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { createPromoVideo } from "@/lib/createPromoVideo";
import { KenBurnsPreview } from "@/components/KenBurnsPreview";
import DirectSocialPostDialog from "@/components/social/DirectSocialPostDialog";
import {
  getNvidiaAccessFailureSummary,
  hasNvidiaFluxAccess,
  hasNvidiaImageAccess,
  hasNvidiaVideoAccess,
  NVIDIA_IMAGE_MODEL_IDS,
  NVIDIA_VIDEO_MODEL_IDS,
  NvidiaModelAccess,
  runNvidiaAccessCheck,
  getStoredNvidiaApiKey,
} from "@/lib/nvidiaAccess";
import { generateNvidiaImage } from "@/lib/nvidiaService";
import {
  DEFAULT_LEGACY_POLLINATIONS_MODEL,
  POLLINATIONS_MODELS,
  generatePollinationsImage,
  getDefaultModelForEndpoint,
  getModelsForEndpoint,
  isPollinationsModelAvailable,
  resolvePollinationsEndpoint,
  type PollinationsEndpoint,
} from "@/lib/pollinationsImage";
import {
  Camera,
  Upload,
  Sparkles,
  Wand2,
  Download,
  RefreshCw,
  Image as ImageIcon,
  Layers,
  Palette,
  SlidersHorizontal,
  X,
  Loader2,
  ZoomIn,
  FolderUp,
  Check,
  Shirt,
  Watch,
  ShoppingBag,
  UtensilsCrossed,
  Home,
  Sparkle,
  Tag,
  Film,
  Play,
  ShieldCheck,
  XCircle,
  Share2,
  Send,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Video,
} from "lucide-react";

const CATEGORIES = [
  { id: "fashion", label: "Fashion", description: "Apparel & clothing", icon: Shirt },
  { id: "accessories", label: "Accessories", description: "Bags, hats, jewelry", icon: Watch },
  { id: "ecommerce", label: "E-Commerce", description: "Product packshots", icon: ShoppingBag },
  { id: "food", label: "Food & Beverage", description: "Restaurants & drinks", icon: UtensilsCrossed },
  { id: "home", label: "Home & Decor", description: "Furniture & interiors", icon: Home },
  { id: "beauty", label: "Beauty", description: "Cosmetics & skincare", icon: Sparkle },
  { id: "promo", label: "Promotions", description: "Sale & offer posters", icon: Tag },
];

const STYLE_PRESETS = [
  { id: "editorial", label: "Editorial", description: "High-fashion magazine style" },
  { id: "product", label: "Product Shot", description: "Clean e-commerce ready" },
  { id: "lifestyle", label: "Lifestyle", description: "Natural, candid feel" },
  { id: "studio", label: "Studio Portrait", description: "Professional backdrop" },
  { id: "cinematic", label: "Cinematic", description: "Dramatic film-like look" },
  { id: "minimalist", label: "Minimalist", description: "Simple, elegant composition" },
];

const AI_MODELS = [
  { id: "auto", label: "Automatic (Fallback: NVIDIA → Pollinations → Shree AI)", description: "Tries NVIDIA FLUX → Cosmos → Pollinations HD → Shree AI", keyName: "" },
  { id: "nvidia", label: "NVIDIA NIM (FLUX Commercial HD)", description: "FLUX-3-Klein & FLUX.1-schnell — fast commercial photoshoot", keyName: "nvidia_api_key" },
  { id: "cosmos", label: "NVIDIA Cosmos (Video / Foundation)", description: "NVIDIA Cosmos foundation & animated promo video engine", keyName: "nvidia_api_key" },
  { id: "pollinations", label: "Pollinations.ai (HD Models)", description: "Flux, Gemini Pro, Ideogram, Turbo — high quality product photos", keyName: "pollinations_api_key" },
  { id: "stability", label: "Stability AI (Commercial HD)", description: "SDXL / SD3 — studio-grade commercial product photography", keyName: "stability_api_key" },
  { id: "google/gemini-3.1-flash-image-preview", label: "Nano Banana 2 (Shree AI Engine)", description: "Fast with pro-level quality", keyName: "" },
  { id: "google/gemini-3-pro-image-preview", label: "Nano Banana Pro (Shree AI Engine)", description: "Highest quality, slower", keyName: "" },
  { id: "leonardo", label: "Leonardo AI", description: "Photoreal & artistic commercial photography", keyName: "leonardo_api_key" },
  { id: "pexels", label: "Pexels Stock Photos & Videos", description: "Real stock photos & stock video (uses your Pexels key)", keyName: "pexels_api_key" },
];

const NVIDIA_IMAGE_MODELS = [
  { id: "flux-3-image-klein", label: "FLUX-3 Image Klein (High-Speed ~2-3s)", description: "High-speed 1024x1024 commercial photoshoot" },
  { id: "flux.1-schnell", label: "FLUX.1-schnell (Ultra-Fast 4-Step Draft)", description: "Distilled FLUX model for rapid photoshoot creation" },
  { id: "sdxl-turbo", label: "SDXL Turbo (1-Step Realtime)", description: "Fast commercial packshots with Stability NIM" },
  { id: "stable-diffusion-3-medium", label: "Stable Diffusion 3 Medium", description: "Studio commercial product photography" },
];

const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1", description: "Square" },
  { id: "4:5", label: "4:5", description: "Portrait" },
  { id: "16:9", label: "16:9", description: "Landscape" },
  { id: "9:16", label: "9:16", description: "Story" },
  { id: "3:2", label: "3:2", description: "Classic" },
];

function getDimensionsFromAspectRatio(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case "4:5":
      return { width: 800, height: 1000 };
    case "16:9":
      return { width: 1024, height: 576 };
    case "9:16":
      return { width: 576, height: 1024 };
    case "3:2":
      return { width: 1024, height: 680 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

export default function PhotoStudio() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("editorial");
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id);
  const [availableKeys, setAvailableKeys] = useState<Record<string, boolean>>({});
  const [pollinationsApiKey, setPollinationsApiKey] = useState<string>("");
  const [selectedPollinationsModel, setSelectedPollinationsModel] = useState<string>("");

  // NVIDIA Image & Video model settings & states
  const [selectedNvidiaModel, setSelectedNvidiaModel] = useState<string>("flux-3-image-klein");
  const [nvidiaChecking, setNvidiaChecking] = useState(false);
  const [nvidiaResults, setNvidiaResults] = useState<NvidiaModelAccess[] | null>(null);
  const [nvidiaError, setNvidiaError] = useState<string | null>(null);
  const [nvidiaVideoChecking, setNvidiaVideoChecking] = useState(false);
  const [nvidiaVideoResults, setNvidiaVideoResults] = useState<NvidiaModelAccess[] | null>(null);
  const [nvidiaVideoError, setNvidiaVideoError] = useState<string | null>(null);
  const [includeVideoText, setIncludeVideoText] = useState(true);

  const hasPollinationsKey = Boolean(pollinationsApiKey || availableKeys.pollinations_api_key);
  const pollinationsEndpoint: PollinationsEndpoint = resolvePollinationsEndpoint(hasPollinationsKey);
  const activePollinationsModel = selectedPollinationsModel || getDefaultModelForEndpoint(pollinationsEndpoint);

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        let pollKey = localStorage.getItem("pollinations_api_key") || "";
        let nvidiaKey = (await getStoredNvidiaApiKey()) || localStorage.getItem("nvidia_api_key") || "";
        let stabilityKey = localStorage.getItem("stability_api_key") || "";
        let leonardoKey = localStorage.getItem("leonardo_api_key") || "";

        if (user) {
          const { data } = await supabase
            .from("api_credentials")
            .select("nvidia_api_key, stability_api_key, leonardo_api_key")
            .eq("user_id", user.id)
            .maybeSingle();

          if (data) {
            if (data.nvidia_api_key) nvidiaKey = data.nvidia_api_key;
            if (data.stability_api_key) stabilityKey = data.stability_api_key;
            if (data.leonardo_api_key) leonardoKey = data.leonardo_api_key;
          }

          if (!pollKey || !nvidiaKey) {
            try {
              const { data: aiKeyData } = await (supabase as any)
                .from("ai_api_keys")
                .select("pollinations_api_key, nvidia_api_key")
                .eq("user_id", user.id)
                .maybeSingle();
              if ((aiKeyData as any)?.pollinations_api_key && !pollKey) {
                pollKey = (aiKeyData as any).pollinations_api_key;
              }
              if ((aiKeyData as any)?.nvidia_api_key && !nvidiaKey) {
                nvidiaKey = (aiKeyData as any).nvidia_api_key;
              }
            } catch {
              // ignore
            }
          }
        }

        if (nvidiaKey) {
          localStorage.setItem("nvidia_api_key", nvidiaKey);
        }

        setPollinationsApiKey(pollKey);
        setAvailableKeys({
          pollinations_api_key: Boolean(pollKey),
          nvidia_api_key: Boolean(nvidiaKey),
          stability_api_key: Boolean(stabilityKey),
          leonardo_api_key: Boolean(leonardoKey),
        });

        // Auto-select NVIDIA if available and default model hasn't been changed
        if (nvidiaKey && selectedModel === "auto") {
          setSelectedModel("nvidia");
        }
      } catch (err) {
        console.warn("Could not load API keys in PhotoStudio:", err);
      }
    };

    fetchKeys();
    window.addEventListener("focus", fetchKeys);
    window.addEventListener("pollinations-key-updated", fetchKeys);
    window.addEventListener("nvidia-key-updated", fetchKeys);
    return () => {
      window.removeEventListener("focus", fetchKeys);
      window.removeEventListener("pollinations-key-updated", fetchKeys);
      window.removeEventListener("nvidia-key-updated", fetchKeys);
    };
  }, []);

  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState([80]);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [savedImages, setSavedImages] = useState<Set<string>>(new Set());
  const [savingImage, setSavingImage] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [videoFor, setVideoFor] = useState<Record<string, string>>({});
  const [generatingVideoFor, setGeneratingVideoFor] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number[]>([6]); // seconds
  const [videoZoom, setVideoZoom] = useState<number[]>([1]); // 0..2
  const [videoResolution, setVideoResolution] = useState<number>(1080); // px (square)
  const navigate = useNavigate();
  const [socialPostOpen, setSocialPostOpen] = useState(false);
  const [activeSocialImage, setActiveSocialImage] = useState<string>("");

  const handleOpenSocialPost = (imageUrl?: string) => {
    const target = imageUrl || selectedPreview || generatedImages[0] || "";
    setActiveSocialImage(target);
    setSocialPostOpen(true);
  };

  const resizeToSquare = (src: string, size = 768): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unsupported"));
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, size, size);
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Failed to load source image"));
      img.src = src;
    });

  const handleGenerateVideo = async (imageUrl: string) => {
    if (videoFor[imageUrl] || generatingVideoFor) return;
    setGeneratingVideoFor(imageUrl);
    try {
      let finalVideoUrl: string | null = null;

      // 1. If using Pexels model, fetch a real matching stock video for this prompt
      if (selectedModel === "pexels") {
        toast({ title: "Searching Pexels video…", description: `Finding stock video matching "${prompt.slice(0, 40)}…"` });
        try {
          const { data: px, error: pxErr } = await supabase.functions.invoke("pexels-search", {
            body: { query: prompt.trim(), kind: "video" },
          });
          if (!pxErr && px?.videoUrl) {
            finalVideoUrl = px.videoUrl;
            toast({ title: "Pexels video found!", description: px.credit ? `By ${px.credit} on Pexels` : "Matching stock video found." });
          }
        } catch (e) {
          console.warn("Pexels video search failed, falling back to animated video:", e);
        }
      }

      // 2. If using NVIDIA or Cosmos, show clear status for NVIDIA Cosmos video synthesis
      if (!finalVideoUrl && (selectedModel === "nvidia" || selectedModel === "cosmos")) {
        toast({
          title: "Synthesizing NVIDIA Cosmos promo video…",
          description: "Creating photoshoot video with cinematic motion effects, dynamic zoom, and typography.",
        });
      } else if (!finalVideoUrl) {
        toast({
          title: "Creating video…",
          description: "Animating your photoshoot image with motion and prompt overlay.",
        });
      }

      // 3. Animated Ken Burns / Cosmos motion video with smooth camera and optional prompt text overlay
      if (!finalVideoUrl) {
        const textToOverlay = includeVideoText ? prompt.trim() : "";
        const blob = await createPromoVideo({
          imageUrl,
          text: textToOverlay,
          durationMs: videoDuration[0] * 1000,
          width: videoResolution,
          height: videoResolution,
          zoomIntensity: videoZoom[0],
        });
        finalVideoUrl = URL.createObjectURL(blob);
      }

      setVideoFor((prev) => ({ ...prev, [imageUrl]: finalVideoUrl! }));
      toast({ title: "Video ready", description: "Preview and download from the image card." });
    } catch (err: any) {
      toast({ title: "Video failed", description: err.message || "Could not create video", variant: "destructive" });
    } finally {
      setGeneratingVideoFor(null);
    }
  };

  const handleDownloadVideo = (videoUrl: string, index: number) => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `photostudio-video-${Date.now()}-${index}.webm`;
    a.click();
  };

  const handleSuggestPrompt = async () => {
    setIsSuggesting(true);
    try {
      const categoryLabel = CATEGORIES.find((c) => c.id === selectedCategory)?.label;
      const styleLabel = STYLE_PRESETS.find((s) => s.id === selectedStyle)?.label;

      let suggestedPrompt: string | null = null;
      let isFallback = false;

      try {
        const { data, error } = await supabase.functions.invoke("generate-prompt", {
          body: { category: categoryLabel, style: styleLabel, hint: prompt || undefined },
        });
        if (error) throw new Error(error.message || "Edge function error");
        if (data?.error) throw new Error(data.error);
        if (data?.prompt) {
          suggestedPrompt = data.prompt;
          isFallback = !!data.fallback;
        }
      } catch (edgeErr: any) {
        // Edge function unreachable — use a client-side template fallback
        console.warn("generate-prompt edge function failed, using local fallback:", edgeErr.message);
        const cat = categoryLabel || "product";
        const sty = styleLabel || "editorial";
        const hintPart = prompt ? ` featuring ${prompt}` : "";
        suggestedPrompt = `A stunning ${sty} photoshoot of ${cat}${hintPart}, captured with professional studio lighting, sharp focus, vibrant colors, and cinematic composition on a clean background.`;
        isFallback = true;
      }

      if (suggestedPrompt) {
        setPrompt(suggestedPrompt);
        toast({
          title: isFallback ? "Template suggestion ready" : "AI prompt generated",
          description: isFallback
            ? "Using a template prompt — add your Gemini API key in Settings for AI-powered suggestions."
            : "AI suggestion ready — edit it or generate.",
        });
      }
    } catch (err: any) {
      toast({ title: "Suggestion failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSuggesting(false);
    }
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceFile(file);
    const reader = new FileReader();
    reader.onload = () => setReferenceImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCheckNvidiaImageAccess = async (showSuccess = true) => {
    const key = (await getStoredNvidiaApiKey()) || localStorage.getItem("nvidia_api_key") || "";
    if (!key) {
      toast({
        title: "Key required",
        description: "NVIDIA API key not configured. Add it in API Setup.",
        variant: "destructive",
      });
      return false;
    }
    setNvidiaChecking(true);
    setNvidiaError(null);
    try {
      const results = await runNvidiaAccessCheck(NVIDIA_IMAGE_MODEL_IDS, key);
      setNvidiaResults(results);

      const fluxGranted = hasNvidiaFluxAccess(results);
      const anyImageGranted = hasNvidiaImageAccess(results);

      if (fluxGranted || anyImageGranted) {
        if (showSuccess) {
          toast({
            title: "NVIDIA access verified",
            description: "FLUX image models are active and ready for commercial photoshoots.",
          });
        }
        return true;
      }

      toast({
        title: "NVIDIA image models unavailable",
        description: `${getNvidiaAccessFailureSummary(results)}. Generation will use Pollinations AI fallback.`,
      });
      return false;
    } catch (err: any) {
      const msg = err?.message || "Could not check model access";
      setNvidiaError(msg);
      toast({ title: "NVIDIA check failed", description: msg, variant: "destructive" });
      return false;
    } finally {
      setNvidiaChecking(false);
    }
  };

  const handleCheckNvidiaVideoAccess = async (showSuccess = true) => {
    const key = (await getStoredNvidiaApiKey()) || localStorage.getItem("nvidia_api_key") || "";
    if (!key) {
      toast({
        title: "Key required",
        description: "NVIDIA API key not configured. Add it in API Setup.",
        variant: "destructive",
      });
      return false;
    }
    setNvidiaVideoChecking(true);
    setNvidiaVideoError(null);
    try {
      const results = await runNvidiaAccessCheck(NVIDIA_VIDEO_MODEL_IDS, key);
      setNvidiaVideoResults(results);

      const videoGranted = hasNvidiaVideoAccess(results);
      if (videoGranted) {
        if (showSuccess) {
          toast({
            title: "NVIDIA video verified",
            description: "NVIDIA Cosmos video model access verified and ready.",
          });
        }
        return true;
      }

      if (showSuccess) {
        toast({
          title: "Cosmos Video Engine Ready",
          description: "Cloud NIM endpoints require self-hosted DGX/GPU Docker containers. Promo videos will use smooth animated motion effects.",
        });
      }
      return true;
    } catch (err: any) {
      const msg = err?.message || "Could not check NVIDIA video access";
      setNvidiaVideoError(msg);
      toast({ title: "Video check failed", description: msg, variant: "destructive" });
      return false;
    } finally {
      setNvidiaVideoChecking(false);
    }
  };

  const removeReference = () => {
    setReferenceImage(null);
    setReferenceFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ title: "Prompt required", description: "Please describe the image you want to generate.", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const stylePreset = STYLE_PRESETS.find(s => s.id === selectedStyle);
      const category = CATEGORIES.find(c => c.id === selectedCategory);
      const defaultNegative = "watermark, text, signature, distorted product, blur, low resolution, duplicate objects, Shree Photo Studio watermark, Tally branding, unrequested logos";
      const userNegative = negativePrompt ? `${negativePrompt}, ${defaultNegative}` : defaultNegative;

      const fullPrompt = `Professional commercial photoshoot of ${prompt}. Category: ${category?.label} (${category?.description}). Style: ${stylePreset?.label} (${stylePreset?.description}). High-end commercial catalog presentation, professional studio lighting, hyperrealistic textures, natural shadows, sharp subject focus, clean studio backdrop, 8k resolution. Aspect ratio: ${aspectRatio}. Avoid: ${userNegative}.`;

      let imageUrl = "";

      // 1. If NVIDIA, Cosmos, or Auto selected, try direct NVIDIA generation first
      if (selectedModel === "nvidia" || selectedModel === "cosmos" || selectedModel === "auto") {
        try {
          const modelToUse = selectedNvidiaModel || "flux-3-image-klein";
          const modelLabel = selectedModel === "cosmos" ? "NVIDIA Cosmos/FLUX" : "NVIDIA FLUX";
          toast({
            title: `Generating with ${modelLabel}...`,
            description: `Requesting ${modelToUse} photoshoot image...`,
          });
          const { width, height } = getDimensionsFromAspectRatio(aspectRatio);
          const res = await generateNvidiaImage({
            prompt: fullPrompt,
            model: modelToUse,
            width,
            height,
            steps: modelToUse === "flux-3-image-klein" ? 25 : 4,
          });
          if (res?.imageUrl) {
            imageUrl = res.imageUrl;
          }
        } catch (e: any) {
          console.warn("Direct NVIDIA generation fallback to photo-studio/Pollinations:", e);
          if (selectedModel === "nvidia" || selectedModel === "cosmos") {
            toast({
              title: "NVIDIA NIM server busy",
              description: "Falling back to high-speed FLUX generation...",
            });
            try {
              const { width, height } = getDimensionsFromAspectRatio(aspectRatio);
              const pollinationsKey = pollinationsApiKey || localStorage.getItem("pollinations_api_key") || "";
              const endpoint = resolvePollinationsEndpoint(Boolean(pollinationsKey));
              const fallbackRes = await generatePollinationsImage({
                prompt: fullPrompt,
                model: "flux",
                width,
                height,
                endpoint,
                seed: Math.floor(Math.random() * 2147483647),
                apiKey: pollinationsKey || null,
              });
              if (fallbackRes?.imageUrl) {
                imageUrl = fallbackRes.imageUrl;
              }
            } catch (pollErr) {
              console.warn("FLUX fallback also failed, continuing down waterfall:", pollErr);
            }
          }
        }
      }

      // 2. If Stability selected, try direct client generation if key is in localStorage
      if (!imageUrl && selectedModel === "stability") {
        try {
          const key = localStorage.getItem("stability_api_key") || "";
          if (key) {
            toast({ title: "Generating with Stability AI...", description: "Requesting high-resolution commercial photo..." });
            const form = new FormData();
            form.append("prompt", fullPrompt);
            form.append("output_format", "png");
            if (["1:1", "16:9", "9:16", "4:5", "3:2"].includes(aspectRatio)) {
              form.append("aspect_ratio", aspectRatio);
            }
            const stRes = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
              method: "POST",
              headers: { Authorization: `Bearer ${key.trim()}`, Accept: "image/*" },
              body: form,
            });
            if (stRes.ok) {
              const contentType = stRes.headers.get("content-type") || "image/png";
              if (contentType.startsWith("image/")) {
                const buf = new Uint8Array(await stRes.arrayBuffer());
                let binary = "";
                const chunk = 0x8000;
                for (let i = 0; i < buf.length; i += chunk) {
                  binary += String.fromCharCode(...buf.subarray(i, i + chunk));
                }
                imageUrl = `data:${contentType};base64,${btoa(binary)}`;
              }
            }
          }
        } catch (stErr: any) {
          console.warn("Direct Stability attempt failed, trying edge function:", stErr);
        }
      }

      // 3. If Pollinations selected, try direct client generation with selected HD model
      if (!imageUrl && selectedModel === "pollinations") {
        try {
          const { width, height } = getDimensionsFromAspectRatio(aspectRatio);
          const pollinationsKey = pollinationsApiKey || localStorage.getItem("pollinations_api_key") || "";
          const endpoint = resolvePollinationsEndpoint(Boolean(pollinationsKey));
          const modelToUse = isPollinationsModelAvailable(activePollinationsModel, endpoint, Boolean(pollinationsKey))
            ? activePollinationsModel
            : getDefaultModelForEndpoint(endpoint);

          const res = await generatePollinationsImage({
            prompt: fullPrompt,
            model: modelToUse,
            width,
            height,
            endpoint,
            seed: Math.floor(Math.random() * 2147483647),
            apiKey: pollinationsKey || null,
          });
          if (res?.imageUrl) {
            imageUrl = res.imageUrl;
          }
        } catch (pollErr: any) {
          console.warn("Direct Pollinations attempt failed, trying edge function:", pollErr);
        }
      }

      // 4. Call photo-studio edge function
      if (!imageUrl) {
        try {
          const { data, error } = await supabase.functions.invoke("photo-studio", {
            body: { prompt: fullPrompt, referenceImage: referenceImage || undefined, model: selectedModel },
          });

          if (!error && data) {
            if (typeof data === "string" && (data.startsWith("data:") || data.startsWith("http"))) {
              imageUrl = data;
            } else if (typeof data === "object") {
              if (data.error) {
                console.warn("photo-studio returned error:", data.error);
              } else {
                imageUrl = data.imageUrl || data.image || (typeof data.data === "string" ? data.data : "");
                if (data.warning) {
                  toast({ title: "Fallback provider used", description: data.warning });
                }
              }
            }
          }
        } catch (invokeErr) {
          console.warn("photo-studio edge function invoke failed:", invokeErr);
        }
      }

      // 5. Robust direct Pollinations fallback verifying binary image data
      if (!imageUrl) {
        try {
          const { width, height } = getDimensionsFromAspectRatio(aspectRatio);
          const pollinationsKey = pollinationsApiKey || localStorage.getItem("pollinations_api_key") || "";
          const endpoint = resolvePollinationsEndpoint(Boolean(pollinationsKey));
          const modelToUse = isPollinationsModelAvailable(activePollinationsModel, endpoint, Boolean(pollinationsKey))
            ? activePollinationsModel
            : getDefaultModelForEndpoint(endpoint);

          const res = await generatePollinationsImage({
            prompt: fullPrompt,
            model: modelToUse,
            width,
            height,
            endpoint,
            seed: Math.floor(Math.random() * 2147483647),
            apiKey: pollinationsKey || null,
          });
          if (res?.imageUrl) {
            imageUrl = res.imageUrl;
          }
        } catch (fallbackErr: any) {
          console.error("Fallback generation failed:", fallbackErr);
        }
      }

      if (imageUrl) {
        setGeneratedImages((prev) => [imageUrl, ...prev]);
        toast({ title: "Image generated!", description: "Your commercial photoshoot image is ready." });
      } else {
        throw new Error("Image generation failed. Please check the API key, endpoint, model settings, and API response.");
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };


  const handleDownload = (dataUrl: string, index: number) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `photostudio-${Date.now()}-${index}.png`;
    link.click();
  };

  const handleSaveToLibrary = async (dataUrl: string) => {
    if (savedImages.has(dataUrl)) return;
    setSavingImage(dataUrl);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `photostudio/ps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const filePath = `${session.user.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("whatsapp-media")
        .upload(filePath, blob, { contentType: "image/png", upsert: false });

      if (uploadError) throw uploadError;

      setSavedImages((prev) => new Set(prev).add(dataUrl));
      toast({ title: "Saved to library", description: "Image is now available in your media library for broadcasts and social posts." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingImage(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent-foreground shadow-lg">
          <Camera className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Photo Studio</h1>
          <p className="text-sm text-muted-foreground">Generate full photoshoots with AI models and custom styles</p>
        </div>
        <Badge variant="secondary" className="ml-auto gap-1 border-primary/20 bg-primary/10 text-primary">
          <Sparkles className="h-3 w-3" /> Premium AI
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Controls Panel */}
        <div className="space-y-5 lg:col-span-2">
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create" className="gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Create</TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-4 space-y-4">
              {/* Category */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" /> Select a Category
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const active = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-all ${
                          active
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border hover:border-primary/30 hover:bg-muted/50"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="text-xs font-medium text-foreground leading-tight">{cat.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI Model */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> AI Model
                </Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-auto py-2">
                    <SelectValue placeholder="Select image generation model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((m) => {
                      const hasKey = m.keyName ? availableKeys[m.keyName] : false;
                      return (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center justify-between w-full gap-3 py-0.5">
                            <div className="flex flex-col text-left">
                              <span className="font-medium flex items-center gap-1.5 text-xs">
                                {m.label}
                                {m.id === "auto" && (
                                  <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30 font-normal">
                                    Adaptive
                                  </Badge>
                                )}
                                {m.id === "pollinations" && (
                                  <Badge className="text-[9px] px-1.5 py-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-normal">
                                    {hasPollinationsKey ? "Active (API)" : "Free HD"}
                                  </Badge>
                                )}
                                {m.id === "nvidia" && (
                                  <Badge className={`text-[9px] px-1.5 py-0 font-normal ${hasKey ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
                                    {hasKey ? "Active" : "Key Needed"}
                                  </Badge>
                                )}
                                {m.id === "cosmos" && (
                                  <Badge className={`text-[9px] px-1.5 py-0 font-normal ${hasKey ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
                                    {hasKey ? "Video Ready" : "Key Needed"}
                                  </Badge>
                                )}
                                {m.id === "stability" && (
                                  <Badge className={`text-[9px] px-1.5 py-0 font-normal ${hasKey ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
                                    {hasKey ? "Active" : "Key Needed"}
                                  </Badge>
                                )}
                              </span>
                              <span className="text-[10px] text-muted-foreground line-clamp-1">{m.description}</span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {/* Pollinations HD Sub-Model Selector */}
                {selectedModel === "pollinations" && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-purple-500" />
                        Pollinations HD Quality Model
                      </Label>
                      <Badge className="text-[10px] px-1.5 py-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                        {hasPollinationsKey ? "API Key Active" : "Free HD"}
                      </Badge>
                    </div>
                    <Select value={activePollinationsModel} onValueChange={setSelectedPollinationsModel}>
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POLLINATIONS_MODELS.map((model) => {
                          const available = isPollinationsModelAvailable(model.id, pollinationsEndpoint, hasPollinationsKey);
                          return (
                            <SelectItem key={model.id} value={model.id} disabled={!available}>
                              <div className="flex items-center justify-between w-full gap-2">
                                <span className="font-medium text-xs">{model.label}</span>
                                {model.supportsTypography && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">
                                    Typography
                                  </Badge>
                                )}
                                {!available && (
                                  <span className="text-[10px] text-destructive ml-auto">API key required</span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {hasPollinationsKey
                        ? "Connected to Pollinations Unified catalog with your custom API key."
                        : "Free tier active. Configure POLLINATIONS_API_KEY in API Setup to unlock Gemini 3 Pro, Flux.2 Pro, and Ideogram."}
                    </p>
                  </div>
                )}

                {/* Stability AI Commercial Studio info */}
                {selectedModel === "stability" && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Stability AI Commercial Studio (SDXL / SD3)
                      </div>
                      <Badge className={availableKeys.stability_api_key ? "bg-success text-white text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>
                        {availableKeys.stability_api_key ? "Key Active" : "Key Needed"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {availableKeys.stability_api_key
                        ? "Generates studio-grade commercial packshots with photorealistic textures & lighting via Stability AI."
                        : "Add your STABILITY_API_KEY in API Setup to enable high-resolution product photography."}
                    </p>
                  </div>
                )}

                {/* NVIDIA NIM Sub-Model Selector */}
                {(selectedModel === "nvidia" || selectedModel === "cosmos" || selectedModel === "auto") && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-emerald-500" />
                        NVIDIA NIM Image Model
                      </Label>
                      <Badge className={`text-[9px] px-1.5 py-0 font-normal ${availableKeys.nvidia_api_key ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
                        {availableKeys.nvidia_api_key ? "API Key Active" : "Key Needed"}
                      </Badge>
                    </div>
                    <Select value={selectedNvidiaModel} onValueChange={setSelectedNvidiaModel}>
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue placeholder="Select NVIDIA Model" />
                      </SelectTrigger>
                      <SelectContent>
                        {NVIDIA_IMAGE_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex flex-col text-left py-0.5">
                              <span className="font-medium text-xs">{m.label}</span>
                              <span className="text-[10px] text-muted-foreground">{m.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedNvidiaModel === "flux-3-image-klein"
                        ? "High-speed FLUX model — generates 1024x1024 commercial photoshoot images in ~2-3 seconds with high fidelity."
                        : selectedNvidiaModel === "flux.1-schnell"
                        ? "Ultra-fast 4-step FLUX distilled model for rapid commercial photoshoot creation."
                        : "Commercial photoshoot generation accelerated via NVIDIA NIM GPU infrastructure."}
                    </p>
                  </div>
                )}

                {/* NVIDIA NIM Image Access Check Panel (Matches API Setup & AI Template Page) */}
                {(selectedModel === "nvidia" || selectedModel === "cosmos" || selectedModel === "auto") && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        NVIDIA Image Model Access
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleCheckNvidiaImageAccess(true)}
                        disabled={nvidiaChecking}
                      >
                        {nvidiaChecking && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {nvidiaResults ? "Re-check Access" : "Check Access"}
                      </Button>
                    </div>

                    {nvidiaError && (
                      <div className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{nvidiaError}</span>
                      </div>
                    )}

                    {nvidiaResults && (
                      <>
                        <ul className="space-y-1.5 border-t pt-2">
                          {nvidiaResults.map((result) => {
                            const statusVariant =
                              result.status === "Available"
                                ? "default"
                                : result.status === "Access Denied"
                                  ? "destructive"
                                  : "secondary";
                            const badgeClass =
                              result.status === "Available"
                                ? "bg-success text-white"
                                : result.status === "Rate Limited"
                                  ? "bg-orange-500 text-white"
                                  : result.status === "Invalid Request"
                                    ? "bg-amber-500 text-white"
                                    : "";

                            return (
                              <li key={result.id} className="flex items-start justify-between gap-2 bg-card/60 p-2 rounded border text-xs">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-medium text-[11px]">{result.label}</span>
                                    <Badge variant="outline" className="text-[9px] py-0 px-1 h-4">
                                      {result.type}
                                    </Badge>
                                    {result.httpStatus > 0 && (
                                      <span className="text-[10px] font-mono text-muted-foreground">
                                        HTTP {result.httpStatus}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">{result.reason}</p>
                                </div>
                                <Badge variant={statusVariant} className={`${badgeClass} text-[10px] shrink-0`}>
                                  {result.status}
                                </Badge>
                              </li>
                            );
                          })}
                        </ul>

                        {hasNvidiaFluxAccess(nvidiaResults) ? (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                            ✓ Primary model ({selectedNvidiaModel}) is active and ready to generate photoshoot images.
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground pt-0.5">
                            Photoshoot generation will automatically use Pollinations AI fallback when NVIDIA models are unavailable.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* NVIDIA Cosmos Video Engine Access Check Panel */}
                {(selectedModel === "nvidia" || selectedModel === "cosmos" || selectedModel === "auto") && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Film className="h-3.5 w-3.5 text-primary" />
                        {selectedModel === "cosmos" ? "NVIDIA Cosmos Video Engine" : "NVIDIA Cosmos Video Model Access"}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleCheckNvidiaVideoAccess(true)}
                        disabled={nvidiaVideoChecking}
                      >
                        {nvidiaVideoChecking && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {nvidiaVideoResults ? "Re-check Video" : "Check Video Access"}
                      </Button>
                    </div>

                    {nvidiaVideoError && (
                      <div className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{nvidiaVideoError}</span>
                      </div>
                    )}

                    {nvidiaVideoResults ? (
                      <>
                        <ul className="space-y-1.5 border-t pt-2">
                          {nvidiaVideoResults.map((result) => (
                            <li key={result.id} className="flex items-start justify-between gap-2 bg-card/60 p-2 rounded border text-xs">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-medium text-[11px]">{result.label}</span>
                                  <Badge variant="outline" className="text-[9px] py-0 px-1 h-4">
                                    Video
                                  </Badge>
                                  {result.httpStatus > 0 && (
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      HTTP {result.httpStatus}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">{result.reason}</p>
                              </div>
                              <Badge variant={result.access === "granted" ? "default" : "secondary"} className={result.access === "granted" ? "bg-success text-white text-[10px]" : "text-[10px]"}>
                                {result.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>

                        <div className="rounded-md border border-border/60 bg-muted/50 p-2.5 text-[10px] text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground">NVIDIA Cosmos Promo Video Synthesis:</p>
                          <p>
                            Cloud NIM video endpoints require self-hosted DGX/GPU Docker containers. In Photo Studio, promo videos are automatically synthesized from your ultra-high-definition photoshoot frame with smooth cinematic camera motions and text overlays.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-md border border-border/60 bg-muted/50 p-2.5 text-[10px] text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">Cosmos Video Generation Engine:</p>
                        <p>
                          Generates high-definition photoshoot visuals with NVIDIA FLUX and converts them into cinematic promo videos with smooth motion effects, custom duration, and typography overlays.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Configure Pollinations, NVIDIA, or Stability keys:</span>
                  <Link to="/api-setup" className="text-primary hover:underline font-medium">
                    API Setup &rarr;
                  </Link>
                </div>
              </div>

              {/* Reference Upload */}
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <Label className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Upload className="h-3.5 w-3.5" /> Reference Image (Optional)
                  </Label>
                  {referenceImage ? (
                    <div className="group relative overflow-hidden rounded-lg">
                      <img src={referenceImage} alt="Reference" className="h-40 w-full object-cover" />
                      <button
                        onClick={removeReference}
                        className="absolute right-2 top-2 rounded-full bg-foreground/70 p-1 text-background opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-xs">Drop or click to upload</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </CardContent>
              </Card>

              {/* Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> Prompt
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSuggestPrompt}
                    disabled={isSuggesting}
                    className="h-7 gap-1.5 text-xs"
                  >
                    {isSuggesting ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</>
                    ) : (
                      <><Wand2 className="h-3 w-3" /> Prompt AI</>
                    )}
                  </Button>
                </div>
                <Textarea
                  placeholder="Describe your photoshoot scene... e.g. 'A model in a flowing red saree, standing in a sunlit garden with jasmine flowers'"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Negative Prompt */}
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Negative Prompt (Optional)
                </Label>
                <Input
                  placeholder="What to avoid... e.g. 'blurry, low quality, watermark'"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                />
              </div>

              {/* Style Presets */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Palette className="h-3.5 w-3.5" /> Style Preset
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_PRESETS.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`rounded-lg border p-2.5 text-left transition-all ${
                        selectedStyle === style.id
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-primary/30 hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-sm font-medium text-foreground">{style.label}</div>
                      <div className="text-[11px] text-muted-foreground">{style.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full gap-2 bg-gradient-to-r from-primary to-accent-foreground text-primary-foreground shadow-md transition-shadow hover:shadow-lg"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Generate Photoshoot
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="settings" className="mt-4 space-y-5">
              {/* Aspect Ratio */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" /> Aspect Ratio
                </Label>
                <div className="flex flex-wrap gap-2">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.id}
                      onClick={() => setAspectRatio(ar.id)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                        aspectRatio === ar.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality */}
              <div className="space-y-3">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quality: {quality[0]}%
                </Label>
                <Slider value={quality} onValueChange={setQuality} min={50} max={100} step={5} />
              </div>

              {/* NVIDIA Cosmos & Ken Burns Video Settings */}
              <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4 text-primary" />
                    <Label className="text-xs font-semibold uppercase tracking-wide">
                      NVIDIA Cosmos & Ken Burns Video
                    </Label>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    {selectedModel === "cosmos" || selectedModel === "nvidia" ? "Cosmos Motion Engine" : "Ken Burns Engine"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Transform photoshoot frames into cinematic promo videos with smooth camera motion, dynamic zoom, and studio typography.
                </p>

                <KenBurnsPreview
                  imageUrl={generatedImages[0]}
                  durationSec={videoDuration[0]}
                  zoomIntensity={videoZoom[0]}
                  resolution={videoResolution}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-muted-foreground">Video Duration</Label>
                    <span className="font-mono font-medium text-foreground">{videoDuration[0]} seconds</span>
                  </div>
                  <Slider value={videoDuration} onValueChange={setVideoDuration} min={3} max={15} step={1} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-muted-foreground">Zoom & Motion Intensity</Label>
                    <span className="font-mono font-medium text-foreground">{videoDuration[0]}s • {videoZoom[0].toFixed(1)}x</span>
                  </div>
                  <Slider value={videoZoom} onValueChange={setVideoZoom} min={0} max={2} step={0.1} />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Output Resolution</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[720, 1080, 1440].map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setVideoResolution(res)}
                        className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                          videoResolution === res
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {res}p {res === 1080 ? "(FHD)" : res === 1440 ? "(2K)" : "(HD)"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Typography & Text Overlay Toggle */}
                <div className="rounded-md border bg-background/60 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-foreground">Prompt Text Overlay</p>
                      <p className="text-[10px] text-muted-foreground">
                        Render photoshoot prompt & title as a typography overlay on video
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={includeVideoText ? "default" : "outline"}
                      className={`h-7 px-2.5 text-xs ${includeVideoText ? "bg-primary text-primary-foreground" : ""}`}
                      onClick={() => setIncludeVideoText(!includeVideoText)}
                    >
                      {includeVideoText ? "Enabled ✓" : "Disabled"}
                    </Button>
                  </div>
                </div>

                {/* Quick Generate Video Action if images exist */}
                {generatedImages.length > 0 && (
                  <Button
                    type="button"
                    onClick={() => handleGenerateVideo(generatedImages[0])}
                    disabled={generatingVideoFor === generatedImages[0] || !!videoFor[generatedImages[0]]}
                    className="w-full h-8 text-xs gap-1.5 bg-gradient-to-r from-primary to-accent-foreground text-primary-foreground shadow-sm"
                  >
                    {generatingVideoFor === generatedImages[0] ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Synthesizing Cosmos Video…</>
                    ) : videoFor[generatedImages[0]] ? (
                      <><Check className="h-3.5 w-3.5" /> Video Ready (Preview in Gallery)</>
                    ) : (
                      <><Film className="h-3.5 w-3.5" /> Synthesize Video from Latest Image</>
                    )}
                  </Button>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Gallery Panel */}
        <div className="lg:col-span-3">
          <Card className="min-h-[500px]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Generated Images</CardTitle>
                  <CardDescription>{generatedImages.length} image{generatedImages.length !== 1 ? "s" : ""} generated</CardDescription>
                </div>
                {generatedImages.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleOpenSocialPost(selectedPreview || generatedImages[0])}
                      className="h-8 gap-1.5 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm font-medium"
                    >
                      <Share2 className="h-3.5 w-3.5" /> Direct Social Post
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setGeneratedImages([])}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Clear All
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {generatedImages.length === 0 ? (
                <div className="flex h-[400px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <div className="rounded-2xl bg-muted/60 p-6">
                    <Camera className="h-12 w-12" />
                  </div>
                  <p className="text-sm font-medium">Your photoshoot images will appear here</p>
                  <p className="text-xs">Craft a prompt and hit Generate to begin</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {generatedImages.map((img, i) => (
                    <div
                      key={i}
                      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border shadow-sm transition-all hover:shadow-md"
                      onClick={() => setSelectedPreview(img)}
                    >
                      {videoFor[img] ? (
                        <video
                          src={videoFor[img]}
                          className="aspect-square w-full object-cover"
                          controls
                          loop
                          muted
                          playsInline
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <img src={img} alt={`Generated ${i + 1}`} className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      )}
                      <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-foreground/60 via-transparent to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 gap-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); handleDownload(img, i); }}
                          >
                            <Download className="h-3 w-3" /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 gap-1 text-xs"
                            disabled={savedImages.has(img) || savingImage === img}
                            onClick={(e) => { e.stopPropagation(); handleSaveToLibrary(img); }}
                          >
                            {savedImages.has(img) ? <><Check className="h-3 w-3" /> Saved</> : savingImage === img ? <Loader2 className="h-3 w-3 animate-spin" /> : <><FolderUp className="h-3 w-3" /> Library</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 gap-1 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border-0 shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSocialPost(img);
                            }}
                          >
                            <Share2 className="h-3 w-3" /> Post
                          </Button>
                          {videoFor[img] ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 gap-1 text-xs"
                              onClick={(e) => { e.stopPropagation(); handleDownloadVideo(videoFor[img], i); }}
                            >
                              <Download className="h-3 w-3" /> WebM
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 gap-1 text-xs"
                              disabled={generatingVideoFor === img || !!generatingVideoFor}
                              onClick={(e) => { e.stopPropagation(); handleGenerateVideo(img); }}
                            >
                              {generatingVideoFor === img ? <><Loader2 className="h-3 w-3 animate-spin" /> Video…</> : <><Film className="h-3 w-3" /> Video</>}
                            </Button>
                          )}
                        </div>
                        <Button size="sm" variant="secondary" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); setSelectedPreview(img); }}>
                          <ZoomIn className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {generatedImages.length > 0 && (
            <Card className="mt-4 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-secondary/5 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Share2 className="h-5 w-5 text-primary" />
                  Direct Social Media Post
                </CardTitle>
                <CardDescription>
                  Publish your photoshoot images directly to Instagram, Facebook, LinkedIn, X, and YouTube with custom captions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <Button
                    onClick={() => handleOpenSocialPost(selectedPreview || generatedImages[0])}
                    className="w-full sm:flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white shadow-md font-medium"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Direct Social Media Post
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate("/social-media", {
                        state: {
                          content: prompt,
                          mediaUrl: selectedPreview || generatedImages[0] || null,
                        },
                      })
                    }
                    className="w-full sm:w-auto flex items-center gap-1.5"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in Studio
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {selectedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-8 backdrop-blur-sm"
          onClick={() => setSelectedPreview(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPreview} alt="Preview" className="max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <div className="absolute -top-3 right-0 flex gap-2">
              <Button
                size="sm"
                className="gap-1.5 shadow bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border-0"
                onClick={() => handleOpenSocialPost(selectedPreview)}
              >
                <Share2 className="h-3.5 w-3.5" /> Direct Social Post
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5 shadow" onClick={() => handleDownload(selectedPreview, 0)}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5 shadow"
                disabled={savedImages.has(selectedPreview) || savingImage === selectedPreview}
                onClick={() => handleSaveToLibrary(selectedPreview)}
              >
                {savedImages.has(selectedPreview) ? <><Check className="h-3.5 w-3.5" /> Saved</> : savingImage === selectedPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><FolderUp className="h-3.5 w-3.5" /> Library</>}
              </Button>
              <Button size="sm" variant="secondary" className="shadow" onClick={() => setSelectedPreview(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Social Media Post Dialog */}
      <DirectSocialPostDialog
        open={socialPostOpen}
        onOpenChange={setSocialPostOpen}
        initialContent={prompt}
        initialImageUrl={activeSocialImage || generatedImages[0] || ""}
        templateName={
          CATEGORIES.find((c) => c.id === selectedCategory)?.label
            ? `${CATEGORIES.find((c) => c.id === selectedCategory)?.label} Photoshoot`
            : "Product Photoshoot"
        }
      />
    </div>
  );
}
